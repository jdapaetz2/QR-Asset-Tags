/**
 * Engineering Phase E3 — build the intake kit: the customer packet, the internal packet and the synthetic example run.
 *
 *   npm.cmd run phase-e:intake:build              write into docs/phase-e/intake/
 *   npm.cmd run phase-e:intake:build -- --check   rebuild in a temporary folder and compare with the committed files
 *
 * Reproducible: unchanged inputs give byte-identical files (fixed document dates, normalized ZIP timestamps,
 * normalized PDF dates and ids). MANIFEST.json records every generated file's bytes and SHA-256. Hand-written files
 * (the READMEs, QA.md, WALKTHROUGH.md) are not generated and not listed.
 */
import { hash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { normalizePdf } from "../packs/guide-build.mjs";
import { runCheck } from "./check.mjs";
import { APPROVAL_FORM, CHECKLIST, CSV_NOTE, EMAILS, GUIDE, PLACEHOLDERS, RESPONSIBILITIES, REVIEWED, SCOPE } from "./documents.mjs";
import { EXAMPLE, EXAMPLE_BANNER, EXAMPLE_BATCH_ID, EXAMPLE_PREPARED, EXAMPLE_UPLOAD } from "./example-data.mjs";
import { ASSET_COLUMNS, COMPANY_SECTIONS, FILE_COLUMNS, MODEL_COLUMNS, NOTE_COLUMNS, PEOPLE_COLUMNS, mappingDocument } from "./field-mapping.mjs";
import { KIT, PATHS, REPO } from "./kit-config.mjs";
import { interchangeCsvs } from "./outputs.mjs";
import { documentHtml, footerTemplate } from "./render-html.mjs";
import { documentDocx, emailDocx, emailMarkdown } from "./render-docx.mjs";
import { onboardingTrackerXlsx, tagHandoffCsv, tagHandoffXlsx } from "./trackers.mjs";
import { buildIntakeWorkbook } from "./workbook.mjs";

const V = KIT.workbookVersion;
const draftSuffix = REVIEWED.commercial && REVIEWED.legal ? "" : "-DRAFT";

export const FILES = {
  guidePdf: `customer/${GUIDE.file}.pdf`,
  guideDocx: `customer/${GUIDE.file}.docx`,
  workbook: `customer/mulemark-intake-workbook-v${V}.xlsx`,
  example: `customer/EXAMPLE-mulemark-intake-workbook-v${V}.xlsx`,
  scopePdf: `customer/${SCOPE.file}${draftSuffix}.pdf`,
  scopeDocx: `customer/${SCOPE.file}${draftSuffix}.docx`,
  csvDir: "customer/csv",
  procedure: "internal/onboarding-procedure.md",
  tracker: `internal/mulemark-onboarding-tracker-v${V}.xlsx`,
  emails: "internal/emails",
  approvalMd: `internal/${APPROVAL_FORM.file}.md`,
  approvalDocx: `internal/${APPROVAL_FORM.file}.docx`,
  handoffXlsx: `internal/tag-production-handoff-v${V}.xlsx`,
  handoffCsv: "internal/tag-production-handoff.csv",
  mapping: `internal/field-mapping-${KIT.mappingVersion}.json`,
  intakeSchema: "internal/intake.schema.json",
  exampleRun: "example-run",
  manifest: "MANIFEST.json",
};

// ------------------------------------------------------------------------------------------------ text outputs

const mdCell = (s) => String(s).replace(/\|/g, "\\|");

export function blocksMarkdown(doc) {
  const out = [];
  for (const b of doc.blocks) {
    if (b.t === "cover") out.push(`# ${b.title}`, "", `_${b.subtitle}_`, "");
    else if (b.t === "callout") out.push(`> **${b.text}**`, "");
    else if (b.t === "draft") out.push(`**${b.text}**`, "");
    else if (b.t === "h1") out.push(`# ${b.text}`, "");
    else if (b.t === "h2") out.push(`## ${b.text}`, "");
    else if (b.t === "p") out.push(b.text, "");
    else if (b.t === "bullets") out.push(...b.items.map((i) => `- ${i}`), "");
    else if (b.t === "quote") out.push(...b.lines.flatMap((l) => [`> ${l}`, ">"]).slice(0, -1), "");
    else if (b.t === "pagebreak") continue;
    else throw new Error(`blocksMarkdown: unsupported block ${b.t}`);
  }
  return `${out.join("\n").trim()}\n`;
}

export function placeholdersMarkdown() {
  return `${[
    "# Email template placeholders",
    "",
    "Fill these before sending. The templates use no others (a test checks), and nothing in the customer packet uses them.",
    "",
    "| Placeholder | Meaning |",
    "|---|---|",
    ...PLACEHOLDERS.map(([k, v]) => `| \`{{${k}}}\` | ${mdCell(v)} |`),
  ].join("\n")}\n`;
}

export function procedureMarkdown() {
  const lines = [
    "# Onboarding procedure (internal)",
    "",
    `Mulemark intake kit ${V} (field mapping ${KIT.mappingVersion}). The customer packet is in \`../customer/\`; the tracker for each batch is \`${path.basename(FILES.tracker)}\`, copied into private storage.`,
    "",
    "## Rules that always apply",
    "",
    "- **One request.** Everything missing goes back to the customer once per batch, in the consolidated missing-information email the check tool drafts. Not a stream of questions.",
    "- **No guessed values.** Unknowns stay unknown (Not available, Not sure, Please review) until someone who knows answers. Nothing guessed is ever published.",
    `- **Bounded research.** Up to about ${KIT.researchMinutesPerModel} minutes per model and about two authoritative sources per fact; official sources only; no purchases without a cost decision; no logins; no invented links. Unresolved items join the one request.`,
    "- **Categories are labels.** A category never supplies operating instructions. Guidance exists only for an identified model, cites the maker's manual or the customer's own rule, and is reviewed.",
    `- **Private storage.** Filled workbooks, uploads and check outputs live in \`%USERPROFILE%\\Mulemark-Customer-Intake\\<company>\\<batch>\\\`, never in Git. The check and prefill tools refuse to write inside the repository.`,
    "- **Permissions are per file and per customer.** A permission covers that customer's own pages. Nothing is shared with another company without its written permission. Folder defaults: the customer's photos, logo and instructions for renters show on their own pages; manuals follow the MODELS answer. A FILES & NOTES row (where it's from, who may see it) can only narrow that.",
    "- **Approval before go-live.** An affirmative approval of an exact content version, recorded with the approver, time, included and excluded codes. Silence, a timeout or a closed preview is never approval, and approval is not a waiver.",
    "- **Partial launch only on request.** Complete rows can go first when the customer explicitly agrees; the approval lists what's in and what's out.",
    `- **Measure, don't promise.** About ${KIT.reviewReadyBusinessDays} business days from a complete batch to a review-ready preview is an internal target. Log hands-on minutes, customer wait and tag manufacturing separately (tracker, TOUCH TIME).`,
    "",
    "## Checklist",
    "",
    "Gates must be done before the next stage.",
    "",
    "| # | Stage | Step | Who | Gate |",
    "|---|---|---|---|---|",
    ...CHECKLIST.map((s, i) => `| ${i + 1} | ${s.stage} | ${mdCell(s.step)} | ${s.who} | ${s.gate ? "Gate" : ""} |`),
    "",
    "## Who does what",
    "",
    "D = does it · A = approves · I = kept informed.",
    "",
    `| Activity | ${RESPONSIBILITIES.columns.join(" | ")} |`,
    `|---|${RESPONSIBILITIES.columns.map(() => "---").join("|")}|`,
    ...RESPONSIBILITIES.rows.map((r) => `| ${r.map((c) => mdCell(c || " ")).join(" | ")} |`),
    "",
  ];
  return `${lines.join("\n")}`;
}

/** JSON Schema of the normalized intake read.mjs produces (published for E4). */
export function intakeSchema() {
  const values = (fields) => ({ type: "object", additionalProperties: false, properties: Object.fromEntries(fields.map((f) => [f.key, { type: ["string", "null"], description: f.label }])) });
  const record = (fields) => ({
    type: "object",
    additionalProperties: false,
    required: ["row", "values"],
    properties: { row: { type: ["integer", "null"] }, values: values(fields), cells: { type: "object" }, numeric: { type: "object" } },
  });
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: `https://mulemark.io/schemas/phase-e/intake-${KIT.mappingVersion}.json`,
    title: "Mulemark normalized intake",
    description: "What the intake reader produces from the workbook, its CSV set or a fleet export: values keyed by the field mapping's stable keys (field-mapping JSON). Formulas are never evaluated; held-back values are null and listed in issues.",
    type: "object",
    additionalProperties: false,
    required: ["meta", "company", "people", "assets", "models", "files", "notes", "issues"],
    properties: {
      meta: { type: "object" },
      company: { type: "object", additionalProperties: false, required: ["values", "cells"], properties: { values: values(COMPANY_SECTIONS.flatMap((s) => s.fields)), cells: { type: "object" } } },
      people: { type: "array", items: record(PEOPLE_COLUMNS) },
      assets: { type: "array", items: record(ASSET_COLUMNS) },
      models: { type: "array", items: record(MODEL_COLUMNS) },
      files: { type: "array", items: record(FILE_COLUMNS) },
      notes: { type: "array", items: record(NOTE_COLUMNS) },
      issues: { type: "array", items: { type: "object", required: ["kind"], properties: { kind: { type: "string" }, tab: { type: "string" }, row: { type: "integer" }, cell: { type: "string" }, key: { type: "string" }, detail: { type: "string" } } } },
    },
  };
}

/** Prepared models for the example: the showcase packs, with the content version each pack's approval names. */
async function examplePrepared() {
  const out = [];
  for (const p of EXAMPLE_PREPARED) {
    const pack = JSON.parse(await readFile(path.join(REPO, p.pack), "utf8"));
    out.push({ model_name: p.model_name, model_key: p.model_key, content_version: pack.approval?.content_version ?? null });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ build

async function pdf(browser, doc) {
  const page = await browser.newPage();
  await page.setContent(documentHtml(doc), { waitUntil: "load" });
  const raw = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true, tagged: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: footerTemplate(doc) });
  await page.close();
  return normalizePdf(raw, `intake-${doc.id}-${V}`);
}

export async function buildKit(root) {
  const written = [];
  const put = async (rel, data) => {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    written.push(rel.split(path.sep).join("/"));
  };

  await put(FILES.workbook, await buildIntakeWorkbook({ variant: "blank" }));
  const example = await buildIntakeWorkbook({ variant: "example", data: EXAMPLE, banner: EXAMPLE_BANNER });
  await put(FILES.example, example);
  for (const [name, text] of Object.entries(interchangeCsvs(null))) await put(path.join(FILES.csvDir, name), text);
  await put(path.join(FILES.csvDir, "README.txt"), CSV_NOTE);

  const browser = await chromium.launch();
  try {
    await put(FILES.guidePdf, await pdf(browser, GUIDE));
    await put(FILES.scopePdf, await pdf(browser, SCOPE));
  } finally {
    await browser.close();
  }
  await put(FILES.guideDocx, await documentDocx(GUIDE));
  await put(FILES.scopeDocx, await documentDocx(SCOPE));

  await put(FILES.procedure, procedureMarkdown());
  await put(FILES.tracker, await onboardingTrackerXlsx());
  for (const email of EMAILS) {
    await put(path.join(FILES.emails, `${email.file}.md`), emailMarkdown(email));
    await put(path.join(FILES.emails, `${email.file}.docx`), await emailDocx(email));
  }
  await put(path.join(FILES.emails, "PLACEHOLDERS.md"), placeholdersMarkdown());
  await put(FILES.approvalMd, blocksMarkdown(APPROVAL_FORM));
  await put(FILES.approvalDocx, await documentDocx(APPROVAL_FORM));
  await put(FILES.handoffXlsx, await tagHandoffXlsx());
  await put(FILES.handoffCsv, tagHandoffCsv());
  await put(FILES.mapping, `${JSON.stringify(mappingDocument(), null, 2)}\n`);
  await put(FILES.intakeSchema, `${JSON.stringify(intakeSchema(), null, 2)}\n`);

  const prepared = await examplePrepared();
  await put(path.join(FILES.exampleRun, "inputs", "upload.json"), `${JSON.stringify(EXAMPLE_UPLOAD, null, 2)}\n`);
  await put(path.join(FILES.exampleRun, "inputs", "prepared.json"), `${JSON.stringify(prepared, null, 2)}\n`);
  const runDir = path.join(root, FILES.exampleRun);
  const before = new Set(written);
  await runCheck({ input: { workbook: example, file: path.basename(FILES.example) }, upload: EXAMPLE_UPLOAD, prepared, batchId: EXAMPLE_BATCH_ID, outDir: runDir, checkedAt: KIT.fixedDate.toISOString().slice(0, 10), fictional: true });
  for (const name of ["current-import.csv", "manifest.json", "readiness.md", "readiness.xlsx", "missing-information-email.md", "run.json", ...Object.keys(interchangeCsvs(null)).map((n) => `interchange/${n}`)]) {
    const rel = `${FILES.exampleRun}/${name}`;
    if (existsSync(path.join(root, rel)) && !before.has(rel)) written.push(rel);
  }

  const files = [];
  for (const rel of [...new Set(written)].sort()) {
    const data = await readFile(path.join(root, rel));
    files.push({ file: rel, bytes: data.length, sha256: hash("sha256", data) });
  }
  const manifest = { kit: KIT.name, workbook_version: V, mapping_version: KIT.mappingVersion, generated_by: "scripts/phase-e/intake/build.mjs", files };
  await writeFile(path.join(root, FILES.manifest), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function main() {
  if (process.argv.includes("--check")) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "mulemark-intake-"));
    try {
      const fresh = await buildKit(tmp);
      const differ = [];
      for (const f of fresh.files) {
        const committed = path.join(PATHS.kit, f.file);
        const data = existsSync(committed) ? await readFile(committed) : null;
        if (!data || hash("sha256", data) !== f.sha256) differ.push(f.file);
      }
      const manifestSame = (await readFile(path.join(tmp, FILES.manifest), "utf8")) === (existsSync(path.join(PATHS.kit, FILES.manifest)) ? await readFile(path.join(PATHS.kit, FILES.manifest), "utf8") : "");
      if (differ.length || !manifestSame) {
        console.error(`Out of date: ${[...differ, ...(manifestSame ? [] : [FILES.manifest])].join(", ")}. Run npm.cmd run phase-e:intake:build.`);
        process.exitCode = 1;
      } else console.log(`Up to date: ${fresh.files.length} generated files match.`);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    return;
  }
  const manifest = await buildKit(PATHS.kit);
  console.log(`Built ${manifest.files.length} files in ${path.relative(REPO, PATHS.kit)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
