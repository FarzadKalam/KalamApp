import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter } from 'react-router-dom';
import AppVersionUpdateBanner from './AppVersionUpdateBanner';
import { acknowledgeAppVersion, fetchAppVersionManifest, prepareAppRefresh } from '../utils/appVersionUpdate';

vi.mock('antd', () => ({
  App: { useApp: () => ({ message: { error: vi.fn() } }) },
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick: () => void }>) => <button onClick={onClick}>{children}</button>,
  Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

vi.mock('../utils/appVersionUpdate', async importOriginal => ({
  ...await importOriginal<typeof import('../utils/appVersionUpdate')>(),
  CURRENT_APP_VERSION: '3.30.2',
  fetchAppVersionManifest: vi.fn(),
  prepareAppRefresh: vi.fn(() => new Promise<void>(() => undefined)),
}));

const installed = { version: '3.30.2', changes: ['متن چت پس از ریلود حفظ می‌شود.'] };
const newer = { version: '3.31.0', changes: [] };
const renderBanner = (accountId: string) => render(
  <MemoryRouter initialEntries={['/ai']}>
    <AppVersionUpdateBanner accountId={accountId} />
    <Link to="/ai?filter=new">تغییر فیلتر</Link>
    <Link to="/invoices">رفتن به فاکتورها</Link>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(prepareAppRefresh).mockClear();
  vi.mocked(fetchAppVersionManifest).mockResolvedValue({ ...newer, releases: [newer, installed] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('app version availability', () => {
  it('leaves the current page alone after the old countdown and updates on navigation', async () => {
    acknowledgeAppVersion('seen-account', installed.version);
    renderBanner('seen-account');
    await act(() => vi.advanceTimersByTimeAsync(40_000));
    expect(screen.getByRole('button', { name: 'به‌روزرسانی' })).toBeInTheDocument();
    expect(prepareAppRefresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('تغییر فیلتر'));
    expect(prepareAppRefresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('رفتن به فاکتورها'));
    expect(prepareAppRefresh).toHaveBeenCalledExactlyOnceWith(newer.version, { force: false });
  });

  it('shows changes on return without a prior update click and persists dismissal', async () => {
    const rendered = renderBanner('returning-account-banner');
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText(installed.changes[0])).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'متوجه شدم' }));
    rendered.unmount();
    renderBanner('returning-account-banner');
    await act(() => vi.advanceTimersByTimeAsync(8000));
    expect(screen.queryByText(installed.changes[0])).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'به‌روزرسانی' }));
    expect(prepareAppRefresh).toHaveBeenCalledExactlyOnceWith(newer.version, { force: true });
  });
});
