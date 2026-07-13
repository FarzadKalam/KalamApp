import { describe, expect, it } from 'vitest';
import {
  PROCESS_DEFAULT_LANE_KEY,
  attachProcessGraphToStages,
  getInitialProcessStageNodeKeys,
  getNextProcessStages,
  getPreviousProcessStage,
  getPreviousProcessStages,
  getProcessStagesByLane,
  materializeLegacyProcessGraph,
  moveProcessStageToPosition,
  type ProcessGraphDefinition,
} from './processGraph';
import { computeProcessStageDueDate } from './processSchedule';

describe('processGraph legacy compatibility', () => {
  it('maps old linear stages to one implicit lane without changing order', () => {
    const legacyStages = [
      { id: 'a', name: 'اول', sort_order: 10 },
      { id: 'b', name: 'دوم', sort_order: 20 },
    ];

    const normalized = materializeLegacyProcessGraph(legacyStages);
    expect(normalized.isLegacy).toBe(true);
    expect(normalized.graph.lanes).toHaveLength(1);
    expect(normalized.stages.map((stage) => stage.process_lane_key)).toEqual([
      PROCESS_DEFAULT_LANE_KEY,
      PROCESS_DEFAULT_LANE_KEY,
    ]);
    expect(getProcessStagesByLane(normalized.stages)[0].stages.map((stage) => stage.name)).toEqual(['اول', 'دوم']);
  });

  it('resolves previous and branched next stages by graph connections', () => {
    const stages: any[] = [
      { id: 'a', name: 'آغاز', sort_order: 10, process_node_key: 'a', process_lane_key: 'lane_1' },
      { id: 'b', name: 'ادامه', sort_order: 20, process_node_key: 'b', process_lane_key: 'lane_1' },
      { id: 'c', name: 'شاخه', sort_order: 10, process_node_key: 'c', process_lane_key: 'lane_2' },
    ];
    const graph: ProcessGraphDefinition = {
      version: 2,
      lanes: [
        { key: 'lane_1', name: 'ردیف اول', sortOrder: 10, parentTriggerKey: null },
        { key: 'lane_2', name: 'ردیف دوم', sortOrder: 20, parentTriggerKey: 'trigger_1' },
      ],
      triggers: [{
        key: 'trigger_1',
        name: 'فعال‌کننده',
        sourceNodeKey: 'b',
        targetLaneKeys: ['lane_2'],
        workflowId: null,
        manualEnabled: true,
        sortOrder: 10,
      }],
    };
    const attached = attachProcessGraphToStages(stages, graph);

    expect(getPreviousProcessStage(attached, 'c', graph)?.process_node_key).toBe('b');
    expect(getNextProcessStages(attached, 'b', graph).map((stage) => stage.process_node_key)).toEqual(['c']);
    expect(getInitialProcessStageNodeKeys(attached, graph)).toEqual(['a']);
  });

  it('resolves every incoming previous stage for a branched lane', () => {
    const stages: any[] = [
      { id: 'a', name: 'طراحی', sort_order: 10, process_node_key: 'a', process_lane_key: 'lane_1' },
      { id: 'b', name: 'تاییدیه', sort_order: 20, process_node_key: 'b', process_lane_key: 'lane_1' },
      { id: 'c', name: 'اجرا', sort_order: 10, process_node_key: 'c', process_lane_key: 'lane_2' },
    ];
    const graph: ProcessGraphDefinition = {
      version: 2,
      lanes: [
        { key: 'lane_1', name: 'ردیف اول', sortOrder: 10, parentTriggerKey: null },
        { key: 'lane_2', name: 'ردیف دوم', sortOrder: 20, parentTriggerKey: 'trigger_a' },
      ],
      triggers: [
        {
          key: 'trigger_a',
          name: 'از طراحی',
          sourceNodeKey: 'a',
          targetLaneKeys: ['lane_2'],
          workflowId: null,
          manualEnabled: true,
          sortOrder: 10,
        },
        {
          key: 'trigger_b',
          name: 'از تاییدیه',
          sourceNodeKey: 'b',
          targetLaneKeys: ['lane_2'],
          workflowId: null,
          manualEnabled: true,
          sortOrder: 20,
        },
      ],
    };
    const attached = attachProcessGraphToStages(stages, graph);

    expect(getPreviousProcessStages(attached, 'c', graph).map((stage) => stage.process_node_key)).toEqual(['a', 'b']);
    expect(getPreviousProcessStage(attached, 'c', graph)?.process_node_key).toBe('a');
  });

  it('returns the first stage of every root lane', () => {
    const stages = [
      { process_node_key: 'a', process_lane_key: 'lane_1', sort_order: 10 },
      { process_node_key: 'b', process_lane_key: 'lane_1', sort_order: 20 },
      { process_node_key: 'c', process_lane_key: 'lane_2', sort_order: 10 },
      { process_node_key: 'd', process_lane_key: 'lane_3', sort_order: 10 },
    ];
    const graph: ProcessGraphDefinition = {
      version: 2,
      lanes: [
        { key: 'lane_1', name: 'اول', sortOrder: 10, parentTriggerKey: null },
        { key: 'lane_2', name: 'دوم', sortOrder: 20, parentTriggerKey: null },
        { key: 'lane_3', name: 'شاخه', sortOrder: 30, parentTriggerKey: 'trigger_1' },
      ],
      triggers: [{
        key: 'trigger_1',
        name: 'شاخه',
        sourceNodeKey: 'b',
        targetLaneKeys: ['lane_3'],
        workflowId: null,
        manualEnabled: true,
        sortOrder: 10,
      }],
    };

    expect(getInitialProcessStageNodeKeys(stages, graph)).toEqual(['a', 'c']);
  });

  it('keeps a newly added empty lane when the graph is stored on existing stages', () => {
    const stages = [
      { id: 'a', name: 'آغاز', sort_order: 10, process_node_key: 'a', process_lane_key: 'lane_1' },
    ];
    const graph: ProcessGraphDefinition = {
      version: 2,
      lanes: [
        { key: 'lane_1', name: 'ردیف اول', sortOrder: 10, parentTriggerKey: null },
        { key: 'lane_2', name: 'ردیف خالی', sortOrder: 20, parentTriggerKey: null },
      ],
      triggers: [],
    };

    const attached = attachProcessGraphToStages(stages, graph);
    const restored = materializeLegacyProcessGraph(attached);

    expect(restored.isLegacy).toBe(false);
    expect(restored.graph.lanes.map((lane) => lane.key)).toEqual(['lane_1', 'lane_2']);
    expect(getProcessStagesByLane(restored.stages, restored.graph)[1].stages).toEqual([]);
  });

  it('moves a stage into an exact insertion point between two stages', () => {
    const stages = [
      { id: 'a', name: 'اول', sort_order: 10, process_node_key: 'a', process_lane_key: 'lane_1' },
      { id: 'b', name: 'دوم', sort_order: 20, process_node_key: 'b', process_lane_key: 'lane_1' },
      { id: 'c', name: 'سوم', sort_order: 30, process_node_key: 'c', process_lane_key: 'lane_1' },
    ];

    const moved = moveProcessStageToPosition(stages, 'a', 'lane_1', 2);
    expect(
      getProcessStagesByLane(moved)[0].stages.map((stage) => stage.process_node_key),
    ).toEqual(['b', 'a', 'c']);
  });

  it('moves a stage between lanes and keeps both lane orders normalized', () => {
    const stages = [
      { id: 'a', name: 'اول', sort_order: 10, process_node_key: 'a', process_lane_key: 'lane_1' },
      { id: 'b', name: 'دوم', sort_order: 20, process_node_key: 'b', process_lane_key: 'lane_1' },
      { id: 'c', name: 'سوم', sort_order: 10, process_node_key: 'c', process_lane_key: 'lane_2' },
    ];
    const graph: ProcessGraphDefinition = {
      version: 2,
      lanes: [
        { key: 'lane_1', name: 'اول', sortOrder: 10, parentTriggerKey: null },
        { key: 'lane_2', name: 'دوم', sortOrder: 20, parentTriggerKey: null },
      ],
      triggers: [],
    };

    const moved = moveProcessStageToPosition(stages, 'b', 'lane_2', 0, graph);
    const lanes = getProcessStagesByLane(moved, graph);
    expect(lanes[0].stages.map((stage) => stage.process_node_key)).toEqual(['a']);
    expect(lanes[1].stages.map((stage) => stage.process_node_key)).toEqual(['b', 'c']);
    expect(lanes[1].stages.map((stage) => stage.sort_order)).toEqual([10, 20]);
  });
});

describe('processSchedule', () => {
  it('waits for actual completion when the anchor is a completed stage', () => {
    const stages = [
      { process_node_key: 'a', process_lane_key: 'lane_1', sort_order: 10, due_date: '2026-06-10T08:00:00.000Z' },
      {
        process_node_key: 'b',
        process_lane_key: 'lane_1',
        sort_order: 20,
        due_anchor_type: 'previous_stage_completed',
        duration_value: 1,
        duration_unit: 'day',
      },
    ];
    expect(computeProcessStageDueDate({
      stage: stages[1],
      stages,
      processStartedAt: '2026-06-01T08:00:00.000Z',
    })).toBeNull();

    stages[0].completed_at = '2026-06-12T08:00:00.000Z';
    expect(computeProcessStageDueDate({
      stage: stages[1],
      stages,
      processStartedAt: '2026-06-01T08:00:00.000Z',
    })?.toISOString()).toBe('2026-06-13T08:00:00.000Z');
  });

  it('recalculates a specific-stage due anchor from the current referenced due date', () => {
    const stages = [
      { process_node_key: 'review', process_lane_key: 'lane_1', sort_order: 10, due_date: '2026-07-20T09:30:00.000Z' },
      {
        process_node_key: 'notify',
        process_lane_key: 'lane_2',
        sort_order: 10,
        due_anchor_type: 'specific_stage_due',
        due_anchor_stage_node_key: 'review',
        duration_value: 2,
        duration_unit: 'hour',
      },
    ];

    expect(computeProcessStageDueDate({
      stage: stages[1],
      stages,
      processStartedAt: null,
    })?.toISOString()).toBe('2026-07-20T11:30:00.000Z');
  });

  it('supports start and next-stage completion anchors without falling back to process start', () => {
    const stages = [
      {
        process_node_key: 'a', process_lane_key: 'lane_1', sort_order: 10,
        due_anchor_type: 'next_stage_completed', duration_value: 1, duration_unit: 'day',
      },
      { process_node_key: 'b', process_lane_key: 'lane_1', sort_order: 20, actual_end_at: '2026-07-21T08:00:00.000Z' },
      {
        process_node_key: 'c', process_lane_key: 'lane_1', sort_order: 30,
        due_anchor_type: 'previous_stage_start', duration_value: 30, duration_unit: 'hour',
      },
    ];

    expect(computeProcessStageDueDate({ stage: stages[0], stages, processStartedAt: null })?.toISOString())
      .toBe('2026-07-22T08:00:00.000Z');
    stages[1].actual_start_at = '2026-07-19T06:00:00.000Z';
    expect(computeProcessStageDueDate({ stage: stages[2], stages, processStartedAt: null })?.toISOString())
      .toBe('2026-07-20T12:00:00.000Z');
  });
});
