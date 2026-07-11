# Analytics Closeout — Database Aggregation & Chart Grammar (G.2B)

Closeout record for the customer analytics work on the `pilot-credibility` branch. Pair with
[DATA_MODEL.md](DATA_MODEL.md) ("Analytics aggregation RPCs"), [CODE_HANDOFF.md](CODE_HANDOFF.md),
and the chart grammar in [brand/ui-language.md](brand/ui-language.md) /
[brand/analytics-reference.html](brand/analytics-reference.html).

Analytics reached this closeout through five steps:

1. Finalized visual redesign to match `analytics-reference.html` — `3017980`.
2. Database-side local-day aggregation (migration `0020`) — `9a1d890`.
3. RPC grant + chart mapping/rendering fix (migration `0021`) — `149e17e`.
4. Range-bucket / scan-aggregation correctness — `d1b3d90`.
5. 90-day sparse-history chart density + activity-start note — `88496e3`.

This review verifies that work and closes it. **No defects were found; no code, migration, or doc
fixes were required.** The only artifact is this record.

## Goals — status

| # | Goal | Status |
| --- | --- | --- |
| 1 | Database-side aggregation is correct | ✅ Page consumes 4 read-only RPCs; no raw-row charting |
| 2 | Local-day America/Vancouver buckets | ✅ `coalesce(<future org tz>, 'America/Vancouver')` in every function |
| 3 | 7 / 30 / 90 ranges render clearly | ✅ Zero-filled buckets + `chartDensity` spacing + sparse-history note |
| 4 | Chart grammar intact | ✅ Muted history, one brass current bar, 2px stubs, mono ticks |
| 5 | RPC grants safe | ✅ `revoke … from public, anon` + `grant … to authenticated` (0021) |
| 6 | No raw private data exposed | ✅ No ip_hash / user_agent / referrer; tenant-scoped; no service-role |
| 7 | `/t` scan routes untouched | ✅ No analytics imports; no chip/primary-button/webfonts added |
| 8 | Docs match implementation | ✅ DATA_MODEL + CODE_HANDOFF accurate; no edits needed |

## Acceptance checks

1. **RPCs read-only & tenant-scoped** — ✅ All four (`analytics_daily_activity`,
   `analytics_scans_by_category`, `analytics_submission_breakdown`, `analytics_asset_activity`) are
   `language plpgsql stable security invoker set search_path = public`, filter
   `organization_id = current_org_id()`, and contain no `insert`/`update`/`delete`.
2. **Public/anon cannot execute** — ✅ `0021` `revoke execute … from public, anon` for all four
   (0020's revoke-from-public alone left Supabase's default direct `anon` grant in place). Operator
   SQL check below.
3. **No service-role in customer analytics** — ✅ The page uses the RLS `lib/supabase/server.ts`
   client (anon key + caller session → `authenticated` role). `admin.ts` is never imported here.
4. **No raw IP / user_agent / referrer returned** — ✅ Those columns are never selected (they
   appear only in SQL comments).
5. **Daily activity returns complete buckets** — ✅ `generate_series(v_start, v_today, '1 day')`
   yields exactly `p_days` rows, zero-filled and ascending.
6. **7-day chart** — ✅ 7 buckets, `gap-1.5` spacing.
7. **30-day chart** — ✅ 30 buckets, `gap-1` spacing.
8. **90-day chart with sparse history** — ✅ 90 buckets, `gap-px` spacing; leading zero-days render
   as 2px stubs; recent bars visible; `dataStartNote` shows "Activity begins <Mon D>." only when the
   range starts before first activity.
9. **RangeControl drives the page** — ✅ `?range` → `parseRange` → `p_days` on all four RPCs; band
   stamp derived from the RPC's local days; `?sort` → `sortAssetRows`.
10. **Chart totals match DB/bucket totals** — ✅ Header + band headline both sum the same
    `toDailySeries(daily)` buckets; `chartMax` normalizes to the busiest day, never the total.
11. **No raw UTC visible** — ✅ Band "Updated" via `RelativeTime`; tick/stamp labels parse the
    `YYYY-MM-DD` string without `Date`/timezone conversion.
12. **Needs-attention absent from analytics** — ✅ Triage lives on the dashboard; the analytics page
    has no needs-attention module.
13. **Lifetime stat cards removed** — ✅ Totals live only in chart headers; no lifetime stat cards.
14. **Problem assets consolidated** — ✅ One ranked module via `rankProblemAssets` (open backlog,
    then submissions), not per-metric "most X" lists.
15. **Per-asset activity populated** — ✅ `analytics_asset_activity` returns one row per non-archived
    asset (0021 fixed the OUT-parameter/column ambiguity that had emptied it).
16. **No seed.sql changes** — ✅ Unchanged.
17. **No scan-page changes** — ✅ `/t/**` untouched.
18. **No new dependencies** — ✅ None added.
19. **No unnecessary migration** — ✅ Only `0020` (aggregation) and `0021` (security/correctness
    fix); this closeout adds none.
20. **lint / typecheck / tests / build pass** — ✅ Green at this closeout (see branch history).

## Count semantics (honest labels, unchanged)

Charts, category, submission breakdown, and per-asset scan/submission counts are **range-scoped**.
`last_scanned_at` and `open_submission_count` (unresolved = new + reviewed) are **all-time** and are
labeled as current-open, not range. The analytics "New" headline is range-scoped and is intentionally
distinct from the all-time nav badge — no faked equality between differently-defined metrics.

## Operator manual verification (live env — Supabase migrations applied)

The following need a live database and a browser and cannot be checked from the repo:

- [ ] `npx supabase db push` has applied `0020` + `0021`.
- [ ] **Grant check** — `anon` false, `authenticated` true:
  ```sql
  select proname,
         has_function_privilege('anon', oid,'execute')          as anon_can,
         has_function_privilege('authenticated', oid,'execute')  as auth_can
  from pg_proc where proname like 'analytics\_%';
  ```
- [ ] `select count(*) from analytics_daily_activity(7);` / `(30)` / `(90)` → 7 / 30 / 90 rows.
- [ ] `select sum(scan_count) from analytics_daily_activity(90);` equals the true 90-day total
      (not capped at 1000).
- [ ] Vancouver-local today lands in today's bucket — the last daily row's `scan_count` equals
      `count(*)` of `scan_events` where
      `(scanned_at at time zone 'America/Vancouver')::date = (now() at time zone 'America/Vancouver')::date`.
- [ ] `select * from analytics_asset_activity(7);` runs with **no** "column reference … ambiguous"
      error (returns 0 rows in the SQL editor where `current_org_id()` is null — that alone proves
      the 0021 fix).
- [ ] `/dashboard/analytics` at 7 / 30 / 90: bars visible, exactly one brass current bar, zero-days
      as stubs, header == band headline, "Activity begins…" note only when useful; category /
      submissions / problem-assets / per-asset modules populated; Review links land on filtered
      submissions; sort + Refresh work; no request loops in the terminal.
- [ ] `/t/demo-ex017` still renders on mobile and a support form submits.

## Deferred (not in this pass)

- **Org timezone column + settings UI** — buckets default to `America/Vancouver` via
  `coalesce(<future org tz>, 'America/Vancouver')`; a real `organizations.timezone` column drops in
  without touching callers.
- **Weekly/monthly rollups** and any further analytics modules — deferred; daily buckets only.

## Verdict

**Analytics aggregation is ready to close.** Aggregation is database-side and local-day-correct,
RPCs are read-only / tenant-scoped / INVOKER with anon execution revoked, no private columns are
exposed, the chart grammar matches the reference across 7/30/90, docs are accurate, and the `/t`
scan-page contract is intact. Remaining items are live-environment verifications for the operator,
listed above. Future analytics refinements are deferred.
