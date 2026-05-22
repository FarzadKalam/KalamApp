const GLOBAL_ASSIGNEE_MODULE_IDS = [
  'billboards',
  'products',
  'product_bundles',
  'production_orders',
  'projects',
  'invoices',
  'purchase_invoices',
  'secretariat_documents',
  'delivery_forms',
  'stock_transfers',
  'expense_documents',
  'cash_bank_operations',
  'employee_advances',
  'payroll_slips',
  'employee_contracts',
  'recruitment_applicants',
  'sms_delivery_reports',
  'voip_call_reports',
  'voip_call_logs',
  'marketing_leads',
  'tasks',
  'attendance_logs',
  'customers',
  'cheques',
  'barters',
  'suppliers',
  'employees',
  'bank_accounts',
  'cash_boxes',
  'petty_funds',
  'chart_of_accounts',
  'fiscal_years',
  'cost_centers',
  'journal_entries',
  'accounting_event_rules',
  'calculation_formulas',
  'shelves',
  'warehouses',
  'leave_requests',
  'overtime_requests',
  'mission_requests',
  'work_schedules',
  'price_lists',
  'web_forms',
  'automation_execution_reports',
  'counterparty_bot_groups',
  'surveys',
  'personas',
  'instructions',
  'process_templates',
  'process_runs',
  'production_boms',
  'production_group_orders',
] as const;

const GLOBAL_ROLE_ASSIGNEE_MODULE_IDS = [
  'billboards',
  'products',
  'product_bundles',
  'production_orders',
  'projects',
  'invoices',
  'purchase_invoices',
  'secretariat_documents',
  'delivery_forms',
  'stock_transfers',
  'expense_documents',
  'cash_bank_operations',
  'employee_advances',
  'payroll_slips',
  'employee_contracts',
  'recruitment_applicants',
  'sms_delivery_reports',
  'voip_call_reports',
  'voip_call_logs',
  'marketing_leads',
  'tasks',
  'attendance_logs',
  'customers',
  'cheques',
  'barters',
  'suppliers',
  'employees',
  'bank_accounts',
  'cash_boxes',
  'petty_funds',
  'chart_of_accounts',
  'fiscal_years',
  'cost_centers',
  'journal_entries',
  'accounting_event_rules',
  'calculation_formulas',
  'shelves',
  'warehouses',
  'leave_requests',
  'overtime_requests',
  'mission_requests',
  'work_schedules',
  'price_lists',
  'web_forms',
  'automation_execution_reports',
  'counterparty_bot_groups',
  'surveys',
  'personas',
  'instructions',
  'process_templates',
  'process_runs',
  'production_boms',
  'production_group_orders',
] as const;

export const GLOBAL_ASSIGNEE_MODULES = new Set<string>(GLOBAL_ASSIGNEE_MODULE_IDS);
export const GLOBAL_ASSIGNEE_TYPE_MODULES = new Set<string>(GLOBAL_ASSIGNEE_MODULE_IDS);
export const GLOBAL_ROLE_ASSIGNEE_MODULES = new Set<string>(GLOBAL_ROLE_ASSIGNEE_MODULE_IDS);
export const GLOBAL_ASSIGNEE_UI_FIELD_KEYS = new Set<string>([
  'assignee_id',
  'assignee_type',
  'assignee_role_id',
  'assignee_combo',
]);

export const supportsGlobalAssignee = (moduleId: string) => GLOBAL_ASSIGNEE_MODULES.has(String(moduleId || '').trim());
export const supportsGlobalAssigneeType = (moduleId: string) => GLOBAL_ASSIGNEE_TYPE_MODULES.has(String(moduleId || '').trim());
export const supportsGlobalRoleAssignee = (moduleId: string) => GLOBAL_ROLE_ASSIGNEE_MODULES.has(String(moduleId || '').trim());

const moduleDeclaresAssigneeField = (moduleConfig: any) => {
  const headerFields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
  if (headerFields.some((field: any) => String(field?.key || '').trim() === 'assignee_id')) {
    return true;
  }

  const blocks = Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks : [];
  return blocks.some((block: any) =>
    Array.isArray(block?.tableColumns)
    && block.tableColumns.some((column: any) => String(column?.key || '').trim() === 'assignee_id')
  );
};

const getModuleLookupKeys = (moduleConfig: any) =>
  Array.from(
    new Set(
      [
        String(moduleConfig?.id || '').trim(),
        String(moduleConfig?.table || '').trim(),
      ].filter(Boolean)
    )
  );

export const supportsModuleAssignee = (moduleConfig: any) =>
  getModuleLookupKeys(moduleConfig).some((key) => supportsGlobalAssignee(key))
  || moduleDeclaresAssigneeField(moduleConfig);

export const supportsModuleAssigneeType = (moduleConfig: any) =>
  getModuleLookupKeys(moduleConfig).some((key) => supportsGlobalAssigneeType(key))
  || moduleDeclaresAssigneeField(moduleConfig);

export const supportsModuleRoleAssignee = (moduleConfig: any) =>
  getModuleLookupKeys(moduleConfig).some((key) => supportsGlobalRoleAssignee(key));

export const shouldHideManagedAssigneeField = (
  moduleIdOrConfig: string | { id?: string; table?: string } | null | undefined,
  fieldKey: string | null | undefined
) => {
  const normalizedFieldKey = String(fieldKey || '').trim();
  if (!GLOBAL_ASSIGNEE_UI_FIELD_KEYS.has(normalizedFieldKey)) return false;
  if (typeof moduleIdOrConfig === 'string') {
    return supportsGlobalAssignee(moduleIdOrConfig);
  }
  return supportsModuleAssignee(moduleIdOrConfig);
};
