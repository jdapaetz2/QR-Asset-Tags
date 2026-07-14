import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Structural checks for the session-evidence disclosures + gallery (Phase 3C.5). Server component → asserted by
// reading source (node env, no jsdom).
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "page.tsx"), "utf8");

describe("session-evidence page — collapsed disclosures", () => {
  it("renders evidence groups as native <details data-evidence-section> (no `open`)", () => {
    expect(src).toContain("details data-evidence-section");
    // No disclosure is open by default.
    expect(src).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it("has a disclosure for each major section", () => {
    for (const title of [
      '"Differences"',
      '"Outbound baseline"',
      '"Renter return report"',
      '"Staff return inspection"',
      '"Photos by source"',
    ]) {
      expect(src).toContain(title);
    }
  });

  it("renders photos once via the deduped gallery, hiding per-source summary photos", () => {
    expect(src).toContain("EvidencePhotoGallery");
    expect(src).toContain("galleryBySource(photoGroups)");
    expect(src).toContain("hidePhotos");
  });

  it("uses the print button that expands collapsed sections", () => {
    expect(src).toContain("PrintEvidenceButton");
  });
});
