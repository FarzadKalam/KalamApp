import { describe, expect, it, vi } from 'vitest';
import { createTrackedDemoClient, prepareDemoRows, resolveDemoPack } from '../supabase/functions/demo-data-admin/_shared/demo-seed-runtime';

describe('tracked demo writes', () => {
  it('removes routable telephone contacts and requests a fresh system code without mutating input', () => {
    const source = { name: 'نمونه', system_code: 'INV-001', mobile_1: '09120000000', notify_supplier: true };
    expect(prepareDemoRows(source)).toEqual([{ name: 'نمونه', mobile_1: null, notify_supplier: false }]);
    expect(source.notify_supplier).toBe(true);
  });
  it('returns only the general pack for unconfigured industries', () => {
    expect(resolveDemoPack('new industry').key).toBe('general_v2');
    expect(resolveDemoPack(null).key).toBe('general_v2');
  });
  it('routes root writes through one atomic database call and propagates failure', async () => {
    const rpc=vi.fn().mockResolvedValueOnce({ data: [{id:'sample'}], error:null }).mockResolvedValueOnce({data:null,error:{message:'failed'}});
    const from=vi.fn().mockReturnValue({});
    const client=createTrackedDemoClient({rpc,from},'batch');
    const query=client.from('customers').insert({name:'نمونه'}).select('id').single();
    expect((await query).data).toEqual({id:'sample'});
    await query;
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('insert_demo_seed_rows');
    expect((await client.from('customers').insert({name:'نمونه'}).select('id')).error.message).toBe('failed');
  });
});
