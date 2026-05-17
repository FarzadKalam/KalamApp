import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SaasPortalPage from './SaasPortalPage';

const { authState, rpcState, supabaseMock } = vi.hoisted(() => {
  const authState = {
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
  };

  const rpcState = vi.fn();

  const supabaseMock = {
    auth: {
      signInWithOtp: (...args: any[]) => authState.signInWithOtp(...args),
      verifyOtp: (...args: any[]) => authState.verifyOtp(...args),
    },
    rpc: (...args: any[]) => rpcState(...args),
  };

  return {
    authState,
    rpcState,
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
    authState.signInWithOtp.mockResolvedValue({ error: null });
    authState.verifyOtp.mockResolvedValue({ error: null });
    rpcState.mockResolvedValue({ data: null, error: null });
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
});
