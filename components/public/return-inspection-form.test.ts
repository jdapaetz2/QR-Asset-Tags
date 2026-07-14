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
    expect(src).toContain("photoSlotHelp(field.id)");
    expect(src).toContain("REVIEW_NO_PHOTOS");
    expect(src).toContain("REVIEW_DAMAGE_NO_PHOTO");
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
