-- =====================================================
-- TazeSystem - Phase 520: approved SaaS bundle catalog pricing
-- Additive / idempotent. Prices are in IRT (تومان).
-- Bundles are shown as one catalog item and expand to their real
-- module/feature entitlements only inside the trusted activation function.
-- =====================================================

begin;

alter table public.saas_catalog_items
  drop constraint if exists saas_catalog_items_item_kind_check;
alter table public.saas_catalog_items
  add constraint saas_catalog_items_item_kind_check
  check (item_kind in ('module', 'feature', 'quota', 'bundle'));

alter table public.saas_recurring_subscriptions
  drop constraint if exists saas_recurring_subscriptions_item_kind_check;
alter table public.saas_recurring_subscriptions
  add constraint saas_recurring_subscriptions_item_kind_check
  check (item_kind in ('plan', 'module', 'feature', 'quota', 'bundle'));

-- Bundles are the only priced add-ons.  Base-plan capabilities, AI base
-- access, and SMS wallet funding are intentionally not catalog rows here.
insert into public.saas_catalog_items
  (code, title, description, item_kind, entitlement_code, quantity, price_irt,
   billing_cycle, is_active, is_public, sort_order, metadata)
values
('bundle:workflow_operations', 'بسته عملیات و فرآیند', 'پروژه، فعالیت پروژه‌ای، فرآیند، اتوماسیون و گزارش اجرای آن‌ها', 'bundle', 'bundle:workflow_operations', 1, 1490000, 'monthly', true, true, 10,
 jsonb_build_object('included_items', jsonb_build_array(
   jsonb_build_object('item_kind','module','entitlement_code','projects','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','tasks','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','process_templates','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','process_runs','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','automation_execution_reports','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','multi_lane_processes','quantity',1)
 ))) ,
('bundle:hr_complete', 'بسته منابع انسانی کامل', 'حضور، مرخصی، حقوق، قرارداد، استخدام و دستورالعمل‌های منابع انسانی', 'bundle', 'bundle:hr_complete', 1, 1250000, 'monthly', true, true, 20,
 jsonb_build_object('included_items', jsonb_build_array(
   jsonb_build_object('item_kind','module','entitlement_code','employees','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','attendance_logs','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','work_schedules','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','leave_requests','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','overtime_requests','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','mission_requests','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','employee_advances','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','payroll_slips','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','employee_contracts','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','recruitment_applicants','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','employee_bonus_requests','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','employee_penalty_requests','quantity',1)
 ))) ,
('bundle:accounting_full', 'حسابداری یکپارچه', 'حسابداری کامل، نقد و بانک، دارایی و سامانه مودیان', 'bundle', 'bundle:accounting_full', 1, 1790000, 'monthly', true, true, 30,
 jsonb_build_object('included_items', jsonb_build_array(
   jsonb_build_object('item_kind','module','entitlement_code','chart_of_accounts','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','journal_entries','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','petty_funds','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','barters','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','cash_bank_operations','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','accounting_event_rules','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','cost_centers','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','fiscal_years','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','assets','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','taxpayer_system','quantity',1)
 ))) ,
('bundle:production', 'بسته تولید', 'BOM، سفارش تولید و گردش کامل تولید', 'bundle', 'bundle:production', 1, 1590000, 'monthly', true, true, 40,
 jsonb_build_object('included_items', jsonb_build_array(
   jsonb_build_object('item_kind','module','entitlement_code','production_boms','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','production_orders','quantity',1)
 ))) ,
('bundle:marketing_analytics', 'بازاریابی و تحلیل بازار', 'نظرسنجی، تبلیغات محیطی، کمپین و گزارش ارتباطات', 'bundle', 'bundle:marketing_analytics', 1, 850000, 'monthly', true, true, 50,
 jsonb_build_object('included_items', jsonb_build_array(
   jsonb_build_object('item_kind','module','entitlement_code','surveys','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','billboards','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','advertising_campaigns','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','voip_call_reports','quantity',1),
   jsonb_build_object('item_kind','module','entitlement_code','sms_delivery_reports','quantity',1)
 ))) ,
('bundle:ai_organization', 'پنل AI سازمانی', 'تحلیل سند، جست‌وجوی وب، صدا، تصویر، ویدئو و استفاده از دانش سازمانی', 'bundle', 'bundle:ai_organization', 1, 1290000, 'monthly', true, true, 60,
 jsonb_build_object('included_items', jsonb_build_array(
   jsonb_build_object('item_kind','feature','entitlement_code','ai_chat','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','ai_knowledge','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','ai_document_analysis','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','ai_web_search','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','ai_voice_input','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','ai_voice_output','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','ai_image_generation','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','ai_video_generation','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','ai_deep_reasoning','quantity',1)
 ))) ,
('bundle:organization_knowledge', 'دانش سازمانی و بوم کسب‌وکار', 'دانش سازمانی، دستورالعمل‌ها و بوم کسب‌وکار', 'bundle', 'bundle:organization_knowledge', 1, 490000, 'monthly', true, true, 70,
 jsonb_build_object('included_items', jsonb_build_array(
   jsonb_build_object('item_kind','feature','entitlement_code','ai_knowledge','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','business_model_canvas','quantity',1)
 ))) ,
('bundle:reservations', 'رزرواسیون', 'مدیریت کامل رزرو، ظرفیت و تقویم رزرو', 'bundle', 'bundle:reservations', 1, 650000, 'monthly', true, true, 80,
 jsonb_build_object('included_items', jsonb_build_array(jsonb_build_object('item_kind','feature','entitlement_code','reservations','quantity',1)))) ,
('bundle:online_sales', 'فروش آنلاین', 'کاتالوگ آنلاین، فاکتور فروشگاهی، پرداخت آنلاین و درگاه اختصاصی', 'bundle', 'bundle:online_sales', 1, 850000, 'monthly', true, true, 90,
 jsonb_build_object('included_items', jsonb_build_array(
   jsonb_build_object('item_kind','feature','entitlement_code','online_catalog','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','retail_sales_invoice','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','online_invoice_payment','quantity',1),
   jsonb_build_object('item_kind','feature','entitlement_code','own_payment_gateway','quantity',1)
 ))) ,
('bundle:instagram_business', 'اینستاگرام کسب‌وکار', 'صندوق اینستاگرام و اتصال گفتگوها به فرآیندها', 'bundle', 'bundle:instagram_business', 1, 990000, 'monthly', true, true, 100,
 jsonb_build_object('included_items', jsonb_build_array(jsonb_build_object('item_kind','feature','entitlement_code','instagram_inbox','quantity',1)))) ,
('bundle:bale_bot', 'بات بله', 'اتصال، دریافت، ارسال، رسانه و اتصال بات بله به فرآیندها', 'bundle', 'bundle:bale_bot', 1, 350000, 'monthly', true, true, 110,
 jsonb_build_object('included_items', jsonb_build_array(jsonb_build_object('item_kind','feature','entitlement_code','bale_bot','quantity',1)))) ,
('bundle:rubika_bot', 'بات روبیکا', 'اتصال، دریافت، ارسال، رسانه و اتصال بات روبیکا به فرآیندها', 'bundle', 'bundle:rubika_bot', 1, 350000, 'monthly', true, true, 120,
 jsonb_build_object('included_items', jsonb_build_array(jsonb_build_object('item_kind','feature','entitlement_code','rubika_bot','quantity',1)))) ,
('bundle:advanced_reports', 'گزارش‌ساز پیشرفته', 'گزارش‌ساز و داشبورد مدیریتی پیشرفته', 'bundle', 'bundle:advanced_reports', 1, 650000, 'monthly', true, true, 130,
 jsonb_build_object('included_items', jsonb_build_array(jsonb_build_object('item_kind','feature','entitlement_code','advanced_reports','quantity',1)))) ,
('bundle:map', 'نقشه و موقعیت', 'نمایش نقشه و قابلیت‌های مکانی', 'bundle', 'bundle:map', 1, 350000, 'monthly', true, true, 140,
 jsonb_build_object('included_items', jsonb_build_array(jsonb_build_object('item_kind','feature','entitlement_code','map_view','quantity',1)))) ,
('bundle:white_label', 'حذف برند تازه سیستم', 'نمایش برند اختصاصی سازمان', 'bundle', 'bundle:white_label', 1, 1200000, 'monthly', true, true, 150,
 jsonb_build_object('included_items', jsonb_build_array(jsonb_build_object('item_kind','feature','entitlement_code','white_label','quantity',1)))) ,
('bundle:custom_domain', 'دامنه اختصاصی', 'اتصال دامنه اختصاصی سازمان', 'bundle', 'bundle:custom_domain', 1, 600000, 'monthly', true, true, 160,
 jsonb_build_object('included_items', jsonb_build_array(jsonb_build_object('item_kind','feature','entitlement_code','custom_domain','quantity',1))))
on conflict (code) do update set
  title = excluded.title, description = excluded.description, item_kind = excluded.item_kind,
  entitlement_code = excluded.entitlement_code, quantity = excluded.quantity,
  price_irt = excluded.price_irt, billing_cycle = excluded.billing_cycle,
  is_active = excluded.is_active, is_public = excluded.is_public,
  sort_order = excluded.sort_order, metadata = excluded.metadata, updated_at = now();

-- Telegram is intentionally disabled for now.
update public.saas_catalog_items set is_active = false, is_public = false, updated_at = now()
where code = 'bundle:telegram_bot';

-- Advanced reports are included in Growth and Enterprise; Standard may buy it.
update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb) || jsonb_build_object('advanced_reports', true),
    updated_at = now()
where code in ('cloud_growth', 'cloud_enterprise');

-- Keep the approved composite behavior visible in plan access maps.
update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb) || jsonb_build_object('ai', true, 'internal_realtime_notifications', true),
    updated_at = now()
where code in ('cloud_starter', 'cloud_growth', 'cloud_enterprise');

-- Existing catalog admin RPCs must accept a bundle while preserving metadata
-- when an existing bundle is edited from the simple catalog form.
create or replace function public.admin_upsert_saas_catalog_item(p_item jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text := lower(nullif(trim(coalesce(p_item ->> 'code', '')), ''));
  v_kind text := lower(nullif(trim(coalesce(p_item ->> 'item_kind', '')), ''));
  v_cycle text := lower(coalesce(nullif(trim(p_item ->> 'billing_cycle'), ''), 'one_time'));
  saved public.saas_catalog_items%rowtype;
  old_metadata jsonb;
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then raise exception 'permission denied'; end if;
  if v_code is null or v_code !~ '^[a-z0-9_:-]{3,80}$' then raise exception 'catalog_code_invalid'; end if;
  if v_kind not in ('module', 'feature', 'quota', 'bundle') then raise exception 'catalog_kind_invalid'; end if;
  if v_cycle not in ('one_time', 'monthly') then raise exception 'catalog_billing_cycle_invalid'; end if;
  select metadata into old_metadata from public.saas_catalog_items where code = v_code;
  if v_kind = 'bundle' and not (p_item ? 'metadata') and old_metadata is null then raise exception 'bundle_items_required'; end if;
  insert into public.saas_catalog_items(code, title, description, item_kind, entitlement_code, quantity, price_irt, billing_cycle, is_active, is_public, sort_order, metadata)
  values (v_code, nullif(trim(coalesce(p_item ->> 'title', '')), ''), nullif(trim(coalesce(p_item ->> 'description', '')), ''), v_kind, nullif(trim(coalesce(p_item ->> 'entitlement_code', '')), ''), greatest(coalesce((p_item ->> 'quantity')::numeric, 1), 1), greatest(coalesce((p_item ->> 'price_irt')::numeric, 0), 0), v_cycle, coalesce((p_item ->> 'is_active')::boolean, false), coalesce((p_item ->> 'is_public')::boolean, true), coalesce((p_item ->> 'sort_order')::integer, 100), case when p_item ? 'metadata' then coalesce(p_item -> 'metadata', '{}'::jsonb) else coalesce(old_metadata, '{}'::jsonb) end)
  on conflict (code) do update set title = excluded.title, description = excluded.description, item_kind = excluded.item_kind, entitlement_code = excluded.entitlement_code, quantity = excluded.quantity, price_irt = excluded.price_irt, billing_cycle = excluded.billing_cycle, is_active = excluded.is_active, is_public = excluded.is_public, sort_order = excluded.sort_order, metadata = excluded.metadata, updated_at = now()
  returning * into saved;
  if saved.title is null or saved.entitlement_code is null then raise exception 'catalog_title_and_entitlement_required'; end if;
  if saved.item_kind = 'bundle' and jsonb_array_length(coalesce(saved.metadata -> 'included_items', '[]'::jsonb)) = 0 then raise exception 'bundle_items_required'; end if;
  return to_jsonb(saved);
end; $$;

-- Keep the plan/catalog normalization price-authoritative while preserving
-- bundle metadata in the order snapshot.
create or replace function public.create_current_saas_order(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid := public.current_org_id(); normalized_items jsonb := '[]'::jsonb;
  entry record; catalog public.saas_catalog_items%rowtype; plan public.saas_plans%rowtype;
  qty numeric; entitlement_quantity numeric; line_total numeric; total numeric := 0; order_id uuid;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if not exists (select 1 from public.user_organization_memberships where user_id = auth.uid() and org_id = v_org_id and is_active and (is_owner or software_role = 'admin')) then raise exception 'organization_admin_required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'order_items_required'; end if;
  for entry in select value from jsonb_array_elements(p_items) loop
    qty := greatest(1, least(coalesce((entry.value ->> 'quantity')::numeric, 1), 1000));
    if left(coalesce(entry.value ->> 'code', ''), 5) = 'plan:' then
      select * into plan from public.saas_plans where code = substr(entry.value ->> 'code', 6) and is_active and is_public;
      if plan.id is null or plan.price_monthly <= 0 then raise exception 'catalog_item_not_available'; end if;
      line_total := plan.price_monthly;
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object('code','plan:' || plan.code,'title',plan.title,'item_kind','plan','entitlement_code',plan.code,'quantity',1,'purchase_quantity',1,'unit_price_irt',plan.price_monthly,'line_total_irt',line_total));
      total := total + line_total;
    else
      select * into catalog from public.saas_catalog_items where code = entry.value ->> 'code' and is_active and is_public and price_irt > 0;
      if catalog.id is null then raise exception 'catalog_item_not_available'; end if;
      entitlement_quantity := qty * catalog.quantity;
      line_total := qty * catalog.price_irt;
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object('code',catalog.code,'title',catalog.title,'item_kind',catalog.item_kind,'entitlement_code',catalog.entitlement_code,'quantity',entitlement_quantity,'purchase_quantity',qty,'unit_price_irt',catalog.price_irt,'line_total_irt',line_total,'billing_cycle',catalog.billing_cycle,'metadata',catalog.metadata));
      total := total + line_total;
    end if;
  end loop;
  insert into public.saas_orders (org_id, created_by, total_irt, items) values (v_org_id, auth.uid(), total, normalized_items) returning id into order_id;
  return jsonb_build_object('success', true, 'order_id', order_id, 'total_irt', total, 'items', normalized_items);
end; $$;

-- Bundle-aware activation and recurring subscription refresh.
create or replace function public.refresh_saas_subscription_entitlement(p_subscription_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare subscription_row public.saas_recurring_subscriptions%rowtype; entry record; item_state text;
begin
  select * into subscription_row from public.saas_recurring_subscriptions where id = p_subscription_id;
  if subscription_row.id is null or subscription_row.item_kind = 'plan' then return; end if;
  item_state := case when subscription_row.status in ('active', 'grace') then 'enabled' else 'expired' end;
  if subscription_row.item_kind = 'bundle' then
    for entry in select value from jsonb_array_elements(coalesce(subscription_row.metadata -> 'included_items', '[]'::jsonb)) loop
      update public.saas_org_entitlements set state=item_state, quantity=coalesce((entry.value ->> 'quantity')::numeric,1), expires_at=subscription_row.current_period_ends_at, metadata=metadata || jsonb_build_object('subscription_id',subscription_row.id), updated_at=now()
      where org_id=subscription_row.org_id and source='subscription' and item_kind=entry.value ->> 'item_kind' and entitlement_code=entry.value ->> 'entitlement_code'
        and metadata ->> 'subscription_id' = subscription_row.id::text;
      if not found then
        insert into public.saas_org_entitlements(org_id,item_kind,entitlement_code,quantity,state,source,expires_at,metadata)
        values(subscription_row.org_id,entry.value ->> 'item_kind',entry.value ->> 'entitlement_code',coalesce((entry.value ->> 'quantity')::numeric,1),item_state,'subscription',subscription_row.current_period_ends_at,jsonb_build_object('subscription_id',subscription_row.id));
      end if;
    end loop;
    return;
  end if;
  update public.saas_org_entitlements set state=item_state, quantity=subscription_row.quantity, expires_at=subscription_row.current_period_ends_at, metadata=metadata || jsonb_build_object('subscription_id',subscription_row.id), updated_at=now()
  where org_id=subscription_row.org_id and source='subscription' and item_kind=subscription_row.item_kind and entitlement_code=subscription_row.entitlement_code
    and metadata ->> 'subscription_id' = subscription_row.id::text;
  if not found then insert into public.saas_org_entitlements(org_id,item_kind,entitlement_code,quantity,state,source,expires_at,metadata) values(subscription_row.org_id,subscription_row.item_kind,subscription_row.entitlement_code,subscription_row.quantity,item_state,'subscription',subscription_row.current_period_ends_at,jsonb_build_object('subscription_id',subscription_row.id)); end if;
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
      update public.saas_org_settings set plan_code=entry.value ->> 'entitlement_code', status=case when status in ('draft','trial','demo') then 'active' else status end, billing_readonly=false, billing_readonly_at=null, updated_at=now() where org_id=order_row.org_id;
      update public.saas_recurring_subscriptions set status='cancelled', updated_at=now() where org_id=order_row.org_id and item_kind='plan' and status in ('active','grace');
      insert into public.saas_recurring_subscriptions(org_id,item_kind,source_code,entitlement_code,quantity,amount_irt,status,current_period_starts_at,current_period_ends_at,next_invoice_at,source_order_id,metadata) values(order_row.org_id,'plan','plan:'||(entry.value ->> 'entitlement_code'),entry.value ->> 'entitlement_code',1,greatest(coalesce((entry.value ->> 'line_total_irt')::numeric,(entry.value ->> 'unit_price_irt')::numeric,0),0),'active',now_at,now_at+interval '30 days',now_at+interval '23 days',order_row.id,jsonb_build_object('payment_method',p_payment_method,'payment_transaction_id',p_payment_transaction_id));
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

-- Admin-created orders need the same bundle metadata snapshot as tenant orders.
create or replace function public.admin_create_saas_order(p_org_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare entry record; catalog public.saas_catalog_items%rowtype; plan public.saas_plans%rowtype; normalized_items jsonb:='[]'::jsonb; qty numeric; entitlement_quantity numeric; line_total numeric; total numeric:=0; order_id uuid;
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then raise exception 'permission denied'; end if;
  if p_org_id is null or not exists(select 1 from public.saas_org_settings where org_id=p_org_id) then raise exception 'saas_org_not_found'; end if;
  if public.org_is_saas_admin(p_org_id) then raise exception 'saas_admin_target_not_allowed'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'order_items_required'; end if;
  for entry in select value from jsonb_array_elements(p_items) loop
    qty:=greatest(1,least(coalesce((entry.value ->> 'quantity')::numeric,1),1000));
    if left(coalesce(entry.value ->> 'code',''),5)='plan:' then
      select * into plan from public.saas_plans where code=substr(entry.value ->> 'code',6) and is_active and is_public;
      if plan.id is null or plan.price_monthly<=0 then raise exception 'catalog_item_not_available'; end if;
      line_total:=plan.price_monthly; normalized_items:=normalized_items || jsonb_build_array(jsonb_build_object('code','plan:'||plan.code,'title',plan.title,'item_kind','plan','entitlement_code',plan.code,'quantity',1,'purchase_quantity',1,'unit_price_irt',plan.price_monthly,'line_total_irt',line_total)); total:=total+line_total;
    else
      select * into catalog from public.saas_catalog_items where code=entry.value ->> 'code' and is_active and is_public and price_irt>0;
      if catalog.id is null then raise exception 'catalog_item_not_available'; end if;
      entitlement_quantity:=qty*catalog.quantity; line_total:=qty*catalog.price_irt;
      normalized_items:=normalized_items || jsonb_build_array(jsonb_build_object('code',catalog.code,'title',catalog.title,'item_kind',catalog.item_kind,'entitlement_code',catalog.entitlement_code,'quantity',entitlement_quantity,'purchase_quantity',qty,'unit_price_irt',catalog.price_irt,'line_total_irt',line_total,'billing_cycle',catalog.billing_cycle,'metadata',catalog.metadata)); total:=total+line_total;
    end if;
  end loop;
  insert into public.saas_orders(org_id,created_by,total_irt,items,metadata) values(p_org_id,auth.uid(),total,normalized_items,jsonb_build_object('source','saas_admin_cart','created_by_admin',auth.uid())) returning id into order_id;
  return jsonb_build_object('success',true,'order_id',order_id,'status','pending_payment','total_irt',total,'items',normalized_items);
end; $$;

-- Optional bundles are not additive to AI/SMS usage wallets. Their access is
-- controlled by the feature entitlement; usage is charged separately.
notify pgrst, 'reload schema';
commit;
