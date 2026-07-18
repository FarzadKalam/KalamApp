-- Phase 347: Include the internal SaaS-admin organization in the payment-host audit.

begin;

create or replace function public.audit_saas_org_payment_hosts()
returns table (
  org_id uuid,
  org_name text,
  slug text,
  resolved_host text,
  host_status text,
  gateway_active boolean,
  online_invoice_payments_enabled boolean,
  gateway_scope text,
  payment_domain text
)
language sql
stable
security definer
set search_path = public
as $$
  with tenant_orgs as (
    select s.org_id, s.slug, s.resolved_host, false as is_internal_saas_admin
    from public.saas_org_settings s
  ),
  internal_saas_admin_orgs as (
    select distinct r.org_id, null::text as slug, 'kalam.tazesystem.ir'::text as resolved_host, true as is_internal_saas_admin
    from public.org_roles r
    where coalesce((r.permissions -> '__saas_admin' ->> 'view')::boolean, false) = true
       or coalesce((r.permissions -> '__saas_admin' ->> 'edit')::boolean, false) = true
       or exists (
         select 1
         from jsonb_each(coalesce(r.permissions -> '__saas_admin' -> 'fields', '{}'::jsonb)) as field_permission(key, value)
         where field_permission.value = 'true'::jsonb
       )
  ),
  audited_orgs as (
    select * from tenant_orgs
    union all
    select a.*
    from internal_saas_admin_orgs a
    where not exists (select 1 from tenant_orgs t where t.org_id = a.org_id)
  )
  select
    a.org_id,
    o.name,
    a.slug,
    a.resolved_host,
    case
      when a.is_internal_saas_admin then 'internal_saas_admin'
      when nullif(btrim(coalesce(a.resolved_host, '')), '') is null then 'missing_host'
      when lower(btrim(a.resolved_host)) !~ '^[a-z0-9.-]+$' then 'invalid_host'
      else 'ok'
    end,
    coalesce(g.is_active, false),
    coalesce((g.settings ->> 'online_invoice_payments_enabled')::boolean, false),
    coalesce(g.settings ->> 'gateway_scope', 'system'),
    coalesce(g.settings ->> 'payment_domain', '')
  from audited_orgs a
  join public.organizations o on o.id = a.org_id
  left join lateral (
    select i.is_active, i.settings
    from public.integration_settings i
    where i.org_id = a.org_id
      and i.connection_type = 'payment_gateway'
      and coalesce(i.provider, '') = 'zarinpal'
    order by i.is_active desc, i.updated_at desc nulls last, i.created_at desc nulls last
    limit 1
  ) g on true
  order by o.name, a.org_id;
$$;

revoke all on function public.audit_saas_org_payment_hosts() from public, anon, authenticated;
grant execute on function public.audit_saas_org_payment_hosts() to service_role;

commit;
