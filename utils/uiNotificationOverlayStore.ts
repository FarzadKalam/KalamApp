import { useSyncExternalStore } from 'react';

export type OverlayNotificationKind = 'note' | 'task' | 'responsibility' | 'bot' | 'assistant' | 'voip_call' | 'sms';

export interface UiNotificationOverlayItem {
  id: string;
  kind: OverlayNotificationKind;
  kindLabel?: string;
  title: string;
  body: string;
  createdAt: string | null;
  hasAttachments?: boolean;
  onOpen: () => void;
  onDismiss?: () => void;
}

const listeners = new Set<() => void>();
let notificationsBySource: Record<string, UiNotificationOverlayItem[]> = {};
let notifications: UiNotificationOverlayItem[] = [];

const emit = () => {
  listeners.forEach((listener) => listener());
};

const snapshot = () => notifications;

const normalizeItems = (items: UiNotificationOverlayItem[]) => {
  const unique = new Map<string, UiNotificationOverlayItem>();
  (items || []).forEach((item) => {
    const id = String(item?.id || '').trim();
    if (!id) return;
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
    })
    .slice(0, 6);
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

export const dismissUiNotificationOverlayItem = (id: string) => {
  const target = notifications.find((item) => item.id === id);
  if (!target) return;
  target.onDismiss?.();
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
