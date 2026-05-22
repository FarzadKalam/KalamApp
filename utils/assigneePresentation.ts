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
    return {
      kind: 'empty',
      assigneeId: null,
      assigneeType,
      label: normalizedExplicitLabel,
      avatarUrl: null,
      user: null,
      role: null,
    };
  }

  if (assigneeType === 'role') {
    const role = allRoles.find((item) => String(item?.id || '').trim() === assigneeId) || null;
    return {
      kind: role || normalizedExplicitLabel ? 'role' : 'unknown',
      assigneeId,
      assigneeType,
      label: normalizedExplicitLabel || getRoleDisplayLabel(role) || null,
      avatarUrl: null,
      user: null,
      role,
    };
  }

  const user = allUsers.find((item) => String(item?.id || '').trim() === assigneeId) || null;
  return {
    kind: user || normalizedExplicitLabel ? 'user' : 'unknown',
    assigneeId,
    assigneeType,
    label: normalizedExplicitLabel || getUserDisplayLabel(user) || null,
    avatarUrl: String(user?.avatar_url || '').trim() || null,
    user,
    role: null,
  };
};
