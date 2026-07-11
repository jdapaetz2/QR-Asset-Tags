-- 0020_analytics_aggregation.sql — read-only, yard-local-day analytics aggregation.
--
-- WHY: the analytics page previously fetched raw scan_events / form_submissions rows
-- and bucketed them by UTC day in JavaScript. That (a) hit PostgREST's 1000-row cap
-- for busy orgs and (b) bucketed by the wrong day — the yard's real "today" is
-- America/Vancouver, so a scan at Vancouver-evening (= next UTC day) fell outside the
-- UTC window and vanished from the chart. These functions aggregate in Postgres using
-- yard-local day boundaries and return compact results the page renders directly.
--
-- TIMEZONE: no organizations.timezone column exists yet, so the yard timezone defaults
-- to America/Vancouver, written as coalesce(<future org tz>, 'America/Vancouver') so a
-- future column drops in without touching callers. A timezone settings UI is deferred.
--
-- SECURITY: SECURITY INVOKER (not DEFINER) — the functions run as the caller, so RLS on
-- scan_events / form_submissions stays in force and anon (which has no SELECT on those
-- tables) cannot read anything. Tenant isolation is explicit via
-- `organization_id = current_org_id()` (NULL for a platform owner / suspended org /
-- disabled profile → no rows), with RLS as the defense-in-depth backstop. search_path is
-- locked to public and every object is schema-qualified. No ip_hash / user_agent /
-- referrer is ever selected or returned. Execute is revoked from public and granted only
-- to authenticated. No service-role is used.
--
-- p_days is clamped to the allowed 7 / 30 / 90.
--
-- APPLY: `supabase db push`.

-- Supporting indexes for the org + time-range aggregation (the two hot paths).
create index if not exists scan_events_org_scanned_at_idx
  on public.scan_events (organization_id, scanned_at);
create index if not exists form_submissions_org_created_at_idx
  on public.form_submissions (organization_id, created_at);

-- ---------------------------------------------------------------------------
-- 1. Daily scans + new submissions, one row per yard-local day, zero-filled.
--    new_submission_count = submissions created that local day whose status is 'new'
--    (matches the "new submissions" headline + the submissions/day chart).
-- ---------------------------------------------------------------------------
create or replace function public.analytics_daily_activity(p_days integer)
returns table (day date, scan_count bigint, new_submission_count bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz text := coalesce(null, 'America/Vancouver'); -- future: org timezone column
  v_days integer := case when p_days in (7, 30, 90) then p_days else 7 end;
  v_today date := (now() at time zone v_tz)::date;
  v_start date := v_today - (v_days - 1);
  v_start_ts timestamptz := (v_start::timestamp) at time zone v_tz;
  v_end_ts timestamptz := ((v_today + 1)::timestamp) at time zone v_tz;
  v_org uuid := current_org_id();
begin
  return query
  with days as (
    select generate_series(v_start, v_today, interval '1 day')::date as day
  ),
  s as (
    select (scanned_at at time zone v_tz)::date as day, count(*) as c
    from public.scan_events
    where organization_id = v_org
      and scanned_at >= v_start_ts and scanned_at < v_end_ts
    group by 1
  ),
  n as (
    select (created_at at time zone v_tz)::date as day, count(*) as c
    from public.form_submissions
    where organization_id = v_org and status = 'new'
      and created_at >= v_start_ts and created_at < v_end_ts
    group by 1
  )
  select d.day, coalesce(s.c, 0)::bigint, coalesce(n.c, 0)::bigint
  from days d
  left join s on s.day = d.day
  left join n on n.day = d.day
  order by d.day;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Scans by asset category over the range (Uncategorized fallback), desc.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_scans_by_category(p_days integer)
returns table (category text, scan_count bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz text := coalesce(null, 'America/Vancouver');
  v_days integer := case when p_days in (7, 30, 90) then p_days else 7 end;
  v_today date := (now() at time zone v_tz)::date;
  v_start_ts timestamptz := ((v_today - (v_days - 1))::timestamp) at time zone v_tz;
  v_end_ts timestamptz := ((v_today + 1)::timestamp) at time zone v_tz;
  v_org uuid := current_org_id();
begin
  return query
  select coalesce(nullif(btrim(a.category), ''), 'Uncategorized') as category,
         count(*)::bigint
  from public.scan_events se
  join public.assets a on a.id = se.asset_id
  where se.organization_id = v_org
    and se.scanned_at >= v_start_ts and se.scanned_at < v_end_ts
  group by 1
  order by 2 desc, 1 asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Submission breakdown over the range — status counts + form_type counts.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_submission_breakdown(p_days integer)
returns table (breakdown_type text, key text, count bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz text := coalesce(null, 'America/Vancouver');
  v_days integer := case when p_days in (7, 30, 90) then p_days else 7 end;
  v_today date := (now() at time zone v_tz)::date;
  v_start_ts timestamptz := ((v_today - (v_days - 1))::timestamp) at time zone v_tz;
  v_end_ts timestamptz := ((v_today + 1)::timestamp) at time zone v_tz;
  v_org uuid := current_org_id();
begin
  return query
    select 'status'::text, fs.status, count(*)::bigint
    from public.form_submissions fs
    where fs.organization_id = v_org
      and fs.created_at >= v_start_ts and fs.created_at < v_end_ts
    group by fs.status
  union all
    select 'form_type'::text, fs.form_type, count(*)::bigint
    from public.form_submissions fs
    where fs.organization_id = v_org
      and fs.created_at >= v_start_ts and fs.created_at < v_end_ts
    group by fs.form_type;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Per non-archived asset: range-scoped scan/submission/damage/support/return,
--    plus ALL-TIME last_scanned_at (genuine most-recent scan) and
--    open_submission_count (current unresolved = new+reviewed — operational backlog).
--    Readiness stays app-derived (needs qr/page joins), so it is not returned here.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_asset_activity(p_days integer)
returns table (
  asset_id uuid,
  asset_code text,
  asset_name text,
  category text,
  scan_count bigint,
  last_scanned_at timestamptz,
  submission_count bigint,
  open_submission_count bigint,
  damage_count bigint,
  support_count bigint,
  return_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz text := coalesce(null, 'America/Vancouver');
  v_days integer := case when p_days in (7, 30, 90) then p_days else 7 end;
  v_today date := (now() at time zone v_tz)::date;
  v_start_ts timestamptz := ((v_today - (v_days - 1))::timestamp) at time zone v_tz;
  v_end_ts timestamptz := ((v_today + 1)::timestamp) at time zone v_tz;
  v_org uuid := current_org_id();
begin
  return query
  select
    a.id,
    a.asset_code,
    a.asset_name,
    a.category,
    coalesce(rs.scan_count, 0)::bigint,
    ls.last_scanned_at,
    coalesce(rsub.submission_count, 0)::bigint,
    coalesce(op.open_count, 0)::bigint,
    coalesce(rsub.damage_count, 0)::bigint,
    coalesce(rsub.support_count, 0)::bigint,
    coalesce(rsub.return_count, 0)::bigint
  from public.assets a
  left join (
    select asset_id, count(*) as scan_count
    from public.scan_events
    where organization_id = v_org
      and scanned_at >= v_start_ts and scanned_at < v_end_ts
    group by asset_id
  ) rs on rs.asset_id = a.id
  left join (
    select asset_id, max(scanned_at) as last_scanned_at
    from public.scan_events
    where organization_id = v_org
    group by asset_id
  ) ls on ls.asset_id = a.id
  left join (
    select asset_id,
      count(*) as submission_count,
      count(*) filter (where form_type = 'damage_report') as damage_count,
      count(*) filter (where form_type = 'support_request') as support_count,
      count(*) filter (where form_type = 'return_checklist') as return_count
    from public.form_submissions
    where organization_id = v_org
      and created_at >= v_start_ts and created_at < v_end_ts
    group by asset_id
  ) rsub on rsub.asset_id = a.id
  left join (
    select asset_id, count(*) as open_count
    from public.form_submissions
    where organization_id = v_org and status in ('new', 'reviewed')
    group by asset_id
  ) op on op.asset_id = a.id
  where a.organization_id = v_org
    and a.archived_at is null
  order by a.asset_code;
end;
$$;

-- Execute: authenticated only; anon/public cannot run the analytics functions.
revoke execute on function public.analytics_daily_activity(integer) from public;
revoke execute on function public.analytics_scans_by_category(integer) from public;
revoke execute on function public.analytics_submission_breakdown(integer) from public;
revoke execute on function public.analytics_asset_activity(integer) from public;

grant execute on function public.analytics_daily_activity(integer) to authenticated;
grant execute on function public.analytics_scans_by_category(integer) to authenticated;
grant execute on function public.analytics_submission_breakdown(integer) to authenticated;
grant execute on function public.analytics_asset_activity(integer) to authenticated;
