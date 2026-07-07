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
    invoices: {
      id: 'invoices',
      table: 'invoices',
      fields: [
        { key: 'execution_process_draft' },
      ],
    },
  },
}));

import {
  clearLinkedProcessDraftLookupCaches,
  fetchLinkedProcessDraftStagesForRecord,
} from './processLinkedDraftLookup';

describe('processLinkedDraftLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLinkedProcessDraftLookupCaches();
  });

  it('does not scan every module unless a legacy global scan or source modules are requested', async () => {
    const supabaseClient = {
      from: vi.fn(),
    };

    const stages = await fetchLinkedProcessDraftStagesForRecord(supabaseClient, 'customers', 'customer-1');

    expect(stages).toEqual([]);
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('queries JSONB draft arrays with a serialized contains filter when global legacy scan is enabled', async () => {
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

    await fetchLinkedProcessDraftStagesForRecord(supabaseClient, 'customers', 'customer-1', {
      allowGlobalScan: true,
      sourceModuleIds: ['projects'],
    });

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
    expect(supabaseClient.from).toHaveBeenCalledTimes(2);
    expect(supabaseClient.from).toHaveBeenCalledWith('projects');
    expect(supabaseClient.from).not.toHaveBeenCalledWith('invoices');
  });

  it('reuses an in-flight lookup for duplicate requests', async () => {
    const filter = vi.fn();
    let resolveLimit: ((value: { data: any[]; error: null }) => void) | null = null;
    let shouldHoldFirstQuery = true;
    const limit = vi.fn(() => {
      if (!shouldHoldFirstQuery) return Promise.resolve({ data: [], error: null });
      shouldHoldFirstQuery = false;
      return new Promise<{ data: any[]; error: null }>((resolve) => {
        resolveLimit = resolve;
      });
    });
    filter.mockReturnValue({ limit });

    const supabaseClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          filter,
        })),
      })),
    };

    const first = fetchLinkedProcessDraftStagesForRecord(supabaseClient, 'customers', 'customer-1', {
      sourceModuleIds: ['projects'],
    });
    const second = fetchLinkedProcessDraftStagesForRecord(supabaseClient, 'customers', 'customer-1', {
      sourceModuleIds: ['projects'],
    });

    expect(supabaseClient.from).toHaveBeenCalledTimes(1);
    resolveLimit?.({ data: [], error: null });
    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  });
});
