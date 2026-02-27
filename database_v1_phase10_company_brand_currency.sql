-- Ensure company branding/currency columns exist for runtime theme + money label.

alter table if exists public.company_settings
  add column if not exists brand_palette_key text not null default 'executive_indigo',
  add column if not exists currency_code text not null default 'IRT',
  add column if not exists currency_label text not null default 'تومان',
  add column if not exists icon_url text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'chk_company_settings_brand_palette_key'
  ) then
    alter table public.company_settings
      drop constraint chk_company_settings_brand_palette_key;
  end if;

  alter table public.company_settings
    add constraint chk_company_settings_brand_palette_key
    check (brand_palette_key in ('executive_indigo', 'corporate_blue', 'deep_ocean', 'ruby_red', 'amber_navy'));
end
$$;

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

