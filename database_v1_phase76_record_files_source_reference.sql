-- =====================================================
-- KalamApp - Phase 76 Record Files Source Reference
-- Date: 2026-04-10
-- Type: Additive / non-breaking migration
-- Goal: mark files shared from a source record so linked records can render them differently
-- =====================================================

begin;

alter table if exists public.record_files
  add column if not exists source_module_id text,
  add column if not exists source_record_id text,
  add column if not exists source_record_title text;

create index if not exists idx_record_files_source_record
  on public.record_files(source_module_id, source_record_id, created_at desc);

commit;
