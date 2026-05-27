-- =====================================================
-- KalamApp - Phase 212: Module Settings Custom Columns
-- Date: 2026-05-27
-- Type: Security patch / idempotent
-- Goals:
--   1) Custom fields added from Module Settings must have real table columns.
--   2) DDL is exposed only through a narrow SECURITY DEFINER RPC.
--   3) Access stays tenant-scoped and fail-closed when current_org_id() is null.
-- =====================================================

begin;

create or replace function public.current_user_can_edit_module_settings(required_module text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_org uuid := public.current_org_id();
  role_permissions jsonb;
  settings_perm jsonb;
  settings_fields jsonb;
  module_perm jsonb;
  module_fields jsonb;
  normalized_module text := nullif(trim(coalesce(required_module, '')), '');
begin
  if auth.uid() is null or current_org is null or normalized_module is null then
    return false;
  end if;

  select r.permissions
    into role_permissions
  from public.profiles p
  join public.org_roles r
    on r.id = p.role_id
   and r.org_id = p.org_id
  where p.id = auth.uid()
    and p.org_id = current_org
  limit 1;

  if role_permissions is null then
    return false;
  end if;

  settings_perm := role_permissions -> '__settings_tabs';
  if settings_perm is not null and jsonb_typeof(settings_perm) = 'object' then
    if coalesce(settings_perm ->> 'view', 'true') = 'false'
       or coalesce(settings_perm ->> 'edit', 'true') = 'false' then
      return false;
    end if;

    settings_fields := coalesce(settings_perm -> 'fields', '{}'::jsonb);
    if jsonb_typeof(settings_fields) = 'object'
       and coalesce(settings_fields ->> 'module_settings', 'true') = 'false' then
      return false;
    end if;
  end if;

  module_perm := role_permissions -> normalized_module;
  if module_perm is not null and jsonb_typeof(module_perm) = 'object' then
    if coalesce(module_perm ->> 'view', 'true') = 'false'
       or coalesce(module_perm ->> 'edit', 'true') = 'false' then
      return false;
    end if;

    module_fields := coalesce(module_perm -> 'fields', '{}'::jsonb);
    if jsonb_typeof(module_fields) = 'object'
       and coalesce(module_fields ->> '__module_settings', 'true') = 'false' then
      return false;
    end if;
  end if;

  return true;
end
$$;

revoke all on function public.current_user_can_edit_module_settings(text) from public;
grant execute on function public.current_user_can_edit_module_settings(text) to authenticated;

create or replace function public.ensure_module_settings_columns(
  p_module_id text,
  p_table_name text,
  p_fields jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_module text := lower(trim(coalesce(p_module_id, '')));
  normalized_table text := lower(trim(coalesce(p_table_name, '')));
  field_item jsonb;
  field_key text;
  field_type text;
  sql_type text;
  table_relkind "char";
  changed boolean := false;
begin
  if auth.uid() is null or public.current_org_id() is null then
    raise exception 'دسترسی سازمان جاری قابل تشخیص نیست.';
  end if;

  if not public.current_user_can_edit_module_settings(normalized_module) then
    raise exception 'برای ویرایش فیلدهای این ماژول دسترسی ندارید.';
  end if;

  if normalized_module !~ '^[a-z][a-z0-9_]*$'
     or normalized_table !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'شناسه ماژول یا جدول معتبر نیست.';
  end if;

  if normalized_table in (
    'organizations',
    'org_roles',
    'integration_settings',
    'company_settings',
    'app_schema_migrations',
    'system_code_counters'
  ) then
    raise exception 'این جدول برای فیلد سفارشی مجاز نیست.';
  end if;

  select c.relkind
    into table_relkind
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = normalized_table
    and c.relkind in ('r', 'p');

  if table_relkind is null then
    raise exception 'جدول مقصد برای فیلد سفارشی پیدا نشد.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = normalized_table
      and column_name = 'org_id'
  ) then
    raise exception 'جدول مقصد tenant-owned نیست.';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    return;
  end if;

  for field_item in
    select value from jsonb_array_elements(p_fields)
  loop
    field_key := lower(trim(coalesce(field_item ->> 'key', '')));
    field_type := lower(trim(coalesce(field_item ->> 'type', 'text')));

    if field_key = ''
       or field_key !~ '^[a-z][a-z0-9_]*$'
       or field_key in ('id', 'org_id', 'created_at', 'updated_at', 'created_by', 'updated_by') then
      raise exception 'کلید فیلد سفارشی معتبر نیست: %', field_key;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = normalized_table
        and column_name = field_key
    ) then
      continue;
    end if;

    sql_type := case field_type
      when 'number' then 'numeric'
      when 'price' then 'numeric'
      when 'percentage' then 'numeric'
      when 'percentage_or_amount' then 'numeric'
      when 'checkbox' then 'boolean'
      when 'date' then 'date'
      when 'time' then 'time'
      when 'datetime' then 'timestamptz'
      when 'relation' then 'uuid'
      when 'user' then 'uuid'
      when 'multi_relation' then 'jsonb'
      when 'multi_select' then 'jsonb'
      when 'checklist' then 'jsonb'
      when 'json' then 'jsonb'
      when 'location' then 'jsonb'
      when 'progress_stages' then 'jsonb'
      else 'text'
    end;

    execute format('alter table public.%I add column if not exists %I %s', normalized_table, field_key, sql_type);
    changed := true;
  end loop;

  if changed then
    perform pg_notify('pgrst', 'reload schema');
  end if;
end
$$;

revoke all on function public.ensure_module_settings_columns(text, text, jsonb) from public;
grant execute on function public.ensure_module_settings_columns(text, text, jsonb) to authenticated;

commit;
