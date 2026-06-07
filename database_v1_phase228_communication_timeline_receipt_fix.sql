-- =====================================================
-- KalamApp - Phase 228: Communication timeline receipt compatibility
-- Date: 2026-06-06
-- Type: Bugfix / performance / idempotent
-- =====================================================

begin;

do $migration$
declare
  v_signature regprocedure := to_regprocedure(
    'public.get_communication_timeline(text,text,text,integer)'
  );
  v_definition text;
begin
  if v_signature is null then
    raise exception 'public.get_communication_timeline(text,text,text,integer) is missing';
  end if;

  select pg_get_functiondef(v_signature::oid)
  into v_definition;

  if position('reader_profile.display_name' in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      'nullif(trim(reader_profile.display_name), ''''),',
      ''
    );
    if position('reader_profile.display_name' in v_definition) > 0 then
      raise exception 'Could not patch reader_profile.display_name in get_communication_timeline';
    end if;
    execute v_definition;
  end if;
end;
$migration$;

grant execute on function public.get_communication_timeline(text, text, text, integer) to authenticated;
revoke all on function public.get_communication_timeline(text, text, text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
