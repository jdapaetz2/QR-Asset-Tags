-- 0022_mark_return_and_resolve.sql — atomic "Mark returned & resolve" for a return checklist.
--
-- WHY: closing out an unresolved return checklist is three coupled steps — mark the asset
-- returned, close its active rental session, and resolve the submission. Doing that as two
-- sequential app-level .update() calls can leave partial state (a half-returned asset with an
-- unresolved checklist) on a mid-way failure. This single function does all three in one
-- transaction (a function body is one implicit transaction), so it is all-or-nothing.
--
-- SECURITY: security invoker — RLS on assets / asset_rental_sessions / form_submissions stays in
-- force (anon has no access to rentals or submissions at all). Tenant isolation is also explicit
-- via `organization_id = current_org_id()` on every touched row (NULL org → no rows), with RLS as
-- defense-in-depth. search_path is locked to public; every object is schema-qualified. Execute is
-- revoked from public + anon and granted only to authenticated. No service-role.
--
-- IDEMPOTENT: the session close is guarded by `status = 'active'`, and a submission that is not
-- new/reviewed is a safe no-op (never un-archives, never re-closes). Repeating the call is safe.
--
-- RETURNS a text result code the app maps to a message:
--   'returned'         — closed an active rental session AND resolved the checklist
--   'resolved_only'    — no active session; resolved the checklist (asset was already available)
--   'already_resolved' — nothing to do (already resolved/archived); safe no-op
--   'not_return'       — the submission is not a return_checklist (rejected)
--   'not_found'        — no such submission in the caller's org (missing or cross-org)
--
-- APPLY: `supabase db push`.

create or replace function public.mark_return_and_resolve(p_submission_id uuid)
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_org uuid := current_org_id();
  v_asset uuid;
  v_form text;
  v_status text;
  v_session uuid;
begin
  if v_org is null then
    return 'not_found';
  end if;

  select fs.asset_id, fs.form_type, fs.status
    into v_asset, v_form, v_status
  from public.form_submissions fs
  where fs.id = p_submission_id
    and fs.organization_id = v_org;

  if not found then
    return 'not_found';
  end if;

  if v_form <> 'return_checklist' then
    return 'not_return';
  end if;

  -- Anything past triage is a safe no-op (never un-archive, never re-close a session).
  if v_status not in ('new', 'reviewed') then
    return 'already_resolved';
  end if;

  -- Close the asset's active rental session (guarded by status='active' → idempotent).
  update public.asset_rental_sessions ars
    set status = 'returned',
        returned_at = now(),
        returned_by_profile_id = (
          select p.id from public.profiles p where p.auth_user_id = auth.uid()
        )
  where ars.asset_id = v_asset
    and ars.organization_id = v_org
    and ars.status = 'active'
  returning ars.id into v_session;

  if v_session is not null then
    update public.assets a
      set active_rental_session_id = null
    where a.id = v_asset
      and a.organization_id = v_org;
  end if;

  update public.form_submissions fs
    set status = 'resolved'
  where fs.id = p_submission_id
    and fs.organization_id = v_org;

  return case when v_session is not null then 'returned' else 'resolved_only' end;
end;
$$;

revoke execute on function public.mark_return_and_resolve(uuid) from public, anon;
grant execute on function public.mark_return_and_resolve(uuid) to authenticated;
