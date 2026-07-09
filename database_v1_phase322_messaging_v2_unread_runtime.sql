-- =====================================================
-- TazeSystem - Phase 322: Messaging V2 unread/read runtime consolidation
-- Date: 2026-07-10
-- Type: Bug fix / performance / idempotent
-- =====================================================

begin;

alter table if exists public.notification_read_states
  drop constraint if exists chk_notification_read_states_section;

alter table if exists public.notification_read_states
  add constraint chk_notification_read_states_section
    check (section in (
      'notes',
      'bot_messages',
      'bot_direct_messages',
      'tasks',
      'responsibilities',
      'voip_calls',
      'sms',
      'sms_messages',
      'system'
    )) not valid;

create index if not exists idx_notification_read_states_messaging_v2_lookup
  on public.notification_read_states(org_id, user_id, section, source_type, source_id);

create index if not exists idx_communication_read_cursors_messaging_v2_lookup
  on public.communication_read_cursors(org_id, user_id, channel, conversation_key);

create index if not exists idx_counterparty_bot_messages_unread_v2
  on public.counterparty_bot_messages(org_id, bot_group_id, created_at desc, id desc)
  where direction = 'inbound';

create index if not exists idx_counterparty_bot_direct_messages_unread_v2
  on public.counterparty_bot_direct_messages(org_id, direct_thread_id, created_at desc, id desc)
  where direction = 'inbound';

create index if not exists idx_outbound_messages_sms_unread_v2
  on public.outbound_messages(org_id, channel_type, direction, (coalesce(received_at, sent_at, created_at)) desc, id desc)
  where channel_type = 'sms' and direction = 'inbound';

create index if not exists idx_voip_call_logs_unread_v2
  on public.voip_call_logs(org_id, direction, (coalesce(started_at, created_at)) desc, id desc)
  where direction = 'incoming';

create or replace function public.kalam_notification_read_section_v2(p_section text, p_source_type text default null)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(trim(coalesce(p_section, ''))) in ('sms', 'sms_messages') then 'sms_messages'
    when lower(trim(coalesce(p_section, ''))) in ('bot_direct', 'bot_direct_messages')
      or lower(trim(coalesce(p_source_type, ''))) = 'counterparty_bot_direct_message'
      then 'bot_direct_messages'
    when lower(trim(coalesce(p_section, ''))) in ('bot', 'bot_group', 'bot_group_messages', 'bot_messages') then 'bot_messages'
    else lower(trim(coalesce(p_section, '')))
  end;
$$;

create or replace function public.mark_messaging_read_v2(
  p_channel text default null,
  p_conversation_key text default null,
  p_read_through_at timestamptz default null,
  p_read_through_id text default null,
  p_entries jsonb default '[]'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_channel text := lower(trim(coalesce(p_channel, '')));
  v_conversation_key text := trim(coalesce(p_conversation_key, ''));
  v_read_through_id text := trim(coalesce(p_read_through_id, ''));
  v_entry jsonb;
  v_section text;
  v_source_type text;
  v_source_id text;
  v_read_at timestamptz := now();
begin
  if v_user_id is null or v_org_id is null then
    return false;
  end if;

  if v_channel <> '' and v_conversation_key <> '' and p_read_through_at is not null then
    insert into public.communication_read_cursors (
      org_id,
      user_id,
      channel,
      conversation_key,
      read_through_at,
      read_through_id,
      updated_at
    )
    values (
      v_org_id,
      v_user_id,
      v_channel,
      v_conversation_key,
      p_read_through_at,
      nullif(v_read_through_id, ''),
      now()
    )
    on conflict (org_id, user_id, channel, conversation_key) do update
    set read_through_at = greatest(public.communication_read_cursors.read_through_at, excluded.read_through_at),
        read_through_id = case
          when excluded.read_through_at > public.communication_read_cursors.read_through_at then excluded.read_through_id
          when excluded.read_through_at = public.communication_read_cursors.read_through_at
            and coalesce(excluded.read_through_id, '') > coalesce(public.communication_read_cursors.read_through_id, '')
            then excluded.read_through_id
          else public.communication_read_cursors.read_through_id
        end,
        updated_at = now();
  end if;

  if jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) = 'array' then
    for v_entry in select value from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb))
    loop
      v_source_type := trim(coalesce(v_entry->>'source_type', v_entry->>'sourceType', ''));
      v_source_id := trim(coalesce(v_entry->>'source_id', v_entry->>'sourceId', ''));
      v_section := public.kalam_notification_read_section_v2(
        coalesce(v_entry->>'section', ''),
        v_source_type
      );

      if v_section <> '' and v_source_type <> '' and v_source_id <> '' then
        insert into public.notification_read_states (
          org_id,
          user_id,
          section,
          source_type,
          source_id,
          read_at,
          snoozed_until,
          updated_at
        )
        values (
          v_org_id,
          v_user_id,
          v_section,
          v_source_type,
          v_source_id,
          v_read_at,
          null,
          now()
        )
        on conflict (org_id, user_id, source_type, source_id) do update
        set section = excluded.section,
            read_at = coalesce(public.notification_read_states.read_at, excluded.read_at),
            snoozed_until = null,
            updated_at = now();
      end if;
    end loop;
  end if;

  return true;
end;
$$;

grant execute on function public.mark_messaging_read_v2(text, text, timestamptz, text, jsonb) to authenticated;
revoke all on function public.mark_messaging_read_v2(text, text, timestamptz, text, jsonb) from public, anon;

create or replace function public.get_notification_unread_summary_v2(
  p_variant text default null
)
returns table (
  section text,
  unread_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as user_id, public.current_org_id() as org_id
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = public.current_org_id()
    limit 1
  ),
  base_summary as (
    select *
    from public.get_notification_unread_summary_v1(p_variant)
  ),
  bot_group_total as (
    select coalesce(max(unread_count) filter (where section = 'bot_messages'), 0)::integer as value
    from base_summary
  ),
  bot_direct_total as (
    select count(*)::integer as value
    from me
    join public.counterparty_bot_direct_threads t
      on t.org_id = me.org_id
     and public.kalam_can_access_bot_direct_thread(t.id, t.org_id)
    join public.counterparty_bot_direct_messages m
      on m.org_id = me.org_id
     and m.direct_thread_id = t.id
     and m.direction = 'inbound'
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'counterparty_bot_direct_message'
     and rs.source_id = m.id::text
     and rs.section in ('bot_direct_messages', 'bot_messages')
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'bot'
     and crc.conversation_key = 'bot:direct:' || coalesce(t.channel_type, '') || ':' || coalesce(t.chat_id, '')
    where rs.read_at is null
      and rs.dismissed_at is null
      and (
        crc.read_through_at is null
        or m.created_at > crc.read_through_at
        or (
          m.created_at = crc.read_through_at
          and m.id::text > coalesce(crc.read_through_id, '')
        )
      )
  ),
  patched_summary as (
    select section, unread_count
    from base_summary
    where section <> 'bot_messages'
    union all
    select 'bot_group_messages'::text, bot_group_total.value from bot_group_total
    union all
    select 'bot_direct_messages'::text, bot_direct_total.value from bot_direct_total
    union all
    select 'bot_messages'::text, (bot_group_total.value + bot_direct_total.value)::integer
    from bot_group_total cross join bot_direct_total
  )
  select patched_summary.section, patched_summary.unread_count
  from patched_summary
  order by case patched_summary.section
    when 'notes' then 1
    when 'bot_messages' then 2
    when 'bot_group_messages' then 3
    when 'bot_direct_messages' then 4
    when 'sms_messages' then 5
    when 'voip_calls' then 6
    when 'tasks' then 7
    when 'responsibilities' then 8
    else 99
  end;
$$;

grant execute on function public.get_notification_unread_summary_v2(text) to authenticated;
revoke all on function public.get_notification_unread_summary_v2(text) from public, anon;

notify pgrst, 'reload schema';

commit;
