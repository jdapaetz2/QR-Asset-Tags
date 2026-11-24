/**
 * Engineering Phase E3 — the intake workbooks as committed: structure, labels, frozen headings, widths, dropdowns,
 * protection without a password, no data in the blank, no macros, links or hidden sheets, the EXAMPLE stamp, and
 * reproducible bytes.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { EXAMPLE, EXAMPLE_BANNER } from "./example-data.mjs";
import { ASSET_COLUMNS, COMPANY_SECTIONS, FILE_COLUMNS, LAYOUT, MODEL_COLUMNS, NOTE_COLUMNS, PEOPLE_COLUMNS, TABS } from "./field-mapping.mjs";
import { KIT, PATHS } from "./kit-config.mjs";
import { readWorkbook } from "./read.mjs";
import { assetCheckFormula, assetCheckValue, buildIntakeWorkbook, hintRowHeight, modelCheckFormula, modelCheckValue } from "./workbook.mjs";
import { listZip } from "./zip.mjs";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
vi.setConfig({ testTimeout: 30_000 });

const BLANK = readFileSync(path.join(PATHS.customer, `mulemark-intake-workbook-v${KIT.workbookVersion}.xlsx`));
const EXAMPLE_FILE = readFileSync(path.join(PATHS.customer, `EXAMPLE-mulemark-intake-workbook-v${KIT.workbookVersion}.xlsx`));

async function load(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}
const text = (cell) => (typeof cell.value === "object" && cell.value?.richText ? cell.value.richText.map((p) => p.text).join("") : cell.value);
const balanced = (f) => [...f].reduce((d, ch) => (d < 0 ? d : d + (ch === "(" ? 1 : ch === ")" ? -1 : 0)), 0) === 0;

describe("blank intake workbook", () => {
  it("has the five tabs plus LISTS, in order (MODELS before ASSETS), all visible", async () => {
    const wb = await load(BLANK);
    expect(wb.worksheets.map((w) => w.name)).toEqual([TABS.start, TABS.company, TABS.models, TABS.assets, TABS.files, TABS.lists]);
    expect(Object.values(TABS)).toEqual(wb.worksheets.map((w) => w.name));
    for (const ws of wb.worksheets) expect(ws.state ?? "visible", ws.name).toBe("visible");
  });

  it("says on START HERE what to skip with a fleet list, and what each unknown answer means", async () => {
    const wb = await load(BLANK);
    const start = wb.getWorksheet(TABS.start);
    const lines = [];
    start.eachRow((row) => row.eachCell((c) => lines.push(String(text(c)))));
    const all = lines.join("\n");
    expect(all).toContain("skip MODELS and ASSETS");
    expect(all).toContain("Blank is fine");
    for (const answer of ["Not available", "Not sure", "Please review"]) expect(lines, answer).toContain(answer);
    expect(lines.findIndex((l) => l.startsWith("2  "))).toBeLessThan(lines.findIndex((l) => l.startsWith("3  ")));
    expect(lines).toContain(`2  ${TABS.models}`);
    expect(lines).toContain(`3  ${TABS.assets}`);
    expect(all).toContain(`version ${KIT.workbookVersion}`);
    // Printed, START HERE fits one portrait page; the data tabs print landscape, one page wide.
    expect(start.pageSetup).toMatchObject({ orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 });
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
    const company = wb.getWorksheet(TABS.company);
    const questions = new Set();
    for (let r = 1; r <= 60; r++) questions.add(text(company.getCell(r, 2)));
    for (const f of COMPANY_SECTIONS.flatMap((s) => s.fields)) expect(questions.has(f.label), f.label).toBe(true);
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

  it("holds no example data: every input is empty", async () => {
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

describe("completed example workbook", () => {
  it("stamps EXAMPLE on every data tab and on START HERE", async () => {
    const wb = await load(EXAMPLE_FILE);
    for (const name of [TABS.company, TABS.assets, TABS.models, TABS.files]) expect(text(wb.getWorksheet(name).getCell(LAYOUT.noteRow, 1)), name).toBe(EXAMPLE_BANNER);
    const start = wb.getWorksheet(TABS.start);
    expect(text(start.getCell("B6"))).toBe(EXAMPLE_BANNER);
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
    expect(modelCheckValue(EXAMPLE.models, 0, EXAMPLE.assets)).toBe("40 assets");
  });

  it("is reproducible", async () => {
    expect(Buffer.compare(await buildIntakeWorkbook({ variant: "example", data: EXAMPLE, banner: EXAMPLE_BANNER }), EXAMPLE_FILE)).toBe(0);
  });
});
