-- =====================================================
-- KalamApp - Phase 556: per-user SaaS pricing and truthful plan display
-- Additive / idempotent. Prices are in IRT (تومان).
-- =====================================================

begin;

alter table public.saas_plans
  add column if not exists price_per_user_monthly bigint,
  add column if not exists price_per_user_yearly bigint,
  add column if not exists minimum_users integer not null default 3;

update public.saas_plans
set price_per_user_monthly = case lower(coalesce(code, ''))
      when 'cloud_starter' then 780000
      when 'cloud_growth' then 990000
      when 'cloud_enterprise' then 1490000
      else coalesce(price_per_user_monthly, price_monthly)
    end,
    price_per_user_yearly = case lower(coalesce(code, ''))
      when 'cloud_starter' then 7800000
      when 'cloud_growth' then 9900000
      when 'cloud_enterprise' then 14900000
      else coalesce(price_per_user_yearly, price_yearly)
    end,
    minimum_users = 3,
    included_users = 3,
    extra_user_price = 0,
    display_features = case lower(coalesce(code, ''))
      when 'cloud_starter' then '["CRM و سرنخ‌ها", "پروژه و فعالیت", "فاکتور و هزینه ساده", "۵GB فضای ذخیره‌سازی", "حداقل ۳ کاربر"]'::jsonb
      when 'cloud_growth' then '["همه امکانات شروع", "فرآیندها و اتوماسیون", "منابع انسانی و حضور و مرخصی", "گزارش‌ساز پیشرفته", "۲۰GB فضای ذخیره‌سازی", "حداقل ۳ کاربر"]'::jsonb
      when 'cloud_enterprise' then '["همه امکانات رشد", "حسابداری و نقد و بانک", "تولید و منابع انسانی کامل", "سامانه مودیان و گزارش‌ساز پیشرفته", "هوش مصنوعی سازمانی", "۵۰GB فضای ذخیره‌سازی", "حداقل ۳ کاربر"]'::jsonb
      else display_features
    end,
    updated_at = now()
where lower(coalesce(code, '')) in ('cloud_starter', 'cloud_growth', 'cloud_enterprise');

create or replace function public.saas_billable_user_count(p_org_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    3,
    coalesce((select count(*)::integer from public.user_organization_memberships where org_id = p_org_id and is_active), 0)
  );
$$;

create or replace function public.saas_plan_monthly_total(p_plan_code text, p_org_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.org_is_saas_admin(p_org_id) then 0::numeric
    else greatest(0, coalesce(plan.price_per_user_monthly, 0)) * public.saas_billable_user_count(p_org_id)
  end
  from public.saas_plans plan
  where lower(plan.code) = lower(coalesce(p_plan_code, ''))
  limit 1;
$$;

create or replace function public.get_public_plans()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'code', code,
    'title', title,
    'short_description', short_description,
    'price_monthly', coalesce(price_per_user_monthly, price_monthly),
    'price_yearly', coalesce(price_per_user_yearly, price_yearly),
    'included_users', coalesce(minimum_users, 3),
    'minimum_users', coalesce(minimum_users, 3),
    'extra_user_price', 0,
    'max_users', max_users,
    'storage_gb', storage_gb,
    'highlight_tag', highlight_tag,
    'display_features', display_features,
    'enabled_modules', coalesce(enabled_modules, '{}'::jsonb),
    'enabled_features', coalesce(enabled_features, '{}'::jsonb),
    'custom_price_label', custom_price_label,
    'trial_days', trial_days
  ) order by sort_order asc), '[]'::jsonb)
  from public.saas_plans
  where is_active = true and is_public = true;
$$;

create or replace function public.get_current_saas_store_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(item order by (item ->> 'sort_order')::int, item ->> 'title'), '[]'::jsonb)
  from (
    select jsonb_build_object('code', code, 'title', title, 'description', description, 'item_kind', item_kind,
      'entitlement_code', entitlement_code, 'quantity', quantity, 'price_irt', price_irt, 'billing_cycle', billing_cycle,
      'sort_order', sort_order, 'metadata', metadata) as item
    from public.saas_catalog_items where is_active and is_public and price_irt > 0
    union all
    select jsonb_build_object('code', 'plan:' || code, 'title', title, 'description', short_description, 'item_kind', 'plan',
      'entitlement_code', code, 'quantity', 1, 'price_irt', coalesce(price_per_user_monthly, price_monthly),
      'billing_cycle', 'monthly', 'sort_order', sort_order,
      'metadata', jsonb_build_object('pricing_model', 'per_user', 'minimum_users', coalesce(minimum_users, 3), 'storage_gb', storage_gb))
    from public.saas_plans where is_active and is_public and coalesce(price_per_user_monthly, price_monthly) > 0
  ) items;
$$;

-- Keep plan orders price-authoritative and calculate the plan line from the
-- current active member count, while add-ons keep their existing behavior.
create or replace function public.create_current_saas_order(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid := public.current_org_id(); normalized_items jsonb := '[]'::jsonb;
  entry record; catalog public.saas_catalog_items%rowtype; plan public.saas_plans%rowtype;
  qty numeric; entitlement_quantity numeric; line_total numeric; total numeric := 0; order_id uuid; billable_users integer;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if not exists (select 1 from public.user_organization_memberships where user_id = auth.uid() and org_id = v_org_id and is_active and (is_owner or software_role = 'admin')) then raise exception 'organization_admin_required'; end if;
  if not exists (select 1 from public.saas_org_settings where org_id = v_org_id) then raise exception 'saas_org_not_found'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'order_items_required'; end if;
  billable_users := public.saas_billable_user_count(v_org_id);
  for entry in select value from jsonb_array_elements(p_items) loop
    qty := greatest(1, least(coalesce((entry.value ->> 'quantity')::numeric, 1), 1000));
    if left(coalesce(entry.value ->> 'code', ''), 5) = 'plan:' then
      select * into plan from public.saas_plans where code = substr(entry.value ->> 'code', 6) and is_active and is_public;
      if plan.id is null or coalesce(plan.price_per_user_monthly, plan.price_monthly) <= 0 then raise exception 'catalog_item_not_available'; end if;
      line_total := billable_users * coalesce(plan.price_per_user_monthly, plan.price_monthly);
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object('code','plan:' || plan.code,'title',plan.title,'item_kind','plan','entitlement_code',plan.code,'quantity',1,'purchase_quantity',billable_users,'unit_price_irt',coalesce(plan.price_per_user_monthly, plan.price_monthly),'line_total_irt',line_total,'metadata',jsonb_build_object('billable_users',billable_users,'pricing_model','per_user')));
      total := total + line_total;
    else
      select * into catalog from public.saas_catalog_items where code = entry.value ->> 'code' and is_active and is_public and price_irt > 0;
      if catalog.id is null then raise exception 'catalog_item_not_available'; end if;
      entitlement_quantity := qty * catalog.quantity; line_total := qty * catalog.price_irt;
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object('code',catalog.code,'title',catalog.title,'item_kind',catalog.item_kind,'entitlement_code',catalog.entitlement_code,'quantity',entitlement_quantity,'purchase_quantity',qty,'unit_price_irt',catalog.price_irt,'line_total_irt',line_total,'billing_cycle',catalog.billing_cycle,'metadata',catalog.metadata));
      total := total + line_total;
    end if;
  end loop;
  insert into public.saas_orders (org_id, created_by, total_irt, items) values (v_org_id, auth.uid(), total, normalized_items) returning id into order_id;
  return jsonb_build_object('success', true, 'order_id', order_id, 'total_irt', total, 'items', normalized_items);
end; $$;

create or replace function public.admin_create_saas_order(p_org_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare entry record; catalog public.saas_catalog_items%rowtype; plan public.saas_plans%rowtype; normalized_items jsonb:='[]'::jsonb; qty numeric; entitlement_quantity numeric; line_total numeric; total numeric:=0; order_id uuid; billable_users integer;
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then raise exception 'permission denied'; end if;
  if p_org_id is null or not exists(select 1 from public.saas_org_settings where org_id=p_org_id) then raise exception 'saas_org_not_found'; end if;
  if public.org_is_saas_admin(p_org_id) then raise exception 'saas_admin_target_not_allowed'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'order_items_required'; end if;
  billable_users := public.saas_billable_user_count(p_org_id);
  for entry in select value from jsonb_array_elements(p_items) loop
    qty:=greatest(1,least(coalesce((entry.value ->> 'quantity')::numeric,1),1000));
    if left(coalesce(entry.value ->> 'code',''),5)='plan:' then
      select * into plan from public.saas_plans where code=substr(entry.value ->> 'code',6) and is_active and is_public;
      if plan.id is null or coalesce(plan.price_per_user_monthly, plan.price_monthly)<=0 then raise exception 'catalog_item_not_available'; end if;
      line_total:=billable_users*coalesce(plan.price_per_user_monthly,plan.price_monthly);
      normalized_items:=normalized_items||jsonb_build_array(jsonb_build_object('code','plan:'||plan.code,'title',plan.title,'item_kind','plan','entitlement_code',plan.code,'quantity',1,'purchase_quantity',billable_users,'unit_price_irt',coalesce(plan.price_per_user_monthly,plan.price_monthly),'line_total_irt',line_total,'metadata',jsonb_build_object('billable_users',billable_users,'pricing_model','per_user'))); total:=total+line_total;
    else
      select * into catalog from public.saas_catalog_items where code=entry.value ->> 'code' and is_active and is_public and price_irt>0;
      if catalog.id is null then raise exception 'catalog_item_not_available'; end if;
      entitlement_quantity:=qty*catalog.quantity; line_total:=qty*catalog.price_irt;
      normalized_items:=normalized_items||jsonb_build_array(jsonb_build_object('code',catalog.code,'title',catalog.title,'item_kind',catalog.item_kind,'entitlement_code',catalog.entitlement_code,'quantity',entitlement_quantity,'purchase_quantity',qty,'unit_price_irt',catalog.price_irt,'line_total_irt',line_total,'billing_cycle',catalog.billing_cycle,'metadata',catalog.metadata)); total:=total+line_total;
    end if;
  end loop;
  insert into public.saas_orders(org_id,created_by,total_irt,items,metadata) values(p_org_id,auth.uid(),total,normalized_items,jsonb_build_object('source','saas_admin_cart','created_by_admin',auth.uid())) returning id into order_id;
  return jsonb_build_object('success',true,'order_id',order_id,'status','pending_payment','total_irt',total,'items',normalized_items);
end; $$;

create or replace function public.saas_account_overview_payload(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  settings_row public.saas_org_settings%rowtype;
  plan_row public.saas_plans%rowtype;
  enabled_modules jsonb; enabled_features jsonb; quotas jsonb; plan_quotas jsonb := '{}'::jsonb;
  member_count integer; ai_wallet jsonb; billing_wallet jsonb; instagram_count integer;
  is_saas_admin_org boolean := false; history_rows jsonb; billable_users integer; monthly_total numeric;
begin
  select * into settings_row from public.saas_org_settings where org_id = p_org_id;
  if settings_row.org_id is null then return jsonb_build_object('is_saas_org', false); end if;
  is_saas_admin_org := public.org_is_saas_admin(p_org_id);
  select * into plan_row from public.saas_plans where lower(code) = lower(coalesce(settings_row.plan_code, '')) limit 1;
  plan_quotas := coalesce(plan_row.included_quotas, '{}'::jsonb);
  select coalesce(jsonb_object_agg(code, enabled), '{}'::jsonb) into enabled_modules from (
    select key as code, lower(value #>> '{}') in ('true','1','yes','on') as enabled from jsonb_each(coalesce(plan_row.enabled_modules, '{}'::jsonb))
    union all select entitlement_code, state = 'enabled' from public.saas_org_entitlements where org_id = p_org_id and item_kind = 'module' and state <> 'expired' and (expires_at is null or expires_at > now())
  ) source;
  enabled_modules := enabled_modules || coalesce(settings_row.module_overrides, '{}'::jsonb);
  select coalesce(jsonb_object_agg(code, enabled), '{}'::jsonb) into enabled_features from (
    select key as code, lower(value #>> '{}') in ('true','1','yes','on') as enabled from jsonb_each(coalesce(plan_row.enabled_features, '{}'::jsonb))
    union all select entitlement_code, state = 'enabled' from public.saas_org_entitlements where org_id = p_org_id and item_kind = 'feature' and state <> 'expired' and (expires_at is null or expires_at > now())
  ) source;
  enabled_features := enabled_features || coalesce(settings_row.feature_overrides, '{}'::jsonb);
  select coalesce(jsonb_object_agg(entitlement_code, total), '{}'::jsonb) into quotas from (
    select entitlement_code, sum(case when state = 'enabled' then quantity else 0 end) as total from public.saas_org_entitlements where org_id = p_org_id and item_kind = 'quota' and state <> 'expired' and (expires_at is null or expires_at > now()) group by entitlement_code
  ) source;
  select count(*) into member_count from public.user_organization_memberships where org_id = p_org_id and is_active;
  billable_users := public.saas_billable_user_count(p_org_id);
  monthly_total := public.saas_plan_monthly_total(plan_row.code, p_org_id);
  select to_jsonb(wallet) into ai_wallet from public.org_ai_wallets wallet where wallet.org_id = p_org_id;
  select to_jsonb(wallet) into billing_wallet from public.org_billing_wallets wallet where wallet.org_id = p_org_id;
  select count(*) into instagram_count from public.instagram_accounts where org_id = p_org_id and is_active;
  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb) into history_rows from (
    select jsonb_build_object('kind','order','title','خرید حساب','status',status,'amount_irt',total_irt,'created_at',created_at) row_data, created_at from public.saas_orders where org_id=p_org_id
    union all select jsonb_build_object('kind','demo','title','دریافت نسخه دمو','status','completed','amount_irt',0,'created_at',issued_at), issued_at from public.saas_demo_issuance where org_id=p_org_id
    union all select jsonb_build_object('kind','admin_adjustment','title',title,'status',status,'amount_irt',amount_irt,'created_at',created_at,'metadata',metadata), created_at from public.saas_account_admin_history where org_id=p_org_id
    union all select jsonb_build_object('kind','wallet','title',coalesce(description,'تغییر کیف پول'),'status','completed','amount_irt',amount_irt,'created_at',created_at), created_at from public.org_billing_wallet_transactions where org_id=p_org_id
  ) history;
  return jsonb_build_object(
    'is_saas_org', true,
    'organization', jsonb_build_object('name',(select name from public.organizations where id=p_org_id),'status',settings_row.status,'is_demo',settings_row.is_demo,'trial_ends_at',settings_row.trial_ends_at,'billing_readonly',settings_row.billing_readonly),
    'plan', jsonb_build_object('code',plan_row.code,'title',plan_row.title,'description',plan_row.description,'short_description',plan_row.short_description,'display_features',plan_row.display_features,'enabled_modules',plan_row.enabled_modules,'enabled_features',plan_row.enabled_features,'price_monthly',coalesce(plan_row.price_per_user_monthly,plan_row.price_monthly),'price_per_user_monthly',coalesce(plan_row.price_per_user_monthly,plan_row.price_monthly),'included_users',coalesce(plan_row.minimum_users,3),'minimum_users',coalesce(plan_row.minimum_users,3),'max_users',plan_row.max_users,'storage_gb',plan_row.storage_gb,'included_quotas',plan_row.included_quotas),
    'access', jsonb_build_object('modules',enabled_modules,'features',enabled_features,'full_access',is_saas_admin_org),
    'management', jsonb_build_object('plan_code',settings_row.plan_code,'module_overrides',settings_row.module_overrides,'feature_overrides',settings_row.feature_overrides,'quota_adjustments',quotas),
    'quotas', jsonb_build_object('users_used',member_count,'users_included',coalesce(plan_row.minimum_users,3),'users_extra',coalesce((quotas->>'users')::numeric,0),'users_billable',billable_users,'monthly_total_irt',monthly_total,'storage_gb',case when is_saas_admin_org then null else coalesce(plan_row.storage_gb,0)+coalesce((quotas->>'storage_gb')::numeric,0) end,'scheduled_runs',coalesce((plan_quotas->>'scheduled_runs')::numeric,0)+coalesce((quotas->>'scheduled_runs')::numeric,0),'active_workflows',coalesce((plan_quotas->>'active_workflows')::numeric,0)+coalesce((quotas->>'active_workflows')::numeric,0),'sms_credit',coalesce((quotas->>'sms_credit')::numeric,0),'instagram_accounts_used',instagram_count,'instagram_accounts',coalesce((quotas->>'instagram_accounts')::numeric,0)),
    'ai_wallet',coalesce(ai_wallet,'{}'::jsonb),'billing_wallet',coalesce(billing_wallet,'{}'::jsonb),'history',history_rows
  );
end; $$;

create or replace function public.run_saas_billing_cycle(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare subscription_row record; invoice_row record; created_count integer := 0; paid_count integer := 0; expired_count integer := 0; payment_result jsonb; refreshed_amount numeric;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  for subscription_row in
    select * from public.saas_recurring_subscriptions
    where status in ('active', 'grace') and next_invoice_at <= now()
      and not public.org_is_saas_admin(org_id)
    order by next_invoice_at asc limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    if subscription_row.item_kind = 'plan' then
      refreshed_amount := public.saas_plan_monthly_total(subscription_row.entitlement_code, subscription_row.org_id);
      update public.saas_recurring_subscriptions set amount_irt = coalesce(refreshed_amount, amount_irt), updated_at = now() where id = subscription_row.id;
      subscription_row.amount_irt := coalesce(refreshed_amount, subscription_row.amount_irt);
    end if;
    insert into public.saas_subscription_invoices(org_id, subscription_id, status, period_starts_at, period_ends_at, due_at, grace_ends_at, total_irt, metadata)
    values (subscription_row.org_id, subscription_row.id, 'issued', subscription_row.current_period_ends_at, subscription_row.current_period_ends_at + interval '30 days', subscription_row.current_period_ends_at, subscription_row.current_period_ends_at + interval '3 days', subscription_row.amount_irt, jsonb_build_object('source', 'recurring_billing', 'pricing_model', case when subscription_row.item_kind = 'plan' then 'per_user' else 'catalog' end))
    on conflict (subscription_id, period_starts_at) do nothing;
    if found then created_count := created_count + 1; end if;
    update public.saas_recurring_subscriptions set next_invoice_at = current_period_ends_at + interval '1 year', updated_at = now() where id = subscription_row.id;
  end loop;
  for invoice_row in
    select id from public.saas_subscription_invoices
    where status = 'issued' and total_irt > 0 and (last_payment_attempt_at is null or last_payment_attempt_at < now() - interval '1 hour')
      and not public.org_is_saas_admin(org_id)
    order by due_at asc limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    payment_result := public.pay_saas_subscription_invoice_from_wallet_internal(invoice_row.id);
    if coalesce((payment_result ->> 'success')::boolean, false) then paid_count := paid_count + 1; end if;
  end loop;
  update public.saas_subscription_invoices set status = 'overdue', updated_at = now() where status = 'issued' and grace_ends_at < now() and not public.org_is_saas_admin(org_id);
  update public.saas_recurring_subscriptions subscription set status = 'expired', updated_at = now()
  from public.saas_subscription_invoices invoice where invoice.subscription_id = subscription.id and invoice.status = 'overdue' and subscription.status in ('active', 'grace') and not public.org_is_saas_admin(subscription.org_id);
  get diagnostics expired_count = row_count;
  update public.saas_org_settings settings set billing_readonly = true, billing_readonly_at = now(), updated_at = now()
  where exists (select 1 from public.saas_recurring_subscriptions subscription where subscription.org_id = settings.org_id and subscription.item_kind = 'plan' and subscription.status = 'expired') and not settings.is_billing_provider and not public.org_is_saas_admin(settings.org_id);
  for subscription_row in select id from public.saas_recurring_subscriptions where status = 'expired' and item_kind <> 'plan' and not public.org_is_saas_admin(org_id) loop perform public.refresh_saas_subscription_entitlement(subscription_row.id); end loop;
  return jsonb_build_object('success', true, 'invoices_created', created_count, 'invoices_paid_from_wallet', paid_count, 'subscriptions_expired', expired_count);
end; $$;

update public.saas_recurring_subscriptions subscription
set amount_irt = coalesce(public.saas_plan_monthly_total(subscription.entitlement_code, subscription.org_id), subscription.amount_irt),
    updated_at = now()
where subscription.item_kind = 'plan'
  and subscription.status in ('active', 'grace')
  and not public.org_is_saas_admin(subscription.org_id);

revoke all on function public.saas_billable_user_count(uuid), public.saas_plan_monthly_total(text,uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
