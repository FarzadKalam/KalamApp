begin;

create or replace function public.run_due_workflow_intervals()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_due_interval_workflows();
  perform public.trigger_workflow_interval_runner();
end;
$$;

revoke all on function public.run_due_workflow_intervals() from public, authenticated;

do $$
begin
  perform cron.unschedule('queue-interval-workflows');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('run-workflow-interval-runner');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('run-due-workflow-intervals');
exception when others then null;
end $$;

select cron.schedule(
  'run-due-workflow-intervals',
  '* * * * *',
  'select public.run_due_workflow_intervals()'
);

commit;
