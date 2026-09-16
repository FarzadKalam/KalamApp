begin;

-- سازمان ارائه‌دهنده فقط یک‌بار ایجاد می‌شود و از هر سازمان مشتری جداست.
do $$
declare
  provider_org_id uuid;
  provider_role_id uuid;
begin
  select org_id into provider_org_id
  from public.saas_org_settings
  where is_billing_provider = true
  order by created_at asc
  limit 1;

  if provider_org_id is null then
    select org_id into provider_org_id
    from public.saas_org_settings
    where lower(coalesce(resolved_host, '')) = 'panel.tazesystem.ir'
       or lower(coalesce(slug, '')) = 'panel'
    order by created_at asc
    limit 1;
  end if;

  if provider_org_id is null then
    insert into public.organizations(name, slug, is_active)
    values ('تازه سیستم', 'panel', true)
    returning id into provider_org_id;

    insert into public.saas_org_settings(
      org_id, slug, resolved_host, status, is_demo, is_readonly,
      provisioning_source, dns_status, is_billing_provider
    ) values (
      provider_org_id, 'panel', 'panel.tazesystem.ir', 'active', false, false,
      'saas_provider', 'active', true
    );
  else
    update public.saas_org_settings
    set slug = 'panel',
        resolved_host = 'panel.tazesystem.ir',
        is_billing_provider = true,
        status = 'active',
        is_readonly = false,
        updated_at = now()
    where org_id = provider_org_id;
  end if;

  select id into provider_role_id
  from public.org_roles
  where org_id = provider_org_id
    and coalesce((permissions -> '__saas_admin' ->> 'view')::boolean, false)
  order by created_at asc
  limit 1;

  if provider_role_id is null then
    insert into public.org_roles(org_id, title, permissions, is_system)
    values (
      provider_org_id,
      'مدیر تازه سیستم',
      jsonb_build_object('__saas_admin', jsonb_build_object('view', true, 'edit', true, 'edit_orgs', true, 'edit_requests', true)),
      true
    )
    returning id into provider_role_id;
  else
    update public.org_roles
    set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
      '__saas_admin', jsonb_build_object('view', true, 'edit', true, 'edit_orgs', true, 'edit_requests', true)
    )
    where id = provider_role_id;
  end if;

  -- همه مدیران SaaS موجود، بدون وابستگی به شناسه یا ایمیل شخصی، به پنل ارائه‌دهنده دسترسی می‌گیرند.
  insert into public.user_organization_memberships(user_id, org_id, role_id, software_role, is_owner, is_active)
  select distinct p.id, provider_org_id, provider_role_id, 'admin', false, true
  from public.profiles p
  join public.org_roles r on r.id = p.role_id
  where coalesce((r.permissions -> '__saas_admin' ->> 'view')::boolean, false)
  on conflict (user_id, org_id) do update
  set role_id = excluded.role_id,
      software_role = excluded.software_role,
      is_active = true,
      updated_at = now();
end;
$$;

create or replace function public.activate_saas_admin_panel_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_org_id uuid;
  provider_role_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select s.org_id into provider_org_id
  from public.saas_org_settings s
  where s.is_billing_provider = true
    and lower(coalesce(s.resolved_host, '')) = 'panel.tazesystem.ir'
  order by s.created_at asc
  limit 1;

  if provider_org_id is null then
    raise exception using errcode = '23503', message = 'saas_provider_org_missing';
  end if;

  select r.id into provider_role_id
  from public.org_roles r
  where r.org_id = provider_org_id
    and coalesce((r.permissions -> '__saas_admin' ->> 'view')::boolean, false)
  order by r.created_at asc
  limit 1;

  if provider_role_id is null then
    raise exception using errcode = '23503', message = 'saas_provider_role_missing';
  end if;

  if not public.current_user_has_saas_admin_permission()
     and not exists (
       select 1
       from public.user_organization_memberships m
       join public.org_roles r on r.id = m.role_id and r.org_id = m.org_id
       where m.user_id = auth.uid()
         and m.org_id = provider_org_id
         and m.is_active = true
         and coalesce((r.permissions -> '__saas_admin' ->> 'view')::boolean, false)
     ) then
    raise exception using errcode = '42501', message = 'saas_admin_permission_required';
  end if;

  insert into public.user_organization_memberships(user_id, org_id, role_id, software_role, is_owner, is_active)
  values (auth.uid(), provider_org_id, provider_role_id, 'admin', false, true)
  on conflict (user_id, org_id) do update
  set role_id = excluded.role_id,
      software_role = excluded.software_role,
      is_active = true,
      updated_at = now();

  update public.profiles
  set org_id = provider_org_id,
      role_id = provider_role_id,
      role = 'admin',
      updated_at = now()
  where id = auth.uid();

  return jsonb_build_object('success', true, 'resolved_host', 'panel.tazesystem.ir');
end;
$$;

revoke all on function public.activate_saas_admin_panel_context() from public, anon;
grant execute on function public.activate_saas_admin_panel_context() to authenticated;

notify pgrst, 'reload schema';

commit;
