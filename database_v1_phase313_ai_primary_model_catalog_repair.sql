-- Phase 313: repair AI primary-model catalog visibility.
-- Idempotent: keeps GPT-5.5 selectable as a primary model and removes the
-- narrow Persian "document analysis" wording from Gemini Pro's display name.

insert into public.ai_model_catalog (
  id,
  provider,
  display_name_fa,
  capability_tags,
  input_usd_per_1m,
  cached_input_usd_per_1m,
  output_usd_per_1m,
  specific_cost_usd,
  specific_cost_unit,
  margin_percent,
  is_active,
  is_coming_soon,
  metadata
) values (
  'gpt-5.5',
  'openai',
  'GPT-5.5 پیشرفته',
  array[
    'dashboard_chat',
    'record_chat',
    'customer_reply_suggestion',
    'document_analysis',
    'workflow_ai_prompt',
    'deep_reasoning',
    'legal_assistant',
    'web_search'
  ],
  3.00,
  0.30,
  12.00,
  null,
  null,
  30,
  true,
  false,
  '{"tier":"frontier","reasoning":true,"ready":true,"api_route":"chat_completions","pricing_source":"estimate"}'::jsonb
)
on conflict (id) do update
set
  provider = excluded.provider,
  display_name_fa = excluded.display_name_fa,
  capability_tags = excluded.capability_tags,
  input_usd_per_1m = excluded.input_usd_per_1m,
  cached_input_usd_per_1m = excluded.cached_input_usd_per_1m,
  output_usd_per_1m = excluded.output_usd_per_1m,
  margin_percent = excluded.margin_percent,
  is_active = true,
  is_coming_soon = false,
  metadata = coalesce(public.ai_model_catalog.metadata, '{}'::jsonb)
    || excluded.metadata
    || jsonb_build_object('catalog_repaired_at', now());

update public.ai_model_catalog
set
  display_name_fa = 'Gemini 3.1 Pro',
  capability_tags = array[
    'document_analysis',
    'document_generation',
    'dashboard_chat',
    'record_chat',
    'workflow_ai_prompt',
    'deep_reasoning'
  ],
  is_active = true,
  is_coming_soon = false,
  metadata = coalesce(metadata, '{}'::jsonb)
    || '{"tier":"flagship","api_route":"chat_completions","context_window":1000000,"pricing_source":"estimate"}'::jsonb
    || jsonb_build_object('catalog_repaired_at', now())
where id = 'gemini-3.1-pro-preview';
