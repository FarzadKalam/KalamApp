-- Reject stale commission previews across periods; never overwrite financial history silently.
begin;

create or replace function public.guard_commission_calculation_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_snapshot jsonb;
begin
  if new.source_type is distinct from 'commission'
    and (tg_op = 'INSERT' or old.source_type is distinct from 'commission') then return new; end if;
  if new.org_id is null or new.org_id is distinct from public.current_org_id() then
    raise exception 'commission_calculation_not_allowed';
  end if;
  if tg_op = 'UPDATE' and (new.org_id is distinct from old.org_id
    or new.employee_id is distinct from old.employee_id or new.source_type is distinct from old.source_type) then
    raise exception 'commission_calculation_scope_immutable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('commission-employee:' || new.org_id::text || ':' || new.employee_id::text, 0));
  -- Existing payroll functions authorize their lifecycle updates separately.
  -- Release included -> draft with payroll_slip_id cleared must remain possible.
  -- No financial field/period/source may change through this lifecycle exception.
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - array['status','updated_at','payroll_slip_id'])
      is not distinct from (to_jsonb(old) - array['status','updated_at','payroll_slip_id'])
    and (new.status = old.status
      or (old.status <> 'voided' and new.status in ('included_in_payroll','voided'))
      or (old.status = 'included_in_payroll' and new.status in ('proposed','draft') and new.payroll_slip_id is null)) then
    return new;
  end if;
  if public.current_user_has_role_permission_entry('payroll_slips', 'edit', null, true) is not true then
    raise exception 'commission_calculation_not_allowed';
  end if;
  if not exists(select 1 from public.employees where id = new.employee_id and org_id = new.org_id) then
    raise exception 'commission_employee_not_found';
  end if;
  if tg_op = 'UPDATE' and old.status = 'included_in_payroll' then
    raise exception 'commission_already_in_payroll';
  end if;
  if tg_op = 'UPDATE' and old.status = 'voided' then
    raise exception 'commission_voided_history_immutable';
  end if;
  v_snapshot := new.details->'ledger_snapshot';
  if jsonb_typeof(v_snapshot) is distinct from 'array' then
    raise exception 'commission_preview_stale';
  end if;
  if exists (
    with expected as (
      select (x->>'id')::uuid id, (x->>'updated_at')::timestamptz updated_at
      from jsonb_array_elements(v_snapshot) x
    ), actual as (
      select id, updated_at from public.payroll_calculation_entries
      where org_id = new.org_id and employee_id = new.employee_id
        and source_type = 'commission' and status <> 'voided'
    )
    select 1 from expected full join actual using (id)
    where expected.id is null or actual.id is null
      or expected.updated_at is distinct from actual.updated_at
  ) or exists (
    select 1 from jsonb_array_elements(v_snapshot) x group by x->>'id' having count(*) > 1
  ) then raise exception 'commission_preview_stale'; end if;
  -- A cheque changed after the preview: require a fresh calculation, even in another period.
  if jsonb_typeof(new.details->'cheque_snapshot') is distinct from 'array' then
    raise exception 'commission_preview_stale';
  end if;
  -- Serialize a cheque reversal with posting, so its AFTER trigger sees the
  -- committed ledger entry and can retain a review case instead of missing it.
  perform c.id from public.cheques c
  where c.org_id = new.org_id and exists (
    select 1 from jsonb_array_elements(new.details->'cheque_snapshot') x where x->>'id' = c.id::text)
  order by c.id for share;
  if exists (
    select 1 from jsonb_array_elements(new.details->'cheque_snapshot') x
    left join public.cheques c on c.id::text = x->>'id' and c.org_id = new.org_id
    where c.id is null or c.status is distinct from x->>'status'
      or c.cleared_at is distinct from nullif(x->>'cleared_at','')::timestamptz
      or c.spent_date is distinct from nullif(x->>'spent_date','')::date
  ) then raise exception 'commission_receipts_changed'; end if;
  return new;
end;
$$;
revoke all on function public.guard_commission_calculation_snapshot() from public, anon, authenticated;
drop trigger if exists guard_commission_calculation_snapshot on public.payroll_calculation_entries;
create trigger guard_commission_calculation_snapshot before insert or update
on public.payroll_calculation_entries for each row execute function public.guard_commission_calculation_snapshot();

create index if not exists idx_payroll_commission_employee_revision
on public.payroll_calculation_entries (org_id, employee_id, id) where source_type = 'commission' and status <> 'voided';
notify pgrst, 'reload schema';
commit;
