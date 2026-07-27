-- TazeSystem - Phase 402: fast internal messaging V2 summary
-- Keeps the existing public RPC signature while removing per-row nested lookups.

begin;

create index if not exists idx_notification_inbox_internal_summary_fast_v3
  on public.notification_inbox_items (org_id, source_id, created_at desc, id desc)
  where section = 'notes'
    and source_type = 'note';

create or replace function public.get_internal_communication_conversations_v3(
  p_before_cursor timestamptz default null,
  p_limit integer default 80
)
returns table (
  section text, conversation_key text, kind text, title text, subtitle text,
  avatar_url text, role_label text, note_count integer, unread_count integer,
  latest_message_at timestamptz, last_message_preview text, user_id uuid,
  group_id uuid, bot_group_id uuid, channel_type text, status text,
  counterparty_label text, bot_chat_id text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id as user_id, p.org_id, p.role_id
    from public.profiles p
    where p.id = auth.uid() and p.org_id = public.current_org_id()
    limit 1
  ),
  candidate as materialized (
    select distinct on (n.id)
      n.id as note_id,
      n.author_id,
      n.created_at,
      nullif(trim(coalesce(nii.body, n.content, '')), '') as preview,
      case
        when lower(trim(coalesce(nii.category, ''))) in ('system', 'assistant')
          or lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) in ('system', 'ai')
          or coalesce(n.metadata, '{}'::jsonb) ?| array['workflow_id', 'automation_rule_id', 'process_automation_rule_id'] then 'system'
        when nullif(trim(coalesce(n.metadata->>'chat_group_id', '')), '') is not null then 'group:' || trim(n.metadata->>'chat_group_id')
        when n.author_id = me.user_id and cardinality(coalesce(n.mention_user_ids, '{}'::uuid[])) = 0 then 'mine'
        when n.author_id is not null and n.author_id <> me.user_id
          and (me.user_id = any(coalesce(n.mention_user_ids, '{}'::uuid[]))
            or (me.role_id is not null and me.role_id = any(coalesce(n.mention_role_ids, '{}'::uuid[]))))
          then public.kalam_direct_conversation_key(me.user_id, n.author_id)
        else coalesce(
          nullif(trim(nii.conversation_key), ''),
          nullif(trim(nii.payload->>'conversation_key'), ''),
          case when n.author_id = me.user_id then 'mine' else null end
        )
      end as conversation_key
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id and nii.section = 'notes' and nii.source_type = 'note'
    join public.notes n on n.id::text = nii.source_id and n.org_id = nii.org_id
    where nii.is_org_wide = true
       or nii.target_user_ids @> array[me.user_id]
       or (me.role_id is not null and nii.target_role_ids @> array[me.role_id])
       or n.author_id = me.user_id
    order by n.id, nii.created_at desc, nii.id desc
  ),
  visible as materialized (
    select c.*,
      (c.author_id = me.user_id
        or rs.read_at is not null
        or rs.dismissed_at is not null
        or (crc.read_through_at is not null and (
          c.created_at < crc.read_through_at
          or (c.created_at = crc.read_through_at and c.note_id::text <= coalesce(crc.read_through_id, c.note_id::text))
        ))) as is_read
    from candidate c
    join me on true
    left join public.notification_read_states rs
      on rs.org_id = me.org_id and rs.user_id = me.user_id
     and rs.section = 'notes' and rs.source_type = 'note' and rs.source_id = c.note_id::text
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id and crc.user_id = me.user_id
     and crc.channel = 'internal' and crc.conversation_key = c.conversation_key
    where nullif(trim(coalesce(c.conversation_key, '')), '') is not null
      and (c.conversation_key not like 'direct:%'
        or c.conversation_key like 'direct:' || me.user_id::text || ':%'
        or c.conversation_key like 'direct:%:' || me.user_id::text)
  ),
  summary as (
    select conversation_key,
      case when conversation_key = 'system' then 'system'
           when conversation_key = 'mine' then 'mine'
           when conversation_key like 'group:%' then 'group' else 'direct' end as kind,
      count(*)::integer as note_count,
      count(*) filter (where not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from visible
    group by conversation_key
  ),
  latest as (
    select distinct on (conversation_key) conversation_key, preview
    from visible
    order by conversation_key, created_at desc, note_id desc
  )
  select
    'notes'::text,
    s.conversation_key,
    s.kind,
    case when s.kind = 'system' then 'پیام‌های سیستم'
         when s.kind = 'mine' then 'یادداشت‌های من'
         when s.kind = 'group' then 'گروه داخلی' else 'کاربر' end,
    case when s.kind = 'system' then 'اعلان‌ها و پیام‌های سیستمی'
         when s.kind = 'mine' then 'یادداشت‌های شخصی'
         when s.kind = 'group' then 'گروه داخلی' else 'پیام مستقیم داخلی' end,
    null::text, null::text, s.note_count, s.unread_count, s.latest_message_at, l.preview,
    null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::text
  from summary s
  left join latest l on l.conversation_key = s.conversation_key
  where p_before_cursor is null or s.latest_message_at < p_before_cursor
  order by s.latest_message_at desc nulls last, 4 asc
  limit least(greatest(coalesce(p_limit, 80), 1), 100);
$$;

grant execute on function public.get_internal_communication_conversations_v3(timestamptz, integer) to authenticated;
revoke all on function public.get_internal_communication_conversations_v3(timestamptz, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
