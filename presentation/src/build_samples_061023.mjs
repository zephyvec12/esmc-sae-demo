import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const WORKSPACE = "E:\\ESMC\\ppt_handoff_20260906";
const BUILD_DIR = path.join(WORKSPACE, "build");
const RUN_DIR = path.join(WORKSPACE, "sources", "run_20260905T135554Z_smoke_gfp");
const DRAFT_PATH = path.join(BUILD_DIR, "samples_06_10_23_draft.pptx");
const PREVIEW_DIR = path.join(BUILD_DIR, "samples_06_10_23_previews");

const P = {
  bg: "#F7FAFC", surface: "#FFFFFF", primary: "#1456A0", accent: "#F28E2B",
  success: "#2E7D32", error: "#C62828", text: "#0B1F33", muted: "#50657A",
  border: "#D6E2EE", softBlue: "#EAF2FB", softOrange: "#FFF4E6",
  softGreen: "#EAF6EF", softRed: "#FDEBEC",
};
const FONT = { chinese: "Microsoft YaHei", latin: "Arial", mono: "Consolas" };
const CANVAS = { width: 1280, height: 720 };

function addText(slide, text, position, {
  fontSize = 19, color = P.text, typeface = FONT.chinese, bold = false,
  align = "left", valign = "top", autoFit = "shrinkText", insets = { top: 0, right: 0, bottom: 0, left: 0 },
} = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox", position, fill: "none", line: { fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    typeface, fontSize, color, bold, alignment: align, verticalAlignment: valign, autoFit, insets,
  };
  return shape;
}

function addPanel(slide, position, { fill = P.surface, line = P.border, radius = 12 } = {}) {
  return slide.shapes.add({
    geometry: "roundRect", position, fill,
    line: { style: "solid", fill: line, width: 1 }, borderRadius: radius,
  });
}

function addRule(slide, left, top, width, { color = P.border, weight = 1 } = {}) {
  return slide.shapes.add({
    geometry: "line", position: { left, top, width, height: 0 }, fill: "none",
    line: { style: "solid", fill: color, width: weight },
  });
}

function addArrow(slide, position, { fill = P.primary } = {}) {
  return slide.shapes.add({
    geometry: "rightArrow", position, fill, line: { fill, width: 0 },
  });
}

function addHeader(slide, { title, subtitle, section, page }) {
  slide.background.fill = P.bg;
  addText(slide, title, { left: 48, top: 32, width: 1120, height: 50 }, {
    fontSize: 34, bold: true, color: P.text,
  });
  addText(slide, subtitle, { left: 49, top: 100, width: 1115, height: 30 }, {
    fontSize: 17, color: P.muted,
  });
  addRule(slide, 48, 155, 1184, { color: P.primary, weight: 1.25 });
  addText(slide, section, { left: 48, top: 684, width: 500, height: 18 }, {
    fontSize: 11, color: P.muted, typeface: FONT.latin,
  });
  addText(slide, `${String(page).padStart(2, "0")} / 34`, { left: 1134, top: 684, width: 98, height: 18 }, {
    fontSize: 11, color: P.muted, typeface: FONT.latin, align: "right",
  });
}

function addSource(slide, text) {
  addText(slide, text, { left: 48, top: 658, width: 1080, height: 16 }, {
    fontSize: 11, color: P.muted, typeface: FONT.latin,
  });
}

function addTokenCell(slide, { left, top, width, token, index, mask, fill }) {
  addPanel(slide, { left, top, width, height: 66 }, { fill, line: P.border, radius: 8 });
  addText(slide, token, { left: left + 6, top: top + 10, width: width - 12, height: 24 }, {
    fontSize: token.startsWith("<") ? 15 : 24, bold: true,
    color: token.startsWith("<") ? P.error : P.primary,
    typeface: token.startsWith("<") ? FONT.latin : FONT.mono, align: "center",
  });
  addText(slide, `t=${index}`, { left: left + 4, top: top + 42, width: width - 8, height: 14 }, {
    fontSize: 11, color: P.muted, typeface: FONT.mono, align: "center",
  });
  addText(slide, String(mask), { left: left + 4, top: top + 98, width: width - 8, height: 17 }, {
    fontSize: 14, color: mask ? P.error : P.success, typeface: FONT.mono, bold: true, align: "center",
  });
}

function addFact(slide, { left, top, width, heading, body, accent }) {
  const box = addPanel(slide, { left, top, width, height: 97 }, { fill: P.surface, line: P.border, radius: 10 });
  slide.shapes.add({ geometry: "rect", position: { left, top, width: 7, height: 97 }, fill: accent, line: { fill: accent, width: 0 } });
  addText(slide, heading, { left: left + 21, top: top + 14, width: width - 32, height: 20 }, {
    fontSize: 15, bold: true, color: P.text,
  });
  addText(slide, body, { left: left + 21, top: top + 44, width: width - 32, height: 40 }, {
    fontSize: 14, color: P.muted, autoFit: "shrinkText",
  });
  return box;
}

function addMatrixCell(slide, { left, top, value, fill, color = P.text }) {
  addPanel(slide, { left, top, width: 64, height: 42 }, { fill, line: P.border, radius: 6 });
  addText(slide, value, { left, top: top + 10, width: 64, height: 22 }, {
    fontSize: 16, color, typeface: FONT.mono, bold: true, align: "center",
  });
}

function parseCsv(text) {
  const [headerLine, ...rows] = text.trim().split(/\r?\n/u);
  const headers = headerLine.split(",");
  return rows.map((row) => {
    const cells = row.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
}

async function readRankRows() {
  const csv = await fs.readFile(path.join(RUN_DIR, "candidate_sites_all.csv"), "utf8");
  const desired = new Set([24, 65, 66, 67]);
  const rows = parseCsv(csv)
    .filter((row) => desired.has(Number(row.position)))
    .sort((a, b) => Number(a.position) - Number(b.position));
  if (rows.length !== 4) throw new Error("Expected G24 and chromophore S65/Y66/G67 rows in candidate_sites_all.csv");
  return rows;
}

async function readDisplayedTokenData() {
  const fasta = await fs.readFile(path.join(RUN_DIR, "input_sequence.fasta"), "utf8");
  const sequence = fasta.split(/\r?\n/u).filter((line) => !line.startsWith(">")).join("").trim();
  if (sequence.length !== 238) throw new Error(`Expected 238 aa FASTA, received ${sequence.length}`);
  return {
    start: [...sequence.slice(0, 3)],
    end: [...sequence.slice(-3)],
  };
}

function buildSlide06(presentation, tokenData) {
  const slide = presentation.slides.add();
  addHeader(slide, {
    title: "特殊 token 掩码固定了残基编号",
    subtitle: "special_tokens_mask 将 238 个 FASTA 残基与模型 token 位置逐个对应",
    section: "输入与编号", page: 6,
  });

  addText(slide, "实际 tokenizer 输出", { left: 48, top: 180, width: 260, height: 24 }, {
    fontSize: 18, bold: true, color: P.primary,
  });
  const tokens = [
    ["<cls>", 0, 1, P.softRed], [tokenData.start[0], 1, 0, P.softBlue], [tokenData.start[1], 2, 0, P.softBlue],
    [tokenData.start[2], 3, 0, P.softBlue], ["…", "…", 0, P.softBlue], [tokenData.end[0], 236, 0, P.softBlue],
    [tokenData.end[1], 237, 0, P.softBlue], [tokenData.end[2], 238, 0, P.softBlue], ["<eos>", 239, 1, P.softRed],
  ];
  const widths = [124, 110, 110, 110, 74, 110, 110, 110, 124];
  let x = 52;
  tokens.forEach(([token, index, mask, fill], i) => {
    addTokenCell(slide, { left: x, top: 218, width: widths[i], token, index, mask, fill });
    x += widths[i] + 24;
  });
  addText(slide, "special_tokens_mask", { left: 52, top: 287, width: 220, height: 18 }, {
    fontSize: 13, color: P.muted, typeface: FONT.mono,
  });
  addArrow(slide, { left: 470, top: 350, width: 335, height: 26 }, { fill: P.primary });
  addText(slide, "mask=0 的位置进入残基映射", { left: 485, top: 379, width: 305, height: 20 }, {
    fontSize: 15, color: P.primary, bold: true, align: "center",
  });

  addPanel(slide, { left: 52, top: 414, width: 1176, height: 106 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "FASTA（1-based）", { left: 73, top: 435, width: 142, height: 20 }, {
    fontSize: 15, color: P.muted, bold: true,
  });
  const residues = [
    [`a₁ = ${tokenData.start[0]}`, "t₁ = 1"], [`a₂ = ${tokenData.start[1]}`, "t₂ = 2"], [`a₃ = ${tokenData.start[2]}`, "t₃ = 3"],
    ["…", "…"], [`a₂₃₆ = ${tokenData.end[0]}`, "t₂₃₆ = 236"], [`a₂₃₇ = ${tokenData.end[1]}`, "t₂₃₇ = 237"], [`a₂₃₈ = ${tokenData.end[2]}`, "t₂₃₈ = 238"],
  ];
  x = 232;
  residues.forEach(([residue, mapping], i) => {
    const w = i === 3 ? 58 : 126;
    addPanel(slide, { left: x, top: 430, width: w, height: 70 }, { fill: i === 3 ? P.softOrange : P.softGreen, line: P.border, radius: 8 });
    addText(slide, residue, { left: x + 6, top: 443, width: w - 12, height: 18 }, {
      fontSize: 15, color: P.text, typeface: FONT.mono, bold: true, align: "center",
    });
    addText(slide, mapping, { left: x + 4, top: 470, width: w - 8, height: 17 }, {
      fontSize: 13, color: P.success, typeface: FONT.mono, align: "center",
    });
    x += w + 10;
  });

  addFact(slide, {
    left: 52, top: 535, width: 372, heading: "序列长度与 token 长度", accent: P.primary,
    body: "L = 238。T = 240，其中 token 0 是 <cls>，token 239 是 <eos>。",
  });
  addFact(slide, {
    left: 452, top: 535, width: 372, heading: "映射规则", accent: P.success,
    body: "仅选 special_tokens_mask = 0 的位置。每个位置再与 FASTA 字符逐项核对。",
  });
  addFact(slide, {
    left: 852, top: 535, width: 376, heading: "编号用途", accent: P.accent,
    body: "后续 embedding、遮挡扫描、SAE 激活都沿用同一套 1-based FASTA 编号。",
  });
  addSource(slide, "来源：run_metadata.json；run_esmc_site_pipeline.py::token_mapping；本次 tokenizer 现场复核");
  slide.speakerNotes.textFrame.setText(
    "这一页先固定编号体系。实际 tokenizer 在 238 个氨基酸外加入 <cls> 和 <eos>，总长度 T 为 240。运行程序没有依赖固定偏移，而是读取 special_tokens_mask。掩码为零的位置构成 residue_token_indices，记录显示从 1 连续到 238。程序再把每个 token 反查为氨基酸字符，与 FASTA 的第 i 个字符逐项校验。这样 t_i 始终指向 a_i 的模型位置，后续的残基向量、单点遮挡分数和 SAE 激活才能回到同一个 1-based FASTA 编号。下一页沿这些位置导出每个残基的上下文化向量。",
  );
  return slide;
}

function buildSlide10(presentation) {
  const slide = presentation.slides.add();
  addHeader(slide, {
    title: "Softmax 将一行匹配分数归一化",
    subtitle: "玩具 3-token 单头例子沿用到下一页的 Value 加权组合",
    section: "注意力计算", page: 10,
  });
  addPanel(slide, { left: 48, top: 180, width: 1184, height: 64 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "Sᵢⱼ = qᵢ kⱼᵀ / √64", { left: 92, top: 194, width: 330, height: 32 }, {
    fontSize: 24, typeface: FONT.mono, bold: true, color: P.primary, align: "center",
  });
  addArrow(slide, { left: 447, top: 198, width: 106, height: 26 }, { fill: P.primary });
  addText(slide, "A = softmax(S)", { left: 586, top: 194, width: 300, height: 32 }, {
    fontSize: 25, typeface: FONT.mono, bold: true, color: P.success, align: "center",
  });
  addText(slide, "真实 ESMC 单头宽度为 64。q、k 先经过归一化与 RoPE。", { left: 904, top: 201, width: 280, height: 22 }, {
    fontSize: 14, color: P.muted, align: "right",
  });

  const columns = [
    { x: 48, title: "匹配分数", formula: "S = [ln 1, ln 2, ln 3]", fill: P.softBlue, color: P.primary },
    { x: 441, title: "逐项指数", formula: "exp(S) = [1, 2, 3]", fill: P.softOrange, color: P.accent },
    { x: 834, title: "行内归一化", formula: "A = [1/6, 2/6, 3/6]", fill: P.softGreen, color: P.success },
  ];
  columns.forEach((column, index) => {
    addPanel(slide, { left: column.x, top: 275, width: 350, height: 180 }, { fill: column.fill, line: P.border, radius: 12 });
    addText(slide, column.title, { left: column.x + 22, top: 295, width: 305, height: 24 }, {
      fontSize: 19, bold: true, color: column.color,
    });
    addText(slide, column.formula, { left: column.x + 22, top: 335, width: 305, height: 30 }, {
      fontSize: 21, typeface: FONT.mono, bold: true, color: P.text, align: "center",
    });
    const captions = [
      "第 i 个 Query 对三个 Key 的原始相对分数。",
      "指数把每个分数映射为正值。",
      "总和 1 + 2 + 3 = 6。该行权重和为 1。",
    ];
    addText(slide, captions[index], { left: column.x + 24, top: 390, width: 298, height: 42 }, {
      fontSize: 15, color: P.muted, align: "center",
    });
    if (index < 2) addArrow(slide, { left: column.x + 354, top: 348, width: 32, height: 24 }, { fill: P.primary });
  });

  addPanel(slide, { left: 48, top: 486, width: 510, height: 142 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "行与列的含义", { left: 72, top: 505, width: 180, height: 22 }, { fontSize: 18, bold: true, color: P.primary });
  addText(slide, "行 i：当前 Query。列 j：被匹配的 Key。单元 Aᵢⱼ：Query i 从 Key j 取得内容时使用的权重。", { left: 72, top: 542, width: 452, height: 58 }, {
    fontSize: 15, color: P.muted,
  });
  addPanel(slide, { left: 584, top: 486, width: 648, height: 142 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "3-token 注意力矩阵的一行（1×3）", { left: 608, top: 505, width: 330, height: 22 }, { fontSize: 18, bold: true, color: P.success });
  ["Key 1", "Key 2", "Key 3"].forEach((label, index) => addText(slide, label, { left: 848 + index * 80, top: 534, width: 64, height: 16 }, { fontSize: 12, color: P.muted, typeface: FONT.latin, align: "center" }));
  addText(slide, "Query i", { left: 608, top: 570, width: 80, height: 18 }, { fontSize: 13, color: P.muted, typeface: FONT.latin });
  [["1/6", P.softBlue], ["2/6", P.softOrange], ["3/6", P.softGreen]].forEach(([value, fill], index) => addMatrixCell(slide, { left: 848 + index * 80, top: 562, value, fill }));
  addText(slide, "玩具数值例子", { left: 1018, top: 607, width: 170, height: 14 }, { fontSize: 11, color: P.muted, align: "right" });
  addSource(slide, "来源：基础算术；本地 ESMC attention 实现。真实 GFP attention 数值未在此页展示。");
  slide.speakerNotes.textFrame.setText(
    "上一页给出了 Q、K、V 的投影形状。本页把一个 Query 的匹配分数变成一行可用于加权的概率分布。真实实现里每个 head 的 q 和 k 经过归一化与 RoPE，再以 64 维点积除以根号 64 得到分数 S。这里使用玩具分数 ln 1、ln 2、ln 3，所以指数正好得到 1、2、3，归一化后为 1/6、2/6、3/6。第 i 行对应当前 Query，第 j 列对应一个 Key，A_ij 表示该 Query 从该位置接收 Value 内容时的权重。Softmax 是预训练模型中的可微运算，理论上的梯度会经 A 回到 S、Q 和 K。本次 GFP 运行保持冻结前向推理。下一页用同一行权重计算 Value 的加权和。",
  );
  return slide;
}

async function buildSlide23(presentation, rankRows) {
  const slide = presentation.slides.add();
  addHeader(slide, {
    title: "已知发色团残基位于排名后段",
    subtitle: "同一 238 位点筛查中，G24 排名第 2，S65–Y66–G67 分别位于后段",
    section: "候选排名与控制位点", page: 23,
  });
  // PowerPoint renders horizontal-bar categories from bottom to top. Reverse the
  // source order so G24 remains the first visible comparison at the top.
  const chartRows = [...rankRows].reverse();
  const categories = chartRows.map((row) => `${row.residue}${row.position}`);
  const ranks = chartRows.map((row) => Number(row.rank));
  const chart = slide.charts.add("bar", {
    position: { left: 50, top: 192, width: 700, height: 390 },
    categories,
    series: [{
      name: "筛查排名", values: ranks, fill: P.primary,
      points: [
        { idx: 0, fill: P.error }, { idx: 1, fill: P.error }, { idx: 2, fill: P.error }, { idx: 3, fill: P.primary },
      ],
    }],
    barOptions: { direction: "bar", grouping: "clustered", gapWidth: 46 },
    hasLegend: false,
    xAxis: {
      min: 0, max: 238, majorUnit: 50, title: "rank（数值小者靠前）",
      textStyle: { typeface: FONT.latin, fontSize: 13, fill: P.muted },
      majorGridlines: { style: "solid", fill: P.border, width: 1 },
      line: { style: "solid", fill: P.border, width: 1 },
    },
    yAxis: {
      textStyle: { typeface: FONT.latin, fontSize: 16, fill: P.text, bold: true },
      line: { style: "solid", fill: P.border, width: 1 },
    },
    dataLabels: { showValue: true, position: "outEnd", textStyle: { typeface: FONT.latin, fontSize: 14, fill: P.text, bold: true } },
    chartFill: P.surface, plotAreaFill: P.surface,
  });
  chart.xAxis.textStyle.typeface = FONT.chinese;
  chart.yAxis.textStyle.typeface = FONT.chinese;
  chart.dataLabels.textStyle.typeface = FONT.chinese;

  addPanel(slide, { left: 780, top: 192, width: 452, height: 184 }, { fill: P.softRed, line: P.border, radius: 12 });
  addText(slide, "控制位点的读法", { left: 806, top: 214, width: 260, height: 24 }, { fontSize: 20, bold: true, color: P.error });
  addText(slide, "S65–Y66–G67 是 GFP 发色团形成相关的已知残基。它们在本次模型筛查中得到负的综合分数，排名分别为 225、223、211。", { left: 806, top: 258, width: 394, height: 76 }, {
    fontSize: 16, color: P.text,
  });
  addPanel(slide, { left: 780, top: 398, width: 452, height: 184 }, { fill: P.softGreen, line: P.border, radius: 12 });
  addText(slide, "结论边界", { left: 806, top: 420, width: 180, height: 24 }, { fontSize: 20, bold: true, color: P.success });
  addText(slide, "排名是本蛋白、当前窗口与权重设置下的顺序指标。功能判断需要独立实验、基准对照或多蛋白校准数据。", { left: 806, top: 464, width: 392, height: 58 }, {
    fontSize: 16, color: P.text,
  });
  addText(slide, "图中横轴使用原始 rank。条形长度表示名次数字，数值小者靠前。", { left: 795, top: 548, width: 392, height: 20 }, {
    fontSize: 13, color: P.muted, align: "center",
  });
  addText(slide, "蓝色标出内部高位候选 G24。红色标出三个位于后段的发色团相关位点。", { left: 86, top: 602, width: 636, height: 19 }, { fontSize: 13, color: P.muted, align: "center" });
  addSource(slide, "来源：candidate_sites_all.csv（238 位点）；UniProt P42212；RCSB PDB 1EMA（结构编号须经审计映射）。");
  slide.speakerNotes.textFrame.setText(
    "这一页把已知 GFP 发色团相关位点放回同一份 238 位点筛查结果。图中横轴是原始 rank，数值小者位于排序前端。G24 的 rank 为 2。S65、Y66、G67 的 rank 分别为 225、223、211，并且三者综合分数为负。这个结果直接描述本次运行、窗口和权重组合下的模型排序。发色团形成属于独立的生物化学事实，功能层面的判断需要实验、已校准基准或多蛋白对照数据。后续结构解释还要遵循经审计的 PDB author/label 编号映射，避免将结构条目标签直接当作 FASTA 位置。下一页开始解释 layer 60 SAE 如何把隐藏向量写成稀疏特征。",
  );
  return slide;
}

async function renderSlides(presentation) {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  for (let index = 0; index < presentation.slides.items.length; index += 1) {
    const slide = presentation.slides.getItem(index);
    const png = await slide.export({ format: "png", scale: 1 });
    await fs.writeFile(path.join(PREVIEW_DIR, `slide-${String(index + 1).padStart(2, "0")}.png`), new Uint8Array(await png.arrayBuffer()));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(path.join(PREVIEW_DIR, `slide-${String(index + 1).padStart(2, "0")}.layout.json`), await layout.text(), "utf8");
  }
  const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
  await fs.writeFile(path.join(PREVIEW_DIR, "montage.webp"), new Uint8Array(await montage.arrayBuffer()));
}

await fs.mkdir(BUILD_DIR, { recursive: true });
const rankRows = await readRankRows();
const tokenData = await readDisplayedTokenData();
const presentation = Presentation.create({ slideSize: CANVAS });
buildSlide06(presentation, tokenData);
buildSlide10(presentation);
await buildSlide23(presentation, rankRows);
await (await PresentationFile.exportPptx(presentation)).save(DRAFT_PATH);
await renderSlides(presentation);
const snapshot = await presentation.inspect({ kind: "slide,textbox,shape,chart,notes", maxChars: 100_000 });
await fs.writeFile(path.join(PREVIEW_DIR, "inspect.ndjson"), `${snapshot.ndjson.trim()}\n`, "utf8");
console.log(JSON.stringify({ draft: DRAFT_PATH, previewDir: PREVIEW_DIR, slideCount: presentation.slides.items.length, rankRows }, null, 2));
