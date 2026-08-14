-- پیج‌های یک سازمان باید پیش از اولین دایرکت هم برای کاربران مجاز صندوق اینستاگرام قابل مشاهده باشند.
-- خود گفتگوها و پیام‌ها همچنان با دسترسی شرطی/رکوردی کنترل می‌شوند.
begin;

drop policy if exists instagram_accounts_org_select on public.instagram_accounts;
create policy instagram_accounts_org_select
on public.instagram_accounts
for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.kalam_can_view_instagram_org(org_id)
);

notify pgrst, 'reload schema';
commit;
