-- TazeSystem V1 Phase 248
-- AI ready capabilities: tenant plan feature gates and model catalog readiness.
-- Notes:
-- - SaaS Admin still owns model catalog and pricing.
-- - Tenants only use capability models that are active and not marked as next phase.

begin;

-- Plan feature gates. Keep legacy ai_knowledge compatible with chat/doc usage.
update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb)
  || jsonb_build_object(
    'ai_chat', true,
    'ai_knowledge', coalesce(enabled_features -> 'ai_knowledge', 'true'::jsonb),
    'ai_document_analysis', true,
    'ai_web_search', case
      when coalesce(code, '') in ('cloud_enterprise', 'public_demo_full') then true
      else false
    end,
    'ai_voice_input', case
      when coalesce(code, '') in ('cloud_enterprise', 'public_demo_full') then true
      else false
    end,
    'ai_image_generation', case
      when coalesce(code, '') in ('cloud_enterprise', 'public_demo_full') then true
      else false
    end
  )
where coalesce(code, '') in ('cloud_growth', 'cloud_enterprise', 'public_demo_full');

-- Starter keeps plan data explicit but does not receive paid AI add-ons by default.
update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb)
  || jsonb_build_object(
    'ai_chat', false,
    'ai_document_analysis', false,
    'ai_web_search', false,
    'ai_voice_input', false,
    'ai_image_generation', false
  )
where coalesce(code, '') in ('cloud_starter');

insert into public.ai_model_catalog (
  id, provider, display_name_fa, capability_tags, input_usd_per_1m,
  cached_input_usd_per_1m, output_usd_per_1m, specific_cost_usd,
  specific_cost_unit, margin_percent, is_active, is_coming_soon, metadata
) values
  ('gpt-5.4-mini', 'openai',
    'GPT-5.4 Mini سریع و اقتصادی',
    array['dashboard_chat','record_chat','customer_reply_suggestion','workflow_ai_prompt','voip_auto_reply'],
    0.25, 0.025, 2.00, null, null, 30, true, false,
    '{"tier":"economy","reasoning":true,"ready":true}'::jsonb),

  ('gpt-5.4', 'openai',
    'GPT-5.4 دقیق',
    array['dashboard_chat','record_chat','customer_reply_suggestion','document_analysis','workflow_ai_prompt'],
    2.00, 0.20, 8.00, null, null, 30, true, false,
    '{"tier":"balanced","reasoning":true,"ready":true}'::jsonb),

  ('gpt-5.5', 'openai',
    'GPT-5.5 پیشرفته',
    array['document_analysis','dashboard_chat','record_chat'],
    3.00, 0.30, 12.00, null, null, 30, true, false,
    '{"tier":"frontier","reasoning":true,"ready":true}'::jsonb),

  ('gpt-4o-transcribe', 'openai',
    'تبدیل صوت به متن دقیق',
    array['voice_input'],
    6.00, 3.00, 0, 0.006, 'per_minute', 30, true, false,
    '{"tier":"accurate","ready":true}'::jsonb),

  ('gpt-4o-mini-transcribe', 'openai',
    'تبدیل صوت به متن اقتصادی',
    array['voice_input'],
    3.00, 1.50, 0, 0.003, 'per_minute', 30, true, false,
    '{"tier":"economy","ready":true}'::jsonb),

  ('gpt-image-1', 'openai',
    'تولید تصویر',
    array['image_generation'],
    5.00, null, 40.00, 0.040, 'per_image_1024', 30, true, false,
    '{"tier":"standard","ready":true}'::jsonb)
on conflict (id) do update
set
  provider = excluded.provider,
  display_name_fa = excluded.display_name_fa,
  capability_tags = excluded.capability_tags,
  input_usd_per_1m = excluded.input_usd_per_1m,
  cached_input_usd_per_1m = excluded.cached_input_usd_per_1m,
  output_usd_per_1m = excluded.output_usd_per_1m,
  specific_cost_usd = excluded.specific_cost_usd,
  specific_cost_unit = excluded.specific_cost_unit,
  margin_percent = excluded.margin_percent,
  is_active = excluded.is_active,
  is_coming_soon = excluded.is_coming_soon,
  metadata = excluded.metadata,
  updated_at = now();

-- Keep not-yet-usable media/automation models visible only as future items.
update public.ai_model_catalog
set is_coming_soon = true,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('phase', 'next'),
    updated_at = now()
where id in ('eleven-multilingual-v2', 'gpt-4o-mini-tts', 'sora-2')
   or 'voice_output' = any(capability_tags)
   or 'video_generation' = any(capability_tags);

notify pgrst, 'reload schema';

commit;
