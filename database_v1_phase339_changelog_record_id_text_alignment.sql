-- Phase 339: Align legacy changelog record identifiers with the modular audit runtime.
-- Some older installations created changelogs.record_id as uuid, while the
-- current generic activity system intentionally stores module record keys as text.

begin;

do $$
declare
  v_record_id_type text;
begin
  select c.data_type
    into v_record_id_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'changelogs'
    and c.column_name = 'record_id';

  if v_record_id_type is not null and v_record_id_type <> 'text' then
    alter table public.changelogs
      alter column record_id drop default;

    alter table public.changelogs
      alter column record_id type text
      using record_id::text;

    alter table public.changelogs
      alter column record_id set default '';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
