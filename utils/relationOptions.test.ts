import { describe, expect, it, vi } from 'vitest';

vi.mock('./sessionCache', () => ({
  fetchSessionBootstrap: vi.fn(async () => ({ orgId: 'org-1' })),
}));

import { fetchRelationOptionsForField } from './relationOptions';

const createQuery = (rows: any[]) => {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    or: vi.fn(() => query),
    then: (resolve: (value: any) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return query;
};

describe('fetchRelationOptionsForField', () => {
  it('uses the local query path for modules with incompatible legacy RPC projections', async () => {
    const query = createQuery([{
      id: '10000000-0000-4000-8000-000000000001',
      name: 'محصول تست',
      system_code: 'P-1',
      status: 'active',
    }]);
    const supabase = {
      rpc: vi.fn(),
      from: vi.fn(() => query),
    };

    const options = await fetchRelationOptionsForField(
      supabase,
      { relationConfig: { targetModule: 'products', targetField: 'name' } },
      { exactId: '10000000-0000-4000-8000-000000000001', limit: 1 },
    );

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(options[0]).toMatchObject({
      value: '10000000-0000-4000-8000-000000000001',
      label: expect.stringContaining('محصول تست'),
    });
  });

  it('falls back to a direct query when the RPC reports a missing column', async () => {
    const query = createQuery([{
      id: '20000000-0000-4000-8000-000000000002',
      full_name: 'کاربر تست',
      email: 'user@example.com',
    }]);
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: '42703', message: 'column p.title does not exist' },
      })),
      from: vi.fn(() => query),
    };

    const options = await fetchRelationOptionsForField(
      supabase,
      { relationConfig: { targetModule: 'profiles', targetField: 'full_name' } },
      { exactId: '20000000-0000-4000-8000-000000000002', limit: 1 },
    );

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(options[0]).toMatchObject({
      value: '20000000-0000-4000-8000-000000000002',
      label: 'کاربر تست',
    });
  });

  it('falls back to a direct query when the RPC rejects an invalid uuid input', async () => {
    const query = createQuery([{
      id: '30000000-0000-4000-8000-000000000003',
      full_name: 'کاربر دوم',
      email: 'second@example.com',
    }]);
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: '22P02', message: 'invalid input syntax for type uuid' },
      })),
      from: vi.fn(() => query),
    };

    const options = await fetchRelationOptionsForField(
      supabase,
      { relationConfig: { targetModule: 'profiles', targetField: 'full_name' } },
      { search: 'کاربر', limit: 1 },
    );

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(options[0]).toMatchObject({
      value: '30000000-0000-4000-8000-000000000003',
      label: 'کاربر دوم',
    });
  });
});
