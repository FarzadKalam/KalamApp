-- Phase 489: همگام‌سازی مسئول عمومی و رابطه‌های سوابق درخواست تغییر وضعیت تابلو

begin;

alter table public.billboard_status_changes
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text;

create or replace function public.normalize_billboard_status_change_record()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_billboard_name text;
begin
  select coalesce(nullif(trim(name), ''), 'تابلو')
    into v_billboard_name
  from public.billboards
  where id = new.billboard_id and org_id = new.org_id;

  new.title := concat('تغییر وضعیت ', coalesce(v_billboard_name, 'تابلو'), ' به ', public.billboard_operational_status_label(new.target_status));
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, new.requested_by, auth.uid());
  end if;
  new.assignee_id := coalesce(new.assignee_id, new.created_by, new.requested_by, auth.uid());
  new.assignee_type := case when new.assignee_id is null then null else 'user' end;
  new.updated_by := coalesce(auth.uid(), new.updated_by, new.requested_by);
  return new;
end;
$$;

update public.billboard_status_changes
set
  created_by = coalesce(created_by, requested_by),
  assignee_id = coalesce(assignee_id, created_by, requested_by),
  assignee_type = case when coalesce(assignee_id, created_by, requested_by) is null then null else 'user' end
where created_by is null or assignee_id is null or assignee_type is distinct from 'user';

-- این جدول بعد از راه‌اندازی موتور عمومی ثبت تغییرات ایجاد شده بود؛ آن را
-- صریحاً به همان موتور متصل می‌کنیم تا ایجاد، تأیید و هر تغییر بعدی تاریخچهٔ واحد داشته باشد.
drop trigger if exists trg_kalam_record_audit_fields_before on public.billboard_status_changes;
create trigger trg_kalam_record_audit_fields_before
  before insert or update on public.billboard_status_changes
  for each row execute function public.kalam_record_audit_fields_before();

drop trigger if exists trg_kalam_record_activity_after on public.billboard_status_changes;
create trigger trg_kalam_record_activity_after
  after insert or update or delete on public.billboard_status_changes
  for each row execute function public.kalam_record_activity_after();

notify pgrst, 'reload schema';
commit;
