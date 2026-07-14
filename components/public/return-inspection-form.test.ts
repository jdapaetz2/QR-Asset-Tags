import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Node env (no jsdom) → the renderer is asserted structurally by reading its source. This guards the approved
// renter-facing photo copy (Phase 3C.3) and the explicit-submit gate against regressions.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "return-inspection-form.tsx"), "utf8");

describe("return-inspection-form photo guidance copy", () => {
  it("drops the legacy 'strongly recommended' phrasing everywhere", () => {
    expect(src).not.toContain("strongly recommended");
  });

  it("never writes the possessive 'Photo's' typo", () => {
    expect(src).not.toContain("Photo's");
  });

  it("uses the approved per-slot guidance", () => {
    expect(src).toContain("Add a photo if you can.");
    expect(src).toContain(
      "add a clear photo of the damage so the rental team can review it faster."
    );
    expect(src).toContain("Add any other photos that help show the equipment");
  });

  it("uses the approved review-step warnings", () => {
    expect(src).toContain("No photos were added. You can still submit");
    expect(src).toContain("Damage was reported without a photo. You can still submit");
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
