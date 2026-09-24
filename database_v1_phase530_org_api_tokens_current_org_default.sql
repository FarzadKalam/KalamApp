-- TazeSystem - Phase 530
-- جلوگیری از ایجاد توکن اتصال بدون سازمان جاری

begin;

alter table if exists public.org_api_tokens
  alter column org_id set default public.current_org_id();

commit;
