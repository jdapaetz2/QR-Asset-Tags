-- 0030_outbound_attach_session.sql — Outbound inspection may ATTACH to an existing active rental session.
--
-- WHY (Phase 3C.6): the office often marks an asset rented (start a session) BEFORE the yard employee performs
-- the physical outbound inspection. Until now `start_outbound_rental` rejected any asset that already had an
-- active session (`already_active`), blocking that normal workflow. This migration lets the same atomic RPC do
-- BOTH: create a new session when none exists (unchanged behavior), or attach the outbound baseline to the
-- existing active session WITHOUT closing/replacing/restarting it. A new partial unique index guarantees at most
-- ONE outbound baseline (`pre_use_inspection`) per rental session, so concurrent submissions can't duplicate it.
--
-- Guarantees for the attach case: `started_at`, `status`, and `assets.active_rental_session_id` are untouched;
-- the asset stays rented; blank rental details may be filled but existing non-empty values are never overwritten.
--
-- Result codes: 'session_created' | 'attached_to_existing_session' | 'baseline_already_exists' |
--               'session_conflict' | 'not_found'.
--
-- Additive only. Ships UNAPPLIED — APPLY: `npx.cmd supabase db push`.

-- One outbound baseline per rental session (no DB constraint enforced this before). Partial + org-agnostic; RLS
-- on form_submissions still scopes reads/writes to the caller's org.
create unique index if not exists form_submissions_one_outbound_per_session_idx
  on public.form_submissions (rental_session_id)
  where form_type = 'pre_use_inspection' and rental_session_id is not null;

-- Supersede the 0028 definition. Same signature + grants; new create-or-attach body.
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

  -- RLS-scoped: an asset in another org isn't visible → not_found (no cross-org attach).
  select a.active_rental_session_id into v_active
  from public.assets a
  where a.id = p_asset_id and a.organization_id = v_org;
  if not found then
    return 'not_found';
  end if;

  -- CASE 1 — no active session: create it, point the asset at it, insert the baseline (unchanged behavior).
  if v_active is null then
    begin
      insert into public.asset_rental_sessions (
        organization_id, asset_id, status, rental_reference, renter_label, created_by_profile_id
      )
      values (v_org, p_asset_id, 'active', p_reference, p_renter_label, v_profile)
      returning id into v_session;
    exception when unique_violation then
      -- A concurrent request started the session first; re-read and fall through to the attach path.
      select a.active_rental_session_id into v_active
      from public.assets a
      where a.id = p_asset_id and a.organization_id = v_org;
    end;

    if v_session is not null then
      update public.assets a
        set active_rental_session_id = v_session
      where a.id = p_asset_id and a.organization_id = v_org;

      -- The set_return_submission_session trigger binds rental_session_id to the just-set active pointer.
      begin
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
      exception when unique_violation then
        return 'baseline_already_exists';
      end;

      return 'session_created';
    end if;
    -- else: lost the race → v_active now set → continue into the attach path below.
  end if;

  -- CASE 2/3 — attach to the existing active session (never close/replace/restart it).
  -- Defensive: the pointer must reference an ACTIVE session for THIS asset + org (RLS already scopes reads).
  perform 1 from public.asset_rental_sessions s
    where s.id = v_active and s.asset_id = p_asset_id and s.organization_id = v_org and s.status = 'active';
  if not found then
    return 'session_conflict';
  end if;

  -- CASE 3 — a baseline already exists: do not silently create a second authoritative baseline.
  perform 1 from public.form_submissions f
    where f.rental_session_id = v_active and f.form_type = 'pre_use_inspection';
  if found then
    return 'baseline_already_exists';
  end if;

  -- Fill ONLY blank rental details (Part L) — never overwrite an existing non-empty value.
  update public.asset_rental_sessions s
    set renter_label     = coalesce(s.renter_label, p_renter_label),
        rental_reference = coalesce(s.rental_reference, p_reference)
  where s.id = v_active;

  -- Insert the baseline; trigger binds rental_session_id to the active pointer (= v_active). started_at + the
  -- active pointer are untouched. Unique index is the concurrency backstop against a duplicate baseline.
  begin
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
  exception when unique_violation then
    return 'baseline_already_exists';
  end;

  return 'attached_to_existing_session';
end;
$$;

-- Signature unchanged, but re-assert the grants (idempotent) — never executable by anon/public.
revoke execute on function public.start_outbound_rental(
  uuid, uuid, timestamptz, text, text, text, jsonb, jsonb, text, text
) from public, anon;
grant execute on function public.start_outbound_rental(
  uuid, uuid, timestamptz, text, text, text, jsonb, jsonb, text, text
) to authenticated;
