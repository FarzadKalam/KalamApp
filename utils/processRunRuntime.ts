import { MODULES } from '../moduleRegistry';
import { buildClientFallbackSystemCode } from './systemCode';

export type ProcessGroupMeta = {
  groupId: string;
  groupLabel: string | null;
  templateId: string | null;
  templateName: string | null;
};

type MapTemplateStagesOptions = {
  groupId?: string | null;
  groupName?: string | null;
  templateName?: string | null;
  targetModuleIds?: string[] | null;
  processLinkMap?: Record<string, string | null> | null;
  startSortOrder?: number | null;
  sortStep?: number | null;
};

type EnsureProcessRunArgs = {
  supabaseClient: any;
  moduleId: string;
  recordId: string;
  stages: Record<string, any>[];
  targetStage?: Record<string, any> | null;
  currentUserId?: string | null;
};

type SyncProcessRunStageArgs = {
  supabaseClient: any;
  task: Record<string, any>;
};

const PROCESS_RUN_STAGE_SELECT =
  'id, process_run_id, template_stage_id, stage_name, sort_order, status, task_id, metadata';

const normalizeText = (value: unknown) => String(value || '').trim();

const toUuidOrNull = (value: unknown) => {
  const normalized = normalizeText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
};

export const createProcessGroupId = () =>
  `process_group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const buildProcessGroupName = ({
  templateName,
  existingGroupCount = 0,
}: {
  templateName?: string | null;
  existingGroupCount?: number;
} = {}) => {
  const normalizedTemplateName = normalizeText(templateName);
  if (normalizedTemplateName) return normalizedTemplateName;
  return `فرآیند ${Math.max(1, Number(existingGroupCount || 0) + 1)}`;
};

export const getDraftStageProcessGroupMeta = (stage: Record<string, any> | null | undefined): ProcessGroupMeta => {
  const legacyFallback = normalizeText(stage?.source_template_id || 'default_process_group') || 'default_process_group';
  const groupId = normalizeText(stage?.process_group_id || legacyFallback) || 'default_process_group';
  return {
    groupId,
    groupLabel: normalizeText(stage?.process_group_name || stage?.source_template_name) || null,
    templateId: normalizeText(stage?.source_template_id) || null,
    templateName: normalizeText(stage?.source_template_name) || null,
  };
};

export const getTaskProcessGroupMeta = (task: Record<string, any> | null | undefined): ProcessGroupMeta => {
  const recurrence = parseObject(task?.recurrence_info);
  const processMeta = parseObject(recurrence?.process_group);
  return {
    groupId: normalizeText(processMeta?.id || task?.process_group_id) || '',
    groupLabel: normalizeText(processMeta?.name || task?.process_group_name) || null,
    templateId: normalizeText(processMeta?.template_id || task?.source_template_id) || null,
    templateName: normalizeText(processMeta?.template_name) || null,
  };
};

export const mapProcessTemplateStagesToDraft = (
  templateId: string,
  stages: Record<string, any>[],
  options: MapTemplateStagesOptions = {}
) => {
  const groupId = normalizeText(options.groupId) || createProcessGroupId();
  const groupName = normalizeText(options.groupName || options.templateName) || buildProcessGroupName({
    templateName: options.templateName,
  });
  let cursor = Number(options.startSortOrder || 0);
  const sortStep = Math.max(1, Number(options.sortStep || 10));

  return (Array.isArray(stages) ? stages : []).map((stage: any, index: number) => {
    const metadata = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {};
    if (!cursor) cursor = Number(stage?.sort_order || ((index + 1) * sortStep));
    const stageName = normalizeText(stage?.stage_name || metadata?.stage_name) || `مرحله ${index + 1}`;
    const row = {
      ...(metadata || {}),
      id: `draft_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
      name: stageName,
      stage_name: stageName,
      description: normalizeText(metadata?.description) || null,
      task_type: normalizeText(metadata?.task_type) || null,
      automation_rules: Array.isArray(metadata?.automation_rules) ? metadata.automation_rules : [],
      sort_order: cursor,
      wage: Number(stage?.wage || 0),
      weight: Number(metadata?.weight || 0),
      duration_value: Number(metadata?.duration_value || 0),
      duration_unit: normalizeText(metadata?.duration_unit) || 'day',
      duration_from: normalizeText(metadata?.duration_from) || 'project_start',
      default_assignee_id: stage?.default_assignee_id || null,
      default_assignee_role_id: stage?.default_assignee_role_id || null,
      template_stage_id: stage?.id || null,
      source_template_id: normalizeText(templateId) || null,
      source_template_name: normalizeText(options.templateName) || null,
      process_group_id: groupId,
      process_group_name: groupName,
      process_target_module_ids: Array.isArray(options.targetModuleIds) ? options.targetModuleIds : [],
      process_link_map: options.processLinkMap && typeof options.processLinkMap === 'object'
        ? options.processLinkMap
        : {},
    };
    cursor += sortStep;
    return row;
  });
};

const parseObject = (value: any): Record<string, any> => {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const isMissingColumnLikeError = (error: any, columnName?: string) => {
  const code = normalizeText(error?.code).toUpperCase();
  if (['42703', 'PGRST200', 'PGRST204'].includes(code)) return true;
  const text = normalizeText(error?.message || error?.details || error?.hint).toLowerCase();
  if (!text) return false;
  if (!columnName) return text.includes('column') || text.includes('schema cache') || text.includes('does not exist');
  const needle = columnName.toLowerCase();
  return text.includes(needle) && (text.includes('column') || text.includes('schema cache') || text.includes('does not exist'));
};

const getModuleTable = (moduleId: string) => MODULES[moduleId]?.table || moduleId;

const resolveOrgId = async (
  supabaseClient: any,
  moduleId: string,
  recordId: string
) => {
  try {
    const { data } = await supabaseClient
      .from(getModuleTable(moduleId))
      .select('org_id')
      .eq('id', recordId)
      .maybeSingle();
    const orgId = normalizeText(data?.org_id);
    if (orgId) return orgId;
  } catch {
    // fallback below
  }

  try {
    const { data: authData } = await supabaseClient.auth.getUser();
    const userId = normalizeText(authData?.user?.id);
    if (!userId) return null;
    const { data } = await supabaseClient
      .from('profiles')
      .select('org_id')
      .eq('id', userId)
      .maybeSingle();
    return normalizeText(data?.org_id) || null;
  } catch {
    return null;
  }
};

const findExistingProcessRun = async (
  supabaseClient: any,
  orgId: string | null,
  moduleId: string,
  recordId: string,
  groupId: string
) => {
  if (!groupId) return null;
  try {
    let query = supabaseClient
      .from('process_runs')
      .select('id, system_code, process_name, process_group_id')
      .eq('module_id', moduleId)
      .eq('record_id', recordId)
      .eq('process_group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (orgId) query = query.eq('org_id', orgId);
    const { data, error } = await query.maybeSingle();
    if (error && !isMissingColumnLikeError(error, 'process_group_id')) throw error;
    if (data?.id) return data;
  } catch (error) {
    if (!isMissingColumnLikeError(error, 'process_group_id')) throw error;
  }

  return null;
};

const insertProcessRun = async ({
  supabaseClient,
  orgId,
  moduleId,
  recordId,
  meta,
  currentUserId,
}: {
  supabaseClient: any;
  orgId: string;
  moduleId: string;
  recordId: string;
  meta: ProcessGroupMeta;
  currentUserId?: string | null;
}) => {
  const processName = normalizeText(meta.groupLabel || meta.templateName) || 'فرآیند';
  let payload: Record<string, any> = {
    org_id: orgId,
    template_id: toUuidOrNull(meta.templateId),
    module_id: moduleId,
    record_id: recordId,
    process_name: processName,
    status: 'active',
    copied_mode: 'manual',
    started_at: new Date().toISOString(),
    process_group_id: meta.groupId,
    system_code: await buildClientFallbackSystemCode(supabaseClient, 'process_runs', 'process_runs', { orgId }),
    created_by: currentUserId || null,
    updated_by: currentUserId || null,
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabaseClient
      .from('process_runs')
      .insert(payload)
      .select('id, system_code, process_name, process_group_id')
      .maybeSingle();
    if (!error) return data;
    if (String(error?.code || '').toUpperCase() === '23505' && normalizeText(error?.message).includes('system_code')) {
      payload = {
        ...payload,
        system_code: await buildClientFallbackSystemCode(supabaseClient, 'process_runs', 'process_runs', { orgId }),
      };
      continue;
    }
    throw error;
  }

  throw new Error('ایجاد اجرای فرآیند ناموفق بود.');
};

const ensureProcessRunLinks = async (
  supabaseClient: any,
  processRunId: string,
  moduleId: string,
  recordId: string,
  stages: Record<string, any>[]
) => {
  const links = new Map<string, { moduleId: string; recordId: string; isPrimary: boolean }>();
  links.set(`${moduleId}:${recordId}`, { moduleId, recordId, isPrimary: true });
  stages.forEach((stage) => {
    const rawMap = stage?.process_link_map && typeof stage.process_link_map === 'object' ? stage.process_link_map : {};
    Object.entries(rawMap).forEach(([linkedModuleId, linkedRecordId]) => {
      const normalizedModuleId = normalizeText(linkedModuleId);
      const normalizedRecordId = normalizeText(linkedRecordId);
      if (!normalizedModuleId || !normalizedRecordId) return;
      const key = `${normalizedModuleId}:${normalizedRecordId}`;
      if (!links.has(key)) links.set(key, { moduleId: normalizedModuleId, recordId: normalizedRecordId, isPrimary: false });
    });
  });

  const payload = Array.from(links.values()).map((link) => ({
    process_run_id: processRunId,
    module_id: link.moduleId,
    record_id: link.recordId,
    is_primary: link.isPrimary,
  }));
  if (payload.length === 0) return;

  try {
    await supabaseClient
      .from('process_run_links')
      .upsert(payload, { onConflict: 'process_run_id,module_id,record_id' });
  } catch (error) {
    console.warn('Could not upsert process run links', error);
  }
};

const normalizeStageStatusForRun = (status: unknown) => {
  const normalized = normalizeText(status).toLowerCase();
  if (['in_progress', 'done', 'blocked', 'canceled'].includes(normalized)) return normalized;
  if (normalized === 'completed') return 'done';
  return 'todo';
};

const isSameDraftStage = (left: Record<string, any>, right: Record<string, any>) => {
  const leftId = normalizeText(left?.id || left?.template_stage_id || left?.process_run_stage_id);
  const rightId = normalizeText(right?.id || right?.template_stage_id || right?.process_run_stage_id);
  if (leftId && rightId && leftId === rightId) return true;
  const leftTemplateStageId = normalizeText(left?.template_stage_id);
  const rightTemplateStageId = normalizeText(right?.template_stage_id);
  if (leftTemplateStageId && rightTemplateStageId && leftTemplateStageId === rightTemplateStageId) return true;
  return Number(left?.sort_order || 0) === Number(right?.sort_order || 0)
    && normalizeText(left?.name || left?.stage_name || left?.title).toLowerCase()
      === normalizeText(right?.name || right?.stage_name || right?.title).toLowerCase();
};

const upsertProcessRunStages = async (
  supabaseClient: any,
  processRunId: string,
  stages: Record<string, any>[],
  targetStage?: Record<string, any> | null
) => {
  const { data: existingRows, error } = await supabaseClient
    .from('process_run_stages')
    .select(PROCESS_RUN_STAGE_SELECT)
    .eq('process_run_id', processRunId)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  const rows = Array.isArray(existingRows) ? existingRows : [];
  const byKey = new Map<string, Record<string, any>>();
  rows.forEach((row) => {
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    [
      normalizeText(row?.template_stage_id),
      normalizeText(metadata?.draft_stage_id),
      `${Number(row?.sort_order || 0)}:${normalizeText(row?.stage_name).toLowerCase()}`,
    ].filter(Boolean).forEach((key) => byKey.set(key, row));
  });

  const stageMap = new Map<string, string>();
  for (const stage of stages) {
    const stageName = normalizeText(stage?.name || stage?.stage_name || stage?.title) || 'مرحله';
    const templateStageId = toUuidOrNull(stage?.template_stage_id);
    const metadata = {
      ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
      draft_stage_id: normalizeText(stage?.id) || null,
      process_group_id: normalizeText(stage?.process_group_id) || null,
      process_group_name: normalizeText(stage?.process_group_name) || null,
      process_target_module_ids: Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : [],
      process_link_map: stage?.process_link_map && typeof stage.process_link_map === 'object' ? stage.process_link_map : {},
      source_template_id: normalizeText(stage?.source_template_id) || null,
      source_template_name: normalizeText(stage?.source_template_name) || null,
      task_type: normalizeText(stage?.task_type) || null,
    };
    const lookupKeys = [
      normalizeText(templateStageId),
      normalizeText(stage?.id),
      `${Number(stage?.sort_order || 0)}:${stageName.toLowerCase()}`,
    ].filter(Boolean);
    const existing = lookupKeys.map((key) => byKey.get(key)).find(Boolean);
    let processRunStageId = normalizeText(existing?.id);
    const payload = {
      process_run_id: processRunId,
      template_stage_id: templateStageId,
      stage_name: stageName,
      sort_order: Number(stage?.sort_order || 10),
      status: normalizeStageStatusForRun(stage?.status),
      assignee_user_id: stage?.default_assignee_id || stage?.assignee_id || null,
      assignee_role_id: stage?.default_assignee_role_id || stage?.assignee_role_id || null,
      wage: Number(stage?.wage || 0),
      metadata,
    };

    if (processRunStageId) {
      const { error: updateError } = await supabaseClient
        .from('process_run_stages')
        .update(payload)
        .eq('id', processRunStageId);
      if (updateError) throw updateError;
    } else {
      const { data, error: insertError } = await supabaseClient
        .from('process_run_stages')
        .insert(payload)
        .select('id')
        .maybeSingle();
      if (insertError) throw insertError;
      processRunStageId = normalizeText(data?.id);
    }

    if (processRunStageId) {
      lookupKeys.forEach((key) => stageMap.set(key, processRunStageId));
      if (targetStage && isSameDraftStage(stage, targetStage)) {
        stageMap.set('__target__', processRunStageId);
      }
    }
  }

  return {
    processRunStageId: stageMap.get('__target__') || null,
    stageMap,
  };
};

const backfillExistingTasksForRun = async (
  supabaseClient: any,
  processRunId: string,
  groupId: string
) => {
  if (!processRunId || !groupId) return;
  try {
    const { data } = await supabaseClient
      .from('tasks')
      .select('id, name, sort_order, process_run_id, process_run_stage_id')
      .eq('process_group_id', groupId)
      .is('process_run_id', null)
      .limit(500);
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) return;
    await supabaseClient
      .from('tasks')
      .update({ process_run_id: processRunId })
      .eq('process_group_id', groupId)
      .is('process_run_id', null);
  } catch (error) {
    if (!isMissingColumnLikeError(error)) {
      console.warn('Could not backfill process run id on existing tasks', error);
    }
  }
};

export const ensureProcessRunForDraftStageGroup = async ({
  supabaseClient,
  moduleId,
  recordId,
  stages,
  targetStage = null,
  currentUserId = null,
}: EnsureProcessRunArgs): Promise<{ processRunId: string | null; processRunStageId: string | null }> => {
  const targetMeta = getDraftStageProcessGroupMeta(targetStage || stages[0]);
  const groupId = normalizeText(targetMeta.groupId);
  if (!supabaseClient || !moduleId || !recordId || !groupId || groupId === 'default_process_group') {
    return { processRunId: null, processRunStageId: null };
  }

  const groupStages = (Array.isArray(stages) ? stages : [])
    .filter((stage) => getDraftStageProcessGroupMeta(stage).groupId === groupId)
    .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
  if (groupStages.length === 0) return { processRunId: null, processRunStageId: null };

  const orgId = await resolveOrgId(supabaseClient, moduleId, recordId);
  if (!orgId) return { processRunId: null, processRunStageId: null };

  let run: Record<string, any> | null = null;
  try {
    run = await findExistingProcessRun(supabaseClient, orgId, moduleId, recordId, groupId);
    if (!run?.id) {
      run = await insertProcessRun({
        supabaseClient,
        orgId,
        moduleId,
        recordId,
        meta: targetMeta,
        currentUserId,
      });
    }
  } catch (error) {
    if (!isMissingColumnLikeError(error)) throw error;
    console.warn('Process run schema is not ready; task will be created without process_run_id', error);
    return { processRunId: null, processRunStageId: null };
  }

  const processRunId = normalizeText(run?.id);
  if (!processRunId) return { processRunId: null, processRunStageId: null };

  try {
    await ensureProcessRunLinks(supabaseClient, processRunId, moduleId, recordId, groupStages);
    const { processRunStageId } = await upsertProcessRunStages(supabaseClient, processRunId, groupStages, targetStage);
    await backfillExistingTasksForRun(supabaseClient, processRunId, groupId);

    return { processRunId, processRunStageId };
  } catch (error) {
    if (!isMissingColumnLikeError(error)) throw error;
    console.warn('Process run stages schema is not ready; task will be created without process_run_stage_id', error);
    return { processRunId, processRunStageId: null };
  }
};

export const syncProcessRunStageFromTask = async ({
  supabaseClient,
  task,
}: SyncProcessRunStageArgs) => {
  const processRunStageId = normalizeText(task?.process_run_stage_id);
  if (!supabaseClient || !processRunStageId) return;

  const patch = {
    task_id: normalizeText(task?.id) || null,
    status: normalizeStageStatusForRun(task?.status),
    assignee_user_id: task?.assignee_id || null,
    assignee_role_id: task?.assignee_role_id || null,
    planned_due_at: task?.due_date || null,
    started_at: task?.actual_start_at || task?.start_date || null,
    completed_at: task?.completed_at || null,
    updated_at: new Date().toISOString(),
  };

  try {
    await supabaseClient
      .from('process_run_stages')
      .update(patch)
      .eq('id', processRunStageId);
  } catch (error) {
    if (!isMissingColumnLikeError(error)) {
      console.warn('Could not sync process run stage from task', error);
    }
  }
};
