-- Add kalam_sky to brand_palette_key allowed values.

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
    check (brand_palette_key in ('executive_indigo', 'corporate_blue', 'deep_ocean', 'ruby_red', 'amber_navy', 'kalam_sky'));
end
$$;
