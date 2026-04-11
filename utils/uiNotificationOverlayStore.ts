import { useSyncExternalStore } from 'react';

export type OverlayNotificationKind = 'note' | 'task' | 'responsibility';

export interface UiNotificationOverlayItem {
  id: string;
  kind: OverlayNotificationKind;
  title: string;
  body: string;
  createdAt: string | null;
  hasAttachments?: boolean;
  onOpen: () => void;
  onDismiss?: () => void;
}

const listeners = new Set<() => void>();
let notifications: UiNotificationOverlayItem[] = [];

const emit = () => {
  listeners.forEach((listener) => listener());
};

const snapshot = () => notifications;

export const setUiNotificationOverlayItems = (items: UiNotificationOverlayItem[]) => {
  notifications = items;
  emit();
};

export const dismissUiNotificationOverlayItem = (id: string) => {
  const target = notifications.find((item) => item.id === id);
  if (!target) return;
  target.onDismiss?.();
  notifications = notifications.filter((item) => item.id !== id);
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
