-- TazeSystem - Phase 236
-- جدول webhooks خروجی برای ارسال رویدادها به سیستم‌های خارجی

begin;

create table if not exists public.org_webhooks (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  name          text,
  url           text        not null,
  secret        text        not null,
  events        text[]      not null default '{}',
  tables        text[]      not null default '{}',
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  last_fired_at timestamptz,
  last_status   int
);

alter table public.org_webhooks enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'org_webhooks' and policyname = 'org_members_manage_webhooks'
  ) then
    create policy "org_members_manage_webhooks" on public.org_webhooks
      using (org_id = public.current_org_id())
      with check (org_id = public.current_org_id());
  end if;
end $$;

create index if not exists org_webhooks_org_active_idx
  on public.org_webhooks(org_id) where is_active = true;

grant select, insert, update, delete on public.org_webhooks to authenticated;
grant select, insert, update, delete on public.org_webhooks to service_role;

commit;
