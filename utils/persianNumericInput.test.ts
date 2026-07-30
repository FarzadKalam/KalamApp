import { describe, expect, it } from 'vitest';
import { normalizeDigitsToEnglish } from './persianNumericInput';

describe('normalizeDigitsToEnglish', () => {
  it('normalizes Persian and Arabic numerals in public-link codes', () => {
    expect(normalizeDigitsToEnglish('Ab۱٢c۳٤')).toBe('Ab12c34');
  });
});
