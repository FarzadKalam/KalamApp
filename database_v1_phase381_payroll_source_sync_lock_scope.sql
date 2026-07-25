-- Phase 381: همگام‌سازی سیستمی منابع فیش نباید با قفل عمومی رکوردها متوقف شود.
-- این استثنا فقط در تراکنش امن ساخت، حذف یا لغو فیش فعال است و برای ویرایش عادی قابل استفاده نیست.

begin;

do $$
begin
  if to_regprocedure('public._create_payroll_slip_from_wizard_internal(jsonb,uuid[],uuid[],uuid[],uuid[])') is null then
    if to_regprocedure('public.create_payroll_slip_from_wizard(jsonb,uuid[],uuid[],uuid[],uuid[])') is null then
      raise exception 'payroll_wizard_function_not_found';
    end if;

    alter function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[])
      rename to _create_payroll_slip_from_wizard_internal;
  end if;
end;
$$;

revoke all on function public._create_payroll_slip_from_wizard_internal(jsonb, uuid[], uuid[], uuid[], uuid[])
  from public, anon, authenticated;

create or replace function public.create_payroll_slip_from_wizard(
  p_payload jsonb,
  p_ledger_entry_ids uuid[] default array[]::uuid[],
  p_bonus_request_ids uuid[] default array[]::uuid[],
  p_penalty_request_ids uuid[] default array[]::uuid[],
  p_advance_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- فقط تا پایان همین تراکنش، تغییر اتصال اقلام منبع به فیش مجاز است.
  perform set_config('app.payroll_source_sync', 'active', true);

  return public._create_payroll_slip_from_wizard_internal(
    p_payload,
    p_ledger_entry_ids,
    p_bonus_request_ids,
    p_penalty_request_ids,
    p_advance_ids
  );
end;
$$;

revoke all on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[])
  from public, anon;
grant execute on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) to authenticated;

do $$
begin
  if to_regprocedure('public._release_payroll_sources_internal(uuid,uuid)') is null then
    if to_regprocedure('public.release_payroll_sources(uuid,uuid)') is null then
      raise exception 'payroll_source_release_function_not_found';
    end if;

    alter function public.release_payroll_sources(uuid, uuid)
      rename to _release_payroll_sources_internal;
  end if;
end;
$$;

revoke all on function public._release_payroll_sources_internal(uuid, uuid)
  from public, anon, authenticated;

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
  -- حذف و لغو نیز باید همان اقلام را بدون گیرکردن روی قفل آزاد کنند.
  perform set_config('app.payroll_source_sync', 'active', true);
  perform public._release_payroll_sources_internal(p_org_id, p_payroll_slip_id);
end;
$$;

revoke all on function public.release_payroll_sources(uuid, uuid) from public, anon, authenticated;

create or replace function public.prevent_locked_record_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean := false;
  v_payroll_source_sync boolean := false;
begin
  if tg_op not in ('UPDATE', 'DELETE') then
    return coalesce(new, old);
  end if;

  -- قفل، ویرایش عادی را حفظ می‌کند؛ فقط اتصال/آزادسازی سیستمی منابع همان فیش استثناست.
  if tg_op = 'UPDATE'
    and current_setting('app.payroll_source_sync', true) = 'active'
  then
    v_payroll_source_sync := case tg_table_name
      when 'payroll_calculation_entries' then
        (to_jsonb(new) - array['status', 'payroll_slip_id', 'updated_at'])
          is not distinct from
        (to_jsonb(old) - array['status', 'payroll_slip_id', 'updated_at'])
      when 'employee_bonus_requests' then
        (to_jsonb(new) - array['related_payroll_slip_id', 'updated_at'])
          is not distinct from
        (to_jsonb(old) - array['related_payroll_slip_id', 'updated_at'])
      when 'employee_penalty_requests' then
        (to_jsonb(new) - array['related_payroll_slip_id', 'updated_at'])
          is not distinct from
        (to_jsonb(old) - array['related_payroll_slip_id', 'updated_at'])
      when 'employee_advances' then
        (to_jsonb(new) - array['related_payroll_slip_id', 'updated_at'])
          is not distinct from
        (to_jsonb(old) - array['related_payroll_slip_id', 'updated_at'])
      when 'commission_drafts' then
        (to_jsonb(new) - array['posted_amount', 'remaining_amount', 'draft_status', 'updated_at'])
          is not distinct from
        (to_jsonb(old) - array['posted_amount', 'remaining_amount', 'draft_status', 'updated_at'])
      else false
    end;

    if v_payroll_source_sync then
      return new;
    end if;
  end if;

  select exists (
    select 1
    from public.record_locks rl
    where rl.org_id = old.org_id
      and rl.record_id = old.id
      and (
        rl.module_id = tg_table_name
        or rl.metadata ->> 'table_name' = tg_table_name
      )
  )
  into v_locked;

  if v_locked then
    raise exception 'این رکورد قفل شده و قابل تغییر یا حذف نیست.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- قفل رکوردی که قبلاً حذف شده دیگر معنا ندارد و نباید اثر جانبی ایجاد کند.
select public.cleanup_orphan_record_locks();

notify pgrst, 'reload schema';

commit;
