import { describe, expect, it, vi } from 'vitest';
import { patchProcessTaskCustomFieldValues } from './processTaskCustomFieldPersistence';

describe('process task custom field persistence', () => {
  it('uses the atomic per-org RPC when available', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: 'task-1', recurrence_info: { process_task_custom_field_values: { approved: true } } },
      error: null,
    });
    const from = vi.fn();
    const result = await patchProcessTaskCustomFieldValues({
      supabaseClient: { rpc, from },
      taskId: 'task-1',
      values: { approved: true },
      fallbackRecurrence: {},
    });
    expect(result.id).toBe('task-1');
    expect(rpc).toHaveBeenCalledWith('patch_process_task_v2_custom_field_values', {
      p_task_id: 'task-1',
      p_field_values: { approved: true },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('keeps a compatible fallback until the migration is deployed', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'task-1', recurrence_info: {} }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'function not found' } });

    await patchProcessTaskCustomFieldValues({
      supabaseClient: { rpc, from },
      taskId: 'task-1',
      values: { approved: true },
      fallbackRecurrence: { process_links: { projects: 'project-1' } },
    });
    expect(update).toHaveBeenCalledWith({
      recurrence_info: {
        process_links: { projects: 'project-1' },
        process_task_custom_field_values: { approved: true },
      },
    });
  });
});
