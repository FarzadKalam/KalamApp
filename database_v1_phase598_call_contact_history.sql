-- One paginated, RLS-preserving relation graph for the call UI and agent tools.
begin;
create or replace function public.read_call_contact_history(p_module_id text,p_record_id uuid,p_section text,p_offset integer default 0)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 v_org uuid:=public.current_org_id();v_context jsonb;v_contact jsonb;v_table text;v_module text;
 v_columns text[];v_where text;v_party_fk text;v_task_fk text;v_projects text;v_result jsonb;v_permissions jsonb;v_profile uuid;v_projection text;v_activity text;
begin
 if v_org is null or p_module_id not in ('customers','suppliers','employees') or p_record_id is null then raise exception 'contact_scope_required';end if;
 v_context:=public.get_current_organization_context();v_permissions:=coalesce(v_context->'permissions','{}');
 if not(v_permissions?p_module_id) or coalesce((v_permissions->p_module_id->>'view')::boolean,false)=false then raise exception 'contact_access_denied';end if;
 execute format('select to_jsonb(c) from public.%I c where c.org_id=$1 and c.id=$2',p_module_id) into v_contact using v_org,p_record_id;
 if v_contact is null then raise exception 'contact_not_available';end if;
 v_party_fk:=case p_module_id when 'customers' then 'customer_id' when 'suppliers' then 'supplier_id' else 'employee_id' end;
 v_task_fk:=case p_module_id when 'customers' then 'related_customer' when 'suppliers' then 'related_supplier' else 'assignee_id' end;
 v_profile:=nullif(v_contact->>'related_profile_id','')::uuid;
 v_projects:=case p_module_id
  when 'customers' then format('select p.id from public.projects p where p.org_id=%L::uuid and p.customer_id=%L::uuid',v_org,p_record_id)
  when 'suppliers' then format('select p.id from public.projects p where p.org_id=%L::uuid and (p.source_purchase_invoice_id in(select i.id from public.purchase_invoices i where i.org_id=%L::uuid and i.supplier_id=%L::uuid) or p.id in(select i.project_id from public.purchase_invoices i where i.org_id=%L::uuid and i.supplier_id=%L::uuid))',v_org,v_org,p_record_id,v_org,p_record_id)
  else format('select p.id from public.projects p where p.org_id=%L::uuid and p.owner_id=%L::uuid',v_org,v_profile) end;
 case p_section
 when 'invoices' then
  v_module:='invoices';v_table:='invoices';v_columns:=array['id','name','system_code','status','invoice_date','total_invoice_amount','total_received_amount','remaining_balance','payments','created_at','updated_at'];
  v_where:=case when p_module_id='customers' then format('t.customer_id=%L::uuid and not coalesce(t.is_deleted,false)',p_record_id) else 'false' end;
 when 'purchases' then
  v_module:='purchase_invoices';v_table:=v_module;v_columns:=array['id','name','system_code','status','invoice_date','total_invoice_amount','total_received_amount','remaining_balance','payments','created_at','updated_at'];
  v_where:=case when p_module_id='suppliers' then format('t.supplier_id=%L::uuid',p_record_id) else 'false' end;
 when 'projects' then
  v_module:='projects';v_table:=v_module;v_columns:=array['id','name','system_code','status','start_date','due_date','progress_percent','created_at','updated_at'];v_where:=format('t.id in(%s)',v_projects);
 when 'tasks' then
  v_module:='tasks';v_table:=v_module;v_columns:=array['id','name','system_code','status','due_date','assignee_id','project_id','created_at','updated_at'];
  v_where:=format('(t.%I=%L::uuid or (t.source_module_id=%L and t.source_record_id=%L::uuid))',v_task_fk,case when p_module_id='employees' then v_profile else p_record_id end,p_module_id,p_record_id);
  if v_permissions?'projects' and coalesce((v_permissions->'projects'->>'view')::boolean,false) then v_where:=v_where||format(' or t.project_id in(%s)',v_projects);end if;
 when 'processes' then
  v_module:='process_runs';v_table:=v_module;v_columns:=array['id','process_name','system_code','status','started_at','completed_at','module_id','record_id','created_at','updated_at'];v_where:=format('(t.module_id=%L and t.record_id=%L::uuid)',p_module_id,p_record_id);
  if v_permissions?'projects' and coalesce((v_permissions->'projects'->>'view')::boolean,false) then v_where:=v_where||format(' or (t.module_id=''projects'' and t.record_id in(%s))',v_projects);end if;
 when 'groups' then
  v_module:='counterparty_bot_groups';v_table:=v_module;v_columns:=array['id','group_title','channel_type','status','last_inbound_at','created_at','updated_at'];v_where:=format('t.%I=%L::uuid',v_party_fk,p_record_id);
 when 'sms' then
  v_module:='sms_delivery_reports';v_table:=v_module;v_columns:=array['id','title','message_text','status','direction','sent_at','created_at','updated_at'];
  v_where:=format('(t.related_module_id=%L and t.related_record_id=%L::uuid)',p_module_id,p_record_id);
  if p_module_id='customers' then v_where:=v_where||format(' or t.customer_id=%L::uuid',p_record_id);end if;
  v_where:=v_where||format(' or t.phone_number_id in(select l.phone_number_id from public.phone_number_links l where l.org_id=%L::uuid and l.entity_type=%L and l.entity_id=%L::uuid)',v_org,p_module_id,p_record_id);
 when 'calls' then
  v_module:='voip_call_reports';v_table:='voip_call_logs';v_columns:=array['id','title','direction','status','started_at','talk_seconds','created_at','updated_at'];
  v_where:=format('(t.related_module_id=%L and t.related_record_id=%L::uuid) or (t.module_id=%L and t.record_id=%L::uuid) or t.phone_number_id in(select l.phone_number_id from public.phone_number_links l where l.org_id=%L::uuid and l.entity_type=%L and l.entity_id=%L::uuid)',p_module_id,p_record_id,p_module_id,p_record_id,v_org,p_module_id,p_record_id);
 when 'email' then
  v_module:='email_delivery_reports';v_table:='email_messages';v_columns:=array['id','subject','status','direction','message_at','created_at'];v_where:=format('(t.related_module_id=%L and t.related_record_id=%L::uuid)',p_module_id,p_record_id);
 else raise exception 'invalid_contact_section';end case;
 if not(v_permissions?v_module) or coalesce((v_permissions->v_module->>'view')::boolean,false)=false then raise exception 'section_access_denied';end if;
 if not public.org_has_plan_feature(v_org,'voip_webphone',true) then raise exception 'call_context_plan_denied';end if;
 -- Field restrictions are applied before projection; no credentials/full row leaves this function.
 select array_agg(c) into v_columns from unnest(v_columns)c where c='id' or
  (coalesce(v_permissions->v_module->'fields'->c,'true'::jsonb)<>'false'::jsonb and coalesce(v_permissions->v_module->'fields'->c->>'view','true')<>'false');
 select 'jsonb_build_object('||string_agg(format('%L,t.%I',c,c),',')||')' into v_projection from unnest(v_columns)c;
 v_activity:=case when p_section='email' then 't.created_at' else 'greatest(t.updated_at,t.created_at)' end;
 execute format($q$
  with scoped as not materialized(select %s value,%s activity_at
    from public.%I t where t.org_id=$1 and (%s)),
  page as(select value,activity_at from scoped order by activity_at desc nulls last,value->>'id' desc limit 20 offset $2)
  select jsonb_build_object('count',(select count(*) from scoped),'offset',$2,'hasMore',(select count(*) from scoped)>$2+20,
   'rows',coalesce((select jsonb_agg((select jsonb_object_agg(key,val) from jsonb_each(page.value)kv(key,val) where key=any($3)) order by activity_at desc nulls last,value->>'id' desc) from page),'[]'::jsonb),
   'summary',case when $4 then (select jsonb_build_object('total',count(*),'proforma',count(*) filter(where value->>'status'='proforma'),
     'settled',count(*) filter(where value->>'status'='settled'),
     'completedAndSettled',count(*) filter(where value->>'status'='completed' and (value->>'remaining_balance')::numeric=0),
     'outstanding',count(*) filter(where coalesce((value->>'remaining_balance')::numeric,0)>0 and value->>'status'<>'canceled')) from scoped) else null end)
 $q$,v_projection,v_activity,v_table,v_where) into v_result using v_org,greatest(coalesce(p_offset,0),0),v_columns,
 (p_section in('invoices','purchases') and 'status'=any(v_columns) and 'remaining_balance'=any(v_columns));
 return v_result;
end;$$;
revoke all on function public.read_call_contact_history(text,uuid,text,integer) from public,anon;
grant execute on function public.read_call_contact_history(text,uuid,text,integer) to authenticated;
comment on function public.read_call_contact_history(text,uuid,text,integer) is 'Invoker/RLS scoped call-contact history; public caller ID is not authentication.';
notify pgrst,'reload schema';
commit;
