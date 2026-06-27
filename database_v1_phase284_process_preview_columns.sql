-- Phase 284: Process preview columns for list rendering
-- Idempotent schema repair so ModuleList can select process preview fields while
-- the V2 renderer lazy-loads the actual stages from normalized process tables.

alter table public.process_templates
  add column if not exists template_stages_preview jsonb;

alter table public.process_runs
  add column if not exists run_stages_preview jsonb;
