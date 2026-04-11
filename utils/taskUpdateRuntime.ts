import { supabase } from '../supabaseClient';
import { runProcessAutomationsForTaskEvent } from './processAutomationRuntime';
import { attachTaskCompletionIfNeeded, buildTaskStatusUpdatePayload } from './taskCompletion';

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

export const updateTaskStatusWithAutomation = async ({
  taskId,
  nextStatus,
  previousTask = null,
  currentUser = null,
}: UpdateTaskStatusWithAutomationArgs) => {
  let currentTask = previousTask;

  if (!currentTask) {
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_AUTOMATION_SELECT)
      .eq('id', taskId)
      .maybeSingle();
    if (error) throw error;
    currentTask = data || null;
  }

  if (!currentTask) {
    throw new Error('فعالیت موردنظر پیدا نشد.');
  }

  if (String(currentTask?.status || '').trim() === String(nextStatus || '').trim()) {
    return currentTask;
  }

  const payload = buildTaskStatusUpdatePayload(nextStatus, {
    previousCompletedAt: currentTask?.completed_at ?? null,
    previousStatus: currentTask?.status ?? null,
    previousStartDate: currentTask?.start_date ?? null,
    previousDueDate: currentTask?.due_date ?? null,
    previousActualStartAt: currentTask?.actual_start_at ?? null,
    previousActualEndAt: currentTask?.actual_end_at ?? null,
  });

  const { error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', taskId);
  if (error) throw error;

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
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_AUTOMATION_SELECT)
      .eq('id', taskId)
      .maybeSingle();
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

  const { error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', taskId);
  if (error) throw error;

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

  return updatedTask;
};
