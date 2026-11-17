-- Phase 575: tenant-scoped site builder MVP. Draft edits never alter public content until explicit publish RPC.
begin;

create table if not exists public.site_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  title text not null default '',
  draft_version_id uuid,
  published_version_id uuid,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug),
  unique (id, org_id)
);

create table if not exists public.site_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null default '',
  slug text not null default '',
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (page_id, version_number),
  unique (id, page_id, org_id),
  foreign key (page_id, org_id) references public.site_pages(id, org_id) on delete cascade,
  constraint site_page_versions_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  constraint site_page_versions_title_length check (length(trim(title)) between 1 and 180)
);

alter table public.site_page_versions add column if not exists title text not null default '';
alter table public.site_page_versions add column if not exists slug text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.site_pages'::regclass and conname = 'site_pages_draft_version_fk') then
    alter table public.site_pages add constraint site_pages_draft_version_fk
      foreign key (draft_version_id, id, org_id)
      references public.site_page_versions(id, page_id, org_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.site_pages'::regclass and conname = 'site_pages_published_version_fk') then
    alter table public.site_pages add constraint site_pages_published_version_fk
      foreign key (published_version_id, id, org_id)
      references public.site_page_versions(id, page_id, org_id) on delete restrict;
  end if;
end $$;
create index if not exists site_page_versions_page_created_idx on public.site_page_versions(page_id, created_at desc);

create or replace function public.can_manage_tenant_site_pages(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(exists (
    select 1 from public.user_organization_memberships m
    where m.org_id = p_org_id and m.user_id = auth.uid() and m.is_active = true
      and p_org_id = public.current_org_id()
      and (m.is_owner = true or lower(coalesce(m.software_role, '')) in ('super_admin', 'admin', 'manager'))
  ), false);
$$;
revoke all on function public.can_manage_tenant_site_pages(uuid) from public, anon;
grant execute on function public.can_manage_tenant_site_pages(uuid) to authenticated;

create or replace function public.is_valid_tenant_site_blocks(p_blocks jsonb)
returns boolean language plpgsql immutable set search_path = public
as $$
declare
  v_block jsonb;
  v_href text;
  v_level integer;
begin
  if p_blocks is null or jsonb_typeof(p_blocks) is distinct from 'array' or jsonb_array_length(p_blocks) > 100 then return false; end if;
  for v_block in select value from jsonb_array_elements(p_blocks) loop
    if jsonb_typeof(v_block) <> 'object'
      or coalesce(v_block->>'type', '') not in ('heading', 'paragraph', 'button')
      or jsonb_typeof(v_block->'text') is distinct from 'string'
      or length(coalesce(v_block->>'text', '')) > 10000 then return false; end if;
    if v_block->>'type' = 'heading' and v_block ? 'level' then
      begin v_level := (v_block->>'level')::integer; exception when others then return false; end;
      if v_level < 1 or v_level > 4 then return false; end if;
    end if;
    if v_block->>'type' = 'button' then
      v_href := coalesce(v_block->>'href', '');
      if length(v_href) > 2048 or v_href ~ '[[:cntrl:]]' or position(chr(92) in v_href) > 0
        or not (v_href ~* '^https://[^[:space:]]+$' or (left(v_href, 1) = '/' and left(v_href, 2) <> '//')) then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.is_valid_tenant_site_blocks(jsonb) from public, anon, authenticated;

alter table public.site_pages enable row level security;
alter table public.site_page_versions enable row level security;
revoke all on public.site_pages, public.site_page_versions from anon, authenticated;
grant select on public.site_pages, public.site_page_versions to authenticated;
-- All writes go through transactional, tenant-authorized RPCs below. No client receives table DML grants.
drop policy if exists site_pages_member_read on public.site_pages;
drop policy if exists site_pages_manager_read on public.site_pages;
create policy site_pages_manager_read on public.site_pages for select to authenticated
  using (public.can_manage_tenant_site_pages(org_id));
drop policy if exists site_pages_manager_insert on public.site_pages;
drop policy if exists site_pages_manager_update on public.site_pages;
drop policy if exists site_page_versions_member_read on public.site_page_versions;
drop policy if exists site_page_versions_manager_read on public.site_page_versions;
create policy site_page_versions_manager_read on public.site_page_versions for select to authenticated
  using (public.can_manage_tenant_site_pages(org_id));
drop policy if exists site_page_versions_manager_insert on public.site_page_versions;

create or replace function public.save_tenant_site_page_draft(p_page_id uuid, p_slug text, p_title text, p_blocks jsonb)
returns table (page_id uuid, draft_version_id uuid, version_number integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_user_id uuid := auth.uid();
  v_page_id uuid;
  v_version_id uuid;
  v_version_number integer;
begin
  if v_user_id is null or v_org_id is null or not public.can_manage_tenant_site_pages(v_org_id) then
    raise exception 'Not authorized to manage site pages';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 180
    or coalesce(p_slug, '') !~ '^[a-z0-9][a-z0-9-]{0,119}$'
    or not public.is_valid_tenant_site_blocks(p_blocks) then
    raise exception 'Invalid site page draft';
  end if;
  if p_page_id is null then
    insert into public.site_pages(org_id, slug, title, created_by, updated_by)
      values (v_org_id, p_slug, trim(p_title), v_user_id, v_user_id) returning id into v_page_id;
  else
    select p.id into v_page_id from public.site_pages p where p.id = p_page_id and p.org_id = v_org_id for update;
    if v_page_id is null then raise exception 'Site page not found'; end if;
    update public.site_pages p set slug = p_slug, title = trim(p_title), updated_by = v_user_id, updated_at = now()
      where p.id = v_page_id and p.org_id = v_org_id;
  end if;
  select coalesce(max(v.version_number), 0) + 1 into v_version_number
    from public.site_page_versions v where v.page_id = v_page_id and v.org_id = v_org_id;
  insert into public.site_page_versions(page_id, org_id, version_number, title, slug, blocks, created_by)
    values (v_page_id, v_org_id, v_version_number, trim(p_title), p_slug, p_blocks, v_user_id)
    returning id into v_version_id;
  update public.site_pages p set draft_version_id = v_version_id, updated_by = v_user_id, updated_at = now()
    where p.id = v_page_id and p.org_id = v_org_id;
  return query select v_page_id, v_version_id, v_version_number;
end;
$$;
revoke all on function public.save_tenant_site_page_draft(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_tenant_site_page_draft(uuid, text, text, jsonb) to authenticated;

create or replace function public.publish_tenant_site_page(p_page_id uuid)
returns table (page_id uuid, published_version_id uuid, published_at timestamptz, title text, slug text)
language plpgsql security definer set search_path = public
as $$
declare
  v_page public.site_pages%rowtype;
  v_version public.site_page_versions%rowtype;
  v_published_at timestamptz := now();
begin
  if auth.uid() is null or not public.can_manage_tenant_site_pages(public.current_org_id()) then
    raise exception 'Not authorized to publish site pages';
  end if;
  select p.* into v_page from public.site_pages p
    where p.id = p_page_id and p.org_id = public.current_org_id() for update;
  if not found or v_page.draft_version_id is null then raise exception 'Saved draft not found'; end if;
  select v.* into v_version from public.site_page_versions v
    where v.id = v_page.draft_version_id and v.page_id = v_page.id and v.org_id = v_page.org_id;
  if not found or not public.is_valid_tenant_site_blocks(v_version.blocks) then raise exception 'Draft version is invalid'; end if;
  update public.site_pages set published_version_id = v_version.id, published_at = v_published_at,
    published_by = auth.uid(), updated_by = auth.uid(), updated_at = v_published_at
    where id = v_page.id and org_id = v_page.org_id;
  return query select v_page.id, v_version.id, v_published_at, v_version.title, v_version.slug;
end;
$$;
revoke all on function public.publish_tenant_site_page(uuid) from public, anon;
grant execute on function public.publish_tenant_site_page(uuid) to authenticated;

-- Anonymous access returns only the immutable version currently designated as published.
create or replace function public.get_published_site_page(p_org_slug text, p_page_slug text)
returns table (title text, slug text, blocks jsonb, published_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select v.title, v.slug, v.blocks, p.published_at
  from public.site_pages p
  join public.site_page_versions v on v.id = p.published_version_id and v.page_id = p.id and v.org_id = p.org_id
  join public.saas_org_settings s on s.org_id = p.org_id
  where lower(s.slug) = lower(trim(p_org_slug))
    and v.slug = lower(trim(p_page_slug))
    and p.published_version_id is not null and p.published_at is not null
    and coalesce(s.status, 'active') not in ('suspended', 'disabled', 'closed')
    and public.is_valid_tenant_site_blocks(v.blocks)
  limit 1;
$$;
revoke all on function public.get_published_site_page(text, text) from public, authenticated;
grant execute on function public.get_published_site_page(text, text) to anon;

notify pgrst, 'reload schema';
commit;
