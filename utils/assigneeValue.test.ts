import { describe, expect, it } from 'vitest';
import {
  isAssigneeOrgBoundaryError,
  normalizeTaskAssigneeForDirectory,
  parseAssigneeValue,
} from './assigneeValue';

describe('assignee value helpers', () => {
  it('parses legacy prefixed assignee values', () => {
    expect(parseAssigneeValue('role:role:11111111-1111-4111-8111-111111111111')).toEqual({
      assigneeType: 'role',
      assigneeId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parseAssigneeValue('user_22222222-2222-4222-8222-222222222222')).toEqual({
      assigneeType: 'user',
      assigneeId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('normalizes task assignees against the current org directory', () => {
    const roleId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';

    expect(normalizeTaskAssigneeForDirectory(
      { assignee_id: `role:${roleId}`, assignee_type: 'role' },
      { users: [{ id: userId }], roles: [{ id: roleId }] }
    )).toMatchObject({
      assignee_id: null,
      assignee_role_id: roleId,
      assignee_type: 'role',
    });

    expect(normalizeTaskAssigneeForDirectory(
      { assignee_role_id: roleId, assignee_type: 'role' },
      { users: [{ id: userId }], roles: [] }
    )).toMatchObject({
      assignee_id: null,
      assignee_role_id: null,
      assignee_type: null,
    });
  });

  it('detects assignee org boundary errors only for assignee failures', () => {
    expect(isAssigneeOrgBoundaryError({
      code: '42501',
      message: 'نقش انتخاب‌شده متعلق به سازمان جاری نیست.',
    })).toBe(true);
    expect(isAssigneeOrgBoundaryError({
      code: '42501',
      message: 'دسترسی ایجاد اجرای فرآیند برای این سازمان وجود ندارد.',
    })).toBe(false);
  });
});
