-- =====================================================
-- KalamApp - Phase 45 Price Lists and Sales Packages
-- Date: 2026-03-25
-- Type: Additive / idempotent migration
-- Goal: add price lists and extend product bundles for sales packages
-- =====================================================

begin;

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid()
);

alter table public.price_lists
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists status text not null default 'active',
  add column if not exists description text,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.price_lists
set
  name = coalesce(name, ''),
  status = case
    when coalesce(nullif(status, ''), 'active') in ('active', 'draft') then coalesce(nullif(status, ''), 'active')
    else 'active'
  end,
  items = coalesce(items, '[]'::jsonb)
where
  name is null
  or status is null
  or status = ''
  or status not in ('active', 'draft')
  or items is null;

alter table public.price_lists
  alter column name set default '',
  alter column name set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column items set default '[]'::jsonb,
  alter column items set not null;

create index if not exists idx_price_lists_org_name
  on public.price_lists(org_id, name);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_price_lists_updated_at on public.price_lists;
    create trigger trg_price_lists_updated_at
      before update on public.price_lists
      for each row execute function public.set_updated_at();
  end if;
end $$;

grant select, insert, update, delete on public.price_lists to authenticated, service_role;

alter table public.price_lists enable row level security;

drop policy if exists p_price_lists_org_all on public.price_lists;
create policy p_price_lists_org_all on public.price_lists
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

alter table public.product_bundles
  add column if not exists name text not null default '',
  add column if not exists image_url text,
  add column if not exists status text not null default 'active';

update public.product_bundles
set
  name = coalesce(nullif(name, ''), nullif(bundle_number, ''), ''),
  status = case
    when coalesce(nullif(status, ''), 'active') in ('active', 'draft') then coalesce(nullif(status, ''), 'active')
    else 'active'
  end
where
  name is null
  or name = ''
  or status is null
  or status = ''
  or status not in ('active', 'draft');

alter table public.product_bundles
  alter column name set default '',
  alter column name set not null,
  alter column status set default 'active',
  alter column status set not null;

create index if not exists idx_product_bundles_org_name
  on public.product_bundles(org_id, name);

commit;
