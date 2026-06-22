-- Phase 271: choose an economical primary AI model per organization.
-- Idempotent and tenant-safe; only fills the primary-model key when it is missing.

update public.org_ai_settings
set
  selected_models = coalesce(selected_models, '{}'::jsonb)
    || jsonb_build_object(
      '__primary_model',
      case
        when exists (
          select 1 from public.ai_model_catalog
          where id = 'gemini-3.1-flash-lite'
            and is_active = true
            and coalesce(is_coming_soon, false) = false
            and capability_tags && array[
              'dashboard_chat',
              'record_chat',
              'customer_reply_suggestion',
              'document_analysis',
              'workflow_ai_prompt',
              'deep_reasoning',
              'legal_assistant',
              'web_search'
            ]::text[]
        ) then 'gemini-3.1-flash-lite'
        when exists (
          select 1 from public.ai_model_catalog
          where id = 'gpt-5.4-mini'
            and is_active = true
            and coalesce(is_coming_soon, false) = false
        ) then 'gpt-5.4-mini'
        when exists (
          select 1 from public.ai_model_catalog
          where id = 'gpt-5-mini'
            and is_active = true
            and coalesce(is_coming_soon, false) = false
        ) then 'gpt-5-mini'
        when exists (
          select 1 from public.ai_model_catalog
          where id = 'gpt-4.1-mini'
            and is_active = true
            and coalesce(is_coming_soon, false) = false
        ) then 'gpt-4.1-mini'
        else 'gpt-4o-mini'
      end
    ),
  updated_at = now()
where coalesce(selected_models, '{}'::jsonb) ? '__primary_model' = false;
