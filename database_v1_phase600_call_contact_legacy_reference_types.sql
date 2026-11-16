-- Older communication tables use text for some record references; newer ones
-- use UUID. Let PostgreSQL infer the literal type from the indexed column.
-- Values still come only from validated UUID parameters and format('%L').
begin;
do $$declare definition text;patched text;begin
 definition:=pg_get_functiondef('public.read_call_contact_history(text,uuid,text,integer)'::regprocedure);
 patched:=replace(definition,'%L::uuid','%L');
 if patched<>definition then execute patched;end if;
end$$;
notify pgrst,'reload schema';
commit;
