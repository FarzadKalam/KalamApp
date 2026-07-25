-- =====================================================
-- TazeSystem - Phase 382
-- Enable personality-assessment AI analysis by default
-- =====================================================

begin;

-- Only missing settings receive the default. Explicit plan choices remain unchanged.
update public.saas_plans
set enabled_features = jsonb_set(
  coalesce(enabled_features, '{}'::jsonb),
  '{mbti_ai_analysis}',
  'true'::jsonb,
  true
)
where not (coalesce(enabled_features, '{}'::jsonb) ? 'mbti_ai_analysis');

notify pgrst, 'reload schema';

commit;
