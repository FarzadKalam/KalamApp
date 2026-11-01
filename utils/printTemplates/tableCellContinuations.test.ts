import { describe, expect, it, vi } from 'vitest';
import { buildTableCellContinuation, getTableCellContinuations } from './tableCellContinuations';

describe('parallel invoice cell continuations', () => {
  it('uses independent safe cuts and trims the empty tail of a shorter cell', () => {
    const table = document.createElement('table');
    table.innerHTML = '<tbody><tr><td style="padding:8px">توضیحات</td><td style="padding:4px">دریافت</td></tr></tbody>';
    document.body.append(table);
    const row = table.rows[0];
    Array.from(row.cells).forEach((cell) => { cell.getBoundingClientRect = () => ({ top: 100, bottom: 500, height: 400 } as DOMRect); });
    const range = vi.spyOn(document, 'createRange').mockReturnValue({ selectNodeContents() {}, getClientRects: () => [{ top: 110, bottom: 145, height: 35 }] } as any);
    try {
      const sliceLines = vi.fn(() => [{ start: 0, height: 30 }, { start: 30, height: 370 }]);
      const parts = getTableCellContinuations(row, 500, sliceLines)!;
      expect(parts).toHaveLength(2);
      expect(parts[1].map((slice) => slice.height)).toEqual([24, 20]);
      expect(sliceLines).toHaveBeenCalledWith(row.cells[0], 500, true, 2);
      table.remove();
      const clone = buildTableCellContinuation(row, table.cloneNode(true) as HTMLTableElement, parts[0]);
      expect(clone.querySelector<HTMLElement>('td > div > div')!.style.padding).toBe('8px');
      expect(clone.querySelector<HTMLElement>('td > div')!.style.height).toBe('30px');
      expect(clone.textContent).toBe('توضیحاتدریافت');
    } finally { range.mockRestore(); table.remove(); }
  });

  it('retains image-bearing rows for the normal whole-row path', () => {
    const row = document.createElement('tr'); row.innerHTML = '<td><img src="sample.png"></td>';
    const sliceLines = vi.fn(() => []);
    expect(getTableCellContinuations(row, 500, sliceLines)).toBeNull();
    expect(sliceLines).not.toHaveBeenCalled();
  });
});
