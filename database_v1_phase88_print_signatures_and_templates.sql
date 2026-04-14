-- KalamApp V1 - Phase 88
-- Company print seal/signature settings and formal print template support fields.

begin;

alter table if exists public.company_settings
  add column if not exists official_signatory_name text,
  add column if not exists official_signatory_title text,
  add column if not exists signature_image_url text,
  add column if not exists stamp_image_url text;

notify pgrst, 'reload schema';

commit;
