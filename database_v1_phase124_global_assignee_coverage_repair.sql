-- Phase 124: expand generic assignee coverage for workflow-facing modules
-- Intentionally excludes modules that already rely on domain-specific owner fields
-- such as responsible_id / manager_id and similar patterns.

do $$
declare
  v_table text;
  v_relkind "char";
begin
  foreach v_table in array ARRAY[
    'production_boms',
    'production_group_orders',
    'process_templates',
    'process_runs',
    'cash_bank_operations',
    'leave_requests',
    'overtime_requests',
    'mission_requests',
    'work_schedules',
    'price_lists',
    'web_forms',
    'automation_execution_reports',
    'counterparty_bot_groups',
    'surveys'
  ] loop
    select c.relkind
      into v_relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = v_table
    limit 1;

    -- Skip views and any non-table relations. This repair only targets
    -- concrete tables that can safely receive shared assignee columns.
    if v_relkind is null or v_relkind not in ('r', 'p') then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists assignee_id uuid references public.profiles(id) on delete set null',
      v_table
    );
    execute format(
      'alter table public.%I add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null',
      v_table
    );
    execute format(
      'alter table public.%I add column if not exists assignee_type text',
      v_table
    );

    execute format($sql$
      update public.%I
      set assignee_type = case
        when assignee_role_id is not null then 'role'
        when assignee_id is not null then 'user'
        else assignee_type
      end
      where (assignee_role_id is not null or assignee_id is not null)
        and coalesce(nullif(assignee_type, ''), '') = ''
    $sql$, v_table);

    execute format(
      'create index if not exists %I on public.%I(assignee_id, assignee_role_id)',
      'idx_' || v_table || '_assignee_scope',
      v_table
    );
  end loop;
end $$;
