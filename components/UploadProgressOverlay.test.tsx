import React from 'react';
import App from 'antd/es/app';
import { MemoryRouter } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UploadProgressOverlay from './UploadProgressOverlay';
import './notifications/NotificationOverlayPanel';
import { setUiNotificationOverlayItems, setUiNotificationOverlayViewer, setUiNotificationOverlayExpanded } from '../utils/uiNotificationOverlayStore';

const emptyTasks: never[] = [];
afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.clear();
  }
});
vi.mock('../utils/uploadProgressStore', () => ({
  useUploadTasks: () => emptyTasks, cancelUploadTask: vi.fn(), retryUploadTask: vi.fn(),
}));

describe('notification panel navigation', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  });
  it('keeps the closed panel hidden across remounts and waits for an explicit reopen', async () => {
    setUiNotificationOverlayViewer('panel-org', 'panel-user');
    const item = { id: 'initial-panel', kind: 'note' as const, title: 'اعلان قبلی', body: 'متن پیام', createdAt: new Date(Date.now() - 60_000).toISOString(), onOpen: vi.fn(), onDismiss: vi.fn() };
    setUiNotificationOverlayItems([item], 'runtime');
    const tree = (route: string) => <App><MemoryRouter key={route} initialEntries={[route]}><UploadProgressOverlay /></MemoryRouter></App>;
    const { rerender } = render(tree('/leads'));
    fireEvent.click(await screen.findByRole('button', { name: 'نمایش اعلان‌ها و آپلودها' }));
    await screen.findByText('اعلان قبلی', {}, { timeout: 15000 });
    fireEvent.click(screen.getByRole('button', { name: 'بستن پنجره' }));
    expect(item.onDismiss).not.toHaveBeenCalled();
    rerender(tree('/customers'));
    act(() => { setUiNotificationOverlayItems([item, { ...item, id: 'old-page', title: 'صفحه قدیمی' }], 'runtime'); });
    expect(screen.queryByRole('button', { name: 'بستن پنجره' })).not.toBeInTheDocument();
    act(() => { setUiNotificationOverlayItems([{ ...item, id: 'fresh-panel', title: 'اعلان واقعاً جدید', createdAt: new Date(Date.now() + 1000).toISOString() }], 'runtime'); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'نمایش اعلان‌ها و آپلودها' })).toBeVisible());
    expect(screen.queryByRole('button', { name: 'بستن پنجره' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'نمایش اعلان‌ها و آپلودها' }));
    await screen.findByText('اعلان واقعاً جدید', {}, { timeout: 15000 });
  });
  it('preserves minimization over route remounts and incoming notifications', async () => {
    setUiNotificationOverlayViewer('compact-org', 'compact-user');
    setUiNotificationOverlayExpanded(false);
    const item = { id: 'compact-one', kind: 'note' as const, title: 'پیام خوانده‌نشده', body: 'متن', createdAt: new Date().toISOString(), onOpen: vi.fn() };
    setUiNotificationOverlayItems([item]);
    const tree = (route: string) => <App><MemoryRouter key={route} initialEntries={[route]}><UploadProgressOverlay /></MemoryRouter></App>;
    const { rerender } = render(tree('/leads'));
    fireEvent.click(await screen.findByRole('button', { name: 'نمایش اعلان‌ها و آپلودها' }));
    fireEvent.click(await screen.findByRole('button', { name: 'کوچک کردن پنجره' }));
    rerender(tree('/customers'));
    act(() => setUiNotificationOverlayItems([item, { ...item, id: 'compact-two' }]));
    expect(screen.getByRole('button', { name: 'نمایش اعلان‌ها و آپلودها' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'کوچک کردن پنجره' })).not.toBeInTheDocument();
  });
});
