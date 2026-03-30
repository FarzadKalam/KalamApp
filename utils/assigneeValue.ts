export const normalizeAssigneeType = (value: unknown): 'user' | 'role' =>
  String(value || '').trim().toLowerCase() === 'role' ? 'role' : 'user';

export const getResolvedAssigneeId = (source: any): string | null => {
  if (!source || typeof source !== 'object') return null;
  const normalizedType = String(source?.assignee_type || '').trim().toLowerCase();
  const prefersRoleAssignee = normalizedType === 'role' || (!normalizedType && source?.assignee_role_id);
  const rawValue = prefersRoleAssignee
    ? (source?.assignee_role_id ?? source?.assignee_id)
    : source?.assignee_id;
  const value = String(rawValue || '').trim();
  return value || null;
};

export const buildResolvedAssigneeCombo = (source: any): string | null => {
  const assigneeId = getResolvedAssigneeId(source);
  if (!assigneeId) return null;
  const assigneeType = source?.assignee_role_id && !source?.assignee_type
    ? 'role'
    : normalizeAssigneeType(source?.assignee_type);
  return `${assigneeType}_${assigneeId}`;
};
