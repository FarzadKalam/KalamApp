-- =====================================================
-- KalamApp - Phase 131
-- Web forms: fix duplicate-update SET assignments
-- =====================================================

begin;

do $$
declare
  v_function_sql text;
  v_fixed_sql text;
begin
  select pg_get_functiondef('public.submit_public_web_form(text,jsonb,jsonb,text)'::regprocedure)
    into v_function_sql;

  if nullif(trim(coalesce(v_function_sql, '')), '') is null then
    raise exception 'submit_public_web_form function not found';
  end if;

  v_fixed_sql := replace(
    v_function_sql,
    'format(''t.%1$I = src.%1$I'', c.column_name)',
    'format(''%1$I = src.%1$I'', c.column_name)'
  );

  if v_fixed_sql <> v_function_sql then
    execute v_fixed_sql;
  end if;

  if position('format(''t.%1$I = src.%1$I'', c.column_name)' in v_fixed_sql) > 0 then
    raise exception 'submit_public_web_form duplicate-update alias repair failed';
  end if;
end $$;

revoke all on function public.submit_public_web_form(text, jsonb, jsonb, text) from public;
grant execute on function public.submit_public_web_form(text, jsonb, jsonb, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
