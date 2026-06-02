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
  const functionState = { invoke: vi.fn() };
  const rpcState = vi.fn();
  const profileState = { maybeSingle: vi.fn() };
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
  return { authState, functionState, rpcState, profileState, supabaseMock };
});

vi.mock('../supabaseClient', () => ({
  supabase: supabaseMock,
}));

const renderPage = () => render(<SaasPortalPage />);

const mockDemoRpc = (provisionResult?: any) => {
  rpcState.mockImplementation(async (fn: string, payload: any) => {
    if (fn === 'check_phone_login_candidate') {
      return { data: { exists_in_profiles: false, exists_in_auth: false }, error: null };
    }
    if (fn === 'lookup_phone_signup_invite') return { data: { exists: false }, error: null };
    if (fn === 'get_current_saas_context') return { data: null, error: null };
    if (fn === 'check_saas_slug_availability') {
      return { data: { available: true, normalized_slug: payload?.p_slug || 'testco' }, error: null };
    }
    if (fn === 'provision_self_service_demo') {
      return {
        data: provisionResult || {
          success: true,
          slug: 'testco',
          redirect_host: 'testco.tazesystem.ir',
          trial_days: 15,
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });
};

const goToInfoStep = async () => {
  renderPage();
  fireEvent.change(screen.getByPlaceholderText('۰۹۱۲...'), { target: { value: '09121234567' } });
  fireEvent.click(screen.getByText('ادامه'));
  await screen.findByText('اطلاعات سازمان');
};

const fillInfoForm = async (email = 'owner@testco.ir') => {
  fireEvent.change(screen.getByPlaceholderText('علی رضایی'), { target: { value: 'علی رضایی' } });
  fireEvent.change(screen.getByPlaceholderText('owner@company.com'), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('حداقل ۶ کاراکتر'), { target: { value: 'secret1' } });
  fireEvent.change(screen.getByPlaceholderText('تکرار رمز عبور'), { target: { value: 'secret1' } });
  fireEvent.change(screen.getByPlaceholderText('شرکت نمونه'), { target: { value: 'تست کو' } });
  fireEvent.change(screen.getByPlaceholderText('mycompany'), { target: { value: 'testco' } });
  await waitFor(() => {
    expect(document.body.textContent || '').toContain('قابل استفاده است');
  });
};

const sendOtpFromInfo = async () => {
  fireEvent.click(screen.getByText(/ارسال کد تایید/));
  await waitFor(() => {
    expect(authState.signInWithOtp).toHaveBeenCalledWith({ phone: '+989121234567' });
  });
  await screen.findByPlaceholderText('کد تایید');
};

const verifyOtp = async () => {
  fireEvent.change(screen.getByPlaceholderText('کد تایید'), { target: { value: '۱۲۳۴۵۶' } });
  fireEvent.click(screen.getByText('تایید و ادامه'));
  await waitFor(() => {
    expect(authState.verifyOtp).toHaveBeenCalledWith({
      phone: '+989121234567',
      token: '123456',
      type: 'sms',
    });
  });
};

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
    profileState.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockDemoRpc();
  });

  afterEach(() => {
    cleanup();
  });

  it('requests OTP with normalized phone after collecting organization info', async () => {
    await goToInfoStep();
    await fillInfoForm();
    await sendOtpFromInfo();
  });

  it('provisions successfully when the authenticated demo profile exists without org access', async () => {
    profileState.maybeSingle.mockResolvedValue({
      data: { id: 'demo-user-1', org_id: null, role_id: null, role: null, is_active: true },
      error: null,
    });

    await goToInfoStep();
    await fillInfoForm();
    await sendOtpFromInfo();
    await verifyOtp();

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
    functionState.invoke.mockResolvedValue({
      data: {
        success: false,
        message: 'برای این ایمیل قبلاً کاربر ثبت شده است.',
        reason_code: 'email_conflict',
      },
      error: null,
    });

    await goToInfoStep();
    await fillInfoForm('used@testco.ir');
    await sendOtpFromInfo();
    await verifyOtp();

    await waitFor(() => {
      expect(document.body.textContent || '').toContain('این ایمیل قبلاً در سیستم ثبت شده است');
    });
  });

  it('shows admin review message when demo provisioning returns needs_admin_review', async () => {
    mockDemoRpc({
      success: false,
      status: 'needs_admin_review',
      message: 'برای این شماره قبلاً یک دسترسی سازمانی وجود دارد. درخواست ثبت شد و نیاز به بررسی مدیر دارد.',
    });

    await goToInfoStep();
    await fillInfoForm();
    await sendOtpFromInfo();
    await verifyOtp();

    await waitFor(() => {
      expect(document.body.textContent || '').toContain('نیاز به بررسی مدیر دارد');
    });
  });
});
