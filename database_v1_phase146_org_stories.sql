-- =====================================================
-- KalamApp - Phase 146 Org Stories
-- Date: 2026-05-14
-- Type: Additive / non-breaking migration
-- Goal: Add Instagram-like story system for organizations
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- جدول اصلی استوری‌ها
-- ─────────────────────────────────────────────
create table if not exists public.org_stories (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  creator_id      uuid not null,
  creator_name    text,
  creator_avatar  text,

  -- محتوا: آرایه‌ای از اسلایدها (هر اسلاید: image یا gradient + لایه‌های متن)
  slides          jsonb not null default '[]'::jsonb,
  --  ساختار هر slide:
  --  {
  --    "id": "uuid",
  --    "type": "image" | "gradient",
  --    "image_url": "...",        -- URL فایل آپلود‌شده
  --    "file_id": "...",          -- اگر از record_files پروژه انتخاب شده
  --    "gradient_key": "...",     -- کلید از STORY_GRADIENT_PRESETS
  --    "text_layers": [
  --      {
  --        "id": "uuid",
  --        "content": "...",      -- متن (می‌تواند @mention داشته باشد)
  --        "x": 50,               -- موقعیت افقی (درصد از چپ)
  --        "y": 50,               -- موقعیت عمودی (درصد از بالا)
  --        "font_size": 18,
  --        "color": "#FFFFFF",
  --        "align": "center",
  --        "bold": false
  --      }
  --    ],
  --    "duration_ms": 5000
  --  }

  -- دسترسی مشاهده
  is_org_wide       boolean not null default true,    -- همه اعضای سازمان
  viewer_user_ids   uuid[] not null default '{}',     -- کاربران خاص
  viewer_role_ids   uuid[] not null default '{}',     -- نقش‌های خاص

  -- منشن‌ها
  mention_user_ids  uuid[] not null default '{}',
  mention_role_ids  uuid[] not null default '{}',

  -- زمان‌بندی
  published_at      timestamptz not null default now(),
  expires_at        timestamptz,          -- null = بدون انقضا
  is_pinned         boolean not null default false,
  is_active         boolean not null default true,

  -- آمار
  view_count        integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- جدول بازدیدها
-- ─────────────────────────────────────────────
create table if not exists public.org_story_views (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references public.org_stories(id) on delete cascade,
  user_id    uuid not null,
  viewed_at  timestamptz not null default now(),
  unique (story_id, user_id)
);

-- ─────────────────────────────────────────────
-- جدول واکنش‌ها (ایموجی / لایک)
-- ─────────────────────────────────────────────
create table if not exists public.org_story_reactions (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references public.org_stories(id) on delete cascade,
  user_id    uuid not null,
  user_name  text,
  emoji      text not null default '❤️',
  created_at timestamptz not null default now(),
  unique (story_id, user_id)
);

-- ─────────────────────────────────────────────
-- ایندکس‌ها
-- ─────────────────────────────────────────────
create index if not exists idx_org_stories_org_active
  on public.org_stories(org_id, is_active, published_at desc);

create index if not exists idx_org_stories_org_expires
  on public.org_stories(org_id, expires_at)
  where expires_at is not null;

create index if not exists idx_org_story_views_story
  on public.org_story_views(story_id);

create index if not exists idx_org_story_views_user
  on public.org_story_views(user_id);

create index if not exists idx_org_story_reactions_story
  on public.org_story_reactions(story_id);

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
alter table public.org_stories          enable row level security;
alter table public.org_story_views      enable row level security;
alter table public.org_story_reactions  enable row level security;

create policy p_org_stories_auth_all
  on public.org_stories for all to authenticated
  using (true) with check (true);

create policy p_org_story_views_auth_all
  on public.org_story_views for all to authenticated
  using (true) with check (true);

create policy p_org_story_reactions_auth_all
  on public.org_story_reactions for all to authenticated
  using (true) with check (true);

-- ─────────────────────────────────────────────
-- تابع auto-expire: غیرفعال‌سازی خودکار استوری‌های منقضی‌شده
-- ─────────────────────────────────────────────
create or replace function public.deactivate_expired_org_stories()
returns void
language sql
security definer
as $$
  update public.org_stories
  set is_active = false, updated_at = now()
  where is_active = true
    and expires_at is not null
    and expires_at <= now();
$$;

-- ─────────────────────────────────────────────
-- تابع ثبت بازدید + افزایش شمارنده
-- ─────────────────────────────────────────────
create or replace function public.record_story_view(
  p_story_id uuid,
  p_user_id  uuid
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.org_story_views (story_id, user_id)
  values (p_story_id, p_user_id)
  on conflict (story_id, user_id) do nothing;

  if found then
    update public.org_stories
    set view_count = view_count + 1, updated_at = now()
    where id = p_story_id;
  end if;
end;
$$;

commit;
