import { describe, expect, it } from 'vitest';
import {
  PROCESS_RUN_LINK_FIELD_KEY,
  PROCESS_RUN_SOURCE_MODULE_ID,
  getCreateRelatedRecordRelationFieldOptions,
  getCreateRelatedRecordSourceModuleOptions,
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

  it('offers controlled billboard status requests when the process includes a billboard', () => {
    const options = getCreateRelatedRecordTargetModuleOptions(
      'billboards',
      [
        { label: 'تابلوها', value: 'billboards' },
        { label: 'تغییر وضعیت تبلیغات محیطی', value: 'billboard_status_changes' },
      ],
      ['billboards'],
    );

    expect(options.map((option) => option.value)).toEqual(['billboards', 'billboard_status_changes']);
    expect(getCreateRelatedRecordRelationFieldOptions('billboard_status_changes', 'billboards')).toEqual([
      { label: 'تابلو', value: 'billboard_id' },
    ]);
  });

  it('puts the current process first as the source for process automations', () => {
    expect(getCreateRelatedRecordSourceModuleOptions([
      { label: 'فاکتورها', value: 'invoices' },
      { label: 'پروژه‌ها', value: 'projects' },
    ], ['invoices', 'projects'])).toEqual([
      { label: 'همین فرآیند', value: PROCESS_RUN_SOURCE_MODULE_ID },
      { label: 'فاکتورها', value: 'invoices' },
      { label: 'پروژه‌ها', value: 'projects' },
    ]);
  });
});
