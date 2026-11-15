-- Full-ledger statistics stay in PostgreSQL; no history export to an AI model.
-- Service-only RPC: the Edge settings endpoints enforce tenant/SaaS permission
-- and supply the organization from the verified session, never from model input.
begin;

create index if not exists idx_ai_usage_finalized_org_model
  on public.org_ai_usage_ledger (org_id, model) where status = 'finalized';

create or replace function public.ai_usage_token_count(p_metadata jsonb)
returns numeric language sql immutable security invoker set search_path = public
as $$
  with source as (select case when jsonb_typeof(p_metadata->'usage')='object' then p_metadata->'usage' else coalesce(p_metadata,'{}'::jsonb) end j),
  values_text as (select coalesce(j->>'total_tokens',j->>'total',j->>'tokens',j->>'totalTokens') total,
    coalesce(j->>'prompt_tokens',j->>'prompt',j->>'input_tokens',j->>'input',j->>'promptTokens') input,
    coalesce(j->>'completion_tokens',j->>'completion',j->>'output_tokens',j->>'output',j->>'completionTokens') output from source)
  select greatest(0,ceil(case when total ~ '^-?\d+(\.\d+)?$' then total::numeric else
    (case when input ~ '^-?\d+(\.\d+)?$' then input::numeric else 0 end)+
    (case when output ~ '^-?\d+(\.\d+)?$' then output::numeric else 0 end) end)) from values_text;
$$;
revoke all on function public.ai_usage_token_count(jsonb) from public,anon,authenticated;
grant execute on function public.ai_usage_token_count(jsonb) to service_role;

create or replace function public.get_ai_usage_complete_statistics(p_org_id uuid)
returns jsonb language sql stable security invoker set search_path = public
as $$
  with finalized as materialized (
    select org_id, user_id, model, capability, agent_key,
      coalesce(billed_amount_irt,0) billed, coalesce(raw_cost_irt,0) raw,
      coalesce(cached_input_tokens,0) cached, coalesce(cache_savings_irt,0) savings,
      public.ai_usage_token_count(usage) tokens
    from public.org_ai_usage_ledger
    where status = 'finalized' and (p_org_id is null or org_id = p_org_id)
  ), orgs as (
    select org_id, count(*) requests, sum(billed) billed_irt, sum(raw) raw_irt,
      array_agg(distinct model) filter (where model is not null) models
    from finalized group by org_id
  ), users as (
    select user_id, count(*) requests, sum(tokens) used_tokens, sum(billed) used_irt
    from finalized where user_id is not null group by user_id
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object('requests',count(*),
      'billed_amount_irt',coalesce(sum(billed),0),'raw_cost_irt',coalesce(sum(raw),0),
      'cached_input_tokens',coalesce(sum(cached),0),'cache_savings_irt',coalesce(sum(savings),0)) from finalized),
    'by_model', coalesce((select jsonb_object_agg(model, amount) from (select model,sum(billed) amount from finalized where model is not null group by model) s),'{}'::jsonb),
    'by_capability', coalesce((select jsonb_object_agg(capability, amount) from (select capability,sum(billed) amount from finalized where capability is not null group by capability) s),'{}'::jsonb),
    'by_agent', coalesce((select jsonb_object_agg(agent_key, amount) from (select agent_key,sum(billed) amount from finalized where agent_key is not null group by agent_key) s),'{}'::jsonb),
    'by_org', coalesce((select jsonb_agg(to_jsonb(orgs)) from orgs),'[]'::jsonb),
    'by_user', case when p_org_id is null then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(users)) from users),'[]'::jsonb) end
  );
$$;
revoke all on function public.get_ai_usage_complete_statistics(uuid) from public, anon, authenticated;
grant execute on function public.get_ai_usage_complete_statistics(uuid) to service_role;

create or replace function public.get_ai_user_daily_usage(p_org_id uuid,p_user_id uuid,p_start timestamptz,p_end timestamptz)
returns jsonb language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object('usedTokens',coalesce(sum(public.ai_usage_token_count(usage)),0),
    'usedIrt',coalesce(sum(billed_amount_irt),0),'requestCount',count(*))
  from public.org_ai_usage_ledger
  where org_id=p_org_id and user_id=p_user_id and status='finalized' and created_at>=p_start and created_at<p_end;
$$;
revoke all on function public.get_ai_user_daily_usage(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_ai_user_daily_usage(uuid,uuid,timestamptz,timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
