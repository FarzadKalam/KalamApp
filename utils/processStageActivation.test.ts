import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  fetchCurrentUserRoleContext: vi.fn(),
  rowsByTable: {} as Record<string, any[]>,
}));

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
      orgId: 'org-1',
      userId: 'user-1',
      roleId: null,
      permissions: null,
    });
    mocks.rpc.mockResolvedValue({
      data: { created_task_ids: ['created-1'], existing_task_ids: ['existing-1'] },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => ({
      select: vi.fn(() => createSelectQuery(mocks.rowsByTable[table] || [])),
    }));
  });

  it('activates unique process run nodes through the shared RPC', async () => {
    const result = await activateProcessRunNodes({
      processRunId: 'run-1',
      nodeKeys: ['stage_a', 'stage_a', '', 'stage_b'],
      actorUserId: 'actor-1',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('activate_process_run_nodes', {
      p_org_id: 'org-1',
      p_process_run_id: 'run-1',
      p_node_keys: ['stage_a', 'stage_b'],
      p_actor_user_id: 'actor-1',
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
        source_record_id: 'run-recycled',
      },
    ];

    const result = await activateProcessRunNodes({
      processRunId: 'run-recycled',
      nodeKeys: ['stage_a'],
    });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ createdTaskIds: [], existingTaskIds: [] });
  });

  it('activates the first stage of every root lane when executing a process run', async () => {
    mocks.rowsByTable.process_run_stages = [
      { id: 's1', process_run_id: 'run-initial', process_node_key: 'stage_a', process_lane_key: 'lane_1', sort_order: 10 },
      { id: 's2', process_run_id: 'run-initial', process_node_key: 'stage_b', process_lane_key: 'lane_1', sort_order: 20 },
      { id: 's3', process_run_id: 'run-initial', process_node_key: 'stage_c', process_lane_key: 'lane_2', sort_order: 10 },
    ];

    await activateInitialProcessRunNodes({ processRunId: 'run-initial', actorUserId: 'actor-2' });

    expect(mocks.rpc).toHaveBeenLastCalledWith('activate_process_run_nodes', {
      p_org_id: 'org-1',
      p_process_run_id: 'run-initial',
      p_node_keys: ['stage_a', 'stage_c'],
      p_actor_user_id: 'actor-2',
    });
  });

  it('activates the next connected stage for process automation actions', async () => {
    mocks.rowsByTable.process_run_stages = [
      { id: 's1', process_run_id: 'run-next', process_node_key: 'stage_a', process_lane_key: 'lane_1', sort_order: 10 },
      { id: 's2', process_run_id: 'run-next', process_node_key: 'stage_b', process_lane_key: 'lane_1', sort_order: 20 },
    ];

    await activateProcessStageAction({
      actionType: 'activate_next_process_stage',
      config: {},
      moduleId: 'tasks',
      record: {
        id: 'task-1',
        process_run_id: 'run-next',
        process_node_key: 'stage_a',
      },
    });

    expect(mocks.rpc).toHaveBeenLastCalledWith('activate_process_run_nodes', {
      p_org_id: 'org-1',
      p_process_run_id: 'run-next',
      p_node_keys: ['stage_b'],
      p_actor_user_id: 'user-1',
    });
  });

  it('creates a process run before activating a specific requested stage when no run exists yet', async () => {
    mocks.rowsByTable.process_run_stages = [
      { id: 's1', process_run_id: 'run-new', process_node_key: 'stage_a', process_lane_key: 'lane_1', sort_order: 10 },
      { id: 's2', process_run_id: 'run-new', process_node_key: 'stage_b', process_lane_key: 'lane_1', sort_order: 20 },
    ];
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'create_process_run_from_template') {
        return { data: 'run-new', error: null };
      }
      return { data: { created_task_ids: ['task-b'], existing_task_ids: [] }, error: null };
    });

    await activateProcessStageAction({
      actionType: 'activate_specific_process_stage',
      config: {
        template_id: 'template-1',
        stage_node_keys: ['stage_b'],
      },
      moduleId: 'projects',
      record: { id: 'project-1' },
    });

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'create_process_run_from_template', {
      p_org_id: 'org-1',
      p_template_id: 'template-1',
      p_module_id: 'projects',
      p_record_id: 'project-1',
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith('activate_process_run_nodes', {
      p_org_id: 'org-1',
      p_process_run_id: 'run-new',
      p_node_keys: ['stage_b'],
      p_actor_user_id: 'user-1',
    });
  });
});
