-- =====================================================
-- KalamApp - Phase 450 Financial Payment Rows & Employee Titles
-- Date: 2026-08-16
-- Type: Additive / idempotent migration
-- Goal: پایداری ردیف‌های پرداخت و نام کامل کارکنان
-- =====================================================

begin;

-- عنوان مرجع کارمند تنها از نام کامل ساخته می‌شود. نگهداری این مقدار در همان
-- رکورد کارمند باعث می‌شود عنوان ماژول، relationها و گزارش‌ها یک منبع مشترک داشته باشند.
alter table if exists public.employees
  add column if not exists full_name text;

create or replace function public.set_employee_full_name()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_computed_name text;
begin
  v_computed_name := nullif(trim(concat_ws(
    ' ',
    nullif(trim(coalesce(new.prefix, '')), ''),
    nullif(trim(coalesce(new.first_name, '')), ''),
    nullif(trim(coalesce(new.last_name, '')), '')
  )), '');
  new.full_name := coalesce(v_computed_name, nullif(trim(coalesce(new.full_name, '')), ''));
  new.children_count := coalesce(new.children_count, 0);
  return new;
end;
$$;

drop trigger if exists trg_employees_full_name on public.employees;
create trigger trg_employees_full_name
before insert or update of prefix, first_name, last_name, full_name, children_count on public.employees
for each row execute function public.set_employee_full_name();

update public.employees
set full_name = coalesce(
  nullif(trim(concat_ws(' ', nullif(trim(prefix), ''), nullif(trim(first_name), ''), nullif(trim(last_name), ''))), ''),
  nullif(trim(full_name), '')
)
where full_name is distinct from coalesce(
  nullif(trim(concat_ws(' ', nullif(trim(prefix), ''), nullif(trim(first_name), ''), nullif(trim(last_name), ''))), ''),
  nullif(trim(full_name), '')
);

create index if not exists idx_employees_org_full_name
  on public.employees(org_id, full_name);

-- در union مربوط به پرداخت‌های مساعده، زیرquery نام ستون‌های خروجی را به
-- بیرون منتقل نمی‌کرد. alias صریح باعث می‌شود هم پرداخت‌های ثبت‌شده و هم
-- ردیف سازگاری paid_amount بدون خطای «item» در دفتر مشترک خوانده شوند.
do $$
declare
  v_function_definition text;
begin
  if to_regprocedure('public._get_operational_financial_history(uuid,text,uuid)') is null then
    raise exception 'تابع مرکزی گردش مالی برای اصلاح ردیف پرداخت پیدا نشد.';
  end if;

  select pg_get_functiondef('public._get_operational_financial_history(uuid,text,uuid)'::regprocedure)
    into v_function_definition;

  if position(') payment(item, ordinality)' in v_function_definition) = 0 then
    if position($old$    ) payment
    where advance.org_id = p_org_id$old$ in v_function_definition) = 0 then
      raise exception 'نسخهٔ تابع مرکزی گردش مالی برای اصلاح ردیف پرداخت شناخته‌شده نیست.';
    end if;

    v_function_definition := replace(
      v_function_definition,
      $old$    ) payment
    where advance.org_id = p_org_id$old$,
      $new$    ) payment(item, ordinality)
    where advance.org_id = p_org_id$new$
    );

    if position(') payment(item, ordinality)' in v_function_definition) = 0 then
      raise exception 'نام‌گذاری ردیف پرداخت در تابع مرکزی گردش مالی انجام نشد.';
    end if;

    execute v_function_definition;
  end if;
end;
$$;

-- نسخه‌های قدیمی کارت حساب، نام کارمند را از ستون حذف‌شدهٔ name می‌خواندند.
-- فقط همان نسخهٔ قدیمی بازنویسی می‌شود؛ نسخهٔ جدید کارت که از دفتر مرکزی
-- استفاده می‌کند بدون تغییر باقی می‌ماند.
do $$
declare
  v_function_definition text;
begin
  if to_regprocedure('public.get_public_online_account_card(text)') is null then
    return;
  end if;

  select pg_get_functiondef('public.get_public_online_account_card(text)'::regprocedure)
    into v_function_definition;

  if position($old$coalesce(name, first_name || ' ' || last_name, system_code, 'کارمند')$old$ in v_function_definition) > 0 then
    v_function_definition := replace(
      v_function_definition,
      $old$coalesce(name, first_name || ' ' || last_name, system_code, 'کارمند')$old$,
      $new$coalesce(nullif(btrim(full_name), ''), nullif(btrim(concat_ws(' ', first_name, last_name)), ''), system_code, 'کارمند')$new$
    );
    execute v_function_definition;
  end if;
end;
$$;

commit;
