const DEFAULT_RELATION_TARGET_FIELDS: Record<string, string> = {
  customers: 'full_name',
  suppliers: 'business_name',
  profiles: 'full_name',
  org_roles: 'title',
  employees: 'full_name',
  cash_boxes: 'name',
  bank_accounts: 'bank_name',
  petty_funds: 'name',
  work_schedules: 'title',
  journal_entries: 'entry_no',
  secretariat_documents: 'name',
  delivery_forms: 'name',
  stock_transfers: 'name',
  expense_documents: 'name',
  assets: 'name',
  employee_advances: 'name',
  job_descriptions: 'name',
  payroll_slips: 'name',
  employee_contracts: 'name',
  recruitment_applicants: 'name',
};

const LEGACY_TARGET_FIELD_ALIASES: Record<string, Record<string, string>> = {
  customers: { name: 'full_name' },
  suppliers: { name: 'business_name' },
  profiles: { name: 'full_name' },
  employees: { name: 'full_name' },
  org_roles: { name: 'title' },
  work_schedules: { name: 'title' },
  journal_entries: { name: 'entry_no' },
};

export const normalizeRelationFieldAlias = (
  targetModule?: string | null,
  fieldName?: string | null
): string => {
  const moduleName = String(targetModule || '').trim();
  const normalizedFieldName = String(fieldName || '').trim();
  if (!normalizedFieldName) return '';
  const aliasMap = LEGACY_TARGET_FIELD_ALIASES[moduleName];
  return aliasMap?.[normalizedFieldName.toLowerCase()] || normalizedFieldName;
};

export const getPreferredRelationTargetField = (
  targetModule?: string | null,
  explicitTargetField?: string | null
): string => {
  const moduleName = String(targetModule || '').trim();
  const explicit = String(explicitTargetField || '').trim();
  const defaultField = DEFAULT_RELATION_TARGET_FIELDS[moduleName] || 'name';

  if (!explicit) return defaultField;

  const preferredField = normalizeRelationFieldAlias(moduleName, explicit);

  const safeSelectableFields = MODULE_RELATION_SELECTABLE_FIELDS[moduleName];
  if (Array.isArray(safeSelectableFields) && safeSelectableFields.length > 0) {
    if (safeSelectableFields.includes(preferredField)) return preferredField;
    if (moduleName === 'profiles' && (preferredField === 'name' || preferredField === 'title')) {
      return 'full_name';
    }
    return defaultField;
  }

  return preferredField;
};

const MODULE_RELATION_SELECTABLE_FIELDS: Record<string, string[]> = {
  customers: ['full_name', 'last_name', 'business_name', 'legal_name', 'first_name', 'system_code', 'legacy_contact_code', 'mobile_1', 'accounting_code'],
  suppliers: ['business_name', 'last_name', 'first_name', 'system_code', 'accounting_code'],
  profiles: ['full_name', 'last_name', 'first_name', 'system_code', 'email', 'mobile_1'],
  employees: ['full_name', 'prefix', 'first_name', 'last_name', 'legacy_system_code', 'system_code', 'national_code', 'mobile_1', 'phone'],
  cash_boxes: ['name', 'code'],
  bank_accounts: ['bank_name', 'account_number', 'card_number', 'shaba', 'code'],
  petty_funds: ['name', 'code'],
  org_roles: ['title', 'name'],
  work_schedules: ['title', 'name'],
  journal_entries: ['entry_no', 'source_record_title', 'description'],
  products: ['name', 'system_code', 'manual_code', 'crm_code', 'accounting_code', 'product_identifier', 'status'],
  product_bundles: ['name', 'bundle_number', 'status'],
  billboards: ['address', 'name', 'system_code', 'manual_code', 'catalog_code', 'product_identifier', 'city_name', 'status'],
  production_orders: ['name', 'system_code', 'status'],
  shelves: ['name', 'system_code', 'shelf_number'],
  invoices: ['name', 'system_code', 'status'],
  projects: ['name', 'system_code', 'status'],
  purchase_invoices: ['name', 'system_code', 'status'],
  secretariat_documents: ['name', 'system_code', 'external_number', 'indicator_number', 'status'],
  delivery_forms: ['name', 'system_code', 'location_text', 'status'],
  stock_transfers: ['name', 'system_code', 'transfer_type', 'status'],
  expense_documents: ['name', 'system_code', 'expense_type', 'status'],
  assets: ['name', 'system_code', 'asset_tag_code', 'storage_location', 'status'],
  employee_advances: ['name', 'system_code', 'status'],
  job_descriptions: ['name', 'system_code'],
  payroll_slips: ['name', 'system_code', 'status'],
  employee_contracts: ['name', 'system_code', 'status'],
  recruitment_applicants: ['name', 'system_code', 'mobile', 'status'],
  marketing_leads: ['name', 'full_name', 'business_name', 'system_code', 'sarnakh_code', 'legacy_system_code', 'status'],
};

export const getRelationSelectableFields = (targetModule?: string | null): string[] => {
  const moduleName = String(targetModule || '').trim();
  return [...(MODULE_RELATION_SELECTABLE_FIELDS[moduleName] || [])];
};

export const getRelationLabelFallbackFields = (targetModule?: string | null): string[] => {
  const moduleName = String(targetModule || '').trim();
  if (moduleName === 'customers') {
    return ['full_name', 'last_name', 'business_name', 'legal_name', 'first_name'];
  }
  if (moduleName === 'suppliers') {
    return ['business_name', 'last_name', 'first_name'];
  }
  if (moduleName === 'profiles') {
    return ['full_name', 'last_name', 'first_name'];
  }
  if (moduleName === 'employees') {
    return ['full_name', 'first_name', 'last_name', 'legacy_system_code', 'system_code'];
  }
  if (moduleName === 'cash_boxes') {
    return ['name', 'code'];
  }
  if (moduleName === 'petty_funds') {
    return ['name', 'code'];
  }
  if (moduleName === 'bank_accounts') {
    return ['bank_name', 'account_number', 'card_number', 'shaba', 'code'];
  }
  if (moduleName === 'org_roles') {
    return ['title', 'name'];
  }
  if (moduleName === 'work_schedules') {
    return ['title', 'name'];
  }
  if (moduleName === 'journal_entries') {
    return ['entry_no', 'source_record_title', 'description'];
  }
  if (moduleName === 'products') {
    return ['name', 'system_code', 'manual_code', 'crm_code', 'accounting_code', 'product_identifier'];
  }
  if (moduleName === 'product_bundles') {
    return ['name', 'bundle_number'];
  }
  if (moduleName === 'billboards') {
    return ['address', 'name', 'system_code', 'manual_code', 'catalog_code', 'product_identifier', 'city_name'];
  }
  return ['name', 'title', 'business_name', 'shelf_number'];
};

export const getRelationOptionSelectVariants = (
  targetModule?: string | null,
  explicitTargetField?: string | null,
  includeSystemCode = false
): string[] => {
  const moduleName = String(targetModule || '').trim();
  const targetField = getPreferredRelationTargetField(moduleName, explicitTargetField);
  const safeSelectableFields = MODULE_RELATION_SELECTABLE_FIELDS[moduleName];
  const fallbackFields = getRelationLabelFallbackFields(moduleName);

  const buildVariant = (fields: string[]) =>
    Array.from(new Set(['id', ...fields]))
      .map((field) => String(field || '').trim())
      .filter(Boolean)
      .join(', ');

  if (Array.isArray(safeSelectableFields) && safeSelectableFields.length > 0) {
    const prioritizedFields = [
      targetField,
      ...(includeSystemCode && safeSelectableFields.includes('system_code') ? ['system_code'] : []),
      ...fallbackFields,
    ].filter((field) => safeSelectableFields.includes(field));

    const compactFields = [
      targetField,
      ...fallbackFields,
    ].filter((field) => safeSelectableFields.includes(field));

    const variants = [buildVariant(prioritizedFields), buildVariant(compactFields), 'id'];
    return Array.from(new Set(variants.filter(Boolean)));
  }

  // Keep generic fallback conservative to avoid repeated 400 requests on modules
  // that do not have legacy label fields such as `title` or `business_name`.
  const genericPrioritizedFields = [
    targetField,
    ...(includeSystemCode ? ['system_code'] : []),
  ];
  const genericCompactFields = [targetField];
  return Array.from(
    new Set([buildVariant(genericPrioritizedFields), buildVariant(genericCompactFields), 'id'].filter(Boolean))
  );
};
