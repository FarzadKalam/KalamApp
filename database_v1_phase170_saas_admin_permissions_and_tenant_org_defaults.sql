-- =====================================================
-- KalamApp - Phase 170: SaaS Admin Permission Scope + Tenant INSERT org_id
-- Date: 2026-05-21
-- Type: Security patch / idempotent
-- Goals:
--   1) SaaS admin access must be explicit: __saas_admin.view = true
--   2) SaaS admin granular fields support both root and fields.* storage
--   3) Tenant-owned module inserts get org_id from current_org_id() before RLS
--      so strict org_id policies stay fail-closed without breaking normal creates
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۱. SaaS admin must be opt-in, not default-open
-- ─────────────────────────────────────────────
create or replace function public.current_user_has_saas_admin_permission(required_field text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_permissions jsonb;
  root_permission  jsonb;
  root_fields      jsonb;
  field_name       text := nullif(trim(coalesce(required_field, '')), '');
  root_edit        boolean := false;
  has_view         boolean := false;
begin
  select r.permissions
    into role_permissions
  from public.profiles p
  join public.org_roles r
    on r.id = p.role_id
  where p.id = auth.uid()
  limit 1;

  if role_permissions is null then
    return false;
  end if;

  root_permission := role_permissions -> '__saas_admin';
  if root_permission is null or jsonb_typeof(root_permission) <> 'object' then
    return false;
  end if;

  root_fields := coalesce(root_permission -> 'fields', '{}'::jsonb);
  root_edit := coalesce((root_permission ->> 'edit')::boolean, false);
  has_view := coalesce((root_permission ->> 'view')::boolean, false)
    or root_edit
    or coalesce((root_fields ->> 'edit_orgs')::boolean, false)
    or coalesce((root_fields ->> 'edit_requests')::boolean, false)
    or coalesce((root_fields ->> 'demo_override')::boolean, false);
  if not has_view then
    return false;
  end if;

  if field_name is null or field_name = 'view' then
    return true;
  end if;

  return coalesce((root_permission ->> field_name)::boolean, false)
      or coalesce((root_fields ->> field_name)::boolean, false);
end
$$;

revoke all on function public.current_user_has_saas_admin_permission(text) from public;
grant execute on function public.current_user_has_saas_admin_permission(text) to authenticated;

-- ─────────────────────────────────────────────
-- ۲. Fill org_id automatically on tenant rows before strict RLS checks.
--    If current_org_id() is null, we leave it null so RLS fails closed.
-- ─────────────────────────────────────────────
create or replace function public.set_current_org_id_if_missing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.org_id is null then
    new.org_id := public.current_org_id();
  end if;

  return new;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'dynamic_options',
    'saved_views',
    'tags',
    'record_tags',
    'changelogs',
    'user_login_events',
    'sidebar_unread',
    'workflows',
    'workflow_logs',
    'warehouses',
    'shelves',
    'suppliers',
    'customers',
    'work_schedules',
    'employees',
    'attendance_logs',
    'products',
    'product_images',
    'product_inventory',
    'production_group_orders',
    'production_boms',
    'production_orders',
    'production_lines',
    'product_lines',
    'stock_transfers',
    'invoices',
    'purchase_invoices',
    'tasks',
    'calculation_formulas',
    'price_lists',
    'product_bundles',
    'bundle_items',
    'process_templates',
    'process_runs',
    'projects',
    'project_members',
    'marketing_leads',
    'module_relations',
    'ai_record_contexts',
    'leave_requests',
    'overtime_requests',
    'mission_requests',
    'ready_texts',
    'process_run_links',
    'org_stories',
    'org_story_views',
    'org_story_reactions',
    'personas',
    'instructions',
    'surveys',
    'web_forms',
    'expense_documents',
    'employee_advances',
    'employee_bonus_requests',
    'employee_penalty_requests',
    'payroll_slips',
    'employee_contracts',
    'recruitment_applicants',
    'counterparty_bot_groups'
  ];
  has_created_by boolean;
  has_updated_by boolean;
  has_assignee_id boolean;
begin
  foreach t in array tables
  loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = t
        and column_name = 'org_id'
    ) then
      continue;
    end if;

    execute format('alter table public.%I alter column org_id set default public.current_org_id()', t);

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'created_by'
    ) into has_created_by;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'updated_by'
    ) into has_updated_by;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'assignee_id'
    ) into has_assignee_id;

    if has_created_by then
      execute format($sql$
        update public.%I target
        set org_id = coalesce(p.org_id, r.org_id)
        from public.profiles p
        left join public.org_roles r on r.id = p.role_id
        where target.org_id is null
          and target.created_by::text = p.id::text
          and coalesce(p.org_id, r.org_id) is not null
      $sql$, t);
    end if;

    if has_updated_by then
      execute format($sql$
        update public.%I target
        set org_id = coalesce(p.org_id, r.org_id)
        from public.profiles p
        left join public.org_roles r on r.id = p.role_id
        where target.org_id is null
          and target.updated_by::text = p.id::text
          and coalesce(p.org_id, r.org_id) is not null
      $sql$, t);
    end if;

    if has_assignee_id then
      execute format($sql$
        update public.%I target
        set org_id = coalesce(p.org_id, r.org_id)
        from public.profiles p
        left join public.org_roles r on r.id = p.role_id
        where target.org_id is null
          and target.assignee_id::text = p.id::text
          and coalesce(p.org_id, r.org_id) is not null
      $sql$, t);
    end if;

    execute format('drop trigger if exists %I on public.%I', 'trg_set_current_org_id_' || t, t);
    execute format(
      'create trigger %I before insert or update of org_id on public.%I for each row execute function public.set_current_org_id_if_missing()',
      'trg_set_current_org_id_' || t,
      t
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';

commit;
