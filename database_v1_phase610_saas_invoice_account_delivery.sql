begin;

create table if not exists public.saas_sales_invoice_orders (
  org_id uuid not null references public.organizations(id),
  tenant_org_id uuid not null references public.organizations(id),
  invoice_id uuid primary key references public.invoices(id) on delete restrict,
  order_id uuid not null unique references public.saas_orders(id) on delete restrict,
  title text not null,
  sale_lines jsonb not null,
  currency_factor integer not null check(currency_factor in (1,10))
);
alter table public.saas_sales_invoice_orders enable row level security;
revoke all on public.saas_sales_invoice_orders from public,anon,authenticated;
create index if not exists saas_sales_invoice_orders_tenant_idx on public.saas_sales_invoice_orders(tenant_org_id,order_id);

create or replace function public.saas_sales_currency_factor(p_provider uuid)
returns integer language plpgsql stable security definer set search_path=public as $$
declare configured_currency text;
begin
  select currency_code into configured_currency from public.company_settings where org_id=p_provider limit 1;
  case coalesce(configured_currency,'IRT')
    when 'IRT' then return 1;
    when 'IRR' then return 10;
    else raise exception 'پرداخت اشتراک برای فاکتور ریالی یا تومانی قابل ارسال است.';
  end case;
end $$;
revoke all on function public.saas_sales_currency_factor(uuid) from public,anon,authenticated;

create or replace function public.guard_workflow_saas_invoice_links()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and (new.org_id,new.saas_tenant_org_id,new.saas_demo_request_id,new.workflow_saas_origin_key)
    is not distinct from (old.org_id,old.saas_tenant_org_id,old.saas_demo_request_id,old.workflow_saas_origin_key) then return new; end if;
  if tg_op='UPDATE' and (old.saas_tenant_org_id is not null or old.saas_demo_request_id is not null or old.workflow_saas_origin_key is not null) then
    if auth.role() is distinct from 'service_role' and not public.saas_workflow_actor_allowed(old.org_id,auth.uid()) then
      raise exception 'saas_invoice_link_access_denied' using errcode='42501';
    end if;
  end if;
  if new.saas_tenant_org_id is not null or new.saas_demo_request_id is not null or new.workflow_saas_origin_key is not null then
    if new.org_id is distinct from public.support_provider_org_id()
      or (auth.role() is distinct from 'service_role' and not public.saas_workflow_actor_allowed(new.org_id,auth.uid())) then
      raise exception 'saas_invoice_link_access_denied' using errcode='42501';
    end if;
  end if;
  return new;
end $$;

create or replace function public.assign_workflow_saas_invoice_customer() returns trigger
language plpgsql security definer set search_path=public as $$
declare line jsonb; lines jsonb:='[]'; total numeric:=0; qty numeric; price numeric; factor integer;
  item_id uuid; item_kind text; item_name text;
begin
  if new.saas_tenant_org_id is null then raise exception 'سازمان درخواست دمو هنوز ایجاد نشده است.'; end if;
  new.customer_id:=public.resolve_saas_sales_customer(new.org_id,new.saas_tenant_org_id,new.customer_id);
  if new.customer_id is null then raise exception 'مشتری متناظر را در جزئیات سازمان تأیید کنید.'; end if;
  if coalesce(jsonb_array_length(new."invoiceItems"),0)>0 then
    factor:=public.saas_sales_currency_factor(new.org_id);
    if jsonb_array_length(new."invoiceItems")>100 then raise exception 'تعداد اقلام فاکتور بیش از حد مجاز است.'; end if;
    for line in select value from jsonb_array_elements(new."invoiceItems") loop
      item_id:=(line->>'product_id')::uuid;
      item_kind:=line->>'source_module_id';
      qty:=(line->>'quantity')::numeric;
      price:=(line->>'unit_price')::numeric;
      if qty is null or qty<=0 or qty>10000 or price is null or price<0 or price>1e15 then
        raise exception 'تعداد یا قیمت قلم فاکتور معتبر نیست.';
      end if;
      if item_kind='product_bundles' then
        select name into item_name from public.product_bundles where id=item_id and org_id=new.org_id;
      elsif item_kind='products' then
        select name into item_name from public.products where id=item_id and org_id=new.org_id;
      else raise exception 'نوع قلم فاکتور معتبر نیست.'; end if;
      if item_name is null then raise exception 'کالا، خدمت یا پکیج در سازمان فروشنده پیدا نشد.'; end if;
      total:=total+round(qty*price)*factor;
      lines:=lines||jsonb_build_array(jsonb_build_object('product_id',item_id,'source_module_id',item_kind,
        'title',item_name,'product_name',item_name,'quantity',qty,'unit_price',price*factor,'total_price',round(qty*price)*factor)
        || case when item_kind='product_bundles' then jsonb_build_object('package_id',item_id,'package_name',item_name,'item_kind','package','product_type','package')
          else '{}'::jsonb end);
    end loop;
    new."invoiceItems":=lines;
    new.total_invoice_amount:=total;
    new.remaining_balance:=total;
  end if;
  return new;
end $$;
revoke all on function public.assign_workflow_saas_invoice_customer() from public,anon,authenticated;
drop trigger if exists assign_workflow_saas_invoice_customer on public.invoices;
create trigger assign_workflow_saas_invoice_customer before insert on public.invoices
  for each row when (new.workflow_saas_origin_key is not null) execute function public.assign_workflow_saas_invoice_customer();

create or replace function public.resolve_saas_workflow_tenant(p_provider uuid,p_module text,p_record uuid)
returns uuid language plpgsql stable security definer set search_path=public as $$
declare tenant uuid;
begin
  if p_provider is null or p_provider is distinct from public.support_provider_org_id() then return null; end if;
  if p_module='saas_orgs' then
    select org_id into tenant from public.saas_org_settings where org_id=p_record or id=p_record;
  elsif p_module='saas_demo_requests' then
    select org_id into tenant from public.saas_onboarding_requests where id=p_record;
  elsif p_module='invoices' then
    select coalesce(i.saas_tenant_org_id,l.tenant_org_id) into tenant
    from public.invoices i left join public.saas_sales_customer_links l on l.org_id=i.org_id and l.customer_id=i.customer_id
    where i.id=p_record and i.org_id=p_provider;
  end if;
  if tenant=p_provider or public.org_is_saas_admin(tenant) then return null; end if;
  return tenant;
end $$;
revoke all on function public.resolve_saas_workflow_tenant(uuid,text,uuid) from public,anon,authenticated;

create or replace function public.workflow_deliver_saas_sales_invoice(
  p_provider uuid,p_actor uuid,p_module text,p_record uuid,p_term_months integer default 1
) returns jsonb language plpgsql security definer set search_path=public as $$
declare tenant uuid; invoice public.invoices%rowtype; customer uuid; target_invoice uuid; existing uuid; target_order uuid;
  line jsonb; sale_lines jsonb:='[]'; entitlements jsonb:='[]'; mapping record; addon public.saas_catalog_items%rowtype;
  line_amount numeric; qty numeric; item_name text; entitled jsonb; amount numeric; factor integer; plan_found boolean:=false;
begin
  if auth.role() is distinct from 'service_role' or not public.saas_workflow_actor_allowed(p_provider,p_actor) then
    raise exception 'saas_workflow_access_denied' using errcode='42501';
  end if;
  if p_term_months is null or p_term_months not in (1,3,6,12) then raise exception 'invalid_subscription_term'; end if;
  tenant:=public.resolve_saas_workflow_tenant(p_provider,p_module,p_record);
  if tenant is null then raise exception 'سازمان مشتری فاکتور مشخص نیست.'; end if;
  if p_module='invoices' then target_invoice:=p_record;
  else
    select i.id into target_invoice from public.invoices i where i.org_id=p_provider and i.saas_tenant_org_id=tenant
      and (p_module='saas_orgs' or i.saas_demo_request_id=p_record)
      and i.status in ('proforma','final','confirmed')
      order by i.created_at desc,i.id desc limit 1;
  end if;
  select * into invoice from public.invoices where id=target_invoice and org_id=p_provider for update;
  if not found then raise exception 'فاکتور مرتبط قابل ارسال پیدا نشد.'; end if;
  select order_id into existing from public.saas_sales_invoice_orders where org_id=p_provider and tenant_org_id=tenant and invoice_id=invoice.id;
  if existing is not null then return jsonb_build_object('already_sent',true); end if;
  if invoice.status not in ('proforma','final','confirmed') or invoice.status is null
    or coalesce(invoice.total_received_amount,0)<>0 or coalesce(invoice.payments,'[]'::jsonb)<>'[]'::jsonb then
    raise exception 'فاکتور باید صادر شده و بدون دریافت قبلی باشد.';
  end if;
  factor:=public.saas_sales_currency_factor(p_provider);
  amount:=invoice.total_invoice_amount/factor;
  if amount is null or amount<=0 or amount<>trunc(amount) or amount::text='NaN' then raise exception 'مبلغ فاکتور معتبر نیست.'; end if;
  if exists(select 1 from public.payment_transactions tx where tx.org_id=p_provider and tx.purpose='online_invoice'
    and tx.record_id=invoice.id and tx.status in ('pending','redirected','verified','paid')) then
    raise exception 'این فاکتور در مسیر پرداخت آنلاین دیگری قرار دارد.';
  end if;
  customer:=public.resolve_saas_sales_customer(p_provider,tenant,invoice.customer_id);
  if customer is null then raise exception 'مشتری متناظر را در جزئیات سازمان تأیید کنید.'; end if;
  for line in select value from jsonb_array_elements(coalesce(invoice."invoiceItems",'[]')) loop
    qty:=coalesce(nullif(line->>'quantity','')::numeric,1);
    line_amount:=coalesce(nullif(line->>'total_price','')::numeric,nullif(line->>'line_total','')::numeric,
      qty*coalesce(nullif(line->>'unit_price','')::numeric,0))/factor;
    if qty<=0 or qty>10000 or qty::text='NaN' or line_amount<0 or line_amount::text='NaN' then raise exception 'مقدار یا مبلغ قلم فاکتور معتبر نیست.'; end if;
    select l.kind,l.code,coalesce(b.name,p.name) as title into mapping from public.saas_sales_catalog_links l
      left join public.product_bundles b on b.id=l.bundle_id and b.org_id=l.org_id
      left join public.products p on p.id=l.product_id and p.org_id=l.org_id
      where l.org_id=p_provider and ((b.id::text=line->>'product_id') or (p.id::text=line->>'product_id')
        or (nullif(line->>'product_id','') is null and b.id::text=line->>'package_id'));
    select p.name into item_name from public.products p where p.org_id=p_provider and p.id::text=line->>'product_id';
    item_name:=coalesce(mapping.title,item_name,nullif(line->>'title',''),nullif(line->>'name',''),
      nullif(line->>'product_name',''),'قلم فاکتور');
    sale_lines:=sale_lines||jsonb_build_array(jsonb_build_object('code','line:'||(jsonb_array_length(sale_lines)+1),
      'title',left(item_name,180),'quantity',qty,'line_total_irt',line_amount));
    entitled:=null;
    if mapping.kind='plan' then
      if plan_found or qty<>trunc(qty) or not exists(select 1 from public.saas_plans p where p.code=mapping.code and p.is_active) then
        raise exception 'فاکتور باید حداکثر یک پلن فعال با تعداد کاربران معتبر داشته باشد.';
      end if;
      if qty<greatest(3,(select count(*) from public.user_organization_memberships where org_id=tenant and is_active)) then
        raise exception 'تعداد کاربر پلن از حداقل تعداد موردنیاز سازمان کمتر است.';
      end if;
      plan_found:=true;
      entitled:=jsonb_build_object('item_kind','plan','code','plan:'||mapping.code,'entitlement_code',mapping.code,
        'metadata',jsonb_build_object('term_months',p_term_months,'billable_users',qty));
    elsif mapping.kind='addon' then
      select * into addon from public.saas_catalog_items where code=mapping.code and is_active;
      if not found then raise exception 'افزونه فاکتور فعال نیست.'; end if;
      entitled:=jsonb_build_object('item_kind',addon.item_kind,'code',addon.code,'entitlement_code',addon.entitlement_code,
        'billing_cycle',addon.billing_cycle,'metadata',addon.metadata);
    elsif mapping.kind in ('module','feature') then
      if not exists(select 1 from jsonb_array_elements_text(public.saas_offering_keys()->case when mapping.kind='module' then 'modules' else 'features' end) k where k=mapping.code) then
        raise exception 'امکان یا ماژول فاکتور در کاتالوگ حساب تعریف نشده است.';
      end if;
      entitled:=jsonb_build_object('item_kind',mapping.kind,'code',mapping.kind||':'||mapping.code,'entitlement_code',mapping.code,'billing_cycle','one_time');
    end if;
    if entitled is not null then
      entitlements:=entitlements||jsonb_build_array(entitled||jsonb_build_object('title',item_name,'quantity',qty,'line_total_irt',line_amount));
    end if;
  end loop;
  if jsonb_array_length(sale_lines)=0 then raise exception 'فاکتور برای ارسال باید قلم داشته باشد.'; end if;
  update public.invoices set customer_id=customer,saas_tenant_org_id=tenant where id=invoice.id and org_id=p_provider;
  insert into public.saas_orders(org_id,created_by,total_irt,items) values(tenant,p_actor,amount,entitlements) returning id into target_order;
  insert into public.saas_sales_invoice_orders(org_id,tenant_org_id,invoice_id,order_id,title,sale_lines,currency_factor)
    values(p_provider,tenant,invoice.id,target_order,invoice.name,sale_lines,factor);
  return jsonb_build_object('sent',true);
end $$;
revoke all on function public.workflow_deliver_saas_sales_invoice(uuid,uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.workflow_deliver_saas_sales_invoice(uuid,uuid,text,uuid,integer) to service_role;

create or replace function public.settle_delivered_saas_sales_invoice() returns trigger
language plpgsql security definer set search_path=public as $$
declare link public.saas_sales_invoice_orders%rowtype; affected int;
begin
  if old.status='paid' then return new; end if;
  select * into link from public.saas_sales_invoice_orders where order_id=new.id and tenant_org_id=new.org_id;
  if not found then return new; end if;
  if (new.payment_transaction_id is null and new.metadata->>'payment_method' is distinct from 'billing_wallet')
    or (new.payment_transaction_id is not null and not exists(select 1 from public.payment_transactions tx
      where tx.id=new.payment_transaction_id and tx.org_id=new.org_id and tx.purpose='saas_account_order'
        and tx.status in ('verified','paid') and tx.amount=new.total_irt and tx.currency='IRT'
        and tx.metadata->>'saas_order_id'=new.id::text)) then
    raise exception 'دریافت تأییدشده با مبلغ فاکتور مطابقت ندارد.';
  end if;
  update public.invoices set status='settled',total_received_amount=new.total_irt*link.currency_factor,remaining_balance=0,
    payments=jsonb_build_array(jsonb_build_object('payment_type',case when new.metadata->>'payment_method'='billing_wallet' then 'wallet' else 'online' end,
      'amount',new.total_irt*link.currency_factor,'date',current_date,'status','received','note','دریافت از حساب و اشتراک',
      'saas_order_id',new.id,'payment_transaction_id',new.payment_transaction_id))
  where id=link.invoice_id and org_id=link.org_id and saas_tenant_org_id=new.org_id and total_invoice_amount=new.total_irt*link.currency_factor;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'پیوند دریافت با فاکتور فروش معتبر نیست.'; end if;
  return new;
end $$;
revoke all on function public.settle_delivered_saas_sales_invoice() from public,anon,authenticated;
drop trigger if exists settle_delivered_saas_sales_invoice on public.saas_orders;
create trigger settle_delivered_saas_sales_invoice after update of status on public.saas_orders
  for each row when (new.status='paid') execute function public.settle_delivered_saas_sales_invoice();

-- Reuse the normal sales-invoice trigger for all other SaaS orders.
create or replace function public.saas_order_has_sales_invoice(p_order uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.saas_sales_invoice_orders where order_id=p_order)
$$;
revoke all on function public.saas_order_has_sales_invoice(uuid) from public,anon,authenticated;

create or replace function public.is_current_saas_sales_invoice_order(p_order uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.saas_sales_invoice_orders
    where order_id=p_order and tenant_org_id=public.current_org_id() and auth.uid() is not null)
$$;
revoke all on function public.is_current_saas_sales_invoice_order(uuid) from public,anon;
grant execute on function public.is_current_saas_sales_invoice_order(uuid) to authenticated;
drop policy if exists sales_invoice_order_safe_read on public.saas_orders;
create policy sales_invoice_order_safe_read on public.saas_orders as restrictive for select to authenticated
  using (org_id=public.current_org_id() and not public.is_current_saas_sales_invoice_order(id));

do $$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('public.activate_saas_order_items(uuid,uuid,text)'::regprocedure);
  if position('public.saas_order_has_sales_invoice(order_row.id)' in definition)>0 then return; end if;
  patched:=regexp_replace(definition,
    'select \* into catalog_row from public.saas_catalog_items where code=entry.value ->> ''code'' limit 1;',
    E'\\&\n      if public.saas_order_has_sales_invoice(order_row.id) then\n        catalog_row.billing_cycle := entry.value ->> ''billing_cycle'';\n        catalog_row.metadata := entry.value -> ''metadata'';\n      end if;', 'g');
  if patched=definition then raise exception 'saas_activate_order_catalog_snapshot_patch_missing'; end if;
  execute patched;
end $$;
-- Keep the existing receipt writer, including any later accounting rules.
-- The gate runs inside its definer context so wallet payers need no extra grants.
do $$ declare definition text; patched text;
begin
  definition:=pg_get_functiondef('public.create_saas_sales_invoice_for_order()'::regprocedure);
  if position('public.saas_order_has_sales_invoice(new.id)' in definition)>0 then return; end if;
  patched:=regexp_replace(definition,'\mbegin\M',E'begin\n  if public.saas_order_has_sales_invoice(new.id) then return new; end if;', 'i');
  if patched=definition then raise exception 'saas_sales_invoice_trigger_body_not_found'; end if;
  execute patched;
end $$;

create or replace function public.guard_delivered_saas_order() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if public.saas_order_has_sales_invoice(old.id) then
    if tg_op='DELETE' then raise exception 'فاکتور ارسالی از بخش حساب قابل حذف نیست.'; end if;
    if (new.org_id,new.total_irt,new.items) is distinct from (old.org_id,old.total_irt,old.items) then
      raise exception 'اقلام و مبلغ فاکتور ارسالی ثابت هستند.';
    end if;
    if old.status='pending_payment' and new.status='paid' and new.metadata->>'payment_method'='billing_wallet'
      and exists(select 1 from public.payment_transactions t where t.org_id=old.org_id and t.purpose='saas_account_order'
        and t.metadata->>'saas_order_id'=old.id::text and t.status in ('pending','redirected','verified','paid')) then
      raise exception 'پرداخت آنلاین این فاکتور در جریان است.';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.guard_delivered_saas_order() from public,anon,authenticated;
drop trigger if exists guard_delivered_saas_order on public.saas_orders;
create trigger guard_delivered_saas_order before update or delete on public.saas_orders
  for each row execute function public.guard_delivered_saas_order();

create or replace function public.guard_delivered_saas_sales_invoice() returns trigger
language plpgsql security definer set search_path=public as $$
declare linked_status text;
begin
  select o.status into linked_status from public.saas_sales_invoice_orders l join public.saas_orders o on o.id=l.order_id
    where l.invoice_id=old.id and l.org_id=old.org_id;
  if not found then return new; end if;
  if (new.org_id,new.saas_tenant_org_id,new.customer_id,new.total_invoice_amount,new."invoiceItems")
    is distinct from (old.org_id,old.saas_tenant_org_id,old.customer_id,old.total_invoice_amount,old."invoiceItems") then
    raise exception 'مبلغ و اقلام فاکتور ارسالی ثابت هستند.';
  end if;
  if (new.status,new.payments,new.total_received_amount,new.remaining_balance)
    is distinct from (old.status,old.payments,old.total_received_amount,old.remaining_balance)
    and not (linked_status='paid' and pg_trigger_depth()>1 and old.status<>'settled' and new.status='settled') then
    raise exception 'دریافت این فاکتور از حساب و اشتراک ثبت می‌شود.';
  end if;
  return new;
end $$;
revoke all on function public.guard_delivered_saas_sales_invoice() from public,anon,authenticated;
drop trigger if exists guard_delivered_saas_sales_invoice on public.invoices;
create trigger guard_delivered_saas_sales_invoice before update on public.invoices
  for each row execute function public.guard_delivered_saas_sales_invoice();

create or replace function public.guard_delivered_saas_online_payment() returns trigger
language plpgsql security definer set search_path=public as $$
declare linked_order public.saas_orders%rowtype;
begin
  if new.purpose='online_invoice' and new.record_id is not null then
    perform 1 from public.invoices where id=new.record_id and org_id=new.org_id for update;
    if exists(select 1 from public.saas_sales_invoice_orders where invoice_id=new.record_id and org_id=new.org_id) then
      raise exception 'این فاکتور از بخش حساب و اشتراک قابل پرداخت است.';
    end if;
  end if;
  if new.purpose='saas_account_order' then
    select o.* into linked_order from public.saas_orders o join public.saas_sales_invoice_orders l
      on l.order_id=o.id and l.tenant_org_id=o.org_id
      where o.id::text=new.metadata->>'saas_order_id' and o.org_id=new.org_id for update of o;
    if found then
      if linked_order.status<>'pending_payment' or new.amount<>linked_order.total_irt or new.currency<>'IRT' then
        raise exception 'این فاکتور آماده پرداخت نیست.';
      end if;
      if exists(select 1 from public.payment_transactions t where t.org_id=new.org_id and t.purpose=new.purpose
        and t.metadata->>'saas_order_id'=linked_order.id::text and t.status in ('pending','redirected','verified','paid')) then
        raise exception 'پرداخت دیگری برای این فاکتور در جریان است.';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_delivered_saas_online_payment() from public,anon,authenticated;
drop trigger if exists guard_delivered_saas_online_payment on public.payment_transactions;
create trigger guard_delivered_saas_online_payment before insert on public.payment_transactions
  for each row execute function public.guard_delivered_saas_online_payment();

create or replace function public.prepare_current_saas_order_payment(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare order_row public.saas_orders%rowtype; tenant uuid:=public.current_org_id();
begin
  if auth.uid() is null or tenant is null then raise exception 'organization_access_denied'; end if;
  select * into order_row from public.saas_orders where id=p_order_id and org_id=tenant for update;
  if not found then raise exception 'saas_order_not_found'; end if;
  if order_row.status<>'pending_payment' then raise exception 'saas_order_not_payable'; end if;
  if not exists(select 1 from public.user_organization_memberships m where m.user_id=auth.uid()
    and m.org_id=tenant and m.is_active and (m.is_owner or m.software_role='admin')) then raise exception 'organization_admin_required'; end if;
  if public.saas_order_has_sales_invoice(order_row.id) then
    return jsonb_build_object('success',true,'order_id',order_row.id,'org_id',tenant,'total_irt',order_row.total_irt,'sales_invoice',true);
  end if;
  return jsonb_build_object('success',true,'order_id',order_row.id,'org_id',tenant,'total_irt',order_row.total_irt,'items',order_row.items);
end $$;
revoke all on function public.prepare_current_saas_order_payment(uuid) from public,anon;
grant execute on function public.prepare_current_saas_order_payment(uuid) to authenticated;

create or replace function public.get_current_saas_pending_orders()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(
    case when l.order_id is null then to_jsonb(o) else jsonb_build_object('id',o.id,'status',o.status,
      'created_at',o.created_at,'total_irt',o.total_irt,'items',l.sale_lines,'title',l.title,'sales_invoice',true) end
    order by o.created_at desc),'[]')
  from (select * from public.saas_orders where org_id=public.current_org_id() and auth.uid() is not null
    and status='pending_payment' order by created_at desc limit 20) o
  left join public.saas_sales_invoice_orders l on l.order_id=o.id and l.tenant_org_id=o.org_id
$$;
revoke all on function public.get_current_saas_pending_orders() from public,anon;
grant execute on function public.get_current_saas_pending_orders() to authenticated;

create or replace function public.workflow_apply_saas_sales_invoice_access(p_provider uuid,p_actor uuid,p_invoice uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare paid_order public.saas_orders%rowtype;
begin
  if auth.role() is distinct from 'service_role' or not public.saas_workflow_actor_allowed(p_provider,p_actor) then
    raise exception 'saas_workflow_access_denied' using errcode='42501';
  end if;
  select o.* into paid_order from public.saas_sales_invoice_orders l join public.saas_orders o
    on o.id=l.order_id and o.org_id=l.tenant_org_id
    where l.org_id=p_provider and l.invoice_id=p_invoice and o.status='paid';
  if not found then raise exception 'پرداخت فاکتور در حساب و اشتراک هنوز تأیید نشده است.'; end if;
  return public.activate_saas_order_items(paid_order.id,paid_order.payment_transaction_id,coalesce(paid_order.metadata->>'payment_method','online'));
end $$;
revoke all on function public.workflow_apply_saas_sales_invoice_access(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.workflow_apply_saas_sales_invoice_access(uuid,uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
