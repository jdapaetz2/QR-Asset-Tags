import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const list = readFileSync(resolve(here, "session-browser-list.tsx"), "utf8");
const filters = readFileSync(resolve(here, "session-filters.tsx"), "utf8");
const page = readFileSync(
  resolve(here, "../../app/(admin)/dashboard/rentals/page.tsx"),
  "utf8"
);

describe("session-browser-list (Phase 3C.8, Part J)", () => {
  it("shows the RNT reference, status, and a View session evidence action", () => {
    expect(list).toContain("s.reference");
    expect(list).toContain("buildSessionEvidenceHref(s.id)");
    expect(list).toContain("View session evidence");
    expect(list).toContain('Active');
    expect(list).toContain('Returned');
  });

  it("loads more explicitly with no observer/timer/refresh loop", () => {
    expect(list).toContain("loadMoreRentalSessions");
    expect(list).toContain("if (pending || !hasMore) return");
    expect(list).not.toContain("IntersectionObserver");
    expect(list).not.toContain("setInterval");
    expect(list).not.toContain("router.refresh");
    expect(list).toContain("End of recorded history");
  });
});

describe("session-filters (Phase 3C.8, Part J)", () => {
  it("is a URL-driven disclosure open only when active, with the browser's filters", () => {
    expect(filters).toContain("open={filters.active || undefined}");
    expect(filters).toContain('method="get"');
    expect(filters).toContain('name="q"');
    expect(filters).toContain('name="asset_q"');
    expect(filters).toContain('name="renter_q"');
    expect(filters).toContain('name="status"');
  });
});

describe("rentals browser page", () => {
  it("replaces the redirect stub with the org session browser (no redirect)", () => {
    expect(page).toContain("getRentalSessionsPage");
    expect(page).toContain("SessionBrowserList");
    expect(page).toContain("No rental sessions found.");
    expect(page).not.toContain('redirect("/dashboard/submissions")');
  });
});
