import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

function usage() {
  throw new Error(
    "Usage: node inspect_reference_decks.mjs <reference-decks-dir> <markdown-dir> <preview-dir>",
  );
}

function escapeInline(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("|", "\\|")
    .replaceAll("\r", "")
    .replaceAll("\n", "<br>");
}

function safeFilename(name) {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function bbox(record) {
  return Array.isArray(record.bbox)
    ? `[${record.bbox.map(value => Number(value).toFixed(1)).join(", ")}] ${record.bboxUnit ?? "px"}`
    : "—";
}

function recordText(record) {
  const candidates = [record.text, record.title, record.textPreview, record.preview];
  return candidates.find(value => typeof value === "string" && value.trim()) ?? "";
}

function markdownText(value) {
  return String(value ?? "").replaceAll("\r", "").trim();
}

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

async function inspectDeck({ sourcePath, markdownDir, previewDir }) {
  const baseName = path.basename(sourcePath, path.extname(sourcePath));
  const safeName = safeFilename(baseName);
  const geometryDir = path.join(markdownDir, `${safeName}_geometry`);
  const slidePreviewDir = path.join(previewDir, safeName);
  await fs.mkdir(geometryDir, { recursive: true });
  await fs.mkdir(slidePreviewDir, { recursive: true });

  const sourceBlob = await FileBlob.load(sourcePath);
  const presentation = await PresentationFile.importPptx(sourceBlob);
  const snapshot = await presentation.inspect({
    kind: "deck,slide,textbox,shape,image,table,chart,notes,thread,layout",
    maxChars: 2_000_000,
  });
  const records = snapshot.ndjson
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid inspect NDJSON at line ${index + 1}: ${error.message}`);
      }
    });

  await fs.writeFile(
    path.join(markdownDir, `${safeName}.inspect.ndjson`),
    `${snapshot.ndjson.trim()}\n`,
    "utf8",
  );

  const slideCount = presentation.slides.items.length;
  const recordsBySlide = new Map();
  for (let slideNumber = 1; slideNumber <= slideCount; slideNumber += 1) {
    recordsBySlide.set(slideNumber, []);
  }
  for (const record of records) {
    if (Number.isInteger(record.slide) && recordsBySlide.has(record.slide)) {
      recordsBySlide.get(record.slide).push(record);
    }
  }

  const layoutPaths = [];
  const renderWarnings = [];
  for (let index = 0; index < slideCount; index += 1) {
    const slideNumber = index + 1;
    const slide = presentation.slides.getItem(index);
    const layoutPath = path.join(geometryDir, `slide-${String(slideNumber).padStart(2, "0")}.layout.json`);
    try {
      const layout = await slide.export({ format: "layout" });
      await fs.writeFile(layoutPath, await layout.text(), "utf8");
      layoutPaths[slideNumber] = path.relative(markdownDir, layoutPath).replaceAll("\\", "/");
    } catch (error) {
      renderWarnings.push(`Slide ${slideNumber}: layout export failed: ${error.message}`);
    }
    try {
      const png = await slide.export({ format: "png", scale: 1 });
      await writeBlob(path.join(slidePreviewDir, `slide-${String(slideNumber).padStart(2, "0")}.png`), png);
    } catch (error) {
      renderWarnings.push(`Slide ${slideNumber}: PNG render failed: ${error.message}`);
    }
  }

  try {
    const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
    await writeBlob(path.join(previewDir, `${safeName}-montage.webp`), montage);
  } catch (error) {
    renderWarnings.push(`Montage render failed: ${error.message}`);
  }

  const slideRecords = records.filter(record => record.kind === "slide");
  const markdown = [];
  markdown.push(`# ${baseName}`);
  markdown.push("");
  markdown.push(`- Source: \`${sourcePath}\``);
  markdown.push(`- Slides: ${slideCount}`);
  markdown.push("- Conversion: Artifact Tool import + inspect + per-slide layout export");
  markdown.push("");
  markdown.push("## Deck-level records");
  markdown.push("");
  const deckRecords = records.filter(record => !Number.isInteger(record.slide));
  if (deckRecords.length) {
    markdown.push("```json");
    markdown.push(...deckRecords.map(record => JSON.stringify(record)));
    markdown.push("```");
  } else {
    markdown.push("No deck-level records returned by the inspector.");
  }

  for (let slideNumber = 1; slideNumber <= slideCount; slideNumber += 1) {
    const recordsForSlide = recordsBySlide.get(slideNumber) ?? [];
    const slideRecord = recordsForSlide.find(record => record.kind === "slide")
      ?? slideRecords.find(record => record.slide === slideNumber);
    const title = markdownText(slideRecord?.title) || "Untitled slide";
    markdown.push("");
    markdown.push(`## Slide ${String(slideNumber).padStart(2, "0")}: ${title}`);
    markdown.push("");
    markdown.push(`- Anchor: \`${slideRecord?.id ?? "unavailable"}\``);
    markdown.push(`- Object/text count reported: ${slideRecord?.textShapes ?? "unavailable"}`);
    if (layoutPaths[slideNumber]) {
      markdown.push(`- Full geometry export: [slide-${String(slideNumber).padStart(2, "0")}.layout.json](${layoutPaths[slideNumber]})`);
    }

    const contentRecords = recordsForSlide.filter(record =>
      !["slide", "notes", "thread", "layout"].includes(record.kind),
    );
    markdown.push("");
    markdown.push("### Text and object geometry");
    markdown.push("");
    if (contentRecords.length) {
      markdown.push("| Kind | Anchor | Geometry | Text / label |");
      markdown.push("| --- | --- | --- | --- |");
      for (const record of contentRecords) {
        const label = recordText(record);
        const detail = [record.name, record.chartType, record.rows && record.cols ? `${record.rows}×${record.cols}` : ""]
          .filter(Boolean)
          .join("; ");
        markdown.push(
          `| ${escapeInline(record.kind)} | \`${escapeInline(record.id ?? "—")}\` | ${escapeInline(bbox(record))} | ${escapeInline([detail, label].filter(Boolean).join(" — ") || "—")} |`,
        );
      }
    } else {
      markdown.push("No text/object records returned by the inspector for this slide.");
    }

    const notes = recordsForSlide.filter(record => record.kind === "notes");
    markdown.push("");
    markdown.push("### Speaker notes");
    markdown.push("");
    if (notes.length) {
      for (const note of notes) {
        markdown.push(`Anchor: \`${note.id ?? "unavailable"}\``);
        markdown.push("");
        markdown.push("```text");
        markdown.push(markdownText(recordText(note)) || "[No note text returned]");
        markdown.push("```");
      }
    } else {
      markdown.push("[No speaker notes record returned]");
    }
  }

  markdown.push("");
  markdown.push("## Conversion warnings");
  markdown.push("");
  if (renderWarnings.length) {
    markdown.push(...renderWarnings.map(warning => `- ${warning}`));
  } else {
    markdown.push("- None");
  }
  markdown.push("");
  const markdownPath = path.join(markdownDir, `${safeName}.md`);
  await fs.writeFile(markdownPath, `${markdown.join("\n")}\n`, "utf8");

  return {
    baseName,
    slideCount,
    markdownPath,
    previewPath: slidePreviewDir,
    warningCount: renderWarnings.length,
  };
}

const [referenceDecksDir, markdownDir, previewDir] = process.argv.slice(2);
if (!referenceDecksDir || !markdownDir || !previewDir) usage();
for (const candidate of [referenceDecksDir, markdownDir, previewDir]) {
  if (!path.isAbsolute(candidate)) throw new Error(`Expected an absolute path: ${candidate}`);
}

await fs.mkdir(markdownDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
const deckFiles = (await fs.readdir(referenceDecksDir))
  .filter(file => file.toLowerCase().endsWith(".pptx"))
  .sort((left, right) => left.localeCompare(right));
if (!deckFiles.length) throw new Error(`No PPTX files found in ${referenceDecksDir}`);

const results = [];
for (const file of deckFiles) {
  results.push(await inspectDeck({
    sourcePath: path.join(referenceDecksDir, file),
    markdownDir,
    previewDir,
  }));
}
console.log(JSON.stringify({ results }, null, 2));
