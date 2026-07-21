-- =====================================================
-- TazeSystem - Phase 359
-- همگام‌سازی وضعیت خرج‌شدن چک با پرداخت‌های انجام‌شده
-- =====================================================

do $$
begin
  alter table public.cheques
    drop constraint if exists chk_cheques_status;

  alter table public.cheques
    add constraint chk_cheques_status
    check (status in ('new', 'in_bank', 'paid', 'cleared', 'bounced', 'returned', 'canceled'));
end $$;

create or replace function public.mark_payment_cheque_as_spent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.operation_type = 'payment'
     and new.cheque_id is not null
     and lower(trim(coalesce(new.status, ''))) <> 'pending'
     and new.org_id is not null then
    update public.cheques
    set status = 'paid',
        updated_at = now()
    where id = new.cheque_id
      and org_id = new.org_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.mark_payment_cheque_as_spent() from public;
grant execute on function public.mark_payment_cheque_as_spent() to authenticated;

drop trigger if exists trg_mark_payment_cheque_as_spent on public.cash_bank_operations;
create trigger trg_mark_payment_cheque_as_spent
after insert or update of operation_type, status, cheque_id, org_id
on public.cash_bank_operations
for each row
execute function public.mark_payment_cheque_as_spent();
