type RolePermissions = Record<string, unknown> | null | undefined;

function permissionEntry(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function hasAiSettingsAdminPermission(permissions: RolePermissions): boolean {
  if (!permissions) return false;
  const settings = permissionEntry(permissions.__settings_tabs);
  const fields = permissionEntry(settings?.fields);
  return settings?.view !== false && settings?.edit === true
    && fields?.ai !== false && fields?.ai_settings !== false;
}

// Agent discovery may use the default visibility of a verified organization admin.
// This is only a catalog gate; it does not grant record access or management rights.
export function canViewAiAgentModule(params: {
  permissions: RolePermissions;
  moduleId: string;
  parentModuleId?: string;
  softwareRole?: string | null;
  isOrgAdmin?: boolean;
}): boolean {
  const { permissions, moduleId, parentModuleId, softwareRole, isOrgAdmin } = params;
  if (!permissions) return true;
  const direct = permissions[moduleId];
  const inherited = parentModuleId ? permissions[parentModuleId] : undefined;
  const value = direct ?? inherited;
  if (value != null) {
    const entry = permissionEntry(value);
    return Boolean(entry && entry.view !== false);
  }
  const role = softwareRole?.trim().toLowerCase();
  return isOrgAdmin === true || role === 'admin' || role === 'super_admin';
}
