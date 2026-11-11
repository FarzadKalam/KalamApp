import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SaasPortalPage from './SaasPortalPage';

const { authState, functionState, rpcState, profileState, supabaseMock } = vi.hoisted(() => {
  const authState = {
    signInWithOtp: vi.fn(),
    signInWithPassword: vi.fn(),
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
      signInWithPassword: (...args: any[]) => authState.signInWithPassword(...args),
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
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_AUTH_STORAGE_KEY: 'test-auth-token',
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
          org_id: 'demo-org',
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
    authState.signInWithPassword.mockResolvedValue({ data: { user: { id: 'demo-user-1' }, session: { access_token: 'fresh-owner-session' } }, error: null });
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

  const mockExistingAccount = () => {
    rpcState.mockImplementation(async (fn: string) => {
      if (fn === 'check_phone_login_candidate') return { data: {
        exists_in_profiles: true, exists_in_auth: true, has_phone_identity: true, is_active: true,
      }, error: null };
      if (fn === 'lookup_phone_signup_invite') return { data: { exists: false }, error: null };
      if (fn === 'get_current_user_organization_accesses') return { data: [{
        org_id: 'existing-org', org_name: 'سازمان نمونه', resolved_host: 'sample.tazesystem.ir', is_owner: true,
      }], error: null };
      return { data: null, error: null };
    });
  };

  const enterExistingPhone = async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('۰۹۱۲...'), { target: { value: '09121234567' } });
    fireEvent.click(screen.getByText('ادامه'));
  };

  it('explains existing-account login and reveals organization name and address only after verification', async () => {
    mockExistingAccount();
    await enterExistingPhone();
    await screen.findByText('ورود به حساب شما');
    expect(screen.queryByText('اطلاعات سازمان')).toBeNull();
    expect(screen.queryByText('سازمان نمونه')).toBeNull();
    expect(screen.queryByText('sample.tazesystem.ir')).toBeNull();
    expect(rpcState).not.toHaveBeenCalledWith('get_current_user_organization_accesses');
    expect(authState.signInWithOtp).toHaveBeenCalledWith({ phone: '+989121234567', options: { shouldCreateUser: false } });
    await verifyOtp();
    await screen.findByText('سازمان نمونه');
    expect(screen.getByText('sample.tazesystem.ir')).toBeTruthy();
    expect(rpcState).not.toHaveBeenCalledWith('provision_self_service_demo', expect.anything());
  });

  it('keeps failed existing-account OTP requests on the phone page with a recovery message', async () => {
    mockExistingAccount();
    authState.signInWithOtp.mockResolvedValue({ error: { code: 'otp_disabled', message: 'Signups not allowed for otp' } });
    await enterExistingPhone();
    await screen.findByText(/ارسال کد برای این حساب انجام نشد/, {}, { timeout: 10_000 });
    expect(screen.queryByPlaceholderText('کد تایید')).toBeNull();
    expect(sessionStorage.getItem('kalam_saas_wizard_step')).toBe('phone');
  });

  it('preserves existing-account login copy when the OTP page is reloaded', async () => {
    sessionStorage.setItem('kalam_saas_wizard_step', 'otp');
    sessionStorage.setItem('kalam_saas_wizard_phone', '09121234567');
    sessionStorage.setItem('kalam_saas_wizard_existing_phone', '+989121234567');
    renderPage();
    await screen.findByText('ورود به حساب شما');
    expect(screen.queryByText('اطلاعات سازمان')).toBeNull();
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
          phone: '+989121234567',
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

  it('shows a provisioning state immediately after OTP while the organization request is pending', async () => {
    mockDemoRpc();
    rpcState.mockImplementation(async (fn: string, payload: any) => {
      if (fn === 'provision_self_service_demo') return new Promise(() => undefined);
      if (fn === 'check_phone_login_candidate') return { data: { exists_in_profiles: false, exists_in_auth: false }, error: null };
      if (fn === 'lookup_phone_signup_invite') return { data: { exists: false }, error: null };
      if (fn === 'check_saas_slug_availability') return { data: { available: true, normalized_slug: payload?.p_slug || 'testco' }, error: null };
      return { data: null, error: null };
    });
    await goToInfoStep();
    await fillInfoForm();
    await sendOtpFromInfo();
    await verifyOtp();
    expect(await screen.findByText('در حال آماده‌سازی تازه سیستم')).toBeTruthy();
  });

  it('shows the ready page when optional demo data is still loading', async () => {
    functionState.invoke.mockImplementation((name: string) => name === 'demo-data-admin'
      ? new Promise(() => undefined)
      : Promise.resolve({ data: { success: true }, error: null }));
    await goToInfoStep();
    await fillInfoForm();
    await sendOtpFromInfo();
    await verifyOtp();
    expect(await screen.findByText('فضای اختصاصی شما فعال شد!')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ورود به تست کو/ })).toBeEnabled();
    expect(screen.getByText('در حال آماده‌سازی داده‌های نمونه…')).toBeTruthy();
  });

  it('renews the revoked OTP session with the owner credentials before provisioning and seeding', async () => {
    await goToInfoStep();
    await fillInfoForm();
    await sendOtpFromInfo();
    await verifyOtp();
    await screen.findByText('فضای اختصاصی شما فعال شد!');
    await waitFor(() => expect(functionState.invoke).toHaveBeenCalledWith('demo-data-admin', expect.objectContaining({body: {action:'seed_org_demo_data',org_id:'demo-org'}})));
    expect(authState.signInWithPassword).toHaveBeenCalledWith({email:'owner@testco.ir',password:'secret1'});
    const setupIndex = functionState.invoke.mock.calls.findIndex(call => call[1]?.body?.action === 'setup_owner_credentials');
    const provisionIndex = rpcState.mock.calls.findIndex(call => call[0] === 'provision_self_service_demo');
    const seedIndex = functionState.invoke.mock.calls.findIndex(call => call[0] === 'demo-data-admin');
    const signInOrder = authState.signInWithPassword.mock.invocationCallOrder[0];
    expect(functionState.invoke.mock.invocationCallOrder[setupIndex]).toBeLessThan(signInOrder);
    expect(signInOrder).toBeLessThan(rpcState.mock.invocationCallOrder[provisionIndex]);
    expect(signInOrder).toBeLessThan(functionState.invoke.mock.invocationCallOrder[seedIndex]);
  });

  it('does not provision or seed when the refreshed owner identity differs', async () => {
    authState.signInWithPassword.mockResolvedValue({data:{user:{id:'another-user'},session:{access_token:'other-session'}},error:null});
    await goToInfoStep();
    await fillInfoForm();
    await sendOtpFromInfo();
    await verifyOtp();
    await screen.findByText(/اطلاعات مدیر ثبت شد، اما ورود مجدد کامل نشد/);
    expect(rpcState.mock.calls.some(call=>call[0]==='provision_self_service_demo')).toBe(false);
    expect(functionState.invoke.mock.calls.some(call=>call[0]==='demo-data-admin')).toBe(false);
    expect(authState.signOut).toHaveBeenCalled();
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
