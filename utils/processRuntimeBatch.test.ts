import { describe, expect, it, vi } from 'vitest';
import { fetchProcessRuntimeBatchForRecord } from './processRuntimeBatch';

const RECORD_A = '11111111-1111-4111-8111-111111111111';
const RECORD_B = '22222222-2222-4222-8222-222222222222';

describe('process runtime summary batching', () => {
  it('uses one compact summary RPC for multiple column records', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { record_id: RECORD_A, runs: [{ id: 'run-a' }], stages: [{ id: 'stage-a' }] },
        { record_id: RECORD_B, runs: [{ id: 'run-b' }], stages: [{ id: 'stage-b' }] },
      ],
      error: null,
    });

    const [first, second] = await Promise.all([
      fetchProcessRuntimeBatchForRecord({ rpc }, 'projects', RECORD_A, { force: true, mode: 'summary' }),
      fetchProcessRuntimeBatchForRecord({ rpc }, 'projects', RECORD_B, { force: true, mode: 'summary' }),
    ]);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_process_runtime_summary_batch_for_records', {
      p_module_id: 'projects',
      p_record_ids: [RECORD_A, RECORD_B],
    });
    expect(first).toMatchObject({ isSummary: true, runs: [{ id: 'run-a' }] });
    expect(second).toMatchObject({ isSummary: true, stages: [{ id: 'stage-b' }] });
  });

  it('keeps the former full batch RPC as a safe fallback before migration deployment', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'function not found' } })
      .mockResolvedValueOnce({ data: [{ record_id: RECORD_A, runs: [], stages: [{ id: 'stage-a' }] }], error: null });

    const snapshot = await fetchProcessRuntimeBatchForRecord(
      { rpc },
      'projects',
      RECORD_A,
      { force: true, mode: 'summary' },
    );

    expect(rpc).toHaveBeenLastCalledWith('get_process_runtime_batch_for_records', {
      p_module_id: 'projects',
      p_record_ids: [RECORD_A],
    });
    expect(snapshot).toMatchObject({ isSummary: false, stages: [{ id: 'stage-a' }] });
  });
});
