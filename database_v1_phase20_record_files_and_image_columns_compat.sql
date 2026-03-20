-- =====================================================
-- KalamApp - Phase 20 Record Files + Image Columns Compat
-- Date: 2026-03-20
-- Type: Additive / non-breaking migration
-- Goal: keep image/file upload persistence compatible on self-hosted instances
-- =====================================================

begin;

-- -----------------------------------------------------------------
-- Compatibility columns for modules using header image field
-- -----------------------------------------------------------------
alter table if exists public.billboards
  add column if not exists image_url text;

alter table if exists public.invoices
  add column if not exists image_url text;

alter table if exists public.purchase_invoices
  add column if not exists image_url text;

-- Some older installs may miss cheque base fields used by relation dropdowns.
alter table if exists public.cheques
  add column if not exists serial_no text,
  add column if not exists sayad_id text,
  add column if not exists bank_name text,
  add column if not exists due_date date,
  add column if not exists amount numeric(18,2) not null default 0,
  add column if not exists image_url text;

create index if not exists idx_cheques_serial_no on public.cheques(serial_no);
create index if not exists idx_cheques_sayad_id on public.cheques(sayad_id);

-- -----------------------------------------------------------------
-- Generic record files table for all modules
-- -----------------------------------------------------------------
create table if not exists public.record_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  module_id text not null,
  record_id text not null,
  file_url text not null,
  file_type text not null default 'file',
  file_name text,
  mime_type text,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_record_files_file_type check (file_type in ('image', 'video', 'file'))
);

alter table if exists public.record_files
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists module_id text,
  add column if not exists record_id text,
  add column if not exists file_url text,
  add column if not exists file_type text default 'file',
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists sort_order integer default 0,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'record_files'
         and column_name = 'org_id'
     ) then
    alter table public.record_files
      alter column org_id set default public.current_org_id();
  end if;
end $$;

create index if not exists idx_record_files_module_record
  on public.record_files(module_id, record_id, file_type, sort_order, created_at desc);

create index if not exists idx_record_files_org
  on public.record_files(org_id, created_at desc);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_record_files_updated_at on public.record_files;
    create trigger trg_record_files_updated_at
      before update on public.record_files
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.record_files enable row level security;

drop policy if exists p_record_files_org_all on public.record_files;
create policy p_record_files_org_all on public.record_files
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  );

commit;
