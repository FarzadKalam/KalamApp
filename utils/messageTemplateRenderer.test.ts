import { describe, expect, it } from 'vitest';
import { renderTemplateText } from './messageTemplateRenderer';
import { WORKFLOW_ASSIGNEE_FIELD_KEY } from './workflowTypes';

const directory = {
  users: [
    { id: '11111111-1111-1111-1111-111111111111', display_name: 'علی رضایی' },
  ],
  roles: [
    { id: '22222222-2222-2222-2222-222222222222', title: 'مدیر فروش' },
  ],
};

describe('messageTemplateRenderer assignee values', () => {
  it('renders assignee_id as the user display name', () => {
    const text = renderTemplateText(
      'مسئول: {{assignee_id}}',
      { assignee_id: '11111111-1111-1111-1111-111111111111', assignee_type: 'user' },
      { assigneeDirectory: directory }
    );

    expect(text).toBe('مسئول: علی رضایی');
  });

  it('renders role assignee records from assignee_id templates', () => {
    const text = renderTemplateText(
      'مسئول: {{assignee_id}}',
      {
        assignee_id: null,
        assignee_role_id: '22222222-2222-2222-2222-222222222222',
        assignee_type: 'role',
      },
      { assigneeDirectory: directory }
    );

    expect(text).toBe('مسئول: مدیر فروش');
  });

  it('renders synthetic workflow assignee combos as labels', () => {
    const text = renderTemplateText(
      `مسئول: {{${WORKFLOW_ASSIGNEE_FIELD_KEY}}}`,
      { [WORKFLOW_ASSIGNEE_FIELD_KEY]: 'role_22222222-2222-2222-2222-222222222222' },
      { assigneeDirectory: directory }
    );

    expect(text).toBe('مسئول: مدیر فروش');
  });
});
