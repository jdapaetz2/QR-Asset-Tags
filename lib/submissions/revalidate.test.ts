import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Structural wiring test (Phase 3C.4): revalidatePath can't run outside a request, so we assert the helper
// targets the LAYOUT and that every submission-status mutation calls it — this is what makes the nav badge
// refresh without a manual browser reload.
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

describe("revalidateSubmissionSurfaces", () => {
  it("busts the shared dashboard layout segment (nav badge) + the inbox", () => {
    const src = read("revalidate.ts");
    expect(src).toContain('revalidatePath("/dashboard", "layout")');
    expect(src).toContain('revalidatePath("/dashboard/submissions")');
  });
});

describe("every submission mutation revalidates the surfaces", () => {
  it("single status, mark-returned, and bulk actions all call it", () => {
    const src = read("actions.ts");
    expect(src).toContain('from "@/lib/submissions/revalidate"');
    // setSubmissionStatus + markReturnAndResolve + bulkSetSubmissionStatus.
    const calls = (src.match(/revalidateSubmissionSurfaces\(\)/g) ?? []).length;
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(src).toContain("export async function bulkSetSubmissionStatus");
  });

  it("staff return completion calls it", () => {
    expect(read("../inspections/staff-return-submit.ts")).toContain("revalidateSubmissionSurfaces()");
  });

  it("public submission creation calls it", () => {
    expect(read("../forms/submit.ts")).toContain("revalidateSubmissionSurfaces()");
  });

  /**
   * Phase C6.1. The public guided RETURN checklist was missing from this list, and so was the call —
   * the row committed and the admin's badge stayed stale until a manual reload. The hole in this test
   * was the same shape as the defect, which is exactly why a "list of paths" test has to be complete.
   *
   * This is a source-text assertion and is deliberately NOT the proof: the behaviour is proved in
   * lib/inspections/submit.test.ts, which fails if the call is removed. This one is the net that catches
   * a NEW submission path being added without one.
   */
  it("public guided return checklist creation calls it", () => {
    expect(read("../inspections/submit.ts")).toContain("revalidateSubmissionSurfaces()");
  });
});
