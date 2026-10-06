# ESMC 6B 与 SAE：本地复现及 GFP 位点分析
## I. 项目与讲述目标
主题聚焦已经完成的本地运行，面向懂基本蛋白序列、希望理解模型计算和结果的研究生或技术同事。中文，约45–60分钟，34页。讲述主线为同一条238 aa GFP从FASTA到token、上下文化向量、遮挡扫描、双信号排名、layer60 SAE、外部证据。不得引入未执行的训练/功能实验或把参考deck中的benchmark当成本次结果。

## II. 画布与输出
1280×720，16:9。34页原生可编辑PPTX，每页内嵌中文Notes，独立notes/total.md。source、design_spec、spec_lock、SOURCE_LEDGER、质量报告随源包交付。主要表格与图表原生可编辑，公式可为清晰等比渲染图。所有数据和结论可以追溯。

## III. 视觉方向
采用参考ESMC技术教学样式：#F7FAFC背景、#FFFFFF面板、#1456A0主计算、#F28E2B训练参数/强调、#2E7D32输出/结构对应、#C62828限制、#0B1F33正文、#50657A次级文字、#D6E2EE边线、#EAF2FB/#FFF4E6/#EAF6EF/#FDEBEC浅填充。保留参考的技术流程、矩阵、数值例子、细分隔线。图形服务于运算和证据，省略装饰图片及logo。

## IV. 字体
Microsoft YaHei中文及英文字体，Consolas仅用于代码与shape。标题34px、正文18–20px，说明15–16px，来源11px，封面54–58px，数字46px。空间不足优先简化措辞或重排。任何正文不得小于15px。标题最多两行，尽量一行。

## V. 几何
边距48px。标题x48 y34，主标题高60–80，副标题22px在y110附近。细分隔线y155。内容y178–642。来源y657–675，章节与页码y689。默认主视觉约65%画面，右侧或下方3–4条解释，避免所有页面同款三卡网格。表格行高至少36px，数据行读数18px。

## VI. 语义与定义
a_i=FASTA第i个氨基酸，L=残基数238，T=含特殊token的token数（由实际tokenizer确认），B=批大小1，d=隐藏宽度2560。t_i=残基i对应的模型token位置。h_i为上下文向量，H为残基矩阵。m_i为条件偏好，n_i为局部新颖度，s_i为综合分数。F或f表示SAE特征ID，K=码本16384，k=每位置保留64。Attention权重用A，Value矩阵用V，loss用mathcal L，避免同符号重复含义。
所有玩具数值例子明确标识；每个新符号解释shape及意义。预训练/SAE训练原理与本次冻结推理范围明确标注。

## VII. 图表选择
P20原生折线图展示全部238位置的综合分数，P21原生表格列出top10精确数值，P22原生条形图对比M1与内部top候选，P23原生排名比较图，P25原生稀疏矩阵示意及实际计数，P26/P27/P28/P29/P30/P31为原生表格或位置示意。数据只能从CSV/JSON计算，图下给文件名/来源ID。不可把rank当概率，不可把raw SAE activation跨feature直接解释为可比置信度。

## VIII. 图像/公式策略
原理图以原生可编辑shape/connector/text实现，并导出SVG源或等效逐页SVG以供交接。复杂数学用公式资产，短变量/数值可编辑。至少用相同玩具例子贯穿softmax和Value聚合：scores=[ln1,ln2,ln3]得到A=[1/6,2/6,3/6]；V=[[1,0],[0,2],[2,2]]；输出=[7/6,5/3]。标注为玩具3-token单头例子。不得拿来自不同来源的数据拼假实证图。

## IX. 34页冻结蓝图
每页至少3条独立信息。Notes应补充计算/形状/参数和梯度，不能照读。

|页|结论式标题|主视觉与三至六条内容|来源与Notes重点|
|---|---|---|---|
|01|一条 GFP 序列完成了 ESMC 6B 与 SAE 分析|封面+紧凑序列流程。238 aa真实GFP；本地16GB GPU完成扫描；交付残基向量、候选排名、SAE特征解释。副题“本地复现、计算原理与结果复核”。|run metadata。区分技术执行和待补的科学校准。|
|02|本次复现回答了计算流程与解释边界|上方3个事实数字238×2560、238次遮挡、15,232条激活，下方结论。流程完成；部分特征对应通用结构语义；已知发色团排名靠后。|实际产物与独立GFP来源。不要宣布功能识别成功。|
|03|同一残基贯穿五段计算与验证|横向5步及页码：输入P04–07、模型P08–13、运行及评分P14–23、SAE P24–29、证据与交付P30–34。各步标产物/问题。|技术路线。|
|04|测试序列与审阅版 GFP 完全一致|238-residue sequence strip，放大61–70 VTTFSYGVQC，突出65/66/67。UniProt P42212，238 aa，MD5一致。发色团SYG已知，结构参考1EMA为变体。|UniProt+RCSB。说明1EMA突变/编号不可直接等同。|
|05|每个运行文件承担一个可核查任务|文件-对象-用途原生表格：FASTA输入、NPZ矩阵、all CSV评分、SAE activation、feature summary、metadata/report。3项检查：行数=238、编号回序列、版本可追溯。|输出文件。解释完整结果保留全部位置。|
|06|特殊 token 掩码固定了残基编号|两行序列及映射：BOS/M/S/K/.../EOS，下面special_tokens_mask。L=238、T由tokenizer核实。t_i从mask选出，逐残基验证字符，记录1-based FASTA编号。|runner token_mapping。示例ID只使用实际tokenizer输出。|
|07|每个残基获得一个 2560 维上下文向量|lookup与H矩阵（238行×2560列），区分ID/embedding/hidden state。H来自返回state80，NPZ保存FP16，protein mean向量2560且FP32；模型推理BF16。|runner export_embeddings和NPZ。数学mean列维说明，保存精度与计算精度分别定义。|
|08|80 层模型反复更新同一序列表示|从embedding到80 block到输出head图。架构准确数字由缓存config/代码核实：宽2560、头40、每头64、FFN等核实值。层前后T×2560；最终导出排除特殊token。|缓存config和installed esm。别复制参考deck未经核查数字。|
|09|Q、K、V 分别学习匹配与内容变换|一输入三支Q=XW_Q、K=XW_K、V=XW_V。单头X T×2560、W 2560×64、结果T×64。实际多头并行，参数来自预训练；本次冻结。|本地attention代码。Notes解释矩阵乘内维和梯度至W。|
|10|Softmax 将一行匹配分数归一化|大公式A=softmax(S)，S来自经Q/K归一化与RoPE后的点积/√64。玩具scores=ln[1,2,3]，exp=[1,2,3]，A=[1/6,2/6,3/6]，行和1。三行小矩阵解释query行/key列。|基础算术+本地attention代码。标玩具、不展示真实GFP attention。|
|11|注意力权重决定 Value 的加权组合|延续同一玩具A和V数据，计算[7/6,5/3]。每个v_j二维，输出仍二维。真实单头64，多头拼成2560后W_O。|基础算术。说明权重数据流、梯度经过V及A；生物解释需外证。|
|12|残差和门控 FFN 维持深层计算接口|实际pre-norm block schematic：LN-attention-缩放残差，LN-SwiGLU-缩放残差。宽度与scale核实后填；输入输出T×2560。非线性组合特征，identity梯度通路。|本地block/FFN代码。变量与梯度Notes。|
|13|掩码预测通过交叉熵学习上下文|原序列/遮挡输入/真实标签/预测/损失及梯度图。toy true probability .7 -> -ln.7=.357；.1 ->2.303。dL/dlogit=p-y，参数更新theta-eta grad。官方预训练原理；本次inference_mode仅前向。|官方模型资料+代码。明确未本地训练/微调。|
|14|旧权重与当前接口通过键名适配加载|左官方旧ID/新推荐ID，右本次键名映射示例两项。要求保留旧6B；记录resolved revision；adapter对应key/shape仅覆盖加载检查，数值等价基线仍待校准。|runner+官方旧模型卡。任何808/无缺失断言要audit确认。|
|15|分阶段加载让本次计算容纳于 16GB GPU|时间线：6B前向+238遮挡，释放，fresh6B+SAE，释放。GPU RTX5080 Laptop、BF16、batch1、auto实际全GPU。显存使用数据称“采样点”，不可写peak。|metadata。记录python3.12 torch2.11 cu128，复用隔离环境。|
|16|每次遮挡只改变一个残基位置|G24所在序列窗口与mask，循环i=1..238，输出20-aa logits和分布。只在20标准aa重新softmax；m_i差值与entropy作用。|runner masked_residue_scan。T恒定，无causal mask。|
|17|G24 的条件偏好为 0.78125|真实表格logp(G24)=-1.72166967，alternative查CSV，m差0.78125。公式m_i=logp(a_i)-max_b≠a_i logp(b)。如果禁用≠符号，以b属于替代集合表达。正值原残基优于全部替代，负值存在更偏好替代；单位natural-log margin。|CSV。Notes区分概率与margin，不能说突变效应。|
|18|局部新颖度比较残基与两侧邻居|±5窗口排除自身，h_i和邻域均值二维投影示意标示意。n_i=1-cos(h_i,mean neighbors)，G24=.1674523；cos=1 ->0，正交cos0->1。边界截断。|runner/CSV。用示意向量避免伪装真实高维投影。|
|19|综合评分保留两个分量与标准化规则|公式s=.7 z(max(m,0))+.3 z(n)。z=(u-median)/scale，scale=1.4826MAD，MAD退化回退std。实际正m数量与哪支回退由audit给。权重是初始启发设置，排名仅本蛋白。|runner robust_z及CSV。关键解释若多数m<=0裁剪压平。|
|20|全长曲线显示候选信号集中位置|原生line 238个残基综合分数，完整纵轴保留M1，标65–67区域及图下注释。图右说明两个分量/端点效应/单蛋白。可加小下图novelty需可读。|candidate_sites_all。所有轴数据真实。|
|21|前十名由 M1 和多个内部残基组成|原生表格10行，rank/site/margin/novelty/score，3位小数。右/底短解释M1最高10.985；G24内部最高3.423；排名对应238位置筛查。|top CSV。全部10行不能省。|
|22|M1 的高分提示端点信号需要单独检查|原生horizontal bar M1 G24 K26 G20 G40，scores原值。M1起始甲硫氨酸；距均值信号强；去除端点/换窗口仅列未来敏感性分析，保持原始排名。|CSV+序列。禁止声称已运行ablation。|
|23|已知发色团残基位于排名后段|原生比较图G24 rank2 vs S65 225 Y66 223 G67 211，rank轴越小越靠前明确。三SYG本次score负；UniProt/RCSB确认发色团；单个控制检验限制功能判断。|CSV+GFP独立来源。低分不推断无功能。|
|24|SAE 将第60层向量编码为稀疏特征|流程h60→逐向量标准化→减b_dec→线性/ReLU→TopK→z→decoder。每个输入向量即时沿2560通道计算mean/std。W_enc为2560×16384，W_dec为16384×2560，b_dec长度2560，无b_enc。K16384，k64，在feature末维取TopK。该次仅用官方SAE推理，训练原理说明重建梯度到encoder/decoder，ESMC冻结。|SAE官方代码。本次没有训练SAE；特征级IDF/max输出归一化为另一个可选步骤，本次关闭。|
|25|每个残基保留 64 个非零 SAE 激活|native sparse matrix demo 6×12标玩具，旁真实238×64=15232，1134不同feature（audit核实），codebook16384。零值未写长表。|SAE CSV+metadata。k是每位置稀疏度，独立feature计数另义。|
|26|特征编号把激活表连接到官方描述|原生join示意 (position,feature_id,activation) + (feature_id,description) ->解释表。1134描述覆盖由audit确认；agent-generated来源；activation原始量不当置信度。|官方dataset+CSV。说明未做IDF/max normalization。|
|27|M1 的两个 SAE 特征对应序列起点|原生表格F8545=9.5625活跃5位置，F11504=3.4375活跃1位置。描述paraphrase中文；sequence M1为起始Met事实；端点信号与高排名对应，外部功能证据单列。|CSV和官方description。值跨feature不可直接比置信度。|
|28|G24 的稀疏特征符合转角候选语义|窗口标G24；table F13094=4.6875 n9、F9528=4.53125 n13；两者β连接/紧turn描述；RCSB正确编号的loop位置23–24支持结构上下文。|PDB API/mmCIF映射必须审核。描述关联没有GFP特异因果结论。|
|29|G40 与 K45 的特征指向 β 结构上下文|两个独立横排：G40 F6141=5.15625 sheet edge、K45 F3904=3.234375 sheet，确认active/local numbers；结构数据分别G40 loop before41–48，K45 sheet。|SAE CSV+正确PDB映射。全部标结构相容。|
|30|PDB 位点解释依赖正确的残基编号|native mapping table FASTA / label_seq_id / author /结构context。1EMA label65、author66的CRO代表65–67；G91对应label89、author91，在87–91 loop；D173对应label171、G174对应label172，两者在171–175 loop；L195对应label193，在188–198未分配段。原始sheet区间90–98 labels对应author92–100。|1EMA mmCIF poly_seq_scheme及struct_sheet_range，RCSB API。演讲文字说明坐标规则，不放制作过程评论。|
|31|多个高激活描述缺少 GFP 特异证据|原生table：L195 helical/disorder描述与结构context审核，S65泛serine F627，Y66泛Tyr F6579，G67泛Gly F9237。真实发色团也可只显identity标签；通用description需结合生物学；不把disorder/metal等泛描述认作实证。|CSV+GFP来源。避免多数激活全部identity之类错误措辞。|
|32|当前证据支持流程完成与结构假设|分层证据矩阵：直接观测(行数/数组/分数/激活)；外部确认(序列身份/发色团/审核结构)；待校准(旧loader数值等价/SAE配套/窗口权重/多蛋白/DMS)。若实质问题发现写清，不能写科学验证完成。|独立audit+现有数据。没有新推理或实验。|
|33|固定版本和产物支持再次核查|复现manifest表model+revision8 chars、SAE+revision8、Python/Torch、BF16/batch1/window5/.7/.3；完整路径与命令进Notes/README。native file flow读FASTA→runner→新timestamp目录。|metadata+runner。torch/ESM版本需历史措辞“本次运行”。|
|34|下一轮验证围绕数值校准与功能参照|收束pipeline和3结论：单卡完成全链；SAE提供可检验描述；GFP发色团低排名限定结果用途。下一步官方匹配推理校准、编号映射、多个已知蛋白/功能数据。下方5个来源短名/URL在Notes。|本次结果+官方repo/model/dataset+UniProt/RCSB。|

## X. Notes
每页中文约220–380字，核心数学320–500字。每页开场承接上页对象，讲运算意义/形状/例子/边界/交接。核心公式定义所有符号，说明参数从预训练或SAE训练何处来、梯度流往何处；本次都在冻结推理。每页引用来源的绝对文件或正式URL。参考Notes只学叙述密度，不照抄过时事实。
禁止观众文案及Notes出现：不是、并非、不等于、≠、并不。短语改成正面事实。避免把生产制作评论写进讲稿。

## XI. 执行与QA
用户授权root主规划设计，GPT-5.6 Terra max承担重复实现/notes/data extraction。此授权覆盖包内手工SVG/禁止委派的默认过程，保留其视觉与内容目标。ppt-master未安装，采用现有Presentations artifact-tool。保留SVG源/或可重建源，输出原生editable PPTX，数据图原生图表、公式混合资产。先做3页样张（06/10/23）供root设计检查，再完整导出、全页render、检查text fit/overlap/notes/native图表。finalizer使用bundled runtime，禁止桌面LibreOffice。质量报告如实记录替代流程及未执行应用级测试。所需文件都放E:/ESMC/ppt_handoff_20260906，输出成品分离。
