/**
 * Engineering Phase E3 — the two onboarding commands (kit 2.0). Everything they write lives in private storage,
 * outside Git: %USERPROFILE%\Mulemark-Customer-Intake\<company>\batch-<n>\.
 *
 *   npm.cmd run onboard:start -- "Company Name" [--batch 2] [--sender "Your Name"]
 *     Creates the batch folder: setup-workbook.xlsx (company name filled in); inbox\ with its Company\, Photos\ and
 *     Model documents\ folders (save everything the customer emails here, as it came); to-send\ (the one-pager and the
 *     list template to attach); and email-1-welcome.txt. Never overwrites an existing batch, and warns when a
 *     similarly named customer folder already exists. --sender is remembered (sender.txt in the private root) and
 *     fills your name into every draft.
 *
 *   npm.cmd run onboard:check -- "Company Name" [--batch 2] [--list <file in inbox>]
 *     Uses the latest batch. The first time it finds the customer's list (the one .csv or .xlsx at the top of inbox\),
 *     and only while ASSETS is still empty, it fills MODELS and ASSETS from it, after saving
 *     setup-workbook.before-fill.xlsx; everything already typed is kept. Then it checks the last saved workbook and
 *     writes check\: to-do.md, the questions email (only while there's something to ask), the preview and go-live
 *     email drafts, the tag order (once), the import CSV and the manifest. A prepared.json in the batch folder marks
 *     models that already have an approved pack.
 *
 * Both refuse any folder inside this repository. --root <folder> replaces the private root (for tests and QA).
 */
import { constants } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertPrivateOut, assertWritable, isListFile, isUnreadableList, listUpload, runCheck } from "./check.mjs";
import { EMAILS, REVIEWED } from "./documents.mjs";
import { PATHS } from "./kit-config.mjs";
import { fillTemplate, slug } from "./outputs.mjs";
import { prefillFromFleet } from "./prefill.mjs";
import { readWorkbook } from "./read.mjs";
import { emailDraftText, plainText } from "./render-docx.mjs";
import { buildIntakeWorkbook } from "./workbook.mjs";

export const WORKBOOK = "setup-workbook.xlsx";
export const TO_SEND = ["mulemark-what-to-expect.pdf", "equipment-list-template.xlsx"];
/** The inbox's standard folders (readiness.mjs reads them by these names). */
export const INBOX_FOLDERS = ["Company", "Photos", "Model documents"];
const SENDER_FILE = "sender.txt";

const exists = async (p) => {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

/** The customer's folder: <root>\<company slug>. */
export function companyDir(company, root = PATHS.privateRoot) {
  const s = slug(company, 60);
  if (!s) throw new Error(`"${company}" doesn't make a folder name. Use the company's name, e.g. "Northridge Rentals".`);
  return path.join(root, s);
}

/** batch-<n> folders of a company, sorted by number. */
async function batches(dir) {
  if (!(await exists(dir))) return [];
  return (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && /^batch-\d+$/.test(e.name))
    .map((e) => ({ name: e.name, n: Number(e.name.slice(6)) }))
    .sort((a, b) => a.n - b.n);
}

/** Your name for the drafts: remembered in <root>\sender.txt once given with --sender. */
async function senderName(root, given) {
  const file = path.join(root, SENDER_FILE);
  if (given && String(given).trim()) {
    await mkdir(root, { recursive: true });
    await writeFile(file, `${String(given).trim()}\n`);
    return String(given).trim();
  }
  return (await exists(file)) ? (await readFile(file, "utf8")).split(/\r?\n/)[0].trim() || null : null;
}

/** onboard:start. Returns { dir, files, warnings }. */
export async function startBatch(company, { batch = null, root = PATHS.privateRoot, kitDir = PATHS.customer, sender = null } = {}) {
  const name = String(company ?? "").trim();
  if (!name) throw new Error('Name the customer: npm.cmd run onboard:start -- "Company Name"');
  const base = companyDir(name, root);
  const existing = await batches(base);
  const n = batch ? Number(batch) : 1;
  if (!Number.isInteger(n) || n < 1) throw new Error(`--batch must be a whole number, like 2.`);
  const dir = assertPrivateOut(path.join(base, `batch-${n}`));
  if (await exists(dir)) throw new Error(`${dir} already exists. To continue it, run onboard:check. For a new batch, add --batch ${(existing.at(-1)?.n ?? n) + 1}.`);

  // A customer started under a slightly different name ("…, LLC") would get a second folder: say so.
  const warnings = [];
  const mine = path.basename(base);
  if (existing.length === 0 && (await exists(root))) {
    for (const e of await readdir(root, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== mine && (e.name.startsWith(`${mine}-`) || mine.startsWith(`${e.name}-`))) warnings.push(`A similar customer folder already exists: ${path.join(root, e.name)}. If it's the same customer, use that name instead.`);
    }
  }
  if (!REVIEWED.commercial) warnings.push("The one-pager in to-send\\ still carries DRAFT wording (commercial review pending). Don't send it to a real customer until that review is done.");

  for (const f of INBOX_FOLDERS) await mkdir(path.join(dir, "inbox", f), { recursive: true });
  await mkdir(path.join(dir, "to-send"), { recursive: true });
  await writeFile(path.join(dir, WORKBOOK), await buildIntakeWorkbook({ variant: "blank", data: { company: { "company.name": name } } }));
  for (const f of TO_SEND) await copyFile(path.join(kitDir, f), path.join(dir, "to-send", f));
  const me = await senderName(root, sender);
  const welcome = plainText(fillTemplate(emailDraftText(EMAILS.find((e) => e.file === "01-welcome")), { company_name: name, ...(me ? { sender_name: me } : {}) }));
  await writeFile(path.join(dir, "email-1-welcome.txt"), welcome);
  return { dir, files: [WORKBOOK, "inbox\\", ...TO_SEND.map((f) => `to-send\\${f}`), "email-1-welcome.txt"], warnings, sender: me };
}

/** The customer's list in inbox\: the --list file, else the one spreadsheet at the top. null when there is none yet. */
async function findList(inbox, list) {
  if (list) {
    const p = path.isAbsolute(list) ? list : path.join(inbox, list);
    if (!(await exists(p))) throw new Error(`${p} doesn't exist.`);
    return p;
  }
  if (!(await exists(inbox))) return null;
  const lists = (await readdir(inbox, { withFileTypes: true })).filter((e) => e.isFile() && isListFile(e.name)).map((e) => e.name).sort();
  if (lists.length > 1) throw new Error(`inbox\\ has ${lists.length} spreadsheets (${lists.join(", ")}). Pick the customer's list with --list "<file>".`);
  return lists.length ? path.join(inbox, lists[0]) : null;
}

/** onboard:check. Returns { dir, filled, report, run, notes }. */
export async function checkBatch(company, { batch = null, list = null, root = PATHS.privateRoot, checkedAt } = {}) {
  const name = String(company ?? "").trim();
  if (!name) throw new Error('Name the customer: npm.cmd run onboard:check -- "Company Name"');
  const base = companyDir(name, root);
  const all = await batches(base);
  if (!all.length) throw new Error(`No batch for "${name}" yet. Start one with: npm.cmd run onboard:start -- "${name}"`);
  const chosen = batch ? all.find((b) => b.n === Number(batch)) : all.at(-1);
  if (!chosen) throw new Error(`There's no batch-${batch} for "${name}". Batches: ${all.map((b) => b.name).join(", ")}.`);
  const dir = assertPrivateOut(path.join(base, chosen.name));
  const workbookPath = path.join(dir, WORKBOOK);
  if (!(await exists(workbookPath))) throw new Error(`${workbookPath} is missing.`);
  const inbox = path.join(dir, "inbox");
  const checkDir = assertPrivateOut(path.join(dir, "check"));
  const notes = [];

  let bytes = await readFile(workbookPath);
  let filled = null;
  let report = null;
  const current = await readWorkbook(bytes, { file: WORKBOOK });
  const listPath = current.assets.length === 0 ? await findList(inbox, list) : null;
  if (listPath) {
    await assertWritable(workbookPath);
    const out = await prefillFromFleet(await readFile(listPath), { file: path.basename(listPath), existing: current });
    let backup = path.join(dir, "setup-workbook.before-fill.xlsx");
    for (let i = 2; await exists(backup); i++) backup = path.join(dir, `setup-workbook.before-fill-${i}.xlsx`);
    await copyFile(workbookPath, backup);
    await writeFile(workbookPath, out.workbook);
    await mkdir(checkDir, { recursive: true });
    await writeFile(path.join(checkDir, "fleet-mapping.json"), `${JSON.stringify(out.report, null, 2)}\n`);
    bytes = out.workbook;
    filled = { from: path.basename(listPath), backup: path.basename(backup), rows: out.report.rows };
    report = out.report;
  } else if (current.assets.length === 0) {
    const unreadable = (await exists(inbox)) ? (await readdir(inbox)).filter((f) => isUnreadableList(f)) : [];
    notes.push(unreadable.length ? `inbox\\${unreadable[0]} is an old Excel or text export: open it in Excel and Save As .xlsx into inbox\\, then run this again.` : "No equipment list in inbox\\ yet: save the customer's list there (CSV or Excel), then run this again.");
  }

  const preparedPath = path.join(dir, "prepared.json");
  const prepared = (await exists(preparedPath)) ? JSON.parse(await readFile(preparedPath, "utf8")) : [];
  const upload = (await exists(inbox)) ? await listUpload(inbox) : [];
  const sender = await senderName(root, null);
  const { run } = await runCheck({ input: { workbook: bytes, file: WORKBOOK }, upload, prepared, batchId: `${slug(name, 40)}-${chosen.name}`, outDir: checkDir, sender, ...(checkedAt ? { checkedAt } : {}) });
  return { dir, filled, report, run, notes };
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.includes("=") ? a.slice(2).split(/=(.*)/s) : [a.slice(2), argv[++i]];
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const a = args(rest);
  const company = a._.join(" ");
  const root = a.root ? path.resolve(a.root) : undefined;
  if (command === "start") {
    const { dir, warnings, sender } = await startBatch(company, { batch: a.batch, root, sender: a.sender });
    console.log(`Started ${company}: ${dir}`);
    for (const w of warnings) console.log(`Note: ${w}`);
    console.log(`1. Send email-1-welcome.txt with the two files in to-send\\ (fill in their first name and your call times${sender ? "" : ', and your name: add --sender "Your Name" once to have it filled in'}).`);
    console.log(`2. Before the call: fill "Before the call" on the CALL SHEET in ${WORKBOOK} from their website.`);
    console.log(`3. Save their list in inbox\\ as it came, then run: npm.cmd run onboard:check -- "${company}"`);
    return;
  }
  if (command === "check") {
    const { dir, filled, report, run, notes } = await checkBatch(company, { batch: a.batch, list: a.list, root });
    if (filled) {
      console.log(`Filled MODELS and ASSETS from ${filled.from}: ${filled.rows} machines (the workbook before the fill is ${filled.backup}).`);
      if (report.unmapped_columns.length) console.log(`Columns not used (left out, never guessed): ${report.unmapped_columns.join(", ")}`);
      for (const m of report.merged_model_spellings) console.log(`Merged spellings into "${m.kept}": ${m.merged.join(", ")}`);
      if (report.category_codes_not_used.length) console.log(`Category codes from their software, not used (set plain categories on MODELS): ${report.category_codes_not_used.join(", ")}`);
      if (report.plain_number_codes) console.log(`Plain-number unit numbers (${report.plain_number_codes}): confirm with the customer whether they have leading zeros (a note is on FILES & NOTES).`);
      for (const n of report.reader_notes) console.log(n);
      console.log("Check the filled MODELS and ASSETS: the names renters see, model spellings and categories.");
    }
    for (const n of notes) console.log(n);
    const s = run.summary;
    const models = Object.values(s.models).reduce((x, y) => x + y, 0);
    console.log(`${company}: ${s.total} machines, ${models} models; ${s.draftImportable} can be imported now as private drafts.`);
    console.log(`Ask the customer: ${run.items.customer} · Your work: ${run.items.mulemark} · Warnings: ${run.items.warnings} (${run.items.warning_kinds} kinds)${run.manifest.written && !run.manifest.valid ? " · MANIFEST INVALID (see run.json)" : ""}`);
    console.log(`Open ${path.join(dir, "check", "to-do.md")}`);
    if (run.manifest.written && !run.manifest.valid) process.exitCode = 1;
    return;
  }
  console.error('Usage: npm.cmd run onboard:start -- "Company Name"   |   npm.cmd run onboard:check -- "Company Name"');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
