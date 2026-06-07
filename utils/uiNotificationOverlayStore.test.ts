import { describe, expect, it, vi } from 'vitest';
import {
  dismissUiNotificationOverlayItem,
  getUiNotificationOverlayItemsSnapshot,
  removeUiNotificationOverlayItem,
  setUiNotificationOverlayItems,
  snoozeUiNotificationOverlayItem,
} from './uiNotificationOverlayStore';

const buildItem = (id: string, callbacks: { dismiss?: () => void; snooze?: (until: string) => void } = {}) => ({
  id,
  kind: 'note' as const,
  title: 'پیام',
  body: 'متن',
  createdAt: '2026-06-06T10:00:00.000Z',
  onOpen: vi.fn(),
  onDismiss: callbacks.dismiss,
  onSnooze: callbacks.snooze,
});

describe('ui notification overlay store', () => {
  it('keeps a locally closed item hidden when its source refreshes', () => {
    const onDismiss = vi.fn();
    const item = buildItem('dismiss-once', { dismiss: onDismiss });
    setUiNotificationOverlayItems([item], 'dismiss-test');
    dismissUiNotificationOverlayItem(item.id);
    setUiNotificationOverlayItems([item], 'dismiss-test');
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(getUiNotificationOverlayItemsSnapshot().some((entry) => entry.id === item.id)).toBe(false);
  });

  it('snoozes display without invoking dismiss behavior', () => {
    const onDismiss = vi.fn();
    const onSnooze = vi.fn();
    const item = buildItem('snooze-once', { dismiss: onDismiss, snooze: onSnooze });
    const until = '2099-01-01T00:00:00.000Z';
    setUiNotificationOverlayItems([item], 'snooze-test');
    snoozeUiNotificationOverlayItem(item.id, until);
    setUiNotificationOverlayItems([item], 'snooze-test');
    expect(onSnooze).toHaveBeenCalledWith(until);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(getUiNotificationOverlayItemsSnapshot().some((entry) => entry.id === item.id)).toBe(false);
  });

  it('removes a quick-replied item without marking it dismissed', () => {
    const onDismiss = vi.fn();
    const item = buildItem('quick-reply', { dismiss: onDismiss });
    setUiNotificationOverlayItems([item], 'quick-reply-test');
    removeUiNotificationOverlayItem(item.id);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(getUiNotificationOverlayItemsSnapshot().some((entry) => entry.id === item.id)).toBe(false);
  });
});
