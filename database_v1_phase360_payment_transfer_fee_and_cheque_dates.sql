-- =====================================================
-- TazeSystem - Phase 360
-- کارمزد انتقال پرداخت‌ها و تاریخ‌های عملیاتی چک
-- =====================================================

begin;

alter table if exists public.cash_bank_operations
  add column if not exists transfer_fee numeric(18,2) not null default 0;

update public.cash_bank_operations
set transfer_fee = 0
where transfer_fee is null;

alter table if exists public.cash_bank_operations
  alter column transfer_fee set default 0,
  alter column transfer_fee set not null;

alter table if exists public.cash_bank_operations
  drop constraint if exists chk_cash_bank_operations_transfer_fee_non_negative;

alter table if exists public.cash_bank_operations
  add constraint chk_cash_bank_operations_transfer_fee_non_negative
  check (transfer_fee >= 0);

alter table if exists public.cheques
  add column if not exists spent_date date;

update public.cheques
set due_date = issue_date
where due_date is null
  and issue_date is not null;

create or replace function public.mark_payment_cheque_as_spent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.operation_type = 'payment'
     and new.cheque_id is not null
     and lower(trim(coalesce(new.status, ''))) in ('received', 'approved')
     and new.org_id is not null then
    update public.cheques
    set status = 'paid',
        spent_date = coalesce(spent_date, new.operation_date, current_date),
        updated_at = now()
    where id = new.cheque_id
      and org_id = new.org_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.mark_payment_cheque_as_spent() from public;
grant execute on function public.mark_payment_cheque_as_spent() to authenticated;

commit;
