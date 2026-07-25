-- Phase 377: Fast, tenant-safe reads for process templates and HR process drafts.
-- The process picker reads active templates ordered by name, while ModuleShow
-- reads an applicant draft by id under RLS. These indexes keep both paths
-- bounded for large organizations without weakening tenant isolation.

begin;

create index if not exists idx_process_templates_org_name_options
  on public.process_templates (org_id, name, id)
  include (module_id, module_ids, is_active);

-- Older HR migrations could leave these tables with permissive policies. Their
-- process-draft reads all use id plus tenant context, so restore one strict,
-- indexed policy pattern for every affected module.

do $$
declare
  target_table text;
  existing_policy record;
begin
  foreach target_table in array array[
    'expense_documents',
    'employee_advances',
    'payroll_slips',
    'employee_contracts',
    'recruitment_applicants'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', target_table);
    execute format(
      'create index if not exists %I on public.%I (org_id, id)',
      'idx_' || target_table || '_org_id_runtime',
      target_table
    );

    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        existing_policy.policyname,
        target_table
      );
    end loop;

    execute format(
      'create policy %I on public.%I for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id())',
      'p_' || target_table || '_org_all',
      target_table
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
