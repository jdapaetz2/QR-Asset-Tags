import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Node env (no jsdom) → the renderer is asserted structurally by reading its source. This guards the approved
// renter-facing photo copy (Phase 3C.4 — centralized in lib/inspections/photo-copy.ts) and the explicit-submit
// gate against regressions. The literal copy strings now live in the shared module, so the form file must be
// FREE of hedged phrasing and must source guidance through the shared helpers.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "return-inspection-form.tsx"), "utf8");

const HEDGED = ["if possible", "if you can", "where practical", "Photos are strongly recommended", "Photo's"];

describe("return-inspection-form photo guidance copy", () => {
  it("contains no hedged/legacy photo phrasing", () => {
    for (const phrase of HEDGED) expect(src).not.toContain(phrase);
  });

  it("sources photo guidance from the shared copy module", () => {
    expect(src).toContain('from "@/lib/inspections/photo-copy"');
    expect(src).toContain("photoSlotHelp(field.id, isOutbound)");
    expect(src).toContain("reviewNoPhotos(isOutbound)");
    expect(src).toContain("reviewDamageNoPhoto(isOutbound)");
  });
});

describe("return-inspection-form attestation payload (Phase 3C.5)", () => {
  it("submits the acknowledgement via a canonical hidden input sourced from state", () => {
    // A hidden input carries the answer:<id> value from `strVal` (the client `values` state)…
    expect(src).toMatch(
      /<input type="hidden" name=\{name\} value=\{strVal === "yes" \? "yes" : "no"\} \/>/
    );
  });

  it("the visible acknowledgement checkbox is UI-only (no answer:* name)", () => {
    // …and the checkbox itself no longer carries the `name` (so the DOM checkbox can't diverge from state).
    const ackBlock = src.slice(src.indexOf('case "acknowledgement":'), src.indexOf('case "acknowledgement":') + 700);
    expect(ackBlock).toContain('type="checkbox"');
    expect(ackBlock).not.toMatch(/type="checkbox"[\s\S]*?name=\{name\}/);
  });
});

describe("return-inspection-form outbound terminology (Phase 3C.5)", () => {
  it("names stage 2 by workflow — Outbound details for outbound, Return details for return", () => {
    expect(src).toContain('outbound: { condition: "Condition", return_details: "Outbound details" }');
    expect(src).toContain('return: { condition: "Condition", return_details: "Return details" }');
    expect(src).toContain("template.inspection_type === \"outbound\"");
  });

  it("outbound accessories read Issued / Not issued / N/A (not Returned/Missing)", () => {
    expect(src).toContain('{ value: "issued", label: "Issued" }');
    expect(src).toContain('{ value: "not_issued", label: "Not issued" }');
  });

  it("uses a workflow-specific review step label", () => {
    expect(src).toContain('"Review & start rental"');
    expect(src).toContain('"Review & submit"');
  });

  it("detects damage via the flagged field (works for outbound existing_damage) (Phase 3C.6)", () => {
    expect(src).toContain('find((f) => f.flag === "damage_observed")');
    expect(src).not.toContain('values["damage_observed"] === "yes"');
  });

  it("selects outbound vs return photo copy for help + warnings + dialog", () => {
    expect(src).toContain("photoSlotHelp(field.id, isOutbound)");
    expect(src).toContain("reviewNoPhotos(isOutbound)");
    expect(src).toContain("reviewDamageNoPhoto(isOutbound)");
    expect(src).toContain("omissionDialogTitle(");
  });
});

describe("return-inspection-form explicit-submit gate", () => {
  it("gates the form action behind allowSubmitRef via onSubmit", () => {
    expect(src).toContain("allowSubmitRef");
    expect(src).toMatch(/onSubmit=\{\(e\) =>/);
    // The gate cancels any submit that wasn't explicitly authorized.
    expect(src).toContain("e.preventDefault()");
  });

  it("keeps stage navigation as type=button and only the final action as type=submit", () => {
    // Every Continue/Back/Review nav control is a button; the single submit is the explicit final action.
    expect(src).toContain('type="submit"');
    expect(src).toContain('type="button"');
    // Exactly one submit button in the form (the final Submit).
    const submitCount = (src.match(/type="submit"/g) ?? []).length;
    expect(submitCount).toBe(1);
  });
});
