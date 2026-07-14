-- Phase 340: Align legacy generic file identifiers with the current file runtime.
-- Older databases may still keep these polymorphic identifiers as uuid, while
-- web forms and the generic file manager intentionally persist them as text.

begin;

do $$
declare
  v_column_name text;
  v_data_type text;
begin
  if to_regclass('public.record_files') is null then
    return;
  end if;

  foreach v_column_name in array array['record_id', 'source_record_id']
  loop
    select c.data_type
      into v_data_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'record_files'
      and c.column_name = v_column_name;

    if v_data_type is not null and v_data_type <> 'text' then
      execute format(
        'alter table public.record_files alter column %I drop default',
        v_column_name
      );
      execute format(
        'alter table public.record_files alter column %1$I type text using %1$I::text',
        v_column_name
      );
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';

commit;
