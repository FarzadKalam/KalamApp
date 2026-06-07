-- =====================================================
-- KalamApp - Phase 229: Bot message read receipts
-- Date: 2026-06-06
-- Type: Bugfix / communication receipts / idempotent
-- =====================================================

begin;

do $migration$
declare
  v_signature regprocedure := to_regprocedure(
    'public.get_communication_timeline(text,text,text,integer)'
  );
  v_definition text;
  v_old_fragment text := 'm.payload, m.created_by, m.created_at,';
  v_new_fragment text := $fragment$
          coalesce(m.payload, '{}'::jsonb) || jsonb_build_object(
            'read_receipts',
            coalesce((
              select jsonb_object_agg(
                reader.user_id::text,
                jsonb_build_object(
                  'user_id', reader.user_id::text,
                  'user_name', coalesce(nullif(trim(reader_profile.full_name), ''), 'کاربر'),
                  'read_at', reader.updated_at
                )
              )
              from public.communication_read_cursors reader
              left join public.profiles reader_profile
                on reader_profile.id = reader.user_id
               and reader_profile.org_id = reader.org_id
              where reader.org_id = v_org_id
                and reader.channel = 'bot'
                and reader.conversation_key = v_key
                and (m.created_by is null or reader.user_id <> m.created_by)
                and reader.read_through_at is not null
                and (
                  m.created_at < reader.read_through_at
                  or (
                    m.created_at = reader.read_through_at
                    and m.id::text <= coalesce(reader.read_through_id, m.id::text)
                  )
                )
            ), '{}'::jsonb)
          ) as payload,
          m.created_by, m.created_at,$fragment$;
begin
  if v_signature is null then
    raise exception 'public.get_communication_timeline(text,text,text,integer) is missing';
  end if;

  select pg_get_functiondef(v_signature::oid)
  into v_definition;

  if position('reader.channel = ''bot''' in v_definition) = 0 then
    if position(v_old_fragment in v_definition) = 0 then
      raise exception 'Could not locate bot payload projection in get_communication_timeline';
    end if;
    v_definition := replace(v_definition, v_old_fragment, v_new_fragment);
    execute v_definition;
  end if;
end;
$migration$;

grant execute on function public.get_communication_timeline(text, text, text, integer) to authenticated;
revoke all on function public.get_communication_timeline(text, text, text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
