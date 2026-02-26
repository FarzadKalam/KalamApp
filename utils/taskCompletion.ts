const DONE_STATUSES = new Set(['done', 'completed']);
const STARTABLE_STATUSES = new Set(['todo', 'pending']);
const IN_PROGRESS_STATUS = 'in_progress';

export const normalizeTaskStatus = (status: unknown): string => {
  return String(status ?? '').trim().toLowerCase();
};

export const isTaskDoneStatus = (status: unknown): boolean => {
  return DONE_STATUSES.has(normalizeTaskStatus(status));
};

const hasValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const shouldAutoAttachStartDate = (nextStatus: unknown, previousStatus: unknown): boolean => {
  const normalizedNext = normalizeTaskStatus(nextStatus);
  if (normalizedNext !== IN_PROGRESS_STATUS) return false;

  const normalizedPrev = normalizeTaskStatus(previousStatus);
  if (!normalizedPrev) return true;

  return STARTABLE_STATUSES.has(normalizedPrev);
};

type TaskStatusContext = {
  previousCompletedAt?: string | null;
  previousStatus?: unknown;
  previousStartDate?: string | null;
};

export const buildTaskStatusUpdatePayload = (
  nextStatus: unknown,
  context: TaskStatusContext = {},
) => {
  const {
    previousCompletedAt = null,
    previousStatus = null,
    previousStartDate = null,
  } = context;
  const shouldSetStartDate =
    shouldAutoAttachStartDate(nextStatus, previousStatus) && !hasValue(previousStartDate);

  return {
    status: nextStatus,
    completed_at: isTaskDoneStatus(nextStatus)
      ? (previousCompletedAt || new Date().toISOString())
      : null,
    ...(shouldSetStartDate ? { start_date: new Date().toISOString() } : {}),
  };
};

type TaskStatusCarrier = {
  status?: unknown;
  completed_at?: string | null;
  start_date?: string | null;
};

export const attachTaskCompletionIfNeeded = <T extends TaskStatusCarrier>(
  values: T,
  context: TaskStatusContext = {},
): T & { completed_at?: string | null; start_date?: string | null } => {
  if (!Object.prototype.hasOwnProperty.call(values, 'status')) {
    return values;
  }

  const {
    previousCompletedAt = null,
    previousStatus = null,
    previousStartDate = null,
  } = context;
  const shouldSetStartDate =
    shouldAutoAttachStartDate(values.status, previousStatus)
    && !hasValue(values.start_date)
    && !hasValue(previousStartDate);

  const nextStatus = values.status;
  return {
    ...values,
    completed_at: isTaskDoneStatus(nextStatus)
      ? (values.completed_at ?? previousCompletedAt ?? new Date().toISOString())
      : null,
    ...(shouldSetStartDate ? { start_date: new Date().toISOString() } : {}),
  };
};
