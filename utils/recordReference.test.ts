import { describe, expect, it, vi } from 'vitest';
import { fetchRecordReferenceLabels } from './recordReference';

describe('fetchRecordReferenceLabels', () => {
  it('coalesces concurrent identical relation-title requests', async () => {
    const recordId = '66666666-6666-4666-8666-666666666666';
    let resolveQuery: (value: any) => void = () => undefined;
    const queryResult = new Promise((resolve) => {
      resolveQuery = resolve;
    });
    const inQuery = vi.fn(() => queryResult);
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ in: inQuery })),
      })),
    };

    const first = fetchRecordReferenceLabels(supabase as any, [{ moduleId: 'invoices', recordId }]);
    const second = fetchRecordReferenceLabels(supabase as any, [{ moduleId: 'invoices', recordId }]);
    await Promise.resolve();
    expect(inQuery).toHaveBeenCalledTimes(1);

    resolveQuery({ data: [{ id: recordId, name: 'فاکتور نمونه', system_code: 'INV-1' }], error: null });
    await expect(first).resolves.toMatchObject({ [`invoices:${recordId}`]: expect.any(String) });
    await expect(second).resolves.toEqual(await first);
  });
});
