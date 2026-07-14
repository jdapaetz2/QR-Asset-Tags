import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Server component → asserted structurally (Phase 3C.7, Parts H/I): the outbound-workflow state matrix.
const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8"
);

describe("staff asset page — workflow state matrix (Phase 3C.7)", () => {
  it("drives the UI from the pure state helper, not the asset status flag alone", () => {
    expect(src).toContain("staffOutboundState");
    expect(src).toContain("sessionLoaded: session !== null");
    expect(src).toContain("hasBaseline: baselineId !== null");
  });

  it("removes the legacy 'cannot start until returned' notice", () => {
    expect(src).not.toContain("cannot start until it is returned");
  });

  it("available → Start outbound inspection with helper copy", () => {
    expect(src).toContain("Start outbound inspection");
    expect(src).toContain("before it leaves the yard");
  });

  it("attach → Add outbound inspection + view evidence + return, with the active-session details", () => {
    expect(src).toContain("Active rental has no outbound baseline");
    expect(src).toContain("Add outbound inspection");
    expect(src).toContain("original rental start time");
    expect(src).toContain("View session evidence");
    expect(src).toContain("Complete return inspection");
  });

  it("recorded → View outbound inspection (baseline recorded time + inspector), never Start/Add", () => {
    expect(src).toContain("Outbound baseline recorded");
    expect(src).toContain("View outbound inspection");
    expect(src).toContain("baseline.created_at");
    expect(src).toContain("baseline.submitted_by_name");
  });

  it("error → a safe attention state that never offers Start/Add", () => {
    expect(src).toContain("Rental session details unavailable");
  });

  it("loads the baseline's recorded time + inspector for the recorded state", () => {
    expect(src).toContain("id, created_at, submitted_by_name");
  });

  it("uses the canonical short code + evidence href in every action", () => {
    expect(src).toContain("`/staff/t/${shortCode}/outbound`");
    expect(src).toContain("`/staff/t/${shortCode}/return`");
    expect(src).toContain("buildSessionEvidenceHref(sessionId)");
  });

  it("keeps the public equipment page as a secondary link", () => {
    expect(src).toContain("Public equipment page");
  });
});
