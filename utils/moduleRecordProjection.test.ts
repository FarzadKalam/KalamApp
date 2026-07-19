import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { buildModuleRecordProjection } from './moduleRecordProjection';

describe('module record projection', () => {
  it('keeps normal record fields in the first show response and defers only process drafts', () => {
    const projection = buildModuleRecordProjection({
      id: 'projects',
      table: 'projects',
      fields: [
        { key: 'name', type: FieldType.TEXT },
        { key: 'customer_id', type: FieldType.RELATION },
        { key: 'execution_process_draft', type: FieldType.JSON },
      ],
    } as any);

    expect(projection.initialColumns).toEqual(expect.arrayContaining(['id', 'name', 'customer_id']));
    expect(projection.initialColumns).not.toContain('execution_process_draft');
    expect(projection.deferredProcessDraftColumns).toEqual(['execution_process_draft']);
  });
});
