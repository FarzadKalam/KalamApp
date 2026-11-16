select set_config('test.org','00000000-0000-0000-0000-000000000001',false);
select set_config('test.permission','yes',false);
select set_config('test.plan','yes',false);

-- The real release path must survive the guard, including removal of payroll link.
update payroll_calculation_entries set status='included_in_payroll',payroll_slip_id=gen_random_uuid()
 where source_key='seed-a';
update payroll_calculation_entries set status='draft',payroll_slip_id=null where source_key='seed-a';
select test_assert((select status='draft' and payroll_slip_id is null from payroll_calculation_entries where source_key='seed-a'),'payroll release included -> draft blocked');
update payroll_calculation_entries set status='included_in_payroll' where source_key='seed-a';
update payroll_calculation_entries set status='proposed',payroll_slip_id=null where source_key='seed-a';

-- Lifecycle exceptions cannot move records between organizations or change periods.
select test_expect_error($q$update payroll_calculation_entries set org_id='00000000-0000-0000-0000-000000000002' where source_key='seed-a'$q$,'commission_calculation_not_allowed');
select test_expect_error($q$update payroll_calculation_entries set source_type='manual' where source_key='seed-a'$q$,'commission_calculation_scope_immutable');
select set_config('test.permission','no',false);
select test_expect_error($q$update payroll_calculation_entries set period_end='2026-06-30' where source_key='seed-a'$q$,'commission_calculation_not_allowed');
select set_config('test.permission','yes',false);
select set_config('test.org','',false);
select test_expect_error($q$update payroll_calculation_entries set status='included_in_payroll' where source_key='seed-a'$q$,'commission_calculation_not_allowed');
select test_expect_error($q$select sync_commission_review_cases('10000000-0000-0000-0000-000000000001')$q$,'commission_calculation_not_allowed');
select set_config('test.org','00000000-0000-0000-0000-000000000001',false);

-- Fresh preview works through latest plan-gated RPC586. A second period cannot
-- reuse the earlier ledger snapshot, even though its source key is different.
do $$ declare employee uuid:='10000000-0000-0000-0000-000000000001'; snapshot jsonb; begin
 snapshot:=test_commission_snapshot(employee);
 perform test_save_commission('fresh-june',employee,snapshot);
 perform test_expect_error(format('select test_save_commission(%L,%L::uuid,%L::jsonb,%L::date)',
  'stale-july',employee,snapshot,'2026-07-01'),'commission_preview_stale');
 perform test_assert(not exists(select 1 from payroll_calculation_entries where source_key='stale-july'),'stale posting persisted');
end $$;

-- A cheque date/status changed after preview must be rejected; do not fabricate
-- a collection date or let the cached balance validate that payment.
do $$ declare employee uuid:='10000000-0000-0000-0000-000000000001'; snapshot jsonb; begin
 snapshot:=test_commission_snapshot(employee)||jsonb_build_object('cheque_snapshot',jsonb_build_array(jsonb_build_object(
   'id','20000000-0000-0000-0000-000000000001','status','cleared','cleared_at','2026-05-12T00:00:00+00','spent_date',null)));
 update cheques set spent_date='2026-05-15' where serial_no='TEST-A';
 perform test_expect_error(format('select test_save_commission(%L,%L::uuid,%L::jsonb)',
  'stale-cheque-date',employee,snapshot),'commission_receipts_changed');
 update cheques set spent_date=null,status='bounced' where serial_no='TEST-A';
 perform test_expect_error(format('select test_save_commission(%L,%L::uuid,%L::jsonb)',
  'stale-cheque-status',employee,snapshot),'commission_receipts_changed');
end $$;

select test_assert((select count(*)=1 from commission_review_cases),'bounce did not create exactly one review case');
select test_assert((select review_after='2026-06-01' and posted_amount_at_risk=100000 and details->>'amount_is_upper_bound'='true'
 from commission_review_cases),'review case amount/date contract wrong');
select test_assert((select amount=100000 and status='proposed' and details->'rows'->0->>'invoice_id'='30000000-0000-0000-0000-000000000001'
 from payroll_calculation_entries where source_key='seed-a'),'bounce changed financial history');
select test_assert(not exists(select 1 from payroll_calculation_entries where amount<0),'bounce created automatic negative payroll');
select sync_commission_review_cases('10000000-0000-0000-0000-000000000001');
select sync_commission_review_cases('10000000-0000-0000-0000-000000000001');
select test_assert((select count(*)=1 from commission_review_cases),'sync duplicated review case');
update commission_review_cases set status='reviewed';
select sync_commission_review_cases('10000000-0000-0000-0000-000000000001');
select test_assert((select status='reviewed' from commission_review_cases),'sync reset manual review decision');
select test_expect_error($q$select sync_commission_review_cases('10000000-0000-0000-0000-000000000003')$q$,'commission_employee_not_found');
select set_config('test.plan','no',false);
select test_expect_error($q$select sync_commission_review_cases('10000000-0000-0000-0000-000000000001')$q$,'پلن سازمان');
select test_expect_error($q$select test_save_commission('disabled-plan','10000000-0000-0000-0000-000000000001',test_commission_snapshot('10000000-0000-0000-0000-000000000001'))$q$,'پلن سازمان');
select set_config('test.plan','yes',false);

-- Cross-tenant reversal has its own case; tenant SELECT is fail-closed.
select set_config('test.org','00000000-0000-0000-0000-000000000002',false);
update cheques set status='returned' where serial_no='TEST-B';
set role authenticated;
select test_assert((select count(*)=1 from commission_review_cases),'tenant B case leaked or missing');
select set_config('test.org','00000000-0000-0000-0000-000000000001',false);
select test_assert((select count(*)=1 from commission_review_cases),'tenant A case leaked or missing');
select set_config('test.org','',false);
select test_assert(not exists(select 1 from commission_review_cases),'null org leaked cases');
select set_config('test.org','00000000-0000-0000-0000-000000000001',false);
select set_config('test.permission','no',false);
select test_assert(not exists(select 1 from commission_review_cases),'missing view permission leaked cases');
select set_config('test.permission','yes',false);
select set_config('test.plan','no',false);
select test_assert(not exists(select 1 from commission_review_cases),'disabled plan leaked cases');
reset role;

-- Worker sessions use employee 2 and the same initial snapshot to exercise the
-- advisory lock across different source keys/periods in the CI shell step.
