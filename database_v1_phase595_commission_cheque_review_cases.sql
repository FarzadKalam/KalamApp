-- Persistent review cases only: no negative payroll entry and no deletion of prior commission.
begin;
create table if not exists public.commission_review_cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null references public.employees(id),
  ledger_entry_id uuid not null references public.payroll_calculation_entries(id),
  cheque_id uuid not null references public.cheques(id),
  reason text not null default 'cheque_reversed',
  status text not null default 'pending_review' check (status in ('pending_review','reviewed')),
  review_after date not null,
  posted_amount_at_risk numeric not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, ledger_entry_id, cheque_id, reason)
);
create index if not exists idx_commission_review_employee
on public.commission_review_cases(org_id, employee_id, status, review_after);
alter table public.commission_review_cases enable row level security;
drop policy if exists commission_review_cases_read on public.commission_review_cases;
create policy commission_review_cases_read on public.commission_review_cases for select to authenticated
using (org_id = public.current_org_id()
  and public.current_user_has_role_permission_entry('payroll_slips','view',null,true)
  and public.org_has_plan_feature(public.current_org_id(),'advanced_commission',true));
revoke all on public.commission_review_cases from public, anon, authenticated;
grant select on public.commission_review_cases to authenticated;

-- Internal trigger helper: both cheque and ledger must belong to the exact same organization.
create or replace function public.capture_commission_cheque_review(p_cheque_id uuid, p_employee_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_cheque public.cheques%rowtype;
begin
  select * into v_cheque from public.cheques where id = p_cheque_id;
  if not found or v_cheque.org_id is null or v_cheque.status not in ('bounced','returned') then return; end if;
  insert into public.commission_review_cases
    (org_id,employee_id,ledger_entry_id,cheque_id,review_after,posted_amount_at_risk,details)
  select l.org_id,l.employee_id,l.id,v_cheque.id,l.period_end + 1,l.amount,
    jsonb_build_object('ledger_title', l.title, 'cheque_number', v_cheque.serial_no,
      'cheque_status',v_cheque.status,'calculation_snapshot',l.details,
      'amount_is_upper_bound',true,'requires_manual_recalculation',true)
  from public.payroll_calculation_entries l
  join public.employees e on e.id=l.employee_id and e.org_id=l.org_id
  where l.org_id = v_cheque.org_id and l.source_type = 'commission'
    and l.status not in ('draft','voided') and l.amount > 0
    and (p_employee_id is null or l.employee_id = p_employee_id)
    and (
      exists (select 1 from jsonb_array_elements(case when jsonb_typeof(l.details->'rows')='array' then l.details->'rows' else '[]'::jsonb end) r
        where exists (select 1 from jsonb_array_elements(case when jsonb_typeof(r->'cheque_payments')='array' then r->'cheque_payments' else '[]'::jsonb end) p
          where coalesce(p->>'cheque_id',p->>'spent_cheque_id') = v_cheque.id::text)
        or exists (select 1 from public.invoices i where i.org_id=l.org_id and i.id::text=r->>'invoice_id'
          and (i.payments @> jsonb_build_array(jsonb_build_object('cheque_id',v_cheque.id::text))
            or i.payments @> jsonb_build_array(jsonb_build_object('spent_cheque_id',v_cheque.id::text))
            or exists (select 1 from public.cash_bank_operations o
              where o.org_id=l.org_id and o.sales_invoice_id=i.id and o.cheque_id=v_cheque.id
                and o.operation_type <> 'payment' and o.operation_type <> 'transfer'))))
      or exists (select 1 from public.invoices i where i.org_id=l.org_id
        and i.id::text=coalesce(l.details->>'invoice_id',l.source_record_id::text)
        and (i.payments @> jsonb_build_array(jsonb_build_object('cheque_id',v_cheque.id::text))
          or i.payments @> jsonb_build_array(jsonb_build_object('spent_cheque_id',v_cheque.id::text))
          or exists (select 1 from public.cash_bank_operations o
            where o.org_id=l.org_id and o.sales_invoice_id=i.id and o.cheque_id=v_cheque.id
              and o.operation_type <> 'payment' and o.operation_type <> 'transfer')))
    )
  on conflict (org_id,ledger_entry_id,cheque_id,reason) do update
  set updated_at=now(), details=public.commission_review_cases.details || jsonb_build_object('cheque_status',v_cheque.status);
end;
$$;
revoke all on function public.capture_commission_cheque_review(uuid,uuid) from public,anon,authenticated;
create or replace function public.on_commission_cheque_reversed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('bounced','returned') and new.status is distinct from old.status then
    perform public.capture_commission_cheque_review(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.on_commission_cheque_reversed() from public,anon,authenticated;
drop trigger if exists commission_cheque_reversed on public.cheques;
create trigger commission_cheque_reversed after update of status on public.cheques
for each row execute function public.on_commission_cheque_reversed();

-- Backfill previously reversed cheques for the selected employee when opening a calculation.
create or replace function public.sync_commission_review_cases(p_employee_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_org uuid := public.current_org_id();
begin
  if v_org is null or public.current_user_has_role_permission_entry('payroll_slips','edit',null,true) is not true then
    raise exception 'commission_calculation_not_allowed';
  end if;
  if public.org_has_plan_feature(v_org,'advanced_commission',true) is not true then
    raise exception 'پورسانت پیشرفته در پلن سازمان فعال نیست.' using errcode='42501';
  end if;
  if not exists(select 1 from public.employees where org_id=v_org and id=p_employee_id) then
    raise exception 'commission_employee_not_found';
  end if;
  for v_id in select id from public.cheques where org_id=v_org and status in ('bounced','returned') loop
    perform public.capture_commission_cheque_review(v_id,p_employee_id);
  end loop;
end;
$$;
revoke all on function public.sync_commission_review_cases(uuid) from public,anon;
grant execute on function public.sync_commission_review_cases(uuid) to authenticated;
create index if not exists idx_commission_operation_cheque_invoice
on public.cash_bank_operations(org_id,cheque_id,sales_invoice_id) where cheque_id is not null;
create index if not exists idx_commission_reversed_cheques
on public.cheques(org_id,id) where status in ('bounced','returned');
notify pgrst,'reload schema';
commit;
