-- =====================================================
-- KalamApp - Phase 231: Notification overlay seen consistency
-- Date: 2026-06-07
-- Type: Notifications / read state / idempotent
-- =====================================================

begin;

create or replace function public.mark_notification_overlay_read_v1(
  p_section text,
  p_source_type text,
  p_source_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid := null;
  v_section text := lower(trim(coalesce(p_section, '')));
  v_source_type text := trim(coalesce(p_source_type, ''));
  v_source_id text := trim(coalesce(p_source_id, ''));
  v_allowed boolean := false;
  v_conversation_key text := null;
  v_category text := null;
  v_created_at timestamptz := null;
  v_voip_extension text := null;
  v_can_view_all_calls boolean := false;
begin
  if v_user_id is null
     or v_org_id is null
     or v_source_type = ''
     or v_source_id = '' then
    return false;
  end if;

  if v_section = 'sms_messages' then
    v_section := 'sms';
  end if;

  select
    p.role_id,
    nullif(trim(coalesce(p.voip_extension, '')), ''),
    (
      coalesce(lower(r.permissions #>> '{__voip,view}') <> 'false', true)
      and coalesce(lower(r.permissions #>> '{__voip,fields,all_call_notifications}') <> 'false', true)
    )
  into v_role_id, v_voip_extension, v_can_view_all_calls
  from public.profiles p
  left join public.org_roles r
    on r.id = p.role_id
   and r.org_id = p.org_id
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if v_section = 'notes' and v_source_type = 'note' then
    select
      true,
      lower(trim(coalesce(nii.category, ''))),
      coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id,
          n.id,
          n.author_id,
          coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'),
          coalesce(n.metadata, '{}'::jsonb),
          n.reply_to
        )
      ),
      n.created_at
    into v_allowed, v_category, v_conversation_key, v_created_at
    from public.notification_inbox_items nii
    join public.notes n
      on n.org_id = nii.org_id
     and n.id::text = nii.source_id
    where nii.org_id = v_org_id
      and nii.section = 'notes'
      and nii.source_type = v_source_type
      and nii.source_id = v_source_id
      and (
        nii.is_org_wide = true
        or v_user_id = any(nii.target_user_ids)
        or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
      )
    limit 1;
  elsif v_section = 'responsibilities' then
    select exists (
      select 1
      from public.notification_inbox_items nii
      where nii.org_id = v_org_id
        and nii.section = 'responsibilities'
        and nii.source_type = v_source_type
        and nii.source_id = v_source_id
        and (
          nii.is_org_wide = true
          or v_user_id = any(nii.target_user_ids)
          or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
        )
    ) into v_allowed;
  elsif v_section = 'tasks' and v_source_type = 'task' then
    select exists (
      select 1
      from public.tasks t
      where t.org_id = v_org_id
        and t.id::text = v_source_id
        and lower(trim(coalesce(t.status, ''))) <> 'canceled'
        and (
          (t.assignee_type = 'user' and t.assignee_id = v_user_id)
          or (
            t.assignee_type = 'role'
            and v_role_id is not null
            and (t.assignee_role_id = v_role_id or t.assignee_id = v_role_id)
          )
          or (
            nullif(trim(coalesce(t.assignee_type, '')), '') is null
            and (t.assignee_id = v_user_id or t.assignee_id = v_role_id)
          )
        )
    ) into v_allowed;
  elsif v_section = 'bot_messages' and v_source_type = 'counterparty_bot_message' then
    select
      true,
      'bot:' || m.bot_group_id::text,
      m.created_at
    into v_allowed, v_conversation_key, v_created_at
    from public.counterparty_bot_messages m
    where m.org_id = v_org_id
      and m.id::text = v_source_id
      and m.direction = 'inbound'
      and public.kalam_can_access_bot_group(m.bot_group_id, m.org_id)
    limit 1;
  elsif v_section = 'sms' and v_source_type = 'inbound_sms' then
    select exists (
      select 1
      from public.outbound_messages m
      where m.org_id = v_org_id
        and m.id::text = v_source_id
        and m.channel_type = 'sms'
        and m.direction = 'inbound'
    ) into v_allowed;
  elsif v_section = 'voip_calls' and v_source_type = 'voip_call' then
    select exists (
      select 1
      from public.voip_call_logs c
      where c.org_id = v_org_id
        and c.id::text = v_source_id
        and c.direction = 'incoming'
        and (
          v_can_view_all_calls
          or (v_voip_extension is not null and c.extension = v_voip_extension)
        )
    ) into v_allowed;
  end if;

  if not coalesce(v_allowed, false) then
    return false;
  end if;

  insert into public.notification_read_states (
    org_id,
    user_id,
    section,
    source_type,
    source_id,
    read_at,
    dismissed_at,
    snoozed_until,
    updated_at
  )
  values (
    v_org_id,
    v_user_id,
    v_section,
    v_source_type,
    v_source_id,
    now(),
    null,
    null,
    now()
  )
  on conflict (org_id, user_id, source_type, source_id) do update
  set section = excluded.section,
      read_at = coalesce(public.notification_read_states.read_at, excluded.read_at),
      snoozed_until = null,
      updated_at = now();

  if v_section = 'notes'
     and v_category not in ('system', 'assistant')
     and v_conversation_key is not null
     and v_conversation_key <> 'system'
     and v_created_at is not null then
    perform public.mark_communication_read(
      'internal',
      v_conversation_key,
      v_created_at,
      v_source_id
    );
  elsif v_section = 'bot_messages'
     and v_conversation_key is not null
     and v_created_at is not null then
    perform public.mark_communication_read(
      'bot',
      v_conversation_key,
      v_created_at,
      v_source_id
    );
  end if;

  return true;
end;
$$;

grant execute on function public.mark_notification_overlay_read_v1(text, text, text) to authenticated;
revoke all on function public.mark_notification_overlay_read_v1(text, text, text) from public, anon;

notify pgrst, 'reload schema';

commit;
