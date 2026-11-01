import { describe, expect, it, vi } from 'vitest';
import { getSafeTableRowSlices } from './tableRowSlices';

describe('table row continuations', () => {
  it('offers complete line boundaries even when the whole description would fit on a fresh page', () => {
    const row = document.createElement('div'); row.textContent = 'توضیحات';
    row.getBoundingClientRect = () => ({ top: 100, height: 110 } as DOMRect);
    const spy = vi.spyOn(document, 'createRange').mockReturnValue({ selectNodeContents() {}, getClientRects: () => [
      { top: 105, bottom: 123, height: 18 }, { top: 130, bottom: 148, height: 18 },
      { top: 155, bottom: 173, height: 18 }, { top: 180, bottom: 198, height: 18 },
    ] } as any);
    try {
      expect(getSafeTableRowSlices(row, 500)).toEqual([{ start: 0, height: 110 }]);
      expect(getSafeTableRowSlices(row, 500, true)).toEqual([
        { start: 0, height: 26 }, { start: 26, height: 25 }, { start: 51, height: 25 }, { start: 76, height: 34 },
      ]);
    } finally { spy.mockRestore(); }
  });
  it('cuts between rendered lines while covering the whole source row exactly once', () => {
    const row = document.createElement('div'); row.textContent = 'متن بلند';
    row.getBoundingClientRect = () => ({ top: 100, height: 160 } as DOMRect);
    const spy = vi.spyOn(document, 'createRange').mockReturnValue({ selectNodeContents() {}, getClientRects: () => [
      { top: 110, bottom: 145, height: 35 }, { top: 150, bottom: 185, height: 35 },
      { top: 190, bottom: 225, height: 35 }, { top: 230, bottom: 255, height: 25 },
    ] } as any);
    try {
      const slices = getSafeTableRowSlices(row, 70);
      expect(slices).toEqual([{ start: 0, height: 50 }, { start: 50, height: 40 }, { start: 90, height: 70 }]);
      expect(slices.reduce((sum, slice) => sum + slice.height, 0)).toBe(160);
    } finally { spy.mockRestore(); }
  });
});
