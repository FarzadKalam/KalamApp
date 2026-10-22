-- One-time, scoped demo access correction requested for arad and goldware.
-- The current offering catalogue is explicitly included so options added after
-- public_demo_full was first created are also enabled for these two demos.
do $$
declare
  v_module_keys text[] := array[
    'customers','marketing_leads','invoices','price_lists','billboards',
    'suppliers','purchase_invoices','expense_documents','assets',
    'products','warehouses','shelves','stock_transfers','product_bundles','production_boms','production_orders',
    'projects','tasks','content_calendars','process_templates','process_runs',
    'employees','attendance_logs','work_schedules','leave_requests','overtime_requests','mission_requests',
    'employee_advances','payroll_slips','employee_contracts','recruitment_applicants',
    'chart_of_accounts','journal_entries','cash_boxes','bank_accounts','petty_funds','cheques',
    'barters','cash_bank_operations','accounting_event_rules','cost_centers','fiscal_years',
    'secretariat_documents','advertising_campaigns','web_forms','surveys','calculation_formulas','delivery_forms'
  ];
  v_feature_keys text[] := array[
    'ai_chat','ai_knowledge','ai_document_analysis','ai_web_search','ai_voice_input','ai_voice_output',
    'ai_image_generation','ai_video_generation','ai_deep_reasoning','taxpayer_system',
    'internal_realtime_notifications','support_tickets','api_access','advanced_reports','map_view',
    'multi_lane_processes','content_calendar','white_label','custom_domain','own_payment_gateway',
    'online_invoice_payment','online_catalog','retail_sales_invoice','reservations','qr_scan',
    'instagram_inbox','campaign_sms','campaign_email','campaign_instagram_post','saas_account_billing',
    'ai_credit_topup','sms_credit_topup','extra_users_purchase','business_model_canvas','bale_bot','rubika_bot'
  ];
  v_modules jsonb;
  v_features jsonb;
begin
  if not exists (select 1 from public.saas_plans where code = 'public_demo_full' and is_active) then
    raise exception 'Full demo plan is unavailable';
  end if;

  select coalesce(jsonb_object_agg(key, true), '{}'::jsonb)
    into v_modules
  from (
    select unnest(v_module_keys) as key
    union
    select jsonb_object_keys(enabled_modules) from public.saas_plans where code = 'public_demo_full'
  ) options;

  select coalesce(jsonb_object_agg(key, true), '{}'::jsonb)
    into v_features
  from (
    select unnest(v_feature_keys) as key
    union
    select jsonb_object_keys(enabled_features) from public.saas_plans where code = 'public_demo_full'
  ) options;

  update public.saas_org_settings settings
  set plan_code = 'public_demo_full',
      module_overrides = coalesce(settings.module_overrides, '{}'::jsonb) || v_modules,
      feature_overrides = coalesce(settings.feature_overrides, '{}'::jsonb) || v_features,
      updated_at = now()
  from public.organizations org
  where org.id = settings.org_id
    and org.slug in ('arad', 'goldware')
    and settings.is_demo = true
    and settings.status = 'demo';

  if (select count(*) from public.organizations org
      join public.saas_org_settings settings on settings.org_id = org.id
      where org.slug in ('arad', 'goldware') and settings.is_demo = true
        and settings.plan_code = 'public_demo_full'
        and settings.module_overrides @> v_modules
        and settings.feature_overrides @> v_features) <> 2 then
    raise exception 'The two requested demo organizations were not both updated';
  end if;
end;
$$;
