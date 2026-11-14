import { useSyncExternalStore } from 'react';
import type { NoteAttachment } from './noteContent';
import { setFeedbackScope } from './appFeedback';

export type OverlayNotificationKind = 'note' | 'task' | 'responsibility' | 'bot' | 'assistant' | 'agent' | 'voip_call' | 'sms' | 'email';
export type OverlayNotificationChannel = 'internal' | 'system' | 'bot' | 'agent' | 'sms' | 'voip' | 'generic' | 'email';

export interface UiNotificationOverlayItem {
  id: string;
  kind: OverlayNotificationKind;
  channel?: OverlayNotificationChannel;
  kindLabel?: string;
  priority?: number;
  title: string;
  subtitle?: string | null;
  body: string;
  attachments?: NoteAttachment[];
  avatarUrl?: string | null;
  avatarName?: string | null;
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
let viewerScope = '';
let viewerStartedAt = Date.now();
let panelExpanded = false;
const announcedIds = new Set<string>();
const presentationKey = () => `taze:overlay-presentation:v2:${viewerScope}`;
const persistPanel = () => {
  if (!viewerScope || typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(presentationKey(), JSON.stringify({ expanded: panelExpanded, announced: [...announcedIds].slice(-100) })); } catch { /* Optional viewer-local presentation storage. */ }
};
export const setUiNotificationOverlayExpanded = (expanded: boolean) => {
  if (expanded === panelExpanded) return;
  panelExpanded = expanded;
  persistPanel();
  emit();
};
export const useUiNotificationOverlayExpanded = () => useSyncExternalStore(
  listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  () => panelExpanded, () => false,
);
export const claimFreshOverlayAnnouncements = (items: UiNotificationOverlayItem[]) => {
  const fresh = items.filter(item => !announcedIds.has(item.id) && Date.parse(item.createdAt || '') >= viewerStartedAt);
  items.forEach(item => announcedIds.add(item.id));
  // Bounded session state: old pages are already excluded by viewerStartedAt.
  if (announcedIds.size > 200) [...announcedIds].slice(0, announcedIds.size - 100).forEach(id => announcedIds.delete(id));
  persistPanel();
  return fresh;
};
let closedThrough = 0;
const dismissalStorageKey = () => `taze:overlay-dismissed:v1:${viewerScope}`;
const persistDismissals = () => {
  if (!viewerScope || typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(dismissalStorageKey(), JSON.stringify({ ids: [...dismissedForSessionIds], closedThrough })); }
  catch { /* A blocked/full session store must not prevent local dismissal. */ }
};
const snoozedUntilById = new Map<string, number>();
const EMPTY_NOTIFICATIONS: UiNotificationOverlayItem[] = [];
let currentLoadMore: (() => void) | null = null;
const loadMoreCurrentPage = () => currentLoadMore?.();
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

/** Viewer-local presentation state; closing the overlay does not mark messages read. */
export const setUiNotificationOverlayViewer = (orgId: string, userId: string) => {
  const nextScope = orgId && userId ? JSON.stringify([orgId, userId]) : '';
  if (nextScope === viewerScope) return;
  viewerScope = nextScope;
  viewerStartedAt = Date.now();
  panelExpanded = false;
  announcedIds.clear();
  setFeedbackScope(nextScope);
  if (viewerScope && typeof window !== 'undefined') {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(presentationKey()) || '{}');
      panelExpanded = saved?.expanded === true;
      if (Array.isArray(saved?.announced)) saved.announced.forEach((id: unknown) => { if (typeof id === 'string') announcedIds.add(id); });
    } catch { /* Keep the compact default for unavailable or corrupt storage. */ }
  }
  dismissedForSessionIds.clear();
  closedThrough = 0;
  snoozedUntilById.clear();
  if (viewerScope && typeof window !== 'undefined') {
    try {
      const stored: unknown = JSON.parse(window.sessionStorage.getItem(dismissalStorageKey()) || '[]');
      const saved = stored as { ids?: unknown; closedThrough?: unknown } | null;
      const ids = Array.isArray(stored) ? stored : saved?.ids;
      if (Array.isArray(ids)) ids.forEach((id) => { if (typeof id === 'string') dismissedForSessionIds.add(id); });
      if (typeof saved?.closedThrough === 'number' && Number.isFinite(saved.closedThrough)) closedThrough = saved.closedThrough;
    } catch { /* Ignore corrupt or unavailable presentation storage. */ }
  }
  notificationsBySource = {};
  notifications = [];
  currentLoadMore = null;
  paginationSnapshot = { hasMore: false, loading: false, loadMore: null };
  emit();
};

export const hideUiNotificationOverlayItems = (ids: string[]) => {
  ids.forEach((id) => dismissedForSessionIds.add(id));
  persistDismissals();
  Object.keys(notificationsBySource).forEach((source) => {
    notificationsBySource[source] = notificationsBySource[source].filter((item) => !dismissedForSessionIds.has(item.id));
  });
  recompute();
  emit();
};

export const closeUiNotificationOverlay = () => {
  setUiNotificationOverlayExpanded(false);
  // A later feed page may contain unseen old rows. They are not new events.
  closedThrough = Date.now();
  hideUiNotificationOverlayItems(notifications.map((item) => item.id));
};

const normalizeItems = (items: UiNotificationOverlayItem[]) => {
  const unique = new Map<string, UiNotificationOverlayItem>();
  (items || []).forEach((item) => {
    const id = String(item?.id || '').trim();
    if (!id || dismissedForSessionIds.has(id)) return;
    const createdAt = Date.parse(item.createdAt || '');
    if (closedThrough && (!Number.isFinite(createdAt) || createdAt <= closedThrough)) return;
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
    const leftAttachments = leftItem?.attachments || [];
    const rightAttachments = rightItem?.attachments || [];
    const attachmentsEqual = leftAttachments.length === rightAttachments.length
      && leftAttachments.every((attachment, attachmentIndex) => {
        const other = rightAttachments[attachmentIndex];
        return String(attachment?.url || '') === String(other?.url || '')
          && String(attachment?.name || '') === String(other?.name || '')
          && String(attachment?.mimeType || '') === String(other?.mimeType || '')
          && String(attachment?.fileType || '') === String(other?.fileType || '');
      });
    if (
      leftItem?.id !== rightItem?.id
      || leftItem?.kind !== rightItem?.kind
      || leftItem?.channel !== rightItem?.channel
      || leftItem?.kindLabel !== rightItem?.kindLabel
      || Number(leftItem?.priority || 0) !== Number(rightItem?.priority || 0)
      || leftItem?.title !== rightItem?.title
      || leftItem?.subtitle !== rightItem?.subtitle
      || leftItem?.body !== rightItem?.body
      || leftItem?.avatarUrl !== rightItem?.avatarUrl
      || leftItem?.avatarName !== rightItem?.avatarName
      || leftItem?.createdAt !== rightItem?.createdAt
      || Boolean(leftItem?.hasAttachments) !== Boolean(rightItem?.hasAttachments)
      || !attachmentsEqual
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
    .sort((a, b) => {
      const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    })
    .forEach((item) => {
      if (!unique.has(item.id)) unique.set(item.id, item);
    });
  notifications = Array.from(unique.values())
    .sort((a, b) => {
      const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0);
      const timeDiff = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      return priorityDiff || timeDiff || String(a.id).localeCompare(String(b.id));
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
  currentLoadMore = loadMore;
  const stableLoadMore = loadMore ? loadMoreCurrentPage : null;
  if (paginationSnapshot.hasMore === hasMore && paginationSnapshot.loading === loading && paginationSnapshot.loadMore === stableLoadMore) return;
  paginationSnapshot = { hasMore, loading, loadMore: stableLoadMore };
  emit();
};

export const dismissUiNotificationOverlayItem = (id: string) => {
  const target = notifications.find((item) => item.id === id);
  if (!target) return;
  hideUiNotificationOverlayItems([id]);
  // Network failures cannot undo the user's local close action.
  try { void Promise.resolve(target.onDismiss?.()).catch(() => undefined); }
  catch { /* Keep the local dismissal even if a source callback fails. */ }
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

export type UiNotificationOverlayUnreadSummary = {
  ready: boolean;
  communicationUnread: number;
  alertsUnread: number;
  summary: Record<string, number>;
};

const DEFAULT_UNREAD_SUMMARY: UiNotificationOverlayUnreadSummary = {
  ready: false,
  communicationUnread: 0,
  alertsUnread: 0,
  summary: {},
};

let unreadSummarySnapshot: UiNotificationOverlayUnreadSummary = DEFAULT_UNREAD_SUMMARY;

export const setUiNotificationOverlayUnreadSummary = (patch: Partial<UiNotificationOverlayUnreadSummary>) => {
  unreadSummarySnapshot = {
    ...unreadSummarySnapshot,
    ...patch,
    ready: patch.ready ?? true,
  };
  emit();
};

export const useUiNotificationOverlayUnreadSummary = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => unreadSummarySnapshot,
    () => DEFAULT_UNREAD_SUMMARY,
  );
