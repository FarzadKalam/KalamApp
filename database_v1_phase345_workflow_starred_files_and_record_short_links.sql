-- Phase 345: scalable lookup for workflow starred attachments and per-record short links.
-- Existing tables and policies are reused; no tenant data is made global.

create index if not exists idx_file_entries_org_record_starred_active
  on public.file_entries (org_id, module_id, record_id, created_at)
  where is_deleted = false
    and (
      metadata @> '{"main_image":{"starred":true}}'::jsonb
      or metadata @> '{"starred":true}'::jsonb
    );

create index if not exists idx_short_links_org_record_generic_active
  on public.short_links (org_id, module_id, record_id, created_at desc)
  where link_type = 'generic'
    and is_active = true
    and metadata @> '{"kind":"record"}'::jsonb;

