const HR_EMPLOYEE_LABEL_MODULES = new Set([
  'attendance_logs',
  'leave_requests',
  'overtime_requests',
  'mission_requests',
]);

export const getAssigneeLabel = (moduleId?: string | null): string => {
  const normalized = String(moduleId || '');
  if (normalized === 'invoices') return 'بازاریاب';
  if (normalized === 'marketing_leads') return 'نام بازاریاب';
  if (HR_EMPLOYEE_LABEL_MODULES.has(normalized)) return 'نام کارمند';
  return 'مسئول';
};
