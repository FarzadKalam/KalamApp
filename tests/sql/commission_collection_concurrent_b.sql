select set_config('test.org','00000000-0000-0000-0000-000000000001',false);
-- Session A is still uncommitted: this snapshot is empty. The stale check must
-- see A after acquiring its employee lock, rather than keep the outer snapshot.
do $$ declare snapshot jsonb; begin
 snapshot:=test_commission_snapshot('10000000-0000-0000-0000-000000000002');
 perform test_assert(snapshot->'ledger_snapshot'='[]'::jsonb,'worker B did not overlap uncommitted worker A');
 perform test_expect_error(format('select test_save_commission(%L,%L::uuid,%L::jsonb,%L::date)',
 'concurrent-august','10000000-0000-0000-0000-000000000002',snapshot,'2026-08-01'),'commission_preview_stale');
end $$;
select test_assert(not exists(select 1 from payroll_calculation_entries where source_key='concurrent-august'),'concurrent stale posting persisted');
select test_assert((select count(*)=1 from payroll_calculation_entries where source_key='concurrent-july'),'first concurrent posting lost');
