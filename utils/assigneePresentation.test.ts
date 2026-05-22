import { describe, expect, it } from 'vitest';
import { resolveAssigneePresentation } from './assigneePresentation';

describe('resolveAssigneePresentation', () => {
  it('resolves user assignee avatar and display label from directory', () => {
    const result = resolveAssigneePresentation({
      source: { assignee_id: 'user-1', assignee_type: 'user' },
      allUsers: [
        { id: 'user-1', full_name: 'علی رضایی', avatar_url: 'https://example.com/avatar.jpg' },
      ],
      allRoles: [],
    });

    expect(result.kind).toBe('user');
    expect(result.label).toBe('علی رضایی');
    expect(result.avatarUrl).toBe('https://example.com/avatar.jpg');
  });

  it('resolves role assignee with assignee_role_id fallback', () => {
    const result = resolveAssigneePresentation({
      source: { assignee_id: null, assignee_role_id: 'role-1', assignee_type: 'role' },
      allUsers: [],
      allRoles: [
        { id: 'role-1', title: 'تیم فروش' },
      ],
    });

    expect(result.kind).toBe('role');
    expect(result.label).toBe('تیم فروش');
    expect(result.avatarUrl).toBeNull();
  });

  it('uses explicit label when directory entry is not loaded yet', () => {
    const result = resolveAssigneePresentation({
      source: { assignee_id: 'user-2', assignee_type: 'user' },
      explicitLabel: 'مسئول انتخاب‌شده',
      allUsers: [],
      allRoles: [],
    });

    expect(result.kind).toBe('user');
    expect(result.label).toBe('مسئول انتخاب‌شده');
  });
});
