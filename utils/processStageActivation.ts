import { supabase } from '../supabaseClient';
import { fetchCurrentUserRoleContext } from './permissions';
import {
  getInitialProcessStageNodeKeys,
  getNextProcessStages,
  getProcessStageNodeKey,
  getProcessStagesByLane,
  materializeLegacyProcessGraph,
} from './processGraph';
import { isRecordInRecycleBin, shouldSkipRecordForAutomation } from './recycleBinGuards';

const normalizeText = (value: unknown) => String(value || '').trim();
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeDbUuid = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  const stripped = raw.replace(/^(process_run_stage|process_run|process_template_stage|process_template|task|user|role)[_:]/i, '');
  return UUID_LIKE_RE.test(stripped) ? stripped : '';
};

const parseObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const activateProcessRunNodes = async ({
  processRunId,
  nodeKeys,
  actorUserId,
}: {
  processRunId: string;
  nodeKeys: string[];
  actorUserId?: string | null;
}) => {
  const normalizedRunId = normalizeDbUuid(processRunId);
  const normalizedNodeKeys = Array.from(new Set(nodeKeys.map(normalizeText).filter(Boolean)));
  if (!normalizedRunId || normalizedNodeKeys.length === 0) {
    return { createdTaskIds: [] as string[], existingTaskIds: [] as string[] };
  }
  if (await isRecordInRecycleBin({ sourceTable: 'process_runs', recordId: normalizedRunId })) {
    return { createdTaskIds: [] as string[], existingTaskIds: [] as string[] };
  }

  const roleContext = await fetchCurrentUserRoleContext(supabase);
  const orgId = normalizeDbUuid(roleContext?.orgId);
  if (!orgId) throw new Error('سازمان جاری برای فعال‌سازی مرحله مشخص نیست.');
  const actorId = normalizeDbUuid(actorUserId || roleContext?.userId) || null;

  const { data, error } = await supabase.rpc('activate_process_run_nodes', {
    p_org_id: orgId,
    p_process_run_id: normalizedRunId,
    p_node_keys: normalizedNodeKeys,
    p_actor_user_id: actorId,
  });
  if (error) throw error;
  return {
    createdTaskIds: Array.isArray(data?.created_task_ids) ? data.created_task_ids : [],
    existingTaskIds: Array.isArray(data?.existing_task_ids) ? data.existing_task_ids : [],
  };
};

const loadProcessRunStages = async (processRunId: string) => {
  const extended = await supabase
    .from('process_run_stages')
    .select('id, process_run_id, task_id, stage_name, sort_order, status, completed_at, planned_due_at, process_node_key, process_lane_key, metadata')
    .eq('process_run_id', processRunId)
    .order('sort_order', { ascending: true });
  if (!extended.error) return extended.data || [];

  const fallback = await supabase
    .from('process_run_stages')
    .select('id, process_run_id, task_id, stage_name, sort_order, status, completed_at, planned_due_at, metadata')
    .eq('process_run_id', processRunId)
    .order('sort_order', { ascending: true });
  if (fallback.error) throw fallback.error;
  return fallback.data || [];
};

export const activateInitialProcessRunNodes = async ({
  processRunId,
  actorUserId,
}: {
  processRunId: string;
  actorUserId?: string | null;
}) => {
  const normalizedRunId = normalizeDbUuid(processRunId);
  if (!normalizedRunId) {
    return { createdTaskIds: [] as string[], existingTaskIds: [] as string[] };
  }
  if (await isRecordInRecycleBin({ sourceTable: 'process_runs', recordId: normalizedRunId })) {
    return { createdTaskIds: [] as string[], existingTaskIds: [] as string[] };
  }

  const stages = await loadProcessRunStages(normalizedRunId);
  const materialized = materializeLegacyProcessGraph(stages);
  const nodeKeys = getInitialProcessStageNodeKeys(materialized.stages, materialized.graph);
  return activateProcessRunNodes({
    processRunId: normalizedRunId,
    nodeKeys,
    actorUserId,
  });
};

export const activateProcessStageAction = async ({
  actionType,
  config,
  record,
  moduleId,
}: {
  actionType: 'activate_next_process_stage' | 'activate_specific_process_stage';
  config?: Record<string, any> | null;
  record: Record<string, any>;
  moduleId?: string | null;
}) => {
  if (moduleId && await shouldSkipRecordForAutomation({ moduleId, record })) return null;

  const recurrence = parseObject(record?.recurrence_info);
  let processRunId = normalizeDbUuid(record?.process_run_id || recurrence?.process_run_id);
  if (!processRunId) {
    const templateId = normalizeDbUuid(config?.template_id);
    const recordId = normalizeDbUuid(record?.id);
    const targetModuleId = normalizeText(moduleId || config?.record_module_id);
    if (!templateId || !recordId || !targetModuleId) return null;
    const roleContext = await fetchCurrentUserRoleContext(supabase);
    const orgId = normalizeDbUuid(roleContext?.orgId);
    if (!orgId) throw new Error('سازمان جاری برای ایجاد فرآیند مشخص نیست.');
    const { data, error } = await supabase.rpc('create_process_run_from_template', {
      p_org_id: orgId,
      p_template_id: templateId,
      p_module_id: targetModuleId,
      p_record_id: recordId,
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    if (error) throw error;
    processRunId = normalizeDbUuid(data);
  }
  if (!processRunId) return null;
  if (await isRecordInRecycleBin({ sourceTable: 'process_runs', recordId: processRunId })) return null;

  const stages = await loadProcessRunStages(processRunId);
  const materialized = materializeLegacyProcessGraph(stages);
  const currentNodeKey = normalizeText(
    record?.process_node_key
    || recurrence?.process_node_key
    || record?.current_process_node_key,
  );

  let nodeKeys: string[] = [];
  if (actionType === 'activate_specific_process_stage') {
    const requestedNodeKeys = Array.isArray(config?.stage_node_keys)
      ? config?.stage_node_keys
      : [config?.stage_node_key];
    nodeKeys = requestedNodeKeys.map(normalizeText).filter(Boolean);
  } else if (currentNodeKey) {
    nodeKeys = getNextProcessStages(materialized.stages, currentNodeKey, materialized.graph)
      .map((stage, index) => getProcessStageNodeKey(stage, index));
  }

  if (nodeKeys.length === 0 && Array.isArray(config?.target_lane_keys)) {
    const targetLaneKeys = new Set(config?.target_lane_keys.map(normalizeText).filter(Boolean));
    nodeKeys = getProcessStagesByLane(materialized.stages, materialized.graph)
      .filter((lane) => targetLaneKeys.has(lane.key))
      .map((lane) => lane.stages[0])
      .filter(Boolean)
      .map((stage, index) => getProcessStageNodeKey(stage, index));
  }

  return activateProcessRunNodes({ processRunId, nodeKeys });
};
