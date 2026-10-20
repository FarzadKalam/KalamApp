begin;

-- The support inbox belongs to the SaaS provider. Customer access is exclusively
-- through narrow security-definer RPCs; there is no cross-org table SELECT policy.
create table if not exists public.saas_support_categories (
  code text primary key,
  title text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true
);
alter table public.saas_support_categories enable row level security;
revoke all on public.saas_support_categories from public, anon, authenticated;

insert into public.saas_support_categories(code, title, sort_order) values
  ('pre_sales', 'راهنمایی قبل از خرید', 10),
  ('technical', 'پشتیبانی فنی', 20),
  ('billing', 'مالی و فاکتورها', 30),
  ('feedback', 'انتقاد و پیشنهاد', 40),
  ('installation', 'درخواست نصب', 50)
on conflict (code) do nothing;

create table if not exists public.saas_support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no bigint generated always as identity unique,
  org_id uuid not null references public.organizations(id),
  customer_org_id uuid not null references public.organizations(id),
  created_by uuid not null references auth.users(id),
  category_code text not null references public.saas_support_categories(code),
  subject text not null check (length(trim(subject)) between 3 and 180),
  status text not null default 'waiting_operator' check (status in ('waiting_operator', 'in_review', 'answered', 'closed')),
  assigned_to uuid references auth.users(id),
  first_response_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (org_id <> customer_org_id)
);
create index if not exists idx_support_customer_recent on public.saas_support_tickets(customer_org_id, last_message_at desc);
create index if not exists idx_support_provider_status_recent on public.saas_support_tickets(org_id, status, last_message_at desc);
create index if not exists idx_support_creator_recent on public.saas_support_tickets(customer_org_id, created_by, last_message_at desc);
create index if not exists idx_support_assignee on public.saas_support_tickets(org_id, assigned_to, status);

create table if not exists public.saas_support_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  ticket_id uuid not null references public.saas_support_tickets(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  visibility text not null check (visibility in ('customer', 'internal')),
  message_kind text not null default 'reply' check (message_kind in ('reply', 'note', 'forward')),
  body text not null check (length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index if not exists idx_support_messages_ticket_time on public.saas_support_messages(ticket_id, created_at, id);
create index if not exists idx_support_messages_org_ticket_time on public.saas_support_messages(org_id, ticket_id, created_at);

create table if not exists public.saas_support_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  ticket_id uuid not null references public.saas_support_tickets(id) on delete cascade,
  message_id uuid not null references public.saas_support_messages(id) on delete cascade,
  object_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  created_at timestamptz not null default now()
);
create index if not exists idx_support_attachments_message on public.saas_support_attachments(message_id);
create index if not exists idx_support_attachments_org_message on public.saas_support_attachments(org_id, message_id);

create table if not exists public.saas_support_forwards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  ticket_id uuid not null references public.saas_support_tickets(id) on delete cascade,
  source_message_id uuid not null references public.saas_support_messages(id),
  note_message_id uuid not null references public.saas_support_messages(id),
  recipient_id uuid not null references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(note_message_id, recipient_id)
);
create index if not exists idx_support_forwards_recipient on public.saas_support_forwards(org_id, recipient_id, created_at desc);

create table if not exists public.saas_support_forward_attachments (
  org_id uuid not null references public.organizations(id),
  forward_id uuid not null references public.saas_support_forwards(id) on delete cascade,
  attachment_id uuid not null references public.saas_support_attachments(id),
  primary key(forward_id, attachment_id)
);
create index if not exists idx_support_forward_attachments_org on public.saas_support_forward_attachments(org_id, forward_id);

create table if not exists public.saas_support_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  ticket_id uuid not null references public.saas_support_tickets(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null check (event_type in ('created', 'message', 'status', 'assignment', 'forward', 'activity')),
  old_value text,
  new_value text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_events_ticket_time on public.saas_support_events(ticket_id, created_at);
create index if not exists idx_support_events_org_ticket_time on public.saas_support_events(org_id, ticket_id, created_at);

create table if not exists public.saas_support_reads (
  org_id uuid not null references public.organizations(id),
  ticket_id uuid not null references public.saas_support_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  last_read_at timestamptz not null default now(),
  primary key(ticket_id, user_id)
);
create index if not exists idx_support_reads_org_user on public.saas_support_reads(org_id, user_id);

do $$ declare table_name text; begin
  foreach table_name in array array['saas_support_tickets','saas_support_messages','saas_support_attachments','saas_support_forwards','saas_support_forward_attachments','saas_support_events','saas_support_reads'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
  end loop;
end $$;

create or replace function public.support_provider_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select s.org_id from public.saas_org_settings s
  where s.is_billing_provider = true and s.status = 'active'
    and (s.provisioning_source = 'saas_provider' or lower(coalesce(s.slug,'')) = 'panel')
  order by case when s.provisioning_source = 'saas_provider' then 0 else 1 end, s.created_at limit 1
$$;
revoke all on function public.support_provider_org_id() from public, anon;
grant execute on function public.support_provider_org_id() to authenticated, service_role;

create or replace function public.support_is_operator(p_permission text default 'support_view')
returns boolean language plpgsql stable security definer set search_path = public as $$
declare role_permissions jsonb; base jsonb; explicit_value text;
begin
  if auth.uid() is null or public.current_org_id() is distinct from public.support_provider_org_id() then return false; end if;
  if not public.current_user_has_saas_admin_permission() then return false; end if;
  select r.permissions into role_permissions from public.profiles p join public.org_roles r on r.id = p.role_id
  where p.id = auth.uid() and p.org_id = public.support_provider_org_id() and r.org_id = p.org_id limit 1;
  base := coalesce(role_permissions -> '__saas_admin', '{}'::jsonb);
  if p_permission <> 'support_view' and coalesce((base -> 'fields' ->> 'support_view')::boolean,true)=false then return false; end if;
  explicit_value := base -> 'fields' ->> p_permission;
  if explicit_value is not null then return explicit_value::boolean; end if;
  return case when p_permission = 'support_view' then true else coalesce((base ->> 'edit')::boolean, false) end;
end $$;
revoke all on function public.support_is_operator(text) from public, anon;
grant execute on function public.support_is_operator(text) to authenticated, service_role;

create or replace function public.support_customer_can(p_customer_org_id uuid, p_action text, p_creator uuid default null)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare membership record; settings jsonb; fields jsonb; is_manager boolean; can_view_all boolean; can_reply_all boolean;
begin
  if auth.uid() is null or p_customer_org_id is null or public.current_org_id() is distinct from p_customer_org_id
     or public.org_is_saas_admin(p_customer_org_id) then return false; end if;
  if not public.org_has_plan_feature(p_customer_org_id,'support_tickets',true) then return false; end if;
  select m.is_owner, m.software_role, r.permissions into membership
  from public.user_organization_memberships m left join public.org_roles r on r.id = m.role_id and r.org_id = m.org_id
  where m.user_id = auth.uid() and m.org_id = p_customer_org_id and m.is_active limit 1;
  if not found then return false; end if;
  settings := coalesce(membership.permissions -> '__support_tickets', '{}'::jsonb);
  fields := coalesce(settings -> 'fields', '{}'::jsonb);
  if coalesce((settings ->> 'view')::boolean, true) = false then return false; end if;
  is_manager := coalesce(membership.is_owner, false) or membership.software_role in ('admin', 'super_admin');
  if p_action = 'create' then return coalesce((fields ->> 'create')::boolean, true); end if;
  can_view_all := coalesce((fields ->> 'view_all')::boolean, is_manager);
  can_reply_all := coalesce((fields ->> 'reply_all')::boolean, is_manager);
  if p_creator = auth.uid() then
    return (coalesce((fields ->> 'view_own')::boolean, true) or can_view_all)
      and (p_action <> 'reply' or coalesce((fields ->> 'reply_own')::boolean, true) or can_reply_all);
  end if;
  return can_view_all and (p_action <> 'reply' or can_reply_all);
end $$;
revoke all on function public.support_customer_can(uuid,text,uuid) from public, anon;
grant execute on function public.support_customer_can(uuid,text,uuid) to authenticated, service_role;

create or replace function public.support_can_view_ticket(p_ticket_id uuid, p_internal boolean default false)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare t public.saas_support_tickets%rowtype;
begin
  select * into t from public.saas_support_tickets where id = p_ticket_id;
  if not found then return false; end if;
  if public.support_is_operator('support_view') then return true; end if;
  if p_internal then return false; end if;
  return public.support_customer_can(t.customer_org_id, 'view', t.created_by);
end $$;
revoke all on function public.support_can_view_ticket(uuid,boolean) from public, anon;
grant execute on function public.support_can_view_ticket(uuid,boolean) to authenticated, service_role;

create or replace function public.support_ticket_code(p_ticket_no bigint)
returns text language sql immutable set search_path = public as $$ select 'TS-' || lpad(p_ticket_no::text, 6, '0') $$;
revoke all on function public.support_ticket_code(bigint) from public, anon;
grant execute on function public.support_ticket_code(bigint) to authenticated, service_role;

create or replace function public.support_customer_notification_recipients(p_ticket_id uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct m.user_id), '{}'::uuid[])
  from public.saas_support_tickets t
  join public.user_organization_memberships m on m.org_id=t.customer_org_id and m.is_active
  left join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
  where t.id=p_ticket_id and coalesce((r.permissions -> '__support_tickets' ->> 'view')::boolean,true)
    and (m.user_id=t.created_by and coalesce((r.permissions -> '__support_tickets' -> 'fields' ->> 'view_own')::boolean,true)
      or coalesce((r.permissions -> '__support_tickets' -> 'fields' ->> 'view_all')::boolean,
        m.is_owner or m.software_role in ('admin','super_admin')))
$$;
revoke all on function public.support_customer_notification_recipients(uuid) from public, anon, authenticated;

create or replace function public.support_list_categories()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then '[]'::jsonb else coalesce(jsonb_agg(jsonb_build_object('code',code,'title',title) order by sort_order), '[]'::jsonb) end
  from public.saas_support_categories where is_active
$$;
revoke all on function public.support_list_categories() from public, anon;
grant execute on function public.support_list_categories() to authenticated;

create or replace function public.support_customer_capabilities()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'can_create',public.support_customer_can(public.current_org_id(),'create'),
    'can_view_own',public.support_customer_can(public.current_org_id(),'view',auth.uid()),
    'can_view_all',public.support_customer_can(public.current_org_id(),'view',null)
  )
$$;
revoke all on function public.support_customer_capabilities() from public, anon;
grant execute on function public.support_customer_capabilities() to authenticated;

create or replace function public.support_list_tickets(
  p_status text default null, p_search text default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare is_operator boolean := public.support_is_operator('support_view'); current_org uuid := public.current_org_id(); result jsonb;
begin
  if auth.uid() is null or current_org is null then raise exception 'support_access_denied' using errcode = '42501'; end if;
  if not is_operator and not public.support_customer_can(current_org, 'create') then
    -- A role may be allowed to view existing tickets without creating new ones.
    if not exists (select 1 from public.saas_support_tickets t where t.customer_org_id = current_org
      and public.support_customer_can(current_org, 'view', t.created_by)) then
      return '[]'::jsonb;
    end if;
  end if;
  select coalesce(jsonb_agg(row_data order by (row_data ->> 'last_message_at') desc), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'id', t.id, 'code', public.support_ticket_code(t.ticket_no), 'subject', t.subject,
      'category_code', t.category_code, 'category_title', c.title, 'status', t.status,
      'customer_org_id', t.customer_org_id, 'customer_org_name', o.name, 'created_by', t.created_by,
      'assigned_to', case when is_operator then t.assigned_to else null end,
      'created_at', t.created_at, 'last_message_at', t.last_message_at,
      'first_response_at', t.first_response_at, 'closed_at', t.closed_at,
      'unread_count', (select count(*) from public.saas_support_messages m
        where m.ticket_id = t.id and m.author_id <> auth.uid()
          and (is_operator or m.visibility = 'customer')
          and m.created_at > coalesce((select r.last_read_at from public.saas_support_reads r
            where r.ticket_id = t.id and r.user_id = auth.uid()), '-infinity'::timestamptz))
    ) as row_data
    from public.saas_support_tickets t
    join public.saas_support_categories c on c.code = t.category_code
    join public.organizations o on o.id = t.customer_org_id
    where (is_operator and t.org_id = current_org or
      not is_operator and t.customer_org_id = current_org and public.support_customer_can(current_org, 'view', t.created_by))
      and (p_status is null or t.status = p_status)
      and (nullif(trim(coalesce(p_search, '')), '') is null or t.subject ilike '%' || trim(p_search) || '%'
        or public.support_ticket_code(t.ticket_no) ilike '%' || trim(p_search) || '%')
    order by t.last_message_at desc, t.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ) listed;
  return result;
end $$;

create or replace function public.support_get_ticket(p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.saas_support_tickets%rowtype; operator_view boolean := public.support_is_operator('support_view');
begin
  select * into t from public.saas_support_tickets where id = p_ticket_id;
  if not found or not public.support_can_view_ticket(p_ticket_id) then raise exception 'support_access_denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'ticket', jsonb_build_object('id',t.id,'code',public.support_ticket_code(t.ticket_no),'subject',t.subject,
      'category_code',t.category_code,
      'category_title',(select title from public.saas_support_categories where code=t.category_code),
      'status',t.status,'customer_org_id',t.customer_org_id,
      'customer_org_name',(select name from public.organizations where id=t.customer_org_id),
      'created_by',t.created_by,'assigned_to',case when operator_view then t.assigned_to else null end,
      'created_at',t.created_at,'first_response_at',t.first_response_at,'closed_at',t.closed_at),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'visibility',m.visibility,
      'message_kind',m.message_kind,'author_id',m.author_id,'author_name',coalesce(p.full_name,p.email,'کاربر'),
      'created_at',m.created_at,'attachments',
        (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'file_size',a.file_size,'object_path',a.object_path)), '[]'::jsonb)
         from public.saas_support_attachments a where a.message_id=m.id)) order by m.created_at,m.id), '[]'::jsonb)
      from public.saas_support_messages m left join public.profiles p on p.id=m.author_id
      where m.ticket_id=t.id and (operator_view or m.visibility='customer')),
    'forwards', case when operator_view then (select coalesce(jsonb_agg(jsonb_build_object(
      'id',f.id,'source_message_id',f.source_message_id,'note_message_id',f.note_message_id,
      'recipient_id',f.recipient_id,'attachment_ids',(select coalesce(jsonb_agg(fa.attachment_id),'[]'::jsonb)
        from public.saas_support_forward_attachments fa where fa.forward_id=f.id))), '[]'::jsonb)
      from public.saas_support_forwards f where f.ticket_id=t.id) else '[]'::jsonb end,
    'events', (select coalesce(jsonb_agg(jsonb_build_object('event_type',e.event_type,'old_value',e.old_value,
      'new_value',e.new_value,'created_at',e.created_at) order by e.created_at), '[]'::jsonb)
      from public.saas_support_events e where e.ticket_id=t.id and (operator_view or e.event_type='status'))
  );
end $$;

create or replace function public.support_create_ticket(p_category text, p_subject text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare provider uuid := public.support_provider_org_id(); customer_org uuid := public.current_org_id(); t public.saas_support_tickets%rowtype; first_message uuid;
begin
  if provider is null or not public.support_customer_can(customer_org, 'create') then raise exception 'support_access_denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.saas_support_categories where code=p_category and is_active) then raise exception 'support_category_invalid'; end if;
  if length(trim(coalesce(p_subject,''))) not between 3 and 180 or length(trim(coalesce(p_body,''))) not between 1 and 10000 then raise exception 'support_content_invalid'; end if;
  insert into public.saas_support_tickets(org_id,customer_org_id,created_by,category_code,subject)
  values(provider,customer_org,auth.uid(),p_category,trim(p_subject)) returning * into t;
  insert into public.saas_support_messages(org_id,ticket_id,author_id,visibility,body)
  values(provider,t.id,auth.uid(),'customer',trim(p_body)) returning id into first_message;
  insert into public.saas_support_events(org_id,ticket_id,actor_id,event_type,new_value)
  values(provider,t.id,auth.uid(),'created',t.status);
  return jsonb_build_object('id',t.id,'code',public.support_ticket_code(t.ticket_no),'message_id',first_message);
end $$;

create or replace function public.support_send_message(p_ticket_id uuid, p_body text, p_internal boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.saas_support_tickets%rowtype; m public.saas_support_messages%rowtype;
  operator_reply boolean := public.support_is_operator('support_view') and public.support_is_operator('support_reply');
  next_status text;
begin
  select * into t from public.saas_support_tickets where id=p_ticket_id for update;
  if not found then raise exception 'support_ticket_not_found'; end if;
  if operator_reply then null;
  elsif p_internal or not public.support_customer_can(t.customer_org_id,'reply',t.created_by) then
    raise exception 'support_access_denied' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_body,''))) not between 1 and 10000 then raise exception 'support_content_invalid'; end if;
  insert into public.saas_support_messages(org_id,ticket_id,author_id,visibility,message_kind,body)
  values(t.org_id,t.id,auth.uid(),case when p_internal then 'internal' else 'customer' end,
    case when p_internal then 'note' else 'reply' end,trim(p_body)) returning * into m;
  insert into public.saas_support_events(org_id,ticket_id,actor_id,event_type,new_value,details)
  values(t.org_id,t.id,auth.uid(),'message',m.id::text,jsonb_build_object('visibility',m.visibility));
  if not p_internal then
    next_status := case when operator_reply then 'answered' else 'waiting_operator' end;
    update public.saas_support_tickets set
      status=next_status,
      first_response_at=case when operator_reply then coalesce(first_response_at,now()) else first_response_at end,
      closed_at=null, last_message_at=m.created_at, updated_at=now()
    where id=t.id;
    if t.status is distinct from next_status then
      insert into public.saas_support_events(org_id,ticket_id,actor_id,event_type,old_value,new_value)
      values(t.org_id,t.id,auth.uid(),'status',t.status,next_status);
    end if;
    if operator_reply then
      perform public.kalam_upsert_notification_item(t.customer_org_id,'support_ticket',m.id::text,'support','reply','insert',
        'پاسخ جدید به تیکت ' || public.support_ticket_code(t.ticket_no),left(m.body,240),'saas_support_tickets',t.id::text,
        public.support_customer_notification_recipients(t.id), '{}'::uuid[], false, jsonb_build_object('path','/support/tickets/' || t.id::text),m.created_at);
    end if;
  else
    update public.saas_support_tickets set last_message_at=m.created_at,updated_at=now() where id=t.id;
  end if;
  return jsonb_build_object('id',m.id,'created_at',m.created_at);
end $$;

create or replace function public.support_set_status(p_ticket_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.saas_support_tickets%rowtype;
begin
  if not (public.support_is_operator('support_view') and public.support_is_operator('support_manage')) then raise exception 'support_access_denied' using errcode='42501'; end if;
  if p_status not in ('waiting_operator','in_review','answered','closed') then raise exception 'support_status_invalid'; end if;
  select * into t from public.saas_support_tickets where id=p_ticket_id and org_id=public.support_provider_org_id() for update;
  if not found then raise exception 'support_ticket_not_found'; end if;
  if t.status <> p_status then
    update public.saas_support_tickets set status=p_status,closed_at=case when p_status='closed' then now() else null end,
      updated_at=now() where id=t.id;
    insert into public.saas_support_events(org_id,ticket_id,actor_id,event_type,old_value,new_value)
    values(t.org_id,t.id,auth.uid(),'status',t.status,p_status);
    perform public.kalam_upsert_notification_item(t.customer_org_id,'support_ticket_status',gen_random_uuid()::text,
      'support','status','update','وضعیت تیکت ' || public.support_ticket_code(t.ticket_no) || ' تغییر کرد',
      case p_status when 'waiting_operator' then 'منتظر پاسخ اوپراتور' when 'in_review' then 'در حال بررسی'
        when 'answered' then 'پاسخ داده شده' else 'بسته شده' end,
      'saas_support_tickets',t.id::text,public.support_customer_notification_recipients(t.id),'{}'::uuid[],false,
      jsonb_build_object('path','/support/tickets/' || t.id::text),now());
  end if;
  return jsonb_build_object('success',true);
end $$;

create or replace function public.support_assign_ticket(p_ticket_id uuid,p_assignee uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.saas_support_tickets%rowtype;
begin
  if not (public.support_is_operator('support_view') and public.support_is_operator('support_manage')) then raise exception 'support_access_denied' using errcode='42501'; end if;
  select * into t from public.saas_support_tickets where id=p_ticket_id and org_id=public.support_provider_org_id() for update;
  if not found then raise exception 'support_ticket_not_found'; end if;
  if p_assignee is not null and not exists (select 1 from public.user_organization_memberships m join public.org_roles r on r.id=m.role_id
    where m.user_id=p_assignee and m.org_id=t.org_id and m.is_active
      and coalesce((r.permissions -> '__saas_admin' ->> 'view')::boolean,false)
      and coalesce((r.permissions -> '__saas_admin' -> 'fields' ->> 'support_view')::boolean,true)) then raise exception 'support_assignee_invalid'; end if;
  update public.saas_support_tickets set assigned_to=p_assignee,updated_at=now() where id=t.id;
  insert into public.saas_support_events(org_id,ticket_id,actor_id,event_type,old_value,new_value)
  values(t.org_id,t.id,auth.uid(),'assignment',t.assigned_to::text,p_assignee::text);
  return jsonb_build_object('success',true);
end $$;

create or replace function public.support_list_operators()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.support_is_operator('support_view') then
    coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(p.full_name,p.email,'اپراتور')) order by p.full_name),'[]'::jsonb)
    else '[]'::jsonb end
  from public.user_organization_memberships m join public.org_roles r on r.id=m.role_id
  join public.profiles p on p.id=m.user_id
  where m.org_id=public.support_provider_org_id() and m.is_active
    and coalesce((r.permissions -> '__saas_admin' ->> 'view')::boolean,false)
    and coalesce((r.permissions -> '__saas_admin' -> 'fields' ->> 'support_view')::boolean,true)
$$;

create or replace function public.support_mark_read(p_ticket_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.saas_support_tickets%rowtype;
begin
  select * into t from public.saas_support_tickets where id=p_ticket_id;
  if not found or not public.support_can_view_ticket(p_ticket_id) then raise exception 'support_access_denied' using errcode='42501'; end if;
  insert into public.saas_support_reads(org_id,ticket_id,user_id,last_read_at) values(t.org_id,t.id,auth.uid(),now())
  on conflict(ticket_id,user_id) do update set last_read_at=excluded.last_read_at;
end $$;

create or replace function public.support_forward_message(
  p_message_id uuid, p_recipient_ids uuid[], p_attachment_ids uuid[] default '{}'::uuid[], p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare source_message public.saas_support_messages%rowtype; t public.saas_support_tickets%rowtype;
  note_message public.saas_support_messages%rowtype; recipient uuid; attachment uuid; saved_forward uuid;
begin
  if not (public.support_is_operator('support_view') and public.support_is_operator('support_reply')) then raise exception 'support_access_denied' using errcode='42501'; end if;
  select * into source_message from public.saas_support_messages where id=p_message_id and visibility='customer';
  if not found then raise exception 'support_message_not_found'; end if;
  select * into t from public.saas_support_tickets where id=source_message.ticket_id and org_id=public.support_provider_org_id();
  if not found then raise exception 'support_ticket_not_found'; end if;
  if not exists (select 1 from public.user_organization_memberships m where m.user_id=source_message.author_id
    and m.org_id=t.customer_org_id and m.is_active) then raise exception 'support_message_not_forwardable'; end if;
  if coalesce(array_length(p_recipient_ids,1),0) < 1 or array_length(p_recipient_ids,1)>20 then raise exception 'support_recipients_invalid'; end if;
  if exists (select 1 from unnest(p_attachment_ids) aid where not exists
    (select 1 from public.saas_support_attachments a where a.id=aid and a.message_id=source_message.id)) then raise exception 'support_attachment_invalid'; end if;
  if exists (select 1 from unnest(p_recipient_ids) rid where not exists
    (select 1 from public.user_organization_memberships m join public.org_roles r on r.id=m.role_id
      where m.user_id=rid and m.org_id=t.org_id and m.is_active
        and coalesce((r.permissions -> '__saas_admin' ->> 'view')::boolean,false)
        and coalesce((r.permissions -> '__saas_admin' -> 'fields' ->> 'support_view')::boolean,true))) then raise exception 'support_recipients_invalid'; end if;
  insert into public.saas_support_messages(org_id,ticket_id,author_id,visibility,message_kind,body)
  values(t.org_id,t.id,auth.uid(),'internal','forward',coalesce(nullif(trim(p_note),''),'ارجاع پیام مشتری به همکاران'))
  returning * into note_message;
  for recipient in select distinct unnest(p_recipient_ids) loop
    insert into public.saas_support_forwards(org_id,ticket_id,source_message_id,note_message_id,recipient_id,created_by)
    values(t.org_id,t.id,source_message.id,note_message.id,recipient,auth.uid()) returning id into saved_forward;
    for attachment in select distinct unnest(coalesce(p_attachment_ids,'{}'::uuid[])) loop
      insert into public.saas_support_forward_attachments(org_id,forward_id,attachment_id) values(t.org_id,saved_forward,attachment);
    end loop;
  end loop;
  insert into public.saas_support_events(org_id,ticket_id,actor_id,event_type,details)
  values(t.org_id,t.id,auth.uid(),'forward',jsonb_build_object('source_message_id',source_message.id,'recipient_count',array_length(p_recipient_ids,1)));
  perform public.kalam_upsert_notification_item(t.org_id,'support_forward',note_message.id::text,
    'support','forward','insert','ارجاع تیکت ' || public.support_ticket_code(t.ticket_no),left(note_message.body,240),
    'saas_support_tickets',t.id::text,p_recipient_ids,'{}'::uuid[],false,
    jsonb_build_object('path','/taze-system/tickets/' || t.id::text),now());
  return jsonb_build_object('id',note_message.id);
end $$;

create or replace function public.support_create_activity(p_ticket_id uuid, p_title text, p_assignee uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.saas_support_tickets%rowtype; task_id uuid;
begin
  if not (public.support_is_operator('support_view') and public.support_is_operator('support_reply')) then raise exception 'support_access_denied' using errcode='42501'; end if;
  select * into t from public.saas_support_tickets where id=p_ticket_id and org_id=public.support_provider_org_id();
  if not found then raise exception 'support_ticket_not_found'; end if;
  if p_assignee is not null and not exists (select 1 from public.user_organization_memberships
    where user_id=p_assignee and org_id=t.org_id and is_active) then raise exception 'support_assignee_invalid'; end if;
  insert into public.tasks(org_id,name,status,priority,description,assignee_id,assignee_type,
    source_module_id,source_record_id,related_to_module,created_by,updated_by)
  values(t.org_id,coalesce(nullif(trim(p_title),''),'پیگیری تیکت ' || public.support_ticket_code(t.ticket_no)),
    'todo','medium','گفتگوی پشتیبانی: ' || t.subject,p_assignee,case when p_assignee is null then null else 'user' end,
    'saas_support_tickets',t.id::text,'saas_support_tickets',auth.uid(),auth.uid()) returning id into task_id;
  insert into public.saas_support_events(org_id,ticket_id,actor_id,event_type,new_value)
  values(t.org_id,t.id,auth.uid(),'activity',task_id::text);
  return jsonb_build_object('id',task_id);
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('saas-support-private','saas-support-private',false,20971520,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.support_can_attach_to_message(p_message_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare m public.saas_support_messages%rowtype; t public.saas_support_tickets%rowtype;
begin
  select * into m from public.saas_support_messages where id=p_message_id;
  if not found or m.author_id is distinct from auth.uid() then return false; end if;
  select * into t from public.saas_support_tickets where id=m.ticket_id;
  if not found then return false; end if;
  if public.support_is_operator('support_view') then return public.support_is_operator('support_reply'); end if;
  return m.visibility='customer' and public.support_customer_can(t.customer_org_id,'reply',t.created_by);
end $$;
revoke all on function public.support_can_attach_to_message(uuid) from public, anon, authenticated;

create or replace function public.support_storage_can_upload(p_path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ticket_part text := split_part(p_path,'/',1); message_part text := split_part(p_path,'/',2); m public.saas_support_messages%rowtype;
begin
  if ticket_part !~* '^[0-9a-f-]{36}$' or message_part !~* '^[0-9a-f-]{36}$'
    or nullif(split_part(p_path,'/',3),'') is null or split_part(p_path,'/',4) <> '' then return false; end if;
  select * into m from public.saas_support_messages where id=message_part::uuid and ticket_id=ticket_part::uuid;
  return found and public.support_can_attach_to_message(m.id);
end $$;

create or replace function public.support_storage_can_read(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.saas_support_attachments a
    join public.saas_support_messages m on m.id=a.message_id
    where a.object_path=p_path and public.support_can_view_ticket(a.ticket_id,m.visibility='internal'))
$$;
revoke all on function public.support_storage_can_upload(text),public.support_storage_can_read(text) from public, anon;
grant execute on function public.support_storage_can_upload(text),public.support_storage_can_read(text) to authenticated, service_role;

drop policy if exists support_private_upload on storage.objects;
create policy support_private_upload on storage.objects for insert to authenticated
with check (bucket_id='saas-support-private' and public.support_storage_can_upload(name));
drop policy if exists support_private_read on storage.objects;
create policy support_private_read on storage.objects for select to authenticated
using (bucket_id='saas-support-private' and public.support_storage_can_read(name));

create or replace function public.support_register_attachment(
  p_message_id uuid,p_object_path text,p_file_name text,p_mime_type text,p_file_size bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.saas_support_messages%rowtype; a public.saas_support_attachments%rowtype;
begin
  select * into m from public.saas_support_messages where id=p_message_id;
  if not found or not public.support_can_attach_to_message(m.id)
    or p_object_path not like m.ticket_id::text || '/' || m.id::text || '/%'
    or p_file_size not between 1 and 20971520 then raise exception 'support_attachment_invalid' using errcode='42501'; end if;
  if not exists (select 1 from storage.objects where bucket_id='saas-support-private' and name=p_object_path
    and metadata->>'mimetype'=p_mime_type and metadata->>'size'=p_file_size::text) then
    raise exception 'support_attachment_missing'; end if;
  insert into public.saas_support_attachments(org_id,ticket_id,message_id,object_path,file_name,mime_type,file_size)
  values(m.org_id,m.ticket_id,m.id,p_object_path,left(trim(p_file_name),255),p_mime_type,p_file_size)
  returning * into a;
  return jsonb_build_object('id',a.id,'file_name',a.file_name,'object_path',a.object_path);
end $$;

do $$ declare function_name text; begin
  foreach function_name in array array[
    'support_list_tickets(text,text,integer,integer)','support_get_ticket(uuid)',
    'support_create_ticket(text,text,text)','support_send_message(uuid,text,boolean)',
    'support_set_status(uuid,text)','support_assign_ticket(uuid,uuid)','support_list_operators()',
    'support_mark_read(uuid)','support_forward_message(uuid,uuid[],uuid[],text)',
    'support_create_activity(uuid,text,uuid)','support_register_attachment(uuid,text,text,text,bigint)'
  ] loop
    execute 'revoke all on function public.' || function_name || ' from public, anon';
    execute 'grant execute on function public.' || function_name || ' to authenticated';
  end loop;
end $$;

-- Existing durable workflow engine handles ticket events in the provider org.
drop trigger if exists workflow_event_queue_row on public.saas_support_tickets;
create trigger workflow_event_queue_row after insert or update on public.saas_support_tickets
for each row execute function public.enqueue_workflow_event_from_row();

-- Reuse the existing private per-org broadcast topics. The payload contains no
-- ticket identifier or content; each client reloads only rows its RPC permits.
create or replace function public.support_broadcast_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare provider_org uuid; customer_org uuid;
begin
  if tg_table_name='saas_support_tickets' then
    provider_org:=new.org_id; customer_org:=new.customer_org_id;
  else
    select t.org_id,t.customer_org_id into provider_org,customer_org
    from public.saas_support_tickets t where t.id=new.ticket_id;
  end if;
  perform public.kalam_broadcast_notification(public.kalam_realtime_org_topic(provider_org),
    'support_tickets_changed','{}'::jsonb);
  perform public.kalam_broadcast_notification(public.kalam_realtime_org_topic(customer_org),
    'support_tickets_changed','{}'::jsonb);
  return new;
end $$;
drop trigger if exists support_broadcast_ticket_update on public.saas_support_tickets;
create trigger support_broadcast_ticket_update after update on public.saas_support_tickets
for each row execute function public.support_broadcast_change();
drop trigger if exists support_broadcast_message_insert on public.saas_support_messages;
create trigger support_broadcast_message_insert after insert on public.saas_support_messages
for each row execute function public.support_broadcast_change();

insert into public.workflows(org_id,module_id,name,description,trigger_type,execution_mode,actions,is_active)
select s.org_id,'saas_support_tickets','اعلان تیکت جدید','اعلان داخلی برای مدیران تازه سیستم هنگام ثبت تیکت',
  'on_create','first_match',
  jsonb_build_array(jsonb_build_object('id','support_ticket_created','type','send_note','config',
    jsonb_build_object('note_text','تیکت تازه ثبت شد: {{subject}}',
      'recipient_assignees',jsonb_build_array('role:' || r.id::text),'recipient_fields','[]'::jsonb))),true
from public.saas_org_settings s join lateral (
  select id from public.org_roles where org_id=s.org_id
    and coalesce((permissions -> '__saas_admin' ->> 'view')::boolean,false)
  order by created_at limit 1
) r on true
where s.org_id=public.support_provider_org_id()
  and not exists(select 1 from public.workflows w where w.org_id=s.org_id and w.module_id='saas_support_tickets' and w.name='اعلان تیکت جدید');

update public.org_roles r set permissions=jsonb_set(r.permissions,'{__saas_admin,fields}',
  jsonb_build_object('support_view',true,
    'support_reply',coalesce((r.permissions -> '__saas_admin' ->> 'edit')::boolean,false),
    'support_manage',coalesce((r.permissions -> '__saas_admin' ->> 'edit')::boolean,false),
    'support_workflows',coalesce((r.permissions -> '__saas_admin' ->> 'edit')::boolean,false))
  || coalesce(r.permissions -> '__saas_admin' -> 'fields','{}'::jsonb),true)
where r.org_id=public.support_provider_org_id() and r.permissions ? '__saas_admin';

drop policy if exists support_workflows_operator_scope on public.workflows;
create policy support_workflows_operator_scope on public.workflows as restrictive for all to authenticated
using (
  (module_id is distinct from 'saas_support_tickets'
    and not ('saas_support_tickets'=any(coalesce(module_ids,'{}'::text[]))))
  or (org_id=public.support_provider_org_id() and public.support_is_operator('support_view')
    and public.support_is_operator('support_workflows'))
)
with check (
  (module_id is distinct from 'saas_support_tickets'
    and not ('saas_support_tickets'=any(coalesce(module_ids,'{}'::text[]))))
  or (org_id=public.support_provider_org_id() and public.support_is_operator('support_view')
    and public.support_is_operator('support_workflows'))
);

create or replace function public.guard_support_workflow_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_row public.workflows%rowtype;
begin
  if tg_op='DELETE' then target_row:=old; else target_row:=new; end if;
  if target_row.module_id='saas_support_tickets'
    or 'saas_support_tickets'=any(coalesce(target_row.module_ids,'{}'::text[]))
    or (tg_op='UPDATE' and (old.module_id='saas_support_tickets'
      or 'saas_support_tickets'=any(coalesce(old.module_ids,'{}'::text[])))) then
    if target_row.org_id is distinct from public.support_provider_org_id()
      or not (auth.role()='service_role' or
        (public.support_is_operator('support_view') and public.support_is_operator('support_workflows'))) then
      raise exception 'support_workflow_access_denied' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists guard_support_workflow_mutation on public.workflows;
create trigger guard_support_workflow_mutation before insert or update or delete on public.workflows
for each row execute function public.guard_support_workflow_mutation();

notify pgrst, 'reload schema';
commit;
