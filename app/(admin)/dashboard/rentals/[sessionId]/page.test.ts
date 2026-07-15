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
      '"Renter return checklist"',
      '"Staff return checklist"',
      '"Photos by source"',
    ]) {
      expect(src).toContain(title);
    }
  });

  it("shows photos with each inspection AND keeps the aggregate gallery (Phase 3C.6)", () => {
    // Per-inspection deduped grid...
    expect(src).toContain("PhotoTileGrid");
    expect(src).toContain("tilesForSource(photoGroups, source)");
    // ...plus the aggregate gallery, hidden in print to avoid duplicate pages.
    expect(src).toContain("EvidencePhotoGallery");
    expect(src).toContain("data-evidence-aggregate");
  });

  it("surfaces each inspection's photo count in its disclosure summary", () => {
    expect(src).toContain("withPhotos");
    expect(src).toContain("outboundPhotoCount");
    expect(src).toContain("staffPhotoCount");
  });

  it("uses the print button that expands collapsed sections", () => {
    expect(src).toContain("PrintEvidenceButton");
  });
});

describe("session-evidence page — submission navigation (Phase 3C.7, Part B)", () => {
  it("renders the reference as a non-clickable mono chip", () => {
    expect(src).toContain("Reference");
    expect(src).toMatch(/font-mono[^>]*>\s*\{submissionReference\(row\.id, row\.created_at\)\}/);
  });

  it("provides a separate explicit 'Open submission' action to the canonical route", () => {
    expect(src).toContain("Open submission");
    expect(src).toContain("href={`/dashboard/submissions/${row.id}`}");
  });

  it("hides the Open submission action in print", () => {
    const openAt = src.indexOf("Open submission");
    const linkStart = src.lastIndexOf("<Link", openAt);
    expect(src.slice(linkStart, openAt)).toContain("print:hidden");
  });
});

describe("session-evidence page — MuleMark brand + print (Phase 3C.7, Parts C/D/G)", () => {
  it("overrides the route title to MuleMark, never the AssetTag QR product name", () => {
    expect(src).toContain("export const metadata");
    expect(src).toContain("Rental session evidence");
    expect(src).toContain("PLATFORM_NAME");
    expect(src).not.toContain("AssetTag QR");
  });

  it("renders the print-only MuleMark masthead", () => {
    expect(src).toContain("EvidencePrintHeader");
  });

  it("spends the one brass accent on the summary card", () => {
    expect(src).toContain("border-l-brass-500");
  });

  it("hides the screen-only header controls in print", () => {
    expect(src).toContain("print:hidden");
  });
});

describe("session-evidence page — top summary + acknowledgements (Phase 3C.7, Parts D/E/F)", () => {
  it("renders a two-column summary that stacks on mobile", () => {
    expect(src).toContain("sm:grid-cols-2");
  });

  it("surfaces the session-scoped acknowledgement summary", () => {
    expect(src).toContain("SessionAcknowledgements");
    expect(src).toContain("summarizeAcknowledgements");
  });
});
