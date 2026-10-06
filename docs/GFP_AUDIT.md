# ESMC GFP Run: Evidence Audit

Language: **English** | [简体中文](GFP_AUDIT.zh-CN.md)

This audit describes the archived GFP run and its accompanying source and structural-reference snapshots. It is not a live re-query of upstream annotations.

## Directly supported conclusions

- The completed run processed a 238-aa GFP sequence. `candidate_sites_all.csv` has 238 rows; position, rank, token index, and FASTA correspondence checks passed.
- The tokenizer encodes `MSK` as `<cls>, M, S, K, <eos>` / `[0,20,8,15,2]`, with `special_tokens_mask=[1,0,0,0,1]`. The full sequence contains 240 tokens.
- The runner directly instantiates the official `EsmcTokenizer` and prioritizes its `mask_token_id`. The installed official tokenizer source fixes `|` at 31 and `<mask>` at 32, stating that this canonical vocabulary is used for all ESMC checkpoints. Each masked position in this run therefore used the valid `<mask>=32` token.
- Exported `H` has shape 238×2560 and dtype FP16; the mean-pooled protein vector has length 2560 and dtype FP32.
- Q/K LayerNorm operates on each token's full 2560-dimensional Q and K vectors before splitting them into 40 heads of dimension 64, applying RoPE, and computing attention. QKV/out/FFN linear projections have no bias. Fallback QKV/FFN pre-LN uses the `layer_norm_bias` setting; Q/K LN and final LN use `bias=False`.
- The 15,232 layer-60 SAE activations equal 238×64. All 1,134 active feature IDs have descriptions.
- The implementation directly returns an `N×16384` sparse tensor of flattened non-padding tokens. This run first produced `240×16384`, including `<cls>/<eos>`; the runner used the special-token mapping to filter it into the exported `238×16384` residue matrix. `B×T×16384` is only a conceptual reshape for illustrations.
- For each input representation, the SAE computes the mean and standard deviation over its 2560 channels on the fly, each with shape N×1, then applies z-score normalization. It does not use saved layer-level μ/σ. `W_enc` and `W_dec` are independent, and the only bias is the 2560-dimensional `b_dec`. This run used `normalize_sae=False`; CSV exports preserve raw TopK activations.
- The ranking is a candidate ordering from frozen inference and the `.7/.3` heuristic in this run. GFP chromophore sites S65/Y66/G67 rank 225/223/211, with scores -0.387662/-0.357207/-0.300504.

## Scoring verification

- `conditional_preference` has 28 positive and 210 negative values. After clipping with `max(m,0)`, both median and MAD are zero, so the code falls back to standard deviation with scale=0.2061997034.
- `contextual_novelty` uses a MAD scale of 0.0270947251. Recalculation gives a maximum absolute error of 4.44e-16 for the constraint component and 1.78e-15 for the total score.
- Consequently, all 210 negative-margin positions have a constraint z-score of zero; their relative ordering is determined by the novelty component.

## Top 10 (exact source: candidate_sites_all.csv)

| rank | site | margin | novelty | score |
|---:|---|---:|---:|---:|
| 1 | M1 | 2.804687 | 0.230091 | 10.985227 |
| 2 | G24 | 0.781250 | 0.167452 | 3.422573 |
| 3 | K26 | 0.492188 | 0.171101 | 2.481677 |
| 4 | G20 | 0.578125 | 0.130429 | 2.323075 |
| 5 | G40 | 0.558594 | 0.135093 | 2.308414 |
| 6 | G91 | 0.460938 | 0.126571 | 1.882541 |
| 7 | K45 | 0.343750 | 0.141311 | 1.647920 |
| 8 | D173 | 0.179688 | 0.170802 | 1.417498 |
| 9 | L195 | 0.359375 | 0.114928 | 1.408839 |
| 10 | G174 | 0.335938 | 0.106153 | 1.232124 |

## 1EMA numbering audit

The 1EMA mmCIF `pdbx_poly_seq_scheme` contains only 236 polymer records. Its entry description states that residues 65, 66, and 67 are replaced in the structure by one `CRO 66` record. The audit expands `CRO` into `TYG` and aligns `MSE` as the one-letter code `M`. The resulting sequence has the same 238-aa length as the input GFP, differing only at S65T and Q80R.

| Input site | Polymer label_seq_id | Author residue | PDB component | Archived RCSB feature context | Coordinates |
|---|---:|---:|---|---|---|
| M1 | 1 | — | MSE | unassigned secondary structure (polymer labels 1-3) | unmodeled residue |
| G20 | 20 | 20 | GLY | sheet (polymer labels 12-22) | modeled |
| G24 | 24 | 24 | GLY | unassigned secondary structure (polymer labels 23-24) | modeled |
| K26 | 26 | 26 | LYS | sheet (polymer labels 25-36) | partially modeled residue |
| G40 | 40 | 40 | GLY | unassigned secondary structure (polymer labels 37-40) | modeled |
| K45 | 45 | 45 | LYS | sheet (polymer labels 41-48) | modeled |
| S65 | 65 | 66 | CRO | unassigned secondary structure (polymer labels 61-66) | modeled |
| Y66 | 65 | 66 | CRO | unassigned secondary structure (polymer labels 61-66) | modeled |
| G67 | 65 | 66 | CRO | unassigned secondary structure (polymer labels 61-66) | modeled |
| G91 | 89 | 91 | GLY | unassigned secondary structure (polymer labels 85-89) | modeled |
| D173 | 171 | 173 | ASP | unassigned secondary structure (polymer labels 169-173) | modeled |
| G174 | 172 | 174 | GLY | unassigned secondary structure (polymer labels 169-173) | modeled |
| L195 | 193 | 195 | LEU | unassigned secondary structure (polymer labels 186-196) | modeled |

Input positions 1–64 use label=input. Input positions 65–67 all map to `CRO` label 65 / author 66. Input positions 68–238 use label=input−2, with author/PDB numbering=input. RCSB feature intervals in the archived snapshot use polymer labels. Treating label_seq_id directly as input FASTA coordinates would collapse the three chromophore residues into one record and shift subsequent coordinates by two positions.

## Compatibility and scientific limitations

- This run pins the legacy checkpoint `biohub/esmc-6b-2024-12@ffd268e4…`. At audit time, Biohub's model card described it as a backward-compatible GitHub-package-format checkpoint and recommended the HF-compatible weights in `biohub/ESMC-6B`.
- The runner's legacy key adapter covers seven categories of old LayerNorm/MLP suffixes. The installed loader raises an error when missing, unexpected, or dropped checkpoint entries exist; successful completion supports that this loading path passed. Run metadata contains neither a separate tensor-count report nor a numerical parity experiment against an official baseline.
- The local ESM package reported that Transformer Engine, xformers, flash-attn, and flash-attn RoPE were unavailable. The run records SDPA/pure-PyTorch fallbacks. Final `H` is the final LayerNorm state; SAE layer 60 reads an intermediate residual stream. The artifacts support GFP control observations under this implementation; equivalence across implementations still requires baseline calibration.
- The cached checkpoint config's `mask_token_id=31` is a legacy serialized field inconsistent with the active official tokenizer. It did not control this run's masked inputs. Numerical/MLM parity across implementations still requires a matched baseline; this outstanding task does not imply that this run used an incorrect mask token.
- Raw SAE activations are used for feature lookup. Values across feature IDs are not calibrated confidence scores. Low chromophore ranks must remain an observation of this control, not a conclusion about biological importance.

## Files and provenance

- Evidence table: [evidence.json](../presentation/data/evidence.json)
- Chart data: [normalized_slide_data.json](../presentation/data/normalized_slide_data.json)
- RCSB mmCIF: [1EMA.cif](../audit/data/1EMA.cif), SHA256 `b7d583424b6f960a7421fd4c88cdb6bbb10025667cd863d8cd14f70bc775aceb`
- Archived RCSB chain API response: [1EMA.A.current-api.json](../audit/data/1EMA.A.current-api.json), SHA256 `a4bc2ef24504ac3f82c61fc0607a25922760c28dbe452768a7fb7e671f6f5837`
- Run metadata: [run_metadata.json](../examples/gfp/run_metadata.json)

These files originated in `E:\ESMC\ppt_handoff_20260906` and `E:\ESMC\runs\run_20260905T135554Z_smoke_gfp`; the links above point to the repository copies.
