begin;

-- Keep the existing form routines and token overloads. Patch only their
-- authorization boundary and abort if an upstream definition has changed.
do $migration$
declare
  definition text;
  anchor text;
begin
  definition := pg_get_functiondef('public.submit_public_web_form(text,jsonb,jsonb,text)'::regprocedure);
  if strpos(definition, 'WEB_FORM_ORG_ACCESS_DENIED') = 0 then
    anchor := $old$  if coalesce(v_form.access_scope, 'public') = 'internal' and auth.uid() is null then
    raise exception 'WEB_FORM_AUTH_REQUIRED';
  end if;$old$;
    if strpos(definition, anchor) = 0 then
      raise exception 'Unexpected submit_public_web_form definition';
    end if;
    execute replace(definition, anchor, $new$  if v_form.access_scope = 'internal' then
    if auth.uid() is null then
      raise exception 'WEB_FORM_AUTH_REQUIRED';
    end if;
    if not exists (
      select 1 from public.user_organization_memberships m
      join public.organizations o on o.id = m.org_id and o.is_active
      where m.org_id = v_form.org_id and m.user_id = auth.uid() and m.is_active
    ) then
      raise exception 'WEB_FORM_ORG_ACCESS_DENIED' using errcode = '42501';
    end if;
  end if;$new$);
  end if;

  definition := pg_get_functiondef('public.get_public_web_form(text,text)'::regprocedure);
  if strpos(definition, 'WEB_FORM_ORG_ACCESS_DENIED') = 0 then
    anchor := $old$  return query
  select
    v_org_id,
    wf.id,
    to_jsonb(wf.*),$old$;
    if strpos(definition, anchor) = 0 then
      raise exception 'Unexpected get_public_web_form definition';
    end if;
    execute replace(definition, anchor, $new$  -- Anonymous visitors receive only what the sign-in screen needs.
  if (select wf.access_scope from public.web_forms wf
      where wf.org_id = v_org_id and wf.is_active and lower(wf.route_slug) = v_slug
      order by wf.updated_at desc nulls last, wf.created_at desc nulls last limit 1) = 'internal'
    and not exists (
      select 1 from public.user_organization_memberships m
      join public.organizations o on o.id = m.org_id and o.is_active
      where m.org_id = v_org_id and m.user_id = auth.uid() and m.is_active
    ) then
    if auth.uid() is not null then
      raise exception 'WEB_FORM_ORG_ACCESS_DENIED' using errcode = '42501';
    end if;
    return query
      select v_org_id, wf.id, jsonb_build_object('access_scope', 'internal'),
        '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"rules":[]}'::jsonb
      from public.web_forms wf
      where wf.org_id = v_org_id and wf.is_active and lower(wf.route_slug) = v_slug
      order by wf.updated_at desc nulls last, wf.created_at desc nulls last limit 1;
    return;
  end if;

  return query
  select
    v_org_id,
    wf.id,
    to_jsonb(wf.*),$new$);
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
