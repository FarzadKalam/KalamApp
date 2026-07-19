-- Phase 350: Remove accidentally persisted Process V2 runtime context from
-- record draft columns. The migration is idempotent and keeps template ids,
-- process grouping, links, automation rules and every user-authored value.

begin;

create or replace function pg_temp.strip_process_v2_transient_context(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_type text := jsonb_typeof(p_value);
begin
  if v_type = 'object' then
    return coalesce((
      select jsonb_object_agg(entry.key, pg_temp.strip_process_v2_transient_context(entry.value))
      from jsonb_each(p_value) entry
      where entry.key <> '__process_v2_template_context'
    ), '{}'::jsonb);
  end if;
  if v_type = 'array' then
    return coalesce((
      select jsonb_agg(pg_temp.strip_process_v2_transient_context(item.value) order by item.ordinality)
      from jsonb_array_elements(p_value) with ordinality item(value, ordinality)
    ), '[]'::jsonb);
  end if;
  return p_value;
end;
$$;

do $$
declare
  target record;
begin
  for target in
    select c.table_schema, c.table_name, c.column_name, c.udt_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.udt_name in ('json', 'jsonb')
      and (
        c.column_name like '%\_process\_draft' escape '\'
        or c.column_name = 'production_stages_draft'
      )
  loop
    execute format(
      'update %I.%I
          set %I = pg_temp.strip_process_v2_transient_context(%I::jsonb)::%I
        where %I is not null
          and %I::text like %L',
      target.table_schema,
      target.table_name,
      target.column_name,
      target.column_name,
      target.udt_name,
      target.column_name,
      target.column_name,
      '%__process_v2_template_context%'
    );
  end loop;
end;
$$;

commit;
