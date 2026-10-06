# 中文技术课件及历史源码

语言：[English](README.md) | **简体中文**

这里包含已完成的 34 页 ESMC 6B / SAE / GFP 中文课件、逐页讲稿，以及全部课件构建和检查脚本。

- 成品：[ESMC_6B_SAE_GFP_20260906.pptx](output/ESMC_6B_SAE_GFP_20260906.pptx)
- 讲稿：[notes/total.md](notes/total.md)
- 设计说明：[design_spec.md](design_spec.md)
- 来源台账：[SOURCE_LEDGER.md](SOURCE_LEDGER.md)
- 检查结果：[quality_report.md](output/quality_report.md)

课件包含 3 张原生可编辑图表、8 张原生表格及 34 份嵌入讲稿。成品通过了 Artifact Tool 重新导入、逐页渲染、OOXML 数据和科学内容核查。检查范围详见质量报告。

## 源码说明

`src/` 保存当时的原始 `.mjs` 与 PowerShell 脚本：完整构建、三个示例页面、参考课件读取、finalizer、PPT 重新导入、像素比较、内容审计及源包归档。

这些脚本依赖本机 Codex 中的 `@oai/artifact-tool`、演示文稿技能的检查工具和原有运行时路径，属于历史构建源码归档。它们与本仓库可直接运行的 Python 推理 pipeline 使用不同运行环境。

原构建目录为 `E:\ESMC\ppt_handoff_20260906`。在具备对应运行时的环境中重新构建时，需要将目录结构与路径适配为：

| 原构建输入 | 本仓库文件 |
|---|---|
| `build/*.mjs`、`build/*.ps1` | `src/` |
| `notes.json` | `data/notes.json` |
| `evidence.json` | `data/evidence.json` |
| `normalized_slide_data.json` | `data/normalized_slide_data.json` |
| `sources/run_20260905T135554Z_smoke_gfp` | `../examples/gfp/` |
| `sources/audit/1EMA.cif`、API JSON | `../audit/data/` |
| `.codex-finalizer` 与预览 | 本地生成目录，Git 忽略 |

参考课件读取脚本另需原始风格参考文件。成品构建使用原生可编辑对象，当前仓库提供预生成 PPT 和编排数据；外部风格参考包、Node 运行时和模型缓存由本机单独管理。

证据生成脚本位于 `../audit/src/generate_evidence.py`，同样保留了原有本机路径及对已安装 ESM 源码的审计逻辑。
