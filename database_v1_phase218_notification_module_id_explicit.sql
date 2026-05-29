-- =====================================================
-- KalamApp - Phase 218: Explicit notification module_id for shared invoice tables
-- Date: 2026-05-29
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

create or replace function public.kalam_emit_notification_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_user_id uuid;
  v_role_id uuid;
begin
  v_payload := jsonb_build_object(
    'id', new.id,
    'org_id', new.org_id,
    'source_type', new.source_type,
    'source_id', new.source_id,
    'section', new.section,
    'category', new.category,
    'action', new.action,
    'module_id', new.module_id,
    'record_id', new.record_id,
    'last_event_at', new.last_event_at,
    'targeted', not new.is_org_wide
  );

  if new.is_org_wide then
    perform public.kalam_broadcast_notification(public.kalam_realtime_org_topic(new.org_id), 'notification', v_payload);
  end if;

  foreach v_user_id in array public.kalam_distinct_uuid_array(new.target_user_ids) loop
    perform public.kalam_broadcast_notification(public.kalam_realtime_user_topic(new.org_id, v_user_id), 'notification', v_payload);
  end loop;

  foreach v_role_id in array public.kalam_distinct_uuid_array(new.target_role_ids) loop
    perform public.kalam_broadcast_notification(public.kalam_realtime_role_topic(new.org_id, v_role_id), 'notification', v_payload);
  end loop;

  return new;
end;
$$;

create or replace function public.kalam_responsibility_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_org_id uuid := public.kalam_try_uuid(v_row->>'org_id');
  v_record_id text := nullif(v_row->>'id', '');
  v_assignee_id uuid := public.kalam_try_uuid(v_row->>'assignee_id');
  v_assignee_role_id uuid := public.kalam_try_uuid(v_row->>'assignee_role_id');
  v_assignee_type text := lower(trim(coalesce(v_row->>'assignee_type', '')));
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_title text;
  v_module_id text;
begin
  if v_org_id is null or v_record_id is null then
    return new;
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
    return new;
  end if;

  v_title := coalesce(
    nullif(v_row->>'name', ''),
    nullif(v_row->>'title', ''),
    nullif(v_row->>'full_name', ''),
    nullif(v_row->>'system_code', ''),
    tg_table_name || ':' || v_record_id
  );

  v_module_id := public.kalam_resolve_notification_module_id(tg_table_name, v_row);

  perform public.kalam_upsert_notification_item(
    v_org_id,
    tg_table_name,
    v_record_id,
    'responsibilities',
    tg_table_name,
    lower(tg_op),
    v_title,
    nullif(left(coalesce(v_row->>'description', v_row->>'summary', ''), 240), ''),
    v_module_id,
    v_record_id,
    v_target_users,
    v_target_roles,
    false,
    jsonb_build_object(
      'table', tg_table_name,
      'module_id', v_module_id
    ),
    now()
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.invoices') is not null then
    update public.notification_inbox_items nii
    set module_id = public.kalam_resolve_notification_module_id('invoices', to_jsonb(inv)),
        payload = jsonb_set(
          coalesce(nii.payload, '{}'::jsonb),
          '{module_id}',
          to_jsonb(public.kalam_resolve_notification_module_id('invoices', to_jsonb(inv))),
          true
        ),
        updated_at = now()
    from public.invoices inv
    where nii.org_id = inv.org_id
      and nii.section = 'responsibilities'
      and coalesce(nullif(trim(nii.source_type), ''), nullif(trim(nii.payload->>'table'), ''), nullif(trim(nii.module_id), '')) = 'invoices'
      and coalesce(nullif(trim(nii.source_id), ''), nullif(trim(nii.record_id), '')) = inv.id::text
      and coalesce(nullif(trim(nii.module_id), ''), '') is distinct from public.kalam_resolve_notification_module_id('invoices', to_jsonb(inv));
  end if;

  if to_regclass('public.purchase_invoices') is not null then
    update public.notification_inbox_items nii
    set module_id = public.kalam_resolve_notification_module_id('purchase_invoices', to_jsonb(inv)),
        payload = jsonb_set(
          coalesce(nii.payload, '{}'::jsonb),
          '{module_id}',
          to_jsonb(public.kalam_resolve_notification_module_id('purchase_invoices', to_jsonb(inv))),
          true
        ),
        updated_at = now()
    from public.purchase_invoices inv
    where nii.org_id = inv.org_id
      and nii.section = 'responsibilities'
      and coalesce(nullif(trim(nii.source_type), ''), nullif(trim(nii.payload->>'table'), ''), nullif(trim(nii.module_id), '')) = 'purchase_invoices'
      and coalesce(nullif(trim(nii.source_id), ''), nullif(trim(nii.record_id), '')) = inv.id::text
      and coalesce(nullif(trim(nii.module_id), ''), '') is distinct from public.kalam_resolve_notification_module_id('purchase_invoices', to_jsonb(inv));
  end if;

  update public.notification_inbox_items nii
  set payload = jsonb_set(
        coalesce(nii.payload, '{}'::jsonb),
        '{module_id}',
        to_jsonb(nii.module_id),
        true
      ),
      updated_at = now()
  where nullif(trim(coalesce(nii.module_id, '')), '') is not null
    and coalesce(nii.payload->>'module_id', '') is distinct from nii.module_id;
end $$;

commit;
