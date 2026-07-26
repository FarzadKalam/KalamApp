-- پاک‌سازی یک‌بارهٔ همهٔ محاسبه‌های پورسانت برای شروع مجدد
-- فیش‌های دارای پورسانت ابتدا باطل می‌شوند تا مبلغ قدیمی در فیش فعال نماند.
-- این migration عمداً داده‌های پورسانت تمام سازمان‌ها را حذف می‌کند.

begin;

-- باطل‌سازی، trigger آزادسازی منبع را اجرا می‌کند؛ بنابراین فیش فعال با
-- مبلغ پورسانت قدیمی باقی نمی‌ماند و فیش جدید بعداً از اطلاعات تازه ساخته می‌شود.
update public.payroll_slips slip
set status = 'canceled', updated_at = now()
where coalesce(slip.status, 'draft') <> 'canceled'
  and exists (
    select 1
    from public.payroll_calculation_entries entry
    where entry.org_id = slip.org_id
      and entry.source_type = 'commission'
      and (
        entry.payroll_slip_id = slip.id
        or entry.id::text in (
          select snapshot_entry.value
          from jsonb_array_elements_text(coalesce(slip.performance_snapshot->'payroll_ledger_entry_ids', '[]'::jsonb)) as snapshot_entry(value)
        )
      )
  );

-- پیش‌نویس‌ها و ثبت‌های پورسانت پیشین دیگر نباید در محاسبهٔ جدید دخالت کنند.
delete from public.commission_drafts;

delete from public.payroll_calculation_entries
where source_type = 'commission';

commit;
