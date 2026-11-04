-- 0040_qr_primary_disable_guard.sql — Only the platform owner can take a printed QR code out of service.
--
-- WHY (Engineering Phase E2C): a production-primary QR link is the one printed on tags, cards and the website. Any
-- signed-in member of its organization could switch it to `disabled` (lib/qr/actions.ts, setQrLinkStatus checks only
-- requireProfile, and RLS qr_links_rw is an org-membership check), and a disabled code stops resolving. The Phase E
-- runbook requires this guard before the Northridge showcase cutover (docs/phase-e/PHASE_E_PLAN.md, section 3).
--
-- Recreates protect_qr_governance (0023) with one addition: a signed-in user who is not the platform owner cannot move
-- an ACTIVE production-primary link out of `active`. It raises (SQLSTATE 42501) instead of silently reverting, so the
-- app can say why. Unchanged: the governance columns (is_production_primary, supersedes_qr_link_id) stay owner-only;
-- aliases and non-primary links can still be disabled by the organization; trusted server contexts (no signed-in user,
-- auth.uid() is null) are unaffected, as in 0032. The trigger qr_links_protect_governance is not recreated, so the
-- trigger catalog is unchanged. Compatible with the previous code, which shows the database error as a failure.

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
      if auth.uid() is not null
         and old.is_production_primary
         and old.status = 'active'
         and new.status is distinct from 'active'
      then
        raise exception 'qr_primary_disable_forbidden: only the platform owner can disable a production-primary QR link'
          using errcode = '42501';
      end if;
      new.is_production_primary := old.is_production_primary;
      new.supersedes_qr_link_id := old.supersedes_qr_link_id;
    end if;
  end if;
  return new;
end;
$$;
