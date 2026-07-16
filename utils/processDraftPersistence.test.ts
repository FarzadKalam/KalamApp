import { describe, expect, it, vi } from 'vitest';
import { persistProcessDraftField } from './processDraftPersistence';

const createClient = (result: any) => {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { client: { from }, from, update, eq, select, maybeSingle };
};

describe('process draft persistence', () => {
  it('returns only after the server confirms the record update', async () => {
    const mock = createClient({ data: { id: 'record-1' }, error: null });
    await expect(persistProcessDraftField({
      supabaseClient: mock.client,
      moduleId: 'customers',
      recordId: 'record-1',
      fieldKey: 'execution_process_draft',
      stages: [{ id: 'draft-1' }],
    })).resolves.toEqual({ id: 'record-1' });
    expect(mock.update).toHaveBeenCalledWith({ execution_process_draft: [{ id: 'draft-1' }] });
  });

  it('rejects a silent zero-row update instead of showing false success', async () => {
    const mock = createClient({ data: null, error: null });
    await expect(persistProcessDraftField({
      supabaseClient: mock.client,
      moduleId: 'customers',
      recordId: 'record-1',
      fieldKey: 'execution_process_draft',
      stages: [],
    })).rejects.toThrow('تأیید نشد');
  });
});
