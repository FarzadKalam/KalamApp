-- ایجاد تقویم محتوایی از SmartForm عمومی باید مانند سایر رکوردهای tenant،
-- سازمان جاری را از context امن نشست دریافت کند.

begin;

alter table public.content_calendars
  alter column org_id set default public.current_org_id();

commit;
