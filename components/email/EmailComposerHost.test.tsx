import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), bootstrap: vi.fn() }));
vi.mock('../../supabaseClient', () => ({ supabase: { rpc: async () => ({ data: true, error: null }) } }));
vi.mock('../../utils/sessionCache', () => ({ fetchSessionBootstrap: mocks.bootstrap }));
vi.mock('../../utils/organizationEmail', () => ({ invokeEmail: mocks.invoke, isEmailAddress: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) }));
import EmailComposerHost from './EmailComposerHost';
import { useEmailComposerStore } from '../../utils/emailComposerStore';
beforeEach(() => {
  mocks.bootstrap.mockReset().mockResolvedValue({ orgId: 'org-a' });
  mocks.invoke.mockReset().mockImplementation(async (endpoint: string) => endpoint === 'email-admin' ? { accounts: [{ id: 'account-a', address: 'office@example.com', label: 'ایمیل سازمان', is_active: true }] } : { success: true, message: 'پذیرفته شد' });
  useEmailComposerStore.getState().open({ to: ['recipient@example.com'], subject: 'موضوع تست', body: 'متن نامه' });
});
afterEach(() => { act(() => useEmailComposerStore.getState().close()); cleanup(); });
const ready = async () => { render(<EmailComposerHost />); await waitFor(() => expect(screen.getByRole('button', { name: /ارسال ایمیل/ })).not.toBeDisabled()); };
describe('shared email composer', () => {
  it('renders email fields and sends only after an explicit send action', async () => {
    await ready();
    expect(screen.getByLabelText('رونوشت')).toBeInTheDocument(); expect(screen.getByLabelText('رونوشت مخفی')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText('متن ایمیل'), { key: 'Enter', code: 'Enter' });
    expect(mocks.invoke.mock.calls.filter(([endpoint]) => endpoint === 'send-email')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /ارسال ایمیل/ }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('send-email', expect.objectContaining({ account_id: 'account-a', to: ['recipient@example.com'], subject: 'موضوع تست', body: 'متن نامه', request_key: expect.any(String) })));
  });
  it('keeps the draft visible after failure and stops retries after an uncertain transport result', async () => {
    await ready(); mocks.invoke.mockRejectedValueOnce(Object.assign(new Error('نتیجه ارسال نامشخص است'), { transportAccepted: true }));
    fireEvent.click(screen.getByRole('button', { name: /ارسال ایمیل/ }));
    await screen.findByText('نتیجه ارسال نامشخص است');
    expect(screen.getByRole('button', { name: /ارسال ایمیل/ })).toBeDisabled();
    expect(screen.getByLabelText('متن ایمیل')).toHaveValue('متن نامه');
  });
  it('blocks sending when the active organization changed while the draft was open', async () => {
    await ready(); mocks.bootstrap.mockResolvedValue({ orgId: 'org-b' });
    fireEvent.click(screen.getByRole('button', { name: /ارسال ایمیل/ }));
    await screen.findByText(/سازمان فعال تغییر کرده/);
    expect(mocks.invoke.mock.calls.filter(([endpoint]) => endpoint === 'send-email')).toHaveLength(0);
  });
});
