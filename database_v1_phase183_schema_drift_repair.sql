-- Phase 183: Schema drift repair
-- Adds columns that were missing from production despite being in module configs.
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS).

begin;

-- instructions.tags: omitted from phase 155 and phase 168 (was not in the list)
alter table if exists public.instructions
  add column if not exists tags jsonb not null default '[]'::jsonb;

-- secretariat_documents: sender_manual / recipient_manual were added in phase 93
-- but that migration was not applied to production.
alter table if exists public.secretariat_documents
  add column if not exists sender_manual text,
  add column if not exists recipient_manual text;

-- personas: tags and process_template_id referenced in module config but missing from table
alter table if exists public.personas
  add column if not exists tags              jsonb,
  add column if not exists process_template_id uuid REFERENCES public.process_templates(id) ON DELETE SET NULL;

commit;
