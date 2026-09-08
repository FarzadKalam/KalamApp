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

  it('retries an existing phone login through resend when GoTrue rejects the otp route as signup', async () => {
    const authClient = {
      signInWithOtp: async () => ({ error: { message: 'Signups not allowed for otp' } }),
      resend: async (payload: unknown) => {
        expect(payload).toEqual({ phone: '+989121234567', type: 'sms' });
        return { error: null };
      },
    };

    await expect(requestSmsOtp(authClient, '۰۹۱۲۱۲۳۴۵۶۷', { shouldCreateUser: false }))
      .resolves.toBe('+989121234567');
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

    await expect(requestSmsOtp(authClient, '۰۹۱۲۱۲۳۴۵۶۷')).rejects.toThrow('ارسال کد تایید ناموفق بود.');
    expect(resendCalled).toBe(false);
  });
});
