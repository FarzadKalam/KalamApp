-- TazeSystem V1 Phase 367
-- فعال‌سازی ویدیو برای قابلیت‌های آماده هوش مصنوعی و تفکیک گوینده‌ها بر اساس مدل.
-- این migration فقط داده‌های کاتالوگ/پلن را به‌روزرسانی می‌کند و تغییر ساختاری ندارد.

begin;

-- ویدیو و خروجی صوتی برای پلن‌های دارای امکانات رسانه هوش مصنوعی آماده‌اند؛
-- مدیر SaaS همچنان می‌تواند این قابلیت‌ها را از هر پلن حذف یا به آن اضافه کند.
update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb)
  || jsonb_build_object(
    'ai_voice_output', true,
    'ai_video_generation', true
  )
where coalesce(code, '') in ('cloud_enterprise', 'public_demo_full');

update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb)
  || jsonb_build_object(
    'ai_voice_output', false,
    'ai_video_generation', false
  )
where coalesce(code, '') in ('cloud_starter', 'cloud_growth');

-- مدل‌های رسانه‌ای که قبلاً صرفاً برای نمایش آینده علامت‌گذاری شده بودند، اکنون قابل انتخاب‌اند.
update public.ai_model_catalog
set
  is_coming_soon = false,
  metadata = coalesce(metadata, '{}'::jsonb) - 'phase' || jsonb_build_object('ready', true),
  updated_at = now()
where is_active = true
  and (
    'video_generation' = any(capability_tags)
    or 'voice_output' = any(capability_tags)
  );

-- هر موتور فقط گوینده‌هایی را دریافت می‌کند که با همان موتور سازگارند.
update public.ai_model_catalog
set metadata = coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'voice_options', jsonb_build_array(
      jsonb_build_object('value', 'alloy', 'label', 'Alloy'),
      jsonb_build_object('value', 'ash', 'label', 'Ash'),
      jsonb_build_object('value', 'ballad', 'label', 'Ballad'),
      jsonb_build_object('value', 'coral', 'label', 'Coral'),
      jsonb_build_object('value', 'echo', 'label', 'Echo'),
      jsonb_build_object('value', 'fable', 'label', 'Fable'),
      jsonb_build_object('value', 'onyx', 'label', 'Onyx'),
      jsonb_build_object('value', 'nova', 'label', 'Nova'),
      jsonb_build_object('value', 'sage', 'label', 'Sage'),
      jsonb_build_object('value', 'shimmer', 'label', 'Shimmer'),
      jsonb_build_object('value', 'verse', 'label', 'Verse')
    )
  ),
  updated_at = now()
where is_active = true
  and 'voice_output' = any(capability_tags)
  and coalesce(provider, '') = 'openai';

update public.ai_model_catalog
set metadata = coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'voice_options', jsonb_build_array(
      jsonb_build_object('value', 'Aoede', 'label', 'Aoede'),
      jsonb_build_object('value', 'Charon', 'label', 'Charon'),
      jsonb_build_object('value', 'Fenrir', 'label', 'Fenrir'),
      jsonb_build_object('value', 'Kore', 'label', 'Kore'),
      jsonb_build_object('value', 'Puck', 'label', 'Puck'),
      jsonb_build_object('value', 'Zephyr', 'label', 'Zephyr')
    )
  ),
  updated_at = now()
where is_active = true
  and 'voice_output' = any(capability_tags)
  and coalesce(provider, '') = 'gemini';

update public.ai_model_catalog
set metadata = coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'voice_options', jsonb_build_array(
      jsonb_build_object('value', 'Rachel', 'label', 'Rachel'),
      jsonb_build_object('value', 'Domi', 'label', 'Domi'),
      jsonb_build_object('value', 'Bella', 'label', 'Bella'),
      jsonb_build_object('value', 'Antoni', 'label', 'Antoni'),
      jsonb_build_object('value', 'Elli', 'label', 'Elli'),
      jsonb_build_object('value', 'Josh', 'label', 'Josh'),
      jsonb_build_object('value', 'Arnold', 'label', 'Arnold'),
      jsonb_build_object('value', 'Adam', 'label', 'Adam'),
      jsonb_build_object('value', 'Sam', 'label', 'Sam')
    )
  ),
  updated_at = now()
where is_active = true
  and 'voice_output' = any(capability_tags)
  and coalesce(provider, '') = 'elevenlabs';

-- تنظیم قدیمی «فاز بعد» برای ویدیو در سازمان‌ها نباید مسیر آماده را مسدود کند.
-- محدودیت واقعی همچنان با ویژگی پلن و کلید روشن/خاموش همان سازمان کنترل می‌شود.
update public.org_ai_settings
set
  feature_flags = jsonb_set(coalesce(feature_flags, '{}'::jsonb), '{video_generation}', 'true'::jsonb, true),
  updated_at = now()
where coalesce(feature_flags ->> 'video_generation', 'false') = 'false';

notify pgrst, 'reload schema';

commit;
