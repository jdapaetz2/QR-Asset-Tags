-- 0023_qr_short_code_rotation.sql — owner-controlled QR short-code rotation + a
-- deterministic "which link does production encode" indicator.
--
-- WHY: a deployed `${NEXT_PUBLIC_SITE_URL}/t/{short_code}` is a permanent contract with a
-- physical tag. Rotation must NEVER mutate a deployed row's short_code and must NEVER delete a
-- link (scan_events.qr_link_id is `on delete cascade` — deleting destroys scan history). Instead
-- rotation = INSERT a new active row (an alias); retirement = `status='disabled'`. Both the old
-- and new active codes keep resolving (resolver keys on short_code + RLS status='active').
--
-- What this migration adds:
--   * is_production_primary — the single active link production encodes for an asset's next tag
--     batch. A partial unique index enforces AT MOST ONE primary per asset. Every consumer picks
--     it deterministically (previously production grabbed an arbitrary first row).
--   * supersedes_qr_link_id — audit lineage ("this code replaced that one").
--   * an auto-assign trigger so an asset's first active link becomes primary with zero owner
--     action (production always has a deterministic target).
--   * a governance protect trigger so ONLY the platform owner can change these columns — customers
--     keep creating/disabling their own links but cannot touch production selection or lineage.
--   * set_qr_production_primary(uuid) — an atomic, owner-only promote (unset old + set new in one
--     transaction, avoiding the partial-unique-index "two true rows" window).
--
-- Nothing here changes short_code, public_url, scan_events, RLS on qr_links, or the resolver.
--
-- APPLY: `supabase db push`.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.qr_links
  add column if not exists is_production_primary boolean not null default false,
  add column if not exists supersedes_qr_link_id uuid references public.qr_links(id) on delete set null;

-- At most one production-selected link per asset (nulls/false rows are unconstrained).
create unique index if not exists qr_links_one_production_primary_per_asset
  on public.qr_links (asset_id)
  where is_production_primary;

-- ---------------------------------------------------------------------------
-- Backfill: keep today's production output deterministic. For each asset with >=1 active
-- link and no primary yet, mark the earliest-created active link as primary.
-- ---------------------------------------------------------------------------
with ranked as (
  select
    q.id,
    row_number() over (partition by q.asset_id order by q.created_at, q.id) as rn
  from public.qr_links q
  where q.status = 'active'
    and not exists (
      select 1 from public.qr_links p
      where p.asset_id = q.asset_id and p.is_production_primary
    )
)
update public.qr_links q
  set is_production_primary = true
from ranked r
where r.id = q.id and r.rn = 1;

-- ---------------------------------------------------------------------------
-- Auto-assign: the first active link for an asset becomes the production primary, so the
-- customer's existing "generate a QR" flow still leaves production with a deterministic target
-- without any owner action. Added aliases (asset already has a primary) default to false.
-- ---------------------------------------------------------------------------
create or replace function public.set_default_production_primary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and not new.is_production_primary
     and not exists (
       select 1 from public.qr_links q
       where q.asset_id = new.asset_id and q.is_production_primary
     )
  then
    new.is_production_primary := true;
  end if;
  return new;
end;
$$;

drop trigger if exists qr_links_set_default_production_primary on public.qr_links;
create trigger qr_links_set_default_production_primary
  before insert on public.qr_links
  for each row execute function public.set_default_production_primary();

-- ---------------------------------------------------------------------------
-- Governance guard: only the platform owner may set/change is_production_primary or the supersedes
-- lineage. Mirrors protect_commercial_fields. The qr_links_rw policy lets a customer insert/update
-- their own links, so for a non-owner we neutralise these governance columns:
--   * UPDATE → coerce back to OLD (customer status toggles etc. still succeed);
--   * INSERT → force to the safe defaults (primary is left for the auto-assign trigger to decide;
--     lineage is cleared). The customer's normal "generate a QR" flow never sets these, so it is
--     unaffected — this only blocks a hand-crafted API insert.
-- Runs before set_default_production_primary (name order), so auto-assign still fires afterwards.
-- ---------------------------------------------------------------------------
create or replace function public.protect_qr_governance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    if tg_op = 'INSERT' then
      new.is_production_primary := false;
      new.supersedes_qr_link_id := null;
    else
      new.is_production_primary := old.is_production_primary;
      new.supersedes_qr_link_id := old.supersedes_qr_link_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists qr_links_protect_governance on public.qr_links;
create trigger qr_links_protect_governance
  before insert or update on public.qr_links
  for each row execute function public.protect_qr_governance();

-- ---------------------------------------------------------------------------
-- Atomic promote: set one active link as the asset's production primary. Owner-only (the function
-- self-checks). SECURITY INVOKER so RLS + the governance trigger still apply (owner passes both).
-- Returns a text result code the app maps to a message.
--   'ok'         — promoted
--   'forbidden'  — caller is not the platform owner
--   'not_found'  — no such link visible to the caller
--   'not_active' — link is disabled (a disabled code must never be the production target)
-- ---------------------------------------------------------------------------
create or replace function public.set_qr_production_primary(p_qr_link_id uuid)
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_asset uuid;
  v_status text;
begin
  if not public.is_platform_owner() then
    return 'forbidden';
  end if;

  select ql.asset_id, ql.status
    into v_asset, v_status
  from public.qr_links ql
  where ql.id = p_qr_link_id;

  if not found then
    return 'not_found';
  end if;

  if v_status <> 'active' then
    return 'not_active';
  end if;

  -- Unset the current primary first (the partial unique index forbids two true rows), then set
  -- this one. One statement each, one transaction — no partial state.
  update public.qr_links
    set is_production_primary = false
  where asset_id = v_asset
    and is_production_primary
    and id <> p_qr_link_id;

  update public.qr_links
    set is_production_primary = true
  where id = p_qr_link_id;

  return 'ok';
end;
$$;

revoke execute on function public.set_qr_production_primary(uuid) from public, anon;
grant execute on function public.set_qr_production_primary(uuid) to authenticated;
