-- =====================================================
-- KalamApp - Phase 120
-- Web forms: current employee defaults + attendance datetime repair
-- =====================================================

begin;

alter table public.attendance_logs
  add column if not exists actual_check_in_time timestamptz,
  add column if not exists actual_check_out_time timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'attendance_logs'
      and column_name = 'actual_check_in_time'
      and data_type = 'time without time zone'
  ) then
    alter table public.attendance_logs
      alter column actual_check_in_time type timestamptz
      using case
        when actual_check_in_time is null then null
        else (
          ((coalesce(occurred_at, now()) at time zone 'Asia/Tehran')::date + actual_check_in_time)
          at time zone 'Asia/Tehran'
        )
      end;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'attendance_logs'
      and column_name = 'actual_check_out_time'
      and data_type = 'time without time zone'
  ) then
    alter table public.attendance_logs
      alter column actual_check_out_time type timestamptz
      using case
        when actual_check_out_time is null then null
        else (
          ((coalesce(occurred_at, now()) at time zone 'Asia/Tehran')::date + actual_check_out_time)
          at time zone 'Asia/Tehran'
        )
      end;
  end if;
end;
$$;

create or replace function public.sync_attendance_actual_times()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.log_type, '') = 'check_in' then
    new.actual_check_in_time := coalesce(new.actual_check_in_time, new.occurred_at, now());
    if tg_op = 'UPDATE' and new.actual_check_out_time is null and old.actual_check_out_time is not null then
      new.actual_check_out_time := old.actual_check_out_time;
    end if;
  elsif coalesce(new.log_type, '') = 'check_out' then
    new.actual_check_out_time := coalesce(new.actual_check_out_time, new.occurred_at, now());
    if tg_op = 'UPDATE' and new.actual_check_in_time is null and old.actual_check_in_time is not null then
      new.actual_check_in_time := old.actual_check_in_time;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_attendance_logs_sync_actual_times on public.attendance_logs;
create trigger trg_attendance_logs_sync_actual_times
before insert or update on public.attendance_logs
for each row
execute function public.sync_attendance_actual_times();

update public.attendance_logs
set
  actual_check_in_time = case
    when log_type = 'check_in' and actual_check_in_time is null then coalesce(occurred_at, now())
    else actual_check_in_time
  end,
  actual_check_out_time = case
    when log_type = 'check_out' and actual_check_out_time is null then coalesce(occurred_at, now())
    else actual_check_out_time
  end;

create or replace function public.apply_web_form_current_employee_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.web_forms%rowtype;
  v_field record;
  v_employee_id uuid;
  v_auth_user_id uuid := auth.uid();
  v_target_table text := '';
  v_target_record_id text := '';
  v_column_exists boolean := false;
begin
  if coalesce(new.status, '') <> 'submitted' then
    return new;
  end if;

  v_target_table := trim(coalesce(new.target_module_id, ''));
  v_target_record_id := trim(coalesce(new.target_record_id::text, ''));
  if v_target_table = '' or v_target_record_id = '' then
    return new;
  end if;

  select *
    into v_form
  from public.web_forms
  where id = new.web_form_id
  limit 1;

  if v_form.id is null or coalesce(v_form.access_scope, 'public') <> 'internal' then
    return new;
  end if;

  for v_field in
    select wff.*
    from public.web_form_fields wff
    where wff.web_form_id = new.web_form_id
      and wff.is_active = true
      and coalesce(wff.field_type, '') = 'relation'
      and coalesce(wff.config->>'default_to_current_employee', '') = 'true'
      and trim(coalesce(wff.target_field_key, '')) <> ''
  loop
    select exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_target_table
        and c.column_name = v_field.target_field_key
    )
    into v_column_exists;

    if not v_column_exists then
      continue;
    end if;

    if v_auth_user_id is null then
      raise exception 'WEB_FORM_CURRENT_EMPLOYEE_AUTH_REQUIRED';
    end if;

    select e.id
      into v_employee_id
    from public.employees e
    where e.related_profile_id = v_auth_user_id
      and (new.org_id is null or e.org_id = new.org_id)
    order by e.updated_at desc nulls last, e.created_at desc nulls last
    limit 1;

    if v_employee_id is null then
      raise exception 'WEB_FORM_CURRENT_EMPLOYEE_NOT_FOUND';
    end if;

    execute format(
      'update public.%1$I set %2$I = $1 where id = $2::uuid',
      v_target_table,
      v_field.target_field_key
    )
    using v_employee_id, v_target_record_id;

    new.record_payload := coalesce(new.record_payload, '{}'::jsonb)
      || jsonb_build_object(v_field.target_field_key, v_employee_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_web_form_submissions_current_employee_defaults on public.web_form_submissions;
create trigger trg_web_form_submissions_current_employee_defaults
before insert on public.web_form_submissions
for each row
execute function public.apply_web_form_current_employee_defaults();

notify pgrst, 'reload schema';

commit;
