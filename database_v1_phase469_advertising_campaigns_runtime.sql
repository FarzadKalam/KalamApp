-- Phase 469: secure advertising campaign audience, dispatch, inbound, and dashboard RPCs.

begin;

-- Normalize Persian/Arabic digits and channel recipient keys in one central place.
create or replace function public.advertising_campaign_normalize_digits(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select translate(coalesce(p_value, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
$$;

create or replace function public.advertising_campaign_contact_key(p_channel text, p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare v_channel text := lower(btrim(coalesce(p_channel,'')));
        v_value text := btrim(public.advertising_campaign_normalize_digits(p_value));
begin
  if v_channel = 'sms' then return public.kalam_phone_lookup_key(v_value); end if;
  if v_channel = 'email' then return lower(v_value); end if;
  return regexp_replace(lower(v_value), '\s+', '', 'g');
end;
$$;

-- Small, deterministic condition evaluator shared by campaign audience previews.
create or replace function public.advertising_campaign_condition_matches(
  p_record jsonb,
  p_condition jsonb
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_field text := nullif(btrim(coalesce(p_condition->>'field','')), '');
  v_operator text := lower(btrim(coalesce(p_condition->>'operator','equals')));
  v_actual jsonb;
  v_expected jsonb := p_condition->'value';
  v_actual_text text;
  v_expected_text text;
  v_actual_num numeric;
  v_expected_num numeric;
begin
  if v_field is null or p_record is null then return false; end if;
  v_actual := p_record -> v_field;
  v_actual_text := lower(btrim(coalesce(p_record->>v_field,'')));
  v_expected_text := lower(btrim(coalesce(p_condition->>'value','')));

  if v_operator in ('is_empty','empty','is_null') then
    return v_actual is null or v_actual = 'null'::jsonb or v_actual_text = '';
  elsif v_operator in ('is_not_empty','not_empty','is_not_null') then
    return not (v_actual is null or v_actual = 'null'::jsonb or v_actual_text = '');
  elsif v_operator in ('equals','eq','=') then
    return v_actual_text = v_expected_text;
  elsif v_operator in ('not_equals','neq','!=','<>') then
    return v_actual_text <> v_expected_text;
  elsif v_operator in ('contains','includes') then
    if jsonb_typeof(v_actual) = 'array' then return v_actual @> jsonb_build_array(v_expected); end if;
    return position(v_expected_text in v_actual_text) > 0;
  elsif v_operator in ('not_contains','excludes') then
    if jsonb_typeof(v_actual) = 'array' then return not (v_actual @> jsonb_build_array(v_expected)); end if;
    return position(v_expected_text in v_actual_text) = 0;
  elsif v_operator in ('in','one_of') then
    return jsonb_typeof(v_expected) = 'array'
       and exists (select 1 from jsonb_array_elements_text(v_expected) x where lower(btrim(x)) = v_actual_text);
  elsif v_operator in ('not_in','none_of') then
    return jsonb_typeof(v_expected) <> 'array'
       or not exists (select 1 from jsonb_array_elements_text(v_expected) x where lower(btrim(x)) = v_actual_text);
  end if;

  begin
    v_actual_num := nullif(v_actual_text,'')::numeric;
    v_expected_num := nullif(v_expected_text,'')::numeric;
  exception when invalid_text_representation then return false;
  end;
  if v_operator in ('greater_than','gt','>') then return v_actual_num > v_expected_num; end if;
  if v_operator in ('greater_or_equal','gte','>=') then return v_actual_num >= v_expected_num; end if;
  if v_operator in ('less_than','lt','<') then return v_actual_num < v_expected_num; end if;
  if v_operator in ('less_or_equal','lte','<=') then return v_actual_num <= v_expected_num; end if;
  return false;
end;
$$;

create or replace function public.advertising_campaign_conditions_match(
  p_record jsonb,
  p_all jsonb,
  p_any jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    not exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(p_all) = 'array' then p_all else '[]'::jsonb end
      ) c where not public.advertising_campaign_condition_matches(p_record, c)
    )
    and (
      jsonb_array_length(case when jsonb_typeof(p_any) = 'array' then p_any else '[]'::jsonb end) = 0
      or exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof(p_any) = 'array' then p_any else '[]'::jsonb end
        ) c where public.advertising_campaign_condition_matches(p_record, c)
      )
    )
$$;

create or replace function public.advertising_campaign_preview_audience(
  p_campaign_id uuid,
  p_target_module_id text,
  p_conditions_all jsonb default null,
  p_conditions_any jsonb default null,
  p_sample_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table text;
  v_all jsonb;
  v_any jsonb;
  v_row jsonb;
  v_count bigint := 0;
  v_samples jsonb := '[]'::jsonb;
  v_limit integer := least(greatest(coalesce(p_sample_limit,20),0),100);
  v_title text;
begin
  if not public.can_view_advertising_campaign(p_campaign_id) then
    raise exception 'دسترسی مشاهده کمپین را ندارید.' using errcode = '42501';
  end if;
  v_table := case p_target_module_id
    when 'marketing_leads' then 'marketing_leads'
    when 'customers' then 'customers'
    when 'invoices' then 'invoices'
    else null end;
  if v_table is null then raise exception 'ماژول هدف مخاطبان معتبر نیست.' using errcode = '22023'; end if;

  select coalesce(p_conditions_all, r.conditions_all, '[]'::jsonb),
         coalesce(p_conditions_any, r.conditions_any, '[]'::jsonb)
    into v_all, v_any
  from (select 1) seed
  left join public.advertising_campaign_audience_rules r
    on r.campaign_id = p_campaign_id and r.target_module_id = p_target_module_id and r.enabled = true;

  for v_row in execute format('select to_jsonb(t) from public.%I t where t.org_id = $1', v_table)
    using public.current_org_id()
  loop
    if public.advertising_campaign_conditions_match(v_row, v_all, v_any) then
      v_count := v_count + 1;
      if jsonb_array_length(v_samples) < v_limit then
        v_title := coalesce(
          nullif(v_row->>'name',''), nullif(v_row->>'full_name',''),
          nullif(v_row->>'business_name',''), nullif(v_row->>'system_code',''), '[بدون عنوان]'
        );
        v_samples := v_samples || jsonb_build_array(jsonb_build_object(
          'id', v_row->>'id', 'title', v_title, 'system_code', nullif(v_row->>'system_code','')
        ));
      end if;
    end if;
  end loop;
  return jsonb_build_object('target_module_id',p_target_module_id,'count',v_count,'samples',v_samples);
end;
$$;

-- Limited collaborators never query the campaign table directly. This RPC returns
-- only a non-sensitive shell and tools explicitly shared with the current user/role.
create or replace function public.advertising_campaign_collaboration_workspace(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_org uuid := public.current_org_id(); v_role uuid := public.current_user_advertising_campaign_role_id();
        v_campaign jsonb; v_tools jsonb;
begin
  if auth.uid() is null or v_org is null
     or not public.current_org_has_plan_module('advertising_campaigns',false)
     or not public.current_user_has_role_permission_entry('advertising_campaigns','view',null,true) then
    raise exception 'دسترسی کمپین فعال نیست.' using errcode = '42501';
  end if;
  select jsonb_build_object(
      'id',c.id,'name',c.name,'system_code',c.system_code,'status',c.status,
      'image_url',c.image_url,'start_at',c.start_at,'end_at',c.end_at,'access_mode','tool_limited'
    ) into v_campaign
  from public.advertising_campaigns c
  where c.id=p_campaign_id and c.org_id=v_org
    and exists (
      select 1 from public.advertising_campaign_tools t where t.campaign_id=c.id and t.org_id=v_org
        and (auth.uid()=any(t.collaborator_user_ids) or v_role=any(t.collaborator_role_ids))
    );
  if v_campaign is null then raise exception 'کمپین یا همکاری مجاز پیدا نشد.' using errcode='42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',t.id,'campaign_id',t.campaign_id,'tool_type',t.tool_type,'title',t.title,
      'enabled',t.enabled,'status',t.status,'is_automated',t.is_automated,
      'actual_cost',t.actual_cost,'actual_leads',t.actual_leads,'actual_customers',t.actual_customers,
      'actual_start_at',t.actual_start_at,'actual_end_at',t.actual_end_at,'result_summary',t.result_summary,
      'updated_at',t.updated_at
    ) order by t.created_at), '[]'::jsonb) into v_tools
  from public.advertising_campaign_tools t
  where t.campaign_id=p_campaign_id and t.org_id=v_org
    and (auth.uid()=any(t.collaborator_user_ids) or v_role=any(t.collaborator_role_ids));
  return jsonb_build_object('campaign',v_campaign,'tools',v_tools);
end;
$$;

create or replace function public.advertising_campaign_dashboard_summary(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if not public.can_view_advertising_campaign(p_campaign_id) then
    raise exception 'دسترسی مشاهده کمپین را ندارید.' using errcode='42501';
  end if;
  select jsonb_build_object(
    'campaign_id', c.id,
    'estimated_cost', coalesce(sum(t.estimated_cost),0),
    'actual_cost', coalesce(sum(t.actual_cost),0),
    'expected_leads', coalesce(sum(t.expected_leads),0),
    'recorded_actual_leads', coalesce(sum(t.actual_leads),0),
    'expected_customers', coalesce(sum(t.expected_customers),0),
    'recorded_actual_customers', coalesce(sum(t.actual_customers),0),
    'attributed_leads', (select count(*) from public.marketing_leads l where l.org_id=c.org_id and l.advertising_campaign_id=c.id),
    'actual_leads', (select count(*) from public.marketing_leads l where l.org_id=c.org_id and l.advertising_campaign_id=c.id),
    'attributed_customers', (select count(*) from public.customers x where x.org_id=c.org_id and x.advertising_campaign_id=c.id),
    'actual_customers', (select count(*) from public.customers x where x.org_id=c.org_id and x.advertising_campaign_id=c.id),
    'attributed_invoices', (select count(*) from public.invoices i where i.org_id=c.org_id and i.advertising_campaign_id=c.id),
    'invoice_count', (select count(*) from public.invoices i where i.org_id=c.org_id and i.advertising_campaign_id=c.id),
    'attributed_revenue', (select coalesce(sum(coalesce(
      nullif(to_jsonb(i)->>'grand_total','')::numeric,
      nullif(to_jsonb(i)->>'final_total','')::numeric,
      nullif(to_jsonb(i)->>'total_invoice_amount','')::numeric,
      nullif(to_jsonb(i)->>'total_amount','')::numeric,0)),0)
      from public.invoices i where i.org_id=c.org_id and i.advertising_campaign_id=c.id),
    'sent_count',(select count(*) from public.outbound_messages m where m.org_id=c.org_id and m.advertising_campaign_id=c.id and m.status in ('provider_accepted','sent','delivered')),
    'delivered_count',(select count(*) from public.outbound_messages m where m.org_id=c.org_id and m.advertising_campaign_id=c.id and m.status='delivered'),
    'failed_count',(select count(*) from public.outbound_messages m where m.org_id=c.org_id and m.advertising_campaign_id=c.id and m.status in ('failed','not_delivered','operator_failed','filtered','blacklisted')),
    'replied_count',(select count(*) from public.advertising_campaign_responses r where r.org_id=c.org_id and r.campaign_id=c.id),
    'unsubscribed_count',(select count(*) from public.campaign_contact_suppressions s join public.advertising_campaign_responses r on r.id=s.source_response_id where r.campaign_id=c.id and s.org_id=c.org_id and s.is_active),
    'timeline',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'date',daily.day,'leads',daily.leads,'customers',daily.customers,
        'invoices',daily.invoices,'revenue',daily.revenue
      ) order by daily.day),'[]'::jsonb)
      from (
        select event_day as day,sum(leads) leads,sum(customers) customers,
               sum(invoices) invoices,sum(revenue) revenue
        from (
          select l.created_at::date event_day,count(*)::bigint leads,0::bigint customers,
                 0::bigint invoices,0::numeric revenue
          from public.marketing_leads l
          where l.org_id=c.org_id and l.advertising_campaign_id=c.id
            and l.created_at>=greatest(coalesce(c.start_at,now()-interval '365 days'),now()-interval '365 days')
          group by l.created_at::date
          union all
          select x.created_at::date,0::bigint,count(*)::bigint,0::bigint,0::numeric
          from public.customers x
          where x.org_id=c.org_id and x.advertising_campaign_id=c.id
            and x.created_at>=greatest(coalesce(c.start_at,now()-interval '365 days'),now()-interval '365 days')
          group by x.created_at::date
          union all
          select i.created_at::date,0::bigint,0::bigint,count(*)::bigint,
                 coalesce(sum(coalesce(nullif(to_jsonb(i)->>'grand_total','')::numeric,
                   nullif(to_jsonb(i)->>'final_total','')::numeric,
                   nullif(to_jsonb(i)->>'total_invoice_amount','')::numeric,0)),0)
          from public.invoices i
          where i.org_id=c.org_id and i.advertising_campaign_id=c.id
            and i.created_at>=greatest(coalesce(c.start_at,now()-interval '365 days'),now()-interval '365 days')
          group by i.created_at::date
        ) events group by event_day
      ) daily
    ),
    'delivery', jsonb_build_object(
      'total',(select count(*) from public.outbound_messages m where m.org_id=c.org_id and m.advertising_campaign_id=c.id),
      'succeeded',(select count(*) from public.outbound_messages m where m.org_id=c.org_id and m.advertising_campaign_id=c.id and m.status in ('provider_accepted','sent','delivered')),
      'failed',(select count(*) from public.outbound_messages m where m.org_id=c.org_id and m.advertising_campaign_id=c.id and m.status in ('failed','not_delivered','operator_failed','filtered','blacklisted')),
      'responses',(select count(*) from public.advertising_campaign_responses r where r.org_id=c.org_id and r.campaign_id=c.id)
    ),
    'tools', coalesce(jsonb_agg(jsonb_build_object(
      'id',t.id,'tool_type',t.tool_type,'title',t.title,'status',t.status,
      'estimated_cost',t.estimated_cost,'actual_cost',t.actual_cost,
      'expected_leads',t.expected_leads,'actual_leads',t.actual_leads,
      'expected_customers',t.expected_customers,'actual_customers',t.actual_customers,
      'planned_start_at',t.planned_start_at,'planned_end_at',t.planned_end_at,
      'actual_start_at',t.actual_start_at,'actual_end_at',t.actual_end_at,
      'attributed_leads',(select count(*) from public.marketing_leads l where l.org_id=c.org_id and l.advertising_campaign_tool_id=t.id),
      'attributed_customers',(select count(*) from public.customers x where x.org_id=c.org_id and x.advertising_campaign_tool_id=t.id),
      'attributed_invoices',(select count(*) from public.invoices i where i.org_id=c.org_id and i.advertising_campaign_tool_id=t.id)
    ) order by t.created_at) filter (where t.id is not null),'[]'::jsonb)
  ) into v_result
  from public.advertising_campaigns c
  left join public.advertising_campaign_tools t on t.campaign_id=c.id and t.enabled=true
  where c.id=p_campaign_id and c.org_id=public.current_org_id()
  group by c.id,c.org_id;
  return coalesce(v_result,'{}'::jsonb);
end;
$$;

create or replace function public.advertising_campaign_tool_report(
  p_tool_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_tool public.advertising_campaign_tools%rowtype; v_limit int:=least(greatest(coalesce(p_limit,50),1),200);
        v_offset int:=greatest(coalesce(p_offset,0),0); v_records jsonb:='{}'::jsonb;
begin
  select * into v_tool from public.advertising_campaign_tools where id=p_tool_id and org_id=public.current_org_id();
  if v_tool.id is null or not public.can_collaborate_advertising_campaign_tool(p_tool_id) then
    raise exception 'دسترسی ابزار کمپین را ندارید.' using errcode='42501';
  end if;
  if public.current_user_has_role_permission_entry('marketing_leads','view',null,true) then
    v_records := v_records || jsonb_build_object('leads', coalesce((select jsonb_agg(x) from (
      select l.id,coalesce(nullif(l.name,''),nullif(l.business_name,''),nullif(l.system_code,''),'[بدون عنوان]') title,l.system_code,l.status,l.created_at
      from public.marketing_leads l where l.org_id=v_tool.org_id and l.advertising_campaign_tool_id=p_tool_id
      order by l.created_at desc limit v_limit offset v_offset) x),'[]'::jsonb));
  end if;
  if public.current_user_has_role_permission_entry('customers','view',null,true) then
    v_records := v_records || jsonb_build_object('customers', coalesce((select jsonb_agg(x) from (
      select c.id,coalesce(nullif(c.full_name,''),nullif(c.business_name,''),nullif(c.system_code,''),'[بدون عنوان]') title,c.system_code,c.created_at
      from public.customers c where c.org_id=v_tool.org_id and c.advertising_campaign_tool_id=p_tool_id
      order by c.created_at desc limit v_limit offset v_offset) x),'[]'::jsonb));
  end if;
  if public.current_user_has_role_permission_entry('invoices','view',null,true) then
    v_records := v_records || jsonb_build_object('invoices', coalesce((select jsonb_agg(x) from (
      select i.id,coalesce(nullif(i.name,''),nullif(i.system_code,''),'[بدون عنوان]') title,i.system_code,i.status,i.created_at,i.total_invoice_amount
      from public.invoices i where i.org_id=v_tool.org_id and i.advertising_campaign_tool_id=p_tool_id
      order by i.created_at desc limit v_limit offset v_offset) x),'[]'::jsonb));
  end if;
  return v_records || jsonb_build_object(
    'summary',jsonb_build_object(
      'estimated_cost',v_tool.estimated_cost,'actual_cost',v_tool.actual_cost,
      'expected_leads',v_tool.expected_leads,
      'actual_leads',(select count(*) from public.marketing_leads l where l.org_id=v_tool.org_id and l.advertising_campaign_tool_id=p_tool_id),
      'expected_customers',v_tool.expected_customers,
      'actual_customers',(select count(*) from public.customers c where c.org_id=v_tool.org_id and c.advertising_campaign_tool_id=p_tool_id),
      'invoice_count',(select count(*) from public.invoices i where i.org_id=v_tool.org_id and i.advertising_campaign_tool_id=p_tool_id),
      'attributed_revenue',(select coalesce(sum(coalesce(nullif(to_jsonb(i)->>'total_invoice_amount','')::numeric,nullif(to_jsonb(i)->>'grand_total','')::numeric,0)),0) from public.invoices i where i.org_id=v_tool.org_id and i.advertising_campaign_tool_id=p_tool_id),
      'sent_count',(select count(*) from public.outbound_messages m where m.org_id=v_tool.org_id and m.advertising_campaign_tool_id=p_tool_id and m.status in ('provider_accepted','sent','delivered')),
      'delivered_count',(select count(*) from public.outbound_messages m where m.org_id=v_tool.org_id and m.advertising_campaign_tool_id=p_tool_id and m.status='delivered'),
      'failed_count',(select count(*) from public.outbound_messages m where m.org_id=v_tool.org_id and m.advertising_campaign_tool_id=p_tool_id and m.status in ('failed','not_delivered','operator_failed','filtered','blacklisted')),
      'replied_count',(select count(*) from public.advertising_campaign_responses r where r.org_id=v_tool.org_id and r.tool_id=p_tool_id),
      'unsubscribed_count',(select count(*) from public.campaign_contact_suppressions s join public.advertising_campaign_responses r on r.id=s.source_response_id where r.tool_id=p_tool_id and s.org_id=v_tool.org_id and s.is_active)
    ),
    'tool',jsonb_build_object('id',v_tool.id,'tool_type',v_tool.tool_type,'title',v_tool.title,'status',v_tool.status,
      'estimated_cost',v_tool.estimated_cost,'actual_cost',v_tool.actual_cost,'expected_leads',v_tool.expected_leads,
      'actual_leads',v_tool.actual_leads,'expected_customers',v_tool.expected_customers,'actual_customers',v_tool.actual_customers),
    'totals',jsonb_build_object(
      'leads',(select count(*) from public.marketing_leads l where l.org_id=v_tool.org_id and l.advertising_campaign_tool_id=p_tool_id),
      'customers',(select count(*) from public.customers c where c.org_id=v_tool.org_id and c.advertising_campaign_tool_id=p_tool_id),
      'invoices',(select count(*) from public.invoices i where i.org_id=v_tool.org_id and i.advertising_campaign_tool_id=p_tool_id),
      'messages',(select count(*) from public.outbound_messages m where m.org_id=v_tool.org_id and m.advertising_campaign_tool_id=p_tool_id),
      'responses',(select count(*) from public.advertising_campaign_responses r where r.org_id=v_tool.org_id and r.tool_id=p_tool_id)
    ),'records',v_records,'limit',v_limit,'offset',v_offset);
end;
$$;

-- Atomically snapshot/deduplicate an explicitly prepared audience.
create or replace function public.create_advertising_campaign_dispatch(
  p_tool_id uuid,
  p_channel_type text,
  p_recipients jsonb,
  p_message_snapshot jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_tool public.advertising_campaign_tools%rowtype; v_dispatch_id uuid; v_item jsonb; v_contact text; v_key text;
        v_feature text; v_channel text:=lower(btrim(coalesce(p_channel_type,'')));
        v_group record; v_selected_group_count integer:=0;
        v_idempotency text:=coalesce(nullif(btrim(p_idempotency_key),''),gen_random_uuid()::text);
begin
  select * into v_tool from public.advertising_campaign_tools where id=p_tool_id and org_id=public.current_org_id();
  if v_tool.id is null or not public.can_edit_advertising_campaign(v_tool.campaign_id)
     or not public.current_user_has_role_permission_entry('advertising_campaigns','edit','send',true) then
    raise exception 'اجازه آماده‌سازی ارسال کمپین را ندارید.' using errcode='42501';
  end if;
  v_feature := case v_tool.tool_type when 'sms' then 'campaign_sms' when 'email' then 'campaign_email'
    when 'bot_group' then 'campaign_bot_group' when 'bot_private' then 'campaign_bot_private' else null end;
  if v_channel not in ('sms','email','bot_group','bot_private') or v_channel <> v_tool.tool_type then
    raise exception 'کانال ارسال با ابزار کمپین تطبیق ندارد.' using errcode='22023';
  end if;
  if not public.org_has_plan_module(v_tool.org_id,'advertising_campaigns',false)
     or v_feature is null
     or not public.org_has_plan_feature(v_tool.org_id,v_feature,false) then
    raise exception 'کانال ارسال در پلن سازمان فعال نیست.' using errcode='42501';
  end if;
  if jsonb_typeof(p_recipients) <> 'array' then raise exception 'فهرست مخاطبان معتبر نیست.' using errcode='22023'; end if;

  select id into v_dispatch_id from public.advertising_campaign_dispatches
  where org_id=v_tool.org_id and idempotency_key=v_idempotency;
  if v_dispatch_id is not null then return v_dispatch_id; end if;

  insert into public.advertising_campaign_dispatches(
    org_id,campaign_id,tool_id,channel_type,status,scheduled_at,available_at,
    audience_snapshot,message_snapshot,idempotency_key,created_by
  ) values (
    v_tool.org_id,v_tool.campaign_id,v_tool.id,v_channel,
    case when p_scheduled_at is null or p_scheduled_at<=now() then 'queued' else 'queued' end,
    p_scheduled_at,coalesce(p_scheduled_at,now()),
    jsonb_build_object('prepared_at',now(),'input_count',jsonb_array_length(p_recipients)),
    coalesce(p_message_snapshot,'{}'::jsonb),v_idempotency,auth.uid()
  ) returning id into v_dispatch_id;

  if v_tool.tool_type='bot_group' then
    for v_group in
      select g.id,g.bot_chat_id,g.group_title,g.channel_type,g.metadata
      from public.counterparty_bot_groups g
      where g.org_id=v_tool.org_id
        and g.status='active'
        and g.channel_type=lower(btrim(coalesce(v_tool.config->>'channel','')))
        and nullif(btrim(g.bot_chat_id),'') is not null
        and g.id in (
          select value::uuid
          from jsonb_array_elements_text(coalesce(v_tool.config->'group_ids','[]'::jsonb)) selected(value)
          where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
    loop
      v_selected_group_count:=v_selected_group_count+1;
      v_contact:=btrim(v_group.bot_chat_id);
      v_key:=public.advertising_campaign_contact_key(v_channel,v_contact);
      insert into public.advertising_campaign_recipients(
        org_id,campaign_id,tool_id,dispatch_id,source_type,source_module_id,source_record_id,
        contact_value,contact_key,display_name,variables,status
      ) values (
        v_tool.org_id,v_tool.campaign_id,v_tool.id,v_dispatch_id,'internal','counterparty_bot_groups',v_group.id,
        v_contact,v_key,coalesce(nullif(v_group.group_title,''),'گروه بات'),
        jsonb_build_object('channel',v_group.channel_type,'group_id',v_group.id,'metadata',coalesce(v_group.metadata,'{}'::jsonb)),
        'pending'
      ) on conflict (dispatch_id,contact_key) do nothing;
    end loop;
    if v_selected_group_count=0 then
      delete from public.advertising_campaign_dispatches where id=v_dispatch_id;
      raise exception 'هیچ گروه فعال و معتبری برای ارسال انتخاب نشده است.' using errcode='22023';
    end if;
  else
    for v_item in select value from jsonb_array_elements(p_recipients) loop
      v_contact:=btrim(coalesce(v_item->>'contact_value',v_item->>'recipient',''));
      v_key:=public.advertising_campaign_contact_key(v_channel,v_contact);
      if v_key='' then continue; end if;
      insert into public.advertising_campaign_recipients(
        org_id,campaign_id,tool_id,dispatch_id,source_type,source_module_id,source_record_id,
        contact_value,contact_key,display_name,variables,status
      ) values (
        v_tool.org_id,v_tool.campaign_id,v_tool.id,v_dispatch_id,
        case when v_item->>'source_type'='file' then 'file' else 'internal' end,
        nullif(v_item->>'source_module_id',''),
        case when coalesce(v_item->>'source_record_id','') ~* '^[0-9a-f-]{36}$' then (v_item->>'source_record_id')::uuid else null end,
        v_contact,v_key,nullif(v_item->>'display_name',''),coalesce(v_item->'variables','{}'::jsonb),
        case when exists(select 1 from public.campaign_contact_suppressions s where s.org_id=v_tool.org_id
          and s.channel_type=v_channel and s.contact_key=v_key and s.is_active) then 'suppressed' else 'pending' end
      ) on conflict (dispatch_id,contact_key) do nothing;
    end loop;
  end if;
  update public.advertising_campaign_dispatches d set
    recipient_count=(select count(*) from public.advertising_campaign_recipients r where r.dispatch_id=d.id),
    skipped_count=(select count(*) from public.advertising_campaign_recipients r where r.dispatch_id=d.id and r.status='suppressed')
  where d.id=v_dispatch_id;
  update public.advertising_campaign_tools set status='scheduled',updated_by=auth.uid()
  where id=v_tool.id and status in ('draft','ready');
  return v_dispatch_id;
end;
$$;

create or replace function public.claim_due_advertising_campaign_dispatches(p_limit integer default 10)
returns setof public.advertising_campaign_dispatches
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.advertising_campaign_recipients r
  set status='pending',error_message=coalesce(error_message,'ارسال نیمه‌کاره برای تلاش مجدد آزاد شد.')
  where r.status='processing' and exists (
    select 1 from public.advertising_campaign_dispatches d
    where d.id=r.dispatch_id and d.status='processing' and d.claimed_at < now()-interval '10 minutes' and d.attempts < 5
  );
  update public.advertising_campaign_dispatches
  set status='queued',claimed_at=null,available_at=now(),last_error=coalesce(last_error,'ارسال متوقف‌شده برای تلاش مجدد آزاد شد.')
  where status='processing' and claimed_at < now()-interval '10 minutes' and attempts < 5;
  update public.advertising_campaign_dispatches
  set status='failed',completed_at=now(),last_error=coalesce(last_error,'حداکثر تلاش ارسال کمپین انجام شد.')
  where status='processing' and claimed_at < now()-interval '10 minutes' and attempts >= 5;
  return query
  with candidates as (
    select d.id from public.advertising_campaign_dispatches d
    where d.status='queued' and d.available_at<=now()
    order by d.available_at,d.created_at
    for update skip locked limit least(greatest(coalesce(p_limit,10),1),100)
  ), updated as (
    update public.advertising_campaign_dispatches d set status='processing',claimed_at=now(),attempts=d.attempts+1
    from candidates c where d.id=c.id returning d.*
  ) select * from updated;
end;
$$;

-- Build the internal audience entirely in PostgreSQL, then union it with rows
-- already parsed from one or more import files. No large module query is sent to
-- the browser.
create or replace function public.create_advertising_campaign_dispatch_from_rules(
  p_tool_id uuid,
  p_channel_type text,
  p_file_recipients jsonb default '[]'::jsonb,
  p_message_snapshot jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_dispatch_id uuid; v_tool public.advertising_campaign_tools%rowtype; v_rule record; v_row jsonb; v_import_row record;
        v_contact text; v_contact_key text; v_customer jsonb; v_title text; v_bot_channel text;
begin
  v_dispatch_id := public.create_advertising_campaign_dispatch(
    p_tool_id,p_channel_type,coalesce(p_file_recipients,'[]'::jsonb),
    p_message_snapshot,p_scheduled_at,p_idempotency_key
  );
  select * into v_tool from public.advertising_campaign_tools where id=p_tool_id and org_id=public.current_org_id();
  if v_tool.id is null then raise exception 'ابزار کمپین پیدا نشد.'; end if;
  if v_tool.tool_type='bot_group' then return v_dispatch_id; end if;
  v_bot_channel:=lower(btrim(coalesce(v_tool.config->>'channel','')));
  if v_tool.tool_type='bot_private' and v_bot_channel not in ('telegram','bale','rubika') then
    raise exception 'پلتفرم ارسال خصوصی بات معتبر نیست.' using errcode='22023';
  end if;

  -- Completed file imports are materialized server-side. They are unioned with
  -- internal rules and the optional one-shot payload, then deduplicated by the
  -- dispatch/contact key unique constraint.
  for v_import_row in
    select r.*
    from public.advertising_campaign_import_rows r
    join public.advertising_campaign_imports i on i.id=r.import_id and i.org_id=r.org_id
    where r.org_id=v_tool.org_id and r.tool_id=v_tool.id and i.status='completed'
    order by r.created_at,r.id
  loop
    insert into public.advertising_campaign_recipients(
      org_id,campaign_id,tool_id,dispatch_id,source_type,source_module_id,source_record_id,
      contact_value,contact_key,display_name,variables,status
    ) values (
      v_tool.org_id,v_tool.campaign_id,v_tool.id,v_dispatch_id,'file',null,null,
      v_import_row.contact_value,v_import_row.contact_key,v_import_row.display_name,v_import_row.variables,
      case when exists(select 1 from public.campaign_contact_suppressions s where s.org_id=v_tool.org_id
        and s.channel_type=lower(btrim(p_channel_type)) and s.contact_key=v_import_row.contact_key and s.is_active)
        then 'suppressed' else 'pending' end
    ) on conflict (dispatch_id,contact_key) do update set
      variables=advertising_campaign_recipients.variables || excluded.variables,
      display_name=coalesce(advertising_campaign_recipients.display_name,excluded.display_name);
  end loop;

  for v_rule in select * from public.advertising_campaign_audience_rules
    where campaign_id=v_tool.campaign_id and org_id=v_tool.org_id and enabled=true
  loop
    for v_row in execute format('select to_jsonb(t) from public.%I t where t.org_id=$1',v_rule.target_module_id)
      using v_tool.org_id
    loop
      if not public.advertising_campaign_conditions_match(v_row,v_rule.conditions_all,v_rule.conditions_any) then continue; end if;
      v_customer := null;
      if v_rule.target_module_id='customers' then
        v_customer:=v_row;
      elsif nullif(v_row->>'customer_id','') is not null
            and coalesce(v_row->>'customer_id','') ~* '^[0-9a-f-]{36}$' then
        select to_jsonb(c) into v_customer from public.customers c
        where c.org_id=v_tool.org_id and c.id=(v_row->>'customer_id')::uuid;
      end if;
      v_contact := case lower(btrim(p_channel_type))
        when 'sms' then coalesce(nullif(v_row->>'mobile',''),nullif(v_row->>'mobile_1',''),nullif(v_row->>'phone',''),nullif(v_customer->>'mobile_1',''),nullif(v_customer->>'phone',''))
        when 'email' then coalesce(nullif(v_row->>'email',''),nullif(v_customer->>'email',''))
        when 'bot_private' then case v_bot_channel
          when 'telegram' then coalesce(nullif(v_row->>'telegram_chat_id',''),nullif(v_customer->>'telegram_chat_id',''))
          when 'bale' then coalesce(nullif(v_row->>'bale_chat_id',''),nullif(v_customer->>'bale_chat_id',''))
          when 'rubika' then coalesce(nullif(v_row->>'rubika_chat_id',''),nullif(v_customer->>'rubika_chat_id',''))
          else null end
        else null end;
      v_contact_key := public.advertising_campaign_contact_key(p_channel_type,v_contact);
      if coalesce(v_contact_key,'')='' then continue; end if;
      v_title := coalesce(nullif(v_row->>'name',''),nullif(v_row->>'full_name',''),nullif(v_row->>'business_name',''),nullif(v_row->>'system_code',''),'[بدون عنوان]');
      insert into public.advertising_campaign_recipients(
        org_id,campaign_id,tool_id,dispatch_id,source_type,source_module_id,source_record_id,
        contact_value,contact_key,display_name,variables,status
      ) values (
        v_tool.org_id,v_tool.campaign_id,v_tool.id,v_dispatch_id,'internal',v_rule.target_module_id,(v_row->>'id')::uuid,
        v_contact,v_contact_key,v_title,v_row,
        case when exists(select 1 from public.campaign_contact_suppressions s where s.org_id=v_tool.org_id
          and s.channel_type=lower(btrim(p_channel_type)) and s.contact_key=v_contact_key and s.is_active) then 'suppressed' else 'pending' end
      ) on conflict (dispatch_id,contact_key) do update set
        variables=advertising_campaign_recipients.variables || excluded.variables,
        display_name=coalesce(advertising_campaign_recipients.display_name,excluded.display_name);
    end loop;
  end loop;
  update public.advertising_campaign_dispatches d set
    recipient_count=(select count(*) from public.advertising_campaign_recipients r where r.dispatch_id=d.id),
    skipped_count=(select count(*) from public.advertising_campaign_recipients r where r.dispatch_id=d.id and r.status='suppressed'),
    audience_snapshot=d.audience_snapshot || jsonb_build_object('rules_materialized_at',now())
  where d.id=v_dispatch_id;
  return v_dispatch_id;
end;
$$;

create or replace function public.update_advertising_campaign_import_progress(
  p_import_id uuid,
  p_status text,
  p_total_rows integer,
  p_processed_rows integer,
  p_valid_rows integer,
  p_duplicate_rows integer,
  p_invalid_rows integer,
  p_error_summary jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('pending','processing','completed','failed','canceled') then return false; end if;
  update public.advertising_campaign_imports set
    status=p_status,total_rows=greatest(coalesce(p_total_rows,0),0),
    processed_rows=greatest(coalesce(p_processed_rows,0),0),valid_rows=greatest(coalesce(p_valid_rows,0),0),
    duplicate_rows=greatest(coalesce(p_duplicate_rows,0),0),invalid_rows=greatest(coalesce(p_invalid_rows,0),0),
    error_summary=coalesce(p_error_summary,'{}'::jsonb),
    started_at=case when p_status='processing' then coalesce(started_at,now()) else started_at end,
    completed_at=case when p_status in ('completed','failed','canceled') then now() else null end
  where id=p_import_id;
  return found;
end;
$$;

create or replace function public.control_advertising_campaign_dispatch(p_dispatch_id uuid,p_action text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_dispatch public.advertising_campaign_dispatches%rowtype; v_action text:=lower(btrim(coalesce(p_action,''))); v_status text;
        v_reset_count integer:=0;
begin
  select * into v_dispatch from public.advertising_campaign_dispatches where id=p_dispatch_id and org_id=public.current_org_id();
  if v_dispatch.id is null or not public.can_edit_advertising_campaign(v_dispatch.campaign_id)
    or not public.current_user_has_role_permission_entry('advertising_campaigns','edit','send',true) then
    raise exception 'اجازه کنترل ارسال را ندارید.' using errcode='42501';
  end if;
  v_status:=case
    when v_action='pause' and v_dispatch.status in ('queued','processing') then 'paused'
    when v_action='resume' and v_dispatch.status='paused' then 'queued'
    when v_action='cancel' and v_dispatch.status in ('draft','queued','processing','paused','failed') then 'canceled'
    when v_action='retry' and v_dispatch.status in ('failed','partial') then 'queued'
    else null end;
  if v_status is null then raise exception 'این تغییر وضعیت برای ارسال جاری مجاز نیست.' using errcode='22023'; end if;
  if v_action='retry' then
    update public.advertising_campaign_recipients set status='pending',error_message=null
    where dispatch_id=p_dispatch_id and org_id=v_dispatch.org_id
      and status='failed' and attempt_count < 5;
    get diagnostics v_reset_count = row_count;
    if v_reset_count=0 and not exists(
      select 1 from public.advertising_campaign_recipients
      where dispatch_id=p_dispatch_id and status='pending'
    ) then
      raise exception 'هیچ مخاطب ناموفقی در سقف مجاز تلاش مجدد باقی نمانده است.' using errcode='22023';
    end if;
  end if;
  update public.advertising_campaign_dispatches set status=v_status,
    available_at=case when v_status='queued' then now() else available_at end,
    claimed_at=case when v_status='queued' then null else claimed_at end,
    completed_at=case when v_status='canceled' then now() when v_status='queued' then null else completed_at end,
    attempts=case when v_action='retry' then 0 else attempts end,
    last_error=case when v_action='retry' then null else last_error end
  where id=p_dispatch_id;
  return v_status;
end;
$$;

create or replace function public.advertising_campaign_reply_window_hours(p_config jsonb)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare v_value integer; v_unit text;
begin
  v_value:=coalesce(nullif(p_config->>'reply_window_value','')::integer,
                    nullif(p_config->>'reply_window_hours','')::integer,72);
  v_unit:=lower(btrim(coalesce(p_config->>'reply_window_unit','hour')));
  if v_unit='day' then v_value:=v_value*24; end if;
  return least(greatest(v_value,1),8760);
exception when invalid_text_representation or numeric_value_out_of_range then
  return 72;
end;
$$;

create or replace function public.advertising_campaign_inbound_rule_matches(p_config jsonb,p_message text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare v_normalized text:=lower(regexp_replace(public.advertising_campaign_normalize_digits(p_message),'\s+','','g'));
        v_mode text:=lower(btrim(coalesce(p_config->>'inbound_match_mode','exact'))); v_expected text;
begin
  if coalesce((p_config->>'inbound_enabled')::boolean,false) is not true
     or jsonb_typeof(p_config->'inbound_expected_values') <> 'array'
     or jsonb_array_length(p_config->'inbound_expected_values')=0 then return false; end if;
  for v_expected in select value from jsonb_array_elements_text(p_config->'inbound_expected_values') loop
    v_expected:=lower(regexp_replace(public.advertising_campaign_normalize_digits(v_expected),'\s+','','g'));
    if v_expected<>'' and ((v_mode='contains' and position(v_expected in v_normalized)>0)
       or (v_mode<>'contains' and v_expected=v_normalized)) then return true; end if;
  end loop;
  return false;
exception when invalid_text_representation then return false;
end;
$$;

-- Inbound handler used by the MeliPayamak webhook. Match on organization,
-- receiving line, sender contact, successful outbound dispatch, and the tool's
-- explicit reply-window configuration (default 72h only for legacy configs).
create or replace function public.capture_advertising_campaign_sms_response(
  p_org_id uuid,
  p_inbound_message_id uuid,
  p_sender text,
  p_receiver text,
  p_message_text text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_sender_key text:=public.advertising_campaign_contact_key('sms',p_sender); v_count int;
        v_message_id uuid; v_campaign_id uuid; v_tool_id uuid; v_dispatch_id uuid;
        v_source_module_id text; v_source_record_id uuid;
        v_response_id uuid; v_tool_config jsonb:='{}'::jsonb; v_rule_matches boolean:=false;
        v_normalized text:=lower(regexp_replace(public.advertising_campaign_normalize_digits(p_message_text),'\s+','','g'));
begin
  if p_org_id is null or v_sender_key='' or p_inbound_message_id is null then return null; end if;
  select count(*) into v_count
  from public.outbound_messages m
  join public.advertising_campaign_tools t on t.id=m.advertising_campaign_tool_id and t.org_id=p_org_id
  where m.org_id=p_org_id and m.channel_type='sms' and coalesce(m.direction,'outbound')='outbound'
    and public.advertising_campaign_contact_key('sms',m.recipient)=v_sender_key
    and (nullif(btrim(p_receiver),'') is null or nullif(btrim(m.sender),'') is null or btrim(m.sender)=btrim(p_receiver))
    and m.advertising_campaign_id is not null and m.status in ('provider_accepted','sent','delivered')
    and coalesce(m.sent_at,m.created_at) >= now() - make_interval(hours=>public.advertising_campaign_reply_window_hours(t.config));
  if coalesce(v_count,0)=0 then return null; end if;

  select m.id,m.advertising_campaign_id,m.advertising_campaign_tool_id,m.advertising_campaign_dispatch_id,
         r.source_module_id,r.source_record_id,t.config
    into v_message_id,v_campaign_id,v_tool_id,v_dispatch_id,v_source_module_id,v_source_record_id,v_tool_config
  from public.outbound_messages m
  join public.advertising_campaign_tools t on t.id=m.advertising_campaign_tool_id and t.org_id=p_org_id
  left join public.advertising_campaign_recipients r on r.outbound_message_id=m.id
  where m.org_id=p_org_id and m.channel_type='sms' and coalesce(m.direction,'outbound')='outbound'
    and public.advertising_campaign_contact_key('sms',m.recipient)=v_sender_key
    and (nullif(btrim(p_receiver),'') is null or nullif(btrim(m.sender),'') is null or btrim(m.sender)=btrim(p_receiver))
    and m.advertising_campaign_id is not null and m.status in ('provider_accepted','sent','delivered')
    and coalesce(m.sent_at,m.created_at) >= now() - make_interval(hours=>public.advertising_campaign_reply_window_hours(t.config))
  order by coalesce(m.sent_at,m.created_at) desc
  limit 1;
  v_rule_matches:=public.advertising_campaign_inbound_rule_matches(v_tool_config,p_message_text);

  insert into public.advertising_campaign_responses(
    org_id,campaign_id,tool_id,dispatch_id,inbound_message_id,source_module_id,source_record_id,
    sender,receiver,message_text,normalized_message,match_status,workflow_status,metadata
  ) values (
    p_org_id,v_campaign_id,v_tool_id,v_dispatch_id,p_inbound_message_id,
    v_source_module_id,v_source_record_id,p_sender,p_receiver,p_message_text,v_normalized,
    case when v_count=1 then 'matched' else 'ambiguous' end,
    case when v_count=1 and v_rule_matches then 'pending' else 'ignored' end,
    jsonb_build_object('candidate_count',v_count,'matched_outbound_message_id',v_message_id,
      'inbound_enabled',coalesce((v_tool_config->>'inbound_enabled')::boolean,false),
      'inbound_rule_match',v_rule_matches,
      'reply_window_hours',public.advertising_campaign_reply_window_hours(v_tool_config))
  ) on conflict (org_id,inbound_message_id) do update set updated_at=now()
  returning id into v_response_id;

  if v_normalized ~ 'لغو11' then
    insert into public.campaign_contact_suppressions(org_id,channel_type,contact_value,contact_key,reason,source_response_id)
    values(p_org_id,'sms',p_sender,v_sender_key,'لغو تبلیغات پیامکی',v_response_id)
    on conflict (org_id,channel_type,contact_key) where is_active=true
    do update set reason=excluded.reason,source_response_id=excluded.source_response_id,updated_at=now();
  end if;
  return v_response_id;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function public.advertising_campaign_preview_audience(uuid,text,jsonb,jsonb,integer) from public,anon;
revoke all on function public.advertising_campaign_collaboration_workspace(uuid) from public,anon;
revoke all on function public.advertising_campaign_dashboard_summary(uuid) from public,anon;
revoke all on function public.advertising_campaign_tool_report(uuid,integer,integer) from public,anon;
revoke all on function public.create_advertising_campaign_dispatch(uuid,text,jsonb,jsonb,timestamptz,text) from public,anon;
revoke all on function public.create_advertising_campaign_dispatch_from_rules(uuid,text,jsonb,jsonb,timestamptz,text) from public,anon;
revoke all on function public.control_advertising_campaign_dispatch(uuid,text) from public,anon;
grant execute on function public.advertising_campaign_preview_audience(uuid,text,jsonb,jsonb,integer) to authenticated;
grant execute on function public.advertising_campaign_collaboration_workspace(uuid) to authenticated;
grant execute on function public.advertising_campaign_dashboard_summary(uuid) to authenticated;
grant execute on function public.advertising_campaign_tool_report(uuid,integer,integer) to authenticated;
grant execute on function public.create_advertising_campaign_dispatch(uuid,text,jsonb,jsonb,timestamptz,text) to authenticated;
grant execute on function public.create_advertising_campaign_dispatch_from_rules(uuid,text,jsonb,jsonb,timestamptz,text) to authenticated;
grant execute on function public.control_advertising_campaign_dispatch(uuid,text) to authenticated;

revoke all on function public.claim_due_advertising_campaign_dispatches(integer) from public,anon,authenticated;
revoke all on function public.capture_advertising_campaign_sms_response(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.update_advertising_campaign_import_progress(uuid,text,integer,integer,integer,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.claim_due_advertising_campaign_dispatches(integer) to service_role;
grant execute on function public.capture_advertising_campaign_sms_response(uuid,uuid,text,text,text) to service_role;
grant execute on function public.update_advertising_campaign_import_progress(uuid,text,integer,integer,integer,integer,integer,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
