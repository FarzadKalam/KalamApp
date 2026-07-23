-- =====================================================
-- KalamApp - Phase 373
-- نرخ‌های مصوب پایه سنوات: مرجع سراسری قابل مدیریت در SaaS Admin
-- =====================================================

begin;

-- این جدول عمداً tenant-owned نیست: نرخ مصوب سالانه برای همه سازمان‌ها یکسان است.
-- جدول قبلیِ per-org حفظ می‌شود تا داده‌های تاریخی هیچ سازمانی حذف نشود.
create table if not exists public.saas_seniority_annual_rates (
  id uuid primary key default gen_random_uuid(),
  persian_year integer not null,
  daily_rate_rials numeric(18,2) not null default 0,
  monthly_rate_30day_rials numeric(18,2) not null default 0,
  monthly_rate_31day_rials numeric(18,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_saas_seniority_annual_rates_year check (persian_year between 1300 and 1600),
  constraint chk_saas_seniority_annual_rates_daily_rate check (daily_rate_rials > 0),
  constraint chk_saas_seniority_annual_rates_30day_rate check (monthly_rate_30day_rials = daily_rate_rials * 30),
  constraint chk_saas_seniority_annual_rates_31day_rate check (monthly_rate_31day_rials = daily_rate_rials * 31)
);

create unique index if not exists idx_saas_seniority_annual_rates_year
  on public.saas_seniority_annual_rates(persian_year);

insert into public.saas_seniority_annual_rates (
  persian_year,
  daily_rate_rials,
  monthly_rate_30day_rials,
  monthly_rate_31day_rials,
  notes
)
values
  (1404, 94000, 2820000, 2914000, 'نرخ مصوب پایه سنوات سال ۱۴۰۴'),
  (1405, 166667, 5000010, 5166677, 'نرخ مصوب پایه سنوات سال ۱۴۰۵')
on conflict (persian_year) do nothing;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_saas_seniority_annual_rates_updated_at on public.saas_seniority_annual_rates;
    create trigger trg_saas_seniority_annual_rates_updated_at
      before update on public.saas_seniority_annual_rates
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

alter table public.saas_seniority_annual_rates enable row level security;

drop policy if exists p_saas_seniority_annual_rates_authenticated_read on public.saas_seniority_annual_rates;
create policy p_saas_seniority_annual_rates_authenticated_read
on public.saas_seniority_annual_rates
for select to authenticated
using (auth.uid() is not null);

drop policy if exists p_saas_seniority_annual_rates_saas_admin_write on public.saas_seniority_annual_rates;
create policy p_saas_seniority_annual_rates_saas_admin_write
on public.saas_seniority_annual_rates
for all to authenticated
using (public.current_user_has_saas_admin_permission('edit'))
with check (public.current_user_has_saas_admin_permission('edit'));

grant select, insert, update, delete on public.saas_seniority_annual_rates to authenticated;

notify pgrst, 'reload schema';

commit;
