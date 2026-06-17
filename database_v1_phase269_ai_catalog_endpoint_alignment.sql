-- TazeSystem V1 Phase 260
-- AI model catalog alignment with official AvalAI documentation (docs.avalai.ir).
--
-- Goals:
--   1. Register every model that the ai-assistant edge function actually uses as a
--      default (chat/reasoning/media) so settings can list them AND billing has a
--      pricing fallback when the provider response omits cost.
--   2. Tag each model with metadata.api_route so the gateway routes to the correct
--      AvalAI endpoint:
--        - chat_completions          -> POST /v1/chat/completions
--        - audio_speech              -> POST /v1/audio/speech
--        - audio_transcriptions      -> POST /v1/audio/transcriptions
--        - images_generations        -> POST /v1/images/generations  (+ /v1/images/edits)
--        - gemini_generate_content   -> POST /v1beta/models/{id}:generateContent
--        - videos                    -> POST /v1/videos (async job)
--   3. Fix the broken ElevenLabs id: docs use UNDERSCORES (eleven_multilingual_v2),
--      not hyphens. The legacy hyphen id "eleven-multilingual-v2" returns
--      "does not exist" on /v1/audio/speech, so it is deactivated here.
--
-- Pricing for newly added models is best-effort; estimateAiCharge() prefers the
-- cost AvalAI returns in the response and only falls back to these rates.
-- All idempotent via ON CONFLICT DO UPDATE.

insert into public.ai_model_catalog (
  id, provider, display_name_fa, capability_tags, input_usd_per_1m,
  cached_input_usd_per_1m, output_usd_per_1m, specific_cost_usd,
  specific_cost_unit, margin_percent, is_active, is_coming_soon, metadata
) values
  -- ══ Chat / reasoning (route: chat_completions) ════════════════════════════════
  ('gemini-3.1-flash-lite', 'gemini',
    'Gemini 3.1 Flash Lite (سریع و اقتصادی)',
    array['dashboard_chat','record_chat','customer_reply_suggestion',
          'workflow_ai_prompt','voip_auto_reply'],
    0.10, 0.025, 0.40, null, null, 30, true, false,
    '{"tier":"economy","api_route":"chat_completions","context_window":1000000,"pricing_source":"estimate"}'::jsonb),

  ('qwen3.6-flash', 'alibaba',
    'Qwen 3.6 Flash (اقتصادی)',
    array['customer_reply_suggestion','workflow_ai_prompt','voip_auto_reply',
          'dashboard_chat','record_chat'],
    0.05, null, 0.20, null, null, 30, true, false,
    '{"tier":"economy","api_route":"chat_completions","pricing_source":"estimate"}'::jsonb),

  ('gemini-3.1-pro-preview', 'gemini',
    'Gemini 3.1 Pro (تحلیل و ساخت اسناد)',
    array['document_analysis','document_generation','dashboard_chat','record_chat'],
    1.25, 0.31, 5.00, null, null, 30, true, false,
    '{"tier":"flagship","api_route":"chat_completions","context_window":1000000,"pricing_source":"estimate"}'::jsonb),

  ('grok-4.20-reasoning', 'xai',
    'Grok 4.20 Reasoning (تفکر عمیق و حقوقی)',
    array['deep_reasoning','legal_assistant'],
    3.00, null, 15.00, null, null, 30, true, false,
    '{"tier":"reasoning","api_route":"chat_completions","reasoning":true,"pricing_source":"estimate"}'::jsonb),

  -- ══ Image generation ══════════════════════════════════════════════════════════
  -- OpenAI image models -> standard /v1/images/generations & /v1/images/edits
  ('gpt-image-1', 'openai',
    'تولید تصویر (GPT Image-1)',
    array['image_generation','image_edit'],
    5.00, null, 40.00, 0.040, 'per_image_1024', 30, true, false,
    '{"tier":"standard","api_route":"images_generations","supports_edit":true,"supports_multi_source":true}'::jsonb),

  ('gpt-image-1-mini', 'openai',
    'تولید تصویر اقتصادی (GPT Image-1 Mini)',
    array['image_generation','image_edit'],
    5.00, 1.25, 40.00, 0.011, 'image_low', 30, true, false,
    '{"tier":"economy","api_route":"images_generations","supports_edit":true,"supports_multi_source":true}'::jsonb),

  -- Gemini Nano Banana image models -> native /v1beta/models/{id}:generateContent
  ('gemini-2.5-flash-image', 'gemini',
    'Nano Banana (تولید/ویرایش تصویر اقتصادی)',
    array['image_generation','image_edit'],
    0, null, 0, 0.039, 'per_image', 30, true, false,
    '{"tier":"economy","api_route":"gemini_generate_content","supports_edit":true,"supports_multi_source":true,"pricing_source":"estimate"}'::jsonb),

  ('gemini-3-pro-image', 'gemini',
    'Nano Banana Pro (تصویر باکیفیت)',
    array['image_generation','image_edit'],
    0, null, 0, 0.120, 'per_image', 30, true, false,
    '{"tier":"premium","api_route":"gemini_generate_content","supports_edit":true,"supports_multi_source":true,"pricing_source":"estimate"}'::jsonb),

  -- ══ Text-to-Speech (route: audio_speech) ══════════════════════════════════════
  ('eleven_v3', 'elevenlabs',
    'صدای طبیعی ElevenLabs v3',
    array['voice_output'],
    0, null, 0, 0.30, 'per_1k_chars', 30, true, false,
    '{"tier":"premium","api_route":"audio_speech","multilingual":true,"pricing_source":"estimate"}'::jsonb),

  ('eleven_flash_v2_5', 'elevenlabs',
    'صدای سریع ElevenLabs Flash v2.5',
    array['voice_output'],
    0, null, 0, 0.15, 'per_1k_chars', 30, true, false,
    '{"tier":"fast","api_route":"audio_speech","multilingual":true,"pricing_source":"estimate"}'::jsonb),

  ('eleven_multilingual_v2', 'elevenlabs',
    'صدای چندزبانه ElevenLabs Multilingual v2',
    array['voice_output'],
    0, null, 0, 0.30, 'per_1k_chars', 30, true, false,
    '{"tier":"premium","api_route":"audio_speech","multilingual":true,"pricing_source":"estimate"}'::jsonb),

  ('gpt-4o-mini-tts', 'openai',
    'تولید صدا اقتصادی (OpenAI)',
    array['voice_output'],
    0, null, 0.015, null, null, 30, true, false,
    '{"tier":"economy","api_route":"audio_speech"}'::jsonb),

  ('gemini-2.5-flash-tts', 'gemini',
    'تولید صدا Gemini Flash',
    array['voice_output'],
    0, null, 0, 0.10, 'per_1k_chars', 30, true, false,
    '{"tier":"economy","api_route":"audio_speech","pricing_source":"estimate"}'::jsonb),

  -- ══ Speech-to-Text (route: audio_transcriptions) ══════════════════════════════
  ('gpt-4o-transcribe', 'openai',
    'تبدیل صوت به متن دقیق (GPT-4o)',
    array['voice_input'],
    6.00, 3.00, 0, 0.006, 'per_minute', 30, true, false,
    '{"tier":"accurate","api_route":"audio_transcriptions"}'::jsonb),

  ('gpt-4o-mini-transcribe', 'openai',
    'تبدیل صوت به متن اقتصادی',
    array['voice_input'],
    3.00, 1.50, 0, 0.003, 'per_minute', 30, true, false,
    '{"tier":"economy","api_route":"audio_transcriptions"}'::jsonb),

  ('whisper-1', 'openai',
    'تبدیل صوت به متن (Whisper)',
    array['voice_input'],
    0, null, 0, 0.006, 'per_minute', 30, true, false,
    '{"tier":"standard","api_route":"audio_transcriptions"}'::jsonb),

  -- ══ Video generation (route: videos, async) ═══════════════════════════════════
  ('sora-2', 'openai',
    'تولید ویدیو استاندارد (Sora 2)',
    array['video_generation'],
    0, null, 0, 0.10, 'video_second', 30, true, false,
    '{"tier":"standard","api_route":"videos","async":true,"max_seconds":20,"supports_input_reference":true}'::jsonb),

  ('sora-2-pro', 'openai',
    'تولید ویدیو حرفه‌ای (Sora 2 Pro)',
    array['video_generation'],
    0, null, 0, 0.30, 'video_second', 30, true, false,
    '{"tier":"premium","api_route":"videos","async":true,"max_seconds":20,"supports_input_reference":true}'::jsonb),

  ('veo-3.1-fast-generate-001', 'google',
    'تولید ویدیو سریع (Veo 3.1 Fast)',
    array['video_generation'],
    0, null, 0, 0.15, 'video_second', 30, true, false,
    '{"tier":"fast","api_route":"videos","async":true,"max_seconds":20,"supports_input_reference":true,"pricing_source":"estimate"}'::jsonb),

  ('veo-3.1-generate-001', 'google',
    'تولید ویدیو باکیفیت (Veo 3.1)',
    array['video_generation'],
    0, null, 0, 0.40, 'video_second', 30, true, false,
    '{"tier":"premium","api_route":"videos","async":true,"max_seconds":20,"supports_input_reference":true,"pricing_source":"estimate"}'::jsonb)

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

-- ── Deactivate the broken hyphenated ElevenLabs id ────────────────────────────
-- AvalAI uses underscores (eleven_multilingual_v2). The hyphen id is invalid.
update public.ai_model_catalog
set
  is_active = false,
  is_coming_soon = false,
  display_name_fa = 'eleven-multilingual-v2 (منسوخ — از eleven_multilingual_v2 استفاده کنید)',
  metadata = coalesce(metadata, '{}'::jsonb)
    || '{"deprecated":true,"replaced_by":"eleven_multilingual_v2","reason":"AvalAI uses underscore ids"}'::jsonb,
  updated_at = now()
where id = 'eleven-multilingual-v2';

-- ── Migrate any org that still has the broken voice_output id selected ─────────
update public.org_ai_settings
set
  selected_models = jsonb_set(
    selected_models,
    '{voice_output}',
    '"eleven_multilingual_v2"'::jsonb,
    true
  ),
  updated_at = now()
where selected_models ->> 'voice_output' = 'eleven-multilingual-v2';

-- ── Migrate the legacy STT id scribe_v2 (not served on /v1/audio/transcriptions) ─
update public.org_ai_settings
set
  selected_models = jsonb_set(
    selected_models,
    '{voice_input}',
    '"gpt-4o-transcribe"'::jsonb,
    true
  ),
  updated_at = now()
where selected_models ->> 'voice_input' = 'scribe_v2';

grant insert, update, delete on public.ai_model_catalog to service_role;
