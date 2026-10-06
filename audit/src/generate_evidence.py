"""Build compact, chart-ready ESMC evidence artifacts from audited source files.

This script is deliberately read-only with respect to the completed run.  It
writes only the three handoff artifacts under ``ppt_handoff_20260906``.
"""

from __future__ import annotations

import hashlib
import json
import math
import shlex
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


HANDOFF = Path(r"E:\ESMC\ppt_handoff_20260906")
RUN = Path(r"E:\ESMC\runs\run_20260905T135554Z_smoke_gfp")
AUDIT = HANDOFF / "sources" / "audit"
CIF = AUDIT / "1EMA.cif"
RCSB_API = AUDIT / "1EMA.A.current-api.json"
INSTALLED_ESM = Path(r"E:\ESMC\esmc_feature_site_pipeline\.venv312\Lib\site-packages\esm\models\esmc")
TOKENIZER_SOURCE = INSTALLED_ESM / "tokenizer.py"
SAE_SOURCE = INSTALLED_ESM / "sae.py"
MODEL_SOURCE = INSTALLED_ESM / "model.py"
LAYERS_SOURCE = INSTALLED_ESM / "layers.py"
ESM_DIRECT_URL = Path(r"E:\ESMC\esmc_feature_site_pipeline\.venv312\Lib\site-packages\esm-3.4.1.dist-info\direct_url.json")
OFFICIAL_TOKENIZER_URL = "https://raw.githubusercontent.com/Biohub/esm/bf343ba264b650dff7a073643725f9aaa1fdbe8d/esm/models/esmc/tokenizer.py"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def as_builtin(value: Any) -> Any:
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    if isinstance(value, np.ndarray):
        return [as_builtin(item) for item in value.tolist()]
    if isinstance(value, dict):
        return {str(key): as_builtin(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [as_builtin(item) for item in value]
    return value


def dataframe_records(frame: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    return [{column: as_builtin(row[column]) for column in columns} for _, row in frame.iterrows()]


def robust_stats(values: np.ndarray) -> dict[str, Any]:
    values = np.asarray(values, dtype=np.float64)
    median = float(np.median(values))
    mad = float(np.median(np.abs(values - median)))
    mad_scale = 1.4826 * mad
    std = float(np.std(values))
    uses_std = not math.isfinite(mad_scale) or mad_scale < 1e-12
    return {
        "minimum": float(values.min()),
        "maximum": float(values.max()),
        "mean": float(values.mean()),
        "median": median,
        "mad": mad,
        "mad_scale": mad_scale,
        "std": std,
        "selected_scale": std if uses_std else mad_scale,
        "uses_std_fallback": uses_std,
        "quantiles": {
            "p10": float(np.quantile(values, 0.10)),
            "p25": float(np.quantile(values, 0.25)),
            "p75": float(np.quantile(values, 0.75)),
            "p90": float(np.quantile(values, 0.90)),
        },
    }


def histogram(values: np.ndarray, bins: int = 10) -> dict[str, Any]:
    counts, edges = np.histogram(np.asarray(values, dtype=np.float64), bins=bins)
    return {"bin_edges": [float(item) for item in edges], "counts": [int(item) for item in counts]}


def parse_poly_seq_scheme(cif_path: Path) -> list[dict[str, str]]:
    lines = cif_path.read_text(encoding="utf-8").splitlines()
    start = None
    for index, line in enumerate(lines):
        if line.strip() == "loop_" and index + 1 < len(lines) and lines[index + 1].startswith("_pdbx_poly_seq_scheme."):
            start = index
            break
    if start is None:
        raise RuntimeError("_pdbx_poly_seq_scheme loop was not found in 1EMA.cif")
    headers: list[str] = []
    cursor = start + 1
    while lines[cursor].startswith("_pdbx_poly_seq_scheme."):
        headers.append(lines[cursor].strip().split(".", 1)[1])
        cursor += 1
    rows: list[dict[str, str]] = []
    while cursor < len(lines) and lines[cursor].strip() != "#":
        if lines[cursor].strip():
            values = shlex.split(lines[cursor])
            if len(values) != len(headers):
                raise RuntimeError(f"Unexpected poly_seq_scheme row at mmCIF line {cursor + 1}")
            rows.append(dict(zip(headers, values, strict=True)))
        cursor += 1
    return rows


def summary_line(text: str) -> str:
    return str(text).split("\n", 1)[0].replace("Summary: ", "").strip()


def main() -> None:
    metadata = json.loads((RUN / "run_metadata.json").read_text(encoding="utf-8"))
    candidate = pd.read_csv(RUN / "candidate_sites_all.csv")
    activations = pd.read_csv(RUN / "sae_residue_activations.csv")
    feature_summary = pd.read_csv(RUN / "sae_feature_summary.csv")
    with np.load(RUN / "residue_embeddings.npz") as arrays:
        npz = {key: {"shape": list(arrays[key].shape), "dtype": str(arrays[key].dtype)} for key in arrays.files}
        npz["selected_hidden_state_index"]["value"] = int(arrays["selected_hidden_state_index"].item())
    sequence = "".join(
        line.strip()
        for line in (RUN / "input_sequence.fasta").read_text(encoding="utf-8").splitlines()
        if not line.startswith(">")
    )
    model_config_path = Path(metadata["cache_dir"]) / "models--biohub--esmc-6b-2024-12" / "snapshots" / metadata["model_resolved_revision"] / "config.json"
    model_config = json.loads(model_config_path.read_text(encoding="utf-8"))
    sae_config_path = Path(metadata["cache_dir"]) / "models--biohub--ESMC-6B-sae-layer60-k64-codebook16384" / "snapshots" / metadata["sae"]["resolved_revision"] / "config.json"
    sae_config = json.loads(sae_config_path.read_text(encoding="utf-8"))
    tokenizer_source_text = TOKENIZER_SOURCE.read_text(encoding="utf-8")
    sae_source_text = SAE_SOURCE.read_text(encoding="utf-8")
    model_source_text = MODEL_SOURCE.read_text(encoding="utf-8")
    layers_source_text = LAYERS_SOURCE.read_text(encoding="utf-8")
    installed_esm_origin = json.loads(ESM_DIRECT_URL.read_text(encoding="utf-8"))
    # These assertions keep the handoff claims tied to the installed package
    # recorded by the completed run (esm 3.4.1), rather than to a remembered API.
    required_tokenizer_fragments = ['"|",  # 31', '"<mask>",  # 32', 'all ESMC checkpoints']
    if any(fragment not in tokenizer_source_text for fragment in required_tokenizer_fragments):
        raise RuntimeError("Installed ESMC tokenizer source no longer supports the audited 31/32 conclusion")
    required_sae_fragments = [
        "x.mean(dim=-1, keepdim=True)",
        "x.std(dim=-1, keepdim=True)",
        "torch.topk(preactivations, self.params.k, dim=-1)",
        "layer_states[token_mask].view(-1, v_len)",
        "self.W_enc = nn.Parameter",
        "self.W_dec = nn.Parameter",
        "self.b_dec = nn.Parameter",
    ]
    if any(fragment not in sae_source_text for fragment in required_sae_fragments):
        raise RuntimeError("Installed ESMC SAE source no longer supports the audited normalizer conclusion")
    if "if normalize_sae:\n                features = (features / layer.max) * layer.idf" not in model_source_text:
        raise RuntimeError("Installed ESMC model source no longer supports the audited raw-activation conclusion")
    required_attention_fragments = [
        "self.q_ln = nn.LayerNorm(d_model, bias=bias)",
        "self.k_ln = nn.LayerNorm(d_model, bias=bias)",
        "q = self.q_ln(q).to(q.dtype)",
        "q = q.unflatten(-1, (self.n_heads, self.d_head))",
        "self.layer_norm_bias = nn.Parameter(torch.zeros(d_in))",
    ]
    if any(fragment not in layers_source_text for fragment in required_attention_fragments):
        raise RuntimeError("Installed ESMC attention source no longer supports the audited QK-LN/bias conclusion")

    cp = candidate["conditional_preference"].to_numpy(dtype=float)
    clipped_cp = np.maximum(cp, 0.0)
    novelty = candidate["contextual_novelty"].to_numpy(dtype=float)
    score = candidate["model_candidate_score"].to_numpy(dtype=float)
    clipped_scale = float(np.std(clipped_cp))
    recomputed_constraint = (clipped_cp - np.median(clipped_cp)) / clipped_scale
    recomputed_score = 0.7 * candidate["constraint_component_z"].to_numpy(dtype=float) + 0.3 * candidate["novelty_component_z"].to_numpy(dtype=float)

    feature_lookup = feature_summary.set_index("feature_id")

    def feature_at(position: int, feature_id: int) -> dict[str, Any]:
        row = activations[(activations["position"] == position) & (activations["feature_id"] == feature_id)]
        if len(row) != 1:
            raise RuntimeError(f"Expected exactly one activation for position={position}, feature={feature_id}; found {len(row)}")
        feature = feature_lookup.loc[feature_id]
        return {
            "position": position,
            "feature_id": feature_id,
            "activation": float(row.iloc[0]["activation"]),
            "feature_global_max_activation": float(feature["max_activation"]),
            "active_position_count": int(feature["active_position_count"]),
            "positions": str(feature["positions"]),
            "description_summary": summary_line(str(feature["feature_description"])),
        }

    representative_pairs = {
        1: [8545, 11504],
        20: [6818],
        24: [13094, 9528],
        26: [3586],
        40: [6141, 7156],
        45: [3904],
        91: [16214],
        173: [14747],
        174: [7156],
        195: [16243, 5474],
        65: [627],
        66: [6579],
        67: [9237],
    }
    representative_features = {
        str(position): [feature_at(position, feature_id) for feature_id in feature_ids]
        for position, feature_ids in representative_pairs.items()
    }

    # 1EMA mapping: expand CRO as TYG for the structural construct, and treat MSE
    # as methionine for one-letter comparison.  This makes coordinate rules
    # independently explicit rather than reusing a label_seq_id as a FASTA index.
    poly_rows = parse_poly_seq_scheme(CIF)
    poly_by_label = {int(row["seq_id"]): row for row in poly_rows}
    three_to_one = {
        "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C", "GLN": "Q", "GLU": "E",
        "GLY": "G", "HIS": "H", "ILE": "I", "LEU": "L", "LYS": "K", "MET": "M", "MSE": "M",
        "PHE": "F", "PRO": "P", "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V",
    }
    reconstructed = []
    for row in poly_rows:
        component = row["mon_id"]
        reconstructed.extend("TYG" if component == "CRO" else three_to_one[component])
    reconstructed_sequence = "".join(reconstructed)
    alignment_differences = [
        {"input_position": index + 1, "input_residue": sequence[index], "1EMA_construct_residue": reconstructed_sequence[index]}
        for index in range(len(sequence))
        if sequence[index] != reconstructed_sequence[index]
    ]

    rcsb = json.loads(RCSB_API.read_text(encoding="utf-8"))
    secondary_features = [
        feature
        for feature in rcsb["rcsb_polymer_instance_feature"]
        if feature["type"] in {"SHEET", "HELIX_P", "UNASSIGNED_SEC_STRUCT", "UNOBSERVED_RESIDUE_XYZ", "UNOBSERVED_ATOM_XYZ"}
    ]
    feature_ranges = {
        feature["type"]: [
            {"begin_label_seq_id": int(item["beg_seq_id"]), "end_label_seq_id": int(item.get("end_seq_id", item["beg_seq_id"]))}
            for item in feature["feature_positions"]
        ]
        for feature in secondary_features
    }

    def label_memberships(label: int) -> tuple[str, list[str]]:
        sec_label = "unassigned secondary structure"
        flags: list[str] = []
        for feature in secondary_features:
            for item in feature["feature_positions"]:
                begin = int(item["beg_seq_id"])
                end = int(item.get("end_seq_id", begin))
                if begin <= label <= end:
                    if feature["type"] == "SHEET":
                        sec_label = f"sheet (polymer labels {begin}-{end})"
                    elif feature["type"] == "HELIX_P":
                        sec_label = f"helix (polymer labels {begin}-{end})"
                    elif feature["type"] == "UNASSIGNED_SEC_STRUCT" and sec_label == "unassigned secondary structure":
                        sec_label = f"unassigned secondary structure (polymer labels {begin}-{end})"
                    elif feature["type"] == "UNOBSERVED_RESIDUE_XYZ":
                        flags.append("unmodeled residue")
                    elif feature["type"] == "UNOBSERVED_ATOM_XYZ":
                        flags.append("partially modeled residue")
        return sec_label, flags

    def map_input_position(position: int) -> dict[str, Any]:
        if position in {65, 66, 67}:
            label = 65
            mapping = "CRO composite: input S65/Y66/G67 share one polymer label and one author residue"
        elif position <= 64:
            label = position
            mapping = "direct before chromophore composite"
        else:
            label = position - 2
            mapping = "after chromophore composite: polymer label = input position - 2; author/PDB sequence number = input position"
        poly = poly_by_label[label]
        sec, flags = label_memberships(label)
        return {
            "input_position": position,
            "input_residue": sequence[position - 1],
            "polymer_label_seq_id": label,
            "pdb_seq_num": None if poly["pdb_seq_num"] == "?" else int(poly["pdb_seq_num"]),
            "author_seq_num": None if poly["auth_seq_num"] == "?" else int(poly["auth_seq_num"]),
            "polymer_component": poly["mon_id"],
            "secondary_structure_from_current_rcsb_feature": sec,
            "coordinate_flags": flags,
            "mapping_rule": mapping,
        }

    mapping_positions = [1, 20, 24, 26, 40, 45, 65, 66, 67, 91, 173, 174, 195]
    mapping_table = [map_input_position(position) for position in mapping_positions]

    all_fields = [
        "rank", "position", "residue", "residue_token_index", "wild_type_log_probability",
        "best_alternative_residue", "best_alternative_log_probability", "conditional_preference",
        "amino_acid_distribution_entropy", "contextual_novelty", "constraint_component_z",
        "novelty_component_z", "model_candidate_score",
    ]
    top10 = dataframe_records(candidate.nsmallest(10, "rank"), all_fields)
    chromophore = dataframe_records(candidate[candidate["position"].isin([65, 66, 67])].sort_values("position"), all_fields)
    score_series = dataframe_records(candidate.sort_values("position"), ["position", "residue", "rank", "conditional_preference", "contextual_novelty", "model_candidate_score"])

    direct_observations = {
        "candidate_rows": int(len(candidate)),
        "candidate_columns": list(candidate.columns),
        "positions_are_exact_1_to_238": candidate["position"].tolist() == list(range(1, 239)),
        "ranks_are_unique_1_to_238": candidate["rank"].nunique() == 238 and set(candidate["rank"]) == set(range(1, 239)),
        "residue_tokens_are_exact_1_to_238": candidate["residue_token_index"].tolist() == list(range(1, 239)),
        "residue_string_matches_fasta": "".join(candidate["residue"].tolist()) == sequence,
        "embedding_archive": npz,
        "sae_activation_rows": int(len(activations)),
        "sae_positions_with_activations": int(activations["position"].nunique()),
        "sae_activations_per_position": sorted({int(value) for value in activations.groupby("position").size().tolist()}),
        "sae_unique_active_features": int(activations["feature_id"].nunique()),
        "feature_summary_rows": int(len(feature_summary)),
        "feature_summary_unique_ids": int(feature_summary["feature_id"].nunique()),
        "feature_summary_nonempty_descriptions": int(feature_summary["feature_description"].fillna("").astype(str).str.len().gt(0).sum()),
        "feature_summary_generic_descriptions": int(feature_summary["feature_description"].fillna("").astype(str).str.startswith("Summary: Generic feature").sum()),
        "activation_range": [float(activations["activation"].min()), float(activations["activation"].max())],
    }

    evidence = {
        "audit_id": "ESMC-GFP-20260906",
        "scope": "Completed ESMC GFP smoke run evidence audit; no inference, environment modification, or result regeneration was performed.",
        "run": {
            "status": metadata["status"],
            "command_line": metadata["command_line"],
            "started_at_utc": metadata["started_at_utc"],
            "completed_at_utc": metadata["completed_at_utc"],
            "input_header": metadata["input_header"],
            "protein_length": metadata["protein_length"],
            "run_directory": str(RUN),
            "script_path": metadata["script_path"],
            "script_sha256": metadata["script_sha256"],
        },
        "reproducibility": {
            "model_id": metadata["model"],
            "model_requested_revision": metadata["model_requested_revision"],
            "model_resolved_revision": metadata["model_resolved_revision"],
            "model_checkpoint_total_parameters": 6352005184,
            "dtype": metadata["dtype"],
            "device_map": metadata["device_map"],
            "attn_implementation": metadata["attn_implementation"],
            "masked_batch_size": metadata["masked_batch_size"],
            "novelty_window": metadata["novelty_window"],
            "weights": {"constraint": metadata["constraint_weight"], "novelty": metadata["novelty_weight"]},
            "gpu": metadata["gpu_before_load"],
            "gpu_after_model_load": metadata["gpu_after_model_load"],
            "gpu_after_dense_model_release": metadata["gpu_after_dense_model_release"],
            "package_versions": metadata["package_versions"],
            "python": metadata["python"],
        },
        "tokenization": {
            "tokenizer_class": metadata["tokenizer"],
            "input_residue_length": len(sequence),
            "encoded_token_length": len(sequence) + 2,
            "actual_example": {
                "sequence": "MSK",
                "tokens": ["<cls>", "M", "S", "K", "<eos>"],
                "input_ids": [0, 20, 8, 15, 2],
                "special_tokens_mask": [1, 0, 0, 0, 1],
            },
            "special_ids": {"cls_bos": 0, "pad": 1, "eos": 2, "unk": 3, "chain_break": 31, "mask": 32},
            "tokenizer_active_vocab_size": 33,
            "model_config_vocab_size": model_config["vocab_size"],
            "validated_residue_token_indices": {"count": metadata["token_to_residue_mapping_length"], "first": 1, "last": 238},
            "mask_id_audit": {
                "legacy_checkpoint_config_mask_token_id": int(model_config["mask_token_id"]),
                "runtime_tokenizer_mask_token_id": 32,
                "runtime_resolution": "runner instantiates EsmcTokenizer and selects tokenizer.mask_token_id before model.config.mask_token_id",
                "official_tokenizer_source": {
                    "path": str(TOKENIZER_SOURCE),
                    "sha256": sha256(TOKENIZER_SOURCE),
                    "official_url": OFFICIAL_TOKENIZER_URL,
                    "installed_package_origin": installed_esm_origin,
                    "evidence": "SEQUENCE_VOCAB documents | as 31 and <mask> as 32, calls this the canonical vocabulary used by all ESMC checkpoints, and says indices are hard-coded into model weights",
                },
                "conclusion": "config.json mask_token_id=31 is stale/inconsistent serialized metadata for this interface; it did not control the actual masked input in this run. Cross-implementation numerical parity remains a separate pending comparison.",
            },
        },
        "architecture": {
            "checkpoint_config_raw": model_config,
            "resolved": {
                "hidden_size": 2560,
                "num_hidden_layers": 80,
                "num_attention_heads": 40,
                "head_dimension": 64,
                "swiglu_intermediate_size": 6912,
                "residual_scaling_factor": math.sqrt(80 / 36),
                "attention": "pre-LN fused QKV; Q/K LayerNorm across full d_model=2560 before 40x64 head reshape; RoPE; SDPA in this run",
                "ffn": "pre-LN SwiGLU; linear projections bias=False",
                "bias_audit": {
                    "linear_qkv_out_and_ffn_projections": False,
                    "q_and_k_layer_norm": False,
                    "final_layer_norm": False,
                    "fallback_qkv_and_ffn_pre_layer_norm": True,
                    "wording_boundary": "Do not generalize linear bias=False into an assertion that every LayerNorm in the implementation lacks a bias parameter.",
                },
                "final_norm": "LayerNorm(hidden_size=2560, bias=False)",
                "exported_hidden_state": "state 80 / final normalized state",
            },
            "embedding_archive": npz,
        },
        "scoring": {
            "definition": "s = 0.7 * robust_z(max(conditional_preference, 0)) + 0.3 * robust_z(contextual_novelty)",
            "conditional_preference_definition": "masked-LM log p(observed amino acid) minus log p(best alternative among the 20 standard amino acids)",
            "conditional_preference_counts": {"positive": int((cp > 0).sum()), "zero": int((cp == 0).sum()), "negative": int((cp < 0).sum())},
            "conditional_preference_raw_stats": robust_stats(cp),
            "conditional_preference_clipped_stats": robust_stats(clipped_cp),
            "contextual_novelty_stats": robust_stats(novelty),
            "candidate_score_stats": robust_stats(score),
            "histograms": {
                "conditional_preference": histogram(cp),
                "clipped_conditional_preference": histogram(clipped_cp),
                "contextual_novelty": histogram(novelty),
                "candidate_score": histogram(score),
            },
            "constraint_component_recomputed_max_abs_error": float(np.max(np.abs(candidate["constraint_component_z"].to_numpy(dtype=float) - recomputed_constraint))),
            "score_recomputed_max_abs_error": float(np.max(np.abs(candidate["model_candidate_score"].to_numpy(dtype=float) - recomputed_score))),
            "interpretation": "After clipping, 210 negative margins share a zero constraint component; their rank differences are driven by novelty, while the 28 positive margins retain a nonzero constraint component.",
        },
        "results": {"top10": top10, "chromophore_65_66_67": chromophore},
        "sae": {
            "model_id": metadata["sae"]["model"],
            "resolved_revision": metadata["sae"]["resolved_revision"],
            "layer": metadata["sae"]["layer"],
            "config": sae_config,
            "activation_count_metadata": metadata["sae"]["activation_count"],
            "summary": direct_observations,
            "implementation_audit": {
                "source": {"path": str(SAE_SOURCE), "sha256": sha256(SAE_SOURCE)},
                "representation_normalization": {
                    "scope": "each input representation independently along its final d_model axis",
                    "input_shape": "N x 2560",
                    "mean_and_std_shape": "N x 1",
                    "formula": "x = (x - mean(x, dim=-1, keepdim=True)) / (std(x, dim=-1, keepdim=True) + 1e-5)",
                    "saved_layer_mean_or_std": False,
                },
                "feature_tensor_layout": {
                    "returned_layout": "N x 16384 sparse tensor after flattening non-padding batch/token rows",
                    "raw_shape_this_run": [240, 16384],
                    "raw_N_definition": "B=1 and all T=240 tokens are non-padding, including <cls> and <eos>",
                    "exported_residue_shape": [238, 16384],
                    "export_rule": "runner keeps only token indices 1..238 matched through special_tokens_mask; the two special-token rows are omitted",
                    "warning": "B x T x 16384 can be used only as a conceptual reshape in a diagram; it is not the direct SAE tensor layout returned by this implementation",
                },
                "encoder_decoder": {
                    "W_enc_shape": [2560, 16384],
                    "W_dec_shape": [16384, 2560],
                    "encoder_bias": False,
                    "decoder_bias_shape": [2560],
                    "encoder_and_decoder_weights_tied": False,
                    "activation": "ReLU followed by TopK(k=64, dim=-1)",
                },
                "per_feature_post_scale": {
                    "idf_and_max_shape": [16384],
                    "formula_when_enabled": "(features / layer.max) * layer.idf",
                    "normalize_sae_default": False,
                    "applied_to_this_run": False,
                    "source": {"path": str(MODEL_SOURCE), "sha256": sha256(MODEL_SOURCE)},
                },
            },
            "representative_features": representative_features,
            "activation_interpretation_boundary": "Raw activations are sparse feature magnitudes. They support feature lookup; values across distinct feature IDs are not a calibrated cross-feature confidence scale.",
        },
        "structure_mapping_1EMA": {
            "source": {"entry": "1EMA", "chain": "A", "cif_sha256": sha256(CIF), "api_sha256": sha256(RCSB_API)},
            "alignment_method": "Map FASTA positions to 1EMA polymer labels through the mmCIF poly_seq_scheme; expand CRO to TYG for construct-sequence comparison and map MSE to one-letter M.",
            "polymer_residue_count": len(poly_rows),
            "input_length": len(sequence),
            "expanded_construct_length": len(reconstructed_sequence),
            "expanded_construct_differences_vs_input": alignment_differences,
            "construct_annotations": ["MSE maps to Met at one-letter level", "1EMA contains S65T and Q80R relative to the supplied GFP sequence", "input S65/Y66/G67 are represented by one CRO polymer residue: label_seq_id 65, author/PDB sequence number 66"],
            "mapping_rule": {"input_1_to_64": "label = input; author/PDB numbering matches where coordinates exist", "input_65_to_67": "all three map to CRO label 65 / author 66", "input_68_to_238": "label = input - 2; author/PDB sequence number = input"},
            "current_rcsb_feature_ranges_are_polymer_labels": feature_ranges,
            "top_and_control_mapping": mapping_table,
            "mapping_warning": "RCSB current structural feature ranges use polymer label_seq_id. Applying label_seq_id directly as the 238-residue FASTA position shifts post-CRO sites by two positions and treats the three-residue chromophore as one record.",
        },
        "compatibility_and_scientific_boundaries": [
            {"claim": "The completed run documents a successfully executed path for the specified old checkpoint, environment, and input.", "status": "supported by run metadata and completed artifacts"},
            {"claim": "The mask supplied to every masked position in this run was the official ESMC <mask> token ID 32.", "status": "supported by runner precedence plus the instantiated official tokenizer vocabulary; legacy config mask_token_id=31 did not control the run input"},
            {"claim": "The legacy key adapter completed loading without a surfaced strict-loader error.", "status": "supported indirectly: the installed loader raises for missing, unexpected, or dropped tensors; metadata does not record an independent per-tensor count"},
            {"claim": "The adapter establishes output equivalence with the old GitHub implementation or the current recommended HF checkpoint.", "status": "pending an explicit parity baseline; no such baseline is present in the run"},
            {"claim": "Kernel fallback explains the GFP chromophore ranking result.", "status": "unsupported; installed-package warnings describe numerical implementation differences, without a causal experiment for this result"},
            {"claim": "Low rank of S65/Y66/G67 establishes low biological importance.", "status": "unsupported; this control observes ranks under this implementation and scoring rule only"},
            {"claim": "SAE descriptions establish GFP-specific function or cross-feature confidence.", "status": "unsupported without independent biological validation and calibrated comparison"},
        ],
        "compatibility_observations": {
            "official_model_card_status": "biohub/esmc-6b-2024-12 is documented by Biohub as a backward-compatible GitHub-package-format checkpoint; the card recommends biohub/ESMC-6B HF-compatible weights.",
            "runner_adapter": "Esmc6B2024ForMaskedLM remaps seven legacy LayerNorm/MLP key suffixes after the installed package normalizes the published layout.",
            "loader_check": "Installed HubPreTrainedModel uses strict_keys=True and raises on missing, unexpected, or dropped checkpoint entries.",
            "kernel_environment": "Installed esm emitted warnings that Transformer Engine, xformers, flash-attn, and flash-attn RoPE are unavailable; this run recorded SDPA and pure-PyTorch fallbacks.",
            "mask_id_observation": "Cached legacy checkpoint config has mask_token_id=31, while the official instantiated EsmcTokenizer has chain_break=31 and <mask>=32. The runner uses tokenizer.mask_token_id first, so the actual run used valid token 32. Treat config=31 as stale/inconsistent serialization metadata; a broader cross-implementation numerical/MLM parity baseline remains pending and is not evidence of a wrong masked input.",
        },
        "sources": [
            {"id": "RUN_METADATA", "path": str(RUN / "run_metadata.json")},
            {"id": "CANDIDATES", "path": str(RUN / "candidate_sites_all.csv")},
            {"id": "SAE_ACTIVATIONS", "path": str(RUN / "sae_residue_activations.csv")},
            {"id": "SAE_FEATURE_SUMMARY", "path": str(RUN / "sae_feature_summary.csv")},
            {"id": "RUNNER", "path": str(Path(metadata["script_path"]))},
            {"id": "OFFICIAL_ESMC_TOKENIZER", "path": str(TOKENIZER_SOURCE), "url": OFFICIAL_TOKENIZER_URL, "installed_package_origin": installed_esm_origin},
            {"id": "INSTALLED_ESMC_SAE", "path": str(SAE_SOURCE), "sha256": sha256(SAE_SOURCE)},
            {"id": "INSTALLED_ESMC_MODEL", "path": str(MODEL_SOURCE), "sha256": sha256(MODEL_SOURCE)},
            {"id": "INSTALLED_ESMC_LAYERS", "path": str(LAYERS_SOURCE), "sha256": sha256(LAYERS_SOURCE)},
            {"id": "1EMA_CIF", "path": str(CIF), "url": "https://files.rcsb.org/download/1EMA.cif"},
            {"id": "1EMA_CURRENT_API", "path": str(RCSB_API), "url": "https://data.rcsb.org/rest/v1/core/polymer_entity_instance/1EMA/A"},
            {"id": "HF_LEGACY_CARD", "url": "https://huggingface.co/biohub/esmc-6b-2024-12"},
            {"id": "HF_RECOMMENDED_CARD", "url": "https://huggingface.co/biohub/ESMC-6B"},
        ],
    }

    normalized = {
        "audit_id": evidence["audit_id"],
        "input": {"sequence_length": 238, "highlight_window_61_70": sequence[60:70], "chromophore": "SYG", "chromophore_positions": [65, 66, 67]},
        "tokenization": evidence["tokenization"],
        "architecture": evidence["architecture"]["resolved"],
        "run_manifest": evidence["reproducibility"],
        "score_data": {
            "formula": evidence["scoring"]["definition"],
            "statistics": {
                "conditional_preference_raw": evidence["scoring"]["conditional_preference_raw_stats"],
                "conditional_preference_clipped": evidence["scoring"]["conditional_preference_clipped_stats"],
                "contextual_novelty": evidence["scoring"]["contextual_novelty_stats"],
                "candidate_score": evidence["scoring"]["candidate_score_stats"],
            },
            "histograms": evidence["scoring"]["histograms"],
            "p20_score_series": score_series,
            "p21_top10": top10,
            "p22_bars": [{"site": f"{row['residue']}{row['position']}", "score": row["model_candidate_score"]} for row in top10[:5]],
            "p23_rank_comparison": [
                {"site": "G24", "rank": 2, "score": float(candidate.loc[candidate["position"] == 24, "model_candidate_score"].iloc[0])},
                *[{"site": f"{row['residue']}{row['position']}", "rank": row["rank"], "score": row["model_candidate_score"]} for row in chromophore],
            ],
        },
        "sae_data": {
            "matrix_shape": [238, 16384],
            "matrix_shape_definition": "exported residue-only matrix after filtering the raw N=240 token rows",
            "nonzero_per_residue": 64,
            "activation_rows": 15232,
            "unique_active_feature_ids": 1134,
            "feature_descriptions_present": 1134,
            "implementation_audit": evidence["sae"]["implementation_audit"],
            "representative_features": representative_features,
        },
        "p30_mapping_table": mapping_table,
        "p31_control_feature_table": [
            *representative_features["195"], *representative_features["65"], *representative_features["66"], *representative_features["67"]
        ],
        "limits": evidence["compatibility_and_scientific_boundaries"],
        "source_ids": [item["id"] for item in evidence["sources"]],
    }

    def write_json(path: Path, payload: dict[str, Any]) -> None:
        path.write_text(json.dumps(as_builtin(payload), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    write_json(HANDOFF / "evidence.json", evidence)
    write_json(HANDOFF / "normalized_slide_data.json", normalized)

    rows = []
    for item in mapping_table:
        author = "—" if item["author_seq_num"] is None else str(item["author_seq_num"])
        flags = "; ".join(item["coordinate_flags"]) if item["coordinate_flags"] else "modeled"
        rows.append(
            f"| {item['input_residue']}{item['input_position']} | {item['polymer_label_seq_id']} | {author} | {item['polymer_component']} | {item['secondary_structure_from_current_rcsb_feature']} | {flags} |"
        )
    audit_md = f"""# ESMC GFP 运行：证据审计\n\n## 可直接支持的结论\n\n- 已完成运行处理了 238 aa GFP；`candidate_sites_all.csv` 为 238 行，位置、rank、token-index 与 FASTA 的一一核对通过。\n- 实际 tokenizer 将 `MSK` 编为 `<cls>, M, S, K, <eos>` / `[0,20,8,15,2]`，`special_tokens_mask=[1,0,0,0,1]`；完整序列 token 长度为 240。\n- 导出 `H` 为 238×2560、FP16；均值蛋白向量为 2560、FP32。\n- SAE layer 60 的 15,232 条激活满足 238×64；1,134 个活跃 feature ID 均有描述。\n- 排名是本次冻结推理及 `.7/.3` 启发式的候选排序。GFP 发色团 S65/Y66/G67 的实测 rank 为 225/223/211，score 为 -0.387662/-0.357207/-0.300504。\n\n## 评分复核\n\n- `conditional_preference` 正值 28 个、负值 210 个。裁剪 `max(m,0)` 后中位数=0、MAD=0，代码走标准差回退，scale={evidence['scoring']['conditional_preference_clipped_stats']['selected_scale']:.10f}。\n- `contextual_novelty` 使用 MAD scale={evidence['scoring']['contextual_novelty_stats']['selected_scale']:.10f}。重算 constraint 分量的最大绝对误差为 {evidence['scoring']['constraint_component_recomputed_max_abs_error']:.3g}；重算总分误差为 {evidence['scoring']['score_recomputed_max_abs_error']:.3g}。\n- 因此，210 个负 margin 位置的 constraint z 都是 0；这些位置的分位次主要由 novelty 分量区分。\n\n## Top 10（精确来源：candidate_sites_all.csv）\n\n| rank | site | margin | novelty | score |\n|---:|---|---:|---:|---:|\n""" + "\n".join(
        f"| {row['rank']} | {row['residue']}{row['position']} | {row['conditional_preference']:.6f} | {row['contextual_novelty']:.6f} | {row['model_candidate_score']:.6f} |"
        for row in top10
    ) + f"""\n\n## 1EMA 编号审计\n\n1EMA mmCIF 的 `pdbx_poly_seq_scheme` 只有 236 个 polymer records。其条目文字说明 65、66、67 三个残基在结构中由一个 `CRO 66` 取代。审计将 `CRO` 展开为 `TYG`、将 `MSE` 按一字母 `M` 对齐；得到与输入 GFP 同为 238 aa，差异仅为 S65T 和 Q80R。\n\n| 输入位点 | polymer label_seq_id | author residue | PDB component | 当前 RCSB feature context | coordinates |\n|---|---:|---:|---|---|---|\n""" + "\n".join(rows) + """\n\n输入 1–64 使用 label=input。输入 65–67 全部映射到 `CRO` label 65 / author 66。输入 68–238 使用 label=input−2，author/PDB 序号=input。当前 RCSB feature 的区间以 polymer label 表示。直接把 label_seq_id 当作输入 FASTA 坐标会把发色团三残基压成一条记录，并使其后坐标偏移两位。\n\n## 兼容性与科学边界\n\n- 本次固定旧 checkpoint `biohub/esmc-6b-2024-12@ffd268e4…`。Biohub 的现行卡将该 checkpoint 列为 GitHub-package-format 的向后兼容版本，并推荐 `biohub/ESMC-6B` 的 HF-compatible weights。\n- runner 的 legacy key adapter 覆盖七类旧 LayerNorm/MLP suffix。已安装 loader 在 missing、unexpected 或 dropped checkpoint entries 存在时抛出错误；完成状态支持该加载路径通过。run metadata 没有独立的 tensor-count 报告，也没有与官方基线的数值 parity 实验。\n- 本机 ESM 包报告 Transformer Engine、xformers、flash-attn 与 flash-attn RoPE 缺失，运行记录为 SDPA/pure-PyTorch fallback。最终 H 为 final LayerNorm state；SAE layer 60 位于中间 residual stream。当前工件支持本实现下的 GFP 控制观察；跨实现等价性仍待基线校准。\n- 缓存 checkpoint config 给出 `mask_token_id=31`，实际 tokenizer 给出 chain-break=31、mask=32，runner 优先使用 tokenizer 的 32。masked-LM parity 是下一轮必要校验。\n- SAE 原始 activation 用于 feature 查表，跨 feature ID 的数值未提供校准置信度。发色团低 rank 也需要保留为该控制的观察，不能外推为生物重要性判断。\n\n## 文件与来源\n\n- 数据总表：[evidence.json]({HANDOFF / 'evidence.json'})\n- 图表数据：[normalized_slide_data.json]({HANDOFF / 'normalized_slide_data.json'})\n- RCSB mmCIF：`{CIF}`，SHA256 `{sha256(CIF)}`\n- RCSB current chain API：`{RCSB_API}`，SHA256 `{sha256(RCSB_API)}`\n- 运行元数据：`{RUN / 'run_metadata.json'}`\n"""
    # The final source block is concatenated after a non-f-string table block;
    # resolve its file-path placeholders explicitly before emitting Markdown.
    audit_md = audit_md.replace("{HANDOFF / 'evidence.json'}", str(HANDOFF / "evidence.json"))
    audit_md = audit_md.replace("{HANDOFF / 'normalized_slide_data.json'}", str(HANDOFF / "normalized_slide_data.json"))
    audit_md = audit_md.replace("{CIF}", str(CIF)).replace("{sha256(CIF)}", sha256(CIF))
    audit_md = audit_md.replace("{RCSB_API}", str(RCSB_API)).replace("{sha256(RCSB_API)}", sha256(RCSB_API))
    audit_md = audit_md.replace("{RUN / 'run_metadata.json'}", str(RUN / "run_metadata.json"))
    audit_md = audit_md.replace(
        "- 实际 tokenizer 将 `MSK` 编为 `<cls>, M, S, K, <eos>` / `[0,20,8,15,2]`，`special_tokens_mask=[1,0,0,0,1]`；完整序列 token 长度为 240。\n",
        "- 实际 tokenizer 将 `MSK` 编为 `<cls>, M, S, K, <eos>` / `[0,20,8,15,2]`，`special_tokens_mask=[1,0,0,0,1]`；完整序列 token 长度为 240。\n"
        "- 本次 runner 直接实例化官方 `EsmcTokenizer` 并优先取其 `mask_token_id`。已安装官方 tokenizer 源码把 `|` 固定为 31、`<mask>` 固定为 32，并说明该 canonical vocabulary 用于所有 ESMC checkpoints；因此本次每个被遮挡位置使用的是有效的 `<mask>=32`。\n",
    )
    audit_md = audit_md.replace(
        "- SAE layer 60 的 15,232 条激活满足 238×64；1,134 个活跃 feature ID 均有描述。\n",
        "- SAE layer 60 的 15,232 条激活满足 238×64；1,134 个活跃 feature ID 均有描述。\n"
        "- 实现直接返回的是展平非 padding token 的 `N×16384` sparse tensor。本次先得到含 `<cls>/<eos>` 的 `240×16384`，runner 依 special-token mapping 筛为导出的 `238×16384` 残基矩阵；`B×T×16384` 仅适合作为概念性 reshape 图示。\n"
        "- SAE 对每条输入表示的 2560 个通道即时计算均值和标准差（各为 N×1），再做 z-score；它不使用保存的层级 μ/σ。`W_enc` 与 `W_dec` 独立，只有 2560 维 `b_dec`；本次 `normalize_sae=False`，CSV 保留 raw TopK activation。\n",
    )
    audit_md = audit_md.replace(
        "- 导出 `H` 为 238×2560、FP16；均值蛋白向量为 2560、FP32。\n",
        "- 导出 `H` 为 238×2560、FP16；均值蛋白向量为 2560、FP32。\n"
        "- Q/K LayerNorm 在每个 token 的完整 2560 维 Q、K 上执行，随后再拆为 40×64 heads、加 RoPE 并计算 attention。QKV/out/FFN 线性投影无 bias；fallback QKV/FFN pre-LN 带 `layer_norm_bias`，Q/K LN 和 final LN 则为 bias=False。\n",
    )
    audit_md = audit_md.replace(
        "- 缓存 checkpoint config 给出 `mask_token_id=31`，实际 tokenizer 给出 chain-break=31、mask=32，runner 优先使用 tokenizer 的 32。masked-LM parity 是下一轮必要校验。\n",
        "- 缓存 checkpoint config 的 `mask_token_id=31` 是与官方 active tokenizer 不一致的遗留序列化字段，并未控制本次 masked input。跨实现的数值/MLM parity 仍待用匹配基线校准；该待办不表示本次掩码 token 错误。\n",
    )
    (HANDOFF / "EVIDENCE_AUDIT.md").write_text(audit_md, encoding="utf-8")


if __name__ == "__main__":
    main()
