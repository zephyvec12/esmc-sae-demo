import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const WORKSPACE = "E:\\ESMC\\ppt_handoff_20260906";
const BUILD_DIR = path.join(WORKSPACE, "build");
const RUN_DIR = path.join(WORKSPACE, "sources", "run_20260905T135554Z_smoke_gfp");
const SKILL_DIR = "C:\\Users\\RS\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.904.11930\\skills\\presentations";

const P = {
  bg: "#F7FAFC", surface: "#FFFFFF", primary: "#1456A0", accent: "#F28E2B",
  success: "#2E7D32", error: "#C62828", text: "#0B1F33", muted: "#50657A",
  border: "#D6E2EE", softBlue: "#EAF2FB", softOrange: "#FFF4E6",
  softGreen: "#EAF6EF", softRed: "#FDEBEC",
};
const FONT = { chinese: "Microsoft YaHei", latin: "Arial", mono: "Consolas" };
const CANVAS = { width: 1280, height: 720 };

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const DRAFT_PATH = arg("--draft", path.join(BUILD_DIR, "esmc_gfp_34_draft.pptx"));
const PREVIEW_DIR = arg("--preview", path.join(BUILD_DIR, "esmc_gfp_34_previews"));
const NOTES_PATH = arg("--notes", "");

const { applyPresentationChartFont } = await import(pathToFileURL(
  path.join(SKILL_DIR, "container_tools", "artifact_tool_utils.mjs"),
).href);

function addText(slide, text, position, {
  fontSize = 19, color = P.text, typeface = FONT.chinese, bold = false,
  align = "left", valign = "top", autoFit = "shrinkText",
  insets = { top: 0, right: 0, bottom: 0, left: 0 },
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

function addRect(slide, position, fill, line = fill) {
  return slide.shapes.add({ geometry: "rect", position, fill, line: { fill: line, width: 0 } });
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
  addText(slide, title, { left: 48, top: 32, width: 1120, height: 52 }, {
    fontSize: 34, bold: true, color: P.text,
  });
  addText(slide, subtitle, { left: 49, top: 100, width: 1115, height: 31 }, {
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
  addText(slide, text, { left: 48, top: 658, width: 1084, height: 16 }, {
    fontSize: 11, color: P.muted, typeface: FONT.latin,
  });
}

function addAccentLabel(slide, text, { left, top, width, fill = P.softBlue, color = P.primary }) {
  addPanel(slide, { left, top, width, height: 27 }, { fill, line: P.border, radius: 8 });
  addText(slide, text, { left: left + 8, top: top + 6, width: width - 16, height: 16 }, {
    fontSize: 12, color, bold: true, align: "center", typeface: FONT.latin,
  });
}

function addFact(slide, { left, top, width, height = 96, heading, body, accent = P.primary, fill = P.surface, bodySize = 15 }) {
  addPanel(slide, { left, top, width, height }, { fill, line: P.border, radius: 10 });
  addRect(slide, { left, top, width: 7, height }, accent);
  addText(slide, heading, { left: left + 21, top: top + 14, width: width - 33, height: 21 }, {
    fontSize: 15, bold: true, color: P.text,
  });
  addText(slide, body, { left: left + 21, top: top + 43, width: width - 33, height: Math.max(1, height - 53) }, {
    fontSize: bodySize, color: P.muted,
  });
}

function addMetric(slide, { left, top, width, value, label, note, accent = P.primary, fill = P.surface }) {
  addPanel(slide, { left, top, width, height: 120 }, { fill, line: P.border, radius: 12 });
  addText(slide, value, { left: left + 20, top: top + 20, width: width - 40, height: 46 }, {
    fontSize: 34, typeface: FONT.latin, bold: true, color: accent, align: "center",
  });
  addText(slide, label, { left: left + 16, top: top + 72, width: width - 32, height: 20 }, {
    fontSize: 15, bold: true, color: P.text, align: "center",
  });
  addText(slide, note, { left: left + 16, top: top + 96, width: width - 32, height: 16 }, {
    fontSize: 12, color: P.muted, align: "center",
  });
}

function addFlowNode(slide, { left, top, width, height = 94, title, body, fill = P.softBlue, accent = P.primary, mono = false }) {
  addPanel(slide, { left, top, width, height }, { fill, line: P.border, radius: 10 });
  addRect(slide, { left, top, width, height: 7 }, accent);
  addText(slide, title, { left: left + 16, top: top + 19, width: width - 32, height: 22 }, {
    fontSize: 16, bold: true, color: accent, typeface: mono ? FONT.mono : FONT.chinese, align: "center",
  });
  addText(slide, body, { left: left + 15, top: top + 51, width: width - 30, height: height - 60 }, {
    fontSize: 14, color: P.muted, align: "center", typeface: mono ? FONT.mono : FONT.chinese,
  });
}

function addNativeTable(slide, {
  left, top, width, height, headers, rows, columnWidths, fontSize = 15,
  headerFill = P.primary, rowFill = P.surface, highlights = new Map(),
}) {
  const table = slide.tables.add({
    rows: rows.length + 1, columns: headers.length, left, top, width, height,
    columnWidths, values: [headers, ...rows],
  });
  table.borders.assign({ style: "solid", fill: P.border, width: 1 });
  table.rows[0].height = 33;
  for (let col = 0; col < headers.length; col += 1) {
    const cell = table.getCell(0, col);
    cell.fill = headerFill;
    cell.text.style = { typeface: FONT.chinese, fontSize: 15, bold: true, color: "#FFFFFF", alignment: "center", verticalAlignment: "middle" };
  }
  for (let row = 0; row < rows.length; row += 1) {
    table.rows[row + 1].height = Math.max(31, (height - 33) / rows.length);
    for (let col = 0; col < headers.length; col += 1) {
      const cell = table.getCell(row + 1, col);
      const key = `${row}:${col}`;
      cell.fill = highlights.get(key) ?? rowFill;
      cell.text.style = {
        typeface: col === 0 ? FONT.latin : FONT.chinese,
        fontSize, color: P.text, alignment: col === 0 ? "center" : "left", verticalAlignment: "middle",
      };
    }
  }
  return table;
}

function addTokenCell(slide, { left, top, width, token, index, mask, fill }) {
  addPanel(slide, { left, top, width, height: 66 }, { fill, line: P.border, radius: 8 });
  addText(slide, token, { left: left + 6, top: top + 10, width: width - 12, height: 24 }, {
    fontSize: token.startsWith("<") ? 15 : 23, bold: true,
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

function addMatrixCell(slide, { left, top, value, fill, color = P.text, width = 64, height = 42 }) {
  addPanel(slide, { left, top, width, height }, { fill, line: P.border, radius: 6 });
  addText(slide, value, { left, top: top + (height - 22) / 2, width, height: 22 }, {
    fontSize: 15, color, typeface: FONT.mono, bold: true, align: "center",
  });
}

function addToyTag(slide, left, top) {
  addAccentLabel(slide, "玩具数值例子", { left, top, width: 116, fill: P.softOrange, color: P.accent });
}

function addNotes(slide, page, fallback) {
  const note = NOTES_MAP.get(String(page)) ?? fallback;
  slide.speakerNotes.textFrame.setText(note);
}

async function loadNotes() {
  if (!NOTES_PATH || !(await fs.stat(NOTES_PATH).catch(() => null))) return new Map();
  const input = JSON.parse(await fs.readFile(NOTES_PATH, "utf8"));
  const out = new Map();
  const sourceMap = input.source_map ?? input._source_map ?? {};
  const rows = Array.isArray(input) ? input
    : (Array.isArray(input.slides) ? input.slides
      : (input.slides && typeof input.slides === "object") ? Object.entries(input.slides)
        .map(([page, value]) => ({ page, ...(typeof value === "string" ? { notes: value } : value) }))
        : Object.entries(input).filter(([key]) => /^\d+$/u.test(key))
          .map(([page, value]) => ({ page, ...(typeof value === "string" ? { notes: value } : value) })));
  for (const row of rows) {
    const page = row.page ?? row.slide ?? row.number;
    const spoken = row.notes ?? row.text ?? "";
    const entries = Array.isArray(row.sources) && row.sources.length > 0
      ? row.sources
      : (row.source_ids ?? []).map((id) => ({ id, locator: sourceMap[id] }));
    const citations = entries.map((entry) => {
      const id = typeof entry === "string" ? "" : (entry.id ?? "");
      const mapped = id ? sourceMap[id] : undefined;
      const locator = typeof entry === "string" ? entry : (entry.locator ?? mapped?.locator ?? mapped ?? "");
      const label = typeof entry === "string" ? "" : (entry.label ?? mapped?.label ?? "");
      return locator ? `${id ? `${id}${label ? ` [${label}]` : ""}: ` : ""}${locator}` : "";
    }).filter(Boolean);
    out.set(String(page), citations.length ? `${spoken}\n\n参考来源：\n${citations.join("\n")}` : spoken);
  }
  return out;
}

async function loadInputs() {
  const [normalizedRaw, evidenceRaw, fastaRaw] = await Promise.all([
    fs.readFile(path.join(WORKSPACE, "normalized_slide_data.json"), "utf8"),
    fs.readFile(path.join(WORKSPACE, "evidence.json"), "utf8"),
    fs.readFile(path.join(RUN_DIR, "input_sequence.fasta"), "utf8"),
  ]);
  const fasta = fastaRaw.split(/\r?\n/u).filter((line) => !line.startsWith(">")).join("").trim();
  return { normalized: JSON.parse(normalizedRaw), evidence: JSON.parse(evidenceRaw), fasta };
}

const NOTES_MAP = await loadNotes();
const { normalized: D, evidence: E, fasta: FASTA } = await loadInputs();
const chartValue = (value) => Number(Number(value).toFixed(12));

function makeSlide(presentation, page, title, subtitle, section) {
  const slide = presentation.slides.add();
  addHeader(slide, { title, subtitle, section, page });
  return slide;
}

function slide01(presentation) {
  const slide = makeSlide(presentation, 1, "一条 GFP 序列完成了 ESMC 6B 与 SAE 分析", "本地复现、计算原理与结果复核", "项目概览");
  addRect(slide, { left: 48, top: 186, width: 9, height: 418 }, P.primary);
  addText(slide, "238 aa GFP", { left: 84, top: 202, width: 460, height: 54 }, { fontSize: 45, bold: true, color: P.primary, typeface: FONT.latin });
  addText(slide, "从 FASTA 序列到残基向量、候选排名与 layer 60 SAE 特征解释", { left: 86, top: 273, width: 500, height: 54 }, { fontSize: 20, color: P.text });
  const nodes = [
    ["FASTA", "238 个残基", P.softBlue, P.primary], ["ESMC 6B", "冻结前向", P.softOrange, P.accent],
    ["扫描", "238 个遮挡位置", P.softGreen, P.success], ["SAE", "15,232 条激活", P.softBlue, P.primary],
  ];
  let x = 86;
  nodes.forEach(([title, body, fill, accent], index) => {
    addFlowNode(slide, { left: x, top: 385, width: 160, height: 104, title, body, fill, accent, mono: index < 2 });
    if (index < nodes.length - 1) addArrow(slide, { left: x + 166, top: 426, width: 34, height: 24 }, { fill: P.primary });
    x += 198;
  });
  addFact(slide, { left: 84, top: 521, width: 884, height: 83, heading: "本页范围", accent: P.accent, body: "交付物保留残基向量、全位置评分、Top10 与 SAE 特征查表。科学结论聚焦可核查的运行观察和结构假设。", bodySize: 15 });
  addMetric(slide, { left: 996, top: 202, width: 236, value: "16 GB", label: "本次 GPU 容量", note: "RTX 5080 Laptop", accent: P.accent, fill: P.softOrange });
  addMetric(slide, { left: 996, top: 340, width: 236, value: "80", label: "Transformer 层", note: "hidden width 2560", accent: P.primary, fill: P.softBlue });
  addMetric(slide, { left: 996, top: 478, width: 236, value: "64", label: "每残基 SAE 非零项", note: "codebook 16,384", accent: P.success, fill: P.softGreen });
  addSource(slide, "来源：run_metadata.json；candidate_sites_all.csv；sae_residue_activations.csv");
  addNotes(slide, 1, "本页概览同一条 238 aa GFP 在本地完成的计算链。后续页面把输入编号、冻结 ESMC 推理、遮挡评分、SAE 查表和外部结构审计分开解释。每个结论都回到保存的文件和独立来源。下一页先界定本次复现可以回答的问题。 ");
}

function slide02(presentation) {
  const slide = makeSlide(presentation, 2, "本次复现回答了计算流程与解释边界", "完成的运行产物支持流程复核，生物学结论保留校准边界", "项目概览");
  addMetric(slide, { left: 50, top: 196, width: 350, value: "238 × 2560", label: "残基隐藏矩阵 H", note: "state 80，FP16 保存", accent: P.primary, fill: P.softBlue });
  addMetric(slide, { left: 465, top: 196, width: 350, value: "238", label: "单点遮挡扫描", note: "每次只改变一个残基位置", accent: P.accent, fill: P.softOrange });
  addMetric(slide, { left: 880, top: 196, width: 350, value: "15,232", label: "SAE 激活记录", note: "238 × 64", accent: P.success, fill: P.softGreen });
  addPanel(slide, { left: 50, top: 360, width: 560, height: 236 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "直接观测", { left: 78, top: 387, width: 180, height: 26 }, { fontSize: 21, bold: true, color: P.primary });
  addText(slide, "• 流程完整运行并保存 238 行评分表\n• 1,134 个活跃 feature ID 有描述\n• G24 与发色团控制位点保留在同一排序中", { left: 80, top: 432, width: 480, height: 120 }, { fontSize: 17, color: P.text });
  addPanel(slide, { left: 646, top: 360, width: 584, height: 236 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "解释边界", { left: 674, top: 387, width: 180, height: 26 }, { fontSize: 21, bold: true, color: P.error });
  addText(slide, "• 排名来自条件偏好与局部新颖度的启发式组合\n• SAE 描述支持候选机制语义\n• 发色团排名后段仍需对照、实验与多蛋白校准", { left: 676, top: 432, width: 500, height: 120 }, { fontSize: 17, color: P.text });
  addSource(slide, "来源：EVIDENCE_AUDIT.md；normalized_slide_data.json；UniProt P42212");
  addNotes(slide, 2, "本次运行回答的是计算流程与保存结果能支持什么。矩阵、评分和激活条目都是直接工件。SAE 描述和结构记录用于解释候选语义。功能层面的判断需要额外证据。下一页把同一残基沿五段计算链串起来。 ");
}

function slide03(presentation) {
  const slide = makeSlide(presentation, 3, "同一残基贯穿五段计算与验证", "每一段都接收上一段的明确产物，并为下一段提供可追踪对象", "学习路线");
  const stages = [
    ["输入", "P04–07\nFASTA → token → H", P.softBlue, P.primary],
    ["模型", "P08–13\n投影、注意力、训练原理", P.softOrange, P.accent],
    ["运行与评分", "P14–23\n遮挡 → margin / novelty → rank", P.softGreen, P.success],
    ["SAE", "P24–29\nlayer 60 → TopK feature", P.softBlue, P.primary],
    ["证据与交付", "P30–34\n编号审计 → 边界 → manifest", P.softOrange, P.accent],
  ];
  let x = 54;
  stages.forEach(([title, body, fill, accent], index) => {
    addFlowNode(slide, { left: x, top: 266, width: 210, height: 145, title, body, fill, accent });
    addText(slide, `0${index + 1}`, { left: x + 80, top: 215, width: 52, height: 32 }, { fontSize: 22, bold: true, color: accent, align: "center", typeface: FONT.latin });
    if (index < stages.length - 1) addArrow(slide, { left: x + 216, top: 326, width: 28, height: 22 }, { fill: P.primary });
    x += 244;
  });
  addPanel(slide, { left: 106, top: 464, width: 1068, height: 107 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "主线问题", { left: 136, top: 491, width: 150, height: 22 }, { fontSize: 18, bold: true, color: P.primary });
  addText(slide, "aᵢ 如何变成 hᵢ？遮挡 aᵢ 后如何得到 mᵢ？局部 hᵢ 如何得到 nᵢ？sᵢ 如何形成候选排名？layer 60 SAE 怎样提供可追踪的 feature ID？", { left: 306, top: 488, width: 820, height: 45 }, { fontSize: 17, color: P.text, typeface: FONT.mono, align: "center" });
  addSource(slide, "来源：design_spec.md 第 IX 节；本次运行工件");
  addNotes(slide, 3, "路线图将同一残基作为跨页对象。输入部分固定编号和向量。模型部分说明 80 层如何更新表示。运行部分把遮挡输出转为两个评分分量。SAE 和外部结构记录分别提供解释与边界。下一页先核验测试序列。 ");
}

function slide04(presentation) {
  const slide = makeSlide(presentation, 4, "测试序列与审阅版 GFP 完全一致", "238-residue FASTA 与 UniProt P42212 的序列身份经 MD5 和逐位点复核", "输入与编号");
  const window = D.input.highlight_window_61_70;
  addPanel(slide, { left: 50, top: 205, width: 1180, height: 142 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "GFP 序列窗口 61–70", { left: 80, top: 228, width: 250, height: 24 }, { fontSize: 19, bold: true, color: P.primary });
  const chars = [...window];
  let x = 205;
  chars.forEach((letter, index) => {
    const pos = 61 + index;
    const chromophore = pos >= 65 && pos <= 67;
    addPanel(slide, { left: x, top: 270, width: 74, height: 48 }, { fill: chromophore ? P.softOrange : P.softBlue, line: P.border, radius: 7 });
    addText(slide, letter, { left: x, top: 277, width: 74, height: 22 }, { fontSize: 21, bold: true, color: chromophore ? P.accent : P.primary, typeface: FONT.mono, align: "center" });
    addText(slide, String(pos), { left: x, top: 302, width: 74, height: 14 }, { fontSize: 11, color: P.muted, typeface: FONT.latin, align: "center" });
    x += 84;
  });
  addText(slide, "S65–Y66–G67", { left: 548, top: 326, width: 250, height: 18 }, { fontSize: 13, bold: true, color: P.accent, align: "center", typeface: FONT.latin });
  addFact(slide, { left: 50, top: 390, width: 356, height: 150, heading: "输入序列", accent: P.primary, body: "FASTA 长度 L = 238。运行表 positions 1…238 与原序列字符逐项一致。", bodySize: 16 });
  addFact(slide, { left: 438, top: 390, width: 356, height: 150, heading: "外部身份", accent: P.success, body: "UniProt P42212 提供 GFP 序列身份。MD5 比对支持审阅版与测试 FASTA 一致。", bodySize: 16 });
  addFact(slide, { left: 826, top: 390, width: 404, height: 150, heading: "结构参照", accent: P.accent, body: "PDB 1EMA 是变体结构。其 CRO 复合残基与 FASTA 的编号关系在 P30 单独审计。", bodySize: 16 });
  addSource(slide, "来源：input_sequence.fasta；UniProt P42212；RCSB PDB 1EMA");
  addNotes(slide, 4, "这一页确认我们分析的对象。测试 FASTA 为 238 个残基。61 到 70 的窗口显示已知发色团相关的 S65、Y66、G67。PDB 1EMA 的结构编号需要单独映射，因为 CRO 将三个输入残基压缩为一个结构条目。下一页转向保存的运行文件。 ");
}

function slide05(presentation) {
  const slide = makeSlide(presentation, 5, "每个运行文件承担一个可核查任务", "输入、矩阵、评分、SAE 和元数据各自保存一个可以复读的对象", "输入与编号");
  const rows = [
    ["FASTA", "input_sequence.fasta", "238 aa 输入序列"],
    ["H", "residue_embeddings.npz", "238×2560 残基矩阵与 mean"],
    ["score", "candidate_sites_all.csv", "238 位点完整评分"],
    ["SAE", "sae_residue_activations.csv", "position × feature 激活"],
    ["summary", "sae_feature_summary.csv", "feature 描述与活跃位置"],
    ["manifest", "run_metadata.json / report.md", "版本、命令和环境"],
  ];
  addNativeTable(slide, { left: 50, top: 205, width: 820, height: 327, headers: ["对象", "文件", "用途"], rows, columnWidths: [110, 280, 430], fontSize: 15 });
  addFact(slide, { left: 904, top: 205, width: 326, height: 102, heading: "检查 01", accent: P.primary, body: "评分总表有 238 行，对应每个 FASTA 位置。", bodySize: 15 });
  addFact(slide, { left: 904, top: 327, width: 326, height: 102, heading: "检查 02", accent: P.success, body: "position、rank 与残基字符回到原始序列。", bodySize: 15 });
  addFact(slide, { left: 904, top: 449, width: 326, height: 102, heading: "检查 03", accent: P.accent, body: "版本、模型修订和运行设置由 manifest 保留。", bodySize: 15 });
  addText(slide, "完整数据保留全部 238 个位置。Top10 仅是后续讲解入口。", { left: 50, top: 564, width: 820, height: 24 }, { fontSize: 17, color: P.text, bold: true });
  addSource(slide, "来源：run_20260905T135554Z_smoke_gfp/ 下的已复制工件");
  addNotes(slide, 5, "这里建立文件与对象的对应关系。每个核心结论可以回到原始 FASTA、NPZ、CSV 或 metadata。Top10 是完整 238 行排序的摘录，不能替代全表。下一页开始解释 token 编号怎样与 FASTA 对齐。 ");
}

function slide06(presentation) {
  const slide = makeSlide(presentation, 6, "特殊 token 掩码固定了残基编号", "special_tokens_mask 将 238 个 FASTA 残基与模型 token 位置逐个对应", "输入与编号");
  addText(slide, "实际 tokenizer 输出", { left: 48, top: 180, width: 260, height: 24 }, { fontSize: 18, bold: true, color: P.primary });
  const start = [...FASTA.slice(0, 3)];
  const end = [...FASTA.slice(-3)];
  const tokens = [
    ["<cls>", 0, 1, P.softRed], [start[0], 1, 0, P.softBlue], [start[1], 2, 0, P.softBlue], [start[2], 3, 0, P.softBlue],
    ["…", "…", 0, P.softBlue], [end[0], 236, 0, P.softBlue], [end[1], 237, 0, P.softBlue], [end[2], 238, 0, P.softBlue], ["<eos>", 239, 1, P.softRed],
  ];
  const widths = [124, 110, 110, 110, 74, 110, 110, 110, 124];
  let x = 52;
  tokens.forEach(([token, index, mask, fill], i) => {
    addTokenCell(slide, { left: x, top: 218, width: widths[i], token, index, mask, fill });
    x += widths[i] + 24;
  });
  addText(slide, "special_tokens_mask", { left: 52, top: 287, width: 220, height: 18 }, { fontSize: 13, color: P.muted, typeface: FONT.mono });
  addArrow(slide, { left: 470, top: 350, width: 335, height: 26 }, { fill: P.primary });
  addText(slide, "mask=0 的位置进入残基映射", { left: 485, top: 379, width: 305, height: 20 }, { fontSize: 15, color: P.primary, bold: true, align: "center" });
  addPanel(slide, { left: 52, top: 414, width: 1176, height: 106 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "FASTA（1-based）", { left: 73, top: 435, width: 142, height: 20 }, { fontSize: 15, color: P.muted, bold: true });
  const residues = [
    [`a₁ = ${start[0]}`, "t₁ = 1"], [`a₂ = ${start[1]}`, "t₂ = 2"], [`a₃ = ${start[2]}`, "t₃ = 3"], ["…", "…"],
    [`a₂₃₆ = ${end[0]}`, "t₂₃₆ = 236"], [`a₂₃₇ = ${end[1]}`, "t₂₃₇ = 237"], [`a₂₃₈ = ${end[2]}`, "t₂₃₈ = 238"],
  ];
  x = 232;
  residues.forEach(([residue, mapping], i) => {
    const width = i === 3 ? 58 : 126;
    addPanel(slide, { left: x, top: 430, width, height: 70 }, { fill: i === 3 ? P.softOrange : P.softGreen, line: P.border, radius: 8 });
    addText(slide, residue, { left: x + 6, top: 443, width: width - 12, height: 18 }, { fontSize: 15, color: P.text, typeface: FONT.mono, bold: true, align: "center" });
    addText(slide, mapping, { left: x + 4, top: 470, width: width - 8, height: 17 }, { fontSize: 13, color: P.success, typeface: FONT.mono, align: "center" });
    x += width + 10;
  });
  addFact(slide, { left: 52, top: 535, width: 372, heading: "序列长度与 token 长度", accent: P.primary, body: "L = 238。T = 240，其中 token 0 是 <cls>，token 239 是 <eos>。" });
  addFact(slide, { left: 452, top: 535, width: 372, heading: "映射规则", accent: P.success, body: "仅选 special_tokens_mask = 0 的位置。每个位置再与 FASTA 字符逐项核对。" });
  addFact(slide, { left: 852, top: 535, width: 376, heading: "编号用途", accent: P.accent, body: "embedding、遮挡扫描、SAE 激活都沿用同一套 1-based FASTA 编号。" });
  addSource(slide, "来源：run_metadata.json；run_esmc_site_pipeline.py::token_mapping；本次 tokenizer 复核");
  addNotes(slide, 6, "特殊 token 决定序列边界。实际 tokenizer 输出 <cls>、238 个残基和 <eos>，总长度为 240。程序依据 special_tokens_mask 选择 238 个残基位置，并逐个反查 FASTA 字符。这样 t_i 始终表示 a_i 的模型 token 位置。下一页在这些位置导出 2560 维上下文向量。 ");
}

function slide07(presentation) {
  const slide = makeSlide(presentation, 7, "每个残基获得一个 2560 维上下文向量", "Token ID、embedding 与最终 hidden state 是连续计算链上的不同对象", "输入与编号");
  const nodes = [
    ["token ID", "aᵢ → tᵢ\n离散词表索引", P.softBlue, P.primary],
    ["lookup", "embedding\nT × 2560", P.softOrange, P.accent],
    ["80 blocks", "contextual state\nT × 2560", P.softGreen, P.success],
    ["export H", "238 × 2560\n去除特殊 token", P.softBlue, P.primary],
  ];
  let x = 62;
  nodes.forEach(([title, body, fill, accent], index) => {
    addFlowNode(slide, { left: x, top: 238, width: 230, height: 128, title, body, fill, accent, mono: true });
    if (index < 3) addArrow(slide, { left: x + 234, top: 291, width: 40, height: 24 }, { fill: P.primary });
    x += 290;
  });
  addPanel(slide, { left: 62, top: 415, width: 720, height: 133 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "H = [h₁; …; h₂₃₈]", { left: 90, top: 441, width: 300, height: 28 }, { fontSize: 22, bold: true, color: P.primary, typeface: FONT.mono });
  addText(slide, "每行 hᵢ 是残基 i 在完整序列上下文中的 2560 维向量。H 以 FP16 保存。", { left: 90, top: 486, width: 650, height: 34 }, { fontSize: 17, color: P.text });
  addFact(slide, { left: 820, top: 415, width: 350, height: 133, heading: "蛋白均值向量", accent: P.success, body: "protein_embedding = mean(H, rows)。输出维度仍为 2560，以 FP32 保存。", bodySize: 16 });
  addText(slide, "本次模型推理用 BF16。导出精度与计算精度分别记录。", { left: 62, top: 579, width: 910, height: 23 }, { fontSize: 17, color: P.muted });
  addSource(slide, "来源：residue_embeddings.npz；run_esmc_site_pipeline.py::export_embeddings");
  addNotes(slide, 7, "上一页固定了 token 位置。本页区分 token ID、初始 embedding 和上下文化 hidden state。模型导出第 80 个状态后，程序只保留 238 个残基位置，形成 H。每行 h_i 的宽度为 2560。均值蛋白向量沿残基维度平均，因此仍是 2560 维。下一页进入 80 层模型结构。 ");
}

function slide08(presentation) {
  const slide = makeSlide(presentation, 8, "80 层模型反复更新同一序列表示", "每层保持 T × 2560 接口，并在注意力与 SwiGLU 中暂时展开内部维度", "模型与注意力");
  const metrics = [
    ["80", "layers", P.primary, P.softBlue], ["2560", "hidden width", P.accent, P.softOrange], ["40 × 64", "heads × head dim", P.success, P.softGreen], ["6912", "SwiGLU intermediate", P.primary, P.softBlue],
  ];
  let x = 53;
  metrics.forEach(([value, label, accent, fill]) => { addMetric(slide, { left: x, top: 194, width: 270, value, label, note: "config / code audit", accent, fill }); x += 294; });
  addFlowNode(slide, { left: 78, top: 377, width: 225, height: 118, title: "X⁽ˡ⁾", body: "T × 2560\n当前层输入", fill: P.softBlue, accent: P.primary, mono: true });
  addArrow(slide, { left: 322, top: 423, width: 48, height: 25 });
  addFlowNode(slide, { left: 390, top: 377, width: 225, height: 118, title: "Attention", body: "Q/K LayerNorm\nRoPE · SDPA", fill: P.softOrange, accent: P.accent });
  addArrow(slide, { left: 634, top: 423, width: 48, height: 25 });
  addFlowNode(slide, { left: 702, top: 377, width: 225, height: 118, title: "SwiGLU", body: "pre-LN · 线性投影无 bias\n2560 → 6912 → 2560", fill: P.softGreen, accent: P.success });
  addArrow(slide, { left: 946, top: 423, width: 48, height: 25 });
  addFlowNode(slide, { left: 1014, top: 377, width: 190, height: 118, title: "X⁽ˡ⁺¹⁾", body: "T × 2560\n残差输出", fill: P.softBlue, accent: P.primary, mono: true });
  addText(slide, "最终导出 state 80 / final normalized state，并排除 <cls>、<eos>。", { left: 78, top: 547, width: 1000, height: 25 }, { fontSize: 17, color: P.text });
  addSource(slide, "来源：normalized_slide_data.json::architecture；缓存 config 与 installed esm 代码");
  addNotes(slide, 8, "模型将同一序列表示反复送入 80 个 block。外部接口始终是 T 乘 2560。每层内有 40 个 64 维 attention head，以及 6912 维 SwiGLU 中间层。运行采用 pre-LN、Q/K LayerNorm、RoPE 和 SDPA。下一页展开一个 head 的 Q、K、V 投影。 ");
}

function slide09(presentation) {
  const slide = makeSlide(presentation, 9, "Q、K、V 分别学习匹配与内容变换", "完整投影保持 2560 维，Q/K 标准化后再拆成 40 个 64 维 head", "模型与注意力");
  addPanel(slide, { left: 50, top: 185, width: 1180, height: 68 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "X ∈ R^(T×2560)", { left: 78, top: 204, width: 230, height: 27 }, { fontSize: 22, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
  addArrow(slide, { left: 322, top: 204, width: 68, height: 24 });
  addText(slide, "三个并行线性投影", { left: 418, top: 206, width: 230, height: 24 }, { fontSize: 18, bold: true, color: P.text, align: "center" });
  addArrow(slide, { left: 684, top: 204, width: 68, height: 24 });
  addText(slide, "Q、K、V ∈ R^(T×2560)", { left: 748, top: 204, width: 430, height: 27 }, { fontSize: 22, bold: true, color: P.success, typeface: FONT.mono, align: "center" });
  const cols = [
    ["Q = XW_Q", "提问的匹配方向", "单头切片：2560×64", P.softBlue, P.primary],
    ["K = XW_K", "提供可比较的索引", "单头切片：2560×64", P.softOrange, P.accent],
    ["V = XW_V", "提供可聚合的内容", "单头切片：2560×64", P.softGreen, P.success],
  ];
  let x = 50;
  cols.forEach(([formula, body, shape, fill, accent], index) => {
    addPanel(slide, { left: x, top: 300, width: 370, height: 212 }, { fill, line: P.border, radius: 12 });
    addText(slide, formula, { left: x + 22, top: 328, width: 326, height: 30 }, { fontSize: 23, bold: true, color: accent, typeface: FONT.mono, align: "center" });
    addText(slide, body, { left: x + 26, top: 382, width: 318, height: 28 }, { fontSize: 18, color: P.text, align: "center" });
    addText(slide, shape, { left: x + 26, top: 432, width: 318, height: 24 }, { fontSize: 16, color: P.muted, typeface: FONT.mono, align: "center" });
    addText(slide, "线性投影无 bias。本次运行保持冻结。", { left: x + 26, top: 472, width: 318, height: 20 }, { fontSize: 14, color: P.muted, align: "center" });
    x += 405;
  });
  addSource(slide, "来源：normalized_slide_data.json::architecture；本地 attention 实现");
  addNotes(slide, 9, "Q、K、V 都从同一个 X 线性投影得到。完整投影先保留 T 乘 2560。Q 与 K 在完整 2560 维末轴执行 LayerNorm，随后拆成 40 个宽度 64 的 head。下方矩阵标注只展示一个 head 的参数切片。Q 表示当前 token 希望检索什么，K 提供可匹配的索引，V 提供随后被聚合的内容。预训练阶段的 loss 可以把梯度回传到三个 W。本次 GFP 分析只执行冻结前向计算。下一页把 Q 与 K 的分数归一化。 ");
}

function slide10(presentation) {
  const slide = makeSlide(presentation, 10, "Softmax 将一行匹配分数归一化", "玩具 3-token 单头例子沿用到下一页的 Value 加权组合", "模型与注意力");
  addPanel(slide, { left: 48, top: 180, width: 1184, height: 64 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "Sᵢⱼ = qᵢ kⱼᵀ / √64", { left: 92, top: 194, width: 330, height: 32 }, { fontSize: 24, typeface: FONT.mono, bold: true, color: P.primary, align: "center" });
  addArrow(slide, { left: 447, top: 198, width: 106, height: 26 });
  addText(slide, "A = softmax(S)", { left: 586, top: 194, width: 300, height: 32 }, { fontSize: 25, typeface: FONT.mono, bold: true, color: P.success, align: "center" });
  addText(slide, "Q/K 先在 2560 维做 LayerNorm，再拆成 64 维并施加 RoPE。", { left: 870, top: 201, width: 314, height: 26 }, { fontSize: 13, color: P.muted, align: "right" });
  const columns = [
    [48, "匹配分数", "S = [ln 1, ln 2, ln 3]", "第 i 个 Query 对三个 Key 的原始相对分数。", P.softBlue, P.primary],
    [441, "逐项指数", "exp(S) = [1, 2, 3]", "指数把每个分数映射为正值。", P.softOrange, P.accent],
    [834, "行内归一化", "A = [1/6, 2/6, 3/6]", "总和 1 + 2 + 3 = 6。该行权重和为 1。", P.softGreen, P.success],
  ];
  columns.forEach(([left, title, formula, caption, fill, accent], index) => {
    addPanel(slide, { left, top: 275, width: 350, height: 180 }, { fill, line: P.border, radius: 12 });
    addText(slide, title, { left: left + 22, top: 295, width: 305, height: 24 }, { fontSize: 19, bold: true, color: accent });
    addText(slide, formula, { left: left + 22, top: 335, width: 305, height: 30 }, { fontSize: 21, typeface: FONT.mono, bold: true, color: P.text, align: "center" });
    addText(slide, caption, { left: left + 24, top: 390, width: 298, height: 42 }, { fontSize: 15, color: P.muted, align: "center" });
    if (index < 2) addArrow(slide, { left: left + 354, top: 348, width: 32, height: 24 });
  });
  addPanel(slide, { left: 48, top: 486, width: 510, height: 142 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "行与列的含义", { left: 72, top: 505, width: 180, height: 22 }, { fontSize: 18, bold: true, color: P.primary });
  addText(slide, "行 i：当前 Query。列 j：被匹配的 Key。单元 Aᵢⱼ：Query i 从 Key j 取得内容时使用的权重。", { left: 72, top: 542, width: 452, height: 58 }, { fontSize: 15, color: P.muted });
  addPanel(slide, { left: 584, top: 486, width: 648, height: 142 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "3-token 注意力矩阵的一行（1×3）", { left: 608, top: 505, width: 330, height: 22 }, { fontSize: 18, bold: true, color: P.success });
  ["Key 1", "Key 2", "Key 3"].forEach((label, index) => addText(slide, label, { left: 848 + index * 80, top: 534, width: 64, height: 16 }, { fontSize: 12, color: P.muted, typeface: FONT.latin, align: "center" }));
  addText(slide, "Query i", { left: 608, top: 570, width: 80, height: 18 }, { fontSize: 13, color: P.muted, typeface: FONT.latin });
  [["1/6", P.softBlue], ["2/6", P.softOrange], ["3/6", P.softGreen]].forEach(([value, fill], index) => addMatrixCell(slide, { left: 848 + index * 80, top: 562, value, fill }));
  addToyTag(slide, 1056, 602);
  addSource(slide, "来源：基础算术；本地 ESMC attention 实现。真实 GFP attention 数值未在此页展示。");
  addNotes(slide, 10, "Q、K 的匹配分数在每个 Query 行内经 softmax 归一化。玩具分数 ln 1、ln 2、ln 3 的指数分别为 1、2、3，因此得到 1/6、2/6、3/6。A 的一行总和为 1。真实运行的每个 head 宽度为 64。本页只说明可微计算链，下一页沿用这一行权重组合 Value。 ");
}

function slide11(presentation) {
  const slide = makeSlide(presentation, 11, "注意力权重决定 Value 的加权组合", "同一行玩具权重从三个 Value 向量中取回比例不同的内容", "模型与注意力");
  addToyTag(slide, 52, 184);
  addText(slide, "A = [1/6, 2/6, 3/6]", { left: 52, top: 232, width: 350, height: 30 }, { fontSize: 23, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
  addText(slide, "×", { left: 432, top: 225, width: 38, height: 40 }, { fontSize: 31, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
  addText(slide, "V = [[1,0], [0,2], [2,2]]", { left: 506, top: 232, width: 408, height: 30 }, { fontSize: 22, bold: true, color: P.accent, typeface: FONT.mono, align: "center" });
  addText(slide, "=", { left: 944, top: 225, width: 38, height: 40 }, { fontSize: 31, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
  addText(slide, "o = [7/6, 5/3]", { left: 1010, top: 232, width: 192, height: 30 }, { fontSize: 21, bold: true, color: P.success, typeface: FONT.mono, align: "center" });
  const values = [["v₁", "[1, 0]", P.softBlue], ["v₂", "[0, 2]", P.softOrange], ["v₃", "[2, 2]", P.softGreen]];
  let x = 102;
  values.forEach(([label, vector, fill], index) => {
    addPanel(slide, { left: x, top: 334, width: 230, height: 118 }, { fill, line: P.border, radius: 10 });
    addText(slide, label, { left: x + 20, top: 355, width: 190, height: 22 }, { fontSize: 18, bold: true, color: P.text, typeface: FONT.mono, align: "center" });
    addText(slide, vector, { left: x + 20, top: 395, width: 190, height: 24 }, { fontSize: 21, bold: true, color: P.text, typeface: FONT.mono, align: "center" });
    addText(slide, `${index + 1}/6 × v${index + 1}`, { left: x + 20, top: 425, width: 190, height: 17 }, { fontSize: 13, color: P.muted, typeface: FONT.mono, align: "center" });
    if (index < 2) addText(slide, "+", { left: x + 240, top: 370, width: 50, height: 42 }, { fontSize: 30, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
    x += 350;
  });
  addPanel(slide, { left: 80, top: 504, width: 1120, height: 92 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "单头输出保持 Value 宽度 64。40 个 head 的输出拼接回 2560，再经 W_O 投影。", { left: 108, top: 525, width: 1060, height: 26 }, { fontSize: 18, color: P.text, align: "center" });
  addText(slide, "梯度可经输出 o 回到 A 与 V，再分别回到 Q/K 和 W_V。", { left: 108, top: 563, width: 1060, height: 20 }, { fontSize: 15, color: P.muted, align: "center" });
  addSource(slide, "来源：基础算术；normalized_slide_data.json::architecture");
  addNotes(slide, 11, "沿用上一页的玩具权重，输出向量等于三个 Value 向量按权重的加权和。计算后得到 [7/6, 5/3]，输出宽度仍为二维。真实单头中 Value 与输出都是 64 维，40 个 head 拼接回 2560 维。预训练时梯度会沿输出回到 A、V 以及前面的投影矩阵。本次分析保持冻结前向。下一页进入 residual 与 SwiGLU。 ");
}

function slide12(presentation) {
  const slide = makeSlide(presentation, 12, "残差和门控 FFN 维持深层计算接口", "Attention 和 SwiGLU 都经缩放残差回到同一条 T × 2560 主干", "模型与注意力");
  addPanel(slide, { left: 76, top: 198, width: 1128, height: 344 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "Xᶩ  ·  T × 2560", { left: 107, top: 236, width: 180, height: 26 }, { fontSize: 20, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
  addArrow(slide, { left: 310, top: 237, width: 50, height: 24 });
  addFlowNode(slide, { left: 382, top: 206, width: 230, height: 122, title: "pre-LN Attention", body: "Q/K LN(2560) → 40×64\nRoPE · SDPA", fill: P.softOrange, accent: P.accent });
  addArrow(slide, { left: 642, top: 250, width: 54, height: 24 });
  addFlowNode(slide, { left: 720, top: 206, width: 220, height: 122, title: "缩放残差", body: "X + Attention / 1.490712", fill: P.softBlue, accent: P.primary, mono: true });
  addArrow(slide, { left: 966, top: 250, width: 48, height: 24 });
  addText(slide, "X′  ·  T × 2560", { left: 1026, top: 236, width: 150, height: 26 }, { fontSize: 18, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
  addText(slide, "同样的接口进入第二个子层", { left: 436, top: 354, width: 420, height: 22 }, { fontSize: 16, color: P.muted, align: "center" });
  addFlowNode(slide, { left: 382, top: 400, width: 230, height: 112, title: "pre-LN SwiGLU", body: "2560 → 6912 → 2560\n非线性特征组合", fill: P.softGreen, accent: P.success });
  addArrow(slide, { left: 642, top: 442, width: 54, height: 24 });
  addFlowNode(slide, { left: 720, top: 400, width: 220, height: 112, title: "缩放残差", body: "X′ + FFN / 1.490712", fill: P.softBlue, accent: P.primary, mono: true });
  addText(slide, "identity 通路保留输入并为预训练梯度提供直接路径。", { left: 75, top: 574, width: 1128, height: 24 }, { fontSize: 18, color: P.text, align: "center" });
  addSource(slide, "来源：normalized_slide_data.json::architecture；installed esm block / FFN 代码");
  addNotes(slide, 12, "每个 block 的两条子路径都从 pre-LN 开始，并通过缩放 residual 回到 T 乘 2560 接口。缩放因子为根号 80 除以 36，约 1.490712。SwiGLU 先扩展到 6912 维，再映射回 2560。identity 通路帮助预训练阶段的梯度穿过深层堆叠。本次只读取冻结模型的前向输出。下一页转向掩码预测的预训练原理。 ");
}

function slide13(presentation) {
  const slide = makeSlide(presentation, 13, "掩码预测通过交叉熵学习上下文", "预训练目标将被遮挡位置的真实氨基酸转成可微的训练信号", "训练原理");
  const stages = [
    ["原序列", "… A G F …", P.softBlue, P.primary], ["遮挡输入", "… A <mask> F …", P.softRed, P.error], ["logits", "64 个词元分数", P.softOrange, P.accent], ["真实标签", "G", P.softGreen, P.success], ["交叉熵", "𝓛 = −log p(G)", P.softBlue, P.primary],
  ];
  let x = 52;
  stages.forEach(([title, body, fill, accent], index) => {
    addFlowNode(slide, { left: x, top: 236, width: 205, height: 112, title, body, fill, accent, mono: index !== 0 });
    if (index < stages.length - 1) addArrow(slide, { left: x + 211, top: 279, width: 28, height: 22 }, { fill: P.primary });
    x += 239;
  });
  addPanel(slide, { left: 52, top: 402, width: 560, height: 156 }, { fill: P.surface, line: P.border, radius: 12 });
  addToyTag(slide, 76, 420);
  addText(slide, "p(true)=0.7  →  −ln(0.7)=0.357", { left: 79, top: 464, width: 500, height: 27 }, { fontSize: 21, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
  addText(slide, "p(true)=0.1  →  −ln(0.1)=2.303", { left: 79, top: 505, width: 500, height: 27 }, { fontSize: 21, bold: true, color: P.error, typeface: FONT.mono, align: "center" });
  addPanel(slide, { left: 650, top: 402, width: 580, height: 156 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "梯度方向", { left: 680, top: 423, width: 160, height: 22 }, { fontSize: 19, bold: true, color: P.success });
  addText(slide, "∂𝓛 / ∂logit = p − y\nθ ← θ − η · grad", { left: 776, top: 456, width: 350, height: 57 }, { fontSize: 22, bold: true, color: P.text, typeface: FONT.mono, align: "center" });
  addText(slide, "本次 GFP 运行采用 inference_mode，仅执行前向。", { left: 680, top: 527, width: 490, height: 20 }, { fontSize: 15, color: P.muted, align: "center" });
  addSource(slide, "来源：官方预训练原理；本地 runner 使用 inference_mode");
  addNotes(slide, 13, "这页说明 ESMC 的预训练信号。训练时把一个位置遮挡，模型在该位置输出词元 logits，交叉熵将真实氨基酸的预测偏差变成 loss。玩具例子显示正确概率从 0.7 降到 0.1 时 loss 上升。理论上梯度经 logits 回传到输出头、block 和 embedding 参数。本次 GFP 运行启用 inference_mode，因此只复用已有权重。下一页解释旧 checkpoint 的加载接口。 ");
}

function slide14(presentation) {
  const slide = makeSlide(presentation, 14, "旧权重与当前接口通过键名适配加载", "完成状态支持本次加载路径，跨实现数值等价性保留为单独校准任务", "运行与兼容性");
  addPanel(slide, { left: 50, top: 197, width: 540, height: 314 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "旧 checkpoint", { left: 78, top: 224, width: 180, height: 24 }, { fontSize: 20, bold: true, color: P.primary });
  addText(slide, "biohub/esmc-6b-2024-12\nrevision ffd268e4…", { left: 80, top: 267, width: 450, height: 54 }, { fontSize: 21, bold: true, color: P.text, typeface: FONT.mono });
  addText(slide, "adapter 覆盖旧 LayerNorm / MLP suffix。安装的 loader 对 missing、unexpected、dropped 条目抛出错误。", { left: 80, top: 355, width: 450, height: 75 }, { fontSize: 16, color: P.muted });
  addPanel(slide, { left: 642, top: 197, width: 588, height: 314 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "需要下一轮校准的接口项", { left: 672, top: 224, width: 340, height: 24 }, { fontSize: 20, bold: true, color: P.accent });
  addText(slide, "• 官方输出 numerical parity 基线\n• SDPA / pure-PyTorch 与 fused kernel 对照\n• 跨实现数值与 MLM baseline 校准", { left: 674, top: 269, width: 500, height: 124 }, { fontSize: 17, color: P.text });
  addText(slide, "config=31 是遗留序列化字段。本次遮挡使用 tokenizer <mask>=32。", { left: 666, top: 422, width: 530, height: 31 }, { fontSize: 14, color: P.success, bold: true, align: "center" });
  addFact(slide, { left: 50, top: 526, width: 1180, height: 91, heading: "证据边界", accent: P.error, body: "当前工件记录本实现下的完成运行。它尚未提供与旧 GitHub 实现或当前推荐 checkpoint 的官方数值等价比较。", bodySize: 15 });
  addSource(slide, "来源：EVIDENCE_AUDIT.md；run_metadata.json；installed esm 警告与 runner");
  addNotes(slide, 14, "本页把加载成功和跨实现等价分开。完成 metadata 与 strict loader 行为支持本次旧 checkpoint 加载路径。当前材料没有官方输出 parity 基线。当前安装包使用 SDPA 和 pure-PyTorch fallback，数值差异需要在独立基线实验中量化。config 中记录 31 是遗留序列化字段，实际 tokenizer 的 mask ID 为 32，runner 使用 tokenizer 的 32。跨实现数值和 MLM baseline 是待校准项目，mask 字段不作为本次遮挡结果的错误归因。下一页说明 16GB GPU 上的分阶段加载。 ");
}

function slide15(presentation) {
  const slide = makeSlide(presentation, 15, "分阶段加载让本次计算容纳于 16GB GPU", "两个 6B 阶段顺序运行并释放，第 60 层 SAE 在第二阶段附加", "运行与兼容性");
  const rows = [
    ["阶段 1", "ESMC 6B", "H 导出 + 238 次遮挡", P.softBlue, P.primary],
    ["释放", "释放 dense model", "记录 GPU 状态采样点", P.softRed, P.error],
    ["阶段 2", "fresh ESMC 6B + SAE", "layer 60 稀疏激活导出", P.softGreen, P.success],
    ["完成", "释放模型", "保存 CSV、NPZ、metadata", P.softOrange, P.accent],
  ];
  let top = 204;
  rows.forEach(([stage, model, task, fill, accent], index) => {
    addAccentLabel(slide, stage, { left: 70, top: top + 22, width: 96, fill, color: accent });
    addFlowNode(slide, { left: 206, top, width: 330, height: 74, title: model, body: task, fill, accent });
    if (index < rows.length - 1) addArrow(slide, { left: 566, top: top + 24, width: 65, height: 24 }, { fill: P.primary });
    addText(slide, index === 0 ? "BF16 · batch 1 · device_map=auto" : index === 1 ? "allocated 9.1 MiB（采样）" : index === 2 ? "SAE layer 60 · k=64" : "", { left: 665, top: top + 26, width: 440, height: 20 }, { fontSize: 16, color: P.muted, typeface: FONT.mono });
    top += 92;
  });
  addPanel(slide, { left: 70, top: 565, width: 1100, height: 52 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "硬件：RTX 5080 Laptop GPU。allocated 采样为 12,215.5 MiB（11.93 GiB），dense release 后为 9.1 MiB。", { left: 95, top: 575, width: 1050, height: 18 }, { fontSize: 14, color: P.text, align: "center" });
  addText(slide, "metadata 记录各阶段显存采样点，页面不将采样点解释为峰值显存。", { left: 95, top: 596, width: 1050, height: 16 }, { fontSize: 13, color: P.muted, align: "center" });
  addSource(slide, "来源：run_metadata.json；run_esmc_site_pipeline.py");
  addNotes(slide, 15, "16GB GPU 上的运行采用两个顺序阶段。第一阶段加载 ESMC 6B，导出 H 并完成逐残基遮挡。程序释放 dense model 后，再加载 fresh ESMC 6B 和 layer 60 SAE。metadata 提供阶段性 GPU 采样，采样点不代表连续峰值。BF16、batch 1 和 device_map=auto 均记录在 manifest。下一页具体展开一次遮挡。 ");
}

function slide16(presentation) {
  const slide = makeSlide(presentation, 16, "每次遮挡只改变一个残基位置", "单点遮挡保持 token 长度 T 不变，并在该位置读取 20 个标准氨基酸的条件分布", "运行与评分");
  addPanel(slide, { left: 52, top: 196, width: 1176, height: 128 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "… V T T F S Y G V Q C …", { left: 91, top: 226, width: 406, height: 28 }, { fontSize: 22, bold: true, color: P.text, typeface: FONT.mono, align: "center" });
  addArrow(slide, { left: 526, top: 228, width: 80, height: 26 });
  addText(slide, "… V T T F <mask> Y G V Q C …", { left: 630, top: 226, width: 500, height: 28 }, { fontSize: 21, bold: true, color: P.error, typeface: FONT.mono, align: "center" });
  addText(slide, "示例位置 i。真实运行循环 i = 1…238。", { left: 95, top: 276, width: 1020, height: 20 }, { fontSize: 15, color: P.muted, align: "center" });
  addFlowNode(slide, { left: 74, top: 392, width: 236, height: 126, title: "保持长度", body: "T = 240\n仅替换 tᵢ 的 input_id", fill: P.softBlue, accent: P.primary, mono: true });
  addArrow(slide, { left: 326, top: 442, width: 44, height: 24 });
  addFlowNode(slide, { left: 394, top: 392, width: 236, height: 126, title: "模型输出", body: "logits at tᵢ\n读取 20 个标准 AA", fill: P.softOrange, accent: P.accent });
  addArrow(slide, { left: 646, top: 442, width: 44, height: 24 });
  addFlowNode(slide, { left: 714, top: 392, width: 236, height: 126, title: "条件偏好", body: "mᵢ = logp(aᵢ) − best alternative", fill: P.softGreen, accent: P.success, mono: true });
  addArrow(slide, { left: 966, top: 442, width: 44, height: 24 });
  addFlowNode(slide, { left: 1034, top: 392, width: 170, height: 126, title: "辅助量", body: "entropy\n完整 CSV", fill: P.softBlue, accent: P.primary });
  addText(slide, "当前 tokenizer 的 <mask> ID 为 32。runner 优先读取 tokenizer.mask_token_id。", { left: 74, top: 558, width: 1100, height: 21 }, { fontSize: 16, color: P.text, align: "center" });
  addSource(slide, "来源：run_esmc_site_pipeline.py::masked_residue_scan；normalized_slide_data.json::tokenization");
  addNotes(slide, 16, "单点遮挡把一个残基 token 替换为 tokenizer 的 <mask>，其 ID 为 32。每次输入保持 240 个 token，只有 t_i 的 input ID 改变。模型在同一个 token 位置输出 logits，runner 只在 20 个标准氨基酸上重新归一化。循环覆盖 238 个 FASTA 位置。下一页用 G24 的真实数值解释条件偏好。 ");
}

function slide17(presentation) {
  const slide = makeSlide(presentation, 17, "G24 的条件偏好为 0.78125", "原残基的条件 log probability 高于所有替代氨基酸中的最佳者", "运行与评分");
  addPanel(slide, { left: 52, top: 194, width: 1176, height: 78 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "mᵢ = logp(aᵢ) − max_{b∈替代集合} logp(b)", { left: 140, top: 217, width: 1000, height: 30 }, { fontSize: 24, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
  addPanel(slide, { left: 52, top: 320, width: 520, height: 218 }, { fill: P.softBlue, line: P.border, radius: 12 });
  addText(slide, "G24 的实际 logp", { left: 80, top: 346, width: 260, height: 24 }, { fontSize: 20, bold: true, color: P.primary });
  addText(slide, "logp(G24) = −1.72166967", { left: 82, top: 398, width: 455, height: 29 }, { fontSize: 22, bold: true, color: P.text, typeface: FONT.mono, align: "center" });
  addPanel(slide, { left: 656, top: 320, width: 572, height: 218 }, { fill: P.softOrange, line: P.border, radius: 12 });
  addText(slide, "最佳替代氨基酸", { left: 685, top: 346, width: 260, height: 24 }, { fontSize: 20, bold: true, color: P.accent });
  addText(slide, "K  ·  logp(K) = −2.50291967", { left: 686, top: 398, width: 500, height: 29 }, { fontSize: 22, bold: true, color: P.text, typeface: FONT.mono, align: "center" });
  addArrow(slide, { left: 546, top: 420, width: 86, height: 26 });
  addText(slide, "m₂₄ = 0.78125", { left: 410, top: 561, width: 460, height: 35 }, { fontSize: 28, bold: true, color: P.success, typeface: FONT.mono, align: "center" });
  addText(slide, "单位是 natural-log margin。该值刻画遮挡后模型对原残基的相对偏好。", { left: 160, top: 610, width: 960, height: 20 }, { fontSize: 16, color: P.muted, align: "center" });
  addSource(slide, "来源：candidate_sites_all.csv，position 24；EVIDENCE_AUDIT.md");
  addNotes(slide, 17, "G24 是完整排序中的第二名。本页计算条件偏好 m_24。遮挡 G24 后，原始 G 的条件 log probability 为负 1.72166967，最佳替代 K 为负 2.50291967。二者相减得到正 0.78125。正值表示当前模型在该遮挡上下文中更偏好原残基。这个数值是 natural-log margin，不能直接替代突变效应或功能强度。下一页再解释局部新颖度。 ");
}

function slide18(presentation) {
  const slide = makeSlide(presentation, 18, "局部新颖度比较残基与两侧邻居", "nᵢ 使用上下文向量与窗口均值的余弦距离，G24 的 n₂₄ 为 0.1674523", "运行与评分");
  addPanel(slide, { left: 50, top: 194, width: 700, height: 354 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "示意二维投影", { left: 77, top: 218, width: 200, height: 22 }, { fontSize: 19, bold: true, color: P.primary });
  addRule(slide, 146, 466, 420, { color: P.border, weight: 1 });
  slide.shapes.add({ geometry: "line", position: { left: 146, top: 270, width: 0, height: 196 }, fill: "none", line: { style: "solid", fill: P.border, width: 1 } });
  [[220, 330], [276, 390], [335, 348], [410, 410], [465, 320]].forEach(([left, top]) => slide.shapes.add({ geometry: "ellipse", position: { left, top, width: 12, height: 12 }, fill: P.softBlue, line: { fill: P.primary, width: 1 } }));
  slide.shapes.add({ geometry: "ellipse", position: { left: 360, top: 302, width: 22, height: 22 }, fill: P.softOrange, line: { fill: P.accent, width: 2 } });
  addText(slide, "h₂₄", { left: 385, top: 300, width: 50, height: 18 }, { fontSize: 14, color: P.accent, bold: true, typeface: FONT.mono });
  addText(slide, "邻域 hⱼ（示意）", { left: 480, top: 430, width: 150, height: 18 }, { fontSize: 13, color: P.muted });
  addPanel(slide, { left: 790, top: 194, width: 440, height: 354 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "nᵢ = 1 − cos(hᵢ, mean neighbors)", { left: 815, top: 238, width: 390, height: 29 }, { fontSize: 20, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
  addFact(slide, { left: 820, top: 300, width: 380, height: 83, heading: "窗口", accent: P.accent, body: "±5 个邻居，边界位置使用可用的截断窗口。" });
  addFact(slide, { left: 820, top: 401, width: 380, height: 83, heading: "数值含义", accent: P.success, body: "cos=1 时 n=0。cos=0 时 n=1。G24 的 n=0.1674523。" });
  addText(slide, "示意图只解释计算关系，不代表真实高维 h 的二维投影。", { left: 160, top: 580, width: 960, height: 22 }, { fontSize: 16, color: P.muted, align: "center" });
  addSource(slide, "来源：candidate_sites_all.csv；run_esmc_site_pipeline.py::local_contextual_novelty");
  addNotes(slide, 18, "条件偏好只反映遮挡恢复。局部新颖度从保存的 h_i 出发，比较 h_i 与两侧最多五个邻居的均值向量。余弦为 1 时方向一致，n 为 0；余弦为 0 时 n 为 1。G24 的实际 n 值为 0.1674523。图中点位只是二维计算示意，真实向量宽度为 2560。下一页把 m 和 n 合成候选分数。 ");
}

function slide19(presentation) {
  const slide = makeSlide(presentation, 19, "综合评分保留两个分量与标准化规则", "sᵢ 将裁剪后的条件偏好与局部新颖度按 0.7 / 0.3 合成，仅用于本蛋白候选排序", "运行与评分");
  addPanel(slide, { left: 50, top: 191, width: 1180, height: 78 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "sᵢ = 0.7 · z(max(mᵢ, 0)) + 0.3 · z(nᵢ)", { left: 112, top: 216, width: 1050, height: 30 }, { fontSize: 24, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
  addFact(slide, { left: 50, top: 319, width: 354, height: 188, heading: "条件偏好分量", accent: P.accent, fill: P.softOrange, body: "28 个正 margin，210 个负 margin。裁剪后 median=0、MAD=0，因此 z 使用标准差回退。selected scale=0.2061997034。", bodySize: 16 });
  addFact(slide, { left: 438, top: 319, width: 354, height: 188, heading: "新颖度分量", accent: P.success, fill: P.softGreen, body: "n 使用 MAD scale=0.0270947251。210 个负 margin 裁剪后 z=0，相对顺序完全由新颖度项决定。", bodySize: 16 });
  addFact(slide, { left: 826, top: 319, width: 404, height: 188, heading: "排名用途", accent: P.primary, fill: P.softBlue, body: "权重 0.7 / 0.3 是初始启发设置。当前排名仅由条件偏好和新颖度计算，SAE 用于事后解释。", bodySize: 16 });
  addPanel(slide, { left: 110, top: 547, width: 1060, height: 54 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "z(u) = (u − median) / scale。MAD 退化时 runner 选择 std 作为 scale。", { left: 138, top: 563, width: 1000, height: 22 }, { fontSize: 17, color: P.text, typeface: FONT.mono, align: "center" });
  addSource(slide, "来源：normalized_slide_data.json::score_data.statistics；run_esmc_site_pipeline.py::robust_z");
  addNotes(slide, 19, "本页合成两个分量。条件偏好先裁剪到非负值，再做 robust z。28 个位置为正，210 个为负。裁剪后中位数和 MAD 都为零，runner 因而使用标准差 0.2061997034 作为 fallback scale。210 个负 margin 在裁剪后 z=0，它们的相对顺序完全由新颖度项决定。新颖度的 MAD scale 为 0.0270947251。最终 s 以 0.7 和 0.3 组合两个 z 分数。当前排名仅由条件偏好和新颖度计算，SAE 用于事后解释。下一页查看全长曲线。 ");
}

function slide20(presentation) {
  const slide = makeSlide(presentation, 20, "全长曲线显示候选信号集中位置", "238 个位置的综合分数保留完整纵轴，端点 M1 与内部候选共同可见", "候选排名");
  const series = D.score_data.p20_score_series;
  const chart = slide.charts.add("line", {
    position: { left: 50, top: 194, width: 780, height: 378 },
    categories: series.map((row) => String(row.position)),
    series: [{ name: "综合分数 s", values: series.map((row) => chartValue(row.model_candidate_score)), line: { style: "solid", fill: P.primary, width: 2 }, marker: { symbol: "none", size: 2 } }],
    lineOptions: { smooth: false }, hasLegend: false,
    xAxis: { tickLabelPosition: "none", line: { style: "solid", fill: P.border, width: 1 }, majorGridlines: null },
    yAxis: { title: "综合分数 s", min: -1, max: 12, majorUnit: 2, textStyle: { typeface: FONT.chinese, fontSize: 14, fill: P.muted }, majorGridlines: { style: "solid", fill: P.border, width: 1 }, line: { style: "solid", fill: P.border, width: 1 } },
    chartFill: P.surface, plotAreaFill: P.surface,
  });
  applyPresentationChartFont(chart, { fontFamily: FONT.chinese });
  addText(slide, "1", { left: 104, top: 582, width: 22, height: 16 }, { fontSize: 12, color: P.muted, typeface: FONT.latin, align: "center" });
  addText(slide, "65–67", { left: 278, top: 582, width: 58, height: 16 }, { fontSize: 12, color: P.error, typeface: FONT.latin, align: "center" });
  addText(slide, "238", { left: 793, top: 582, width: 42, height: 16 }, { fontSize: 12, color: P.muted, typeface: FONT.latin, align: "center" });
  addRect(slide, { left: 306, top: 569, width: 2, height: 9 }, P.error);
  addText(slide, "FASTA position", { left: 370, top: 610, width: 260, height: 16 }, { fontSize: 12, color: P.muted, typeface: FONT.latin, align: "center" });
  addFact(slide, { left: 866, top: 194, width: 364, height: 117, heading: "最高端点", accent: P.accent, fill: P.softOrange, body: "M1 = 10.985。起始位置的高分需要单独做端点敏感性检查。", bodySize: 16 });
  addFact(slide, { left: 866, top: 332, width: 364, height: 117, heading: "内部候选", accent: P.primary, fill: P.softBlue, body: "G24 = 3.423，是内部位点中排名最高的候选。", bodySize: 16 });
  addFact(slide, { left: 866, top: 470, width: 364, height: 117, heading: "读图边界", accent: P.success, fill: P.softGreen, body: "曲线来自单蛋白与当前权重设置。它展示候选分布，功能判断需独立证据。", bodySize: 16 });
  addSource(slide, "来源：normalized_slide_data.json::score_data.p20_score_series；candidate_sites_all.csv");
  addNotes(slide, 20, "图中以真实 238 个位置绘制综合分数。M1 是最高端点，G24 是内部最高候选。65 到 67 的发色团相关位置位于后段。图展示的是两个评分分量和当前权重组合后的候选分布。端点效应、窗口和跨蛋白稳定性都需要后续敏感性分析。下一页列出完整 Top10。 ");
}

function slide21(presentation) {
  const slide = makeSlide(presentation, 21, "前十名由 M1 和多个内部残基组成", "Top10 保留 rank、位点、条件偏好、局部新颖度和综合分数的精确三位小数", "候选排名");
  const top10 = D.score_data.p21_top10;
  const rows = top10.map((row) => [String(row.rank), `${row.residue}${row.position}`, Number(row.conditional_preference).toFixed(3), Number(row.contextual_novelty).toFixed(3), Number(row.model_candidate_score).toFixed(3)]);
  const highlights = new Map([["0:1", P.softOrange], ["1:1", P.softBlue]]);
  addNativeTable(slide, { left: 50, top: 190, width: 850, height: 403, headers: ["rank", "site", "margin", "novelty", "score"], rows, columnWidths: [110, 145, 185, 185, 225], fontSize: 15, highlights });
  addFact(slide, { left: 936, top: 190, width: 294, height: 121, heading: "M1", accent: P.accent, fill: P.softOrange, body: "10.985。最高端点候选保留在全表，并单独检查端点信号。", bodySize: 16 });
  addFact(slide, { left: 936, top: 335, width: 294, height: 121, heading: "G24", accent: P.primary, fill: P.softBlue, body: "3.423。当前内部最高候选。", bodySize: 16 });
  addFact(slide, { left: 936, top: 480, width: 294, height: 121, heading: "排序范围", accent: P.success, fill: P.softGreen, body: "每一行来自 238 位置完整筛查。rank 是顺序指标。", bodySize: 16 });
  addSource(slide, "来源：normalized_slide_data.json::score_data.p21_top10；candidate_sites_all.csv");
  addNotes(slide, 21, "这里保留 Top10 的完整十行，而非只显示前几个亮点。M1 的分数最高，G24 是内部候选的最高项。表中 margin 和 novelty 是前页定义的原始分量，score 是二者 z 标准化后的加权组合。排名仅在本次 238 位置筛查范围内成立。下一页聚焦 M1 的端点信号。 ");
}

function slide22(presentation) {
  const slide = makeSlide(presentation, 22, "M1 的高分提示端点信号需要单独检查", "原始排序保留 M1，同时将去除端点和更换窗口列为后续敏感性分析", "候选排名");
  const bars = D.score_data.p22_bars;
  const chart = slide.charts.add("bar", {
    position: { left: 50, top: 200, width: 730, height: 350 }, categories: bars.map((row) => row.site),
    series: [{ name: "综合分数", values: bars.map((row) => chartValue(row.score)), fill: P.primary, points: [{ idx: 0, fill: P.accent }, { idx: 1, fill: P.primary }, { idx: 2, fill: P.primary }, { idx: 3, fill: P.primary }, { idx: 4, fill: P.primary }] }],
    barOptions: { direction: "bar", grouping: "clustered", gapWidth: 42 }, hasLegend: false,
    xAxis: { title: "综合分数 s", min: 0, max: 12, majorUnit: 2, textStyle: { typeface: FONT.chinese, fontSize: 14, fill: P.muted }, majorGridlines: { style: "solid", fill: P.border, width: 1 }, line: { style: "solid", fill: P.border, width: 1 } },
    yAxis: { textStyle: { typeface: FONT.latin, fontSize: 16, fill: P.text, bold: true }, line: { style: "solid", fill: P.border, width: 1 } },
    dataLabels: { showValue: true, position: "outEnd", textStyle: { typeface: FONT.latin, fontSize: 14, fill: P.text, bold: true } }, chartFill: P.surface, plotAreaFill: P.surface,
  });
  applyPresentationChartFont(chart, { fontFamily: FONT.chinese });
  addFact(slide, { left: 820, top: 200, width: 410, height: 128, heading: "观察", accent: P.accent, fill: P.softOrange, body: "M1 是起始甲硫氨酸，分数显著高于内部候选。当前图保留原始计算结果。", bodySize: 16 });
  addFact(slide, { left: 820, top: 350, width: 410, height: 128, heading: "下一步", accent: P.primary, fill: P.softBlue, body: "去除端点、改变 novelty window 与比较更多蛋白可检验排名敏感性。", bodySize: 16 });
  addFact(slide, { left: 820, top: 500, width: 410, height: 91, heading: "边界", accent: P.error, fill: P.softRed, body: "当前工件未执行这些敏感性分析。", bodySize: 16 });
  addSource(slide, "来源：normalized_slide_data.json::score_data.p22_bars；candidate_sites_all.csv");
  addNotes(slide, 22, "M1 的 10.985 是当前最高分。M1 位于序列端点，端点统计特征可能影响局部比较和排名。本页保留原始结果，同时把去除端点、改变窗口和跨蛋白比较列为后续分析。当前运行没有执行这些 ablation。下一页把 G24 与发色团控制位点放在同一排序尺度。 ");
}

function slide23(presentation) {
  const slide = makeSlide(presentation, 23, "已知发色团残基位于排名后段", "同一 238 位点筛查中，G24 排名第 2，S65–Y66–G67 分别位于后段", "候选排名");
  const chartRows = [...D.score_data.p23_rank_comparison].reverse();
  const chart = slide.charts.add("bar", {
    position: { left: 50, top: 192, width: 700, height: 390 }, categories: chartRows.map((row) => row.site),
    series: [{ name: "筛查排名", values: chartRows.map((row) => Number(row.rank)), fill: P.primary, points: [{ idx: 0, fill: P.error }, { idx: 1, fill: P.error }, { idx: 2, fill: P.error }, { idx: 3, fill: P.primary }] }],
    barOptions: { direction: "bar", grouping: "clustered", gapWidth: 46 }, hasLegend: false,
    xAxis: { min: 0, max: 238, majorUnit: 50, title: "rank（数值小者靠前）", textStyle: { typeface: FONT.chinese, fontSize: 13, fill: P.muted }, majorGridlines: { style: "solid", fill: P.border, width: 1 }, line: { style: "solid", fill: P.border, width: 1 } },
    yAxis: { textStyle: { typeface: FONT.chinese, fontSize: 16, fill: P.text, bold: true }, line: { style: "solid", fill: P.border, width: 1 } },
    dataLabels: { showValue: true, position: "outEnd", textStyle: { typeface: FONT.chinese, fontSize: 14, fill: P.text, bold: true } }, chartFill: P.surface, plotAreaFill: P.surface,
  });
  applyPresentationChartFont(chart, { fontFamily: FONT.chinese });
  addFact(slide, { left: 780, top: 192, width: 452, height: 184, heading: "控制位点的读法", accent: P.error, fill: P.softRed, body: "S65–Y66–G67 是 GFP 发色团形成相关的已知残基。它们的 rank 分别为 225、223、211。", bodySize: 16 });
  addFact(slide, { left: 780, top: 398, width: 452, height: 184, heading: "结论边界", accent: P.success, fill: P.softGreen, body: "排名是本蛋白、当前窗口与权重设置下的顺序指标。功能判断需要独立实验、基准对照或多蛋白校准数据。", bodySize: 16 });
  addText(slide, "蓝色标出内部高位候选 G24。红色标出三个位于后段的发色团相关位点。", { left: 86, top: 602, width: 636, height: 19 }, { fontSize: 13, color: P.muted, align: "center" });
  addSource(slide, "来源：normalized_slide_data.json::score_data.p23_rank_comparison；UniProt P42212；RCSB PDB 1EMA");
  addNotes(slide, 23, "本页把发色团相关位点放在同一份 238 位点排序中。G24 的 rank 为 2。S65、Y66、G67 的 rank 分别为 225、223、211，且三个综合分数为负。图的横轴是原始 rank，数值小者更靠前。这个控制观察描述本次模型、窗口和权重组合下的排序。功能判断还需要独立证据。下一页转向 SAE。 ");
}

function slide24(presentation) {
  const slide = makeSlide(presentation, 24, "SAE 将第60层向量编码为稀疏特征", "每条 2560 维输入向量即时标准化后，经编码、ReLU 与 TopK 产生 64 个保留特征", "SAE 解释");
  const nodes = [
    ["h₆₀", "1 × 2560\n中间 residual stream", P.softBlue, P.primary],
    ["即时 z-score", "按该向量末维\nmean / std", P.softOrange, P.accent],
    ["encoder", "x − b_dec\nW_enc: 2560×16384", P.softBlue, P.primary],
    ["ReLU + TopK", "feature last dim\nk=64", P.softGreen, P.success],
    ["decoder", "W_dec: 16384×2560\n+b_dec", P.softOrange, P.accent],
  ];
  let x = 43;
  nodes.forEach(([title, body, fill, accent], index) => {
    addFlowNode(slide, { left: x, top: 244, width: 207, height: 136, title, body, fill, accent, mono: index !== 3 });
    if (index < nodes.length - 1) addArrow(slide, { left: x + 211, top: 298, width: 24, height: 22 });
    x += 237;
  });
  addPanel(slide, { left: 100, top: 448, width: 1080, height: 128 }, { fill: P.surface, line: P.border, radius: 12 });
  addText(slide, "h̃ = (h − mean(h)) / (std(h) + ε)", { left: 142, top: 470, width: 600, height: 27 }, { fontSize: 21, bold: true, color: P.primary, typeface: FONT.mono, align: "center" });
  addText(slide, "get_sae_output：240×16384 sparse output（含 <cls>、<eos>）→ runner 筛选 238 个 residue rows。", { left: 155, top: 512, width: 970, height: 22 }, { fontSize: 16, color: P.text, align: "center" });
  addText(slide, "W_enc、W_dec 与 b_dec 由 SAE 训练得到。b_enc 未出现。raw activation 导出，optional IDF/max normalization 默认关闭。", { left: 155, top: 544, width: 970, height: 20 }, { fontSize: 14, color: P.muted, align: "center" });
  addSource(slide, "来源：normalized_slide_data.json::sae_data；官方 sae.py 审计；run_metadata.json");
  addNotes(slide, 24, "SAE 从 layer 60 的每条 2560 维表示开始。实现对每条输入向量沿末维计算即时 mean 与 std，再执行 z-score。随后减去 b_dec，经 W_enc、ReLU 和 feature 维度的 TopK 保留 64 个条目。W_dec 独立于 W_enc，并加回 b_dec 重建表示。本次 B=1、T=240 且没有 padding，get_sae_output 先展平并返回 240 乘 16384 的 sparse output，其中含 cls 和 eos。runner 随后筛选 238 个 residue rows 导出。当前导出保持 raw activation，逐 feature 的 IDF 或 max 归一化默认关闭。SAE 训练过程属于已有模型背景，本次使用冻结推理。下一页把稀疏结果的形状写清。 ");
}

function slide25(presentation) {
  const slide = makeSlide(presentation, 25, "每个残基保留 64 个非零 SAE 激活", "240 个 nonpadding token 先经 SAE，runner 导出 238 个 residue row 的 238 × 64 条激活", "SAE 解释");
  addText(slide, "玩具 6×12 局部列", { left: 53, top: 188, width: 220, height: 22 }, { fontSize: 18, bold: true, color: P.primary });
  addToyTag(slide, 267, 185);
  const gridLeft = 85; const gridTop = 234;
  for (let r = 0; r < 6; r += 1) {
    addText(slide, `pos ${r + 1}`, { left: 31, top: gridTop + r * 42 + 12, width: 46, height: 15 }, { fontSize: 12, color: P.muted, typeface: FONT.latin, align: "right" });
    for (let c = 0; c < 12; c += 1) {
      const active = (c === (r * 2) % 12) || (c === (r * 2 + 5) % 12);
      addMatrixCell(slide, { left: gridLeft + c * 41, top: gridTop + r * 42, value: active ? "•" : "", fill: active ? P.softOrange : P.surface, color: P.accent, width: 32, height: 31 });
    }
  }
  addText(slide, "示例 k_demo = 2 / row", { left: 75, top: 503, width: 260, height: 19 }, { fontSize: 14, color: P.accent, typeface: FONT.mono });
  addPanel(slide, { left: 620, top: 220, width: 610, height: 323 }, { fill: P.surface, line: P.border, radius: 12 });
  addMetric(slide, { left: 650, top: 250, width: 170, value: "238", label: "residue rows", note: "FASTA positions", accent: P.primary, fill: P.softBlue });
  addMetric(slide, { left: 845, top: 250, width: 170, value: "64", label: "real k", note: "每残基保留", accent: P.success, fill: P.softGreen });
  addMetric(slide, { left: 1040, top: 250, width: 160, value: "16,384", label: "K codebook", note: "feature IDs", accent: P.accent, fill: P.softOrange });
  addText(slide, "runner 导出：238 × 64 = 15,232 条 activation。活跃 feature ID 数量为 1,134。", { left: 640, top: 410, width: 580, height: 48 }, { fontSize: 19, bold: true, color: P.text, align: "center" });
  addText(slide, "玩具矩阵只展示 12 个局部列。真实 codebook 有 16,384 列。", { left: 658, top: 478, width: 540, height: 20 }, { fontSize: 15, color: P.muted, align: "center" });
  addFact(slide, { left: 72, top: 548, width: 1158, height: 78, heading: "术语区分", accent: P.success, body: "k=64 是每个残基的稀疏度。1,134 是本次 238 个残基中出现过的不同 feature ID 数量。", bodySize: 15 });
  addSource(slide, "来源：normalized_slide_data.json::sae_data；sae_residue_activations.csv");
  addNotes(slide, 25, "左侧矩阵是玩具 6 乘 12 局部列，每行只保留 k_demo 为 2 的两个值。实际 get_sae_output 先处理 240 个 nonpadding token，其中包括 cls 和 eos。runner 再筛选 238 个残基行。真实 SAE 的 codebook 有 16,384 个 feature ID，每个残基保留 k 为 64 个非零激活。因此导出的 238 个残基产生 15,232 条长表记录。不同 feature ID 的数量为 1,134。k 与 unique feature ID 是不同计数。下一页用 feature ID 将激活表接到官方描述。 ");
}

function slide26(presentation) {
  const slide = makeSlide(presentation, 26, "特征编号把激活表连接到描述来源", "position × feature_id × activation 与 feature_id 描述表 join，形成可追踪的解释入口", "SAE 解释");
  const rows = [
    ["激活表", "position", "24", "残基位置"],
    ["激活表", "feature_id", "13094", "SAE 词典索引"],
    ["激活表", "activation", "4.6875", "本次 raw 激活"],
    ["描述表", "feature_id", "13094", "同一索引的描述文本"],
  ];
  addNativeTable(slide, { left: 50, top: 206, width: 645, height: 286, headers: ["表", "字段", "示例", "含义"], rows, columnWidths: [125, 155, 150, 215], fontSize: 15 });
  addArrow(slide, { left: 728, top: 319, width: 88, height: 27 });
  addPanel(slide, { left: 850, top: 207, width: 380, height: 285 }, { fill: P.softGreen, line: P.border, radius: 12 });
  addText(slide, "解释表", { left: 878, top: 235, width: 150, height: 24 }, { fontSize: 21, bold: true, color: P.success });
  addText(slide, "位置 24\nfeature 13094\nraw activation 4.6875\n描述：β 链连接 loop / turn 候选语义", { left: 884, top: 288, width: 300, height: 130 }, { fontSize: 18, color: P.text, typeface: FONT.mono, align: "center" });
  addFact(slide, { left: 50, top: 516, width: 355, height: 96, heading: "覆盖", accent: P.primary, body: "1,134 个活跃 feature ID 均能连接到描述条目。" });
  addFact(slide, { left: 438, top: 516, width: 355, height: 96, heading: "量纲", accent: P.accent, body: "activation 是 raw 数值，跨 feature ID 未校准为置信度。" });
  addFact(slide, { left: 826, top: 516, width: 404, height: 96, heading: "描述状态", accent: P.success, body: "描述提供机制线索。\n部分条目仍通用或含义待核。" });
  addSource(slide, "来源：sae_residue_activations.csv；sae_feature_summary.csv；normalized_slide_data.json::sae_data");
  addNotes(slide, 26, "SAE 的 feature ID 是激活和描述之间的键。激活表记录 position、feature_id 和 raw activation。summary 表按同一个 feature ID 提供描述文本。本次 1,134 个活跃 ID 都有描述条目，因此覆盖完整。描述帮助提出结构或序列语义假设。raw activation 没有跨 feature 校准，不能用大小直接比较置信度。下一页查看 M1 的代表性激活特征。 ");
}

function slide27(presentation) {
  const slide = makeSlide(presentation, 27, "M1 的两个代表性激活特征对应序列起点", "两个 feature 都指向 N 端或 initiator methionine 语义，解释 M1 的端点信号", "SAE 解释");
  const features = D.sae_data.representative_features["1"];
  const rows = [
    [`F${features[0].feature_id}`, Number(features[0].activation).toFixed(4), String(features[0].active_position_count), "可及肽链 N 端与邻近位置"],
    [`F${features[1].feature_id}`, Number(features[1].activation).toFixed(4), String(features[1].active_position_count), "翻译起始 M1 身份"],
  ];
  addNativeTable(slide, { left: 50, top: 204, width: 740, height: 190, headers: ["feature", "activation", "活跃位置数", "描述的中文概括"], rows, columnWidths: [145, 160, 160, 275], fontSize: 16 });
  addPanel(slide, { left: 830, top: 204, width: 400, height: 190 }, { fill: P.softOrange, line: P.border, radius: 12 });
  addText(slide, "M1 位置窗口", { left: 860, top: 232, width: 220, height: 22 }, { fontSize: 19, bold: true, color: P.accent });
  addText(slide, "<cls>  M  S  K  G  E  E  L …", { left: 850, top: 286, width: 350, height: 28 }, { fontSize: 20, bold: true, typeface: FONT.mono, color: P.text, align: "center" });
  addText(slide, "M1 是序列起始甲硫氨酸。", { left: 850, top: 338, width: 350, height: 22 }, { fontSize: 16, color: P.text, align: "center" });
  addFact(slide, { left: 50, top: 440, width: 560, height: 126, heading: "与 ranking 的关系", accent: P.accent, fill: P.softOrange, body: "M1 的综合分数最高。SAE 特征提供端点语义解释，端点敏感性仍需独立检验。", bodySize: 17 });
  addFact(slide, { left: 650, top: 440, width: 580, height: 126, heading: "读数边界", accent: P.error, fill: P.softRed, body: "这两个 feature 是代表性激活特征。raw activation 的大小不作为跨 feature 的置信度比较。", bodySize: 17 });
  addSource(slide, "来源：normalized_slide_data.json::sae_data.representative_features[1]；sae_feature_summary.csv");
  addNotes(slide, 27, "M1 的两个代表性 feature 指向序列起点。一项描述可及链端和邻近位置，另一项明确指向 initiator methionine。M1 的高分和这些语义相互一致，但端点敏感性仍需独立检查。表中 raw activation 用于查表，跨 feature 的数值没有校准。下一页转向内部候选 G24。 ");
}

function slide28(presentation) {
  const slide = makeSlide(presentation, 28, "G24 的稀疏特征符合转角候选语义", "两个代表性特征都描述 β 链连接的 loop / turn 候选，结构记录提供局部编号上下文", "SAE 解释");
  const features = D.sae_data.representative_features["24"];
  const rows = [
    [`F${features[0].feature_id}`, Number(features[0].activation).toFixed(4), String(features[0].active_position_count), "β 链连接 loop / turn 候选"],
    [`F${features[1].feature_id}`, Number(features[1].activation).toFixed(4), String(features[1].active_position_count), "Gly 中心紧凑 β turn / hairpin 候选"],
  ];
  addNativeTable(slide, { left: 50, top: 202, width: 755, height: 190, headers: ["feature", "activation", "活跃位置数", "描述的中文概括"], rows, columnWidths: [145, 160, 160, 290], fontSize: 16 });
  addPanel(slide, { left: 842, top: 202, width: 388, height: 190 }, { fill: P.softBlue, line: P.border, radius: 12 });
  addText(slide, "PDB 编号上下文", { left: 870, top: 228, width: 220, height: 24 }, { fontSize: 19, bold: true, color: P.primary });
  addText(slide, "输入 G24\npolymer label 24\nauthor residue 24\n当前 RCSB：labels 23–24 未分配二级结构", { left: 872, top: 274, width: 330, height: 88 }, { fontSize: 16, color: P.text, align: "center" });
  addFact(slide, { left: 50, top: 440, width: 560, height: 126, heading: "机制假设", accent: P.success, fill: P.softGreen, body: "特征描述与 β 链连接或转角语义相容。它们为 G24 的局部结构解释提供候选线索。", bodySize: 17 });
  addFact(slide, { left: 650, top: 440, width: 580, height: 126, heading: "证据边界", accent: P.error, fill: P.softRed, body: "当前 RCSB 记录将 labels 23–24 标为未分配二级结构。feature 描述不构成 GFP 特异因果结论。", bodySize: 17 });
  addSource(slide, "来源：normalized_slide_data.json::sae_data.representative_features[24]；p30_mapping_table；RCSB 1EMA");
  addNotes(slide, 28, "G24 的两个代表性 feature 都与 beta 链连接、turn 或 hairpin 语义相关。PDB 审计将输入 G24 对到 polymer label 24、author residue 24，当前 RCSB feature 将 labels 23 到 24 标为未分配二级结构。这些信息支持局部结构假设，但不能给出 GFP 特异的因果解释。下一页比较 G40 和 K45 的代表性特征。 ");
}

function slide29(presentation) {
  const slide = makeSlide(presentation, 29, "G40 与 K45 的特征指向 β 结构上下文", "G40 与 K45 的代表性 feature 提供局部 β 结构语义，PDB 记录对两者给出不同的结构状态", "SAE 解释");
  const f40 = D.sae_data.representative_features["40"][0];
  const f45 = D.sae_data.representative_features["45"][0];
  addPanel(slide, { left: 50, top: 204, width: 560, height: 298 }, { fill: P.softBlue, line: P.border, radius: 12 });
  addText(slide, "G40", { left: 80, top: 230, width: 100, height: 28 }, { fontSize: 25, bold: true, color: P.primary, typeface: FONT.mono });
  addText(slide, `F${f40.feature_id}  ·  ${Number(f40.activation).toFixed(4)}`, { left: 198, top: 233, width: 330, height: 24 }, { fontSize: 19, bold: true, color: P.text, typeface: FONT.mono });
  addText(slide, "描述概括：β 链起点与 edge strand，含 loop-to-β junction 候选。", { left: 80, top: 294, width: 480, height: 44 }, { fontSize: 17, color: P.text });
  addText(slide, "PDB：input 40 → label 40。labels 37–40 当前为未分配二级结构。", { left: 80, top: 370, width: 480, height: 44 }, { fontSize: 16, color: P.muted });
  addPanel(slide, { left: 670, top: 204, width: 560, height: 298 }, { fill: P.softGreen, line: P.border, radius: 12 });
  addText(slide, "K45", { left: 700, top: 230, width: 100, height: 28 }, { fontSize: 25, bold: true, color: P.success, typeface: FONT.mono });
  addText(slide, `F${f45.feature_id}  ·  ${Number(f45.activation).toFixed(4)}`, { left: 818, top: 233, width: 330, height: 24 }, { fontSize: 19, bold: true, color: P.text, typeface: FONT.mono });
  addText(slide, "描述概括：ordered β-sheet secondary-structure signal。", { left: 700, top: 294, width: 480, height: 44 }, { fontSize: 17, color: P.text });
  addText(slide, "PDB：input 45 → label 45。labels 41–48 当前为 sheet。", { left: 700, top: 370, width: 480, height: 44 }, { fontSize: 16, color: P.muted });
  addFact(slide, { left: 50, top: 530, width: 1180, height: 86, heading: "结构相容性", accent: P.success, body: "G40 与 K45 的 feature 描述可与局部 β 结构环境对照。两项解释都保留 feature 描述和 PDB 记录之间的证据层级。", bodySize: 15 });
  addSource(slide, "来源：normalized_slide_data.json::sae_data.representative_features；p30_mapping_table；RCSB 1EMA");
  addNotes(slide, 29, "G40 的代表性 feature 指向 beta 边缘和 loop-to-beta junction 候选。PDB 当前记录将 G40 所在 labels 37 到 40 标为未分配。K45 的 feature 指向 ordered beta-sheet，PDB 的 labels 41 到 48 记录为 sheet。两类信息可用于结构相容性检查。feature 描述属于跨蛋白语义，不能直接给出 GFP 功能结论。下一页系统讲清 PDB 编号映射。 ");
}

function slide30(presentation) {
  const slide = makeSlide(presentation, 30, "PDB 位点解释依赖正确的残基编号", "1EMA 是 S65T/Q80R 变体，CRO 将输入 65–67 合并为一条结构记录，后续 polymer label 偏移两位", "结构审计");
  const map = new Map(D.p30_mapping_table.map((row) => [String(row.input_position), row]));
  const selected = [map.get("1"), map.get("24"), map.get("65"), map.get("91"), map.get("173"), map.get("174"), map.get("195")];
  const rows = selected.map((row) => [
    row.input_position === 65 ? "S65/Y66/G67" : `${row.input_residue}${row.input_position}`,
    String(row.polymer_label_seq_id), row.author_seq_num ?? "—", row.polymer_component,
    row.input_position === 65 ? "CRO 合并记录" : row.secondary_structure_from_current_rcsb_feature.replace("unassigned secondary structure", "未分配二级结构"),
  ]);
  const highlights = new Map([["2:0", P.softOrange], ["2:1", P.softOrange], ["2:2", P.softOrange], ["2:3", P.softOrange], ["2:4", P.softOrange]]);
  addNativeTable(slide, { left: 50, top: 192, width: 1180, height: 335, headers: ["输入 FASTA", "label_seq_id", "author", "PDB component", "当前结构上下文"], rows, columnWidths: [190, 170, 145, 175, 500], fontSize: 15, highlights });
  addFact(slide, { left: 50, top: 530, width: 555, height: 108, heading: "映射规则", accent: P.accent, body: "输入 1–64：label=input。输入 65–67：同一 CRO label65 / author66。输入 68–238：label=input−2。", bodySize: 14 });
  addFact(slide, { left: 640, top: 530, width: 590, height: 108, heading: "变体与解释规则", accent: P.error, body: "canonical P42212 输入为 S65/Y66/G67。1EMA 是 S65T/Q80R 变体，CRO(label65/auth66) 仅作成熟色团结构参照。", bodySize: 14 });
  addSource(slide, "来源：normalized_slide_data.json::p30_mapping_table；RCSB 1EMA mmCIF / current API");
  addNotes(slide, 30, "PDB 1EMA 的编号不能直接当作输入 FASTA 坐标。canonical P42212 输入为 S65、Y66、G67，而 1EMA 是 S65T/Q80R 变体。该变体成熟 CRO 复合残基作为结构参照，三个位点映射到 polymer label 65 和 author residue 66。此后 polymer label 比输入位置小 2，而 author residue 与输入位置继续相同。本页把输入、label 和 author 分列，避免让旧编号结论进入结构解释。下一页展示多个高激活描述的证据边界。 ");
}

function slide31(presentation) {
  const slide = makeSlide(presentation, 31, "多个高激活描述缺少 GFP 特异证据", "通用 identity 或结构语义可作为解释线索，仍需与正确编号和独立生物学证据结合", "结构审计");
  const control = D.p31_control_feature_table;
  const rows = control.map((row) => {
    const site = `${row.position === 195 ? "L" : row.position === 65 ? "S" : row.position === 66 ? "Y" : "G"}${row.position}`;
    const summary = row.position === 195 && row.feature_id === 16243 ? "Leu / α-helix 语义标签" : row.position === 195 ? "low-complexity / coil 语义标签" : row.position === 65 ? "generic Ser identity" : row.position === 66 ? "generic Tyr identity" : "generic Gly identity";
    const boundary = row.position === 195 ? "PDB labels 186–196 未分配" : "identity 语义需外部功能证据";
    return [site, `F${row.feature_id}`, Number(row.activation).toFixed(4), summary, boundary];
  });
  addNativeTable(slide, { left: 50, top: 200, width: 1180, height: 304, headers: ["site", "feature", "raw activation", "描述概括", "证据边界"], rows, columnWidths: [115, 155, 190, 360, 360], fontSize: 15 });
  addFact(slide, { left: 50, top: 526, width: 570, height: 93, heading: "L195", accent: P.error, fill: P.softRed, body: "α-helix 与 low-complexity 标签来自 feature 描述。polymer labels 186–196（author/input 188–198）未分配二级结构。", bodySize: 15 });
  addFact(slide, { left: 660, top: 526, width: 570, height: 93, heading: "发色团三位点", accent: P.accent, fill: P.softOrange, body: "S65、Y66、G67 的 feature 可呈现通用残基身份标签。它们需要与 CRO 编号审计和功能证据共同解读。", bodySize: 15 });
  addSource(slide, "来源：normalized_slide_data.json::p31_control_feature_table；p30_mapping_table；RCSB 1EMA");
  addNotes(slide, 31, "本页集中显示几个容易被过度解释的条目。L195 的 feature 文本包含 alpha-helix 或 low-complexity 语义，而当前 PDB 的 polymer labels 186 到 196，对应 author/input 188 到 198，仍为未分配二级结构。S65、Y66、G67 的条目主要是通用残基身份语义。描述是解释入口，而非 GFP 特异功能证据。下一页把直接观测、外部确认和待校准项分层。 ");
}

function slide32(presentation) {
  const slide = makeSlide(presentation, 32, "当前证据支持流程完成与结构假设", "运行观察、外部确认与后续校准任务在同一页面分层保留", "结构审计");
  const panels = [
    ["直接观测", P.primary, P.softBlue, "238 个 residue H rows\n238 次单点遮挡评分\n15,232 条导出 SAE activation", "本次运行工件可逐项复核"],
    ["外部确认", P.success, P.softGreen, "UniProt P42212 序列\n1EMA 发色团与编号映射\nRCSB 当前结构上下文", "外部资料提供结构参照"],
    ["待校准", P.error, P.softRed, "官方输出 parity\n跨 kernel 数值与 MLM baseline\nfeature 校准、多蛋白与 DMS", "后续实验决定外推范围"],
  ];
  let x = 50;
  panels.forEach(([title, accent, fill, body, footer]) => {
    addPanel(slide, { left: x, top: 206, width: 370, height: 292 }, { fill, line: P.border, radius: 12 });
    addRect(slide, { left: x, top: 206, width: 370, height: 8 }, accent);
    addText(slide, title, { left: x + 26, top: 238, width: 310, height: 26 }, { fontSize: 22, bold: true, color: accent, align: "center" });
    addText(slide, body, { left: x + 34, top: 292, width: 302, height: 111 }, { fontSize: 18, color: P.text, align: "center" });
    addRule(slide, x + 35, 430, 300, { color: P.border, weight: 1 });
    addText(slide, footer, { left: x + 30, top: 449, width: 310, height: 28 }, { fontSize: 15, color: P.muted, align: "center" });
    x += 405;
  });
  addFact(slide, { left: 50, top: 526, width: 1180, height: 91, heading: "已解决的 tokenizer 事实", accent: P.accent, fill: P.softOrange, body: "config=31 是遗留序列化字段。本次遮挡实际使用官方 tokenizer 的 <mask>=32。待校准项聚焦跨实现数值与 MLM baseline。", bodySize: 15 });
  addSource(slide, "来源：EVIDENCE_AUDIT.md；normalized_slide_data.json；UniProt P42212；RCSB 1EMA");
  addNotes(slide, 32, "本页将证据分为三层。运行本身直接给出 238 行表示、238 次遮挡评分和 15,232 条导出 SAE 激活。UniProt、PDB 和 RCSB 提供序列、发色团和结构编号参照。官方输出 parity、跨 kernel 数值及 MLM baseline、feature 校准、多蛋白和 DMS 仍需后续实验。config 中的 31 是遗留序列化字段，本次遮挡实际使用官方 tokenizer 的 mask ID 32。这个区分避免把已解决的 token 事实与跨实现校准混在一起。下一页给出复现实验所需的 manifest。 ");
}

function slide33(presentation) {
  const slide = makeSlide(presentation, 33, "复现 manifest 固定版本、精度与评分规则", "同一份版本清单连接模型、SAE、运行时、评分设置和审计脚本", "复现与交付");
  const rows = [
    ["ESMC 权重", "biohub/esmc-6b-2024-12", "ffd268e4"],
    ["SAE 权重", "layer60 · k64 · codebook16384", "99752fe6"],
    ["运行时", "Python 3.12.10 · torch 2.11.0+cu128", "BF16 · batch 1"],
    ["候选评分", "novelty window ±5 · weights 0.7 / 0.3", "238 positions"],
    ["结构审计", "1EMA mmCIF + current API", "编号映射已记录"],
    ["runner", "run_esmc_site_pipeline.py", "SHA256 ef10ff3e…"],
  ];
  addNativeTable(slide, { left: 50, top: 194, width: 1180, height: 318, headers: ["对象", "固定记录", "本次设置 / 校验"], rows, columnWidths: [210, 620, 350], fontSize: 15 });
  addFlowNode(slide, { left: 90, top: 523, width: 250, height: 96, title: "timestamped run", body: "CSV · NPZ · metadata", fill: P.softBlue, accent: P.primary, mono: true });
  addArrow(slide, { left: 365, top: 560, width: 70, height: 22 });
  addFlowNode(slide, { left: 460, top: 523, width: 250, height: 96, title: "normalized data", body: "slide-ready audit fields", fill: P.softOrange, accent: P.accent, mono: true });
  addArrow(slide, { left: 735, top: 560, width: 70, height: 22 });
  addFlowNode(slide, { left: 830, top: 523, width: 300, height: 96, title: "PPT + notes", body: "可追踪的来源与讲稿", fill: P.softGreen, accent: P.success, mono: true });
  addSource(slide, "来源：evidence.json::run_metadata；normalized_slide_data.json；run_metadata.json；SOURCE_LEDGER.md");
  addNotes(slide, 33, "复现不只依赖模型名。本页固定 ESMC 和 SAE 的 resolved revision，Python、torch、BF16 和 batch 设置，评分窗口和权重，1EMA 结构审计输入，以及 runner 的 SHA256。源运行目录中保留 CSV、NPZ 和 metadata，再经 normalized 数据和审计文件进入 deck 与 notes。这样每个数值或图表可以回到具体工件。下一页总结本次范围内的结论和下一步。 ");
}

function slide34(presentation) {
  const slide = makeSlide(presentation, 34, "本地链路给出候选排序与可检验的 SAE 假设", "交付物保留完整评分、正确编号与证据边界，后续工作聚焦可校准的比较", "复现与交付");
  const flow = [
    ["FASTA", "238 aa", P.softBlue, P.primary],
    ["ESMC 6B", "H + mask scan", P.softOrange, P.accent],
    ["ranking", "m + novelty", P.softBlue, P.primary],
    ["SAE", "代表性激活特征", P.softGreen, P.success],
    ["audit", "编号 + 边界", P.softRed, P.error],
  ];
  let x = 48;
  flow.forEach(([title, body, fill, accent], index) => {
    addFlowNode(slide, { left: x, top: 202, width: 205, height: 94, title, body, fill, accent, mono: index < 3 });
    if (index < flow.length - 1) addArrow(slide, { left: x + 211, top: 237, width: 29, height: 22 });
    x += 246;
  });
  addFact(slide, { left: 50, top: 356, width: 370, height: 157, heading: "可交付结论", accent: P.primary, fill: P.softBlue, body: "单张 16GB GPU 完成序列表示、遮挡扫描、候选表和 SAE 稀疏激活导出。所有主图回连到本次运行数据。", bodySize: 17 });
  addFact(slide, { left: 455, top: 356, width: 370, height: 157, heading: "解释结论", accent: P.success, fill: P.softGreen, body: "M1、G24、G40、K45\n解释保留编号与原始激活值边界。", bodySize: 17 });
  addFact(slide, { left: 860, top: 356, width: 370, height: 157, heading: "下一步", accent: P.accent, fill: P.softOrange, body: "建立官方 matched inference baseline，复核编号映射，并在多种已知蛋白与功能数据上校准候选评分和 feature 解释。", bodySize: 17 });
  addPanel(slide, { left: 130, top: 559, width: 1020, height: 46 }, { fill: P.surface, line: P.border, radius: 10 });
  addText(slide, "当前排名仅由条件偏好和新颖度计算。SAE 用于事后解释，结构与功能结论依赖后续校准。", { left: 155, top: 573, width: 970, height: 20 }, { fontSize: 16, bold: true, color: P.text, align: "center" });
  addSource(slide, "来源：本 deck 的运行工件、EVIDENCE_AUDIT.md、SOURCE_LEDGER.md；结论范围见 P32–P33");
  addNotes(slide, 34, "本次交付完成了从 238 aa GFP FASTA 到残基向量、遮挡候选排序、SAE 稀疏激活和结构审计的本地链路。候选排序只使用条件偏好和局部新颖度，SAE 在后续提供解释入口。M1 的端点信号、G24 与已知发色团相关位点的排序差异、PDB 编号映射和通用 feature 描述都保留为可检验的观察。下一步应建立官方 matched inference baseline，复核编号映射，并在多种已知蛋白与功能数据上检验评分与 feature 解释。 ");
}

async function renderSlides(presentation) {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  for (let index = 0; index < presentation.slides.items.length; index += 1) {
    const slide = presentation.slides.getItem(index);
    const png = await slide.export({ format: "png", scale: 1 });
    const imageName = "slide-" + String(index + 1).padStart(2, "0") + ".png";
    await fs.writeFile(path.join(PREVIEW_DIR, imageName), new Uint8Array(await png.arrayBuffer()));
    const layout = await slide.export({ format: "layout" });
    const layoutName = "slide-" + String(index + 1).padStart(2, "0") + ".layout.json";
    await fs.writeFile(path.join(PREVIEW_DIR, layoutName), await layout.text(), "utf8");
  }
  const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
  await fs.writeFile(path.join(PREVIEW_DIR, "montage.webp"), new Uint8Array(await montage.arrayBuffer()));
}

await fs.mkdir(BUILD_DIR, { recursive: true });
const presentation = Presentation.create({ slideSize: CANVAS });
[
  slide01, slide02, slide03, slide04, slide05, slide06, slide07, slide08, slide09,
  slide10, slide11, slide12, slide13, slide14, slide15, slide16, slide17, slide18,
  slide19, slide20, slide21, slide22, slide23, slide24, slide25, slide26, slide27,
  slide28, slide29, slide30, slide31, slide32, slide33, slide34,
].forEach((builder) => builder(presentation));
if (presentation.slides.items.length !== 34) throw new Error("Expected 34 slides, got " + presentation.slides.items.length);
await (await PresentationFile.exportPptx(presentation)).save(DRAFT_PATH);
await renderSlides(presentation);
const snapshot = await presentation.inspect({ kind: "slide,textbox,shape,table,chart,notes", maxChars: 2_000_000 });
await fs.writeFile(path.join(PREVIEW_DIR, "inspect.ndjson"), snapshot.ndjson.trim() + "\n", "utf8");
console.log(JSON.stringify({ draft: DRAFT_PATH, previewDir: PREVIEW_DIR, slideCount: presentation.slides.items.length, notes: NOTES_PATH || "fallback" }, null, 2));
