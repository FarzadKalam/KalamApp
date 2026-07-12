import { describe, expect, it, vi } from 'vitest';
import {
  evaluateProcessAutomationConditions,
  getAdjacentProcessTasks,
  getTaskProcessAutomationRules,
  resolveProcessAutomationTargetTokens,
} from './process-automation-core';

describe('server process automation core', () => {
  it('keeps legacy active rules compatible', () => {
    const rules = getTaskProcessAutomationRules({
      id: 'task-1',
      process_node_key: 'stage-a',
      recurrence_info: {
        process_automation_rules: [{
          id: 'legacy-rule',
          trigger_type: 'current_stage_completed',
          target_type: 'current_task_assignee',
          note_text: 'انجام شد',
        }],
      },
    });

    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      id: 'legacy-rule',
      trigger_type: 'on_upsert',
      execution_mode: 'every_match',
      is_active: true,
    });
    expect(rules[0].conditions_all).toContainEqual(expect.objectContaining({
      field: '__task__status',
      operator: 'eq',
      value: 'done',
    }));
    expect(rules[0].actions[0]).toMatchObject({ type: 'send_note', config: { note_text: 'انجام شد' } });
  });

  it('resolves next root lanes and their assignees from the process graph', () => {
    const graph = {
      lanes: [
        { key: 'lane-a' },
        { key: 'lane-b', parentTriggerKey: 'trigger-a' },
      ],
      triggers: [{ key: 'trigger-a', sourceNodeKey: 'stage-a', targetLaneKeys: ['lane-b'] }],
    };
    const task = {
      id: 'task-a', process_node_key: 'stage-a', process_lane_key: 'lane-a', sort_order: 10,
      recurrence_info: { process_graph: graph },
    };
    const nextTask = {
      id: 'task-b', process_node_key: 'stage-b', process_lane_key: 'lane-b', sort_order: 10,
      assignee_role_id: 'role-b', recurrence_info: { process_graph: graph },
    };

    expect(getAdjacentProcessTasks(task, [task, nextTask], 'next')).toEqual([nextTask]);
    expect(resolveProcessAutomationTargetTokens(
      { target_type: 'next_stage_assignee' },
      task,
      [task, nextTask],
    )).toEqual(['role_role-b']);
  });

  it('preserves AND semantics for grouped negative OR conditions', async () => {
    const evaluate = vi.fn(async (condition: any) => condition.value !== 'blocked');
    const result = await evaluateProcessAutomationConditions(
      [],
      [
        { field: 'status', operator: 'neq', value: 'blocked' },
        { field: 'status', operator: 'neq', value: 'cancelled' },
      ],
      { status: 'todo' },
      null,
      evaluate,
    );

    expect(result).toBe(false);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
