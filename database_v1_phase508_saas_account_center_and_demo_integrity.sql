-- =====================================================
-- KalamApp - Phase 508: SaaS account center and demo integrity
-- Date: 2026-09-15
-- Type: Additive / corrective / idempotent
-- =====================================================

begin;

-- Catalog items are purchasable add-ons. Plans remain in saas_plans because
-- they have their own public-pricing lifecycle.
create table if not exists public.saas_catalog_items (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null,
  description text,
  item_kind text not null check (item_kind in ('module', 'feature', 'quota')),
  entitlement_code text not null,
  quantity numeric not null default 1 check (quantity > 0),
  price_irt numeric not null default 0 check (price_irt >= 0),
  is_active boolean not null default false,
  is_public boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);

create index if not exists idx_saas_catalog_items_available
  on public.saas_catalog_items (is_active, is_public, sort_order);

create table if not exists public.saas_org_entitlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  item_kind text not null check (item_kind in ('module', 'feature', 'quota')),
  entitlement_code text not null,
  quantity numeric not null default 1 check (quantity >= 0),
  state text not null default 'enabled' check (state in ('enabled', 'disabled', 'expired')),
  source text not null check (source in ('purchase', 'admin_adjustment')),
  order_id uuid,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saas_org_entitlements_effective
  on public.saas_org_entitlements (org_id, item_kind, entitlement_code, state, expires_at);

create table if not exists public.saas_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'cancelled', 'failed')),
  currency text not null default 'IRT',
  total_irt numeric not null check (total_irt >= 0),
  items jsonb not null default '[]'::jsonb,
  payment_transaction_id uuid,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saas_orders_org_created
  on public.saas_orders (org_id, created_at desc);
create unique index if not exists idx_saas_orders_payment_transaction
  on public.saas_orders (payment_transaction_id)
  where payment_transaction_id is not null;

alter table public.saas_catalog_items enable row level security;
alter table public.saas_org_entitlements enable row level security;
alter table public.saas_orders enable row level security;

drop policy if exists p_saas_org_entitlements_org_read on public.saas_org_entitlements;
create policy p_saas_org_entitlements_org_read on public.saas_org_entitlements
for select to authenticated using (org_id = public.current_org_id());

drop policy if exists p_saas_orders_org_read on public.saas_orders;
create policy p_saas_orders_org_read on public.saas_orders
for select to authenticated using (org_id = public.current_org_id());

revoke all on public.saas_catalog_items, public.saas_org_entitlements, public.saas_orders from public, anon, authenticated;
grant select on public.saas_org_entitlements, public.saas_orders to authenticated;

alter table public.saas_org_settings
  add column if not exists is_billing_provider boolean not null default false;

-- سهمیه‌های پایهٔ هر پلن جدا از خریدهای اضافه نگهداری می‌شوند تا منطق مصرف
-- برای همهٔ مسیرها یکسان باشد.
alter table public.saas_plans
  add column if not exists included_quotas jsonb not null default '{}'::jsonb;

-- پرداخت سفارش حساب و شارژ کیف پول، نوع‌های مستقل تراکنش‌اند و باید از
-- همان ابتدا در قید دیتابیس شناخته شوند؛ در غیر این صورت درگاه موفق است
-- اما ثبت تراکنش پیش از رفتن به درگاه شکست می‌خورد.
alter table public.payment_transactions drop constraint if exists payment_transactions_purpose_check;
alter table public.payment_transactions add constraint payment_transactions_purpose_check
  check (purpose in (
    'online_invoice', 'online_account_card', 'saas_renewal', 'saas_account_order',
    'saas_billing_wallet_topup', 'ai_topup', 'sms_topup', 'extra_user', 'manual'
  ));

update public.saas_plans
set price_monthly = case lower(coalesce(code, ''))
      when 'cloud_starter' then 3490000
      when 'cloud_growth' then 7900000
      when 'cloud_enterprise' then 14900000
      else price_monthly
    end,
    price_yearly = case lower(coalesce(code, ''))
      when 'cloud_starter' then 34900000
      when 'cloud_growth' then 79000000
      when 'cloud_enterprise' then 149000000
      else price_yearly
    end,
    extra_user_price = case lower(coalesce(code, ''))
      when 'cloud_starter' then 490000
      when 'cloud_growth' then 690000
      when 'cloud_enterprise' then 890000
      else extra_user_price
    end,
    storage_gb = case lower(coalesce(code, ''))
      when 'cloud_starter' then 5
      when 'cloud_growth' then 20
      when 'cloud_enterprise' then 50
      when 'public_demo_full' then 5
      else storage_gb
    end,
    included_quotas = coalesce(included_quotas, '{}'::jsonb) || case lower(coalesce(code, ''))
      when 'cloud_starter' then '{"scheduled_runs":5,"active_workflows":50}'::jsonb
      when 'cloud_growth' then '{"scheduled_runs":10,"active_workflows":150}'::jsonb
      when 'cloud_enterprise' then '{"scheduled_runs":30,"active_workflows":500}'::jsonb
      when 'public_demo_full' then '{"scheduled_runs":5,"active_workflows":50}'::jsonb
      else '{}'::jsonb
    end,
    enabled_features = coalesce(enabled_features, '{}'::jsonb) || jsonb_build_object(
      'map_view', lower(coalesce(code, '')) in ('cloud_growth', 'cloud_enterprise', 'public_demo_full'),
      'internal_realtime_notifications', true
    ),
    updated_at = now()
where lower(coalesce(code, '')) in ('cloud_starter', 'cloud_growth', 'cloud_enterprise', 'public_demo_full');

-- اعتبار پرداخت، از اعتبار مصرف AI جداست: اولی برای تمام پرداخت‌های سازمان
-- استفاده می‌شود و دومی فقط هزینهٔ مدل‌های هوش مصنوعی را پوشش می‌دهد.
create table if not exists public.org_billing_wallets (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  balance_irt numeric not null default 0 check (balance_irt >= 0),
  status text not null default 'active' check (status in ('active', 'blocked')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_billing_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('topup', 'order_payment', 'ai_transfer', 'admin_adjustment', 'refund')),
  amount_irt numeric not null check (amount_irt <> 0),
  balance_after_irt numeric not null check (balance_after_irt >= 0),
  payment_transaction_id uuid references public.payment_transactions(id) on delete restrict,
  order_id uuid references public.saas_orders(id) on delete restrict,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_billing_wallet_transactions_payment_once
  on public.org_billing_wallet_transactions(payment_transaction_id)
  where payment_transaction_id is not null;
create unique index if not exists idx_billing_wallet_transactions_order_once
  on public.org_billing_wallet_transactions(order_id)
  where order_id is not null and kind = 'order_payment';
create index if not exists idx_billing_wallet_transactions_org_created
  on public.org_billing_wallet_transactions(org_id, created_at desc);

alter table public.org_billing_wallets enable row level security;
alter table public.org_billing_wallet_transactions enable row level security;
drop policy if exists p_org_billing_wallets_org_read on public.org_billing_wallets;
create policy p_org_billing_wallets_org_read on public.org_billing_wallets
for select to authenticated using (org_id = public.current_org_id());
drop policy if exists p_org_billing_wallet_transactions_org_read on public.org_billing_wallet_transactions;
create policy p_org_billing_wallet_transactions_org_read on public.org_billing_wallet_transactions
for select to authenticated using (org_id = public.current_org_id());
revoke all on public.org_billing_wallets, public.org_billing_wallet_transactions from public, anon, authenticated;
grant select on public.org_billing_wallets, public.org_billing_wallet_transactions to authenticated;

-- افزونه‌ها باید در همان بررسی مرکزی پلن اثر بگذارند؛ در غیر این صورت فقط در
-- کارت حساب دیده می‌شوند و مسیرهای واقعی برنامه آن‌ها را نادیده می‌گیرند.
create or replace function public.org_has_plan_feature(
  p_org_id uuid,
  p_feature_key text,
  p_default_enabled boolean default false
)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare v_plan_features jsonb := '{}'::jsonb; v_overrides jsonb := '{}'::jsonb; v_key text := nullif(btrim(coalesce(p_feature_key, '')), ''); v_raw text;
begin
  if p_org_id is null or v_key is null then return false; end if;
  if public.org_is_saas_admin(p_org_id) then return true; end if;
  select coalesce(plan.enabled_features, '{}'::jsonb), coalesce(settings.feature_overrides, '{}'::jsonb)
    into v_plan_features, v_overrides
    from public.saas_org_settings settings left join public.saas_plans plan on lower(plan.code) = lower(coalesce(settings.plan_code, ''))
    where settings.org_id = p_org_id limit 1;
  if v_overrides ? v_key then return lower(coalesce(v_overrides ->> v_key, 'false')) in ('true', '1', 'yes', 'on'); end if;
  if exists (select 1 from public.saas_org_entitlements e where e.org_id = p_org_id and e.item_kind = 'feature' and e.entitlement_code = v_key and e.state = 'disabled' and (e.expires_at is null or e.expires_at > now())) then return false; end if;
  if exists (select 1 from public.saas_org_entitlements e where e.org_id = p_org_id and e.item_kind = 'feature' and e.entitlement_code = v_key and e.state = 'enabled' and (e.expires_at is null or e.expires_at > now())) then return true; end if;
  v_raw := v_plan_features ->> v_key;
  if v_raw is null then return coalesce(p_default_enabled, false); end if;
  return lower(v_raw) in ('true', '1', 'yes', 'on');
end; $$;

create or replace function public.org_has_plan_module(
  p_org_id uuid,
  p_module_id text,
  p_default_enabled boolean default false
)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare v_plan_modules jsonb := '{}'::jsonb; v_overrides jsonb := '{}'::jsonb; v_key text := nullif(btrim(coalesce(p_module_id, '')), ''); v_raw text;
begin
  if p_org_id is null or v_key is null then return false; end if;
  if public.org_is_saas_admin(p_org_id) then return true; end if;
  select coalesce(plan.enabled_modules, '{}'::jsonb), coalesce(settings.module_overrides, '{}'::jsonb)
    into v_plan_modules, v_overrides
    from public.saas_org_settings settings left join public.saas_plans plan on lower(plan.code) = lower(coalesce(settings.plan_code, ''))
    where settings.org_id = p_org_id limit 1;
  if v_overrides ? v_key then return lower(coalesce(v_overrides ->> v_key, 'false')) in ('true', '1', 'yes', 'on'); end if;
  if exists (select 1 from public.saas_org_entitlements e where e.org_id = p_org_id and e.item_kind = 'module' and e.entitlement_code = v_key and e.state = 'disabled' and (e.expires_at is null or e.expires_at > now())) then return false; end if;
  if exists (select 1 from public.saas_org_entitlements e where e.org_id = p_org_id and e.item_kind = 'module' and e.entitlement_code = v_key and e.state = 'enabled' and (e.expires_at is null or e.expires_at > now())) then return true; end if;
  v_raw := v_plan_modules ->> v_key;
  if v_raw is null then return coalesce(p_default_enabled, false); end if;
  return lower(v_raw) in ('true', '1', 'yes', 'on');
end; $$;

revoke all on function public.org_has_plan_feature(uuid, text, boolean), public.org_has_plan_module(uuid, text, boolean) from public, anon;
grant execute on function public.org_has_plan_feature(uuid, text, boolean), public.org_has_plan_module(uuid, text, boolean) to service_role;

create or replace function public.apply_saas_billing_wallet_topup_payment_transaction(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tx public.payment_transactions%rowtype; wallet public.org_billing_wallets%rowtype; amount numeric;
begin
  select * into tx from public.payment_transactions where id = p_transaction_id for update;
  if tx.id is null or tx.purpose <> 'saas_billing_wallet_topup' or tx.status not in ('verified', 'paid') then raise exception 'payment_not_verified'; end if;
  if exists (select 1 from public.org_billing_wallet_transactions where payment_transaction_id = p_transaction_id) then return jsonb_build_object('success', true, 'already_applied', true); end if;
  amount := greatest(0, coalesce((tx.metadata ->> 'wallet_amount_irt')::numeric, tx.amount, 0));
  if amount <= 0 then raise exception 'wallet_topup_amount_invalid'; end if;
  insert into public.org_billing_wallets(org_id) values (tx.org_id) on conflict (org_id) do nothing;
  select * into wallet from public.org_billing_wallets where org_id = tx.org_id for update;
  if wallet.status <> 'active' then raise exception 'billing_wallet_blocked'; end if;
  update public.org_billing_wallets set balance_irt = balance_irt + amount, updated_at = now() where org_id = tx.org_id returning * into wallet;
  insert into public.org_billing_wallet_transactions(org_id, kind, amount_irt, balance_after_irt, payment_transaction_id, description, created_by)
  values (tx.org_id, 'topup', amount, wallet.balance_irt, tx.id, 'شارژ کیف پول سازمان', tx.created_by);
  return jsonb_build_object('success', true, 'balance_irt', wallet.balance_irt);
end; $$;

create or replace function public.prepare_current_saas_billing_wallet_topup(p_amount_irt numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.current_org_id(); amount numeric := greatest(0, coalesce(p_amount_irt, 0));
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if amount < 10000 or amount > 100000000 then raise exception 'wallet_topup_amount_invalid'; end if;
  if not exists (select 1 from public.user_organization_memberships m where m.user_id = auth.uid() and m.org_id = v_org_id and m.is_active and (m.is_owner or m.software_role = 'admin')) then raise exception 'organization_admin_required'; end if;
  if not exists (select 1 from public.saas_org_settings where org_id = v_org_id) then raise exception 'saas_org_not_found'; end if;
  return jsonb_build_object('success', true, 'org_id', v_org_id, 'amount_irt', amount);
end; $$;

create or replace function public.pay_current_saas_order_from_billing_wallet(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.current_org_id(); order_row public.saas_orders%rowtype; wallet public.org_billing_wallets%rowtype; entry record;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if not exists (select 1 from public.user_organization_memberships m where m.user_id = auth.uid() and m.org_id = v_org_id and m.is_active and (m.is_owner or m.software_role = 'admin')) then raise exception 'organization_admin_required'; end if;
  select * into order_row from public.saas_orders where id = p_order_id and org_id = v_org_id for update;
  if order_row.id is null then raise exception 'saas_order_not_found'; end if;
  if order_row.status = 'paid' then return jsonb_build_object('success', true, 'already_applied', true); end if;
  if order_row.status <> 'pending_payment' then raise exception 'saas_order_not_payable'; end if;
  insert into public.org_billing_wallets(org_id) values (v_org_id) on conflict (org_id) do nothing;
  select * into wallet from public.org_billing_wallets where org_id = v_org_id for update;
  if wallet.status <> 'active' then raise exception 'billing_wallet_blocked'; end if;
  if wallet.balance_irt < order_row.total_irt then raise exception 'billing_wallet_insufficient'; end if;
  update public.org_billing_wallets set balance_irt = balance_irt - order_row.total_irt, updated_at = now() where org_id = v_org_id returning * into wallet;
  insert into public.org_billing_wallet_transactions(org_id, kind, amount_irt, balance_after_irt, order_id, description, created_by)
  values (v_org_id, 'order_payment', -order_row.total_irt, wallet.balance_irt, order_row.id, 'پرداخت سفارش حساب از کیف پول', auth.uid());
  for entry in select value from jsonb_array_elements(order_row.items) loop
    if entry.value ->> 'item_kind' = 'plan' then
      update public.saas_org_settings set plan_code = entry.value ->> 'entitlement_code', status = case when status in ('draft', 'trial', 'demo') then 'active' else status end, updated_at = now() where org_id = v_org_id;
    else
      insert into public.saas_org_entitlements(org_id, item_kind, entitlement_code, quantity, state, source, order_id, created_by, metadata)
      values (v_org_id, entry.value ->> 'item_kind', entry.value ->> 'entitlement_code', coalesce((entry.value ->> 'quantity')::numeric, 1), 'enabled', 'purchase', order_row.id, auth.uid(), jsonb_build_object('payment_method', 'billing_wallet'));
    end if;
  end loop;
  update public.saas_orders set status = 'paid', paid_at = now(), metadata = metadata || jsonb_build_object('payment_method', 'billing_wallet'), updated_at = now() where id = order_row.id;
  return jsonb_build_object('success', true, 'order_id', order_row.id, 'balance_irt', wallet.balance_irt);
end; $$;

create or replace function public.transfer_current_billing_wallet_to_ai(p_amount_irt numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.current_org_id(); amount numeric := greatest(0, coalesce(p_amount_irt, 0)); wallet public.org_billing_wallets%rowtype;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if amount < 10000 or amount > 100000000 then raise exception 'wallet_transfer_amount_invalid'; end if;
  if not exists (select 1 from public.user_organization_memberships m where m.user_id = auth.uid() and m.org_id = v_org_id and m.is_active and (m.is_owner or m.software_role = 'admin')) then raise exception 'organization_admin_required'; end if;
  insert into public.org_billing_wallets(org_id) values (v_org_id) on conflict (org_id) do nothing;
  select * into wallet from public.org_billing_wallets where org_id = v_org_id for update;
  if wallet.status <> 'active' or wallet.balance_irt < amount then raise exception 'billing_wallet_insufficient'; end if;
  update public.org_billing_wallets set balance_irt = balance_irt - amount, updated_at = now() where org_id = v_org_id returning * into wallet;
  insert into public.org_billing_wallet_transactions(org_id, kind, amount_irt, balance_after_irt, description, created_by)
  values (v_org_id, 'ai_transfer', -amount, wallet.balance_irt, 'انتقال اعتبار به هوش مصنوعی', auth.uid());
  insert into public.org_ai_wallets(org_id, balance_irt, included_quota_irt, reserved_irt, status)
  values (v_org_id, amount, 0, 0, 'active')
  on conflict (org_id) do update set balance_irt = public.org_ai_wallets.balance_irt + excluded.balance_irt, status = 'active', updated_at = now();
  insert into public.org_ai_credit_grants(org_id, amount_irt, reason, granted_by, metadata)
  values (v_org_id, amount, 'انتقال از کیف پول سازمان', auth.uid(), jsonb_build_object('source', 'billing_wallet'));
  return jsonb_build_object('success', true, 'billing_wallet_balance_irt', wallet.balance_irt);
end; $$;

revoke all on function public.apply_saas_billing_wallet_topup_payment_transaction(uuid), public.prepare_current_saas_billing_wallet_topup(numeric), public.pay_current_saas_order_from_billing_wallet(uuid), public.transfer_current_billing_wallet_to_ai(numeric) from public, anon;
grant execute on function public.prepare_current_saas_billing_wallet_topup(numeric) to authenticated;
grant execute on function public.pay_current_saas_order_from_billing_wallet(uuid), public.transfer_current_billing_wallet_to_ai(numeric) to authenticated;
grant execute on function public.apply_saas_billing_wallet_topup_payment_transaction(uuid) to service_role;

-- Fill in historical demo owner data wherever the onboarding request or demo
-- issuance already contains a reliable identity.
update public.saas_org_settings settings
set owner_name = coalesce(nullif(trim(settings.owner_name), ''), source.owner_name),
    owner_email = coalesce(nullif(trim(settings.owner_email), ''), source.owner_email),
    updated_at = now()
from (
  select settings_source.org_id,
    coalesce(nullif(trim(request.full_name), ''), nullif(trim(profile.full_name), '')) as owner_name,
    coalesce(nullif(trim(request.owner_email), ''), nullif(trim(request.email), ''), nullif(trim(profile.email), '')) as owner_email
  from public.saas_org_settings settings_source
  left join public.saas_onboarding_requests request on request.id = settings_source.request_id
  left join public.saas_demo_issuance issuance on issuance.org_id = settings_source.org_id
  left join public.profiles profile on profile.id = issuance.auth_user_id
) source
where settings.org_id = source.org_id
  and (nullif(trim(settings.owner_name), '') is null or nullif(trim(settings.owner_email), '') is null);

-- Existing-member demo provisioning used memberships correctly but did not
-- persist the owner projection used by SaaS admin views.
create or replace function public.provision_self_service_demo_for_existing_member(
  p_full_name text, p_mobile text, p_business_name text, p_employee_count_band text,
  p_discovery_source text, p_requested_slug text, p_owner_email text default null,
  p_industry text default null, p_brand_palette_key text default 'kalam_sky'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  normalized_mobile text := public.normalize_demo_mobile(p_mobile);
  normalized_slug text := public.normalize_saas_slug(p_requested_slug);
  normalized_owner_email text := lower(nullif(trim(coalesce(p_owner_email, '')), ''));
  current_user_id uuid := auth.uid(); current_auth_mobile text;
  request_row public.saas_onboarding_requests%rowtype; target_plan public.saas_plans%rowtype;
  target_org_id uuid; admin_role_id uuid; existing_issuance_count integer := 0;
  effective_demo_limit integer := 0; target_trial_days integer := 15; display_business_name text;
begin
  if current_user_id is null then raise exception 'demo_auth_required'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'demo_full_name_required'; end if;
  if normalized_mobile is null then raise exception 'demo_mobile_invalid'; end if;
  if normalized_slug is null or length(normalized_slug) < 3 then raise exception 'demo_slug_invalid'; end if;
  if normalized_owner_email is null or normalized_owner_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'demo_owner_email_invalid'; end if;
  select public.normalize_demo_mobile(u.phone) into current_auth_mobile from auth.users u where u.id = current_user_id;
  if current_auth_mobile is distinct from normalized_mobile then raise exception 'demo_phone_session_mismatch'; end if;
  if not exists (select 1 from public.profiles p where p.id = current_user_id and coalesce(p.is_active, true)) then raise exception 'demo_member_profile_invalid'; end if;
  if not exists (select 1 from public.user_organization_memberships m where m.user_id = current_user_id and m.is_active) then raise exception 'demo_member_access_missing'; end if;
  if exists (select 1 from public.user_organization_memberships m where m.user_id = current_user_id and m.is_active and m.is_owner) then raise exception 'demo_owner_already_exists'; end if;
  if (public.check_saas_slug_availability(normalized_slug) ->> 'available')::boolean is false then raise exception 'slug_taken'; end if;

  insert into public.saas_onboarding_requests (auth_user_id, full_name, mobile, business_name, employee_count_band, discovery_source, requested_slug, owner_email, industry, brand_palette_key, status, is_demo_request)
  values (current_user_id, trim(p_full_name), normalized_mobile, nullif(trim(coalesce(p_business_name, '')), ''), nullif(trim(coalesce(p_employee_count_band, '')), ''), nullif(trim(coalesce(p_discovery_source, '')), ''), normalized_slug, normalized_owner_email, nullif(trim(coalesce(p_industry, '')), ''), coalesce(nullif(trim(p_brand_palette_key), ''), 'kalam_sky'), 'started', true)
  returning * into request_row;
  select count(*) into existing_issuance_count from public.saas_demo_issuance where mobile = normalized_mobile;
  effective_demo_limit := public.get_effective_demo_limit(normalized_mobile);
  if existing_issuance_count >= effective_demo_limit then raise exception 'demo_limit_reached'; end if;
  select * into target_plan from public.saas_plans where is_active and (is_demo_default or lower(code) = 'public_demo_full') order by is_demo_default desc, sort_order asc, created_at asc limit 1;
  if target_plan.id is null then raise exception 'demo_plan_missing'; end if;
  target_trial_days := greatest(coalesce(target_plan.trial_days, 15), 1);
  display_business_name := coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name));
  insert into public.organizations (name, slug, is_active) values (display_business_name, normalized_slug, true) returning id into target_org_id;
  insert into public.org_roles (org_id, title, permissions, is_system) values (target_org_id, 'ادمین', '{}'::jsonb, true) returning id into admin_role_id;
  insert into public.user_organization_memberships (user_id, org_id, role_id, software_role, is_owner, is_active) values (current_user_id, target_org_id, admin_role_id, 'admin', true, true);
  insert into public.saas_org_settings (org_id, slug, status, plan_code, trial_ends_at, is_demo, is_readonly, requested_subdomain, resolved_host, provisioning_source, dns_status, primary_contact_mobile, owner_name, owner_email, request_id, created_by, updated_by)
  values (target_org_id, normalized_slug, 'demo', target_plan.code, now() + make_interval(days => target_trial_days), true, false, normalized_slug, normalized_slug || '.tazesystem.ir', 'self_service', 'active', normalized_mobile, trim(p_full_name), normalized_owner_email, request_row.id, current_user_id, current_user_id);
  insert into public.saas_demo_issuance (mobile, auth_user_id, org_id, request_id, issued_by, issuance_mode) values (normalized_mobile, current_user_id, target_org_id, request_row.id, current_user_id, 'self_service');
  update public.company_settings set company_name = display_business_name, company_full_name = display_business_name, trade_name = display_business_name, ceo_name = trim(p_full_name), mobile = regexp_replace(normalized_mobile, '^\+98', '0'), email = normalized_owner_email, updated_by = current_user_id where org_id = target_org_id;
  if not found then
    insert into public.company_settings (org_id, company_name, company_full_name, trade_name, brand_palette_key, ceo_name, mobile, email, updated_by)
    values (target_org_id, display_business_name, display_business_name, display_business_name, coalesce(nullif(trim(p_brand_palette_key), ''), 'kalam_sky'), trim(p_full_name), regexp_replace(normalized_mobile, '^\+98', '0'), normalized_owner_email, current_user_id);
  end if;
  update public.saas_onboarding_requests set org_id = target_org_id, status = 'provisioned', approved_demo_count_snapshot = existing_issuance_count + 1, updated_at = now() where id = request_row.id;
  return jsonb_build_object('success', true, 'status', 'provisioned', 'request_id', request_row.id, 'org_id', target_org_id, 'slug', normalized_slug, 'redirect_host', normalized_slug || '.tazesystem.ir', 'plan_code', target_plan.code, 'trial_days', target_trial_days);
exception when others then
  if request_row.id is not null then update public.saas_onboarding_requests set status = 'failed', provision_attempts = provision_attempts + 1, failure_code = coalesce(failure_code, 'provision_error'), failure_message = SQLERRM, updated_at = now() where id = request_row.id; end if;
  raise;
end;
$$;

-- Owner membership is authoritative for a multi-organization identity.
create or replace view public.saas_admin_org_candidates_view
with (security_invoker = true) as
with owner_members as (
  select distinct on (membership.org_id) membership.org_id, profile.full_name, profile.email
  from public.user_organization_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.is_active and membership.is_owner
  order by membership.org_id, membership.created_at asc
)
select * from (
  select organization.id as id, 'org'::text as source_kind, organization.id as source_id, organization.id as org_id,
    settings.request_id, organization.name as org_name,
    coalesce(nullif(trim(settings.owner_name), ''), nullif(trim(owner.full_name), ''), nullif(trim(request.full_name), '')) as owner_name,
    coalesce(nullif(trim(settings.owner_email), ''), nullif(trim(owner.email), ''), nullif(trim(request.owner_email), ''), nullif(trim(request.email), '')) as owner_email,
    coalesce(nullif(trim(settings.primary_contact_mobile), ''), nullif(trim(request.mobile), '')) as primary_contact_mobile,
    settings.slug, settings.status, settings.plan_code, settings.is_demo, settings.is_readonly, settings.trial_ends_at, settings.resolved_host,
    settings.dns_status, settings.dns_last_error, settings.arvan_record_id, settings.dns_attempt_count, settings.provisioning_source,
    settings.created_at as provisioned_at, 'provisioned'::text as provision_state, request.industry, request.employee_count_band, request.discovery_source,
    '[]'::jsonb as tags, settings.process_template_id, coalesce(settings.execution_process_draft, '{}'::jsonb) as execution_process_draft,
    settings.created_at, settings.updated_at, null::uuid as created_by, null::uuid as updated_by, settings.assignee_type, settings.assignee_id, settings.assignee_role_id
  from public.saas_org_settings settings join public.organizations organization on organization.id = settings.org_id
  left join public.saas_onboarding_requests request on request.id = settings.request_id left join owner_members owner on owner.org_id = organization.id
  union all
  select request.id, 'request'::text, request.id, null::uuid, request.id,
    coalesce(nullif(trim(request.organization_name), ''), nullif(trim(request.business_name), ''), nullif(trim(request.full_name), ''), 'درخواست دمو'),
    nullif(trim(request.full_name), ''), coalesce(nullif(trim(request.owner_email), ''), nullif(trim(request.email), '')), nullif(trim(request.mobile), ''),
    nullif(public.normalize_saas_slug(request.requested_slug), ''), request.status, null::text, coalesce(request.is_demo_request, true), false,
    null::timestamptz, null::text, 'pending'::text, request.failure_message, null::text, 0, 'demo_request'::text, request.created_at,
    'request_pending'::text, request.industry, request.employee_count_band, request.discovery_source, coalesce(request.tags, '[]'::jsonb), request.process_template_id,
    coalesce(request.execution_process_draft, '{}'::jsonb), request.created_at, request.updated_at, null::uuid, null::uuid, request.assignee_type, request.assignee_id, request.assignee_role_id
  from public.saas_onboarding_requests request where request.org_id is null and not exists (select 1 from public.saas_org_settings settings where settings.request_id = request.id)
) candidate where public.current_user_has_saas_admin_permission();
grant select on public.saas_admin_org_candidates_view to authenticated;

-- The same source powers both the customer account UI and the SaaS admin UI.
create or replace function public.saas_account_overview_payload(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare settings_row public.saas_org_settings%rowtype; plan_row public.saas_plans%rowtype; enabled_modules jsonb; enabled_features jsonb; quotas jsonb; plan_quotas jsonb := '{}'::jsonb; member_count integer; ai_wallet jsonb; billing_wallet jsonb; instagram_count integer; is_saas_admin_org boolean := false;
begin
  select * into settings_row from public.saas_org_settings where org_id = p_org_id;
  if settings_row.org_id is null then return jsonb_build_object('is_saas_org', false); end if;
  is_saas_admin_org := public.org_is_saas_admin(p_org_id);
  select * into plan_row from public.saas_plans where lower(code) = lower(coalesce(settings_row.plan_code, '')) limit 1;
  plan_quotas := coalesce(plan_row.included_quotas, '{}'::jsonb);
  select coalesce(jsonb_object_agg(code, enabled), '{}'::jsonb) into enabled_modules from (
    select key as code, lower(value #>> '{}') in ('true', '1', 'yes', 'on') as enabled from jsonb_each(coalesce(plan_row.enabled_modules, '{}'::jsonb))
    union all select entitlement_code, state = 'enabled' from public.saas_org_entitlements where org_id = p_org_id and item_kind = 'module' and state <> 'expired' and (expires_at is null or expires_at > now())
  ) source;
  enabled_modules := enabled_modules || coalesce(settings_row.module_overrides, '{}'::jsonb);
  select coalesce(jsonb_object_agg(code, enabled), '{}'::jsonb) into enabled_features from (
    select key as code, lower(value #>> '{}') in ('true', '1', 'yes', 'on') as enabled from jsonb_each(coalesce(plan_row.enabled_features, '{}'::jsonb))
    union all select entitlement_code, state = 'enabled' from public.saas_org_entitlements where org_id = p_org_id and item_kind = 'feature' and state <> 'expired' and (expires_at is null or expires_at > now())
  ) source;
  enabled_features := enabled_features || coalesce(settings_row.feature_overrides, '{}'::jsonb);
  select coalesce(jsonb_object_agg(entitlement_code, total), '{}'::jsonb) into quotas from (
    select entitlement_code, sum(case when state = 'enabled' then quantity else 0 end) as total from public.saas_org_entitlements
    where org_id = p_org_id and item_kind = 'quota' and state <> 'expired' and (expires_at is null or expires_at > now()) group by entitlement_code
  ) source;
  select count(*) into member_count from public.user_organization_memberships where org_id = p_org_id and is_active;
  select to_jsonb(wallet) into ai_wallet from public.org_ai_wallets wallet where wallet.org_id = p_org_id;
  select to_jsonb(wallet) into billing_wallet from public.org_billing_wallets wallet where wallet.org_id = p_org_id;
  select count(*) into instagram_count from public.instagram_accounts where org_id = p_org_id and is_active;
  return jsonb_build_object(
    'is_saas_org', true,
    'organization', jsonb_build_object('name', (select name from public.organizations where id = p_org_id), 'status', settings_row.status, 'is_demo', settings_row.is_demo, 'trial_ends_at', settings_row.trial_ends_at),
    'plan', jsonb_build_object('code', plan_row.code, 'title', plan_row.title, 'price_monthly', plan_row.price_monthly, 'included_users', plan_row.included_users, 'max_users', plan_row.max_users, 'storage_gb', plan_row.storage_gb),
    'access', jsonb_build_object('modules', enabled_modules, 'features', enabled_features, 'full_access', is_saas_admin_org),
    'management', jsonb_build_object('plan_code', settings_row.plan_code, 'module_overrides', settings_row.module_overrides, 'feature_overrides', settings_row.feature_overrides, 'quota_adjustments', quotas),
    'quotas', jsonb_build_object('users_used', member_count, 'users_included', coalesce(plan_row.included_users, 0), 'users_extra', coalesce((quotas ->> 'users')::numeric, 0), 'storage_gb', coalesce(plan_row.storage_gb, 0) + coalesce((quotas ->> 'storage_gb')::numeric, 0), 'scheduled_runs', coalesce((plan_quotas ->> 'scheduled_runs')::numeric, 0) + coalesce((quotas ->> 'scheduled_runs')::numeric, 0), 'active_workflows', coalesce((plan_quotas ->> 'active_workflows')::numeric, 0) + coalesce((quotas ->> 'active_workflows')::numeric, 0), 'sms_credit', coalesce((quotas ->> 'sms_credit')::numeric, 0), 'instagram_accounts_used', instagram_count, 'instagram_accounts', coalesce((quotas ->> 'instagram_accounts')::numeric, 0)),
    'ai_wallet', coalesce(ai_wallet, '{}'::jsonb),
    'billing_wallet', coalesce(billing_wallet, '{}'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('kind', 'order', 'title', 'خرید حساب', 'status', status, 'amount_irt', total_irt, 'created_at', created_at) order by created_at desc) from (select * from public.saas_orders where org_id = p_org_id order by created_at desc limit 20) orders), '[]'::jsonb)
  );
end; $$;

create or replace function public.get_current_saas_account_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org_id uuid := public.current_org_id();
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  return public.saas_account_overview_payload(v_org_id);
end; $$;

create or replace function public.admin_get_saas_org_account(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.current_user_has_saas_admin_permission() then raise exception 'permission denied'; end if;
  return public.saas_account_overview_payload(p_org_id);
end; $$;

create or replace function public.admin_update_saas_org_account(
  p_org_id uuid, p_plan_code text, p_module_overrides jsonb default '{}'::jsonb, p_feature_overrides jsonb default '{}'::jsonb, p_quota_adjustments jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare entry record;
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then raise exception 'permission denied'; end if;
  if not exists (select 1 from public.saas_org_settings where org_id = p_org_id) then raise exception 'saas_org_not_found'; end if;
  if nullif(trim(coalesce(p_plan_code, '')), '') is not null and not exists (select 1 from public.saas_plans where lower(code) = lower(trim(p_plan_code)) and is_active) then raise exception 'plan_not_found'; end if;
  update public.saas_org_settings set plan_code = nullif(trim(p_plan_code), ''), module_overrides = coalesce(p_module_overrides, '{}'::jsonb), feature_overrides = coalesce(p_feature_overrides, '{}'::jsonb), updated_at = now(), updated_by = auth.uid() where org_id = p_org_id;
  delete from public.saas_org_entitlements where org_id = p_org_id and source = 'admin_adjustment' and item_kind = 'quota';
  for entry in select key, value from jsonb_each(coalesce(p_quota_adjustments, '{}'::jsonb)) loop
    if coalesce((entry.value #>> '{}')::numeric, 0) <> 0 then insert into public.saas_org_entitlements (org_id, item_kind, entitlement_code, quantity, state, source, created_by) values (p_org_id, 'quota', entry.key, greatest((entry.value #>> '{}')::numeric, 0), 'enabled', 'admin_adjustment', auth.uid()); end if;
  end loop;
  return public.saas_account_overview_payload(p_org_id);
end; $$;

create or replace function public.get_current_saas_store_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(item order by (item ->> 'sort_order')::int, item ->> 'title'), '[]'::jsonb) from (
    select jsonb_build_object('code', code, 'title', title, 'description', description, 'item_kind', item_kind, 'entitlement_code', entitlement_code, 'quantity', quantity, 'price_irt', price_irt, 'sort_order', sort_order, 'metadata', metadata) as item
    from public.saas_catalog_items where is_active and is_public and price_irt > 0
    union all
    select jsonb_build_object('code', 'plan:' || code, 'title', title, 'description', short_description, 'item_kind', 'plan', 'entitlement_code', code, 'quantity', 1, 'price_irt', price_monthly, 'sort_order', sort_order, 'metadata', jsonb_build_object('included_users', included_users, 'storage_gb', storage_gb))
    from public.saas_plans where is_active and is_public and price_monthly > 0
  ) items;
$$;

create or replace function public.admin_get_saas_catalog_items()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.current_user_has_saas_admin_permission() then coalesce(jsonb_agg(to_jsonb(item) order by item.sort_order, item.title), '[]'::jsonb) else '[]'::jsonb end
  from public.saas_catalog_items item;
$$;

create or replace function public.admin_upsert_saas_catalog_item(p_item jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := lower(nullif(trim(coalesce(p_item ->> 'code', '')), '')); v_kind text := lower(nullif(trim(coalesce(p_item ->> 'item_kind', '')), '')); saved public.saas_catalog_items%rowtype;
begin
  if not public.current_user_has_saas_admin_permission('edit_orgs') then raise exception 'permission denied'; end if;
  if v_code is null or v_code !~ '^[a-z0-9_:-]{3,80}$' then raise exception 'catalog_code_invalid'; end if;
  if v_kind not in ('module', 'feature', 'quota') then raise exception 'catalog_kind_invalid'; end if;
  insert into public.saas_catalog_items(code, title, description, item_kind, entitlement_code, quantity, price_irt, is_active, is_public, sort_order, metadata)
  values (v_code, nullif(trim(coalesce(p_item ->> 'title', '')), ''), nullif(trim(coalesce(p_item ->> 'description', '')), ''), v_kind, nullif(trim(coalesce(p_item ->> 'entitlement_code', '')), ''), greatest(coalesce((p_item ->> 'quantity')::numeric, 1), 1), greatest(coalesce((p_item ->> 'price_irt')::numeric, 0), 0), coalesce((p_item ->> 'is_active')::boolean, false), coalesce((p_item ->> 'is_public')::boolean, true), coalesce((p_item ->> 'sort_order')::integer, 100), coalesce(p_item -> 'metadata', '{}'::jsonb))
  on conflict (code) do update set title = excluded.title, description = excluded.description, item_kind = excluded.item_kind, entitlement_code = excluded.entitlement_code, quantity = excluded.quantity, price_irt = excluded.price_irt, is_active = excluded.is_active, is_public = excluded.is_public, sort_order = excluded.sort_order, metadata = excluded.metadata, updated_at = now()
  returning * into saved;
  if saved.title is null or saved.entitlement_code is null then raise exception 'catalog_title_and_entitlement_required'; end if;
  return to_jsonb(saved);
end; $$;

create or replace function public.create_current_saas_order(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.current_org_id(); normalized_items jsonb := '[]'::jsonb; entry record; catalog public.saas_catalog_items%rowtype; plan public.saas_plans%rowtype; qty numeric; total numeric := 0; order_id uuid;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'organization_access_denied'; end if;
  if not exists (select 1 from public.user_organization_memberships where user_id = auth.uid() and org_id = v_org_id and is_active and (is_owner or software_role = 'admin')) then raise exception 'organization_admin_required'; end if;
  if not exists (select 1 from public.saas_org_settings where org_id = v_org_id) then raise exception 'saas_org_not_found'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'order_items_required'; end if;
  for entry in select value from jsonb_array_elements(p_items) loop
    qty := greatest(1, least(coalesce((entry.value ->> 'quantity')::numeric, 1), 1000));
    if left(coalesce(entry.value ->> 'code', ''), 5) = 'plan:' then
      select * into plan from public.saas_plans where code = substr(entry.value ->> 'code', 6) and is_active and is_public;
      if plan.id is null or plan.price_monthly <= 0 then raise exception 'catalog_item_not_available'; end if;
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object('code', 'plan:' || plan.code, 'title', plan.title, 'item_kind', 'plan', 'entitlement_code', plan.code, 'quantity', 1, 'unit_price_irt', plan.price_monthly)); total := total + plan.price_monthly;
    else
      select * into catalog from public.saas_catalog_items where code = entry.value ->> 'code' and is_active and is_public and price_irt > 0;
      if catalog.id is null then raise exception 'catalog_item_not_available'; end if;
      normalized_items := normalized_items || jsonb_build_array(jsonb_build_object('code', catalog.code, 'title', catalog.title, 'item_kind', catalog.item_kind, 'entitlement_code', catalog.entitlement_code, 'quantity', qty * catalog.quantity, 'unit_price_irt', catalog.price_irt)); total := total + qty * catalog.price_irt;
    end if;
  end loop;
  insert into public.saas_orders (org_id, created_by, total_irt, items) values (v_org_id, auth.uid(), total, normalized_items) returning id into order_id;
  return jsonb_build_object('success', true, 'order_id', order_id, 'total_irt', total, 'items', normalized_items);
end; $$;

create or replace function public.apply_saas_order_payment_transaction(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tx public.payment_transactions%rowtype; order_row public.saas_orders%rowtype; entry record;
begin
  select * into tx from public.payment_transactions where id = p_transaction_id for update;
  if tx.id is null or tx.purpose <> 'saas_account_order' or tx.status not in ('verified', 'paid') then raise exception 'payment_not_verified'; end if;
  select * into order_row from public.saas_orders where id = (tx.metadata ->> 'saas_order_id')::uuid for update;
  if order_row.id is null or order_row.org_id <> tx.org_id then raise exception 'saas_order_not_found'; end if;
  if order_row.status = 'paid' then return jsonb_build_object('success', true, 'already_applied', true); end if;
  for entry in select value from jsonb_array_elements(order_row.items) loop
    if entry.value ->> 'item_kind' = 'plan' then update public.saas_org_settings set plan_code = entry.value ->> 'entitlement_code', status = case when status in ('draft', 'trial', 'demo') then 'active' else status end, updated_at = now() where org_id = order_row.org_id;
    else insert into public.saas_org_entitlements (org_id, item_kind, entitlement_code, quantity, state, source, order_id, created_by, metadata) values (order_row.org_id, entry.value ->> 'item_kind', entry.value ->> 'entitlement_code', coalesce((entry.value ->> 'quantity')::numeric, 1), 'enabled', 'purchase', order_row.id, order_row.created_by, jsonb_build_object('payment_transaction_id', p_transaction_id)); end if;
  end loop;
  update public.saas_orders set status = 'paid', payment_transaction_id = p_transaction_id, paid_at = now(), updated_at = now() where id = order_row.id;
  return jsonb_build_object('success', true, 'order_id', order_row.id);
end; $$;

create or replace function public.admin_bootstrap_taze_system_provider_org()
returns jsonb language plpgsql security definer set search_path = public as $$
declare provider_org_id uuid; provider_role_id uuid;
begin
  if not public.current_user_has_saas_admin_permission() then raise exception 'permission denied'; end if;
  select org_id into provider_org_id from public.saas_org_settings where is_billing_provider limit 1;
  -- اگر سازمان پنل قبلاً به‌صورت دستی ساخته شده باشد، همان سازمان را به
  -- سازمانِ ارائه‌دهنده ارتقا می‌دهیم؛ سازمان موازی ایجاد نمی‌کنیم.
  if provider_org_id is null then
    select org_id into provider_org_id
    from public.saas_org_settings
    where lower(coalesce(resolved_host, '')) = 'panel.tazesystem.ir'
       or lower(coalesce(slug, '')) = 'panel'
    order by created_at asc
    limit 1;
  end if;
  if provider_org_id is null then
    insert into public.organizations(name, slug, is_active) values ('تازه سیستم', 'panel', true) returning id into provider_org_id;
    insert into public.org_roles(org_id, title, permissions, is_system) values (provider_org_id, 'مدیر تازه سیستم', jsonb_build_object('__saas_admin', jsonb_build_object('view', true, 'edit', true, 'edit_orgs', true, 'edit_requests', true)), true) returning id into provider_role_id;
    insert into public.saas_org_settings(org_id, slug, resolved_host, status, plan_code, is_demo, is_readonly, provisioning_source, dns_status, is_billing_provider, owner_name, owner_email, created_by, updated_by)
    select provider_org_id, 'panel', 'panel.tazesystem.ir', 'active', null, false, false, 'saas_provider', 'active', true, p.full_name, p.email, auth.uid(), auth.uid() from public.profiles p where p.id = auth.uid();
  else
    update public.saas_org_settings
    set is_billing_provider = true, status = 'active', updated_at = now(), updated_by = auth.uid()
    where org_id = provider_org_id;
    select id into provider_role_id from public.org_roles where org_id = provider_org_id and coalesce((permissions -> '__saas_admin' ->> 'view')::boolean, false) limit 1;
    if provider_role_id is null then
      insert into public.org_roles(org_id, title, permissions, is_system)
      values (provider_org_id, 'مدیر تازه سیستم', jsonb_build_object('__saas_admin', jsonb_build_object('view', true, 'edit', true, 'edit_orgs', true, 'edit_requests', true)), true)
      returning id into provider_role_id;
    end if;
  end if;
  insert into public.user_organization_memberships(user_id, org_id, role_id, software_role, is_owner, is_active) values (auth.uid(), provider_org_id, provider_role_id, 'admin', false, true)
  on conflict (user_id, org_id) do update set role_id = excluded.role_id, software_role = excluded.software_role, is_active = true, updated_at = now();
  return jsonb_build_object('success', true, 'host', 'panel.tazesystem.ir');
end; $$;

revoke all on function public.saas_account_overview_payload(uuid) from public, anon, authenticated;
revoke all on function public.get_current_saas_account_overview() from public, anon;
grant execute on function public.get_current_saas_account_overview() to authenticated;
revoke all on function public.admin_get_saas_org_account(uuid), public.admin_update_saas_org_account(uuid, text, jsonb, jsonb, jsonb), public.admin_bootstrap_taze_system_provider_org() from public, anon;
grant execute on function public.admin_get_saas_org_account(uuid), public.admin_update_saas_org_account(uuid, text, jsonb, jsonb, jsonb), public.admin_bootstrap_taze_system_provider_org() to authenticated;
revoke all on function public.get_current_saas_store_catalog(), public.create_current_saas_order(jsonb) from public, anon;
grant execute on function public.get_current_saas_store_catalog(), public.create_current_saas_order(jsonb) to authenticated;
revoke all on function public.admin_get_saas_catalog_items(), public.admin_upsert_saas_catalog_item(jsonb) from public, anon;
grant execute on function public.admin_get_saas_catalog_items(), public.admin_upsert_saas_catalog_item(jsonb) to authenticated;
revoke all on function public.apply_saas_order_payment_transaction(uuid) from public, anon, authenticated;
grant execute on function public.apply_saas_order_payment_transaction(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
