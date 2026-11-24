/**
 * Engineering Phase E3 — what onboard:check writes, against today's importer and E4's contract:
 *  - the current-import CSV goes through the app's own parser (lib/onboarding/import.ts) with zero errors, the same
 *    codes in the same order, every publish and QR flag off and no template key;
 *  - the manifest validates against the content contract 1.3.0, reuses one model for the 40 trailers, records rights
 *    conservatively (never shareable across organizations), carries the batch's measurements and holds no real names;
 *  - the to-do list splits the customer's questions from Mulemark's own work; the readiness workbook guards
 *    formula-like text; the questions email carries customer items only; the preview email only ever includes
 *    machines with nothing outstanding.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { parseImportRows } from "@/lib/onboarding/import";

import { EXAMPLE_BATCH_ID, EXAMPLE_UPLOAD } from "./example-data.mjs";
import { KIT, PATHS } from "./kit-config.mjs";
import {
  buildManifest,
  codeSummary,
  currentImportCsv,
  emailValues,
  fileRowRights,
  fillTemplate,
  missingItems,
  missingItemsMarkdown,
  reportWorkbook,
  todoMarkdown,
  validateManifest,
  warningSummary,
} from "./outputs.mjs";
import { readWorkbook } from "./read.mjs";
import { allReasons, assessIntake } from "./readiness.mjs";
import { GOOD_ASSET, GOOD_COMPANY, GOOD_MODEL, GOOD_PEOPLE, PREPARED_CLEARED, intakeOf } from "./test-helpers.mjs";

const require = createRequire(import.meta.url);
const SCHEMA = JSON.parse(readFileSync(PATHS.schema, "utf8"));
const EXAMPLE_FILE = readFileSync(path.join(PATHS.internal, `EXAMPLE-setup-workbook-v${KIT.workbookVersion}.xlsx`));
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
    // A blank tag answer is a new tag; only PC-07 ("No tag for now") gets none.
    expect(manifest.assets.filter((a) => !a.qr.create).map((a) => a.asset_code)).toEqual(["PC-07"]);
    // The CALL SHEET's dates and time become the batch's measurements.
    expect(manifest.batch.measurements).toEqual({ batch_complete_at: "2026-11-26", customer_wait_hours: 6, hands_on_minutes: 95 });
  });

  it("links a manual file the customer sent from the maker's official copy unless hosting is chosen", () => {
    const manifestWith = (share) => {
      const model = { ...GOOD_MODEL, "model.manual": "35SA manual.pdf", "model.manual_share": share };
      const intake = intakeOf({ company: GOOD_COMPANY, people: GOOD_PEOPLE, models: [model], assets: [GOOD_ASSET] });
      return buildManifest(intake, assessIntake(intake, { prepared: PREPARED_CLEARED }), { batchId: "b" }).manifest;
    };
    for (const share of [null, "Not sure", "Link to the maker's copy"]) {
      const m = manifestWith(share);
      expect(m.models[0].manual.delivery, String(share)).toBe("link");
      expect(m.sources.find((s) => s.title === "35SA manual.pdf").rights).toMatchObject({ status: "unknown", redistribution: "private-only" });
    }
    expect(manifestWith("Show our copy").models[0].manual.delivery).toBe("hosted");
    expect(manifestWith("Show our copy").sources.find((s) => s.title === "35SA manual.pdf").rights.redistribution).toBe("private-only");
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

  it("groups customer items only, by company, model and machine, and numbers them once, without workbook references", async () => {
    const { result } = await exampleResult();
    const groups = missingItems(result, "customer");
    expect(groups.map((g) => g.title)).toEqual(["Bobcat E20 (3 machines)", "Machines without a model yet"]);
    expect(groups.flatMap((g) => g.items).every((r) => r.who === "customer" && r.severity === "blocker")).toBe(true);
    const { text, count } = missingItemsMarkdown(groups);
    expect(count).toBe(2);
    expect(text).toMatch(/^\*\*Bobcat E20 \(3 machines\)\*\*\n\n1\. E20-03/);
    expect(text).not.toMatch(/ASSETS|MODELS|CALL SHEET/);
    expect(missingItemsMarkdown(groups, { refs: true }).text).toContain("_(ASSETS, H8)_");
    expect(fillTemplate("Hi {{a}}, {{b}}", { a: "Dana" })).toBe("Hi Dana, {{b}}");
  });

  it("lists Mulemark's own work separately: manuals, page preparation, reviews and rights", async () => {
    const { result } = await exampleResult();
    const mine = missingItems(result, "mulemark");
    expect(mine.map((g) => g.title)).toEqual(["Big Tex 35SA utility 12 ft (40 machines)", "Cat 301.5 (2 machines)", "Files"]);
    expect(mine.flatMap((g) => g.items).map((r) => r.code)).toEqual(["difference-review", "manual-search", "applicability", "model-photo-search", "content-to-prepare", "file-rights-record"]);
  });

  it("writes a to-do list with what to ask, what to do and one line per kind of warning", async () => {
    const { intake, result } = await exampleResult();
    const todo = todoMarkdown(intake, result, { batchId: EXAMPLE_BATCH_ID, checkedAt: "2026-11-24", sourceSha256: "0".repeat(64) });
    expect(todo).toMatch(/^# To do: Northridge Rentals\n/);
    for (const heading of ["## Ask the customer (2)", "## Your work (6)", "## Warnings (3)", "## Details"]) expect(todo).toContain(heading);
    expect(warningSummary(allReasons(result))).toEqual([
      "Manual by link only. (3: Big Tex 35SA utility 12 ft, Big Tex 14LP dump 14 ft, Bobcat E20)",
      "No serial number or year. (42: DT-14, PC-07, 00101, 00102, …)",
      "PC-07: no photo yet.",
    ]);
    // The committed example's to-do list matches, apart from its header lines (date and source hash).
    const body = (t) => t.split("\n").slice(4).join("\n");
    expect(body(readFileSync(path.join(PATHS.exampleRun, "to-do.md"), "utf8"))).toBe(body(todo));
  });

  it("shortens unit numbers: consecutive runs of the same width become a range", () => {
    expect(codeSummary(["00101", "00102", "00103", "00105", "00106", "E20-01", "7", "8", "9", "009", "010"])).toBe("00101–00103, 00105, 00106, E20-01, 7–9, 009, 010");
    expect(codeSummary([])).toBe("");
  });

  it("puts only machines with nothing outstanding into the preview email, and names the rest with the reason", async () => {
    const { intake, result } = await exampleResult();
    const v = emailValues(intake, result);
    expect(v).toMatchObject({ company_name: "Northridge Rentals", approver_first_name: "Dana", contact_first_name: "Dana", approver_title: "Operations manager", asset_count: 42, live_count: 42, notification_email: "rentals@example.com" });
    expect(v.included_codes_summary).toBe("E20-01, E20-02, DT-14, 00101–00111, 00113–00140");
    expect(v.excluded_note).toBe(" Not included yet: E20-03, PC-07 (waiting on your answers); C301-1, C301-2, 00112 (we're still finishing them).");
    expect(v.not_live_note).toBe("Not live yet: E20-03, C301-1, C301-2, PC-07, 00112. We'll add them as soon as they're ready.");
  });

  it("drafts the emails as plain text, ready to paste, with only the sender's placeholders left", () => {
    const read = (file) => readFileSync(path.join(PATHS.exampleRun, file), "utf8");
    const left = (file) => [...read(file).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    expect(read("questions-email.txt").startsWith("Subject: Northridge Rentals: 2 quick questions to finish your pages\n")).toBe(true);
    for (const f of ["questions-email.txt", "email-3-preview-ready.txt", "email-4-live.txt"]) {
      expect(read(f), f).not.toMatch(/\*\*|^> /m);
      expect(read(f), f).not.toMatch(/\n{3,}/);
    }
    expect(left("questions-email.txt")).toEqual(["sender_name"]);
    expect(left("email-3-preview-ready.txt")).toEqual(["content_version", "preview_link", "sender_name"]);
    expect(left("email-4-live.txt")).toEqual(["sender_name", "tag_status"]);
    const preview = read("email-3-preview-ready.txt");
    expect(preview).toContain("Included: 42 machines (E20-01, E20-02, DT-14, 00101–00111, 00113–00140). Not included yet: E20-03, PC-07 (waiting on your answers); C301-1, C301-2, 00112 (we're still finishing them).");
    expect(preview).toContain("I confirm, as Operations manager, that I have reviewed the content in this preview.");
    expect(preview).toContain("If someone else approves, please forward this email to them.");
    expect(read("email-4-live.txt")).toContain("Not live yet: E20-03, C301-1, C301-2, PC-07, 00112. We'll add them as soon as they're ready.");
  });

  it("keeps the batch number in the manifest id, however long the company name", () => {
    const intake = intakeOf({ company: { ...GOOD_COMPANY, "company.name": "Ridgeway Equipment Rental" }, people: GOOD_PEOPLE, models: [GOOD_MODEL], assets: [GOOD_ASSET] });
    const id = (batchId) => buildManifest(intake, assessIntake(intake, { prepared: PREPARED_CLEARED }), { batchId }).manifest.manifest_id;
    expect(id("ridgeway-equipment-rental-batch-1")).toBe("intake-ridgeway-equipment-rental-batch-1");
    expect(id("ridgeway-equipment-rental-batch-2")).toBe("intake-ridgeway-equipment-rental-batch-2");
    expect(id(EXAMPLE_BATCH_ID)).toBe("intake-ridgeway-equipment-rental-northridge-example-1");
  });
});
