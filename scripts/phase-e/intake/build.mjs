/**
 * Engineering Phase E3 — build the onboarding kit (2.0): the customer's two files, Mulemark's internal files and the
 * synthetic example run.
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
import { EMAILS, PLACEHOLDERS, REVIEWED, SCOPE, WHAT_TO_EXPECT } from "./documents.mjs";
import { EXAMPLE, EXAMPLE_BANNER, EXAMPLE_BATCH_ID, EXAMPLE_PREPARED, EXAMPLE_UPLOAD } from "./example-data.mjs";
import { ASSET_COLUMNS, COMPANY_SECTIONS, FILE_COLUMNS, MODEL_COLUMNS, NOTE_COLUMNS, PEOPLE_COLUMNS, mappingDocument } from "./field-mapping.mjs";
import { KIT, PATHS, REPO } from "./kit-config.mjs";
import { documentHtml, footerTemplate } from "./render-html.mjs";
import { documentDocx, emailDocx, emailMarkdown } from "./render-docx.mjs";
import { tagHandoffCsv, tagHandoffXlsx } from "./trackers.mjs";
import { buildIntakeWorkbook, buildListTemplate } from "./workbook.mjs";

const V = KIT.workbookVersion;
const draftSuffix = REVIEWED.commercial && REVIEWED.legal ? "" : "-DRAFT";

export const FILES = {
  onePagerPdf: `customer/${WHAT_TO_EXPECT.file}.pdf`,
  listTemplate: "customer/equipment-list-template.xlsx",
  onePagerDocx: `internal/${WHAT_TO_EXPECT.file}.docx`,
  scopePdf: `internal/${SCOPE.file}${draftSuffix}.pdf`,
  scopeDocx: `internal/${SCOPE.file}${draftSuffix}.docx`,
  workbook: `internal/mulemark-setup-workbook-v${V}.xlsx`,
  example: `internal/EXAMPLE-setup-workbook-v${V}.xlsx`,
  emails: "internal/emails",
  handoffXlsx: `internal/tag-production-handoff-v${V}.xlsx`,
  handoffCsv: "internal/tag-production-handoff.csv",
  mapping: `internal/field-mapping-${KIT.mappingVersion}.json`,
  intakeSchema: "internal/intake.schema.json",
  exampleRun: "example-run",
  manifest: "MANIFEST.json",
};

/** What the check writes into example-run/ (besides inputs/). */
export const EXAMPLE_RUN_OUTPUTS = ["to-do.md", "questions-email.txt", "email-3-preview-ready.txt", "email-4-live.txt", "tag-order.xlsx", "current-import.csv", "manifest.json", "readiness.xlsx", "run.json"];

// ------------------------------------------------------------------------------------------------ text outputs

const mdCell = (s) => String(s).replace(/\|/g, "\\|");

export function placeholdersMarkdown() {
  return `${[
    "# Email template placeholders",
    "",
    "The onboard commands fill most of these from the setup workbook; fill the rest before sending. The templates use no others (a test checks), and the customer's files use none.",
    "",
    "| Placeholder | Meaning |",
    "|---|---|",
    ...PLACEHOLDERS.map(([k, v]) => `| \`{{${k}}}\` | ${mdCell(v)} |`),
  ].join("\n")}\n`;
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
    description: "What the intake reader produces from the setup workbook or a customer's own equipment list: values keyed by the field mapping's stable keys (field-mapping JSON). Formulas are never evaluated; held-back values are null and listed in issues.",
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

  // The customer's two files: the one-pager and the list template (only for customers without rental software).
  await put(FILES.listTemplate, await buildListTemplate());
  const browser = await chromium.launch();
  try {
    await put(FILES.onePagerPdf, await pdf(browser, WHAT_TO_EXPECT));
    await put(FILES.scopePdf, await pdf(browser, SCOPE));
  } finally {
    await browser.close();
  }

  // Mulemark's own: the one-pager's Word copy (for reviewers), the scope reference, the setup workbooks and emails.
  await put(FILES.onePagerDocx, await documentDocx(WHAT_TO_EXPECT));
  await put(FILES.scopeDocx, await documentDocx(SCOPE));
  await put(FILES.workbook, await buildIntakeWorkbook({ variant: "blank" }));
  const example = await buildIntakeWorkbook({ variant: "example", data: EXAMPLE, banner: EXAMPLE_BANNER });
  await put(FILES.example, example);
  for (const email of EMAILS) {
    await put(path.join(FILES.emails, `${email.file}.md`), emailMarkdown(email));
    await put(path.join(FILES.emails, `${email.file}.docx`), await emailDocx(email));
  }
  await put(path.join(FILES.emails, "PLACEHOLDERS.md"), placeholdersMarkdown());
  await put(FILES.handoffXlsx, await tagHandoffXlsx());
  await put(FILES.handoffCsv, tagHandoffCsv());
  await put(FILES.mapping, `${JSON.stringify(mappingDocument(), null, 2)}\n`);
  await put(FILES.intakeSchema, `${JSON.stringify(intakeSchema(), null, 2)}\n`);

  const prepared = await examplePrepared();
  await put(path.join(FILES.exampleRun, "inputs", "upload.json"), `${JSON.stringify(EXAMPLE_UPLOAD, null, 2)}\n`);
  await put(path.join(FILES.exampleRun, "inputs", "prepared.json"), `${JSON.stringify(prepared, null, 2)}\n`);
  const runDir = path.join(root, FILES.exampleRun);
  const before = new Set(written);
  await runCheck({ input: { workbook: example, file: path.basename(FILES.example) }, upload: EXAMPLE_UPLOAD, prepared, batchId: EXAMPLE_BATCH_ID, outDir: runDir, checkedAt: KIT.fixedDate.toISOString().slice(0, 10), fictional: true, freshTagOrder: true });
  for (const name of EXAMPLE_RUN_OUTPUTS) {
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
