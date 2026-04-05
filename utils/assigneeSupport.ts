const GLOBAL_ASSIGNEE_MODULE_IDS = [
  'billboards',
  'products',
  'product_bundles',
  'production_orders',
  'invoices',
  'purchase_invoices',
  'marketing_leads',
  'tasks',
  'attendance_logs',
  'customers',
  'projects',
] as const;

const GLOBAL_ROLE_ASSIGNEE_MODULE_IDS = [
  'billboards',
  'products',
  'product_bundles',
  'production_orders',
  'invoices',
  'purchase_invoices',
  'marketing_leads',
  'tasks',
  'attendance_logs',
  'customers',
  'projects',
] as const;

export const GLOBAL_ASSIGNEE_MODULES = new Set<string>(GLOBAL_ASSIGNEE_MODULE_IDS);
export const GLOBAL_ASSIGNEE_TYPE_MODULES = new Set<string>(GLOBAL_ASSIGNEE_MODULE_IDS);
export const GLOBAL_ROLE_ASSIGNEE_MODULES = new Set<string>(GLOBAL_ROLE_ASSIGNEE_MODULE_IDS);

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
