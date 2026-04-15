-- KalamApp V1 - Phase 93
-- Manual sender/recipient fields for official secretariat letters.

begin;

alter table if exists public.secretariat_documents
  add column if not exists sender_manual text,
  add column if not exists recipient_manual text;

commit;
