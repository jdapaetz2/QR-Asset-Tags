import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { getStackConfig } from "./setup/stack";

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
});
