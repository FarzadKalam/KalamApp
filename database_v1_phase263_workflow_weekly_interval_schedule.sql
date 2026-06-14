-- TazeSystem V1 Phase 263
-- Add weekly workflow scheduling while preserving the existing Tehran-time anchor.

begin;

alter table if exists public.workflows
  drop constraint if exists workflows_interval_unit_check;

alter table if exists public.workflows
  add constraint workflows_interval_unit_check
  check (interval_unit is null or interval_unit in ('hour', 'day', 'week', 'month'));

create or replace function public.workflow_interval_scheduled_due_at(
  p_last_run_at timestamptz,
  p_interval_value integer,
  p_interval_unit text,
  p_interval_at text,
  p_interval_first_run_at timestamptz,
  p_interval_minute integer,
  p_interval_day_of_month integer,
  p_now timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit text := lower(coalesce(nullif(p_interval_unit, ''), 'day'));
  v_value integer := greatest(coalesce(p_interval_value, 1), 1);
  v_now_local timestamp := p_now at time zone 'Asia/Tehran';
  v_anchor timestamptz;
  v_candidate_local timestamp;
  v_candidate timestamptz;
  v_due timestamptz := null;
  v_time_text text;
  v_time_match text[];
  v_hour integer := null;
  v_minute integer := null;
  v_month_days integer;
  v_target_day integer;
  v_i integer;
begin
  if v_unit not in ('hour', 'day', 'week', 'month') then
    v_unit := 'day';
  end if;

  v_time_text := translate(
    coalesce(p_interval_at, ''),
    '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩',
    '01234567890123456789'
  );
  v_time_match := regexp_match(v_time_text, '^\s*(\d{1,2})\s*:\s*(\d{1,2})');
  if v_time_match is not null then
    v_hour := v_time_match[1]::integer;
    v_minute := v_time_match[2]::integer;
    if v_hour < 0 or v_hour > 23 or v_minute < 0 or v_minute > 59 then
      v_hour := null;
      v_minute := null;
    end if;
  end if;

  if p_last_run_at is null then
    if p_interval_first_run_at is not null then
      if p_now < p_interval_first_run_at then
        return null;
      end if;
      if v_unit <> 'week' then
        v_anchor := p_interval_first_run_at;
        v_due := p_interval_first_run_at;
      end if;
    end if;

    if v_anchor is null then
      if v_unit = 'hour' then
        if p_interval_minute is null then
          return p_now;
        end if;
        v_candidate_local := date_trunc('hour', v_now_local)
          + make_interval(mins => least(greatest(p_interval_minute, 0), 59));
        v_candidate := v_candidate_local at time zone 'Asia/Tehran';
        if v_candidate <= p_now then
          return v_candidate;
        end if;
        return null;
      elsif v_unit in ('day', 'week') then
        if v_hour is null or v_minute is null then
          return p_now;
        end if;
        v_candidate_local := date_trunc('day', v_now_local)
          + make_interval(hours => v_hour, mins => v_minute);
        v_candidate := v_candidate_local at time zone 'Asia/Tehran';
        if v_candidate <= p_now then
          return v_candidate;
        end if;
        return null;
      else
        if p_interval_day_of_month is not null then
          v_month_days := extract(day from (
            date_trunc('month', v_now_local) + interval '1 month' - interval '1 day'
          ))::integer;
          v_target_day := least(greatest(p_interval_day_of_month, 1), v_month_days);
          if extract(day from v_now_local)::integer <> v_target_day then
            return null;
          end if;
        end if;

        if v_hour is null or v_minute is null then
          return p_now;
        end if;
        v_candidate_local := date_trunc('day', v_now_local)
          + make_interval(hours => v_hour, mins => v_minute);
        v_candidate := v_candidate_local at time zone 'Asia/Tehran';
        if v_candidate <= p_now then
          return v_candidate;
        end if;
        return null;
      end if;
    end if;
  else
    v_anchor := p_last_run_at;
  end if;

  v_candidate_local := v_anchor at time zone 'Asia/Tehran';

  for v_i in 1..10000 loop
    if v_unit = 'hour' then
      v_candidate_local := v_candidate_local + make_interval(hours => v_value);
      if p_interval_minute is not null then
        v_candidate_local := date_trunc('hour', v_candidate_local)
          + make_interval(mins => least(greatest(p_interval_minute, 0), 59));
      end if;
    elsif v_unit = 'day' then
      v_candidate_local := v_candidate_local + make_interval(days => v_value);
      if v_hour is not null and v_minute is not null then
        v_candidate_local := date_trunc('day', v_candidate_local)
          + make_interval(hours => v_hour, mins => v_minute);
      end if;
    elsif v_unit = 'week' then
      v_candidate_local := v_candidate_local + make_interval(days => v_value * 7);
      if v_hour is not null and v_minute is not null then
        v_candidate_local := date_trunc('day', v_candidate_local)
          + make_interval(hours => v_hour, mins => v_minute);
      end if;
    else
      v_candidate_local := v_candidate_local + make_interval(months => v_value);
      if p_interval_day_of_month is not null then
        v_month_days := extract(day from (
          date_trunc('month', v_candidate_local) + interval '1 month' - interval '1 day'
        ))::integer;
        v_target_day := least(greatest(p_interval_day_of_month, 1), v_month_days);
        v_candidate_local := date_trunc('month', v_candidate_local)
          + make_interval(days => v_target_day - 1)
          + (v_candidate_local - date_trunc('day', v_candidate_local));
      end if;
      if v_hour is not null and v_minute is not null then
        v_candidate_local := date_trunc('day', v_candidate_local)
          + make_interval(hours => v_hour, mins => v_minute);
      end if;
    end if;

    v_candidate := v_candidate_local at time zone 'Asia/Tehran';
    if v_candidate <= v_anchor then
      continue;
    end if;
    if v_candidate > p_now then
      exit;
    end if;
    v_due := v_candidate;
  end loop;

  return v_due;
end;
$$;

revoke all on function public.workflow_interval_scheduled_due_at(
  timestamptz,
  integer,
  text,
  text,
  timestamptz,
  integer,
  integer,
  timestamptz
) from public;

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
    and public.workflow_interval_scheduled_due_at(
      w.last_run_at,
      w.interval_value::integer,
      w.interval_unit,
      w.interval_at,
      w.interval_first_run_at,
      w.interval_minute,
      w.interval_day_of_month,
      v_now
    ) is not null
    and (
      (w.interval_allowed_from_hour is null and w.interval_allowed_to_hour is null)
      or (
        w.interval_allowed_from_hour is not null
        and w.interval_allowed_to_hour is not null
        and (
          (
            w.interval_allowed_from_hour <= w.interval_allowed_to_hour
            and v_hour between w.interval_allowed_from_hour and w.interval_allowed_to_hour
          )
          or (
            w.interval_allowed_from_hour > w.interval_allowed_to_hour
            and (v_hour >= w.interval_allowed_from_hour or v_hour <= w.interval_allowed_to_hour)
          )
        )
      )
      or (
        w.interval_allowed_from_hour is not null
        and w.interval_allowed_to_hour is null
        and v_hour >= w.interval_allowed_from_hour
      )
      or (
        w.interval_allowed_from_hour is null
        and w.interval_allowed_to_hour is not null
        and v_hour <= w.interval_allowed_to_hour
      )
    );
end;
$$;

revoke all on function public.queue_due_interval_workflows() from public;
revoke all on function public.queue_due_interval_workflows() from authenticated;

comment on column public.workflows.interval_unit is
  'Supported workflow interval units: hour, day, week, month';

commit;
