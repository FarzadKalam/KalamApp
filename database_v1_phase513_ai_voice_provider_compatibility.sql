-- TazeSystem V1 Phase 513
-- اصلاح شناسه‌های صدای AvalAI و کنارگذاشتن مدل صوتی بازنشسته.

begin;

-- AvalAI برای مدل‌های ElevenLabs شناسهٔ پایدار صدا را می‌پذیرد، نه نام نمایشی.
update public.ai_model_catalog
set metadata = coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'voice_options', jsonb_build_array(
      jsonb_build_object('value', '21m00Tcm4TlvDq8ikWAM', 'label', 'ریچل'),
      jsonb_build_object('value', 'AZnzlk1XvdvUeBnXmlld', 'label', 'دومی'),
      jsonb_build_object('value', 'EXAVITQu4vr4xnSDxMaL', 'label', 'بلا'),
      jsonb_build_object('value', 'ErXwobaYiN019PkySvjV', 'label', 'آنتونی'),
      jsonb_build_object('value', 'MF3mGyEYCl7XYWbV9V6O', 'label', 'الی'),
      jsonb_build_object('value', 'TxGEqnHWrfWFTfGW9XjX', 'label', 'جاش'),
      jsonb_build_object('value', 'VR6AewLTigWG4xSOukaG', 'label', 'آرنولد'),
      jsonb_build_object('value', 'pNInz6obpgDQGcFmaJgB', 'label', 'آدام'),
      jsonb_build_object('value', 'yoZ06aMxZJJ28mfd3POQ', 'label', 'سم')
    )
  ),
  updated_at = now()
where id in ('eleven_flash_v2_5', 'eleven_multilingual_v2')
  and provider = 'elevenlabs';

-- AvalAI مدل gpt-4o-mini-tts را بازنشسته کرده است؛ انتخاب‌های قدیمی سازمان‌ها
-- به مدل Gemini منتقل می‌شوند تا تولید صدا بدون تغییر دستی دوباره کار کند.
update public.ai_model_catalog
set
  is_active = false,
  is_coming_soon = false,
  display_name_fa = 'مدل تولید صدا بازنشسته (جایگزین: Gemini Flash)',
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'deprecated', true,
      'replaced_by', 'gemini-2.5-flash-tts',
      'reason', 'AvalAI no longer serves this model'
    ),
  updated_at = now()
where id = 'gpt-4o-mini-tts';

update public.org_ai_settings
set
  selected_models = jsonb_set(
    selected_models,
    '{voice_output}',
    '"gemini-2.5-flash-tts"'::jsonb,
    true
  ),
  updated_at = now()
where selected_models ->> 'voice_output' = 'gpt-4o-mini-tts';

update public.org_ai_settings
set
  selected_models = jsonb_set(
    selected_models,
    '{ai_voice_output}',
    '"gemini-2.5-flash-tts"'::jsonb,
    true
  ),
  updated_at = now()
where selected_models ->> 'ai_voice_output' = 'gpt-4o-mini-tts';

notify pgrst, 'reload schema';

commit;
