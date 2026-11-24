/**
 * Engineering Phase E3 — the internal spreadsheets:
 *
 *  - the onboarding tracker (one copy per customer batch, kept in private storage): CHECKLIST, RESPONSIBILITIES,
 *    EXCEPTIONS (the exception log) and TOUCH TIME, which keeps hands-on minutes, customer wait and tag manufacturing
 *    apart, as the contract's §5 measurements require;
 *  - the tag-production handoff: batch facts plus the owner production CSV's columns (lib/qr/production-csv.ts) and
 *    the checks a tag run needs, for the approved assets only.
 * Plain Excel-2007 formulas with cached results; no macros, no links to other files.
 */
import { createRequire } from "node:module";

import { CHECKLIST, EXCEPTION_COLUMNS, EXCEPTION_EFFECTS, RESPONSIBILITIES, TOUCH_ACTIVITIES } from "./documents.mjs";
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

/** The onboarding tracker: a blank copy goes into each customer batch folder in private storage. */
export async function onboardingTrackerXlsx() {
  const wb = newBook("Mulemark onboarding tracker");

  const check = wb.addWorksheet("CHECKLIST", { properties: { tabColor: { argb: argb(BRAND.brass) } } });
  check.getCell("A1").value = `Onboarding checklist · kit ${KIT.workbookVersion}`;
  check.getCell("A1").font = font({ size: 14, bold: true });
  check.getCell("A2").value = "Company and batch:";
  check.getCell("A2").font = font({ bold: true });
  check.getCell("B2").border = { bottom: { style: "thin", color: { argb: argb(BRAND.iron200) } } };
  headerRow(check, 4, ["#", "Stage", "Step", "Who", "Gate", "Done", "Date", "Notes"], [5, 12, 70, 18, 7, 9, 12, 34]);
  CHECKLIST.forEach((s, i) => {
    const r = 5 + i;
    check.getRow(r).values = [i + 1, s.stage, s.step, s.who, s.gate ? "Gate" : "", null, null, null];
    check.getRow(r).font = font();
    check.getRow(r).alignment = { vertical: "top", wrapText: true };
    check.getCell(r, 7).numFmt = "yyyy-mm-dd";
  });
  list(check, `F5:F${4 + CHECKLIST.length}`, ["Yes", "No", "N/A"]);
  check.views = [{ state: "frozen", ySplit: 4 }];

  const resp = wb.addWorksheet("RESPONSIBILITIES");
  resp.getCell("A1").value = "Who does what";
  resp.getCell("A1").font = font({ size: 14, bold: true });
  resp.getCell("A2").value = "D = does it · A = approves · I = kept informed";
  resp.getCell("A2").font = font({ italic: true, color: { argb: argb(BRAND.iron600) } });
  headerRow(resp, 4, ["Activity", ...RESPONSIBILITIES.columns], [58, 12, 12, 12]);
  RESPONSIBILITIES.rows.forEach((row, i) => {
    resp.getRow(5 + i).values = row;
    resp.getRow(5 + i).font = font();
    for (let c = 2; c <= 4; c++) resp.getCell(5 + i, c).alignment = { horizontal: "center" };
  });

  const ex = wb.addWorksheet("EXCEPTIONS");
  headerRow(ex, 1, EXCEPTION_COLUMNS, [9, 11, 16, 18, 18, 18, 40, 24, 11, 30, 11, 30]);
  for (let r = 2; r <= 301; r++) {
    ex.getCell(r, 1).value = { formula: `IF(C${r}="","","EX-"&TEXT(ROW()-1,"000"))`, result: "" };
    ex.getCell(r, 2).numFmt = "yyyy-mm-dd";
    ex.getCell(r, 11).numFmt = "yyyy-mm-dd";
  }
  list(ex, "H2:H301", EXCEPTION_EFFECTS);
  list(ex, "I2:I301", ["Customer", "Mulemark"]);
  ex.views = [{ state: "frozen", ySplit: 1 }];

  const tt = wb.addWorksheet("TOUCH TIME");
  tt.getCell("A1").value = "Hands-on log (Mulemark minutes)";
  tt.getCell("A1").font = font({ bold: true, size: 12 });
  headerRow(tt, 2, ["Date", "Batch", "Activity", "Minutes", "Notes"], [11, 16, 16, 9, 30]);
  for (let r = 3; r <= 302; r++) tt.getCell(r, 1).numFmt = "yyyy-mm-dd";
  list(tt, "C3:C302", TOUCH_ACTIVITIES);
  tt.getColumn(6).width = 3;
  tt.getCell("G1").value = "Waiting (not hands-on)";
  tt.getCell("G1").font = font({ bold: true, size: 12 });
  ["Batch", "Waiting on", "From", "To", "Hours"].forEach((label, i) => {
    const cell = tt.getCell(2, 7 + i);
    cell.value = label;
    cell.font = font({ bold: true });
    cell.fill = solid(BRAND.bone);
    tt.getColumn(7 + i).width = [16, 12, 17, 17, 9][i];
  });
  for (let r = 3; r <= 102; r++) {
    tt.getCell(r, 9).numFmt = "yyyy-mm-dd hh:mm";
    tt.getCell(r, 10).numFmt = "yyyy-mm-dd hh:mm";
    tt.getCell(r, 11).value = { formula: `IF(OR(I${r}="",J${r}=""),"",ROUND((J${r}-I${r})*24,1))`, result: "" };
  }
  list(tt, "H3:H102", ["Customer", "Tag maker"]);
  tt.getColumn(12).width = 3;
  tt.getCell("M1").value = "Batch summary";
  tt.getCell("M1").font = font({ bold: true, size: 12 });
  tt.getColumn(13).width = 34;
  tt.getColumn(14).width = 18;
  const summary = [
    ["Batch", null, "input"],
    ["Batch complete (everything received)", null, "date"],
    ["Review-ready preview sent", null, "date"],
    ["Elapsed business days", { formula: 'IF(OR(N3="",N4=""),"",NETWORKDAYS(N3,N4)-1)', result: "" }],
    [`Internal target (business days)`, KIT.reviewReadyBusinessDays],
    ["Within target?", { formula: 'IF(N5="","",IF(N5<=N6,"Yes","No"))', result: "" }],
    ["Hands-on minutes (this batch)", { formula: 'IF(N2="","",SUMIFS($D$3:$D$302,$B$3:$B$302,N2))', result: "" }],
    ["Customer wait (hours)", { formula: 'IF(N2="","",SUMIFS($K$3:$K$102,$G$3:$G$102,N2,$H$3:$H$102,"Customer"))', result: "" }],
    ["Tag manufacturing (days)", { formula: 'IF(N2="","",ROUND(SUMIFS($K$3:$K$102,$G$3:$G$102,N2,$H$3:$H$102,"Tag maker")/24,1))', result: "" }],
    ...TOUCH_ACTIVITIES.map((a) => [`  ${a} (minutes)`, { formula: `IF($N$2="","",SUMIFS($D$3:$D$302,$B$3:$B$302,$N$2,$C$3:$C$302,"${a}"))`, result: "" }]),
  ];
  summary.forEach(([label, value, kind], i) => {
    const r = 2 + i;
    tt.getCell(r, 13).value = label;
    tt.getCell(r, 13).font = font({ bold: i < 9 });
    const cell = tt.getCell(r, 14);
    if (value !== null) cell.value = value;
    if (kind === "date") cell.numFmt = "yyyy-mm-dd";
    cell.fill = solid(kind ? BRAND.white : BRAND.bone);
    cell.border = { bottom: { style: "thin", color: { argb: argb(BRAND.iron200) } } };
  });
  tt.getCell("M20").value = "Customer wait and tag manufacturing are never counted as hands-on time. The target is internal, not a promise.";
  tt.getCell("M20").font = font({ italic: true, size: 9, color: { argb: argb(BRAND.iron600) } });
  tt.getCell("M20").alignment = { wrapText: true };
  tt.mergeCells("M20:N22");
  tt.views = [{ state: "frozen", ySplit: 2 }];

  return normalizeOoxml(Buffer.from(await wb.xlsx.writeBuffer()), { date: KIT.fixedDate });
}

const HANDOFF_FIELDS = [
  ["Company", "text"],
  ["Batch", "text"],
  ["Approval record", "text"],
  ["Content version", "text"],
  ["Approved on", "date"],
  ["Assets in this run", "count"],
  ["Ship to", "text"],
  ["Delivery contact", "text"],
  ["Tag size", "text"],
  ["Material", "text"],
  ["Mounting", "text"],
  ["QR error correction", "text"],
  ["QR size", "text"],
  ["Ordered on", "date"],
  ["Proof approved on", "date"],
  ["Shipped on", "date"],
  ["Delivered on", "date"],
  ["Notes", "text"],
];

/** The tag-production handoff workbook: HANDOFF (batch facts) and TAGS (one row per approved asset). */
export async function tagHandoffXlsx() {
  const wb = newBook("Mulemark tag-production handoff");
  const h = wb.addWorksheet("HANDOFF", { properties: { tabColor: { argb: argb(BRAND.brass) } } });
  h.getColumn(1).width = 26;
  h.getColumn(2).width = 48;
  h.getCell("A1").value = "Tag-production handoff";
  h.getCell("A1").font = font({ size: 14, bold: true });
  h.getCell("A2").value = "Only assets in the approval's included list. Paste the owner production CSV (Owner › Production › Export CSV) into TAGS from cell A2.";
  h.getCell("A2").font = font({ italic: true, color: { argb: argb(BRAND.iron600) } });
  h.getCell("A2").alignment = { wrapText: true };
  h.mergeCells("A2:B2");
  h.getRow(2).height = 30;
  HANDOFF_FIELDS.forEach(([label, kind], i) => {
    const r = 4 + i;
    h.getCell(r, 1).value = label;
    h.getCell(r, 1).font = font({ bold: true });
    const cell = h.getCell(r, 2);
    cell.border = { bottom: { style: "thin", color: { argb: argb(BRAND.iron200) } } };
    if (kind === "date") cell.numFmt = "yyyy-mm-dd";
    if (kind === "count") {
      cell.value = { formula: "COUNTA(TAGS!$B$2:$B$1001)", result: 0 };
      cell.fill = solid(BRAND.bone);
    }
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
