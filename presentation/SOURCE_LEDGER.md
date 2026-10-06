# SOURCE_LEDGER — ESMC 6B 与 SAE：GFP 位点分析

检索日期：2026-09-06。`S01`–`S06`、`S14`–`S16` 是本地可复核工件；外部模型、数据集和生物学事实优先回到 Biohub、Hugging Face、UniProt 与 RCSB 的正式入口。本台账不将参考 deck 的历史参数或 benchmark 作为本次运行结果。

## A. 源材料清单

| Source ID | 文件 / URL | 类型 | 日期 / 版本 | 用途 | 可信等级 | 已读状态 |
|---|---|---|---|---|---|---|
| S01 | `E:\ESMC\runs\run_20260905T135554Z_smoke_gfp\run_metadata.json` | 本次运行元数据 | 2026-09-05，completed | 模型 revision、硬件、dtype、token 长度、SAE、参数 | 高 | 已读 |
| S02 | `E:\ESMC\runs\run_20260905T135554Z_smoke_gfp\input_sequence.fasta`；`residue_embeddings.npz` | 输入与数组 | 2026-09-05 | GFP 序列、H、protein mean、位置和 token 索引 | 高 | 已读 |
| S03 | `E:\ESMC\runs\run_20260905T135554Z_smoke_gfp\candidate_sites_all.csv`；`top_candidate_sites.csv` | 本次评分数据 | 2026-09-05 | 238 位的 margin、novelty、score、rank 与图表 | 高 | 已读 |
| S04 | `E:\ESMC\runs\run_20260905T135554Z_smoke_gfp\sae_residue_activations.csv`；`sae_feature_summary.csv` | 本次 SAE 数据 | 2026-09-05 | 稀疏激活、feature ID、描述、代表性条目 | 高 | 已读 |
| S05 | `E:\ESMC\esmc_feature_site_pipeline\run_esmc_site_pipeline.py` | 本地实现 | SHA256 `ef10ff3ea08b1e4bfe9776ca05d9410b7fbeb106cb1ecfbfb08e72e7d95c54ff` | token 映射、遮挡、评分、SAE 导出、分阶段加载 | 高 | 已读 |
| S06 | `E:\ESMC\ppt_handoff_20260906\evidence.json`，`architecture`、`tokenization`、`scoring` 节 | 独立审计结构化数据 | 2026-09-06 | config 解析、shape、评分重算、token 事实 | 高 | 已读 |
| S07 | [Biohub/esm 官方仓库](https://github.com/Biohub/esm) | 官方代码与说明 | 检索于 2026-09-06 | 当前本地运行入口、ESMC 与 SAE 用法 | 高 | 已读 |
| S08 | [旧 checkpoint 卡：biohub/esmc-6b-2024-12](https://huggingface.co/biohub/esmc-6b-2024-12) | 官方模型卡 | revision `ffd268e4c72c4c9757066cd74e9a793bf7b24771` | 本次旧权重身份与兼容性背景 | 高 | 已读 |
| S09 | [当前 HF 权重：biohub/ESMC-6B](https://huggingface.co/biohub/ESMC-6B) | 官方模型卡 | 检索于 2026-09-06 | 官方当前 HF-compatible 入口、6B/80 层背景 | 高 | 已读 |
| S10 | [ESMC-6B SAE layer60 k64 codebook16384](https://huggingface.co/biohub/ESMC-6B-sae-layer60-k64-codebook16384) | 官方 SAE 模型卡 | revision `99752fe6e4d25fbb26f887db2d9225e7a577da73` | layer60、TopK、codebook、标准化与输出语义 | 高 | 已读 |
| S11 | [biohub/ESMC-SAE-Features](https://huggingface.co/datasets/biohub/ESMC-SAE-Features) | 官方 feature 数据集 | `uniref90_feature_table.parquet` | feature ID 到 agent-generated description 的连接 | 高 | 已读 |
| S12 | [UniProt P42212 / GFP_AEQVI](https://www.uniprot.org/uniprotkb/P42212) | 审阅蛋白记录 | 检索于 2026-09-06 | 238 aa、MD5、GFP 身份与生物学参照 | 高 | 已读 |
| S13 | [RCSB PDB 1EMA](https://www.rcsb.org/structure/1EMA) | 实验结构记录 | 检索于 2026-09-06 | 1EMA 构建体、CRO、S65T、结构与发色团背景 | 高 | 已读 |
| S14 | `E:\ESMC\ppt_handoff_20260906\sources\audit\1EMA.cif`；`1EMA.A.current-api.json` | RCSB 原始 mmCIF / 当前 API 摘要 | SHA256 `b7d583…775aceb` / `a4bc2e…6f5837` | label/auth 编号、CRO 聚合、二级结构区间 | 高 | 已读 |
| S15 | `E:\ESMC\ppt_handoff_20260906\EVIDENCE_AUDIT.md` | 独立证据审计 | 2026-09-06 | 1EMA 对齐、旧报告纠正、结果边界 | 高 | 已读 |
| S16 | `E:\ESMC\ppt_handoff_20260906\evidence.json`，`compatibility_observations`、`compatibility_and_scientific_boundaries`、`mask_id_audit` | 独立证据审计 | 2026-09-06 | loader、kernel、遗留 config 字段、跨实现数值基线 | 高 | 已读 |
| S17 | `E:\ESMC\ppt_handoff_20260906\design_spec.md`；`spec_lock.md` | 冻结设计要求 | 2026-09-06 | 页级范围、语言限制、可解释性边界 | 需求来源 | 已读 |
| S18 | `E:\ESMC\esmc_feature_site_pipeline\.venv312\Lib\site-packages\esm\models\esmc\sae.py`；`model.py` | 已安装 ESM 实现 | esm 3.4.1 | SAE 逐表示标准化、W_enc/W_dec/b_dec、`normalize_sae` 默认值 | 高 | 已读 |
| S19 | [官方 ESMC tokenizer](https://raw.githubusercontent.com/Biohub/esm/bf343ba264b650dff7a073643725f9aaa1fdbe8d/esm/models/esmc/tokenizer.py) | 官方源码 | 与本机 esm 3.4.1 对应 commit | 全部 ESMC checkpoints 的 `|`=31、`<mask>`=32 | 高 | 已读 |

## B. 关键主张与数字

| Claim ID | 主张或数字 | 页面 | Source ID | 原文位置 / 图号 / 文件行 | 事实类型 | 讲解写法 | 核验状态 |
|---|---|---:|---|---|---|---|---|
| C01 | 本次运行处理 238 aa GFP，输出 H、候选排名和 SAE 激活 | P01–P03 | S01–S04 | metadata `protein_length`；各输出文件 | 运行事实 | “该运行已经产生可复查工件” | 已核验 |
| C02 | FASTA 与 P42212 长度及 MD5 一致 | P04 | S02、S12 | FASTA；UniProt sequence/MD5 | 序列事实 | “输入与审阅记录一致” | 已核验 |
| C03 | 1EMA 与输入 GFP 有 S65T、Q80R 构建差异 | P04、P30 | S13–S15 | mmCIF 对齐；审计表 | 结构参照事实 | “1EMA 提供相近构建体的结构参照” | 已核验 |
| C04 | 输出文件包含 NPZ、全长评分、top10、SAE 激活与特征摘要 | P05 | S01–S05 | `verify_outputs`；运行目录 | 工程事实 | “每个文件覆盖一个核查任务” | 已核验 |
| C05 | T=240、残基 token 有 238 个；MSK 的实际 IDs 为 0/20/8/15/2 | P06 | S01、S05、S06 | `token_mapping`；审计 `actual_example` | tokenizer 事实 | “索引从 special-token mask 生成” | 已核验 |
| C06 | H=238×2560、FP16；protein mean=2560、FP32；state 80/final norm | P07 | S01、S02、S05、S06 | NPZ；`export_embeddings` | 数组事实 | “保存精度和计算精度分开说明” | 已核验 |
| C07 | ESMC 6B 解析配置：80 层、d=2560、40 头、d_h=64、FFN=6912、Pre-LN/QK LN/RoPE | P08–P12 | S05、S06、S07、S09 | 审计 `architecture.resolved` | 架构事实 | “本地解析到的配置为……” | 已核验 |
| C08 | QKV、Softmax、Value、残差和交叉熵为预训练机制；本次只做冻结前向 | P09–P13 | S05、S07、S09、S17 | 官方代码说明；runner `inference_mode` | 方法事实 | “梯度说明属于预训练理论” | 已核验 |
| C09 | 旧 checkpoint revision 为 ffd268e4；7 类 key remap；数值 parity 待校准 | P14、P32 | S01、S05、S08、S09、S16 | adapter；审计 compatibility | 兼容性事实 / 限制 | “加载路径已通过，输出等价待基线” | 已核验 |
| C10 | config 的 mask_token_id=31 是遗留序列化字段；官方 tokenizer 实际以 mask=32、chain_break=31 生成本次遮挡 | P14 | S05、S06、S16、S19 | 审计 `mask_id_audit`；tokenizer 词表 | tokenizer / 版本事实 | “运行有效 mask 为 32” | 已核验 |
| C11 | RTX 5080 Laptop、BF16、batch1、device_map auto、SDPA；显存值是采样点 | P15、P33 | S01 | metadata GPU snapshots | 运行事实 | “描述本次运行配置与采样” | 已核验 |
| C12 | 每次遮挡仅替换一个 t_i；在 20 个标准 aa 内重新 Softmax | P16、P17 | S03、S05 | `masked_residue_scan` | 方法事实 | “m 是同一上下文的 log-probability margin” | 已核验 |
| C13 | G24：logp(G)=-1.72166967、替代 K=-2.50291967、m=0.78125、n=0.1674523 | P17、P18 | S03 | position 24 | 本次结果 | “实测标量，不外推突变效应” | 已核验 |
| C14 | s=0.7 z(max(m,0))+0.3 z(n)；28 正 margin、210 负 margin；clipped 分量用 std 回退 | P19 | S03、S05、S06 | `robust_z`；审计 scoring | 方法 / 本次结果 | “排序是单蛋白启发式” | 已核验 |
| C15 | top10 为 M1、G24、K26、G20、G40、G91、K45、D173、L195、G174 | P20–P22 | S03、S06 | candidate CSV；审计 top10 | 本次结果 | “rank 是排序位置” | 已核验 |
| C16 | S65/Y66/G67 ranks 为 225/223/211，scores 为 -0.387662/-0.357207/-0.300504 | P23 | S03、S06、S12、S13 | candidate CSV；审计；UniProt/RCSB | 本次结果 / 外部参照 | “仅覆盖该实现、该输入、该规则” | 已核验 |
| C17 | SAE 对每条 2560 维输入即时 z-score，经独立 W_enc/W_dec、b_dec 和 TopK 得到 layer60、K=16384、k=64 的稀疏码；返回 N×16384，本次 N=240 后筛为 238×16384 并导出 raw activation | P15、P24 | S01、S05、S10、S18 | metadata；runner；已安装实现 | 官方方法 / 运行事实 | “训练梯度更新 SAE，运行冻结读取” | 已核验 |
| C18 | 15,232=238×64，1,134 unique active feature IDs；feature_id 是 codebook 索引，与 FASTA position 独立 | P25、P26 | S01、S04、S06、S10 | metadata；SAE CSV；审计；SAE card | 本次结果 | “raw activation 未做跨 ID 校准” | 已核验 |
| C19 | feature descriptions 为官方 dataset 的 agent-generated 文本；1,134 个活跃 ID 的文本覆盖含泛化或意义未知的条目 | P26–P31 | S04、S10、S11 | feature summary；官方 card/dataset | 来源事实 | “描述提供候选语义” | 已核验 |
| C20 | M1 代表性条目 F8545=9.5625、F11504=3.4375 | P27 | S04、S06、S11 | activation/summary；审计 selected features | 本次结果 | “代表性选择，逐 ID 阅读” | 已核验 |
| C21 | G24 的 F13094=4.6875、F9528=4.53125；G40 F6141=5.15625；K45 F3904=3.234375 | P28、P29 | S04、S06、S11 | activation/summary；审计 selected features | 本次结果 | “结构相容性需映射与外证” | 已核验 |
| C22 | 1EMA 的 CRO 将输入 65–67 共同映射 label65/auth66；68 后 label=input−2 | P30 | S13–S15 | mmCIF `pdbx_poly_seq_scheme`；审计 mapping | 结构编号事实 | “label 与 FASTA 位置分栏阅读” | 已核验 |
| C23 | G91→label89/auth91；D173→171/173；G174→172/174；L195→193/195 | P30、P31 | S14、S15 | 审计 mapping table | 结构编号事实 | “撤销 label 直读的旧结构断言” | 已核验 |
| C24 | 未分配二级结构仅描述当前 1EMA 参考模型的分类；动态无序需专门证据 | P31 | S14、S15 | current API feature context | 解释边界 | “分开陈述结构分类与动态性质” | 已核验 |
| C25 | 当前工件支持该实现、该输入下的观察性 GFP 对照；数值等价、跨实现 MLM 数值、kernel、功能参照待校准 | P32、P34 | S01、S03–S06、S12–S16 | 审计 compatibility boundaries | 结论边界 | “流程完成，独立校准待推进” | 已核验 |
| C26 | 复现 manifest：脚本 SHA、model/SAE revisions、Python/Torch、参数和输出路径 | P33 | S01、S05 | metadata；runner | 可复现性事实 | “本次运行历史记录” | 已核验 |

## C. 公式与变量

| Formula ID | 公式 | 页面 | Source ID | 变量定义来源 | 公式用途 | 数值例子 | 资产状态 |
|---|---|---:|---|---|---|---|---|
| F01 | `t_i =` special-mask 为 0 的第 i 个 token 位置 | P06 | S05、S06 | tokenizer / runner | 将 FASTA 编号映射到模型 token | MSK→[0,20,8,15,2] | 原生文本 |
| F02 | `H=[h_1;…;h_238]∈R^(238×2560)` | P07 | S02、S05、S06 | NPZ / `export_embeddings` | 导出最终上下文化残基表示 | h_24 为第 24 行 | 原生矩阵 |
| F03 | `Q=XW_Q, K=XW_K, V=XW_V` | P09 | S06、S07 | config / 官方代码 | 单头匹配与内容投影 | `T×2560 · 2560×64→T×64` | 公式资产 + shape 标签 |
| F04 | `A=softmax(S)` | P10 | S06、S07 | attention 配置 | 逐 Query 行归一化 | `[ln1,ln2,ln3]→[1/6,2/6,3/6]` | 公式资产 + 原生玩具矩阵 |
| F05 | `o_i=Σ_j A_ijv_j` | P11 | S06、S07 | attention 配置 | Value 加权汇聚 | `V=[[1,0],[0,2],[2,2]]→[7/6,5/3]` | 公式资产 + 原生玩具表 |
| F06 | `Y=X+Attn(LN(X))/s`；`X_next=Y+SwiGLU(LN(Y))/s` | P12 | S06 | 审计 architecture | 深层 block 的同形状接口 | `s=√(80/36)=1.490712` | 公式资产 + 原生流程 |
| F07 | `L_i=-log p_i(y_i)`；`∂L/∂z=p-y` | P13 | S07、S09 | 官方模型说明 | 解释预训练梯度来源 | 0.7→0.357；0.1→2.303 | 公式资产 |
| F08 | `m_i=logp(a_i)-max_{b∈A_i^alt}logp(b)` | P17 | S03、S05 | runner | 遮挡条件偏好 | G24=0.78125 | 公式资产 + 实测表 |
| F09 | `n_i=1-cos(h_i,mean(neighbors))` | P18 | S02、S03、S05 | runner | 局部上下文偏离 | cos 1→0；cos 0→1 | 原生示意 + 实测值 |
| F10 | `s_i=.7z(max(m_i,0))+.3z(n_i)` | P19 | S03、S05、S06 | runner / audit | 透明候选排序 | G24=3.4225727 | 公式资产 + 原生表 |
| F11 | `x_i=(h_i−μ_i)/(σ_i+ε)`；`f_i=TopK(ReLU((x_i−b_dec)W_enc))`，`f_i∈R^16384` | P24–P25 | S04、S05、S10、S18 | SAE card / runner / installed implementation | 逐表示标准化、稀疏读取与重建 | 238×64=15,232 | 原生流程 + 稀疏矩阵 |

## D. 图表与数据资产

| Asset ID | 文件名 / 数据 | 页面 | 类型 | Source ID | 图号 / 数据筛选 | 标题/图注 | 使用备注 |
|---|---|---:|---|---|---|---|---|
| A01 | `input_sequence.fasta` | P04、P06 | 原生序列条 | S02 | 1–238；突出 61–70 | 审阅 GFP 输入 | 保持 FASTA 1-based |
| A02 | `residue_embeddings.npz` | P07 | 原生矩阵 | S02 | `H` 与 `protein_embedding` | 残基上下文化向量 | 标注 FP16 / FP32 |
| A03 | `candidate_sites_all.csv` | P20 | 原生折线图 | S03 | 全部 238 行 | 全长综合评分 | 保留 M1 与 65–67 |
| A04 | `top_candidate_sites.csv` | P21 | 原生表格 | S03 | 完整 top10 | 前十名候选 | 精确值可回查 |
| A05 | `candidate_sites_all.csv` | P22 | 原生横条图 | S03 | M1、G24、K26、G20、G40 | M1 与内部候选 | 显示原始 s |
| A06 | `candidate_sites_all.csv` + P42212 | P23 | 原生排名比较 | S03、S12 | G24 与 S65/Y66/G67 | 已知发色团的当前排名 | rank 轴方向明确 |
| A07 | `sae_residue_activations.csv` | P25 | 原生稀疏矩阵 / 计数 | S04 | 238×64 | 每残基 k=64 | 玩具矩阵与实测计数分开 |
| A08 | `sae_feature_summary.csv` | P26–P31 | 原生表格 | S04、S11 | 代表性 feature IDs | 特征编号与描述 | 描述标记 agent-generated |
| A09 | `1EMA.cif` + current API | P28–P31 | 原生位置映射表 | S14、S15 | 选中候选与 SYG | 1EMA 编号 / 结构 context | 不直读 label 为 FASTA |
| A10 | `run_metadata.json` | P33 | 原生 manifest 表 | S01 | revision、运行参数 | 固定版本与产物 | 把采样显存标为采样点 |

## E. 开放问题与不可确认项

| Issue ID | 问题 | 影响页面 | 当前处理 | 需要谁确认 |
|---|---|---|---|---|
| Q01 | legacy adapter 与旧 GitHub 实现、当前 HF 权重之间缺少数值 parity 基线 | P14、P32、P34 | 仅描述 key/shape 加载路径通过 | 官方匹配推理或复现基线 |
| Q02 | 跨实现的 MLM 输出缺少官方数值基线 | P14、P32 | 将其与运行实际 mask=32 的 tokenizer 事实分开记录 | 官方匹配推理或复现基线 |
| Q03 | SDPA / pure-PyTorch fallback 与其他 kernel 的数值差异 | P14、P32、P34 | 不把 kernel 与 SYG 排名建立因果归因 | 匹配 kernel 基线 |
| Q04 | 1EMA 是 S65T、Q80R 结构构建体，CRO 合并三个发色团位置 | P04、P23、P28–P31 | 使用审计映射和结构 context，避免直接序列等同 | 结构生物学复核 |
| Q05 | 0.7/0.3 与 ±5 窗口仅在一条 GFP 上运行 | P19–P23、P32、P34 | 作为初始启发设置保留 | 多蛋白敏感性分析 |
| Q06 | raw SAE activation 跨 feature ID 缺少校准比较 | P25–P31 | 按 ID 查表，代表性 feature 单独审阅 | 官方 normalization / 方法测试 |
| Q07 | feature description 与 GFP 特异功能之间缺少独立验证 | P26–P34 | 表述为候选语义或结构假设 | UniProt、结构、MSA、DMS、实验参照 |

## F. Notes 引用规则

每页 Notes 末尾使用 S-ID；本台账将其解析到绝对文件或正式 URL。数据图采用 S03/S04 的原始 CSV 重绘；任何新增数值、公式或外部图必须先补充本台账与相应页面 Notes。
