-- TazeSystem - Phase 359: fast tenant-scoped role mention lookup
-- Keeps compatibility note queries responsive for organizations with many notes.

begin;

do $$
declare
  v_extension_schema text;
begin
  select namespace.nspname
    into v_extension_schema
  from pg_extension extension
  join pg_namespace namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'btree_gin';

  if v_extension_schema is null then
    create extension btree_gin with schema extensions;
    v_extension_schema := 'extensions';
  end if;

  execute format(
    'create index if not exists idx_notes_org_mention_role_ids_gin on public.notes using gin (org_id %I.uuid_ops, mention_role_ids)',
    v_extension_schema
  );
end;
$$;

commit;
