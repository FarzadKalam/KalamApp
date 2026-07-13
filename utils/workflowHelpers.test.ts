import { describe, expect, it } from 'vitest';
import {
  getProcessAutomationConditionFieldsForModules,
  getProcessTemplateIdentityFields,
  getWorkflowConditionFields,
} from './workflowHelpers';

describe('workflowHelpers', () => {
  it('labels assignee profile fields by their own user-profile field names', () => {
    const fields = getWorkflowConditionFields('purchase_invoices');
    const profileFields = fields.filter((field) =>
      String(field?.key || '').startsWith('__workflow_related__assignee_id::profiles::')
    );

    expect(profileFields.length).toBeGreaterThan(2);
    expect(profileFields.map((field) => field.labels?.fa)).toContain('مسئول: نام و نام خانوادگی');
    expect(profileFields.map((field) => field.labels?.fa)).toContain('مسئول: شماره موبایل');
    expect(
      profileFields.filter((field) => field.labels?.fa === 'مسئول (فاکتورهای خرید)')
    ).toHaveLength(0);
  });

  it('keeps process-linked assignee profile labels scoped to the source module', () => {
    const fields = getProcessAutomationConditionFieldsForModules(['purchase_invoices']);
    const fullNameField = fields.find((field) =>
      String(field?.key || '').includes('__workflow_related__assignee_id::profiles::full_name')
    );

    expect(fullNameField?.labels?.fa).toBe('مسئول: نام و نام خانوادگی (فاکتورهای خرید)');
  });

  it('uses marketer wording for invoice assignee profile fields', () => {
    const fields = getWorkflowConditionFields('invoices');
    const fullNameField = fields.find((field) =>
      String(field?.key || '') === '__workflow_related__assignee_id::profiles::full_name'
    );

    expect(fullNameField?.labels?.fa).toBe('بازاریاب: نام و نام خانوادگی');
  });

  it('exposes stable process and lane identity variables for process templates', () => {
    expect(getProcessTemplateIdentityFields()).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'process_name', labels: expect.objectContaining({ fa: 'نام فرآیند' }) }),
      expect.objectContaining({ key: 'process_lane_name', labels: expect.objectContaining({ fa: 'نام ردیف' }) }),
    ]));
  });
});
