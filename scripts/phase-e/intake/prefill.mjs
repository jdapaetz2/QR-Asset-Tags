/**
 * Engineering Phase E3 — turn a customer's own fleet export into a pre-filled intake workbook, so they don't retype a
 * clean roster.
 *
 *   npm.cmd run phase-e:intake:prefill -- --fleet-export <export.csv | export.xlsx> --out <private folder>
 *                                         [--company "Company name"]
 *
 * Columns are mapped through the alias list in field-mapping.mjs (Unit #, Equipment ID, Description, S/N...). Nothing
 * is guessed: unmapped columns are listed in fleet-mapping.json, and make + model pairs become MODELS rows for the
 * customer to complete. Codes are read as text, so leading zeros survive (unless the export itself already lost them,
 * which the mapping report flags). Writes into private storage only.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertPrivateOut } from "./check.mjs";
import { ASSET_COLUMNS, MODEL_COLUMNS, ROWS } from "./field-mapping.mjs";
import { slug } from "./outputs.mjs";
import { readFleetExport } from "./read.mjs";
import { buildIntakeWorkbook } from "./workbook.mjs";

export const PREFILL_BANNER =
  "Pre-filled from your fleet list. Please check each row: the Asset name is what renters see. Then fill in what you can; blank is fine where you don't know.";

/** Build the pre-filled workbook and the mapping report from fleet-export bytes. */
export async function prefillFromFleet(buffer, { file, company = null }) {
  const intake = await readFleetExport(buffer, { file });
  if (intake.assets.length > ROWS.assets) throw new Error(`The export has ${intake.assets.length} rows; the workbook holds ${ROWS.assets}. Split it into batches.`);
  const assetKeys = new Set(ASSET_COLUMNS.map((f) => f.key));
  const modelKeys = new Set(MODEL_COLUMNS.map((f) => f.key));
  const pick = (values, keys) => Object.fromEntries(Object.entries(values).filter(([k, v]) => keys.has(k) && v !== null));
  const data = {
    company: company ? { "company.name": company } : {},
    assets: intake.assets.map((a) => pick(a.values, assetKeys)),
    models: intake.models.map((m) => pick(m.values, modelKeys)),
  };
  const workbook = await buildIntakeWorkbook({ variant: "prefill", data, banner: PREFILL_BANNER });
  const report = {
    source: file,
    rows: intake.assets.length,
    models_suggested: intake.models.length,
    mapped_columns: [...new Set(intake.assets.flatMap((a) => Object.keys(a.cells)))],
    unmapped_columns: intake.meta.unmapped_columns,
    issues: intake.issues,
  };
  return { workbook, report };
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith(`--${name}=`))?.split(/=(.*)/s)[1];
  };
  const file = get("fleet-export");
  const out = get("out");
  if (!file || !out) {
    console.error('Usage: phase-e:intake:prefill -- --fleet-export <export.csv|export.xlsx> --out <private folder> [--company "Name"]');
    process.exit(2);
  }
  const outDir = assertPrivateOut(out);
  await mkdir(outDir, { recursive: true });
  const company = get("company") ?? null;
  const { workbook, report } = await prefillFromFleet(await readFile(file), { file: path.basename(file), company });
  const name = `${slug(company ?? path.parse(file).name) || "customer"}-intake-workbook-prefilled.xlsx`;
  await writeFile(path.join(outDir, name), workbook);
  await writeFile(path.join(outDir, "fleet-mapping.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.rows} assets and ${report.models_suggested} suggested models written to ${path.join(outDir, name)}`);
  if (report.unmapped_columns.length) console.log(`Not mapped (left out, never guessed): ${report.unmapped_columns.join(", ")}`);
  if (report.issues.length) console.log(`${report.issues.length} cells to check: see fleet-mapping.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
