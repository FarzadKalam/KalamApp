import { describe, expect, it } from 'vitest';
import { customerModule } from '../modules/customerConfig';
import { cashBankOperationsConfig } from '../modules/cashBankOperationsConfig';
import { FieldNature, FieldType, type ModuleDefinition } from '../types';
import { buildModuleListOptionPlan, getModuleListSelectableFields, getModuleListVisibleFields } from './moduleListOptions';

describe('buildModuleListOptionPlan', () => {
  it('keeps initial list preload limited to visible list fields', () => {
    const plan = buildModuleListOptionPlan(customerModule);

    expect(plan.immediateDynamicCategories).toEqual(['customer_industry', 'customer_interests']);
    expect(plan.immediateRelationFields.map((field) => field.key)).toEqual(['persona_id', 'tags']);
    expect(plan.allRelationFields.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        'related_employee_id',
        'referrer_customer_id',
        'referrer_employee_id',
        'referrer_supplier_id',
        'process_template_id',
      ])
    );
  });

  it('includes custom visible relation fields in the eager preload plan', () => {
    const plan = buildModuleListOptionPlan(customerModule, ['full_name', 'industry', 'referrer_customer_id']);

    expect(plan.immediateDynamicCategories).toEqual(['customer_industry']);
    expect(plan.immediateRelationFields.map((field) => field.key)).toEqual(['referrer_customer_id']);
  });

  it('keeps cash bank operational columns visible when a saved view is too narrow', () => {
    const fields = getModuleListVisibleFields(cashBankOperationsConfig, ['image_url', 'assignee_id'])
      .map((field) => field.key);

    expect(fields).toEqual(
      expect.arrayContaining([
        'image_url',
        'operation_type',
        'status',
        'operation_date',
        'amount',
        'payment_type',
        'receipt_account_id',
        'payment_account_id',
        'assignee_id',
      ])
    );
  });

  it('marks cash bank account and source relation fields as table columns', () => {
    const tableFieldKeys = cashBankOperationsConfig.fields
      .filter((field) => field.isTableColumn)
      .map((field) => field.key);

    expect(tableFieldKeys).toEqual(
      expect.arrayContaining([
        'receipt_account_id',
        'payment_account_id',
        'sales_invoice_id',
        'purchase_invoice_id',
        'expense_document_id',
        'employee_advance_id',
        'payroll_slip_id',
        'customer_id',
        'supplier_id',
        'cheque_id',
        'barter_id',
      ])
    );
  });

  it('keeps web-form template storage fields out of list UI options', () => {
    const moduleConfig: ModuleDefinition = {
      id: 'marketing_leads',
      table: 'marketing_leads',
      titles: { fa: 'Marketing Leads' },
      fields: [
        { key: 'name', type: FieldType.TEXT, labels: { fa: 'Name' }, isTableColumn: true },
        { key: 'template_field_values', type: FieldType.JSON, labels: { fa: 'Template Values' }, isTableColumn: true, nature: FieldNature.SYSTEM },
        { key: 'template_schema_snapshot', type: FieldType.JSON, labels: { fa: 'Template Snapshot' }, isTableColumn: true, nature: FieldNature.SYSTEM },
      ],
      blocks: [],
    };

    const selectableKeys = getModuleListSelectableFields(moduleConfig).map((field) => field.key);

    expect(selectableKeys).toContain('name');
    expect(selectableKeys).not.toContain('template_field_values');
    expect(selectableKeys).not.toContain('template_schema_snapshot');
    expect(getModuleListVisibleFields(moduleConfig, ['template_field_values', 'template_schema_snapshot', 'name']).map((field) => field.key)).toEqual(['name']);
  });
});
