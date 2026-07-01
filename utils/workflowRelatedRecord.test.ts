import { describe, expect, it } from 'vitest';
import {
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
});
