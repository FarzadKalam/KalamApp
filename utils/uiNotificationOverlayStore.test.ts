import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  dismissUiNotificationOverlayItem,
  getUiNotificationOverlayItemsSnapshot,
  removeUiNotificationOverlayItem,
  setUiNotificationOverlayItems,
  snoozeUiNotificationOverlayItem,
  hideUiNotificationOverlayItems,
  setUiNotificationOverlayViewer,
  closeUiNotificationOverlay,
  setUiNotificationOverlayPagination,
  useUiNotificationOverlayPagination,
  useUiNotificationOverlayExpanded,
  setUiNotificationOverlayExpanded,
  claimFreshOverlayAnnouncements,
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
  it('isolates panel expansion by viewer and remembers the user’s compact choice', () => {
    setUiNotificationOverlayViewer('exp-org', 'exp-user');
    const { result } = renderHook(useUiNotificationOverlayExpanded);
    expect(result.current).toBe(false);
    act(() => setUiNotificationOverlayExpanded(true));
    act(() => setUiNotificationOverlayViewer('exp-org', 'another-user'));
    expect(result.current).toBe(false);
    act(() => setUiNotificationOverlayViewer('exp-org', 'exp-user'));
    expect(result.current).toBe(true);
    act(() => setUiNotificationOverlayExpanded(false));
    act(() => setUiNotificationOverlayViewer('other-org', 'exp-user'));
    act(() => setUiNotificationOverlayViewer('exp-org', 'exp-user'));
    expect(result.current).toBe(false);
  });
  it('announces genuine new events once and never announces historical pagination', () => {
    setUiNotificationOverlayViewer('announce-org', 'announce-user');
    expect(claimFreshOverlayAnnouncements([buildItem('history')])).toEqual([]);
    const fresh = { ...buildItem('fresh'), createdAt: new Date(Date.now() + 1).toISOString() };
    expect(claimFreshOverlayAnnouncements([fresh])).toHaveLength(1);
    expect(claimFreshOverlayAnnouncements([fresh])).toEqual([]);
  });
  it('does not rerender pagination for unchanged polling results but uses the newest cursor callback', () => {
    setUiNotificationOverlayViewer('pagination-org', 'pagination-user');
    const previous = vi.fn(); const latest = vi.fn();
    setUiNotificationOverlayPagination(true, false, previous);
    const { result } = renderHook(useUiNotificationOverlayPagination);
    const snapshot = result.current;
    act(() => setUiNotificationOverlayPagination(true, false, latest));
    expect(result.current).toBe(snapshot);
    result.current.loadMore?.();
    expect(latest).toHaveBeenCalledOnce();
    expect(previous).not.toHaveBeenCalled();
  });
  it('reopens only for genuinely new events, not older pages fetched after closing', () => {
    setUiNotificationOverlayViewer('cutoff-org', 'cutoff-user');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
    setUiNotificationOverlayItems([buildItem('visible')]);
    closeUiNotificationOverlay();
    setUiNotificationOverlayItems([buildItem('older-not-previously-loaded')], 'other-page');
    expect(getUiNotificationOverlayItemsSnapshot()).toEqual([]);
    const fresh = { ...buildItem('genuinely-new'), createdAt: '2026-11-01T10:00:01Z' };
    setUiNotificationOverlayItems([fresh], 'push');
    expect(getUiNotificationOverlayItemsSnapshot().map((item) => item.id)).toEqual(['genuinely-new']);
    vi.useRealTimers();
  });
  it('keeps closed notifications hidden after a source unmount, reorder and refresh, without marking read', () => {
    setUiNotificationOverlayViewer('dismiss-org', 'dismiss-user');
    const read = vi.fn();
    const a = buildItem('old-a', { dismiss: read }); const b = buildItem('old-b');
    setUiNotificationOverlayItems([a, b], 'page');
    hideUiNotificationOverlayItems([a.id, b.id]);
    setUiNotificationOverlayItems([], 'page');
    setUiNotificationOverlayItems([b, a, buildItem('new')], 'page');
    expect(getUiNotificationOverlayItemsSnapshot().map((item) => item.id)).toEqual(['new']);
    expect(read).not.toHaveBeenCalled();
  });

  it('restores dismissal state for the same viewer but isolates users and organizations', () => {
    setUiNotificationOverlayViewer('org-a', 'user-a');
    setUiNotificationOverlayItems([buildItem('same-id')]);
    hideUiNotificationOverlayItems(['same-id']);
    for (const [org, user] of [['org-a', 'user-b'], ['org-b', 'user-a']]) {
      setUiNotificationOverlayViewer(org, user);
      expect(getUiNotificationOverlayItemsSnapshot()).toEqual([]);
      setUiNotificationOverlayItems([buildItem('same-id')]);
      expect(getUiNotificationOverlayItemsSnapshot()).toHaveLength(1);
    }
    setUiNotificationOverlayViewer('org-a', 'user-a');
    setUiNotificationOverlayItems([buildItem('same-id')]);
    expect(getUiNotificationOverlayItemsSnapshot()).toEqual([]);
  });

  it('does not resurrect a closed notification if its read callback throws', () => {
    setUiNotificationOverlayViewer('failure-org', 'failure-user');
    const item = buildItem('failed-read', { dismiss: () => { throw new Error('offline'); } });
    setUiNotificationOverlayItems([item]);
    expect(() => dismissUiNotificationOverlayItem(item.id)).not.toThrow();
    setUiNotificationOverlayItems([item]);
    expect(getUiNotificationOverlayItemsSnapshot()).toEqual([]);
  });

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
