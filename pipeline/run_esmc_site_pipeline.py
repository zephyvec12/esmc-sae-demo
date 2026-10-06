#!/usr/bin/env python
"""Run a transparent residue-candidate screen with the official ESMC 6B model.

The program intentionally accepts one standard-amino-acid FASTA record per run.
It never uses a fixed BOS/EOS offset: residue tokens are selected exclusively
from the tokenizer's special-token mask and validated against the source FASTA.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import shutil
import subprocess
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
from accelerate import dispatch_model, infer_auto_device_map
from esm.models.esmc import EsmcForMaskedLM, EsmcSaeModel, EsmcTokenizer
from huggingface_hub import HfApi, hf_hub_download


STANDARD_AAS = list("ACDEFGHIKLMNPQRSTVWY")
DEFAULT_MODEL_ID = "biohub/esmc-6b-2024-12"
# Current official 6B, layer-60 hidden-state SAE (k=64, 16,384-feature codebook).
DEFAULT_SAE_MODEL_ID = "biohub/ESMC-6B-sae-layer60-k64-codebook16384"
SCRIPT_PATH = Path(__file__).resolve()
PROJECT_DIR = SCRIPT_PATH.parent


class Esmc6B2024ForMaskedLM(EsmcForMaskedLM):
    """Official ESM loader with the published 2024-12 checkpoint-key layout.

    The current Biohub ESM package renamed several fused LayerNorm/MLP
    parameters after `biohub/esmc-6b-2024-12` was published.  The underlying
    tensors and architecture are unchanged; this explicit, one-to-one adapter
    makes that official released checkpoint loadable without substituting a
    different ESMC model.
    """

    _legacy_key_suffixes = {
        ".attn.layernorm_qkv.0.weight": ".attn.layernorm_qkv.layer_norm_weight",
        ".attn.layernorm_qkv.0.bias": ".attn.layernorm_qkv.layer_norm_bias",
        ".attn.layernorm_qkv.1.weight": ".attn.layernorm_qkv.weight",
        ".ffn.0.weight": ".ffn.layer_norm_weight",
        ".ffn.0.bias": ".ffn.layer_norm_bias",
        ".ffn.1.weight": ".ffn.fc1_weight",
        ".ffn.3.weight": ".ffn.fc2_weight",
    }

    @classmethod
    def _adapt_checkpoint_keys(
        cls, raw: dict[str, torch.Tensor], model_keys: set[str]
    ) -> dict[str, torch.Tensor]:
        adapted: dict[str, torch.Tensor] = {}
        for raw_key, value in raw.items():
            if raw_key.endswith("_extra_state"):
                continue
            key = raw_key
            for legacy_suffix, current_suffix in cls._legacy_key_suffixes.items():
                if key.endswith(legacy_suffix):
                    key = key[: -len(legacy_suffix)] + current_suffix
                    break
            if key in model_keys:
                adapted[key] = value
            elif key.startswith("esmc.") and key[len("esmc.") :] in model_keys:
                adapted[key[len("esmc.") :]] = value
        return adapted


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def timestamp_for_path() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def package_versions() -> dict[str, str | None]:
    names = ["torch", "transformers", "accelerate", "huggingface_hub", "safetensors", "esm", "numpy", "pandas", "pyarrow", "matplotlib", "tabulate"]
    versions: dict[str, str | None] = {}
    for name in names:
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[name] = None
    return versions


def json_default(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, torch.dtype):
        return str(value)
    if isinstance(value, torch.device):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False, default=json_default)
        handle.write("\n")


def read_single_fasta(path: Path) -> tuple[str, str]:
    if not path.is_file():
        raise FileNotFoundError(f"FASTA file does not exist: {path}")
    headers: list[str] = []
    sequence_lines: list[str] = []
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(">"):
            headers.append(line[1:].strip())
        else:
            sequence_lines.append("".join(line.split()))
    if len(headers) != 1:
        raise ValueError(f"Expected exactly one FASTA record, found {len(headers)} in {path}")
    sequence = "".join(sequence_lines).upper()
    if not sequence:
        raise ValueError("FASTA record has no sequence")
    invalid = sorted(set(sequence).difference(STANDARD_AAS))
    if invalid:
        raise ValueError(
            "This pipeline currently requires standard amino acids only; invalid residues: "
            + ", ".join(invalid)
        )
    return headers[0], sequence


def create_run_dir(root: Path, fasta_stem: str) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    safe_stem = "".join(char if char.isalnum() or char in "-_" else "_" for char in fasta_stem)[:48] or "protein"
    candidate = root / f"run_{timestamp_for_path()}_{safe_stem}"
    suffix = 1
    while candidate.exists():
        candidate = root / f"run_{timestamp_for_path()}_{safe_stem}_{suffix:02d}"
        suffix += 1
    candidate.mkdir(parents=False, exist_ok=False)
    return candidate


def cuda_snapshot() -> dict[str, Any]:
    snapshot: dict[str, Any] = {"cuda_available": torch.cuda.is_available()}
    if not torch.cuda.is_available():
        return snapshot
    device = torch.device("cuda:0")
    free_bytes, total_bytes = torch.cuda.mem_get_info(device)
    properties = torch.cuda.get_device_properties(device)
    snapshot.update(
        {
            "device": str(device),
            "gpu_name": torch.cuda.get_device_name(device),
            "gpu_compute_capability": f"{properties.major}.{properties.minor}",
            "gpu_total_mib": round(total_bytes / 2**20, 1),
            "gpu_free_mib": round(free_bytes / 2**20, 1),
            "gpu_allocated_mib": round(torch.cuda.memory_allocated(device) / 2**20, 1),
            "gpu_reserved_mib": round(torch.cuda.memory_reserved(device) / 2**20, 1),
        }
    )
    return snapshot


def choose_dtype(name: str) -> torch.dtype:
    if not torch.cuda.is_available():
        raise RuntimeError("A CUDA GPU is required for this ESMC 6B local pipeline.")
    if name == "bf16" or (name == "auto" and torch.cuda.is_bf16_supported()):
        if not torch.cuda.is_bf16_supported():
            raise RuntimeError("--dtype bf16 was requested but this CUDA GPU does not support BF16.")
        return torch.bfloat16
    return torch.float16


def resolved_revision(repo_id: str, requested_revision: str) -> str:
    info = HfApi().model_info(repo_id=repo_id, revision=requested_revision)
    if not info.sha:
        raise RuntimeError(f"Hugging Face did not return a commit SHA for {repo_id}@{requested_revision}")
    return info.sha


def model_input_device(model: Any) -> torch.device:
    device_map = getattr(model, "hf_device_map", {}) or {}
    if any(str(value).startswith("cuda") or value == 0 for value in device_map.values()):
        return torch.device("cuda:0")
    try:
        device = model.device
        if device.type != "meta":
            return device
    except (AttributeError, StopIteration):
        pass
    for parameter in model.parameters():
        if parameter.device.type != "meta":
            return parameter.device
    raise RuntimeError("Could not determine a concrete input device for the dispatched model")


def move_model_inputs(encoded: dict[str, torch.Tensor], device: torch.device) -> dict[str, torch.Tensor]:
    # special_tokens_mask is an analysis aid, not a model input.
    return {key: value.to(device) for key, value in encoded.items() if key in {"input_ids", "attention_mask"}}


def token_mapping(
    tokenizer: Any,
    sequence: str,
    encoded: dict[str, torch.Tensor],
) -> tuple[list[int], list[int]]:
    special_mask = encoded.get("special_tokens_mask")
    if special_mask is None:
        raise RuntimeError("Tokenizer did not return special_tokens_mask; refusing to hardcode a BOS/EOS offset.")
    if special_mask.shape[0] != 1:
        raise RuntimeError("Expected a batch of one sequence while constructing residue-token mapping")
    residue_token_indices = torch.where(special_mask[0].eq(0))[0].tolist()
    input_ids = encoded["input_ids"][0].tolist()
    if len(residue_token_indices) != len(sequence):
        tokens = tokenizer.convert_ids_to_tokens(input_ids)
        raise RuntimeError(
            "Tokenizer special-token mapping length does not equal the FASTA length "
            f"({len(residue_token_indices)} != {len(sequence)}). Tokens: {tokens}"
        )
    amino_acid_ids = tokenizer.convert_tokens_to_ids(STANDARD_AAS)
    if any(token_id is None or token_id == tokenizer.unk_token_id for token_id in amino_acid_ids):
        raise RuntimeError("Tokenizer could not resolve every standard amino acid token")
    if len(set(amino_acid_ids)) != len(STANDARD_AAS):
        raise RuntimeError("Tokenizer maps multiple standard amino acids to the same token ID")
    for residue_index, token_index in enumerate(residue_token_indices):
        expected_id = tokenizer.convert_tokens_to_ids(sequence[residue_index])
        if input_ids[token_index] != expected_id:
            observed_token = tokenizer.convert_ids_to_tokens(input_ids[token_index])
            raise RuntimeError(
                "Token-to-residue validation failed at FASTA residue "
                f"{residue_index + 1}: expected {sequence[residue_index]!r}, got token {observed_token!r}"
            )
    return residue_token_indices, [int(value) for value in amino_acid_ids]


def robust_z(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float64)
    median = float(np.median(values))
    mad = float(np.median(np.abs(values - median)))
    scale = 1.4826 * mad
    if not math.isfinite(scale) or scale < 1e-12:
        scale = float(np.std(values))
    if not math.isfinite(scale) or scale < 1e-12:
        return np.zeros(values.shape, dtype=np.float64)
    return (values - median) / scale


def local_contextual_novelty(embeddings: np.ndarray, window: int) -> np.ndarray:
    if window < 1:
        raise ValueError("--novelty-window must be at least 1")
    embeddings = np.asarray(embeddings, dtype=np.float32)
    length = embeddings.shape[0]
    novelty = np.zeros(length, dtype=np.float64)
    for index in range(length):
        neighbors = list(range(max(0, index - window), index)) + list(range(index + 1, min(length, index + window + 1)))
        if not neighbors:
            continue
        center = embeddings[neighbors].mean(axis=0)
        denominator = float(np.linalg.norm(embeddings[index]) * np.linalg.norm(center))
        if denominator > 0:
            cosine = float(np.dot(embeddings[index], center) / denominator)
            novelty[index] = 1.0 - float(np.clip(cosine, -1.0, 1.0))
    return novelty


def load_masked_lm(
    model_id: str,
    revision: str,
    dtype: torch.dtype,
    cache_dir: Path,
    max_gpu_memory: str | None,
    attn_implementation: str,
) -> Any:
    # The current official ESM package owns the ESMC tokenizer/model classes.
    # It does not expose the generic Transformers `device_map` argument, so load
    # its checkpoint on CPU first and use Accelerate's official auto-device-map
    # dispatch immediately afterwards. This preserves automatic CPU offload when
    # the 16 GB GPU cannot hold every module.
    model = Esmc6B2024ForMaskedLM.from_pretrained(
        model_id,
        revision=revision,
        cache_dir=str(cache_dir),
        device="cpu",
        dtype=dtype,
        attn_implementation=attn_implementation,
    )
    return dispatch_with_auto_device_map(model, dtype, max_gpu_memory).eval()


def load_base_model_for_sae(
    model_id: str,
    revision: str,
    dtype: torch.dtype,
    cache_dir: Path,
    max_gpu_memory: str | None,
    attn_implementation: str,
) -> Any:
    model = Esmc6B2024ForMaskedLM.from_pretrained(
        model_id,
        revision=revision,
        cache_dir=str(cache_dir),
        device="cpu",
        dtype=dtype,
        attn_implementation=attn_implementation,
    )
    return dispatch_with_auto_device_map(model, dtype, max_gpu_memory).eval()


def dispatch_with_auto_device_map(model: Any, dtype: torch.dtype, max_gpu_memory: str | None) -> Any:
    """Apply Accelerate's `device_map=\"auto\"` equivalent to an official ESM model."""
    max_memory: dict[Any, str] | None = {0: max_gpu_memory} if max_gpu_memory else None
    device_map = infer_auto_device_map(model, max_memory=max_memory, dtype=dtype)
    model = dispatch_model(model, device_map=device_map)
    # Match the established Transformers convention so it is recorded and used
    # consistently by model_input_device and run metadata.
    model.hf_device_map = device_map
    return model


def export_embeddings(
    model: Any,
    model_inputs: dict[str, torch.Tensor],
    residue_token_indices: list[int],
    hidden_state_index: int,
) -> tuple[np.ndarray, np.ndarray, int]:
    with torch.inference_mode():
        output = model(**model_inputs, output_hidden_states=True, return_dict=True)
    hidden_states = output.hidden_states
    if hidden_states is None:
        raise RuntimeError("Model did not return hidden states despite output_hidden_states=True")
    try:
        selected = hidden_states[hidden_state_index]
    except IndexError as error:
        raise ValueError(
            f"--hidden-state-index {hidden_state_index} is invalid; the model returned {len(hidden_states)} hidden-state tensors"
        ) from error
    residue_embeddings = selected[0, residue_token_indices, :].float().cpu().numpy()
    protein_embedding = residue_embeddings.mean(axis=0, dtype=np.float32)
    actual_layer = hidden_state_index if hidden_state_index >= 0 else len(hidden_states) + hidden_state_index
    del output, hidden_states, selected
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return residue_embeddings, protein_embedding, actual_layer


def masked_residue_scan(
    model: Any,
    model_inputs: dict[str, torch.Tensor],
    sequence: str,
    residue_token_indices: list[int],
    amino_acid_ids: list[int],
    tokenizer: Any,
    batch_size: int,
    empty_cache_every: int,
) -> list[dict[str, Any]]:
    if batch_size < 1:
        raise ValueError("--masked-batch-size must be at least 1")
    mask_token_id = tokenizer.mask_token_id
    if mask_token_id is None:
        mask_token_id = getattr(model.config, "mask_token_id", None)
    if mask_token_id is None:
        raise RuntimeError("Could not resolve the tokenizer/model mask token ID")

    input_ids = model_inputs["input_ids"]
    attention_mask = model_inputs.get("attention_mask")
    rows: list[dict[str, Any]] = []
    aa_to_index = {residue: index for index, residue in enumerate(STANDARD_AAS)}
    total = len(sequence)
    for start in range(0, total, batch_size):
        positions = list(range(start, min(total, start + batch_size)))
        masked_ids = input_ids.repeat(len(positions), 1)
        for row_index, sequence_index in enumerate(positions):
            masked_ids[row_index, residue_token_indices[sequence_index]] = mask_token_id
        batch_inputs: dict[str, torch.Tensor] = {"input_ids": masked_ids}
        if attention_mask is not None:
            batch_inputs["attention_mask"] = attention_mask.repeat(len(positions), 1)
        with torch.inference_mode():
            output = model(**batch_inputs, return_dict=True)
        for row_index, sequence_index in enumerate(positions):
            token_index = residue_token_indices[sequence_index]
            log_probs = torch.log_softmax(output.logits[row_index, token_index, amino_acid_ids].float(), dim=-1)
            probabilities = torch.softmax(log_probs, dim=-1)
            observed_index = aa_to_index[sequence[sequence_index]]
            alternative = log_probs.clone()
            alternative[observed_index] = -torch.inf
            best_alternative_index = int(torch.argmax(alternative).item())
            observed_log_probability = float(log_probs[observed_index].item())
            best_alternative_log_probability = float(log_probs[best_alternative_index].item())
            entropy = float(-(probabilities * log_probs).sum().item())
            rows.append(
                {
                    "position": sequence_index + 1,
                    "residue": sequence[sequence_index],
                    "residue_token_index": token_index,
                    "wild_type_log_probability": observed_log_probability,
                    "best_alternative_residue": STANDARD_AAS[best_alternative_index],
                    "best_alternative_log_probability": best_alternative_log_probability,
                    "conditional_preference": observed_log_probability - best_alternative_log_probability,
                    "amino_acid_distribution_entropy": entropy,
                }
            )
        del output, masked_ids, batch_inputs
        batch_number = start // batch_size + 1
        if torch.cuda.is_available() and empty_cache_every and batch_number % empty_cache_every == 0:
            torch.cuda.empty_cache()
        completed = min(start + batch_size, total)
        if completed == total or completed % max(10, batch_size * 10) == 0:
            print(f"Masked scan: {completed}/{total} residues", flush=True)
    return rows


def plot_scores(table: pd.DataFrame, destination: Path) -> None:
    positions = table["position"].to_numpy()
    top = table.nsmallest(min(10, len(table)), "rank")
    fig, axes = plt.subplots(3, 1, figsize=(12, 8.5), sharex=True, constrained_layout=True)
    series = [
        ("conditional_preference", "Conditional preference (log-probability margin)", "#1f77b4"),
        ("contextual_novelty", "Local contextual novelty (1 − cosine)", "#ff7f0e"),
        ("model_candidate_score", "Transparent model candidate score", "#2ca02c"),
    ]
    for axis, (column, label, color) in zip(axes, series):
        axis.plot(positions, table[column].to_numpy(), color=color, linewidth=1.1)
        axis.scatter(top["position"], top[column], color="#d62728", s=16, zorder=3, label="top-10 candidates")
        axis.set_ylabel(label)
        axis.grid(alpha=0.25)
    axes[-1].set_xlabel("FASTA residue position (1-based)")
    axes[0].legend(loc="best", frameon=False)
    fig.suptitle("ESMC 6B residue-candidate screening signals", fontsize=14)
    fig.savefig(destination, dpi=180, bbox_inches="tight")
    plt.close(fig)


def get_sae_tensor(sae_outputs: Any) -> torch.Tensor:
    if isinstance(sae_outputs, dict):
        if "layer60" in sae_outputs:
            candidate = sae_outputs["layer60"]
        elif "layer_60" in sae_outputs:
            candidate = sae_outputs["layer_60"]
        elif len(sae_outputs) == 1:
            candidate = next(iter(sae_outputs.values()))
        else:
            raise RuntimeError(f"Could not identify layer 60 in SAE output keys: {list(sae_outputs)}")
    elif isinstance(sae_outputs, (list, tuple)) and len(sae_outputs) == 1:
        candidate = sae_outputs[0]
    else:
        candidate = sae_outputs
    if isinstance(candidate, torch.Tensor):
        return candidate
    for attribute in ("activations", "values", "tensor"):
        value = getattr(candidate, attribute, None)
        if isinstance(value, torch.Tensor):
            return value
    raise RuntimeError(f"Unsupported SAE output type: {type(candidate).__name__}")


def load_feature_descriptions(cache_dir: Path) -> tuple[dict[int, str], str | None]:
    """Best-effort retrieval of Biohub's optional feature description table."""
    dataset_id = "biohub/ESMC-SAE-Features"
    try:
        api = HfApi()
        files = api.list_repo_files(repo_id=dataset_id, repo_type="dataset")
        candidates = [name for name in files if name.lower().endswith((".csv", ".tsv", ".jsonl", ".parquet"))]
        if not candidates:
            return {}, None
        filename = sorted(candidates, key=len)[0]
        local_path = hf_hub_download(repo_id=dataset_id, repo_type="dataset", filename=filename, cache_dir=str(cache_dir))
        if filename.lower().endswith(".tsv"):
            descriptions = pd.read_csv(local_path, sep="\t")
        elif filename.lower().endswith(".jsonl"):
            descriptions = pd.read_json(local_path, lines=True)
        elif filename.lower().endswith(".parquet"):
            descriptions = pd.read_parquet(local_path)
        else:
            descriptions = pd.read_csv(local_path)
        id_column = next((name for name in descriptions.columns if name.lower() in {"feature_id", "feature", "id", "index"}), None)
        text_column = next((name for name in descriptions.columns if "description" in name.lower()), None)
        if id_column is None or text_column is None:
            return {}, None
        mapping = {
            int(feature_id): str(description)
            for feature_id, description in zip(descriptions[id_column], descriptions[text_column])
            if pd.notna(feature_id) and pd.notna(description)
        }
        return mapping, f"hf://datasets/{dataset_id}/{filename}"
    except Exception as error:  # Feature descriptions are optional and should not block the SAE result.
        print(f"Feature descriptions unavailable: {error}", flush=True)
        return {}, None


def export_sae_results(
    sae_tensor: torch.Tensor,
    residue_token_indices: list[int],
    output_dir: Path,
    cache_dir: Path,
) -> tuple[int, str | None]:
    token_to_position = {token_index: position + 1 for position, token_index in enumerate(residue_token_indices)}
    records: list[dict[str, Any]] = []
    tensor = sae_tensor.detach().coalesce() if sae_tensor.is_sparse else sae_tensor.detach()
    if tensor.is_sparse:
        indices = tensor.indices().cpu().numpy()
        values = tensor.values().float().cpu().numpy()
        if indices.shape[0] == 3:
            batch_indices, token_indices, feature_indices = indices
            entries = zip(batch_indices, token_indices, feature_indices, values)
        elif indices.shape[0] == 2:
            token_indices, feature_indices = indices
            entries = ((0, token_index, feature_index, value) for token_index, feature_index, value in zip(token_indices, feature_indices, values))
        else:
            raise RuntimeError(f"Unexpected sparse SAE tensor dimensions: {indices.shape[0]}")
        for batch_index, token_index, feature_index, activation in entries:
            if int(batch_index) == 0 and int(token_index) in token_to_position:
                records.append(
                    {
                        "position": token_to_position[int(token_index)],
                        "residue_token_index": int(token_index),
                        "feature_id": int(feature_index),
                        "activation": float(activation),
                    }
                )
    else:
        dense = tensor[0] if tensor.ndim == 3 else tensor
        nonzero = torch.nonzero(dense, as_tuple=False).cpu().numpy()
        values = dense[nonzero[:, 0], nonzero[:, 1]].float().cpu().numpy()
        for (token_index, feature_index), activation in zip(nonzero, values):
            if int(token_index) in token_to_position:
                records.append(
                    {
                        "position": token_to_position[int(token_index)],
                        "residue_token_index": int(token_index),
                        "feature_id": int(feature_index),
                        "activation": float(activation),
                    }
                )
    activations = pd.DataFrame(records, columns=["position", "residue_token_index", "feature_id", "activation"])
    activations.sort_values(["position", "activation"], ascending=[True, False], inplace=True, kind="stable")
    activations.to_csv(output_dir / "sae_residue_activations.csv", index=False)
    descriptions, description_source = load_feature_descriptions(cache_dir)
    if activations.empty:
        summary = pd.DataFrame(columns=["feature_id", "max_activation", "active_position_count", "positions", "feature_description"])
    else:
        summary = (
            activations.groupby("feature_id", as_index=False)
            .agg(max_activation=("activation", "max"), active_position_count=("position", "nunique"))
        )
        positions = activations.groupby("feature_id")["position"].apply(lambda values: ";".join(str(value) for value in sorted(set(values))))
        summary["positions"] = summary["feature_id"].map(positions)
        summary["feature_description"] = summary["feature_id"].map(descriptions).fillna("")
        summary.sort_values(["max_activation", "feature_id"], ascending=[False, True], inplace=True, kind="stable")
    summary.to_csv(output_dir / "sae_feature_summary.csv", index=False)
    return len(activations), description_source


def run_sae_stage(
    args: argparse.Namespace,
    metadata: dict[str, Any],
    tokenizer: Any,
    sequence: str,
    residue_token_indices: list[int],
    dtype: torch.dtype,
    output_dir: Path,
) -> None:
    print("Loading a fresh ESMC 6B base model and the official layer-60 SAE…", flush=True)
    sae_revision = resolved_revision(args.sae_model, args.sae_revision)
    sae_base_model = load_base_model_for_sae(
        args.model,
        metadata["model_resolved_revision"],
        dtype,
        args.cache_dir,
        args.max_gpu_memory,
        args.attn_implementation,
    )
    sae_model = EsmcSaeModel.from_pretrained(
        args.sae_model,
        revision=sae_revision,
        cache_dir=str(args.cache_dir),
        device=model_input_device(sae_base_model),
        dtype=dtype,
    ).eval()
    if not hasattr(sae_base_model, "add_sae_models"):
        raise RuntimeError(
            "The installed ESM package/Transformers version does not expose add_sae_models; "
            "update the official Biohub ESM package before retrying --sae."
        )
    if "60" not in sae_model.layers:
        sae_model.initialize_layers([60], device=model_input_device(sae_base_model), dtype=dtype)
    sae_layer = sae_model.layers["60"]
    sae_base_model.add_sae_models([sae_layer])
    encoded = tokenizer(sequence, return_tensors="pt", return_special_tokens_mask=True, add_special_tokens=True)
    remapped_indices, _ = token_mapping(tokenizer, sequence, encoded)
    if remapped_indices != residue_token_indices:
        raise RuntimeError("SAE re-tokenization changed the validated token-to-residue mapping")
    sae_inputs = move_model_inputs(encoded, model_input_device(sae_base_model))
    with torch.inference_mode():
        output = sae_base_model(**sae_inputs, return_dict=True)
    sae_outputs = getattr(output, "sae_outputs", None)
    if sae_outputs is None:
        raise RuntimeError("The ESMC base model returned no sae_outputs after attaching the SAE")
    activation_count, description_source = export_sae_results(
        get_sae_tensor(sae_outputs), residue_token_indices, output_dir, args.cache_dir
    )
    metadata["sae"] = {
        "enabled": True,
        "model": args.sae_model,
        "requested_revision": args.sae_revision,
        "resolved_revision": sae_revision,
        "layer": 60,
        "activation_count": activation_count,
        "feature_description_source": description_source,
        "device_map": getattr(sae_base_model, "hf_device_map", None),
    }
    del output, sae_outputs, sae_layer, sae_model, sae_base_model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def write_report(
    output_dir: Path,
    metadata: dict[str, Any],
    top: pd.DataFrame,
    actual_layer: int,
) -> None:
    table = top[
        ["rank", "position", "residue", "conditional_preference", "contextual_novelty", "model_candidate_score"]
    ].copy()
    table["conditional_preference"] = table["conditional_preference"].map(lambda value: f"{value:.4f}")
    table["contextual_novelty"] = table["contextual_novelty"].map(lambda value: f"{value:.4f}")
    table["model_candidate_score"] = table["model_candidate_score"].map(lambda value: f"{value:.4f}")
    report = f"""# ESMC 6B residue-feature-site run

## Scope

This run screened one protein sequence with `{metadata['model']}` at resolved
revision `{metadata['model_resolved_revision']}`. The exported contextual
embedding is hidden-state index `{metadata['hidden_state_index']}` (actual
returned state {actual_layer}). The masked scan used batch size
{metadata['masked_batch_size']} and dtype `{metadata['dtype']}` with
`device_map=\"auto\"`.

`conditional_preference` is the model's masked-LM log-probability margin for the
observed amino acid versus the strongest standard-amino-acid alternative in the
same sequence context. `contextual_novelty` is the cosine distance from the
mean of the neighboring residue embeddings. The final score is
`{metadata['constraint_weight']:.2f} × robust_z(max(conditional_preference, 0)) + {metadata['novelty_weight']:.2f} × robust_z(contextual_novelty)`.

## Top model-derived candidates

{table.to_markdown(index=False)}

## Files

- `residue_embeddings.npz`: `H` (one row per FASTA residue), the mean protein embedding, and validated token indices.
- `candidate_sites_all.csv`: one transparent score row per FASTA residue.
- `top_candidate_sites.csv`: the highest ranked subset above.
- `site_scores.png`: positions plotted against both component signals and the combined score.
- `run_metadata.json`: model/revision, package versions, GPU details, dtype, command line, and run parameters.

## Interpretation and follow-up

Every listed position is a **model-derived candidate**, not a confirmed active,
binding, pathogenic, or essential site. High conditional preference is a sequence
constraint signal, and high novelty can reflect a motif, structural transition,
or other distinctive context. Validate high-ranking positions with at least two
independent sources where possible, such as UniProt annotations, Pfam/InterPro,
an MSA conservation analysis, AlphaFold/PDB structure, and published experiments.
Raw attention weights were not used as primary biological evidence.
"""
    if metadata.get("sae", {}).get("enabled"):
        report += "\n## Optional SAE stage\n\nThe layer-60 SAE was run only after releasing the first 6B model instance. Its per-residue activations and feature summaries are saved in `sae_residue_activations.csv` and `sae_feature_summary.csv`; feature activations still require their descriptions and independent biological evidence for interpretation.\n"
    (output_dir / "report.md").write_text(report, encoding="utf-8")


def verify_outputs(
    sequence: str,
    residue_token_indices: list[int],
    table: pd.DataFrame,
    top: pd.DataFrame,
    output_dir: Path,
) -> None:
    length = len(sequence)
    if len(residue_token_indices) != length:
        raise AssertionError("Token-to-residue mapping length differs from FASTA length")
    if len(table) != length:
        raise AssertionError("All-sites CSV does not contain exactly one row per FASTA residue")
    if table["position"].tolist() != list(range(1, length + 1)):
        raise AssertionError("All-sites positions are not the original 1-based FASTA positions")
    if "".join(table["residue"].tolist()) != sequence:
        raise AssertionError("All-sites residues do not map back to the original FASTA sequence")
    for row in top.itertuples(index=False):
        if sequence[row.position - 1] != row.residue:
            raise AssertionError(f"Top candidate rank {row.rank} does not map to the original FASTA sequence")
    required = [
        "run_metadata.json",
        "input_sequence.fasta",
        "residue_embeddings.npz",
        "candidate_sites_all.csv",
        "top_candidate_sites.csv",
        "site_scores.png",
        "report.md",
    ]
    missing = [name for name in required if not (output_dir / name).is_file()]
    if missing:
        raise AssertionError(f"Required output files missing: {', '.join(missing)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    input_source = parser.add_mutually_exclusive_group(required=True)
    input_source.add_argument("--fasta", type=Path, help="Path to a single-record, standard-amino-acid FASTA file")
    input_source.add_argument("--smoke-test", action="store_true", help="Run the included 238-aa GFP smoke-test FASTA")
    parser.add_argument("--output-root", type=Path, default=PROJECT_DIR.parent / "runs")
    parser.add_argument("--cache-dir", type=Path, default=PROJECT_DIR.parent / "hf_cache")
    parser.add_argument("--model", default=DEFAULT_MODEL_ID)
    parser.add_argument("--model-revision", default="main", help="Hugging Face revision/tag to resolve and record")
    parser.add_argument("--dtype", choices=["auto", "fp16", "bf16"], default="auto")
    parser.add_argument("--max-gpu-memory", default="15GiB", help="Accelerate GPU-memory cap; use 'none' to omit")
    parser.add_argument("--attn-implementation", choices=["sdpa", "eager"], default="sdpa")
    parser.add_argument("--hidden-state-index", type=int, default=-1, help="0=embedding state, 1..N=transformer states, -1=last")
    parser.add_argument("--masked-batch-size", type=int, default=1, help="Start at 1; increase only after verifying free memory")
    parser.add_argument("--empty-cache-every", type=int, default=25, help="Empty CUDA cache every N masked batches; 0 disables")
    parser.add_argument("--novelty-window", type=int, default=5)
    parser.add_argument("--constraint-weight", type=float, default=0.7)
    parser.add_argument("--novelty-weight", type=float, default=0.3)
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--sae", action="store_true", help="After the dense stage, load official layer-60 SAE and export activations")
    parser.add_argument("--sae-model", default=DEFAULT_SAE_MODEL_ID)
    parser.add_argument("--sae-revision", default="main")
    args = parser.parse_args()
    if args.smoke_test:
        args.fasta = PROJECT_DIR / "smoke_gfp.fasta"
    args.fasta = args.fasta.resolve()
    args.output_root = args.output_root.resolve()
    args.cache_dir = args.cache_dir.resolve()
    args.max_gpu_memory = None if str(args.max_gpu_memory).lower() == "none" else args.max_gpu_memory
    if args.top_k < 1:
        parser.error("--top-k must be at least 1")
    if args.constraint_weight < 0 or args.novelty_weight < 0:
        parser.error("Score weights must be non-negative")
    if args.constraint_weight + args.novelty_weight == 0:
        parser.error("At least one score weight must be positive")
    return args


def main() -> None:
    args = parse_args()
    fasta_header, sequence = read_single_fasta(args.fasta)
    run_dir = create_run_dir(args.output_root, args.fasta.stem)
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.fasta, run_dir / "input_sequence.fasta")
    dtype = choose_dtype(args.dtype)
    model_revision = resolved_revision(args.model, args.model_revision)
    metadata: dict[str, Any] = {
        "status": "running",
        "started_at_utc": utc_now(),
        "command_line": subprocess.list2cmdline(sys.argv),
        "script_path": str(SCRIPT_PATH),
        "script_sha256": hashlib.sha256(SCRIPT_PATH.read_bytes()).hexdigest(),
        "input_fasta": str(args.fasta),
        "input_header": fasta_header,
        "protein_length": len(sequence),
        "output_dir": str(run_dir),
        "cache_dir": str(args.cache_dir),
        "model": args.model,
        "model_requested_revision": args.model_revision,
        "model_resolved_revision": model_revision,
        "dtype": str(dtype),
        "device_map": "auto",
        "max_gpu_memory": args.max_gpu_memory,
        "attn_implementation": args.attn_implementation,
        "hidden_state_index": args.hidden_state_index,
        "masked_batch_size": args.masked_batch_size,
        "empty_cache_every": args.empty_cache_every,
        "novelty_window": args.novelty_window,
        "constraint_weight": args.constraint_weight,
        "novelty_weight": args.novelty_weight,
        "top_k": args.top_k,
        "package_versions": package_versions(),
        "python": sys.version,
        "platform": platform.platform(),
        "torch_version": torch.__version__,
        "torch_cuda_version": torch.version.cuda,
        "gpu_before_load": cuda_snapshot(),
        "sae": {"enabled": False},
    }
    write_json(run_dir / "run_metadata.json", metadata)
    model: Any | None = None
    try:
        print(f"Run directory: {run_dir}", flush=True)
        print(f"Loading {args.model}@{model_revision} with {dtype} and device_map=auto…", flush=True)
        tokenizer = EsmcTokenizer()
        metadata["tokenizer"] = "esm.models.esmc.EsmcTokenizer"
        encoded = tokenizer(sequence, return_tensors="pt", return_special_tokens_mask=True, add_special_tokens=True)
        residue_token_indices, amino_acid_ids = token_mapping(tokenizer, sequence, encoded)
        metadata["token_to_residue_mapping_length"] = len(residue_token_indices)
        metadata["residue_token_indices"] = residue_token_indices
        model = load_masked_lm(
            args.model,
            model_revision,
            dtype,
            args.cache_dir,
            args.max_gpu_memory,
            args.attn_implementation,
        )
        metadata["model_device_map"] = getattr(model, "hf_device_map", None)
        metadata["gpu_after_model_load"] = cuda_snapshot()
        inputs = move_model_inputs(encoded, model_input_device(model))
        residue_embeddings, protein_embedding, actual_layer = export_embeddings(
            model, inputs, residue_token_indices, args.hidden_state_index
        )
        metadata["exported_hidden_state_index"] = actual_layer
        metadata["hidden_dimension"] = int(residue_embeddings.shape[1])
        np.savez_compressed(
            run_dir / "residue_embeddings.npz",
            H=residue_embeddings.astype(np.float16),
            protein_embedding=protein_embedding.astype(np.float32),
            positions=np.arange(1, len(sequence) + 1, dtype=np.int32),
            residue_token_indices=np.asarray(residue_token_indices, dtype=np.int32),
            selected_hidden_state_index=np.asarray(actual_layer, dtype=np.int32),
        )
        print("Exported contextual residue embeddings.", flush=True)
        scan_rows = masked_residue_scan(
            model,
            inputs,
            sequence,
            residue_token_indices,
            amino_acid_ids,
            tokenizer,
            args.masked_batch_size,
            args.empty_cache_every,
        )
        table = pd.DataFrame(scan_rows)
        table["contextual_novelty"] = local_contextual_novelty(residue_embeddings, args.novelty_window)
        table["constraint_component_z"] = robust_z(np.maximum(table["conditional_preference"].to_numpy(), 0.0))
        table["novelty_component_z"] = robust_z(table["contextual_novelty"].to_numpy())
        table["model_candidate_score"] = (
            args.constraint_weight * table["constraint_component_z"] + args.novelty_weight * table["novelty_component_z"]
        )
        ordered_indices = np.lexsort((table["position"].to_numpy(), -table["model_candidate_score"].to_numpy()))
        ranks = np.empty(len(table), dtype=np.int32)
        ranks[ordered_indices] = np.arange(1, len(table) + 1, dtype=np.int32)
        table.insert(0, "rank", ranks)
        table = table[
            [
                "rank",
                "position",
                "residue",
                "residue_token_index",
                "wild_type_log_probability",
                "best_alternative_residue",
                "best_alternative_log_probability",
                "conditional_preference",
                "amino_acid_distribution_entropy",
                "contextual_novelty",
                "constraint_component_z",
                "novelty_component_z",
                "model_candidate_score",
            ]
        ]
        table.to_csv(run_dir / "candidate_sites_all.csv", index=False)
        top = table.nsmallest(min(args.top_k, len(table)), "rank")
        top.to_csv(run_dir / "top_candidate_sites.csv", index=False)
        plot_scores(table, run_dir / "site_scores.png")
        metadata["gpu_after_masked_scan"] = cuda_snapshot()

        # The first 6B instance must be gone before the optional SAE model loads.
        del model
        model = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        metadata["dense_model_released_at_utc"] = utc_now()
        metadata["gpu_after_dense_model_release"] = cuda_snapshot()
        if args.sae:
            run_sae_stage(args, metadata, tokenizer, sequence, residue_token_indices, dtype, run_dir)
        write_report(run_dir, metadata, top, actual_layer)
        metadata["status"] = "completed"
        metadata["completed_at_utc"] = utc_now()
        metadata["gpu_at_completion"] = cuda_snapshot()
        write_json(run_dir / "run_metadata.json", metadata)
        verify_outputs(sequence, residue_token_indices, table, top, run_dir)
        print("Verification passed.", flush=True)
        print(f"Completed: {run_dir}", flush=True)
    except Exception as error:
        metadata["status"] = "failed"
        metadata["failed_at_utc"] = utc_now()
        metadata["error"] = f"{type(error).__name__}: {error}"
        metadata["traceback"] = traceback.format_exc()
        write_json(run_dir / "run_metadata.json", metadata)
        raise
    finally:
        if model is not None:
            del model
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
