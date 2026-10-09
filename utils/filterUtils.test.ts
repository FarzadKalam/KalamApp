import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { getWorkflowOperatorOptions, getWorkflowOperatorsForField } from './filterUtils';

describe('date condition operators', () => {
  it('offers day-based labels for date fields and hides numeric comparisons', () => {
    const field = { key: 'invoice_date', type: FieldType.DATE } as any;
    const operators = getWorkflowOperatorsForField(field);
    expect(operators).toContain('after_date');
    expect(operators).toContain('before_date');
    expect(operators).not.toEqual(expect.arrayContaining(['gt', 'gte', 'lt', 'lte']));

    const options = getWorkflowOperatorOptions(field);
    expect(options.find((item) => item.value === 'after_date')?.label).toBe('بعد از این روز باشد');
    expect(options.find((item) => item.value === 'before_date')?.label).toBe('قبل از این روز باشد');
  });

  it('uses the same day-based operators for datetime fields', () => {
    const operators = getWorkflowOperatorsForField({ key: 'created_at', type: FieldType.DATETIME } as any);
    expect(operators).toContain('after_date');
    expect(operators).toContain('before_date');
    expect(operators).not.toEqual(expect.arrayContaining(['gt', 'gte', 'lt', 'lte']));
  });
});
