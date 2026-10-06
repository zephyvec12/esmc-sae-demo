import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const WORKSPACE = "E:\\ESMC\\ppt_handoff_20260906";
const FINAL = path.join(WORKSPACE, "output", "ESMC_6B_SAE_GFP_20260906.pptx");
const PREVIEW_DIR = path.join(WORKSPACE, "build", "final_import_previews");

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

await fs.mkdir(PREVIEW_DIR, { recursive: true });
const bytes = await fs.readFile(FINAL);
const presentation = await PresentationFile.importPptx(await FileBlob.load(FINAL));
if (presentation.slides.items.length !== 34) {
  throw new Error("Imported final deck has " + presentation.slides.items.length + " slides, expected 34");
}
for (let index = 0; index < presentation.slides.items.length; index += 1) {
  const slide = presentation.slides.getItem(index);
  const number = String(index + 1).padStart(2, "0");
  const png = await slide.export({ format: "png", scale: 1 });
  await writeBlob(path.join(PREVIEW_DIR, "slide-" + number + ".png"), png);
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(path.join(PREVIEW_DIR, "slide-" + number + ".layout.json"), await layout.text(), "utf8");
}
const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
await writeBlob(path.join(PREVIEW_DIR, "montage.webp"), montage);
const snapshot = await presentation.inspect({ kind: "slide,textbox,shape,table,chart,notes", maxChars: 2_000_000 });
await fs.writeFile(path.join(PREVIEW_DIR, "inspect.ndjson"), snapshot.ndjson.trim() + "\n", "utf8");
console.log(JSON.stringify({
  final: FINAL,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  slideCount: presentation.slides.items.length,
  previewDir: PREVIEW_DIR,
}, null, 2));
