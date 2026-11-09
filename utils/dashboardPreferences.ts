import { useSyncExternalStore } from 'react';

export type DashboardPreferences = {
  moduleIds?: string[];
  reportIds?: string[];
  hiddenWidgets: string[];
  widgetOrder: string[];
};
const EMPTY: DashboardPreferences = { hiddenWidgets: [], widgetOrder: [] };
const snapshots = new Map<string, DashboardPreferences>();
const listeners = new Set<() => void>();
const keyFor = (orgId?: string | null, userId?: string | null) => orgId && userId ? `kalam:dashboard:v1:${orgId}:${userId}` : '';
const strings = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length < 160))].slice(0, 100) : [];
export const readDashboardPreferences = (orgId?: string | null, userId?: string | null): DashboardPreferences => {
  const key = keyFor(orgId, userId);
  if (!key || typeof window === 'undefined') return EMPTY;
  const cached = snapshots.get(key);
  if (cached) return cached;
  let next = EMPTY;
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (saved && typeof saved === 'object') next = {
      hiddenWidgets: strings(saved.hiddenWidgets), widgetOrder: strings(saved.widgetOrder),
      ...(Array.isArray(saved.moduleIds) ? { moduleIds: strings(saved.moduleIds).slice(0, 6) } : {}),
      ...(Array.isArray(saved.reportIds) ? { reportIds: strings(saved.reportIds) } : {}),
    };
  } catch { /* Local preferences are optional; access remains authoritative. */ }
  snapshots.set(key, next);
  return next;
};
export const updateDashboardPreferences = (orgId: string | null | undefined, userId: string | null | undefined, patch: Partial<DashboardPreferences>) => {
  const key = keyFor(orgId, userId);
  if (!key) return;
  const next = { ...readDashboardPreferences(orgId, userId), ...patch };
  snapshots.set(key, next);
  try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* Retain the current session's selection. */ }
  listeners.forEach(notify => notify());
};
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key && !event.key.startsWith('kalam:dashboard:v1:')) return;
  if (event.key) snapshots.delete(event.key); else snapshots.clear();
  listeners.forEach(notify => notify());
});
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
export const useDashboardPreferences = (orgId?: string | null, userId?: string | null) => useSyncExternalStore(subscribe, () => readDashboardPreferences(orgId, userId), () => EMPTY);
