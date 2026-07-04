import { MODULES } from '../moduleRegistry';
import { parseAssigneeValue } from './assigneeValue';
import { findProcessAssigneeFieldReference } from './processAssigneeReference';
import {
  PROCESS_GRAPH_METADATA_KEY,
  PROCESS_LANE_KEY,
  PROCESS_NODE_KEY,
  attachProcessGraphToStages,
  getProcessStageLaneKey,
  getProcessStageNodeKey,
  materializeLegacyProcessGraph,
} from './processGraph';
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
  stageScope?: 'group' | 'target';
};

export type EnsuredProcessRunContext = {
  processRunId: string | null;
  processRunStageId: string | null;
  stageMap: Map<string, string>;
};

type SyncProcessRunStageArgs = {
  supabaseClient: any;
  task: Record<string, any>;
};

const normalizeText = (value: unknown) => String(value || '').trim();
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeDbUuid = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  const stripped = raw.replace(/^(process_run_stage|process_run|process_template_stage|process_template|task)[_:]/i, '');
  return UUID_LIKE_RE.test(stripped) ? stripped : '';
};

const toUuidOrNull = (value: unknown) => {
  const normalized = normalizeDbUuid(value);
  return normalized || null;
};

const normalizeStageAssigneeFields = (stage: Record<string, any>) => {
  const metadata = parseObject(stage?.metadata);
  const roleValue = parseAssigneeValue(stage?.default_assignee_role_id || stage?.assignee_role_id, 'role');
  if (roleValue.assigneeType === 'role' && toUuidOrNull(roleValue.assigneeId)) {
    return {
      defaultAssigneeId: null,
      defaultAssigneeRoleId: toUuidOrNull(roleValue.assigneeId),
      defaultAssigneeField: null,
    };
  }

  const userValue = parseAssigneeValue(stage?.default_assignee_id || stage?.assignee_id, 'user');
  if (userValue.assigneeType === 'role' && toUuidOrNull(userValue.assigneeId)) {
    return {
      defaultAssigneeId: null,
      defaultAssigneeRoleId: toUuidOrNull(userValue.assigneeId),
      defaultAssigneeField: null,
    };
  }
  if (userValue.assigneeType === 'user' && toUuidOrNull(userValue.assigneeId)) {
    return {
      defaultAssigneeId: toUuidOrNull(userValue.assigneeId),
      defaultAssigneeRoleId: null,
      defaultAssigneeField: null,
    };
  }

  const defaultAssigneeField = findProcessAssigneeFieldReference(
    stage?.default_assignee_field,
    metadata?.default_assignee_field,
    stage?.default_assignee_combo,
    metadata?.default_assignee_combo,
    stage?.default_assignee_id,
    stage?.assignee_id,
    stage?.default_assignee_role_id,
    stage?.assignee_role_id,
    metadata?.default_assignee_id,
    metadata?.assignee_id,
    metadata?.default_assignee_role_id,
    metadata?.assignee_role_id,
  );

  return {
    defaultAssigneeId: null,
    defaultAssigneeRoleId: null,
    defaultAssigneeField: defaultAssigneeField || null,
  };
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
  const materialized = materializeLegacyProcessGraph(Array.isArray(stages) ? stages : []);
  const sourceStages = attachProcessGraphToStages(materialized.stages, materialized.graph);
  let cursor = Number(options.startSortOrder || 0);
  const sortStep = Math.max(1, Number(options.sortStep || 10));

  return sourceStages.map((stage: any, index: number) => {
    const metadata = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {};
    const sourceSortOrder = Number(stage?.sort_order || ((index + 1) * sortStep));
    if (!cursor) cursor = sourceSortOrder;
    const stageName = normalizeText(stage?.stage_name || metadata?.stage_name) || `مرحله ${index + 1}`;
    const assignee = normalizeStageAssigneeFields(stage);
    const processNodeKey = getProcessStageNodeKey(stage, index);
    const processLaneKey = getProcessStageLaneKey(stage);
    const row = {
      ...(metadata || {}),
      id: `draft_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
      name: stageName,
      stage_name: stageName,
      description: normalizeText(metadata?.description) || null,
      task_type: normalizeText(metadata?.task_type) || null,
      automation_rules: Array.isArray(metadata?.automation_rules) ? metadata.automation_rules : [],
      sort_order: options.startSortOrder ? cursor : sourceSortOrder,
      wage: Number(stage?.wage || 0),
      weight: Number(metadata?.weight || 0),
      start_duration_value: Number(stage?.start_duration_value ?? metadata?.start_duration_value ?? metadata?.duration_start_value ?? 0),
      start_duration_unit: normalizeText(stage?.start_duration_unit || metadata?.start_duration_unit || metadata?.duration_start_unit || 'day') || 'day',
      start_duration_from: normalizeText(stage?.start_duration_from || metadata?.start_duration_from || metadata?.duration_start_from || 'project_start') || 'project_start',
      start_anchor_stage_node_key: normalizeText(stage?.start_anchor_stage_node_key || metadata?.start_anchor_stage_node_key) || null,
      duration_value: Number(metadata?.duration_value || 0),
      duration_unit: normalizeText(metadata?.duration_unit) || 'day',
      duration_from: normalizeText(metadata?.duration_from) || 'project_start',
      default_assignee_id: assignee.defaultAssigneeId,
      default_assignee_role_id: assignee.defaultAssigneeRoleId,
      default_assignee_field: assignee.defaultAssigneeField,
      template_stage_id: stage?.id || null,
      source_template_id: normalizeText(templateId) || null,
      source_template_name: normalizeText(options.templateName) || null,
      process_group_id: groupId,
      process_group_name: groupName,
      process_target_module_ids: Array.isArray(options.targetModuleIds) ? options.targetModuleIds : [],
      process_link_map: options.processLinkMap && typeof options.processLinkMap === 'object'
        ? options.processLinkMap
        : {},
      [PROCESS_NODE_KEY]: processNodeKey,
      [PROCESS_LANE_KEY]: processLaneKey,
      [PROCESS_GRAPH_METADATA_KEY]: materialized.graph,
      metadata: {
        ...metadata,
        start_duration_value: Number(stage?.start_duration_value ?? metadata?.start_duration_value ?? metadata?.duration_start_value ?? 0),
        start_duration_unit: normalizeText(stage?.start_duration_unit || metadata?.start_duration_unit || metadata?.duration_start_unit || 'day') || 'day',
        start_duration_from: normalizeText(stage?.start_duration_from || metadata?.start_duration_from || metadata?.duration_start_from || 'project_start') || 'project_start',
        start_anchor_stage_node_key: normalizeText(stage?.start_anchor_stage_node_key || metadata?.start_anchor_stage_node_key) || null,
        default_assignee_field: assignee.defaultAssigneeField,
        [PROCESS_NODE_KEY]: processNodeKey,
        [PROCESS_LANE_KEY]: processLaneKey,
        [PROCESS_GRAPH_METADATA_KEY]: materialized.graph,
      },
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

const isMissingProcessRuntimeRpcError = (error: any, functionName: string) => {
  const code = normalizeText(error?.code).toUpperCase();
  if (['PGRST202', '42883'].includes(code)) return true;
  const text = normalizeText(error?.message || error?.details || error?.hint).toLowerCase();
  return text.includes(functionName.toLowerCase())
    && (text.includes('function') || text.includes('schema cache'));
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

const normalizeStageStatusForRun = (status: unknown) => {
  const normalized = normalizeText(status).toLowerCase();
  if (['in_progress', 'done', 'blocked', 'canceled'].includes(normalized)) return normalized;
  if (normalized === 'completed') return 'done';
  return 'todo';
};

const isSameDraftStage = (left: Record<string, any> | null | undefined, right: Record<string, any> | null | undefined) => {
  if (!left || !right) return false;
  const leftNodeKey = normalizeText(left?.[PROCESS_NODE_KEY] || left?.metadata?.[PROCESS_NODE_KEY]);
  const rightNodeKey = normalizeText(right?.[PROCESS_NODE_KEY] || right?.metadata?.[PROCESS_NODE_KEY]);
  if (leftNodeKey && rightNodeKey && leftNodeKey === rightNodeKey) return true;
  const leftId = normalizeText(left?.id || left?.template_stage_id || left?.process_run_stage_id);
  const rightId = normalizeText(right?.id || right?.template_stage_id || right?.process_run_stage_id);
  if (leftId && rightId && leftId === rightId) return true;
  return Number(left?.sort_order || 0) === Number(right?.sort_order || 0)
    && normalizeText(left?.name || left?.stage_name || left?.title).toLowerCase()
      === normalizeText(right?.name || right?.stage_name || right?.title).toLowerCase();
};

export const buildProcessRunStageLookupKeys = (stage: Record<string, any>) => {
  const stageName = normalizeText(stage?.name || stage?.stage_name || stage?.title) || 'مرحله';
  return [
    normalizeText(stage?.[PROCESS_NODE_KEY] || stage?.metadata?.[PROCESS_NODE_KEY]),
    normalizeText(toUuidOrNull(stage?.template_stage_id)),
    normalizeText(stage?.id),
    `${Number(stage?.sort_order || 0)}:${stageName.toLowerCase()}`,
  ].filter(Boolean);
};

export const resolveProcessRunStageId = (
  stageMap: Map<string, string> | null | undefined,
  stage: Record<string, any>
) => buildProcessRunStageLookupKeys(stage)
  .map((key) => stageMap?.get(key))
  .find(Boolean) || null;

export const ensureProcessRunContextsForStageGroups = async (
  stages: Record<string, any>[],
  ensureGroup: (firstStage: Record<string, any>, groupId: string) => Promise<EnsuredProcessRunContext>
) => {
  const firstStageByGroup = new Map<string, Record<string, any>>();
  (Array.isArray(stages) ? stages : []).forEach((stage) => {
    const groupId = getDraftStageProcessGroupMeta(stage).groupId;
    if (!firstStageByGroup.has(groupId)) firstStageByGroup.set(groupId, stage);
  });

  const contexts = new Map<string, EnsuredProcessRunContext>();
  for (const [groupId, firstStage] of firstStageByGroup.entries()) {
    contexts.set(groupId, await ensureGroup(firstStage, groupId));
  }
  return contexts;
};

export const removeDraftStagesForProcessGroups = (
  stages: Record<string, any>[],
  groupIds: Array<string | null | undefined>
) => {
  if (!Array.isArray(stages) || stages.length === 0) return [];
  const normalizedGroupIds = new Set(
    (Array.isArray(groupIds) ? groupIds : [])
      .map((groupId) => normalizeText(groupId))
      .filter(Boolean)
  );
  if (normalizedGroupIds.size === 0) return stages;

  return stages.filter((stage) => !normalizedGroupIds.has(getDraftStageProcessGroupMeta(stage).groupId));
};

export const ensureProcessRunForDraftStageGroup = async ({
  supabaseClient,
  moduleId,
  recordId,
  stages,
  targetStage = null,
  stageScope = 'group',
}: EnsureProcessRunArgs): Promise<EnsuredProcessRunContext> => {
  const targetMeta = getDraftStageProcessGroupMeta(targetStage || stages[0]);
  const groupId = normalizeText(targetMeta.groupId);
  const normalizedRecordId = normalizeDbUuid(recordId);
  if (!supabaseClient || !moduleId || !normalizedRecordId || !groupId || groupId === 'default_process_group') {
    return { processRunId: null, processRunStageId: null, stageMap: new Map() };
  }

  const groupStages = (Array.isArray(stages) ? stages : [])
    .filter((stage) => getDraftStageProcessGroupMeta(stage).groupId === groupId)
    .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
  if (groupStages.length === 0 && !targetStage) {
    return { processRunId: null, processRunStageId: null, stageMap: new Map() };
  }
  const scopedStages = stageScope === 'target' && targetStage
    ? groupStages.filter((stage) => isSameDraftStage(stage, targetStage)).slice(0, 1)
    : groupStages;
  const stagesForRuntime = stageScope === 'target' && targetStage
    ? (scopedStages.length > 0 ? scopedStages : [targetStage])
    : groupStages;

  const orgId = normalizeDbUuid(await resolveOrgId(supabaseClient, moduleId, normalizedRecordId));
  if (!orgId) return { processRunId: null, processRunStageId: null, stageMap: new Map() };

  try {
    const rpcStages = stagesForRuntime.map((stage) => {
      const stageForRuntime = targetStage && isSameDraftStage(stage, targetStage)
        ? { ...stage, ...targetStage }
        : stage;
      const stageName = normalizeText(stage?.name || stage?.stage_name || stage?.title) || 'مرحله';
      const assignee = normalizeStageAssigneeFields(stageForRuntime);
      return {
        draft_stage_id: toUuidOrNull(stage?.id),
        template_stage_id: toUuidOrNull(stage?.template_stage_id),
        stage_name: stageName,
        sort_order: Number(stage?.sort_order || 10),
        status: normalizeStageStatusForRun(stage?.status),
        assignee_user_id: assignee.defaultAssigneeId,
        assignee_role_id: assignee.defaultAssigneeRoleId,
        wage: Number(stage?.wage || 0),
        process_node_key: getProcessStageNodeKey(stage),
        process_lane_key: getProcessStageLaneKey(stage),
        metadata: {
          ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
          draft_stage_id: normalizeText(stage?.id) || null,
          draft_stage_key: normalizeText(stage?.id) || null,
          process_group_id: normalizeText(stage?.process_group_id) || null,
          process_group_name: normalizeText(stage?.process_group_name) || null,
          process_target_module_ids: Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : [],
          process_link_map: stage?.process_link_map && typeof stage.process_link_map === 'object' ? stage.process_link_map : {},
          source_template_id: toUuidOrNull(stage?.source_template_id),
          source_template_name: normalizeText(stage?.source_template_name) || null,
          task_type: normalizeText(stage?.task_type) || null,
          default_assignee_field: assignee.defaultAssigneeField,
          [PROCESS_NODE_KEY]: getProcessStageNodeKey(stage),
          [PROCESS_LANE_KEY]: getProcessStageLaneKey(stage),
          [PROCESS_GRAPH_METADATA_KEY]: stage?.[PROCESS_GRAPH_METADATA_KEY]
            || stage?.metadata?.[PROCESS_GRAPH_METADATA_KEY]
            || null,
        },
      };
    });
    const { data, error } = await supabaseClient.rpc('ensure_process_run_for_draft_group_v2', {
      p_org_id: orgId,
      p_module_id: moduleId,
      p_record_id: normalizedRecordId,
      p_process_group_id: groupId,
      p_process_name: normalizeText(targetMeta.groupLabel || targetMeta.templateName) || 'فرآیند',
      p_template_id: toUuidOrNull(targetMeta.templateId),
      p_stages: rpcStages,
    });
    if (error) throw error;

    const payload = data && typeof data === 'object' ? data : {};
    const processRunId = normalizeText(payload?.process_run_id);
    const stageMap = new Map<string, string>();
    const returnedStages = Array.isArray(payload?.stages) ? payload.stages : [];
    returnedStages.forEach((row: any) => {
      const stageId = normalizeText(row?.id);
      if (!stageId) return;
      buildProcessRunStageLookupKeys({
        id: row?.draft_stage_id,
        template_stage_id: row?.template_stage_id,
        name: row?.stage_name,
        sort_order: row?.sort_order,
        [PROCESS_NODE_KEY]: row?.process_node_key,
      }).forEach((key) => stageMap.set(key, stageId));
    });
    const processRunStageId = targetStage ? resolveProcessRunStageId(stageMap, targetStage) : null;
    return { processRunId: processRunId || null, processRunStageId, stageMap };
  } catch (error) {
    throw error;
  }
};

export const syncProcessRunStageFromTask = async ({
  supabaseClient,
  task,
}: SyncProcessRunStageArgs) => {
  const processRunStageId = normalizeDbUuid(task?.process_run_stage_id);
  if (!supabaseClient || !processRunStageId) return;

  const patch = {
    task_id: normalizeDbUuid(task?.id) || null,
    status: normalizeStageStatusForRun(task?.status),
    assignee_user_id: normalizeDbUuid(task?.assignee_id) || null,
    assignee_role_id: normalizeDbUuid(task?.assignee_role_id) || null,
    planned_due_at: task?.due_date || null,
    started_at: task?.actual_start_at || task?.start_date || null,
    completed_at: task?.completed_at || null,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabaseClient.rpc('sync_process_run_stage_from_task', {
      p_process_run_stage_id: processRunStageId,
      p_task_id: patch.task_id,
      p_status: patch.status,
      p_assignee_user_id: patch.assignee_user_id,
      p_assignee_role_id: patch.assignee_role_id,
      p_planned_due_at: patch.planned_due_at,
      p_started_at: patch.started_at,
      p_completed_at: patch.completed_at,
    });
    if (error && !isMissingProcessRuntimeRpcError(error, 'sync_process_run_stage_from_task')) {
      throw error;
    }
  } catch (error) {
    if (!isMissingColumnLikeError(error)) {
      console.warn('Could not sync process run stage from task', error);
    }
  }
};
