/**
 * Engineering Phase E3 — fill the setup workbook's MODELS and ASSETS from a customer's own equipment list (their
 * fleet export, or the list template), so nobody retypes a clean roster. `onboard:check` does this the first time it
 * finds the list in inbox\, keeping everything already typed on the CALL SHEET, FILES & NOTES and MODELS.
 *
 * Columns are mapped through the alias list in field-mapping.mjs (Unit #, Equipment ID, Description, S/N...). Nothing
 * is guessed: unmapped columns are listed in fleet-mapping.json, machines are grouped into MODELS rows by make and model
 * (spelling variants merged, reported), and rental-software category codes are left out (reported). Two things become
 * explicit checks instead of silent assumptions:
 *  - each new model's "Manual changes by year or serial?" starts as "Not sure", so the check lists it as work;
 *  - unit numbers that are plain numbers (401) may have lost their zeros in a spreadsheet, so a FILES & NOTES note
 *    ("Unit numbers") asks the customer to confirm them once; delete the note when they have.
 */
import { codeSummary, isPlainNumber } from "./codes.mjs";
import { ASSET_COLUMNS, COMPANY_SECTIONS, FILE_COLUMNS, MODEL_COLUMNS, NOTE_COLUMNS, PEOPLE_COLUMNS, ROWS } from "./field-mapping.mjs";
import { readFleetExport } from "./read.mjs";
import { buildIntakeWorkbook } from "./workbook.mjs";

export const prefillBanner = (file) => `Filled from ${file}. Check each machine's name (renters see it), model and category.`;

/** The FILES & NOTES "About" value of the fill's note on plain-number unit numbers (readiness.mjs asks about it). */
export const CODES_NOTE_ABOUT = "Unit numbers";

const norm = (s) => String(s ?? "").normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

/** Keep only the given keys' non-empty values from intake records. */
function valuesOf(records, fields) {
  const keys = new Set(fields.map((f) => f.key));
  return records.map((r) => Object.fromEntries(Object.entries(r.values).filter(([k, v]) => keys.has(k) && v !== null && v !== undefined && v !== "")));
}

/**
 * Build the filled workbook and the mapping report from the list's bytes. existing: the setup workbook's current
 * intake (read.mjs), whose answers are all kept; MODELS rows already there win over the list's suggestions.
 */
export async function prefillFromFleet(buffer, { file, company = null, existing = null }) {
  const intake = await readFleetExport(buffer, { file });
  if (intake.assets.length === 0) throw new Error(`${file}: no machines found under its header row. Check the file, then run this again.`);
  if (intake.assets.length > ROWS.assets) throw new Error(`The list has ${intake.assets.length} rows; the workbook holds ${ROWS.assets}. Split it into batches.`);
  const assetKeys = new Set(ASSET_COLUMNS.map((f) => f.key));
  const modelKeys = new Set(MODEL_COLUMNS.map((f) => f.key));
  const pick = (values, keys) => Object.fromEntries(Object.entries(values).filter(([k, v]) => keys.has(k) && v !== null));
  const companyFields = COMPANY_SECTIONS.flatMap((s) => s.fields);
  const companyValues = existing ? Object.fromEntries(companyFields.map((f) => [f.key, existing.company.values[f.key]]).filter(([, v]) => v !== null && v !== undefined)) : {};
  if (company && !companyValues["company.name"]) companyValues["company.name"] = company;
  const keptModels = existing ? valuesOf(existing.models, MODEL_COLUMNS) : [];
  const known = new Set(keptModels.map((m) => norm(m["model.name"])));
  const newModels = intake.models
    .map((m) => ({ ...pick(m.values, modelKeys), "model.manual_depends": "Not sure" }))
    .filter((m) => !known.has(norm(m["model.name"])));

  // Unit numbers that may have lost their zeros: plain numbers in a CSV, or numbers stored as numbers in an .xlsx.
  const plain = intake.assets.filter((a) => a.numeric["asset.code"] || isPlainNumber(a.values["asset.code"])).map((a) => a.values["asset.code"]);
  const notes = existing ? valuesOf(existing.notes, NOTE_COLUMNS) : [];
  if (plain.length && !notes.some((n) => norm(n["note.about"]) === norm(CODES_NOTE_ABOUT))) {
    notes.unshift({
      "note.about": CODES_NOTE_ABOUT,
      "note.text": `${codeSummary(plain)} came as plain numbers. Ask the customer once: exactly like that on the machines, or with leading zeros (like 00401)? Fix the codes if needed, then delete this note.`,
    });
  }

  const data = {
    company: companyValues,
    people: existing ? valuesOf(existing.people, PEOPLE_COLUMNS) : [],
    assets: intake.assets.map((a) => pick(a.values, assetKeys)),
    models: [...keptModels, ...newModels],
    files: existing ? valuesOf(existing.files, FILE_COLUMNS) : [],
    notes,
  };
  const workbook = await buildIntakeWorkbook({ variant: "prefill", data, banner: prefillBanner(file) });
  const report = {
    source: file,
    rows: intake.assets.length,
    models_suggested: intake.models.length,
    mapped_columns: [...new Set(intake.assets.flatMap((a) => Object.keys(a.cells)))],
    unmapped_columns: intake.meta.unmapped_columns,
    merged_model_spellings: intake.meta.merged_model_spellings,
    category_codes_not_used: intake.meta.category_codes,
    plain_number_codes: plain.length ? codeSummary(plain) : null,
    reader_notes: intake.meta.notes,
    issues: intake.issues,
  };
  return { workbook, report };
}
