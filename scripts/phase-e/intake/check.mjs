/**
 * Engineering Phase E3 — the intake check (the "one consolidated request" tool).
 *
 *   npm.cmd run phase-e:intake:check -- --workbook <file.xlsx> [--files <upload folder>] [--prepared <prepared.json>]
 *                                       [--batch <id>] --out <private folder>
 *   npm.cmd run phase-e:intake:check -- --csv-dir <folder with the CSV set> ...
 *
 * Reads a filled workbook (or the CSV set), assesses it under the content contract's rules and writes, to --out:
 * readiness.md and readiness.xlsx, missing-information-email.md (customer items only, one list), current-import.csv
 * (private drafts, flags off), manifest.json (content contract 1.3.0, validated), interchange/*.csv and run.json.
 *
 * Customer data never goes into Git: --out must be outside this repository (normally
 * %USERPROFILE%\Mulemark-Customer-Intake\<company>\<batch>\). The synthetic example is the one exception, and only its
 * own folder (docs/phase-e/intake/example-run), written by the kit build.
 */
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EMAILS } from "./documents.mjs";
import { KIT, PATHS, REPO } from "./kit-config.mjs";
import {
  buildManifest,
  currentImportCsv,
  fillTemplate,
  interchangeCsvs,
  missingItems,
  missingItemsMarkdown,
  reportMarkdown,
  reportWorkbook,
  sha256,
  validateManifest,
} from "./outputs.mjs";
import { CSV_FILES, readCsvSet, readWorkbook } from "./read.mjs";
import { allReasons, assessIntake } from "./readiness.mjs";
import { emailDraftMarkdown } from "./render-docx.mjs";

/** Refuse to write customer outputs inside the repository (the example's own folder excepted). */
export function assertPrivateOut(outDir, { allowInside = null } = {}) {
  const out = path.resolve(outDir);
  const rel = path.relative(REPO, out);
  const inside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  if (inside && !(allowInside && path.resolve(allowInside) === out)) {
    throw new Error(`Refusing to write intake outputs inside the repository (${out}). Use private storage, e.g. ${path.join(PATHS.privateRoot, "<company>", "<batch>")}.`);
  }
  return out;
}

/** List an upload folder as [{ path, bytes }] with forward-slash relative paths. */
export async function listUpload(dir) {
  const out = [];
  async function walk(d) {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push({ path: path.relative(dir, full).split(path.sep).join("/"), bytes: (await stat(full)).size });
    }
  }
  await walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Run the check. input: { workbook: Buffer, file } or { csv: { "assets.csv": Buffer, ... } }.
 * Writes into outDir (already vetted by the caller) and returns { intake, result, run }.
 */
export async function runCheck({ input, upload = null, prepared = [], batchId, outDir, checkedAt = new Date().toISOString(), fictional = false }) {
  const intake = input.workbook ? await readWorkbook(input.workbook, { file: input.file }) : readCsvSet(input.csv);
  const result = assessIntake(intake, { upload, prepared });
  await mkdir(path.join(outDir, "interchange"), { recursive: true });
  const write = (name, data) => writeFile(path.join(outDir, name), data);

  for (const [name, text] of Object.entries(interchangeCsvs(intake))) await write(path.join("interchange", name), text);
  await write("current-import.csv", currentImportCsv(result));

  const schema = JSON.parse(await readFile(PATHS.schema, "utf8"));
  const { manifest, excluded = [], reason } = buildManifest(intake, result, { batchId, fictional });
  let validation = { ok: false, errors: [reason] };
  if (manifest) {
    validation = validateManifest(manifest, schema);
    await write("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  }

  await write("readiness.md", reportMarkdown(intake, result, { batchId, checkedAt, sourceSha256: input.workbook ? sha256(input.workbook) : null }));
  await write("readiness.xlsx", await reportWorkbook(intake, result, { batchId, checkedAt }));

  const groups = missingItems(result);
  const { text, count } = missingItemsMarkdown(groups);
  if (count > 0) {
    const approver = intake.company.values["approver.name"] ?? "";
    const email = fillTemplate(emailDraftMarkdown(EMAILS.find((e) => e.file === "02-missing-information")), {
      company_name: intake.company.values["company.name"] ?? "your company",
      contact_first_name: approver.split(/\s+/)[0] || null,
      missing_count: count,
      missing_items: text,
    });
    await write("missing-information-email.md", email);
  }

  const reasons = allReasons(result);
  const run = {
    tool: "phase-e:intake:check",
    kit: KIT.workbookVersion,
    mapping_version: KIT.mappingVersion,
    workbook_version: intake.meta.workbook_version,
    source: { kind: intake.meta.source, file: intake.meta.file, ...(input.workbook ? { sha256: sha256(input.workbook) } : {}) },
    batch_id: batchId,
    checked_at: checkedAt,
    upload: { checked: result.upload.checked, files: result.upload.count },
    prepared_models: prepared.map((p) => p.model_name),
    summary: result.summary,
    items: {
      customer: reasons.filter((r) => r.severity === "blocker" && r.who === "customer").length,
      mulemark: reasons.filter((r) => r.severity === "blocker" && r.who === "mulemark").length,
      warnings: reasons.filter((r) => r.severity === "warning").length,
    },
    missing_information_email: count > 0 ? "missing-information-email.md" : "not needed: no customer items",
    manifest: { written: Boolean(manifest), valid: validation.ok, errors: validation.errors, assets: manifest?.assets.length ?? 0, models: manifest?.models.length ?? 0, excluded_from_manifest: excluded },
    reader_notes: intake.meta.notes ?? [],
  };
  await write("run.json", `${JSON.stringify(run, null, 2)}\n`);
  return { intake, result, run };
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.includes("=") ? a.slice(2).split(/=(.*)/s) : [a.slice(2), argv[i + 1]?.startsWith("--") ? "true" : argv[++i]];
    out[k] = v ?? "true";
  }
  return out;
}

async function main() {
  const a = args(process.argv.slice(2));
  if (!a.out || (!a.workbook && !a["csv-dir"])) {
    console.error("Usage: phase-e:intake:check -- --workbook <file.xlsx> | --csv-dir <folder>  [--files <upload folder>] [--files-list <listing.json>] [--prepared <prepared.json>] [--batch <id>] --out <private folder>");
    process.exit(2);
  }
  const outDir = assertPrivateOut(a.out);
  let input;
  if (a.workbook) {
    if (!/\.xlsx$/i.test(a.workbook)) throw new Error("Send the workbook as .xlsx (macro workbooks and old .xls files are refused).");
    input = { workbook: await readFile(a.workbook), file: path.basename(a.workbook) };
  } else {
    const csv = {};
    for (const name of Object.values(CSV_FILES)) {
      try {
        csv[name] = await readFile(path.join(a["csv-dir"], name));
      } catch {
        // A missing CSV is simply not part of the set.
      }
    }
    input = { csv };
  }
  const upload = a.files ? await listUpload(a.files) : a["files-list"] ? JSON.parse(await readFile(a["files-list"], "utf8")) : null;
  const prepared = a.prepared ? JSON.parse(await readFile(a.prepared, "utf8")) : [];
  const batchId = a.batch ?? `batch-${new Date().toISOString().slice(0, 10)}`;
  const { result, run } = await runCheck({ input, upload, prepared, batchId, outDir });
  console.log(`Checked ${result.summary.total} assets (${result.summary.draftImportable} ready for draft import).`);
  console.log(`Assets: ${Object.entries(result.summary.assets).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`Customer items: ${run.items.customer}; Mulemark items: ${run.items.mulemark}; warnings: ${run.items.warnings}.`);
  console.log(`Manifest: ${run.manifest.written ? (run.manifest.valid ? "valid" : `INVALID: ${run.manifest.errors.join("; ")}`) : run.manifest.errors.join(" ")}`);
  console.log(`Outputs in ${outDir}`);
  if (run.manifest.written && !run.manifest.valid) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
