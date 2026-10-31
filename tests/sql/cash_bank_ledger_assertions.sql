set role authenticated;
set test.current_org = '10000000-0000-4000-8000-000000000001';
do $$ declare totals jsonb; result jsonb; f jsonb; begin
  totals := public.get_cash_bank_unified_ledger_totals('{}');
  if (totals->>'receiptTotal')::numeric <> 310.30 or (totals->>'paymentTotal')::numeric <> 126 then
    raise exception 'Incorrect totals or duplicated cheque/transfer/opening: %', totals;
  end if;
  f := '{"date_from":"2026-10-01","date_to":"2026-10-31","description_query":"match"}';
  totals := public.get_cash_bank_unified_ledger_totals(f);
  result := public.get_cash_bank_unified_ledger_page(1, 20, 'date', 'desc', f);
  if (totals->>'receiptTotal')::numeric <> 300.30 or (totals->>'paymentTotal')::numeric <> 126
    or (totals->>'rowCount')::int <> 4 or (result->>'total')::int <> 4 then
    raise exception 'Page and total filters diverged: %, %', totals, result;
  end if;
  if (select sum((r->>'amount')::numeric) from jsonb_array_elements(result->'rows') r where r->>'row_type' = 'receipt') <> 300.30 then
    raise exception 'Invoice payment event date was not preserved';
  end if;
  totals := public.get_cash_bank_unified_ledger_totals('{"row_types":["receipt"],"payment_types":["cash"],"statuses":["received"],"amount_from":"100","amount_to":"150"}');
  if (totals->>'receiptTotal')::numeric <> 100.10 or (totals->>'paymentTotal')::numeric <> 0 or (totals->>'rowCount')::int <> 1 then
    raise exception 'Categorical or numeric filters failed: %', totals;
  end if;
  totals := public.get_cash_bank_unified_ledger_totals('{"invoice_query":"sale","person_query":"-","bank_query":"-","cheque_query":"-"}');
  if (totals->>'receiptTotal')::numeric <> 200.20 or (totals->>'rowCount')::int <> 1 then raise exception 'Text filters failed: %', totals; end if;
end $$;

-- Amounts exceeding JavaScript's integer precision stay exact as numeric text.
reset role;
insert into cash_bank_operations(id,org_id,operation_type,status,operation_date,amount,description) values
 ('00000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','receipt','received','2026-10-07',9007199254740993.17,'precision');
set role authenticated;
do $$ declare t jsonb; begin
 t := public.get_cash_bank_unified_ledger_totals('{"description_query":"precision"}');
 if t->>'receiptTotal' <> '9007199254740993.17' or jsonb_typeof(t->'receiptTotal') <> 'string' then raise exception 'Numeric precision lost: %', t; end if;
end $$;

set test.current_org = '10000000-0000-4000-8000-000000000002';
do $$ declare t jsonb; begin
 t := public.get_cash_bank_unified_ledger_totals('{}');
 if (t->>'receiptTotal')::numeric <> 9000 or (t->>'rowCount')::int <> 1 then raise exception 'Cross-tenant data leak: %', t; end if;
end $$;
set test.current_org = '';
do $$ declare t jsonb; begin
 t := public.get_cash_bank_unified_ledger_totals('{}');
 if (t->>'rowCount')::int <> 0 or (t->>'receiptTotal')::numeric <> 0 then raise exception 'Null org was not fail-closed'; end if;
 if exists(select 1 from public.cash_bank_unified_ledger) then raise exception 'Unscoped view exposed rows'; end if;
 if (public.get_cash_bank_unified_ledger_page(1,20,'date','desc','{}')->>'total')::int <> 0 then raise exception 'Unscoped page exposed rows'; end if;
 if has_function_privilege('anon','public.get_cash_bank_unified_ledger_totals(jsonb)','execute') then raise exception 'Anonymous execute grant'; end if;
 if has_table_privilege('anon','public.cash_bank_unified_ledger','select') then raise exception 'Anonymous view grant'; end if;
end $$;
reset role;
