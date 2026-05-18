-- =====================================================
-- KalamApp - Phase 147: Plan Pricing & Display
-- Date: 2026-05-15
-- Type: Additive / non-breaking migration
-- Goal: افزودن فیلدهای قیمت‌گذاری و نمایش به saas_plans
--       و seed کردن سه پلن پایه تازه سیستم
-- =====================================================

begin;

-- ------------------------------------
-- 1. افزودن فیلدهای قیمت‌گذاری
-- ------------------------------------

alter table public.saas_plans
  -- قیمت‌گذاری پایه (تومان)
  add column if not exists price_monthly       bigint not null default 0,
  add column if not exists price_yearly        bigint,             -- معمولاً با ~17% تخفیف
  add column if not exists included_users      integer not null default 5,
  add column if not exists extra_user_price    integer not null default 0,
  add column if not exists max_users           integer,            -- سقف کاربر (null = بی‌محدود)
  add column if not exists storage_gb          integer,            -- فضای ذخیره‌سازی (GB)

  -- قیمت‌گذاری ماژول‌ها برای محاسبه داخلی (نمایش نمی‌شه)
  -- ساختار: { "module_id": { "price": 500000, "label": "فاکتور" } }
  add column if not exists module_pricing      jsonb not null default '{}'::jsonb,

  -- نمایش در سایت
  add column if not exists highlight_tag       text,            -- مثل "پیشنهادی"
  add column if not exists short_description   text,            -- زیر عنوان پلن
  add column if not exists display_features    jsonb not null default '[]'::jsonb,
                                                                -- آرایه‌ای از رشته‌ها برای بولت‌های سایت

  -- قیمت سفارشی نهایی برای custom plans (اگه null باشه از price_monthly استفاده بشه)
  add column if not exists custom_price_label  text;            -- مثل "تماس بگیرید" یا "از X تومان"

-- ------------------------------------
-- 2. seed: سه پلن پایه عمومی
-- ------------------------------------

-- پلن ابری شروع
insert into public.saas_plans (
  code, title, description, is_active, is_public, is_demo_default,
  trial_days, sort_order,
  price_monthly, price_yearly, included_users, extra_user_price, max_users, storage_gb,
  highlight_tag, short_description,
  display_features,
  enabled_modules, enabled_features
)
values (
  'cloud_starter',
  'ابری شروع',
  'برای شروع نظم فروش، مشتری و پروژه',
  true, true, true,
  15, 10,
  2900000, 29000000, 5, 350000, 10, 20,
  null,
  'برای شروع نظم فروش، مشتری و پروژه',
  '["CRM و سرنخ‌ها", "پروژه و فعالیت", "فاکتور و هزینه ساده", "۲۰GB فایل", "داشبورد پایه"]'::jsonb,
  jsonb_build_object(
    'customers', true, 'marketing_leads', true,
    'invoices', true, 'purchase_invoices', true,
    'products', true, 'warehouses', true,
    'projects', true, 'tasks', true,
    'expense_documents', true,
    'web_forms', true
  ),
  '{}'::jsonb
)
on conflict do nothing;

-- پلن ابری رشد
insert into public.saas_plans (
  code, title, description, is_active, is_public, is_demo_default,
  trial_days, sort_order,
  price_monthly, price_yearly, included_users, extra_user_price, max_users, storage_gb,
  highlight_tag, short_description,
  display_features,
  enabled_modules, enabled_features
)
values (
  'cloud_growth',
  'ابری رشد',
  'پیشنهادی برای شرکت‌های خدماتی و تبلیغاتی',
  true, true, false,
  15, 20,
  6900000, 69000000, 10, 490000, 25, 100,
  'پیشنهادی',
  'پیشنهادی برای شرکت‌های خدماتی و تبلیغاتی',
  '["همه امکانات شروع", "فرآیندها و اتوماسیون", "چت داخلی", "بات، پیامک و VoIP", "AI و دانش سازمانی محدود"]'::jsonb,
  jsonb_build_object(
    'customers', true, 'marketing_leads', true,
    'invoices', true, 'purchase_invoices', true,
    'products', true, 'warehouses', true, 'shelves', true,
    'stock_transfers', true, 'product_bundles', true,
    'projects', true, 'tasks', true,
    'process_templates', true, 'process_runs', true,
    'expense_documents', true, 'employees', true,
    'attendance_logs', true, 'leave_requests', true,
    'web_forms', true, 'surveys', true,
    'automation_execution_reports', true,
    'sms_delivery_reports', true, 'voip_call_reports', true,
    'counterparty_bot_groups', true,
    'price_lists', true, 'billboards', true
  ),
  jsonb_build_object('ai_knowledge', 'limited')
)
on conflict do nothing;

-- پلن ابری سازمانی
insert into public.saas_plans (
  code, title, description, is_active, is_public, is_demo_default,
  trial_days, sort_order,
  price_monthly, price_yearly, included_users, extra_user_price, max_users, storage_gb,
  highlight_tag, short_description,
  display_features,
  enabled_modules, enabled_features
)
values (
  'cloud_enterprise',
  'ابری سازمانی',
  'برای سازمانی که سیستم را مرکز عملیات می‌خواهد',
  true, true, false,
  15, 30,
  13900000, 139000000, 20, 690000, null, 300,
  null,
  'برای سازمانی که سیستم را مرکز عملیات می‌خواهد',
  '["حسابداری و نقد و بانک", "سامانه مودیان", "گزارش‌ساز پیشرفته", "دسترسی‌های سازمانی", "۳۰۰GB فایل"]'::jsonb,
  jsonb_build_object(
    'customers', true, 'marketing_leads', true,
    'invoices', true, 'purchase_invoices', true,
    'products', true, 'warehouses', true, 'shelves', true,
    'stock_transfers', true, 'product_bundles', true,
    'production_boms', true, 'production_orders', true,
    'projects', true, 'tasks', true,
    'process_templates', true, 'process_runs', true,
    'expense_documents', true,
    'employees', true, 'attendance_logs', true,
    'work_schedules', true, 'leave_requests', true,
    'overtime_requests', true, 'mission_requests', true,
    'payroll_slips', true, 'employee_contracts', true,
    'employee_advances', true, 'recruitment_applicants', true,
    'secretariat_documents', true, 'delivery_forms', true,
    'chart_of_accounts', true, 'journal_entries', true,
    'cash_boxes', true, 'bank_accounts', true,
    'petty_funds', true, 'cheques', true, 'barters', true,
    'cash_bank_operations', true,
    'accounting_event_rules', true, 'cost_centers', true,
    'fiscal_years', true,
    'web_forms', true, 'surveys', true,
    'calculation_formulas', true,
    'automation_execution_reports', true,
    'sms_delivery_reports', true, 'voip_call_reports', true,
    'counterparty_bot_groups', true,
    'price_lists', true, 'billboards', true
  ),
  jsonb_build_object('ai_knowledge', true, 'taxpayer_system', true)
)
on conflict do nothing;

-- ------------------------------------
-- 3. function برای لود پلن‌های عمومی (برای PublicSite)
-- ------------------------------------

create or replace function public.get_public_plans()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',                 id,
        'code',               code,
        'title',              title,
        'short_description',  short_description,
        'price_monthly',      price_monthly,
        'price_yearly',       price_yearly,
        'included_users',     included_users,
        'extra_user_price',   extra_user_price,
        'max_users',          max_users,
        'storage_gb',         storage_gb,
        'highlight_tag',      highlight_tag,
        'display_features',   display_features,
        'custom_price_label', custom_price_label,
        'trial_days',         trial_days
      )
      order by sort_order asc
    ),
    '[]'::jsonb
  )
  from public.saas_plans
  where is_active = true
    and is_public = true
$$;

commit;
