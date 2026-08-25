-- Phase 471: repair campaign schema and keep SaaS-admin plan bypass scoped to campaigns.
-- Additive and idempotent. Tenant RLS remains fail-closed on org_id.

begin;

alter table public.advertising_campaigns
  add column if not exists tags text[] not null default '{}'::text[];

create index if not exists idx_advertising_campaigns_tags
  on public.advertising_campaigns using gin(tags);

-- SaaS Admin may bypass only the campaign module entitlement. Normal tenant
-- users still require the plan module; both paths continue to require the
-- applicable per-role campaign permission in every RLS policy below.
create or replace function public.current_user_can_access_advertising_campaign_module()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.current_org_id() is not null
    and (
      public.current_org_has_plan_module('advertising_campaigns', false)
      or exists (
        select 1
        from public.profiles profile_row
        join public.org_roles role_row on role_row.id = profile_row.role_id
        where profile_row.id = auth.uid()
          and coalesce((role_row.permissions -> '__saas_admin' ->> 'edit')::boolean, false)
      )
    )
$$;

revoke all on function public.current_user_can_access_advertising_campaign_module() from public, anon;
grant execute on function public.current_user_can_access_advertising_campaign_module() to authenticated;

create or replace function public.can_view_advertising_campaign(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.advertising_campaigns campaign
    where campaign.id = p_campaign_id
      and campaign.org_id = public.current_org_id()
      and public.current_user_can_access_advertising_campaign_module()
      and public.current_user_has_role_permission_entry('advertising_campaigns', 'view', null, true)
      and (
        campaign.created_by = auth.uid()
        or (campaign.assignee_type = 'user' and campaign.assignee_id = auth.uid())
        or (campaign.assignee_type = 'role' and campaign.assignee_role_id = public.current_user_advertising_campaign_role_id())
        or auth.uid() = any(campaign.viewer_user_ids)
        or public.current_user_advertising_campaign_role_id() = any(campaign.viewer_role_ids)
        or public.current_user_has_role_permission_entry('advertising_campaigns', 'view', 'all_campaigns', false)
      )
  )
$$;

create or replace function public.can_collaborate_advertising_campaign_tool(p_tool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.advertising_campaign_tools tool
    where tool.id = p_tool_id
      and tool.org_id = public.current_org_id()
      and public.current_user_can_access_advertising_campaign_module()
      and public.current_user_has_role_permission_entry('advertising_campaigns', 'view', null, true)
      and (
        public.can_view_advertising_campaign(tool.campaign_id)
        or auth.uid() = any(tool.collaborator_user_ids)
        or public.current_user_advertising_campaign_role_id() = any(tool.collaborator_role_ids)
      )
  )
$$;

create or replace function public.update_advertising_campaign_collaboration_tool(
  p_tool_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_tool public.advertising_campaign_tools%rowtype; v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
        v_config_patch jsonb:='{}'::jsonb; v_status text; v_actual_start timestamptz; v_actual_end timestamptz;
begin
  if auth.uid() is null or public.current_org_id() is null
     or not public.current_user_can_access_advertising_campaign_module()
     or not public.current_user_has_role_permission_entry('advertising_campaigns','view',null,true)
     or not public.can_collaborate_advertising_campaign_tool(p_tool_id) then
    raise exception 'دسترسی همکاری روی این ابزار را ندارید.' using errcode='42501';
  end if;
  select * into v_tool from public.advertising_campaign_tools
  where id=p_tool_id and org_id=public.current_org_id();
  if v_tool.id is null then raise exception 'ابزار کمپین پیدا نشد.' using errcode='P0002'; end if;
  if v_patch ? 'status' then
    v_status:=lower(btrim(coalesce(v_patch->>'status','')));
    if v_status not in ('ready','running','paused','completed','failed') then
      raise exception 'وضعیت ابزار برای همکاری مجاز نیست.' using errcode='22023';
    end if;
  else v_status:=v_tool.status; end if;
  begin
    v_actual_start:=case when v_patch ? 'actual_start_at' then nullif(v_patch->>'actual_start_at','')::timestamptz else v_tool.actual_start_at end;
    v_actual_end:=case when v_patch ? 'actual_end_at' then nullif(v_patch->>'actual_end_at','')::timestamptz else v_tool.actual_end_at end;
  exception when invalid_datetime_format then
    raise exception 'زمان واقعی ابزار معتبر نیست.' using errcode='22007';
  end;
  if v_actual_start is not null and v_actual_end is not null and v_actual_end < v_actual_start then
    raise exception 'پایان واقعی نمی‌تواند قبل از شروع واقعی باشد.' using errcode='23514';
  end if;
  if jsonb_typeof(v_patch->'config')='object' then
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_config_patch
    from jsonb_each(v_patch->'config')
    where key in ('result_notes','result_metrics','result_attachments','actual_reach','actual_impressions','actual_clicks','actual_responses','completion_percentage');
  end if;
  update public.advertising_campaign_tools set
    status=v_status,
    actual_cost=case when v_patch ? 'actual_cost' then greatest(coalesce((v_patch->>'actual_cost')::numeric,0),0) else actual_cost end,
    actual_leads=case when v_patch ? 'actual_leads' then greatest(coalesce((v_patch->>'actual_leads')::integer,0),0) else actual_leads end,
    actual_customers=case when v_patch ? 'actual_customers' then greatest(coalesce((v_patch->>'actual_customers')::integer,0),0) else actual_customers end,
    actual_start_at=v_actual_start,actual_end_at=v_actual_end,
    result_summary=case when v_patch ? 'result_summary' then left(nullif(btrim(v_patch->>'result_summary'),''),10000) else result_summary end,
    config=config || v_config_patch,updated_by=auth.uid()
  where id=v_tool.id and org_id=v_tool.org_id
  returning * into v_tool;
  return jsonb_build_object(
    'id',v_tool.id,'campaign_id',v_tool.campaign_id,'tool_type',v_tool.tool_type,
    'status',v_tool.status,'actual_cost',v_tool.actual_cost,'actual_leads',v_tool.actual_leads,
    'actual_customers',v_tool.actual_customers,'actual_start_at',v_tool.actual_start_at,
    'actual_end_at',v_tool.actual_end_at,'result_summary',v_tool.result_summary,
    'config',v_tool.config,'updated_at',v_tool.updated_at
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'مقادیر واقعی ابزار معتبر نیست.' using errcode='22023';
end;
$$;

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
     or not public.current_user_can_access_advertising_campaign_module()
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

drop policy if exists advertising_campaigns_insert on public.advertising_campaigns;
create policy advertising_campaigns_insert on public.advertising_campaigns for insert to authenticated
with check (
  org_id = public.current_org_id()
  and public.current_user_can_access_advertising_campaign_module()
  and public.current_user_has_role_permission_entry('advertising_campaigns', 'create', null, true)
  and created_by = auth.uid()
);

revoke all on function public.current_user_can_access_advertising_campaign_module() from public, anon;
grant execute on function public.current_user_can_access_advertising_campaign_module() to authenticated;
revoke all on function public.can_view_advertising_campaign(uuid) from public, anon;
grant execute on function public.can_view_advertising_campaign(uuid) to authenticated;
revoke all on function public.can_collaborate_advertising_campaign_tool(uuid) from public, anon;
grant execute on function public.can_collaborate_advertising_campaign_tool(uuid) to authenticated;
revoke all on function public.update_advertising_campaign_collaboration_tool(uuid,jsonb) from public, anon;
grant execute on function public.update_advertising_campaign_collaboration_tool(uuid,jsonb) to authenticated;
revoke all on function public.advertising_campaign_collaboration_workspace(uuid) from public, anon;
grant execute on function public.advertising_campaign_collaboration_workspace(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
