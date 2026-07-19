-- KalamApp V1 - Phase 355
-- Keep role-mention conversation fallback responsive on organizations with many notes.

begin;

create index if not exists idx_notes_mention_role_ids_gin
  on public.notes using gin(mention_role_ids);

commit;
