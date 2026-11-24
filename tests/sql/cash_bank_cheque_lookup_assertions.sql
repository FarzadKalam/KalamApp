-- Exercise payment cheque references under tenant RLS without changing the shared fixture.
begin;
insert into cheques (id, org_id, serial_no, sayad_id) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'local-serial', '123'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'hidden-serial', '456');

insert into invoices (id, org_id, name, invoice_date, payments) values (
  'a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'cheque regression', '2026-01-01',
  '[{"cheque_id":"a0000000-0000-4000-8000-000000000001","amount":100},
    {"cheque_id":"a0000000-0000-4000-8000-000000000002","amount":200},
    {"cheque_id":"not-a-uuid","amount":300},
    {"cheque_id":"A0000000-0000-4000-8000-000000000001","amount":400}]'
);

insert into purchase_invoices (id, org_id, name, invoice_date, payments)
select 'a0000000-0000-4000-8000-000000000004', org_id, name, invoice_date, payments
from invoices where id = 'a0000000-0000-4000-8000-000000000003';

set test.user_id = '90000000-0000-4000-8000-000000000001';
set request.headers = '{"origin":"https://one.example.test"}';
set role authenticated;

do $$ begin
  if (select count(*) from public.cash_bank_unified_ledger_filtered('{"invoice_query":"cheque regression"}')) <> 8
    or (select count(*) from public.cash_bank_unified_ledger_filtered('{"invoice_query":"cheque regression"}') where cheque_label = '-') <> 6 then
    raise exception 'Unmatched, invalid or cross-tenant cheque references changed the payment rows';
  end if;
  if (select count(*) from public.cash_bank_unified_ledger_filtered('{"cheque_query":"local-serial (123)","row_types":["receipt","payment"]}')) <> 2
    or exists (select 1 from public.cash_bank_unified_ledger_filtered('{"cheque_query":"hidden-serial"}')) then
    raise exception 'Cheque matching or tenant isolation is incorrect';
  end if;
end $$;

rollback;
