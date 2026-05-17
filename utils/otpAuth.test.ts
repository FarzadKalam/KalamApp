import { describe, expect, it } from 'vitest';
import { getOtpErrorMessage, normalizeOtpToken } from './otpAuth';

describe('otpAuth helpers', () => {
  it('normalizes persian otp digits', () => {
    expect(normalizeOtpToken('۱۲ ۳۴-۵۶')).toBe('123456');
  });

  it('maps hook timeout to a user-facing otp message', () => {
    expect(getOtpErrorMessage({ message: 'sms hook failed: hook_timeout' }, 'fallback')).toContain('سامانه پیامکی پاسخ دیرهنگام');
  });

  it('maps invalid otp to a stable Persian error', () => {
    expect(getOtpErrorMessage({ message: 'Token is invalid' }, 'fallback')).toBe('کد تایید واردشده معتبر نیست.');
  });
});
