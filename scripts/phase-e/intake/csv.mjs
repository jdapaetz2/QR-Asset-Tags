/**
 * Engineering Phase E3 — CSV helpers for the intake kit.
 *
 *  - parseCsv mirrors lib/csv/parse.ts (the app's own parser) exactly; the tests run both on the same inputs.
 *  - Report cells (anything a person opens in a spreadsheet) use the app's formula-injection guard (lib/export/csv.ts
 *    csvField): a value starting with = + - @ tab or CR gets a leading apostrophe, then RFC 4180 quoting.
 *  - Machine cells (files the importer reads) are only quoted: the importer would store a guard apostrophe. Values that
 *    look like formulas never reach machine files; the reader holds them back and the readiness report flags them.
 */

export const FORMULA_START = /^[=+\-@\t\r]/;

/** True when a cell value would run as a formula if opened in a spreadsheet. */
export function looksLikeFormula(value) {
  return typeof value === "string" && FORMULA_START.test(value);
}

/** A phone-shaped value (the app's dialable character set, optional extension) may start with "+". */
export function isPhoneShaped(value) {
  return typeof value === "string" && /^\+?[\d\s().-]+(?:\s*(?:ext\.?|extension|x|#)\s*\d{1,6})?$/i.test(value.trim());
}

/** Mirror of lib/export/csv.ts csvField. */
export function reportField(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/["\n\r,]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** RFC 4180 quoting only, for files the importer reads. */
export function machineField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CRLF lines with a trailing CRLF (the app's toCsv convention); optional UTF-8 BOM so Excel shows accents. */
export function toCsv(headers, rows, { mode = "report", bom = false } = {}) {
  const field = mode === "machine" ? machineField : reportField;
  const lines = [headers.map(field).join(","), ...rows.map((row) => row.map(field).join(","))];
  return `${bom ? "﻿" : ""}${lines.join("\r\n")}\r\n`;
}

/** Mirror of lib/csv/parse.ts parseCsv. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      endField();
      i += 1;
      continue;
    }
    if (c === "\r") {
      endRow();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (c === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

/** Decode CSV bytes: UTF-8 (BOM stripped). A file that is not valid UTF-8 is read as Windows-1252, the usual export. */
export function decodeCsv(buffer) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("windows-1252").decode(buffer);
  }
  return text.replace(/^﻿/, "");
}
