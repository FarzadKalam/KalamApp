import { useSyncExternalStore } from 'react';

export type DashboardPreferences = {
  moduleIds?: string[];
  reportIds?: string[];
  defaultReportId?: string;
  hiddenWidgets: string[];
  widgetOrder: string[];
  widgetWidths?: Record<string, number>;
};
export const DASHBOARD_COLUMNS = 6;

export const dashboardWidgetWidth = (id: string) => {
  if (id === 'stories' || id.startsWith('summary:')) return { initial: 2, minimum: 2 };
  if (id === 'ai') return { initial: 4, minimum: 4 };
  if (['activity_calendar', 'agents_desk'].includes(id)) return { initial: 6, minimum: 4 };
  return { initial: 3, minimum: 3 };
};

const sanitizeWidths = (input: unknown): Record<string, number> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 100).filter(([id, width]) =>
    /^[a-z][a-z0-9_:-]{0,158}$/.test(id) && Number.isInteger(width)
    && width >= dashboardWidgetWidth(id).minimum && width <= DASHBOARD_COLUMNS));
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
      hiddenWidgets: strings(saved.hiddenWidgets), widgetOrder: strings(saved.widgetOrder), widgetWidths: sanitizeWidths(saved.widgetWidths),
      ...(Array.isArray(saved.moduleIds) ? { moduleIds: strings(saved.moduleIds).slice(0, 6) } : {}),
      ...(Array.isArray(saved.reportIds) ? { reportIds: strings(saved.reportIds) } : {}),
      ...(typeof saved.defaultReportId === 'string' && saved.defaultReportId.length < 160 ? { defaultReportId: saved.defaultReportId } : {}),
    };
  } catch { /* Local preferences are optional; access remains authoritative. */ }
  snapshots.set(key, next);
  return next;
};
export const updateDashboardPreferences = (orgId: string | null | undefined, userId: string | null | undefined, patch: Partial<DashboardPreferences>) => {
  const key = keyFor(orgId, userId);
  if (!key) return;
  const next = { ...readDashboardPreferences(orgId, userId), ...patch };
  if (patch.widgetWidths) next.widgetWidths = sanitizeWidths(patch.widgetWidths);
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

export const resetDashboardLayout = (orgId?: string | null, userId?: string | null) =>
  updateDashboardPreferences(orgId, userId, { layoutMode: 'default', hiddenWidgets: [], widgetOrder: [], widgetWidths: {}, widgetHeights: {} });
