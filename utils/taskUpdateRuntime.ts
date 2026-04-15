import { supabase } from '../supabaseClient';
import { runProcessAutomationsForTaskEvent } from './processAutomationRuntime';
import { attachTaskCompletionIfNeeded, buildTaskStatusUpdatePayload } from './taskCompletion';
import { getTaskStatusLabel } from './processTaskStatusOptions';
import { dispatchTaskRuntimeUpdated } from './taskRuntimeEvents';

type TaskAutomationActor = {
  id?: string | null;
  fullName?: string | null;
};

type UpdateTaskStatusWithAutomationArgs = {
  taskId: string;
  nextStatus: string;
  previousTask?: Record<string, any> | null;
  currentUser?: TaskAutomationActor | null;
};

export const TASK_AUTOMATION_SELECT =
  'id, name, status, due_date, task_type, assignee_id, assignee_role_id, assignee_type, sort_order, source_template_id, source_module_id, source_record_id, process_group_id, recurrence_info, start_date, completed_at, actual_start_at, actual_end_at, schedule_variance_hours';

const TASK_AUTOMATION_FALLBACK_SELECT =
  'id, name, status, due_date, task_type, assignee_id, assignee_role_id, assignee_type, sort_order, source_template_id, source_module_id, source_record_id, process_group_id, recurrence_info, start_date, completed_at';

const OPTIONAL_TASK_RUNTIME_COLUMNS = new Set([
  'actual_start_at',
  'actual_end_at',
  'schedule_variance_hours',
]);

const getErrorText = (error: any) =>
  String(error?.message || error?.details || error?.hint || '').toLowerCase();

const isMissingColumnLikeError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  if (code === '42703' || code === 'PGRST204' || code === 'PGRST200') return true;
  const text = getErrorText(error);
  return text.includes('column') || text.includes('schema cache') || text.includes('does not exist');
};

const extractMissingColumnNames = (error: any): string[] => {
  const text = getErrorText(error);
  if (!text) return [];

  const patterns = [
    /column\s+"([^"]+)"/gi,
    /column\s+'([^']+)'/gi,
    /could not find the\s+'([^']+)'\s+column/gi,
    /([a-z0-9_]+)\s+does not exist/gi,
  ];

  return Array.from(
    new Set(
      patterns.flatMap((pattern) =>
        Array.from(text.matchAll(pattern))
          .map((match) => String(match?.[1] || '').trim().toLowerCase())
          .filter(Boolean)
      )
    )
  );
};

const selectTaskForAutomation = async (taskId: string) => {
  const primary = await supabase
    .from('tasks')
    .select(TASK_AUTOMATION_SELECT)
    .eq('id', taskId)
    .maybeSingle();

  if (!primary.error || !isMissingColumnLikeError(primary.error)) {
    return primary;
  }

  const missingColumns = extractMissingColumnNames(primary.error);
  const onlyOptionalRuntimeMissing =
    missingColumns.length === 0
    || missingColumns.every((column) => OPTIONAL_TASK_RUNTIME_COLUMNS.has(column));

  if (!onlyOptionalRuntimeMissing) {
    return primary;
  }

  return supabase
    .from('tasks')
    .select(TASK_AUTOMATION_FALLBACK_SELECT)
    .eq('id', taskId)
    .maybeSingle();
};

const updateTaskWithRuntimeFallback = async (taskId: string, payload: Record<string, any>) => {
  let nextPayload = { ...payload };
  let lastError: any = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await supabase
      .from('tasks')
      .update(nextPayload)
      .eq('id', taskId);

    if (!result.error) return;
    lastError = result.error;
    if (!isMissingColumnLikeError(result.error)) throw result.error;

    const missingColumns = extractMissingColumnNames(result.error);
    const removableColumns = (missingColumns.length > 0 ? missingColumns : Array.from(OPTIONAL_TASK_RUNTIME_COLUMNS))
      .filter((column) => OPTIONAL_TASK_RUNTIME_COLUMNS.has(column) && Object.prototype.hasOwnProperty.call(nextPayload, column));

    if (removableColumns.length === 0) {
      throw result.error;
    }

    nextPayload = { ...nextPayload };
    removableColumns.forEach((column) => {
      delete nextPayload[column];
    });
  }

  throw lastError || new Error('به‌روزرسانی فعالیت ناموفق بود.');
};

export const updateTaskStatusWithAutomation = async ({
  taskId,
  nextStatus,
  previousTask = null,
  currentUser = null,
}: UpdateTaskStatusWithAutomationArgs): Promise<Record<string, any>> => {
  let currentTask: Record<string, any> | null = previousTask || null;

  if (!currentTask) {
    const { data, error } = await selectTaskForAutomation(taskId);
    if (error) throw error;
    currentTask = data || null;
  }

  if (!currentTask) {
    throw new Error('فعالیت موردنظر پیدا نشد.');
  }

  if (String(currentTask?.status || '').trim() === String(nextStatus || '').trim()) {
    return currentTask;
  }

  const payload: Record<string, any> = buildTaskStatusUpdatePayload(nextStatus, {
    previousCompletedAt: currentTask?.completed_at ?? null,
    previousStatus: currentTask?.status ?? null,
    previousStartDate: currentTask?.start_date ?? null,
    previousDueDate: currentTask?.due_date ?? null,
    previousActualStartAt: currentTask?.actual_start_at ?? null,
    previousActualEndAt: currentTask?.actual_end_at ?? null,
  });
  const nextStatusLabel = getTaskStatusLabel(nextStatus, {
    ...currentTask,
    status: nextStatus,
  });

  await updateTaskWithRuntimeFallback(taskId, payload);

  const updatedTask = {
    ...currentTask,
    ...payload,
    status_label: nextStatusLabel || String(nextStatus || '').trim(),
    task_status_label: nextStatusLabel || String(nextStatus || '').trim(),
  } as Record<string, any>;

  await runProcessAutomationsForTaskEvent({
    task: updatedTask,
    event: 'update',
    previousTask: currentTask,
    currentUser,
  });

  dispatchTaskRuntimeUpdated({
    task: updatedTask,
    previousTask: currentTask,
    reason: 'status',
  });

  return updatedTask;
};

type UpdateTaskDueDateWithAutomationArgs = {
  taskId: string;
  nextDueDate: string | null;
  previousTask?: Record<string, any> | null;
  currentUser?: TaskAutomationActor | null;
};

export const updateTaskDueDateWithAutomation = async ({
  taskId,
  nextDueDate,
  previousTask = null,
  currentUser = null,
}: UpdateTaskDueDateWithAutomationArgs) => {
  let currentTask = previousTask;

  if (!currentTask) {
    const { data, error } = await selectTaskForAutomation(taskId);
    if (error) throw error;
    currentTask = data || null;
  }

  if (!currentTask) {
    throw new Error('فعالیت موردنظر پیدا نشد.');
  }

  const payload = attachTaskCompletionIfNeeded({
    due_date: nextDueDate,
  }, {
    previousCompletedAt: currentTask?.completed_at ?? null,
    previousStatus: currentTask?.status ?? null,
    previousStartDate: currentTask?.start_date ?? null,
    previousDueDate: currentTask?.due_date ?? null,
    previousActualStartAt: currentTask?.actual_start_at ?? null,
    previousActualEndAt: currentTask?.actual_end_at ?? null,
  });

  await updateTaskWithRuntimeFallback(taskId, payload);

  const updatedTask = {
    ...currentTask,
    ...payload,
  };

  await runProcessAutomationsForTaskEvent({
    task: updatedTask,
    event: 'update',
    previousTask: currentTask,
    currentUser,
  });

  dispatchTaskRuntimeUpdated({
    task: updatedTask,
    previousTask: currentTask,
    reason: 'due_date',
  });

  return updatedTask;
};
