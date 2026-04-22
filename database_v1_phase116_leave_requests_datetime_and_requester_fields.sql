-- =====================================================
-- KalamApp - Phase 116 Leave Requests Datetime and Requester Fields
-- Date: 2026-04-21
-- Type: Additive / focused migration
-- Goal: align leave request config with datetime range and manual requester/employee names
-- =====================================================

begin;

alter table public.leave_requests
  add column if not exists employee_name text,
  add column if not exists requester_name text,
  add column if not exists total_hours numeric(10,2) not null default 0;

alter table public.leave_requests
  alter column start_date type timestamptz using start_date::timestamptz,
  alter column end_date type timestamptz using end_date::timestamptz,
  alter column total_hours set default 0;

update public.leave_requests
set total_hours = coalesce(total_hours, 0)
where total_hours is null;

alter table public.leave_requests
  alter column total_hours set not null;

commit;
