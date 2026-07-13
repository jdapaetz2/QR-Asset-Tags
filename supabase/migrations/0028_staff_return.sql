-- 0028_staff_return.sql — Yard Staff Scanner Mode (Phase 3A.1): protected staff return + atomic completion.
--
-- WHY: Phase 3A shipped an outbound (pre-use) staff inspection but no real staff RETURN flow — the staff
-- summary linked rented assets to the PUBLIC renter form. A staff return must be attributable to the
-- authenticated account, must not carry renter contact / acknowledgement, and completing it must itself
-- close the physical rental (close the session + clear the asset pointer) in ONE transaction. This
-- migration adds:
--   1. form_submissions.submission_origin ('public'|'staff') + submitted_by_profile_id — the authoritative,
--      server-set, un-forgeable audience + actor. Existing rows default to 'public'; the outbound baselines
--      created going forward are corrected to 'staff'.
--   2. An extension of set_return_submission_session() (0024/0027) so it ALSO stamps origin + actor on every
--      insert (anon → public/null; authenticated 'staff' → the caller's own profile id, overwritten so the
--      browser can never forge it). This is the single insert chokepoint for all form_submissions rows.
--   3. start_outbound_rental() re-defined to set origin='staff' + the actor profile id on the baseline
--      (0028 supersedes 0027; the 0027 file is left immutable).
--   4. complete_staff_return() — the atomic staff-return RPC: insert the staff return, close the active
--      rental session, clear assets.active_rental_session_id — all-or-nothing, idempotent, org-scoped.
--
-- form_type stays 'return_checklist' so mark_return_and_resolve (0022), the inbox filters, the timeline, and
-- the V2 admin summary are all unchanged. Media are uploaded to the private `submissions` bucket by the app
-- BEFORE the RPC; the app cleans them up if the RPC does not complete.
--
-- APPLY: npx.cmd supabase db push.

-- ---------------------------------------------------------------------------
-- 1. Provenance columns: audience + authenticated actor. Nullable/defaulted so existing rows are safe.
-- ---------------------------------------------------------------------------
alter table public.form_submissions
  add column if not exists submission_origin text not null default 'public'
    check (submission_origin in ('public', 'staff')),
  add column if not exists submitted_by_profile_id uuid
    references public.profiles(id) on delete set null;

-- Supports the same-session related-records lookups (staff <-> renter) and the idempotency existence check.
create index if not exists form_submissions_session_origin_idx
  on public.form_submissions (rental_session_id, submission_origin);

-- Hard guarantee of "one completed staff return per rental session" — the deterministic backstop against a
-- concurrent double-submit (mirrors the one-active-session index for outbound). Renter returns are NOT
-- constrained (a session may collect several renter reports).
create unique index if not exists form_submissions_one_staff_return_per_session_idx
  on public.form_submissions (rental_session_id)
  where form_type = 'return_checklist' and submission_origin = 'staff' and rental_session_id is not null;

-- Outbound (pre-use) baselines are staff-created; correct any that exist (none until 0027 is applied).
update public.form_submissions
  set submission_origin = 'staff'
  where form_type = 'pre_use_inspection';

-- ---------------------------------------------------------------------------
-- 2. Single insert chokepoint: derive the rental session (as before) AND stamp origin + actor
--    authoritatively. The browser can never set/override either — for an anon insert origin is forced
--    to 'public'; for an authenticated 'staff' insert the actor is overwritten with the caller's OWN
--    profile id (forge-proof). SECURITY DEFINER so it can read assets regardless of the caller's grants;
--    auth.uid() still reflects the calling session, not the definer.
-- ---------------------------------------------------------------------------
create or replace function public.set_return_submission_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Session binding (return checklists + outbound baselines). Any client-supplied value is discarded.
  if new.form_type in ('return_checklist', 'pre_use_inspection') then
    select a.active_rental_session_id
      into new.rental_session_id
    from public.assets a
    where a.id = new.asset_id
      and a.organization_id = new.organization_id;
  else
    new.rental_session_id := null;
  end if;

  -- Origin + actor: authoritative, never trusted from the request body.
  if v_uid is null then
    -- Anonymous public submission.
    new.submission_origin := 'public';
    new.submitted_by_profile_id := null;
  elsif new.submission_origin = 'staff' then
    -- Authenticated staff workflow: attribute to the caller's own profile (overwrite any supplied id).
    new.submitted_by_profile_id := (
      select p.id from public.profiles p where p.auth_user_id = v_uid
    );
  else
    -- Authenticated but not a staff-origin insert → treat as public, no actor.
    new.submission_origin := 'public';
    new.submitted_by_profile_id := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Outbound RPC re-defined so the baseline records its staff origin + actor. Body is otherwise identical
--    to 0027; 0028 supersedes it. (The trigger also stamps the actor, but set it here for clarity/robustness.)
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

  select a.active_rental_session_id into v_active
  from public.assets a
  where a.id = p_asset_id and a.organization_id = v_org;

  if not found then
    return 'not_found';
  end if;
  if v_active is not null then
    return 'already_active';
  end if;

  begin
    insert into public.asset_rental_sessions (
      organization_id, asset_id, status, rental_reference, renter_label, created_by_profile_id
    )
    values (v_org, p_asset_id, 'active', p_reference, p_renter_label, v_profile)
    returning id into v_session;
  exception when unique_violation then
    return 'already_active';
  end;

  update public.assets a
    set active_rental_session_id = v_session
  where a.id = p_asset_id and a.organization_id = v_org;

  insert into public.form_submissions (
    id, created_at, organization_id, asset_id, form_type, status,
    submitted_by_name, submission_origin, submitted_by_profile_id,
    submission_data_json, media_urls,
    inspection_template_key, inspection_template_version
  )
  values (
    p_submission_id, p_created_at, v_org, p_asset_id, 'pre_use_inspection', 'resolved',
    p_submitted_by, 'staff', v_profile,
    p_data, coalesce(p_media, '[]'::jsonb),
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

-- ---------------------------------------------------------------------------
-- 4. Atomic staff return completion: insert the staff return, close the active session, clear the asset
--    pointer — one transaction, mirroring mark_return_and_resolve (0022). security invoker (RLS in force)
--    + explicit org isolation on every touched row. Idempotent: once completed the pointer is cleared, so
--    a replay finds the existing staff return for the session and returns it instead of completing twice.
--
--    Returns jsonb the app maps to a result:
--      {"result":"completed",         "submission_id": <uuid>, "status": <'new'|'resolved'>}
--      {"result":"already_completed", "submission_id": <uuid>}  -- idempotent replay; existing record
--      {"result":"not_active"}        -- the expected session is not active and no staff return exists
--      {"result":"session_mismatch"}  -- the asset's active session changed under the caller
--      {"result":"not_found"}         -- no such asset in the caller's org (missing or cross-org)
-- ---------------------------------------------------------------------------
create or replace function public.complete_staff_return(
  p_asset_id            uuid,
  p_expected_session_id uuid,
  p_submission_id       uuid,
  p_created_at          timestamptz,
  p_status              text,
  p_submitted_by_name   text,
  p_submitted_by_email  text,
  p_data                jsonb,
  p_media               jsonb,
  p_template_key        text,
  p_template_version    text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_org      uuid := current_org_id();
  v_active   uuid;
  v_profile  uuid := (select p.id from public.profiles p where p.auth_user_id = auth.uid());
  v_status   text := case when p_status in ('new', 'resolved') then p_status else 'new' end;
  v_existing uuid;
begin
  if v_org is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  -- RLS-scoped read: another org's asset isn't visible → not_found (covers cross-org).
  select a.active_rental_session_id into v_active
  from public.assets a
  where a.id = p_asset_id and a.organization_id = v_org;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  -- Already returned (pointer cleared): if a staff return exists for the expected session, this is an
  -- idempotent replay — return the existing record. Otherwise there is nothing to complete.
  if v_active is null then
    select fs.id into v_existing
    from public.form_submissions fs
    where fs.organization_id = v_org
      and fs.rental_session_id = p_expected_session_id
      and fs.form_type = 'return_checklist'
      and fs.submission_origin = 'staff'
    order by fs.created_at asc
    limit 1;

    if v_existing is not null then
      return jsonb_build_object('result', 'already_completed', 'submission_id', v_existing);
    end if;
    return jsonb_build_object('result', 'not_active');
  end if;

  -- The active session must be the one the staff loaded; otherwise state changed under them.
  if v_active <> p_expected_session_id then
    return jsonb_build_object('result', 'session_mismatch');
  end if;

  -- Insert the staff return. The trigger derives rental_session_id from the still-set pointer and stamps
  -- origin/actor; we set them here too for clarity. status: 'new' keeps a flagged return in the queue. The
  -- one-staff-return-per-session unique index turns a concurrent double-submit into an idempotent result.
  begin
    insert into public.form_submissions (
      id, created_at, organization_id, asset_id, form_type, status,
      submitted_by_name, submitted_by_email, submission_origin, submitted_by_profile_id,
      submission_data_json, media_urls,
      inspection_template_key, inspection_template_version
    )
    values (
      p_submission_id, p_created_at, v_org, p_asset_id, 'return_checklist', v_status,
      p_submitted_by_name, p_submitted_by_email, 'staff', v_profile,
      p_data, coalesce(p_media, '[]'::jsonb),
      p_template_key, p_template_version
    );
  exception when unique_violation then
    -- A concurrent completion won the race; return its record instead of completing twice.
    select fs.id into v_existing
    from public.form_submissions fs
    where fs.organization_id = v_org
      and fs.rental_session_id = p_expected_session_id
      and fs.form_type = 'return_checklist'
      and fs.submission_origin = 'staff'
    order by fs.created_at asc
    limit 1;
    return jsonb_build_object('result', 'already_completed', 'submission_id', v_existing);
  end;

  -- Close the active session (guarded by status='active' → idempotent) and clear the asset pointer.
  update public.asset_rental_sessions ars
    set status = 'returned',
        returned_at = now(),
        returned_by_profile_id = v_profile
  where ars.id = p_expected_session_id
    and ars.organization_id = v_org
    and ars.status = 'active';

  update public.assets a
    set active_rental_session_id = null
  where a.id = p_asset_id and a.organization_id = v_org;

  return jsonb_build_object('result', 'completed', 'submission_id', p_submission_id, 'status', v_status);
end;
$$;

revoke execute on function public.complete_staff_return(
  uuid, uuid, uuid, timestamptz, text, text, text, jsonb, jsonb, text, text
) from public, anon;
grant execute on function public.complete_staff_return(
  uuid, uuid, uuid, timestamptz, text, text, text, jsonb, jsonb, text, text
) to authenticated;
