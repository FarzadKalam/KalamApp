import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  fetchCurrentUserRoleContext: vi.fn(),
  rowsByTable: {} as Record<string, any[]>,
}));

const RUN_ONE_ID = '44444444-4444-4444-8444-444444444444';
const ORG_ID = '12121212-1212-4212-8212-121212121212';
const RUN_RECYCLED_ID = '55555555-5555-4555-8555-555555555555';
const RUN_INITIAL_ID = '66666666-6666-4666-8666-666666666666';
const RUN_NEXT_ID = '77777777-7777-4777-8777-777777777777';
const RUN_NEW_ID = '88888888-8888-4888-8888-888888888888';
const ACTOR_ONE_ID = '99999999-9999-4999-8999-999999999999';
const ACTOR_TWO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEMPLATE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PROJECT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TASK_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
  supabaseSignUpClient: {
    from: mocks.from,
  },
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test-key',
}));

vi.mock('./permissions', () => ({
  fetchCurrentUserRoleContext: mocks.fetchCurrentUserRoleContext,
}));

import {
  activateInitialProcessRunNodes,
  activateProcessRunNodes,
  activateProcessStageAction,
  prepareProcessRunNodesForTaskCreation,
} from './processStageActivation';

const createSelectQuery = (rows: any[]) => {
  const filters: Array<{ field: string; value: any }> = [];

  const applyFilters = () =>
    rows.filter((row) => filters.every((filter) => row?.[filter.field] === filter.value));

  const chain: any = {
    eq: (field: string, value: any) => {
      filters.push({ field, value });
      return chain;
    },
    order: async (field: string, options?: { ascending?: boolean }) => {
      const direction = options?.ascending === false ? -1 : 1;
      return {
        data: [...applyFilters()].sort((left, right) => (
          (Number(left?.[field] || 0) - Number(right?.[field] || 0)) * direction
        )),
        error: null,
      };
    },
    maybeSingle: async () => ({
      data: applyFilters()[0] ?? null,
      error: null,
    }),
  };
  return chain;
};

describe('processStageActivation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rowsByTable = {};
    mocks.fetchCurrentUserRoleContext.mockResolvedValue({
      orgId: ORG_ID,
      userId: USER_ID,
      roleId: null,
      permissions: null,
    });
    mocks.rpc.mockResolvedValue({
      data: { created_task_ids: ['created-1'], existing_task_ids: ['existing-1'] },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => ({
      select: vi.fn(() => createSelectQuery(mocks.rowsByTable[table] || [])),
      update: vi.fn((patch: Record<string, any>) => ({
        eq: async (field: string, value: any) => {
          const row = (mocks.rowsByTable[table] || []).find((item) => item?.[field] === value);
          if (row) Object.assign(row, patch);
          return { data: row || null, error: null };
        },
      })),
    }));
  });

  it('renders process, lane, title and description before creating a real task', async () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    const recordId = '22222222-2222-4222-8222-222222222222';
    const stageId = '33333333-3333-4333-8333-333333333333';
    mocks.rowsByTable.process_runs = [{
      id: runId,
      org_id: ORG_ID,
      module_id: 'projects',
      record_id: recordId,
      process_name: 'فرآیند {{name}}',
    }];
    mocks.rowsByTable.projects = [{ id: recordId, name: 'آذرخش' }];
    mocks.rowsByTable.process_run_stages = [{
      id: stageId,
      process_run_id: runId,
      process_node_key: 'stage_a',
      process_lane_key: 'lane_1',
      stage_name: 'پیگیری {{name}}',
      sort_order: 10,
      metadata: {
        description: 'شرح {{name}}',
        process_graph: {
          lanes: [{ key: 'lane_1', name: 'ردیف {{name}}' }],
        },
      },
    }];

    await prepareProcessRunNodesForTaskCreation({ processRunId: runId, nodeKeys: ['stage_a'] });

    expect(mocks.rowsByTable.process_runs[0].process_name).toBe('فرآیند آذرخش');
    expect(mocks.rowsByTable.process_run_stages[0].stage_name).toBe('پیگیری آذرخش');
    expect(mocks.rowsByTable.process_run_stages[0].metadata.description).toBe('شرح آذرخش');
    expect(mocks.rowsByTable.process_run_stages[0].metadata.process_graph.lanes[0].name).toBe('ردیف آذرخش');
  });

  it('activates unique process run nodes through the shared RPC', async () => {
    const result = await activateProcessRunNodes({
      processRunId: RUN_ONE_ID,
      nodeKeys: ['stage_a', 'stage_a', '', 'stage_b'],
      actorUserId: ACTOR_ONE_ID,
    });

    expect(mocks.rpc).toHaveBeenCalledWith('activate_process_run_nodes', {
      p_org_id: ORG_ID,
      p_process_run_id: RUN_ONE_ID,
      p_node_keys: ['stage_a', 'stage_b'],
      p_actor_user_id: ACTOR_ONE_ID,
    });
    expect(result).toEqual({
      createdTaskIds: ['created-1'],
      existingTaskIds: ['existing-1'],
    });
  });

  it('does not activate nodes when the process run is in the recycle bin', async () => {
    mocks.rowsByTable.recycle_bin_records = [
      {
        id: 'recycle-1',
        source_table: 'process_runs',
        source_record_id: RUN_RECYCLED_ID,
      },
    ];

    const result = await activateProcessRunNodes({
      processRunId: RUN_RECYCLED_ID,
      nodeKeys: ['stage_a'],
    });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ createdTaskIds: [], existingTaskIds: [] });
  });

  it('activates the first stage of every root lane when executing a process run', async () => {
    mocks.rowsByTable.process_run_stages = [
      { id: 's1', process_run_id: RUN_INITIAL_ID, process_node_key: 'stage_a', process_lane_key: 'lane_1', sort_order: 10 },
      { id: 's2', process_run_id: RUN_INITIAL_ID, process_node_key: 'stage_b', process_lane_key: 'lane_1', sort_order: 20 },
      { id: 's3', process_run_id: RUN_INITIAL_ID, process_node_key: 'stage_c', process_lane_key: 'lane_2', sort_order: 10 },
    ];

    await activateInitialProcessRunNodes({ processRunId: RUN_INITIAL_ID, actorUserId: ACTOR_TWO_ID });

    expect(mocks.rpc).toHaveBeenLastCalledWith('activate_process_run_nodes', {
      p_org_id: ORG_ID,
      p_process_run_id: RUN_INITIAL_ID,
      p_node_keys: ['stage_a', 'stage_c'],
      p_actor_user_id: ACTOR_TWO_ID,
    });
  });

  it('activates the next connected stage for process automation actions', async () => {
    mocks.rowsByTable.process_run_stages = [
      { id: 's1', process_run_id: RUN_NEXT_ID, process_node_key: 'stage_a', process_lane_key: 'lane_1', sort_order: 10 },
      { id: 's2', process_run_id: RUN_NEXT_ID, process_node_key: 'stage_b', process_lane_key: 'lane_1', sort_order: 20 },
    ];

    await activateProcessStageAction({
      actionType: 'activate_next_process_stage',
      config: {},
      moduleId: 'tasks',
      record: {
        id: TASK_ID,
        process_run_id: RUN_NEXT_ID,
        process_node_key: 'stage_a',
      },
    });

    expect(mocks.rpc).toHaveBeenLastCalledWith('activate_process_run_nodes', {
      p_org_id: ORG_ID,
      p_process_run_id: RUN_NEXT_ID,
      p_node_keys: ['stage_b'],
      p_actor_user_id: USER_ID,
    });
  });

  it('creates a process run before activating a specific requested stage when no run exists yet', async () => {
    mocks.rowsByTable.process_run_stages = [
      { id: 's1', process_run_id: RUN_NEW_ID, process_node_key: 'stage_a', process_lane_key: 'lane_1', sort_order: 10 },
      { id: 's2', process_run_id: RUN_NEW_ID, process_node_key: 'stage_b', process_lane_key: 'lane_1', sort_order: 20 },
    ];
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'create_process_run_from_template') {
        return { data: RUN_NEW_ID, error: null };
      }
      return { data: { created_task_ids: ['task-b'], existing_task_ids: [] }, error: null };
    });

    await activateProcessStageAction({
      actionType: 'activate_specific_process_stage',
      config: {
        template_id: TEMPLATE_ID,
        stage_node_keys: ['stage_b'],
      },
      moduleId: 'projects',
      record: { id: PROJECT_ID },
    });

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'create_process_run_from_template', {
      p_org_id: ORG_ID,
      p_template_id: TEMPLATE_ID,
      p_module_id: 'projects',
      p_record_id: PROJECT_ID,
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith('activate_process_run_nodes', {
      p_org_id: ORG_ID,
      p_process_run_id: RUN_NEW_ID,
      p_node_keys: ['stage_b'],
      p_actor_user_id: USER_ID,
    });
  });
});
