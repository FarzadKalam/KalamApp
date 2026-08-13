-- زمینهٔ رسانه برای شرط‌های گردش‌کار اینستاگرام.
-- این migration فقط دادهٔ قابل‌خواندن انسان را به رویداد اضافه می‌کند تا بتوان
-- برای پست یا استوری مشخص، بدون نمایش شناسهٔ داخلی، قانون ساخت.

begin;

alter table public.instagram_interaction_events
  add column if not exists media_type text check (media_type in ('post', 'reel', 'story')),
  add column if not exists media_caption text,
  add column if not exists media_permalink text;

create index if not exists idx_instagram_events_org_media_context
  on public.instagram_interaction_events(org_id, event_type, media_type, occurred_at desc, id desc);

notify pgrst, 'reload schema';
commit;
