import type { ReactNode } from 'react';

export type FeedbackKind = 'success' | 'error' | 'warning' | 'info' | 'loading';
export interface FeedbackAction {
  key: string;
  label: string;
  icon?: ReactNode;
  iconOnly?: boolean;
  onClick: () => void;
}
export interface FeedbackOptions {
  title: string;
  description?: ReactNode;
  kind?: FeedbackKind;
  key?: string | number;
  durationMs?: number | null;
  icon?: ReactNode;
  actions?: FeedbackAction[];
  onClose?: () => void;
}
export interface FeedbackItem extends FeedbackOptions {
  id: string;
  revision: number;
  kind: FeedbackKind;
}
type FeedbackRecord = { item: FeedbackItem; timer?: ReturnType<typeof setTimeout>; remaining: number | null; deadline: number; shown: boolean; paused: boolean; settle: (() => void)[] };
const records = new Map<string, FeedbackRecord>();
const listeners = new Set<() => void>();
let snapshot: FeedbackItem[] = [];
let sequence = 0;
let scope = '';
let scopeGeneration = 0;
const MAX_VISIBLE = 3;
const emit = () => { snapshot = [...records.values()].map(record => record.item); listeners.forEach(listener => listener()); };
export const subscribeFeedback = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getFeedbackSnapshot = () => snapshot;
export const getFeedbackScope = () => scope;

export const closeFeedback = (id: string) => {
  const record = records.get(id);
  if (!record) return;
  clearTimeout(record.timer);
  records.delete(id);
  emit();
  record.settle.forEach(resolve => resolve());
  try { record.item.onClose?.(); } catch { /* Presentation callbacks must not interrupt cleanup. */ }
};
export const clearFeedback = (key?: string | number) => {
  for (const record of [...records.values()]) {
    if (key === undefined || record.item.key === key) closeFeedback(record.item.id);
  }
};
export const setFeedbackScope = (next: string) => {
  if (scope === next) return;
  scope = next;
  scopeGeneration += 1;
  clearFeedback();
  emit();
};
const schedule = (record: FeedbackRecord) => {
  clearTimeout(record.timer);
  if (!record.shown || record.paused || record.remaining === null) return;
  const { id, revision } = record.item;
  record.deadline = Date.now() + record.remaining;
  record.timer = setTimeout(() => {
    if (records.get(id)?.item.revision === revision) closeFeedback(id);
  }, record.remaining);
};
export const feedbackShown = (id: string) => {
  const record = records.get(id);
  if (!record || record.shown) return;
  record.shown = true;
  schedule(record);
};
export const pauseFeedback = (id: string, paused: boolean) => {
  const record = records.get(id);
  if (!record || record.paused === paused) return;
  if (paused && record.timer && record.remaining !== null) record.remaining = Math.max(0, record.deadline - Date.now());
  record.paused = paused;
  schedule(record);
};
export const publishFeedback = (options: FeedbackOptions) => {
  const key = options.key === undefined ? undefined : String(options.key);
  const previous = key === undefined ? undefined : [...records.values()].find(record => record.item.key === key);
  const id = previous?.item.id ?? `feedback-${++sequence}`;
  const kind = options.kind ?? 'info';
  const duration = options.durationMs === undefined ? (kind === 'loading' ? null : kind === 'error' ? 6000 : 4000) : options.durationMs;
  const remaining = duration === null || duration <= 0 ? null : duration;
  if (previous) clearTimeout(previous.timer);
  const record: FeedbackRecord = { item: { ...options, key, id, kind, revision: (previous?.item.revision ?? 0) + 1 }, remaining, deadline: 0, shown: previous?.shown ?? false, paused: previous?.paused ?? false, settle: previous?.settle ?? [] };
  records.set(id, record);
  while (records.size > MAX_VISIBLE) closeFeedback(records.keys().next().value!);
  schedule(record);
  emit();
  const settled = new Promise<boolean>(resolve => record.settle.push(() => resolve(true)));
  const close = () => closeFeedback(id);
  return Object.assign(close, { then: settled.then.bind(settled), id });
};
const normalize = (options: FeedbackOptions | string): FeedbackOptions => typeof options === 'string' ? { title: options } : options;
export const appFeedback = {
  show: publishFeedback,
  success: (options: FeedbackOptions | string) => publishFeedback({ ...normalize(options), kind: 'success' }),
  error: (options: FeedbackOptions | string) => publishFeedback({ ...normalize(options), kind: 'error' }),
  warning: (options: FeedbackOptions | string) => publishFeedback({ ...normalize(options), kind: 'warning' }),
  info: (options: FeedbackOptions | string) => publishFeedback({ ...normalize(options), kind: 'info' }),
  loading: (options: FeedbackOptions | string) => publishFeedback({ ...normalize(options), kind: 'loading' }),
  clear: clearFeedback,
  promise: <T,>(promise: Promise<T>, options: { loading: FeedbackOptions; success: (value: T) => FeedbackOptions; error: (error: unknown) => FeedbackOptions }): Promise<T> => {
    const generation = scopeGeneration;
    const handle = publishFeedback({ ...options.loading, kind: 'loading' });
    void promise.then(value => {
      if (generation !== scopeGeneration || !records.has(handle.id)) return;
      closeFeedback(handle.id);
      appFeedback.success(options.success(value));
    }, error => {
      if (generation !== scopeGeneration || !records.has(handle.id)) return;
      closeFeedback(handle.id);
      appFeedback.error(options.error(error));
    });
    return promise;
  },
};
