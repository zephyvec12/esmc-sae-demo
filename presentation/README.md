# Chinese Presentation and Archived Build Source

Language: **English** | [简体中文](README.zh-CN.md)

This directory contains the completed 34-slide ESMC 6B / SAE / GFP presentation in Chinese, slide-by-slide speaker notes, and all presentation build and verification scripts. The PowerPoint, speaker notes, and slide-specific teaching materials remain in Chinese.

- PowerPoint: [ESMC_6B_SAE_GFP_20260906.pptx](output/ESMC_6B_SAE_GFP_20260906.pptx)
- Speaker notes: [notes/total.md](notes/total.md)
- Design specification: [design_spec.md](design_spec.md)
- Source ledger: [SOURCE_LEDGER.md](SOURCE_LEDGER.md)
- Verification results: [quality_report.md](output/quality_report.md)

The deck contains 3 native editable charts, 8 native tables, and 34 embedded speaker-note sections. It passed Artifact Tool reimport, slide-by-slide rendering, OOXML data checks, and a scientific-content audit. See the quality report for the scope of verification.

## Source notes

`src/` preserves the original `.mjs` and PowerShell scripts: full-deck construction, three sample slides, reference-deck inspection, finalization, PowerPoint reimport, pixel comparison, content auditing, and source-bundle packaging.

These are archived historical build scripts. They depend on the local Codex `@oai/artifact-tool` installation, the presentation skill's verification tools, and the original runtime paths. They use a different environment from the runnable Python inference pipeline in this repository.

The original build directory was `E:\ESMC\ppt_handoff_20260906`. To rebuild with the corresponding runtime, adapt the directory structure and paths using this mapping:

| Original build input | Repository location |
|---|---|
| `build/*.mjs`, `build/*.ps1` | `src/` |
| `notes.json` | `data/notes.json` |
| `evidence.json` | `data/evidence.json` |
| `normalized_slide_data.json` | `data/normalized_slide_data.json` |
| `sources/run_20260905T135554Z_smoke_gfp` | `../examples/gfp/` |
| `sources/audit/1EMA.cif`, API JSON | `../audit/data/` |
| `.codex-finalizer` and previews | Locally generated directories, ignored by Git |

The reference-deck inspection script also requires the original style-reference files. The completed deck uses native editable objects; the repository includes the generated PowerPoint and its structured slide data. External style-reference bundles, the Node runtime, and model caches are managed separately on the local machine.

The evidence-generation script is [generate_evidence.py](../audit/src/generate_evidence.py). It likewise retains its original local paths and inspection logic for the installed ESM source.
