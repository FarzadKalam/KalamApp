-- =====================================================
-- KalamApp - Phase 67 Marketing Leads Legacy Code Label + Column
-- Date: 2026-04-15
-- Type: Additive / idempotent migration
-- Goal: ensure marketing_leads.sarnakh_code exists and rename its label to "کد سیستم قبلی"
-- =====================================================

begin;

alter table public.marketing_leads
  add column if not exists sarnakh_code text;

update public.integration_settings as s
set
  settings = jsonb_set(
    s.settings,
    '{modules,marketing_leads,schema,fields}',
    (
      select coalesce(jsonb_agg(
        case
          when coalesce(field_item->>'key', '') = 'sarnakh_code' then
            jsonb_set(
              jsonb_set(field_item, '{labels,fa}', to_jsonb('کد سیستم قبلی'::text), true),
              '{labels,en}',
              to_jsonb('Legacy System Code'::text),
              true
            )
          else field_item
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(
        coalesce(s.settings #> '{modules,marketing_leads,schema,fields}', '[]'::jsonb)
      ) as field_item
    ),
    true
  ),
  updated_at = now()
where
  s.connection_type = 'module_settings'
  and exists (
    select 1
    from jsonb_array_elements(
      coalesce(s.settings #> '{modules,marketing_leads,schema,fields}', '[]'::jsonb)
    ) as field_item
    where coalesce(field_item->>'key', '') = 'sarnakh_code'
      and coalesce(field_item #>> '{labels,fa}', '') <> 'کد سیستم قبلی'
  );

commit;
