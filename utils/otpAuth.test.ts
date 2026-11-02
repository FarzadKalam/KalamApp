import { describe, expect, it } from 'vitest';
import { getOtpErrorMessage, normalizeOtpToken, requestSmsOtp } from './otpAuth';

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

  it('rejects a missing login account without treating an empty resend success as delivery', async () => {
    let resendCalled = false;
    const authClient = {
      signInWithOtp: async () => ({ error: { message: 'Signups not allowed for otp' } }),
      resend: async () => {
        resendCalled = true;
        return { error: null };
      },
    };

    await expect(requestSmsOtp(authClient, '۰۹۱۲۱۲۳۴۵۶۷', { shouldCreateUser: false }))
      .rejects.toThrow('ارسال کد برای این حساب انجام نشد');
    expect(resendCalled).toBe(false);
  });

  it('does not use resend while a new account is being created', async () => {
    let resendCalled = false;
    const authClient = {
      signInWithOtp: async () => ({ error: { message: 'Signups not allowed for otp' } }),
      resend: async () => {
        resendCalled = true;
        return { error: null };
      },
    };

    await expect(requestSmsOtp(authClient, '۰۹۱۲۱۲۳۴۵۶۷')).rejects.toThrow('ارسال کد برای این حساب انجام نشد');
    expect(resendCalled).toBe(false);
  });
});
