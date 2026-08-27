import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { formatRecordDisplayValue, formatRecordFieldValue } from './recordDisplayFormatter';

const relationField = {
  key: 'customer_id',
  type: FieldType.RELATION,
  relationConfig: { targetModule: 'customers' },
};

describe('record relation display formatting', () => {
  it.each([null, undefined, '', true, false, 'true', 'false', {}, []])(
    'keeps empty and legacy relation values blank: %p',
    (value) => {
      expect(formatRecordDisplayValue(value, relationField, {}, '')).toBe('');
      expect(formatRecordFieldValue({ customer_id: value }, relationField, {}, '')).toBe('');
    },
  );

  it('uses a hydrated label and never exposes a relation UUID', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(formatRecordDisplayValue(id, relationField, { customer_id: { [id]: 'مشتری آفتاب' } }, ''))
      .toBe('مشتری آفتاب');
    expect(formatRecordDisplayValue(id, relationField, {}, '')).toBe('مورد مرتبط');
  });
});
