-- One paginated, RLS-preserving relation graph for the call UI and agent tools.
begin;
create or replace function public.call_contact_condition_matches(p_row jsonb,p_condition jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare f text:=p_condition->>'field';op text:=p_condition->>'operator';v jsonb;expected jsonb:=p_condition->'value';actual_text text;expected_text text;
begin
 if f is null or f!~'^[a-zA-Z_][a-zA-Z0-9_]*$' or not(p_row?f)then return null;end if;
 v:=p_row->f;actual_text:=p_row->>f;expected_text:=p_condition->>'value';
 case op
 when 'eq' then return actual_text is not distinct from expected_text;
 when 'neq' then return actual_text is not null and expected_text is not null and actual_text<>expected_text;
 when 'is_empty' then return actual_text is null or actual_text='';
 when 'is_not_empty' then return actual_text is not null and actual_text<>'';
 when 'contains' then return actual_text is not null and expected_text is not null and position(expected_text in actual_text)>0;
 when 'in' then if jsonb_typeof(expected)<>'array' then return null;end if;return exists(select 1 from jsonb_array_elements_text(expected)x where x=actual_text);
 when 'not_in' then if jsonb_typeof(expected)<>'array' then return null;end if;return actual_text is not null and not exists(select 1 from jsonb_array_elements_text(expected)x where x=actual_text);
 when 'gt','gte','lt','lte' then
  if actual_text is null or expected_text is null then return false;end if;
  if jsonb_typeof(v)='number' and jsonb_typeof(expected)='number' then
   return case op when 'gt' then actual_text::numeric>expected_text::numeric when 'gte' then actual_text::numeric>=expected_text::numeric when 'lt' then actual_text::numeric<expected_text::numeric else actual_text::numeric<=expected_text::numeric end;
  elsif jsonb_typeof(v)='string' and jsonb_typeof(expected)='string' then
   return case op when 'gt' then actual_text>expected_text when 'gte' then actual_text>=expected_text when 'lt' then actual_text<expected_text else actual_text<=expected_text end;
  end if;
  return false;
 else return null;
 end case;
exception when others then return null;
end;$$;
revoke all on function public.call_contact_condition_matches(jsonb,jsonb) from public,anon;
grant execute on function public.call_contact_condition_matches(jsonb,jsonb) to authenticated;

-- Shared, fail-closed scope check. Context is always built by the calling RPC,
-- never accepted from the browser. A boolean helper grants no data access.
create or replace function public.call_contact_scope_visible(p_context jsonb,p_module text,p_row jsonb)
returns boolean language plpgsql stable security invoker set search_path=public as $$
declare p jsonb:=coalesce(p_context->'permissions'->p_module,'{}');s text:=coalesce(nullif(p->>'record_scope',''),'all');
 u uuid:=auth.uid();r uuid:=nullif(p_context->>'role_id','')::uuid;allowed_roles uuid[];g jsonb:=p->'view_conditions';all_conditions jsonb;any_conditions jsonb;c jsonb;matched boolean;any_matched boolean:=false;
begin
 if not(p_context->'permissions'?p_module) or coalesce((p->>'view')::boolean,false)=false then return false;end if;
 if g?'conditions_all' or g?'conditions_any' then all_conditions:=coalesce(g->'conditions_all','[]');any_conditions:=coalesce(g->'conditions_any','[]');
 elsif g->>'logic'='or' then all_conditions:='[]';any_conditions:=coalesce(g->'conditions','[]');
 else all_conditions:=coalesce(g->'conditions','[]');any_conditions:='[]';end if;
 for c in select value from jsonb_array_elements(all_conditions)loop
  matched:=public.call_contact_condition_matches(p_row,c);if matched is distinct from true then return false;end if;
 end loop;
 for c in select value from jsonb_array_elements(any_conditions)loop
  matched:=public.call_contact_condition_matches(p_row,c);if matched is null then return false;end if;any_matched:=any_matched or matched;
 end loop;
 if jsonb_array_length(any_conditions)>0 and not any_matched then return false;end if;
 if s='all' then return true;end if;
 if u is null then return false;end if;
 if s='own' then return p_row->>'assignee_type'='user' and p_row->>'assignee_id'=u::text;end if;
 if s='team' then return r is not null and p_row->>'assignee_type'='role' and coalesce(p_row->>'assignee_role_id',p_row->>'assignee_id')=r::text;end if;
 if s='subtree' then
  with recursive tree as(select id from public.org_roles where id=r and org_id=public.current_org_id()
   union select child.id from public.org_roles child join tree parent on child.parent_id=parent.id where child.org_id=public.current_org_id())
   select coalesce(array_agg(id),'{}'::uuid[]) into allowed_roles from tree;
  if p_row->>'assignee_type'='role' then return coalesce(p_row->>'assignee_role_id',p_row->>'assignee_id')=any(allowed_roles::text[]);end if;
  if p_row->>'assignee_type'='user' then return p_row->>'assignee_id'=u::text or exists(select 1 from public.user_organization_memberships m
    where m.org_id=public.current_org_id() and m.is_active and m.user_id::text=p_row->>'assignee_id' and m.role_id=any(allowed_roles));end if;
 end if;
 return false;
exception when others then return false;
end;$$;
revoke all on function public.call_contact_scope_visible(jsonb,text,jsonb) from public,anon;
grant execute on function public.call_contact_scope_visible(jsonb,text,jsonb) to authenticated;

create or replace function public.filter_call_contact_identities(p_module_id text,p_ids uuid[])
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb;ctx jsonb:=public.get_current_organization_context();begin
 if public.current_org_id() is null or p_module_id not in('customers','suppliers','employees') or coalesce(array_length(p_ids,1),0)>100 then raise exception 'invalid_contact_scope';end if;
 execute format('select coalesce(jsonb_agg(c.id),''[]''::jsonb) from public.%I c where c.org_id=$1 and c.id=any($2) and public.call_contact_scope_visible($3,$4,to_jsonb(c))',p_module_id)
 into result using public.current_org_id(),p_ids,ctx,p_module_id;
 return result;
end;$$;
revoke all on function public.filter_call_contact_identities(text,uuid[]) from public,anon;
grant execute on function public.filter_call_contact_identities(text,uuid[]) to authenticated;

create or replace function public.search_call_contact_identities(p_query text,p_phone_key text default null)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare ctx jsonb:=public.get_current_organization_context();org uuid:=public.current_org_id();m text;cols text[];phone_cols text[];name_cols text[];projection text;predicate text;rows jsonb;result jsonb:='[]';
begin
 if org is null or length(trim(coalesce(p_query,'')))<2 or length(p_query)>100 then return result;end if;
 if not public.org_has_plan_feature(org,'voip_webphone',true) then return result;end if;
 if p_phone_key is not null and p_phone_key!~'^[0-9]{7,15}$' then return result;end if;
 foreach m in array array['customers','suppliers','employees']loop
  if not(ctx->'permissions'?m) or coalesce((ctx->'permissions'->m->>'view')::boolean,false)=false then continue;end if;
  cols:=array['id','full_name','first_name','last_name','mobile_1','mobile_2','phone','updated_at','created_at'];
  if m<>'employees' then cols:=cols||array['business_name','rank'];else cols:=cols||array['job_title'];end if;
  select array_agg(c) into cols from unnest(cols)c where c='id' or
   (coalesce(ctx->'permissions'->m->'fields'->c,'true')<>'false'::jsonb and coalesce(ctx->'permissions'->m->'fields'->c->>'view','true')<>'false');
  select array_agg(c) into phone_cols from unnest(cols)c where c in('mobile_1','mobile_2','phone');
  select array_agg(c) into name_cols from unnest(cols)c where c in('full_name','first_name','last_name','business_name');
  select 'jsonb_build_object('||string_agg(format('%L,t.%I',c,c),',')||')' into projection from unnest(cols)c;
  if p_phone_key is not null then
   select string_agg(format('public.kalam_phone_lookup_key(t.%I)=$3',c),' or ') into predicate from unnest(phone_cols)c;
   predicate:=coalesce(predicate,'false')||format(' or exists(select 1 from public.phone_number_links l join public.phone_numbers n on n.id=l.phone_number_id and n.org_id=l.org_id where l.org_id=$1 and l.entity_type=%L and l.entity_id=t.id and l.source_field=any($5) and n.lookup_key=$3)',m);
  else
   select string_agg(format('position(lower($2) in lower(coalesce(t.%I,'''')))>0',c),' or ') into predicate from unnest(name_cols)c;
   predicate:=coalesce(predicate,'false');
  end if;
  execute format('select coalesce(jsonb_agg(value),''[]''::jsonb) from(select (%s)||jsonb_build_object(''moduleId'',%L) value from public.%I t where t.org_id=$1 and (%s) and public.call_contact_scope_visible($4,%L,to_jsonb(t)) order by greatest(t.updated_at,t.created_at) desc nulls last,t.id desc limit 20)matched',projection,m,m,predicate,m)
   into rows using org,p_query,p_phone_key,ctx,phone_cols;
  result:=result||rows;
 end loop;
 return result;
end;$$;
revoke all on function public.search_call_contact_identities(text,text) from public,anon;
grant execute on function public.search_call_contact_identities(text,text) to authenticated;

create or replace function public.read_call_contact_history(p_module_id text,p_record_id uuid,p_section text,p_offset integer default 0)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 v_org uuid:=public.current_org_id();v_context jsonb;v_contact jsonb;v_table text;v_module text;
 v_columns text[];v_where text;v_party_fk text;v_task_fk text;v_projects text;v_result jsonb;v_permissions jsonb;v_profile uuid;v_projection text;v_activity text;v_scope_sql text;
begin
 if v_org is null or p_module_id not in ('customers','suppliers','employees') or p_record_id is null then raise exception 'contact_scope_required';end if;
 v_context:=public.get_current_organization_context();v_permissions:=coalesce(v_context->'permissions','{}');
 if not(v_permissions?p_module_id) or coalesce((v_permissions->p_module_id->>'view')::boolean,false)=false then raise exception 'contact_access_denied';end if;
 execute format('select to_jsonb(c) from public.%I c where c.org_id=$1 and c.id=$2',p_module_id) into v_contact using v_org,p_record_id;
 if v_contact is null then raise exception 'contact_not_available';end if;
 if not public.call_contact_scope_visible(v_context,p_module_id,v_contact) then raise exception 'contact_scope_denied';end if;
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
 v_scope_sql:=case when coalesce(nullif(v_permissions->v_module->>'record_scope',''),'all')='all'
  and coalesce(v_permissions->v_module->'view_conditions','{}'::jsonb) in ('{}'::jsonb,'null'::jsonb)
  then 'true' else 'public.call_contact_scope_visible($5,$6,to_jsonb(t))' end;
 execute format($q$
  with scoped as not materialized(select %s value,%s activity_at
    from public.%I t where t.org_id=$1 and (%s) and (%s)),
  page as(select value,activity_at from scoped order by activity_at desc nulls last,value->>'id' desc limit 20 offset $2)
  select jsonb_build_object('count',(select count(*) from scoped),'offset',$2,'hasMore',(select count(*) from scoped)>$2+20,
   'rows',coalesce((select jsonb_agg((select jsonb_object_agg(key,val) from jsonb_each(page.value)kv(key,val) where key=any($3)) order by activity_at desc nulls last,value->>'id' desc) from page),'[]'::jsonb),
   'summary',case when $4 then (select jsonb_build_object('total',count(*),'proforma',count(*) filter(where value->>'status'='proforma'),
     'settled',count(*) filter(where value->>'status'='settled'),
     'completedAndSettled',count(*) filter(where value->>'status'='completed' and (value->>'remaining_balance')::numeric=0),
     'outstanding',count(*) filter(where coalesce((value->>'remaining_balance')::numeric,0)>0 and value->>'status'<>'canceled')) from scoped) else null end)
 $q$,v_projection,v_activity,v_table,v_where,v_scope_sql) into v_result using v_org,greatest(coalesce(p_offset,0),0),v_columns,
 (p_section in('invoices','purchases') and 'status'=any(v_columns) and 'remaining_balance'=any(v_columns)),v_context,v_module;
 return v_result;
end;$$;
revoke all on function public.read_call_contact_history(text,uuid,text,integer) from public,anon;
grant execute on function public.read_call_contact_history(text,uuid,text,integer) to authenticated;
comment on function public.read_call_contact_history(text,uuid,text,integer) is 'Invoker/RLS scoped call-contact history; public caller ID is not authentication.';
notify pgrst,'reload schema';
commit;
