import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import {
  buildModuleListSearchFieldKeys,
  buildModuleListSearchFilter,
  isModuleListSearchFilter,
} from './moduleListSearch';

describe('moduleListSearch', () => {
  const moduleConfig = {
    id: 'customers',
    fields: [
      { key: 'full_name', type: FieldType.TEXT },
      { key: 'notes', type: FieldType.LONG_TEXT },
      { key: 'mobile_1', type: FieldType.PHONE },
      { key: 'status', type: FieldType.STATUS },
      { key: 'customer_id', type: FieldType.RELATION },
      { key: 'balance', type: FieldType.PRICE },
      { key: 'tags', type: FieldType.TAGS },
    ],
  } as any;

  it('uses searchable string fields while excluding hidden and non-text query fields', () => {
    // PHONE fields are prioritized over plain TEXT, then by key fragment relevance
    expect(buildModuleListSearchFieldKeys(moduleConfig, { notes: false })).toEqual([
      'mobile_1',
      'full_name',
      'status',
    ]);
  });

  it('creates an OR contains filter across permitted search fields', () => {
    const filter = buildModuleListSearchFilter('علی', ['full_name', 'mobile_1']) as any;

    expect(filter.operator).toBe('or');
    expect(filter.value).toEqual([
      { field: 'full_name', operator: 'contains', value: 'علی' },
      { field: 'mobile_1', operator: 'contains', value: 'علی' },
    ]);
    expect(isModuleListSearchFilter(filter)).toBe(true);
  });
});
