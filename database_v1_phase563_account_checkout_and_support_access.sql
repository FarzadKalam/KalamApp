-- Account checkout pricing and universal support access.
begin;

create table if not exists public.saas_checkout_discount_rules (
  kind text not null check (kind in ('users', 'term')),
  minimum_quantity integer not null check (minimum_quantity >= 1),
  discount_percent numeric(5,2) not null check (discount_percent between 0 and 90),
  primary key (kind, minimum_quantity)
);
alter table public.saas_checkout_discount_rules enable row level security;
revoke all on public.saas_checkout_discount_rules from public, anon, authenticated;
insert into public.saas_checkout_discount_rules(kind, minimum_quantity, discount_percent) values
  ('users',6,5),('users',10,10),('users',15,15),('users',20,20),('users',30,25),
  ('term',1,0),('term',3,5),('term',6,10)
on conflict (kind,minimum_quantity) do nothing;

create or replace function public.get_current_saas_checkout_discounts()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'users', (select coalesce(jsonb_agg(jsonb_build_object('minimum',minimum_quantity,'percent',discount_percent) order by minimum_quantity),'[]'::jsonb) from public.saas_checkout_discount_rules where kind='users'),
    'terms', (select coalesce(jsonb_agg(jsonb_build_object('months',minimum_quantity,'percent',discount_percent) order by minimum_quantity),'[]'::jsonb) from public.saas_checkout_discount_rules where kind='term')
  ) where auth.uid() is not null and public.current_org_id() is not null;
$$;
revoke all on function public.get_current_saas_checkout_discounts() from public, anon;
grant execute on function public.get_current_saas_checkout_discounts() to authenticated;

create or replace function public.create_current_saas_order(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.current_org_id(); normalized_items jsonb := '[]'::jsonb;
  entry record; catalog public.saas_catalog_items%rowtype; plan public.saas_plans%rowtype;
  qty numeric; entitlement_quantity numeric; line_total numeric; total numeric := 0; order_id uuid;
  billable_users integer; term_months integer; users_discount numeric; term_discount numeric; plan_count integer := 0;
  monthly_price numeric; base_total numeric;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if not exists (select 1 from public.user_organization_memberships where user_id=auth.uid() and org_id=v_org_id and is_active and (is_owner or software_role='admin')) then raise exception 'organization_admin_required'; end if;
  if not exists (select 1 from public.saas_org_settings where org_id=v_org_id) then raise exception 'saas_org_not_found'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'order_items_required'; end if;
  for entry in select value from jsonb_array_elements(p_items) loop
    if coalesce(entry.value->>'quantity','') !~ '^[0-9]+$' then raise exception 'order_quantity_invalid'; end if;
    qty := (entry.value->>'quantity')::numeric;
    if qty<1 or qty>1000 then raise exception 'order_quantity_invalid'; end if;
    if left(coalesce(entry.value->>'code',''),5)='plan:' then
      plan_count := plan_count+1;
      if plan_count>1 then raise exception 'multiple_plans_not_allowed'; end if;
      select * into plan from public.saas_plans where code=substr(entry.value->>'code',6) and is_active and is_public;
      if plan.id is null or coalesce(plan.price_per_user_monthly,plan.price_monthly)<=0 then raise exception 'catalog_item_not_available'; end if;
      if coalesce(entry.value->>'term_months','1') !~ '^(1|3|6|12)$' then raise exception 'invalid_subscription_term'; end if;
      term_months := coalesce((entry.value->>'term_months')::integer,1);
      select greatest(3,qty::integer,count(*)::integer) into billable_users from public.user_organization_memberships where org_id=v_org_id and is_active;
      select coalesce(max(discount_percent),0) into users_discount from public.saas_checkout_discount_rules where kind='users' and minimum_quantity<=billable_users;
      select coalesce(discount_percent,0) into term_discount from public.saas_checkout_discount_rules where kind='term' and minimum_quantity=term_months;
      monthly_price := coalesce(plan.price_per_user_monthly,plan.price_monthly);
      base_total := monthly_price*billable_users*term_months;
      if term_months=12 and coalesce(plan.price_per_user_yearly,plan.price_yearly,0)>0 then
        term_discount := round(100*(1-coalesce(plan.price_per_user_yearly,plan.price_yearly)/nullif(monthly_price*12,0)),2);
      end if;
      line_total := round(base_total*(1-users_discount/100)*(1-term_discount/100));
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
        'code','plan:'||plan.code,'title',plan.title,'item_kind','plan','entitlement_code',plan.code,
        'quantity',1,'purchase_quantity',billable_users,'unit_price_irt',monthly_price,
        'line_total_irt',line_total,'metadata',jsonb_build_object('billable_users',billable_users,
          'pricing_model','per_user','term_months',term_months,'users_discount_percent',users_discount,
          'term_discount_percent',term_discount,'base_total_irt',base_total)));
      total := total+line_total;
    else
      select * into catalog from public.saas_catalog_items where code=entry.value->>'code' and is_active and is_public and price_irt>0 and entitlement_code<>'support_tickets';
      if catalog.id is null then raise exception 'catalog_item_not_available'; end if;
      entitlement_quantity := qty*catalog.quantity; line_total := qty*catalog.price_irt;
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
        'code',catalog.code,'title',catalog.title,'item_kind',catalog.item_kind,'entitlement_code',catalog.entitlement_code,
        'quantity',entitlement_quantity,'purchase_quantity',qty,'unit_price_irt',catalog.price_irt,
        'line_total_irt',line_total,'billing_cycle',catalog.billing_cycle,'metadata',catalog.metadata));
      total := total+line_total;
    end if;
  end loop;
  insert into public.saas_orders(org_id,created_by,total_irt,items) values(v_org_id,auth.uid(),total,normalized_items) returning id into order_id;
  return jsonb_build_object('success',true,'order_id',order_id,'total_irt',total,'items',normalized_items);
end $$;

-- A purchased term is applied to the recurring plan inserted by the existing activation path.
create or replace function public.apply_saas_plan_order_term()
returns trigger language plpgsql security definer set search_path = public as $$
declare item jsonb; months integer;
begin
  if new.item_kind <> 'plan' or new.source_order_id is null then return new; end if;
  select value into item from public.saas_orders o, jsonb_array_elements(o.items) value
  where o.id=new.source_order_id and o.org_id=new.org_id and value->>'item_kind'='plan' limit 1;
  months := coalesce((item->'metadata'->>'term_months')::integer,1);
  if months not in (1,3,6,12) then raise exception 'invalid_subscription_term'; end if;
  new.current_period_ends_at := new.current_period_starts_at + make_interval(months => months);
  new.next_invoice_at := new.current_period_ends_at - interval '7 days';
  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('term_months',months);
  return new;
end $$;
drop trigger if exists apply_saas_plan_order_term on public.saas_recurring_subscriptions;
create trigger apply_saas_plan_order_term before insert on public.saas_recurring_subscriptions
for each row execute function public.apply_saas_plan_order_term();

create or replace function public.apply_saas_plan_invoice_term()
returns trigger language plpgsql security definer set search_path = public as $$
declare months integer;
begin
  select coalesce((s.metadata->>'term_months')::integer,1) into months
  from public.saas_recurring_subscriptions s where s.id=new.subscription_id and s.org_id=new.org_id and s.item_kind='plan';
  if months in (3,6,12) then new.period_ends_at := new.period_starts_at + make_interval(months => months); end if;
  return new;
end $$;
drop trigger if exists apply_saas_plan_invoice_term on public.saas_subscription_invoices;
create trigger apply_saas_plan_invoice_term before insert on public.saas_subscription_invoices
for each row execute function public.apply_saas_plan_invoice_term();

create or replace function public.update_current_saas_pending_order(p_order_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target public.saas_orders%rowtype; replacement jsonb;
begin
  if auth.uid() is null or public.current_org_id() is null then raise exception 'organization_access_denied' using errcode='42501'; end if;
  if not exists (select 1 from public.user_organization_memberships m where m.org_id=public.current_org_id() and m.user_id=auth.uid() and m.is_active and (m.is_owner or m.software_role='admin')) then raise exception 'organization_admin_required' using errcode='42501'; end if;
  select * into target from public.saas_orders where id=p_order_id and org_id=public.current_org_id() for update;
  if not found or target.status <> 'pending_payment' or target.payment_transaction_id is not null then raise exception 'saas_order_not_editable'; end if;
  if exists (select 1 from public.payment_transactions tx where tx.org_id=target.org_id and tx.purpose='saas_account_order'
    and tx.metadata->>'saas_order_id'=target.id::text and tx.status in ('pending','redirected')) then raise exception 'saas_order_payment_in_progress'; end if;
  replacement := public.create_current_saas_order(p_items);
  delete from public.saas_orders where id=target.id;
  return replacement;
end $$;
create or replace function public.delete_current_saas_pending_order(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.current_org_id() is null then raise exception 'organization_access_denied' using errcode='42501'; end if;
  if not exists (select 1 from public.user_organization_memberships m where m.org_id=public.current_org_id() and m.user_id=auth.uid() and m.is_active and (m.is_owner or m.software_role='admin')) then raise exception 'organization_admin_required' using errcode='42501'; end if;
  if exists (select 1 from public.payment_transactions tx where tx.org_id=public.current_org_id() and tx.purpose='saas_account_order'
    and tx.metadata->>'saas_order_id'=p_order_id::text and tx.status in ('pending','redirected')) then raise exception 'saas_order_payment_in_progress'; end if;
  delete from public.saas_orders where id=p_order_id and org_id=public.current_org_id() and status='pending_payment' and payment_transaction_id is null;
  return found;
end $$;
revoke all on function public.update_current_saas_pending_order(uuid,jsonb), public.delete_current_saas_pending_order(uuid) from public,anon;
grant execute on function public.update_current_saas_pending_order(uuid,jsonb), public.delete_current_saas_pending_order(uuid) to authenticated;

-- Support is a universal service; role permissions still decide who may use it.
create or replace function public.support_customer_can(p_customer_org_id uuid, p_action text, p_creator uuid default null)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare membership record; settings jsonb; fields jsonb; is_manager boolean; can_view_all boolean; can_reply_all boolean;
begin
  if auth.uid() is null or p_customer_org_id is null or public.current_org_id() is distinct from p_customer_org_id
     or public.org_is_saas_admin(p_customer_org_id) then return false; end if;
  select m.is_owner, m.software_role, r.permissions into membership
  from public.user_organization_memberships m left join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
  where m.user_id=auth.uid() and m.org_id=p_customer_org_id and m.is_active limit 1;
  if not found then return false; end if;
  settings := coalesce(membership.permissions->'__support_tickets','{}'::jsonb);
  fields := coalesce(settings->'fields','{}'::jsonb);
  if coalesce((settings->>'view')::boolean,true)=false then return false; end if;
  is_manager := coalesce(membership.is_owner,false) or membership.software_role in ('admin','super_admin');
  if p_action='create' then return coalesce((fields->>'create')::boolean,true); end if;
  can_view_all := coalesce((fields->>'view_all')::boolean,is_manager);
  can_reply_all := coalesce((fields->>'reply_all')::boolean,is_manager);
  if p_creator=auth.uid() then return (coalesce((fields->>'view_own')::boolean,true) or can_view_all)
    and (p_action<>'reply' or coalesce((fields->>'reply_own')::boolean,true) or can_reply_all); end if;
  return can_view_all and (p_action<>'reply' or can_reply_all);
end $$;

create or replace function public.support_is_operator(p_permission text default 'support_view')
returns boolean language plpgsql stable security definer set search_path = public as $$
declare role_permissions jsonb; base jsonb; explicit_value text; active_org uuid := public.current_org_id();
begin
  if auth.uid() is null or active_org is null or not public.org_is_saas_admin(active_org) then return false; end if;
  if not public.current_user_has_saas_admin_permission() then return false; end if;
  select r.permissions into role_permissions from public.user_organization_memberships m join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
  where m.user_id=auth.uid() and m.org_id=active_org and m.is_active limit 1;
  base := coalesce(role_permissions->'__saas_admin','{}'::jsonb);
  if p_permission<>'support_view' and coalesce((base->'fields'->>'support_view')::boolean,true)=false then return false; end if;
  explicit_value := base->'fields'->>p_permission;
  if explicit_value is not null then return explicit_value::boolean; end if;
  return case when p_permission='support_view' then true else coalesce((base->>'edit')::boolean,false) end;
end $$;

-- No plan may advertise or sell the support desk.
update public.saas_plans set enabled_features=coalesce(enabled_features,'{}'::jsonb)-'support_tickets',updated_at=now()
where coalesce(enabled_features,'{}'::jsonb) ? 'support_tickets';
update public.saas_catalog_items set is_active=false,is_public=false,updated_at=now()
where entitlement_code='support_tickets';

create or replace function public.support_unread_total()
returns integer language plpgsql stable security definer set search_path = public as $$
declare active_org uuid := public.current_org_id(); operator_view boolean := public.support_is_operator('support_view'); result integer;
begin
  if auth.uid() is null or active_org is null then return 0; end if;
  select count(*)::integer into result from public.saas_support_messages m
  join public.saas_support_tickets t on t.id=m.ticket_id
  where m.author_id<>auth.uid()
    and m.created_at>coalesce((select r.last_read_at from public.saas_support_reads r where r.ticket_id=t.id and r.user_id=auth.uid()),'-infinity'::timestamptz)
    and ((operator_view and t.org_id=public.support_provider_org_id()) or
      (not operator_view and t.customer_org_id=active_org and m.visibility='customer' and public.support_customer_can(active_org,'view',t.created_by)));
  return result;
end $$;
revoke all on function public.support_unread_total() from public,anon;
grant execute on function public.support_unread_total() to authenticated;

create or replace function public.support_notify_new_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
declare admin_org record; recipients uuid[];
begin
  for admin_org in select id from public.organizations where public.org_is_saas_admin(id) loop
    select coalesce(array_agg(distinct m.user_id),'{}'::uuid[]) into recipients
    from public.user_organization_memberships m join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
    where m.org_id=admin_org.id and m.is_active
      and coalesce((r.permissions->'__saas_admin'->>'view')::boolean,false)
      and coalesce((r.permissions->'__saas_admin'->'fields'->>'support_view')::boolean,true);
    if cardinality(recipients)>0 then
      perform public.kalam_upsert_notification_item(admin_org.id,'support_ticket_created',new.id::text,
        'support','ticket','insert','تیکت جدید '||public.support_ticket_code(new.ticket_no),left(new.subject,240),
        'saas_support_tickets',new.id::text,recipients,'{}'::uuid[],false,
        jsonb_build_object('path','/taze-system/tickets/'||new.id::text),new.created_at);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists support_notify_new_ticket on public.saas_support_tickets;
create trigger support_notify_new_ticket after insert on public.saas_support_tickets
for each row execute function public.support_notify_new_ticket();

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
    where (is_operator and t.org_id = public.support_provider_org_id() or
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


create or replace function public.support_assign_ticket(p_ticket_id uuid,p_assignee uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.saas_support_tickets%rowtype;
begin
  if not (public.support_is_operator('support_view') and public.support_is_operator('support_manage')) then raise exception 'support_access_denied' using errcode='42501'; end if;
  select * into t from public.saas_support_tickets where id=p_ticket_id and org_id=public.support_provider_org_id() for update;
  if not found then raise exception 'support_ticket_not_found'; end if;
  if p_assignee is not null and not exists (select 1 from public.user_organization_memberships m join public.org_roles r on r.id=m.role_id
    where m.user_id=p_assignee and public.org_is_saas_admin(m.org_id) and m.is_active
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
  where public.org_is_saas_admin(m.org_id) and m.is_active
    and coalesce((r.permissions -> '__saas_admin' ->> 'view')::boolean,false)
    and coalesce((r.permissions -> '__saas_admin' -> 'fields' ->> 'support_view')::boolean,true)
$$;


notify pgrst, 'reload schema';
commit;
