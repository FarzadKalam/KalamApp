const DEFAULT_RELATION_TARGET_FIELDS: Record<string, string> = {
  customers: 'full_name',
  suppliers: 'business_name',
  profiles: 'full_name',
  org_roles: 'title',
  employees: 'full_name',
  work_schedules: 'title',
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

export const getRelationLabelFallbackFields = (targetModule?: string | null): string[] => {
  const moduleName = String(targetModule || '').trim();
  if (moduleName === 'customers') {
    return ['full_name', 'last_name', 'business_name', 'legal_name', 'first_name'];
  }
  if (moduleName === 'suppliers') {
    return ['business_name', 'full_name', 'last_name', 'first_name'];
  }
  if (moduleName === 'profiles' || moduleName === 'employees') {
    return ['full_name', 'last_name', 'first_name'];
  }
  if (moduleName === 'org_roles') {
    return ['title', 'name'];
  }
  if (moduleName === 'work_schedules') {
    return ['title', 'name'];
  }
  return ['name', 'title', 'business_name', 'shelf_number'];
};
