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

  it('does not fall back to raw UUID when no readable assignee label exists', () => {
    const userId = '11111111-1111-1111-1111-111111111111';

    expect(
      resolvePrintAssigneeLabel({
        assignee_id: userId,
        assignee_type: 'user',
      }, {}),
    ).toBe('');
  });
});
