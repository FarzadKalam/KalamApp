import React from 'react';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const {
  mockNavigate,
  mockTrackSuccessfulLogin,
  authState,
  functionState,
  rpcState,
  supabaseMock,
  getDbState,
  setDbState,
} = vi.hoisted(() => {
  type DbRow = Record<string, any>;
  type MockDb = Record<string, DbRow[]>;

  const authState = {
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    getUser: vi.fn(),
    onAuthStateChange: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
  };

  const functionState = {
    invoke: vi.fn(),
  };

  const rpcState = vi.fn();
  let dbState: MockDb = {};

  const normalizeScalar = (value: unknown) => String(value ?? '').trim().toLowerCase();

  class MockFromQuery<T = any> implements PromiseLike<T> {
    private filters: Array<{ type: 'eq' | 'neq'; key: string; value: any }> = [];
    private selectExpr: string | null = null;
    private limitCount: number | null = null;
    private singleMode = false;
    private maybeSingleMode = false;
    private orderKey: string | null = null;
    private ascending = true;

    constructor(
      private table: string,
      private action: 'select' | 'update' | 'upsert' | 'insert',
      private payload?: any
    ) {}

    select(expr: string) {
      this.selectExpr = expr;
      return this;
    }

    eq(key: string, value: any) {
      this.filters.push({ type: 'eq', key, value });
      return this;
    }

    neq(key: string, value: any) {
      this.filters.push({ type: 'neq', key, value });
      return this;
    }

    limit(value: number) {
      this.limitCount = value;
      return this;
    }

    order(key: string, options?: { ascending?: boolean }) {
      this.orderKey = key;
      this.ascending = options?.ascending !== false;
      return this;
    }

    maybeSingle() {
      this.maybeSingleMode = true;
      return this;
    }

    single() {
      this.singleMode = true;
      return this;
    }

    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      return this.execute().then(onfulfilled as any, onrejected as any);
    }

    private async execute(): Promise<any> {
      const rows = dbState[this.table] || (dbState[this.table] = []);
      if (this.action === 'update') {
        const matched = this.applyFilters(rows);
        matched.forEach((row) => Object.assign(row, this.payload || {}));
        return { data: matched.map((row) => ({ ...row })), error: null };
      }
      if (this.action === 'upsert') {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload];
        items.forEach((item: any) => {
          const existingIndex = rows.findIndex((row) => String(row.id || '') === String(item.id || ''));
          if (existingIndex >= 0) {
            rows[existingIndex] = { ...rows[existingIndex], ...item };
          } else {
            rows.push({ ...item });
          }
        });
        return { data: items, error: null };
      }
      if (this.action === 'insert') {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload];
        items.forEach((item: any) => rows.push({ ...item }));
        return { data: items, error: null };
      }

      let matched = this.applyFilters(rows).map((row) => ({ ...row }));
      if (this.orderKey) {
        matched = matched.sort((left, right) => {
          const a = String(left[this.orderKey || ''] ?? '');
          const b = String(right[this.orderKey || ''] ?? '');
          return this.ascending ? a.localeCompare(b) : b.localeCompare(a);
        });
      }
      if (this.limitCount != null) matched = matched.slice(0, this.limitCount);
      const projected = matched.map((row) => this.projectRow(row));
      if (this.singleMode || this.maybeSingleMode) {
        return { data: projected[0] ?? null, error: null };
      }
      return { data: projected, error: null };
    }

    private applyFilters(rows: DbRow[]) {
      return rows.filter((row) =>
        this.filters.every((filter) => {
          if (filter.type === 'eq') {
            return normalizeScalar(row[filter.key]) === normalizeScalar(filter.value);
          }
          return normalizeScalar(row[filter.key]) !== normalizeScalar(filter.value);
        })
      );
    }

    private projectRow(row: DbRow) {
      if (!this.selectExpr || this.selectExpr === '*') return row;
      const keys = this.selectExpr.split(',').map((item) => item.trim()).filter(Boolean);
      const next: DbRow = {};
      keys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(row, key)) next[key] = row[key];
      });
      return next;
    }
  }

  const supabaseMock = {
    auth: {
      signInWithOtp: (...args: any[]) => authState.signInWithOtp(...args),
      verifyOtp: (...args: any[]) => authState.verifyOtp(...args),
      signInWithPassword: (...args: any[]) => authState.signInWithPassword(...args),
      signOut: (...args: any[]) => authState.signOut(...args),
      getSession: (...args: any[]) => authState.getSession(...args),
      getUser: (...args: any[]) => authState.getUser(...args),
      onAuthStateChange: (...args: any[]) => authState.onAuthStateChange(...args),
      resetPasswordForEmail: (...args: any[]) => authState.resetPasswordForEmail(...args),
      updateUser: (...args: any[]) => authState.updateUser(...args),
    },
    functions: {
      invoke: (...args: any[]) => functionState.invoke(...args),
    },
    rpc: (...args: any[]) => rpcState(...args),
    from(table: string) {
      return {
        select: (expr: string) => new MockFromQuery(table, 'select').select(expr),
        update: (payload: any) => new MockFromQuery(table, 'update', payload),
        upsert: (payload: any) => new MockFromQuery(table, 'upsert', payload),
        insert: (payload: any) => new MockFromQuery(table, 'insert', payload),
      };
    },
  };

  return {
    mockNavigate: vi.fn(),
    mockTrackSuccessfulLogin: vi.fn(),
    authState,
    functionState,
    rpcState,
    supabaseMock,
    getDbState: () => dbState,
    setDbState: (next: MockDb) => {
      dbState = next;
    },
  };
});

vi.mock('../utils/brandingRuntime', () => ({
  readRuntimeBranding: vi.fn(() => ({
    appTitle: 'برند تست',
    brandName: 'برند تست',
    logoUrl: null,
  })),
}));

vi.mock('../utils/userLoginTracking', () => ({
  trackSuccessfulLogin: (...args: any[]) => mockTrackSuccessfulLogin(...args),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: '', hash: '' }),
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: supabaseMock,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
}));

const renderLogin = () =>
  render(
    <App>
      <Login />
    </App>
  );

const switchToOtpTab = async () => {
  fireEvent.click(screen.getByText('کد یکبارمصرف'));
  await screen.findByText('ورود با کد یکبارمصرف');
};

const setOtpPhone = (value: string) => {
  const input = screen.getByPlaceholderText('0912...');
  fireEvent.change(input, { target: { value } });
};

const clickRequestOtp = () => {
  fireEvent.click(screen.getByText('دریافت کد'));
};

describe('Login OTP and password flows', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockNavigate.mockReset();
    mockTrackSuccessfulLogin.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    setDbState({
      profiles: [],
      organizations: [{ id: 'org-1', created_at: '2026-01-01' }],
      org_roles: [{ id: 'role-viewer', title: 'viewer', org_id: 'org-1', created_at: '2026-01-01' }],
      user_login_events: [],
    });
    authState.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    authState.signOut.mockResolvedValue({ error: null });
    authState.getSession.mockResolvedValue({ data: { session: { access_token: 'session-token' } }, error: null });
    authState.resetPasswordForEmail.mockResolvedValue({ error: null });
    authState.updateUser.mockResolvedValue({ error: null });
    rpcState.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('requests OTP with normalized Iranian mobile and accepted existing phone identity', async () => {
    rpcState.mockImplementation(async (fn: string) => {
      if (fn === 'check_phone_login_candidate') {
        return {
          data: {
            exists_in_profiles: true,
            exists_in_auth: true,
            has_phone_identity: true,
            is_active: true,
          },
          error: null,
        };
      }
      if (fn === 'lookup_phone_signup_invite') {
        return { data: { exists: false }, error: null };
      }
      return { data: null, error: null };
    });
    authState.signInWithOtp.mockResolvedValue({ error: null });

    renderLogin();
    await switchToOtpTab();
    setOtpPhone('۰۹۱۲۱۲۳۴۵۶۷');
    clickRequestOtp();

    await waitFor(() => {
      expect(authState.signInWithOtp).toHaveBeenCalledWith({ phone: '+989121234567' });
    });
    expect(screen.getByText('ورود با کد')).toBeInTheDocument();
    expect(document.body.textContent || '').toContain('ارسال مجدد تا 90 ثانیه دیگر');
  });

  it('shows sync-required error when profile exists but auth phone identity is not ready', async () => {
    rpcState.mockImplementation(async (fn: string) => {
      if (fn === 'check_phone_login_candidate') {
        return {
          data: {
            exists_in_profiles: true,
            exists_in_auth: false,
            has_phone_identity: false,
            is_active: true,
          },
          error: null,
        };
      }
      if (fn === 'lookup_phone_signup_invite') {
        return { data: { exists: false }, error: null };
      }
      return { data: null, error: null };
    });

    renderLogin();
    await switchToOtpTab();
    setOtpPhone('09121234567');
    clickRequestOtp();

    await waitFor(() => {
      expect(document.body.textContent || '').toContain('شماره این کاربر برای ورود پیامکی آماده نیست');
    });
    expect(authState.signInWithOtp).not.toHaveBeenCalled();
  });

  it('verifies OTP successfully and completes login for an active profile', async () => {
    rpcState.mockImplementation(async (fn: string) => {
      if (fn === 'check_phone_login_candidate') {
        return {
          data: {
            exists_in_profiles: true,
            exists_in_auth: true,
            has_phone_identity: true,
            is_active: true,
          },
          error: null,
        };
      }
      if (fn === 'lookup_phone_signup_invite') {
        return { data: { exists: false }, error: null };
      }
      return { data: null, error: null };
    });
    getDbState().profiles = [
      {
        id: 'user-1',
        is_active: true,
        org_id: 'org-1',
        role_id: 'role-viewer',
        role: 'viewer',
        mobile_1: '09121234567',
        email: 'user@test.local',
        full_name: 'کاربر تست',
      },
    ];
    authState.signInWithOtp.mockResolvedValue({ error: null });
    authState.verifyOtp.mockResolvedValue({ error: null });
    authState.getUser.mockResolvedValue({ data: { user: { id: 'user-1', phone: '+989121234567', email: 'user@test.local' } }, error: null });

    renderLogin();
    await switchToOtpTab();
    setOtpPhone('09121234567');
    clickRequestOtp();
    await screen.findByText('ورود با کد');

    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '۱۲۳۴۵۶' } });
    fireEvent.click(screen.getByText('ورود با کد'));

    await waitFor(() => {
      expect(authState.verifyOtp).toHaveBeenCalledWith({
        phone: '+989121234567',
        token: '123456',
        type: 'sms',
      });
    });
    await waitFor(() => {
      expect(mockTrackSuccessfulLogin).toHaveBeenCalledWith('otp');
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
    expect(document.body.textContent || '').toContain('ورود با موفقیت انجام شد');
  }, 15000);

  it('repairs legacy phone conflict and continues login with the verified session', async () => {
    rpcState.mockImplementation(async (fn: string) => {
      if (fn === 'check_phone_login_candidate') {
        return {
          data: {
            exists_in_profiles: true,
            exists_in_auth: true,
            has_phone_identity: true,
            is_active: true,
          },
          error: null,
        };
      }
      if (fn === 'lookup_phone_signup_invite') {
        return { data: { exists: false }, error: null };
      }
      if (fn === 'consume_phone_signup_invite') {
        return { data: { success: false }, error: null };
      }
      return { data: null, error: null };
    });
    getDbState().profiles = [
      {
        id: 'conflict-user',
        org_id: 'org-1',
        role_id: 'role-viewer',
        role: 'viewer',
        mobile_1: '09125555555',
        email: 'conflict@test.local',
        full_name: 'کاربر قدیمی',
        is_active: true,
      },
    ];
    authState.signInWithOtp
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null });
    authState.verifyOtp.mockResolvedValue({ error: null });
    authState.getUser.mockResolvedValue({ data: { user: { id: 'new-user', phone: '+989125555555', email: 'new@test.local' } }, error: null });
    functionState.invoke.mockResolvedValue({ data: { success: true, repaired: true }, error: null });

    renderLogin();
    await switchToOtpTab();
    setOtpPhone('09125555555');
    clickRequestOtp();
    await screen.findByText('ورود با کد');

    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '1111' } });
    fireEvent.click(screen.getByText('ورود با کد'));

    await waitFor(() => {
      expect(functionState.invoke).toHaveBeenCalledWith('user-admin', {
        body: {
          action: 'repair_legacy_phone_login',
          phone: '+989125555555',
        },
        headers: {
          Authorization: 'Bearer session-token',
        },
      });
    });
    await waitFor(() => {
      expect(mockTrackSuccessfulLogin).toHaveBeenCalledWith('otp');
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
    expect(authState.signOut).not.toHaveBeenCalled();
    expect(authState.signInWithOtp).toHaveBeenCalledTimes(1);
  }, 15000);

  it('blocks invited otp login when invite conflicts with another org ownership', async () => {
    rpcState.mockImplementation(async (fn: string) => {
      if (fn === 'check_phone_login_candidate') {
        return {
          data: {
            exists_in_profiles: false,
            exists_in_auth: false,
            has_phone_identity: false,
            is_active: false,
          },
          error: null,
        };
      }
      if (fn === 'lookup_phone_signup_invite') {
        return {
          data: {
            exists: true,
            is_active: true,
            org_id: 'org-2',
          },
          error: null,
        };
      }
      if (fn === 'consume_phone_signup_invite') {
        return {
          data: {
            success: false,
            reason: 'profile_org_conflict',
            existing_org_id: 'org-1',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    authState.signInWithOtp.mockResolvedValue({ error: null });
    authState.verifyOtp.mockResolvedValue({ error: null });
    authState.getUser.mockResolvedValue({ data: { user: { id: 'user-invite-conflict', phone: '+989121234567', email: 'conflict@test.local' } }, error: null });

    renderLogin();
    await switchToOtpTab();
    setOtpPhone('09121234567');
    clickRequestOtp();
    await screen.findByText('ورود با کد');

    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('ورود با کد'));

    await waitFor(() => {
      expect(authState.signOut).toHaveBeenCalled();
    });
    expect(document.body.textContent || '').toContain('به یک سازمان دیگر متصل یا برای آن رزرو شده است');
    expect(mockNavigate).not.toHaveBeenCalled();
  }, 15000);

  it('blocks password login for inactive users after successful auth', async () => {
    getDbState().profiles = [
      {
        id: 'user-2',
        is_active: false,
        org_id: 'org-1',
        role_id: 'role-viewer',
        role: 'viewer',
        mobile_1: '09120000000',
        email: 'inactive@test.local',
        full_name: 'کاربر غیرفعال',
      },
    ];
    authState.signInWithPassword.mockResolvedValue({ error: null });
    authState.getUser.mockResolvedValue({ data: { user: { id: 'user-2', email: 'inactive@test.local', phone: '+989120000000' } }, error: null });

    renderLogin();
    fireEvent.change(screen.getByPlaceholderText('admin@example.com'), { target: { value: 'inactive@test.local' } });
    const passwordInputs = document.body.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0] as HTMLInputElement, { target: { value: 'secret123' } });
    fireEvent.click(screen.getByText('ورود'));

    await waitFor(() => {
      expect(authState.signOut).toHaveBeenCalled();
    });
    expect(document.body.textContent || '').toContain('حساب کاربری شما غیرفعال است');
    expect(mockNavigate).not.toHaveBeenCalled();
  }, 15000);

  it('restores OTP session state and cooldown from storage', async () => {
    localStorage.setItem('kalam_login_mode', 'otp');
    sessionStorage.setItem('kalam_login_otp_phone', '09127778888');
    sessionStorage.setItem('kalam_login_otp_requested_for', '+989127778888');
    sessionStorage.setItem('kalam_login_otp_code', '4321');
    sessionStorage.setItem('kalam_login_otp_cooldown_until', String(Date.now() + 30_000));

    renderLogin();
    await screen.findByText('ورود با کد یکبارمصرف');

    expect((screen.getByPlaceholderText('0912...') as HTMLInputElement).value).toBe('09127778888');
    expect((screen.getByPlaceholderText('123456') as HTMLInputElement).value).toBe('');
    expect(document.body.textContent || '').toContain('ارسال مجدد تا');
  });
});
