import { useSyncExternalStore } from 'react';

export type OverlayNotificationKind = 'note' | 'task' | 'responsibility' | 'bot' | 'assistant' | 'voip_call' | 'sms';
export type OverlayNotificationChannel = 'internal' | 'system' | 'bot' | 'sms' | 'voip' | 'generic';

export interface UiNotificationOverlayItem {
  id: string;
  kind: OverlayNotificationKind;
  channel?: OverlayNotificationChannel;
  kindLabel?: string;
  title: string;
  body: string;
  createdAt: string | null;
  hasAttachments?: boolean;
  onOpen: () => void;
  onDismiss?: () => void | Promise<void>;
  onSnooze?: (until: string) => void;
  onReply?: (text: string) => Promise<void>;
}

const listeners = new Set<() => void>();
let notificationsBySource: Record<string, UiNotificationOverlayItem[]> = {};
let notifications: UiNotificationOverlayItem[] = [];
const suppressedSources = new Set<string>();
const dismissedForSessionIds = new Set<string>();
const snoozedUntilById = new Map<string, number>();
const EMPTY_NOTIFICATIONS: UiNotificationOverlayItem[] = [];
let paginationSnapshot = {
  hasMore: false,
  loading: false,
  loadMore: null as (() => void) | null,
};

const emit = () => {
  listeners.forEach((listener) => listener());
};

const snapshot = () => (suppressedSources.size > 0 ? EMPTY_NOTIFICATIONS : notifications);
export const getUiNotificationOverlayItemsSnapshot = snapshot;

const normalizeItems = (items: UiNotificationOverlayItem[]) => {
  const unique = new Map<string, UiNotificationOverlayItem>();
  (items || []).forEach((item) => {
    const id = String(item?.id || '').trim();
    if (!id || dismissedForSessionIds.has(id)) return;
    const snoozedUntil = snoozedUntilById.get(id) || 0;
    if (snoozedUntil > Date.now()) return;
    if (snoozedUntil) snoozedUntilById.delete(id);
    unique.set(id, { ...item, id });
  });
  return Array.from(unique.values());
};

const areItemsPresentationEqual = (left: UiNotificationOverlayItem[], right: UiNotificationOverlayItem[]) => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];
    if (
      leftItem?.id !== rightItem?.id
      || leftItem?.kind !== rightItem?.kind
      || leftItem?.channel !== rightItem?.channel
      || leftItem?.kindLabel !== rightItem?.kindLabel
      || leftItem?.title !== rightItem?.title
      || leftItem?.body !== rightItem?.body
      || leftItem?.createdAt !== rightItem?.createdAt
      || Boolean(leftItem?.hasAttachments) !== Boolean(rightItem?.hasAttachments)
    ) {
      return false;
    }
  }
  return true;
};

const recompute = () => {
  const unique = new Map<string, UiNotificationOverlayItem>();
  Object.values(notificationsBySource)
    .flat()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .forEach((item) => {
      if (!unique.has(item.id)) unique.set(item.id, item);
    });
  notifications = Array.from(unique.values())
    .sort((a, b) => {
      const timeDiff = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      return timeDiff || String(a.id).localeCompare(String(b.id));
    });
};

export const setUiNotificationOverlayItems = (items: UiNotificationOverlayItem[], source = 'default') => {
  const normalizedItems = normalizeItems(items);
  const previous = notificationsBySource[source] || [];
  if (areItemsPresentationEqual(previous, normalizedItems)) {
    notificationsBySource[source] = normalizedItems;
    return;
  }
  notificationsBySource[source] = normalizedItems;
  recompute();
  emit();
};

export const setUiNotificationOverlaySuppressed = (suppressed: boolean, source = 'default') => {
  const normalizedSource = String(source || 'default').trim() || 'default';
  const hadSource = suppressedSources.has(normalizedSource);
  if (suppressed) {
    if (hadSource) return;
    suppressedSources.add(normalizedSource);
    emit();
    return;
  }
  if (!hadSource) return;
  suppressedSources.delete(normalizedSource);
  emit();
};

export const setUiNotificationOverlayPagination = (
  hasMore: boolean,
  loading: boolean,
  loadMore: (() => void) | null,
) => {
  paginationSnapshot = { hasMore, loading, loadMore };
  emit();
};

export const dismissUiNotificationOverlayItem = (id: string) => {
  const target = notifications.find((item) => item.id === id);
  if (!target) return;
  dismissedForSessionIds.add(id);
  target.onDismiss?.();
  Object.keys(notificationsBySource).forEach((source) => {
    notificationsBySource[source] = (notificationsBySource[source] || []).filter((item) => item.id !== id);
  });
  recompute();
  emit();
};

export const snoozeUiNotificationOverlayItem = (id: string, until: string) => {
  const target = notifications.find((item) => item.id === id);
  if (!target?.onSnooze) return;
  const snoozedUntil = new Date(until).getTime();
  if (Number.isFinite(snoozedUntil)) snoozedUntilById.set(id, snoozedUntil);
  target.onSnooze(until);
  Object.keys(notificationsBySource).forEach((source) => {
    notificationsBySource[source] = (notificationsBySource[source] || []).filter((item) => item.id !== id);
  });
  recompute();
  emit();
};

export const removeUiNotificationOverlayItem = (id: string) => {
  Object.keys(notificationsBySource).forEach((source) => {
    notificationsBySource[source] = (notificationsBySource[source] || []).filter((item) => item.id !== id);
  });
  recompute();
  emit();
};

export const useUiNotificationOverlayItems = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    snapshot,
  );

export const useUiNotificationOverlayPagination = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => paginationSnapshot,
    () => paginationSnapshot,
  );
