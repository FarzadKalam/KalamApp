import { describe, expect, it } from 'vitest';
import { FieldType, ModuleDefinition } from '../types';
import { buildDefaultMergeSelections, buildMergePayload, getMergeableModuleFields } from './moduleListMerge';

const moduleConfig: ModuleDefinition = {
  id: 'customers',
  table: 'customers',
  titles: { fa: 'مشتریان' },
  blocks: [],
  fields: [
    { key: 'id', type: FieldType.TEXT, labels: { fa: 'شناسه' } },
    { key: 'full_name', type: FieldType.TEXT, labels: { fa: 'نام' }, order: 1 },
    { key: 'mobile_1', type: FieldType.PHONE, labels: { fa: 'موبایل' }, order: 2 },
    { key: 'rank', type: FieldType.NUMBER, labels: { fa: 'رتبه' }, order: 3 },
    { key: 'readonly_total', type: FieldType.NUMBER, labels: { fa: 'محاسبه' }, readonly: true, order: 4 },
    { key: 'tags', type: FieldType.TAGS, labels: { fa: 'برچسب' }, order: 5 },
    { key: 'created_at', type: FieldType.DATETIME, labels: { fa: 'ایجاد' }, order: 6 },
  ],
};

describe('moduleListMerge', () => {
  it('keeps only mergeable fields', () => {
    expect(getMergeableModuleFields(moduleConfig).map((field) => field.key)).toEqual([
      'full_name',
      'mobile_1',
      'rank',
    ]);
  });

  it('prefers the first non-empty value as default selection', () => {
    const fields = getMergeableModuleFields(moduleConfig);
    const records = [
      { id: 'a', full_name: '', mobile_1: '09120000000', rank: null },
      { id: 'b', full_name: 'علی', mobile_1: '09121111111', rank: 2 },
    ];

    expect(buildDefaultMergeSelections(fields, records)).toEqual({
      full_name: 'b',
      mobile_1: 'a',
      rank: 'b',
    });
  });

  it('builds update payload from selected records', () => {
    const fields = getMergeableModuleFields(moduleConfig);
    const records = [
      { id: 'a', full_name: 'رکورد اول', mobile_1: '09120000000', rank: 1 },
      { id: 'b', full_name: 'رکورد دوم', mobile_1: '09121111111', rank: 2 },
    ];

    expect(buildMergePayload(fields, records, { full_name: 'b', mobile_1: 'a', rank: 'b' })).toEqual({
      full_name: 'رکورد دوم',
      mobile_1: '09120000000',
      rank: 2,
    });
  });
});

