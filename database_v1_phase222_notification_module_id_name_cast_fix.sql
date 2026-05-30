-- =====================================================
-- KalamApp - Phase 222: Fix notification module_id resolver for trigger table names
-- Date: 2026-05-30
-- Type: Runtime / Notifications / idempotent
-- =====================================================

begin;

create or replace function public.kalam_resolve_notification_module_id(
  p_module_id text,
  p_record jsonb default '{}'::jsonb
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(trim(coalesce(p_module_id, '')), '') = 'invoices'
      and nullif(trim(coalesce(p_record->>'taxpayer_invoice_pattern', '')), '') = '2'
      then 'sales_return_invoices'
    when nullif(trim(coalesce(p_module_id, '')), '') = 'purchase_invoices'
      and nullif(trim(coalesce(p_record->>'taxpayer_invoice_pattern', '')), '') = '2'
      then 'purchase_return_invoices'
    else nullif(trim(coalesce(p_module_id, '')), '')
  end;
$$;

create or replace function public.kalam_resolve_notification_module_id(
  p_module_id name,
  p_record jsonb default '{}'::jsonb
)
returns text
language sql
immutable
set search_path = public
as $$
  select public.kalam_resolve_notification_module_id(p_module_id::text, p_record);
$$;

create or replace function public.kalam_responsibility_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org_id uuid := public.kalam_try_uuid(v_row->>'org_id');
  v_record_id text := nullif(v_row->>'id', '');
  v_assignee_id uuid := public.kalam_try_uuid(v_row->>'assignee_id');
  v_assignee_role_id uuid := public.kalam_try_uuid(v_row->>'assignee_role_id');
  v_assignee_type text := lower(trim(coalesce(v_row->>'assignee_type', '')));
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_title text;
  v_module_id text;
  v_table_name text := tg_table_name::text;
begin
  if v_org_id is null or v_record_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    delete from public.notification_inbox_items
    where org_id = v_org_id
      and section = 'responsibilities'
      and source_type = v_table_name
      and source_id = v_record_id;
    return old;
  end if;

  if v_assignee_type = 'role' then
    v_target_roles := public.kalam_distinct_uuid_array(
      case
        when v_assignee_role_id is not null then array[v_assignee_role_id]
        when v_assignee_id is not null then array[v_assignee_id]
        else '{}'::uuid[]
      end
    );
  else
    if v_assignee_id is not null then
      v_target_users := array[v_assignee_id];
    end if;
    if v_assignee_role_id is not null then
      v_target_roles := array[v_assignee_role_id];
    end if;
  end if;

  if cardinality(v_target_users) = 0 and cardinality(v_target_roles) = 0 then
    delete from public.notification_inbox_items
    where org_id = v_org_id
      and section = 'responsibilities'
      and source_type = v_table_name
      and source_id = v_record_id;
    return new;
  end if;

  v_title := coalesce(
    nullif(v_row->>'name', ''),
    nullif(v_row->>'title', ''),
    nullif(v_row->>'full_name', ''),
    nullif(v_row->>'system_code', ''),
    v_table_name || ':' || v_record_id
  );

  v_module_id := public.kalam_resolve_notification_module_id(v_table_name, v_row);

  perform public.kalam_upsert_notification_item(
    v_org_id,
    v_table_name,
    v_record_id,
    'responsibilities',
    v_table_name,
    lower(tg_op),
    v_title,
    nullif(left(coalesce(v_row->>'description', v_row->>'summary', ''), 240), ''),
    v_module_id,
    v_record_id,
    v_target_users,
    v_target_roles,
    false,
    jsonb_build_object(
      'table', v_table_name,
      'module_id', v_module_id
    ),
    now()
  );

  return new;
end;
$$;

revoke all on function public.kalam_resolve_notification_module_id(text, jsonb) from public, anon, authenticated;
revoke all on function public.kalam_resolve_notification_module_id(name, jsonb) from public, anon, authenticated;

commit;
