-- =====================================================
-- KalamApp - Phase 170: Fix Relation Field Tenant Isolation
-- Date: 2026-06-02
-- Type: Security patch / backward-compatible
-- Problem:
--   Several tables introduced after phase 163 are missing
--   proper org_id RLS policies (still have using(true) or no policy).
--   This allows authenticated users to see data from other orgs
--   via Supabase queries.
--
--   Note on profiles + saas admin:
--   Phase 163 intentionally added p_profiles_select_admin to allow
--   SaaS admins to view cross-org profiles (needed for saas_admin_orgs_view).
--   This policy is KEPT — but the frontend now adds explicit org_id filters
--   in runRelationQuery to prevent cross-org data appearing in relation
--   field dropdowns.
--
-- Fix:
--   Add org_id = current_org_id() RLS policies to tables introduced
--   after phase 163 that were missing proper tenant isolation.
-- =====================================================

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'employee_contracts',
    'payroll_slips',
    'recruitment_applicants',
    'expense_documents',
    'delivery_forms',
    'secretariat_documents',
    'voip_call_reports',
    'sms_delivery_reports',
    'automation_execution_reports',
    'counterparty_bot_groups',
    'surveys',
    'web_forms',
    'goals',
    'instructions',
    'cash_boxes',
    'bank_accounts',
    'petty_funds',
    'cheques',
    'cash_bank_operations',
    'fiscal_years',
    'journal_entries',
    'journal_lines',
    'cost_centers',
    'accounting_event_rules',
    'barters',
    'invoice_lines',
    'purchase_invoice_lines',
    'chart_of_accounts',
    'sales_catalog_items',
    'personas',
    'org_invites',
    'employee_bonus_requests',
    'employee_penalty_requests',
    'employee_advances',
    'mission_requests'
  ]
  loop
    if to_regclass(format('public.%I', t)) is not null
      and exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = t
          and table_type = 'BASE TABLE'
      )
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = t
          and column_name = 'org_id'
      ) then
      -- RLS را فعال می‌کنیم (idempotent)
      execute format('alter table public.%I enable row level security', t);

      -- فقط اگر policy قبلاً using(true) داشت یا وجود نداشت، جایگزین می‌کنیم
      execute format('drop policy if exists %I on public.%I', 'p_' || t || '_auth_all', t);
      execute format('drop policy if exists %I on public.%I', 'p_' || t || '_org_all', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id())',
        'p_' || t || '_org_all',
        t
      );
    end if;
  end loop;
end
$$;

do $$
begin
  raise notice 'Phase 170: org_id = current_org_id() RLS policies added to tenant tables missing isolation.';
  raise notice 'Note: p_profiles_select_admin kept intentionally for saas_admin_orgs_view.';
  raise notice 'Frontend org_id filter in runRelationQuery prevents cross-org leakage in relation dropdowns.';
end
$$;

notify pgrst, 'reload schema';

commit;
