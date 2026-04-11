const DONE_STATUSES = new Set(['done', 'completed']);
const STARTABLE_STATUSES = new Set(['todo', 'pending']);
const IN_PROGRESS_STATUS = 'in_progress';
const ACTIVE_STATUSES = new Set(['in_progress', 'review', 'done', 'completed']);

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

const shouldAutoAttachActualStart = (nextStatus: unknown, previousStatus: unknown): boolean => {
  const normalizedNext = normalizeTaskStatus(nextStatus);
  if (!ACTIVE_STATUSES.has(normalizedNext)) return false;

  const normalizedPrev = normalizeTaskStatus(previousStatus);
  return !normalizedPrev || STARTABLE_STATUSES.has(normalizedPrev) || normalizedPrev === 'canceled';
};

const roundHours = (value: number): number => Math.round(value * 100) / 100;

const computeScheduleVarianceHours = (
  dueDate: unknown,
  actualEndAt: unknown,
): number | null => {
  const due = dueDate ? new Date(String(dueDate)) : null;
  const actualEnd = actualEndAt ? new Date(String(actualEndAt)) : null;
  if (!due || !actualEnd) return null;
  if (Number.isNaN(due.getTime()) || Number.isNaN(actualEnd.getTime())) return null;
  return roundHours((due.getTime() - actualEnd.getTime()) / (1000 * 60 * 60));
};

type TaskStatusContext = {
  previousCompletedAt?: string | null;
  previousStatus?: unknown;
  previousStartDate?: string | null;
  previousDueDate?: string | null;
  previousActualStartAt?: string | null;
  previousActualEndAt?: string | null;
};

type TaskTimingCarrier = {
  status?: unknown;
  due_date?: string | null;
  completed_at?: string | null;
  start_date?: string | null;
  actual_start_at?: string | null;
  actual_end_at?: string | null;
  schedule_variance_hours?: number | null;
};

const hasOwn = (value: unknown, key: string) =>
  !!value && Object.prototype.hasOwnProperty.call(value as Record<string, unknown>, key);

const hasTimingInputs = (values: TaskTimingCarrier) =>
  hasOwn(values, 'status')
  || hasOwn(values, 'due_date')
  || hasOwn(values, 'completed_at')
  || hasOwn(values, 'start_date')
  || hasOwn(values, 'actual_start_at')
  || hasOwn(values, 'actual_end_at');

export const buildTaskTimingPatch = (
  values: TaskTimingCarrier,
  context: TaskStatusContext = {},
) => {
  if (!hasTimingInputs(values)) return {};

  const {
    previousCompletedAt = null,
    previousStatus = null,
    previousStartDate = null,
    previousDueDate = null,
    previousActualStartAt = null,
    previousActualEndAt = null,
  } = context;

  const nowIso = new Date().toISOString();
  const hasStatus = hasOwn(values, 'status');
  const nextStatus = hasStatus ? values.status : previousStatus;
  const nextStatusIsDone = isTaskDoneStatus(nextStatus);

  let nextStartDate = hasOwn(values, 'start_date') ? (values.start_date ?? null) : previousStartDate;
  if (
    hasStatus
    && shouldAutoAttachStartDate(nextStatus, previousStatus)
    && !hasValue(nextStartDate)
  ) {
    nextStartDate = nowIso;
  }

  let nextCompletedAt = hasOwn(values, 'completed_at') ? (values.completed_at ?? null) : previousCompletedAt;
  if (hasStatus) {
    nextCompletedAt = nextStatusIsDone
      ? (hasValue(nextCompletedAt) ? nextCompletedAt : nowIso)
      : null;
  }

  let nextActualStartAt = hasOwn(values, 'actual_start_at') ? (values.actual_start_at ?? null) : previousActualStartAt;
  if (
    hasStatus
    && shouldAutoAttachActualStart(nextStatus, previousStatus)
    && !hasValue(nextActualStartAt)
  ) {
    nextActualStartAt = nowIso;
  }
  if (nextStatusIsDone && !hasValue(nextActualStartAt)) {
    nextActualStartAt = nextStartDate || previousStartDate || nowIso;
  }

  let nextActualEndAt = hasOwn(values, 'actual_end_at') ? (values.actual_end_at ?? null) : previousActualEndAt;
  if (hasStatus) {
    nextActualEndAt = nextStatusIsDone
      ? (hasValue(nextActualEndAt) ? nextActualEndAt : nextCompletedAt || nowIso)
      : null;
  }

  const effectiveDueDate = hasOwn(values, 'due_date') ? (values.due_date ?? null) : previousDueDate;
  const nextScheduleVarianceHours = computeScheduleVarianceHours(effectiveDueDate, nextActualEndAt);

  const patch: Record<string, any> = {};
  if (hasStatus) {
    patch.completed_at = nextCompletedAt;
    patch.actual_end_at = nextActualEndAt;
  }
  if (hasStatus && shouldAutoAttachStartDate(nextStatus, previousStatus) && !hasValue(previousStartDate) && hasValue(nextStartDate)) {
    patch.start_date = nextStartDate;
  }
  if (
    hasOwn(values, 'actual_start_at')
    || (hasStatus && shouldAutoAttachActualStart(nextStatus, previousStatus))
    || (nextStatusIsDone && !hasValue(previousActualStartAt))
  ) {
    patch.actual_start_at = nextActualStartAt;
  }
  if (
    hasStatus
    || hasOwn(values, 'due_date')
    || hasOwn(values, 'completed_at')
    || hasOwn(values, 'actual_end_at')
  ) {
    patch.schedule_variance_hours = nextScheduleVarianceHours;
  }

  return patch;
};

export const buildTaskStatusUpdatePayload = (
  nextStatus: unknown,
  context: TaskStatusContext = {},
) => {
  return {
    status: nextStatus,
    ...buildTaskTimingPatch({ status: nextStatus }, context),
  };
};

type TaskStatusCarrier = TaskTimingCarrier;

export const attachTaskCompletionIfNeeded = <T extends TaskStatusCarrier>(
  values: T,
  context: TaskStatusContext = {},
): T & {
  completed_at?: string | null;
  start_date?: string | null;
  actual_start_at?: string | null;
  actual_end_at?: string | null;
  schedule_variance_hours?: number | null;
} => {
  if (!hasTimingInputs(values)) {
    return values;
  }
  return {
    ...values,
    ...buildTaskTimingPatch(values, context),
  };
};
