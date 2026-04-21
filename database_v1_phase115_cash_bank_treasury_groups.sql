-- =====================================================
-- KalamApp - Phase 115 Cash/Bank Treasury Groups
-- Date: 2026-04-21
-- Type: Additive / non-breaking seed migration
-- Prerequisite: database_v1_phase4_accounting_default_coa.sql
-- =====================================================

do $$
declare
  v_org_id uuid := public.current_org_id();
  v_cash_bank_id uuid;
  v_existing_id uuid;
begin
  select id
    into v_cash_bank_id
  from public.chart_of_accounts
  where org_id is not distinct from v_org_id
    and code = '110'
  limit 1;

  if v_cash_bank_id is null then
    return;
  end if;

  select id
    into v_existing_id
  from public.chart_of_accounts
  where org_id is not distinct from v_org_id
    and code = '1103'
  limit 1;

  if v_existing_id is null then
    insert into public.chart_of_accounts (
      org_id,
      code,
      name,
      account_type,
      account_level,
      nature,
      parent_id,
      is_leaf,
      is_system,
      is_active
    )
    values (
      v_org_id,
      '1103',
      'تنخواه گردان',
      'asset',
      'detail',
      'debit',
      v_cash_bank_id,
      true,
      true,
      true
    );
  else
    update public.chart_of_accounts
    set
      name = 'تنخواه گردان',
      parent_id = v_cash_bank_id,
      account_type = 'asset',
      account_level = 'detail',
      nature = 'debit',
      is_leaf = true,
      is_system = true,
      is_active = true
    where id = v_existing_id;
  end if;
end
$$;
