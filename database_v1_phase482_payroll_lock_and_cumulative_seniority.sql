-- =====================================================
-- KalamApp - Phase 482 Payroll Lock and Cumulative Seniority
-- Date: 2026-08-28
-- Type: Additive / idempotent migration
-- هدف:
--   1) ثبت اتمی فیش با وجود قفل بودن منابع، بدون بازکردن یا تغییر داده عملیاتی منبع
--   2) نگهداری نرخ روزانه تجمیعی پایه سنوات بر اساس سال و سابقه کامل
-- =====================================================

begin;

-- این جدول tenant-owned نیست و مرجع ملی نرخ قانونی برای همه سازمان‌هاست.
-- ویرایش نرخ پایه همچنان فقط از جدول مرجع SaaS Admin انجام می‌شود و این جدول
-- مشتق‌شده مستقیماً توسط کاربران قابل تغییر نیست.
create table if not exists public.saas_seniority_service_rates (
  id uuid primary key default gen_random_uuid(),
  persian_year integer not null,
  completed_service_years integer not null,
  daily_rate_rials numeric(18, 2) not null,
  source_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_saas_seniority_service_rates_year
    check (persian_year between 1300 and 1600),
  constraint chk_saas_seniority_service_rates_service_years
    check (completed_service_years between 1 and 60),
  constraint chk_saas_seniority_service_rates_daily_rate
    check (daily_rate_rials > 0)
);

create unique index if not exists idx_saas_seniority_service_rates_year_service
  on public.saas_seniority_service_rates(persian_year, completed_service_years);

alter table public.saas_seniority_service_rates enable row level security;

drop policy if exists p_saas_seniority_service_rates_authenticated_read
  on public.saas_seniority_service_rates;
create policy p_saas_seniority_service_rates_authenticated_read
on public.saas_seniority_service_rates
for select to authenticated
using (auth.uid() is not null);

revoke all on table public.saas_seniority_service_rates from public, anon, authenticated;
grant select on table public.saas_seniority_service_rates to authenticated;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_saas_seniority_service_rates_updated_at
      on public.saas_seniority_service_rates;
    create trigger trg_saas_seniority_service_rates_updated_at
      before update on public.saas_seniority_service_rates
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

alter table public.saas_seniority_annual_rates
  add column if not exists prior_base_increase_percent numeric(8, 4) not null default 0;

alter table public.saas_seniority_annual_rates
  drop constraint if exists chk_saas_seniority_annual_rates_prior_increase;
alter table public.saas_seniority_annual_rates
  add constraint chk_saas_seniority_annual_rates_prior_increase
  check (prior_base_increase_percent between 0 and 500);

update public.saas_seniority_annual_rates
set prior_base_increase_percent = case persian_year
  when 1404 then 32
  when 1405 then 45
  else prior_base_increase_percent
end
where persian_year in (1404, 1405);

-- جدول رسمی/محاسباتی ۱۴۰۴، مبنای تولید تجمیعی سال‌های بعد است.
insert into public.saas_seniority_service_rates (
  persian_year, completed_service_years, daily_rate_rials, source_notes
)
values
  (1404, 1, 94000, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 2, 186400, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 3, 299128, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 4, 435529, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 5, 561017, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 6, 673958, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 7, 764873, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 8, 839722, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 9, 922359, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 10, 976799, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 11, 1038860, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 12, 1075168, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 13, 1099568, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 14, 1121934, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 15, 1141081, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 16, 1161373, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 17, 1174944, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 18, 1189193, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 19, 1204156, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 20, 1220615, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 21, 1235386, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 22, 1248422, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 23, 1258705, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 24, 1267521, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 25, 1275000, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 26, 1281327, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 27, 1285196, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 28, 1288468, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 29, 1291772, 'جدول تجمیعی پایه سنوات ۱۴۰۴'),
  (1404, 30, 1295768, 'جدول تجمیعی پایه سنوات ۱۴۰۴')
on conflict (persian_year, completed_service_years) do update
set daily_rate_rials = excluded.daily_rate_rials,
    source_notes = excluded.source_notes,
    updated_at = now();

create or replace function public.refresh_seniority_service_rates_for_year(p_persian_year integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_daily_rate numeric;
  v_prior_multiplier numeric;
begin
  select daily_rate_rials, 1 + (prior_base_increase_percent / 100)
  into v_daily_rate, v_prior_multiplier
  from public.saas_seniority_annual_rates
  where persian_year = p_persian_year;

  if v_daily_rate is null or v_daily_rate <= 0 then
    raise exception 'seniority_annual_rate_not_found';
  end if;

  insert into public.saas_seniority_service_rates (
    persian_year, completed_service_years, daily_rate_rials, source_notes
  )
  values (p_persian_year, 1, round(v_daily_rate), 'محاسبه‌شده از نرخ مصوب سال و ضریب افزایش پایه‌های قبل')
  on conflict (persian_year, completed_service_years) do update
  set daily_rate_rials = excluded.daily_rate_rials,
      source_notes = excluded.source_notes,
      updated_at = now();

  insert into public.saas_seniority_service_rates (
    persian_year, completed_service_years, daily_rate_rials, source_notes
  )
  select
    p_persian_year,
    previous.completed_service_years + 1,
    round((previous.daily_rate_rials * v_prior_multiplier) + v_daily_rate),
    'محاسبه‌شده از نرخ مصوب سال و ضریب افزایش پایه‌های قبل'
  from public.saas_seniority_service_rates previous
  where previous.persian_year = p_persian_year - 1
    and previous.completed_service_years < 60
  on conflict (persian_year, completed_service_years) do update
  set daily_rate_rials = excluded.daily_rate_rials,
      source_notes = excluded.source_notes,
      updated_at = now();
end;
$$;

revoke all on function public.refresh_seniority_service_rates_for_year(integer)
  from public, anon, authenticated;

create or replace function public.refresh_seniority_service_rates_after_annual_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer;
begin
  for v_year in
    select rate.persian_year
    from public.saas_seniority_annual_rates rate
    where rate.persian_year >= new.persian_year
    order by rate.persian_year
  loop
    perform public.refresh_seniority_service_rates_for_year(v_year);
  end loop;
  return new;
end;
$$;

revoke all on function public.refresh_seniority_service_rates_after_annual_change()
  from public, anon, authenticated;

drop trigger if exists trg_refresh_seniority_service_rates_after_annual_change
  on public.saas_seniority_annual_rates;
create trigger trg_refresh_seniority_service_rates_after_annual_change
after insert or update of daily_rate_rials, prior_base_increase_percent
on public.saas_seniority_annual_rates
for each row execute function public.refresh_seniority_service_rates_after_annual_change();

select public.refresh_seniority_service_rates_for_year(1405);

-- Scope تنها به همان رکوردهای منبعی داده می‌شود که اتصال داخلی آن‌ها به فیش
-- تغییر می‌کند. قفل باقی می‌ماند و هیچ دادهٔ عملیاتی منبع قابل ویرایش نیست.
create or replace function public.prevent_locked_record_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean := false;
  v_scoped_payroll_source_sync boolean := false;
  v_allowed_payroll_change boolean := false;
  v_allowed_payroll_recalculation boolean := false;
begin
  if tg_op not in ('UPDATE', 'DELETE') then return coalesce(new, old); end if;

  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from public.payroll_source_mutation_scopes scope
      where scope.org_id = old.org_id
        and scope.table_name = tg_table_name
        and scope.record_id = old.id
    ) into v_scoped_payroll_source_sync;

    if v_scoped_payroll_source_sync then
      v_allowed_payroll_change := case tg_table_name
        when 'payroll_calculation_entries' then
          (to_jsonb(new) - array['status', 'payroll_slip_id', 'updated_at', 'updated_by'])
            is not distinct from
          (to_jsonb(old) - array['status', 'payroll_slip_id', 'updated_at', 'updated_by'])
        when 'employee_bonus_requests' then
          (to_jsonb(new) - array['related_payroll_slip_id', 'updated_at', 'updated_by'])
            is not distinct from
          (to_jsonb(old) - array['related_payroll_slip_id', 'updated_at', 'updated_by'])
        when 'employee_penalty_requests' then
          (to_jsonb(new) - array['related_payroll_slip_id', 'updated_at', 'updated_by'])
            is not distinct from
          (to_jsonb(old) - array['related_payroll_slip_id', 'updated_at', 'updated_by'])
        when 'employee_advances' then
          (to_jsonb(new) - array['related_payroll_slip_id', 'paid_amount', 'remaining_amount', 'updated_at', 'updated_by'])
            is not distinct from
          (to_jsonb(old) - array['related_payroll_slip_id', 'paid_amount', 'remaining_amount', 'updated_at', 'updated_by'])
        when 'commission_drafts' then
          (to_jsonb(new) - array['posted_amount', 'remaining_amount', 'draft_status', 'updated_at', 'updated_by'])
            is not distinct from
          (to_jsonb(old) - array['posted_amount', 'remaining_amount', 'draft_status', 'updated_at', 'updated_by'])
        else false
      end;
      if v_allowed_payroll_change then return new; end if;
    end if;

    -- رفتار قبلی محاسبهٔ مشتق‌شدهٔ خود فیش حفظ می‌شود، اما context عمومی
    -- دیگر برای عبور دادن هیچ رکورد منبعی کافی نیست.
    if tg_table_name = 'payroll_slips'
      and current_setting('app.payroll_source_sync', true) = 'active'
    then
      v_allowed_payroll_recalculation :=
        (to_jsonb(new) - array[
          'base_salary', 'task_wage_total', 'bonus_total', 'earnings_total', 'deduction_total',
          'insurance_employee_amount', 'insurance_employer_amount',
          'gross_amount', 'net_amount', 'updated_at', 'updated_by'
        ]) is not distinct from
        (to_jsonb(old) - array[
          'base_salary', 'task_wage_total', 'bonus_total', 'earnings_total', 'deduction_total',
          'insurance_employee_amount', 'insurance_employer_amount',
          'gross_amount', 'net_amount', 'updated_at', 'updated_by'
        ]);
      if v_allowed_payroll_recalculation then return new; end if;
    end if;
  end if;

  select exists (
    select 1
    from public.record_locks lock_row
    where lock_row.org_id = old.org_id
      and lock_row.record_id = old.id
      and (
        lock_row.module_id = tg_table_name
        or lock_row.metadata ->> 'table_name' = tg_table_name
      )
  ) into v_locked;

  if v_locked then raise exception 'این رکورد قفل شده و قابل تغییر یا حذف نیست.'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.prevent_locked_record_mutation()
  from public, anon, authenticated;

-- نسخهٔ کامل wrapper: مساعده‌ها را از دیتابیس اعتبارسنجی و به پرداخت تبدیل
-- می‌کند و سپس فقط اتصال داخلی منابع انتخاب‌شده را در scope اتمی ثبت می‌کند.
create or replace function public.create_payroll_slip_from_wizard(
  p_payload jsonb,
  p_ledger_entry_ids uuid[] default array[]::uuid[],
  p_bonus_request_ids uuid[] default array[]::uuid[],
  p_penalty_request_ids uuid[] default array[]::uuid[],
  p_advance_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_employee_id uuid := nullif(trim(p_payload ->> 'employee_id'), '')::uuid;
  v_period_start date := nullif(trim(p_payload ->> 'period_start'), '')::date;
  v_period_end date := nullif(trim(p_payload ->> 'period_end'), '')::date;
  v_ledger_ids uuid[] := array[]::uuid[];
  v_bonus_ids uuid[] := array[]::uuid[];
  v_penalty_ids uuid[] := array[]::uuid[];
  v_advance_ids uuid[] := array[]::uuid[];
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_scope_token uuid := gen_random_uuid();
  v_slip_id uuid;
  v_verified_count integer;
  v_requested_count integer;
  v_advance_payments jsonb := '[]'::jsonb;
  v_clean_lines jsonb := '[]'::jsonb;
  v_existing_non_advance_payments jsonb := '[]'::jsonb;
begin
  if v_org_id is null or v_employee_id is null or v_period_start is null or v_period_end is null then
    raise exception 'invalid_payroll_wizard_payload';
  end if;
  if not public.current_user_has_role_permission_entry('payroll_slips', 'edit', null, true) then
    raise exception 'payroll_creation_not_allowed';
  end if;

  select coalesce(array_agg(distinct item), array[]::uuid[]) into v_ledger_ids
  from unnest(coalesce(p_ledger_entry_ids, array[]::uuid[])) item;
  select coalesce(array_agg(distinct item), array[]::uuid[]) into v_bonus_ids
  from unnest(coalesce(p_bonus_request_ids, array[]::uuid[])) item;
  select coalesce(array_agg(distinct item), array[]::uuid[]) into v_penalty_ids
  from unnest(coalesce(p_penalty_request_ids, array[]::uuid[])) item;
  select coalesce(array_agg(distinct item), array[]::uuid[]) into v_advance_ids
  from unnest(coalesce(p_advance_ids, array[]::uuid[])) item;

  perform 1 from public.payroll_calculation_entries
  where org_id = v_org_id and employee_id = v_employee_id
    and period_start = v_period_start and period_end = v_period_end
    and status in ('draft', 'proposed') and id = any(v_ledger_ids)
  for update;
  perform 1 from public.employee_bonus_requests
  where org_id = v_org_id and employee_id = v_employee_id
    and related_payroll_slip_id is null and id = any(v_bonus_ids)
  for update;
  perform 1 from public.employee_penalty_requests
  where org_id = v_org_id and employee_id = v_employee_id
    and related_payroll_slip_id is null and id = any(v_penalty_ids)
  for update;
  perform 1 from public.employee_advances
  where org_id = v_org_id and employee_id = v_employee_id
    and related_payroll_slip_id is null and id = any(v_advance_ids)
  for update;

  select count(*) into v_requested_count
  from unnest(v_advance_ids) requested(value);
  select count(*) into v_verified_count
  from public.employee_advances advance
  where advance.org_id = v_org_id
    and advance.employee_id = v_employee_id
    and advance.id = any(v_advance_ids)
    and advance.related_payroll_slip_id is null
    and lower(coalesce(advance.status, '')) in ('paid', 'settled', 'completed', 'posted')
    and coalesce(advance.paid_amount, 0) > 0;
  if v_requested_count <> v_verified_count then raise exception 'payroll_advances_changed'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'row_key', 'advance_' || advance.id::text,
      'employee_advance_id', advance.id::text,
      'payment_type', 'credit',
      'status', 'paid',
      'date', advance.request_date,
      'amount', advance.paid_amount,
      'description', concat('تسویه با مساعده: ', coalesce(
        nullif(btrim(advance.system_code), ''), nullif(btrim(advance.name), ''), 'بدون عنوان'
      )),
      'is_advance_settlement', true,
      '_readonly', true,
      '_lockedFields', jsonb_build_array('employee_advance_id', 'amount', 'payment_type', 'status')
    ) order by advance.request_date, advance.id
  ), '[]'::jsonb)
  into v_advance_payments
  from public.employee_advances advance
  where advance.org_id = v_org_id
    and advance.employee_id = v_employee_id
    and advance.id = any(v_advance_ids);

  select coalesce(jsonb_agg(line.value), '[]'::jsonb) into v_clean_lines
  from jsonb_array_elements(coalesce(v_payload -> 'lines', '[]'::jsonb)) line(value)
  where lower(coalesce(line.value ->> 'key', '')) <> 'employee_advance'
    and nullif(trim(coalesce(line.value -> 'metadata' ->> 'employee_advance_id', '')), '') is null;

  select coalesce(jsonb_agg(payment.value), '[]'::jsonb) into v_existing_non_advance_payments
  from jsonb_array_elements(coalesce(v_payload -> 'payments', '[]'::jsonb)) payment(value)
  where nullif(trim(coalesce(payment.value ->> 'employee_advance_id', '')), '') is null;

  insert into public.payroll_source_mutation_scopes(scope_token, org_id, table_name, record_id)
  select v_scope_token, v_org_id, source.table_name, source.record_id
  from (
    select 'payroll_calculation_entries'::text table_name, item record_id from unnest(v_ledger_ids) item
    union all select 'employee_bonus_requests', item from unnest(v_bonus_ids) item
    union all select 'employee_penalty_requests', item from unnest(v_penalty_ids) item
    union all select 'employee_advances', item from unnest(v_advance_ids) item
  ) source
  where source.record_id is not null
  on conflict do nothing;

  v_payload := v_payload || jsonb_build_object(
    'lines', v_clean_lines,
    'payments', v_existing_non_advance_payments || v_advance_payments,
    'performance_snapshot', coalesce(v_payload -> 'performance_snapshot', '{}'::jsonb)
      || jsonb_build_object(
        'payroll_ledger_entry_ids', to_jsonb(v_ledger_ids),
        'employee_advance_ids', to_jsonb(v_advance_ids)
      )
  );

  v_slip_id := public._create_payroll_slip_from_wizard_internal(
    v_payload, v_ledger_ids, v_bonus_ids, v_penalty_ids, v_advance_ids
  );

  delete from public.payroll_source_mutation_scopes where scope_token = v_scope_token;
  return v_slip_id;
end;
$$;

revoke all on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[])
  from public, anon;
grant execute on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[])
  to authenticated;

notify pgrst, 'reload schema';

commit;
