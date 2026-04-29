-- KalamApp V1 - Phase 134
-- Align taxpayer-system integration with official certificate v2 and no-certificate legacy SDK paths.

begin;

alter table if exists public.taxpayer_settings
  add column if not exists integration_mode text;

update public.taxpayer_settings
set integration_mode = case
  when nullif(btrim(coalesce(certificate_pem, '')), '') is not null then 'certificate_v2'
  else 'no_certificate_legacy'
end
where integration_mode is null
   or integration_mode not in ('certificate_v2', 'no_certificate_legacy');

update public.taxpayer_settings
set base_url = case
  when integration_mode = 'certificate_v2' then 'https://tp.tax.gov.ir/requestsmanager'
  else 'https://tp.tax.gov.ir/req/api/self-tsp'
end
where nullif(btrim(coalesce(base_url, '')), '') is null
   or base_url in ('https://tp.tax.gov.ir/req', 'https://tp.tax.gov.ir/req/');

alter table if exists public.taxpayer_settings
  alter column integration_mode set default 'certificate_v2',
  alter column integration_mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'taxpayer_settings_integration_mode_check'
      and conrelid = 'public.taxpayer_settings'::regclass
  ) then
    alter table public.taxpayer_settings
      add constraint taxpayer_settings_integration_mode_check
      check (integration_mode in ('certificate_v2', 'no_certificate_legacy'));
  end if;
end;
$$;

alter table if exists public.taxpayer_invoice_submissions
  add column if not exists integration_mode text;

update public.taxpayer_invoice_submissions
set integration_mode = 'certificate_v2'
where integration_mode is null
   or integration_mode not in ('certificate_v2', 'no_certificate_legacy');

alter table if exists public.taxpayer_invoice_submissions
  alter column integration_mode set default 'certificate_v2';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'taxpayer_invoice_submissions_integration_mode_check'
      and conrelid = 'public.taxpayer_invoice_submissions'::regclass
  ) then
    alter table public.taxpayer_invoice_submissions
      add constraint taxpayer_invoice_submissions_integration_mode_check
      check (integration_mode is null or integration_mode in ('certificate_v2', 'no_certificate_legacy'));
  end if;
end;
$$;

alter table if exists public.products
  add column if not exists taxpayer_measure_unit_code text;

alter table if exists public.products
  alter column product_identifier type text using product_identifier::text;

notify pgrst, 'reload schema';

commit;
