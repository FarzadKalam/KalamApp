-- KalamApp - Phase 61
-- Company contact channels for public branding and web forms

alter table if exists public.company_settings
  add column if not exists instagram_id text,
  add column if not exists telegram_id text,
  add column if not exists youtube_url text,
  add column if not exists whatsapp_number text,
  add column if not exists eitaa_id text,
  add column if not exists rubika_id text,
  add column if not exists bale_id text;
