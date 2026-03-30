-- =====================================================
-- KalamApp - Phase 24 Accounting Auto-Posting Compatibility
-- Date: 2026-03-21
-- Type: Safe migration / backward compatible
-- =====================================================

-- 1) Ensure source tracking fields exist on journal_entries
alter table if exists public.journal_entries
  add column if not exists source_module text,
  add column if not exists source_table text,
  add column if not exists source_record_id uuid,
  add column if not exists source_record_title text;

create index if not exists idx_journal_entries_source
  on public.journal_entries(source_table, source_record_id);

-- Backfill a readable related-record title for old invoice-linked entries
do $$
begin
  if to_regclass('public.invoices') is not null then
    update public.journal_entries je
    set source_record_title = coalesce(i.system_code, i.name, je.source_record_id::text)
    from public.invoices i
    where je.source_table = 'invoices'
      and je.source_record_id = i.id
      and coalesce(je.source_record_title, '') = '';
  end if;

  if to_regclass('public.purchase_invoices') is not null then
    update public.journal_entries je
    set source_record_title = coalesce(pi.system_code, pi.name, je.source_record_id::text)
    from public.purchase_invoices pi
    where je.source_table = 'purchase_invoices'
      and je.source_record_id = pi.id
      and coalesce(je.source_record_title, '') = '';
  end if;
end $$;

-- 2) Ensure idempotency table exists for auto-posting events
create table if not exists public.journal_entry_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  event_key text not null,
  source_table text not null,
  source_record_id uuid not null,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_journal_entry_links_unique_source
  on public.journal_entry_links(org_id, event_key, source_table, source_record_id);

create index if not exists idx_journal_entry_links_journal_entry
  on public.journal_entry_links(journal_entry_id);

-- 3) Ensure integration_settings supports module_settings key per org
alter table if exists public.integration_settings
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists connection_type text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integration_settings'::regclass
      and conname = 'integration_settings_connection_type_check'
  ) then
    alter table public.integration_settings
      drop constraint integration_settings_connection_type_check;
  end if;

  alter table public.integration_settings
    add constraint integration_settings_connection_type_check
    check (connection_type in ('sms', 'email', 'site', 'module_settings', 'print_templates'));
end $$;

create unique index if not exists idx_integration_settings_org_connection_type
  on public.integration_settings(org_id, connection_type);

-- 4) Fill module_settings defaults from standard COA codes (for current org)
do $$
declare
  v_org_id uuid := public.current_org_id();
  v_settings_row_id uuid;
  v_settings jsonb;
  v_existing_defaults jsonb := '{}'::jsonb;
  v_auto_defaults jsonb := '{}'::jsonb;
  v_new_defaults jsonb := '{}'::jsonb;

  v_receivable uuid;
  v_payable uuid;
  v_sales_revenue uuid;
  v_cash uuid;
  v_bank uuid;
  v_sales_discount uuid;
  v_cogs uuid;
  v_inventory uuid;
  v_sales_tax uuid;
begin
  -- Standard default code map (from phase4 seed)
  select id into v_receivable
  from public.chart_of_accounts
  where org_id is not distinct from v_org_id
  order by
    case
      when code = '1111' then 1
      when code = '111' then 2
      when account_type = 'asset' and (name ilike '%دریافتنی%' or name ilike '%receivable%') then 3
      when account_type = 'asset' then 50
      else 999
    end,
    code nulls last
  limit 1;

  select id into v_payable
  from public.chart_of_accounts
  where org_id is not distinct from v_org_id
  order by
    case
      when code = '2101' then 1
      when code = '210' then 2
      when account_type = 'liability' and (name ilike '%پرداختنی%' or name ilike '%payable%') then 3
      when account_type = 'liability' then 50
      else 999
    end,
    code nulls last
  limit 1;

  select id into v_sales_revenue
  from public.chart_of_accounts
  where org_id is not distinct from v_org_id
  order by
    case
      when code = '4101' then 1
      when code = '410' then 2
      when account_type = 'income' and (name ilike '%فروش%' or name ilike '%درآمد%' or name ilike '%revenue%') then 3
      when account_type = 'income' then 50
      else 999
    end,
    code nulls last
  limit 1;

  select id into v_cash
  from public.chart_of_accounts
  where org_id is not distinct from v_org_id
  order by
    case
      when code = '1101' then 1
      when account_type = 'asset' and (name ilike '%صندوق%' or name ilike '%cash%') then 2
      else 999
    end,
    code nulls last
  limit 1;

  select id into v_bank
  from public.chart_of_accounts
  where org_id is not distinct from v_org_id
  order by
    case
      when code = '1102' then 1
      when account_type = 'asset' and (name ilike '%بانک%' or name ilike '%bank%') then 2
      else 999
    end,
    code nulls last
  limit 1;

  select id into v_sales_discount
  from public.chart_of_accounts
  where org_id is not distinct from v_org_id
  order by
    case
      when code = '4102' then 1
      when account_type = 'income' and (name ilike '%تخفیف%' or name ilike '%discount%') then 2
      else 999
    end,
    code nulls last
  limit 1;

  select id into v_cogs
  from public.chart_of_accounts
  where org_id is not distinct from v_org_id
  order by
    case
      when code = '5101' then 1
      when account_type = 'expense' and (name ilike '%بهای تمام%' or name ilike '%cost%' or name ilike '%cogs%') then 2
      when account_type = 'expense' then 50
      else 999
    end,
    code nulls last
  limit 1;

  select id into v_inventory
  from public.chart_of_accounts
  where org_id is not distinct from v_org_id
  order by
    case
      when code = '1301' then 1
      when account_type = 'asset' and (name ilike '%موجودی%' or name ilike '%inventory%') then 2
      when account_type = 'asset' then 50
      else 999
    end,
    code nulls last
  limit 1;

  select id into v_sales_tax
  from public.chart_of_accounts
  where org_id is not distinct from v_org_id
  order by
    case
      when code = '2111' then 1
      when account_type = 'liability' and (name ilike '%مالیات%' or name ilike '%ارزش افزوده%' or name ilike '%tax%') then 2
      else 999
    end,
    code nulls last
  limit 1;

  select id, settings
  into v_settings_row_id, v_settings
  from public.integration_settings
  where org_id is not distinct from v_org_id
    and connection_type = 'module_settings'
  limit 1;

  v_settings := coalesce(v_settings, '{}'::jsonb);
  v_existing_defaults := coalesce(v_settings #> '{modules,accounting,defaults}', '{}'::jsonb);

  v_auto_defaults := jsonb_strip_nulls(
    jsonb_build_object(
      'default_accounts_receivable_id', v_receivable,
      'default_accounts_payable_id', v_payable,
      'default_sales_revenue_id', v_sales_revenue,
      'default_payment_cash_id', v_cash,
      'default_payment_bank_id', v_bank,
      'default_sales_discount_id', v_sales_discount,
      'default_cogs_id', v_cogs,
      'default_inventory_asset_id', v_inventory,
      'default_sales_tax_id', v_sales_tax
    )
  );

  -- Existing values win; only fill missing defaults
  v_new_defaults := v_auto_defaults || v_existing_defaults;

  v_settings := jsonb_set(v_settings, '{modules}', coalesce(v_settings->'modules', '{}'::jsonb), true);
  v_settings := jsonb_set(v_settings, '{modules,accounting}', coalesce(v_settings #> '{modules,accounting}', '{}'::jsonb), true);
  v_settings := jsonb_set(v_settings, '{modules,accounting,defaults}', v_new_defaults, true);

  insert into public.integration_settings (
    id,
    org_id,
    connection_type,
    provider,
    is_active,
    settings
  )
  values (
    coalesce(v_settings_row_id, gen_random_uuid()),
    v_org_id,
    'module_settings',
    'core',
    true,
    v_settings
  )
  on conflict (org_id, connection_type)
  do update
    set settings = excluded.settings,
        provider = excluded.provider,
        is_active = true;
end $$;
