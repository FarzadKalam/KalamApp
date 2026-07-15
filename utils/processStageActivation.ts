import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import { fetchCurrentUserRoleContext } from './permissions';
import {
  getInitialProcessStageNodeKeys,
  getNextProcessStages,
  getProcessStageNodeKey,
  getProcessStagesByLane,
  materializeLegacyProcessGraph,
  PROCESS_GRAPH_METADATA_KEY,
} from './processGraph';
import { isRecordInRecycleBin, shouldSkipRecordForAutomation } from './recycleBinGuards';
import {
  buildProcessV2TemplateContext,
  renderProcessV2TemplateValueFromRecord,
} from './processV2AutoAssign';
import {
  assignProcessTemplateIdentityAliases,
} from './processTemplateContext';
import { mergeProcessLinkMaps, parseProcessLinkMap } from './processTargets';

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

const renderTemplateTree = (
  value: any,
  context: Record<string, any>,
): any => {
  if (typeof value === 'string') return renderProcessV2TemplateValueFromRecord(value, context);
  if (Array.isArray(value)) return value.map((item) => renderTemplateTree(item, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderTemplateTree(item, context)]));
  }
  return value;
};

const resolveStageGraphTemplate = (
  rawGraph: unknown,
  context: Record<string, any>,
  processName: string,
) => {
  const graph = parseObject(rawGraph);
  if (!Array.isArray(graph?.lanes)) return graph;
  const graphContext = assignProcessTemplateIdentityAliases({ ...context }, { processName });
  return {
    ...graph,
    lanes: graph.lanes.map((lane: any) => {
      const rawLaneName = normalizeText(lane?.name || lane?.title);
      if (!rawLaneName) return lane;
      const resolvedLaneName = normalizeText(
        renderProcessV2TemplateValueFromRecord(rawLaneName, graphContext, FieldType.TEXT) ?? rawLaneName,
      ) || rawLaneName;
      return { ...lane, name: resolvedLaneName };
    }),
  };
};

export const prepareProcessRunNodesForTaskCreation = async ({
  processRunId,
  nodeKeys,
}: {
  processRunId: string;
  nodeKeys: string[];
}) => {
  const normalizedRunId = normalizeDbUuid(processRunId);
  const normalizedNodeKeys = new Set(nodeKeys.map(normalizeText).filter(Boolean));
  if (!normalizedRunId || normalizedNodeKeys.size === 0) return;

  const { data: runRow, error: runError } = await supabase
    .from('process_runs')
    .select('id, org_id, module_id, record_id, process_name')
    .eq('id', normalizedRunId)
    .maybeSingle();
  if (runError) throw runError;
  if (!runRow) return;

  const moduleId = normalizeText(runRow.module_id);
  const recordId = normalizeText(runRow.record_id);
  const moduleTable = MODULES[moduleId]?.table || moduleId;
  let sourceRecord: Record<string, any> = {};
  if (moduleTable && recordId) {
    const { data, error } = await (supabase.from(moduleTable as any) as any)
      .select('*')
      .eq('id', recordId)
      .maybeSingle();
    if (error) throw error;
    sourceRecord = data || {};
  }

  const { data: stageRows, error: stageError } = await supabase
    .from('process_run_stages')
    .select('id, stage_name, sort_order, process_node_key, process_lane_key, metadata')
    .eq('process_run_id', normalizedRunId)
    .order('sort_order', { ascending: true });
  if (stageError) throw stageError;
  const stages = Array.isArray(stageRows) ? stageRows : [];
  const processLinkMap = stages.reduce((acc, stage) => {
    const metadata = parseObject(stage?.metadata);
    return mergeProcessLinkMaps(
      acc,
      parseProcessLinkMap(metadata?.process_link_map || metadata?.process_links),
    );
  }, moduleId && recordId ? { [moduleId]: recordId } : {} as Record<string, any>);

  const baseContext = await buildProcessV2TemplateContext({
    supabaseClient: supabase,
    moduleId,
    recordId,
    recordData: sourceRecord,
    processLinkMap,
  });
  const rawProcessName = normalizeText(runRow.process_name) || 'فرآیند';
  const resolvedProcessName = normalizeText(
    renderProcessV2TemplateValueFromRecord(rawProcessName, baseContext, FieldType.TEXT) ?? rawProcessName,
  ) || rawProcessName;
  if (resolvedProcessName !== rawProcessName) {
    const { error } = await supabase
      .from('process_runs')
      .update({ process_name: resolvedProcessName })
      .eq('id', normalizedRunId);
    if (error) throw error;
  }

  let previousTask: Record<string, any> | null = null;
  for (const stage of stages) {
    const nodeKey = normalizeText(stage?.process_node_key || stage?.metadata?.process_node_key);
    if (!normalizedNodeKeys.has(nodeKey)) continue;
    const metadata = parseObject(stage?.metadata);
    const resolvedGraph = resolveStageGraphTemplate(
      metadata?.[PROCESS_GRAPH_METADATA_KEY],
      baseContext,
      resolvedProcessName,
    );
    const laneKey = normalizeText(stage?.process_lane_key || metadata?.process_lane_key) || 'lane_1';
    const lane = (Array.isArray(resolvedGraph?.lanes) ? resolvedGraph.lanes : []).find((item: any) => (
      normalizeText(item?.key || item?.id) === laneKey
    ));
    const rawStageName = normalizeText(stage?.stage_name) || 'فعالیت فرآیند';
    const stageContext = await buildProcessV2TemplateContext({
      supabaseClient: supabase,
      moduleId,
      recordId,
      recordData: sourceRecord,
      processLinkMap,
      taskName: rawStageName,
      taskType: normalizeText(metadata?.task_type),
      previousTask,
    });
    assignProcessTemplateIdentityAliases(stageContext, {
      processName: resolvedProcessName,
      laneName: lane?.name || lane?.title || 'ردیف اصلی',
    });
    const resolvedStageName = normalizeText(
      renderProcessV2TemplateValueFromRecord(rawStageName, stageContext, FieldType.TEXT) ?? rawStageName,
    ) || rawStageName;
    const resolvedValueContext = {
      ...stageContext,
      task_name: resolvedStageName,
      'عنوان فعالیت': resolvedStageName,
    };
    const resolvedDescription = typeof metadata?.description === 'string'
      ? normalizeText(renderProcessV2TemplateValueFromRecord(metadata.description, resolvedValueContext, FieldType.LONG_TEXT)) || null
      : metadata?.description ?? null;
    const resolvedCustomFields = Array.isArray(metadata?.process_task_custom_fields)
      ? metadata.process_task_custom_fields.map((field: any) => ({
          ...field,
          ...(Object.prototype.hasOwnProperty.call(field || {}, 'defaultValue')
            ? { defaultValue: renderTemplateTree(field.defaultValue, resolvedValueContext) }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(field || {}, 'default_value')
            ? { default_value: renderTemplateTree(field.default_value, resolvedValueContext) }
            : {}),
        }))
      : metadata?.process_task_custom_fields;
    const resolvedCustomValues = metadata?.process_task_custom_field_values
      && typeof metadata.process_task_custom_field_values === 'object'
      ? renderTemplateTree(metadata.process_task_custom_field_values, resolvedValueContext)
      : metadata?.process_task_custom_field_values;
    const nextMetadata = {
      ...metadata,
      description: resolvedDescription,
      [PROCESS_GRAPH_METADATA_KEY]: resolvedGraph,
      ...(resolvedCustomFields !== undefined ? { process_task_custom_fields: resolvedCustomFields } : {}),
      ...(resolvedCustomValues !== undefined ? { process_task_custom_field_values: resolvedCustomValues } : {}),
      template_rendered_before_task_creation: true,
    };
    const { error } = await supabase
      .from('process_run_stages')
      .update({ stage_name: resolvedStageName, metadata: nextMetadata })
      .eq('id', stage.id);
    if (error) throw error;
    previousTask = {
      name: resolvedStageName,
      description: resolvedDescription,
      ...(resolvedCustomValues && typeof resolvedCustomValues === 'object' ? resolvedCustomValues : {}),
    };
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

  await prepareProcessRunNodesForTaskCreation({
    processRunId: normalizedRunId,
    nodeKeys: normalizedNodeKeys,
  });

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
