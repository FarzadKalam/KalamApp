-- Phase 182: add assignee columns to all module tables that were missing them
-- Covers: cheques, barters, suppliers, employees, bank_accounts, cash_boxes,
--         petty_funds, chart_of_accounts, fiscal_years, cost_centers,
--         journal_entries, accounting_event_rules, calculation_formulas,
--         shelves, warehouses
-- Uses ADD COLUMN IF NOT EXISTS so it is safe to re-run.

do $$
declare
  v_table text;
  v_relkind "char";
begin
  foreach v_table in array ARRAY[
    'cheques',
    'barters',
    'suppliers',
    'employees',
    'bank_accounts',
    'cash_boxes',
    'petty_funds',
    'chart_of_accounts',
    'fiscal_years',
    'cost_centers',
    'journal_entries',
    'accounting_event_rules',
    'calculation_formulas',
    'shelves',
    'warehouses'
  ] loop
    select c.relkind
      into v_relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = v_table
    limit 1;

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

    execute format(
      'create index if not exists %I on public.%I(assignee_id, assignee_role_id)',
      'idx_' || v_table || '_assignee_scope',
      v_table
    );
  end loop;
end $$;
