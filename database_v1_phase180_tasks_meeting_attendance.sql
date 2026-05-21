-- phase 180: meeting attendance columns on tasks
-- سه ستون آرایه UUID برای حاضران در جلسه (کارکنان، مشتریان، تامین‌کنندگان)
-- فقط هنگامی که task_type در ['جلسه داخلی', 'جلسه خارجی'] باشد استفاده می‌شود

alter table public.tasks
  add column if not exists meeting_employee_ids uuid[] default null,
  add column if not exists meeting_customer_ids uuid[] default null,
  add column if not exists meeting_supplier_ids uuid[] default null;

-- index روی ستون‌های جدید برای جستجوی سریع
create index if not exists idx_tasks_meeting_employee_ids
  on public.tasks using gin (meeting_employee_ids)
  where meeting_employee_ids is not null;

create index if not exists idx_tasks_meeting_customer_ids
  on public.tasks using gin (meeting_customer_ids)
  where meeting_customer_ids is not null;

create index if not exists idx_tasks_meeting_supplier_ids
  on public.tasks using gin (meeting_supplier_ids)
  where meeting_supplier_ids is not null;

-- RLS برای tasks از قبل وجود دارد (org_id = current_org_id())
-- ستون‌های جدید به‌صورت خودکار تحت همان policy قرار می‌گیرند
