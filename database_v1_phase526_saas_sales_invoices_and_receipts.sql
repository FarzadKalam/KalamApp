-- TazeSystem V1 Phase 526: ثبت فاکتور فروش و دریافت واقعی خریدهای SaaS.
begin;

create or replace function public.create_saas_sales_invoice_for_order()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  seller_org uuid;
  tenant_name text;
  total numeric := greatest(coalesce(new.total_irt,0),0);
  item_rows jsonb := coalesce(new.items,'[]'::jsonb);
  payment_row jsonb;
begin
  if new.status <> 'paid' or (tg_op='UPDATE' and old.status='paid') or total<=0 then return new; end if;
  select o.id into seller_org from public.organizations o where public.org_is_saas_admin(o.id) order by o.created_at limit 1;
  if seller_org is null then return new; end if;
  if exists(select 1 from public.invoices i where i.org_id=seller_org and coalesce(i.tags::text,'') like '%' || new.id::text || '%') then return new; end if;
  select name into tenant_name from public.organizations where id=new.org_id;
  payment_row := jsonb_build_object('payment_type',case when coalesce(new.metadata->>'payment_method','')='billing_wallet' then 'wallet' else 'online' end,'amount',total,'date',current_date,'note','دریافت بابت سفارش حساب SaaS','saas_order_id',new.id::text,'payment_transaction_id',new.payment_transaction_id::text);
  insert into public.invoices(org_id,name,invoice_date,status,tags,"invoiceItems",payments,total_invoice_amount,total_received_amount,remaining_balance,created_by,updated_by)
  values(seller_org,'فاکتور فروش حساب ' || coalesce(nullif(tenant_name,''),'سازمان'),current_date,'settled',jsonb_build_array(new.id::text),item_rows,jsonb_build_array(payment_row),total,total,0,new.created_by,new.created_by);
  return new;
exception when undefined_column then
  -- در نسخه‌های بسیار قدیمی که tags هنوز وجود ندارد، ثبت سفارش نباید شکست بخورد.
  return new;
end;
$$;
revoke all on function public.create_saas_sales_invoice_for_order() from public,anon,authenticated;
grant execute on function public.create_saas_sales_invoice_for_order() to service_role;
drop trigger if exists trg_saas_order_sales_invoice on public.saas_orders;
create trigger trg_saas_order_sales_invoice after insert or update of status on public.saas_orders for each row when (new.status='paid') execute function public.create_saas_sales_invoice_for_order();

create or replace function public.create_saas_sales_invoice_for_subscription()
returns trigger language plpgsql security definer set search_path = public
as $$
declare seller_org uuid; tenant_name text; total numeric := greatest(coalesce(new.total_irt,0),0); payment_row jsonb;
begin
  if new.status <> 'paid' or (tg_op='UPDATE' and old.status='paid') or total<=0 then return new; end if;
  select o.id into seller_org from public.organizations o where public.org_is_saas_admin(o.id) order by o.created_at limit 1;
  if seller_org is null then return new; end if;
  if exists(select 1 from public.invoices i where i.org_id=seller_org and coalesce(i.tags::text,'') like '%' || new.id::text || '%') then return new; end if;
  select name into tenant_name from public.organizations where id=new.org_id;
  payment_row := jsonb_build_object('payment_type','online','amount',total,'date',current_date,'note','دریافت بابت تمدید اشتراک SaaS','saas_subscription_invoice_id',new.id::text,'payment_transaction_id',new.payment_transaction_id::text);
  insert into public.invoices(org_id,name,invoice_date,status,tags,"invoiceItems",payments,total_invoice_amount,total_received_amount,remaining_balance,created_by,updated_by)
  values(seller_org,'فاکتور تمدید حساب ' || coalesce(nullif(tenant_name,''),'سازمان'),current_date,'settled',jsonb_build_array(new.id::text),jsonb_build_array(jsonb_build_object('title','تمدید اشتراک','quantity',1,'unit_price',total,'total',total)),jsonb_build_array(payment_row),total,total,0,null,null);
  return new;
exception when undefined_column then return new;
end;
$$;
revoke all on function public.create_saas_sales_invoice_for_subscription() from public,anon,authenticated;
grant execute on function public.create_saas_sales_invoice_for_subscription() to service_role;
drop trigger if exists trg_saas_subscription_sales_invoice on public.saas_subscription_invoices;
create trigger trg_saas_subscription_sales_invoice after insert or update of status on public.saas_subscription_invoices for each row when (new.status='paid') execute function public.create_saas_sales_invoice_for_subscription();

-- سفارش‌های موفق قبلی نیز یک بار وارد دفتر فروش مرکزی می‌شوند.
insert into public.invoices(org_id,name,invoice_date,status,tags,"invoiceItems",payments,total_invoice_amount,total_received_amount,remaining_balance,created_by,updated_by)
select seller.id,'فاکتور فروش حساب ' || coalesce(nullif(tenant.name,''),'سازمان'),current_date,'settled',jsonb_build_array(order_row.id::text),order_row.items,
  jsonb_build_array(jsonb_build_object('payment_type',case when coalesce(order_row.metadata->>'payment_method','')='billing_wallet' then 'wallet' else 'online' end,'amount',order_row.total_irt,'date',current_date,'note','دریافت بابت سفارش حساب SaaS','saas_order_id',order_row.id::text)),order_row.total_irt,order_row.total_irt,0,order_row.created_by,order_row.created_by
from public.saas_orders order_row
join public.organizations tenant on tenant.id=order_row.org_id
cross join lateral (select o.id from public.organizations o where public.org_is_saas_admin(o.id) order by o.created_at limit 1) seller
where order_row.status='paid' and order_row.total_irt>0
  and not exists(select 1 from public.invoices i where i.org_id=seller.id and coalesce(i.tags::text,'') like '%' || order_row.id::text || '%');

notify pgrst,'reload schema';
commit;
