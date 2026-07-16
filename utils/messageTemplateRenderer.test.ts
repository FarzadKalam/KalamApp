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

  it('renders leave request leave_type as the Persian option label', () => {
    const text = renderTemplateText(
      'نوع مرخصی: {{leave_type}}',
      { leave_type: 'daily' },
      { moduleId: 'leave_requests' }
    );

    expect(text).toBe('نوع مرخصی: روزانه');
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

  it('does not expose an unresolved technical option code', () => {
    const text = renderTemplateText(
      'اولویت: {{priority}}',
      { priority: 'unknown_internal_code' },
      { moduleId: 'tasks' }
    );
    expect(text).toBe('اولویت: مقدار ثبت‌شده');
    expect(text).not.toContain('unknown_internal_code');
  });

  it('renders relation uid values from runtime option maps', () => {
    const text = renderTemplateText(
      'برند اکران: {{opening_brand_id}}',
      { opening_brand_id: '33333333-3333-4333-8333-333333333333' },
      {
        moduleId: 'billboards',
        optionLabelMaps: {
          'field:billboards:opening_brand_id': [
            { label: 'برند نمونه', value: '33333333-3333-4333-8333-333333333333' },
          ],
        },
      }
    );

    expect(text).toBe('برند اکران: برند نمونه');
  });

  it('never exposes an unresolved UUID as a template value', () => {
    const text = renderTemplateText(
      'برند اکران: {{opening_brand_id}}',
      { opening_brand_id: '33333333-3333-4333-8333-333333333333' },
      { moduleId: 'billboards' }
    );

    expect(text).toBe('برند اکران: [رکورد مرتبط]');
    expect(text).not.toContain('33333333-3333-4333-8333-333333333333');
  });

  it('renders multi-select values as option labels', () => {
    const text = formatTemplateValueByField({
      moduleId: 'process_templates',
      fieldKey: 'module_ids',
      value: ['customers', 'attendance_logs'],
    });

    expect(text).toBe('مشتریان, تردد');
  });

  it('renders multi-relation values as related record labels', () => {
    const text = formatTemplateValueByField({
      moduleId: 'tasks',
      fieldKey: 'meeting_employee_ids',
      value: [
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
      ],
      optionLabelMaps: {
        'field:tasks:meeting_employee_ids': [
          { label: 'علی رضایی', value: '33333333-3333-4333-8333-333333333333' },
          { label: 'نگار محمدی', value: '44444444-4444-4444-8444-444444444444' },
        ],
      },
    });

    expect(text).toBe('علی رضایی, نگار محمدی');
  });

  it('prepends the site origin to the online invoice link', () => {
    const text = renderTemplateText(
      'لینک فاکتور: {{public_link}}',
      { public_link: '/i/2cdc74346be8394ea3a6a2bcd73589341afdcf1e68e57993' },
      { moduleId: 'invoices' }
    );

    expect(text).toBe(`لینک فاکتور: ${window.location.origin}/i/2cdc74346be8394ea3a6a2bcd73589341afdcf1e68e57993`);
  });

  it('normalizes an online invoice link stored without a leading slash', () => {
    const text = renderTemplateText(
      'لینک فاکتور: {{public_link}}',
      { public_link: 'i/NPVShoPtwW' },
      { moduleId: 'invoices' }
    );

    expect(text).toBe(`لینک فاکتور: ${window.location.origin}/i/NPVShoPtwW`);
  });

  it('prepends the site origin to the online delivery link', () => {
    const text = renderTemplateText(
      'لینک تحویل: {{public_link}}',
      { public_link: '/d/AbC2345678' },
      { moduleId: 'delivery_forms' }
    );

    expect(text).toBe(`لینک تحویل: ${window.location.origin}/d/AbC2345678`);
  });

  it('normalizes an online delivery link stored without a leading slash', () => {
    const text = renderTemplateText(
      'لینک تحویل: {{public_link}}',
      { public_link: 'd/AbC2345678' },
      { moduleId: 'delivery_forms' }
    );

    expect(text).toBe(`لینک تحویل: ${window.location.origin}/d/AbC2345678`);
  });
});
