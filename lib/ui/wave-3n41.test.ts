import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PRODUCT_NAME, PLATFORM_NAME } from "@/lib/constants";

// Wave 3N.4.1 — structural checks for: (1) the shared page-level secondary-action treatment and the
// converted action clusters, (2) the flattened public scan typography (shared component → preview parity),
// (3) the compact one-line "Mark returned & resolve" action, and (4) the Mulemark naming. Server/client
// components are asserted by reading source (same approach as the other structural tests in this repo).
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const read = (rel: string) => readFileSync(resolve(repo, rel), "utf8");

describe("action hierarchy — shared secondary treatment (Part B/C)", () => {
  const link = read("components/ui/secondary-action-link.tsx");

  it("builds the secondary class on the existing buttonVariants outline (not a new component library)", () => {
    expect(link).toContain('buttonVariants({ variant: "outline" })');
    expect(link).toContain("min-h-10"); // ~40px touch target for page-level controls
    expect(link).toContain("export const secondaryActionClass");
    expect(link).toContain("export function SecondaryActionLink");
  });

  it("keeps the wrapper a real Next Link (native link semantics preserved)", () => {
    expect(link).toContain('from "next/link"');
    expect(link).toContain("<Link");
  });

  it("Assets tools row renders outlined secondary buttons, admin-gated, with the four hrefs intact", () => {
    const assets = read("app/(admin)/dashboard/assets/page.tsx");
    expect(assets).toContain('aria-label="Assets tools"');
    expect(assets).toContain("flex flex-wrap gap-2"); // clean 390px stacking, consistent gap
    expect(assets).toContain("{isAdmin ? (");
    for (const href of [
      "/dashboard/assets/import",
      "/dashboard/templates",
      "/dashboard/templates/return-inspections",
      "/dashboard/tag-requests",
    ]) {
      expect(assets).toContain(`<SecondaryActionLink href="${href}">`);
    }
  });

  it("download endpoints stay native <a> but adopt the shared secondary class (never SPA-route a file)", () => {
    const production = read("app/(platform)/owner/production/page.tsx");
    expect(production).toContain("<a href={sheetHref} className={secondaryActionClass}>");
    expect(production).toContain("<a href={csvHref} className={secondaryActionClass}>");
  });
});

describe("public scan typography — flattened in the shared component (Part D)", () => {
  const scanner = read("components/public/public-scanner-view.tsx");
  const quickStart = read("components/public/quick-start.tsx");

  it("flattens the oversized 18px bodies to 16px (text-base), not text-lg", () => {
    expect(scanner).not.toContain("text-lg");
    expect(quickStart).not.toContain("text-lg");
    expect(scanner).toContain("text-base");
    expect(quickStart).toContain("text-base");
  });

  it("keeps eyebrows at the 12px floor (text-xs, not the old 11px)", () => {
    expect(scanner).not.toContain("text-[11px]");
    expect(quickStart).not.toContain("text-[11px]");
    expect(quickStart).toContain("text-xs");
  });

  it("loads zero webfonts on the scan surface (system fonts only)", () => {
    expect(scanner).not.toContain("next/font");
  });

  it("preview and real page share the same component (parity is automatic)", () => {
    const preview = read("components/public/equipment-page-preview.tsx");
    const publicPage = read("components/public/public-equipment-page.tsx");
    expect(preview).toContain("PublicScannerView");
    expect(publicPage).toContain("PublicScannerView");
  });
});

describe("compact Mark returned & resolve (Part E)", () => {
  const status = read("lib/ui/status.ts");
  const button = read("components/mark-returned-resolve-button.tsx");

  it("keeps the long label on one line and offers a compact dense size", () => {
    expect(status).toContain("ACTION_BASE");
    expect(status).toContain("ACTION_BASE_DENSE");
    // both the default and dense bases pin the label to one line
    expect(status.match(/whitespace-nowrap/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(status).toContain("min-h-8"); // dense (compact) height
  });

  it("button exposes a dense prop, preserves label + pending + the RPC", () => {
    expect(button).toContain("dense = false");
    expect(button).toContain("Mark returned & resolve");
    expect(button).toContain("Marking returned…");
    expect(button).toContain("markReturnAndResolve");
    expect(button).toContain('submissionStatusActionClasses("resolved", dense)');
  });

  it("passes dense at the two dense sites (inbox row + attention queue), roomy at the detail header", () => {
    const inbox = read("app/(admin)/dashboard/submissions/page.tsx");
    const queue = read("components/dashboard/attention-queue.tsx");
    const detail = read("app/(admin)/dashboard/submissions/[submissionId]/page.tsx");
    expect(inbox).toMatch(/MarkReturnedResolveButton[\s\S]*?dense/);
    expect(queue).toMatch(/MarkReturnedResolveButton[\s\S]*?dense/);
    // the detail header renders it at default (roomy) size — never dense
    expect(detail).not.toMatch(/MarkReturnedResolveButton[\s\S]{0,200}dense/);
  });
});

describe("Mulemark naming (Part F/G/H)", () => {
  it("centralizes the product + platform name to Mulemark", () => {
    expect(PRODUCT_NAME).toBe("Mulemark");
    expect(PLATFORM_NAME).toBe("Mulemark");
  });

  it("the public footer uses the centralized platform name (Powered by Mulemark)", () => {
    const footer = read("components/public/public-footer.tsx");
    expect(footer).toContain("PLATFORM_NAME");
  });

  it("renames the signature chip to AssetCodeChip and drops the old file", () => {
    expect(existsSync(resolve(repo, "components/ui/asset-code-chip.tsx"))).toBe(true);
    expect(existsSync(resolve(repo, "components/ui/asset-tag-chip.tsx"))).toBe(false);
    expect(read("components/ui/asset-code-chip.tsx")).toContain("export function AssetCodeChip");
  });

  it("no current source file still names the AssetTag QR placeholder", () => {
    for (const rel of [
      "app/page.tsx",
      "lib/plans/usage.ts",
      "lib/team/actions.ts",
      "lib/qr/actions.ts",
      "lib/tags/actions.ts",
      "components/export-settings-form.tsx",
      "components/notification-settings-form.tsx",
      "app/(admin)/dashboard/settings/page.tsx",
      "app/(platform)/owner/production/page.tsx",
    ]) {
      expect(read(rel)).not.toContain("AssetTag QR");
    }
  });

  it("renames the package to mulemark", () => {
    const pkg = JSON.parse(read("package.json")) as { name: string };
    expect(pkg.name).toBe("mulemark");
  });
});
