-- Phase 336: persist organization-wide ready-text pins and repair invoice report compatibility.

begin;

alter table if exists public.ready_texts
  add column if not exists is_pinned boolean not null default false;

alter table if exists public.ready_texts enable row level security;

create index if not exists idx_ready_texts_org_module_pinned_created_at
  on public.ready_texts (org_id, module_id, is_pinned desc, created_at desc);

alter table if exists public.invoices
  add column if not exists is_deleted boolean not null default false;

commit;
