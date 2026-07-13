-- 0024_return_inspection_v2.sql — Return Inspection V2 (Phase 1A) provenance + session integrity.
--
-- WHY: the guided return inspection stores a versioned template snapshot + structured answers inside
-- the existing form_submissions.submission_data_json (schema_version=2), keeping form_type
-- 'return_checklist' so mark_return_and_resolve (0022), the inbox filters, the timeline, and the
-- Mark-returned-resolve flow are all unchanged. This migration only adds:
--   * assets.return_inspection_template_key — the explicit, admin-assigned system template for an asset
--     (nullable; app-validated against the code registry — deliberately NO CHECK constraint so new
--     system templates never need a schema migration). Anon may read it (needed to render the public
--     inspection); it is non-sensitive.
--   * form_submissions.{rental_session_id, inspection_template_key, inspection_template_version} —
--     nullable provenance columns (indexable without digging into JSON; rental_session_id is
--     foundational for future baseline comparison and hard to backfill later).
--   * a BEFORE INSERT trigger that AUTHORITATIVELY derives rental_session_id for return submissions
--     from the asset's current active_rental_session_id — a public submission can never associate
--     itself with an unrelated session. Any client- or request-supplied value is overwritten; the
--     org + asset must match; non-return submissions never carry a session.
--
-- Does NOT change form_type/status values, the anon insert policy, RLS, or migration 0022. No backfill:
-- existing V1 return rows keep their flat keys and render via the legacy path.
--
-- APPLY: `npx.cmd supabase db push`.

-- Explicit asset-level assignment (anon-readable, like active_rental_session_id in 0014).
alter table public.assets
  add column if not exists return_inspection_template_key text;
grant select (return_inspection_template_key) on public.assets to anon;

-- V2 submission provenance (nullable; server/trigger-set).
alter table public.form_submissions
  add column if not exists rental_session_id uuid
    references public.asset_rental_sessions(id) on delete set null,
  add column if not exists inspection_template_key text,
  add column if not exists inspection_template_version text;

create index if not exists form_submissions_rental_session_id_idx
  on public.form_submissions (rental_session_id);

-- Authoritatively bind a return submission to the asset's CURRENT active rental session. Runs for
-- every form_submissions insert (anon or authenticated). SECURITY DEFINER + locked search_path so it
-- reads assets regardless of the caller's grants/RLS; it only reads the opaque pointer and writes NEW.
create or replace function public.set_return_submission_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.form_type = 'return_checklist' then
    -- Derive from the asset's active session (org + asset must match); no match → null.
    select a.active_rental_session_id
      into new.rental_session_id
    from public.assets a
    where a.id = new.asset_id
      and a.organization_id = new.organization_id;
  else
    -- Non-return submissions never carry a rental session.
    new.rental_session_id := null;
  end if;
  -- Whatever the caller supplied is discarded in favour of the derived value.
  return new;
end;
$$;

drop trigger if exists form_submissions_set_return_session on public.form_submissions;
create trigger form_submissions_set_return_session
  before insert on public.form_submissions
  for each row execute function public.set_return_submission_session();
