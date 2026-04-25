create or replace function public.kalam_note_like_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_likes jsonb := coalesce(old.metadata->'likes', '{}'::jsonb);
  v_new_likes jsonb := coalesce(new.metadata->'likes', '{}'::jsonb);
  v_liker record;
  v_liker_id uuid;
  v_liker_name text;
  v_note_source text := coalesce(nullif(trim(coalesce(new.source_type, '')), ''), nullif(trim(coalesce(new.metadata->>'source_type', '')), ''), 'user');
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.org_id is null or new.author_id is null then
    return new;
  end if;

  if v_note_source = 'system' then
    return new;
  end if;

  if v_new_likes = v_old_likes or jsonb_typeof(v_new_likes) <> 'object' then
    return new;
  end if;

  for v_liker in
    select key, value
    from jsonb_each(v_new_likes)
  loop
    if v_old_likes ? v_liker.key then
      continue;
    end if;

    v_liker_id := public.kalam_try_uuid(coalesce(v_liker.value->>'user_id', v_liker.key));
    if v_liker_id is null or v_liker_id = new.author_id then
      continue;
    end if;

    v_liker_name := nullif(trim(coalesce(v_liker.value->>'user_name', '')), '');

    perform public.kalam_upsert_notification_item(
      new.org_id,
      'note_like',
      new.id::text || ':' || v_liker_id::text,
      'notes',
      'internal_like',
      'upsert',
      'پسندیدن پیام',
      coalesce(v_liker_name, 'یک کاربر') || ' پیام شما را پسندید.',
      nullif(new.module_id, ''),
      nullif(new.record_id, ''),
      array[new.author_id],
      '{}'::uuid[],
      false,
      jsonb_build_object(
        'note_id', new.id,
        'liker_user_id', v_liker_id,
        'liker_name', v_liker_name,
        'chat_group_id', new.metadata->>'chat_group_id'
      ),
      now()
    );
  end loop;

  return new;
end;
$$;
