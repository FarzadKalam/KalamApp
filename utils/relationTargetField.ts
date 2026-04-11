const DEFAULT_RELATION_TARGET_FIELDS: Record<string, string> = {
  customers: 'full_name',
  suppliers: 'business_name',
  profiles: 'full_name',
  org_roles: 'title',
  employees: 'full_name',
  work_schedules: 'title',
  journal_entries: 'entry_no',
};

export const getPreferredRelationTargetField = (
  targetModule?: string | null,
  explicitTargetField?: string | null
): string => {
  const explicit = String(explicitTargetField || '').trim();
  if (explicit) return explicit;
  const moduleName = String(targetModule || '').trim();
  return DEFAULT_RELATION_TARGET_FIELDS[moduleName] || 'name';
};

const MODULE_RELATION_SELECTABLE_FIELDS: Record<string, string[]> = {
  customers: ['full_name', 'last_name', 'business_name', 'legal_name', 'first_name', 'system_code'],
  suppliers: ['business_name', 'last_name', 'first_name', 'system_code'],
  profiles: ['full_name', 'last_name', 'first_name', 'system_code', 'email', 'mobile_1'],
  employees: ['full_name', 'system_code'],
  org_roles: ['title', 'name'],
  work_schedules: ['title', 'name'],
  journal_entries: ['entry_no', 'source_record_title', 'description'],
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
    return ['full_name'];
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

  const genericPrioritizedFields = [
    targetField,
    ...(includeSystemCode ? ['system_code'] : []),
    ...fallbackFields,
  ];
  const genericCompactFields = [targetField, ...fallbackFields];
  return Array.from(
    new Set([buildVariant(genericPrioritizedFields), buildVariant(genericCompactFields), 'id'].filter(Boolean))
  );
};
