import { describe, expect, it } from 'vitest';
import { formatPersianPrice } from './persianNumberFormatter';

describe('Persian price formatting', () => {
  it('removes decimals from every displayed price and keeps Persian grouping', () => {
    expect(formatPersianPrice(1250000.25)).toBe('۱٬۲۵۰٬۰۰۰');
    expect(formatPersianPrice('۱۲۵۰۰۰۰٫۷۵')).toBe('۱٬۲۵۰٬۰۰۱');
  });
});
