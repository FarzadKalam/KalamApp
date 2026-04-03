alter table if exists public.process_templates
  add column if not exists module_ids text[] not null default '{}'::text[];

update public.process_templates
set module_ids = case
  when array_length(module_ids, 1) is null or array_length(module_ids, 1) = 0 then
    case
      when nullif(trim(coalesce(module_id, '')), '') is null then '{}'::text[]
      else array[nullif(trim(module_id), '')]
    end
  else module_ids
end;

update public.process_templates
set module_id = coalesce(module_ids[1], module_id, '')
where coalesce(nullif(trim(coalesce(module_id, '')), ''), '') = ''
  or coalesce(module_id, '') <> coalesce(module_ids[1], module_id, '');

create index if not exists idx_process_templates_module_ids
  on public.process_templates using gin(module_ids);

create table if not exists public.process_run_links (
  id uuid primary key default gen_random_uuid(),
  process_run_id uuid not null references public.process_runs(id) on delete cascade,
  module_id text not null default '',
  record_id uuid not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_process_run_links_unique
  on public.process_run_links(process_run_id, module_id, record_id);

create index if not exists idx_process_run_links_process
  on public.process_run_links(process_run_id, is_primary);

create index if not exists idx_process_run_links_module_record
  on public.process_run_links(module_id, record_id);

insert into public.process_run_links (process_run_id, module_id, record_id, is_primary)
select r.id, r.module_id, r.record_id, true
from public.process_runs r
where r.record_id is not null
  and nullif(trim(coalesce(r.module_id, '')), '') is not null
  and not exists (
    select 1
    from public.process_run_links l
    where l.process_run_id = r.id
      and l.module_id = r.module_id
      and l.record_id = r.record_id
  );

create or replace function public.create_process_run_from_template(
  p_org_id uuid,
  p_template_id uuid,
  p_module_id text,
  p_record_id uuid,
  p_process_name text default null,
  p_copied_mode text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_template_name text;
begin
  select t.name
    into v_template_name
  from public.process_templates t
  where t.id = p_template_id
    and t.org_id = p_org_id;

  if v_template_name is null then
    raise exception 'process template not found for org_id=% template_id=%', p_org_id, p_template_id;
  end if;

  insert into public.process_runs (
    org_id,
    template_id,
    module_id,
    record_id,
    process_name,
    status,
    copied_mode,
    started_at,
    created_by,
    updated_by
  )
  values (
    p_org_id,
    p_template_id,
    p_module_id,
    p_record_id,
    coalesce(nullif(p_process_name, ''), v_template_name),
    'active',
    case when p_copied_mode in ('manual', 'auto') then p_copied_mode else 'manual' end,
    now(),
    auth.uid(),
    auth.uid()
  )
  returning id into v_run_id;

  if p_record_id is not null and nullif(trim(coalesce(p_module_id, '')), '') is not null then
    insert into public.process_run_links (process_run_id, module_id, record_id, is_primary)
    values (v_run_id, p_module_id, p_record_id, true)
    on conflict (process_run_id, module_id, record_id) do update
      set is_primary = excluded.is_primary;
  end if;

  insert into public.process_run_stages (
    process_run_id,
    template_stage_id,
    stage_name,
    sort_order,
    status,
    assignee_user_id,
    assignee_role_id,
    wage,
    metadata
  )
  select
    v_run_id,
    s.id,
    s.stage_name,
    s.sort_order,
    s.default_status,
    s.default_assignee_id,
    s.default_assignee_role_id,
    s.wage,
    s.metadata
  from public.process_template_stages s
  where s.template_id = p_template_id
  order by s.sort_order, s.created_at;

  return v_run_id;
end;
$$;
