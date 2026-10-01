import { describe, expect, it } from 'vitest';
import { getPrintRowColumnHeaderLabel } from './tableHeaderLabels';

describe('print table column headers', () => {
  const block = {
    tableColumns: [
      { key: 'main_unit', title: 'واحد اصلی' },
      { key: 'unit_price', title: 'قیمت واحد' },
      { key: 'discount', title: 'تخفیف' },
      { key: 'total_price', title: 'جمع کل' },
    ],
  };

  it('uses the body token instead of a stale header position', () => {
    expect(getPrintRowColumnHeaderLabel({ moduleId: 'invoices', block, rowKey: 'main_unit' }))
      .toBe('واحد اصلی');
    expect(getPrintRowColumnHeaderLabel({ moduleId: 'invoices', block, rowKey: 'unit_price' }))
      .toBe('قیمت واحد');
    expect(getPrintRowColumnHeaderLabel({ moduleId: 'invoices', block, rowKey: '__discount_amount__' }))
      .toBe('تخفیف');
    expect(getPrintRowColumnHeaderLabel({ moduleId: 'invoices', block, rowKey: 'total_price' }))
      .toBe('جمع کل');
  });

  it('keeps system row labels deterministic', () => {
    expect(getPrintRowColumnHeaderLabel({ block, rowKey: '__row_index__' })).toBe('ردیف');
    expect(getPrintRowColumnHeaderLabel({ block, rowKey: 'cheque_due_date' })).toBe('سررسید');
  });
});
