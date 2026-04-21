-- KalamApp V1 - Phase 117
-- Complete tag-column compatibility for module configs that expose FieldType.TAGS.

begin;

alter table if exists public.profiles
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.journal_lines
  add column if not exists tags jsonb not null default '[]'::jsonb;

commit;
