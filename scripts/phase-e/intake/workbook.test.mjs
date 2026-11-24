/**
 * Engineering Phase E3 — the setup workbooks and the customer's list template as committed (kit 2.0): the CALL SHEET
 * in the order of the work, labels, frozen headings, widths, dropdowns, date and number cells, protection without a
 * password, no data in the blank, no macros, links or hidden sheets, the EXAMPLE stamp, and reproducible bytes.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { EXAMPLE, EXAMPLE_BANNER } from "./example-data.mjs";
import { ASSET_COLUMNS, COMPANY_SECTIONS, FILE_COLUMNS, LAYOUT, MODEL_COLUMNS, NOTE_COLUMNS, PEOPLE_COLUMNS, TABS } from "./field-mapping.mjs";
import { KIT, PATHS, REPO } from "./kit-config.mjs";
import { prefillFromFleet } from "./prefill.mjs";
import { readWorkbook } from "./read.mjs";
import {
  LIST_TEMPLATE_COLUMNS,
  assetCheckFormula,
  assetCheckValue,
  buildIntakeWorkbook,
  buildListTemplate,
  hintRowHeight,
  modelCheckFormula,
  modelCheckValue,
} from "./workbook.mjs";
import { listZip } from "./zip.mjs";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
vi.setConfig({ testTimeout: 30_000 });

const BLANK = readFileSync(path.join(PATHS.internal, `mulemark-setup-workbook-v${KIT.workbookVersion}.xlsx`));
const EXAMPLE_FILE = readFileSync(path.join(PATHS.internal, `EXAMPLE-setup-workbook-v${KIT.workbookVersion}.xlsx`));
const LIST_TEMPLATE = readFileSync(path.join(PATHS.customer, "equipment-list-template.xlsx"));

async function load(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}
const text = (cell) => (typeof cell.value === "object" && cell.value?.richText ? cell.value.richText.map((p) => p.text).join("") : cell.value);
const balanced = (f) => [...f].reduce((d, ch) => (d < 0 ? d : d + (ch === "(" ? 1 : ch === ")" ? -1 : 0)), 0) === 0;
/** Column B of the CALL SHEET, rows 1-80: section titles and questions, in order. */
const callColumnB = (ws) => Array.from({ length: 80 }, (_, i) => text(ws.getCell(i + 1, 2))).filter(Boolean);

describe("blank setup workbook", () => {
  it("has the CALL SHEET, MODELS, ASSETS, FILES & NOTES and LISTS, in order, all visible; no START HERE", async () => {
    const wb = await load(BLANK);
    expect(wb.worksheets.map((w) => w.name)).toEqual([TABS.company, TABS.models, TABS.assets, TABS.files, TABS.lists]);
    expect(Object.values(TABS)).toEqual(wb.worksheets.map((w) => w.name));
    expect(TABS.company).toBe("CALL SHEET");
    for (const ws of wb.worksheets) expect(ws.state ?? "visible", ws.name).toBe("visible");
  });

  it("lays the CALL SHEET out in the order of the work: from their website, ask on the call, defaults, dates and time", async () => {
    const wb = await load(BLANK);
    const call = wb.getWorksheet(TABS.company);
    const sections = COMPANY_SECTIONS.map((s) => s.title);
    expect(sections.map((t) => t.split(":")[0].split(" (")[0])).toEqual(["Before the call", "Ask on the call", "Defaults", "Dates and time"]);
    const column = callColumnB(call);
    const at = (t) => column.indexOf(t);
    // Section titles sit in column A (merged across A-D); the questions follow in column B, in mapping order.
    const questions = COMPANY_SECTIONS.flatMap((s) => s.fields.map((f) => f.label));
    expect(questions.every((q) => at(q) >= 0)).toBe(true);
    expect(questions.map(at)).toEqual([...questions.map(at)].sort((x, y) => x - y));
    expect(text(call.getCell(LAYOUT.labelRow, 3))).toBe("Answer");
    // Dates and numbers are typed as such; everything else is text, so nothing typed becomes a formula.
    const rowOf = (key) => 1 + Array.from({ length: 80 }, (_, i) => text(call.getCell(i + 1, 2))).indexOf(COMPANY_SECTIONS.flatMap((s) => s.fields).find((f) => f.key === key).label);
    expect(call.getCell(rowOf("batch.complete_on"), 3).numFmt).toBe("yyyy-mm-dd");
    expect(call.getCell(rowOf("batch.hands_on_minutes"), 3).numFmt).toBe("0");
    expect(call.getCell(rowOf("company.support_phone"), 3).numFmt).toBe("@");
    expect(call.dataValidations.find(`C${rowOf("batch.complete_on")}`)).toMatchObject({ type: "date", errorStyle: "warning" });
    // Printed for the call, the form and the people table fit one landscape page.
    expect(call.pageSetup).toMatchObject({ orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 });
    expect(call.pageSetup.printArea).toMatch(/A\$?1:\$?I\$?\d+$/);
    expect(wb.getWorksheet(TABS.assets).pageSetup).toMatchObject({ orientation: "landscape", fitToWidth: 1, fitToHeight: 0 });
  });

  it("makes each hint row tall enough for its longest hint", async () => {
    const wb = await load(BLANK);
    expect(wb.getWorksheet(TABS.assets).getRow(LAYOUT.hintRow).height).toBe(hintRowHeight(ASSET_COLUMNS));
    expect(wb.getWorksheet(TABS.models).getRow(LAYOUT.hintRow).height).toBe(hintRowHeight(MODEL_COLUMNS));
    expect(hintRowHeight([{ width: 10, hint: "short" }])).toBe(34);
    expect(hintRowHeight([{ width: 10, hint: "a hint that is far too long for a narrow column to show on three lines" }])).toBeGreaterThan(34);
  });

  it("labels each table exactly as the field mapping, with a Check column on ASSETS and MODELS", async () => {
    const wb = await load(BLANK);
    const labels = (ws, from, n) => Array.from({ length: n }, (_, i) => text(ws.getCell(LAYOUT.labelRow, from + i)));
    expect(labels(wb.getWorksheet(TABS.assets), 1, ASSET_COLUMNS.length + 1)).toEqual([...ASSET_COLUMNS.map((f) => f.label), "Check"]);
    expect(labels(wb.getWorksheet(TABS.models), 1, MODEL_COLUMNS.length + 1)).toEqual([...MODEL_COLUMNS.map((f) => f.label), "Check"]);
    expect(labels(wb.getWorksheet(TABS.files), 1, FILE_COLUMNS.length)).toEqual(FILE_COLUMNS.map((f) => f.label));
    expect(labels(wb.getWorksheet(TABS.files), FILE_COLUMNS.length + 2, NOTE_COLUMNS.length)).toEqual(NOTE_COLUMNS.map((f) => f.label));
    expect(labels(wb.getWorksheet(TABS.company), 6, PEOPLE_COLUMNS.length)).toEqual(PEOPLE_COLUMNS.map((f) => f.label));
  });

  it("speaks to Mulemark, not the customer: no 'your' in the labels", () => {
    for (const f of [...COMPANY_SECTIONS.flatMap((s) => s.fields), ...ASSET_COLUMNS, ...MODEL_COLUMNS, ...FILE_COLUMNS]) expect(/\byour\b/i.test(f.label), f.label).toBe(false);
  });

  it("freezes the headings (and the code column) and sets the mapped widths", async () => {
    const wb = await load(BLANK);
    const assets = wb.getWorksheet(TABS.assets);
    expect(assets.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: LAYOUT.hintRow });
    expect(wb.getWorksheet(TABS.models).views[0]).toMatchObject({ state: "frozen", ySplit: LAYOUT.hintRow });
    ASSET_COLUMNS.forEach((f, i) => expect(assets.getColumn(i + 1).width, f.key).toBe(f.width));
  });

  it("points every dropdown at its list on LISTS, and allows typing where an answer may be free text", async () => {
    const wb = await load(BLANK);
    const assets = wb.getWorksheet(TABS.assets);
    const dv = (ws, addr) => ws.dataValidations.find(addr);
    const col = (key) => String.fromCharCode(65 + ASSET_COLUMNS.findIndex((f) => f.key === key));
    expect(dv(assets, `${col("asset.model")}6`)).toMatchObject({ type: "list", formulae: ["L_modelChoices"] });
    expect(dv(assets, `${col("asset.model")}6`).showErrorMessage).toBeFalsy();
    expect(dv(assets, `${col("asset.tag")}6`)).toMatchObject({ type: "list", formulae: ["L_tag"], showErrorMessage: true, errorStyle: "warning" });
    expect(dv(assets, `${col("asset.tag")}1005`)).toBeTruthy();
    expect(dv(assets, `${col("asset.year")}6`)).toMatchObject({ type: "whole", operator: "between" });
    const names = wb.definedNames.model.map((d) => d.name);
    for (const n of ["L_unknown", "L_tag", "L_modelChoices", "L_manualShare", "L_role", "L_returnEmails"]) expect(names).toContain(n);
  });

  it("protects headings and Check columns with no password and leaves input unlocked", async () => {
    const wb = await load(BLANK);
    for (const ws of wb.worksheets) {
      expect(ws.sheetProtection?.sheet, ws.name).toBe(true);
      expect(ws.sheetProtection?.hashValue, ws.name).toBeUndefined();
      expect(ws.sheetProtection?.algorithmName, ws.name).toBeUndefined();
    }
    const assets = wb.getWorksheet(TABS.assets);
    expect(assets.sheetProtection).toMatchObject({ insertRows: true, deleteRows: true, sort: true, autoFilter: true });
    expect(assets.getCell("A6").protection?.locked).toBe(false);
    expect(assets.getCell("B700").protection?.locked).toBe(false);
    expect(assets.getCell("A4").protection?.locked).not.toBe(false);
    expect(assets.getCell(`${String.fromCharCode(65 + ASSET_COLUMNS.length)}6`).protection?.locked).not.toBe(false);
    expect(assets.getColumn(1).numFmt).toBe("@");
  });

  it("holds no data: every input is empty", async () => {
    const intake = await readWorkbook(BLANK);
    expect(intake.assets).toEqual([]);
    expect(intake.models).toEqual([]);
    expect(intake.people).toEqual([]);
    expect(intake.files).toEqual([]);
    expect(intake.notes).toEqual([]);
    expect(Object.values(intake.company.values).filter((v) => v !== null)).toEqual([]);
    expect(intake.issues).toEqual([]);
  });

  it("carries no macros, links to other files, comments or hidden sheets", () => {
    const names = listZip(BLANK).map((e) => e.name.toLowerCase());
    for (const bad of ["vbaproject.bin", "externallinks/", "macrosheets/", "activex", "comments"]) expect(names.some((n) => n.includes(bad)), bad).toBe(false);
  });

  it("is reproducible: building it again gives the committed bytes", async () => {
    expect(Buffer.compare(await buildIntakeWorkbook({ variant: "blank" }), BLANK)).toBe(0);
  });
});

describe("filled from a list", () => {
  it("bannered on MODELS and ASSETS only, so the CALL SHEET keeps its own note", async () => {
    const fleet = readFileSync(path.join(REPO, "scripts", "phase-e", "intake", "fixtures", "fleet-export.csv"));
    const { workbook } = await prefillFromFleet(fleet, { file: "fleet-export.csv", company: "Example Rentals" });
    const wb = await load(workbook);
    const note = (name) => text(wb.getWorksheet(name).getCell(LAYOUT.noteRow, 1));
    expect(note(TABS.assets)).toBe("Filled from fleet-export.csv. Check each machine's name (renters see it), model and category.");
    expect(note(TABS.models)).toBe(note(TABS.assets));
    expect(note(TABS.company)).toMatch(/^Copy what their website says before the call/);
    expect(note(TABS.files)).toMatch(/^Only files outside inbox's standard folders/);
  });
});

describe("completed example workbook", () => {
  it("stamps EXAMPLE on every data tab", async () => {
    const wb = await load(EXAMPLE_FILE);
    for (const name of [TABS.company, TABS.assets, TABS.models, TABS.files]) expect(text(wb.getWorksheet(name).getCell(LAYOUT.noteRow, 1)), name).toBe(EXAMPLE_BANNER);
  });

  it("stores Check results that match the formulas' logic, and the formulas are well formed", async () => {
    const wb = await load(EXAMPLE_FILE);
    const assets = wb.getWorksheet(TABS.assets);
    const checkCol = ASSET_COLUMNS.length + 1;
    const modelNames = EXAMPLE.models.map((m) => m["model.name"]);
    for (let i = 0; i < EXAMPLE.assets.length + 3; i++) {
      const cell = assets.getCell(LAYOUT.firstDataRow + i, checkCol);
      expect(cell.value.formula).toBe(assetCheckFormula(LAYOUT.firstDataRow + i));
      expect(cell.value.result ?? "", `row ${LAYOUT.firstDataRow + i}`).toBe(assetCheckValue(EXAMPLE.assets, i, modelNames));
    }
    expect(balanced(assetCheckFormula(6))).toBe(true);
    expect(balanced(modelCheckFormula(6))).toBe(true);
    const models = wb.getWorksheet(TABS.models);
    expect(EXAMPLE.models.map((_, i) => models.getCell(LAYOUT.firstDataRow + i, MODEL_COLUMNS.length + 1).value.result)).toEqual(EXAMPLE.models.map((_, i) => modelCheckValue(EXAMPLE.models, i, EXAMPLE.assets)));
    expect(modelCheckValue(EXAMPLE.models, 0, EXAMPLE.assets)).toBe("40 machines");
    expect(modelCheckValue(EXAMPLE.models, 1, EXAMPLE.assets)).toBe("1 machine");
  });

  it("is reproducible", async () => {
    expect(Buffer.compare(await buildIntakeWorkbook({ variant: "example", data: EXAMPLE, banner: EXAMPLE_BANNER }), EXAMPLE_FILE)).toBe(0);
  });
});

describe("customer's list template", () => {
  it("is one sheet with the six headers in row 1, unit numbers as text, and a prompt on each column", async () => {
    const wb = await load(LIST_TEMPLATE);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Equipment list"]);
    const ws = wb.worksheets[0];
    expect(LIST_TEMPLATE_COLUMNS.map((_, i) => text(ws.getCell(1, i + 1)))).toEqual(["Unit number", "Description", "Make", "Model", "Year", "Serial number"]);
    expect(ws.getColumn(1).numFmt).toBe("@");
    expect(ws.getColumn(6).numFmt).toBe("@");
    expect(ws.dataValidations.find("A2")).toMatchObject({ showInputMessage: true, prompt: LIST_TEMPLATE_COLUMNS[0].prompt });
    expect(ws.sheetProtection?.sheet).toBeFalsy();
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.actualRowCount).toBe(1);
  });

  it("carries no macros, links, comments or hidden sheets, and is reproducible", async () => {
    const names = listZip(LIST_TEMPLATE).map((e) => e.name.toLowerCase());
    for (const bad of ["vbaproject.bin", "externallinks/", "macrosheets/", "activex", "comments"]) expect(names.some((n) => n.includes(bad)), bad).toBe(false);
    expect(Buffer.compare(await buildListTemplate(), LIST_TEMPLATE)).toBe(0);
  });
});
