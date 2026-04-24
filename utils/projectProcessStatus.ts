import { supabase } from '../supabaseClient';
import { applyTaskSourceRecordFilter } from './taskMeta';
import { isTaskDoneStatus, normalizeTaskStatus } from './taskCompletion';

export type ProjectProcessStatus =
  | 'draft'
  | 'planning'
  | 'in_progress'
  | 'on_hold'
  | 'completed';

const TODO_LIKE_TASK_STATUSES = new Set(['todo', 'pending', 'draft']);
const CANCELED_TASK_STATUS = 'canceled';

const parseDraftStages = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const deriveProjectStatusFromProcessState = (
  draftStages: any,
  tasks: Array<Record<string, any>>
): ProjectProcessStatus | null => {
  const normalizedDraftStages = parseDraftStages(draftStages)
    .filter((stage) => !!String(stage?.id || stage?.name || '').trim());
  if (normalizedDraftStages.length > 0) return 'draft';

  const normalizedTasks = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => !!String(task?.id || task?.name || '').trim());
  if (normalizedTasks.length === 0) return null;

  const normalizedStatuses = normalizedTasks.map((task) => normalizeTaskStatus(task?.status));
  if (normalizedStatuses.every((status) => status === CANCELED_TASK_STATUS)) return 'on_hold';
  if (normalizedTasks.every((task) => isTaskDoneStatus(task?.status))) return 'completed';

  const hasStartedTask = normalizedStatuses.some((status) =>
    !!status
    && !TODO_LIKE_TASK_STATUSES.has(status)
    && status !== CANCELED_TASK_STATUS
  );
  if (hasStartedTask) return 'in_progress';

  return 'planning';
};

export const fetchProjectProcessTasks = async (projectId: string) => {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) return [] as Array<Record<string, any>>;

  let query = supabase
    .from('tasks')
    .select('id,status,project_id,source_module_id,source_record_id');
  query = applyTaskSourceRecordFilter(query, 'projects', normalizedProjectId);
  const { data, error } = await query.limit(5000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

export const syncProjectStatusWithProcessState = async (
  projectId: string,
  options?: {
    draftStages?: any;
    tasks?: Array<Record<string, any>>;
  }
) => {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) return null;

  let projectDraftStages = options?.draftStages;
  if (projectDraftStages === undefined) {
    const { data: projectRow, error: projectError } = await supabase
      .from('projects')
      .select('id,status,execution_process_draft')
      .eq('id', normalizedProjectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!projectRow) return null;
    projectDraftStages = projectRow.execution_process_draft;
  }

  const projectTasks = options?.tasks || await fetchProjectProcessTasks(normalizedProjectId);
  const nextStatus = deriveProjectStatusFromProcessState(projectDraftStages, projectTasks);
  if (!nextStatus) return null;

  const { data: currentProject, error: currentProjectError } = await supabase
    .from('projects')
    .select('id,status')
    .eq('id', normalizedProjectId)
    .maybeSingle();
  if (currentProjectError) throw currentProjectError;
  if (!currentProject) return null;

  if (String(currentProject?.status || '').trim() === nextStatus) return nextStatus;

  const { error: updateError } = await supabase
    .from('projects')
    .update({ status: nextStatus })
    .eq('id', normalizedProjectId);
  if (updateError) throw updateError;
  return nextStatus;
};
