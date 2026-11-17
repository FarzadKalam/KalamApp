export const usesSingleEmployeeField = (moduleId?: string | null) =>
  moduleId === 'leave_requests' || moduleId === 'attendance_logs';

const duplicateEmployeeFields = new Set([
  'assignee_id', 'assignee_role_id', 'assignee_type', 'assignee_combo',
  'employee_name', 'requester_name', 'related_profile_id',
]);

export const isDuplicateHrEmployeeField = (moduleId: string | null | undefined, key: string) =>
  usesSingleEmployeeField(moduleId) && duplicateEmployeeFields.has(key);
