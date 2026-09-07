import { describe, expect, it } from 'vitest';
import { getNativeTablePaginationScript, partitionNativeTableRows } from './nativeTablePagination';

describe('native table pagination', () => {
  it('assigns every source row exactly once and in its original order', () => {
    const groups = partitionNativeTableRows({
      rowHeights: [32, 45, 28, 50, 31, 42],
      firstPageCapacity: 105,
      nextPageCapacity: 125,
      headerHeight: 20,
      reservePx: 5,
    });

    expect(groups.flat()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(groups.flat()).size).toBe(6);
    expect(groups.length).toBeGreaterThan(1);
  });

  it('keeps an oversized row once instead of duplicating or dropping it', () => {
    const groups = partitionNativeTableRows({
      rowHeights: [40, 300, 40],
      firstPageCapacity: 100,
      nextPageCapacity: 100,
      headerHeight: 15,
    });

    expect(groups.flat()).toEqual([0, 1, 2]);
  });

  it('fails the PDF-ready contract when materialized row tokens diverge', () => {
    const script = getNativeTablePaginationScript();

    expect(script).toContain('KALAMAPP_PRINT_ROW_INTEGRITY_FAILED');
    expect(script).toContain('data-kalamapp-native-source-row');
    expect(script).toContain("clone.style.breakBefore = 'page'");
  });
});

