do $$
declare
  v_table text;
  v_relkind "char";
  v_tables text[] := array[
    'products',
    'billboards',
    'product_bundles',
    'warehouses',
    'shelves',
    'stock_transfers',
    'secretariat_documents',
    'delivery_forms',
    'production_boms',
    'production_orders',
    'production_group_orders',
    'customers',
    'suppliers',
    'invoices',
    'purchase_invoices',
    'projects',
    'marketing_leads',
    'calculation_formulas',
    'fiscal_years',
    'chart_of_accounts',
    'journal_entries',
    'accounting_event_rules',
    'cost_centers',
    'cash_boxes',
    'bank_accounts',
    'cheques',
    'barters',
    'cash_bank_operations',
    'employees',
    'attendance_logs',
    'work_schedules',
    'leave_requests',
    'overtime_requests',
    'mission_requests',
    'price_lists',
    'web_forms',
    'automation_execution_reports',
    'sms_delivery_reports',
    'voip_call_reports',
    'counterparty_bot_groups',
    'expense_documents',
    'employee_advances',
    'payroll_slips',
    'employee_contracts',
    'recruitment_applicants'
  ];
begin
  foreach v_table in array v_tables loop
    select c.relkind
      into v_relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = v_table;

    if v_relkind in ('r', 'p') then
      execute format(
        'alter table public.%I
          add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
          add column if not exists process_run_id uuid references public.process_runs(id) on delete set null,
          add column if not exists execution_process_draft jsonb not null default ''[]''::jsonb',
        v_table
      );
    end if;
  end loop;
end $$;
