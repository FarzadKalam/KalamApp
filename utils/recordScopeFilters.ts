import type { CrudFilter, CrudFilters } from '@refinedev/core';
import type { RecordScope } from './permissions';

type RecordScopeFilterContext = {
  recordScope: RecordScope;
  currentUserId?: string | null;
  currentUserRoleId?: string | null;
  allowedUserIds?: Iterable<string> | null;
  allowedRoleIds?: Iterable<string> | null;
  supportsAssignee: boolean;
};

const normalizeIds = (values?: Iterable<string> | null) =>
  Array.from(new Set(Array.from(values || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)));

const buildAssigneeFilter = (
  field: 'assignee_id' | 'assignee_role_id',
  ids: string[],
): CrudFilter | null => {
  if (ids.length === 0) return null;
  return {
    field,
    operator: ids.length === 1 ? 'eq' : 'in',
    value: ids.length === 1 ? ids[0] : ids,
  } as CrudFilter;
};

/**
 * معادل server-sideِ محدودهٔ دسترسی رکورد است. این فیلتر باید پیش از
 * pagination اعمال شود تا حذف client-side باعث صفحه‌های ناقص نشود.
 */
export const buildRecordScopeCrudFilters = ({
  recordScope,
  currentUserId,
  currentUserRoleId,
  allowedUserIds,
  allowedRoleIds,
  supportsAssignee,
}: RecordScopeFilterContext): CrudFilters => {
  if (recordScope === 'all') return [];
  if (!supportsAssignee) {
    // هیچ رکورد بدون مدل ارجاع نباید برای نقش‌های محدود از سرور بازگردد.
    return [{ field: 'id', operator: 'null', value: null } as CrudFilter];
  }

  const userIds = recordScope === 'subtree'
    ? normalizeIds([...(allowedUserIds || []), currentUserId || ''])
    : normalizeIds([currentUserId || '']);
  const roleIds = recordScope === 'subtree'
    ? normalizeIds([...(allowedRoleIds || []), currentUserRoleId || ''])
    : recordScope === 'team'
      ? normalizeIds([currentUserRoleId || ''])
      : [];

  const alternatives = [
    buildAssigneeFilter('assignee_id', userIds),
    buildAssigneeFilter('assignee_role_id', roleIds),
  ].filter(Boolean) as CrudFilter[];

  if (alternatives.length === 0) {
    return [{ field: 'id', operator: 'null', value: null } as CrudFilter];
  }
  if (alternatives.length === 1) return alternatives;
  return [{ operator: 'or', value: alternatives } as CrudFilter];
};
