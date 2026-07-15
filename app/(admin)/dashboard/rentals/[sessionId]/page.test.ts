import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Structural checks for the session-evidence surface. The record body now lives in the shared
// <SessionEvidenceRecord> (Wave 3N.3) rendered by both the admin page and the staff wrapper; the admin page
// keeps its own chrome (metadata, back-nav, print). Server components → asserted by reading source.
const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "page.tsx"), "utf8");
const repo = resolve(here, "../../../../..");
const record = readFileSync(
  resolve(repo, "components/rentals/session-evidence-record.tsx"),
  "utf8"
);

describe("session-evidence record (shared component) — collapsed disclosures", () => {
  it("renders evidence groups as native <details data-evidence-section> (no `open`)", () => {
    expect(record).toContain("details data-evidence-section");
    expect(record).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it("has a disclosure for each major section", () => {
    for (const title of [
      '"Differences"',
      '"Outbound baseline"',
      '"Renter return checklist"',
      '"Staff return checklist"',
      '"Photos by source"',
    ]) {
      expect(record).toContain(title);
    }
  });

  it("shows photos with each inspection AND keeps the aggregate gallery", () => {
    expect(record).toContain("PhotoTileGrid");
    expect(record).toContain("tilesForSource(photoGroups, source)");
    expect(record).toContain("EvidencePhotoGallery");
    expect(record).toContain("data-evidence-aggregate");
  });

  it("surfaces each inspection's photo count in its disclosure summary", () => {
    expect(record).toContain("withPhotos");
    expect(record).toContain("outboundPhotoCount");
    expect(record).toContain("staffPhotoCount");
  });

  it("renders the reference as a non-clickable mono chip", () => {
    expect(record).toMatch(/font-mono[^>]*>\s*\{submissionReference\(row\.id, row\.created_at\)\}/);
  });

  it("routes the 'Open submission' action through a surface-supplied submissionHref, hidden in print", () => {
    expect(record).toContain("href={submissionHref(row.id)}");
    // The actual JSX link (not the docstring mention) carries print:hidden.
    const linkIdx = record.indexOf("href={submissionHref(row.id)}");
    expect(record.slice(linkIdx, linkIdx + 320)).toContain("print:hidden");
    expect(record.slice(linkIdx, linkIdx + 320)).toContain("Open submission");
  });

  it("spends the one brass accent on the summary card + two-column summary", () => {
    expect(record).toContain("border-l-brass-500");
    expect(record).toContain("sm:grid-cols-2");
  });

  it("renders the print-only masthead + session acknowledgements", () => {
    expect(record).toContain("EvidencePrintHeader");
    expect(record).toContain("SessionAcknowledgements");
  });
});

describe("session-evidence page (admin chrome)", () => {
  it("renders the shared record with the admin submission route", () => {
    expect(page).toContain("<SessionEvidenceRecord");
    expect(page).toContain("/dashboard/submissions/${id}");
  });

  it("overrides the route title to the platform brand, never the product name", () => {
    expect(page).toContain("export const metadata");
    expect(page).toContain("Rental session evidence");
    expect(page).toContain("PLATFORM_NAME");
    expect(page).not.toContain("AssetTag QR");
  });

  it("keeps its own back-nav + print chrome, hidden in print", () => {
    expect(page).toContain("PrintEvidenceButton");
    expect(page).toContain('backHref(returnTo, "/dashboard/rentals")');
    expect(page).toContain("print:hidden");
  });

  it("signs media via the shared helper (no inline signing)", () => {
    expect(page).toContain("signMediaPaths");
    expect(page).not.toContain("createSignedUrl");
  });
});
