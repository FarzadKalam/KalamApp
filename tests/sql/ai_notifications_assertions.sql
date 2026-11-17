select set_config('test.user','20000000-0000-4000-8000-000000000001',false);
select set_config('test.org','10000000-0000-4000-8000-000000000001',false);
set role authenticated;
do $$begin
 if (public.get_ai_notification_snapshot_v1()->>'total')::int<>0 then raise exception 'old or pending response was unread';end if;
end$$;
reset role;
update public.ai_messages set metadata='{}',content='completed after rollout' where id='50000000-0000-4000-8000-000000000001';
insert into public.ai_messages(id,org_id,thread_id,role,content) values
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','assistant','private other actor'),
 ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003','assistant','other organization');
set role authenticated;
do $$begin
 if (public.get_ai_notification_snapshot_v1()->>'total')::int<>1 then raise exception 'completion or viewer scope wrong';end if;
 if public.mark_ai_conversation_read_v1('thread:40000000-0000-4000-8000-000000000002','ai_message','50000000-0000-4000-8000-000000000002') then raise exception 'other viewer message can be marked';end if;
 if public.mark_ai_conversation_read_v1('thread:40000000-0000-4000-8000-000000000003','ai_message','50000000-0000-4000-8000-000000000003') then raise exception 'other tenant message can be marked';end if;
 if not public.mark_ai_conversation_read_v1('thread:40000000-0000-4000-8000-000000000001','ai_message','50000000-0000-4000-8000-000000000001') then raise exception 'own completed response cannot be acknowledged';end if;
 if (public.get_ai_notification_snapshot_v1()->>'total')::int<>0 then raise exception 'read response remained unread';end if;
end$$;
reset role;
insert into public.ai_messages(id,org_id,thread_id,role,content) values
 ('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','assistant','newer response');
set role authenticated;
select public.mark_ai_conversation_read_v1('thread:40000000-0000-4000-8000-000000000001','ai_message','50000000-0000-4000-8000-000000000001');
do $$begin
 if (public.get_ai_notification_snapshot_v1()->>'total')::int<>1 then raise exception 'stale acknowledgement consumed a newer answer';end if;
end$$;
reset role;
insert into public.notes(id,org_id,author_name,content,mention_user_ids,metadata) values
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','agent','newer response',array['20000000-0000-4000-8000-000000000001']::uuid[],'{"agent_key":"sales_leads","conversation_key":"agent:sales_leads"}'),
 ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','agent','private reminder',array['20000000-0000-4000-8000-000000000002']::uuid[],'{"agent_key":"sales_leads"}');
set role authenticated;
do $$declare data jsonb;begin
 data:=public.get_ai_notification_snapshot_v1();
 if (data->>'total')::int<>1 or (data->>'agentNoteTotal')::int<>1 then raise exception 'relay duplicate counted or reminder recipient leaked';end if;
 if not public.mark_ai_conversation_read_v1('agent:sales_leads','note','60000000-0000-4000-8000-000000000001') then raise exception 'agent reminder cannot be marked';end if;
end$$;
reset role;
do $$begin
 if not exists(select 1 from public.communication_read_cursors where channel='internal' and conversation_key='agent:sales_leads') then raise exception 'agent read diverged from central cursors';end if;
end$$;
select set_config('test.org','',false);
set role authenticated;
do $$begin
 if (public.get_ai_notification_snapshot_v1()->>'total')::int<>0 then raise exception 'null organization did not fail closed';end if;
end$$;
reset role;
