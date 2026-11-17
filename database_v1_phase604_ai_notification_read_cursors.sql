begin;

-- Extend the existing central per-viewer read cursor; no independent unread store.
alter table public.communication_read_cursors drop constraint if exists communication_read_cursors_channel_check;
alter table public.communication_read_cursors add constraint communication_read_cursors_channel_check
 check(channel in ('internal','bot','sms','voip','ai'));

-- Existing AI history starts read. Reapplying never moves this baseline forward.
insert into public.communication_read_cursors(org_id,user_id,channel,conversation_key,read_through_at,read_through_id)
 select org_id,user_id,'ai','*',now(),'' from public.user_organization_memberships where is_active
 on conflict(org_id,user_id,channel,conversation_key) do nothing;

alter table public.ai_messages add column if not exists notification_ready_at timestamptz;
create or replace function public.ai_message_notification_ready(p_role text,p_content text,p_metadata jsonb)
returns boolean language sql immutable set search_path=public as $$
 select p_role='assistant' and length(trim(coalesce(p_content,'')))>0
  and coalesce(p_metadata->>'status','')<>'failed'
  and not coalesce(p_metadata,'{}'::jsonb) @> '{"pending_status":true}'
  and not coalesce(p_metadata,'{}'::jsonb) @> '{"failed":true}'
  and not coalesce(p_metadata,'{}'::jsonb) @> '{"incomplete":true}'
  and not coalesce(p_metadata,'{}'::jsonb) @> '{"stopped":true}'
  and not coalesce(p_metadata,'{}'::jsonb) @> '{"internal_agent_step":true}'
  and not coalesce(p_metadata,'{}'::jsonb) @> '{"internal_agent_input":true}';
$$;
create or replace function public.stamp_ai_message_notification_ready()
returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' then
  new.notification_ready_at:=case when public.ai_message_notification_ready(new.role,new.content,new.metadata) then clock_timestamp() else null end;
 elsif public.ai_message_notification_ready(new.role,new.content,new.metadata)
   and not public.ai_message_notification_ready(old.role,old.content,old.metadata) then
  new.notification_ready_at:=clock_timestamp();
 else new.notification_ready_at:=old.notification_ready_at;
 end if;
 return new;
end $$;
drop trigger if exists trg_ai_message_notification_ready on public.ai_messages;
create trigger trg_ai_message_notification_ready before insert or update on public.ai_messages
 for each row execute function public.stamp_ai_message_notification_ready();

create index if not exists idx_ai_messages_notification_response
 on public.ai_messages(org_id,thread_id,(coalesce(notification_ready_at,created_at)) desc,id desc) where role='assistant';
create index if not exists idx_notes_agent_notification
 on public.notes(org_id,(metadata->>'agent_key'),created_at desc,id desc)
 where metadata ? 'agent_key';

-- Explicit viewer scope is retained in the view as well as the source tables' RLS.
create or replace view public.ai_notification_events with(security_invoker=true) as
with me as (
 select m.org_id,m.user_id,m.role_id from public.user_organization_memberships m
 where m.org_id=public.current_org_id() and m.user_id=auth.uid() and m.is_active
), thread_events as (
 select me.org_id,me.user_id,'ai_message'::text as source_type,a.id::text as source_id,
  'thread:'||t.id::text as conversation_key,t.id as thread_id,
  case when t.metadata->>'free_chat'='true' then null else
   coalesce(nullif(t.agent_key,''),nullif(t.metadata->>'agent_key',''),
    nullif(to_jsonb(t)->'selected_agents'->>0,''),nullif(t.metadata->'selected_agents'->>0,''),'lead_orchestrator') end as agent_key,
  coalesce(nullif(t.title,''),'گفتگوی هوش مصنوعی') as title,a.content,coalesce(a.notification_ready_at,a.created_at) as created_at,
  coalesce((coalesce(a.notification_ready_at,a.created_at),a.id::text)>(coalesce(c.read_through_at,baseline.read_through_at,t.created_at),
   coalesce(c.read_through_id,baseline.read_through_id,'')),false) as is_unread,false as in_communication
 from me join public.ai_threads t on t.org_id=me.org_id and
  (t.user_id=me.user_id or me.user_id=any(t.shared_user_ids) or me.role_id=any(t.shared_role_ids))
 join public.ai_messages a on a.org_id=t.org_id and a.thread_id=t.id and a.role='assistant'
 left join public.communication_read_cursors c on c.org_id=me.org_id and c.user_id=me.user_id
  and c.channel='ai' and c.conversation_key='thread:'||t.id::text
 left join public.communication_read_cursors baseline on baseline.org_id=me.org_id and baseline.user_id=me.user_id
  and baseline.channel='ai' and baseline.conversation_key='*'
 where coalesce(t.status,'active')='active' and t.archived_at is null and length(trim(a.content))>0
  and coalesce(t.context_key,'') not like 'reply:%'
  and coalesce(t.metadata->>'last_activity_kind','')<>'reply_suggestion'
  and coalesce(t.metadata->>'source','') not in ('reply_suggestion','notifications_chat_reply_suggest')
  and coalesce(t.metadata->>'capability','')<>'customer_reply_suggestion'
  and coalesce(t.metadata->>'customer_reply_suggestion','false')<>'true'
  and public.ai_message_notification_ready(a.role,a.content,a.metadata)
), note_events as (
 select me.org_id,me.user_id,'note'::text as source_type,n.id::text as source_id,
  'agent:'||coalesce(nullif(n.metadata->>'agent_key',''),nullif(substr(n.metadata->>'conversation_key',7),''),'lead_orchestrator') as conversation_key,
  null::uuid as thread_id,
  coalesce(nullif(n.metadata->>'agent_key',''),nullif(substr(n.metadata->>'conversation_key',7),''),'lead_orchestrator') as agent_key,
  coalesce(nullif(n.author_name,''),'ایجنت هوشمند') as title,n.content,n.created_at,
  (rs.read_at is null and rs.dismissed_at is null and
    (c.read_through_at is null or (n.created_at,n.id::text)>(c.read_through_at,coalesce(c.read_through_id,'')))) as is_unread,
  exists(select 1 from public.notification_inbox_items i where i.org_id=me.org_id and i.section='notes' and i.source_type='note' and i.source_id=n.id::text) as in_communication
 from me join public.notes n on n.org_id=me.org_id and n.author_id is distinct from me.user_id
  and (me.user_id=any(n.mention_user_ids) or me.role_id=any(n.mention_role_ids))
 left join public.notification_read_states rs on rs.org_id=me.org_id and rs.user_id=me.user_id
  and rs.section='notes' and rs.source_type='note' and rs.source_id=n.id::text
 left join public.communication_read_cursors c on c.org_id=me.org_id and c.user_id=me.user_id and c.channel='internal'
  and c.conversation_key='agent:'||coalesce(nullif(n.metadata->>'agent_key',''),nullif(substr(n.metadata->>'conversation_key',7),''),'lead_orchestrator')
 where (n.metadata ? 'agent_key' or n.metadata->>'conversation_key' like 'agent:%')
  and length(trim(n.content))>0 and coalesce(n.metadata->>'pending_status','false')<>'true'
  and coalesce(n.metadata->>'failed','false')<>'true' and coalesce(n.metadata->>'incomplete','false')<>'true'
)
select * from note_events
union all
select t.* from thread_events t where not exists(
 select 1 from note_events n where n.agent_key=t.agent_key and n.content=t.content
  and abs(extract(epoch from n.created_at-t.created_at))<=180
);
revoke all on public.ai_notification_events from public,anon;
grant select on public.ai_notification_events to authenticated;

create or replace function public.get_ai_notification_snapshot_v1()
returns jsonb language sql stable security invoker set search_path=public as $$
 with unread as materialized(select * from public.ai_notification_events where is_unread),
 grouped as (select conversation_key,thread_id,agent_key,count(*) as unread_count,max(created_at) as latest
  from unread group by conversation_key,thread_id,agent_key),
 agents as (select agent_key,sum(unread_count) as unread_count from grouped where agent_key is not null group by agent_key),
 recent as (select distinct on (conversation_key) * from unread where source_type='ai_message' order by conversation_key,created_at desc,source_id desc)
 select jsonb_build_object(
  'total',(select count(*) from unread),'agentNoteTotal',(select count(*) from unread where source_type='note'),
  'communicationAgentNoteTotal',(select count(*) from unread where source_type='note' and in_communication),
  'byAgent',coalesce((select jsonb_object_agg(agent_key,unread_count) from agents),'{}'::jsonb),
  'byConversation',coalesce((select jsonb_object_agg(conversation_key,unread_count) from
    (select * from grouped order by latest desc limit 200) g),'{}'::jsonb),
  'items',coalesce((select jsonb_agg(to_jsonb(r)-'content'||jsonb_build_object('content',left(r.content,500))) from
    (select * from recent order by created_at desc,source_id desc limit 20) r),'[]'::jsonb)
 );
$$;
revoke all on function public.get_ai_notification_snapshot_v1() from public,anon;
grant execute on function public.get_ai_notification_snapshot_v1() to authenticated;

create or replace function public.mark_ai_conversation_read_v1(p_conversation_key text,p_source_type text,p_source_id text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_org_id();v_user uuid:=auth.uid();v_created timestamptz;v_channel text;
begin
 if v_org is null or v_user is null then return false;end if;
 -- The view has explicit active membership/owner/shared/recipient predicates, also under definer execution.
 select e.created_at into v_created from public.ai_notification_events e
  where e.org_id=v_org and e.user_id=v_user and e.conversation_key=p_conversation_key
    and e.source_type=p_source_type and e.source_id=p_source_id limit 1;
 if not found then return false;end if;
 v_channel:=case when p_source_type='note' then 'internal' else 'ai' end;
 insert into public.communication_read_cursors as existing(org_id,user_id,channel,conversation_key,read_through_at,read_through_id)
 values(v_org,v_user,v_channel,p_conversation_key,v_created,p_source_id)
 on conflict(org_id,user_id,channel,conversation_key) do update set
  read_through_at=excluded.read_through_at,read_through_id=excluded.read_through_id,updated_at=now()
 where (existing.read_through_at,coalesce(existing.read_through_id,''))<(excluded.read_through_at,excluded.read_through_id);
 return true;
end $$;
revoke all on function public.mark_ai_conversation_read_v1(text,text,text) from public,anon;
grant execute on function public.mark_ai_conversation_read_v1(text,text,text) to authenticated;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ai_messages') then
   alter publication supabase_realtime add table public.ai_messages;
  end if;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
