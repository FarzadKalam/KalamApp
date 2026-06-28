import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../moduleRegistry', () => ({
  MODULES: {
    projects: {
      id: 'projects',
      table: 'projects',
      fields: [
        { key: 'execution_process_draft' },
      ],
    },
  },
}));

import { fetchLinkedProcessDraftStagesForRecord } from './processLinkedDraftLookup';

describe('processLinkedDraftLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries JSONB draft arrays with a serialized contains filter', async () => {
    const filter = vi.fn();
    const contains = vi.fn();
    const limit = vi.fn(async () => ({ data: [], error: null }));
    filter.mockReturnValue({ limit });

    const supabaseClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          contains,
          filter,
        })),
      })),
    };

    await fetchLinkedProcessDraftStagesForRecord(supabaseClient, 'customers', 'customer-1');

    expect(contains).not.toHaveBeenCalled();
    expect(filter).toHaveBeenCalledWith(
      'execution_process_draft',
      'cs',
      JSON.stringify([{ process_link_map: { customers: 'customer-1' } }]),
    );
    expect(filter).toHaveBeenCalledWith(
      'execution_process_draft',
      'cs',
      JSON.stringify([{ metadata: { process_link_map: { customers: 'customer-1' } } }]),
    );
    expect(limit).toHaveBeenCalledWith(12);
  });
});
