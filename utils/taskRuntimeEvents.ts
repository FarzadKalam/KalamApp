export const TASK_RUNTIME_UPDATED_EVENT = 'kalam:task-runtime-updated';

export type TaskRuntimeUpdateReason = 'status' | 'due_date' | 'patch';

export type TaskRuntimeUpdatedPayload = {
  task: Record<string, any>;
  previousTask?: Record<string, any> | null;
  reason: TaskRuntimeUpdateReason;
};

export const dispatchTaskRuntimeUpdated = (payload: TaskRuntimeUpdatedPayload) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TASK_RUNTIME_UPDATED_EVENT, { detail: payload }));
};

export const applyTaskRuntimeUpdate = <T extends Record<string, any>>(
  rows: T[],
  updatedTask: Record<string, any> | null | undefined,
  transform?: (task: T) => T,
) => {
  const normalizedTaskId = String(updatedTask?.id || '').trim();
  if (!normalizedTaskId || !Array.isArray(rows) || rows.length === 0) return rows;

  let changed = false;
  const nextRows = rows.map((row) => {
    if (String(row?.id || '').trim() !== normalizedTaskId) return row;
    changed = true;
    const merged = { ...row, ...updatedTask } as T;
    return transform ? transform(merged) : merged;
  });

  return changed ? nextRows : rows;
};
