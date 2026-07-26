import { describe, expect, it } from 'vitest';
import { buildRecordScopeCrudFilters } from './recordScopeFilters';

describe('record scope CRUD filters', () => {
  it('filters an own scope to the current user before pagination', () => {
    expect(buildRecordScopeCrudFilters({
      recordScope: 'own',
      currentUserId: 'user-1',
      supportsAssignee: true,
    })).toEqual([{
      field: 'assignee_id',
      operator: 'eq',
      value: 'user-1',
    }]);
  });

  it('filters a subtree scope to its permitted users and roles', () => {
    expect(buildRecordScopeCrudFilters({
      recordScope: 'subtree',
      currentUserId: 'user-1',
      currentUserRoleId: 'role-1',
      allowedUserIds: ['user-2'],
      allowedRoleIds: ['role-2'],
      supportsAssignee: true,
    })).toEqual([{
      operator: 'or',
      value: [
        {
          field: 'assignee_id',
          operator: 'in',
          value: ['user-2', 'user-1'],
        },
        {
          field: 'assignee_role_id',
          operator: 'in',
          value: ['role-2', 'role-1'],
        },
      ],
    }]);
  });

  it('returns no rows for a restricted module without assignment support', () => {
    expect(buildRecordScopeCrudFilters({ recordScope: 'team', supportsAssignee: false }))
      .toEqual([{ field: 'id', operator: 'null', value: null }]);
  });
});
