import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Wave 3N.2: structural checks that navigation + context preservation are wired consistently across the
// server components (asserted by reading source; these are RSCs, not unit-testable in jsdom).
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(resolve(repo, p), "utf8");

describe("asset sub-navigation (Part D)", () => {
  const subnav = read("components/assets/asset-subnav.tsx");
  it("lists the five canonical asset sections", () => {
    for (const label of [
      "Overview",
      "Equipment page",
      "Documents",
      "Timeline",
      "Rental sessions",
    ]) {
      expect(subnav).toContain(`"${label}"`);
    }
  });
  it("preserves assetId and threads returnTo through the same-area tabs", () => {
    expect(subnav).toContain("/dashboard/assets/${assetId}");
    expect(subnav).toContain("withReturnTo");
    expect(subnav).toContain("/dashboard/rentals?asset=${assetId}");
  });
  it("is rendered on every asset page (detail + three sub-pages)", () => {
    for (const p of [
      "app/(admin)/dashboard/assets/[assetId]/page.tsx",
      "app/(admin)/dashboard/assets/[assetId]/page/page.tsx",
      "app/(admin)/dashboard/assets/[assetId]/documents/page.tsx",
      "app/(admin)/dashboard/assets/[assetId]/timeline/page.tsx",
    ]) {
      expect(read(p), p).toContain("<AssetSubnav");
    }
  });
});

describe("Assets-area secondary grouping (Part C)", () => {
  const list = read("app/(admin)/dashboard/assets/page.tsx");
  it("groups Import + template catalogs + Tag requests under Assets, admin-only", () => {
    // Wave 3N.4.1: the plain tab strip became clear outlined secondary buttons via the shared
    // SecondaryActionLink (buttonVariants outline), still under an "Assets tools" nav cluster.
    expect(list).toContain("<SecondaryActionLink");
    expect(list).toContain('aria-label="Assets tools"');
    expect(list).toContain('"/dashboard/assets/import"');
    expect(list).toContain('"/dashboard/templates"');
    expect(list).toContain('"/dashboard/templates/return-inspections"');
    expect(list).toContain('"/dashboard/tag-requests"');
    // Gated on the caller's role so staff never sees a link that would bounce.
    expect(list).toContain("isAdmin");
  });
  it("dashboard no longer duplicates the template/export links (Part C de-dupe)", () => {
    const dash = read("app/(admin)/dashboard/page.tsx");
    expect(dash).not.toContain('href="/dashboard/templates"');
    expect(dash).not.toContain('href="/dashboard/export"');
  });
  it("Settings surfaces its destinations via an in-page section index", () => {
    const settings = read("app/(admin)/dashboard/settings/page.tsx");
    expect(settings).toContain("<SecondaryNav");
    expect(settings).toContain('"#organization"');
    expect(settings).toContain('"#notifications"');
    expect(settings).toContain('"#team"');
  });
});

describe("submission detail cleanup (Part F)", () => {
  const detail = read("app/(admin)/dashboard/submissions/[submissionId]/page.tsx");
  it("renders one context strip, not two duplicate clusters", () => {
    expect(detail).toContain("assetContext");
    expect(detail).not.toContain("const assetCard");
    expect(detail).not.toContain("const assetStrip");
  });
  it("keeps the canonical context links", () => {
    expect(detail).toContain("Asset detail →");
    expect(detail).toContain("Asset timeline →");
    expect(detail).toContain("Session evidence →");
    expect(detail).toContain("This asset&apos;s submissions →");
  });
  it("preserves the originating inbox filters on Back and after status changes", () => {
    expect(detail).toContain("backHref(returnTo,");
    expect(detail).toContain("returnTo ?? detailHref");
  });
});

describe("rental-session navigation (Part G)", () => {
  const ev = read("app/(admin)/dashboard/rentals/[sessionId]/page.tsx");
  it("offers Back to Rentals + Asset detail + Asset timeline (never browser-Back only)", () => {
    expect(ev).toContain("← Back to Rentals");
    expect(ev).toContain("Asset detail");
    expect(ev).toContain("Asset timeline");
    expect(ev).toContain('backHref(returnTo, "/dashboard/rentals")');
  });
});

describe("open-redirect protection (Part E)", () => {
  it("submissions + team actions validate redirect targets via a hardened helper (no /\\ escape)", () => {
    const subs = read("lib/submissions/actions.ts");
    expect(subs).toContain("sanitizeReturnTo");
    expect(subs).not.toContain("/^\\/[^/]/");
    // Team spans /owner + /dashboard, so it uses the internal-path validator (still rejects // and /\).
    const team = read("lib/team/actions.ts");
    expect(team).toContain("sanitizeNextPath");
    expect(team).not.toContain("/^\\/[^/]/");
  });
  it("deleteAsset returns to the (validated) originating list", () => {
    expect(read("lib/assets/actions.ts")).toContain('backHref(returnTo, "/dashboard/assets")');
  });
});
