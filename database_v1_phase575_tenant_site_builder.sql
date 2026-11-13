-- Phase 575: tenant-scoped site builder MVP (public URL uses explicit organization slug; no Host inference).
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
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (page_id, version_number),
  unique (id, page_id, org_id),
  foreign key (page_id, org_id) references public.site_pages(id, org_id) on delete cascade
);

alter table public.site_pages
  add constraint site_pages_draft_version_fk
  foreign key (draft_version_id, id, org_id)
  references public.site_page_versions(id, page_id, org_id) on delete restrict;
alter table public.site_pages
  add constraint site_pages_published_version_fk
  foreign key (published_version_id, id, org_id)
  references public.site_page_versions(id, page_id, org_id) on delete restrict;
create index if not exists site_page_versions_page_created_idx
  on public.site_page_versions(page_id, created_at desc);

create or replace function public.can_manage_tenant_site_pages(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.user_organization_memberships m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and p_org_id = public.current_org_id()
      and (m.is_owner = true or lower(coalesce(m.software_role, '')) in ('super_admin', 'admin', 'manager'))
  ), false);
$$;
revoke all on function public.can_manage_tenant_site_pages(uuid) from public, anon;
grant execute on function public.can_manage_tenant_site_pages(uuid) to authenticated;

alter table public.site_pages enable row level security;
alter table public.site_page_versions enable row level security;
revoke all on public.site_pages, public.site_page_versions from anon, authenticated;
grant select, insert, update on public.site_pages to authenticated;
-- Version rows are append-only: the UI can read/insert versions but cannot mutate or delete history.
grant select, insert on public.site_page_versions to authenticated;

create policy site_pages_manager_read on public.site_pages for select to authenticated
using (public.can_manage_tenant_site_pages(org_id));
create policy site_pages_manager_insert on public.site_pages for insert to authenticated
with check (public.can_manage_tenant_site_pages(org_id));
create policy site_pages_manager_update on public.site_pages for update to authenticated
using (public.can_manage_tenant_site_pages(org_id))
with check (public.can_manage_tenant_site_pages(org_id));

create policy site_page_versions_manager_read on public.site_page_versions for select to authenticated
using (public.can_manage_tenant_site_pages(org_id));
create policy site_page_versions_manager_insert on public.site_page_versions for insert to authenticated
with check (
  public.can_manage_tenant_site_pages(org_id)
  and exists (
    select 1 from public.site_pages p where p.id = site_page_versions.page_id and p.org_id = site_page_versions.org_id
  )
);

-- Stable explicit organization slug lookup; never trusts Origin/Host. Only the currently published version is returned.
create or replace function public.get_published_site_page(p_org_slug text, p_page_slug text)
returns table (title text, slug text, blocks jsonb, published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.title, p.slug, v.blocks, p.published_at
  from public.site_pages p
  join public.site_page_versions v on v.id = p.published_version_id and v.page_id = p.id and v.org_id = p.org_id
  join public.saas_org_settings s on s.org_id = p.org_id
  where lower(s.slug) = lower(trim(p_org_slug))
    and p.slug = lower(trim(p_page_slug))
    and p.published_version_id is not null
    and p.published_at is not null
    and coalesce(s.status, 'active') not in ('suspended', 'disabled', 'closed')
  limit 1;
$$;
revoke all on function public.get_published_site_page(text, text) from public, authenticated;
grant execute on function public.get_published_site_page(text, text) to anon;

notify pgrst, 'reload schema';
commit;
