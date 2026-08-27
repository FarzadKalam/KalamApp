import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customerModule } from '../modules/customerConfig';
import { cashBankOperationsConfig } from '../modules/cashBankOperationsConfig';
import { FieldNature, FieldType, type ModuleDefinition } from '../types';
import {
  buildModuleListOptionPlan,
  getModuleListSelectableFields,
  getModuleListVisibleFields,
  hydrateModuleListRelationOptionsForRows,
} from './moduleListOptions';
import { fetchRecordReferenceLabels } from './recordReference';

vi.mock('./recordReference', () => ({
  buildRecordReferenceKey: (moduleId?: string, recordId?: string) => `${String(moduleId || '').trim()}:${String(recordId || '').trim()}`,
  fetchRecordReferenceLabels: vi.fn(),
}));

describe('buildModuleListOptionPlan', () => {
  beforeEach(() => {
    vi.mocked(fetchRecordReferenceLabels).mockReset();
  });

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

  it('loads visible multi-relation fields through their own target config', () => {
    const config: ModuleDefinition = {
      id: 'sample_records',
      table: 'sample_records',
      titles: { fa: 'نمونه‌ها' },
      fields: [
        { key: 'name', type: FieldType.TEXT, labels: { fa: 'نام' }, isTableColumn: true },
        {
          key: 'reviewer_ids',
          type: FieldType.MULTI_RELATION,
          labels: { fa: 'بازبین‌ها' },
          isTableColumn: true,
          multiRelationConfig: { targetModule: 'profiles' },
        },
      ],
      blocks: [],
    };

    const plan = buildModuleListOptionPlan(config, ['name', 'reviewer_ids']);
    expect(plan.immediateRelationFields.map((field) => field.key)).toContain('reviewer_ids');
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

  it('keeps an inactive user named on historical rows without adding them to assignable users', async () => {
    vi.mocked(fetchRecordReferenceLabels).mockResolvedValue({
      'profiles:user-inactive': 'کاربر غیرفعال',
    });

    const options = await hydrateModuleListRelationOptionsForRows(
      {} as any,
      [{ key: 'created_by', type: FieldType.USER, labels: { fa: 'ایجادکننده' } }],
      [{ created_by: 'user-inactive' }],
      {
        users: [{ id: 'user-active', full_name: 'کاربر فعال' }],
        roles: [],
      },
    );

    expect(options.created_by).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'user-inactive', label: 'کاربر غیرفعال' }),
      expect.objectContaining({ value: 'user-active', label: 'کاربر فعال' }),
    ]));
    expect(options.profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'user-active', label: 'کاربر فعال' }),
      expect.objectContaining({ value: 'user-inactive', label: 'کاربر غیرفعال', inactiveHistorical: true }),
    ]));
  });

  it('keeps deleted relation titles as plain metadata with a Persian deletion marker', async () => {
    vi.mocked(fetchRecordReferenceLabels).mockResolvedValue({});
    const relationId = '44444444-4444-4444-8444-444444444444';
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: [{ module_id: 'customers', source_record_id: relationId, record_title: 'مشتری قدیمی' }],
            error: null,
          }),
        })),
      })),
    };

    const options = await hydrateModuleListRelationOptionsForRows(
      supabase as any,
      [{ key: 'customer_id', type: FieldType.RELATION, labels: { fa: 'مشتری' }, relationConfig: { targetModule: 'customers' } }],
      [{ customer_id: relationId }],
      null,
    );

    expect(options.customer_id).toEqual([
      expect.objectContaining({
        value: relationId,
        label: 'مشتری قدیمی (حذف شده)',
        deleted: true,
        linkable: false,
      }),
    ]);
  });

  it('uses a stored relation title as plain text when the target record is not viewable', async () => {
    vi.mocked(fetchRecordReferenceLabels).mockResolvedValue({});
    const relationId = '55555555-5555-4555-8555-555555555555';
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    };

    const options = await hydrateModuleListRelationOptionsForRows(
      supabase as any,
      [{ key: 'customer_id', type: FieldType.RELATION, labels: { fa: 'مشتری' }, relationConfig: { targetModule: 'customers' } }],
      [{ customer_id: relationId, customer_name: 'مشتری محدود' }],
      null,
    );

    expect(options.customer_id).toEqual([
      expect.objectContaining({
        label: 'مشتری محدود',
        inaccessible: true,
        linkable: false,
      }),
    ]);
  });

  it('does not hydrate legacy boolean or empty relation values', async () => {
    vi.mocked(fetchRecordReferenceLabels).mockResolvedValue({});
    const supabase = { from: vi.fn() };

    const options = await hydrateModuleListRelationOptionsForRows(
      supabase as any,
      [{ key: 'customer_id', type: FieldType.RELATION, labels: { fa: 'مشتری' }, relationConfig: { targetModule: 'customers' } }],
      [{ customer_id: true }, { customer_id: false }, { customer_id: null }, { customer_id: '' }],
      null,
    );

    expect(options.customer_id).toBeUndefined();
    expect(fetchRecordReferenceLabels).toHaveBeenCalledWith(supabase, []);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
