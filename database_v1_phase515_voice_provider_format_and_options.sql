-- TazeSystem V1 Phase 515
-- هماهنگی خروجی صوتی و گوینده‌های سازگار با مستندات فعلی AvalAI.

begin;

-- مدل‌های ElevenLabs در مسیر OpenAI-compatible AvalAI نام گوینده‌های عمومی
-- را می‌پذیرند. شناسه‌های داخلی ElevenLabs در این مسیر باعث خطای voice not found می‌شدند.
update public.ai_model_catalog
set metadata = coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'voice_options', jsonb_build_array(
      jsonb_build_object('value', 'alloy', 'label', 'الوی'),
      jsonb_build_object('value', 'coral', 'label', 'کورال'),
      jsonb_build_object('value', 'echo', 'label', 'اکو'),
      jsonb_build_object('value', 'fable', 'label', 'فیبل'),
      jsonb_build_object('value', 'nova', 'label', 'نوا'),
      jsonb_build_object('value', 'onyx', 'label', 'اونیکس'),
      jsonb_build_object('value', 'sage', 'label', 'سیج'),
      jsonb_build_object('value', 'shimmer', 'label', 'شیمر')
    )
  ),
  updated_at = now()
where id in ('eleven_flash_v2_5', 'eleven_multilingual_v2')
  and provider = 'elevenlabs';

notify pgrst, 'reload schema';

commit;
