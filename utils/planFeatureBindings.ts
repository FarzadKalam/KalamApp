// Commercial feature bindings for existing tenant resources. Existing role
// policies still apply; these checks never grant access by themselves.
export const PLAN_FEATURE_TABLES: Record<string, string> = {
  report_definitions: 'advanced_reports', report_widgets: 'advanced_reports', report_data_sources: 'advanced_reports',
  goals: 'goals', goal_contributions: 'goals', goal_milestone_events: 'goals',
  commission_rules: 'advanced_commission', commission_drafts: 'advanced_commission', commission_entries: 'advanced_commission',
  activity_performance_rules: 'performance_payroll_kpi', chat_groups: 'internal_chat',
  voip_sip_endpoints: 'voip_webphone', voip_sip_trunks: 'voip_webphone',
};
