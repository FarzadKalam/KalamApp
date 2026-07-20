import { supabase } from '../supabaseClient';
import { applyTaskSourceRecordFilter } from './taskMeta';
import { isTaskDoneStatus, normalizeTaskStatus } from './taskCompletion';
import { parseProcessLinkMap } from './processTargets';
import { filterDeletedProcessRunStageMarks } from './processDeletedStageMarks';

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
type ProjectProcessRun = { id: string; status?: string | null };
type ProjectProcessRuntimeSummary = {
  processRuns: ProjectProcessRun[];
  runStages: ProcessRuntimeCarrier[];
};

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

const getCarrierProcessRunId = (carrier: ProcessRuntimeCarrier | null | undefined) => {
  const recurrence = parseObject(carrier?.recurrence_info);
  return normalizeText(carrier?.process_run_id || recurrence?.process_run_id);
};

const getCarrierProcessRunStageId = (carrier: ProcessRuntimeCarrier | null | undefined) => {
  const recurrence = parseObject(carrier?.recurrence_info);
  return normalizeText(carrier?.process_run_stage_id || recurrence?.process_run_stage_id);
};

const isProcessV2DeletedCarrier = (carrier: ProcessRuntimeCarrier | null | undefined) => {
  const metadata = parseObject(carrier?.metadata);
  return metadata?.process_v2_deleted === true || metadata?.deleted_from_process_v2 === true;
};

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

const isActualDraftStage = (stage: ProcessRuntimeCarrier) => {
  if (isProcessV2DeletedCarrier(stage)) return false;
  const status = normalizeTaskStatus(stage?.status);
  if (stage?.is_draft === true || status === 'draft') return true;
  if (
    normalizeText(stage?.task_id)
    || normalizeText(stage?.process_task_id)
    || normalizeText(stage?.process_run_stage_id)
    || normalizeText(stage?.activity_id)
  ) return false;
  // contextهای runtime که قبلاً به اشتباه داخل JSON پیش‌نویس ذخیره شده‌اند
  // نباید یک مرحله باز و زنده برای پروژه محسوب شوند.
  if (normalizeText(stage?.process_run_id)) return false;
  return Boolean(normalizeText(stage?.id || stage?.name || stage?.stage_name));
};

export const reconcileProjectProcessStatusCarriers = (
  tasks: ProcessRuntimeCarrier[],
  runStages: ProcessRuntimeCarrier[],
) => {
  const normalizedTasks = dedupeRowsById((Array.isArray(tasks) ? tasks : [])
    .filter((task) => Boolean(normalizeText(task?.id || task?.name))));
  const taskIds = new Set(normalizedTasks.map((task) => normalizeText(task?.id)).filter(Boolean));
  const taskStageIds = new Set(normalizedTasks
    .map((task) => normalizeText(task?.process_run_stage_id))
    .filter(Boolean));
  const remainingRunStages = dedupeRowsById((Array.isArray(runStages) ? runStages : [])
    .filter((stage) => Boolean(normalizeText(stage?.id || stage?.stage_name || stage?.name)))
    .filter((stage) => {
      const linkedTaskId = normalizeText(stage?.task_id);
      const stageId = normalizeText(stage?.id);
      return !(linkedTaskId && taskIds.has(linkedTaskId)) && !(stageId && taskStageIds.has(stageId));
    }));
  return [...normalizedTasks, ...remainingRunStages];
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
  runStages?: Array<Record<string, any>>,
  processRuns?: ProjectProcessRun[],
): ProjectProcessStatus | null => {
  const normalizedDraftStages = parseDraftStages(draftStages)
    .filter(isActualDraftStage);
  const hasDraftStages = normalizedDraftStages.length > 0;

  // فعالیت یا مرحله‌ای که V2 حذف کرده، حتی اگر دادهٔ قدیمی آن در یک query
  // باقی مانده باشد، نباید وضعیت پروژه را دوباره باز کند.
  const visibleTasks = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => !isProcessV2DeletedCarrier(task));
  const visibleRunStages = (Array.isArray(runStages) ? runStages : [])
    .filter((stage) => !isProcessV2DeletedCarrier(stage));

  const completedRunIds = new Set((Array.isArray(processRuns) ? processRuns : [])
    .filter((run) => isTaskDoneStatus(run?.status))
    .map((run) => normalizeText(run?.id))
    .filter(Boolean));
  const activeTasks = visibleTasks.filter((task) => {
    const runId = getCarrierProcessRunId(task);
    return !runId || !completedRunIds.has(runId);
  });
  const activeRunStages = visibleRunStages.filter((stage) => (
    !completedRunIds.has(getCarrierProcessRunId(stage))
  ));
  const completedRunCarriers = Array.from(completedRunIds).map((id) => ({
    id: `completed-process-run:${id}`,
    process_run_id: id,
    status: 'completed',
  }));
  const statusCarriers = reconcileProjectProcessStatusCarriers(
    [...activeTasks, ...completedRunCarriers],
    activeRunStages,
  );
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

export const fetchProjectProcessTasks = async (
  projectId: string,
  options?: { runIds?: string[]; includeRunTasks?: boolean },
) => {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) return [] as Array<Record<string, any>>;

  let rows: Array<Record<string, any>> = [];

  const taskColumns = 'id,status,project_id,source_module_id,source_record_id,process_run_id,process_run_stage_id,recurrence_info,metadata';
  const legacyTaskColumns = 'id,status,project_id,source_module_id,source_record_id,process_run_id,process_run_stage_id,recurrence_info';
  const fetchSourceTasks = async (columns: string) => {
    let query = supabase.from('tasks').select(columns);
    query = applyTaskSourceRecordFilter(query, 'projects', normalizedProjectId);
    return query.limit(5000);
  };
  let { data, error } = await fetchSourceTasks(taskColumns);
  if (error && isMissingColumnLikeError(error)) {
    ({ data, error } = await fetchSourceTasks(legacyTaskColumns));
  }
  if (error) throw error;
  if (Array.isArray(data)) rows.push(...data);

  const runIds = options?.runIds || await fetchProjectProcessRunIds(normalizedProjectId);
  const validRunIds = new Set(runIds);
  rows = rows.filter((task) => {
    const runId = getCarrierProcessRunId(task);
    return !runId || validRunIds.has(runId);
  });
  if (options?.includeRunTasks !== false && runIds.length > 0) {
    const fetchRunTasks = (columns: string) => supabase
      .from('tasks')
      .select(columns)
      .in('process_run_id', runIds)
      .limit(5000);
    let { data: processTasks, error: processTasksError } = await fetchRunTasks(taskColumns);
    if (processTasksError && isMissingColumnLikeError(processTasksError)) {
      ({ data: processTasks, error: processTasksError } = await fetchRunTasks(legacyTaskColumns));
    }
    if (processTasksError) {
      if (!isMissingColumnLikeError(processTasksError)) throw processTasksError;
    } else if (Array.isArray(processTasks)) {
      rows.push(...processTasks);
    }
  }

  const visibleRows = dedupeRowsById(rows).filter((task) => !isProcessV2DeletedCarrier(task));
  const taskStages = visibleRows
    .map((task) => {
      const stageId = getCarrierProcessRunStageId(task);
      return stageId ? { id: stageId } : null;
    })
    .filter(Boolean) as Array<{ id: string }>;
  if (taskStages.length === 0) return visibleRows;

  // حذف V2 ممکن است روی stage tombstone ثبت شده باشد، اما یک task قدیمی
  // هنوز در جدول باقی مانده باشد. آن task دیگر بخشی از وضعیت پروژه نیست.
  const visibleStages = await filterDeletedProcessRunStageMarks(supabase, taskStages);
  const visibleStageIds = new Set(visibleStages.map((stage) => normalizeText(stage?.id)).filter(Boolean));
  return visibleRows.filter((task) => {
    const stageId = getCarrierProcessRunStageId(task);
    return !stageId || visibleStageIds.has(stageId);
  });
};

export const fetchProjectProcessRuntimeSummary = async (
  projectId: string,
): Promise<ProjectProcessRuntimeSummary | null> => {
  const normalizedProjectId = normalizeText(projectId);
  if (!normalizedProjectId) return null;

  const { data, error } = await supabase.rpc('get_process_runtime_summary_batch_for_records', {
    p_module_id: PROJECTS_MODULE_ID,
    p_record_ids: [normalizedProjectId],
  });
  if (error) {
    const code = normalizeText(error?.code).toUpperCase();
    const text = normalizeText(error?.message || error?.details || error?.hint).toLowerCase();
    // نصب‌های قدیمی که هنوز phase 354 را ندارند، از مسیر سازگار قبلی استفاده می‌کنند.
    if (code === 'PGRST202' || text.includes('get_process_runtime_summary_batch_for_records')) return null;
    throw error;
  }

  const row = (Array.isArray(data) ? data : []).find((item: any) => (
    normalizeText(item?.record_id) === normalizedProjectId
  ));
  if (!row) return { processRuns: [], runStages: [] };
  return {
    processRuns: (Array.isArray(row?.runs) ? row.runs : [])
      .map((run: any) => ({ id: normalizeText(run?.id), status: run?.status }))
      .filter((run: ProjectProcessRun) => Boolean(run.id)),
    runStages: Array.isArray(row?.stages) ? row.stages : [],
  };
};

export const filterProjectDraftStagesForRuntimeSummary = (
  draftStages: any,
  runtimeSummary: ProjectProcessRuntimeSummary | null | undefined,
) => {
  const stages = parseDraftStages(draftStages).filter(isActualDraftStage);
  const processRuns = runtimeSummary?.processRuns || [];
  if (processRuns.length === 0) return stages;

  const runIds = new Set(processRuns.map((run) => normalizeText(run.id)).filter(Boolean));
  const stageIds = new Set((runtimeSummary?.runStages || [])
    .map((stage) => normalizeText(stage?.id || stage?.process_run_stage_id))
    .filter(Boolean));
  return stages.filter((stage) => {
    const runId = getCarrierProcessRunId(stage);
    const stageId = getCarrierProcessRunStageId(stage);
    if (runId && !runIds.has(runId)) return false;
    if (stageId && !stageIds.has(stageId)) return false;
    return true;
  });
};

export const fetchProjectProcessRuns = async (projectId: string): Promise<ProjectProcessRun[]> => {
  const normalizedProjectId = normalizeText(projectId);
  if (!normalizedProjectId) return [];

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

  const candidateRunIds = Array.from(runIds);
  if (candidateRunIds.length === 0) return [];

  // لینک باقی‌مانده به اجرای حذف‌شده نباید وضعیت پروژه را تغییر دهد.
  const { data: existingRuns, error: existingRunsError } = await supabase
    .from('process_runs')
    .select('id,status')
    .in('id', candidateRunIds)
    .limit(1000);
  if (existingRunsError) {
    if (!isMissingColumnLikeError(existingRunsError)) throw existingRunsError;
    return candidateRunIds.map((id) => ({ id }));
  }
  return (Array.isArray(existingRuns) ? existingRuns : [])
    .map((row: any) => ({ id: normalizeText(row?.id), status: row?.status }))
    .filter((row) => Boolean(row.id));
};

export const fetchProjectProcessRunIds = async (projectId: string) => (
  (await fetchProjectProcessRuns(projectId)).map((run) => run.id)
);

export const fetchProjectProcessRunStages = async (
  projectId: string,
  options?: { runIds?: string[] },
) => {
  const runIds = options?.runIds || await fetchProjectProcessRunIds(projectId);
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
  return filterDeletedProcessRunStageMarks(supabase, Array.isArray(data) ? data : []);
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

  const runtimeSummary = await fetchProjectProcessRuntimeSummary(normalizedProjectId);
  const hasRuntimeSummary = Boolean(runtimeSummary && runtimeSummary.processRuns.length > 0);
  const processRuns = hasRuntimeSummary
    ? runtimeSummary!.processRuns
    : await fetchProjectProcessRuns(normalizedProjectId);
  const runIds = processRuns.map((run) => run.id);
  const [fetchedTasks, projectRunStages] = await Promise.all([
    options?.tasks || fetchProjectProcessTasks(normalizedProjectId, {
      runIds,
      // خلاصهٔ runtime، taskهای وابسته به اجرای فرآیند را با stageهای واقعی و
      // tombstoneهای حذف‌شده برمی‌گرداند؛ این query فقط فعالیت مستقل پروژه را نگه می‌دارد.
      includeRunTasks: !hasRuntimeSummary,
    }),
    hasRuntimeSummary
      ? Promise.resolve(runtimeSummary!.runStages)
      : fetchProjectProcessRunStages(normalizedProjectId, { runIds }),
  ]);
  const projectTasks = hasRuntimeSummary
    ? fetchedTasks.filter((task) => !getCarrierProcessRunId(task) && !getCarrierProcessRunStageId(task))
    : fetchedTasks;
  const statusDraftStages = hasRuntimeSummary
    ? filterProjectDraftStagesForRuntimeSummary(projectDraftStages, runtimeSummary)
    : projectDraftStages;
  const nextStatus = deriveProjectStatusFromProcessState(
    statusDraftStages,
    projectTasks,
    projectRunStages,
    processRuns,
  );
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
    // Snapshot صفحه ممکن است کامل نباشد یا هم‌زمان با حذف/تبدیل مرحله قدیمی شده باشد.
    // وضعیت پروژه همیشه از رکوردهای فعلی سرور محاسبه می‌شود، نه از همین snapshot.
    const status = await syncProjectStatusWithProcessState(projectId);
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
