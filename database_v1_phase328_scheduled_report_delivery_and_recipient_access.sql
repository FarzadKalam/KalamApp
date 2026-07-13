-- Phase 328: Per-organization scheduled report delivery and recipient-only access.
-- Existing reports remain available to roles that have the explicit all-reports permission.

begin;

create index if not exists idx_report_definitions_schedule_recipients
  on public.report_definitions using gin ((config #> '{schedule,recipient_user_ids}'));

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
end;
$$;

revoke all on function public.queue_due_interval_workflows() from public;
revoke all on function public.queue_due_interval_workflows() from authenticated;

drop policy if exists p_report_definitions_org_all on public.report_definitions;
drop policy if exists p_report_definitions_select_scoped on public.report_definitions;
drop policy if exists p_report_definitions_insert_manage on public.report_definitions;
drop policy if exists p_report_definitions_update_manage on public.report_definitions;
drop policy if exists p_report_definitions_delete_manage on public.report_definitions;

create policy p_report_definitions_select_scoped
on public.report_definitions
for select
using (
  org_id = public.current_org_id()
  and (
    public.current_user_has_role_permission_entry('__reports', 'view', 'all_reports', true)
    or (
      lower(coalesce(config #>> '{schedule,enabled}', 'false')) = 'true'
      and coalesce(config #> '{schedule,recipient_user_ids}', '[]'::jsonb) @> jsonb_build_array(auth.uid()::text)
    )
  )
);

create policy p_report_definitions_insert_manage
on public.report_definitions
for insert
with check (
  org_id = public.current_org_id()
  and public.current_user_has_role_permission_entry('__reports', 'edit', 'builder_page', true)
  and public.current_user_has_role_permission_entry('__reports', 'view', 'all_reports', true)
);

create policy p_report_definitions_update_manage
on public.report_definitions
for update
using (
  org_id = public.current_org_id()
  and public.current_user_has_role_permission_entry('__reports', 'edit', 'builder_page', true)
  and public.current_user_has_role_permission_entry('__reports', 'view', 'all_reports', true)
)
with check (
  org_id = public.current_org_id()
  and public.current_user_has_role_permission_entry('__reports', 'edit', 'builder_page', true)
  and public.current_user_has_role_permission_entry('__reports', 'view', 'all_reports', true)
);

create policy p_report_definitions_delete_manage
on public.report_definitions
for delete
using (
  org_id = public.current_org_id()
  and public.current_user_has_role_permission_entry('__reports', 'delete', null, true)
  and public.current_user_has_role_permission_entry('__reports', 'view', 'all_reports', true)
);

commit;
