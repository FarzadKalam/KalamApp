-- Extends the isolated SaaS workflow fixture.
alter table customers add column full_name text, add column business_name text, add column email text,
  add column mobile_1 text, add column system_code text;
alter table customers alter column id set default gen_random_uuid();
alter table invoices add column created_at timestamptz default now(),
  add column total_received_amount numeric default 0,add column payments jsonb default '[]';
create function public.org_is_saas_admin(uuid) returns boolean language sql as $$select $1=public.support_provider_org_id()$$;
create function public.current_org_id() returns uuid language sql as $$select nullif(current_setting('test.current_org',true),'')::uuid$$;
create function public.saas_lifecycle_workflows_allowed() returns boolean language sql as $$
  select public.current_org_id()=public.support_provider_org_id() and auth.uid()='50000000-0000-4000-8000-000000000001'::uuid
$$;
create function public.normalize_iran_mobile_e164(text) returns text language sql immutable as $$select nullif(trim($1),'')$$;
create function public.saas_offering_keys() returns jsonb language sql as $$select '{"modules":["tasks"],"features":["web_search"]}'::jsonb$$;
create table products(id uuid primary key default gen_random_uuid(),org_id uuid,name text,product_type text);
create table company_settings(org_id uuid primary key,currency_code text);
create table product_bundles(id uuid primary key default gen_random_uuid(),org_id uuid,name text,products jsonb);
create table saas_plans(code text primary key,title text,enabled_modules jsonb,enabled_features jsonb,is_active boolean);
create table saas_catalog_items(code text primary key,title text,item_kind text,entitlement_code text,billing_cycle text,metadata jsonb,is_active boolean);
create table saas_orders(id uuid primary key default gen_random_uuid(),org_id uuid,created_by uuid,total_irt numeric,
  items jsonb,metadata jsonb default '{}',status text default 'pending_payment',payment_transaction_id uuid,
  created_at timestamptz default now(),updated_at timestamptz,paid_at timestamptz);
alter table saas_orders enable row level security;
grant select on saas_orders to authenticated;
create policy fixture_saas_order_read on saas_orders for select to authenticated using (org_id=public.current_org_id());
alter table saas_org_settings add column plan_code text, add column is_demo boolean default true,
  add column is_readonly boolean default true, add column status text default 'trial',
  add column billing_readonly boolean, add column billing_readonly_at timestamptz, add column updated_at timestamptz;
create table saas_recurring_subscriptions(id uuid primary key default gen_random_uuid(),org_id uuid,item_kind text,source_code text,entitlement_code text,
  quantity numeric,amount_irt numeric,status text,current_period_starts_at timestamptz,current_period_ends_at timestamptz,
  next_invoice_at timestamptz,source_order_id uuid,metadata jsonb,updated_at timestamptz);
create table saas_org_entitlements(org_id uuid,item_kind text,entitlement_code text,quantity numeric,state text,source text,
  order_id uuid,created_by uuid,metadata jsonb);
create function public.refresh_saas_subscription_entitlement(uuid) returns void language sql as $$select null::void$$;
create table payment_transactions(id uuid primary key default gen_random_uuid(),org_id uuid,purpose text,record_id uuid,
  status text,amount numeric,currency text,metadata jsonb);
create table user_organization_memberships(org_id uuid,user_id uuid,role_id uuid,is_active boolean,is_owner boolean,software_role text,
  primary key(org_id,user_id));
alter table org_roles add column title text;
create table workflows(id uuid primary key default gen_random_uuid(),org_id uuid,module_id text,actions jsonb,created_by uuid,updated_by uuid);
alter table workflows enable row level security;
create table workflow_interval_jobs(org_id uuid,module_id text,payload jsonb);
alter table workflow_interval_jobs enable row level security;
create table workflow_logs(org_id uuid,module_id text,workflow_id uuid);
alter table workflow_logs enable row level security;
create table saas_support_tickets(id uuid primary key default gen_random_uuid(),ticket_no bigint generated always as identity,
  org_id uuid,customer_org_id uuid,customer_user_id uuid,created_by uuid,category_code text,subject text,status text,ticket_type text,first_response_at timestamptz);
create table saas_support_messages(id uuid primary key default gen_random_uuid(),org_id uuid,ticket_id uuid,author_id uuid,visibility text,body text);
create table saas_support_events(org_id uuid,ticket_id uuid,actor_id uuid,event_type text,new_value text);
create table saas_support_categories(code text primary key,is_active boolean);
create table test_notification_items(org_id uuid,recipient_ids uuid[],body text);
create function public.support_is_operator(text) returns boolean language sql as $$select coalesce(public.saas_lifecycle_workflows_allowed(),false)$$;
create function public.support_customer_can(uuid,text,uuid) returns boolean language sql as $$
  select $1=public.current_org_id() and $3=auth.uid() and exists(select 1
    from public.user_organization_memberships m left join org_roles r on r.id=m.role_id and r.org_id=m.org_id
    where m.user_id=auth.uid() and m.org_id=$1 and m.is_active and coalesce(r.permissions->'__support_tickets'->>'view','true')<>'false')
$$;
create function public.support_ticket_code(bigint) returns text language sql as $$select 'TS-'||$1$$;
create function public.kalam_upsert_notification_item(uuid,text,text,text,text,text,text,text,text,text,uuid[],uuid[],boolean,jsonb,timestamptz)
returns void language sql as $$insert into test_notification_items values($1,$11,$8)$$;
create function public.support_can_view_ticket(uuid,boolean) returns boolean language sql as $$
  select public.support_customer_can(t.customer_org_id,'view',coalesce(t.customer_user_id,t.created_by)) from saas_support_tickets t where t.id=$1
$$;
create function public.support_list_tickets(text,text,integer,integer) returns setof uuid language sql as $$
  select t.id from saas_support_tickets t where public.support_customer_can(t.customer_org_id,'view',t.created_by)
$$;
create function public.support_unread_total() returns bigint language sql as $$
  select count(*) from saas_support_tickets t where public.support_customer_can(public.current_org_id(),'view',t.created_by)
$$;
create function public.support_send_message(uuid,text,boolean) returns boolean language sql as $$
  select public.support_customer_can(t.customer_org_id,'reply', t.created_by) from saas_support_tickets t where t.id=$1
$$;
create function public.support_can_attach_to_message(uuid) returns boolean language sql as $$
  select public.support_customer_can(t.customer_org_id,'reply', t.created_by) from saas_support_tickets t where t.id=$1
$$;
create function public.create_saas_sales_invoice_for_order() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into invoices(org_id,name,invoice_date) values(public.support_provider_org_id(),'Generated duplicate',current_date);
  return new;
end $$;
create trigger trg_saas_order_sales_invoice after update of status on public.saas_orders
  for each row when (new.status='paid') execute function public.create_saas_sales_invoice_for_order();
insert into saas_plans values('test','اشتراک آزمایشی پولی','{"tasks":true}','{"web_search":true}',true);
insert into saas_support_categories values('general',true);
