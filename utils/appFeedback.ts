import type { ReactNode } from 'react';
import { FEEDBACK_POLICY } from './feedbackPolicy';
import { toFaErrorMessage } from './errorMessageFa';

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
  visualRevision: number;
  kind: FeedbackKind;
}
export type NativeFeedbackTransport = { show: (id: string, onClose: () => void) => void; close: (id: string) => void };
type FeedbackRecord = { item: FeedbackItem; native?: NativeFeedbackTransport; runningActions: Set<string>; timer?: ReturnType<typeof setTimeout>; remaining: number | null; deadline: number; shown: boolean; paused: boolean; settle: (() => void)[] };
const records = new Map<string, FeedbackRecord>();
const listeners = new Set<() => void>();
let snapshot: FeedbackItem[] = [];
let sequence = 0;
let scope = '';
let scopeGeneration = 0;
const emit = () => { snapshot = [...records.values()].filter(record => !record.native).map(record => record.item); listeners.forEach(listener => listener()); };
export const subscribeFeedback = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getFeedbackSnapshot = () => snapshot;
export const getFeedbackScope = () => scope;

export const closeFeedback = (id: string) => {
  const record = records.get(id);
  if (!record) return;
  clearTimeout(record.timer);
  records.delete(id);
  try { record.native?.close(id); } catch { /* Cleanup must continue if a legacy renderer has already gone away. */ }
  emit();
  record.settle.forEach(resolve => resolve());
  try { record.item.onClose?.(); } catch { /* Presentation callbacks must not interrupt cleanup. */ }
};
export const clearFeedback = (key?: string | number) => {
  const normalizedKey = key === undefined ? undefined : String(key);
  for (const record of [...records.values()]) {
    if (normalizedKey === undefined || record.item.key === normalizedKey) closeFeedback(record.item.id);
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
const sameVisibleContent = (previous: FeedbackItem | undefined, options: FeedbackOptions) => {
  if (!previous || previous.title !== options.title || previous.description !== options.description || previous.kind !== options.kind || previous.icon !== options.icon) return false;
  const before = previous.actions || [], after = options.actions || [];
  return before.length === after.length && before.every((action, index) => {
    const next = after[index];
    return action.key === next.key && action.label === next.label && action.icon === next.icon && action.iconOnly === next.iconOnly;
  });
};
const publish = (options: FeedbackOptions, native?: NativeFeedbackTransport) => {
  const key = options.key === undefined ? undefined : String(options.key);
  const previous = key === undefined ? undefined : [...records.values()].find(record => record.item.key === key);
  const id = previous?.item.id ?? `feedback-${++sequence}`;
  const kind = options.kind ?? 'info';
  const duration = options.durationMs === undefined ? FEEDBACK_POLICY.durations[kind] : options.durationMs;
  const remaining = duration === null || duration <= 0 ? null : duration;
  if (previous) clearTimeout(previous.timer);
  if (previous?.native && !native) {
    records.delete(id);
    try { previous.native.close(id); } catch { /* The replacement remains usable. */ }
  }
  const title = kind === 'error' ? toFaErrorMessage(options.title, FEEDBACK_POLICY.labels.failure) : options.title;
  const visualRevision = (previous?.item.visualRevision ?? 0) + (sameVisibleContent(previous?.item, { ...options, title, kind }) ? 0 : 1);
  const record: FeedbackRecord = { item: { ...options, title, key, id, kind, revision: (previous?.item.revision ?? 0) + 1, visualRevision }, native, runningActions: new Set(), remaining: native ? null : remaining, deadline: 0, shown: previous?.shown ?? false, paused: previous?.paused ?? false, settle: previous?.settle ?? [] };
  records.set(id, record);
  while (records.size > FEEDBACK_POLICY.maxVisible) closeFeedback(records.keys().next().value!);
  schedule(record);
  emit();
  const settled = new Promise<boolean>(resolve => record.settle.push(() => resolve(true)));
  const close = () => closeFeedback(id);
  if (native) {
    const revision = record.item.revision;
    try { native.show(id, () => { if (records.get(id)?.item.revision === revision) closeFeedback(id); }); }
    catch (error) { closeFeedback(id); throw error; }
  }
  return Object.assign(close, { then: settled.then.bind(settled), id });
};
export const publishFeedback = (options: FeedbackOptions) => publish(options);
/** Rich legacy notices still share keys, capacity, close handles and org cleanup. */
export const publishNativeFeedback = (options: FeedbackOptions, transport: NativeFeedbackTransport) => publish(options, transport);
/** Both visual renderers use this gate: no duplicate click, stale org or lost error. */
export const runFeedbackAction = async (id: string, key: string) => {
  const record = records.get(id);
  const action = record?.item.actions?.find(candidate => candidate.key === key);
  if (!record || !action || record.runningActions.has(key)) return;
  const generation = scopeGeneration;
  const revision = record.item.revision;
  record.runningActions.add(key);
  try {
    const result = action.onClick() as unknown;
    // Ant Design-compatible close handles are callable thenables, not jobs.
    if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') await (result as PromiseLike<unknown>);
    if (generation === scopeGeneration && records.get(id)?.item.revision === revision) closeFeedback(id);
  } catch (error) {
    if (generation === scopeGeneration) appFeedback.error(toFaErrorMessage(error, FEEDBACK_POLICY.labels.failure));
  } finally { record.runningActions.delete(key); }
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
