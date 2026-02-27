export const ACCOUNTING_MINIMAL_MODULE_IDS = [
  'fiscal_years',
  'chart_of_accounts',
  'accounting_event_rules',
  'cost_centers',
  'cash_boxes',
  'bank_accounts',
  'cheques',
] as const;

export const isAccountingMinimalModule = (moduleId?: string | null) => {
  if (!moduleId) return false;
  return ACCOUNTING_MINIMAL_MODULE_IDS.includes(moduleId as (typeof ACCOUNTING_MINIMAL_MODULE_IDS)[number]);
};
