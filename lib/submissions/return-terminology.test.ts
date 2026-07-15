import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { submissionTypeLabel } from "./origin";

// Wave 3N.1: the canonical user-facing term is "Return checklist" (renter/staff origin variants). Internal
// `return_checklist` data + inspection-template architecture + "Outbound inspection" are unchanged.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(resolve(repo, p), "utf8");

describe("submissionTypeLabel — canonical checklist labels", () => {
  it("labels return checklists by origin; keeps Outbound inspection", () => {
    expect(submissionTypeLabel("return_checklist", "public")).toBe("Renter return checklist");
    expect(submissionTypeLabel("return_checklist", "staff")).toBe("Staff return checklist");
    expect(submissionTypeLabel("return_checklist", null)).toBe("Renter return checklist");
    expect(submissionTypeLabel("pre_use_inspection", "staff")).toBe("Outbound inspection");
  });
});

describe("user-facing return-checklist copy (Wave 3N.1)", () => {
  it("public scan button + form title + success say 'Return checklist'", () => {
    const scanner = read("components/public/public-scanner-view.tsx");
    expect(scanner).toContain("Return checklist");
    expect(scanner).not.toContain("Return Checklist"); // casing fixed
    expect(read("app/forms/[shortCode]/return/page.tsx")).toContain('title="Return checklist"');
    expect(read("app/forms/[shortCode]/return/thanks/page.tsx")).toContain(
      'title="Return checklist submitted"'
    );
  });

  it("staff flow says 'return checklist' (completion + form)", () => {
    const staffReturn = read("app/(staff)/staff/t/[shortCode]/return/page.tsx");
    expect(staffReturn).toContain("Staff return checklist");
    expect(staffReturn).toContain("Complete return checklist");
    expect(read("app/(staff)/staff/t/[shortCode]/return/complete/page.tsx")).toContain(
      "Staff return checklist completed"
    );
  });

  it("evidence surfaces say 'Return checklist' (not report/inspection)", () => {
    const evidence = read("app/(admin)/dashboard/rentals/[sessionId]/page.tsx");
    expect(evidence).toContain('title="Renter return checklist"');
    expect(evidence).toContain('title="Staff return checklist"');
    expect(read("components/submissions/evidence-photo-gallery.tsx")).toContain("Renter return checklist");
  });

  it("the inbox plural filter is 'Return checklists'", () => {
    expect(read("lib/submissions/inbox.ts")).toContain('"Return checklists"');
  });

  it("no user-facing 'Return inspection' remains for this workflow", () => {
    // Workflow surfaces must not use "Return inspection" as VISIBLE copy. Comments/JSDoc are stripped (a
    // technical "return inspection" description isn't user-facing); template-catalog pages under
    // /dashboard/templates/return-inspections keep the "inspection" architecture term and are excluded.
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const p of [
      "components/public/public-scanner-view.tsx",
      "app/forms/[shortCode]/return/page.tsx",
      "app/(staff)/staff/t/[shortCode]/return/page.tsx",
      "app/(staff)/staff/t/[shortCode]/return/complete/page.tsx",
      "components/submissions/return-inspection-summary.tsx",
    ]) {
      expect(stripComments(read(p)), p).not.toMatch(/return inspection/i);
    }
  });
});
