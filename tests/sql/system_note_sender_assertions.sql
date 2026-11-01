do $$
declare actor uuid := '10000000-0000-0000-0000-000000000001'; recipient uuid := '10000000-0000-0000-0000-000000000002'; scope uuid := '20000000-0000-0000-0000-000000000001';
 item public.notification_inbox_items%rowtype;
begin
 if (select total from public.fixture_broadcast_count) <> 0 then raise exception 'Repair replayed old notifications'; end if;
 select * into item from public.notification_inbox_items where source_id='40000000-0000-0000-0000-000000000004';
 if item.target_user_ids <> array[recipient] or item.is_org_wide then raise exception 'Existing implicit sender was not repaired'; end if;
 insert into public.notes(id,org_id,source_type,author_id,mention_user_ids,metadata)
 values('40000000-0000-0000-0000-000000000008',scope,'system',actor,array[recipient],'{"workflow_action_type":"send_note"}');
 select * into item from public.notification_inbox_items where source_id='40000000-0000-0000-0000-000000000008';
 if item.target_user_ids <> array[recipient] or item.is_org_wide then raise exception 'Workflow actor became a recipient'; end if;
 update public.notes set content='ویرایش یادآوری' where id='40000000-0000-0000-0000-000000000008';
 select * into item from public.notification_inbox_items where source_id='40000000-0000-0000-0000-000000000008';
 if actor=any(item.target_user_ids) then raise exception 'Editing reintroduced the sender'; end if;
 if (select total from public.fixture_broadcast_count) <> 1 then raise exception 'Normal broadcasts were not restored after repair'; end if;
 insert into public.notes(id,org_id,source_type,author_id,mention_user_ids)
 values('40000000-0000-0000-0000-000000000009',scope,'user',actor,array[recipient]);
 select * into item from public.notification_inbox_items where source_id='40000000-0000-0000-0000-000000000009';
 if not(actor=any(item.target_user_ids) and recipient=any(item.target_user_ids)) then raise exception 'Ordinary direct-message sender lost access'; end if;
 insert into public.notes(id,org_id,source_type,author_id,mention_user_ids)
 values('40000000-0000-0000-0000-000000000010',scope,'system',actor,array[actor]);
 select * into item from public.notification_inbox_items where source_id='40000000-0000-0000-0000-000000000010';
 if not(actor=any(item.target_user_ids)) then raise exception 'Explicitly addressed author lost access'; end if;
 insert into public.notes(id,org_id,source_type,author_id,mention_role_ids)
 values('40000000-0000-0000-0000-000000000011',scope,'system',actor,array['30000000-0000-0000-0000-000000000002'::uuid]);
 select * into item from public.notification_inbox_items where source_id='40000000-0000-0000-0000-000000000011';
 if cardinality(item.target_user_ids)<>0 or cardinality(item.target_role_ids)<>1 then raise exception 'Role-only message addressed to the actor'; end if;
 insert into public.notes(id,org_id,source_type,author_id,metadata)
 values('40000000-0000-0000-0000-000000000012',scope,'system',actor,'{"is_org_wide":true}');
 select * into item from public.notification_inbox_items where source_id='40000000-0000-0000-0000-000000000012';
 if cardinality(item.target_user_ids)<>0 or item.is_org_wide then raise exception 'Untargeted system note became organization-wide'; end if;
end $$;
