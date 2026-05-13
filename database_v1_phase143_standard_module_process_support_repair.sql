-- =====================================================
-- KalamApp - Phase 143 Standard Module Process Support Repair
-- Date: 2026-05-13
-- Type: Additive / non-breaking migration
-- Goal: keep database tables aligned with the shared process-module contract
-- =====================================================

begin;

do $$
declare
  target_tables text[] := array[
    'products',
    'billboards',
    'product_bundles',
    'production_boms',
    'production_orders',
    'production_group_orders',
    'customers',
    'suppliers',
    'invoices',
    'purchase_invoices',
    'warehouses',
    'shelves',
    'stock_transfers',
    'secretariat_documents',
    'delivery_forms',
    'projects',
    'marketing_leads',
    'fiscal_years',
    'chart_of_accounts',
    'journal_entries',
    'accounting_event_rules',
    'cost_centers',
    'cash_boxes',
    'bank_accounts',
    'petty_funds',
    'cheques',
    'cash_bank_operations',
    'barters',
    'profiles',
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
    'employee_bonus_requests',
    'employee_penalty_requests',
    'payroll_slips',
    'employee_contracts',
    'recruitment_applicants',
    'surveys'
  ];
  target_table text;
  fk_name text;
  process_template_column_type text;
  has_process_template_fk boolean;
  relation_kind "char";
begin
  foreach target_table in array target_tables loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    select cls.relkind
      into relation_kind
    from pg_class cls
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = target_table;

    if relation_kind is distinct from 'r' and relation_kind is distinct from 'p' then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists process_template_id uuid',
      target_table
    );

    execute format(
      'alter table public.%I add column if not exists execution_process_draft jsonb not null default ''[]''::jsonb',
      target_table
    );

    fk_name := format('%s_process_template_id_fkey', target_table);
    select c.data_type
      into process_template_column_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = target_table
      and c.column_name = 'process_template_id';

    select exists (
      select 1
      from pg_constraint constraint_row
      join pg_class rel on rel.oid = constraint_row.conrelid
      join pg_namespace rel_ns on rel_ns.oid = rel.relnamespace
      join pg_attribute attr on attr.attrelid = rel.oid and attr.attnum = any (constraint_row.conkey)
      where constraint_row.contype = 'f'
        and rel_ns.nspname = 'public'
        and rel.relname = target_table
        and attr.attname = 'process_template_id'
    )
      into has_process_template_fk;

    if process_template_column_type = 'uuid' and not has_process_template_fk then
      execute format(
        'alter table public.%I add constraint %I foreign key (process_template_id) references public.process_templates(id) on delete set null not valid',
        target_table,
        fk_name
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
