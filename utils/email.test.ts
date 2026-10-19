import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './email';

describe('account email normalization', () => {
  it('normalizes mixed Persian, Arabic and English digits across the address', () => {
    expect(normalizeEmail('  User۰۱۲۳۴۵۶۷۸۹+٠١٢٣٤٥٦٧٨٩@Example۲.com  '))
      .toBe('user0123456789+0123456789@example2.com');
  });

  it('preserves email punctuation and does not remove invalid internal spaces', () => {
    expect(normalizeEmail('First.Last+۱@example.com')).toBe('first.last+1@example.com');
    expect(normalizeEmail('a ۱@example.com')).toBe('a 1@example.com');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});
