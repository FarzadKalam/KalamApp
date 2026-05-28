-- =====================================================
-- KalamApp - Phase 215: Bot conversation summary runtime
-- Date: 2026-05-28
-- Type: Performance / API / idempotent
-- =====================================================

begin;

create table if not exists public.communication_bot_thread_summaries (
  org_id uuid not null,
  bot_group_id uuid not null,
  message_count integer not null default 0,
  latest_message_id uuid,
  latest_message_at timestamptz,
  latest_message_preview text,
  latest_message_direction text,
  latest_inbound_at timestamptz,
  latest_outbound_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (org_id, bot_group_id)
);

alter table public.communication_bot_thread_summaries enable row level security;

drop policy if exists p_communication_bot_thread_summaries_select_org
  on public.communication_bot_thread_summaries;
create policy p_communication_bot_thread_summaries_select_org
on public.communication_bot_thread_summaries
for select
to authenticated
using (org_id = public.current_org_id());

revoke all on table public.communication_bot_thread_summaries from public, anon, authenticated;
grant select on table public.communication_bot_thread_summaries to authenticated;

create index if not exists idx_comm_bot_thread_summaries_org_latest
  on public.communication_bot_thread_summaries(org_id, latest_message_at desc, bot_group_id);

create or replace function public.rebuild_communication_bot_thread_summary(
  p_org_id uuid,
  p_bot_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_summary record;
begin
  if p_org_id is null or p_bot_group_id is null then
    return;
  end if;

  select
    count(*)::integer as message_count,
    (
      select m.id
      from public.counterparty_bot_messages m
      where m.org_id = p_org_id
        and m.bot_group_id = p_bot_group_id
      order by m.created_at desc, m.id desc
      limit 1
    ) as latest_message_id,
    (
      select m.created_at
      from public.counterparty_bot_messages m
      where m.org_id = p_org_id
        and m.bot_group_id = p_bot_group_id
      order by m.created_at desc, m.id desc
      limit 1
    ) as latest_message_at,
    (
      select coalesce(nullif(trim(m.content_text), ''), nullif(trim(m.file_name), ''), nullif(trim(m.message_type), ''))
      from public.counterparty_bot_messages m
      where m.org_id = p_org_id
        and m.bot_group_id = p_bot_group_id
      order by m.created_at desc, m.id desc
      limit 1
    ) as latest_message_preview,
    (
      select m.direction
      from public.counterparty_bot_messages m
      where m.org_id = p_org_id
        and m.bot_group_id = p_bot_group_id
      order by m.created_at desc, m.id desc
      limit 1
    ) as latest_message_direction,
    max(created_at) filter (where direction = 'inbound') as latest_inbound_at,
    max(created_at) filter (where direction = 'outbound') as latest_outbound_at
  into v_summary
  from public.counterparty_bot_messages
  where org_id = p_org_id
    and bot_group_id = p_bot_group_id;

  if coalesce(v_summary.message_count, 0) = 0 then
    delete from public.communication_bot_thread_summaries
    where org_id = p_org_id
      and bot_group_id = p_bot_group_id;
    return;
  end if;

  insert into public.communication_bot_thread_summaries (
    org_id,
    bot_group_id,
    message_count,
    latest_message_id,
    latest_message_at,
    latest_message_preview,
    latest_message_direction,
    latest_inbound_at,
    latest_outbound_at,
    updated_at
  )
  values (
    p_org_id,
    p_bot_group_id,
    coalesce(v_summary.message_count, 0),
    v_summary.latest_message_id,
    v_summary.latest_message_at,
    v_summary.latest_message_preview,
    v_summary.latest_message_direction,
    v_summary.latest_inbound_at,
    v_summary.latest_outbound_at,
    now()
  )
  on conflict (org_id, bot_group_id) do update
  set message_count = excluded.message_count,
      latest_message_id = excluded.latest_message_id,
      latest_message_at = excluded.latest_message_at,
      latest_message_preview = excluded.latest_message_preview,
      latest_message_direction = excluded.latest_message_direction,
      latest_inbound_at = excluded.latest_inbound_at,
      latest_outbound_at = excluded.latest_outbound_at,
      updated_at = now();
end;
$$;

create or replace function public.touch_communication_bot_thread_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview text;
  v_direction text;
begin
  if tg_op = 'INSERT' then
    if new.org_id is null or new.bot_group_id is null then
      return new;
    end if;

    v_preview := coalesce(nullif(trim(new.content_text), ''), nullif(trim(new.file_name), ''), nullif(trim(new.message_type), ''));
    v_direction := trim(coalesce(new.direction, ''));

    insert into public.communication_bot_thread_summaries (
      org_id,
      bot_group_id,
      message_count,
      latest_message_id,
      latest_message_at,
      latest_message_preview,
      latest_message_direction,
      latest_inbound_at,
      latest_outbound_at,
      updated_at
    )
    values (
      new.org_id,
      new.bot_group_id,
      1,
      new.id,
      new.created_at,
      v_preview,
      v_direction,
      case when v_direction = 'inbound' then new.created_at else null end,
      case when v_direction = 'outbound' then new.created_at else null end,
      now()
    )
    on conflict (org_id, bot_group_id) do update
    set message_count = public.communication_bot_thread_summaries.message_count + 1,
        latest_message_id = case
          when public.communication_bot_thread_summaries.latest_message_at is null
            or new.created_at > public.communication_bot_thread_summaries.latest_message_at
            or (
              new.created_at = public.communication_bot_thread_summaries.latest_message_at
              and new.id::text > coalesce(public.communication_bot_thread_summaries.latest_message_id::text, '')
            )
          then new.id
          else public.communication_bot_thread_summaries.latest_message_id
        end,
        latest_message_at = greatest(coalesce(public.communication_bot_thread_summaries.latest_message_at, new.created_at), new.created_at),
        latest_message_preview = case
          when public.communication_bot_thread_summaries.latest_message_at is null
            or new.created_at > public.communication_bot_thread_summaries.latest_message_at
            or (
              new.created_at = public.communication_bot_thread_summaries.latest_message_at
              and new.id::text > coalesce(public.communication_bot_thread_summaries.latest_message_id::text, '')
            )
          then v_preview
          else public.communication_bot_thread_summaries.latest_message_preview
        end,
        latest_message_direction = case
          when public.communication_bot_thread_summaries.latest_message_at is null
            or new.created_at > public.communication_bot_thread_summaries.latest_message_at
            or (
              new.created_at = public.communication_bot_thread_summaries.latest_message_at
              and new.id::text > coalesce(public.communication_bot_thread_summaries.latest_message_id::text, '')
            )
          then v_direction
          else public.communication_bot_thread_summaries.latest_message_direction
        end,
        latest_inbound_at = case
          when v_direction = 'inbound'
            then greatest(coalesce(public.communication_bot_thread_summaries.latest_inbound_at, new.created_at), new.created_at)
          else public.communication_bot_thread_summaries.latest_inbound_at
        end,
        latest_outbound_at = case
          when v_direction = 'outbound'
            then greatest(coalesce(public.communication_bot_thread_summaries.latest_outbound_at, new.created_at), new.created_at)
          else public.communication_bot_thread_summaries.latest_outbound_at
        end,
        updated_at = now();

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.org_id is distinct from new.org_id
       or old.bot_group_id is distinct from new.bot_group_id
       or old.created_at is distinct from new.created_at
       or old.direction is distinct from new.direction
       or old.content_text is distinct from new.content_text
       or old.file_name is distinct from new.file_name
       or old.message_type is distinct from new.message_type then
      perform public.rebuild_communication_bot_thread_summary(old.org_id, old.bot_group_id);
      perform public.rebuild_communication_bot_thread_summary(new.org_id, new.bot_group_id);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.rebuild_communication_bot_thread_summary(old.org_id, old.bot_group_id);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_touch_communication_bot_thread_summary
  on public.counterparty_bot_messages;
create trigger trg_touch_communication_bot_thread_summary
  after insert or update or delete on public.counterparty_bot_messages
  for each row execute function public.touch_communication_bot_thread_summary();

insert into public.communication_bot_thread_summaries (
  org_id,
  bot_group_id,
  message_count,
  latest_message_id,
  latest_message_at,
  latest_message_preview,
  latest_message_direction,
  latest_inbound_at,
  latest_outbound_at,
  updated_at
)
select
  latest.org_id,
  latest.bot_group_id,
  counts.message_count,
  latest.id,
  latest.created_at,
  coalesce(nullif(trim(latest.content_text), ''), nullif(trim(latest.file_name), ''), nullif(trim(latest.message_type), '')),
  latest.direction,
  counts.latest_inbound_at,
  counts.latest_outbound_at,
  now()
from (
  select
    org_id,
    bot_group_id,
    count(*)::integer as message_count,
    max(created_at) filter (where direction = 'inbound') as latest_inbound_at,
    max(created_at) filter (where direction = 'outbound') as latest_outbound_at
  from public.counterparty_bot_messages
  where org_id is not null
    and bot_group_id is not null
  group by org_id, bot_group_id
) counts
join lateral (
  select m.*
  from public.counterparty_bot_messages m
  where m.org_id = counts.org_id
    and m.bot_group_id = counts.bot_group_id
  order by m.created_at desc, m.id desc
  limit 1
) latest on true
on conflict (org_id, bot_group_id) do update
set message_count = excluded.message_count,
    latest_message_id = excluded.latest_message_id,
    latest_message_at = excluded.latest_message_at,
    latest_message_preview = excluded.latest_message_preview,
    latest_message_direction = excluded.latest_message_direction,
    latest_inbound_at = excluded.latest_inbound_at,
    latest_outbound_at = excluded.latest_outbound_at,
    updated_at = now();

create or replace function public.get_communication_conversations_v2(
  p_channel text default 'internal',
  p_before_cursor timestamptz default null,
  p_limit integer default 80
)
returns table (
  section text,
  conversation_key text,
  kind text,
  title text,
  subtitle text,
  avatar_url text,
  role_label text,
  note_count integer,
  unread_count integer,
  latest_message_at timestamptz,
  last_message_preview text,
  user_id uuid,
  group_id uuid,
  bot_group_id uuid,
  channel_type text,
  status text,
  counterparty_label text,
  bot_chat_id text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as user_id, public.current_org_id() as org_id, p.role_id
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = public.current_org_id()
    limit 1
  ),
  internal_raw as (
    select
      'notes'::text as section,
      coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
        )
      ) as conversation_key,
      nullif(trim(coalesce(nii.payload->>'chat_group_id', n.metadata->>'chat_group_id')), '') as chat_group_id,
      n.id as message_id,
      n.author_id,
      n.created_at,
      nullif(trim(coalesce(nii.body, '')), '') as preview,
      (
        n.author_id = me.user_id
        or rs.read_at is not null
        or rs.dismissed_at is not null
        or (
          crc.read_through_at is not null
          and (
            n.created_at < crc.read_through_at
            or (
              n.created_at = crc.read_through_at
              and n.id::text <= coalesce(crc.read_through_id, n.id::text)
            )
          )
        )
      ) as is_read
    from me
    join public.notification_inbox_items nii
     on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
     and lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant')
     and (
       nii.is_org_wide = true
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    join public.notes n
      on n.id::text = nii.source_id
     and n.org_id = nii.org_id
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'notes'
     and rs.source_type = 'note'
     and rs.source_id = nii.source_id
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = coalesce(
       nii.conversation_key,
       nullif(trim(nii.payload->>'conversation_key'), ''),
       public.kalam_note_conversation_key(
         n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
         coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
       )
     )
    where p_channel = 'internal'
  ),
  internal_base as (
    select
      section,
      conversation_key,
      case when conversation_key like 'group:%' or chat_group_id is not null then 'group' else 'direct' end as kind,
      message_id,
      author_id,
      created_at,
      preview,
      is_read
    from internal_raw
    where nullif(trim(coalesce(conversation_key, '')), '') is not null
      and conversation_key <> 'system'
  ),
  internal_agg as (
    select
      section,
      conversation_key,
      kind,
      count(*)::integer as note_count,
      count(*) filter (where not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from internal_base
    group by section, conversation_key, kind
  ),
  internal_latest as (
    select distinct on (conversation_key) conversation_key, preview
    from internal_base
    order by conversation_key, created_at desc, message_id desc
  ),
  internal_enriched as (
    select
      ia.section,
      ia.conversation_key,
      ia.kind,
      case when ia.kind = 'group' then coalesce(cg.name, 'گروه') else coalesce(nullif(trim(other_profile.full_name), ''), 'کاربر') end as title,
      case when ia.kind = 'group' then 'گروه داخلی' else nullif(trim(other_role.title), '') end as subtitle,
      case when ia.kind = 'direct' then other_profile.avatar_url else null end as avatar_url,
      case when ia.kind = 'direct' then other_role.title else null end as role_label,
      ia.note_count,
      ia.unread_count,
      ia.latest_message_at,
      il.preview as last_message_prefix,
      case
        when ia.kind = 'direct' then
          case
            when public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2)) = me.user_id
              then public.kalam_try_uuid(split_part(ia.conversation_key, ':', 3))
            else public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2))
          end
        else null
      end as user_id,
      case when ia.kind = 'group' then public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2)) else null end as group_id,
      null::uuid as bot_group_id,
      null::text as channel_type,
      null::text as status,
      null::text as counterparty_label,
      null::text as bot_chat_id
    from internal_agg ia
    join me on true
    left join internal_latest il on il.conversation_key = ia.conversation_key
    left join public.chat_groups cg
      on ia.kind = 'group'
     and cg.id = public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2))
    left join public.profiles other_profile
      on ia.kind = 'direct'
     and other_profile.id = (
       case
         when public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2)) = me.user_id
           then public.kalam_try_uuid(split_part(ia.conversation_key, ':', 3))
         else public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2))
       end
     )
     and other_profile.org_id = me.org_id
    left join public.org_roles other_role
      on other_role.id = other_profile.role_id
     and other_role.org_id = me.org_id
  ),
  bot_enriched as (
    select
      'bot_messages'::text as section,
      'bot:' || g.id::text as conversation_key,
      'bot'::text as kind,
      coalesce(nullif(trim(g.group_title), ''), coalesce(nullif(trim(c.full_name), ''), nullif(trim(s.full_name), ''), 'مخاطب')) as title,
      coalesce(nullif(trim(c.full_name), ''), nullif(trim(s.full_name), ''), null) as subtitle,
      null::text as avatar_url,
      null::text as role_label,
      coalesce(summary.message_count, 0)::integer as note_count,
      coalesce(unread.unread_count, 0)::integer as unread_count,
      summary.latest_message_at,
      summary.latest_message_preview as last_message_prefix,
      null::uuid as user_id,
      null::uuid as group_id,
      g.id as bot_group_id,
      g.channel_type,
      g.status,
      coalesce(nullif(trim(c.full_name), ''), nullif(trim(s.full_name), ''), null) as counterparty_label,
      g.bot_chat_id
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
     and public.kalam_can_access_bot_group(g.id, g.org_id)
    left join public.communication_bot_thread_summaries summary
      on summary.org_id = g.org_id
     and summary.bot_group_id = g.id
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'bot'
     and crc.conversation_key = 'bot:' || g.id::text
    left join lateral (
      select count(*)::integer as unread_count
      from public.counterparty_bot_messages m
      left join public.notification_read_states rs
        on rs.org_id = me.org_id
       and rs.user_id = me.user_id
       and rs.section = 'bot_messages'
       and rs.source_type = 'counterparty_bot_message'
       and rs.source_id = m.id::text
      where m.org_id = g.org_id
        and m.bot_group_id = g.id
        and m.direction = 'inbound'
        and rs.read_at is null
        and rs.dismissed_at is null
        and (
          crc.read_through_at is null
          or m.created_at > crc.read_through_at
          or (
            m.created_at = crc.read_through_at
            and m.id::text > coalesce(crc.read_through_id, '')
          )
        )
    ) unread on true
    left join public.customers c on c.id = g.customer_id and c.org_id = me.org_id
    left join public.suppliers s on s.id = g.supplier_id and s.org_id = me.org_id
    where p_channel = 'bot'
      and (
        p_before_cursor is null
        or summary.latest_message_at < p_before_cursor
      )
  )
  select
    e.section,
    e.conversation_key,
    e.kind,
    e.title,
    e.subtitle,
    e.avatar_url,
    e.role_label,
    e.note_count,
    e.unread_count,
    e.latest_message_at,
    e.last_message_prefix as last_message_preview,
    e.user_id,
    e.group_id,
    e.bot_group_id,
    e.channel_type,
    e.status,
    e.counterparty_label,
    e.bot_chat_id
  from (
    select * from internal_enriched
    union all
    select * from bot_enriched
  ) e
  where p_before_cursor is null or e.latest_message_at < p_before_cursor
  order by e.latest_message_at desc nulls last, e.title asc
  limit least(greatest(coalesce(p_limit, 80), 1), 100);
$$;

create or replace function public.get_communication_badge_summary_v2()
returns table (
  internal_unread integer,
  bot_unread integer,
  total_unread integer
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      auth.uid() as user_id,
      public.current_org_id() as org_id,
      p.role_id,
      nullif(trim(coalesce(p.voip_extension, '')), '') as voip_extension,
      (
        coalesce(lower(r.permissions #>> '{__voip,view}') <> 'false', true)
        and coalesce(lower(r.permissions #>> '{__voip,fields,all_call_notifications}') <> 'false', true)
      ) as can_view_all_calls
    from public.profiles p
    left join public.org_roles r
      on r.id = p.role_id
     and r.org_id = p.org_id
    where p.id = auth.uid()
      and p.org_id = public.current_org_id()
    limit 1
  ),
  internal_scoped as (
    select
      me.user_id,
      me.org_id,
      n.id as message_id,
      n.author_id,
      n.created_at,
      coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
        )
      ) as conversation_key,
      rs.read_at,
      rs.dismissed_at
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
     and lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant')
     and (
       nii.is_org_wide = true
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    join public.notes n
      on n.id::text = nii.source_id
     and n.org_id = nii.org_id
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'notes'
     and rs.source_type = 'note'
     and rs.source_id = nii.source_id
  ),
  internal_total as (
    select count(*)::integer as value
    from internal_scoped scoped
    left join public.communication_read_cursors crc
      on crc.org_id = scoped.org_id
     and crc.user_id = scoped.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = scoped.conversation_key
    where scoped.conversation_key is not null
      and scoped.conversation_key <> 'system'
      and scoped.author_id is distinct from scoped.user_id
      and scoped.read_at is null
      and scoped.dismissed_at is null
      and not (
        crc.read_through_at is not null
        and (
          scoped.created_at < crc.read_through_at
          or (
            scoped.created_at = crc.read_through_at
            and scoped.message_id::text <= coalesce(crc.read_through_id, scoped.message_id::text)
          )
        )
      )
  ),
  bot_total as (
    select coalesce(sum(unread.unread_count), 0)::integer as value
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
     and public.kalam_can_access_bot_group(g.id, g.org_id)
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'bot'
     and crc.conversation_key = 'bot:' || g.id::text
    left join lateral (
      select count(*)::integer as unread_count
      from public.counterparty_bot_messages m
      left join public.notification_read_states rs
        on rs.org_id = me.org_id
       and rs.user_id = me.user_id
       and rs.section = 'bot_messages'
       and rs.source_type = 'counterparty_bot_message'
       and rs.source_id = m.id::text
      where m.org_id = g.org_id
        and m.bot_group_id = g.id
        and m.direction = 'inbound'
        and rs.read_at is null
        and rs.dismissed_at is null
        and (
          crc.read_through_at is null
          or m.created_at > crc.read_through_at
          or (
            m.created_at = crc.read_through_at
            and m.id::text > coalesce(crc.read_through_id, '')
          )
        )
    ) unread on true
  ),
  sms_total as (
    select count(*)::integer as value
    from me
    join public.outbound_messages m
      on m.org_id = me.org_id
     and m.channel_type = 'sms'
     and m.direction = 'inbound'
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'sms_messages'
     and rs.source_type = 'inbound_sms'
     and rs.source_id = m.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
  ),
  voip_total as (
    select count(*)::integer as value
    from me
    join public.voip_call_logs c
      on c.org_id = me.org_id
     and c.direction = 'incoming'
     and (
       me.can_view_all_calls
       or (me.voip_extension is not null and c.extension = me.voip_extension)
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'voip_calls'
     and rs.source_type = 'voip_call'
     and rs.source_id = c.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
  )
  select
    coalesce(internal_total.value, 0)::integer,
    coalesce(bot_total.value, 0)::integer,
    (
      coalesce(internal_total.value, 0)
      + coalesce(bot_total.value, 0)
      + coalesce(sms_total.value, 0)
      + coalesce(voip_total.value, 0)
    )::integer
  from internal_total
  cross join bot_total
  cross join sms_total
  cross join voip_total;
$$;

grant execute on function public.get_communication_conversations_v2(text, timestamptz, integer) to authenticated;
grant execute on function public.get_communication_badge_summary_v2() to authenticated;
revoke all on function public.get_communication_conversations_v2(text, timestamptz, integer) from public, anon;
revoke all on function public.get_communication_badge_summary_v2() from public, anon;
revoke all on function public.rebuild_communication_bot_thread_summary(uuid, uuid) from public, anon, authenticated;
revoke all on function public.touch_communication_bot_thread_summary() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
