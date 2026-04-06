export const SOFTWARE_ROLE_LABELS: Record<string, string> = {
  super_admin: 'مدیر ارشد',
  admin: 'مدیر سیستم',
  manager: 'مدیر',
  editor: 'ویرایشگر',
  viewer: 'مشاهده‌گر',
  user: 'کاربر',
  employee: 'کارمند',
};

export const SOFTWARE_ROLE_OPTIONS = [
  { label: 'مدیر ارشد', value: 'super_admin' },
  { label: 'مدیر سیستم', value: 'admin' },
  { label: 'مدیر', value: 'manager' },
  { label: 'ویرایشگر', value: 'editor' },
  { label: 'مشاهده‌گر', value: 'viewer' },
  { label: 'کاربر', value: 'user' },
  { label: 'کارمند', value: 'employee' },
];

export const normalizeSoftwareRoleToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-\u200c]+/g, '');

const MANAGE_USERS_ROLE_TOKENS = new Set([
  'superadmin',
  'admin',
  'manager',
  'مدیر',
  'مدیرارشد',
  'مدیرسیستم',
  'مدیرسازمان',
]);

const SUPER_ADMIN_ROLE_TOKENS = new Set([
  'superadmin',
  'مدیرارشد',
]);

export const canManageUsersByRoleContext = (...values: unknown[]) =>
  values.some((value) => MANAGE_USERS_ROLE_TOKENS.has(normalizeSoftwareRoleToken(value)));

export const canManageSuperAdminByRoleContext = (...values: unknown[]) =>
  values.some((value) => SUPER_ADMIN_ROLE_TOKENS.has(normalizeSoftwareRoleToken(value)));

export const getSoftwareRoleLabel = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  return SOFTWARE_ROLE_LABELS[normalized] || String(value || '').trim() || 'بدون عنوان';
};
