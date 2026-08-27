begin;

-- شمارش و ثبت نهایی مخاطبان در یک تراکنش سروری انجام می‌شود تا عددهای ذخیره‌شده
-- در ابزارها دقیقاً از آخرین شرط‌ها، فایل‌ها، حذف‌های دستی و منع ارسال ساخته شوند.
create or replace function public.finalize_advertising_campaign_audience(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.advertising_campaigns%rowtype;
  v_rule record;
  v_tool public.advertising_campaign_tools%rowtype;
  v_group record;
  v_import record;
  v_row jsonb;
  v_customer jsonb;
  v_groups jsonb;
  v_tool_counts jsonb := '{}'::jsonb;
  v_tool_configs jsonb := '{}'::jsonb;
  v_exclusions jsonb;
  v_next_config jsonb;
  v_contact_key text;
  v_ref text;
  v_contact text;
  v_channel text;
  v_bot_channel text;
  v_group_excluded boolean;
  v_group_suppressed boolean;
  v_tool_matched integer;
  v_tool_valid integer;
  v_tool_unique integer;
  v_tool_duplicate integer;
  v_tool_invalid integer;
  v_tool_excluded integer;
  v_tool_suppressed integer;
  v_tool_sendable integer;
  v_finalized_at timestamptz := clock_timestamp();
begin
  select * into v_campaign
  from public.advertising_campaigns
  where id=p_campaign_id and org_id=public.current_org_id();

  if v_campaign.id is null or not public.can_edit_advertising_campaign(p_campaign_id) then
    raise exception 'اجازه نهایی‌سازی مخاطبان این کمپین را ندارید.' using errcode='42501';
  end if;

  -- گروه بات مخاطب رکوردی ندارد. پیامک، ایمیل و پی‌وی بات با کانال واقعی خودشان
  -- سنجیده می‌شوند، چون معتبر بودن راه ارتباطی میان این ابزارها متفاوت است.
  for v_tool in
    select * from public.advertising_campaign_tools
    where campaign_id=p_campaign_id
      and org_id=v_campaign.org_id
      and enabled=true
      and tool_type in ('sms','email','bot_private')
      and case
        when jsonb_typeof(config->'audience_sources')='array' then config->'audience_sources' ? 'internal'
        else false
      end
    order by id
  loop
    v_channel := lower(btrim(v_tool.tool_type));
    v_bot_channel := lower(btrim(coalesce(v_tool.config->>'channel','')));
    v_exclusions := case
      when jsonb_typeof(v_tool.config->'excluded_audience_refs')='array'
        then v_tool.config->'excluded_audience_refs'
      else '[]'::jsonb
    end;
    v_groups := '{}'::jsonb;
    v_tool_matched := 0;
    v_tool_valid := 0;

    for v_rule in
      select * from public.advertising_campaign_audience_rules
      where campaign_id=p_campaign_id and org_id=v_campaign.org_id and enabled=true
    loop
      for v_row in execute format(
        'select to_jsonb(t) from public.%I t where t.org_id=$1 order by t.id',
        v_rule.target_module_id
      ) using v_campaign.org_id
      loop
        if not public.advertising_campaign_conditions_match(v_row,v_rule.conditions_all,v_rule.conditions_any) then
          continue;
        end if;
        v_tool_matched := v_tool_matched+1;
        v_ref := v_rule.target_module_id || ':' || coalesce(v_row->>'id','');
        v_customer := null;
        if v_rule.target_module_id='customers' then
          v_customer := v_row;
        elsif nullif(v_row->>'customer_id','') is not null
              and (v_row->>'customer_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          select to_jsonb(c) into v_customer
          from public.customers c
          where c.org_id=v_campaign.org_id and c.id=(v_row->>'customer_id')::uuid;
        end if;

        v_contact := case v_channel
          when 'sms' then coalesce(
            nullif(v_row->>'mobile',''), nullif(v_row->>'mobile_1',''), nullif(v_row->>'phone',''),
            nullif(v_customer->>'mobile_1',''), nullif(v_customer->>'phone','')
          )
          when 'email' then coalesce(nullif(v_row->>'email',''),nullif(v_customer->>'email',''))
          when 'bot_private' then case v_bot_channel
            when 'telegram' then coalesce(nullif(v_row->>'telegram_chat_id',''),nullif(v_customer->>'telegram_chat_id',''))
            when 'bale' then coalesce(nullif(v_row->>'bale_chat_id',''),nullif(v_customer->>'bale_chat_id',''))
            when 'rubika' then coalesce(nullif(v_row->>'rubika_chat_id',''),nullif(v_customer->>'rubika_chat_id',''))
            else null
          end
          else null
        end;
        v_contact_key := public.advertising_campaign_contact_key(v_channel,v_contact);
        if coalesce(v_contact_key,'')='' then continue; end if;

        v_tool_valid := v_tool_valid+1;
        v_groups := v_groups || jsonb_build_object(
          v_contact_key,
          coalesce(v_groups->v_contact_key,'[]'::jsonb) || jsonb_build_array(v_ref)
        );
      end loop;
    end loop;

    -- فایل‌های کامل‌شده در اجرای واقعی با مخاطبان داخلی ادغام و سپس یکتا می‌شوند.
    if jsonb_typeof(v_tool.config->'audience_sources')='array'
       and v_tool.config->'audience_sources' ? 'excel' then
      for v_import in
        select r.id,r.contact_key
        from public.advertising_campaign_import_rows r
        join public.advertising_campaign_imports i
          on i.id=r.import_id and i.org_id=r.org_id
        where r.org_id=v_campaign.org_id
          and r.tool_id=v_tool.id
          and i.status='completed'
        order by r.created_at,r.id
      loop
        v_tool_matched := v_tool_matched+1;
        v_contact_key := btrim(coalesce(v_import.contact_key,''));
        if v_contact_key='' then continue; end if;
        v_tool_valid := v_tool_valid+1;
        v_ref := 'file:' || v_import.id::text;
        v_groups := v_groups || jsonb_build_object(
          v_contact_key,
          coalesce(v_groups->v_contact_key,'[]'::jsonb) || jsonb_build_array(v_ref)
        );
      end loop;
    end if;

    select count(*)::integer into v_tool_unique from jsonb_each(v_groups);
    v_tool_duplicate := greatest(v_tool_valid-v_tool_unique,0);
    v_tool_invalid := greatest(v_tool_matched-v_tool_valid,0);
    v_tool_excluded := 0;
    v_tool_suppressed := 0;
    v_tool_sendable := 0;

    for v_group in select key,value from jsonb_each(v_groups)
    loop
      select not exists (
        select 1 from jsonb_array_elements_text(v_group.value) as source_ref
        where not (v_exclusions ? source_ref.value)
      ) into v_group_excluded;
      select exists (
        select 1 from public.campaign_contact_suppressions s
        where s.org_id=v_campaign.org_id
          and s.channel_type=v_channel
          and s.contact_key=v_group.key
          and s.is_active
      ) into v_group_suppressed;
      if v_group_excluded then v_tool_excluded := v_tool_excluded+1; end if;
      if v_group_suppressed then v_tool_suppressed := v_tool_suppressed+1; end if;
      if not v_group_excluded and not v_group_suppressed then
        v_tool_sendable := v_tool_sendable+1;
      end if;
    end loop;

    v_next_config := coalesce(v_tool.config,'{}'::jsonb) || jsonb_build_object(
      'matched_audience_count',v_tool_matched,
      'unique_audience_count',v_tool_unique,
      'duplicate_audience_count',v_tool_duplicate,
      'invalid_audience_count',v_tool_invalid,
      'excluded_audience_count',v_tool_excluded,
      'suppressed_audience_count',v_tool_suppressed,
      'sendable_audience_count',v_tool_sendable,
      'audience_finalized_at',v_finalized_at
    );
    if v_channel in ('sms','email') then
      v_next_config := jsonb_set(v_next_config,'{estimated_audience}',to_jsonb(v_tool_sendable),true);
    end if;

    update public.advertising_campaign_tools
    set config=v_next_config, updated_at=v_finalized_at, updated_by=auth.uid()
    where id=v_tool.id and campaign_id=p_campaign_id and org_id=v_campaign.org_id;

    v_tool_counts := v_tool_counts || jsonb_build_object(v_tool.id::text,jsonb_build_object(
      'matched_count',v_tool_matched,
      'unique_count',v_tool_unique,
      'duplicate_count',v_tool_duplicate,
      'invalid_count',v_tool_invalid,
      'excluded_count',v_tool_excluded,
      'suppressed_count',v_tool_suppressed,
      'sendable_count',v_tool_sendable
    ));
    v_tool_configs := v_tool_configs || jsonb_build_object(v_tool.id::text,v_next_config);
  end loop;

  return jsonb_build_object(
    'tool_counts',v_tool_counts,
    'tool_configs',v_tool_configs,
    'finalized_at',v_finalized_at
  );
end;
$$;

revoke all on function public.finalize_advertising_campaign_audience(uuid) from public,anon;
grant execute on function public.finalize_advertising_campaign_audience(uuid) to authenticated;

commit;
