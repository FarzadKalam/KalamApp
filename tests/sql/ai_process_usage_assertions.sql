set role service_role;
do $$ declare s jsonb; begin
  s:=public.get_ai_usage_complete_statistics('10000000-0000-4000-8000-000000000001');
  assert (s#>>'{totals,requests}')::int=725,'full history must exceed old 200/600 caps';
  assert (s#>>'{totals,billed_amount_irt}')::numeric=1450,'tenant total must exclude other org and failed requests';
  assert (s#>>'{by_user,0,used_tokens}')::numeric=36250,'complete user token usage';
  s:=public.get_ai_usage_complete_statistics(null);
  assert (s#>>'{totals,requests}')::int=726,'central full history';
  assert jsonb_array_length(s->'by_org')=2,'central org summaries';
  assert s->'by_user'='[]'::jsonb,'central overview must not export every user';
  s:=public.get_ai_user_daily_usage('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-11-15','2026-11-16');
  assert (s->>'usedTokens')::int=36250,'daily quota must include every request and nested token metadata';
end $$;
reset role;
set test.org='10000000-0000-4000-8000-000000000001';
set test.user='20000000-0000-4000-8000-000000000001';
set role authenticated;
do $$ declare r jsonb; begin
  begin perform public.get_ai_usage_complete_statistics(null); raise exception 'statistics access must be denied'; exception when insufficient_privilege then null; end;
  begin perform public.apply_ai_process_task_change('50000000-0000-4000-8000-000000000001','{"status":"done"}','{}','2026-01-01'); raise exception 'required field must block completion'; exception when check_violation then null; end;
  assert (select status='todo' from public.tasks limit 1),'failed validation must not change task';
  r:=public.apply_ai_process_task_change('50000000-0000-4000-8000-000000000001','{"status":"done"}','{"report":"ready"}','2026-01-01');
  assert (select status='done' and completed_at is not null and actual_end_at is not null from public.tasks limit 1),'completion times';
  assert (select recurrence_info#>>'{process_task_custom_field_values,second}'='preserved' and recurrence_info#>>'{process_links,projects}'='keep' from public.tasks limit 1),'preserve concurrent unrelated metadata';
  assert (select status='done' and completed_at is not null from public.process_run_stages limit 1),'stage sync must commit with task';
  begin perform public.apply_ai_process_task_change('50000000-0000-4000-8000-000000000001','{"name":"stale"}','{}','2026-01-01'); raise exception 'stale version must fail'; exception when serialization_failure then null; end;
  perform set_config('test.deny','report',true);
  begin perform public.apply_ai_process_task_change('50000000-0000-4000-8000-000000000001','{}','{"report":"forbidden"}',(r->>'updated_at')::timestamptz); raise exception 'hidden field must fail'; exception when insufficient_privilege then null; end;
  perform set_config('test.deny','',true);
  perform set_config('test.org','10000000-0000-4000-8000-000000000002',true);
  begin perform public.apply_ai_process_task_change('50000000-0000-4000-8000-000000000001','{"name":"other org"}','{}',null); raise exception 'other org must fail'; exception when sqlstate 'P0002' then null; end;
  perform set_config('test.org','',true);
  begin perform public.apply_ai_process_task_change('50000000-0000-4000-8000-000000000001','{}','{}',null); raise exception 'missing org must fail closed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- A stage failure rolls back the task rather than producing a partial edit.
delete from public.process_run_stages;
set role authenticated;
do $$ declare old_time timestamptz; begin
  select updated_at into old_time from public.tasks limit 1;
  begin perform public.apply_ai_process_task_change('50000000-0000-4000-8000-000000000001','{"name":"must rollback"}','{}',old_time); raise exception 'missing stage must fail'; exception when sqlstate 'P0002' then null; end;
  assert (select name='فعالیت' from public.tasks limit 1),'stage error must rollback task edit';
end $$;
reset role;
