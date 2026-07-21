-- آزادسازی کامل منابع فیش حذف/لغوشده و ترمیم اقلام گیرکرده
-- قابل اجرا به‌صورت تکراری و محدود به رکوردهای همان سازمان

begin;

create or replace function public.release_payroll_sources(
  p_org_id uuid,
  p_payroll_slip_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null or p_payroll_slip_id is null then return; end if;

  -- پورسانت‌های همین فیش باید از وضعیت «ثبت‌شده» خارج شوند؛ در غیر این صورت
  -- مانده صفر باقی می‌ماند و دکمه «لحاظ» اثری نخواهد داشت.
  with released_commission_keys as (
    select distinct nullif(trim(line->>'source_key'), '') as source_key
    from public.payroll_calculation_entries entry
    cross join lateral jsonb_array_elements(coalesce(entry.details->'rows', '[]'::jsonb)) invoice_row
    cross join lateral jsonb_array_elements(coalesce(invoice_row->'lines', '[]'::jsonb)) line
    where entry.org_id = p_org_id
      and entry.payroll_slip_id = p_payroll_slip_id
      and entry.source_type = 'commission'
  )
  update public.commission_drafts draft
  set
    posted_amount = 0,
    remaining_amount = greatest(0, coalesce(draft.entitled_amount, 0)),
    draft_status = 'draft',
    updated_at = now()
  where draft.org_id = p_org_id
    and draft.source_key in (select source_key from released_commission_keys where source_key is not null);

  -- پیش‌نویس یعنی برای افزودن دوباره به فیش آماده است؛ proposed در رابط به
  -- معنای «آماده فیش» است و دکمه افزودن را بی‌دلیل غیرفعال می‌کرد.
  update public.payroll_calculation_entries
  set
    status = case when status = 'included_in_payroll' then 'draft' else status end,
    payroll_slip_id = null,
    updated_at = now()
  where org_id = p_org_id
    and payroll_slip_id = p_payroll_slip_id;

  update public.employee_bonus_requests
  set related_payroll_slip_id = null, updated_at = now()
  where org_id = p_org_id and related_payroll_slip_id = p_payroll_slip_id;

  update public.employee_penalty_requests
  set related_payroll_slip_id = null, updated_at = now()
  where org_id = p_org_id and related_payroll_slip_id = p_payroll_slip_id;

  update public.employee_advances
  set related_payroll_slip_id = null, updated_at = now()
  where org_id = p_org_id and related_payroll_slip_id = p_payroll_slip_id;
end;
$$;

create or replace function public.release_payroll_sources_on_remove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := case when tg_op = 'DELETE' then old.org_id else new.org_id end;
  v_payroll_slip_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  perform public.release_payroll_sources(v_org_id, v_payroll_slip_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.release_payroll_sources(uuid, uuid) from public;
revoke all on function public.release_payroll_sources_on_remove() from public;

drop trigger if exists trg_payroll_slips_release_sources_before_delete on public.payroll_slips;
drop trigger if exists trg_payroll_slips_release_sources_after_cancel on public.payroll_slips;
create trigger trg_payroll_slips_release_sources_before_delete
before delete on public.payroll_slips
for each row execute function public.release_payroll_sources_on_remove();
create trigger trg_payroll_slips_release_sources_after_cancel
after update of status on public.payroll_slips
for each row
when (lower(coalesce(new.status, '')) = 'canceled' and lower(coalesce(old.status, '')) is distinct from 'canceled')
execute function public.release_payroll_sources_on_remove();

-- فیش‌هایی که پیش از نصب trigger حذف شده‌اند، ممکن است ردیف‌های وابسته را
-- باقی گذاشته باشند. همه آن‌ها یک‌بار به‌صورت امن آزاد می‌شوند.
do $$
declare
  orphan_row record;
begin
  for orphan_row in
    select distinct org_id, payroll_slip_id
    from (
      select org_id, payroll_slip_id from public.payroll_calculation_entries where payroll_slip_id is not null
      union
      select org_id, related_payroll_slip_id as payroll_slip_id from public.employee_bonus_requests where related_payroll_slip_id is not null
      union
      select org_id, related_payroll_slip_id as payroll_slip_id from public.employee_penalty_requests where related_payroll_slip_id is not null
      union
      select org_id, related_payroll_slip_id as payroll_slip_id from public.employee_advances where related_payroll_slip_id is not null
    ) linked_source
    where not exists (
      select 1 from public.payroll_slips slip
      where slip.id = linked_source.payroll_slip_id
        and slip.org_id = linked_source.org_id
    )
  loop
    perform public.release_payroll_sources(orphan_row.org_id, orphan_row.payroll_slip_id);
  end loop;
end;
$$;

-- اجرای نسخه‌های قدیمی ممکن بود foreign key را null کند یا ردیف را proposed
-- بگذارد؛ هر دو باید دوباره «پیش‌نویسِ قابل افزودن» باشند، نه ثبت‌شده در فیش.
with releasable_commission_keys as (
  select distinct nullif(trim(line->>'source_key'), '') as source_key
  from public.payroll_calculation_entries entry
  cross join lateral jsonb_array_elements(coalesce(entry.details->'rows', '[]'::jsonb)) invoice_row
  cross join lateral jsonb_array_elements(coalesce(invoice_row->'lines', '[]'::jsonb)) line
  where entry.source_type = 'commission'
    and entry.payroll_slip_id is null
    and entry.status in ('draft', 'proposed', 'included_in_payroll')
)
update public.commission_drafts draft
set
  posted_amount = 0,
  remaining_amount = greatest(0, coalesce(draft.entitled_amount, 0)),
  draft_status = 'draft',
  updated_at = now()
where draft.source_key in (select source_key from releasable_commission_keys where source_key is not null);

update public.payroll_calculation_entries
set
  status = 'draft',
  payroll_slip_id = null,
  updated_at = now()
where payroll_slip_id is null
  and status in ('proposed', 'included_in_payroll');

notify pgrst, 'reload schema';

commit;
