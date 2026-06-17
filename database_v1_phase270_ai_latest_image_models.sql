-- TazeSystem V1 Phase 270
-- Register the latest / highest-quality image models (poster & print grade) and
-- mark them with the correct AvalAI endpoint via metadata.api_route:
--   - OpenAI gpt-image-*  -> images_generations  (+ /v1/images/edits)
--   - Gemini *image*      -> gemini_generate_content (/v1beta ... :generateContent)
--   - FLUX / Imagen / Qwen-> images_generations
-- These become selectable in the per-org AI settings AND the compose model picker.
-- Multi-tenant safe: existing tenants are NOT force-migrated to a pricier model;
-- they can opt-in from settings or the per-message model selector. Only the code
-- default (for tenants without a stored choice) moves to gpt-image-2.

insert into public.ai_model_catalog (
  id, provider, display_name_fa, capability_tags, input_usd_per_1m,
  cached_input_usd_per_1m, output_usd_per_1m, specific_cost_usd,
  specific_cost_unit, margin_percent, is_active, is_coming_soon, metadata
) values
  -- ── OpenAI gpt-image (best for posters / text-in-image / print) ───────────────
  ('gpt-image-2', 'openai',
    'GPT Image 2 (پوستر و چاپ — جدیدترین)',
    array['image_generation','image_edit'],
    0, null, 0, 0.080, 'per_image_1024', 30, true, false,
    '{"tier":"flagship","api_route":"images_generations","supports_edit":true,"supports_multi_source":true,"good_for":"poster_print_text","pricing_source":"estimate"}'::jsonb),

  ('gpt-image-1.5', 'openai',
    'GPT Image 1.5 (پوستر و چاپ)',
    array['image_generation','image_edit'],
    0, null, 0, 0.060, 'per_image_1024', 30, true, false,
    '{"tier":"premium","api_route":"images_generations","supports_edit":true,"supports_multi_source":true,"good_for":"poster_print_text","pricing_source":"estimate"}'::jsonb),

  -- ── Gemini Nano Banana Pro / latest (native endpoint) ────────────────────────
  ('gemini-3-pro-image-preview', 'gemini',
    'Nano Banana Pro (تصویر باکیفیت — جدید)',
    array['image_generation','image_edit'],
    0, null, 0, 0.120, 'per_image', 30, true, false,
    '{"tier":"flagship","api_route":"gemini_generate_content","supports_edit":true,"supports_multi_source":true,"good_for":"poster_print","pricing_source":"estimate"}'::jsonb),

  ('gemini-3.1-flash-image-preview', 'gemini',
    'Gemini 3.1 Flash Image (سریع و جدید)',
    array['image_generation','image_edit'],
    0, null, 0, 0.045, 'per_image', 30, true, false,
    '{"tier":"balanced","api_route":"gemini_generate_content","supports_edit":true,"supports_multi_source":true,"pricing_source":"estimate"}'::jsonb),

  -- ── FLUX / Imagen / Qwen (alternatives) ──────────────────────────────────────
  ('flux-1.1-pro', 'flux',
    'FLUX 1.1 Pro (هنری و باکیفیت)',
    array['image_generation'],
    0, null, 0, 0.040, 'per_image', 30, true, false,
    '{"tier":"premium","api_route":"images_generations","good_for":"art_poster","pricing_source":"estimate"}'::jsonb),

  ('imagen-4.0-ultra-generate', 'google',
    'Imagen 4 Ultra (فوتورئالیستیک)',
    array['image_generation'],
    0, null, 0, 0.060, 'per_image', 30, true, false,
    '{"tier":"premium","api_route":"images_generations","good_for":"photoreal_poster","pricing_source":"estimate"}'::jsonb),

  ('qwen-image-edit-plus', 'alibaba',
    'Qwen Image Edit Plus (ویرایش تصویر)',
    array['image_generation','image_edit'],
    0, null, 0, 0.030, 'per_image', 30, true, false,
    '{"tier":"economy","api_route":"images_generations","supports_edit":true,"pricing_source":"estimate"}'::jsonb)

on conflict (id) do update
set
  provider            = excluded.provider,
  display_name_fa     = excluded.display_name_fa,
  capability_tags     = excluded.capability_tags,
  specific_cost_usd   = excluded.specific_cost_usd,
  specific_cost_unit  = excluded.specific_cost_unit,
  margin_percent      = excluded.margin_percent,
  is_active           = excluded.is_active,
  is_coming_soon      = excluded.is_coming_soon,
  metadata            = excluded.metadata,
  updated_at          = now();

grant insert, update, delete on public.ai_model_catalog to service_role;
