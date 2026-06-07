-- TazeSystem - Phase 230
-- Harden process-run creation against cross-organization calls.

begin;

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
  v_current_org_id uuid;
begin
  if p_org_id is null then
    raise exception 'سازمان اجرای فرآیند مشخص نیست.' using errcode = '42501';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    v_current_org_id := public.current_org_id();

    if auth.uid() is null
      or v_current_org_id is null
      or p_org_id <> v_current_org_id then
      raise exception 'دسترسی ایجاد فرآیند برای این سازمان وجود ندارد.' using errcode = '42501';
    end if;
  end if;

  select t.name
    into v_template_name
  from public.process_templates t
  where t.id = p_template_id
    and t.org_id = p_org_id;

  if v_template_name is null then
    raise exception 'الگوی فرآیند برای این سازمان پیدا نشد.' using errcode = 'P0001';
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
    coalesce(nullif(btrim(coalesce(p_process_name, '')), ''), v_template_name),
    'active',
    case when p_copied_mode in ('manual', 'auto') then p_copied_mode else 'manual' end,
    now(),
    auth.uid(),
    auth.uid()
  )
  returning id into v_run_id;

  if p_record_id is not null
    and nullif(btrim(coalesce(p_module_id, '')), '') is not null then
    insert into public.process_run_links (
      org_id,
      process_run_id,
      module_id,
      record_id,
      is_primary
    )
    values (
      p_org_id,
      v_run_id,
      p_module_id,
      p_record_id,
      true
    )
    on conflict (process_run_id, module_id, record_id) do update
      set
        org_id = excluded.org_id,
        is_primary = excluded.is_primary;
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

revoke all on function public.create_process_run_from_template(
  uuid,
  uuid,
  text,
  uuid,
  text,
  text
) from public;

grant execute on function public.create_process_run_from_template(
  uuid,
  uuid,
  text,
  uuid,
  text,
  text
) to authenticated, service_role;

commit;
