-- 0034_notification_routing.sql — Engineering Phase D3A: urgent route, return modes, photo-preview switch.
--
-- WHY: one notification address plus per-event booleans cannot send an Immediate-attention report anywhere but
-- the general inbox, and a single return boolean cannot express "each renter return" vs "daily exceptions only".
-- See docs/ACTIONABLE_NOTIFICATION_DESIGN.md §9.2–§9.4 (operator-locked, D0.1).
--
-- WHAT (additive only — no column is dropped or renamed):
--   notify_urgent_reports          urgent route switch; independent of the damage/support general switches
--   urgent_notification_email      urgent route address; kept when the switch is turned off
--   return_notification_mode       'instant_renter' | 'daily_exceptions' | 'off' — AUTHORITATIVE from D3A
--   notify_include_photo_previews  organization switch for bounded inline previews (behaviour ships in D4)
--
-- LEGACY: notify_return_checklists is KEPT for rollback safety during Phase D. The settings action mirrors it
-- (true only for 'instant_renter') and no code reads it any more; a later migration drops it.
--
-- SECURITY: none of these columns joins the anon column grant in 0001_init.sql (an explicit safe list), so the
-- public can never read them. Writes follow the existing organizations_update policy (0032): the platform owner,
-- or a customer_admin of the caller's own active organization. Customer staff cannot change them.
--
-- APPLY: prove the linked project, `supabase migration list`, `supabase db push --dry-run`, then stop for
-- operator approval. Never applied to Production in the same unreviewed step that creates it.

alter table public.organizations
  add column if not exists notify_urgent_reports boolean not null default false,
  add column if not exists urgent_notification_email text,
  add column if not exists return_notification_mode text not null default 'off',
  add column if not exists notify_include_photo_previews boolean not null default true;

alter table public.organizations
  add constraint organizations_return_notification_mode_check
    check (return_notification_mode in ('instant_renter', 'daily_exceptions', 'off')),
  -- Defense in depth: a customer admin can write through the API directly, so the settings form is not the only
  -- guard against switching the urgent route on with nowhere to send it.
  add constraint organizations_urgent_route_has_address
    check (not notify_urgent_reports or nullif(btrim(urgent_notification_email), '') is not null);

-- Existing organizations keep their current return behaviour: on → every renter return, off → off.
-- The statement between the markers is executed verbatim by tests/security/catalog.test.ts.
-- backfill:begin
update public.organizations
   set return_notification_mode = case when notify_return_checklists then 'instant_renter' else 'off' end;
-- backfill:end
