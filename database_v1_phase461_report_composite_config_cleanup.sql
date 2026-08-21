-- Phase 461: prepare report definitions for composite difference and percentage reports.
-- The old single-report difference metric is deliberately removed; composite reports
-- store their source selections in config.calculation_mode and reference_* fields.

begin;

update public.report_definitions
set config = jsonb_strip_nulls(
  (coalesce(config, '{}'::jsonb) - 'metric_subtract_fields')
  || jsonb_build_object('calculation_mode', 'normal')
  || case
    when coalesce(config->>'metric_type', '') = 'difference'
      then jsonb_build_object('metric_type', 'count', 'metric_fields', '[]'::jsonb)
    else '{}'::jsonb
  end
)
where coalesce(config->>'calculation_mode', '') = ''
   or coalesce(config->>'metric_type', '') = 'difference'
   or config ? 'metric_subtract_fields';

create index if not exists idx_report_definitions_reference_reports
  on public.report_definitions using gin ((config -> 'reference_report_ids'))
  where coalesce(config->>'calculation_mode', 'normal') in ('difference', 'percentage');

commit;
