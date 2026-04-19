create table if not exists public.file_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  parent_id uuid references public.file_folders(id) on delete cascade,
  name text not null,
  slug text,
  folder_type text not null default 'manual',
  module_id text,
  record_id uuid,
  source_table text,
  source_scope text,
  source_key text,
  inherited_from_folder_id uuid references public.file_folders(id) on delete set null,
  visibility text not null default 'private',
  is_system boolean not null default false,
  color_token text,
  icon_token text,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_file_folders_type check (folder_type in ('manual', 'system_module', 'system_record', 'system_subrecord')),
  constraint chk_file_folders_visibility check (visibility in ('private', 'org', 'public')),
  constraint uq_file_folders_scope_key unique (org_id, source_scope, source_key)
);

create index if not exists idx_file_folders_parent
  on public.file_folders(parent_id, sort_order, created_at);

create index if not exists idx_file_folders_module_record
  on public.file_folders(module_id, record_id, folder_type);

create table if not exists public.file_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  storage_bucket text not null default 'images',
  storage_path text not null,
  target_url text,
  display_name text,
  canonical_name text,
  file_ext text,
  mime_type text,
  file_type text not null default 'file',
  file_size_bytes bigint,
  checksum_sha256 text,
  visibility text not null default 'private',
  is_public boolean not null default false,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  origin_module_id text,
  origin_record_id uuid,
  origin_folder_id uuid references public.file_folders(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_file_assets_type check (file_type in ('image', 'video', 'file', 'audio', 'archive', 'document')),
  constraint chk_file_assets_visibility check (visibility in ('private', 'org', 'public')),
  constraint uq_file_assets_storage unique (storage_bucket, storage_path)
);

create index if not exists idx_file_assets_origin
  on public.file_assets(origin_module_id, origin_record_id, created_at desc);

create index if not exists idx_file_assets_visibility
  on public.file_assets(org_id, visibility, created_at desc);

create table if not exists public.file_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  asset_id uuid not null references public.file_assets(id) on delete cascade,
  folder_id uuid references public.file_folders(id) on delete cascade,
  entry_type text not null default 'origin',
  entry_name text,
  module_id text,
  record_id uuid,
  source_table text,
  source_row_id uuid,
  source_field_key text,
  source_entry_id uuid references public.file_entries(id) on delete set null,
  source_module_id text,
  source_record_id uuid,
  source_record_title text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_file_entries_type check (entry_type in ('origin', 'shortcut'))
);

create index if not exists idx_file_entries_folder
  on public.file_entries(folder_id, sort_order, created_at desc);

create index if not exists idx_file_entries_module_record
  on public.file_entries(module_id, record_id, created_at desc);

create index if not exists idx_file_entries_asset
  on public.file_entries(asset_id, entry_type, created_at desc);

create table if not exists public.file_access_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  target_type text not null,
  target_id uuid not null,
  access_type text not null,
  role_id uuid references public.org_roles(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  can_view boolean not null default true,
  can_upload boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_share boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_file_access_rules_target_type check (target_type in ('folder', 'asset')),
  constraint chk_file_access_rules_access_type check (access_type in ('org', 'public', 'role', 'user')),
  constraint uq_file_access_rules_target unique (target_type, target_id, access_type, role_id, user_id)
);

create index if not exists idx_file_access_rules_target
  on public.file_access_rules(target_type, target_id, access_type);

create table if not exists public.short_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  code text not null,
  link_type text not null default 'file',
  target_url text,
  target_asset_id uuid references public.file_assets(id) on delete cascade,
  target_entry_id uuid references public.file_entries(id) on delete cascade,
  module_id text,
  record_id uuid,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint short_links_code_key unique (code),
  constraint chk_short_links_link_type check (link_type in ('file', 'generic')),
  constraint chk_short_links_target check (
    coalesce(nullif(target_url, ''), '') <> ''
    or target_asset_id is not null
    or target_entry_id is not null
  )
);

create index if not exists idx_short_links_org_target
  on public.short_links(org_id, target_url);

create index if not exists idx_short_links_asset_entry
  on public.short_links(target_asset_id, target_entry_id);

create index if not exists idx_short_links_code_active
  on public.short_links(code, is_active, expires_at);

alter table if exists public.record_files
  add column if not exists folder_id uuid references public.file_folders(id) on delete set null,
  add column if not exists asset_id uuid references public.file_assets(id) on delete set null,
  add column if not exists file_entry_id uuid references public.file_entries(id) on delete set null,
  add column if not exists entry_type text,
  add column if not exists is_shortcut boolean not null default false,
  add column if not exists origin_record_file_id uuid references public.record_files(id) on delete set null;

create index if not exists idx_record_files_asset_id
  on public.record_files(asset_id, file_entry_id);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_file_folders_updated_at on public.file_folders;
    create trigger trg_file_folders_updated_at
      before update on public.file_folders
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_file_assets_updated_at on public.file_assets;
    create trigger trg_file_assets_updated_at
      before update on public.file_assets
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_file_entries_updated_at on public.file_entries;
    create trigger trg_file_entries_updated_at
      before update on public.file_entries
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_file_access_rules_updated_at on public.file_access_rules;
    create trigger trg_file_access_rules_updated_at
      before update on public.file_access_rules
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_short_links_updated_at on public.short_links;
    create trigger trg_short_links_updated_at
      before update on public.short_links
      for each row execute function public.set_updated_at();
  end if;
end $$;

grant select on public.short_links to anon;
grant select, insert, update, delete on public.file_folders to authenticated, service_role;
grant select, insert, update, delete on public.file_assets to authenticated, service_role;
grant select, insert, update, delete on public.file_entries to authenticated, service_role;
grant select, insert, update, delete on public.file_access_rules to authenticated, service_role;
grant select, insert, update, delete on public.short_links to authenticated, service_role;

alter table public.file_folders enable row level security;
alter table public.file_assets enable row level security;
alter table public.file_entries enable row level security;
alter table public.file_access_rules enable row level security;
alter table public.short_links enable row level security;

drop policy if exists p_file_folders_org_all on public.file_folders;
create policy p_file_folders_org_all on public.file_folders
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id = public.current_org_id()
  );

drop policy if exists p_file_assets_org_all on public.file_assets;
create policy p_file_assets_org_all on public.file_assets
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id = public.current_org_id()
  );

drop policy if exists p_file_entries_org_all on public.file_entries;
create policy p_file_entries_org_all on public.file_entries
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id = public.current_org_id()
  );

drop policy if exists p_file_access_rules_org_all on public.file_access_rules;
create policy p_file_access_rules_org_all on public.file_access_rules
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id = public.current_org_id()
  );

drop policy if exists p_short_links_auth_org_all on public.short_links;
create policy p_short_links_auth_org_all on public.short_links
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

drop policy if exists p_short_links_public_select on public.short_links;
create policy p_short_links_public_select on public.short_links
  for select to anon
  using (
    is_active = true
    and (expires_at is null or expires_at > now())
  );
