-- محتوای سایت/SEO محصولات، جدا از فیلدهای عملیاتی CRM و در محدودهٔ هر سازمان.
begin;

create table if not exists public.product_site_content (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  title text not null default '',
  short_description text not null default '',
  description text not null default '',
  slug text not null default '',
  seo_title text not null default '',
  seo_description text not null default '',
  focus_keyword text not null default '',
  site_image_url text not null default '',
  site_image_alt text not null default '',
  status text not null default 'draft' check (status in ('draft', 'review')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, product_id),
  constraint product_site_content_slug_format check (slug = '' or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create unique index if not exists product_site_content_org_slug_unique
  on public.product_site_content (org_id, slug) where slug <> '';
create index if not exists product_site_content_org_updated_idx
  on public.product_site_content (org_id, updated_at desc);

-- RLS helper: mirrors products.view/edit semantics, with owner/admin roles allowed.
create or replace function public.can_access_product_site_content(p_org_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_action in ('view', 'edit') and exists (
    select 1
    from public.user_organization_memberships m
    left join public.org_roles r on r.id = m.role_id and r.org_id = m.org_id
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and p_org_id = public.current_org_id()
      and case
        when m.is_owner = true or lower(coalesce(m.software_role, '')) in ('super_admin', 'admin', 'manager') then true
        else coalesce((r.permissions -> 'products' ->> p_action)::boolean, true)
      end
  ), false);
$$;
revoke all on function public.can_access_product_site_content(uuid, text) from public, anon;
grant execute on function public.can_access_product_site_content(uuid, text) to authenticated;

alter table public.product_site_content enable row level security;
revoke all on public.product_site_content from anon, authenticated;
grant select, insert, update, delete on public.product_site_content to authenticated;

drop policy if exists product_site_content_org_member_select on public.product_site_content;
create policy product_site_content_org_member_select
  on public.product_site_content for select to authenticated
  using (public.can_access_product_site_content(org_id, 'view'));

drop policy if exists product_site_content_org_member_insert on public.product_site_content;
create policy product_site_content_org_member_insert
  on public.product_site_content for insert to authenticated
  with check (
    public.can_access_product_site_content(org_id, 'edit')
    and exists (
      select 1 from public.products p
      where p.id = product_site_content.product_id and p.org_id = product_site_content.org_id
    )
  );

drop policy if exists product_site_content_org_member_update on public.product_site_content;
create policy product_site_content_org_member_update
  on public.product_site_content for update to authenticated
  using (public.can_access_product_site_content(org_id, 'edit'))
  with check (
    public.can_access_product_site_content(org_id, 'edit')
    and exists (
      select 1 from public.products p
      where p.id = product_site_content.product_id and p.org_id = product_site_content.org_id
    )
  );

drop policy if exists product_site_content_org_member_delete on public.product_site_content;
create policy product_site_content_org_member_delete
  on public.product_site_content for delete to authenticated
  using (public.can_access_product_site_content(org_id, 'edit'));

commit;
