-- =====================================================
-- KalamApp - Phase 10 Company Currency
-- Date: 2026-02-27
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_full.sql
-- =====================================================

alter table if exists public.company_settings
  add column if not exists currency_code text not null default 'IRT',
  add column if not exists currency_label text not null default 'تومان';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'chk_company_settings_currency_code'
  ) then
    alter table public.company_settings
      drop constraint chk_company_settings_currency_code;
  end if;

  alter table public.company_settings
    add constraint chk_company_settings_currency_code
    check (currency_code in ('IRT', 'IRR', 'USD', 'EUR'));
end
$$;

update public.company_settings
set
  currency_label = case upper(currency_code)
    when 'IRR' then 'ریال'
    when 'USD' then 'دلار'
    when 'EUR' then 'یورو'
    else 'تومان'
  end
where currency_label is null
   or btrim(currency_label) = '';

