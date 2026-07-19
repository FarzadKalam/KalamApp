import { describe, expect, it, vi } from 'vitest';
import {
  persistProcessDraftField,
  sanitizeProcessDraftStagesForPersistence,
} from './processDraftPersistence';

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

  it('removes transient template context but preserves process identity and automations', () => {
    expect(sanitizeProcessDraftStagesForPersistence([{
      id: 'draft-1',
      template_id: 'template-1',
      automation_rules: [{ id: 'rule-1' }],
      __process_v2_linked_owner_record_id: 'record-1',
      __process_v2_template_context: { huge: 'payload' },
      metadata: {
        process_group_id: 'group-1',
        __process_v2_template_context: { nested: true },
      },
    }])).toEqual([{
      id: 'draft-1',
      template_id: 'template-1',
      automation_rules: [{ id: 'rule-1' }],
      __process_v2_linked_owner_record_id: 'record-1',
      metadata: { process_group_id: 'group-1' },
    }]);
  });

  it('never sends transient process context to the record column', async () => {
    const mock = createClient({ data: { id: 'record-1' }, error: null });
    await persistProcessDraftField({
      supabaseClient: mock.client,
      moduleId: 'projects',
      recordId: 'record-1',
      fieldKey: 'execution_process_draft',
      stages: [{ id: 'draft-1', __process_v2_template_context: { huge: true } }],
    });
    expect(mock.update).toHaveBeenCalledWith({ execution_process_draft: [{ id: 'draft-1' }] });
  });
});
