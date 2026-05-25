-- =====================================================
-- TazeSystem - Phase 201: internal login branding resolution
-- Date: 2026-05-25
-- Type: Corrective / idempotent migration
-- Goal:
--   Resolve the internal app host branding from its explicitly privileged org
--   without hardcoding an organization identifier or weakening tenant isolation.
-- =====================================================

begin;

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
  v_tenant_context jsonb;
  v_internal_candidate_count integer := 0;
  v_is_taze_family boolean := (
    v_hostname = 'tazesystem.ir'
    or v_hostname = 'www.tazesystem.ir'
    or v_hostname = 'app.tazesystem.ir'
    or v_hostname like '%.tazesystem.ir'
  );
  v_is_shared_host boolean := v_hostname in (
    'tazesystem.ir',
    'www.tazesystem.ir',
    'app.tazesystem.ir',
    'kalam.tazesystem.ir'
  );
begin
  if v_hostname <> '' then
    v_tenant_context := public.resolve_saas_org_context(null, null, v_hostname);
    if v_tenant_context is not null and coalesce(v_tenant_context->>'org_id', '') <> '' then
      v_org_id := (v_tenant_context->>'org_id')::uuid;
    elsif v_hostname = 'kalam.tazesystem.ir' then
      -- The internal operator org is the only org with explicit SaaS admin
      -- roles. Multiple matches fail closed rather than exposing another org.
      select count(*), (array_agg(candidate.org_id))[1]
        into v_internal_candidate_count, v_org_id
      from (
        select distinct cs.org_id
        from public.company_settings cs
        join public.org_roles r
          on r.org_id = cs.org_id
        where cs.org_id is not null
          and (
            lower(coalesce(r.permissions->'__saas_admin'->>'view', 'false')) = 'true'
            or lower(coalesce(r.permissions->'__saas_admin'->>'edit', 'false')) = 'true'
          )
      ) candidate;

      if v_internal_candidate_count <> 1 then
        return;
      end if;
    elsif not v_is_taze_family and v_host_label <> '' then
      select o.id
        into v_org_id
      from public.organizations o
      where lower(coalesce(o.slug, '')) = v_host_label
      order by o.created_at asc nulls last
      limit 1;
    end if;
  end if;

  if v_org_id is null and v_is_taze_family and not v_is_shared_host then
    return;
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

notify pgrst, 'reload schema';

commit;
