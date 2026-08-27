import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { findRelationOption, getSingleOptionLabel, isEmptyRelationValue } from './optionHelpers';

const relationField = {
  key: 'customer_id',
  type: FieldType.RELATION,
  relationConfig: { targetModule: 'customers' },
};

describe('relation option labels', () => {
  it('resolves a target-scoped option when a field-scoped cache is absent', () => {
    const options = {
      customers: [{ value: '11111111-1111-4111-8111-111111111111', label: 'مشتری آفتاب' }],
    };

    expect(getSingleOptionLabel(relationField, '11111111-1111-4111-8111-111111111111', {}, options)).toBe('مشتری آفتاب');
    expect(findRelationOption(relationField, '11111111-1111-4111-8111-111111111111', options)?.label).toBe('مشتری آفتاب');
  });

  it('never exposes an unresolved UUID as a relation label', () => {
    expect(getSingleOptionLabel(relationField, '22222222-2222-4222-8222-222222222222')).toBe('رکورد مرتبط');
  });

  it('supports multi-relation caches through multiRelationConfig', () => {
    const field = {
      key: 'reviewer_ids',
      type: FieldType.MULTI_RELATION,
      multiRelationConfig: { targetModule: 'profiles' },
    };
    const options = {
      profiles: [{ value: '33333333-3333-4333-8333-333333333333', label: 'مریم رضایی' }],
    };

    expect(getSingleOptionLabel(field, '33333333-3333-4333-8333-333333333333', {}, options)).toBe('مریم رضایی');
  });

  it.each([null, undefined, '', true, false, 'true', 'false', {}, []])(
    'renders an empty legacy relation value as blank: %p',
    (value) => {
      expect(isEmptyRelationValue(value)).toBe(true);
      expect(getSingleOptionLabel(relationField, value)).toBe('');
      expect(findRelationOption(relationField, value)).toBeNull();
    },
  );

  it('keeps actual relation identifiers and hydrated objects non-empty', () => {
    expect(isEmptyRelationValue('11111111-1111-4111-8111-111111111111')).toBe(false);
    expect(isEmptyRelationValue({ id: '11111111-1111-4111-8111-111111111111' })).toBe(false);
    expect(isEmptyRelationValue({ label: 'مشتری آفتاب' })).toBe(false);
  });
});
