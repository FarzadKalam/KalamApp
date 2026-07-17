export const normalizeAssigneeType = (value: unknown): 'user' | 'role' =>
  String(value || '').trim().toLowerCase() === 'role' ? 'role' : 'user';

export type NormalizedAssigneeValue = {
  assigneeType: 'user' | 'role' | null;
  assigneeId: string | null;
};

const ASSIGNEE_PREFIX_REGEX = /^(user|role)[:_](.+)$/i;

export const parseAssigneeValue = (
  value: unknown,
  fallbackType: 'user' | 'role' | null = null
): NormalizedAssigneeValue => {
  const raw = String(value || '').trim();
  if (!raw) return { assigneeType: null, assigneeId: null };

  const prefixed = raw.match(ASSIGNEE_PREFIX_REGEX);
  if (prefixed) {
    const assigneeType = String(prefixed[1] || '').toLowerCase() === 'role' ? 'role' : 'user';
    const assigneeId = String(prefixed[2] || '').trim() || null;
    const nested = assigneeId?.match(ASSIGNEE_PREFIX_REGEX);
    if (nested) return parseAssigneeValue(assigneeId, assigneeType);
    return { assigneeType, assigneeId };
  }

  return {
    assigneeType: fallbackType || 'user',
    assigneeId: raw,
  };
};

export const buildAssigneeSelectValue = (
  value: unknown,
  fallbackType: 'user' | 'role' | null = null
) => {
  const parsed = parseAssigneeValue(value, fallbackType);
  return parsed.assigneeType && parsed.assigneeId
    ? `${parsed.assigneeType}:${parsed.assigneeId}`
    : undefined;
};

export const getResolvedAssigneeId = (source: any): string | null => {
  if (!source || typeof source !== 'object') return null;
  const normalizedType = String(source?.assignee_type || '').trim().toLowerCase();
  const prefersRoleAssignee = normalizedType === 'role' || (!normalizedType && source?.assignee_role_id);
  const rawValue = prefersRoleAssignee
    ? (source?.assignee_role_id ?? source?.assignee_id)
    : source?.assignee_id;
  return parseAssigneeValue(rawValue, prefersRoleAssignee ? 'role' : 'user').assigneeId;
};

export const buildResolvedAssigneeCombo = (source: any): string | null => {
  const assigneeId = getResolvedAssigneeId(source);
  if (!assigneeId) return null;
  const assigneeType = source?.assignee_role_id && !source?.assignee_type
    ? 'role'
    : normalizeAssigneeType(source?.assignee_type);
  const normalized = parseAssigneeValue(assigneeId, assigneeType);
  return normalized.assigneeType && normalized.assigneeId
    ? `${normalized.assigneeType}:${normalized.assigneeId}`
    : null;
};

export type AssigneeDirectoryLike = {
  users?: Array<{ id?: unknown }>;
  roles?: Array<{ id?: unknown }>;
};

export const stripTaskAssignee = <T extends Record<string, any>>(row: T): T => ({
  ...row,
  assignee_id: null,
  assignee_role_id: null,
  assignee_type: null,
});

export const normalizeTaskAssigneeForDirectory = <T extends Record<string, any>>(
  row: T,
  directory: AssigneeDirectoryLike = {}
): T => {
  const hasUserDirectory = Array.isArray(directory.users);
  const hasRoleDirectory = Array.isArray(directory.roles);
  const validUserIds = new Set((directory.users || []).map((user) => String(user?.id || '').trim()).filter(Boolean));
  const validRoleIds = new Set((directory.roles || []).map((role) => String(role?.id || '').trim()).filter(Boolean));
  const rawType = String(row?.assignee_type || '').trim().toLowerCase();
  const roleCandidate = parseAssigneeValue(row?.assignee_role_id || (rawType === 'role' ? row?.assignee_id : null), 'role');
  const userCandidate = parseAssigneeValue(row?.assignee_id || (rawType === 'user' ? row?.assignee_role_id : null), 'user');

  if (roleCandidate.assigneeType === 'role' && roleCandidate.assigneeId) {
    if (hasRoleDirectory && !validRoleIds.has(roleCandidate.assigneeId)) {
      return stripTaskAssignee(row);
    }
    return {
      ...row,
      assignee_id: null,
      assignee_role_id: roleCandidate.assigneeId,
      assignee_type: 'role',
    };
  }

  if (userCandidate.assigneeType === 'user' && userCandidate.assigneeId) {
    if (hasUserDirectory && !validUserIds.has(userCandidate.assigneeId)) {
      return stripTaskAssignee(row);
    }
    return {
      ...row,
      assignee_id: userCandidate.assigneeId,
      assignee_role_id: null,
      assignee_type: 'user',
    };
  }

  if (rawType === 'role' || rawType === 'user' || row?.assignee_id || row?.assignee_role_id) {
    return stripTaskAssignee(row);
  }
  return row;
};

export const normalizeTaskAssigneeRowsForDirectory = <T extends Record<string, any>>(
  rows: T[],
  directory: AssigneeDirectoryLike = {}
): T[] => (Array.isArray(rows) ? rows : []).map((row) => normalizeTaskAssigneeForDirectory(row, directory));

export const isAssigneeOrgBoundaryError = (error: any) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || '').trim().toLowerCase();
  if (code !== '42501' && !text.includes('row-level security') && !text.includes('permission denied')) {
    return false;
  }
  return text.includes('متعلق به سازمان جاری نیست')
    || text.includes('مسئول انتخاب‌شده')
    || text.includes('نقش انتخاب‌شده')
    || text.includes('کاربر انتخاب‌شده')
    || text.includes('assignee');
};
