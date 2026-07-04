import { describe, expect, it } from 'vitest';
import { resolveProcessAssigneeReference } from './processAssigneeReference';

describe('process assignee references', () => {
  it('resolves linked field references from the template context', () => {
    const context = {
      __linked__customers__assignee_combo: 'role_11111111-1111-4111-8111-111111111111',
      assignee_combo: 'user_22222222-2222-4222-8222-222222222222',
    };

    expect(resolveProcessAssigneeReference('field:__linked__customers__assignee_combo', context))
      .toBe('role_11111111-1111-4111-8111-111111111111');
  });

  it('falls back to the target field key for linked references', () => {
    const context = {
      assignee_combo: 'user_22222222-2222-4222-8222-222222222222',
    };

    expect(resolveProcessAssigneeReference('field:__linked__customers__assignee_combo', context))
      .toBe('user_22222222-2222-4222-8222-222222222222');
  });

  it('resolves linked assignee id references through the synthetic workflow assignee value', () => {
    const context = {
      __linked__customers____workflow_assignee: 'role_11111111-1111-4111-8111-111111111111',
      __linked__customers__assignee_id: '',
    };

    expect(resolveProcessAssigneeReference('field:__linked__customers__assignee_id', context))
      .toBe('role_11111111-1111-4111-8111-111111111111');
  });

  it('accepts raw linked assignee field keys for older saved stages', () => {
    const context = {
      __linked__customers____workflow_assignee: 'user_22222222-2222-4222-8222-222222222222',
    };

    expect(resolveProcessAssigneeReference('__linked__customers____workflow_assignee', context))
      .toBe('user_22222222-2222-4222-8222-222222222222');
  });
});
