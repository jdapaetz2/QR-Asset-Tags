import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { getStackConfig } from "./setup/stack";
import { ORG_A, ORG_B } from "./setup/fixtures";

// Executed migration + catalog proof (Phase A3.2, Part G). The db:reset chained ahead of the suite
// applies 0001→latest to a fresh database; here we connect as postgres and assert the resulting
// objects actually exist and carry the expected grants — the supersession chains resolved, the
// A3.1 role objects are present, and every privileged RPC's anon execute is revoked.

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: getStackConfig().dbUrl });
  await db.connect();
});

afterAll(async () => {
  await db.end();
});

describe("migration application", () => {
  it("applied every migration 0001..latest in a contiguous sequence", async () => {
    const { rows } = await db.query<{ version: string }>(
      "select version from supabase_migrations.schema_migrations order by version"
    );
    const versions = rows.map((r) => r.version);
    expect(versions).toContain("0001");
    expect(versions).toContain("0032");
    const numeric = versions.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
    const highest = Math.max(...numeric);
    for (let i = 1; i <= highest; i++) {
      expect(numeric, `migration ${String(i).padStart(4, "0")} missing`).toContain(i);
    }
  });
});

describe("A3.1/A3.2 objects exist with the expected definitions", () => {
  async function fnExists(name: string): Promise<boolean> {
    const { rows } = await db.query(
      "select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname=$1",
      [name]
    );
    return rows.length > 0;
  }

  it("the role helpers and protective trigger function exist (migration 0032)", async () => {
    for (const fn of ["current_profile_role", "is_current_org_admin", "protect_profile_privileged_fields"]) {
      expect(await fnExists(fn), `function ${fn} should exist`).toBe(true);
    }
  });

  it("the superseded helpers resolve to their latest definition (status-aware)", async () => {
    // current_org_id (0018→0019) must reference organizations (the suspended-org join). is_platform_owner
    // (0018) must be status-aware. Reading prosrc proves the final applied body won, not an earlier one.
    const { rows } = await db.query<{ proname: string; prosrc: string }>(
      "select proname, prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('current_org_id','is_platform_owner')"
    );
    const src = Object.fromEntries(rows.map((r) => [r.proname, r.prosrc]));
    expect(src.current_org_id, "current_org_id should join organizations (0019)").toContain("organizations");
    expect(src.current_org_id).toContain("status");
    expect(src.is_platform_owner, "is_platform_owner should be status-aware (0018)").toContain("status");
  });

  it("the profiles privileged-field trigger is installed", async () => {
    const { rows } = await db.query(
      "select 1 from pg_trigger where tgname = 'profiles_protect_privileged_fields' and not tgisinternal"
    );
    expect(rows.length, "trigger profiles_protect_privileged_fields should exist").toBe(1);
  });
});

describe("D3A notification routing columns (migration 0034)", () => {
  const ROUTING_COLUMNS = [
    "notify_urgent_reports",
    "urgent_notification_email",
    "return_notification_mode",
    "notify_include_photo_previews",
  ];

  it("adds the columns with the approved defaults and keeps the legacy boolean", async () => {
    const { rows } = await db.query<{ column_name: string; column_default: string | null; is_nullable: string }>(
      "select column_name, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='organizations' and column_name = any($1)",
      [[...ROUTING_COLUMNS, "notify_return_checklists"]]
    );
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    expect(byName.notify_urgent_reports).toMatchObject({ column_default: "false", is_nullable: "NO" });
    expect(byName.urgent_notification_email).toMatchObject({ column_default: null, is_nullable: "YES" });
    expect(byName.return_notification_mode?.column_default).toContain("'off'");
    expect(byName.return_notification_mode?.is_nullable).toBe("NO");
    expect(byName.notify_include_photo_previews).toMatchObject({ column_default: "true", is_nullable: "NO" });
    expect(byName.notify_return_checklists, "legacy column must not be dropped in 0034").toBeDefined();
  });

  it("a new organization gets returns off, previews on and the urgent route disabled", async () => {
    await db.query("begin");
    try {
      const { rows } = await db.query<Record<string, unknown>>(
        "insert into public.organizations (name, slug) values ('D3A defaults probe', 'd3a-defaults-probe') returning notify_urgent_reports, urgent_notification_email, return_notification_mode, notify_include_photo_previews"
      );
      expect(rows[0]).toEqual({
        notify_urgent_reports: false,
        urgent_notification_email: null,
        return_notification_mode: "off",
        notify_include_photo_previews: true,
      });
    } finally {
      await db.query("rollback");
    }
  });

  it("the CHECK constraints reject an unknown mode and an urgent route without an address", async () => {
    for (const statement of [
      "update public.organizations set return_notification_mode = 'weekly' where id = $1",
      "update public.organizations set notify_urgent_reports = true, urgent_notification_email = null where id = $1",
      "update public.organizations set notify_urgent_reports = true, urgent_notification_email = '   ' where id = $1",
    ]) {
      await expect(db.query(statement, [ORG_A]), statement).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("maps existing return settings exactly: true → instant_renter, false → off (the migration's own statement)", async () => {
    const migration = readFileSync(
      fileURLToPath(new URL("../../supabase/migrations/0034_notification_routing.sql", import.meta.url)),
      "utf8"
    );
    const begin = migration.indexOf("-- backfill:begin");
    const end = migration.indexOf("-- backfill:end");
    expect(begin, "backfill markers").toBeGreaterThan(-1);
    const backfill = migration.slice(begin + "-- backfill:begin".length, end).trim();
    expect(backfill).toMatch(/^update public\.organizations/);

    await db.query("begin");
    try {
      // Start each org in the opposite mode so only the backfill can produce the expected value.
      await db.query(
        "update public.organizations set notify_return_checklists = true, return_notification_mode = 'off' where id = $1",
        [ORG_A]
      );
      await db.query(
        "update public.organizations set notify_return_checklists = false, return_notification_mode = 'instant_renter' where id = $1",
        [ORG_B]
      );
      await db.query(backfill);
      const { rows } = await db.query<{ id: string; return_notification_mode: string }>(
        "select id, return_notification_mode from public.organizations where id = any($1)",
        [[ORG_A, ORG_B]]
      );
      const modes = Object.fromEntries(rows.map((r) => [r.id, r.return_notification_mode]));
      expect(modes[ORG_A]).toBe("instant_renter");
      expect(modes[ORG_B]).toBe("off");
    } finally {
      await db.query("rollback");
    }
  });

  it("no column grant change was needed: anon cannot read them, authenticated keeps table privileges", async () => {
    for (const column of ROUTING_COLUMNS) {
      const { rows } = await db.query<{ anon_select: boolean; auth_update: boolean }>(
        "select has_column_privilege('anon', 'public.organizations', $1, 'SELECT') as anon_select, has_column_privilege('authenticated', 'public.organizations', $1, 'UPDATE') as auth_update",
        [column]
      );
      expect(rows[0].anon_select, `anon SELECT on ${column}`).toBe(false);
      expect(rows[0].auth_update, `authenticated UPDATE on ${column} (policy-gated)`).toBe(true);
    }
  });
});

describe("RPC execute grants (defense in depth)", () => {
  async function anonMayExecute(signature: string): Promise<boolean> {
    const { rows } = await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', $1::regprocedure, 'EXECUTE') as ok",
      [signature]
    );
    return rows[0].ok;
  }

  it("anon execute is REVOKED on every privileged RPC", async () => {
    for (const sig of [
      "public.mark_return_and_resolve(uuid)",
      "public.set_qr_production_primary(uuid)",
      "public.analytics_daily_activity(integer)",
      "public.analytics_scans_by_category(integer)",
      "public.analytics_submission_breakdown(integer)",
      "public.analytics_asset_activity(integer)",
    ]) {
      expect(await anonMayExecute(sig), `anon must NOT execute ${sig}`).toBe(false);
    }
  });

  it("anon execute is GRANTED only on the public return-template resolver", async () => {
    expect(await anonMayExecute("public.get_asset_return_template(uuid)"), "anon should execute get_asset_return_template").toBe(true);
  });

  it("the Phase A4 rate limiter is service_role only (not anon/authenticated)", async () => {
    async function mayExecute(role: string, sig: string): Promise<boolean> {
      const { rows } = await db.query<{ ok: boolean }>(
        "select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as ok",
        [role, sig]
      );
      return rows[0].ok;
    }
    for (const sig of ["public.rate_limit_touch(text, jsonb)", "public.rate_limit_gc()"]) {
      expect(await mayExecute("anon", sig), `anon must NOT execute ${sig}`).toBe(false);
      expect(await mayExecute("authenticated", sig), `authenticated must NOT execute ${sig}`).toBe(false);
      expect(await mayExecute("service_role", sig), `service_role must execute ${sig}`).toBe(true);
    }
    // The counter table itself is not readable by anon/authenticated.
    const { rows } = await db.query<{ anon: boolean; authd: boolean }>(
      "select has_table_privilege('anon','public.rate_limit_counters','SELECT') as anon, " +
        "has_table_privilege('authenticated','public.rate_limit_counters','SELECT') as authd"
    );
    expect(rows[0].anon, "anon must not read rate_limit_counters").toBe(false);
    expect(rows[0].authd, "authenticated must not read rate_limit_counters").toBe(false);
  });
});
