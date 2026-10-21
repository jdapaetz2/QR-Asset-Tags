#!/usr/bin/env node
/**
 * Engineering Phase E2B — read-only checks of the showcase on STAGING after the apply.
 *
 *   npm.cmd run phase-e:showcase:check:staging
 *
 * 1. Database, in a READ ONLY transaction through the guarded staging URL (scripts/lib/showcase-target.mjs): every
 *    dataset row is present, one rental at a time per asset, the four pointers agree with the dataset, the open items are
 *    3 new and 2 reviewed, outbound and staff-return stamps sit seconds before their session opened or closed, no staff
 *    profile id is set, and the four showcase QR rows are active production-primary rows.
 * 2. Routes: the staging Preview is proven to read staging (the isolation probe), then the four codes are fetched on the
 *    scan-free `/nojs/t/` render (no scan row is written anywhere) and must resolve to their asset. Response bodies are
 *    inspected in memory only, never printed or saved (a page can carry signed document URLs).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { assertTarget } from "../lib/env-target.mjs";
import { DATASET_FILE } from "../lib/showcase-dataset.mjs";
import { STAGING_REF, assertStagingDatabase, stagingDbConfig } from "../lib/showcase-target.mjs";
import { assertStagingBackend, publicRouteVerdict } from "../lib/staging-probe.mjs";
import { bypassHeaders, hasBypass } from "../smoke/lib/runner.mjs";

const TAG = "[showcase-check]";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NORTHRIDGE = "11111111-1111-4111-8111-111111111111";

function refuse(message) {
  console.error(`\n${TAG} REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(1);
}

async function main() {
  try {
    assertTarget("staging", { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", expectedStagingRef: STAGING_REF });
  } catch (err) {
    refuse(err.message);
  }
  let config;
  try {
    config = stagingDbConfig(process.env);
  } catch (err) {
    refuse(err.message);
  }
  const dataset = JSON.parse(readFileSync(path.join(REPO, DATASET_FILE), "utf8"));
  const { describe, ...pgConfig } = config;
  const client = new pg.Client({ ...pgConfig, statement_timeout: 60_000 });
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok, detail });
  try {
    await client.connect();
    await assertStagingDatabase(client);
    await client.query("begin read only");
    await client.query("set local timezone = 'UTC'");
    const n = async (sql, params = []) => Number((await client.query(sql, params)).rows[0].n);
    for (const [table, rows] of Object.entries(dataset.rows)) {
      const present = await n(`select count(*)::int as n from public."${table}" where organization_id = $1 and id = any($2::uuid[])`, [NORTHRIDGE, rows.map((r) => r.id)]);
      check(`${table}: every dataset row present`, present === rows.length, `${present} of ${rows.length}`);
    }
    check(
      "one rental at a time per asset",
      (await n(`select count(*)::int as n from public.asset_rental_sessions a join public.asset_rental_sessions b on a.asset_id = b.asset_id and a.id < b.id and tstzrange(a.started_at, coalesce(a.returned_at, 'infinity')) && tstzrange(b.started_at, coalesce(b.returned_at, 'infinity')) where a.organization_id = $1`, [NORTHRIDGE])) === 0
    );
    let pointers = 0;
    for (const a of dataset.assets) {
      const row = (await client.query(`select active_rental_session_id from public.assets where id = $1 and organization_id = $2`, [a.asset_id, NORTHRIDGE])).rows[0];
      if (row && row.active_rental_session_id === a.active_rental_session_id) pointers++;
    }
    check("the four rental pointers agree with the dataset", pointers === dataset.assets.length, `${pointers} of ${dataset.assets.length}`);
    const ids = dataset.rows.form_submissions.map((r) => r.id);
    const open = Object.fromEntries((await client.query(`select status, count(*)::int as n from public.form_submissions where id = any($1::uuid[]) and status in ('new', 'reviewed') group by status`, [ids])).rows.map((r) => [r.status, r.n]));
    check("open dataset items: 3 new, 2 reviewed", open.new === 3 && open.reviewed === 2, JSON.stringify(open));
    check(
      "outbound and staff-return stamps sit seconds before their session opened or closed",
      (await n(
        `select count(*)::int as n from public.form_submissions f join public.asset_rental_sessions s on s.id = f.rental_session_id
          where f.id = any($1::uuid[]) and ((f.form_type = 'pre_use_inspection' and not (f.created_at <= s.started_at and s.started_at - f.created_at < interval '30 seconds'))
             or (f.form_type = 'return_checklist' and f.submission_origin = 'staff' and not (f.created_at <= s.returned_at and s.returned_at - f.created_at < interval '30 seconds')))`,
        [ids]
      )) === 0
    );
    check("no staff profile id on any dataset row", (await n(`select count(*)::int as n from public.form_submissions where id = any($1::uuid[]) and submitted_by_profile_id is not null`, [ids])) === 0);
    check(
      "the four showcase QR rows are active production-primary rows",
      (await n(`select count(*)::int as n from public.qr_links where id = any($1::uuid[]) and status = 'active' and is_production_primary`, [dataset.assets.map((a) => a.qr_link_id)])) === dataset.assets.length
    );
    await client.query("rollback");
  } catch (err) {
    check("database checks ran", false, String(err.code ?? err.message).slice(0, 200));
  } finally {
    await client.end().catch(() => {});
  }

  const base = String(process.env.QA_BASE_URL || process.env.STAGING_BASE_URL || "").replace(/\/+$/, "");
  if (!base) check("staging Preview URL configured (QA_BASE_URL)", false);
  else {
    try {
      await assertStagingBackend({ baseUrl: base, headers: bypassHeaders() });
      check("the Preview reads the staging database (isolation probe)", true);
      for (const a of dataset.assets) {
        const res = await fetch(`${base}/nojs/t/${a.short_code}`, { headers: bypassHeaders(), redirect: "manual" });
        const verdict = publicRouteVerdict({ status: res.status, body: await res.text(), assetCode: a.asset_code });
        check(`/nojs/t/${a.short_code} (scan-free) resolves to ${a.asset_code}`, verdict.ok, verdict.reason);
      }
    } catch (err) {
      check("the Preview reads the staging database (isolation probe)", false, String(err.message).slice(0, 200));
    }
  }

  console.log(`\n${TAG} STAGING (database: ${describe}; Preview bypass ${hasBypass() ? "configured" : "not configured"})`);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`  ${failed === 0 ? "all checks passed" : `${failed} check(s) failed`}\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`\n${TAG} FAILED: ${String(err?.message ?? err).split("\n")[0].slice(0, 300)}\n`);
  process.exitCode = 1;
});
