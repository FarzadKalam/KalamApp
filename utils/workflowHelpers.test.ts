import { describe, expect, it } from 'vitest';
import {
  getProcessAutomationConditionFieldsForModules,
  getProcessTemplateIdentityFields,
  getWorkflowConditionFields,
} from './workflowHelpers';
import { createProcessLinkedFieldKey } from './processTargets';
import {
  createWorkflowRelatedFieldKey,
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  WORKFLOW_RECORD_LINK_FIELD_KEY,
} from './workflowTypes';

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

  it('exposes record links for the current record and every listed relation scope', () => {
    const fields = getWorkflowConditionFields('invoices');

    expect(fields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: WORKFLOW_RECORD_LINK_FIELD_KEY,
        labels: expect.objectContaining({ fa: 'لینک رکورد' }),
      }),
      expect.objectContaining({
        key: createWorkflowRelatedFieldKey('customer_id', 'customers', WORKFLOW_RECORD_LINK_FIELD_KEY),
        labels: expect.objectContaining({ fa: 'نام مشتری (لینک رکورد)' }),
      }),
    ]));
  });

  it('uses the source relation label and exposes every common system field once', () => {
    const fields = getWorkflowConditionFields('invoices');
    const customerMobile = fields.find((field) =>
      String(field.key) === createWorkflowRelatedFieldKey('customer_id', 'customers', 'mobile_1')
    );

    expect(customerMobile?.labels?.fa).toBe('نام مشتری (موبایل اصلی)');
    ['created_at', 'created_by', 'updated_at', 'updated_by'].forEach((key) => {
      expect(fields.filter((field) => field.key === key)).toHaveLength(1);
    });
    expect(fields.some((field) => field.key === 'id' || field.key === 'org_id')).toBe(false);
  });

  it('exposes the main record assignee once through the unified assignee field', () => {
    const fields = getWorkflowConditionFields('customers');

    expect(fields.filter((field) => String(field.key) === 'assignee_id')).toHaveLength(0);
    expect(fields.filter((field) => String(field.key) === WORKFLOW_ASSIGNEE_FIELD_KEY)).toHaveLength(1);
  });

  it('exposes a scoped record link for every process automation target module', () => {
    const fields = getProcessAutomationConditionFieldsForModules(['marketing_leads']);

    expect(fields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: createProcessLinkedFieldKey('marketing_leads', WORKFLOW_RECORD_LINK_FIELD_KEY),
        labels: expect.objectContaining({ fa: 'لینک رکورد (لیدهای بازاریابی)' }),
      }),
    ]));
  });

  it('keeps creator, last editor, and timestamps available for every automation target', () => {
    const fields = getProcessAutomationConditionFieldsForModules(['marketing_leads']);
    expect(fields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: createProcessLinkedFieldKey('marketing_leads', 'created_by'),
        labels: expect.objectContaining({ fa: 'ایجادکننده (لیدهای بازاریابی)' }),
      }),
      expect.objectContaining({
        key: createProcessLinkedFieldKey('marketing_leads', 'updated_by'),
        labels: expect.objectContaining({ fa: 'آخرین ویرایشگر (لیدهای بازاریابی)' }),
      }),
      expect.objectContaining({
        key: createProcessLinkedFieldKey('marketing_leads', 'created_at'),
        labels: expect.objectContaining({ fa: 'زمان ایجاد (لیدهای بازاریابی)' }),
      }),
      expect.objectContaining({
        key: createProcessLinkedFieldKey('marketing_leads', 'updated_at'),
        labels: expect.objectContaining({ fa: 'زمان ویرایش (لیدهای بازاریابی)' }),
      }),
    ]));
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
      expect.objectContaining({ key: 'current_date_numeric', labels: expect.objectContaining({ fa: 'تاریخ امروز (عددی)' }) }),
      expect.objectContaining({ key: 'current_week', labels: expect.objectContaining({ fa: 'هفته جاری' }) }),
    ]));
  });
});
