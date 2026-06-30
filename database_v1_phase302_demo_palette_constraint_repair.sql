-- =====================================================
-- KalamApp - Phase 302 Demo Palette Constraint Repair
-- Date: 2026-06-30
-- Type: Corrective / idempotent migration
-- Goal:
--   Ensure numbered production migrations accept the default demo palette.
--   The old kalam_sky repair existed in a non-numbered file and may be
--   skipped by production migration runners.
-- =====================================================

begin;

alter table if exists public.company_settings
  add column if not exists brand_palette_key text;

do $$
declare
  company_settings_reg regclass := to_regclass('public.company_settings');
begin
  if company_settings_reg is not null and exists (
    select 1
    from pg_constraint
    where conname = 'chk_company_settings_brand_palette_key'
      and conrelid = company_settings_reg
  ) then
    alter table public.company_settings
      drop constraint chk_company_settings_brand_palette_key;
  end if;
end
$$;

alter table if exists public.company_settings
  add constraint chk_company_settings_brand_palette_key
  check (
    brand_palette_key is null
    or brand_palette_key in (
      'executive_indigo',
      'corporate_blue',
      'deep_ocean',
      'ruby_red',
      'amber_navy',
      'kalam_sky'
    )
  ) not valid;

alter table if exists public.marketing_leads
  add column if not exists description text;

notify pgrst, 'reload schema';

commit;
