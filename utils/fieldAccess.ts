import type { ModulePermissionConfig } from './permissions';

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete'] as const;
export type PermissionAction = typeof PERMISSION_ACTIONS[number];
export type FieldActionPermissions = Partial<Record<PermissionAction, boolean>>;
export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'مشاهده', create: 'ایجاد', edit: 'ویرایش', delete: 'حذف',
};

// Old roles used edit for both creation and editing. Preserve that fallback
// until an organization explicitly chooses a separate creation permission.
export const canModuleAction = (permission: ModulePermissionConfig | undefined, action: PermissionAction) =>
  permission?.view !== false && (action === 'create'
    ? (permission?.create ?? permission?.edit) !== false
    : permission?.[action] !== false);

export const canFieldAction = (
  permission: ModulePermissionConfig | undefined, key: string, action: PermissionAction,
) => {
  if (!canModuleAction(permission, action === 'delete' ? 'edit' : action)) return false;
  if (permission?.fields?.[key] === false || permission?.field_actions?.[key]?.view === false) return false;
  return permission?.field_actions?.[key]?.[action] !== false;
};

export const isEmptyFieldValue = (value: unknown) =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0);

export const canWriteFieldValue = (permission: ModulePermissionConfig | undefined, key: string, value: unknown, creating: boolean) =>
  canFieldAction(permission, key, creating ? 'create' : 'edit')
  && (creating || !isEmptyFieldValue(value) || canFieldAction(permission, key, 'delete'));

export const normalizePermissionSearch = (value: string) => value.trim().toLocaleLowerCase('fa')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\s]+/g, ' ');
