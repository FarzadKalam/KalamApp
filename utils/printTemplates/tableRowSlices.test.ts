import { describe, expect, it, vi } from 'vitest';
import { getSafeTableRowSlices } from './tableRowSlices';

describe('table row continuations', () => {
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
