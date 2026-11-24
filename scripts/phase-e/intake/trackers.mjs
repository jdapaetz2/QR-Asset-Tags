/**
 * Engineering Phase E3 — the tag order (tag-production handoff): batch facts plus the owner production CSV's columns
 * (lib/qr/production-csv.ts) and the checks a tag run needs, for the approved machines only. `onboard:check` writes a
 * copy with the facts from the CALL SHEET already filled in. Since kit 2.0 the batch's dates and time live on the
 * CALL SHEET, so there is no separate tracker. Plain Excel-2007 formulas with cached results; no macros, no links.
 */
import { createRequire } from "node:module";

import { BRAND, KIT, OFFICE_FONT } from "./kit-config.mjs";
import { toCsv } from "./csv.mjs";
import { normalizeOoxml } from "./zip.mjs";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

/** lib/qr/production-csv.ts PRODUCTION_CSV_HEADERS (the parity test compares the two). */
export const PRODUCTION_CSV_HEADERS = [
  "organization_name",
  "asset_code",
  "asset_name",
  "category",
  "make",
  "model",
  "short_code",
  "short_url",
  "qr_status",
  "asset_public_status",
  "equipment_page_published",
  "manual_available",
  "startup_guide_available",
  "tag_size",
  "material",
  "mounting_method",
  "qr_style_preset",
  "error_correction_level",
  "logo_enabled",
  "production_notes",
];
export const HANDOFF_EXTRA_COLUMNS = ["quantity", "proof_checked", "first_article_scan_ok", "handoff_notes"];
export const TAG_COLUMNS = [...PRODUCTION_CSV_HEADERS, ...HANDOFF_EXTRA_COLUMNS];

const argb = (hex) => `FF${hex}`;
const font = (o = {}) => ({ name: OFFICE_FONT, size: 10, color: { argb: argb(BRAND.iron) }, ...o });
const solid = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });

function newBook(title) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mulemark";
  wb.lastModifiedBy = "Mulemark";
  wb.created = KIT.fixedDate;
  wb.modified = KIT.fixedDate;
  wb.title = title;
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

function headerRow(ws, row, labels, widths) {
  labels.forEach((label, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = label;
    cell.font = font({ bold: true });
    cell.fill = solid(BRAND.bone);
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: argb(BRAND.iron200) } } };
    if (widths?.[i]) ws.getColumn(i + 1).width = widths[i];
  });
  ws.getRow(row).height = 30;
}

const list = (ws, ref, values, strict = true) =>
  ws.dataValidations.add(ref, {
    type: "list",
    allowBlank: true,
    formulae: [`"${values.join(",")}"`],
    showErrorMessage: strict,
    errorStyle: "warning",
    errorTitle: "Not one of the choices",
    error: "Pick from the list, or choose Yes to keep your own answer.",
  });

/** HANDOFF rows: [label, kind, key in the values onboard:check passes]. */
export const HANDOFF_FIELDS = [
  ["Company", "text", "company"],
  ["Batch", "text", "batch"],
  ["Approval record", "text"],
  ["Content version", "text"],
  ["Approved on", "date"],
  ["New tags expected (setup workbook)", "number", "newTags"],
  ["Assets in this run", "count"],
  ["Ship to", "text", "shipTo"],
  ["Delivery contact", "text", "contact"],
  ["Tag size", "text", "size"],
  ["Material", "text", "material"],
  ["Mounting", "text", "mounting"],
  ["QR error correction", "text"],
  ["QR size", "text"],
  ["Ordered on", "date"],
  ["Proof approved on", "date"],
  ["Shipped on", "date"],
  ["Delivered on", "date"],
  ["Notes", "text"],
];

/**
 * The tag-production handoff workbook: HANDOFF (batch facts) and TAGS (one row per approved machine). values: the
 * facts onboard:check knows ({ company, batch, newTags, shipTo, contact, size, material, mounting }); blank otherwise.
 */
export async function tagHandoffXlsx(values = {}) {
  const wb = newBook("Mulemark tag-production handoff");
  const h = wb.addWorksheet("HANDOFF", { properties: { tabColor: { argb: argb(BRAND.brass) } } });
  h.getColumn(1).width = 34;
  h.getColumn(2).width = 48;
  h.getCell("A1").value = "Tag-production handoff";
  h.getCell("A1").font = font({ size: 14, bold: true });
  h.getCell("A2").value = "Only machines in the approval's included list. Paste the owner production CSV (Owner › Production › Export CSV) into TAGS from cell A2.";
  h.getCell("A2").font = font({ italic: true, color: { argb: argb(BRAND.iron600) } });
  h.getCell("A2").alignment = { wrapText: true };
  h.mergeCells("A2:B2");
  h.getRow(2).height = 30;
  HANDOFF_FIELDS.forEach(([label, kind, key], i) => {
    const r = 4 + i;
    h.getCell(r, 1).value = label;
    h.getCell(r, 1).font = font({ bold: true });
    const cell = h.getCell(r, 2);
    cell.border = { bottom: { style: "thin", color: { argb: argb(BRAND.iron200) } } };
    if (kind === "date") cell.numFmt = "yyyy-mm-dd";
    else if (kind === "text") cell.numFmt = "@";
    if (kind === "count") {
      cell.value = { formula: "COUNTA(TAGS!$B$2:$B$1001)", result: 0 };
      cell.fill = solid(BRAND.bone);
    }
    const v = key ? values[key] : undefined;
    if (v !== undefined && v !== null && v !== "") cell.value = kind === "number" ? Number(v) : String(v);
  });
  const t = wb.addWorksheet("TAGS");
  headerRow(t, 1, TAG_COLUMNS, TAG_COLUMNS.map((c) => (c === "short_url" ? 34 : c === "asset_name" || c === "production_notes" || c === "handoff_notes" ? 26 : 16)));
  t.getColumn(2).numFmt = "@";
  list(t, "V2:V1001", ["Yes", "No"]);
  list(t, "W2:W1001", ["Yes", "No"]);
  t.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  return normalizeOoxml(Buffer.from(await wb.xlsx.writeBuffer()), { date: KIT.fixedDate });
}

export function tagHandoffCsv() {
  return toCsv(TAG_COLUMNS, [], { mode: "machine" });
}
