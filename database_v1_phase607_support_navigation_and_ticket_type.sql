begin;

-- Direction is from the support desk's perspective and survives later replies.
alter table public.saas_support_tickets add column if not exists ticket_type text not null default 'incoming';
alter table public.saas_support_tickets add column if not exists customer_user_id uuid references auth.users(id);
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.saas_support_tickets'::regclass and conname='support_ticket_type_check') then
    alter table public.saas_support_tickets add constraint support_ticket_type_check check(ticket_type in ('incoming','outgoing'));
  end if;
end $$;
create index if not exists idx_support_type_recent on public.saas_support_tickets(org_id,ticket_type,last_message_at desc);

-- Add the field to the existing narrow RPC responses without replacing their
-- current authorization, pagination, attachments or customer visibility rules.
do $$ declare definition text; patched text; signature text; begin
  foreach signature in array array['public.support_list_tickets(text,text,integer,integer)','public.support_get_ticket(uuid)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if position('''ticket_type''' in definition)>0 then continue; end if;
    patched:=replace(definition,'''category_code'', t.category_code','''ticket_type'',t.ticket_type,''customer_user_id'',t.customer_user_id,''category_code'', t.category_code');
    patched:=replace(patched,'''category_code'',t.category_code','''ticket_type'',t.ticket_type,''customer_user_id'',t.customer_user_id,''category_code'',t.category_code');
    if patched=definition then raise exception 'support_ticket_response_patch_not_matched: %',signature; end if;
    execute patched;
  end loop;
  foreach signature in array array[
    'public.support_can_view_ticket(uuid,boolean)','public.support_customer_notification_recipients(uuid)',
    'public.support_list_tickets(text,text,integer,integer)','public.support_send_message(uuid,text,boolean)',
    'public.support_unread_total()','public.support_can_attach_to_message(uuid)'
  ] loop
    -- Optional helper names differ across older installations.
    if to_regprocedure(signature) is null then continue; end if;
    definition:=pg_get_functiondef(signature::regprocedure);
    if position('coalesce(t.customer_user_id,t.created_by)' in definition)>0 then continue; end if;
    patched:=replace(definition,', t.created_by)',', coalesce(t.customer_user_id,t.created_by))');
    patched:=replace(patched,',t.created_by)',',coalesce(t.customer_user_id,t.created_by))');
    patched:=replace(patched,'m.user_id=t.created_by and','m.user_id=coalesce(t.customer_user_id,t.created_by) and');
    if patched<>definition then execute patched; end if;
  end loop;
end $$;

create or replace function public.support_search_customers(p_search text default null,p_org_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.support_is_operator('support_view') or not public.support_is_operator('support_reply') then raise exception 'support_access_denied' using errcode='42501'; end if;
  if p_org_id is null then
    return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') from
      (select o.id,o.name from public.organizations o where not public.org_is_saas_admin(o.id)
        and (nullif(trim(p_search),'') is null or o.name ilike '%'||trim(p_search)||'%')
        order by o.name,o.id limit 30) matched);
  end if;
  if public.org_is_saas_admin(p_org_id) then raise exception 'support_customer_invalid'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') from
    (select m.user_id id,coalesce(nullif(p.full_name,''),'کاربر سازمان') name
      from public.user_organization_memberships m join public.profiles p on p.id=m.user_id
      left join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
      where m.org_id=p_org_id and m.is_active
        and coalesce(r.permissions->'__support_tickets'->'view','true')<>'false'::jsonb
        and (coalesce(r.permissions->'__support_tickets'->'fields'->'view_own','true')<>'false'::jsonb
          or coalesce(r.permissions->'__support_tickets'->'fields'->'view_all','false')='true'::jsonb)
        and (nullif(trim(p_search),'') is null or p.full_name ilike '%'||trim(p_search)||'%')
      order by name,m.user_id limit 30) matched);
end $$;
revoke all on function public.support_search_customers(text,uuid) from public,anon;
grant execute on function public.support_search_customers(text,uuid) to authenticated;

create or replace function public.support_create_outgoing_ticket(p_customer_org_id uuid,p_customer_user_id uuid,p_category text,p_subject text,p_body text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare provider uuid:=public.support_provider_org_id(); ticket public.saas_support_tickets%rowtype; message_id uuid;
begin
  if not public.support_is_operator('support_view') or not public.support_is_operator('support_reply') then raise exception 'support_access_denied' using errcode='42501'; end if;
  if provider is null or p_customer_org_id is null or p_customer_org_id=provider or public.org_is_saas_admin(p_customer_org_id) then raise exception 'support_customer_invalid'; end if;
  if not exists(select 1 from public.user_organization_memberships m left join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
    where m.org_id=p_customer_org_id and m.user_id=p_customer_user_id and m.is_active
      and coalesce(r.permissions->'__support_tickets'->'view','true')<>'false'::jsonb
      and (coalesce(r.permissions->'__support_tickets'->'fields'->'view_own','true')<>'false'::jsonb
        or coalesce(r.permissions->'__support_tickets'->'fields'->'view_all','false')='true'::jsonb)) then raise exception 'support_recipient_invalid'; end if;
  if not exists(select 1 from public.saas_support_categories where code=p_category and is_active) then raise exception 'support_category_invalid'; end if;
  if length(trim(coalesce(p_subject,''))) not between 3 and 180 or length(trim(coalesce(p_body,''))) not between 1 and 10000 then raise exception 'support_content_invalid'; end if;
  insert into public.saas_support_tickets(org_id,customer_org_id,customer_user_id,created_by,category_code,subject,status,ticket_type,first_response_at)
    values(provider,p_customer_org_id,p_customer_user_id,auth.uid(),p_category,trim(p_subject),'answered','outgoing',now()) returning * into ticket;
  insert into public.saas_support_messages(org_id,ticket_id,author_id,visibility,body)
    values(provider,ticket.id,auth.uid(),'customer',trim(p_body)) returning id into message_id;
  insert into public.saas_support_events(org_id,ticket_id,actor_id,event_type,new_value)
    values(provider,ticket.id,auth.uid(),'created',ticket.status);
  perform public.kalam_upsert_notification_item(ticket.customer_org_id,'support_ticket',message_id::text,'support','reply','insert',
    'تیکت جدید از پشتیبانی '||public.support_ticket_code(ticket.ticket_no),left(trim(p_body),240),'saas_support_tickets',ticket.id::text,
    public.support_customer_notification_recipients(ticket.id),'{}'::uuid[],false,
    jsonb_build_object('path','/support/tickets/'||ticket.id::text),now());
  return jsonb_build_object('id',ticket.id,'code',public.support_ticket_code(ticket.ticket_no),'message_id',message_id);
end $$;
revoke all on function public.support_create_outgoing_ticket(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.support_create_outgoing_ticket(uuid,uuid,text,text,text) to authenticated;

-- Ticket workflows remain owned by the provider. A second internal desk can
-- enter that context only through an existing, active and authorized membership.
create or replace function public.support_workflow_context()
returns uuid language plpgsql stable security definer set search_path=public as $$
declare provider uuid:=public.support_provider_org_id(); permission jsonb;
begin
  if not public.support_is_operator('support_view') or not public.support_is_operator('support_workflows') then
    raise exception 'support_access_denied' using errcode='42501';
  end if;
  select r.permissions->'__saas_admin' into permission from public.user_organization_memberships m
    join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
    where m.user_id=auth.uid() and m.org_id=provider and m.is_active limit 1;
  if not found or not(coalesce(permission->'view','false')='true'::jsonb or coalesce(permission->'edit','false')='true'::jsonb)
    or permission->'fields'->'support_view'='false'::jsonb
    or coalesce(permission->'fields'->'support_workflows',permission->'edit','false')<>'true'::jsonb then
    raise exception 'support_workflow_membership_required' using errcode='42501';
  end if;
  return provider;
end $$;
revoke all on function public.support_workflow_context() from public,anon;
grant execute on function public.support_workflow_context() to authenticated;

-- Empty broadcasts reveal no ticket content. Each recipient reloads through
-- its own authorized RPC. Include both internal organizations, not only provider.
create or replace function public.support_broadcast_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare provider_org uuid; customer_org uuid; target_org uuid;
begin
  if tg_table_name='saas_support_tickets' then provider_org:=new.org_id;customer_org:=new.customer_org_id;
  else select t.org_id,t.customer_org_id into provider_org,customer_org from public.saas_support_tickets t where t.id=new.ticket_id; end if;
  for target_org in select distinct id from public.organizations
    where id in(provider_org,customer_org) or public.org_is_saas_admin(id) loop
    perform public.kalam_broadcast_notification(public.kalam_realtime_org_topic(target_org),'support_tickets_changed','{}'::jsonb);
  end loop;
  return new;
end $$;

notify pgrst,'reload schema';
commit;
