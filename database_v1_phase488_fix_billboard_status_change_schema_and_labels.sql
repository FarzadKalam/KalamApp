-- Phase 488: تکمیل ستون‌های استاندارد و عنوان فارسی تغییر وضعیت تابلو

begin;

alter table public.billboard_status_changes
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create or replace function public.billboard_operational_status_label(p_status text)
returns text
language sql
immutable
set search_path = public
as $$
  select case trim(coalesce(p_status, ''))
    when 'free' then 'آزاد'
    when 'oral_reserve' then 'رزرو شفاهی'
    when 'final_reserve' then 'رزرو قطعی'
    when 'in_line' then 'در صف نصب'
    when 'opening' then 'در حال اکران'
    when 'near_finish' then 'نزدیک به اتمام'
    when 'opening_deadline_ended' then 'پایان مهلت اکران'
    when 'pickup_queue' then 'در صف جمع‌آوری'
    when 'inactive' then 'غیرفعال'
    when 'blocked' then 'مسدود'
    else 'وضعیت تعریف‌نشده'
  end;
$$;

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
  new.updated_by := coalesce(auth.uid(), new.updated_by, new.requested_by);
  return new;
end;
$$;

drop trigger if exists trg_normalize_billboard_status_change_record on public.billboard_status_changes;
create trigger trg_normalize_billboard_status_change_record
  before insert or update of billboard_id, org_id, target_status on public.billboard_status_changes
  for each row execute function public.normalize_billboard_status_change_record();

-- داده‌های ثبت‌شده با عنوان داخلی نیز با همان منبع فارسی اصلاح می‌شوند.
update public.billboard_status_changes
set target_status = target_status;

notify pgrst, 'reload schema';
commit;
