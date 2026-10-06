# ESMC 6B residue-feature-site run

## Scope

This run screened one protein sequence with `biohub/esmc-6b-2024-12` at resolved
revision `ffd268e4c72c4c9757066cd74e9a793bf7b24771`. The exported contextual
embedding is hidden-state index `-1` (actual
returned state 80). The masked scan used batch size
1 and dtype `torch.bfloat16` with
`device_map="auto"`.

`conditional_preference` is the model's masked-LM log-probability margin for the
observed amino acid versus the strongest standard-amino-acid alternative in the
same sequence context. `contextual_novelty` is the cosine distance from the
mean of the neighboring residue embeddings. The final score is
`0.70 × robust_z(max(conditional_preference, 0)) + 0.30 × robust_z(contextual_novelty)`.

## Top model-derived candidates

|   rank |   position | residue   |   conditional_preference |   contextual_novelty |   model_candidate_score |
|-------:|-----------:|:----------|-------------------------:|---------------------:|------------------------:|
|      1 |          1 | M         |                   2.8047 |               0.2301 |                 10.9852 |
|      2 |         24 | G         |                   0.7812 |               0.1675 |                  3.4226 |
|      3 |         26 | K         |                   0.4922 |               0.1711 |                  2.4817 |
|      4 |         20 | G         |                   0.5781 |               0.1304 |                  2.3231 |
|      5 |         40 | G         |                   0.5586 |               0.1351 |                  2.3084 |
|      6 |         91 | G         |                   0.4609 |               0.1266 |                  1.8825 |
|      7 |         45 | K         |                   0.3438 |               0.1413 |                  1.6479 |
|      8 |        173 | D         |                   0.1797 |               0.1708 |                  1.4175 |
|      9 |        195 | L         |                   0.3594 |               0.1149 |                  1.4088 |
|     10 |        174 | G         |                   0.3359 |               0.1062 |                  1.2321 |

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

## GFP control validation

This FASTA is an exact sequence match to reviewed *Aequorea victoria* GFP
(UniProt P42212; MD5 F4AB4243622DDCC76E0B9B6D249B172A). An independent
structure check shows that several high-ranked SAE signals agree with generic
beta-strand/beta-turn context, but the known chromophore triad Ser65-Tyr66-Gly67
ranks 225th, 223rd, and 211th of 238. The full evidence, position mapping,
and rejected non-specific feature labels are in
external_validation_report.md.

## Optional SAE stage

The layer-60 SAE was run only after releasing the first 6B model instance. Its per-residue activations and feature summaries are saved in `sae_residue_activations.csv` and `sae_feature_summary.csv`; feature activations still require their descriptions and independent biological evidence for interpretation.
