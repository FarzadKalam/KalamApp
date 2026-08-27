begin;

create or replace function public.guard_advertising_campaign_dispatch_message()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_channel text:=lower(btrim(coalesce(new.channel_type,'')));
  v_raw_message text;
  v_plain_message text;
begin
  if v_channel not in ('sms','email','bot_group','bot_private') then
    return new;
  end if;

  v_raw_message:=coalesce(
    nullif(btrim(new.message_snapshot->>'text'),''),
    nullif(btrim(new.message_snapshot->>'message'),''),
    ''
  );
  v_plain_message:=regexp_replace(v_raw_message,'<[^>]*>','','gi');
  v_plain_message:=regexp_replace(
    v_plain_message,
    '&(nbsp|#160|#xa0);',
    '',
    'gi'
  );
  v_plain_message:=regexp_replace(v_plain_message,'&(amp|apos|quot|lt|gt|#x[0-9a-f]+|#[0-9]+);','x','gi');
  v_plain_message:=replace(replace(replace(v_plain_message,U&'\200E',''),U&'\200F',''),U&'\FEFF','');
  v_plain_message:=regexp_replace(v_plain_message,'[[:space:]]','','g');

  if coalesce(v_plain_message,'')='' then
    raise exception '%', case v_channel
      when 'sms' then 'متن پیامک خالی است؛ پیش از ارسال، متن پیامک را تکمیل کنید.'
      when 'email' then 'متن ایمیل خالی است؛ پیش از ارسال، متن ایمیل را تکمیل کنید.'
      else 'متن پیام بات خالی است؛ پیش از ارسال، متن پیام را تکمیل کنید.'
    end using errcode='22023';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_advertising_campaign_dispatch_message() from public,anon,authenticated;

drop trigger if exists trg_campaign_dispatch_message_guard on public.advertising_campaign_dispatches;
create trigger trg_campaign_dispatch_message_guard
before insert or update of message_snapshot,channel_type
on public.advertising_campaign_dispatches
for each row execute function public.guard_advertising_campaign_dispatch_message();

commit;
