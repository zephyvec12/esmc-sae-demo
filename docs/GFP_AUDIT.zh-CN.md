# ESMC GFP 运行：证据审计

语言：[English](GFP_AUDIT.md) | **简体中文**

本审计描述归档的 GFP 运行及对应源码、结构参照快照，不是对上游注释的实时重新查询。

## 可直接支持的结论

- 已完成运行处理了 238 aa GFP；`candidate_sites_all.csv` 为 238 行，位置、rank、token-index 与 FASTA 的一一核对通过。
- 实际 tokenizer 将 `MSK` 编为 `<cls>, M, S, K, <eos>` / `[0,20,8,15,2]`，`special_tokens_mask=[1,0,0,0,1]`；完整序列 token 长度为 240。
- 本次 runner 直接实例化官方 `EsmcTokenizer` 并优先取其 `mask_token_id`。已安装官方 tokenizer 源码把 `|` 固定为 31、`<mask>` 固定为 32，并说明该 canonical vocabulary 用于所有 ESMC checkpoints；因此本次每个被遮挡位置使用的是有效的 `<mask>=32`。
- 导出 `H` 为 238×2560、FP16；均值蛋白向量为 2560、FP32。
- Q/K LayerNorm 在每个 token 的完整 2560 维 Q、K 上执行，随后再拆为 40×64 heads、加 RoPE 并计算 attention。QKV/out/FFN 线性投影无 bias；fallback QKV/FFN pre-LN 带 `layer_norm_bias`，Q/K LN 和 final LN 则为 bias=False。
- SAE layer 60 的 15,232 条激活满足 238×64；1,134 个活跃 feature ID 均有描述。
- 实现直接返回的是展平非 padding token 的 `N×16384` sparse tensor。本次先得到含 `<cls>/<eos>` 的 `240×16384`，runner 依 special-token mapping 筛为导出的 `238×16384` 残基矩阵；`B×T×16384` 仅适合作为概念性 reshape 图示。
- SAE 对每条输入表示的 2560 个通道即时计算均值和标准差（各为 N×1），再做 z-score；它不使用保存的层级 μ/σ。`W_enc` 与 `W_dec` 独立，只有 2560 维 `b_dec`；本次 `normalize_sae=False`，CSV 保留 raw TopK activation。
- 排名是本次冻结推理及 `.7/.3` 启发式的候选排序。GFP 发色团 S65/Y66/G67 的实测 rank 为 225/223/211，score 为 -0.387662/-0.357207/-0.300504。

## 评分复核

- `conditional_preference` 正值 28 个、负值 210 个。裁剪 `max(m,0)` 后中位数=0、MAD=0，代码走标准差回退，scale=0.2061997034。
- `contextual_novelty` 使用 MAD scale=0.0270947251。重算 constraint 分量的最大绝对误差为 4.44e-16；重算总分误差为 1.78e-15。
- 因此，210 个负 margin 位置的 constraint z 都是 0；这些位置的分位次主要由 novelty 分量区分。

## Top 10（精确来源：candidate_sites_all.csv）

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

## 1EMA 编号审计

1EMA mmCIF 的 `pdbx_poly_seq_scheme` 只有 236 个 polymer records。其条目文字说明 65、66、67 三个残基在结构中由一个 `CRO 66` 取代。审计将 `CRO` 展开为 `TYG`、将 `MSE` 按一字母 `M` 对齐；得到与输入 GFP 同为 238 aa，差异仅为 S65T 和 Q80R。

| 输入位点 | polymer label_seq_id | author residue | PDB component | 归档 RCSB feature context | coordinates |
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

输入 1–64 使用 label=input。输入 65–67 全部映射到 `CRO` label 65 / author 66。输入 68–238 使用 label=input−2，author/PDB 序号=input。归档 RCSB feature 的区间以 polymer label 表示。直接把 label_seq_id 当作输入 FASTA 坐标会把发色团三残基压成一条记录，并使其后坐标偏移两位。

## 兼容性与科学边界

- 本次固定旧 checkpoint `biohub/esmc-6b-2024-12@ffd268e4…`。审计当时，Biohub 的模型卡将该 checkpoint 列为 GitHub-package-format 的向后兼容版本，并推荐 `biohub/ESMC-6B` 的 HF-compatible weights。
- runner 的 legacy key adapter 覆盖七类旧 LayerNorm/MLP suffix。已安装 loader 在 missing、unexpected 或 dropped checkpoint entries 存在时抛出错误；完成状态支持该加载路径通过。run metadata 没有独立的 tensor-count 报告，也没有与官方基线的数值 parity 实验。
- 本机 ESM 包报告 Transformer Engine、xformers、flash-attn 与 flash-attn RoPE 缺失，运行记录为 SDPA/pure-PyTorch fallback。最终 H 为 final LayerNorm state；SAE layer 60 位于中间 residual stream。当前工件支持本实现下的 GFP 控制观察；跨实现等价性仍待基线校准。
- 缓存 checkpoint config 的 `mask_token_id=31` 是与官方 active tokenizer 不一致的遗留序列化字段，并未控制本次 masked input。跨实现的数值/MLM parity 仍待用匹配基线校准；该待办不表示本次掩码 token 错误。
- SAE 原始 activation 用于 feature 查表，跨 feature ID 的数值未提供校准置信度。发色团低 rank 也需要保留为该控制的观察，不能外推为生物重要性判断。

## 文件与来源

- 数据总表：[evidence.json](../presentation/data/evidence.json)
- 图表数据：[normalized_slide_data.json](../presentation/data/normalized_slide_data.json)
- RCSB mmCIF：[1EMA.cif](../audit/data/1EMA.cif)，SHA256 `b7d583424b6f960a7421fd4c88cdb6bbb10025667cd863d8cd14f70bc775aceb`
- RCSB chain API 归档响应：[1EMA.A.current-api.json](../audit/data/1EMA.A.current-api.json)，SHA256 `a4bc2ef24504ac3f82c61fc0607a25922760c28dbe452768a7fb7e671f6f5837`
- 运行元数据：[run_metadata.json](../examples/gfp/run_metadata.json)

这些文件原存于 `E:\ESMC\ppt_handoff_20260906` 与 `E:\ESMC\runs\run_20260905T135554Z_smoke_gfp`；以上链接指向仓库副本。
