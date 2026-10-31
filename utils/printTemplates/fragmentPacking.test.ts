import { describe, expect, it } from 'vitest';
import { packPrintFragments } from './fragmentPacking';

describe('measured print packing', () => {
  it('keeps the largest fitting prefix rather than halving a nearly full page', () => {
    expect(packPrintFragments([1,2,3,4,5,6,7,8,9], (items) => items.length <= 7))
      .toEqual([[1,2,3,4,5,6,7], [8,9]]);
  });
  it('preserves order and fits mixed row heights on every page', () => {
    const heights = [30, 15, 40, 10, 25, 50, 20];
    const pages = packPrintFragments(heights, (items) => items.reduce((sum, height) => sum + height, 0) <= 100)!;
    expect(pages).toEqual([[30,15,40,10], [25,50,20]]);
    expect(pages.flat()).toEqual(heights);
  });
  it('returns control to the oversized-content splitter when one item cannot fit', () => {
    expect(packPrintFragments([101], (items) => items[0] <= 100)).toBeNull();
  });
});
