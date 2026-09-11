-- 0035_tag_request_internal_columns.sql — keep owner-internal tag request data out of customer reach.
--
-- WHY (found during the Engineering Phase D3A audit, verified by executed tests before this migration):
--   1. READ. `production_notes` is marked INTERNAL (0010) and 0011 says customers "never see these columns
--      (queries don't select them)". That was an app convention, not a database guarantee: 0010 granted SELECT on
--      every column to `authenticated` and the select policy is organization-scoped, so any customer admin or staff
--      member could read `production_notes`, `platform_viewed_at` and `platform_viewed_by_profile_id` for their own
--      organization's requests through the API with their own session.
--   2. INSERT. The insert policy (0032) checks only organization + admin, so a customer admin inserting directly could
--      create a request already `delivered`, with production notes, delivery/completion dates, viewed markers, or a
--      colleague recorded as the requester.
--
-- WHAT (additive; no policy is dropped or changed):
--   * Column-level SELECT for `authenticated` on every column EXCEPT the three internal ones (the same technique as
--     the organizations anon grant in 0001). INSERT/UPDATE/DELETE privileges and all RLS policies are unchanged.
--     A column added to tag_requests later is NOT readable by customers until it is added to this grant.
--   * protect_tag_request_insert(): BEFORE INSERT, coerces owner-controlled columns for every caller except the
--     platform owner and trusted server contexts (auth.uid() is null: seed, service role) — the carve-outs of 0032's
--     profile trigger. Coerces rather than raises, so the customer create flow is unaffected.
--   * owner_tag_request_internal() / mark_tag_request_viewed(): SECURITY DEFINER, owner-only. The platform owner uses
--     the same `authenticated` role as customers, so the owner console reads and marks the internal fields through
--     these instead of the table. Any other caller gets no rows / false. Execute is revoked from anon.
--
-- APPLY: prove the linked project, `supabase migration list`, `supabase db push --dry-run`, then stop for operator
-- approval; manual Production dump first (Free plan, no backups).

-- ---------------------------------------------------------------------------
-- 1. Column-level SELECT
-- ---------------------------------------------------------------------------

-- Order matters: REVOKE of a table privilege also removes that privilege's column-level grants, so the revoke must
-- come first and the column grant after. The block between the markers is re-applied verbatim by the local test
-- harness (tests/security/setup/grants.ts), which restores hosted default privileges after migrations.
-- local-parity:begin
revoke select on public.tag_requests from authenticated;
grant select (
  id,
  organization_id,
  requested_by_profile_id,
  status,
  material,
  mounting_method,
  tag_size,
  quantity_notes,
  created_at,
  updated_at,
  delivered_at,
  completed_at
) on public.tag_requests to authenticated;
-- local-parity:end

-- ---------------------------------------------------------------------------
-- 2. Insert protection
-- ---------------------------------------------------------------------------

create or replace function public.protect_tag_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Platform owner: full authority. auth.uid() is null: trusted server context (seed, service role).
  if public.is_platform_owner() or auth.uid() is null then
    return new;
  end if;

  new.status := 'requested';
  new.production_notes := null;
  new.delivered_at := null;
  new.completed_at := null;
  new.platform_viewed_at := null;
  new.platform_viewed_by_profile_id := null;
  -- The requester is always the caller, never a value supplied by the client.
  new.requested_by_profile_id := (
    select p.id from public.profiles p where p.auth_user_id = auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists tag_requests_protect_insert on public.tag_requests;
create trigger tag_requests_protect_insert
  before insert on public.tag_requests
  for each row execute function public.protect_tag_request_insert();

-- ---------------------------------------------------------------------------
-- 3. Owner-only access to the internal fields
-- ---------------------------------------------------------------------------

create or replace function public.owner_tag_request_internal(p_tag_request_id uuid default null)
returns table (
  id uuid,
  organization_id uuid,
  production_notes text,
  platform_viewed_at timestamptz,
  platform_viewed_by_profile_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.organization_id, r.production_notes, r.platform_viewed_at, r.platform_viewed_by_profile_id
  from public.tag_requests r
  where public.is_platform_owner()
    and (p_tag_request_id is null or r.id = p_tag_request_id)
  order by r.created_at desc;
$$;

comment on function public.owner_tag_request_internal(uuid) is
  'Platform-owner-only read of tag request internal fields (production notes, viewed markers). Any other caller '
  'receives no rows. Customers cannot select these columns directly (migration 0035).';

create or replace function public.mark_tag_request_viewed(p_tag_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_updated integer;
begin
  if not public.is_platform_owner() then
    return false;
  end if;

  select p.id into v_profile_id from public.profiles p where p.auth_user_id = auth.uid();

  -- Only ever set once, and never touches status.
  update public.tag_requests
     set platform_viewed_at = now(),
         platform_viewed_by_profile_id = v_profile_id
   where id = p_tag_request_id
     and platform_viewed_at is null;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

comment on function public.mark_tag_request_viewed(uuid) is
  'Platform-owner-only: marks a tag request viewed the first time the owner opens it. Returns true when it set the '
  'marker, false when already viewed or the caller is not the platform owner.';

revoke execute on function public.owner_tag_request_internal(uuid) from public, anon;
grant execute on function public.owner_tag_request_internal(uuid) to authenticated;
revoke execute on function public.mark_tag_request_viewed(uuid) from public, anon;
grant execute on function public.mark_tag_request_viewed(uuid) to authenticated;
