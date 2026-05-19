import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SaasPortalPage from './SaasPortalPage';

const { authState, functionState, rpcState, profileState, supabaseMock } = vi.hoisted(() => {
  const authState = {
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn(),
  };

  const functionState = {
    invoke: vi.fn(),
  };

  const rpcState = vi.fn();
  const profileState = {
    maybeSingle: vi.fn(),
  };

  const supabaseMock = {
    auth: {
      signInWithOtp: (...args: any[]) => authState.signInWithOtp(...args),
      verifyOtp: (...args: any[]) => authState.verifyOtp(...args),
      getUser: (...args: any[]) => authState.getUser(...args),
      signOut: (...args: any[]) => authState.signOut(...args),
    },
    functions: {
      invoke: (...args: any[]) => functionState.invoke(...args),
    },
    rpc: (...args: any[]) => rpcState(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: (...args: any[]) => profileState.maybeSingle(...args),
        }),
      }),
    }),
  };

  return {
    authState,
    functionState,
    rpcState,
    profileState,
    supabaseMock,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: supabaseMock,
}));

const renderPage = () => render(<SaasPortalPage />);

describe('SaasPortalPage OTP flow', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    authState.signInWithOtp.mockResolvedValue({ error: null });
    authState.verifyOtp.mockResolvedValue({ error: null });
    authState.getUser.mockResolvedValue({ data: { user: { id: 'demo-user-1' } }, error: null });
    authState.signOut.mockResolvedValue({ error: null });
    functionState.invoke.mockResolvedValue({ data: { success: true }, error: null });
    rpcState.mockResolvedValue({ data: null, error: null });
    profileState.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('requests otp with normalized phone and continues to otp step', async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('۰۹۱۲...'), { target: { value: '۰۹۱۲۱۲۳۴۵۶۷' } });
    fireEvent.click(screen.getByText('دریافت کد تایید'));

    await waitFor(() => {
      expect(authState.signInWithOtp).toHaveBeenCalledWith({ phone: '+989121234567' });
    });
    expect(await screen.findByPlaceholderText('کد تایید')).toBeInTheDocument();
  });

  it('verifies otp and moves to org info step', async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('۰۹۱۲...'), { target: { value: '09121234567' } });
    fireEvent.click(screen.getByText('دریافت کد تایید'));
    await screen.findByText('تایید و ادامه');

    fireEvent.change(screen.getByPlaceholderText('کد تایید'), { target: { value: '۱۲۳۴۵۶' } });
    fireEvent.click(screen.getByText('تایید و ادامه'));

    await waitFor(() => {
      expect(authState.verifyOtp).toHaveBeenCalledWith({
        phone: '+989121234567',
        token: '123456',
        type: 'sms',
      });
    });
    expect(await screen.findByText('اطلاعات سازمان')).toBeInTheDocument();
  });

  it('shows mapped timeout error on otp request failure', async () => {
    authState.signInWithOtp.mockResolvedValue({
      error: {
        message: 'SMS hook failed: hook_timeout',
        code: 'hook_timeout',
      },
    });

    renderPage();
    fireEvent.change(screen.getByPlaceholderText('۰۹۱۲...'), { target: { value: '09121234567' } });
    fireEvent.click(screen.getByText('دریافت کد تایید'));

    await waitFor(() => {
      expect(document.body.textContent || '').toContain('سامانه پیامکی پاسخ دیرهنگام');
    });
  });

  it('blocks demo otp request for numbers already attached to an org user', async () => {
    rpcState.mockImplementation(async (fn: string) => {
      if (fn === 'check_phone_login_candidate') {
        return {
          data: {
            exists_in_profiles: true,
            exists_in_auth: true,
            has_phone_identity: true,
            is_active: true,
            matched_profile_count: 1,
            org_id: 'org-internal',
          },
          error: null,
        };
      }
      if (fn === 'lookup_phone_signup_invite') {
        return { data: { exists: false }, error: null };
      }
      return { data: null, error: null };
    });

    renderPage();
    fireEvent.change(screen.getByPlaceholderText('۰۹۱۲...'), { target: { value: '09121234567' } });
    fireEvent.click(screen.getByText('دریافت کد تایید'));

    await waitFor(() => {
      expect(document.body.textContent || '').toContain('قبلاً به یک حساب سازمانی متصل شده است');
    });
    expect(authState.signInWithOtp).not.toHaveBeenCalled();
  });

  it('configures owner credentials and sends branding fields during provisioning', async () => {
    functionState.invoke.mockResolvedValue({ data: { success: true }, error: null });
    rpcState.mockImplementation(async (fn: string, payload: any) => {
      if (fn === 'get_current_saas_context') return { data: null, error: null };
      if (fn === 'check_saas_slug_availability') {
        return { data: { available: true, normalized_slug: payload?.p_slug || 'mycompany' }, error: null };
      }
      if (fn === 'provision_self_service_demo') {
        return {
          data: {
            success: true,
            slug: 'mycompany',
            redirect_host: 'mycompany.tazesystem.ir',
            trial_days: 15,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    renderPage();

    fireEvent.change(screen.getByPlaceholderText('۰۹۱۲...'), { target: { value: '09121234567' } });
    fireEvent.click(screen.getByText('دریافت کد تایید'));
    await screen.findByText('تایید و ادامه');

    fireEvent.change(screen.getByPlaceholderText('کد تایید'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('تایید و ادامه'));
    await screen.findByText('اطلاعات سازمان');

    fireEvent.change(screen.getByPlaceholderText('علی رضایی'), { target: { value: 'علی رضایی' } });
    fireEvent.change(screen.getByPlaceholderText('owner@company.com'), { target: { value: 'owner@testco.ir' } });
    fireEvent.change(screen.getByPlaceholderText('حداقل ۶ کاراکتر'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByPlaceholderText('تکرار رمز عبور'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByPlaceholderText('شرکت نمونه'), { target: { value: 'تست کو' } });
    fireEvent.change(screen.getByPlaceholderText('mycompany'), { target: { value: 'testco' } });

    await waitFor(() => {
      expect(document.body.textContent || '').toContain('قابل استفاده است');
    });

    fireEvent.click(screen.getByText('راه‌اندازی فضای من'));

    await waitFor(() => {
      expect(functionState.invoke).toHaveBeenCalledWith('user-admin', {
        body: {
          action: 'setup_owner_credentials',
          fullName: 'علی رضایی',
          email: 'owner@testco.ir',
          password: 'secret1',
          skipProfileUpsert: true,
        },
      });
    });

    await waitFor(() => {
      expect(rpcState).toHaveBeenCalledWith('provision_self_service_demo', expect.objectContaining({
        p_full_name: 'علی رضایی',
        p_business_name: 'تست کو',
        p_requested_slug: 'testco',
        p_owner_email: 'owner@testco.ir',
        p_brand_palette_key: 'kalam_sky',
      }));
    });
  });

  it('shows owner email conflict inline on setup_owner_credentials conflict', async () => {
    rpcState.mockImplementation(async (fn: string, payload: any) => {
      if (fn === 'get_current_saas_context') return { data: null, error: null };
      if (fn === 'check_saas_slug_availability') {
        return { data: { available: true, normalized_slug: payload?.p_slug || 'mycompany' }, error: null };
      }
      return { data: null, error: null };
    });
    functionState.invoke.mockResolvedValue({
      data: {
        success: false,
        message: 'برای این ایمیل قبلاً کاربر ثبت شده است.',
        reason_code: 'email_conflict',
      },
      error: null,
    });

    renderPage();

    fireEvent.change(screen.getByPlaceholderText('۰۹۱۲...'), { target: { value: '09121234567' } });
    fireEvent.click(screen.getByText('دریافت کد تایید'));
    await screen.findByText('تایید و ادامه');

    fireEvent.change(screen.getByPlaceholderText('کد تایید'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('تایید و ادامه'));
    await screen.findByText('اطلاعات سازمان');

    fireEvent.change(screen.getByPlaceholderText('علی رضایی'), { target: { value: 'علی رضایی' } });
    fireEvent.change(screen.getByPlaceholderText('owner@company.com'), { target: { value: 'used@testco.ir' } });
    fireEvent.change(screen.getByPlaceholderText('حداقل ۶ کاراکتر'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByPlaceholderText('تکرار رمز عبور'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByPlaceholderText('شرکت نمونه'), { target: { value: 'تست کو' } });
    fireEvent.change(screen.getByPlaceholderText('mycompany'), { target: { value: 'testco' } });

    await waitFor(() => {
      expect(document.body.textContent || '').toContain('قابل استفاده است');
    });

    fireEvent.click(screen.getByText('راه‌اندازی فضای من'));

    await waitFor(() => {
      expect(document.body.textContent || '').toContain('این ایمیل قبلاً استفاده شده است');
    });
  });

  it('shows admin review message when demo provisioning returns needs_admin_review', async () => {
    rpcState.mockImplementation(async (fn: string, payload: any) => {
      if (fn === 'get_current_saas_context') return { data: null, error: null };
      if (fn === 'check_saas_slug_availability') {
        return { data: { available: true, normalized_slug: payload?.p_slug || 'mycompany' }, error: null };
      }
      if (fn === 'provision_self_service_demo') {
        return {
          data: {
            success: false,
            status: 'needs_admin_review',
            message: 'برای این شماره یک پروفایل ناقص شناسایی شد. برای جلوگیری از جابه‌جایی اشتباه بین سازمان‌ها، درخواست ثبت شد و نیاز به بررسی مدیر دارد.',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    renderPage();

    fireEvent.change(screen.getByPlaceholderText('۰۹۱۲...'), { target: { value: '09121234567' } });
    fireEvent.click(screen.getByText('دریافت کد تایید'));
    await screen.findByText('تایید و ادامه');

    fireEvent.change(screen.getByPlaceholderText('کد تایید'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('تایید و ادامه'));
    await screen.findByText('اطلاعات سازمان');

    fireEvent.change(screen.getByPlaceholderText('علی رضایی'), { target: { value: 'علی رضایی' } });
    fireEvent.change(screen.getByPlaceholderText('owner@company.com'), { target: { value: 'owner@testco.ir' } });
    fireEvent.change(screen.getByPlaceholderText('حداقل ۶ کاراکتر'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByPlaceholderText('تکرار رمز عبور'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByPlaceholderText('شرکت نمونه'), { target: { value: 'تست کو' } });
    fireEvent.change(screen.getByPlaceholderText('mycompany'), { target: { value: 'testco' } });

    await waitFor(() => {
      expect(document.body.textContent || '').toContain('قابل استفاده است');
    });

    fireEvent.click(screen.getByText('راه‌اندازی فضای من'));

    await waitFor(() => {
      expect(document.body.textContent || '').toContain('نیاز به بررسی مدیر دارد');
    });
  });
});
