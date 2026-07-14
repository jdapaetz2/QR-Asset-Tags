import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Server component → asserted structurally (Phase 3C.7). The print header carries the MuleMark brand.
const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "evidence-print-header.tsx"),
  "utf8"
);

describe("evidence-print-header (Phase 3C.7, Part G)", () => {
  it("is print-only (hidden on screen, block in print)", () => {
    expect(src).toContain("hidden print:block");
  });

  it("renders the canonical MuleMark wordmark artwork, not live text", () => {
    expect(src).toContain("BrandWordmark");
    expect(src).toContain("title={PLATFORM_NAME}");
    expect(src).toContain('from "@/lib/constants"');
  });

  it("labels the printed record and carries the session reference", () => {
    expect(src).toContain("Rental session evidence");
    expect(src).toContain("sessionRef");
  });
});
