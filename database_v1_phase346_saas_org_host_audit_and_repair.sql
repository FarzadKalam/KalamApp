-- Phase 346: Repair missing tenant hosts and provide a service-only payment-host audit.

begin;

-- Only fill an absent host from a valid existing slug. Existing configured hosts are never overwritten.
update public.saas_org_settings s
set resolved_host = lower(btrim(s.slug)) || '.tazesystem.ir',
    updated_at = now()
where nullif(btrim(coalesce(s.resolved_host, '')), '') is null
  and lower(btrim(coalesce(s.slug, ''))) ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  and lower(btrim(s.slug)) not in ('app', 'kalam', 'www');

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
  select
    s.org_id,
    o.name,
    s.slug,
    s.resolved_host,
    case
      when nullif(btrim(coalesce(s.resolved_host, '')), '') is null then 'missing_host'
      when lower(btrim(s.resolved_host)) !~ '^[a-z0-9.-]+$' then 'invalid_host'
      else 'ok'
    end,
    coalesce(g.is_active, false),
    coalesce((g.settings ->> 'online_invoice_payments_enabled')::boolean, false),
    coalesce(g.settings ->> 'gateway_scope', 'system'),
    coalesce(g.settings ->> 'payment_domain', '')
  from public.saas_org_settings s
  join public.organizations o on o.id = s.org_id
  left join lateral (
    select i.is_active, i.settings
    from public.integration_settings i
    where i.org_id = s.org_id
      and i.connection_type = 'payment_gateway'
      and coalesce(i.provider, '') = 'zarinpal'
    order by i.is_active desc, i.updated_at desc nulls last, i.created_at desc nulls last
    limit 1
  ) g on true
  order by o.name, s.org_id;
$$;

revoke all on function public.audit_saas_org_payment_hosts() from public, anon, authenticated;
grant execute on function public.audit_saas_org_payment_hosts() to service_role;

commit;
