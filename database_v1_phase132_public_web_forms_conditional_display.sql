-- =====================================================
-- KalamApp - Phase 132
-- Expose module conditional display rules to public web forms
-- =====================================================

begin;

drop function if exists public.get_public_web_form(text, text);

create or replace function public.get_public_web_form(
  p_slug text default 'inquiry',
  p_hostname text default null
)
returns table (
  org_id uuid,
  form_id uuid,
  web_form jsonb,
  fields jsonb,
  company_settings jsonb,
  branding_settings jsonb,
  conditional_display jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, 'inquiry')));
  v_org_id uuid;
  v_company_settings jsonb := '{}'::jsonb;
  v_branding_settings jsonb := '{}'::jsonb;
begin
  select
    b.org_id,
    coalesce(b.company_settings, '{}'::jsonb),
    coalesce(b.branding_settings, '{}'::jsonb)
  into
    v_org_id,
    v_company_settings,
    v_branding_settings
  from public.get_public_branding(p_hostname) b
  limit 1;

  return query
  select
    v_org_id,
    wf.id,
    to_jsonb(wf.*),
    coalesce(
      (
        select jsonb_agg(to_jsonb(wff.*) order by wff.sort_order asc, wff.created_at asc)
        from public.web_form_fields wff
        where wff.web_form_id = wf.id
          and wff.is_active = true
      ),
      '[]'::jsonb
    ),
    v_company_settings,
    v_branding_settings,
    coalesce(
      (
        select i.settings #> array['modules', coalesce(wf.target_module_id, ''), 'conditionalDisplay']
        from public.integration_settings i
        where i.org_id = v_org_id
          and i.connection_type = 'module_settings'
          and i.is_active = true
        order by i.updated_at desc nulls last, i.created_at desc nulls last
        limit 1
      ),
      '{"rules":[]}'::jsonb
    )
  from public.web_forms wf
  where wf.org_id = v_org_id
    and wf.is_active = true
    and lower(wf.route_slug) = v_slug
  order by wf.updated_at desc nulls last, wf.created_at desc nulls last
  limit 1;
end;
$$;

revoke all on function public.get_public_web_form(text, text) from public;
grant execute on function public.get_public_web_form(text, text) to anon, authenticated, service_role;

commit;
