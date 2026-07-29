-- 0033_public_rate_limit.sql — Phase A4
--
-- WHY: public write/upload workflows (damage/support/return/acknowledgement) had only a honeypot —
-- no production-safe rate limiting. Serverless (Vercel) cannot use process memory as a limiter, and
-- the only shared store is Postgres. This adds a private fixed-window counter table and an atomic
-- SECURITY DEFINER RPC that trusted server code (service_role only) calls to bound abuse.
--
-- PRIVACY: the RPC never sees a raw IP. The caller passes an already-salted key (a hashed IP + action
-- + short-code hash, built in lib/ratelimit). This table stores only opaque keys and counts.
--
-- SECURITY: the counter table is reachable ONLY through the RPC. RLS is enabled with no policies and
-- table privileges are revoked from anon/authenticated, so a leaked anon/authenticated JWT cannot read
-- or write it. The RPC is execute-granted to service_role only (revoked from public/anon/authenticated),
-- matching the "call only from trusted server code" requirement.
--
-- Scans are deliberately NOT rate-limited (product rule: scans are free); only the expensive
-- submission/upload paths use this.

-- ---------------------------------------------------------------------------
-- 1. Private fixed-window counter table
-- ---------------------------------------------------------------------------
create table public.rate_limit_counters (
  bucket_key    text        not null,
  window_seconds integer    not null,
  window_start  timestamptz not null,
  count         integer     not null default 0,
  expires_at    timestamptz not null,
  primary key (bucket_key, window_seconds, window_start)
);

alter table public.rate_limit_counters enable row level security;
-- No policies + revoked table grants: unreachable by anon/authenticated. SECURITY DEFINER functions
-- (owner = postgres) and service_role (RLS-bypassing) are the only accessors.
revoke all on public.rate_limit_counters from anon, authenticated;

-- Cleanup driver: prune expired windows cheaply.
create index rate_limit_counters_expires_idx on public.rate_limit_counters (expires_at);

-- ---------------------------------------------------------------------------
-- 2. Atomic touch RPC — increment each rule's fixed window, then decide
-- ---------------------------------------------------------------------------
-- p_rules is a JSON array of {"max": int, "window": seconds}. Returns
-- {"allowed": bool, "retry_after": int}. Increment-first (race-free: no read-then-write TOCTOU); a
-- request is denied when ANY window's post-increment count exceeds its max. Denied attempts still count
-- (an abuser stays blocked until the window rolls over). retry_after = seconds to the tripped window end.
create or replace function public.rate_limit_touch(p_key text, p_rules jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rule        jsonb;
  v_window      integer;
  v_max         integer;
  v_start       timestamptz;
  v_count       integer;
  v_now         timestamptz := now();
  v_denied      boolean := false;
  v_retry_after integer := 0;
begin
  -- Self-clean this key's expired windows (bounded to one key; keeps the table small without a scheduler).
  delete from public.rate_limit_counters
    where bucket_key = p_key and expires_at < v_now;

  for v_rule in select * from jsonb_array_elements(p_rules)
  loop
    v_window := (v_rule ->> 'window')::integer;
    v_max    := (v_rule ->> 'max')::integer;
    -- Fixed window aligned to epoch so all instances agree on the same bucket boundary.
    v_start  := to_timestamp(floor(extract(epoch from v_now) / v_window) * v_window);

    insert into public.rate_limit_counters (bucket_key, window_seconds, window_start, count, expires_at)
      values (p_key, v_window, v_start, 1, v_start + make_interval(secs => v_window))
      on conflict (bucket_key, window_seconds, window_start)
        do update set count = public.rate_limit_counters.count + 1
      returning count into v_count;

    if v_count > v_max then
      v_denied := true;
      v_retry_after := greatest(
        v_retry_after,
        ceil(extract(epoch from (v_start + make_interval(secs => v_window) - v_now)))::integer
      );
    end if;
  end loop;

  return jsonb_build_object('allowed', not v_denied, 'retry_after', v_retry_after);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Housekeeping GC (optional; the touch RPC already self-prunes per key)
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_gc()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limit_counters where expires_at < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants — trusted server code only
-- ---------------------------------------------------------------------------
revoke execute on function public.rate_limit_touch(text, jsonb) from public, anon, authenticated;
revoke execute on function public.rate_limit_gc() from public, anon, authenticated;
grant execute on function public.rate_limit_touch(text, jsonb) to service_role;
grant execute on function public.rate_limit_gc() to service_role;

comment on table public.rate_limit_counters is
  'Phase A4 private fixed-window rate-limit counters. Reachable only via rate_limit_touch (service_role). '
  'Stores opaque salted keys + counts; never a raw IP.';
comment on function public.rate_limit_touch(text, jsonb) is
  'Atomic fixed-window rate limiter. Increments each rule window for p_key, returns {allowed, retry_after}. '
  'service_role only; called from lib/ratelimit/limiter.ts.';
