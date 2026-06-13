import { describe, expect, it } from 'vitest';
import {
  PROCESS_GRAPH_METADATA_KEY,
  PROCESS_LANE_KEY,
  PROCESS_NODE_KEY,
  materializeLegacyProcessGraph,
  type ProcessGraphDefinition,
} from './processGraph';
import { cloneProcessGraphInto } from './processGraphCopy';

const sourceGraph: ProcessGraphDefinition = {
  version: 2,
  lanes: [
    { key: 'lane_a', name: 'ردیف اول', sortOrder: 10, parentTriggerKey: null },
    { key: 'lane_b', name: 'ردیف دوم', sortOrder: 20, parentTriggerKey: 'trigger_a' },
  ],
  triggers: [
    {
      key: 'trigger_a',
      name: 'آغاز شاخه',
      sourceNodeKey: 'stage_a',
      targetLaneKeys: ['lane_b'],
      workflowId: 'workflow_a',
      manualEnabled: true,
      sortOrder: 10,
    },
  ],
};

const sourceStages = [
  {
    id: 'source_a',
    name: 'مرحله اول',
    sort_order: 10,
    [PROCESS_NODE_KEY]: 'stage_a',
    [PROCESS_LANE_KEY]: 'lane_a',
    metadata: {
      due_anchor_type: 'process_start',
      [PROCESS_GRAPH_METADATA_KEY]: sourceGraph,
    },
  },
  {
    id: 'source_b',
    name: 'مرحله دوم',
    sort_order: 10,
    [PROCESS_NODE_KEY]: 'stage_b',
    [PROCESS_LANE_KEY]: 'lane_b',
    metadata: {
      due_anchor_type: 'specific_stage_completed',
      due_anchor_stage_node_key: 'stage_a',
      [PROCESS_GRAPH_METADATA_KEY]: sourceGraph,
    },
  },
];

describe('process graph copy', () => {
  it('clones a full graph with fresh identities and remapped references', () => {
    const target = materializeLegacyProcessGraph([]);
    const result = cloneProcessGraphInto({
      sourceStages,
      targetStages: [],
      targetGraph: target.graph,
      includeTriggers: true,
    });

    const clonedStageA = result.clonedStages.find((stage) => stage.name === 'مرحله اول');
    const clonedStageB = result.clonedStages.find((stage) => stage.name === 'مرحله دوم');
    const clonedTrigger = result.graph.triggers[0];

    expect(result.graph.lanes).toHaveLength(2);
    expect(result.clonedStages).toHaveLength(2);
    expect(clonedStageA?.[PROCESS_NODE_KEY]).not.toBe('stage_a');
    expect(clonedStageB?.[PROCESS_LANE_KEY]).not.toBe('lane_b');
    expect(clonedStageB?.metadata?.due_anchor_stage_node_key).toBe(clonedStageA?.[PROCESS_NODE_KEY]);
    expect(clonedTrigger.sourceNodeKey).toBe(clonedStageA?.[PROCESS_NODE_KEY]);
    expect(clonedTrigger.targetLaneKeys).toEqual([clonedStageB?.[PROCESS_LANE_KEY]]);
    expect(clonedTrigger.workflowId).toBeNull();
  });

  it('copies one lane independently without importing external triggers', () => {
    const target = materializeLegacyProcessGraph([]);
    const result = cloneProcessGraphInto({
      sourceStages,
      targetStages: [],
      targetGraph: target.graph,
      sourceLaneKeys: ['lane_b'],
      includeTriggers: false,
    });

    expect(result.graph.lanes).toHaveLength(1);
    expect(result.graph.lanes[0]?.parentTriggerKey).toBeNull();
    expect(result.graph.triggers).toHaveLength(0);
    expect(result.clonedStages).toHaveLength(1);
  });
});
