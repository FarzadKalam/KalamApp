-- Public branding resolver for pre-login runtime bootstrap.
-- Current phase behavior:
-- 1) If hostname first label matches organizations.slug, use that org.
-- 2) Otherwise fallback to the primary company/org record.
-- This keeps today's single-org deployment working and is ready for future subdomain routing.

create or replace function public.get_public_branding(p_hostname text default null)
returns table (
  org_id uuid,
  company_settings jsonb,
  branding_settings jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hostname text := lower(trim(coalesce(p_hostname, '')));
  v_host_label text := split_part(v_hostname, '.', 1);
  v_org_id uuid;
begin
  if v_host_label <> '' then
    select o.id
      into v_org_id
    from public.organizations o
    where lower(coalesce(o.slug, '')) = v_host_label
    order by o.created_at asc nulls last
    limit 1;
  end if;

  if v_org_id is null then
    select cs.org_id
      into v_org_id
    from public.company_settings cs
    where cs.org_id is not null
    order by cs.updated_at desc nulls last, cs.created_at desc nulls last
    limit 1;
  end if;

  if v_org_id is null then
    select o.id
      into v_org_id
    from public.organizations o
    order by o.created_at asc nulls last
    limit 1;
  end if;

  return query
  with company_row as (
    select to_jsonb(cs.*) as payload
    from public.company_settings cs
    where (
      (v_org_id is null and cs.org_id is null)
      or cs.org_id = v_org_id
    )
    order by cs.updated_at desc nulls last, cs.created_at desc nulls last
    limit 1
  ),
  branding_row as (
    select coalesce(to_jsonb(i.settings), '{}'::jsonb) as payload
    from public.integration_settings i
    where i.connection_type = 'ui_theme'
      and coalesce(i.provider, '') = 'branding'
      and (
        (v_org_id is null and i.org_id is null)
        or i.org_id = v_org_id
      )
    order by i.updated_at desc nulls last, i.created_at desc nulls last
    limit 1
  )
  select
    v_org_id,
    coalesce((select payload from company_row), '{}'::jsonb),
    coalesce((select payload from branding_row), '{}'::jsonb);
end;
$$;

revoke all on function public.get_public_branding(text) from public;
grant execute on function public.get_public_branding(text) to anon, authenticated, service_role;
