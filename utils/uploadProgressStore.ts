import { useSyncExternalStore } from 'react';

export type UploadTaskStatus = 'uploading' | 'success' | 'error' | 'canceled';

export interface UploadTask {
  id: string;
  name: string;
  detail?: string;
  loaded: number;
  total: number;
  progress: number;
  status: UploadTaskStatus;
  errorMessage?: string;
  startedAt: number;
}

type UploadTaskRecord = UploadTask & {
  cancel?: () => void;
  retry?: () => void;
  removeTimer?: ReturnType<typeof setTimeout>;
};

const listeners = new Set<() => void>();
const tasks = new Map<string, UploadTaskRecord>();
let storeVersion = 0;
let cachedSnapshotVersion = -1;
let cachedSnapshot: UploadTask[] = [];

const emit = () => {
  storeVersion += 1;
  listeners.forEach((listener) => listener());
};

const snapshot = (): UploadTask[] => {
  if (cachedSnapshotVersion === storeVersion) {
    return cachedSnapshot;
  }

  cachedSnapshot = Array.from(tasks.values())
    .sort((left, right) => left.startedAt - right.startedAt)
    .map(({ cancel: _cancel, retry: _retry, removeTimer: _removeTimer, ...task }) => task);
  cachedSnapshotVersion = storeVersion;
  return cachedSnapshot;
};

const scheduleAutoRemove = (id: string, delayMs = 2200) => {
  const task = tasks.get(id);
  if (!task) return;
  if (task.removeTimer) clearTimeout(task.removeTimer);
  task.removeTimer = setTimeout(() => {
    tasks.delete(id);
    emit();
  }, delayMs);
};

const clampProgress = (loaded: number, total: number) => {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
};

export const createUploadTask = (name: string, total = 0, detail?: string): string => {
  const id = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  tasks.set(id, {
    id,
    name,
    detail,
    loaded: 0,
    total,
    progress: 0,
    status: 'uploading',
    startedAt: Date.now(),
  });
  emit();
  return id;
};

export const setUploadTaskCancel = (id: string, cancel: (() => void) | undefined) => {
  const task = tasks.get(id);
  if (!task) return;
  task.cancel = cancel;
  emit();
};

export const setUploadTaskRetry = (id: string, retry: (() => void) | undefined) => {
  const task = tasks.get(id);
  if (!task) return;
  task.retry = retry;
  emit();
};

export const updateUploadTaskProgress = (id: string, loaded: number, total: number) => {
  const task = tasks.get(id);
  if (!task) return;
  task.loaded = loaded;
  task.total = total;
  task.progress = clampProgress(loaded, total);
  emit();
};

export const finishUploadTask = (id: string) => {
  const task = tasks.get(id);
  if (!task) return;
  task.status = 'success';
  task.loaded = task.total || task.loaded;
  task.progress = 100;
  task.cancel = undefined;
  task.retry = undefined;
  emit();
  scheduleAutoRemove(id);
};

export const failUploadTask = (id: string, errorMessage?: string) => {
  const task = tasks.get(id);
  if (!task) return;
  task.status = 'error';
  task.errorMessage = errorMessage;
  task.cancel = undefined;
  emit();
};

export const markUploadTaskCanceled = (id: string) => {
  const task = tasks.get(id);
  if (!task) return;
  task.status = 'canceled';
  task.cancel = undefined;
  task.errorMessage = 'آپلود لغو شد.';
  emit();
};

export const dismissUploadTask = (id: string) => {
  const task = tasks.get(id);
  if (!task) return;
  if (task.removeTimer) clearTimeout(task.removeTimer);
  tasks.delete(id);
  emit();
};

export const cancelUploadTask = (id: string) => {
  const task = tasks.get(id);
  if (!task) return;
  if (task.status === 'uploading' && task.cancel) {
    task.cancel();
    return;
  }
  dismissUploadTask(id);
};

export const retryUploadTask = (id: string) => {
  const task = tasks.get(id);
  if (!task || !task.retry || task.status === 'uploading') return;
  task.retry();
};

export const useUploadTasks = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    snapshot,
  );
