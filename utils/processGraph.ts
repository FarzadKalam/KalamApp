export const PROCESS_GRAPH_METADATA_KEY = 'process_graph';
export const PROCESS_NODE_KEY = 'process_node_key';
export const PROCESS_LANE_KEY = 'process_lane_key';
export const PROCESS_DEFAULT_LANE_KEY = 'lane_1';

export type ProcessLaneDefinition = {
  key: string;
  name: string;
  sortOrder: number;
  parentTriggerKey: string | null;
};

export type ProcessTriggerDefinition = {
  key: string;
  name: string;
  sourceNodeKey: string | null;
  targetLaneKeys: string[];
  workflowId: string | null;
  workflowTriggerModuleIds?: string[];
  manualEnabled: boolean;
  sortOrder: number;
};

export type ProcessGraphDefinition = {
  version: 2;
  lanes: ProcessLaneDefinition[];
  triggers: ProcessTriggerDefinition[];
};

export type ProcessStagePosition = {
  nodeKey: string;
  laneKey: string;
  laneSortOrder: number;
  stageSortOrder: number;
};

const normalizeText = (value: unknown) => String(value || '').trim();

const parseObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const sanitizeKeyPart = (value: unknown) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

const createStableStageNodeKey = (stage: Record<string, any>, index: number) => {
  const explicit = normalizeText(
    stage?.[PROCESS_NODE_KEY]
    || stage?.metadata?.[PROCESS_NODE_KEY]
    || stage?.node_key
  );
  if (explicit) return explicit;

  const identity = sanitizeKeyPart(
    stage?.template_stage_id
    || stage?.source_template_stage_id
    || stage?.process_run_stage_id
    || stage?.id
  );
  if (identity) return `stage_${identity}`;

  const name = sanitizeKeyPart(stage?.name || stage?.stage_name || stage?.title) || 'stage';
  const sortOrder = toPositiveNumber(stage?.sort_order, (index + 1) * 10);
  return `${name}_${sortOrder}_${index + 1}`;
};

const normalizeLane = (
  value: Record<string, any>,
  index: number,
): ProcessLaneDefinition => ({
  key: normalizeText(value?.key) || `lane_${index + 1}`,
  name: normalizeText(value?.name),
  sortOrder: toPositiveNumber(value?.sortOrder ?? value?.sort_order, (index + 1) * 10),
  parentTriggerKey: normalizeText(value?.parentTriggerKey ?? value?.parent_trigger_key) || null,
});

const normalizeTrigger = (
  value: Record<string, any>,
  index: number,
): ProcessTriggerDefinition => ({
  key: normalizeText(value?.key) || `trigger_${index + 1}`,
  name: normalizeText(value?.name) || 'فعال‌کننده فرآیند',
  sourceNodeKey: normalizeText(value?.sourceNodeKey ?? value?.source_node_key) || null,
  targetLaneKeys: Array.from(new Set(
    (Array.isArray(value?.targetLaneKeys)
      ? value.targetLaneKeys
      : (Array.isArray(value?.target_lane_keys) ? value.target_lane_keys : []))
      .map(normalizeText)
      .filter(Boolean)
  )),
  workflowId: normalizeText(value?.workflowId ?? value?.workflow_id) || null,
  workflowTriggerModuleIds: Array.from(new Set(
    (Array.isArray(value?.workflowTriggerModuleIds)
      ? value.workflowTriggerModuleIds
      : (Array.isArray(value?.workflow_trigger_module_ids) ? value.workflow_trigger_module_ids : []))
      .map(normalizeText)
      .filter(Boolean)
  )),
  manualEnabled: value?.manualEnabled !== false && value?.manual_enabled !== false,
  sortOrder: toPositiveNumber(value?.sortOrder ?? value?.sort_order, (index + 1) * 10),
});

export const createProcessLaneKey = () =>
  `lane_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createProcessNodeKey = () =>
  `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createProcessTriggerKey = () =>
  `trigger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createEmptyProcessGraph = (): ProcessGraphDefinition => ({
  version: 2,
  lanes: [],
  triggers: [],
});

export const readProcessGraphFromStages = (
  stages: Record<string, any>[] | null | undefined,
): ProcessGraphDefinition | null => {
  for (const stage of Array.isArray(stages) ? stages : []) {
    const metadata = parseObject(stage?.metadata);
    const rawGraph = parseObject(
      stage?.[PROCESS_GRAPH_METADATA_KEY]
      || metadata?.[PROCESS_GRAPH_METADATA_KEY]
    );
    if (Array.isArray(rawGraph?.lanes)) {
      return normalizeProcessGraph(rawGraph, stages);
    }
  }
  return null;
};

export const normalizeProcessGraph = (
  rawGraph: unknown,
  stages: Record<string, any>[] | null | undefined = [],
): ProcessGraphDefinition => {
  const source = parseObject(rawGraph);
  const sourceLanes = Array.isArray(source?.lanes) ? source.lanes : [];
  const sourceTriggers = Array.isArray(source?.triggers) ? source.triggers : [];
  const normalizedStages = Array.isArray(stages) ? stages : [];

  const lanes = sourceLanes.map((lane, index) => normalizeLane(parseObject(lane), index));
  const laneKeys = new Set(lanes.map((lane) => lane.key));

  normalizedStages.forEach((stage) => {
    const laneKey = normalizeText(
      stage?.[PROCESS_LANE_KEY]
      || stage?.metadata?.[PROCESS_LANE_KEY]
      || stage?.lane_key
    ) || PROCESS_DEFAULT_LANE_KEY;
    if (laneKeys.has(laneKey)) return;
    laneKeys.add(laneKey);
    lanes.push({
      key: laneKey,
      name: '',
      sortOrder: (lanes.length + 1) * 10,
      parentTriggerKey: null,
    });
  });

  if (lanes.length === 0) {
    lanes.push({
      key: PROCESS_DEFAULT_LANE_KEY,
      name: '',
      sortOrder: 10,
      parentTriggerKey: null,
    });
  }

  const triggers = sourceTriggers
    .map((trigger, index) => normalizeTrigger(parseObject(trigger), index))
    .filter((trigger) => (
      !trigger.sourceNodeKey
      || normalizedStages.some((stage, index) => createStableStageNodeKey(stage, index) === trigger.sourceNodeKey)
    ))
    .map((trigger) => ({
      ...trigger,
      targetLaneKeys: trigger.targetLaneKeys.filter((laneKey) => laneKeys.has(laneKey)),
    }));

  const triggerKeys = new Set(triggers.map((trigger) => trigger.key));
  const normalizedLanes = lanes
    .map((lane) => ({
      ...lane,
      parentTriggerKey: lane.parentTriggerKey && triggerKeys.has(lane.parentTriggerKey)
        ? lane.parentTriggerKey
        : null,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((lane, index) => ({ ...lane, sortOrder: (index + 1) * 10 }));

  return {
    version: 2,
    lanes: normalizedLanes,
    triggers: triggers
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((trigger, index) => ({ ...trigger, sortOrder: (index + 1) * 10 })),
  };
};

export const materializeLegacyProcessGraph = (
  stages: Record<string, any>[] | null | undefined,
): {
  graph: ProcessGraphDefinition;
  stages: Record<string, any>[];
  isLegacy: boolean;
} => {
  const sourceStages = Array.isArray(stages) ? stages : [];
  const storedGraph = readProcessGraphFromStages(sourceStages);
  const graph = normalizeProcessGraph(storedGraph || {}, sourceStages);
  const fallbackLaneKey = graph.lanes[0]?.key || PROCESS_DEFAULT_LANE_KEY;
  const nextStages = sourceStages.map((stage, index) => {
    const metadata = parseObject(stage?.metadata);
    const nodeKey = createStableStageNodeKey(stage, index);
    const laneKey = normalizeText(
      stage?.[PROCESS_LANE_KEY]
      || metadata?.[PROCESS_LANE_KEY]
      || stage?.lane_key
    ) || fallbackLaneKey;
    return {
      ...stage,
      [PROCESS_NODE_KEY]: nodeKey,
      [PROCESS_LANE_KEY]: laneKey,
      metadata: {
        ...metadata,
        [PROCESS_NODE_KEY]: nodeKey,
        [PROCESS_LANE_KEY]: laneKey,
      },
    };
  });
  return { graph, stages: nextStages, isLegacy: !storedGraph };
};

export const attachProcessGraphToStages = (
  stages: Record<string, any>[],
  rawGraph: ProcessGraphDefinition,
): Record<string, any>[] => {
  const graph = normalizeProcessGraph(rawGraph, stages);
  return stages.map((stage) => {
    const metadata = parseObject(stage?.metadata);
    return {
      ...stage,
      [PROCESS_GRAPH_METADATA_KEY]: graph,
      metadata: {
        ...metadata,
        [PROCESS_GRAPH_METADATA_KEY]: graph,
        [PROCESS_NODE_KEY]: stage?.[PROCESS_NODE_KEY] || metadata?.[PROCESS_NODE_KEY] || null,
        [PROCESS_LANE_KEY]: stage?.[PROCESS_LANE_KEY] || metadata?.[PROCESS_LANE_KEY] || PROCESS_DEFAULT_LANE_KEY,
      },
    };
  });
};

export const getProcessStageNodeKey = (stage: Record<string, any>, index = 0) =>
  createStableStageNodeKey(stage, index);

export const getProcessStageLaneKey = (
  stage: Record<string, any>,
  fallbackLaneKey = PROCESS_DEFAULT_LANE_KEY,
) => normalizeText(
  stage?.[PROCESS_LANE_KEY]
  || stage?.metadata?.[PROCESS_LANE_KEY]
  || stage?.lane_key
) || fallbackLaneKey;

export const getProcessStagesByLane = (
  stages: Record<string, any>[] | null | undefined,
  rawGraph?: ProcessGraphDefinition | null,
) => {
  const normalized = materializeLegacyProcessGraph(stages);
  const graph = rawGraph ? normalizeProcessGraph(rawGraph, normalized.stages) : normalized.graph;
  const stageRows = normalized.stages;
  return graph.lanes.map((lane) => ({
    ...lane,
    stages: stageRows
      .filter((stage) => getProcessStageLaneKey(stage) === lane.key)
      .sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0)),
  }));
};

export const getInitialProcessStageNodeKeys = (
  stages: Record<string, any>[] | null | undefined,
  rawGraph?: ProcessGraphDefinition | null,
): string[] => {
  const normalized = materializeLegacyProcessGraph(stages);
  const graph = rawGraph ? normalizeProcessGraph(rawGraph, normalized.stages) : normalized.graph;
  const rootLaneKeys = new Set(
    graph.lanes
      .filter((lane) => !lane.parentTriggerKey)
      .map((lane) => lane.key),
  );

  return Array.from(new Set(
    getProcessStagesByLane(normalized.stages, graph)
      .filter((lane) => rootLaneKeys.has(lane.key))
      .map((lane) => lane.stages[0])
      .filter(Boolean)
      .map((stage, index) => getProcessStageNodeKey(stage, index))
      .filter(Boolean),
  ));
};

export const moveProcessStageToPosition = (
  stages: Record<string, any>[] | null | undefined,
  targetNodeKey: string,
  targetLaneKey: string,
  targetIndex: number,
  rawGraph?: ProcessGraphDefinition | null,
) => {
  const materialized = materializeLegacyProcessGraph(stages);
  const graph = rawGraph
    ? normalizeProcessGraph(rawGraph, materialized.stages)
    : materialized.graph;
  const normalizedTargetNodeKey = normalizeText(targetNodeKey);
  const normalizedTargetLaneKey = normalizeText(targetLaneKey) || PROCESS_DEFAULT_LANE_KEY;
  const sourceStage = materialized.stages.find(
    (stage, index) => getProcessStageNodeKey(stage, index) === normalizedTargetNodeKey,
  );
  if (!sourceStage) return materialized.stages;

  const sourceLaneKey = getProcessStageLaneKey(sourceStage);
  const sourceLaneStages = materialized.stages
    .filter((stage) => getProcessStageLaneKey(stage) === sourceLaneKey)
    .sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0));
  const sourceIndex = sourceLaneStages.findIndex(
    (stage, index) => getProcessStageNodeKey(stage, index) === normalizedTargetNodeKey,
  );
  const movedStage = {
    ...sourceStage,
    [PROCESS_LANE_KEY]: normalizedTargetLaneKey,
    metadata: {
      ...parseObject(sourceStage?.metadata),
      [PROCESS_LANE_KEY]: normalizedTargetLaneKey,
    },
  };
  const withoutMoved = materialized.stages.filter(
    (stage, index) => getProcessStageNodeKey(stage, index) !== normalizedTargetNodeKey,
  );
  const targetLaneStages = withoutMoved
    .filter((stage) => getProcessStageLaneKey(stage) === normalizedTargetLaneKey)
    .sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0));
  let requestedIndex = Number(targetIndex) || 0;
  if (sourceLaneKey === normalizedTargetLaneKey && sourceIndex >= 0 && sourceIndex < targetIndex) {
    requestedIndex -= 1;
  }
  const insertionIndex = Math.max(0, Math.min(requestedIndex, targetLaneStages.length));
  targetLaneStages.splice(insertionIndex, 0, movedStage);

  const laneKeys = new Set([
    ...graph.lanes.map((lane) => lane.key),
    ...withoutMoved.map((stage) => getProcessStageLaneKey(stage)),
    normalizedTargetLaneKey,
  ]);
  const orderedPositionByNodeKey = new Map<string, { laneKey: string; sortOrder: number }>();
  laneKeys.forEach((laneKey) => {
    const laneStages = laneKey === normalizedTargetLaneKey
      ? targetLaneStages
      : withoutMoved
          .filter((stage) => getProcessStageLaneKey(stage) === laneKey)
          .sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0));
    laneStages.forEach((stage, index) => {
      orderedPositionByNodeKey.set(getProcessStageNodeKey(stage, index), {
        laneKey,
        sortOrder: (index + 1) * 10,
      });
    });
  });

  return [...withoutMoved, movedStage].map((stage, index) => {
    const position = orderedPositionByNodeKey.get(getProcessStageNodeKey(stage, index));
    if (!position) return stage;
    return {
      ...stage,
      sort_order: position.sortOrder,
      [PROCESS_LANE_KEY]: position.laneKey,
      metadata: {
        ...parseObject(stage?.metadata),
        [PROCESS_LANE_KEY]: position.laneKey,
      },
    };
  });
};

export const buildProcessStagePositionMap = (
  stages: Record<string, any>[] | null | undefined,
  rawGraph?: ProcessGraphDefinition | null,
) => {
  const lanes = getProcessStagesByLane(stages, rawGraph);
  const result = new Map<string, ProcessStagePosition>();
  lanes.forEach((lane) => {
    lane.stages.forEach((stage, index) => {
      const nodeKey = getProcessStageNodeKey(stage, index);
      result.set(nodeKey, {
        nodeKey,
        laneKey: lane.key,
        laneSortOrder: lane.sortOrder,
        stageSortOrder: Number(stage?.sort_order || ((index + 1) * 10)),
      });
    });
  });
  return result;
};

export const getPreviousProcessStages = (
  stages: Record<string, any>[],
  targetNodeKey: string,
  rawGraph?: ProcessGraphDefinition | null,
) => {
  const target = stages.find((stage, index) => getProcessStageNodeKey(stage, index) === targetNodeKey);
  if (!target) return [];
  const laneKey = getProcessStageLaneKey(target);
  const sameLane = stages
    .filter((stage) => getProcessStageLaneKey(stage) === laneKey)
    .sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0));
  const index = sameLane.findIndex((stage, stageIndex) => getProcessStageNodeKey(stage, stageIndex) === targetNodeKey);
  if (index > 0) return [sameLane[index - 1]].filter(Boolean);

  const graph = normalizeProcessGraph(rawGraph || readProcessGraphFromStages(stages) || {}, stages);
  const lane = graph.lanes.find((item) => item.key === laneKey);
  const incomingTriggers = graph.triggers.filter((trigger) => (
    Boolean(trigger.sourceNodeKey)
    && (
      trigger.targetLaneKeys.includes(laneKey)
      || (lane?.parentTriggerKey && trigger.key === lane.parentTriggerKey)
    )
  ));
  const previousByNodeKey = new Map<string, Record<string, any>>();
  incomingTriggers.forEach((trigger) => {
    const previous = stages.find((stage, stageIndex) => getProcessStageNodeKey(stage, stageIndex) === trigger.sourceNodeKey);
    if (previous && trigger.sourceNodeKey) previousByNodeKey.set(trigger.sourceNodeKey, previous);
  });
  return Array.from(previousByNodeKey.values());
};

export const getPreviousProcessStage = (
  stages: Record<string, any>[],
  targetNodeKey: string,
  rawGraph?: ProcessGraphDefinition | null,
) => {
  return getPreviousProcessStages(stages, targetNodeKey, rawGraph)[0] || null;
};

export const getNextProcessStages = (
  stages: Record<string, any>[],
  sourceNodeKey: string,
  rawGraph?: ProcessGraphDefinition | null,
) => {
  const source = stages.find((stage, index) => getProcessStageNodeKey(stage, index) === sourceNodeKey);
  if (!source) return [];
  const laneKey = getProcessStageLaneKey(source);
  const sameLane = stages
    .filter((stage) => getProcessStageLaneKey(stage) === laneKey)
    .sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0));
  const index = sameLane.findIndex((stage, stageIndex) => getProcessStageNodeKey(stage, stageIndex) === sourceNodeKey);
  const directNext = index >= 0 ? sameLane[index + 1] : null;
  if (directNext) return [directNext];

  const graph = normalizeProcessGraph(rawGraph || readProcessGraphFromStages(stages) || {}, stages);
  const targetLaneKeys = new Set(
    graph.triggers
      .filter((trigger) => trigger.sourceNodeKey === sourceNodeKey)
      .flatMap((trigger) => trigger.targetLaneKeys)
  );
  return graph.lanes
    .filter((lane) => targetLaneKeys.has(lane.key))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((lane) => stages
      .filter((stage) => getProcessStageLaneKey(stage) === lane.key)
      .sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))[0]
    )
    .filter(Boolean);
};

export const isProcessGraphConnectionCyclic = (
  rawGraph: ProcessGraphDefinition,
  triggerKey: string,
  sourceNodeKey: string | null,
  targetLaneKeys: string[],
  stages: Record<string, any>[],
) => {
  if (!sourceNodeKey) return false;
  const graph = normalizeProcessGraph(rawGraph, stages);
  const nodeLaneMap = new Map(
    stages.map((stage, index) => [getProcessStageNodeKey(stage, index), getProcessStageLaneKey(stage)] as const)
  );
  const sourceLaneKey = nodeLaneMap.get(sourceNodeKey);
  if (!sourceLaneKey) return false;

  const nextGraph: ProcessGraphDefinition = {
    ...graph,
    triggers: [
      ...graph.triggers.filter((trigger) => trigger.key !== triggerKey),
      {
        key: triggerKey,
        name: 'فعال‌کننده فرآیند',
        sourceNodeKey,
        targetLaneKeys,
        workflowId: null,
        manualEnabled: true,
        sortOrder: graph.triggers.length * 10 + 10,
      },
    ],
  };
  const adjacency = new Map<string, Set<string>>();
  nextGraph.triggers.forEach((trigger) => {
    if (!trigger.sourceNodeKey) return;
    const fromLane = nodeLaneMap.get(trigger.sourceNodeKey);
    if (!fromLane) return;
    if (!adjacency.has(fromLane)) adjacency.set(fromLane, new Set());
    trigger.targetLaneKeys.forEach((laneKey) => adjacency.get(fromLane)!.add(laneKey));
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (laneKey: string): boolean => {
    if (visiting.has(laneKey)) return true;
    if (visited.has(laneKey)) return false;
    visiting.add(laneKey);
    for (const nextLaneKey of adjacency.get(laneKey) || []) {
      if (visit(nextLaneKey)) return true;
    }
    visiting.delete(laneKey);
    visited.add(laneKey);
    return false;
  };
  return Array.from(adjacency.keys()).some(visit);
};
