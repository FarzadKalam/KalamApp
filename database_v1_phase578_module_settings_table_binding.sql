-- Restore the reviewed module/table binding guard without replaying historical migrations.
-- Existing field values and columns are unchanged. Tenant authorization stays fail-closed.
begin;

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
  expected_table text;
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

  expected_table := case normalized_module
    when 'voip_call_reports' then 'voip_call_logs'
    else normalized_module
  end;

  if normalized_table <> expected_table then
    raise exception 'جدول مقصد با ماژول انتخاب‌شده همخوانی ندارد.';
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
