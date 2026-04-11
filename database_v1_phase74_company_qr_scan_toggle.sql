-- =====================================================
-- KalamApp - Phase 74 Company QR Scan Toggle
-- Date: 2026-04-10
-- Type: Additive / non-breaking migration
-- Goal: allow disabling QR scan actions per company
-- =====================================================

begin;

alter table if exists public.company_settings
  add column if not exists qr_scan_enabled boolean not null default false;

update public.company_settings
set qr_scan_enabled = false
where qr_scan_enabled is null;

commit;
