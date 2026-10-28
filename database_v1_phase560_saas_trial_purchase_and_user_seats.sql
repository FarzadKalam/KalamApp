-- Phase 560: SaaS trial conversion and purchased user seats.
-- All functions are redefined idempotently; prices are calculated in the database.
begin;

create or replace function public.saas_billable_user_count(p_org_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(
    3,
    coalesce((select count(*)::integer from public.user_organization_memberships where org_id = p_org_id and is_active), 0),
    coalesce((select max(quantity)::integer from public.saas_recurring_subscriptions where org_id = p_org_id and item_kind = 'plan' and status in ('active', 'grace')), 0)
  );
$$;
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
      if qty >= 3 then
        select greatest(3, least(floor(qty)::integer, 1000), count(*)::integer)
          into billable_users
          from public.user_organization_memberships
          where org_id = v_org_id and is_active;
      end if;
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

create or replace function public.activate_saas_order_items(p_order_id uuid, p_payment_transaction_id uuid default null, p_payment_method text default 'online')
returns jsonb language plpgsql security definer set search_path = public as $$
declare order_row public.saas_orders%rowtype; entry record; inner_entry record; catalog_row public.saas_catalog_items%rowtype; subscription_row public.saas_recurring_subscriptions%rowtype; item_quantity numeric; item_amount numeric; cycle text; now_at timestamptz := now();
begin
  select * into order_row from public.saas_orders where id=p_order_id for update;
  if order_row.id is null then raise exception 'saas_order_not_found'; end if;
  if order_row.status='paid' then return jsonb_build_object('success',true,'already_applied',true); end if;
  for entry in select value from jsonb_array_elements(order_row.items) loop
    item_quantity := greatest(coalesce((entry.value ->> 'quantity')::numeric,1),1);
    if entry.value ->> 'item_kind' = 'plan' then
      update public.saas_org_settings set plan_code=entry.value ->> 'entitlement_code', is_readonly=case when is_demo then false else is_readonly end, is_demo=false, trial_ends_at=null, status=case when status in ('draft','trial','demo') then 'active' else status end, billing_readonly=false, billing_readonly_at=null, updated_at=now() where org_id=order_row.org_id;
      update public.saas_recurring_subscriptions set status='cancelled', updated_at=now() where org_id=order_row.org_id and item_kind='plan' and status in ('active','grace');
      insert into public.saas_recurring_subscriptions(org_id,item_kind,source_code,entitlement_code,quantity,amount_irt,status,current_period_starts_at,current_period_ends_at,next_invoice_at,source_order_id,metadata) values(order_row.org_id,'plan','plan:'||(entry.value ->> 'entitlement_code'),entry.value ->> 'entitlement_code',greatest(3,coalesce((entry.value -> 'metadata' ->> 'billable_users')::integer,1)),greatest(coalesce((entry.value ->> 'line_total_irt')::numeric,(entry.value ->> 'unit_price_irt')::numeric,0),0),'active',now_at,now_at+interval '30 days',now_at+interval '23 days',order_row.id,jsonb_build_object('payment_method',p_payment_method,'payment_transaction_id',p_payment_transaction_id));
    elsif entry.value ->> 'item_kind' = 'bundle' then
      select * into catalog_row from public.saas_catalog_items where code=entry.value ->> 'code' limit 1;
      cycle := coalesce(catalog_row.billing_cycle, entry.value ->> 'billing_cycle', 'one_time');
      if cycle='monthly' then
        select * into subscription_row from public.saas_recurring_subscriptions where org_id=order_row.org_id and item_kind='bundle' and source_code=entry.value ->> 'code' and status in ('active','grace') for update;
        if subscription_row.id is null then
          insert into public.saas_recurring_subscriptions(org_id,item_kind,source_code,entitlement_code,quantity,amount_irt,status,current_period_starts_at,current_period_ends_at,next_invoice_at,source_order_id,metadata) values(order_row.org_id,'bundle',entry.value ->> 'code',entry.value ->> 'entitlement_code',item_quantity,greatest(coalesce((entry.value ->> 'line_total_irt')::numeric,0),0),'active',now_at,now_at+interval '30 days',now_at+interval '23 days',order_row.id,coalesce(catalog_row.metadata,entry.value -> 'metadata','{}'::jsonb) || jsonb_build_object('payment_method',p_payment_method,'payment_transaction_id',p_payment_transaction_id)) returning * into subscription_row;
        else
          update public.saas_recurring_subscriptions set quantity=quantity+item_quantity, amount_irt=amount_irt+greatest(coalesce((entry.value ->> 'line_total_irt')::numeric,0),0), current_period_ends_at=greatest(current_period_ends_at,now_at+interval '30 days'), next_invoice_at=greatest(next_invoice_at,now_at+interval '23 days'), updated_at=now() where id=subscription_row.id returning * into subscription_row;
        end if;
        perform public.refresh_saas_subscription_entitlement(subscription_row.id);
      else
        for inner_entry in select value from jsonb_array_elements(coalesce(catalog_row.metadata -> 'included_items', entry.value -> 'metadata' -> 'included_items','[]'::jsonb)) loop
          insert into public.saas_org_entitlements(org_id,item_kind,entitlement_code,quantity,state,source,order_id,created_by,metadata) values(order_row.org_id,inner_entry.value ->> 'item_kind',inner_entry.value ->> 'entitlement_code',coalesce((inner_entry.value ->> 'quantity')::numeric,1),'enabled','purchase',order_row.id,order_row.created_by,jsonb_build_object('bundle_code',entry.value ->> 'code','payment_transaction_id',p_payment_transaction_id,'payment_method',p_payment_method));
        end loop;
      end if;
    else
      select * into catalog_row from public.saas_catalog_items where code=entry.value ->> 'code' limit 1;
      cycle := coalesce(catalog_row.billing_cycle,entry.value ->> 'billing_cycle','one_time');
      if cycle='monthly' then
        select * into subscription_row from public.saas_recurring_subscriptions where org_id=order_row.org_id and item_kind=entry.value ->> 'item_kind' and source_code=entry.value ->> 'code' and status in ('active','grace') for update;
        if subscription_row.id is null then
          insert into public.saas_recurring_subscriptions(org_id,item_kind,source_code,entitlement_code,quantity,amount_irt,status,current_period_starts_at,current_period_ends_at,next_invoice_at,source_order_id,metadata) values(order_row.org_id,entry.value ->> 'item_kind',entry.value ->> 'code',entry.value ->> 'entitlement_code',item_quantity,greatest(coalesce((entry.value ->> 'line_total_irt')::numeric,0),0),'active',now_at,now_at+interval '30 days',now_at+interval '23 days',order_row.id,jsonb_build_object('payment_method',p_payment_method,'payment_transaction_id',p_payment_transaction_id)) returning * into subscription_row;
        else update public.saas_recurring_subscriptions set quantity=quantity+item_quantity, amount_irt=amount_irt+greatest(coalesce((entry.value ->> 'line_total_irt')::numeric,0),0), current_period_ends_at=greatest(current_period_ends_at,now_at+interval '30 days'), next_invoice_at=greatest(next_invoice_at,now_at+interval '23 days'), updated_at=now() where id=subscription_row.id returning * into subscription_row; end if;
        perform public.refresh_saas_subscription_entitlement(subscription_row.id);
      else
        insert into public.saas_org_entitlements(org_id,item_kind,entitlement_code,quantity,state,source,order_id,created_by,metadata) values(order_row.org_id,entry.value ->> 'item_kind',entry.value ->> 'entitlement_code',item_quantity,'enabled','purchase',order_row.id,order_row.created_by,jsonb_build_object('payment_transaction_id',p_payment_transaction_id,'payment_method',p_payment_method));
      end if;
    end if;
  end loop;
  update public.saas_orders set status='paid', payment_transaction_id=coalesce(p_payment_transaction_id,payment_transaction_id), paid_at=now(), metadata=metadata || jsonb_build_object('payment_method',p_payment_method), updated_at=now() where id=order_row.id;
  return jsonb_build_object('success',true,'order_id',order_row.id);
end; $$;
-- Existing paid plans from expired demos may still carry the old trial flag.
update public.saas_org_settings settings
set is_demo = false, trial_ends_at = null, is_readonly = false,
    billing_readonly = false, billing_readonly_at = null, updated_at = now()
where settings.is_demo = true
  and settings.trial_ends_at < now()
  and exists (
    select 1 from public.saas_recurring_subscriptions subscription
    where subscription.org_id = settings.org_id and subscription.item_kind = 'plan'
      and subscription.status in ('active', 'grace')
  );

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
    'quotas', jsonb_build_object('users_used',member_count,'users_included',greatest(coalesce(plan_row.minimum_users,3),coalesce((select max(quantity)::integer from public.saas_recurring_subscriptions where org_id=p_org_id and item_kind='plan' and status in ('active','grace')),0)),'users_extra',coalesce((quotas->>'users')::numeric,0),'users_billable',billable_users,'monthly_total_irt',monthly_total,'storage_gb',case when is_saas_admin_org then null else coalesce(plan_row.storage_gb,0)+coalesce((quotas->>'storage_gb')::numeric,0) end,'scheduled_runs',coalesce((plan_quotas->>'scheduled_runs')::numeric,0)+coalesce((quotas->>'scheduled_runs')::numeric,0),'active_workflows',coalesce((plan_quotas->>'active_workflows')::numeric,0)+coalesce((quotas->>'active_workflows')::numeric,0),'sms_credit',coalesce((quotas->>'sms_credit')::numeric,0),'instagram_accounts_used',instagram_count,'instagram_accounts',coalesce((quotas->>'instagram_accounts')::numeric,0)),
    'ai_wallet',coalesce(ai_wallet,'{}'::jsonb),'billing_wallet',coalesce(billing_wallet,'{}'::jsonb),
    'subscription_invoices',case when is_saas_admin_org then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(invoice) order by invoice.due_at asc) from (select id,status,total_irt,due_at,grace_ends_at,paid_at,created_at from public.saas_subscription_invoices where org_id=p_org_id order by created_at desc limit 20) invoice),'[]'::jsonb) end,
    'history',history_rows
  );
end; $$;

-- Enforce read-only mode at the database boundary for tenant-owned records.
-- Commerce and SaaS account tables stay writable so an owner can pay and reactivate.
create or replace function public.enforce_saas_org_readonly()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_org uuid; settings_row record;
begin
  if auth.uid() is null or auth.role() = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    target_org := nullif(to_jsonb(old) ->> 'org_id', '')::uuid;
  else
    target_org := nullif(to_jsonb(new) ->> 'org_id', '')::uuid;
  end if;
  if target_org is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select is_readonly, billing_readonly, trial_ends_at into settings_row
  from public.saas_org_settings where org_id = target_org;
  if found and (settings_row.is_readonly or settings_row.billing_readonly
    or (settings_row.trial_ends_at is not null and settings_row.trial_ends_at < now()))
    and not public.org_is_saas_admin(target_org)
    and not public.current_user_has_saas_admin_permission('edit_orgs') then
    raise exception 'saas_readonly_subscription_required';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

do $$
declare target_table record;
begin
  for target_table in
    select c.oid, format('%I.%I', n.nspname, c.relname) as qualified_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id'
      and a.atttypid = 'uuid'::regtype and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
      and c.relname !~ '^(saas_|org_billing_|org_ai_|org_sms_|payment_|demo_seed_)'
      and c.relname not in ('app_schema_migrations', 'system_code_counters')
  loop
    if not exists (select 1 from pg_trigger where tgrelid = target_table.oid
      and tgname = 'enforce_saas_org_readonly' and not tgisinternal) then
      execute format('create trigger enforce_saas_org_readonly after insert or update or delete on %s for each row execute function public.enforce_saas_org_readonly()', target_table.qualified_name);
    end if;
  end loop;
end; $$;

notify pgrst, 'reload schema';
commit;
