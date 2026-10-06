#!/usr/bin/env python3
"""Check the archived GFP demo using only Python's standard library."""

from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import json
import math
import statistics
import zipfile
from collections import Counter, defaultdict
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def robust_z(values: list[float]) -> list[float]:
    median = statistics.median(values)
    mad = statistics.median(abs(value - median) for value in values)
    scale = 1.4826 * mad
    if not math.isfinite(scale) or scale < 1e-12:
        scale = statistics.pstdev(values)
    if not math.isfinite(scale) or scale < 1e-12:
        return [0.0] * len(values)
    return [(value - median) / scale for value in values]


def npz_shape(path: Path, name: str) -> tuple[int, ...]:
    with zipfile.ZipFile(path) as archive, archive.open(name + ".npy") as handle:
        require(handle.read(6) == b"\x93NUMPY", "Invalid NPY magic")
        version = tuple(handle.read(2))
        require(version in {(1, 0), (2, 0), (3, 0)}, "Unsupported NPY version")
        size = int.from_bytes(handle.read(2 if version == (1, 0) else 4), "little")
        require(0 < size < 65536, "Invalid NPY header length")
        header = ast.literal_eval(handle.read(size).decode("utf-8" if version == (3, 0) else "latin1"))
        return tuple(header["shape"])


def verify(run: Path) -> dict[str, object]:
    metadata = json.loads((run / "run_metadata.json").read_text(encoding="utf-8-sig"))
    fasta = (run / "input_sequence.fasta").read_text(encoding="utf-8-sig").splitlines()
    require(sum(line.startswith(">") for line in fasta) == 1, "Expected one FASTA record")
    sequence = "".join(line.strip() for line in fasta if not line.startswith(">"))
    length = len(sequence)
    require(metadata["status"] == "completed", "Run metadata is not completed")
    require(length == metadata["protein_length"], "FASTA length differs from metadata")

    rows = read_csv(run / "candidate_sites_all.csv")
    require(len(rows) == length, "Expected one score row per residue")
    require([int(row["position"]) for row in rows] == list(range(1, length + 1)), "Invalid positions")
    require("".join(row["residue"] for row in rows) == sequence, "Residues differ from FASTA")
    require([int(row["residue_token_index"]) for row in rows] == metadata["residue_token_indices"], "Token mapping differs")
    require(sorted(int(row["rank"]) for row in rows) == list(range(1, length + 1)), "Ranks are not a permutation")

    margin = [float(row["conditional_preference"]) for row in rows]
    novelty = [float(row["contextual_novelty"]) for row in rows]
    score = [float(row["model_candidate_score"]) for row in rows]
    require(all(math.isfinite(value) for values in (margin, novelty, score) for value in values), "Non-finite score data")
    z_margin = robust_z([max(value, 0.0) for value in margin])
    z_novelty = robust_z(novelty)
    expected = [metadata["constraint_weight"] * a + metadata["novelty_weight"] * b for a, b in zip(z_margin, z_novelty)]
    error = max(abs(a - b) for a, b in zip(score, expected))
    require(error < 1e-7, f"Score formula differs: {error}")
    ranked = sorted(rows, key=lambda row: (-float(row["model_candidate_score"]), int(row["position"])))
    require([int(row["rank"]) for row in ranked] == list(range(1, length + 1)), "Rank order differs from scores")
    top = read_csv(run / "top_candidate_sites.csv")
    require(top == ranked[:min(metadata["top_k"], length)], "Top table differs from all-position scores")
    shape = npz_shape(run / "residue_embeddings.npz", "H")
    require(shape == (length, metadata["hidden_dimension"]), "Embedding shape differs")
    require(npz_shape(run / "residue_embeddings.npz", "protein_embedding") == (shape[1],), "Protein embedding shape differs")

    runner = REPO / "pipeline" / "run_esmc_site_pipeline.py"
    require(hashlib.sha256(runner.read_bytes()).hexdigest() == metadata["script_sha256"], "Archived runner SHA-256 differs")

    activations = read_csv(run / "sae_residue_activations.csv")
    require(len(activations) == metadata["sae"]["activation_count"], "SAE record count differs")
    per_position: Counter[int] = Counter()
    feature_positions: dict[int, set[int]] = defaultdict(set)
    maximum: dict[int, float] = {}
    pairs: set[tuple[int, int]] = set()
    for row in activations:
        position, feature = int(row["position"]), int(row["feature_id"])
        value = float(row["activation"])
        require(1 <= position <= length and 0 <= feature < 16384, "SAE index is out of range")
        require(math.isfinite(value) and value > 0, "Invalid SAE activation")
        require((position, feature) not in pairs, "Duplicate SAE position-feature pair")
        pairs.add((position, feature))
        per_position[position] += 1
        feature_positions[feature].add(position)
        maximum[feature] = max(value, maximum.get(feature, 0.0))
    require(set(per_position) == set(range(1, length + 1)), "SAE positions differ")
    require(set(per_position.values()) == {64}, "Expected 64 activations per residue")
    summary = read_csv(run / "sae_feature_summary.csv")
    require(len(summary) == len(feature_positions), "SAE summary feature count differs")
    require({int(row["feature_id"]) for row in summary} == set(feature_positions), "SAE summary IDs differ")
    for row in summary:
        feature = int(row["feature_id"])
        require(int(row["active_position_count"]) == len(feature_positions[feature]), "Feature active-position count differs")
        require({int(value) for value in row["positions"].split(";")} == feature_positions[feature], "Feature position list differs")
        require(abs(float(row["max_activation"]) - maximum[feature]) < 1e-7, "Feature maximum differs")

    return {
        "status": "passed",
        "protein_length": length,
        "embedding_shape": shape,
        "score_formula_max_error": error,
        "sae_activation_records": len(activations),
        "active_feature_ids": len(feature_positions),
        "top5": [{"site": row["residue"] + row["position"], "rank": int(row["rank"]), "score": float(row["model_candidate_score"])} for row in ranked[:5]],
        "runner_sha256": metadata["script_sha256"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", type=Path, default=REPO / "examples" / "gfp")
    args = parser.parse_args()
    print(json.dumps(verify(args.run_dir), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
