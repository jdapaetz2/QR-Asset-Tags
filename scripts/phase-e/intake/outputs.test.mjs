/**
 * Engineering Phase E3 — what the check tool writes, against today's importer and E4's contract:
 *  - the current-import CSV goes through the app's own parser (lib/onboarding/import.ts) with zero errors, the same
 *    codes in the same order, every publish and QR flag off and no template key;
 *  - the manifest validates against the content contract 1.3.0, reuses one model for the 40 trailers, records rights
 *    conservatively (never shareable across organizations) and holds no real names;
 *  - the readiness workbook guards formula-like text; the one request carries customer items only.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { parseImportRows } from "@/lib/onboarding/import";

import { EXAMPLE_BATCH_ID, EXAMPLE_UPLOAD } from "./example-data.mjs";
import { KIT, PATHS } from "./kit-config.mjs";
import { buildManifest, currentImportCsv, fileRowRights, fillTemplate, missingItems, missingItemsMarkdown, reportWorkbook, validateManifest } from "./outputs.mjs";
import { readWorkbook } from "./read.mjs";
import { assessIntake } from "./readiness.mjs";
import { GOOD_ASSET, GOOD_COMPANY, GOOD_MODEL, GOOD_PEOPLE, PREPARED_CLEARED, intakeOf } from "./test-helpers.mjs";

const require = createRequire(import.meta.url);
const SCHEMA = JSON.parse(readFileSync(PATHS.schema, "utf8"));
const EXAMPLE_FILE = readFileSync(path.join(PATHS.customer, `EXAMPLE-mulemark-intake-workbook-v${KIT.workbookVersion}.xlsx`));
const PREPARED = JSON.parse(readFileSync(path.join(PATHS.exampleRun, "inputs", "prepared.json"), "utf8"));

// Parsing the workbook is the slow part; do it once, and allow for the full suite running in parallel.
vi.setConfig({ testTimeout: 30_000 });
let cached;
function exampleResult() {
  cached ??= readWorkbook(EXAMPLE_FILE).then((intake) => ({ intake, result: assessIntake(intake, { upload: EXAMPLE_UPLOAD, prepared: PREPARED }) }));
  return cached;
}

describe("current importer parity", () => {
  it("the example's derived CSV imports with zero errors, same codes and order, everything private", async () => {
    const { intake, result } = await exampleResult();
    const parsed = parseImportRows(currentImportCsv(result));
    expect(parsed.fileWarnings).toEqual([]);
    expect(parsed.rows).toHaveLength(47);
    expect(parsed.rows.flatMap((r) => r.errors)).toEqual([]);
    expect(parsed.rows.map((r) => r.assetCode)).toEqual(intake.assets.map((a) => a.values["asset.code"]));
    for (const row of parsed.rows) {
      expect(row.flags).toMatchObject({ templateKey: null, createQrLink: false, publishAsset: false, publishEquipmentPage: false });
      expect(row.warnings).toEqual([]);
    }
    const dump = parsed.rows.find((r) => r.assetCode === "DT-14");
    expect(dump.asset).toMatchObject({ asset_name: `Dump trailer 7' x 14' "HD", 14LP`, make: "Big Tex", model: "14LP", support_phone_override: "604-555-0199 ext 2" });
    expect(parsed.rows.find((r) => r.assetCode === "00101").asset).toMatchObject({ make: "Big Tex", model: "35SA", category: "Utility trailer", serial_number: null, year: null });
    expect(parsed.rows.find((r) => r.assetCode === "E20-01").asset).toMatchObject({ serial_number: "DEMO-B3BL11001", year: 2022 });
  });

  it("leaves duplicates and unconfirmed number codes out of the import", () => {
    const intake = intakeOf({ company: GOOD_COMPANY, people: GOOD_PEOPLE, models: [GOOD_MODEL], assets: [GOOD_ASSET, { ...GOOD_ASSET }, { values: { ...GOOD_ASSET, "asset.code": "77" }, numeric: { "asset.code": true } }, { ...GOOD_ASSET, "asset.code": "OK-1" }] });
    const parsed = parseImportRows(currentImportCsv(assessIntake(intake, { prepared: PREPARED_CLEARED })));
    expect(parsed.rows.map((r) => r.assetCode)).toEqual(["OK-1"]);
  });
});

describe("contract manifest (E4)", () => {
  it("validates against schema 1.3.0 and shares one model across the 40 trailers", async () => {
    const { intake, result } = await exampleResult();
    const { manifest, excluded } = buildManifest(intake, result, { batchId: EXAMPLE_BATCH_ID, fictional: true });
    const v = validateManifest(manifest, SCHEMA);
    expect(v.errors).toEqual([]);
    expect(excluded).toEqual([]);
    expect(manifest.kind).toBe("customer-onboarding");
    expect(manifest.approval).toEqual({ status: "not_requested" });
    expect(manifest.assets.filter((a) => a.model_key === "bigtex.35sa.12")).toHaveLength(40);
    expect(manifest.models.map((m) => m.model_key)).toEqual(["bigtex.35sa.12", "bigtex.14lp.14", "bobcat.e20.b3bl-canopy", "caterpillar.301-5.canopy"]);
    expect(manifest.assets.every((a) => a.publish_intent === false)).toBe(true);
    const pc = manifest.assets.find((a) => a.asset_code === "PC-07");
    expect(pc.model_key).toBeNull();
    expect(pc.review.status).toBe("CUSTOMER_INPUT_REQUIRED");
    expect(manifest.assets.find((a) => a.asset_code === "00112").exceptions[0]).toMatchObject({ status: "REVIEW_REQUIRED", safety_critical: false });
  });

  it("records rights conservatively and never as shareable with other organizations", async () => {
    const { intake, result } = await exampleResult();
    const { manifest } = buildManifest(intake, result, { batchId: EXAMPLE_BATCH_ID, fictional: true });
    for (const s of manifest.sources) expect(s.rights.shareable_across_orgs, s.source_id).toBe(false);
    const byTitle = (t) => manifest.sources.find((s) => s.title === t);
    expect(manifest.sources.find((s) => s.url?.includes("bigtextrailers.com")).rights).toMatchObject({ redistribution: "link-only" });
    expect(byTitle("35SA side.jpg").rights).toMatchObject({ status: "customer-supplied", redistribution: "public-host" });
    // Folder default: the customer's own instructions for renters show on their own pages.
    expect(byTitle("Big Tex 35SA quick start.pdf").rights).toMatchObject({ status: "customer-supplied", redistribution: "public-host" });
    // FILES & NOTES exceptions: staff only stays private; a maker's card for renters is link-only until permission is on record.
    expect(byTitle("35SA yard checklist.pdf")).toMatchObject({ kind: "customer-file", applicability: "For Big Tex 35SA utility 12 ft", rights: { status: "customer-supplied", redistribution: "private-only" } });
    expect(byTitle("E20 quick reference card.pdf")).toMatchObject({ kind: "oem-manual", rights: { status: "unknown", redistribution: "link-only" } });
    expect(byTitle("Caterpillar 301.5 manual (not established)").rights).toMatchObject({ status: "unknown", redistribution: "blocked" });
  });

  it("lets a FILES & NOTES row narrow a folder default, never widen it", () => {
    const rowFor = (name, source, audience) => ({ "file.name": name, "file.kind": "Your instructions", "file.for": GOOD_MODEL["model.name"], "file.source": source, "file.audience": audience });
    const manifestWith = (model, files) => {
      const intake = intakeOf({ company: GOOD_COMPANY, people: GOOD_PEOPLE, models: [model], assets: [GOOD_ASSET], files });
      return buildManifest(intake, assessIntake(intake, { prepared: PREPARED_CLEARED }), { batchId: "b" }).manifest;
    };
    const handout = { ...GOOD_MODEL, "model.instructions": "handout.pdf", "model.photo": "side.jpg", "model.photo_permission": "Maker's photo, permitted" };
    const narrowed = manifestWith(handout, [rowFor("handout.pdf", "From the maker", "Staff only"), rowFor("side.jpg", "We made it or took it", "Renters, on our pages")]);
    const title = (t) => narrowed.sources.find((s) => s.title === t);
    expect(title("handout.pdf").rights).toMatchObject({ status: "unknown", redistribution: "private-only" });
    // The model photo stays as conservative as its MODELS answer, whatever the FILES row says.
    expect(title("side.jpg").rights).toMatchObject({ status: "oem-permission", redistribution: "private-only" });
    expect(narrowed.sources.filter((s) => s.title === "handout.pdf")).toHaveLength(1);
    expect(fileRowRights({ "file.source": "Not sure", "file.audience": "Renters, on our pages" })).toEqual({ status: "unknown", redistribution: "private-only" });
    expect(fileRowRights({ "file.source": "We made it or took it" })).toEqual({ status: "customer-supplied", redistribution: "private-only" });
  });

  it("keeps people's names and addresses out: only references and the public support address", async () => {
    const { intake, result } = await exampleResult();
    const text = JSON.stringify(buildManifest(intake, result, { batchId: EXAMPLE_BATCH_ID, fictional: true }).manifest);
    for (const p of intake.people) {
      expect(text.includes(p.values["people.name"]), p.values["people.name"]).toBe(false);
      expect(text.includes(p.values["people.email"]), p.values["people.email"]).toBe(false);
    }
    expect(text.includes("yard.lead@example.com")).toBe(false);
    expect(text).toContain("rentals@example.com");
  });

  it("matches the committed example run", async () => {
    const { intake, result } = await exampleResult();
    const { manifest } = buildManifest(intake, result, { batchId: EXAMPLE_BATCH_ID, fictional: true });
    expect(JSON.parse(readFileSync(path.join(PATHS.exampleRun, "manifest.json"), "utf8"))).toEqual(manifest);
  });
});

describe("reports and the one request", () => {
  it("guards formula-like text in the readiness workbook", async () => {
    const intake = intakeOf({ company: { ...GOOD_COMPANY, "company.name": "=cmd|' /c calc'!A1" }, people: GOOD_PEOPLE, models: [GOOD_MODEL], assets: [{ ...GOOD_ASSET, "asset.code": "-12" }] });
    const result = assessIntake(intake, { prepared: PREPARED_CLEARED });
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await reportWorkbook(intake, result, { batchId: "b", checkedAt: "2026-11-23" }));
    const values = [];
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => values.push(c.value))));
    for (const v of values) {
      expect(typeof v === "object" && v !== null && "formula" in v).toBe(false);
      if (typeof v === "string") expect(/^[=+\-@\t\r]/.test(v), v).toBe(false);
    }
    expect(values).toContain("'=cmd|' /c calc'!A1");
    expect(values).toContain("'-12");
  });

  it("groups customer items only, by company, model and asset, and numbers them once", async () => {
    const { result } = await exampleResult();
    const groups = missingItems(result);
    expect(groups.map((g) => g.title)).toEqual(["Bobcat E20 (3 assets)", "Assets without a model yet"]);
    expect(groups.flatMap((g) => g.items).every((r) => r.who === "customer" && r.severity === "blocker")).toBe(true);
    const { text, count } = missingItemsMarkdown(groups);
    expect(count).toBe(2);
    expect(text).toMatch(/^\*\*Bobcat E20 \(3 assets\)\*\*\n\n1\. E20-03/);
    expect(fillTemplate("Hi {{a}}, {{b}}", { a: "Dana" })).toBe("Hi Dana, {{b}}");
  });

  it("drafts the email with no template header and only the sender's placeholders left", () => {
    const email = readFileSync(path.join(PATHS.exampleRun, "missing-information-email.md"), "utf8");
    expect(email.startsWith("**Subject:** Northridge Rentals: 2 items to finish your setup")).toBe(true);
    expect([...email.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()).toEqual(["sender_name", "upload_link"]);
  });
});
