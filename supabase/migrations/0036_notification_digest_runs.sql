-- 0036_notification_digest_runs.sql — Engineering Phase D3B: run ledger for the daily return-exceptions summary.
--
-- WHY: the summary is sent by a Vercel cron that is best-effort (no retries), can deliver the same scheduled run more
-- than once, and can overlap a still-running instance. The run must therefore be reconciliation-based: each run
-- covers everything since the organization's last SUCCESSFUL summary, claims its window before sending, and never
-- advances past a failed send. See docs/ACTIONABLE_NOTIFICATION_DESIGN.md §9.5–§9.6.
--
-- WHAT: one row per organization per summary window.
--   * window_end is the Pacific 6:00 AM cutoff; the unique (organization_id, digest_type, window_end) key is the claim,
--     so a duplicate or overlapping invocation for the same window cannot send a second summary.
--   * The last successful cutoff is the latest window_end with status sent / skipped_quiet. `failed` and a stuck
--     `processing` row never count, so the next run retries that period — late, never dropped.
--   * Stores run state only: no recipient address, email body, item list or free text. failure_class is a bounded
--     token. This is NOT a general notification queue.
--
-- SECURITY: private to the server. RLS is enabled with no policies, anon and authenticated have no privileges, and
-- only the service role (the cron worker) reads and writes it — the same shape as rate_limit_counters (0033).
--
-- APPLY: prove the linked project, `supabase migration list`, `supabase db push --dry-run`, then stop for operator
-- approval; manual Production dump first (Free plan, no backups).

create table if not exists public.notification_digest_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  digest_type text not null check (digest_type in ('return_exceptions')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null check (status in ('processing', 'sent', 'skipped_quiet', 'failed')),
  item_count integer not null default 0 check (item_count >= 0),
  provider_id text check (provider_id is null or char_length(provider_id) <= 200),
  failure_class text check (failure_class is null or failure_class ~ '^[a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint notification_digest_runs_window_order check (window_end > window_start),
  constraint notification_digest_runs_window_unique unique (organization_id, digest_type, window_end)
);

-- The catch-up lookup: the latest successful cutoff per organization.
create index if not exists notification_digest_runs_success_idx
  on public.notification_digest_runs (organization_id, digest_type, window_end desc)
  where status in ('sent', 'skipped_quiet');

alter table public.notification_digest_runs enable row level security;
-- No policies: nothing but the service role may touch this table.
revoke all on public.notification_digest_runs from anon, authenticated;
grant select, insert, update on public.notification_digest_runs to service_role;
