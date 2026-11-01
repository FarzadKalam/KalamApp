import React from 'react';
import App from 'antd/es/app';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UploadProgressOverlay from './UploadProgressOverlay';
import { setUiNotificationOverlayItems, setUiNotificationOverlayViewer } from '../utils/uiNotificationOverlayStore';

const emptyTasks: never[] = [];
vi.mock('../utils/uploadProgressStore', () => ({
  useUploadTasks: () => emptyTasks, cancelUploadTask: vi.fn(), retryUploadTask: vi.fn(),
}));

describe('notification panel navigation', () => {
  it('keeps the closed panel hidden across route remounts and reopens for a fresh notification', async () => {
    setUiNotificationOverlayViewer('panel-org', 'panel-user');
    const item = { id: 'initial-panel', kind: 'note' as const, title: 'اعلان قبلی', body: 'متن پیام', createdAt: new Date(Date.now() - 60_000).toISOString(), onOpen: vi.fn(), onDismiss: vi.fn() };
    setUiNotificationOverlayItems([item], 'runtime');
    const tree = (route: string) => <App><MemoryRouter key={route} initialEntries={[route]}><UploadProgressOverlay /></MemoryRouter></App>;
    const { rerender } = render(tree('/leads'));
    await screen.findByText('اعلان قبلی');
    fireEvent.click(screen.getByRole('button', { name: 'بستن پنجره' }));
    expect(item.onDismiss).not.toHaveBeenCalled();
    rerender(tree('/customers'));
    act(() => { setUiNotificationOverlayItems([item, { ...item, id: 'old-page', title: 'صفحه قدیمی' }], 'runtime'); });
    expect(screen.queryByRole('button', { name: 'بستن پنجره' })).not.toBeInTheDocument();
    act(() => { setUiNotificationOverlayItems([{ ...item, id: 'fresh-panel', title: 'اعلان واقعاً جدید', createdAt: new Date(Date.now() + 1000).toISOString() }], 'runtime'); });
    await waitFor(() => expect(screen.getByText('اعلان واقعاً جدید')).toBeVisible());
  });
});
