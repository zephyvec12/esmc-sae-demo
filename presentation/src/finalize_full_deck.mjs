import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WORKSPACE = "E:\\ESMC\\ppt_handoff_20260906";
const BUILD_DIR = path.join(WORKSPACE, "build");
const OUTPUT_DIR = path.join(WORKSPACE, "output");
const FINALIZER_DIR = path.join(WORKSPACE, ".codex-finalizer");
const SKILL_DIR = "C:\\Users\\RS\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.904.11930\\skills\\presentations";
const PYTHON = "C:\\Users\\RS\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
const DRAFT = path.join(BUILD_DIR, "esmc_gfp_34_draft.pptx");
const CANDIDATE = path.join(FINALIZER_DIR, "esmc_gfp_34_finalization_candidate_v3.pptx");
const FINAL = path.join(OUTPUT_DIR, "ESMC_6B_SAE_GFP_20260906.pptx");
const RECEIPT = path.join(FINALIZER_DIR, "ESMC_6B_SAE_GFP_20260906.validation.json");

const { finalizePresentation } = await import(pathToFileURL(
  path.join(SKILL_DIR, "container_tools", "artifact_tool_utils.mjs"),
).href);

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(FINALIZER_DIR, { recursive: true });
await fs.copyFile(DRAFT, CANDIDATE, fsConstants.COPYFILE_EXCL);

const tableOwners = [5, 21, 26, 27, 28, 30, 31, 33];
const chartOwners = [20, 22, 23];
const result = await finalizePresentation({
  workspaceDir: WORKSPACE,
  candidatePath: CANDIDATE,
  finalPath: FINAL,
  pythonExecutable: PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools", "inspect_presentation_layout_geometry.py"),
  explicitTotalSlideCount: 34,
  requiredNativeTableOwnerSlides: tableOwners,
  requiredNativeChartOwnerSlides: chartOwners,
  materializeLiteralChartWorkbooks: true,
  verifyArtifactToolImport: true,
  fontPolicy: {
    basis: "design",
    families: ["Microsoft YaHei", "Arial", "Consolas"],
    scriptFonts: { ea: "Microsoft YaHei", cs: "Consolas" },
  },
  layoutArgs: [
    "--expected-slide-size-emu", "12192000,6858000",
    "--validate-bullet-geometry",
    "--validate-heading-fit",
    ...tableOwners.flatMap((number) => ["--require-native-table-slide", String(number)]),
  ],
  receiptPath: RECEIPT,
});

console.log(JSON.stringify(result, null, 2));
