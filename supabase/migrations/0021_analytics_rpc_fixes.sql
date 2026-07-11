-- 0021_analytics_rpc_fixes.sql — two correctness/security fixes on top of 0020.
--
-- FIX 1 (security): anon can still EXECUTE the analytics RPCs. Supabase's default
-- privileges grant EXECUTE **directly to the `anon` and `authenticated` roles** on new
-- functions in the public schema. 0020 only did `revoke ... from public`, which does not
-- touch a direct grant to `anon`, so `has_function_privilege('anon', ..., 'execute')`
-- stayed true. We now explicitly `revoke ... from anon` (and public) and re-grant to
-- authenticated for all four functions.
--
-- FIX 2 (correctness): analytics_asset_activity returned no rows to the app. It is a
-- RETURNS TABLE function, so its output columns (asset_id, scan_count, ...) are OUT
-- variables. Its aggregate subqueries referenced BARE `asset_id`, which collides with the
-- OUT variable of the same name; under plpgsql's default `variable_conflict = error` that
-- raises `column reference "asset_id" is ambiguous` at run time, so PostgREST returned an
-- error and the page fell back to an empty per-asset table. We re-create the function with
-- every subquery column reference table-qualified (se./fs.), removing the ambiguity. The
-- signature, return shape, tenant isolation, timezone, and count semantics are unchanged.
--
-- The other three 0020 functions are correct (they qualify refs / use ordinal GROUP BY)
-- and are left as-is. seed.sql is unchanged. APPLY: `supabase db push`.

-- ---------------------------------------------------------------------------
-- FIX 2 — re-create analytics_asset_activity with qualified subquery references.
-- Per non-archived asset: range scan/submission/damage/support/return counts, plus
-- ALL-TIME last_scanned_at and open_submission_count (unresolved = new + reviewed).
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
  v_tz text := coalesce(null, 'America/Vancouver'); -- future: org timezone column
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
    select se.asset_id, count(*) as scan_count
    from public.scan_events se
    where se.organization_id = v_org
      and se.scanned_at >= v_start_ts and se.scanned_at < v_end_ts
    group by se.asset_id
  ) rs on rs.asset_id = a.id
  left join (
    select se.asset_id, max(se.scanned_at) as last_scanned_at
    from public.scan_events se
    where se.organization_id = v_org
    group by se.asset_id
  ) ls on ls.asset_id = a.id
  left join (
    select fs.asset_id,
      count(*) as submission_count,
      count(*) filter (where fs.form_type = 'damage_report') as damage_count,
      count(*) filter (where fs.form_type = 'support_request') as support_count,
      count(*) filter (where fs.form_type = 'return_checklist') as return_count
    from public.form_submissions fs
    where fs.organization_id = v_org
      and fs.created_at >= v_start_ts and fs.created_at < v_end_ts
    group by fs.asset_id
  ) rsub on rsub.asset_id = a.id
  left join (
    select fs.asset_id, count(*) as open_count
    from public.form_submissions fs
    where fs.organization_id = v_org and fs.status in ('new', 'reviewed')
    group by fs.asset_id
  ) op on op.asset_id = a.id
  where a.organization_id = v_org
    and a.archived_at is null
  order by a.asset_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- FIX 1 — execute privileges: anon/public revoked; authenticated only.
-- ---------------------------------------------------------------------------
revoke execute on function public.analytics_daily_activity(integer)       from public, anon;
revoke execute on function public.analytics_scans_by_category(integer)    from public, anon;
revoke execute on function public.analytics_submission_breakdown(integer) from public, anon;
revoke execute on function public.analytics_asset_activity(integer)       from public, anon;

grant execute on function public.analytics_daily_activity(integer)       to authenticated;
grant execute on function public.analytics_scans_by_category(integer)    to authenticated;
grant execute on function public.analytics_submission_breakdown(integer) to authenticated;
grant execute on function public.analytics_asset_activity(integer)       to authenticated;
