import { describe, expect, it } from 'vitest';
import { getOwnerPasswordValidationError } from '../supabase/functions/_shared/owner-password-policy';

describe('new demo owner password policy', () => {
  it.each(['۱۲۳۴', '1234', '١٢٣٤'])('explains short passwords in every digit alphabet: %s', password => {
    expect(getOwnerPasswordValidationError(password)).toContain('۸ نویسه');
  });
  it.each(['12345678', '۱۲۳۴۵۶۷۸', '١٢٣٤٥٦٧٨', '۱۲3٤۵6۷8', '۱۲۳۴ ۵۶۷۸', 'aaaaaaaa'])('rejects obvious numeric and repeated passwords: %s', password => {
    expect(getOwnerPasswordValidationError(password)).toBeTruthy();
  });
  it('supports Persian passphrases without rewriting the chosen password', () => {
    expect(getOwnerPasswordValidationError('عبارت امن برای آزمون ۱۲۳')).toBeNull();
    expect(getOwnerPasswordValidationError('chosen phrase ۴۲')).toBeNull();
    expect(getOwnerPasswordValidationError(' chosen phrase ۴۲ ')).toContain('فاصله');
    expect(getOwnerPasswordValidationError('x'.repeat(129))).toContain('۱۲۸');
  });
});
