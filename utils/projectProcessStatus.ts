import { supabase } from '../supabaseClient';
import { applyTaskSourceRecordFilter } from './taskMeta';
import { isTaskDoneStatus, normalizeTaskStatus } from './taskCompletion';
import { parseProcessLinkMap } from './processTargets';

export type ProjectProcessStatus =
  | 'draft'
  | 'planning'
  | 'in_progress'
  | 'on_hold'
  | 'completed';

const TODO_LIKE_TASK_STATUSES = new Set(['todo', 'pending', 'draft']);
const CANCELED_TASK_STATUS = 'canceled';
const PROJECTS_MODULE_ID = 'projects';

type ProcessRuntimeCarrier = Record<string, any>;

type ProcessStatusSyncContext = {
  moduleId?: string | null;
  recordId?: string | null;
  recordData?: Record<string, any> | null;
  draftStages?: any;
  runStages?: ProcessRuntimeCarrier[];
  tasks?: ProcessRuntimeCarrier[];
};

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

const parseObject = (value: any): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeText = (value: unknown) => String(value || '').trim();

const isMissingColumnLikeError = (error: any) => {
  const code = normalizeText(error?.code).toUpperCase();
  if (['42703', 'PGRST200', 'PGRST204'].includes(code)) return true;
  const text = normalizeText(error?.message || error?.details || error?.hint).toLowerCase();
  return text.includes('column') || text.includes('schema cache') || text.includes('does not exist');
};

const dedupeRowsById = (rows: ProcessRuntimeCarrier[]) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = normalizeText(row?.id) || JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractProcessLinks = (value: ProcessRuntimeCarrier | null | undefined) => {
  const metadata = parseObject(value?.metadata);
  const recurrence = parseObject(value?.recurrence_info || metadata?.recurrence_info);
  return parseProcessLinkMap(
    value?.process_link_map
    || value?.process_links
    || metadata?.process_link_map
    || metadata?.process_links
    || recurrence?.process_link_map
    || recurrence?.process_links
  );
};

export const collectProjectIdsFromProcessCarriers = (
  carriers: Array<ProcessRuntimeCarrier | null | undefined>,
) => Array.from(new Set(
  carriers
    .flatMap((carrier) => {
      if (!carrier) return [];
      const links = extractProcessLinks(carrier);
      return [
        normalizeText(links[PROJECTS_MODULE_ID]),
        normalizeText(carrier?.project_id),
        normalizeText(carrier?.source_module_id) === PROJECTS_MODULE_ID ? normalizeText(carrier?.source_record_id) : '',
      ];
    })
    .filter(Boolean)
));

export const collectProjectIdsFromProcessContext = ({
  moduleId,
  recordId,
  recordData,
  draftStages,
  runStages,
  tasks,
}: ProcessStatusSyncContext) => {
  const normalizedModuleId = normalizeText(moduleId);
  const normalizedRecordId = normalizeText(recordId || recordData?.id);
  const directProjectId = normalizedModuleId === PROJECTS_MODULE_ID ? normalizedRecordId : '';
  return Array.from(new Set([
    directProjectId,
    ...collectProjectIdsFromProcessCarriers(parseDraftStages(draftStages)),
    ...collectProjectIdsFromProcessCarriers(Array.isArray(runStages) ? runStages : []),
    ...collectProjectIdsFromProcessCarriers(Array.isArray(tasks) ? tasks : []),
  ].filter(Boolean)));
};

export const deriveProjectStatusFromProcessState = (
  draftStages: any,
  tasks: Array<Record<string, any>>,
  runStages?: Array<Record<string, any>>
): ProjectProcessStatus | null => {
  const normalizedDraftStages = parseDraftStages(draftStages)
    .filter((stage) => !!String(stage?.id || stage?.name || '').trim());
  const hasDraftStages = normalizedDraftStages.length > 0;

  const normalizedTasks = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => !!String(task?.id || task?.name || '').trim());
  const normalizedRunStages = (Array.isArray(runStages) ? runStages : [])
    .filter((stage) => !!String(stage?.id || stage?.stage_name || stage?.name || '').trim());
  const statusCarriers = [...normalizedTasks, ...normalizedRunStages];
  if (statusCarriers.length === 0) return hasDraftStages ? 'draft' : null;

  const normalizedStatuses = statusCarriers.map((item) => normalizeTaskStatus(item?.status));
  if (!hasDraftStages && normalizedStatuses.every((status) => status === CANCELED_TASK_STATUS)) return 'on_hold';
  if (!hasDraftStages && statusCarriers.every((item) => isTaskDoneStatus(item?.status))) return 'completed';

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

  const rows: Array<Record<string, any>> = [];

  let query = supabase
    .from('tasks')
    .select('id,status,project_id,source_module_id,source_record_id,process_run_id,process_run_stage_id,recurrence_info');
  query = applyTaskSourceRecordFilter(query, 'projects', normalizedProjectId);
  const { data, error } = await query.limit(5000);
  if (error) throw error;
  if (Array.isArray(data)) rows.push(...data);

  const runIds = await fetchProjectProcessRunIds(normalizedProjectId);
  if (runIds.length > 0) {
    const { data: processTasks, error: processTasksError } = await supabase
      .from('tasks')
      .select('id,status,project_id,source_module_id,source_record_id,process_run_id,process_run_stage_id,recurrence_info')
      .in('process_run_id', runIds)
      .limit(5000);
    if (processTasksError) {
      if (!isMissingColumnLikeError(processTasksError)) throw processTasksError;
    } else if (Array.isArray(processTasks)) {
      rows.push(...processTasks);
    }
  }

  return dedupeRowsById(rows);
};

export const fetchProjectProcessRunIds = async (projectId: string) => {
  const normalizedProjectId = normalizeText(projectId);
  if (!normalizedProjectId) return [] as string[];

  const runIds = new Set<string>();

  const { data: linkRows, error: linkError } = await supabase
    .from('process_run_links')
    .select('process_run_id')
    .eq('module_id', PROJECTS_MODULE_ID)
    .eq('record_id', normalizedProjectId)
    .limit(1000);
  if (linkError) {
    if (!isMissingColumnLikeError(linkError)) throw linkError;
  } else {
    (Array.isArray(linkRows) ? linkRows : [])
      .map((row: any) => normalizeText(row?.process_run_id))
      .filter(Boolean)
      .forEach((runId) => runIds.add(runId));
  }

  const { data: directRows, error: directError } = await supabase
    .from('process_runs')
    .select('id')
    .eq('module_id', PROJECTS_MODULE_ID)
    .eq('record_id', normalizedProjectId)
    .limit(1000);
  if (directError) {
    if (!isMissingColumnLikeError(directError)) throw directError;
  } else {
    (Array.isArray(directRows) ? directRows : [])
      .map((row: any) => normalizeText(row?.id))
      .filter(Boolean)
      .forEach((runId) => runIds.add(runId));
  }

  const { data: projectRows, error: projectError } = await supabase
    .from('process_runs')
    .select('id')
    .eq('project_id', normalizedProjectId)
    .limit(1000);
  if (projectError) {
    if (!isMissingColumnLikeError(projectError)) throw projectError;
  } else {
    (Array.isArray(projectRows) ? projectRows : [])
      .map((row: any) => normalizeText(row?.id))
      .filter(Boolean)
      .forEach((runId) => runIds.add(runId));
  }

  return Array.from(runIds);
};

export const fetchProjectProcessRunStages = async (projectId: string) => {
  const runIds = await fetchProjectProcessRunIds(projectId);
  if (runIds.length === 0) return [] as Array<Record<string, any>>;
  const { data, error } = await supabase
    .from('process_run_stages')
    .select('id,status,task_id,process_run_id,stage_name,metadata')
    .in('process_run_id', runIds)
    .limit(5000);
  if (error) {
    if (isMissingColumnLikeError(error)) return [];
    throw error;
  }
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
    projectDraftStages = parseDraftStages(projectRow.execution_process_draft);
  }

  const projectTasks = options?.tasks || await fetchProjectProcessTasks(normalizedProjectId);
  const projectRunStages = await fetchProjectProcessRunStages(normalizedProjectId);
  const nextStatus = deriveProjectStatusFromProcessState(projectDraftStages, projectTasks, projectRunStages);
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

export const syncProjectStatusesForProcessContext = async (
  context: ProcessStatusSyncContext,
) => {
  const projectIds = collectProjectIdsFromProcessContext(context);
  const results: Array<{ projectId: string; status: ProjectProcessStatus | null }> = [];
  for (const projectId of projectIds) {
    const projectDraftStages = [
      ...parseDraftStages(context.draftStages).filter((stage) => {
        const links = extractProcessLinks(stage);
        return normalizeText(links[PROJECTS_MODULE_ID]) === projectId || normalizeText(context.moduleId) === PROJECTS_MODULE_ID;
      }),
    ];
    const projectTasks = (Array.isArray(context.tasks) ? context.tasks : []).filter((task) => {
      const links = extractProcessLinks(task);
      return normalizeText(task?.project_id) === projectId
        || (normalizeText(task?.source_module_id) === PROJECTS_MODULE_ID && normalizeText(task?.source_record_id) === projectId)
        || normalizeText(links[PROJECTS_MODULE_ID]) === projectId;
    });
    const status = await syncProjectStatusWithProcessState(projectId, {
      draftStages: projectDraftStages.length > 0 ? projectDraftStages : undefined,
      tasks: projectTasks.length > 0 ? projectTasks : undefined,
    });
    results.push({ projectId, status });
  }
  return results;
};

export const syncProjectStatusesForTask = async (task: Record<string, any>) => {
  const directProjectIds = collectProjectIdsFromProcessCarriers([task]);
  const runId = normalizeText(task?.process_run_id || parseObject(task?.recurrence_info)?.process_run_id);
  let linkedProjectIds: string[] = [];
  if (runId) {
    const { data, error } = await supabase
      .from('process_run_links')
      .select('record_id')
      .eq('process_run_id', runId)
      .eq('module_id', PROJECTS_MODULE_ID);
    if (error) {
      if (!isMissingColumnLikeError(error)) throw error;
    } else {
      linkedProjectIds = (Array.isArray(data) ? data : [])
        .map((row: any) => normalizeText(row?.record_id))
        .filter(Boolean);
    }
  }
  const projectIds = Array.from(new Set([...directProjectIds, ...linkedProjectIds].filter(Boolean)));
  for (const projectId of projectIds) {
    await syncProjectStatusWithProcessState(projectId);
  }
  return projectIds;
};
