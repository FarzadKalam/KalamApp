import { describe, expect, it } from 'vitest';
import { FieldType, type ModuleDefinition } from '../types';
import { buildModuleListColumnCrudFilters } from './moduleListColumnFilters';

const moduleConfig: ModuleDefinition = {
  id: 'projects',
  table: 'projects',
  titles: { fa: 'پروژه‌ها' },
  fields: [
    { key: 'customer_id', labels: { fa: 'مشتری' }, type: FieldType.RELATION, relationConfig: { targetModule: 'customers' } },
    { key: 'project_alignment', labels: { fa: 'هم‌راستایی' }, type: FieldType.MULTI_SELECT },
    { key: 'reviewer_ids', labels: { fa: 'بازبین‌ها' }, type: FieldType.MULTI_RELATION, multiRelationConfig: { targetModule: 'profiles' } },
  ],
  blocks: [],
};

describe('module-list header filters', () => {
  it('applies scalar relation selections as server filters', () => {
    expect(buildModuleListColumnCrudFilters(moduleConfig, {
      customer_id: ['11111111-1111-4111-8111-111111111111'],
    })).toEqual([
      { field: 'customer_id', operator: 'eq', value: '11111111-1111-4111-8111-111111111111' },
    ]);
  });

  it.each(['project_alignment', 'reviewer_ids'])('applies JSON-array header values for %s', (fieldKey) => {
    expect(buildModuleListColumnCrudFilters(moduleConfig, {
      [fieldKey]: ['گزینه اول'],
    })).toEqual([
      expect.objectContaining({ field: fieldKey, operator: 'cs', value: '["گزینه اول"]' }),
    ]);
  });
});
