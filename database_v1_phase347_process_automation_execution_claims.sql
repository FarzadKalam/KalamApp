-- جلوگیری اتمیک از اجرای تکراری first_match در اتوماسیون فعالیت‌ها
-- تمام دسترسی‌ها fail-closed و فقط برای service role هستند.

begin;

create table if not exists public.process_automation_execution_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  execution_key text not null unique,
  rule_id text not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_process_automation_execution_claims_org_created
  on public.process_automation_execution_claims (org_id, created_at desc);

alter table public.process_automation_execution_claims enable row level security;

drop policy if exists process_automation_execution_claims_select_org on public.process_automation_execution_claims;
create policy process_automation_execution_claims_select_org
  on public.process_automation_execution_claims
  for select to authenticated
  using (org_id = public.current_org_id());

revoke all on public.process_automation_execution_claims from public, anon, authenticated;
grant select on public.process_automation_execution_claims to authenticated;

create or replace function public.claim_process_automation_first_match_execution(
  p_org_id uuid,
  p_rule_id text,
  p_task_id uuid,
  p_execution_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'دسترسی اجرای اتوماسیون فرآیند وجود ندارد.' using errcode = '42501';
  end if;

  insert into public.process_automation_execution_claims (
    org_id, execution_key, rule_id, task_id, status, claimed_at, completed_at, last_error, updated_at
  ) values (
    p_org_id, p_execution_key, p_rule_id, p_task_id, 'running', now(), null, null, now()
  )
  on conflict (execution_key) do update
    set status = 'running', claimed_at = now(), completed_at = null, last_error = null, updated_at = now()
    where public.process_automation_execution_claims.status = 'failed'
       or (
         public.process_automation_execution_claims.status = 'running'
         and public.process_automation_execution_claims.claimed_at < now() - interval '10 minutes'
       );

  return found;
end;
$$;

create or replace function public.complete_process_automation_first_match_execution(
  p_execution_key text,
  p_status text,
  p_last_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'دسترسی اجرای اتوماسیون فرآیند وجود ندارد.' using errcode = '42501';
  end if;
  if p_status not in ('succeeded', 'failed') then
    raise exception 'وضعیت اجرای اتوماسیون فرآیند نامعتبر است.' using errcode = '22023';
  end if;

  update public.process_automation_execution_claims
  set status = p_status,
      completed_at = now(),
      last_error = case when p_status = 'failed' then nullif(p_last_error, '') else null end,
      updated_at = now()
  where execution_key = p_execution_key and status = 'running';
  return found;
end;
$$;

revoke all on function public.claim_process_automation_first_match_execution(uuid, text, uuid, text) from public, authenticated;
revoke all on function public.complete_process_automation_first_match_execution(text, text, text) from public, authenticated;
grant execute on function public.claim_process_automation_first_match_execution(uuid, text, uuid, text) to service_role;
grant execute on function public.complete_process_automation_first_match_execution(text, text, text) to service_role;

commit;
