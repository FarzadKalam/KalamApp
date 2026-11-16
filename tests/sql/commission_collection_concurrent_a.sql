set application_name='commission_concurrency_a';
select set_config('test.org','00000000-0000-0000-0000-000000000001',false);
begin;
select test_save_commission('concurrent-july','10000000-0000-0000-0000-000000000002',
 test_commission_snapshot('10000000-0000-0000-0000-000000000002'),'2026-07-01');
select pg_sleep(3);
commit;
