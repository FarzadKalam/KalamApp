-- =====================================================
-- KalamApp - Phase 357
-- Public web forms: always return organization module conditional-display rules
-- =====================================================

begin;

drop function if exists public.get_public_web_form(text, text, text);
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

create or replace function public.get_public_web_form(
  p_slug text,
  p_hostname text,
  p_access_token text
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
  v_row record;
  v_token_context jsonb := '{}'::jsonb;
  v_token_form_id uuid;
begin
  if nullif(trim(coalesce(p_access_token, '')), '') is not null then
    v_token_context := public._resolve_web_form_link_context(p_access_token, null, null);
    if nullif(coalesce(v_token_context->>'web_form_id', ''), '') is not null then
      v_token_form_id := (v_token_context->>'web_form_id')::uuid;
    end if;
  end if;

  select *
    into v_row
  from public.get_public_web_form(p_slug, p_hostname)
  limit 1;

  if v_row.form_id is null then
    return;
  end if;

  if v_token_form_id is not null and v_row.form_id is distinct from v_token_form_id then
    raise exception 'WEB_FORM_TOKEN_MISMATCH';
  end if;

  org_id := v_row.org_id;
  form_id := v_row.form_id;
  web_form := v_row.web_form;
  fields := v_row.fields;
  company_settings := v_row.company_settings;
  branding_settings := v_row.branding_settings;
  conditional_display := v_row.conditional_display;
  return next;
end;
$$;

revoke all on function public.get_public_web_form(text, text, text) from public;
grant execute on function public.get_public_web_form(text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
