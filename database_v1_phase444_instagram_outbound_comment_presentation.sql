-- نمایش پاسخ‌های ارسال‌شده از سامانه در کنار کامنت‌های دریافتی، بدون ساخت مسیر دادهٔ جداگانه.
begin;

alter table public.instagram_comments
  add column if not exists direction text not null default 'inbound';

alter table public.instagram_comments
  add column if not exists sent_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'instagram_comments_direction_check'
      and conrelid = 'public.instagram_comments'::regclass
  ) then
    alter table public.instagram_comments
      add constraint instagram_comments_direction_check check (direction in ('inbound', 'outbound'));
  end if;
end $$;

create index if not exists idx_instagram_comments_media_direction_time
  on public.instagram_comments(org_id, media_id, direction, commented_at desc, id desc);

commit;
