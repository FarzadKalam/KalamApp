-- TazeSystem V1 Phase 516
-- صف پایدار تولید تصویر برای جلوگیری از قطع شدن پردازش‌های طولانی Edge Function.

begin;

create table if not exists public.ai_image_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  thread_id uuid,
  user_message_id uuid,
  assistant_message_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_image_generation_jobs_pending_idx
  on public.ai_image_generation_jobs (status, available_at, created_at);
create index if not exists ai_image_generation_jobs_org_idx
  on public.ai_image_generation_jobs (org_id, created_at desc);
create unique index if not exists ai_image_generation_jobs_message_uidx
  on public.ai_image_generation_jobs (assistant_message_id);

alter table public.ai_image_generation_jobs enable row level security;

revoke all on public.ai_image_generation_jobs from public, anon, authenticated;

create or replace function public.claim_ai_image_generation_job(p_lease_seconds integer default 240)
returns setof public.ai_image_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.ai_image_generation_jobs;
  v_lease integer := least(greatest(coalesce(p_lease_seconds, 240), 60), 900);
begin
  update public.ai_image_generation_jobs
  set status = 'pending', locked_at = null, updated_at = now(),
      last_error = coalesce(last_error, 'اجرای قبلی worker پیش از تکمیل متوقف شد.')
  where status = 'running'
    and locked_at < now() - make_interval(secs => v_lease)
    and attempts < 6;

  select * into v_job
  from public.ai_image_generation_jobs
  where status = 'pending'
    and available_at <= now()
    and attempts < 6
  order by available_at asc, created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.ai_image_generation_jobs
  set status = 'running', attempts = attempts + 1, locked_at = now(),
      started_at = coalesce(started_at, now()), updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return next v_job;
end;
$$;

revoke all on function public.claim_ai_image_generation_job(integer) from public, anon, authenticated;
grant execute on function public.claim_ai_image_generation_job(integer) to service_role;

notify pgrst, 'reload schema';

commit;
