/**
 * Engineering Phase E3 — writes the intake workbook: blank, the completed fictional example, or pre-filled from a
 * customer's own fleet export.
 *
 * Every data tab has the same shape (LAYOUT): title, note, a band row (TO START / BEFORE GO-LIVE / OPTIONAL), the
 * labels, a grey hint row with a format example, then input rows. Input columns are unlocked and text-formatted (so
 * 00412 stays 00412 and nothing typed becomes a formula); headings, hints and the Check columns are protected with no
 * password, and START HERE says how to unprotect, so customer input is never trapped. Dropdowns come from the LISTS tab
 * through defined names. The Check formulas use Excel-2007 functions only, and their cached results are computed here
 * (mirrored in assetCheckValue / modelCheckValue) so previews show them before Excel recalculates.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { artPng, lockupPng } from "./art.mjs";
import {
  ASSET_COLUMNS,
  COMPANY_SECTIONS,
  FILE_COLUMNS,
  LAYOUT,
  MODEL_COLUMNS,
  NOTE_COLUMNS,
  PEOPLE_COLUMNS,
  ROWS,
  TABS,
  TIER_LABEL,
} from "./field-mapping.mjs";
import { BRAND, KIT, LISTS, OFFICE_FONT, PATHS, UNKNOWN } from "./kit-config.mjs";
import { normalizeOoxml } from "./zip.mjs";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

const argb = (hex) => `FF${hex}`;
const font = (o = {}) => ({ name: OFFICE_FONT, size: 10, color: { argb: argb(BRAND.iron) }, ...o });
const solid = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });
const TIER_FILL = { start: BRAND.brass, golive: BRAND.iron600, optional: BRAND.iron200 };
const TIER_TEXT = { start: BRAND.white, golive: BRAND.white, optional: BRAND.iron };
const NEEDED_TEXT = { start: "To start", golive: "Before go-live", optional: "" };
const BOTTOM = { bottom: { style: "thin", color: { argb: argb(BRAND.iron200) } } };

export const LIST_TITLES = {
  unknown: "Unknown answers",
  yesNo: "Yes or no",
  yesNoNotSure: "Yes, no or not sure",
  role: "Roles",
  returnEmails: "Return emails",
  tag: "Tag",
  assetPhoto: "Asset photo",
  modelPhoto: "Model photo",
  model: "Model (unknown answers)",
  manual: "Manual (unknown answers)",
  manualShare: "May renters see the manual?",
  photoPermission: "Who took the model photo?",
  fuel: "Fuel or power",
  fileKind: "What it is",
  fileSource: "Where is it from?",
  fileAudience: "Who may see it?",
  category: "Category suggestions",
  tagMounting: "How tags attach",
  tagSize: "Tag size",
  tagMaterial: "Tag material",
  brandColor: "Brand color",
  modelChoices: "Model (from MODELS)",
};
export const LIST_ORDER = [...Object.keys(LISTS), "modelChoices"];

export function colLetter(n) {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

export const ASSET_LAST_ROW = LAYOUT.firstDataRow + ROWS.assets - 1;
export const MODEL_LAST_ROW = LAYOUT.firstDataRow + ROWS.models - 1;

// ------------------------------------------------------------------------------------------------ Check formulas

const sameText = (range, cell) => `SUMPRODUCT(--(UPPER(TRIM(${range}))=UPPER(TRIM(${cell}))))`;

/** ASSETS Check: code A, name B, model C (field-mapping column order). Wildcard-safe; ignores case like the importer. */
export function assetCheckFormula(r) {
  const a = `A${r}`;
  const b = `B${r}`;
  const c = `C${r}`;
  return (
    `IF(AND(${a}="",${b}="",${c}=""),"",` +
    `IF(${a}="","Add the asset code",` +
    `IF(ISNUMBER(${a}),"Code stored as a number: check leading zeros",` +
    `IF(${sameText(`$A$${LAYOUT.firstDataRow}:$A$${ASSET_LAST_ROW}`, a)}>1,"Duplicate code",` +
    `IF(${b}="","Add the asset name",` +
    `IF(${c}="","Pick a model name",` +
    `IF(OR(${c}="Not sure",${c}="Not available",${c}="Please review"),"Model to confirm",` +
    `IF(${sameText(`MODELS!$A$${LAYOUT.firstDataRow}:$A$${MODEL_LAST_ROW}`, c)}=0,"Add this model on MODELS","OK"))))))))`
  );
}

/** MODELS Check: name A, make B, model C; shows how many assets use the model. */
export function modelCheckFormula(r) {
  const used = sameText(`ASSETS!$C$${LAYOUT.firstDataRow}:$C$${ASSET_LAST_ROW}`, `A${r}`);
  return (
    `IF(A${r}="","",` +
    `IF(${sameText(`$A$${LAYOUT.firstDataRow}:$A$${MODEL_LAST_ROW}`, `A${r}`)}>1,"Name used twice",` +
    `IF(OR(B${r}="",C${r}=""),"Add make and model",` +
    `IF(${used}=1,"1 asset",${used}&" assets"))))`
  );
}

/** Excel TRIM (spaces only, inner runs collapsed) then UPPER. */
const excelKey = (v) => String(v ?? "").replace(/ +/g, " ").replace(/^ | $/g, "").toUpperCase();

/** Cached result of assetCheckFormula for row i of the given asset values. */
export function assetCheckValue(assets, i, modelNames) {
  const a = assets[i] ?? {};
  const code = a["asset.code"] ?? "";
  const name = a["asset.name"] ?? "";
  const model = a["asset.model"] ?? "";
  if (code === "" && name === "" && model === "") return "";
  if (code === "") return "Add the asset code";
  if (typeof code === "number") return "Code stored as a number: check leading zeros";
  if (assets.filter((x) => excelKey(x?.["asset.code"]) === excelKey(code)).length > 1) return "Duplicate code";
  if (name === "") return "Add the asset name";
  if (model === "") return "Pick a model name";
  if (UNKNOWN.includes(model)) return "Model to confirm";
  if (!modelNames.some((m) => excelKey(m) === excelKey(model))) return "Add this model on MODELS";
  return "OK";
}

export function modelCheckValue(models, i, assets) {
  const m = models[i] ?? {};
  const name = m["model.name"] ?? "";
  if (name === "") return "";
  if (models.filter((x) => excelKey(x?.["model.name"]) === excelKey(name)).length > 1) return "Name used twice";
  if (!m["model.make"] || !m["model.model"]) return "Add make and model";
  const used = assets.filter((a) => excelKey(a?.["asset.model"]) === excelKey(name)).length;
  return used === 1 ? "1 asset" : `${used} assets`;
}

// ------------------------------------------------------------------------------------------------ validations

function validationFor(field) {
  if (field.type === "year") {
    return { type: "whole", operator: "between", allowBlank: true, formulae: [1900, 2100], showErrorMessage: true, errorStyle: "warning", errorTitle: "Year", error: "Use a 4-digit year, like 2022." };
  }
  if (!field.list) return null;
  const list = `L_${field.list}`;
  if (field.type === "choice") {
    return {
      type: "list",
      allowBlank: true,
      formulae: [list],
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "Not one of the choices",
      error: "Pick from the list, or choose Yes to keep your own answer.",
    };
  }
  return { type: "list", allowBlank: true, formulae: [list], showErrorMessage: false };
}

const PROTECT = {
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: true,
  formatColumns: true,
  formatRows: true,
  insertRows: true,
  deleteRows: true,
  sort: true,
  autoFilter: true,
};

function title(ws, text, lastCol) {
  const cell = ws.getCell(LAYOUT.titleRow, 1);
  cell.value = text;
  cell.font = font({ size: 14, bold: true });
  const stamp = ws.getCell(LAYOUT.titleRow, lastCol);
  stamp.value = `Intake workbook ${KIT.workbookVersion}`;
  stamp.font = font({ size: 8, color: { argb: argb(BRAND.iron600) } });
  stamp.alignment = { horizontal: "right" };
  ws.getRow(LAYOUT.titleRow).height = 24;
}

function noteRow(ws, text, lastCol, banner) {
  ws.mergeCells(LAYOUT.noteRow, 1, LAYOUT.noteRow, lastCol);
  const cell = ws.getCell(LAYOUT.noteRow, 1);
  cell.value = banner ?? text;
  cell.alignment = { vertical: "middle", wrapText: true };
  if (banner) {
    cell.font = font({ bold: true, color: { argb: argb(BRAND.amberChipText) } });
    cell.fill = solid(BRAND.amberChipBg);
    ws.getRow(LAYOUT.noteRow).height = 30;
  } else {
    cell.font = font({ italic: true, color: { argb: argb(BRAND.iron600) } });
    ws.getRow(LAYOUT.noteRow).height = 18;
  }
}

function bandRow(ws, columns, startCol) {
  let c = 0;
  while (c < columns.length) {
    let end = c;
    while (end + 1 < columns.length && columns[end + 1].tier === columns[c].tier) end++;
    const from = startCol + c;
    const to = startCol + end;
    if (to > from) ws.mergeCells(LAYOUT.bandRow, from, LAYOUT.bandRow, to);
    const cell = ws.getCell(LAYOUT.bandRow, from);
    cell.value = TIER_LABEL[columns[c].tier];
    cell.font = font({ size: 9, bold: true, color: { argb: argb(TIER_TEXT[columns[c].tier]) } });
    cell.fill = solid(TIER_FILL[columns[c].tier]);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    c = end + 1;
  }
  ws.getRow(LAYOUT.bandRow).height = 18;
}

function labelAndHintRows(ws, columns, startCol) {
  columns.forEach((field, i) => {
    const label = ws.getCell(LAYOUT.labelRow, startCol + i);
    label.value = field.label;
    label.font = font({ bold: true });
    label.fill = solid(BRAND.bone);
    label.alignment = { vertical: "middle", wrapText: true };
    label.border = BOTTOM;
    label.protection = { locked: true };
    const hint = ws.getCell(LAYOUT.hintRow, startCol + i);
    hint.value = field.hint ?? "";
    hint.font = font({ size: 8, italic: true, color: { argb: argb(BRAND.iron600) } });
    hint.fill = solid(BRAND.bone);
    hint.alignment = { vertical: "top", wrapText: true };
    hint.protection = { locked: true };
  });
  ws.getRow(LAYOUT.labelRow).height = 32;
  ws.getRow(LAYOUT.hintRow).height = Math.max(ws.getRow(LAYOUT.hintRow).height ?? 0, hintRowHeight(columns));
}

/**
 * Tall enough for the longest hint: 8 pt italic Arial fits about 1.3 characters per unit of column width (measured
 * conservatively), about 11 points per line, never under three lines.
 */
export function hintRowHeight(columns) {
  const lines = (field) => {
    const perLine = Math.max(8, Math.floor((field.width ?? 20) * 1.3));
    let count = 1;
    let used = 0;
    for (const word of String(field.hint ?? "").split(/\s+/).filter(Boolean)) {
      if (used > 0 && used + 1 + word.length > perLine) {
        count++;
        used = word.length;
      } else used += (used > 0 ? 1 : 0) + word.length;
    }
    return count;
  };
  return Math.max(34, 11 * Math.max(...columns.map(lines)) + 4);
}

/** Input columns: unlocked, top-aligned and wrapped; text format except years (so nothing typed becomes a formula). */
function inputColumn(ws, colNumber, field) {
  const col = ws.getColumn(colNumber);
  col.width = field.width ?? 20;
  col.font = font();
  col.alignment = { vertical: "top", wrapText: true };
  if (field.type !== "year") col.numFmt = "@";
  col.protection = { locked: false };
}

function cellValue(field, value) {
  if (value === undefined || value === null || value === "") return null;
  if (field.type === "year" && /^\d{4}$/.test(String(value))) return Number(value);
  return value;
}

function lockHeaderCells(ws, fromCol, toCol) {
  for (let r = 1; r < LAYOUT.firstDataRow; r++) {
    for (let c = fromCol; c <= toCol; c++) ws.getCell(r, c).protection = { locked: true };
  }
}

// ------------------------------------------------------------------------------------------------ tabs

function addTable(ws, { tabTitle, note, banner, columns, rows, data, check, startCol = 1, freezeCols = 1 }) {
  const lastCol = startCol + columns.length - 1 + (check ? 1 : 0);
  columns.forEach((field, i) => inputColumn(ws, startCol + i, field));
  if (check) {
    const col = ws.getColumn(lastCol);
    col.width = check.width;
    col.font = font({ size: 9, color: { argb: argb(BRAND.iron600) } });
    col.alignment = { vertical: "top" };
    col.protection = { locked: true };
  }
  if (tabTitle) title(ws, tabTitle, lastCol);
  if (tabTitle) noteRow(ws, note, lastCol, banner);
  bandRow(ws, columns, startCol);
  labelAndHintRows(ws, columns, startCol);
  if (check) {
    const band = ws.getCell(LAYOUT.bandRow, lastCol);
    band.value = "CHECK";
    band.font = font({ size: 9, bold: true, color: { argb: argb(BRAND.iron) } });
    band.fill = solid(BRAND.iron200);
    band.alignment = { horizontal: "center", vertical: "middle" };
    const label = ws.getCell(LAYOUT.labelRow, lastCol);
    label.value = "Check";
    label.font = font({ bold: true });
    label.fill = solid(BRAND.bone);
    label.alignment = { vertical: "middle" };
    label.border = BOTTOM;
    const hint = ws.getCell(LAYOUT.hintRow, lastCol);
    hint.value = check.hint;
    hint.font = font({ size: 8, italic: true, color: { argb: argb(BRAND.iron600) } });
    hint.fill = solid(BRAND.bone);
    hint.alignment = { vertical: "top", wrapText: true };
  }
  lockHeaderCells(ws, 1, lastCol);

  data.forEach((record, i) => {
    columns.forEach((field, c) => {
      const v = cellValue(field, record[field.key]);
      if (v !== null) ws.getCell(LAYOUT.firstDataRow + i, startCol + c).value = v;
    });
  });
  if (check) {
    for (let i = 0; i < rows; i++) {
      const r = LAYOUT.firstDataRow + i;
      const cell = ws.getCell(r, lastCol);
      cell.value = { formula: check.formula(r), result: check.value(i) };
      cell.protection = { locked: true };
    }
    const ref = `${colLetter(lastCol)}${LAYOUT.firstDataRow}:${colLetter(lastCol)}${LAYOUT.firstDataRow + rows - 1}`;
    const first = `${colLetter(lastCol)}${LAYOUT.firstDataRow}`;
    ws.addConditionalFormatting({
      ref,
      rules: [
        {
          type: "expression",
          priority: 1,
          formulae: [`AND(${first}<>"",${first}<>"OK",RIGHT(${first},5)<>"asset",RIGHT(${first},6)<>"assets")`],
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: argb(BRAND.amberChipBg) } }, font: { color: { argb: argb(BRAND.amberChipText) }, bold: true } },
        },
      ],
    });
  }
  columns.forEach((field, c) => {
    const v = validationFor(field);
    const letter = colLetter(startCol + c);
    if (v) ws.dataValidations.add(`${letter}${LAYOUT.firstDataRow}:${letter}${LAYOUT.firstDataRow + rows - 1}`, v);
    if (field.key === "asset.code") {
      ws.dataValidations.add(`${letter}${LAYOUT.firstDataRow}:${letter}${LAYOUT.firstDataRow + rows - 1}`, {
        type: "textLength",
        operator: "lessThanOrEqual",
        allowBlank: true,
        formulae: [64],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Asset code",
        error: "Asset codes can be up to 64 characters.",
        showInputMessage: true,
        promptTitle: "Asset code",
        prompt: "Exactly as on your tag or fleet list. Leading zeros are kept.",
      });
    }
  });
  if (tabTitle) ws.views = [{ state: "frozen", xSplit: freezeCols, ySplit: LAYOUT.hintRow, topLeftCell: `${colLetter(freezeCols + 1)}${LAYOUT.firstDataRow}`, activeCell: `A${LAYOUT.firstDataRow}` }];
  return lastCol;
}

function addCompany(ws, { data, people, banner }) {
  const widths = [16, 36, 40, 50, 3];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const C = 3;
  const peopleStart = 6;
  ws.getColumn(C).font = font();
  ws.getColumn(C).numFmt = "@";
  ws.getColumn(C).alignment = { vertical: "top", wrapText: true };
  // Column styles first: setting them later would restyle the merged title and banner cells.
  PEOPLE_COLUMNS.forEach((field, i) => inputColumn(ws, peopleStart + i, field));
  title(ws, TABS.company, peopleStart + PEOPLE_COLUMNS.length - 1);
  noteRow(ws, "Answer on the left. List your team on the right.", peopleStart + PEOPLE_COLUMNS.length - 1, banner);

  ["Needed", "Question", "Your answer", "Help"].forEach((text, i) => {
    const cell = ws.getCell(LAYOUT.labelRow, i + 1);
    cell.value = text;
    cell.font = font({ bold: true });
    cell.fill = solid(BRAND.bone);
    cell.border = BOTTOM;
    cell.alignment = { vertical: "middle" };
  });

  let r = LAYOUT.hintRow;
  for (const section of COMPANY_SECTIONS) {
    ws.mergeCells(r, 1, r, 4);
    const head = ws.getCell(r, 1);
    head.value = section.title;
    head.font = font({ bold: true, size: 11 });
    head.fill = solid(BRAND.bone);
    ws.getRow(r).height = 20;
    r++;
    for (const field of section.fields) {
      const needed = ws.getCell(r, 1);
      needed.value = NEEDED_TEXT[field.tier] || null;
      if (field.tier !== "optional") {
        needed.font = font({ size: 9, bold: true, color: { argb: argb(TIER_TEXT[field.tier]) } });
        needed.fill = solid(TIER_FILL[field.tier]);
        needed.alignment = { horizontal: "center", vertical: "top" };
      }
      const q = ws.getCell(r, 2);
      q.value = field.label;
      q.font = font({ bold: true });
      q.alignment = { vertical: "top", wrapText: true };
      const answer = ws.getCell(r, C);
      const v = cellValue(field, data[field.key]);
      if (v !== null) answer.value = v;
      answer.protection = { locked: false };
      answer.border = BOTTOM;
      const v2 = validationFor(field);
      if (v2) ws.dataValidations.add(`C${r}`, v2);
      const help = ws.getCell(r, 4);
      help.value = field.hint ?? "";
      help.font = font({ size: 8, italic: true, color: { argb: argb(BRAND.iron600) } });
      help.alignment = { vertical: "top", wrapText: true };
      r++;
    }
    r++;
  }

  // People table, to the right (its column styles were set first).
  bandRow(ws, PEOPLE_COLUMNS, peopleStart);
  labelAndHintRows(ws, PEOPLE_COLUMNS, peopleStart);
  // Columns A-E of the band and hint rows hold the form; restyle the form's header cells the people table touched.
  for (let c = 1; c <= 4; c++) ws.getCell(LAYOUT.labelRow, c).protection = { locked: true };
  people.forEach((record, i) => {
    PEOPLE_COLUMNS.forEach((field, c) => {
      const v = cellValue(field, record[field.key]);
      if (v !== null) ws.getCell(LAYOUT.firstDataRow + i, peopleStart + c).value = v;
    });
  });
  PEOPLE_COLUMNS.forEach((field, c) => {
    const v = validationFor(field);
    const letter = colLetter(peopleStart + c);
    if (v) ws.dataValidations.add(`${letter}${LAYOUT.firstDataRow}:${letter}${LAYOUT.firstDataRow + ROWS.people - 1}`, v);
  });
  // The form's own rows sit in columns A-D; unlock only the answer cells there.
  for (let row = 1; row < r; row++) {
    for (const c of [1, 2, 4, 5]) ws.getCell(row, c).protection = { locked: true };
    if (row < LAYOUT.firstDataRow) for (let c = peopleStart; c < peopleStart + PEOPLE_COLUMNS.length; c++) ws.getCell(row, c).protection = { locked: true };
  }
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: LAYOUT.labelRow, topLeftCell: `A${LAYOUT.hintRow}`, activeCell: `C${LAYOUT.hintRow + 1}` }];
}

async function addStartHere(wb, ws, { banner }) {
  [2, 26, 22, 22, 22, 2].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const lockup = await lockupPng(await readFile(PATHS.lockupSvg, "utf8"), 560);
  const lockupId = wb.addImage({ buffer: lockup, extension: "png" });
  ws.addImage(lockupId, { tl: { col: 1, row: 1 }, ext: { width: 280, height: 30 }, editAs: "oneCell" });
  ws.getRow(2).height = 26;

  const put = (r, text, opts = {}) => {
    ws.mergeCells(r, opts.from ?? 2, r, 5);
    const cell = ws.getCell(r, opts.from ?? 2);
    cell.value = text;
    cell.font = font(opts.font ?? {});
    cell.alignment = { vertical: "middle", wrapText: true };
    if (opts.fill) cell.fill = solid(opts.fill);
    if (opts.height) ws.getRow(r).height = opts.height;
    return cell;
  };
  put(4, "Equipment intake workbook", { font: { size: 18, bold: true }, height: 28 });
  put(5, "Fill the numbered tabs in order. Blank is fine wherever you don't know.", { font: { color: { argb: argb(BRAND.iron600) } } });
  if (banner) put(6, banner, { font: { bold: true, color: { argb: argb(BRAND.amberChipText) } }, fill: BRAND.amberChipBg, height: 30 });

  const map = await artPng("tabs-map", 2);
  const mapId = wb.addImage({ buffer: map, extension: "png" });
  ws.addImage(mapId, { tl: { col: 1, row: 7 }, ext: { width: 420, height: 245 }, editAs: "oneCell" });
  for (let r = 8; r <= 20; r++) ws.getRow(r).height = 15;

  const steps = [
    [`1  ${TABS.company}`, "Support contacts, who approves, email alerts, your team."],
    [`2  ${TABS.models}`, "One row per model. Identical machines share one row."],
    [`3  ${TABS.assets}`, "One row per machine, with its model name from MODELS."],
    [`4  ${TABS.files}`, "Only unusual files, and anything missing or unclear."],
  ];
  steps.forEach(([tab, text], i) => {
    const r = 22 + i;
    const a = ws.getCell(r, 2);
    a.value = tab;
    a.font = font({ bold: true });
    a.alignment = { vertical: "middle" };
    put(r, text, { from: 3 });
    ws.getRow(r).height = 20;
  });
  put(26, "Have a fleet list already? Send it as it is and skip MODELS and ASSETS. We'll fill them from your list and send the workbook back for you to check.", {
    font: { bold: true },
    height: 30,
  });

  const legend = [
    ["start", "Needed to set up your equipment as private drafts."],
    ["golive", "Needed before your pages go live. If it's blank, we'll ask once."],
    ["optional", "Helps, but blank is fine."],
  ];
  legend.forEach(([tier, text], i) => {
    const r = 28 + i;
    const a = ws.getCell(r, 2);
    a.value = TIER_LABEL[tier];
    a.font = font({ size: 9, bold: true, color: { argb: argb(TIER_TEXT[tier]) } });
    a.fill = solid(TIER_FILL[tier]);
    a.alignment = { horizontal: "center", vertical: "middle" };
    put(r, text, { from: 3 });
    ws.getRow(r).height = 18;
  });

  // The three answers that say why something is missing, defined once (the dropdowns offer them).
  put(32, "Don't know? Leave it blank, or tell us why with one of these:", { font: { bold: true }, height: 18 });
  const unknowns = [
    ["Not available", "It doesn't exist, or you can't get it."],
    ["Not sure", "You'll check. We'll ask again once if it's needed."],
    ["Please review", "We'll take a short look, and ask you if we can't settle it."],
  ];
  unknowns.forEach(([answer, text], i) => {
    const r = 33 + i;
    const a = ws.getCell(r, 2);
    a.value = answer;
    a.font = font({ bold: true });
    a.alignment = { vertical: "middle", indent: 1 };
    put(r, text, { from: 3 });
    ws.getRow(r).height = 18;
  });

  const lines = [
    "Photos and files: one folder per asset code. The guide shows how.",
    "Don't include passwords, card numbers, ID documents or renter details.",
    "Excel blocked a cell? Review › Unprotect Sheet. There's no password.",
    "The LISTS tab holds the dropdown choices.",
    `Questions: ${KIT.contactEmail}`,
  ];
  lines.forEach((text, i) => put(37 + i, text, { height: 18 }));
  put(43, `Intake workbook, version ${KIT.workbookVersion}`, { font: { size: 8, color: { argb: argb(BRAND.iron600) } } });
  ws.views = [{ showGridLines: false, activeCell: "B4" }];
}

function addLists(wb, ws, modelNames) {
  let col = 1;
  for (const key of LIST_ORDER) {
    ws.getColumn(col).width = 30;
    const head = ws.getCell(1, col);
    head.value = LIST_TITLES[key];
    head.font = font({ bold: true });
    head.fill = solid(BRAND.bone);
    let last;
    if (key === "modelChoices") {
      UNKNOWN.forEach((v, i) => (ws.getCell(2 + i, col).value = v));
      for (let i = 0; i < ROWS.models; i++) {
        const src = `MODELS!$A$${LAYOUT.firstDataRow + i}`;
        ws.getCell(2 + UNKNOWN.length + i, col).value = { formula: `IF(${src}="","",${src})`, result: modelNames[i] ?? "" };
      }
      last = 1 + UNKNOWN.length + ROWS.models;
    } else {
      LISTS[key].forEach((v, i) => (ws.getCell(2 + i, col).value = v));
      last = 1 + LISTS[key].length;
    }
    const L = colLetter(col);
    wb.definedNames.add(`${TABS.lists}!$${L}$2:$${L}$${last}`, `L_${key}`);
    col++;
  }
  ws.getColumn(col + 1).width = 34;
  const about = [
    ["About this workbook", ""],
    ["Workbook version", KIT.workbookVersion],
    ["Field mapping", KIT.mappingVersion],
    ["Kit", KIT.name],
  ];
  about.forEach(([k, v], i) => {
    const a = ws.getCell(1 + i, col + 1);
    a.value = k;
    a.font = font({ bold: i === 0 });
    if (i === 0) a.fill = solid(BRAND.bone);
    if (v) ws.getCell(1 + i, col + 2).value = v;
  });
  ws.getColumn(col + 2).width = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

/**
 * Build the workbook. variant: "blank" | "example" | "prefill". data: { company, people, assets, models, files, notes }
 * keyed by field key. Returns reproducible .xlsx bytes.
 */
export async function buildIntakeWorkbook({ variant = "blank", data = {}, banner = null } = {}) {
  const company = data.company ?? {};
  const people = data.people ?? [];
  const assets = data.assets ?? [];
  const models = data.models ?? [];
  const files = data.files ?? [];
  const notes = data.notes ?? [];
  if (assets.length > ROWS.assets || models.length > ROWS.models || files.length > ROWS.files || notes.length > ROWS.notes || people.length > ROWS.people) {
    throw new Error("Too many rows for the workbook's pre-formatted tables.");
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Mulemark";
  wb.lastModifiedBy = "Mulemark";
  wb.created = KIT.fixedDate;
  wb.modified = KIT.fixedDate;
  wb.title = variant === "example" ? "EXAMPLE intake workbook (fictional)" : "Equipment intake workbook";
  wb.subject = `Mulemark intake workbook ${KIT.workbookVersion}`;
  wb.company = "Mulemark";
  wb.calcProperties.fullCalcOnLoad = true;

  const tabColor = variant === "example" ? { argb: argb("F2C200") } : undefined;
  const sheet = (name, color = tabColor) => wb.addWorksheet(name, { properties: color ? { tabColor: color } : {}, pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 1 } });

  // Tab order: MODELS before ASSETS, because each asset picks its model name from MODELS.
  const start = sheet(TABS.start, tabColor ?? { argb: argb(BRAND.brass) });
  // START HERE is a tall, narrow page: printed, it fits one portrait sheet.
  start.pageSetup.orientation = "portrait";
  start.pageSetup.fitToHeight = 1;
  const companyWs = sheet(TABS.company);
  const modelsWs = sheet(TABS.models);
  const assetsWs = sheet(TABS.assets);
  const filesWs = sheet(TABS.files);
  const listsWs = sheet(TABS.lists, { argb: argb(BRAND.iron200) });

  await addStartHere(wb, start, { banner });
  addCompany(companyWs, { data: company, people, banner });

  const modelNames = models.map((m) => m["model.name"] ?? "");
  addTable(modelsWs, {
    tabTitle: TABS.models,
    note: "One row per model. Every asset of that model shares this row, so 40 identical trailers need one row.",
    banner,
    columns: MODEL_COLUMNS,
    rows: ROWS.models,
    data: models,
    check: { width: 18, hint: "Assets using it", formula: modelCheckFormula, value: (i) => modelCheckValue(models, i, assets) },
  });
  addTable(assetsWs, {
    tabTitle: TABS.assets,
    note: "One row per machine. Fill MODELS first, then give each machine its model name. Blank is fine where you don't know.",
    banner,
    columns: ASSET_COLUMNS,
    rows: ROWS.assets,
    data: assets,
    check: { width: 30, hint: "Updates as you type", formula: assetCheckFormula, value: (i) => assetCheckValue(assets, i, modelNames) },
  });
  const lastFileCol = addTable(filesWs, {
    tabTitle: TABS.files,
    note: "Only files outside the standard folders, from the maker, or not for renters. Then anything missing, different or unclear.",
    banner,
    columns: FILE_COLUMNS,
    rows: ROWS.files,
    data: files,
    freezeCols: 0,
  });
  filesWs.getColumn(lastFileCol + 1).width = 3;
  addTable(filesWs, { columns: NOTE_COLUMNS, rows: ROWS.notes, data: notes, startCol: lastFileCol + 2 });
  filesWs.views = [{ state: "frozen", xSplit: 0, ySplit: LAYOUT.hintRow, topLeftCell: `A${LAYOUT.firstDataRow}`, activeCell: `A${LAYOUT.firstDataRow}` }];
  addLists(wb, listsWs, modelNames);

  for (const ws of [start, companyWs, modelsWs, assetsWs, filesWs, listsWs]) await ws.protect("", PROTECT);
  start.state = "visible";
  wb.views = [{ activeTab: 0, firstSheet: 0, visibility: "visible" }];

  const raw = Buffer.from(await wb.xlsx.writeBuffer());
  return normalizeOoxml(raw, { date: KIT.fixedDate });
}
