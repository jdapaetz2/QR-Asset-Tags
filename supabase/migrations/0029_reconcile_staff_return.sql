-- 0029_reconcile_staff_return.sql — Yard Staff Scanner Mode (Phase 3B): reconcile same-session renter
-- return reports when the staff return completes.
--
-- WHY: a rental session may collect a public RENTER return report AND the authenticated STAFF return. When
-- staff complete the return, related renter reports should be reconciled in the SAME atomic transaction so
-- the condition story stays consistent:
--   * clean staff return + clean renter report  → auto-resolve the renter report
--   * anything else (damage/missing on either side, or a discrepancy) → mark reviewed AT MOST (never
--     resolved), so the item keeps dashboard attention for a manager.
-- Only new/reviewed same-session renter returns are touched; resolved/archived rows and every unrelated
-- submission are left exactly as-is. No blame, billing, or fault is inferred anywhere.
--
-- This re-defines complete_staff_return (0028) with the SAME signature (create or replace) — no app change.
-- The staff return's own status is unchanged (a flagged staff return still lands 'new'). The reconciliation
-- is a single UPDATE inside the existing all-or-nothing function body.
--
-- APPLY: npx.cmd supabase db push.

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
  v_org         uuid := current_org_id();
  v_active      uuid;
  v_profile     uuid := (select p.id from public.profiles p where p.auth_user_id = auth.uid());
  v_status      text := case when p_status in ('new', 'resolved') then p_status else 'new' end;
  v_existing    uuid;
  -- Staff-clean = the staff return reported neither damage nor missing accessories (from the V2 flags).
  v_staff_clean boolean := coalesce(p_data->'flags'->>'damage_observed', '') <> 'yes'
                       and coalesce(p_data->'flags'->>'accessories_missing', 'false') <> 'true';
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

  -- Reconcile same-session RENTER return reports (public origin), new/reviewed only. A clean staff return
  -- over a clean renter report resolves it; anything else marks it reviewed at most (kept unresolved so it
  -- retains dashboard attention). Resolved/archived rows and all unrelated submissions are untouched.
  update public.form_submissions r
    set status = case
        when v_staff_clean
             and coalesce(r.submission_data_json->'flags'->>'damage_observed', '') <> 'yes'
             and coalesce(r.submission_data_json->'flags'->>'accessories_missing', 'false') <> 'true'
             and coalesce(r.submission_data_json->>'damage_observed', '') <> 'yes'
             and coalesce(r.submission_data_json->>'accessories_returned', '') <> 'no'
        then 'resolved'
        else 'reviewed'
      end
  where r.organization_id = v_org
    and r.rental_session_id = p_expected_session_id
    and r.form_type = 'return_checklist'
    and r.submission_origin = 'public'
    and r.status in ('new', 'reviewed');

  return jsonb_build_object('result', 'completed', 'submission_id', p_submission_id, 'status', v_status);
end;
$$;

revoke execute on function public.complete_staff_return(
  uuid, uuid, uuid, timestamptz, text, text, text, jsonb, jsonb, text, text
) from public, anon;
grant execute on function public.complete_staff_return(
  uuid, uuid, uuid, timestamptz, text, text, text, jsonb, jsonb, text, text
) to authenticated;
