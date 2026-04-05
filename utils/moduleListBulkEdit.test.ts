import { describe, expect, it } from 'vitest';
import { resolveModuleListBulkEditOpenState } from './moduleListBulkEdit';

describe('resolveModuleListBulkEditOpenState', () => {
  it('does not open edit mode when nothing is selected', () => {
    expect(resolveModuleListBulkEditOpenState([])).toEqual({
      shouldOpen: false,
      editRecordId: null,
      isBulkEditMode: false,
    });
  });

  it('opens single-record edit when only one row is selected', () => {
    expect(resolveModuleListBulkEditOpenState(['42'])).toEqual({
      shouldOpen: true,
      editRecordId: '42',
      isBulkEditMode: false,
    });
  });

  it('opens bulk edit mode when multiple rows are selected', () => {
    expect(resolveModuleListBulkEditOpenState(['42', '84'])).toEqual({
      shouldOpen: true,
      editRecordId: null,
      isBulkEditMode: true,
    });
  });
});
