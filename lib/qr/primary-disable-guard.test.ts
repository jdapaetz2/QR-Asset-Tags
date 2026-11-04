import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Engineering Phase E2C — only the platform owner can take a printed (production-primary) QR link out of service.
// Structural checks of migration 0040 and the app paths; the persona behaviour runs in test:security.

const repo = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(repo, file), "utf8");

describe("migration 0040 (production-primary disable guard)", () => {
  const sql = read("supabase/migrations/0040_qr_primary_disable_guard.sql");

  it("recreates the existing governance function, without a new trigger, table or column", () => {
    expect(sql).toMatch(/create or replace function public\.protect_qr_governance\(\)/);
    expect(sql).toMatch(/security definer/);
    expect(sql).not.toMatch(/create trigger|drop trigger|alter table|create table/i);
  });

  it("raises for a signed-in non-owner taking an active primary link out of active, and keeps the 0023 coercions", () => {
    expect(sql).toMatch(/if not public\.is_platform_owner\(\) then/);
    expect(sql).toMatch(/auth\.uid\(\) is not null\s+and old\.is_production_primary\s+and old\.status = 'active'\s+and new\.status is distinct from 'active'/);
    expect(sql).toMatch(/raise exception 'qr_primary_disable_forbidden:[^']*'\s+using errcode = '42501'/);
    expect(sql).toMatch(/new\.is_production_primary := false;\s+new\.supersedes_qr_link_id := null;/);
    expect(sql).toMatch(/new\.is_production_primary := old\.is_production_primary;\s+new\.supersedes_qr_link_id := old\.supersedes_qr_link_id;/);
  });
});

describe("the app paths", () => {
  it("setQrLinkStatus refuses a non-owner before the update and explains the database refusal too", () => {
    const actions = read("lib/qr/actions.ts");
    expect(actions).toMatch(/status !== "active" && profile\.role !== ROLES\.PLATFORM_OWNER/);
    expect(actions).toMatch(/link\?\.status === "active" && link\.is_production_primary/);
    expect(actions).toMatch(/error\.code === "42501" \|\| error\.message\?\.includes\("qr_primary_disable_forbidden"\)/);
  });

  it("the asset page reads the primary flag and offers no Deactivate button for the printed link", () => {
    expect(read("app/(admin)/dashboard/assets/[assetId]/page.tsx")).toMatch(/is_production_primary/);
    const section = read("components/qr-link-section.tsx");
    expect(section).toMatch(/link\.status === "active" && link\.is_production_primary \?/);
    expect(section).toMatch(/can&apos;t be deactivated here/);
  });
});
