-- فیلتر امن تعداد انتخاب‌ها برای نماهای ذخیره‌شده.
-- تابع فقط جدول‌های tenant-owned با org_id را می‌پذیرد و با current_org_id fail-closed است.

begin;

create or replace function public.filter_records_by_json_array_count(
  p_table_name text,
  p_field_name text,
  p_operator text,
  p_count integer
)
returns table(record_id text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  normalized_table_name text := btrim(coalesce(p_table_name, ''));
  normalized_field_name text := btrim(coalesce(p_field_name, ''));
  comparison_operator text := btrim(coalesce(p_operator, ''));
  target_table regclass;
begin
  if public.current_org_id() is null then
    return;
  end if;

  if normalized_table_name = '' or normalized_field_name = '' or p_count is null or p_count < 0 then
    raise exception 'invalid_array_count_filter';
  end if;

  if comparison_operator not in ('gt', 'lt') then
    raise exception 'invalid_array_count_operator';
  end if;

  target_table := to_regclass(format('public.%I', normalized_table_name));
  if target_table is null then
    raise exception 'invalid_array_count_table';
  end if;

  if not exists (
    select 1
    from pg_attribute attribute
    where attribute.attrelid = target_table
      and attribute.attname = normalized_field_name
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.atttypid in ('json'::regtype, 'jsonb'::regtype)
  ) or not exists (
    select 1
    from pg_attribute attribute
    where attribute.attrelid = target_table
      and attribute.attname = 'org_id'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) or not exists (
    select 1
    from pg_attribute attribute
    where attribute.attrelid = target_table
      and attribute.attname = 'id'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception 'invalid_array_count_field';
  end if;

  return query execute format(
    'select row.id::text
       from public.%1$I as row
      where row.org_id = public.current_org_id()
        and case
              when jsonb_typeof(row.%2$I::jsonb) = ''array'' then jsonb_array_length(row.%2$I::jsonb)
              else 0
            end %3$s $1',
    normalized_table_name,
    normalized_field_name,
    comparison_operator
  ) using p_count;
end;
$$;

revoke all on function public.filter_records_by_json_array_count(text, text, text, integer) from public;
grant execute on function public.filter_records_by_json_array_count(text, text, text, integer) to authenticated;

commit;
