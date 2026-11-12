-- =====================================================
-- TazeSystem V1 - Phase 584: Central SaaS Agent & Relay Defaults
-- + Multi-Trigger Agent Workflows Support
-- Date: 2026-11-12
-- Type: Additive / Idempotent / Fail-Closed Security
-- =====================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Non-Destructive Curated Cost-Effective Model Additions (from approved 18-model list)
-- ---------------------------------------------------------------------------
insert into public.ai_model_catalog (
  id, provider, display_name_fa, capability_tags, input_usd_per_1m,
  cached_input_usd_per_1m, output_usd_per_1m, specific_cost_usd,
  specific_cost_unit, margin_percent, is_active, is_coming_soon, metadata
) values
  (
    'claude-sonnet-5-5',
    'anthropic',
    'Claude Sonnet 5.5 (راهبر متعادل و دقیق)',
    array['dashboard_chat','record_chat','customer_reply_suggestion','document_analysis','workflow_ai_prompt','deep_reasoning','auto_decision','legal_assistant'],
    2.00, 0.20, 10.00, null, null, 30, true, false,
    '{"tier":"balanced","api_route":"chat_completions","pricing_source":"curated_default","recommended_role":"lead_orchestrator"}'::jsonb
  ),
  (
    'gpt-6.1-sol',
    'openai',
    'GPT-6.1 Sol (دقت منطقی و عددی بالا)',
    array['dashboard_chat','record_chat','customer_reply_suggestion','document_analysis','workflow_ai_prompt','deep_reasoning','auto_decision'],
    2.00, 0.20, 10.00, null, null, 30, true, false,
    '{"tier":"balanced","api_route":"chat_completions","pricing_source":"curated_default"}'::jsonb
  ),
  (
    'qwen3.8-max',
    'qwen',
    'Qwen 3.8 Max (فارسی‌محور و به‌صرفه 1M)',
    array['dashboard_chat','record_chat','customer_reply_suggestion','document_analysis','workflow_ai_prompt','deep_reasoning','auto_decision','legal_assistant'],
    2.00, 0.25, 6.00, null, null, 30, true, false,
    '{"tier":"balanced","api_route":"chat_completions","pricing_source":"curated_default"}'::jsonb
  ),
  (
    'nemotron-3-ultra',
    'nvidia',
    'Nemotron 3 Ultra (ایجنتی و بسیار اقتصادی)',
    array['dashboard_chat','record_chat','customer_reply_suggestion','document_analysis','workflow_ai_prompt','auto_decision','customer_auto_reply'],
    0.60, 0.12, 2.40, null, null, 30, true, false,
    '{"tier":"economy","api_route":"chat_completions","pricing_source":"curated_default"}'::jsonb
  ),
  (
    'glm-5.3-flash',
    'zhipu',
    'GLM 5.3 Flash (سریع و اقتصادی)',
    array['dashboard_chat','record_chat','customer_reply_suggestion','workflow_ai_prompt','agent_fast','context_compression','customer_auto_reply'],
    0.15, 0.03, 0.50, null, null, 30, true, false,
    '{"tier":"economy","api_route":"chat_completions","pricing_source":"curated_default"}'::jsonb
  ),
  (
    'gpt-6-luna',
    'openai',
    'GPT-6 Luna (رله فوق‌سریع و فوق‌ارزان)',
    array['dashboard_chat','record_chat','customer_reply_suggestion','workflow_ai_prompt','agent_fast','context_compression','customer_auto_reply'],
    0.10, 0.02, 0.50, null, null, 30, true, false,
    '{"tier":"fast","api_route":"chat_completions","pricing_source":"curated_default"}'::jsonb
  )
on conflict (id) do nothing;

-- Ensure deepseek-v4.1-flash also supports customer_auto_reply & auto_decision without removing existing tags
update public.ai_model_catalog
set
  capability_tags = (
    select array(
      select distinct t
      from unnest(coalesce(capability_tags, '{}'::text[]) || array['customer_auto_reply', 'auto_decision', 'document_analysis']) as t
    )
  ),
  updated_at = now()
where id = 'deepseek-v4.1-flash'
  and not (coalesce(capability_tags, '{}'::text[]) @> array['customer_auto_reply', 'auto_decision']);

-- ---------------------------------------------------------------------------
-- 2. Central SaaS Default Models for Agents & Relay (Layer 2 SaaS Config)
-- ---------------------------------------------------------------------------
create table if not exists public.saas_ai_default_models (
  slot_key text primary key,
  model_id text references public.ai_model_catalog(id) on delete set null,
  notes_fa text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saas_ai_default_models enable row level security;

drop policy if exists p_saas_ai_default_models_select on public.saas_ai_default_models;
create policy p_saas_ai_default_models_select
on public.saas_ai_default_models
for select to authenticated
using (auth.uid() is not null);

grant select on public.saas_ai_default_models to authenticated, service_role;
grant insert, update, delete on public.saas_ai_default_models to service_role;

insert into public.saas_ai_default_models (slot_key, model_id, notes_fa)
select v.slot_key,
  case when exists (select 1 from public.ai_model_catalog c where c.id = v.model_id and c.is_active = true) then v.model_id else null end,
  v.notes_fa
from (
  values
    ('__primary_model', 'qwen3.8-max', 'مدل اصلی متعادل و فارسی‌محور برای گفتگوهای عمومی'),
    ('agent_fast', 'gpt-6-luna', 'مدل سریع و اقتصادی برای رله پیام بین همکاران و بررسی‌های سبک'),
    ('context_compression', 'deepseek-v4.1-flash', 'مدل اقتصادی با کش ارزان برای فشرده‌سازی زمینه گفتگو'),
    ('agent:lead_orchestrator', 'claude-sonnet-5-5', 'پایدارترین مدل برای هماهنگی، حلقه ابزار و تصمیم‌گیری راهبر'),
    ('agent:project_process', 'claude-sonnet-5-5', 'مناسب طراحی دقیق گراف فرآیند، مراحل و فعالیت‌های متنی'),
    ('agent:sales_leads', 'qwen3.8-max', 'دقت بالا روی فاکتور، قیمت‌گذاری و مذاکره فارسی با خروجی بهینه'),
    ('agent:purchase_supply', 'qwen3.8-max', 'دقت مناسب برای فاکتور خرید، تامین و کنترل موجودی'),
    ('agent:hr_manager', 'nemotron-3-ultra', 'اقتصادی و موثر برای دستورالعمل‌ها، مرخصی و امور پرسنلی'),
    ('agent:instagrammer', 'nemotron-3-ultra', 'سریع و مقرون‌به‌صرفه برای سناریوهای اینستاگرام و کارت ویترین'),
    ('agent:customer_response', 'deepseek-v4.1-flash', 'پاسخگویی همه‌کاناله سریع و کم‌هزینه با کش پرامپت'),
    ('agent:reservation', 'deepseek-v4.1-flash', 'مدیریت نوبت‌دهی و تقویم با سرعت بالا و هزینه کم'),
    ('agent:system_guide', 'deepseek-v4.1-flash', 'راهنمای کاربردی سامانه با حداقل هزینه روی پرامپت ثابت')
) as v(slot_key, model_id, notes_fa)
on conflict (slot_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Multi-Trigger & Multi-Duty Agents Built on Workflows Engine
-- ---------------------------------------------------------------------------
alter table if exists public.workflows
  add column if not exists agent_key text;

alter table if exists public.workflows
  drop constraint if exists chk_workflows_agent_key;

alter table if exists public.workflows
  add constraint chk_workflows_agent_key check (
    agent_key is null
    or agent_key in (
      'lead_orchestrator',
      'sales_leads',
      'purchase_supply',
      'customer_response',
      'hr_manager',
      'reservation',
      'project_process',
      'instagrammer',
      'system_guide'
    )
  );

create index if not exists idx_workflows_org_agent_key
  on public.workflows(org_id, agent_key, is_active)
  where agent_key is not null;

notify pgrst, 'reload schema';

commit;
