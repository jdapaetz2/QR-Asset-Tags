/**
 * Engineering Phase E3 — readiness under the content contract's §3 rules: each rule gives its status, field and who
 * acts; customer items outrank Mulemark items, which outrank warnings; assets inherit their model's items; READY only
 * with nothing at all; no count ever clears a blocker.
 */
import { describe, expect, it } from "vitest";

import { assessIntake, statusOf } from "./readiness.mjs";
import { GOOD_ASSET, GOOD_COMPANY, GOOD_MODEL, GOOD_PEOPLE, GOOD_UPLOAD, PREPARED_CLEARED, intakeOf } from "./test-helpers.mjs";

const base = (over = {}) =>
  intakeOf({
    company: { ...GOOD_COMPANY, ...(over.company ?? {}) },
    people: over.people ?? GOOD_PEOPLE,
    models: over.models ?? [GOOD_MODEL],
    assets: over.assets ?? [GOOD_ASSET],
    files: over.files ?? [],
    issues: over.issues ?? [],
  });
const codes = (reasons) => reasons.map((r) => `${r.code}:${r.who ?? "warning"}`);
const asset = (result, code = "00412") => result.assets.find((a) => a.code === code);

describe("statuses", () => {
  it("READY needs nothing at all; precedence is customer, then Mulemark, then warnings", () => {
    expect(statusOf([])).toBe("READY");
    expect(statusOf([{ severity: "warning", who: null }])).toBe("READY_WITH_WARNINGS");
    expect(statusOf([{ severity: "warning", who: null }, { severity: "blocker", who: "mulemark" }])).toBe("MULEMARK_REVIEW");
    expect(statusOf([{ severity: "blocker", who: "mulemark" }, { severity: "blocker", who: "customer" }])).toBe("CUSTOMER_INPUT_REQUIRED");
  });

  it("reaches READY for a complete asset on an approved pack whose manual is cleared", () => {
    const r = assessIntake(base(), { upload: GOOD_UPLOAD, prepared: PREPARED_CLEARED });
    expect(asset(r).reasons).toEqual([]);
    expect(asset(r).status).toBe("READY");
    expect(r.company.status).toBe("READY");
  });

  it("keeps the manual-by-link warning (READY_WITH_WARNINGS) when the pack's manual is not cleared", () => {
    const r = assessIntake(base(), { upload: GOOD_UPLOAD, prepared: [{ model_name: "Big Tex 35SA", model_key: "bigtex.35sa.12" }] });
    expect(codes(asset(r).reasons)).toEqual(["manual-link-only:warning"]);
    expect(asset(r).status).toBe("READY_WITH_WARNINGS");
  });

  it("counts page preparation as Mulemark work when no approved pack exists, and the asset inherits it", () => {
    const r = assessIntake(base(), { upload: GOOD_UPLOAD });
    expect(codes(r.models[0].reasons)).toContain("content-to-prepare:mulemark");
    expect(asset(r).own).toEqual([]);
    expect(asset(r).status).toBe("MULEMARK_REVIEW");
  });

  it("never lets a count clear a blocker: 99 complete assets don't help one duplicate", () => {
    const many = Array.from({ length: 99 }, (_, i) => ({ ...GOOD_ASSET, "asset.code": `T-${i}` }));
    const r = assessIntake(base({ assets: [...many, { ...GOOD_ASSET, "asset.code": "t-1" }] }), { prepared: PREPARED_CLEARED });
    expect(asset(r, "t-1").status).toBe("CUSTOMER_INPUT_REQUIRED");
    expect(asset(r, "T-1").status).toBe("CUSTOMER_INPUT_REQUIRED");
    expect(r.summary.draftImportable).toBe(98);
  });
});

describe("asset rules", () => {
  const one = (values, opts = {}) => assessIntake(base({ assets: [{ ...GOOD_ASSET, ...values }] }), { upload: GOOD_UPLOAD, prepared: PREPARED_CLEARED, ...opts });
  const cases = [
    ["missing code", { "asset.code": null }, "code-missing", "customer"],
    ["missing name", { "asset.name": null }, "name-missing", "customer"],
    ["no model", { "asset.model": null }, "model-missing", "customer"],
    ["model Not sure", { "asset.model": "Not sure" }, "model-unknown", "customer"],
    ["model Please review", { "asset.model": "Please review" }, "model-identify", "mulemark"],
    ["model not on MODELS", { "asset.model": "Bobcat E20" }, "model-unmatched", "customer"],
    ["bad year", { "asset.year": "20x2" }, "year-invalid", "customer"],
    ["photo folder empty", { "asset.code": "00999" }, "photo-folder-empty", "customer"],
    ["named photo missing", { "asset.photo": "IMG_9.jpg" }, "photo-missing", "customer"],
    ["no tag answer", { "asset.tag": null }, "tag-missing", "customer"],
    ["existing tag", { "asset.tag": "Already has a Mulemark tag" }, "tag-existing", "mulemark"],
    ["bad unit contact", { "asset.unit_support": "ask Sam" }, "unit-support-invalid", "customer"],
    ["unit difference", { "asset.differences": "Different gate" }, "difference-review", "mulemark"],
  ];
  for (const [name, values, code, who] of cases) {
    it(`${name} -> ${code} (${who})`, () => {
      const a = one(values).assets[0];
      const hit = a.own.find((r) => r.code === code);
      expect(hit, codes(a.own).join(", ")).toBeTruthy();
      expect(hit.who).toBe(who);
      expect(hit.severity).toBe("blocker");
      expect(hit.tab).toBe("ASSETS");
    });
  }

  it("flags a duplicate code ignoring case, on both rows, and keeps them out of the draft import", () => {
    const r = assessIntake(base({ assets: [GOOD_ASSET, { ...GOOD_ASSET, "asset.code": "00412".toLowerCase() }, { ...GOOD_ASSET, "asset.code": "ab-1" }, { ...GOOD_ASSET, "asset.code": "AB-1" }] }), { prepared: PREPARED_CLEARED });
    expect(r.assets.filter((a) => a.own.some((x) => x.code === "duplicate-code")).map((a) => a.code)).toEqual(["00412", "00412", "ab-1", "AB-1"]);
    expect(r.assets.every((a) => !a.draftImport)).toBe(true);
  });

  it("asks to confirm a code stored as a number before tags, and holds it out of the draft import", () => {
    const r = assessIntake(base({ assets: [{ values: { ...GOOD_ASSET, "asset.code": "412" }, numeric: { "asset.code": true } }] }), { prepared: PREPARED_CLEARED });
    expect(codes(r.assets[0].own)).toContain("code-number:customer");
    expect(r.assets[0].draftImport).toBe(false);
  });

  it("requires a serial or year only when the model's manual depends on it", () => {
    const depends = { ...GOOD_MODEL, "model.manual_depends": "Yes" };
    const without = { ...GOOD_ASSET, "asset.serial": null, "asset.year": null };
    const r1 = assessIntake(base({ models: [depends], assets: [without] }), { prepared: PREPARED_CLEARED });
    expect(codes(r1.assets[0].own)).toContain("serial-needed:customer");
    const r2 = assessIntake(base({ models: [depends], assets: [{ ...without, "asset.serial": "Please review" }] }), { prepared: PREPARED_CLEARED });
    expect(codes(r2.assets[0].own)).toContain("serial-read:mulemark");
    const r3 = assessIntake(base({ assets: [without] }), { prepared: PREPARED_CLEARED });
    expect(codes(r3.assets[0].own)).toEqual(["no-serial-year:warning"]);
  });

  it("warns, without blocking, for no photo, a model photo that doesn't exist and an undialable unit phone", () => {
    const r = assessIntake(base({ assets: [{ ...GOOD_ASSET, "asset.photo": "No photo yet" }, { ...GOOD_ASSET, "asset.code": "B", "asset.photo": "Use model photo", "asset.unit_support": "555-01" }] }), { prepared: PREPARED_CLEARED });
    expect(codes(r.assets[0].own)).toEqual(["no-photo:warning"]);
    expect(codes(r.assets[1].own)).toEqual(["no-model-photo:warning", "unit-phone-not-dialable:warning"]);
  });
});

describe("company, people and inheritance", () => {
  it("passes the missing support contact to every asset without its own, but lists it once for the customer", () => {
    const r = assessIntake(base({ company: { "company.support_phone": null, "company.support_email": null }, assets: [GOOD_ASSET, { ...GOOD_ASSET, "asset.code": "B", "asset.unit_support": "unit@example.com" }] }), { upload: [...GOOD_UPLOAD, { path: "Photos/B/1.jpg", bytes: 1 }], prepared: PREPARED_CLEARED });
    expect(codes(r.company.reasons)).toContain("support-missing:customer");
    expect(asset(r).status).toBe("CUSTOMER_INPUT_REQUIRED");
    expect(asset(r).own.some((x) => x.code === "support-missing")).toBe(false);
    expect(asset(r, "B").status).toBe("READY");
  });

  it("checks the approver, notification email, brand color, logo and an Administrator", () => {
    const r = assessIntake(
      base({
        company: { "approver.title": null, "alerts.notification_email": "not-an-email", "company.brand_color": "green", "company.logo_file": "logo.ai" },
        people: [{ "people.name": "Sam", "people.email": "sam@example.com", "people.role": "Staff" }, { "people.name": "Sam 2", "people.email": "SAM@example.com", "people.role": "Boss" }],
      }),
      { upload: GOOD_UPLOAD, prepared: PREPARED_CLEARED },
    );
    expect(codes(r.company.reasons)).toEqual(
      expect.arrayContaining(["approver-missing:customer", "notification-email-invalid:customer", "brand-color:customer", "logo-missing:customer", "logo-convert:mulemark", "no-admin:customer", "person-email-duplicate:customer", "person-role:customer"]),
    );
    const match = assessIntake(base({ company: { "company.brand_color": "Match our logo" } }), { prepared: PREPARED_CLEARED });
    expect(codes(match.company.reasons)).toContain("brand-color-from-logo:mulemark");
  });

  it("warns that the support phone gets no Call button when it isn't a plain number", () => {
    const r = assessIntake(base({ company: { "company.support_phone": "1-800-RENTALS" } }), { prepared: PREPARED_CLEARED });
    expect(codes(r.company.reasons)).toContain("support-phone-not-dialable:warning");
  });
});

describe("model rules", () => {
  const model = (values, opts = {}) => assessIntake(base({ models: [{ ...GOOD_MODEL, ...values }] }), { upload: GOOD_UPLOAD, ...opts }).models[0];
  const cases = [
    [{ "model.manual": null }, "manual-missing:customer"],
    [{ "model.manual": "Not sure" }, "manual-not-sure:customer"],
    [{ "model.manual": "Not available" }, "manual-search:mulemark"],
    [{ "model.manual": "Please review" }, "manual-search:mulemark"],
    [{ "model.manual": "see binder" }, "manual-unclear:customer"],
    [{ "model.manual_share": "Show our copy" }, "manual-host-rights:mulemark"],
    [{ "model.manual_share": "Staff only" }, "manual-staff-only:warning"],
    [{ "model.manual": "35SA manual.pdf", "model.manual_share": null }, "manual-share:customer"],
    [{ "model.manual": "35SA manual.pdf", "model.manual_share": "Link to the maker's copy" }, "manual-find-link:mulemark"],
    [{ "model.manual_depends": "Not sure" }, "applicability:mulemark"],
    [{ "model.photo": "Please review" }, "model-photo-search:mulemark"],
    [{ "model.photo": "35SA.jpg", "model.photo_permission": "Not sure" }, "photo-permission:customer"],
    [{ "model.photo": "35SA.jpg", "model.photo_permission": "Maker's photo, permitted" }, "photo-permission-record:mulemark"],
    [{ "model.fuel": "Not sure" }, "fuel:mulemark"],
    [{ "model.accessories": null }, "accessories-unknown:warning"],
    [{ "model.category": "Scissor lift" }, "generic-return:warning"],
    [{ "model.make": null }, "model-identity:customer"],
  ];
  for (const [values, expected] of cases) {
    it(`${JSON.stringify(values)} -> ${expected}`, () => {
      expect(codes(model(values).reasons)).toContain(expected);
    });
  }

  it("lists files the customer named but didn't upload, and refuses unusable file types and stray folders", () => {
    const r = assessIntake(base({ files: [{ "file.name": "quick start.pdf", "file.kind": "Your instructions", "file.for": "Big Tex 35SA", "file.audience": "Not sure" }] }), {
      upload: [...GOOD_UPLOAD, { path: "Photos/00999/a.jpg", bytes: 1 }, { path: "Model documents/Unknown/x.pdf", bytes: 1 }, { path: "Photos/00412/raw.CR2", bytes: 1 }],
      prepared: PREPARED_CLEARED,
    });
    expect(codes(r.files)).toEqual(expect.arrayContaining(["file-audience:customer", "file-not-uploaded:customer"]));
    expect(codes(r.upload.reasons)).toEqual(expect.arrayContaining(["photo-folder-unknown:customer", "model-folder-unknown:customer", "file-type:customer"]));
  });

  it("asks where a file is from only when renters are to see it", () => {
    const row = (source, audience, kind = "Your instructions") => ({ "file.name": "card.pdf", "file.kind": kind, "file.for": "Big Tex 35SA", "file.source": source, "file.audience": audience });
    const fileCodes = (r) => codes(assessIntake(base({ files: [r] }), { prepared: PREPARED_CLEARED }).files);
    expect(fileCodes(row("We made it or took it", "Renters, on our pages"))).toEqual([]);
    expect(fileCodes(row(null, "Staff only"))).toEqual([]);
    expect(fileCodes(row("Not sure", "Renters, on our pages"))).toEqual(["file-source:customer"]);
    expect(fileCodes(row(null, "Renters, on our pages"))).toEqual(["file-source:customer"]);
    expect(fileCodes(row("From the maker", "Renters, on our pages"))).toEqual(["file-rights-record:mulemark"]);
    expect(fileCodes(row("We made it or took it", "Everyone"))).toEqual(["file-audience:customer"]);
    // "Other" files are context only: no audience needed, and they stay private.
    expect(fileCodes(row(null, null, "Other"))).toEqual([]);
  });

  it("turns reader issues into items: formulas back to the customer, card numbers to Mulemark", () => {
    const r = assessIntake(base({ issues: [{ tab: "ASSETS", row: 7, cell: "B7", key: "asset.name", kind: "formula" }, { tab: "ASSETS", row: 8, cell: "L8", key: "asset.notes", kind: "card-number" }] }), { prepared: PREPARED_CLEARED });
    expect(codes(r.general)).toEqual(["formula-in-input:customer", "sensitive-data:mulemark"]);
  });
});
