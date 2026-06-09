-- TazeSystem V1 Phase 246
-- AI model catalog additions: gpt-4o, gpt-4.1, gpt-4.1-mini (tagged), serper-search,
-- gpt-4o-transcribe, eleven-multilingual-v2, gpt-image-1, voip_auto_reply tags.
-- All idempotent via ON CONFLICT DO UPDATE.

insert into public.ai_model_catalog (
  id, provider, display_name_fa, capability_tags, input_usd_per_1m,
  cached_input_usd_per_1m, output_usd_per_1m, specific_cost_usd,
  specific_cost_unit, margin_percent, is_active, is_coming_soon, metadata
) values
  -- ── Chat: flagship models ──────────────────────────────────────────────────
  ('gpt-4o', 'openai',
    'GPT-4o پیشرفته',
    array['dashboard_chat','record_chat','customer_reply_suggestion',
          'document_analysis','workflow_ai_prompt','voip_auto_reply'],
    2.50, 1.25, 10.00, null, null, 30, true, false,
    '{"tier":"flagship","context_window":128000}'::jsonb),

  ('gpt-4.1', 'openai',
    'GPT-4.1 کامل',
    array['dashboard_chat','record_chat','customer_reply_suggestion',
          'document_analysis','workflow_ai_prompt','voip_auto_reply'],
    2.00, 0.50, 8.00, null, null, 30, true, false,
    '{"tier":"flagship","context_window":1000000}'::jsonb),

  -- gpt-4.1-mini already in phase 245 — update to add voip_auto_reply tag
  ('gpt-4.1-mini', 'openai',
    'GPT-4.1 Mini متعادل',
    array['dashboard_chat','record_chat','customer_reply_suggestion',
          'document_analysis','workflow_ai_prompt','voip_auto_reply'],
    0.40, 0.10, 1.60, null, null, 30, true, false,
    '{"tier":"balanced","context_window":1000000}'::jsonb),

  -- ── Web search ─────────────────────────────────────────────────────────────
  ('serper-search', 'serper',
    'جستجوی اینترنت (Serper)',
    array['web_search'],
    0, null, 0, 0.001, 'per_query', 0, true, false,
    '{"tier":"search","notes":"$0.001 per query via AvalAI /v1/search"}'::jsonb),

  -- ── Voice: STT ─────────────────────────────────────────────────────────────
  ('gpt-4o-transcribe', 'openai',
    'تبدیل صوت به متن دقیق (GPT-4o)',
    array['voice_input'],
    6.00, 3.00, 0, 0.006, 'per_minute', 30, true, true,
    '{"tier":"accurate","phase":"next"}'::jsonb),

  ('gpt-4o-mini-transcribe', 'openai',
    'تبدیل صوت به متن اقتصادی',
    array['voice_input'],
    3.00, 1.50, 0, 0.003, 'per_minute', 30, true, true,
    '{"tier":"economy","phase":"next"}'::jsonb),

  -- ── Voice: TTS ─────────────────────────────────────────────────────────────
  ('eleven-multilingual-v2', 'elevenlabs',
    'صدای طبیعی چندزبانه (ElevenLabs)',
    array['voice_output'],
    0, null, 0, 0.30, 'per_1k_chars', 30, true, true,
    '{"tier":"premium","multilingual":true,"phase":"next"}'::jsonb),

  ('gpt-4o-mini-tts', 'openai',
    'تولید صدا اقتصادی',
    array['voice_output'],
    0, null, 0.015, null, null, 30, true, true,
    '{"tier":"economy","phase":"next"}'::jsonb),

  -- ── Image generation ───────────────────────────────────────────────────────
  ('gpt-image-1', 'openai',
    'تولید تصویر (GPT Image-1)',
    array['image_generation'],
    5.00, null, 40.00, 0.040, 'per_image_1024', 30, true, true,
    '{"tier":"standard","phase":"next"}'::jsonb),

  -- ── Embedding ──────────────────────────────────────────────────────────────
  ('text-embedding-3-large', 'openai',
    'Embedding دقیق اسناد (بزرگ)',
    array['embedding','document_analysis'],
    0.13, 0.065, 0, null, null, 30, false, false,
    '{"dimension":3072,"notes":"بالاتر از small نیاز به migration دارد"}'::jsonb)

on conflict (id) do update
set
  provider            = excluded.provider,
  display_name_fa     = excluded.display_name_fa,
  capability_tags     = excluded.capability_tags,
  input_usd_per_1m    = excluded.input_usd_per_1m,
  cached_input_usd_per_1m = excluded.cached_input_usd_per_1m,
  output_usd_per_1m   = excluded.output_usd_per_1m,
  specific_cost_usd   = excluded.specific_cost_usd,
  specific_cost_unit  = excluded.specific_cost_unit,
  margin_percent      = excluded.margin_percent,
  is_active           = excluded.is_active,
  is_coming_soon      = excluded.is_coming_soon,
  metadata            = excluded.metadata,
  updated_at          = now();

-- Allow service_role to write (needed for saas_ai admin actions)
grant insert, update, delete on public.ai_model_catalog to service_role;
