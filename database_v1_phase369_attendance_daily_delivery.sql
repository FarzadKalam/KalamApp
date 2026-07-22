-- ارسال روزانه برنامه حضور؛ تنظیمات کاملاً per-org و لینک کوتاه، محدود به دریافت‌کننده
begin;

create table if not exists public.attendance_daily_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  title text not null default 'برنامه روزانه حضور',
  is_active boolean not null default true,
  recipient_user_ids jsonb not null default '[]'::jsonb,
  delivery_channels jsonb not null default '["note"]'::jsonb,
  interval_at time not null default '08:00',
  include_pending_leaves boolean not null default false,
  last_run_at timestamptz,
  schedule_last_sent_at timestamptz,
  schedule_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_attendance_daily_deliveries_queue
  on public.attendance_daily_deliveries(org_id, is_active, last_run_at) where is_active = true;

alter table public.attendance_daily_deliveries enable row level security;
drop policy if exists p_attendance_daily_deliveries_org_all on public.attendance_daily_deliveries;
create policy p_attendance_daily_deliveries_org_all on public.attendance_daily_deliveries
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());
grant select, insert, update, delete on public.attendance_daily_deliveries to authenticated;

-- کد کوتاه به دریافت‌کننده متصل است؛ forward کردن لینک بدون همان حساب کاربری مجاز نیست.
create table if not exists public.attendance_daily_delivery_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  delivery_id uuid not null references public.attendance_daily_deliveries(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_attendance_delivery_short_code check (code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{7,12}$')
);
create unique index if not exists ux_attendance_daily_delivery_links_recipient
  on public.attendance_daily_delivery_links(delivery_id, recipient_user_id);
create index if not exists idx_attendance_daily_delivery_links_code_active
  on public.attendance_daily_delivery_links(code) where is_active = true;
alter table public.attendance_daily_delivery_links enable row level security;
create policy p_attendance_daily_delivery_links_recipient_select on public.attendance_daily_delivery_links
for select to authenticated using (recipient_user_id = auth.uid() and org_id = public.current_org_id());

notify pgrst, 'reload schema';
commit;
