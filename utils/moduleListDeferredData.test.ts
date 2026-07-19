import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetModuleListDeferredDataForTests,
  fetchDeferredModuleListFields,
} from './moduleListDeferredData';

const createClient = (data: any[]) => {
  const inQuery = vi.fn().mockResolvedValue({ data, error: null });
  const select = vi.fn(() => ({ in: inQuery }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, from, select, inQuery };
};

describe('deferred module list data', () => {
  beforeEach(() => __resetModuleListDeferredDataForTests());

  it('loads visible heavy fields in one batch and reuses the per-org cache', async () => {
    const mock = createClient([
      { id: '1', description: 'الف' },
      { id: '2', description: 'ب' },
    ]);
    const options = {
      supabaseClient: mock.client,
      orgId: 'org-1',
      resource: 'projects',
      rows: [
        { id: '1', updated_at: '2026-01-01' },
        { id: '2', updated_at: '2026-01-01' },
      ],
      fieldKeys: ['description'],
    };

    await expect(fetchDeferredModuleListFields(options)).resolves.toMatchObject({
      1: { description: 'الف' },
      2: { description: 'ب' },
    });
    await fetchDeferredModuleListFields(options);

    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.select).toHaveBeenCalledWith('id,description');
    expect(mock.inQuery).toHaveBeenCalledWith('id', ['1', '2']);
  });

  it('does not reuse cached rows across organizations', async () => {
    const mock = createClient([{ id: '1', notes: 'متن' }]);
    const base = {
      supabaseClient: mock.client,
      resource: 'customers',
      rows: [{ id: '1', updated_at: '2026-01-01' }],
      fieldKeys: ['notes'],
    };
    await fetchDeferredModuleListFields({ ...base, orgId: 'org-1' });
    await fetchDeferredModuleListFields({ ...base, orgId: 'org-2' });
    expect(mock.from).toHaveBeenCalledTimes(2);
  });
});
