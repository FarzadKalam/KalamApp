-- Phase 429: Per-organization automatic delivery for work schedules.
-- The schedule is stored on each work schedule and dispatched by the central interval runner.

begin;

alter table public.work_schedules
  add column if not exists notification_schedule jsonb not null default '{}'::jsonb,
  add column if not exists notification_last_run_at timestamptz null,
  add column if not exists notification_server_queued_at timestamptz null,
  add column if not exists notification_last_sent_at timestamptz null,
  add column if not exists notification_error text null;

create index if not exists idx_work_schedules_notification_queue
  on public.work_schedules (notification_server_queued_at)
  where notification_server_queued_at is not null and is_active = true;

create index if not exists idx_work_schedules_org_notification_schedule
  on public.work_schedules (org_id, is_active, notification_last_run_at)
  where is_active = true;

create or replace function public.claim_work_schedule_notification_run(
  p_schedule_id uuid,
  p_expected_last_run_at timestamptz,
  p_claimed_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  update public.work_schedules
  set
    notification_last_run_at = coalesce(p_claimed_at, now()),
    notification_server_queued_at = null,
    notification_error = null,
    updated_at = now()
  where id = p_schedule_id
    and is_active = true
    and status = 'active'
    and lower(coalesce(notification_schedule->>'enabled', 'false')) = 'true'
    and notification_last_run_at is not distinct from p_expected_last_run_at;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.claim_work_schedule_notification_run(uuid, timestamptz, timestamptz) from public;
revoke all on function public.claim_work_schedule_notification_run(uuid, timestamptz, timestamptz) from authenticated;

create or replace function public.queue_due_interval_workflows()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_tehran timestamp := v_now at time zone 'Asia/Tehran';
  v_hour integer := extract(hour from v_tehran)::integer;
begin
  update public.workflows w
  set server_queued_at = v_now
  where w.is_active = true
    and w.trigger_type = 'interval'
    and w.server_queued_at is null
    and public.workflow_interval_scheduled_due_at(w.last_run_at, w.interval_value::integer, w.interval_unit, w.interval_at, w.interval_first_run_at, w.interval_minute, w.interval_day_of_month, v_now) is not null
    and (
      (w.interval_allowed_from_hour is null and w.interval_allowed_to_hour is null)
      or (w.interval_allowed_from_hour is not null and w.interval_allowed_to_hour is not null and ((w.interval_allowed_from_hour <= w.interval_allowed_to_hour and v_hour between w.interval_allowed_from_hour and w.interval_allowed_to_hour) or (w.interval_allowed_from_hour > w.interval_allowed_to_hour and (v_hour >= w.interval_allowed_from_hour or v_hour <= w.interval_allowed_to_hour))))
      or (w.interval_allowed_from_hour is not null and w.interval_allowed_to_hour is null and v_hour >= w.interval_allowed_from_hour)
      or (w.interval_allowed_from_hour is null and w.interval_allowed_to_hour is not null and v_hour <= w.interval_allowed_to_hour)
    );

  update public.report_definitions r
  set server_queued_at = v_now
  where r.is_active = true
    and r.server_queued_at is null
    and lower(coalesce(r.config->'schedule'->>'enabled', 'false')) = 'true'
    and (
      (jsonb_typeof(coalesce(r.config->'schedule'->'recipient_user_ids', '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(r.config->'schedule'->'recipient_user_ids', '[]'::jsonb)) > 0)
      or (jsonb_typeof(coalesce(r.config->'schedule'->'bot_group_ids', '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(r.config->'schedule'->'bot_group_ids', '[]'::jsonb)) > 0)
    )
    and public.workflow_interval_scheduled_due_at(r.last_run_at, case when coalesce(r.config->'schedule'->>'interval_value', '') ~ '^[0-9]+$' then greatest(1, (r.config->'schedule'->>'interval_value')::integer) else 1 end, coalesce(nullif(r.config->'schedule'->>'interval_unit', ''), 'day'), null, null, null, null, v_now) is not null;

  update public.work_schedules s
  set notification_server_queued_at = v_now
  where s.is_active = true
    and s.status = 'active'
    and s.notification_server_queued_at is null
    and lower(coalesce(s.notification_schedule->>'enabled', 'false')) = 'true'
    and (
      (jsonb_typeof(coalesce(s.notification_schedule->'recipient_user_ids', '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(s.notification_schedule->'recipient_user_ids', '[]'::jsonb)) > 0)
      or (jsonb_typeof(coalesce(s.notification_schedule->'bot_group_ids', '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(s.notification_schedule->'bot_group_ids', '[]'::jsonb)) > 0)
    )
    and (s.effective_from is null or s.effective_from <= v_tehran::date)
    and (s.effective_to is null or s.effective_to >= v_tehran::date)
    and public.workflow_interval_scheduled_due_at(
      s.notification_last_run_at,
      case when coalesce(s.notification_schedule->>'interval_value', '') ~ '^[0-9]+$' then greatest(1, (s.notification_schedule->>'interval_value')::integer) else 1 end,
      case when lower(coalesce(s.notification_schedule->>'interval_unit', '')) = 'hour' then 'hour' else 'day' end,
      nullif(s.notification_schedule->>'interval_at', ''),
      nullif(s.notification_schedule->>'first_run_at', '')::timestamptz,
      case when lower(coalesce(s.notification_schedule->>'interval_unit', '')) = 'hour' and coalesce(s.notification_schedule->>'interval_at', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then split_part(s.notification_schedule->>'interval_at', ':', 2)::integer else null end,
      null,
      v_now
    ) is not null;
end;
$$;

revoke all on function public.queue_due_interval_workflows() from public;
revoke all on function public.queue_due_interval_workflows() from authenticated;

commit;
