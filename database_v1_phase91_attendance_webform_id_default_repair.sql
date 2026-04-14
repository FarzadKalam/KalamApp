-- =====================================================
-- KalamApp - Phase 91
-- Repair: attendance_logs.id default for public web-form inserts
-- =====================================================

begin;

create extension if not exists pgcrypto;

alter table if exists public.attendance_logs
  alter column id set default gen_random_uuid();

notify pgrst, 'reload schema';

commit;
