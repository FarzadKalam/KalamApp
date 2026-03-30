export const SOFTWARE_ROLE_LABELS: Record<string, string> = {
  super_admin: 'مدیر ارشد',
  admin: 'مدیر سیستم',
  manager: 'مدیر',
  viewer: 'مشاهده‌گر',
  user: 'کاربر',
  employee: 'کارمند',
};

export const SOFTWARE_ROLE_OPTIONS = [
  { label: 'مدیر ارشد', value: 'super_admin' },
  { label: 'مدیر سیستم', value: 'admin' },
  { label: 'مدیر', value: 'manager' },
  { label: 'مشاهده‌گر', value: 'viewer' },
  { label: 'کاربر', value: 'user' },
  { label: 'کارمند', value: 'employee' },
];

export const getSoftwareRoleLabel = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  return SOFTWARE_ROLE_LABELS[normalized] || String(value || '').trim() || 'بدون عنوان';
};
