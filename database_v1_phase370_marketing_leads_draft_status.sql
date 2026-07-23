-- وضعیت «پیش‌نویس» برای لیدهای بازاریابی
-- این تغییر برای اجرای مجدد امن است و وضعیت‌های قبلی را حفظ می‌کند.

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.marketing_leads') is null then
    return;
  end if;

  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.marketing_leads'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.marketing_leads drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.marketing_leads
  drop constraint if exists marketing_leads_status_check_v2;

alter table public.marketing_leads
  add constraint marketing_leads_status_check_v2
  check (
    status in (
      'draft',
      'new',
      'in_follow_up',
      'overdue_follow_up',
      'future_follow_up',
      'won',
      'lost'
    )
  );
