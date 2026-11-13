-- database_v1_phase588_marketing_sales_agent_alignment.sql
-- Aligns agent title for sales_leads to 'ایجنت بازاریابی و فروش' and updates subtitles

create or replace function public.kalam_agent_title_fa_v1(p_agent_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_agent_key, '')))
    when 'lead_orchestrator' then 'ایجنت راهبر'
    when 'sales_leads' then 'ایجنت بازاریابی و فروش'
    when 'purchase_supply' then 'ایجنت خرید و تأمین'
    when 'customer_response' then 'ایجنت پاسخگویی مشتری'
    when 'hr_manager' then 'ایجنت منابع انسانی'
    when 'reservation' then 'ایجنت رزرواسیون'
    when 'project_process' then 'ایجنت پروژه و فرآیند'
    when 'instagrammer' then 'ایجنت اینستاگرامر'
    when 'system_guide' then 'ایجنت راهنمای تازه‌سیستم'
    else 'ایجنت هوشمند'
  end;
$$;

create or replace function public.kalam_agent_subtitle_fa_v1(p_agent_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_agent_key, '')))
    when 'lead_orchestrator' then 'هماهنگی و تخصیص هوشمند اولویت‌ها'
    when 'sales_leads' then 'کمپین‌ها، سرنخ‌ها، پیش‌فاکتور، فاکتور، تسویه و تبدیل فروش'
    when 'purchase_supply' then 'استعلام، پیش‌فاکتور خرید، سفارش، فاکتور خرید و کسری انبار'
    when 'customer_response' then 'وضعیت پروژه‌ها، فرآیندها، وظایف کارکنان و پاسخگویی چندکاناله'
    when 'hr_manager' then 'قرارداد، فرمول کارکرد، فیش، مرخصی، مأموریت و اضافه‌کار'
    when 'reservation' then 'تقویم رزرو، بافر، بیعانه و فاکتور فروش مرتبط'
    when 'project_process' then 'ویزارد الگوهای فرآیند، تسک‌ها، پیشرفت و اتوماسیون'
    when 'instagrammer' then 'تقویم محتوایی، پست‌ها، استوری‌ها، ویترین و پاسخ خودکار اینستاگرام'
    when 'system_guide' then 'راهنمای کاربری، گردش‌کارها و آموزش‌های تازه‌سیستم'
    else 'دستیار هوشمند سازمانی'
  end;
$$;
