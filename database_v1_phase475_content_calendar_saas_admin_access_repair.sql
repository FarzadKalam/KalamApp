-- تقویت دسترسی تقویم محتوایی: مدیر SaaS جاری، علاوه بر قابلیت پلن،
-- همان دسترسی کامل عملیاتی سایر ماژول‌ها را دارد. دادهٔ tenant همچنان
-- فقط با org_id سازمان جاری قابل دسترسی است.

begin;

create or replace function public.current_user_can_access_content_calendar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.current_org_id() is not null
    and (
      public.current_org_has_plan_feature('content_calendar', false)
      or exists (
        select 1
        from public.profiles profile_row
        join public.org_roles role_row
          on role_row.id = profile_row.role_id
         and role_row.org_id = profile_row.org_id
        where profile_row.id = auth.uid()
          and profile_row.org_id = public.current_org_id()
          and (
            lower(coalesce(role_row.permissions -> '__saas_admin' ->> 'view', 'false')) = 'true'
            or lower(coalesce(role_row.permissions -> '__saas_admin' ->> 'edit', 'false')) = 'true'
          )
      )
    );
$$;

revoke all on function public.current_user_can_access_content_calendar() from public, anon;
grant execute on function public.current_user_can_access_content_calendar() to authenticated;

drop policy if exists content_calendars_org_select on public.content_calendars;
create policy content_calendars_org_select on public.content_calendars
for select to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_can_access_content_calendar()
  and public.current_user_has_role_permission_entry('content_calendars', 'view', null, true)
);

drop policy if exists content_calendars_org_insert on public.content_calendars;
create policy content_calendars_org_insert on public.content_calendars
for insert to authenticated
with check (
  org_id = public.current_org_id()
  and public.current_user_can_access_content_calendar()
  and public.current_user_has_role_permission_entry('content_calendars', 'edit', null, true)
);

drop policy if exists content_calendars_org_update on public.content_calendars;
create policy content_calendars_org_update on public.content_calendars
for update to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_can_access_content_calendar()
  and public.current_user_has_role_permission_entry('content_calendars', 'edit', null, true)
)
with check (
  org_id = public.current_org_id()
  and public.current_user_can_access_content_calendar()
  and public.current_user_has_role_permission_entry('content_calendars', 'edit', null, true)
);

drop policy if exists content_calendars_org_delete on public.content_calendars;
create policy content_calendars_org_delete on public.content_calendars
for delete to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_can_access_content_calendar()
  and public.current_user_has_role_permission_entry('content_calendars', 'delete', null, true)
);

-- نقش‌های SaaS Admin موجود نیز در صورت cache شدن نقش یا ساخته‌شدن بعد از phase 474،
-- مجوز صریح ماژول و فیلدهای ارتباطی را دریافت می‌کنند.
update public.org_roles role_row
set permissions = jsonb_set(
  jsonb_set(
    jsonb_set(
      coalesce(role_row.permissions, '{}'::jsonb),
      '{content_calendars}',
      '{"view":true,"edit":true,"delete":true}'::jsonb,
      true
    ),
    '{projects,fields,content_calendar_id}',
    'true'::jsonb,
    true
  ),
  '{tasks,fields,content_calendar_id}',
  'true'::jsonb,
  true
)
where lower(coalesce(role_row.permissions -> '__saas_admin' ->> 'view', 'false')) = 'true'
   or lower(coalesce(role_row.permissions -> '__saas_admin' ->> 'edit', 'false')) = 'true';

notify pgrst, 'reload schema';
commit;
