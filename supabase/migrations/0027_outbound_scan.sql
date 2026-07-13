-- 0027_outbound_scan.sql — Yard Staff Scanner Mode (Phase 3A): atomic outbound scan + condition baseline.
--
-- WHY: an authenticated rental-company employee scans the tag, completes an OUTBOUND (pre-use) inspection
-- that records baseline condition/accessories/meters/photos, and marks the asset RENTED. Marking rented is
-- three coupled writes — start an active rental session, point assets.active_rental_session_id at it, and
-- store the baseline inspection linked to that session. Done as sequential app .update()/.insert() calls
-- this can leave partial state. start_outbound_rental() does all three in ONE transaction, so it is
-- all-or-nothing, mirroring mark_return_and_resolve (0022).
--
-- Two parts:
--   1. Extend set_return_submission_session() (0024) so a pre_use_inspection submission ALSO gets its
--      rental_session_id derived from the asset's active_rental_session_id. (0024 forced null for any
--      non-return form_type.) The trigger definition is unchanged; only the function body is replaced.
--   2. start_outbound_rental() — the atomic outbound RPC (security invoker; RLS + explicit org isolation).
--
-- form_type='pre_use_inspection' already passes the 0001 CHECK; schema_version=2 baselines render through
-- the existing admin summary. Media are uploaded to the private `submissions` bucket by the app BEFORE the
-- RPC; the app cleans them up if the RPC does not return 'started'.
--
-- APPLY: npx.cmd supabase db push.

-- ---------------------------------------------------------------------------
-- 1. Session-link trigger: bind BOTH return checklists and outbound (pre-use) inspections to the asset's
--    current active rental session. Any client-supplied rental_session_id is still discarded (derived,
--    never trusted). SECURITY DEFINER so it can read assets regardless of the caller's grants.
-- ---------------------------------------------------------------------------
create or replace function public.set_return_submission_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.form_type in ('return_checklist', 'pre_use_inspection') then
    -- Derive from the asset's active session (org + asset must match); no match → null.
    select a.active_rental_session_id
      into new.rental_session_id
    from public.assets a
    where a.id = new.asset_id
      and a.organization_id = new.organization_id;
  else
    -- Other submissions never carry a rental session.
    new.rental_session_id := null;
  end if;
  -- Whatever the caller supplied is discarded in favour of the derived value.
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Atomic outbound: start the rental session, point the asset at it, and store the baseline inspection.
--    Returns a text result code the app maps to a message:
--      'started'        — session created, asset rented, baseline stored
--      'already_active' — the asset already has an active rental session (no second session started)
--      'not_found'      — no such asset in the caller's org (missing or cross-org)
-- ---------------------------------------------------------------------------
create or replace function public.start_outbound_rental(
  p_asset_id          uuid,
  p_submission_id     uuid,
  p_created_at        timestamptz,
  p_reference         text,
  p_renter_label      text,
  p_submitted_by      text,
  p_data              jsonb,
  p_media             jsonb,
  p_template_key      text,
  p_template_version  text
)
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_org      uuid := current_org_id();
  v_active   uuid;
  v_profile  uuid := (select p.id from public.profiles p where p.auth_user_id = auth.uid());
  v_session  uuid;
begin
  if v_org is null then
    return 'not_found';
  end if;

  -- RLS-scoped read: another org's asset isn't visible → not_found (covers cross-org).
  select a.active_rental_session_id into v_active
  from public.assets a
  where a.id = p_asset_id and a.organization_id = v_org;

  if not found then
    return 'not_found';
  end if;
  if v_active is not null then
    return 'already_active';
  end if;

  -- Start the active session. The partial unique index (one active per asset) is the backstop against a
  -- race; translate the violation into a clean code.
  begin
    insert into public.asset_rental_sessions (
      organization_id, asset_id, status, rental_reference, renter_label, created_by_profile_id
    )
    values (v_org, p_asset_id, 'active', p_reference, p_renter_label, v_profile)
    returning id into v_session;
  exception when unique_violation then
    return 'already_active';
  end;

  -- Point the asset at the new session (this alone re-arms public Quick Start + the ack prompt).
  update public.assets a
    set active_rental_session_id = v_session
  where a.id = p_asset_id and a.organization_id = v_org;

  -- Store the baseline inspection. The trigger above derives rental_session_id from the pointer we just set.
  insert into public.form_submissions (
    id, created_at, organization_id, asset_id, form_type, status,
    submitted_by_name, submission_data_json, media_urls,
    inspection_template_key, inspection_template_version
  )
  values (
    p_submission_id, p_created_at, v_org, p_asset_id, 'pre_use_inspection', 'resolved',
    p_submitted_by, p_data, coalesce(p_media, '[]'::jsonb),
    p_template_key, p_template_version
  );

  return 'started';
end;
$$;

revoke execute on function public.start_outbound_rental(
  uuid, uuid, timestamptz, text, text, text, jsonb, jsonb, text, text
) from public, anon;
grant execute on function public.start_outbound_rental(
  uuid, uuid, timestamptz, text, text, text, jsonb, jsonb, text, text
) to authenticated;
