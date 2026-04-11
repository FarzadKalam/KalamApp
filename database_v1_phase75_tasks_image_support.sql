-- =====================================================
-- KalamApp - Phase 75 Tasks Image Support
-- Date: 2026-04-10
-- Type: Additive / non-breaking migration
-- Goal: align task image handling with other modules and hero/file manager UX
-- =====================================================

begin;

alter table if exists public.tasks
  add column if not exists image_url text;

commit;
