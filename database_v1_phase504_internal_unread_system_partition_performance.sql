-- =====================================================
-- TazeSystem - Phase 504: Internal unread system partition performance
-- System and assistant notes already have a dedicated unread counter. Keep
-- them out of the internal-message counter before the per-row conversation
-- calculation, without widening recipient access.
-- =====================================================

begin;

do $migration$
declare
  v_signature regprocedure := 'public.get_internal_messaging_unread_total_v2()'::regprocedure;
  v_definition text;
  v_anchor text := 'where public.kalam_can_access_internal_message_v2(';
  v_replacement text := $replacement$
where lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant')
      and public.kalam_can_access_internal_message_v2($replacement$;
begin
  select pg_get_functiondef(v_signature::oid) into v_definition;

  if position('lower(trim(coalesce(nii.category, ''''))) not in (''system'', ''assistant'')' in v_definition) > 0 then
    return;
  end if;

  if position(v_anchor in v_definition) = 0 then
    raise exception 'Could not locate internal unread recipient predicate';
  end if;

  execute replace(v_definition, v_anchor, v_replacement);
end;
$migration$;

grant execute on function public.get_internal_messaging_unread_total_v2() to authenticated;
revoke all on function public.get_internal_messaging_unread_total_v2() from public, anon;

notify pgrst, 'reload schema';

commit;
