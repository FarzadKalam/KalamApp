import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import {
  buildDeletedRelationLabel,
  getModuleDeleteDraftFieldKeys,
  normalizeDeleteModuleRecordsOptions,
} from './moduleDelete';

describe('moduleDelete helpers', () => {
  it('normalizes delete options with the expected defaults', () => {
    expect(normalizeDeleteModuleRecordsOptions(null)).toEqual({
      deletePayments: true,
      processMode: 'all',
      deleteRelatedActivities: false,
      deleteFiles: false,
      replacementRecordId: null,
    });
  });

  it('reads known process draft keys from the module definition', () => {
    const moduleConfig: any = {
      fields: [
        { key: 'name', type: FieldType.TEXT },
        { key: 'execution_process_draft', type: FieldType.JSON },
        { key: 'production_stages_draft', type: FieldType.JSON },
      ],
    };
    expect(getModuleDeleteDraftFieldKeys(moduleConfig)).toEqual([
      'execution_process_draft',
      'production_stages_draft',
    ]);
  });

  it('builds deleted relation labels without exposing raw ids', () => {
    expect(buildDeletedRelationLabel('پروژه برج آفتاب')).toBe('پروژه برج آفتاب (حذف شده)');
    expect(buildDeletedRelationLabel('')).toBe('رکورد حذف شده');
  });
});
