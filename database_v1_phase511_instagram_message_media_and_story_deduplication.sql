-- رسانه‌های دایرکت و زمینهٔ استوری را به‌صورت مستقل از payload خام نگه می‌داریم.
-- این اطلاعات برای هر سازمان جداست و از همان RLS جدول‌های موجود استفاده می‌کند.
begin;

alter table public.instagram_messages
  add column if not exists attachment_url text,
  add column if not exists attachment_thumbnail_url text,
  add column if not exists shared_permalink text,
  add column if not exists shared_media_type text check (shared_media_type in ('post', 'reel', 'story'));

alter table public.instagram_contacts
  add column if not exists profile_lookup_requested_at timestamptz;

alter table public.instagram_interaction_events
  add column if not exists source_message_id text,
  add column if not exists media_thumbnail_url text,
  add column if not exists media_expires_at timestamptz;

alter table public.instagram_messages
  drop constraint if exists instagram_messages_message_type_check;
alter table public.instagram_messages
  add constraint instagram_messages_message_type_check
  check (message_type in ('text', 'button', 'image', 'file', 'audio', 'video', 'share', 'other'));

-- یک پیام دریافتی فقط یک‌بار برای هر نوع رویداد وارد موتور گردش‌کار می‌شود.
-- مقدار NULL آزاد است تا رویدادهای قدیمی و رویدادهای بدون شناسهٔ پیام همچنان ثبت شوند.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'instagram_interaction_events_source_message_unique'
      and conrelid = 'public.instagram_interaction_events'::regclass
  ) then
    alter table public.instagram_interaction_events
      add constraint instagram_interaction_events_source_message_unique
      unique (org_id, event_type, source_message_id);
  end if;
end;
$$;

create index if not exists idx_instagram_messages_org_shared_permalink
  on public.instagram_messages(org_id, shared_permalink)
  where shared_permalink is not null;
create index if not exists idx_instagram_contacts_org_profile_lookup
  on public.instagram_contacts(org_id, profile_lookup_requested_at, id)
  where username is null;
create index if not exists idx_instagram_events_org_story_expiry
  on public.instagram_interaction_events(org_id, media_type, media_expires_at desc, occurred_at desc)
  where media_type = 'story';

notify pgrst, 'reload schema';
commit;
