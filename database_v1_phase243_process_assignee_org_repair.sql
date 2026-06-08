-- TazeSystem - Phase 243
-- Repair legacy process/task assignees that no longer match the owning organization.

begin;

update public.process_template_stages s
set default_assignee_id = null,
    updated_at = now()
from public.process_templates t
where t.id = s.template_id
  and s.default_assignee_id is not null
  and not exists (
    select 1
    from public.profiles p
    where p.id = s.default_assignee_id
      and p.org_id = t.org_id
  );

update public.process_template_stages s
set default_assignee_role_id = null,
    updated_at = now()
from public.process_templates t
where t.id = s.template_id
  and s.default_assignee_role_id is not null
  and not exists (
    select 1
    from public.org_roles r
    where r.id = s.default_assignee_role_id
      and r.org_id = t.org_id
  );

update public.process_run_stages s
set assignee_user_id = null,
    updated_at = now()
from public.process_runs r
where r.id = s.process_run_id
  and s.assignee_user_id is not null
  and not exists (
    select 1
    from public.profiles p
    where p.id = s.assignee_user_id
      and p.org_id = r.org_id
  );

update public.process_run_stages s
set assignee_role_id = null,
    updated_at = now()
from public.process_runs r
where r.id = s.process_run_id
  and s.assignee_role_id is not null
  and not exists (
    select 1
    from public.org_roles role_row
    where role_row.id = s.assignee_role_id
      and role_row.org_id = r.org_id
  );

update public.tasks t
set assignee_id = null,
    updated_at = now()
where t.assignee_id is not null
  and not exists (
    select 1
    from public.profiles p
    where p.id = t.assignee_id
      and p.org_id = t.org_id
  );

update public.tasks t
set assignee_role_id = null,
    updated_at = now()
where t.assignee_role_id is not null
  and not exists (
    select 1
    from public.org_roles r
    where r.id = t.assignee_role_id
      and r.org_id = t.org_id
  );

update public.tasks
set assignee_type = case
      when assignee_role_id is not null then 'role'
      when assignee_id is not null then 'user'
      else null
    end,
    updated_at = now()
where (assignee_role_id is not null and assignee_type is distinct from 'role')
   or (assignee_role_id is null and assignee_id is not null and assignee_type is distinct from 'user')
   or (assignee_role_id is null and assignee_id is null and assignee_type is not null);

commit;
