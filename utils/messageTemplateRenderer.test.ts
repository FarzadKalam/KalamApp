import { describe, expect, it } from 'vitest';
import { formatTemplateValueByField, renderTemplateText } from './messageTemplateRenderer';
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

describe('messageTemplateRenderer option values', () => {
  it('renders attendance log_type as the Persian option label', () => {
    const text = renderTemplateText(
      'نوع تردد: {{log_type}}',
      { log_type: 'check_out' },
      { moduleId: 'attendance_logs' }
    );

    expect(text).toBe('نوع تردد: خروج');
  });

  it('renders task priority as the Persian option label', () => {
    const text = renderTemplateText(
      'اولویت: {{priority}}',
      { priority: 'medium' },
      { moduleId: 'tasks' }
    );

    expect(text).toBe('اولویت: متوسط');
  });

  it('renders task aliases in activity reminders as Persian option labels', () => {
    const text = renderTemplateText(
      'اولویت: {{task_priority}} - وضعیت: {{task_status}}',
      { task_priority: 'medium', task_status: 'done' }
    );

    expect(text).toBe('اولویت: متوسط - وضعیت: تکمیل شده');
  });

  it('renders dynamic option values from runtime option maps', () => {
    const text = renderTemplateText(
      'نوع فعالیت: {{task_type}}',
      { task_type: 'outbound_call' },
      {
        optionLabelMaps: {
          task_type: [{ label: 'تماس خروجی', value: 'outbound_call' }],
        },
      }
    );

    expect(text).toBe('نوع فعالیت: تماس خروجی');
  });

  it('renders multi-select values as option labels', () => {
    const text = formatTemplateValueByField({
      moduleId: 'process_templates',
      fieldKey: 'module_ids',
      value: ['customers', 'attendance_logs'],
    });

    expect(text).toBe('مشتریان, تردد');
  });
});
