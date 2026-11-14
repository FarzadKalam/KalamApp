select set_config('request.jwt.claim.role','service_role',false);
insert into public.workflows(id,org_id,name,module_id,agent_key,created_by,trigger_type,
  agent_task_config,agent_task_revision,agent_task_next_run_at) values (
  '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',
  'گزارش روزانه','marketing_leads','sales_leads','00000000-0000-4000-8000-000000000020','interval',
  '{"version":1,"schedule":{"kind":"daily"}}',1,'2026-11-15T05:30:00Z'
);
do $$
declare v_id uuid; v_count integer;
begin
  v_id := public.enqueue_ai_agent_task_run('00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000001',1,'2026-11-15T05:30:00Z','2026-11-16T05:30:00Z','2026-11-15T06:00:00Z');
  assert v_id is null, 'Cross-org enqueue must fail closed';
  v_id := public.enqueue_ai_agent_task_run('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',0,'2026-11-15T05:30:00Z','2026-11-16T05:30:00Z','2026-11-15T06:00:00Z');
  assert v_id is null, 'Stale revisions must not enqueue';
  begin
    perform public.enqueue_ai_agent_task_run('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',1,'2026-11-15T05:30:00Z',null,'2026-11-15T06:00:00Z');
    raise exception 'A recurring task must retain a future schedule';
  exception when invalid_parameter_value then null; end;
  assert (select count(*) from public.workflow_interval_jobs)=0, 'Invalid scheduling must not partially enqueue';
  v_id := public.enqueue_ai_agent_task_run('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',1,'2026-11-15T05:30:00Z','2026-11-16T05:30:00Z','2026-11-15T06:00:00Z');
  assert v_id is not null, 'Due task must enqueue';
  assert (select agent_task_next_run_at='2026-11-16T05:30:00Z'::timestamptz from public.workflows limit 1), 'Schedule advances atomically';
  perform public.enqueue_ai_agent_task_run('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',1,'2026-11-15T05:30:00Z','2026-11-16T05:30:00Z','2026-11-15T06:00:00Z');
  select count(*) into v_count from public.workflow_interval_jobs;
  assert v_count=1, 'Retry after an uncertain response must not duplicate the job';
  assert (select payload #>> '{action,type}'='run_agent_task' from public.workflow_interval_jobs limit 1), 'Job calls the scoped task operator';
  assert (select max_attempts=1 from public.workflow_interval_jobs limit 1), 'External sends must not be retried blindly';
end $$;

select set_config('test.org_id','00000000-0000-4000-8000-000000000010',false);
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;
do $$ begin
  begin
    update public.workflows set created_by='00000000-0000-4000-8000-000000000099';
    raise exception 'Task ownership must not be forged';
  exception when insufficient_privilege then null; end;
  begin
    update public.workflows set agent_task_config='{"version":1,"schedule":{"kind":"once"}}';
    raise exception 'Task config must not bypass server approval';
  exception when insufficient_privilege then null; end;
  update public.workflows set is_active=false;
  assert (select not is_active from public.workflows limit 1), 'Ordinary UI may stop a task';
  begin
    update public.workflows set is_active=true;
    raise exception 'Resume must pass fresh validation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.enqueue_ai_agent_task_run('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',1,'2026-11-16T05:30:00Z','2026-11-17T05:30:00Z','2026-11-16T06:00:00Z');
    raise exception 'Only the trusted worker may enqueue';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Run the actual legacy cron under a database session without a service JWT.
-- An unfiltered task update would trip the approval guard and abort the tick.
select set_config('request.jwt.claim.role','service_role',false);
update public.workflows set is_active=true;
insert into public.workflows(id,org_id,name,trigger_type,interval_value,interval_unit)
values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','ordinary workflow','interval',1,'day');
select set_config('request.jwt.claim.role','',false);
select public.queue_due_interval_workflows();
do $$ begin
  assert (select server_queued_at is null from public.workflows where agent_task_config is not null), 'Legacy cron must leave task due cursors alone';
  assert (select server_queued_at is not null from public.workflows where agent_task_config is null), 'Legacy cron must still mark ordinary workflows';
end $$;
select 'agent task queue and approval boundary assertions passed' as result;
