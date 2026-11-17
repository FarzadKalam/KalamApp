// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createAiRecordLookupRuntime } from './ai-record-lookups';

describe('authorized field lookup', () => {
  const setup = () => {
    const read = vi.fn(async () => [{ id: 'internal-id', full_name: 'وجیهه یعقوبیان' }]);
    return { read, runtime: createAiRecordLookupRuntime({ moduleIds: ['leads'], orgId: 'current-org', read,
      loadSchema: async () => ({ fields: [{ key: 'assignee_id', type: 'user' }, { key: 'customer', relationTargetModule: 'customers' }] }),
      tableForModule: () => 'customers', canReadModule: () => false }) };
  };
  it('resolves an assignee without requiring a relation target and scopes/paginates the query', async () => {
    const { runtime, read } = setup();
    const result = await runtime.execute('lookup_record_field', { moduleId: 'leads', field: 'assignee_id', query: 'خانم وجیهه یعقوبیان', offset: 25 });
    expect(result.records).toEqual([{ id: 'internal-id', title: 'وجیهه یعقوبیان' }]);
    expect(read).toHaveBeenCalledWith('profiles', expect.objectContaining({ org_id: 'eq.current-org', offset: 25, limit: 26, or: '(full_name.ilike.*وجیهه یعقوبیان*)' }));
  });
  it('denies unknown fields, unauthorized modules and inaccessible relation targets before reading', async () => {
    const { runtime, read } = setup();
    for (const args of [{ moduleId: 'other', field: 'assignee_id' }, { moduleId: 'leads', field: 'secret' }, { moduleId: 'leads', field: 'customer' }]) {
      await expect(runtime.execute('lookup_record_field', { ...args, query: 'نام' })).rejects.toThrow();
    }
    expect(read).not.toHaveBeenCalled();
  });
  it('resolves nested invoice line relations from the authorized table schema', async () => {
    const read = vi.fn(async () => [{ id: 'product-ref',name: 'بنر' }]);
    const runtime = createAiRecordLookupRuntime({ moduleIds: ['invoices'],orgId: 'org',read,
      loadSchema: async (moduleId) => moduleId === 'invoices' ? { fields: [],tables: [{ key: 'items',columns: [{ key: 'product_id',type: 'relation',relationTargetModule: 'products' }] }] }
        : { fields: [{ key: 'name',type: 'text' }] },tableForModule: id => id,canReadModule: () => true });
    expect((await runtime.execute('lookup_record_field',{ moduleId: 'invoices',field: 'items.product_id',query: 'بنر' })).records[0].id).toBe('product-ref');
    expect(read.mock.calls[0][0]).toBe('products');
  });
  it('searches permitted read-only names and system codes without making them writable',async () => {
    const read = vi.fn(async () => [{ id: 'customer-ref',full_name: 'مشتری' }]);
    const runtime = createAiRecordLookupRuntime({ moduleIds: ['invoices'],orgId: 'org',read,
      loadSchema: async moduleId => moduleId === 'invoices' ? { fields: [{ key: 'customer',type: 'relation',relationTargetModule: 'customers' }] }
        : { fields: [],lookupFields: [{ key: 'full_name' },{ key: 'system_code' }] },
      tableForModule: id => id,canReadModule: () => true });
    expect((await runtime.execute('lookup_record_field',{ moduleId: 'invoices',field: 'customer',query: 'مشتری' })).records).toHaveLength(1);
    expect(read.mock.calls[0][1].or).toContain('full_name.ilike');
    expect(read.mock.calls[0][1].or).toContain('system_code.ilike');
  });
});
