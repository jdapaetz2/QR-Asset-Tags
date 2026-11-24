/**
 * Engineering Phase E3 — reads a setup workbook, or a customer's own equipment list (fleet export), into one
 * normalized intake: { meta, company, people, assets, models, files, notes, issues }.
 *
 * Untrusted input rules (the customer's list is untrusted; so is anything pasted from it into the workbook):
 *  - The .xlsx is checked from its ZIP directory before parsing (zip.mjs inspectWorkbookZip): macros refuse the file,
 *    size and unpack caps apply, external links are noted and never opened.
 *  - Formulas are never evaluated. A formula in an input cell is flagged and its value held back; error cells are
 *    flagged, and so are dates outside the CALL SHEET's date fields. Hyperlinks keep only http(s) targets.
 *  - A value that would run as a formula when opened in a spreadsheet (= + - @ ...) is held back, except phone-shaped
 *    phone values. Card-like numbers and password text in free-text fields are held back too.
 * Headers are matched by label through the versioned mapping (and through the alias list for a customer's list), so
 * rows can be inserted or columns reordered without breaking the read.
 */
import { createRequire } from "node:module";

import { decodeCsv, isPhoneShaped, looksLikeFormula, parseCsv } from "./csv.mjs";
import {
  ASSET_COLUMNS,
  COMPANY_SECTIONS,
  FILE_COLUMNS,
  FLEET_ALIASES,
  MODEL_COLUMNS,
  NOTE_COLUMNS,
  PEOPLE_COLUMNS,
  TABS,
  normalizeHeader,
} from "./field-mapping.mjs";
import { KIT, LISTS, UNKNOWN } from "./kit-config.mjs";
import { inspectWorkbookZip } from "./zip.mjs";

const require = createRequire(import.meta.url);

const COMPANY_FIELDS = COMPANY_SECTIONS.flatMap((s) => s.fields);
const FREE_TEXT_KEYS = new Set([
  "asset.fitted",
  "asset.differences",
  "asset.notes",
  "model.return_rules",
  "model.questions",
  "model.notes",
  "model.accessories",
  "file.notes",
  "note.text",
  "people.notes",
  "rules.fuel",
  "rules.cleaning",
  "rules.accessories",
  "rules.damage_late",
  "rules.other",
  "tags.contact",
  "tags.ship_to",
]);
const PHONE_KEYS = new Set(["company.support_phone", "asset.unit_support", "tags.contact"]);

/** Canonical text: NFC, trimmed, line breaks normalised. */
export function clean(text) {
  if (text === null || text === undefined) return null;
  const s = String(text).normalize("NFC").replace(/\r\n?/g, "\n").trim();
  return s === "" ? null : s;
}

/** Case-insensitive match to a list value; returns the canonical spelling, or the text unchanged. */
export function canonical(text, list) {
  if (text === null) return null;
  const hit = list.find((v) => v.toLowerCase() === text.toLowerCase());
  return hit ?? text;
}

export const isUnknown = (text) => typeof text === "string" && UNKNOWN.includes(text);

function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Card-like numbers (13-19 digits, Luhn-valid, card prefixes) or password-ish text: never copied anywhere. */
export function sensitiveKind(text) {
  if (typeof text !== "string") return null;
  for (const m of text.matchAll(/(?:\d[ -]?){12,18}\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && /^[3-6]/.test(digits) && luhn(digits)) return "card-number";
  }
  if (/\b(pass(word|wd|code)?|pwd|pin code|login)\s*[:=]/i.test(text)) return "password";
  return null;
}

/** Turn one exceljs cell into { text, numeric, issue }. Never evaluates anything. */
export function cellText(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return { text: null };
  if (typeof v === "string") return { text: clean(v) };
  if (typeof v === "number") return { text: clean(String(v)), numeric: true };
  if (typeof v === "boolean") return { text: v ? "Yes" : "No" };
  if (v instanceof Date) return { text: clean(v.toISOString().slice(0, 10)), issue: "date" };
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v) return { text: null, issue: "formula" };
    if ("error" in v) return { text: null, issue: "error" };
    if (Array.isArray(v.richText)) return { text: clean(v.richText.map((p) => p.text).join("")) };
    if ("hyperlink" in v) {
      const target = String(v.hyperlink ?? "");
      const text = clean(typeof v.text === "string" ? v.text : Array.isArray(v.text?.richText) ? v.text.richText.map((p) => p.text).join("") : "");
      if (/^https?:\/\//i.test(target)) return { text: text && /^https?:\/\//i.test(text) ? text : target, link: target };
      return { text, issue: target && !/^mailto:/i.test(target) ? "link-ignored" : undefined };
    }
  }
  return { text: clean(String(v)) };
}

function newIntake(meta) {
  return { meta, company: { values: {}, cells: {} }, people: [], assets: [], models: [], files: [], notes: [], issues: [] };
}

/** Apply the untrusted-value rules to one value; returns the value to keep (or null) and records any issue. */
function admit(intake, { tab, row, ref, field, text, numeric, issue }) {
  const record = (kind, detail) => intake.issues.push({ tab, row, cell: ref, key: field.key, label: field.label, kind, detail });
  if (issue === "formula") {
    record("formula", "A formula in an input cell; it was not run and its value was held back.");
    return null;
  }
  if (issue === "error") {
    record("error", "The cell shows a spreadsheet error.");
    return null;
  }
  if (issue === "date" && field.type !== "date") record("date", "The cell holds a date; check it is what you meant.");
  if (issue === "link-ignored") record("link-ignored", "A link that is not a web address was ignored.");
  if (text === null) return null;
  if (looksLikeFormula(text) && !(PHONE_KEYS.has(field.key) && isPhoneShaped(text))) {
    record("held-back", "The value starts like a spreadsheet formula, so it was held back.");
    return null;
  }
  if (FREE_TEXT_KEYS.has(field.key)) {
    const kind = sensitiveKind(text);
    if (kind) {
      record(kind, kind === "card-number" ? "Looks like a card number; it was not copied." : "Looks like a password; it was not copied.");
      return null;
    }
  }
  void numeric;
  const listed = field.list && LISTS[field.list] ? canonical(text, LISTS[field.list]) : text;
  return canonical(listed, UNKNOWN);
}

// ------------------------------------------------------------------------------------------------ xlsx

function rowCells(ws, r) {
  const row = ws.getRow(r);
  const out = [];
  row.eachCell({ includeEmpty: false }, (cell, c) => (out[c] = cell));
  return out;
}

/** Find the header row of a table by its labels (first 12 rows); returns { row, columns: Map(col -> field) }. */
function findTable(ws, fields, { minCol = 1, maxCol = 60 } = {}) {
  const byLabel = new Map(fields.map((f) => [normalizeHeader(f.label), f]));
  let best = null;
  for (let r = 1; r <= Math.min(12, ws.rowCount); r++) {
    const columns = new Map();
    for (let c = minCol; c <= maxCol; c++) {
      const t = cellText(ws.getCell(r, c)).text;
      const f = t ? byLabel.get(normalizeHeader(t)) : null;
      if (f && ![...columns.values()].includes(f)) columns.set(c, f);
    }
    if (columns.size >= 2 && (!best || columns.size > best.columns.size)) best = { row: r, columns };
  }
  return best;
}

function readTable(intake, ws, fields, target, { tab, minCol, maxCol } = {}) {
  const table = findTable(ws, fields, { minCol, maxCol });
  if (!table) {
    intake.issues.push({ tab, kind: "missing-table", detail: `The ${tab} table headings were not found.` });
    return;
  }
  const hints = new Map(fields.map((f) => [f.key, clean(f.hint)]));
  for (let r = table.row + 1; r <= ws.rowCount; r++) {
    const raws = [...table.columns].map(([c, field]) => ({ c, field, cell: ws.getCell(r, c), raw: cellText(ws.getCell(r, c)) }));
    if (raws.every(({ raw }) => raw.text === null && !raw.issue)) continue;
    // The grey hint row under the labels: skipped when every filled cell still holds its hint.
    if (r === table.row + 1 && raws.every(({ field, raw }) => raw.text === null || raw.text === hints.get(field.key))) continue;
    const values = {};
    const cells = {};
    const numeric = {};
    let any = false;
    for (const { field, cell, raw } of raws) {
      const kept = admit(intake, { tab, row: r, ref: cell.address, field, ...raw });
      values[field.key] = kept;
      cells[field.key] = cell.address;
      if (raw.numeric) numeric[field.key] = true;
      if (kept !== null || raw.issue === "formula" || raw.issue === "error") any = true;
    }
    if (any) target.push({ row: r, values, cells, numeric });
  }
}

function readCompanyForm(intake, ws) {
  const byLabel = new Map(COMPANY_FIELDS.map((f) => [normalizeHeader(f.label), f]));
  for (let r = 1; r <= Math.min(120, ws.rowCount); r++) {
    const label = cellText(ws.getCell(r, 2)).text;
    const field = label ? byLabel.get(normalizeHeader(label)) : null;
    if (!field) continue;
    const cell = ws.getCell(r, 3);
    const raw = cellText(cell);
    intake.company.values[field.key] = admit(intake, { tab: TABS.company, row: r, ref: cell.address, field, ...raw });
    intake.company.cells[field.key] = cell.address;
  }
}

function workbookVersion(wb) {
  const ws = wb.getWorksheet(TABS.lists);
  if (!ws) return null;
  for (let c = 1; c <= 40; c++) {
    for (let r = 1; r <= 5; r++) {
      if (cellText(ws.getCell(r, c)).text === "Workbook version") return cellText(ws.getCell(r, c + 1)).text;
    }
  }
  return null;
}

/** Read a filled intake workbook (.xlsx bytes). Refuses unsafe files with an Error listing the problems. */
export async function readWorkbook(buffer, { file = "workbook.xlsx" } = {}) {
  const check = inspectWorkbookZip(buffer);
  if (!check.ok) throw new Error(`${file} was not read: ${check.problems.join(" ")}`);
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const version = workbookVersion(wb);
  const intake = newIntake({ source: "xlsx", file, workbook_version: version, mapping_version: KIT.mappingVersion, notes: check.notes });
  if (version && version !== KIT.workbookVersion) intake.issues.push({ kind: "version", detail: `Workbook version ${version}; this reader expects ${KIT.workbookVersion}. Labels were matched by name.` });
  const tab = (name) => wb.getWorksheet(name) ?? wb.worksheets.find((w) => normalizeHeader(w.name) === normalizeHeader(name));

  const company = tab(TABS.company);
  if (company) {
    readCompanyForm(intake, company);
    readTable(intake, company, PEOPLE_COLUMNS, intake.people, { tab: TABS.company, minCol: 5 });
  } else intake.issues.push({ tab: TABS.company, kind: "missing-tab", detail: `The ${TABS.company} tab is missing.` });
  for (const [name, fields, target] of [
    [TABS.assets, ASSET_COLUMNS, intake.assets],
    [TABS.models, MODEL_COLUMNS, intake.models],
  ]) {
    const ws = tab(name);
    if (ws) readTable(intake, ws, fields, target, { tab: name });
    else intake.issues.push({ tab: name, kind: "missing-tab", detail: `The ${name} tab is missing.` });
  }
  const files = tab(TABS.files);
  if (files) {
    readTable(intake, files, FILE_COLUMNS, intake.files, { tab: TABS.files, maxCol: FILE_COLUMNS.length + 1 });
    readTable(intake, files, NOTE_COLUMNS, intake.notes, { tab: TABS.files, minCol: FILE_COLUMNS.length + 2 });
  }
  return intake;
}

// ------------------------------------------------------------------------------------------------ csv

function headerLookup(fields, aliases) {
  const lookup = new Map();
  for (const f of fields) {
    lookup.set(normalizeHeader(f.label), f);
    lookup.set(normalizeHeader(f.key), f);
    lookup.set(normalizeHeader(f.key.split(".").pop()), f);
    for (const a of aliases?.[f.key] ?? []) if (!lookup.has(normalizeHeader(a))) lookup.set(normalizeHeader(a), f);
  }
  return lookup;
}

/**
 * Read one CSV table whose headers are labels, stable keys or (for a customer's list) aliases, starting at row `skip`
 * (lines above it, such as a report title, are ignored). Returns the unmapped headers.
 */
function csvTable(intake, rows, fields, target, tab, aliases = null, skip = 0) {
  if (rows.length <= skip) return [];
  const lookup = headerLookup(fields, aliases);
  const header = rows[skip].map((h) => normalizeHeader(h));
  const columns = new Map();
  const unmapped = [];
  header.forEach((h, i) => {
    const f = lookup.get(h);
    if (f && ![...columns.values()].includes(f)) columns.set(i, f);
    else if (h) unmapped.push(rows[skip][i].replace(/^﻿/, "").trim());
  });
  for (let r = skip + 1; r < rows.length; r++) {
    const values = {};
    const cells = {};
    let any = false;
    for (const [i, field] of columns) {
      const kept = admit(intake, { tab, row: r + 1, ref: `${tab}:${r + 1}:${i + 1}`, field, text: clean(rows[r][i]) });
      values[field.key] = kept;
      cells[field.key] = `row ${r + 1}, column ${i + 1}`;
      if (kept !== null) any = true;
    }
    if (any) target.push({ row: r + 1, values, cells, numeric: {} });
  }
  return unmapped;
}

// ------------------------------------------------------------------------------------------------ fleet export

/** How many lines at the top of a list may sit above its header row (report titles, dates, blank lines). */
export const HEADER_SEARCH_ROWS = 10;

/** A rental-software code rather than a plain label: no spaces, no lower case, and a digit or a separator (TRL-UTIL). */
export const looksLikeCode = (text) => typeof text === "string" && !/\s/.test(text) && !/[a-z]/.test(text) && /[\d\-_/.]/.test(text);

/** Model key for grouping: same make (any case) and the same model once spaces and punctuation are ignored (30SA-12 = 30SA12). */
const modelKey = (make, model) => `${String(make ?? "").trim().toLowerCase()}|${String(model ?? "").toLowerCase().replace(/[\s\-_./]+/g, "")}`;

/** The most common value in a list (first seen wins a tie), or null. */
function mostCommon(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (!best || n > best.n) best = { v, n };
  return best?.v ?? null;
}

/**
 * A customer's own equipment list (CSV bytes, or .xlsx bytes: first sheet). Columns are matched through the alias list,
 * and the header row may sit below a few title lines; nothing is guessed: unmapped columns are reported.
 *
 * Machines are grouped into MODELS rows by make and model, ignoring case, spaces and punctuation in the model (the most
 * common spelling names the row). A machine with a make but no model gets no model (it becomes a question), with the
 * make kept in its notes; a category that looks like a rental-software code (TRL-UTIL) isn't used. The merges and the
 * codes left out are reported in meta, for the fill's report.
 */
export async function readFleetExport(buffer, { file = "fleet.csv" } = {}) {
  const intake = newIntake({ source: "fleet", file, workbook_version: null, mapping_version: KIT.mappingVersion, notes: [] });
  const fields = [...ASSET_COLUMNS, ...MODEL_COLUMNS.filter((f) => f.key === "model.make" || f.key === "model.model")];
  let rows;
  let numericCells = new Set();
  if (/\.xlsx$/i.test(file)) {
    const check = inspectWorkbookZip(buffer);
    if (!check.ok) throw new Error(`${file} was not read: ${check.problems.join(" ")}`);
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    rows = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const cells = rowCells(ws, r);
      const width = Math.max(0, cells.length - 1);
      const row = [];
      for (let c = 1; c <= width; c++) {
        const t = cellText(cells[c]);
        if (t.numeric) numericCells.add(`${r}:${c}`);
        row.push(t.issue === "formula" ? "" : (t.text ?? ""));
      }
      rows.push(row);
    }
  } else {
    rows = parseCsv(decodeCsv(buffer));
  }

  // The header row: the first of the top lines with a unit-number column.
  const codeHeaders = new Set([...FLEET_ALIASES["asset.code"], ...ASSET_COLUMNS.filter((f) => f.key === "asset.code").flatMap((f) => [f.label, f.key, "code"])].map(normalizeHeader));
  const skip = rows.slice(0, HEADER_SEARCH_ROWS).findIndex((row) => row.some((h) => codeHeaders.has(normalizeHeader(h))));
  if (skip < 0) throw new Error(`${file}: no header row with a unit number column (like "Unit #" or "Equipment ID") in its first ${HEADER_SEARCH_ROWS} lines.`);
  if (skip > 0) intake.meta.notes.push(`Skipped ${skip} line${skip === 1 ? "" : "s"} above the header row.`);
  const codeCol = rows[skip].findIndex((h) => codeHeaders.has(normalizeHeader(h)));

  const read = [];
  intake.meta.unmapped_columns = csvTable(intake, rows, fields, read, "fleet export", FLEET_ALIASES, skip);
  for (const r of read) {
    // An .xlsx stored the code as a number: its zeros may already be gone.
    if (numericCells.has(`${r.row}:${codeCol + 1}`)) {
      r.numeric["asset.code"] = true;
      intake.issues.push({ tab: "fleet export", row: r.row, cell: r.cells["asset.code"], key: "asset.code", kind: "number", detail: "Stored as a number; leading zeros may already be lost." });
    }
  }

  // Group by make and model; name each group by its most common spelling.
  const groups = new Map();
  for (const r of read) {
    const make = r.values["model.make"];
    const model = r.values["model.model"];
    if (!model) continue;
    const k = modelKey(make, model);
    if (!groups.has(k)) groups.set(k, { rows: [], makes: [], models: [], names: [], categories: [] });
    const g = groups.get(k);
    g.rows.push(r);
    g.makes.push(make ?? null);
    g.models.push(model);
    g.names.push([make, model].filter(Boolean).join(" "));
    g.categories.push(r.values["asset.category"] ?? null);
  }
  const merged = [];
  const codes = new Set();
  const nameOf = new Map();
  intake.models = [...groups.values()].map((g) => {
    const name = mostCommon(g.names);
    const variants = [...new Set(g.names)].filter((n) => n.toLowerCase() !== name.toLowerCase());
    if (variants.length) merged.push({ kept: name, merged: variants });
    const plain = g.categories.filter((c) => c && !looksLikeCode(c));
    for (const c of g.categories) if (c && looksLikeCode(c)) codes.add(c);
    for (const r of g.rows) nameOf.set(r, name);
    return { row: null, values: { "model.name": name, "model.make": mostCommon(g.makes), "model.model": mostCommon(g.models), "model.category": mostCommon(plain) }, cells: {}, numeric: {} };
  });
  for (const r of read) {
    const asset = { ...r, values: { ...r.values } };
    const make = asset.values["model.make"];
    delete asset.values["model.make"];
    delete asset.values["model.model"];
    // The category lives on MODELS; a code from their software is left out (reported).
    delete asset.values["asset.category"];
    const category = r.values["asset.category"];
    if (category && looksLikeCode(category)) codes.add(category);
    asset.values["asset.model"] = nameOf.get(r) ?? null;
    if (!asset.values["asset.model"] && make) asset.values["asset.notes"] = `Make on their list: ${make}`;
    intake.assets.push(asset);
  }
  intake.meta.merged_model_spellings = merged;
  intake.meta.category_codes = [...codes];
  return intake;
}
