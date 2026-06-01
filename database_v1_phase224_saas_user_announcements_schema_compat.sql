-- =====================================================
-- KalamApp - Phase 224: SaaS user announcements schema compatibility
-- Date: 2026-06-01
-- Type: Additive / idempotent
-- =====================================================

begin;

alter table if exists public.saas_user_announcements
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists process_template_id uuid,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb;

create index if not exists idx_saas_user_announcements_tags
  on public.saas_user_announcements using gin (tags);

notify pgrst, 'reload schema';

commit;
