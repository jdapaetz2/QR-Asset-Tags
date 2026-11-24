/**
 * Engineering Phase E3 — the check behind `onboard:check` (kit 2.0): reads a setup workbook, assesses it under the
 * content contract's rules and writes into the batch's check\ folder:
 *
 *   to-do.md                   what to ask the customer, Mulemark's own work, warnings, then the details
 *   questions-email.txt        the one consolidated questions email (customer items only; removed when there are none)
 *   email-3-preview-ready.txt  the preview email with the approval wording, names, counts and unit numbers filled in
 *   email-4-live.txt           the go-live email, filled in
 *   tag-order.xlsx             the tag order, with the CALL SHEET's ship-to, contact and tag style (written once:
 *                              never over a copy you've started filling)
 *   current-import.csv         today's importer (private drafts, flags off); manifest.json (content contract 1.3.0,
 *                              validated); readiness.xlsx; run.json
 * The email drafts are plain text, ready to paste. Before any machine is on ASSETS, only the to-do list and the
 * records are written.
 *
 * Customer data never goes into Git: the output folder must be outside this repository (normally
 * %USERPROFILE%\Mulemark-Customer-Intake\<company>\<batch>\check\). The synthetic example is the one exception, and
 * only its own folder (docs/phase-e/intake/example-run), written by the kit build. The command itself is onboard.mjs.
 */
import { constants } from "node:fs";
import { access, mkdir, open, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { EMAILS } from "./documents.mjs";
import { KIT, PATHS, REPO } from "./kit-config.mjs";
import {
  buildManifest,
  currentImportCsv,
  emailValues,
  fillTemplate,
  missingItems,
  missingItemsMarkdown,
  reportWorkbook,
  sha256,
  todoMarkdown,
  validateManifest,
  wantsNewTag,
} from "./outputs.mjs";
import { readWorkbook } from "./read.mjs";
import { allReasons, assessIntake } from "./readiness.mjs";
import { emailDraftText, plainText } from "./render-docx.mjs";
import { tagHandoffXlsx } from "./trackers.mjs";

/** The email drafts the check writes, by template. */
export const DRAFTS = { questions: "questions-email.txt", preview: "email-3-preview-ready.txt", live: "email-4-live.txt" };

/** Refuse to write customer outputs inside the repository (the example's own folder excepted). */
export function assertPrivateOut(outDir, { allowInside = null } = {}) {
  const out = path.resolve(outDir);
  const rel = path.relative(REPO, out);
  const inside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  if (inside && !(allowInside && path.resolve(allowInside) === out)) {
    throw new Error(`Refusing to write customer files inside the repository (${out}). Use private storage, e.g. ${path.join(PATHS.privateRoot, "<company>", "<batch>")}.`);
  }
  return out;
}

const exists = async (p) => {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

/** Fail early, with a plain message, when Excel (or anything else) has a file open that's about to be written. */
export async function assertWritable(file) {
  if (!(await exists(file))) return;
  let handle;
  try {
    handle = await open(file, "r+");
  } catch (error) {
    if (error.code === "EBUSY" || error.code === "EPERM" || error.code === "EACCES") throw new Error(`${path.basename(file)} is open in another program. Close it in Excel, then run this again.`);
    throw error;
  } finally {
    await handle?.close();
  }
}

/** A spreadsheet at the top of inbox\ is the customer's own equipment list, not a file for their pages. */
export const isListFile = (relPath) => !/[\\/]/.test(relPath) && /\.(csv|xlsx)$/i.test(relPath);
/** An equipment list in a format the check can't read (old Excel, text, other spreadsheet apps). */
export const isUnreadableList = (relPath) => !/[\\/]/.test(relPath) && /\.(xls|xlsm|xlsb|txt|tsv|ods|numbers)$/i.test(relPath);

/** List inbox\ as [{ path, bytes, list? }] with forward-slash relative paths. */
export async function listUpload(dir) {
  const out = [];
  async function walk(d) {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const rel = path.relative(dir, full).split(path.sep).join("/");
        const list = isListFile(rel) ? { list: true } : isUnreadableList(rel) ? { list: "unreadable" } : {};
        out.push({ path: rel, bytes: (await stat(full)).size, ...list });
      }
    }
  }
  await walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Run the check on setup-workbook bytes. Writes into outDir (already vetted by the caller) and returns
 * { intake, result, run }. sender fills {{sender_name}} in the drafts. The kit build sets freshTagOrder, since its
 * example's tag order is generated, not filled in by hand.
 */
export async function runCheck({ input, upload = null, prepared = [], batchId, outDir, checkedAt = new Date().toISOString(), fictional = false, sender = null, freshTagOrder = false }) {
  const intake = await readWorkbook(input.workbook, { file: input.file });
  const result = assessIntake(intake, { upload, prepared });
  await mkdir(outDir, { recursive: true });
  const at = (name) => path.join(outDir, name);
  // Nothing is written while one of the outputs is open in Excel, so check\ is never left half-rewritten.
  await assertWritable(at("readiness.xlsx"));
  const write = (name, data) => writeFile(at(name), data);

  await write("current-import.csv", currentImportCsv(result));

  const schema = JSON.parse(await readFile(PATHS.schema, "utf8"));
  const { manifest, excluded = [], reason } = buildManifest(intake, result, { batchId, fictional });
  let validation = { ok: false, errors: [reason] };
  if (manifest) {
    validation = validateManifest(manifest, schema);
    await write("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const sourceSha256 = sha256(input.workbook);
  await write("to-do.md", todoMarkdown(intake, result, { batchId, checkedAt, sourceSha256 }));
  await write("readiness.xlsx", await reportWorkbook(intake, result, { batchId, checkedAt }));

  // The drafts, once there are machines; a stale draft never outlives the reason for it.
  const machines = result.summary.total;
  const values = { ...emailValues(intake, result), ...(sender ? { sender_name: sender } : {}) };
  const draft = (file, extra = {}) => plainText(fillTemplate(emailDraftText(EMAILS.find((e) => e.file === file)), { ...values, ...extra }));
  const { text, count } = missingItemsMarkdown(missingItems(result, "customer"));
  if (count > 0) await write(DRAFTS.questions, draft("02-questions", { missing_count: count, missing_items: text }));
  else await rm(at(DRAFTS.questions), { force: true });
  if (machines > 0) {
    await write(DRAFTS.preview, draft("03-preview-ready"));
    await write(DRAFTS.live, draft("04-live"));
  } else {
    await rm(at(DRAFTS.preview), { force: true });
    await rm(at(DRAFTS.live), { force: true });
  }

  const cv = intake.company.values;
  const tagOrder = at("tag-order.xlsx");
  if (machines > 0 && (freshTagOrder || !(await exists(tagOrder)))) {
    await write(
      "tag-order.xlsx",
      await tagHandoffXlsx({
        company: cv["company.name"],
        batch: batchId,
        newTags: result.assets.filter((a) => wantsNewTag(a.values)).length,
        shipTo: cv["tags.ship_to"],
        contact: cv["tags.contact"],
        size: cv["tags.size"],
        material: cv["tags.material"],
        mounting: cv["tags.mounting"],
      }),
    );
  }

  const reasons = allReasons(result);
  const warnings = reasons.filter((r) => r.severity === "warning");
  const run = {
    tool: "onboard:check",
    kit: KIT.workbookVersion,
    mapping_version: KIT.mappingVersion,
    workbook_version: intake.meta.workbook_version,
    source: { kind: intake.meta.source, file: intake.meta.file, sha256: sourceSha256 },
    batch_id: batchId,
    checked_at: checkedAt,
    inbox: { checked: result.upload.checked, files: result.upload.count },
    prepared_models: prepared.map((p) => p.model_name),
    summary: result.summary,
    items: {
      customer: count,
      mulemark: reasons.filter((r) => r.severity === "blocker" && r.who === "mulemark").length,
      warnings: warnings.length,
      warning_kinds: new Set(warnings.map((r) => r.code)).size,
    },
    questions_email: count > 0 ? DRAFTS.questions : "not needed: nothing to ask the customer",
    manifest: { written: Boolean(manifest), valid: validation.ok, errors: validation.errors, assets: manifest?.assets.length ?? 0, models: manifest?.models.length ?? 0, excluded_from_manifest: excluded },
    reader_notes: intake.meta.notes ?? [],
  };
  await write("run.json", `${JSON.stringify(run, null, 2)}\n`);
  return { intake, result, run };
}
