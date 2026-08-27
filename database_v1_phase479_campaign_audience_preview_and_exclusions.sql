begin;

create or replace function public.preview_advertising_campaign_audience(
  p_campaign_id uuid,
  p_limit integer default 200,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.advertising_campaigns%rowtype;
  v_rule record;
  v_row jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_seen text[] := '{}'::text[];
  v_key text;
  v_contact_key text;
  v_customer_key text;
  v_ref text;
  v_title text;
  v_contact text;
  v_is_duplicate boolean;
  v_match_count integer := 0;
  v_limit integer := least(greatest(coalesce(p_limit,200),1),500);
  v_offset integer := greatest(coalesce(p_offset,0),0);
begin
  select * into v_campaign from public.advertising_campaigns
  where id=p_campaign_id and org_id=public.current_org_id();
  if v_campaign.id is null or not public.can_edit_advertising_campaign(p_campaign_id) then
    raise exception 'اجازه مشاهده مخاطبان این کمپین را ندارید.' using errcode='42501';
  end if;

  for v_rule in select * from public.advertising_campaign_audience_rules
    where campaign_id=p_campaign_id and org_id=v_campaign.org_id and enabled=true
  loop
    for v_row in execute format('select to_jsonb(t) from public.%I t where t.org_id=$1 order by t.id',v_rule.target_module_id)
      using v_campaign.org_id
    loop
      if not public.advertising_campaign_conditions_match(v_row,v_rule.conditions_all,v_rule.conditions_any) then continue; end if;
      v_match_count := v_match_count + 1;
      v_ref := v_rule.target_module_id || ':' || coalesce(v_row->>'id','');
      v_contact := coalesce(nullif(v_row->>'mobile',''),nullif(v_row->>'mobile_1',''),nullif(v_row->>'phone',''),nullif(v_row->>'email',''));
      v_contact_key := case when position('@' in coalesce(v_contact,'')) > 0
          then 'email:' || public.advertising_campaign_contact_key('email',v_contact)
          when nullif(v_contact,'') is not null
          then 'phone:' || public.advertising_campaign_contact_key('sms',v_contact)
          else null end;
      v_customer_key := case when v_rule.target_module_id='customers' then 'customer:' || coalesce(v_row->>'id','')
          when nullif(v_row->>'customer_id','') is not null then 'customer:' || (v_row->>'customer_id')
          else null end;
      v_key := coalesce(v_contact_key,v_customer_key,v_ref);
      v_is_duplicate := coalesce(v_contact_key=any(v_seen),false)
        or coalesce(v_customer_key=any(v_seen),false)
        or (v_contact_key is null and v_customer_key is null and v_ref=any(v_seen));
      if v_contact_key is not null and not v_contact_key=any(v_seen) then v_seen := array_append(v_seen,v_contact_key); end if;
      if v_customer_key is not null and not v_customer_key=any(v_seen) then v_seen := array_append(v_seen,v_customer_key); end if;
      if v_contact_key is null and v_customer_key is null and not v_ref=any(v_seen) then v_seen := array_append(v_seen,v_ref); end if;
      if v_match_count <= v_offset or jsonb_array_length(v_rows) >= v_limit then continue; end if;
      v_title := coalesce(nullif(v_row->>'name',''),nullif(v_row->>'full_name',''),nullif(v_row->>'business_name',''),nullif(v_row->>'system_code',''),'[بدون عنوان]');
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'ref',v_ref,'source_module_id',v_rule.target_module_id,'title',v_title,
        'system_code',v_row->>'system_code','contact',v_contact,
        'is_duplicate',v_is_duplicate
      ));
    end loop;
  end loop;
  return jsonb_build_object('rows',v_rows,'total',v_match_count,'limit',v_limit,'offset',v_offset);
end;
$$;

create or replace function public.guard_advertising_campaign_recipient_exclusion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_exclusions jsonb;
begin
  if new.source_type <> 'internal' or new.source_module_id is null or new.source_record_id is null then return new; end if;
  select coalesce(config->'excluded_audience_refs','[]'::jsonb) into v_exclusions
  from public.advertising_campaign_tools where id=new.tool_id and org_id=new.org_id;
  if v_exclusions ? (new.source_module_id || ':' || new.source_record_id::text) then return null; end if;
  return new;
end;
$$;

drop trigger if exists trg_campaign_recipient_exclusion on public.advertising_campaign_recipients;
create trigger trg_campaign_recipient_exclusion
before insert on public.advertising_campaign_recipients
for each row execute function public.guard_advertising_campaign_recipient_exclusion();

create or replace function public.create_advertising_campaign_test_dispatch(
  p_tool_id uuid,
  p_recipient text,
  p_message_snapshot jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tool public.advertising_campaign_tools%rowtype;
  v_dispatch_id uuid;
  v_channel text;
  v_contact text:=btrim(coalesce(p_recipient,''));
  v_contact_key text;
  v_feature text;
  v_idempotency text:=coalesce(nullif(btrim(p_idempotency_key),''),gen_random_uuid()::text);
begin
  select * into v_tool
  from public.advertising_campaign_tools
  where id=p_tool_id and org_id=public.current_org_id();

  if v_tool.id is null
     or not public.can_edit_advertising_campaign(v_tool.campaign_id)
     or not public.current_user_has_role_permission_entry('advertising_campaigns','edit','send',true) then
    raise exception 'اجازه ارسال آزمایشی این ابزار را ندارید.' using errcode='42501';
  end if;

  v_channel:=lower(btrim(coalesce(v_tool.tool_type,'')));
  v_feature:=case v_channel
    when 'sms' then 'campaign_sms'
    when 'email' then 'campaign_email'
    when 'bot_group' then 'campaign_bot_group'
    when 'bot_private' then 'campaign_bot_private'
    else null
  end;
  if v_feature is null then
    raise exception 'این ابزار امکان ارسال آزمایشی خودکار ندارد.' using errcode='22023';
  end if;
  if not public.org_has_plan_module(v_tool.org_id,'advertising_campaigns',false)
     or not public.org_has_plan_feature(v_tool.org_id,v_feature,false) then
    raise exception 'کانال ارسال در پلن سازمان فعال نیست.' using errcode='42501';
  end if;
  if v_contact='' then
    raise exception 'گیرنده آزمایشی معتبر نیست.' using errcode='22023';
  end if;
  v_contact_key:=public.advertising_campaign_contact_key(v_channel,v_contact);
  if coalesce(v_contact_key,'')='' then
    raise exception 'گیرنده آزمایشی معتبر نیست.' using errcode='22023';
  end if;

  select id into v_dispatch_id
  from public.advertising_campaign_dispatches
  where org_id=v_tool.org_id and idempotency_key=v_idempotency;
  if v_dispatch_id is not null then return v_dispatch_id; end if;

  insert into public.advertising_campaign_dispatches(
    org_id,campaign_id,tool_id,channel_type,status,scheduled_at,available_at,
    audience_snapshot,message_snapshot,idempotency_key,recipient_count,created_by
  ) values (
    v_tool.org_id,v_tool.campaign_id,v_tool.id,v_channel,'queued',null,now(),
    jsonb_build_object('is_test',true,'prepared_at',now(),'input_count',1),
    coalesce(p_message_snapshot,'{}'::jsonb) || jsonb_build_object('is_test',true),
    v_idempotency,1,auth.uid()
  ) returning id into v_dispatch_id;

  insert into public.advertising_campaign_recipients(
    org_id,campaign_id,tool_id,dispatch_id,source_type,
    contact_value,contact_key,display_name,variables,status
  ) values (
    v_tool.org_id,v_tool.campaign_id,v_tool.id,v_dispatch_id,'internal',
    v_contact,v_contact_key,'ارسال آزمایشی',jsonb_build_object('is_test',true),'pending'
  );
  return v_dispatch_id;
end;
$$;

revoke all on function public.preview_advertising_campaign_audience(uuid,integer,integer) from public,anon;
revoke all on function public.create_advertising_campaign_test_dispatch(uuid,text,jsonb,text) from public,anon;
grant execute on function public.preview_advertising_campaign_audience(uuid,integer,integer) to authenticated;
grant execute on function public.create_advertising_campaign_test_dispatch(uuid,text,jsonb,text) to authenticated;

commit;
