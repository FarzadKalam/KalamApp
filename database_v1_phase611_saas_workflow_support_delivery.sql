begin;

create or replace function public.workflow_has_provider_sales_action(p_actions jsonb)
returns boolean language sql immutable set search_path=public as $$
  select exists(select 1 from jsonb_array_elements(
    case when jsonb_typeof(p_actions)='array' then p_actions else '[]'::jsonb end
  ) action where action->>'type' in ('send_saas_invoice','apply_saas_invoice_access')
    or (action->>'type'='send_message' and action->'config'->'message_channels' ? 'ticket'))
$$;
revoke all on function public.workflow_has_provider_sales_action(jsonb) from public,anon;
grant execute on function public.workflow_has_provider_sales_action(jsonb) to authenticated,service_role;
drop policy if exists saas_sales_workflow_scope on public.workflows;
create policy saas_sales_workflow_scope on public.workflows as restrictive for all to authenticated
  using (org_id=public.current_org_id() and (not public.workflow_has_provider_sales_action(actions)
    or coalesce(public.saas_lifecycle_workflows_allowed(),false)))
  with check (org_id=public.current_org_id() and (not public.workflow_has_provider_sales_action(actions)
    or coalesce(public.saas_lifecycle_workflows_allowed(),false)));

create or replace function public.guard_provider_sales_workflow() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if not public.workflow_has_provider_sales_action(new.actions) then return new; end if;
  if new.org_id is distinct from public.support_provider_org_id()
    or new.module_id not in ('saas_orgs','saas_demo_requests','invoices') or new.module_id is null then
    raise exception 'saas_workflow_access_denied' using errcode='42501';
  end if;
  if new.module_id<>'invoices' and exists(select 1 from jsonb_array_elements(new.actions) a where a->>'type'='apply_saas_invoice_access') then
    raise exception 'اعمال دسترسی فقط برای فاکتور فروش قابل تعریف است.';
  end if;
  if auth.role() is distinct from 'service_role' then
    if not coalesce(public.saas_lifecycle_workflows_allowed(),false) then raise exception 'saas_workflow_access_denied' using errcode='42501'; end if;
    new.updated_by:=auth.uid();
    if tg_op='INSERT' then new.created_by:=auth.uid(); end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_provider_sales_workflow() from public,anon,authenticated;
drop trigger if exists guard_provider_sales_workflow on public.workflows;
create trigger guard_provider_sales_workflow before insert or update on public.workflows
  for each row execute function public.guard_provider_sales_workflow();

drop policy if exists saas_sales_interval_job_scope on public.workflow_interval_jobs;
create policy saas_sales_interval_job_scope on public.workflow_interval_jobs as restrictive for select to authenticated
  using (org_id=public.current_org_id() and (
    (coalesce(module_id,'') not in ('saas_orgs','saas_demo_requests','saas_users')
      and not public.workflow_has_provider_sales_action(payload->'workflow'->'actions'))
    or coalesce(public.saas_lifecycle_workflows_allowed(),false)));

create or replace function public.workflow_log_has_provider_sales_action(p_workflow uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workflows w where w.org_id=public.current_org_id() and w.id=p_workflow
    and public.workflow_has_provider_sales_action(w.actions))
$$;
revoke all on function public.workflow_log_has_provider_sales_action(uuid) from public,anon;
grant execute on function public.workflow_log_has_provider_sales_action(uuid) to authenticated;
drop policy if exists saas_sales_workflow_log_scope on public.workflow_logs;
create policy saas_sales_workflow_log_scope on public.workflow_logs as restrictive for select to authenticated
  using (org_id=public.current_org_id() and (
    (coalesce(module_id,'') not in ('saas_orgs','saas_demo_requests','saas_users')
      and not public.workflow_log_has_provider_sales_action(workflow_id))
    or coalesce(public.saas_lifecycle_workflows_allowed(),false)));

alter table public.saas_support_tickets add column if not exists customer_recipient_ids uuid[];
alter table public.saas_support_tickets add column if not exists workflow_delivery_key text;
create unique index if not exists saas_support_workflow_delivery_once on public.saas_support_tickets(org_id,workflow_delivery_key)
  where workflow_delivery_key is not null;

create or replace function public.support_eligible_outgoing_members(p_tenant uuid)
returns table(user_id uuid,display_name text,role_title text,is_owner boolean)
language sql stable security definer set search_path=public as $$
  select m.user_id,coalesce(nullif(p.full_name,''),'کاربر سازمان'),
    coalesce(nullif(r.title,''),case when m.is_owner then 'مالک' when m.software_role in ('admin','super_admin') then 'مدیر' else 'کاربر' end),
    coalesce(m.is_owner,false)
  from public.user_organization_memberships m join public.profiles p on p.id=m.user_id
  left join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
  where m.org_id=p_tenant and m.is_active and p.is_active is distinct from false
    and coalesce(r.permissions->'__support_tickets'->>'view','true')<>'false'
    and (coalesce(r.permissions->'__support_tickets'->'fields'->>'view_own','true')<>'false'
      or coalesce(r.permissions->'__support_tickets'->'fields'->>'view_all',
        (coalesce(m.is_owner,false) or m.software_role in ('admin','super_admin'))::text)='true')
$$;
revoke all on function public.support_eligible_outgoing_members(uuid) from public,anon,authenticated;

create or replace function public.support_customer_can_on_ticket(p_tenant uuid,p_action text,p_legacy_recipient uuid,p_recipients uuid[])
returns boolean language sql stable security definer set search_path=public as $$
  select case when p_recipients is null then public.support_customer_can(p_tenant,p_action,p_legacy_recipient)
    when auth.uid()=any(p_recipients) then public.support_customer_can(p_tenant,p_action,auth.uid())
    else false end
$$;
revoke all on function public.support_customer_can_on_ticket(uuid,text,uuid,uuid[]) from public,anon,authenticated;

do $$ declare signature text; definition text; patched text;
begin
  foreach signature in array array[
    'public.support_can_view_ticket(uuid,boolean)','public.support_list_tickets(text,text,integer,integer)',
    'public.support_send_message(uuid,text,boolean)','public.support_unread_total()','public.support_can_attach_to_message(uuid)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if position('support_customer_can_on_ticket(' in definition)>0 then continue; end if;
    patched:=regexp_replace(definition,
      'public\.support_customer_can\(([^,]+),\s*(''view''|''reply''),\s*(coalesce\(t\.customer_user_id,\s*t\.created_by\)|t\.created_by)\)',
      'public.support_customer_can_on_ticket(\1,\2,\3,t.customer_recipient_ids)','g');
    if patched=definition then raise exception 'support_audience_patch_not_matched: %',signature; end if;
    execute patched;
  end loop;
end $$;

create or replace function public.support_customer_notification_recipients(p_ticket_id uuid)
returns uuid[] language sql stable security definer set search_path=public as $$
  select coalesce(array_agg(m.user_id order by m.user_id),'{}'::uuid[])
  from public.saas_support_tickets t
  cross join lateral public.support_eligible_outgoing_members(t.customer_org_id) m
  join public.user_organization_memberships membership on membership.org_id=t.customer_org_id and membership.user_id=m.user_id
  left join public.org_roles r on r.id=membership.role_id and r.org_id=t.customer_org_id
  where t.id=p_ticket_id and (case when t.customer_recipient_ids is not null then m.user_id=any(t.customer_recipient_ids)
    else (m.user_id=coalesce(t.customer_user_id,t.created_by) or
      coalesce(r.permissions->'__support_tickets'->'fields'->>'view_all',
        (m.is_owner or membership.software_role in ('admin','super_admin'))::text)='true') end)
$$;

create or replace function public.support_deliver_outgoing_ticket(
  p_provider uuid,p_actor uuid,p_tenant uuid,p_recipients text[],p_category text,p_subject text,p_body text,p_key text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare selected uuid[]; ticket public.saas_support_tickets%rowtype; message_id uuid;
begin
  if p_provider is distinct from public.support_provider_org_id() or p_provider is null or p_tenant is null
    or p_tenant=p_provider or public.org_is_saas_admin(p_tenant) then raise exception 'support_customer_invalid'; end if;
  if p_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('saas-ticket:'||p_provider::text||p_key,0));
    select * into ticket from public.saas_support_tickets where org_id=p_provider and workflow_delivery_key=p_key;
    if found then return jsonb_build_object('id',ticket.id,'code',public.support_ticket_code(ticket.ticket_no),'already_sent',true); end if;
  end if;
  p_recipients:=coalesce(nullif(p_recipients,'{}'::text[]),array['default']);
  select array_agg(distinct m.user_id) into selected from public.support_eligible_outgoing_members(p_tenant) m
    where 'default'=any(p_recipients) or ('owner'=any(p_recipients) and m.is_owner) or m.user_id::text=any(p_recipients);
  if selected is null then raise exception 'گیرنده‌ای با دسترسی تیکت در سازمان پیدا نشد.'; end if;
  if exists(select 1 from unnest(p_recipients) r where r not in ('default','owner')
    and not exists(select 1 from unnest(selected) s where s::text=r)) then raise exception 'یکی از گیرنده‌ها در سازمان دسترسی تیکت ندارد.'; end if;
  if not exists(select 1 from public.saas_support_categories where code=p_category and is_active) then raise exception 'support_category_invalid'; end if;
  if length(trim(coalesce(p_subject,''))) not between 3 and 180 or length(trim(coalesce(p_body,''))) not between 1 and 10000 then raise exception 'support_content_invalid'; end if;
  insert into public.saas_support_tickets(org_id,customer_org_id,customer_recipient_ids,created_by,category_code,subject,status,ticket_type,first_response_at,workflow_delivery_key)
    values(p_provider,p_tenant,selected,p_actor,p_category,trim(p_subject),'answered','outgoing',now(),p_key) returning * into ticket;
  insert into public.saas_support_messages(org_id,ticket_id,author_id,visibility,body)
    values(p_provider,ticket.id,p_actor,'customer',trim(p_body)) returning id into message_id;
  insert into public.saas_support_events(org_id,ticket_id,actor_id,event_type,new_value)
    values(p_provider,ticket.id,p_actor,'created',ticket.status);
  perform public.kalam_upsert_notification_item(p_tenant,'support_ticket',message_id::text,'support','reply','insert',
    'تیکت جدید از پشتیبانی '||public.support_ticket_code(ticket.ticket_no),left(trim(p_body),240),'saas_support_tickets',ticket.id::text,
    selected,'{}'::uuid[],false,jsonb_build_object('path','/support/tickets/'||ticket.id::text),now());
  return jsonb_build_object('id',ticket.id,'code',public.support_ticket_code(ticket.ticket_no),'message_id',message_id);
end $$;
revoke all on function public.support_deliver_outgoing_ticket(uuid,uuid,uuid,text[],text,text,text,text) from public,anon,authenticated;

create or replace function public.support_create_outgoing_ticket_multi(p_customer_org_id uuid,p_recipients text[],p_category text,p_subject text,p_body text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.support_is_operator('support_view') or not public.support_is_operator('support_reply') then raise exception 'support_access_denied' using errcode='42501'; end if;
  return public.support_deliver_outgoing_ticket(public.support_provider_org_id(),auth.uid(),p_customer_org_id,p_recipients,p_category,p_subject,p_body);
end $$;
revoke all on function public.support_create_outgoing_ticket_multi(uuid,text[],text,text,text) from public,anon;
grant execute on function public.support_create_outgoing_ticket_multi(uuid,text[],text,text,text) to authenticated;

create or replace function public.workflow_send_saas_ticket(
  p_provider uuid,p_actor uuid,p_module text,p_record uuid,p_recipients text[],p_category text,p_subject text,p_body text,p_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare tenant uuid;
begin
  if auth.role() is distinct from 'service_role' or not public.saas_workflow_actor_allowed(p_provider,p_actor) then
    raise exception 'saas_workflow_access_denied' using errcode='42501';
  end if;
  if nullif(p_key,'') is null then raise exception 'workflow_execution_key_required'; end if;
  tenant:=public.resolve_saas_workflow_tenant(p_provider,p_module,p_record);
  return public.support_deliver_outgoing_ticket(p_provider,p_actor,tenant,p_recipients,p_category,p_subject,p_body,p_key);
end $$;
revoke all on function public.workflow_send_saas_ticket(uuid,uuid,text,uuid,text[],text,text,text,text) from public,anon,authenticated;
grant execute on function public.workflow_send_saas_ticket(uuid,uuid,text,uuid,text[],text,text,text,text) to service_role;

create or replace function public.support_list_outgoing_recipients(p_tenant uuid,p_search text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not ((public.support_is_operator('support_view') and public.support_is_operator('support_reply'))
    or coalesce(public.saas_lifecycle_workflows_allowed(),false)) or public.org_is_saas_admin(p_tenant) then
    raise exception 'support_access_denied' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(m) order by m.is_owner desc,m.display_name,m.user_id),'[]') from
    (select * from public.support_eligible_outgoing_members(p_tenant)
      where is_owner or nullif(trim(p_search),'') is null or display_name ilike '%'||trim(p_search)||'%' or role_title ilike '%'||trim(p_search)||'%'
      order by is_owner desc,display_name,user_id limit 50) m);
end $$;
revoke all on function public.support_list_outgoing_recipients(uuid,text) from public,anon;
grant execute on function public.support_list_outgoing_recipients(uuid,text) to authenticated;

create or replace function public.saas_workflow_customer_organizations(p_search text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not coalesce(public.saas_lifecycle_workflows_allowed(),false) then raise exception 'saas_workflow_access_denied' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(o) order by o.name,o.id),'[]') from
    (select o.id,o.name from public.organizations o join public.saas_org_settings s on s.org_id=o.id
      where not public.org_is_saas_admin(o.id) and (nullif(trim(p_search),'') is null or o.name ilike '%'||trim(p_search)||'%')
      order by o.name,o.id limit 30) o);
end $$;
revoke all on function public.saas_workflow_customer_organizations(text) from public,anon;
grant execute on function public.saas_workflow_customer_organizations(text) to authenticated;

notify pgrst,'reload schema';
commit;
