-- تکمیل فیلدهای سیستمی و مجوز ساخت تقویم محتوایی.
-- این migration فقط ساختار جدید را تکمیل می‌کند و برای اجراهای تکراری امن است.

begin;

alter table public.content_calendars
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

update public.content_calendars
set updated_by = created_by
where updated_by is null
  and created_by is not null;

-- مجوز «ایجاد» در کنار مشاهده/ویرایش/حذف به نقش‌های SaaS Admin افزوده می‌شود.
-- policy فقط در سازمان جاری و همراه کنترل role اجرا می‌شود.
update public.org_roles role_row
set permissions = jsonb_set(
  coalesce(role_row.permissions, '{}'::jsonb),
  '{content_calendars}',
  coalesce(role_row.permissions -> 'content_calendars', '{}'::jsonb)
    || '{"view":true,"create":true,"edit":true,"delete":true}'::jsonb,
  true
)
where lower(coalesce(role_row.permissions -> '__saas_admin' ->> 'view', 'false')) = 'true'
   or lower(coalesce(role_row.permissions -> '__saas_admin' ->> 'edit', 'false')) = 'true';

drop policy if exists content_calendars_org_insert on public.content_calendars;
create policy content_calendars_org_insert on public.content_calendars
for insert to authenticated
with check (
  org_id = public.current_org_id()
  and public.current_user_can_access_content_calendar()
  and public.current_user_has_role_permission_entry('content_calendars', 'create', null, true)
);

notify pgrst, 'reload schema';
commit;
