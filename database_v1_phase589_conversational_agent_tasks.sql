-- Phase 589: conversational agent tasks use the existing durable workflow queue.
-- Additive, idempotent; no second scheduler and no tenant-wide privilege grant.
begin;

alter table public.workflows
  add column if not exists agent_task_config jsonb,
  add column if not exists agent_task_next_run_at timestamptz,
  add column if not exists agent_task_revision integer not null default 0,
  add column if not exists agent_task_origin_action_id uuid;

create index if not exists idx_workflows_agent_task_due
  on public.workflows (agent_task_next_run_at, org_id, id)
  where is_active = true and agent_task_config is not null and trigger_type = 'interval';
create index if not exists idx_workflows_org_agent_task
  on public.workflows (org_id, agent_key, updated_at desc)
  where agent_task_config is not null;
create unique index if not exists uq_workflows_agent_task_origin
  on public.workflows (org_id, agent_task_origin_action_id)
  where agent_task_origin_action_id is not null;

-- These columns represent server-validated, explicitly approved instructions.
-- The ordinary workflow editor may pause a task, but cannot turn it into an
-- administrator-owned task, change recipients or resume without validation.
create or replace function public.guard_ai_agent_task_workflow()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    if new.agent_task_config is not null or new.agent_task_next_run_at is not null
       or new.agent_task_revision <> 0 or new.agent_task_origin_action_id is not null then
      raise exception 'تعریف کار خودکار ایجنت باید از مسیر تأییدشده انجام شود.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.agent_task_config is null and new.agent_task_config is null
     and old.agent_task_next_run_at is null and new.agent_task_next_run_at is null
     and old.agent_task_revision = new.agent_task_revision
     and old.agent_task_origin_action_id is not distinct from new.agent_task_origin_action_id then return new; end if;
  if new.org_id = public.current_org_id()
     and new.is_active = false
     and (to_jsonb(new) - array['is_active','updated_at','updated_by'])
         = (to_jsonb(old) - array['is_active','updated_at','updated_by']) then return new; end if;
  raise exception 'ویرایش یا فعال‌سازی کار خودکار ایجنت باید دوباره بررسی و تأیید شود.' using errcode = '42501';
end;
$$;

drop trigger if exists trg_guard_ai_agent_task_workflow on public.workflows;
create trigger trg_guard_ai_agent_task_workflow
before insert or update on public.workflows
for each row execute function public.guard_ai_agent_task_workflow();
revoke all on function public.guard_ai_agent_task_workflow() from public, anon, authenticated;

-- The enqueue and schedule advance share one transaction and a row lock.
-- A lost HTTP response can be safely retried: the queue key is unique, while
-- the optimistic due/revision check prevents advancing a newer task.
create or replace function public.enqueue_ai_agent_task_run(
  p_org_id uuid,
  p_workflow_id uuid,
  p_expected_revision integer,
  p_due_at timestamptz,
  p_next_run_at timestamptz,
  p_now timestamptz default now()
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_workflow public.workflows%rowtype;
  v_action jsonb;
  v_job_id uuid;
  v_dedupe text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'دسترسی صف اجرای ایجنت وجود ندارد.' using errcode = '42501';
  end if;
  if p_org_id is null or p_workflow_id is null or p_due_at is null or p_now is null then
    raise exception 'اطلاعات نوبت اجرای ایجنت ناقص است.' using errcode = '22023';
  end if;
  select * into v_workflow from public.workflows
  where id = p_workflow_id and org_id = p_org_id
  for update;
  if not found or not v_workflow.is_active or v_workflow.agent_task_config is null
     or v_workflow.trigger_type <> 'interval'
     or v_workflow.agent_task_revision <> p_expected_revision
     or v_workflow.agent_task_next_run_at is distinct from p_due_at
     or p_due_at > p_now then return null; end if;
  if (p_next_run_at is not null and p_next_run_at <= p_now)
     or (p_next_run_at is null and v_workflow.agent_task_config #>> '{schedule,kind}' is distinct from 'once') then
    raise exception 'موعد بعدی اجرای ایجنت معتبر نیست.' using errcode = '22023';
  end if;
  if v_workflow.created_by is null then
    raise exception 'صاحب کار خودکار مشخص نیست.' using errcode = '22023';
  end if;
  v_action := jsonb_build_object(
    'id', 'agent-task:' || v_workflow.id::text || ':' || p_expected_revision::text,
    'type', 'run_agent_task',
    'config', jsonb_build_object('workflow_id', v_workflow.id, 'task_revision', p_expected_revision)
  );
  v_dedupe := concat('agent-task:', p_org_id, ':', p_workflow_id, ':', p_expected_revision, ':', p_due_at);
  insert into public.workflow_interval_jobs (
    org_id, job_kind, dedupe_key, workflow_id, module_id, record_id, scheduled_due_at,
    action_index, is_terminal_action, max_attempts, payload
  ) values (
    p_org_id, 'workflow_action', v_dedupe, p_workflow_id, v_workflow.module_id, p_workflow_id, p_due_at,
    0, true, 1, jsonb_build_object(
      'workflow', to_jsonb(v_workflow), 'action', v_action,
      'record', jsonb_build_object('id', p_workflow_id, 'name', v_workflow.name),
      'actor_user_id', v_workflow.created_by, 'action_count', 1
    )
  ) on conflict (dedupe_key) do nothing returning id into v_job_id;
  if v_job_id is null then
    select id into v_job_id from public.workflow_interval_jobs where dedupe_key = v_dedupe and org_id = p_org_id;
  end if;
  update public.workflows set last_run_at = p_due_at,
    agent_task_next_run_at = p_next_run_at, server_queued_at = null
  where id = p_workflow_id and org_id = p_org_id;
  return v_job_id;
end;
$$;
revoke all on function public.enqueue_ai_agent_task_run(uuid,uuid,integer,timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_ai_agent_task_run(uuid,uuid,integer,timestamptz,timestamptz,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
