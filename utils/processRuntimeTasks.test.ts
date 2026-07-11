import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAppRuntimeCache } from './appRuntimeCache';
import { fetchProcessRuntimeTasksForRecord } from './processRuntimeTasks';

const RECORD_A = '11111111-1111-4111-8111-111111111111';
const RECORD_B = '22222222-2222-4222-8222-222222222222';

describe('process runtime task batching', () => {
  beforeEach(() => {
    clearAppRuntimeCache('process-runtime-tasks:');
  });

  it('loads task cards for multiple records with one batch RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { record_id: RECORD_A, tasks: [{ id: 'task-a', process_run_id: 'run-a' }] },
        { record_id: RECORD_B, tasks: [{ id: 'task-b', process_run_id: 'run-b' }] },
      ],
      error: null,
    });

    const [first, second] = await Promise.all([
      fetchProcessRuntimeTasksForRecord({ rpc }, 'projects', RECORD_A, { runs: [], stages: [] }),
      fetchProcessRuntimeTasksForRecord({ rpc }, 'projects', RECORD_B, { runs: [], stages: [] }),
    ]);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_process_runtime_tasks_batch_for_records', {
      p_module_id: 'projects',
      p_record_ids: [RECORD_A, RECORD_B],
    });
    expect(first).toEqual([{ id: 'task-a', process_run_id: 'run-a' }]);
    expect(second).toEqual([{ id: 'task-b', process_run_id: 'run-b' }]);
  });

  it('falls back to the existing record RPC until the new migration is deployed', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'function not found' } })
      .mockResolvedValueOnce({ data: [{ id: 'task-a' }], error: null });

    const tasks = await fetchProcessRuntimeTasksForRecord(
      { rpc },
      'projects',
      RECORD_A,
      { runs: [{ id: '33333333-3333-4333-8333-333333333333' }], stages: [] },
      { force: true },
    );

    expect(tasks).toEqual([{ id: 'task-a' }]);
    expect(rpc).toHaveBeenLastCalledWith('get_process_runtime_tasks_for_record', expect.objectContaining({
      p_module_id: 'projects',
      p_record_id: RECORD_A,
      p_process_run_ids: ['33333333-3333-4333-8333-333333333333'],
    }));
  });

  it('splits a timed-out batch and still resolves every record', async () => {
    const rpc = vi.fn(async (name: string, params: any) => {
      if (name !== 'get_process_runtime_tasks_batch_for_records') return { data: [], error: null };
      if (params.p_record_ids.length > 1) {
        return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
      }
      const recordId = params.p_record_ids[0];
      return { data: [{ record_id: recordId, tasks: [{ id: `task:${recordId}` }] }], error: null };
    });

    const [first, second] = await Promise.all([
      fetchProcessRuntimeTasksForRecord({ rpc }, 'invoices', RECORD_A, { runs: [], stages: [] }, { force: true }),
      fetchProcessRuntimeTasksForRecord({ rpc }, 'invoices', RECORD_B, { runs: [], stages: [] }, { force: true }),
    ]);

    expect(first).toEqual([{ id: `task:${RECORD_A}` }]);
    expect(second).toEqual([{ id: `task:${RECORD_B}` }]);
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});
