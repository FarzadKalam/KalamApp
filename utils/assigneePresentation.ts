import { getResolvedAssigneeId, normalizeAssigneeType } from './assigneeValue';

type AssigneeUser = {
  id?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
  mobile_1?: string | null;
  avatar_url?: string | null;
};

type AssigneeRole = {
  id?: string | null;
  title?: string | null;
  name?: string | null;
};

export type AssigneePresentation = {
  kind: 'empty' | 'user' | 'role' | 'unknown';
  assigneeId: string | null;
  assigneeType: 'user' | 'role';
  label: string | null;
  avatarUrl: string | null;
  user: AssigneeUser | null;
  role: AssigneeRole | null;
};

const getUserDisplayLabel = (user: AssigneeUser | null | undefined): string => {
  if (!user) return '';
  return String(
    user.display_name ||
    user.full_name ||
    user.email ||
    user.mobile_1 ||
    ''
  ).trim();
};

const getRoleDisplayLabel = (role: AssigneeRole | null | undefined): string => {
  if (!role) return '';
  return String(role.title || role.name || '').trim();
};

const getSourceAssigneeLabel = (source: any, assigneeType: 'user' | 'role'): string => {
  if (!source || typeof source !== 'object') return '';
  const candidates = assigneeType === 'role'
    ? [
        source.assignee_role_title,
        source.assignee_role_name,
        source.role_title,
        source.role_name,
        source.responsible_role_title,
        source.responsible_role_name,
        source.assignee_label,
        source.responsible_label,
      ]
    : [
        source.assignee_name,
        source.assignee_full_name,
        source.assignee_display_name,
        source.responsible_name,
        source.responsible_full_name,
        source.owner_name,
        source.created_by_name,
        source.assignee_label,
        source.responsible_label,
      ];

  return candidates
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
};

const getAnySourceAssigneeLabel = (source: any): string => (
  getSourceAssigneeLabel(source, 'user') || getSourceAssigneeLabel(source, 'role')
);

export const resolveAssigneePresentation = ({
  source,
  allUsers = [],
  allRoles = [],
  explicitLabel,
}: {
  source: any;
  allUsers?: AssigneeUser[];
  allRoles?: AssigneeRole[];
  explicitLabel?: string | null;
}): AssigneePresentation => {
  const assigneeId = getResolvedAssigneeId(source);
  const assigneeType = normalizeAssigneeType(source?.assignee_type || (source?.assignee_role_id ? 'role' : 'user'));
  const normalizedExplicitLabel = String(explicitLabel || '').trim() || null;

  if (!assigneeId) {
    const fallbackLabel = getAnySourceAssigneeLabel(source);
    return {
      kind: normalizedExplicitLabel || fallbackLabel ? 'user' : 'empty',
      assigneeId: null,
      assigneeType,
      label: normalizedExplicitLabel || fallbackLabel || null,
      avatarUrl: null,
      user: null,
      role: null,
    };
  }

  if (assigneeType === 'role') {
    const role = allRoles.find((item) => String(item?.id || '').trim() === assigneeId) || null;
    const fallbackLabel = getSourceAssigneeLabel(source, 'role');
    return {
      kind: role || normalizedExplicitLabel || fallbackLabel ? 'role' : 'unknown',
      assigneeId,
      assigneeType,
      label: normalizedExplicitLabel || getRoleDisplayLabel(role) || fallbackLabel || null,
      avatarUrl: null,
      user: null,
      role,
    };
  }

  const user = allUsers.find((item) => String(item?.id || '').trim() === assigneeId) || null;
  const fallbackLabel = getSourceAssigneeLabel(source, 'user');
  return {
    kind: user || normalizedExplicitLabel || fallbackLabel ? 'user' : 'unknown',
    assigneeId,
    assigneeType,
    label: normalizedExplicitLabel || getUserDisplayLabel(user) || fallbackLabel || null,
    avatarUrl: String(user?.avatar_url || '').trim() || null,
    user,
    role: null,
  };
};
