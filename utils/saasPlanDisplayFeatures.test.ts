import { describe, expect, it } from 'vitest';
import { parseSaasPlanDisplayFeatures } from './saasPlanDisplayFeatures';

describe('parseSaasPlanDisplayFeatures', () => {
  it('keeps the configured text and featured order for both pricing views', () => {
    expect(parseSaasPlanDisplayFeatures([
      { text: 'همه امکانات پایه', featured: true },
      { text: 'اتصال به وردپرس', featured: false },
      '  خدمات افزوده  ',
      { text: '  ', featured: true },
    ])).toEqual([
      { text: 'همه امکانات پایه', featured: true },
      { text: 'اتصال به وردپرس', featured: false },
      { text: 'خدمات افزوده', featured: true },
    ]);
  });
});
