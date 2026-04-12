import { useSyncExternalStore } from 'react';

export type OverlayNotificationKind = 'note' | 'task' | 'responsibility' | 'bot';

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

const recompute = () => {
  notifications = Object.values(notificationsBySource)
    .flat()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 6);
};

export const setUiNotificationOverlayItems = (items: UiNotificationOverlayItem[], source = 'default') => {
  notificationsBySource[source] = items;
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
