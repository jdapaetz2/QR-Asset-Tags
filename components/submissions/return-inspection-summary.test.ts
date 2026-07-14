import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Structural checks (Phase 3C.5): accessory rows use the context-aware label helper, and photos can be hidden so
// the evidence page renders them once in its consolidated gallery.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "return-inspection-summary.tsx"), "utf8");

describe("return-inspection-summary", () => {
  it("labels accessories via accessoryLabel keyed on the inspection type", () => {
    expect(src).toContain('from "@/lib/inspections/accessories"');
    expect(src).toContain("accessoryLabel(map[i.id], template.inspection_type)");
  });

  it("supports hidePhotos to avoid duplicating photos in the evidence gallery", () => {
    expect(src).toContain("hidePhotos");
    expect(src).toContain("!hidePhotos && Object.keys(photos).length > 0");
  });
});
