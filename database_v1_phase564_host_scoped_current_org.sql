-- TazeSystem V1 - Phase 564
-- Host-scoped tenant resolution for users with memberships in multiple orgs.
-- The profile row keeps a legacy active org, but a tenant host must win for
-- every request so two tenant tabs can safely remain open at the same time.

begin;

create or replace function public.current_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_org_id uuid;
  v_host text := '';
  v_host_org_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select p.org_id
    into v_profile_org_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  begin
    v_host := lower(trim(split_part(regexp_replace(
      coalesce((current_setting('request.headers', true)::jsonb ->> 'origin'), ''),
      '^https?://', ''
    ), '/', 1)));
    v_host := split_part(v_host, ':', 1);
  exception when others then
    v_host := '';
  end;

  if v_host <> '' then
    select s.org_id
      into v_host_org_id
    from public.saas_org_settings s
    where lower(trim(coalesce(s.resolved_host, ''))) = v_host
    limit 1;
  end if;

  if v_host_org_id is not null then
    if exists (
      select 1
      from public.user_organization_memberships m
      where m.user_id = auth.uid()
        and m.org_id = v_host_org_id
        and m.is_active = true
    ) then
      return v_host_org_id;
    end if;
    return null;
  end if;

  return v_profile_org_id;
end;
$$;

notify pgrst, 'reload schema';

commit;
