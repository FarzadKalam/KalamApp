import { describe, expect, it } from 'vitest';
import { resolvePrintAssigneeComboLabel, resolvePrintAssigneeLabel } from './assigneeDisplay';

describe('print assignee display', () => {
  it('resolves role combo values to a readable label', () => {
    const roleId = '22222222-2222-2222-2222-222222222222';

    expect(
      resolvePrintAssigneeComboLabel(`role_${roleId}`, {
        org_roles: [{ value: roleId, label: 'تیم فروش' }],
      }),
    ).toBe('تیم فروش');
  });

  it('resolves canonical colon tokens used by reports and charts', () => {
    const userId = '33333333-3333-4333-8333-333333333333';
    const roleId = '44444444-4444-4444-8444-444444444444';

    expect(resolvePrintAssigneeComboLabel(`user:${userId}`, {
      __workflow_assignee: [{ value: `user:${userId}`, label: 'کاربر گزارش' }],
    })).toBe('کاربر گزارش');
    expect(resolvePrintAssigneeComboLabel(`role:${roleId}`, {
      __workflow_assignee: [{ value: `role:${roleId}`, label: 'نقش گزارش' }],
    })).toBe('نقش گزارش');
  });

  it('uses a deleted user label for typed assignee values without a readable option', () => {
    const userId = '11111111-1111-1111-1111-111111111111';

    expect(resolvePrintAssigneeComboLabel(`user_${userId}`, {})).toBe('کاربر حذف شده');
    expect(
      resolvePrintAssigneeLabel({
        assignee_id: userId,
        assignee_type: 'user',
      }, {}),
    ).toBe('کاربر حذف شده');
  });

  it('does not fall back to raw UUID when no assignee type is available', () => {
    const userId = '11111111-1111-1111-1111-111111111111';

    expect(resolvePrintAssigneeComboLabel(userId, {})).toBe('');
  });
});
