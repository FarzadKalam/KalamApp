-- phase 180: add extended interval scheduling fields to workflows table
-- supports: first run time, minute-level scheduling, time windows, day-of-month, day conditions

alter table public.workflows
  add column if not exists interval_first_run_at   timestamptz  default null,
  add column if not exists interval_minute          smallint     default null check (interval_minute is null or (interval_minute >= 0 and interval_minute <= 59)),
  add column if not exists interval_allowed_from_hour smallint   default null check (interval_allowed_from_hour is null or (interval_allowed_from_hour >= 0 and interval_allowed_from_hour <= 23)),
  add column if not exists interval_allowed_to_hour   smallint   default null check (interval_allowed_to_hour is null or (interval_allowed_to_hour >= 0 and interval_allowed_to_hour <= 23)),
  add column if not exists interval_day_of_month    smallint     default null check (interval_day_of_month is null or (interval_day_of_month >= 1 and interval_day_of_month <= 31)),
  add column if not exists interval_day_condition   text         default null,
  add column if not exists interval_days_after_holiday smallint  default null check (interval_days_after_holiday is null or interval_days_after_holiday >= 0);

comment on column public.workflows.interval_first_run_at       is 'earliest timestamp the interval workflow may first execute';
comment on column public.workflows.interval_minute             is 'for hour-unit: minute within each hour to run (0-59)';
comment on column public.workflows.interval_allowed_from_hour  is 'for hour-unit: start of allowed execution window (0-23)';
comment on column public.workflows.interval_allowed_to_hour    is 'for hour-unit: end of allowed execution window (0-23)';
comment on column public.workflows.interval_day_of_month       is 'for month-unit: day of month to execute (1-31)';
comment on column public.workflows.interval_day_condition      is 'day type guard: any|is_friday|not_friday|is_friday_or_holiday|not_friday_or_holiday|is_saturday|not_saturday|...';
comment on column public.workflows.interval_days_after_holiday is 'when day condition excludes holidays: run N days after the last friday/holiday';
