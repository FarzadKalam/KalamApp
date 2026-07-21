-- TazeSystem - Phase 358: shared call access scope and notes query performance
-- All call visibility is resolved from voip_call_reports.record_scope:
-- all = all incoming/outgoing user calls, own = current user's calls,
-- team = calls belonging to the current role. Advanced conditions continue to
-- use the existing view_conditions contract on the client, like other modules.

begin;

create or replace function public.kalam_can_view_voip_call(
  p_row_org_id uuid,
  p_assignee_type text default null,
  p_assignee_id uuid default null,
  p_assignee_role_id uuid default null,
  p_extension text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid;
  v_user_extension text;
  v_permissions jsonb := '{}'::jsonb;
  v_module_perm jsonb := '{}'::jsonb;
  v_scope text;
  v_assignee_type text := lower(trim(coalesce(p_assignee_type, '')));
  v_row_user_id uuid;
  v_row_role_id uuid;
  v_extension text := nullif(trim(coalesce(p_extension, '')), '');
begin
  if v_user_id is null or v_org_id is null or p_row_org_id is distinct from v_org_id then
    return false;
  end if;

  select p.role_id, p.voip_extension, coalesce(r.permissions, '{}'::jsonb)
    into v_role_id, v_user_extension, v_permissions
  from public.profiles p
  left join public.org_roles r
    on r.id = p.role_id
   and r.org_id = p.org_id
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if not found then
    return false;
  end if;

  v_module_perm := coalesce(v_permissions -> 'voip_call_reports', '{}'::jsonb);
  if lower(coalesce(v_module_perm ->> 'view', 'true')) = 'false' then
    return false;
  end if;

  v_scope := lower(trim(coalesce(
    nullif(v_module_perm ->> 'record_scope', ''),
    case
      when lower(coalesce(v_permissions -> '__voip' -> 'fields' ->> 'all_call_notifications', 'true')) = 'true' then 'all'
      else 'own'
    end
  )));

  if v_scope = 'all' then
    return true;
  end if;

  if v_assignee_type = 'role' then
    v_row_role_id := coalesce(p_assignee_role_id, p_assignee_id);
  elsif v_assignee_type = 'user' then
    v_row_user_id := p_assignee_id;
  else
    v_row_user_id := p_assignee_id;
    v_row_role_id := p_assignee_role_id;
  end if;

  if v_scope = 'own' then
    return v_row_user_id = v_user_id
      or (
        nullif(trim(coalesce(v_user_extension, '')), '') is not null
        and v_extension = nullif(trim(coalesce(v_user_extension, '')), '')
      );
  end if;

  if v_scope in ('team', 'subtree') then
    return (
      v_row_role_id is not null
      and v_role_id is not null
      and (
        (v_scope = 'team' and v_row_role_id = v_role_id)
        or (
          v_scope = 'subtree'
          and v_row_role_id in (
            with recursive role_tree as (
              select id
              from public.org_roles
              where id = v_role_id and org_id = v_org_id
              union all
              select child.id
              from public.org_roles child
              join role_tree parent on child.parent_id = parent.id
              where child.org_id = v_org_id
            )
            select id from role_tree
          )
        )
      )
    )
    or (
      v_row_user_id is not null
      and exists (
        select 1
        from public.profiles row_profile
        where row_profile.id = v_row_user_id
          and row_profile.org_id = v_org_id
          and (
            (v_scope = 'team' and row_profile.role_id = v_role_id)
            or (
              v_scope = 'subtree'
              and row_profile.role_id in (
                with recursive role_tree as (
                  select id
                  from public.org_roles
                  where id = v_role_id and org_id = v_org_id
                  union all
                  select child.id
                  from public.org_roles child
                  join role_tree parent on child.parent_id = parent.id
                  where child.org_id = v_org_id
                )
                select id from role_tree
              )
            )
          )
      )
    )
    or (
      v_extension is not null
      and exists (
        select 1
        from public.profiles extension_profile
        where extension_profile.org_id = v_org_id
          and nullif(trim(coalesce(extension_profile.voip_extension, '')), '') = v_extension
          and (
            (v_scope = 'team' and extension_profile.role_id = v_role_id)
            or (
              v_scope = 'subtree'
              and extension_profile.role_id in (
                with recursive role_tree as (
                  select id
                  from public.org_roles
                  where id = v_role_id and org_id = v_org_id
                  union all
                  select child.id
                  from public.org_roles child
                  join role_tree parent on child.parent_id = parent.id
                  where child.org_id = v_org_id
                )
                select id from role_tree
              )
            )
          )
      )
    );
  end if;

  return false;
end;
$$;

create or replace function public.kalam_can_view_communication_record_v3(
  p_channel text,
  p_row_org_id uuid,
  p_assignee_type text default null,
  p_assignee_id uuid default null,
  p_assignee_role_id uuid default null,
  p_module_id text default null,
  p_record_id uuid default null,
  p_related_module_id text default null,
  p_related_record_id uuid default null,
  p_customer_id uuid default null,
  p_source_number text default null,
  p_destination_number text default null,
  p_extension text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_channel text := lower(trim(coalesce(p_channel, '')));
  v_module_id text := lower(trim(coalesce(p_module_id, '')));
  v_related_module_id text := lower(trim(coalesce(p_related_module_id, '')));
begin
  if auth.uid() is null or public.current_org_id() is null or p_row_org_id is distinct from public.current_org_id() then
    return false;
  end if;

  if v_channel = 'voip' and public.kalam_can_view_voip_call(
    p_row_org_id, p_assignee_type, p_assignee_id, p_assignee_role_id, p_extension
  ) then
    return true;
  end if;

  if v_module_id in ('customers', 'suppliers', 'employees')
    and public.kalam_can_view_related_communication_target(v_module_id, p_record_id, p_row_org_id) then
    return true;
  end if;

  if v_related_module_id in ('customers', 'suppliers', 'employees')
    and public.kalam_can_view_related_communication_target(v_related_module_id, p_related_record_id, p_row_org_id) then
    return true;
  end if;

  if p_customer_id is not null
    and public.kalam_can_view_related_communication_target('customers', p_customer_id, p_row_org_id) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.get_accessible_voip_call_logs(
  p_limit integer default 80
)
returns table (
  id uuid,
  title text,
  direction text,
  status text,
  source_number text,
  destination_number text,
  extension text,
  module_id text,
  record_id text,
  related_module_id text,
  related_record_id uuid,
  phone_number_id uuid,
  phone_match_status text,
  assignee_id uuid,
  assignee_type text,
  assignee_role_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz,
  talk_seconds integer,
  wait_seconds integer,
  call_id text,
  file_id text,
  recording_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.title,
    c.direction,
    c.status,
    c.source_number,
    c.destination_number,
    c.extension,
    c.module_id,
    c.record_id,
    c.related_module_id,
    public.kalam_try_uuid(c.related_record_id) as related_record_id,
    c.phone_number_id,
    c.phone_match_status,
    c.assignee_id,
    c.assignee_type,
    c.assignee_role_id,
    c.started_at,
    c.ended_at,
    c.created_at,
    c.talk_seconds,
    c.wait_seconds,
    c.call_id,
    c.file_id,
    c.recording_url
  from public.voip_call_logs c
  where c.org_id = public.current_org_id()
    and public.kalam_can_view_communication_record_v3(
      'voip',
      c.org_id,
      c.assignee_type,
      c.assignee_id,
      c.assignee_role_id,
      c.module_id,
      public.kalam_try_uuid(c.record_id),
      c.related_module_id,
      public.kalam_try_uuid(c.related_record_id),
      null::uuid,
      c.source_number,
      c.destination_number,
      c.extension
    )
  order by c.started_at desc nulls last, c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
$$;

drop policy if exists p_voip_call_logs_org_all on public.voip_call_logs;
drop policy if exists p_voip_call_logs_select_access on public.voip_call_logs;
create policy p_voip_call_logs_select_access on public.voip_call_logs
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.kalam_can_view_communication_record_v3(
      'voip', org_id, assignee_type, assignee_id, assignee_role_id,
      module_id, public.kalam_try_uuid(record_id), null, null, null,
      source_number, destination_number, extension
    )
  );

drop policy if exists p_voip_call_logs_insert_org on public.voip_call_logs;
create policy p_voip_call_logs_insert_org on public.voip_call_logs
  for insert
  to authenticated
  with check (org_id = public.current_org_id());

drop policy if exists p_voip_call_logs_update_org on public.voip_call_logs;
create policy p_voip_call_logs_update_org on public.voip_call_logs
  for update
  to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists p_voip_call_logs_delete_org on public.voip_call_logs;
create policy p_voip_call_logs_delete_org on public.voip_call_logs
  for delete
  to authenticated
  using (org_id = public.current_org_id());

create index if not exists idx_voip_call_logs_org_extension_started
  on public.voip_call_logs(org_id, extension, started_at desc, id desc)
  where extension is not null;

create index if not exists idx_notes_org_mention_role_created
  on public.notes(org_id, created_at desc, id desc)
  where cardinality(mention_role_ids) > 0;

grant execute on function public.kalam_can_view_voip_call(uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.kalam_can_view_communication_record_v3(text, uuid, text, uuid, uuid, text, uuid, text, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.get_accessible_voip_call_logs(integer) to authenticated;
revoke all on function public.kalam_can_view_voip_call(uuid, text, uuid, uuid, text) from public, anon;
revoke all on function public.kalam_can_view_communication_record_v3(text, uuid, text, uuid, uuid, text, uuid, text, uuid, uuid, text, text, text) from public, anon;
revoke all on function public.get_accessible_voip_call_logs(integer) from public, anon;

notify pgrst, 'reload schema';

commit;
