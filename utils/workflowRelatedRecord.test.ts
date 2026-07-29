import { describe, expect, it } from 'vitest';
import {
  PROCESS_RUN_LINK_FIELD_KEY,
  getCreateRelatedRecordRelationFieldOptions,
  getCreateRelatedRecordTargetModuleOptions,
} from './workflowRelatedRecord';

describe('workflowRelatedRecord', () => {
  it('keeps activities available as a target for related record creation', () => {
    const options = getCreateRelatedRecordTargetModuleOptions('customers', [
      { label: 'فعالیت ها', value: 'tasks' },
      { label: 'فاکتورها', value: 'invoices' },
      { label: 'مشتریان', value: 'customers' },
    ]);

    expect(options.map((option) => option.value)).toContain('tasks');
  });

  it('filters target modules by the selected source module relations', () => {
    const options = getCreateRelatedRecordTargetModuleOptions('customers', [
      { label: 'فاکتورهای فروش', value: 'invoices' },
      { label: 'فاکتورهای خرید', value: 'purchase_invoices' },
      { label: 'فعالیت ها', value: 'tasks' },
    ]);

    expect(options.map((option) => option.value)).toEqual(['invoices', 'tasks']);
  });

  it('returns the task source relation field for activities', () => {
    expect(getCreateRelatedRecordRelationFieldOptions('tasks', 'customers')).toEqual([
      { label: 'رکورد مرتبط', value: 'source_record_id' },
    ]);
  });

  it('returns matching relation fields for normal target modules', () => {
    expect(getCreateRelatedRecordRelationFieldOptions('invoices', 'customers')).toEqual([
      { label: 'نام مشتری', value: 'customer_id' },
    ]);
  });

  it('uses process target modules even when they have no direct relation to the selected source', () => {
    const options = getCreateRelatedRecordTargetModuleOptions(
      'projects',
      [
        { label: 'فاکتورها', value: 'invoices' },
        { label: 'فعالیت‌ها', value: 'tasks' },
      ],
      ['invoices'],
    );

    expect(options).toEqual([{ label: 'فاکتورها', value: 'invoices' }]);
    expect(getCreateRelatedRecordRelationFieldOptions('invoices', 'projects', ['invoices'])).toEqual([
      { label: 'پیوند با رکوردهای مرتبط فرآیند', value: PROCESS_RUN_LINK_FIELD_KEY },
    ]);
  });
});
