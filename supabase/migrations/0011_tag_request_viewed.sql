-- 0011_tag_request_viewed.sql — Platform-admin "viewed" tracking for tag requests.
--
-- WHY: the platform admin needs in-app visibility that a customer submitted a tag
-- request without opening the queue. `platform_viewed_at` is set when the platform
-- admin opens a request's detail page. This is SEPARATE from `status` — a request
-- can be in_production yet unviewed, or viewed while still 'requested'.
--
-- Only the platform owner can write these columns: the existing
-- `tag_requests_update` policy already restricts UPDATE to is_platform_owner(), so
-- no policy change is needed. Customers never see these columns (queries don't
-- select them).
--
-- BACKFILL: none — existing requests stay unviewed so any already-pending work
-- surfaces to the owner (safer than silently hiding it).
--
-- APPLY: `supabase db push`.

alter table public.tag_requests
  add column if not exists platform_viewed_at timestamptz;

alter table public.tag_requests
  add column if not exists platform_viewed_by_profile_id uuid
    references public.profiles(id) on delete set null;

-- Fast "unviewed per org" counts for the Organizations badge.
create index if not exists tag_requests_unviewed_idx
  on public.tag_requests (organization_id)
  where platform_viewed_at is null;
