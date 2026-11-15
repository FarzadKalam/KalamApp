-- Central defaults belong to layer 2; organization overrides remain in
-- org_ai_settings.metadata and use its existing org-scoped settings access.
begin;
alter table public.saas_ai_default_models add column if not exists reasoning_effort text;
comment on column public.saas_ai_default_models.reasoning_effort is 'Optional effort for this model slot; validated against model catalog by the central AI gateway.';
notify pgrst, 'reload schema';
commit;
