/**
 * Engineering Phase E3 — reading the setup workbook and a customer's own equipment list (their export, or the list
 * template): leading zeros, punctuation, blanks, unknown answers, a number code, formulas never evaluated, formula-like
 * and card-like values held back, file names with spaces and accents, the CALL SHEET's dates, BOM, LF and old
 * encodings, and filling the workbook from the list without losing anything already typed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import Ajv from "ajv";
import { describe, expect, it, vi } from "vitest";

import { EXAMPLE } from "./example-data.mjs";
import { ASSET_COLUMNS, COMPANY_SECTIONS, LAYOUT, TABS } from "./field-mapping.mjs";
import { KIT, PATHS, REPO } from "./kit-config.mjs";
import { prefillFromFleet } from "./prefill.mjs";
import { readFleetExport, readWorkbook, sensitiveKind } from "./read.mjs";
import { editWorkbook } from "./test-helpers.mjs";
import { buildIntakeWorkbook, buildListTemplate } from "./workbook.mjs";
import { writeZip } from "./zip.mjs";

const EXAMPLE_FILE = readFileSync(path.join(PATHS.internal, `EXAMPLE-setup-workbook-v${KIT.workbookVersion}.xlsx`));
/** The CALL SHEET row holding a field's answer (column C), found by its label in column B. */
const callRow = (ws, key) => {
  const label = COMPANY_SECTIONS.flatMap((s) => s.fields).find((f) => f.key === key).label;
  for (let r = 1; r <= 80; r++) if (ws.getCell(r, 2).value === label) return r;
  throw new Error(`No CALL SHEET row for ${key}`);
};
const FLEET = readFileSync(path.join(REPO, "scripts", "phase-e", "intake", "fixtures", "fleet-export.csv"));
const col = (key) => ASSET_COLUMNS.findIndex((f) => f.key === key) + 1;
vi.setConfig({ testTimeout: 30_000 });

describe("reading the completed example", () => {
  it("reads every row, keeps codes as text with their zeros, and keeps punctuation", async () => {
    const intake = await readWorkbook(EXAMPLE_FILE);
    expect(intake.meta.workbook_version).toBe(KIT.workbookVersion);
    expect(intake.assets).toHaveLength(47);
    expect(intake.models).toHaveLength(4);
    expect(intake.people).toHaveLength(4);
    expect(intake.files).toHaveLength(2);
    expect(intake.notes).toHaveLength(2);
    expect(intake.assets.filter((a) => a.values["asset.model"] === "Big Tex 35SA utility 12 ft")).toHaveLength(40);
    // The varied machines lead; the trailers follow with their zeros intact.
    expect(intake.assets.slice(0, 7).map((a) => a.values["asset.code"])).toEqual(["E20-01", "E20-02", "E20-03", "C301-1", "C301-2", "DT-14", "PC-07"]);
    expect(intake.assets[7].values["asset.code"]).toBe("00101");
    expect(intake.files.map((f) => f.values["file.audience"])).toEqual(["Staff only", "Renters, on our pages"]);
    expect(intake.assets.find((a) => a.values["asset.code"] === "DT-14").values["asset.name"]).toBe(`Dump trailer 7' x 14' "HD", 14LP`);
    expect(intake.people.find((p) => p.values["people.email"] === "jo@example.com").values["people.name"]).toBe("J. O'Neil-Baptiste");
    expect(intake.company.values["company.logo_file"]).toBe("northridge logo.png");
    // The CALL SHEET's dates come back as YYYY-MM-DD, with no "check this date" issue; blank tags stay blank (New tag).
    expect(intake.company.values).toMatchObject({ "batch.complete_on": "2026-11-26", "batch.hands_on_minutes": "95", "batch.customer_wait_hours": "6", "batch.preview_sent_on": null });
    expect(intake.assets.filter((a) => a.values["asset.tag"]).map((a) => a.values["asset.tag"])).toEqual(["No tag for now"]);
    expect(intake.issues).toEqual([]);
  });

  it("reads a date typed into a CALL SHEET date cell, and still flags a date typed anywhere else", async () => {
    const edited = await editWorkbook(await buildIntakeWorkbook({ variant: "blank" }), (wb) => {
      const call = wb.getWorksheet(TABS.company);
      call.getCell(callRow(call, "batch.preview_sent_on"), 3).value = new Date("2026-12-01T00:00:00Z");
      call.getCell(callRow(call, "batch.hands_on_minutes"), 3).value = 125;
      // A cell pasted from another workbook keeps its date format, so Excel stores a real date there.
      const assets = wb.getWorksheet(TABS.assets);
      assets.getCell(6, col("asset.code")).value = "D-1";
      const pasted = assets.getCell(6, col("asset.name"));
      pasted.value = new Date("2026-12-01T00:00:00Z");
      pasted.numFmt = "yyyy-mm-dd";
    });
    const intake = await readWorkbook(edited);
    expect(intake.company.values["batch.preview_sent_on"]).toBe("2026-12-01");
    expect(intake.company.values["batch.hands_on_minutes"]).toBe("125");
    expect(intake.issues.map((i) => `${i.key}:${i.kind}`)).toEqual(["asset.name:date"]);
  });

  it("produces the normalized shape published as intake.schema.json", async () => {
    const intake = await readWorkbook(EXAMPLE_FILE);
    const schema = JSON.parse(readFileSync(path.join(PATHS.internal, "intake.schema.json"), "utf8"));
    const ajv = new Ajv({ allErrors: true });
    expect(ajv.validate(schema, intake), JSON.stringify(ajv.errors)).toBe(true);
  });
});

describe("reading what customers actually type", () => {
  it("handles unknown answers in any case, a number code, a formula, formula-like text and a card number", async () => {
    const blank = await buildIntakeWorkbook({ variant: "blank" });
    const edited = await editWorkbook(blank, (wb) => {
      const ws = wb.getWorksheet(TABS.assets);
      const put = (r, key, v) => (ws.getCell(r, col(key)).value = v);
      put(6, "asset.code", "00412");
      put(6, "asset.name", "Trailer, 12' \"HD\"");
      put(6, "asset.model", "not sure");
      put(7, "asset.code", 412);
      put(7, "asset.name", "Trailer");
      put(8, "asset.code", "X-1");
      put(8, "asset.name", { formula: "1+1", result: 2 });
      put(9, "asset.code", "X-2");
      put(9, "asset.name", '=HYPERLINK("http://example.com","click")');
      put(10, "asset.code", "X-3");
      put(10, "asset.name", "Compactor");
      put(10, "asset.notes", "Pay with card 4111 1111 1111 1111");
      put(11, "asset.code", "  X-4  ");
      put(11, "asset.name", "Café trailer");
      put(11, "asset.photo", "Photo café 1.jpg");
      put(12, "asset.code", "X-5");
      put(12, "asset.unit_support", "+1 604 555 0100");
    });
    const intake = await readWorkbook(edited);
    const byRow = new Map(intake.assets.map((a) => [a.row, a]));
    expect(byRow.get(6).values["asset.code"]).toBe("00412");
    expect(byRow.get(6).values["asset.model"]).toBe("Not sure");
    expect(byRow.get(6).values["asset.name"]).toBe("Trailer, 12' \"HD\"");
    expect(byRow.get(7).numeric["asset.code"]).toBe(true);
    expect(byRow.get(8).values["asset.name"]).toBeNull();
    expect(byRow.get(9).values["asset.name"]).toBeNull();
    expect(byRow.get(10).values["asset.notes"]).toBeNull();
    expect(byRow.get(11).values["asset.code"]).toBe("X-4");
    expect(byRow.get(11).values["asset.photo"]).toBe("Photo café 1.jpg");
    expect(byRow.get(12).values["asset.unit_support"]).toBe("+1 604 555 0100");
    const kinds = intake.issues.map((i) => `${i.row}:${i.kind}`);
    expect(kinds).toEqual(expect.arrayContaining(["8:formula", "9:held-back", "10:card-number"]));
    expect(kinds.some((k) => k.startsWith("12:"))).toBe(false);
  });

  it("spots card numbers and passwords, not ordinary numbers", () => {
    expect(sensitiveKind("card 4111-1111-1111-1111")).toBe("card-number");
    expect(sensitiveKind("password: hunter2")).toBe("password");
    expect(sensitiveKind("Serial 1234567890123")).toBeNull();
    expect(sensitiveKind("Call 604-555-0142")).toBeNull();
  });

  it("refuses a workbook with macros before parsing it", async () => {
    const fake = writeZip([{ name: "xl/workbook.xml", data: Buffer.from("<workbook/>") }, { name: "xl/vbaProject.bin", data: Buffer.from("x") }], { date: KIT.fixedDate });
    await expect(readWorkbook(fake, { file: "evil.xlsx" })).rejects.toThrow(/macros/);
  });
});

describe("encodings of a customer's list", () => {
  it("reads BOM, LF and Windows-1252 lists", async () => {
    const bom = await readFleetExport(Buffer.from("﻿Unit #,Description\r\n00412,Café\r\n", "utf8"), { file: "bom.csv" });
    expect(bom.assets[0].values).toMatchObject({ "asset.code": "00412", "asset.name": "Café" });
    const lf = await readFleetExport(Buffer.from("asset_code,asset_name\n00412,Café\n", "utf8"), { file: "lf.csv" });
    expect(lf.assets[0].values).toMatchObject({ "asset.code": "00412", "asset.name": "Café" });
    const cp1252 = await readFleetExport(Buffer.from([...Buffer.from("Unit number,Description\r\n7,Caf"), 0xe9, 0x0d, 0x0a]), { file: "old.csv" });
    expect(cp1252.assets[0].values["asset.name"]).toBe("Café");
  });
});

describe("customer fleet export", () => {
  it("maps known headers, keeps zeros and punctuation, lists unmapped columns and suggests models", async () => {
    const intake = await readFleetExport(FLEET, { file: "fleet-export.csv" });
    expect(intake.assets.map((a) => a.values["asset.code"])).toEqual(["00412", "00413", "00414", "E20-07", "PC-11"]);
    expect(intake.assets[0].values["asset.name"]).toBe(`Dump trailer 7' x 14' "HD", 14LP`);
    expect(intake.assets[0].values["asset.serial"]).toBe("DEMO-14LP0412");
    expect(intake.meta.unmapped_columns).toEqual(["Daily Rate", "Location"]);
    expect(intake.models.map((m) => m.values["model.name"])).toEqual(["Big Tex 14LP", "Big Tex 35SA", "Bobcat E20"]);
    expect(intake.assets[4].values["asset.model"]).toBeNull();
  });

  it("fills the setup workbook's MODELS and ASSETS from the list", async () => {
    const { workbook, report } = await prefillFromFleet(FLEET, { file: "fleet-export.csv", company: "Example Rentals" });
    const intake = await readWorkbook(workbook);
    expect(intake.assets).toHaveLength(5);
    expect(intake.models).toHaveLength(3);
    expect(intake.assets[1].values).toMatchObject({ "asset.code": "00413", "asset.model": "Big Tex 35SA", "asset.year": "2021" });
    expect(intake.company.values["company.name"]).toBe("Example Rentals");
    expect(report.unmapped_columns).toEqual(["Daily Rate", "Location"]);
    expect(LAYOUT.firstDataRow).toBe(6);
  });

  it("keeps everything already typed: CALL SHEET answers, people, files, notes and existing MODELS rows", async () => {
    const typed = await editWorkbook(await buildIntakeWorkbook({ variant: "blank", data: { company: { "company.name": "Example Rentals" } } }), (wb) => {
      const call = wb.getWorksheet(TABS.company);
      call.getCell(callRow(call, "approver.name"), 3).value = "Robin Vale";
      call.getCell(callRow(call, "rules.fuel"), 3).value = "Return it full.";
      call.getCell(callRow(call, "batch.complete_on"), 3).value = new Date("2026-11-26T00:00:00Z");
      call.getCell(LAYOUT.firstDataRow, 6).value = "Robin Vale";
      call.getCell(LAYOUT.firstDataRow, 7).value = "robin@example.com";
      call.getCell(LAYOUT.firstDataRow, 8).value = "Administrator";
      const models = wb.getWorksheet(TABS.models);
      models.getCell(LAYOUT.firstDataRow, 1).value = "Big Tex 35SA";
      models.getCell(LAYOUT.firstDataRow, 2).value = "Big Tex";
      models.getCell(LAYOUT.firstDataRow, 3).value = "35SA";
      models.getCell(LAYOUT.firstDataRow, 4).value = "https://www.example.com/35sa.pdf";
    });
    const existing = await readWorkbook(typed);
    const { workbook } = await prefillFromFleet(FLEET, { file: "fleet-export.csv", existing });
    const intake = await readWorkbook(workbook);
    expect(intake.company.values).toMatchObject({ "company.name": "Example Rentals", "approver.name": "Robin Vale", "rules.fuel": "Return it full.", "batch.complete_on": "2026-11-26" });
    expect(intake.people.map((p) => p.values["people.email"])).toEqual(["robin@example.com"]);
    // The typed 35SA row (with its manual link) wins; the list only adds the models that weren't there.
    expect(intake.models.map((m) => m.values["model.name"])).toEqual(["Big Tex 35SA", "Big Tex 14LP", "Bobcat E20"]);
    expect(intake.models[0].values["model.manual"]).toBe("https://www.example.com/35sa.pdf");
    expect(intake.assets).toHaveLength(5);
    expect(intake.issues).toEqual([]);
  });

  it("reads the customer's list template like any export, zeros kept", async () => {
    const filled = await editWorkbook(await buildListTemplate(), (wb) => {
      const ws = wb.worksheets[0];
      ws.getRow(2).values = ["00412", "Dump trailer 14 ft", "Big Tex", "14LP", 2022, "DEMO-1"];
      ws.getRow(3).values = ["00413", "Utility trailer 12 ft", "Big Tex", "35SA"];
    });
    const intake = await readFleetExport(filled, { file: "equipment-list-template.xlsx" });
    expect(intake.meta.unmapped_columns).toEqual([]);
    expect(intake.assets.map((a) => a.values["asset.code"])).toEqual(["00412", "00413"]);
    expect(intake.assets[0].values).toMatchObject({ "asset.name": "Dump trailer 14 ft", "asset.year": "2022", "asset.serial": "DEMO-1", "asset.model": "Big Tex 14LP" });
    expect(intake.models.map((m) => m.values["model.name"])).toEqual(["Big Tex 14LP", "Big Tex 35SA"]);
  });
});

describe("example data", () => {
  it("uses fictional contacts only: example.com addresses, 555-01xx numbers, DEMO- serials", () => {
    const emails = JSON.stringify(EXAMPLE).match(/[\w.+-]+@[\w.-]+/g);
    for (const e of emails) expect(e.endsWith("@example.com"), e).toBe(true);
    for (const p of JSON.stringify(EXAMPLE).match(/\d{3}-\d{3}-\d{4}/g)) expect(/^604-555-01\d\d$/.test(p), p).toBe(true);
    for (const a of EXAMPLE.assets.filter((x) => x["asset.serial"])) expect(a["asset.serial"].startsWith("DEMO-")).toBe(true);
  });
});
