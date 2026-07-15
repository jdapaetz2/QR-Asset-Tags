import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Server component → asserted structurally (Phase 3C.8, Part B): same-org authenticated contact prefill.
const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "page.tsx"), "utf8");

describe("public renter return route — contact prefill", () => {
  it("reads an optional authenticated viewer and gates prefill by same org", () => {
    expect(src).toContain("getProfile");
    expect(src).toContain("resolveContactPrefill(profile, resolved.organizationId)");
    expect(src).toContain("contactDefaults");
  });

  it("stays dynamic so personalized output is never shared-cached", () => {
    expect(src).toContain('export const dynamic = "force-dynamic"');
  });
});
