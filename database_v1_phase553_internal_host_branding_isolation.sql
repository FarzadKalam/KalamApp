-- =====================================================
-- TazeSystem - Phase 553: internal host branding isolation
-- Date: 2026-10-23
-- Type: Corrective / idempotent migration
-- Goal:
--   Resolve internal hosts only from the non-provider internal organization.
--   A SaaS provider with the same admin permission must never supply this brand.
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
  v_org_id uuid;
  v_tenant_context jsonb;
  v_internal_candidate_count integer := 0;
  v_is_shared_host boolean := v_hostname in (
    'tazesystem.ir',
    'www.tazesystem.ir',
    'app.tazesystem.ir',
    'kalam.tazesystem.ir',
    'kalamapp.ir',
    'www.kalamapp.ir'
  );
begin
  if v_hostname <> '' then
    if v_hostname in ('kalam.tazesystem.ir', 'kalamapp.ir', 'www.kalamapp.ir') then
      -- Resolve the internal organization without relying on an org ID or on
      -- admin permission alone, which the SaaS provider also has.
      select count(*), (array_agg(candidate.org_id))[1]
        into v_internal_candidate_count, v_org_id
      from (
        select distinct cs.org_id
        from public.company_settings cs
        join public.org_roles r
          on r.org_id = cs.org_id
        left join public.saas_org_settings s on s.org_id = cs.org_id
        where cs.org_id is not null
          and coalesce(s.is_billing_provider, false) = false
          and nullif(trim(coalesce(s.resolved_host, '')), '') is null
          and (
            lower(coalesce(r.permissions->'__saas_admin'->>'view', 'false')) = 'true'
            or lower(coalesce(r.permissions->'__saas_admin'->>'edit', 'false')) = 'true'
          )
      ) candidate;

      if v_internal_candidate_count <> 1 then
        return;
      end if;
    else
      v_tenant_context := public.resolve_saas_org_context(null, null, v_hostname);
      if v_tenant_context is not null and coalesce(v_tenant_context->>'org_id', '') <> '' then
        v_org_id := (v_tenant_context->>'org_id')::uuid;
      end if;
    end if;
  end if;

  if v_org_id is null and not v_is_shared_host then
    return;
  end if;

  return query
  with company_row as (
    -- Public branding and contact details only. Internal company identifiers,
    -- signatory images and operational settings must not reach anonymous users.
    select jsonb_build_object(
      'company_name', cs.company_name,
      'company_full_name', cs.company_full_name,
      'company_name_en', cs.company_name_en,
      'trade_name', cs.trade_name,
      'brand_palette_key', cs.brand_palette_key,
      'logo_url', cs.logo_url,
      'icon_url', cs.icon_url,
      'currency_code', cs.currency_code,
      'currency_label', cs.currency_label,
      'slogan', cs.slogan,
      'website', cs.website,
      'email', cs.email,
      'mobile', cs.mobile,
      'phone', cs.phone,
      'address', cs.address,
      'instagram_id', cs.instagram_id,
      'telegram_id', cs.telegram_id,
      'youtube_url', cs.youtube_url,
      'whatsapp_number', cs.whatsapp_number,
      'eitaa_id', cs.eitaa_id,
      'rubika_id', cs.rubika_id,
      'bale_id', cs.bale_id
    ) as payload
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
    coalesce(
      (select payload from company_row),
      (select jsonb_build_object('company_full_name', o.name) from public.organizations o where o.id = v_org_id),
      '{}'::jsonb
    ),
    coalesce((select payload from branding_row), '{}'::jsonb);
end;
$$;

revoke all on function public.get_public_branding(text) from public;
grant execute on function public.get_public_branding(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
