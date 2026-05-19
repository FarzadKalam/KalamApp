begin;

create or replace function public.kalam_current_profile_role_id(p_org_id uuid default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.role_id
  from public.profiles p
  where p.id = auth.uid()
    and (p_org_id is null or p.org_id = p_org_id)
  limit 1
$$;

create or replace function public.kalam_can_access_chat_group(p_group_id uuid, p_org_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role_id uuid;
  v_group record;
begin
  if v_user_id is null or p_group_id is null then
    return false;
  end if;

  select public.kalam_current_profile_role_id(p_org_id) into v_role_id;

  select
    cg.created_by,
    coalesce(cg.user_ids, '{}'::uuid[]) as user_ids,
    coalesce(cg.role_ids, '{}'::uuid[]) as role_ids
  into v_group
  from public.chat_groups cg
  where cg.id = p_group_id
    and (p_org_id is null or cg.org_id = p_org_id)
  limit 1;

  if not found then
    return false;
  end if;

  return coalesce(v_group.created_by = v_user_id, false)
    or v_user_id = any(v_group.user_ids)
    or (v_role_id is not null and v_role_id = any(v_group.role_ids));
end;
$$;

create or replace function public.kalam_can_access_note(
  p_note_id uuid,
  p_author_id uuid,
  p_org_id uuid,
  p_mention_user_ids uuid[],
  p_mention_role_ids uuid[],
  p_reply_to uuid,
  p_metadata jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role_id uuid;
  v_group_id uuid;
  v_reply record;
  v_reply_group_id uuid;
begin
  if v_user_id is null or p_note_id is null then
    return false;
  end if;

  if p_org_id is not null and public.current_org_id() is not null and p_org_id <> public.current_org_id() then
    return false;
  end if;

  select public.kalam_current_profile_role_id(p_org_id) into v_role_id;

  if p_author_id = v_user_id then
    return true;
  end if;

  if v_user_id = any(coalesce(p_mention_user_ids, '{}'::uuid[])) then
    return true;
  end if;

  if v_role_id is not null and v_role_id = any(coalesce(p_mention_role_ids, '{}'::uuid[])) then
    return true;
  end if;

  v_group_id := public.kalam_try_uuid(coalesce(p_metadata ->> 'chat_group_id', ''));
  if v_group_id is not null and public.kalam_can_access_chat_group(v_group_id, p_org_id) then
    return true;
  end if;

  if p_reply_to is not null then
    select
      n.author_id,
      coalesce(n.mention_user_ids, '{}'::uuid[]) as mention_user_ids,
      coalesce(n.mention_role_ids, '{}'::uuid[]) as mention_role_ids,
      coalesce(n.metadata, '{}'::jsonb) as metadata
    into v_reply
    from public.notes n
    where n.id = p_reply_to
      and (p_org_id is null or n.org_id = p_org_id)
    limit 1;

    if found then
      if v_reply.author_id = v_user_id then
        return true;
      end if;

      if v_user_id = any(v_reply.mention_user_ids) then
        return true;
      end if;

      if v_role_id is not null and v_role_id = any(v_reply.mention_role_ids) then
        return true;
      end if;

      v_reply_group_id := public.kalam_try_uuid(coalesce(v_reply.metadata ->> 'chat_group_id', ''));
      if v_reply_group_id is not null and public.kalam_can_access_chat_group(v_reply_group_id, p_org_id) then
        return true;
      end if;
    end if;
  end if;

  return false;
end;
$$;

create or replace function public.kalam_can_access_bot_group(p_group_id uuid, p_org_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role_id uuid;
  v_group record;
  v_allowed_users uuid[];
  v_allowed_roles uuid[];
begin
  if v_user_id is null or p_group_id is null then
    return false;
  end if;

  select public.kalam_current_profile_role_id(p_org_id) into v_role_id;

  select
    g.created_by,
    coalesce(g.metadata, '{}'::jsonb) as metadata
  into v_group
  from public.counterparty_bot_groups g
  where g.id = p_group_id
    and (p_org_id is null or g.org_id = p_org_id)
  limit 1;

  if not found then
    return false;
  end if;

  v_allowed_users := public.kalam_jsonb_uuid_array(v_group.metadata -> 'allowed_user_ids');
  v_allowed_roles := public.kalam_jsonb_uuid_array(v_group.metadata -> 'allowed_role_ids');

  return coalesce(v_group.created_by = v_user_id, false)
    or v_user_id = any(v_allowed_users)
    or (v_role_id is not null and v_role_id = any(v_allowed_roles));
end;
$$;

alter table if exists public.notes enable row level security;
alter table if exists public.chat_groups enable row level security;
alter table if exists public.counterparty_bot_groups enable row level security;
alter table if exists public.counterparty_bot_messages enable row level security;

drop policy if exists p_notes_auth_all on public.notes;
drop policy if exists p_notes_select_targeted on public.notes;
create policy p_notes_select_targeted
on public.notes
for select
to authenticated
using (
  public.kalam_can_access_note(
    id,
    author_id,
    org_id,
    mention_user_ids,
    mention_role_ids,
    reply_to,
    coalesce(metadata, '{}'::jsonb)
  )
);

drop policy if exists p_notes_insert_targeted on public.notes;
create policy p_notes_insert_targeted
on public.notes
for insert
to authenticated
with check (
  (org_id is null or org_id = public.current_org_id())
  and (
    author_id is null
    or author_id = auth.uid()
  )
);

drop policy if exists p_notes_update_author on public.notes;
create policy p_notes_update_author
on public.notes
for update
to authenticated
using (
  (org_id is null or org_id = public.current_org_id())
  and author_id = auth.uid()
)
with check (
  (org_id is null or org_id = public.current_org_id())
  and author_id = auth.uid()
);

drop policy if exists p_notes_delete_author on public.notes;
create policy p_notes_delete_author
on public.notes
for delete
to authenticated
using (
  (org_id is null or org_id = public.current_org_id())
  and author_id = auth.uid()
);

drop policy if exists p_chat_groups_auth_all on public.chat_groups;
drop policy if exists p_chat_groups_select_targeted on public.chat_groups;
create policy p_chat_groups_select_targeted
on public.chat_groups
for select
to authenticated
using (
  (org_id is null or org_id = public.current_org_id())
  and public.kalam_can_access_chat_group(id, org_id)
);

drop policy if exists p_chat_groups_insert_owner on public.chat_groups;
create policy p_chat_groups_insert_owner
on public.chat_groups
for insert
to authenticated
with check (
  (org_id is null or org_id = public.current_org_id())
  and created_by = auth.uid()
);

drop policy if exists p_chat_groups_update_owner on public.chat_groups;
create policy p_chat_groups_update_owner
on public.chat_groups
for update
to authenticated
using (
  (org_id is null or org_id = public.current_org_id())
  and created_by = auth.uid()
)
with check (
  (org_id is null or org_id = public.current_org_id())
  and created_by = auth.uid()
);

drop policy if exists p_chat_groups_delete_owner on public.chat_groups;
create policy p_chat_groups_delete_owner
on public.chat_groups
for delete
to authenticated
using (
  (org_id is null or org_id = public.current_org_id())
  and created_by = auth.uid()
);

drop policy if exists p_counterparty_bot_groups_org_all on public.counterparty_bot_groups;
drop policy if exists p_counterparty_bot_groups_select_targeted on public.counterparty_bot_groups;
create policy p_counterparty_bot_groups_select_targeted
on public.counterparty_bot_groups
for select
to authenticated
using (
  (org_id is null or org_id = public.current_org_id())
  and public.kalam_can_access_bot_group(id, org_id)
);

drop policy if exists p_counterparty_bot_groups_insert_targeted on public.counterparty_bot_groups;
create policy p_counterparty_bot_groups_insert_targeted
on public.counterparty_bot_groups
for insert
to authenticated
with check (
  (org_id is null or org_id = public.current_org_id())
  and created_by = auth.uid()
);

drop policy if exists p_counterparty_bot_groups_update_targeted on public.counterparty_bot_groups;
create policy p_counterparty_bot_groups_update_targeted
on public.counterparty_bot_groups
for update
to authenticated
using (
  (org_id is null or org_id = public.current_org_id())
  and public.kalam_can_access_bot_group(id, org_id)
)
with check (
  (org_id is null or org_id = public.current_org_id())
  and public.kalam_can_access_bot_group(id, org_id)
);

drop policy if exists p_counterparty_bot_groups_delete_targeted on public.counterparty_bot_groups;
create policy p_counterparty_bot_groups_delete_targeted
on public.counterparty_bot_groups
for delete
to authenticated
using (
  (org_id is null or org_id = public.current_org_id())
  and public.kalam_can_access_bot_group(id, org_id)
);

drop policy if exists p_counterparty_bot_messages_org_all on public.counterparty_bot_messages;
drop policy if exists p_counterparty_bot_messages_select_targeted on public.counterparty_bot_messages;
create policy p_counterparty_bot_messages_select_targeted
on public.counterparty_bot_messages
for select
to authenticated
using (
  (org_id is null or org_id = public.current_org_id())
  and bot_group_id is not null
  and public.kalam_can_access_bot_group(bot_group_id, org_id)
);

drop policy if exists p_counterparty_bot_messages_insert_targeted on public.counterparty_bot_messages;
create policy p_counterparty_bot_messages_insert_targeted
on public.counterparty_bot_messages
for insert
to authenticated
with check (
  (org_id is null or org_id = public.current_org_id())
  and bot_group_id is not null
  and public.kalam_can_access_bot_group(bot_group_id, org_id)
  and (
    created_by is null
    or created_by = auth.uid()
  )
);

drop policy if exists p_counterparty_bot_messages_update_targeted on public.counterparty_bot_messages;
create policy p_counterparty_bot_messages_update_targeted
on public.counterparty_bot_messages
for update
to authenticated
using (
  (org_id is null or org_id = public.current_org_id())
  and bot_group_id is not null
  and public.kalam_can_access_bot_group(bot_group_id, org_id)
)
with check (
  (org_id is null or org_id = public.current_org_id())
  and bot_group_id is not null
  and public.kalam_can_access_bot_group(bot_group_id, org_id)
);

drop policy if exists p_counterparty_bot_messages_delete_targeted on public.counterparty_bot_messages;
create policy p_counterparty_bot_messages_delete_targeted
on public.counterparty_bot_messages
for delete
to authenticated
using (
  (org_id is null or org_id = public.current_org_id())
  and bot_group_id is not null
  and public.kalam_can_access_bot_group(bot_group_id, org_id)
);

grant execute on function public.kalam_current_profile_role_id(uuid) to authenticated;
grant execute on function public.kalam_can_access_chat_group(uuid, uuid) to authenticated;
grant execute on function public.kalam_can_access_note(uuid, uuid, uuid, uuid[], uuid[], uuid, jsonb) to authenticated;
grant execute on function public.kalam_can_access_bot_group(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
