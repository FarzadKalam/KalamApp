import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const siblingLoad = new Promise(() => undefined);
  return {
    updateEq: vi.fn().mockResolvedValue({ error: null }),
    siblingLimit: vi.fn(() => siblingLoad),
    syncRunStage: vi.fn().mockResolvedValue(undefined),
    syncProject: vi.fn(() => new Promise(() => undefined)),
    runWorkflows: vi.fn().mockResolvedValue(undefined),
    dispatch: vi.fn(),
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: mocks.updateEq })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ limit: mocks.siblingLimit })),
      })),
    })),
  },
}));

vi.mock('./recordLockRuntime', () => ({
  getRecordLockStateFromRecord: vi.fn(() => ({ isLocked: false })),
  fetchRecordLockState: vi.fn().mockResolvedValue({ isLocked: false }),
  createRecordLockedError: vi.fn((message: string) => new Error(message)),
}));

vi.mock('./processRunRuntime', () => ({
  syncProcessRunStageFromTask: mocks.syncRunStage,
}));

vi.mock('./projectProcessStatus', () => ({
  syncProjectStatusesForTask: mocks.syncProject,
}));

vi.mock('./workflowRuntime', () => ({
  runWorkflowsForEvent: mocks.runWorkflows,
}));

vi.mock('./taskRuntimeEvents', () => ({
  dispatchTaskRuntimeUpdated: mocks.dispatch,
}));

import { updateTaskStatusWithAutomation } from './taskUpdateRuntime';

describe('task status save latency', () => {
  it('returns after the task and runtime stage are durable without waiting for background UI reconciliation', async () => {
    const previousTask = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'فعالیت تست',
      status: 'todo',
      process_run_id: '22222222-2222-4222-8222-222222222222',
      process_run_stage_id: '33333333-3333-4333-8333-333333333333',
      recurrence_info: {},
    };
    const result = await Promise.race([
      updateTaskStatusWithAutomation({
        taskId: previousTask.id,
        nextStatus: 'in_progress',
        previousTask,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('status save waited for background work')), 200)),
    ]);

    expect(result).toMatchObject({ id: previousTask.id, status: 'in_progress' });
    expect(mocks.updateEq).toHaveBeenCalledWith('id', previousTask.id);
    expect(mocks.syncRunStage).toHaveBeenCalledOnce();
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ reason: 'status' }));
    expect(mocks.siblingLimit).toHaveBeenCalled();
    expect(mocks.syncProject).toHaveBeenCalled();
  });
});
