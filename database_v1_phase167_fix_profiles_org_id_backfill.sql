-- =====================================================
-- KalamApp - Phase 167 Fix: backfill profiles.org_id
-- Date: 2026-05-20
-- Type: Data repair / idempotent
-- Goal: Phase 159 added profiles.org_id but did not backfill existing rows.
--       Phase 163 introduced current_org_id() which reads profiles.org_id.
--       When profiles.org_id is NULL, current_org_id() returns NULL, and the
--       org_stories INSERT policy (org_id = current_org_id()) evaluates to NULL
--       (not TRUE), blocking all story creation for legacy users.
--       This migration backfills profiles.org_id from org_roles and also
--       strengthens the trigger to keep it populated going forward.
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۱. backfill: از طریق role_id → org_roles.org_id
-- ─────────────────────────────────────────────
update public.profiles p
set org_id = r.org_id
from public.org_roles r
where r.id = p.role_id
  and p.org_id is null
  and r.org_id is not null;

-- ─────────────────────────────────────────────
-- ۲. fallback: اگر role_id ندارند ولی در organizations هستند
--    (از جدول organizations با join به profiles از طریق email)
-- ─────────────────────────────────────────────
-- (intentionally left for manual review — only run if needed)
-- update public.profiles p
-- set org_id = <known_org_id>
-- where p.org_id is null;

-- ─────────────────────────────────────────────
-- ۳. تابع کمکی: هنگام ثبت/ویرایش profile، org_id را از نقش می‌گیرد
-- ─────────────────────────────────────────────
create or replace function public.sync_profile_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- اگر org_id مستقیم در row ست شده، همان را نگه می‌داریم
  if NEW.org_id is not null then
    return NEW;
  end if;

  -- در غیر این صورت از org_roles می‌گیریم
  if NEW.role_id is not null then
    select r.org_id
      into NEW.org_id
    from public.org_roles r
    where r.id = NEW.role_id
    limit 1;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_profile_org_id on public.profiles;
create trigger trg_sync_profile_org_id
  before insert or update of role_id
  on public.profiles
  for each row
  execute function public.sync_profile_org_id();

-- ─────────────────────────────────────────────
-- ۴. بررسی: چند پروفایل هنوز org_id ندارند؟
--    (اطلاعاتی — خطا نمی‌دهد)
-- ─────────────────────────────────────────────
do $$
declare
  v_null_count integer;
begin
  select count(*) into v_null_count
  from public.profiles
  where org_id is null;

  if v_null_count > 0 then
    raise warning 'Phase 167: % profile(s) still have org_id = NULL after backfill. These users may not have a valid role_id. Manual fix may be needed.', v_null_count;
  else
    raise notice 'Phase 167: All profiles now have org_id set.';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
