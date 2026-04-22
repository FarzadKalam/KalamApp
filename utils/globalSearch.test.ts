import { describe, expect, it } from 'vitest';
import {
  buildPhoneSearchVariants,
  digitsToEnglish,
  normalizeGlobalSearchQuery,
  normalizePersianSearchText,
} from './globalSearch';

describe('globalSearch normalization', () => {
  it('normalizes Persian and Arabic character variants', () => {
    expect(normalizePersianSearchText('علي')).toBe(normalizePersianSearchText('علی'));
    expect(normalizePersianSearchText('كالا')).toBe(normalizePersianSearchText('کالا'));
    expect(normalizePersianSearchText('نام‌   مشتری')).toBe('نام مشتری');
  });

  it('normalizes Persian and Arabic digits to English digits', () => {
    expect(digitsToEnglish('۰۹۱۲٣٤٥٦٧٨٩')).toBe('09123456789');
    expect(normalizeGlobalSearchQuery('کد ۱۲۳')).toBe('کد 123');
  });

  it('builds equivalent Iranian phone search variants', () => {
    expect(buildPhoneSearchVariants('۰۹۱۲۳۴۵۶۷۸۹')).toEqual(
      expect.arrayContaining(['09123456789', '+989123456789', '989123456789', '9123456789'])
    );
    expect(buildPhoneSearchVariants('+989123456789')).toEqual(
      expect.arrayContaining(['989123456789', '+989123456789', '09123456789', '9123456789'])
    );
  });
});

