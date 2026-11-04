-- 0041_demo_organization_flag.sql — Let public pages know an organization is a demonstration.
--
-- WHY (Engineering Phase E2C): the Northridge showcase uses real equipment models and their reference documents with a
-- fictional rental company, fleet and history, so its public pages show a short demo notice. An organization is a demo
-- when the platform owner puts it on the Demo plan (plan_key = 'demo', lib/plans/presets.ts). Plan fields are
-- owner-only (protect_commercial_fields, 0016/0019) and anon cannot read them, which stays true: this SECURITY DEFINER
-- function answers only yes or no for one active organization, like get_asset_return_template (0026). No table,
-- column, grant or trigger changes. Compatible with the previous code, which never calls it.

create or replace function public.is_demo_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select o.plan_key = 'demo' from public.organizations o where o.id = p_organization_id and o.status = 'active'),
    false
  );
$$;

revoke execute on function public.is_demo_organization(uuid) from public;
grant execute on function public.is_demo_organization(uuid) to anon, authenticated;
