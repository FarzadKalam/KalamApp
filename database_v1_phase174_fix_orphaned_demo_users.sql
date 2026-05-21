-- =====================================================
-- KalamApp - Phase 174: Fix Orphaned Demo Users (No org_id)
-- Date: 2026-05-21
-- Type: Emergency fix / idempotent
-- Problem:
--   Users who started the demo onboarding wizard but hit an error
--   mid-way ended up with auth.users + profiles rows but no org_id.
--   These orphaned sessions hammer the server with failed requests,
--   exhausting the HTTP/2 connection pool and degrading performance
--   for all users — causing ERR_HTTP2_PROTOCOL_ERROR across the board.
--
-- Fix strategy:
--   1. Link profiles to org via saas_demo_issuance (most reliable)
--   2. Link profiles to org via org_roles.org_id
--   3. Report any remaining orphaned users (require manual SaaS admin action)
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۱. لینک از saas_demo_issuance
--    کاربرانی که دمو گرفتند ولی profile.org_id ست نشد
-- ─────────────────────────────────────────────
update public.profiles p
set org_id = d.org_id
from public.saas_demo_issuance d
where d.auth_user_id = p.id
  and p.org_id is null
  and d.org_id is not null;

-- ─────────────────────────────────────────────
-- ۲. لینک از org_roles
--    کاربرانی که role_id دارند و role به org متصل است
-- ─────────────────────────────────────────────
update public.profiles p
set org_id = r.org_id
from public.org_roles r
where p.role_id = r.id
  and p.org_id is null
  and r.org_id is not null;

-- ─────────────────────────────────────────────
-- ۳. گزارش وضعیت نهایی
-- ─────────────────────────────────────────────
do $$
declare
  orphan_count integer;
begin
  select count(*) into orphan_count
  from public.profiles p
  left join public.org_roles r on r.id = p.role_id
  where coalesce(p.org_id, r.org_id) is null;

  if orphan_count > 0 then
    raise notice 'هنوز % کاربر بدون سازمان وجود دارد.', orphan_count;
    raise notice 'برای دیدن لیست:';
    raise notice 'SELECT p.id, p.full_name, p.created_at FROM public.profiles p LEFT JOIN public.org_roles r ON r.id = p.role_id WHERE coalesce(p.org_id, r.org_id) IS NULL;';
  else
    raise notice 'همه کاربران به سازمانی متصل هستند. مشکل برطرف شد.';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
