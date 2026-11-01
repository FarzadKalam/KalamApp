set role authenticated;
select set_config('test.current_org','20000000-0000-0000-0000-000000000001',false);
select set_config('test.viewer','10000000-0000-0000-0000-000000000001',false);
do $$ begin
  if (select count(*) from public.notes) <> 4 then raise exception 'Recipient user/role/inbox visibility is wrong'; end if;
  if (select count(*) from public.notification_inbox_items) <> 1 then raise exception 'Inbox leaks another recipients system messages'; end if;
  if exists(select 1 from public.notes where id in ('40000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000005')) then raise exception 'Other users or organizations leaked'; end if;
  if jsonb_array_length(public.get_system_communication_timeline_v1(40,null)->'items') <> 3 then raise exception 'System timeline recipient scope differs'; end if;
  if not exists(select 1 from jsonb_array_elements(public.get_system_communication_timeline_v1(40,null)->'items') item
    where item->>'id' = '40000000-0000-0000-0000-000000000007' and (item->'target_user_ids') ? '10000000-0000-0000-0000-000000000001') then raise exception 'Timeline omitted explicit inbox recipients'; end if;
end $$;
select set_config('test.viewer','10000000-0000-0000-0000-000000000002',false);
do $$ begin
  if (select count(*) from public.notes) <> 2 then raise exception 'Second viewer sees another recipients system notes'; end if;
  if (select count(*) from public.notification_inbox_items) <> 1 then raise exception 'Second viewer sees another recipients inbox'; end if;
end $$;
select set_config('test.current_org','',false);
do $$ begin
  if exists(select 1 from public.notes) then raise exception 'Missing organization must fail closed'; end if;
end $$;
select set_config('test.current_org','20000000-0000-0000-0000-000000000002',false);
do $$ begin
  if exists(select 1 from public.notes) then raise exception 'Viewer is not a member of this organization'; end if;
end $$;
reset role;
