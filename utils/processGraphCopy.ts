import {
  PROCESS_GRAPH_METADATA_KEY,
  PROCESS_LANE_KEY,
  PROCESS_NODE_KEY,
  attachProcessGraphToStages,
  createProcessLaneKey,
  createProcessNodeKey,
  createProcessTriggerKey,
  getProcessStageLaneKey,
  getProcessStageNodeKey,
  materializeLegacyProcessGraph,
  normalizeProcessGraph,
  type ProcessGraphDefinition,
} from './processGraph';
import { createWorkflowId } from './workflowTypes';

type CloneProcessGraphOptions = {
  sourceStages: Record<string, any>[];
  targetStages: Record<string, any>[];
  targetGraph: ProcessGraphDefinition;
  sourceLaneKeys?: string[] | null;
  includeTriggers?: boolean;
};

export type ProcessGraphCloneResult = {
  graph: ProcessGraphDefinition;
  stages: Record<string, any>[];
  clonedStages: Record<string, any>[];
  laneKeyMap: Map<string, string>;
  nodeKeyMap: Map<string, string>;
  triggerKeyMap: Map<string, string>;
};

type CloneProcessActivatorWorkflowsOptions = {
  supabaseClient: any;
  sourceTemplateId: string;
  targetTemplateId: string;
  sourceGraph: ProcessGraphDefinition;
  cloneResult: ProcessGraphCloneResult;
};

export const remapProcessGraphReferences = <T,>(
  value: T,
  replacements: ReadonlyMap<string, string>,
): T => {
  if (typeof value === 'string') {
    return (replacements.get(value) || value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapProcessGraphReferences(item, replacements)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, any>).map(([key, item]) => [
        key,
        remapProcessGraphReferences(item, replacements),
      ]),
    ) as T;
  }
  return value;
};

export const cloneProcessGraphInto = ({
  sourceStages,
  targetStages,
  targetGraph,
  sourceLaneKeys,
  includeTriggers = true,
}: CloneProcessGraphOptions): ProcessGraphCloneResult => {
  const source = materializeLegacyProcessGraph(sourceStages);
  const normalizedTargetGraph = normalizeProcessGraph(targetGraph, targetStages);
  const hasOnlyImplicitTargetLane = (
    targetStages.length === 0
    && normalizedTargetGraph.lanes.length === 1
    && normalizedTargetGraph.lanes[0]?.key === 'lane_1'
    && !normalizedTargetGraph.lanes[0]?.name
    && !normalizedTargetGraph.lanes[0]?.parentTriggerKey
    && normalizedTargetGraph.triggers.length === 0
  );
  const targetLanes = hasOnlyImplicitTargetLane ? [] : normalizedTargetGraph.lanes;
  const selectedLaneKeys = new Set(
    Array.isArray(sourceLaneKeys) && sourceLaneKeys.length > 0
      ? sourceLaneKeys
      : source.graph.lanes.map((lane) => lane.key),
  );
  const selectedLanes = source.graph.lanes.filter((lane) => selectedLaneKeys.has(lane.key));
  const laneKeyMap = new Map(selectedLanes.map((lane) => [lane.key, createProcessLaneKey()]));
  const selectedStages = source.stages.filter((stage) => selectedLaneKeys.has(getProcessStageLaneKey(stage)));
  const nodeKeyMap = new Map(
    selectedStages.map((stage, index) => [getProcessStageNodeKey(stage, index), createProcessNodeKey()]),
  );

  const selectedTriggers = includeTriggers
    ? source.graph.triggers.filter((trigger) => (
        trigger.targetLaneKeys.length > 0
        && trigger.targetLaneKeys.every((laneKey) => selectedLaneKeys.has(laneKey))
        && (!trigger.sourceNodeKey || nodeKeyMap.has(trigger.sourceNodeKey))
      ))
    : [];
  const triggerKeyMap = new Map(
    selectedTriggers.map((trigger) => [trigger.key, createProcessTriggerKey()]),
  );
  const replacements = new Map<string, string>([
    ...laneKeyMap.entries(),
    ...nodeKeyMap.entries(),
    ...triggerKeyMap.entries(),
  ]);

  const clonedStages = selectedStages.map((sourceStage, index) => {
    const remapped = remapProcessGraphReferences(sourceStage, replacements);
    const sourceNodeKey = getProcessStageNodeKey(sourceStage, index);
    const sourceLaneKey = getProcessStageLaneKey(sourceStage);
    const nodeKey = nodeKeyMap.get(sourceNodeKey) || createProcessNodeKey();
    const laneKey = laneKeyMap.get(sourceLaneKey) || createProcessLaneKey();
    const metadata = remapped?.metadata && typeof remapped.metadata === 'object'
      ? remapped.metadata
      : {};
    return {
      ...remapped,
      id: `draft_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
      template_stage_id: null,
      source_template_stage_id: sourceStage?.template_stage_id || sourceStage?.id || null,
      [PROCESS_NODE_KEY]: nodeKey,
      [PROCESS_LANE_KEY]: laneKey,
      [PROCESS_GRAPH_METADATA_KEY]: undefined,
      metadata: {
        ...metadata,
        [PROCESS_NODE_KEY]: nodeKey,
        [PROCESS_LANE_KEY]: laneKey,
        [PROCESS_GRAPH_METADATA_KEY]: undefined,
      },
    };
  });

  const laneSortOffset = targetLanes.length;
  const clonedLanes = selectedLanes.map((lane, index) => ({
    ...remapProcessGraphReferences(lane, replacements),
    key: laneKeyMap.get(lane.key) || createProcessLaneKey(),
    name: lane.name || `ردیف ${laneSortOffset + index + 1}`,
    sortOrder: (laneSortOffset + index + 1) * 10,
    parentTriggerKey: lane.parentTriggerKey && triggerKeyMap.has(lane.parentTriggerKey)
      ? triggerKeyMap.get(lane.parentTriggerKey)!
      : null,
  }));
  const clonedTriggers = selectedTriggers.map((trigger, index) => ({
    ...remapProcessGraphReferences(trigger, replacements),
    key: triggerKeyMap.get(trigger.key) || createProcessTriggerKey(),
    workflowId: null,
    sortOrder: (normalizedTargetGraph.triggers.length + index + 1) * 10,
  }));
  const graph = normalizeProcessGraph({
    ...normalizedTargetGraph,
    lanes: [...targetLanes, ...clonedLanes],
    triggers: [...normalizedTargetGraph.triggers, ...clonedTriggers],
  }, [...targetStages, ...clonedStages]);
  const stages = attachProcessGraphToStages([...targetStages, ...clonedStages], graph);

  return {
    graph,
    stages,
    clonedStages: attachProcessGraphToStages(clonedStages, graph),
    laneKeyMap,
    nodeKeyMap,
    triggerKeyMap,
  };
};

export const cloneProcessActivatorWorkflowsForTemplate = async ({
  supabaseClient,
  sourceTemplateId,
  targetTemplateId,
  sourceGraph,
  cloneResult,
}: CloneProcessActivatorWorkflowsOptions): Promise<ProcessGraphDefinition> => {
  const sourceTriggers = sourceGraph.triggers.filter(
    (trigger) => cloneResult.triggerKeyMap.has(trigger.key) && Boolean(trigger.workflowId),
  );
  const workflowIds = sourceTriggers
    .map((trigger) => String(trigger.workflowId || '').trim())
    .filter(Boolean);
  if (!supabaseClient || !sourceTemplateId || !targetTemplateId || workflowIds.length === 0) {
    return cloneResult.graph;
  }

  const { data, error } = await supabaseClient
    .from('workflows')
    .select('*')
    .in('id', workflowIds);
  if (error) throw error;

  const workflowById = new Map(
    (Array.isArray(data) ? data : []).map((workflow: any) => [String(workflow?.id || ''), workflow]),
  );
  const { data: authData } = await supabaseClient.auth.getUser();
  const currentUserId = authData?.user?.id || null;
  let nextGraph = cloneResult.graph;

  for (const sourceTrigger of sourceTriggers) {
    const sourceWorkflow = workflowById.get(String(sourceTrigger.workflowId || ''));
    const targetTriggerKey = cloneResult.triggerKeyMap.get(sourceTrigger.key);
    if (!sourceWorkflow || !targetTriggerKey) continue;

    const replacements = new Map<string, string>([
      ...cloneResult.laneKeyMap.entries(),
      ...cloneResult.nodeKeyMap.entries(),
      ...cloneResult.triggerKeyMap.entries(),
      [sourceTemplateId, targetTemplateId],
    ]);
    const remapped = remapProcessGraphReferences(sourceWorkflow, replacements);
    const payload = {
      module_id: remapped.module_id,
      module_ids: Array.isArray(remapped.module_ids) ? remapped.module_ids : [],
      scope_type: 'process_activator',
      process_template_id: targetTemplateId,
      process_trigger_key: targetTriggerKey,
      process_source_node_key: sourceTrigger.sourceNodeKey
        ? cloneResult.nodeKeyMap.get(sourceTrigger.sourceNodeKey) || null
        : null,
      process_target_lane_keys: sourceTrigger.targetLaneKeys
        .map((laneKey) => cloneResult.laneKeyMap.get(laneKey))
        .filter(Boolean),
      manual_enabled: sourceTrigger.manualEnabled,
      name: remapped.name,
      description: remapped.description || null,
      trigger_type: remapped.trigger_type,
      execution_mode: remapped.execution_mode || 'first_match',
      interval_value: remapped.interval_value || null,
      interval_unit: remapped.interval_unit || null,
      interval_at: remapped.interval_at || null,
      interval_first_run_at: null,
      interval_minute: remapped.interval_minute ?? null,
      interval_allowed_from_hour: remapped.interval_allowed_from_hour ?? null,
      interval_allowed_to_hour: remapped.interval_allowed_to_hour ?? null,
      interval_day_of_month: remapped.interval_day_of_month ?? null,
      interval_day_condition: remapped.interval_day_condition || null,
      interval_days_after_holiday: remapped.interval_days_after_holiday ?? null,
      batch_size: remapped.batch_size || null,
      conditions_all: Array.isArray(remapped.conditions_all) ? remapped.conditions_all : [],
      conditions_any: Array.isArray(remapped.conditions_any) ? remapped.conditions_any : [],
      actions: (Array.isArray(remapped.actions) ? remapped.actions : []).map((action: any) => ({
        ...action,
        id: createWorkflowId(),
      })),
      is_active: remapped.is_active !== false,
      created_by: currentUserId,
      updated_by: currentUserId,
    };
    const { data: inserted, error: insertError } = await supabaseClient
      .from('workflows')
      .insert(payload)
      .select('id')
      .single();
    if (insertError) throw insertError;

    const workflowId = String(inserted?.id || '').trim();
    if (!workflowId) continue;
    nextGraph = {
      ...nextGraph,
      triggers: nextGraph.triggers.map((trigger) => (
        trigger.key === targetTriggerKey ? { ...trigger, workflowId } : trigger
      )),
    };
  }

  return nextGraph;
};
