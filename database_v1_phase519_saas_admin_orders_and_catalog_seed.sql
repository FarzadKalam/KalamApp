-- =====================================================
-- TazeSystem - Phase 519: admin tenant orders and safe catalog checkout
-- Additive / idempotent.  No production execution is implied by this file.
-- =====================================================

begin;

-- Reconcile module prices that were already configured on a plan into the
-- public add-on catalog.  Empty module_pricing stays empty: this migration
-- deliberately does not invent a price for an item that has not been priced.
insert into public.saas_catalog_items (
  code, title, description, item_kind, entitlement_code, quantity, price_irt,
  billing_cycle, is_active, is_public, sort_order, metadata
)
select
  'module:' || entry.key,
  coalesce(nullif(entry.value ->> 'label', ''), entry.key),
  coalesce(nullif(entry.value ->> 'description', ''), 'افزودن ماژول به سازمان'),
  'module', entry.key, 1,
  greatest(coalesce((entry.value ->> 'price')::numeric, 0), 0),
  'monthly', true, true, 200,
  jsonb_build_object('source_plan', plan.code)
from public.saas_plans plan
cross join lateral jsonb_each(coalesce(plan.module_pricing, '{}'::jsonb)) entry
where coalesce((entry.value ->> 'price')::numeric, 0) > 0
on conflict (code) do nothing;

insert into public.saas_catalog_items (
  code, title, description, item_kind, entitlement_code, quantity, price_irt,
  billing_cycle, is_active, is_public, sort_order, metadata
)
select distinct on (plan.code)
  'extra_users:' || plan.code, 'کاربر اضافه', 'افزودن یک کاربر به سهمیه سازمان',
  'quota', 'users', 1, plan.extra_user_price, 'monthly', true, true, 250,
  jsonb_build_object('source_plan', plan.code)
from public.saas_plans plan
where coalesce(plan.extra_user_price, 0) > 0
order by plan.code
on conflict (code) do nothing;

-- Admin creates a pending order for a tenant; prices are always read from the
-- database, never trusted from the browser.  The tenant can pay it later.
create or replace function public.admin_create_saas_order(p_org_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  entry record;
  catalog public.saas_catalog_items%rowtype;
  plan public.saas_plans%rowtype;
  normalized_items jsonb := '[]'::jsonb;
  qty numeric;
  entitlement_quantity numeric;
  line_total numeric;
  total numeric := 0;
  order_id uuid;
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then raise exception 'permission denied'; end if;
  if p_org_id is null or not exists (select 1 from public.saas_org_settings where org_id = p_org_id) then raise exception 'saas_org_not_found'; end if;
  if public.org_is_saas_admin(p_org_id) then raise exception 'saas_admin_target_not_allowed'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'order_items_required'; end if;
  for entry in select value from jsonb_array_elements(p_items) loop
    qty := greatest(1, least(coalesce((entry.value ->> 'quantity')::numeric, 1), 1000));
    if left(coalesce(entry.value ->> 'code', ''), 5) = 'plan:' then
      select * into plan from public.saas_plans where code = substr(entry.value ->> 'code', 6) and is_active and is_public;
      if plan.id is null or plan.price_monthly <= 0 then raise exception 'catalog_item_not_available'; end if;
      line_total := plan.price_monthly;
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
        'code', 'plan:' || plan.code, 'title', plan.title, 'item_kind', 'plan',
        'entitlement_code', plan.code, 'quantity', 1, 'purchase_quantity', 1,
        'unit_price_irt', plan.price_monthly, 'line_total_irt', line_total));
      total := total + line_total;
    else
      select * into catalog from public.saas_catalog_items
      where code = entry.value ->> 'code' and is_active and is_public and price_irt > 0;
      if catalog.id is null then raise exception 'catalog_item_not_available'; end if;
      entitlement_quantity := qty * catalog.quantity;
      line_total := qty * catalog.price_irt;
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
        'code', catalog.code, 'title', catalog.title, 'item_kind', catalog.item_kind,
        'entitlement_code', catalog.entitlement_code, 'quantity', entitlement_quantity,
        'purchase_quantity', qty, 'unit_price_irt', catalog.price_irt,
        'line_total_irt', line_total));
      total := total + line_total;
    end if;
  end loop;
  insert into public.saas_orders (org_id, created_by, total_irt, items, metadata)
  values (p_org_id, auth.uid(), total, normalized_items,
    jsonb_build_object('source', 'saas_admin_cart', 'created_by_admin', auth.uid()))
  returning id into order_id;
  return jsonb_build_object('success', true, 'order_id', order_id, 'status', 'pending_payment', 'total_irt', total, 'items', normalized_items);
end;
$$;

create or replace function public.admin_update_saas_order(p_order_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare order_row public.saas_orders%rowtype; recreated jsonb;
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then raise exception 'permission denied'; end if;
  select * into order_row from public.saas_orders where id = p_order_id for update;
  if order_row.id is null then raise exception 'saas_order_not_found'; end if;
  if public.org_is_saas_admin(order_row.org_id) then raise exception 'saas_admin_target_not_allowed'; end if;
  if order_row.status <> 'pending_payment' then raise exception 'saas_order_not_editable'; end if;
  delete from public.saas_orders where id = p_order_id;
  recreated := public.admin_create_saas_order(order_row.org_id, p_items);
  return recreated || jsonb_build_object('replaced_order_id', p_order_id);
end;
$$;

create or replace function public.admin_list_saas_org_orders(p_org_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.current_user_has_saas_admin_permission() then coalesce(jsonb_agg(to_jsonb(order_row) order by order_row.created_at desc), '[]'::jsonb) else '[]'::jsonb end
  from (select * from public.saas_orders where org_id = p_org_id order by created_at desc limit 50) order_row;
$$;

create or replace function public.get_current_saas_pending_orders()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(order_row) order by order_row.created_at desc), '[]'::jsonb)
  from (select * from public.saas_orders where org_id = public.current_org_id() and status = 'pending_payment' order by created_at desc limit 20) order_row;
$$;

-- Used by the payment gateway when an administrator created the pending order.
create or replace function public.prepare_current_saas_order_payment(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare order_row public.saas_orders%rowtype;
begin
  if auth.uid() is null or public.current_org_id() is null then raise exception 'organization_access_denied'; end if;
  select * into order_row from public.saas_orders where id = p_order_id and org_id = public.current_org_id() for update;
  if order_row.id is null then raise exception 'saas_order_not_found'; end if;
  if order_row.status <> 'pending_payment' then raise exception 'saas_order_not_payable'; end if;
  if not exists (select 1 from public.user_organization_memberships where user_id = auth.uid() and org_id = order_row.org_id and is_active and (is_owner or software_role = 'admin')) then raise exception 'organization_admin_required'; end if;
  return jsonb_build_object('success', true, 'order_id', order_row.id, 'total_irt', order_row.total_irt, 'items', order_row.items);
end;
$$;

revoke all on function public.admin_create_saas_order(uuid, jsonb), public.admin_update_saas_order(uuid, jsonb), public.admin_list_saas_org_orders(uuid) from public, anon;
grant execute on function public.admin_create_saas_order(uuid, jsonb), public.admin_update_saas_order(uuid, jsonb), public.admin_list_saas_org_orders(uuid) to authenticated;
revoke all on function public.get_current_saas_pending_orders(), public.prepare_current_saas_order_payment(uuid) from public, anon;
grant execute on function public.get_current_saas_pending_orders(), public.prepare_current_saas_order_payment(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
