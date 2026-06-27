-- 0012_notification_settings.sql — Per-organization email notification settings.
--
-- WHY: rental admins want an email when a public submission (damage / support /
-- return) arrives or an important tag-request status changes, without living in the
-- dashboard. Email is an OPTIONAL layer — nothing sends unless notification_email is
-- set, and each event type has its own toggle.
--
-- SECURITY: these columns are intentionally NOT added to the anon column-grant in
-- 0001_init.sql (which is an explicit safe list of branding columns). Anon therefore
-- cannot read them, so the public can never see an org's notification settings.
-- Customer admins read/write their own org via the existing organizations RLS.
--
-- APPLY: `supabase db push`.

alter table public.organizations
  add column if not exists notification_email text,
  add column if not exists notify_damage_reports boolean not null default true,
  add column if not exists notify_support_requests boolean not null default true,
  add column if not exists notify_return_checklists boolean not null default false,
  add column if not exists notify_tag_request_updates boolean not null default false;
