import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const WORKSPACE = "E:\\ESMC\\ppt_handoff_20260906";
const draftDir = path.join(WORKSPACE, "build", "esmc_gfp_34_previews");
const finalDir = path.join(WORKSPACE, "build", "final_import_previews");
const reportPath = path.join(WORKSPACE, "build", "final_render_pixel_comparison.json");

async function pixels(filePath) {
  return sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

const slides = [];
for (let number = 1; number <= 34; number += 1) {
  const fileName = "slide-" + String(number).padStart(2, "0") + ".png";
  const [draft, final] = await Promise.all([
    pixels(path.join(draftDir, fileName)),
    pixels(path.join(finalDir, fileName)),
  ]);
  let changedPixels = 0;
  let maxChannelDelta = 0;
  let totalChannelDelta = 0;
  if (draft.info.width !== final.info.width || draft.info.height !== final.info.height ||
      draft.data.length !== final.data.length) {
    throw new Error("Rendered dimensions differ on " + fileName);
  }
  for (let index = 0; index < draft.data.length; index += 4) {
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(draft.data[index + channel] - final.data[index + channel]);
      if (delta > 0) pixelChanged = true;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      totalChannelDelta += delta;
    }
    if (pixelChanged) changedPixels += 1;
  }
  slides.push({
    slide: number,
    file: fileName,
    changedPixels,
    totalPixels: draft.info.width * draft.info.height,
    changedPixelRatio: changedPixels / (draft.info.width * draft.info.height),
    maxChannelDelta,
    meanChannelDelta: totalChannelDelta / draft.data.length,
  });
}
const report = {
  schemaVersion: "render-pixel-comparison.v1",
  totalSlides: slides.length,
  byteIdenticalSlides: slides.filter((slide) => slide.changedPixels === 0).length,
  maxChangedPixelRatio: Math.max(...slides.map((slide) => slide.changedPixelRatio)),
  maxMeanChannelDelta: Math.max(...slides.map((slide) => slide.meanChannelDelta)),
  slides,
};
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
