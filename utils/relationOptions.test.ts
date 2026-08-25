import { describe, expect, it, vi } from 'vitest';

vi.mock('./sessionCache', () => ({
  fetchSessionBootstrap: vi.fn(async () => ({ orgId: 'org-1' })),
}));

import { fetchRelationOptionsForField, resolveRelationFilterFieldRefs } from './relationOptions';

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
  it('resolves field references in relation filters without exposing unscoped options', async () => {
    expect(resolveRelationFilterFieldRefs(
      { campaign_id: { $field: 'advertising_campaign_id' }, enabled: true },
      { advertising_campaign_id: 'campaign-1' },
    )).toEqual({
      filter: { campaign_id: 'campaign-1', enabled: true },
      unresolved: false,
    });

    expect(resolveRelationFilterFieldRefs(
      { campaign_id: { $field: 'advertising_campaign_id' } },
      {},
    )).toEqual({
      filter: { campaign_id: undefined },
      unresolved: true,
    });
  });

  it('does not query a dependent relation until its filter source has a value', async () => {
    const supabase = {
      rpc: vi.fn(),
      from: vi.fn(),
    };

    const options = await fetchRelationOptionsForField(
      supabase,
      {
        relationConfig: {
          targetModule: 'advertising_campaign_tools',
          targetField: 'title',
          filter: { campaign_id: { $field: 'advertising_campaign_id' } },
        },
      },
      { allValues: {} },
    );

    expect(options).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

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
      { relationConfig: { targetModule: 'customers', targetField: 'full_name' } },
      { exactId: '20000000-0000-4000-8000-000000000002', limit: 1 },
    );

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(options[0]).toMatchObject({
      value: '20000000-0000-4000-8000-000000000002',
      label: 'کاربر تست',
    });
  });

  it('does not request virtual bot group fields in a customer relation fallback', async () => {
    const query = createQuery([{
      id: '21000000-0000-4000-8000-000000000002',
      full_name: 'مشتری تست',
    }]);
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: 'PGRST204', message: 'schema cache is stale' },
      })),
      from: vi.fn(() => query),
    };

    await fetchRelationOptionsForField(
      supabase,
      { relationConfig: { targetModule: 'customers', targetField: 'full_name' } },
      { exactId: '21000000-0000-4000-8000-000000000002', limit: 1 },
    );

    const requestedProjection = String(query.select.mock.calls[0]?.[0] || '');
    expect(requestedProjection).not.toContain('telegram_group_title');
    expect(requestedProjection).not.toContain('bale_group_title');
    expect(requestedProjection).not.toContain('rubika_group_title');
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
      { relationConfig: { targetModule: 'customers', targetField: 'full_name' } },
      { search: 'کاربر', limit: 1 },
    );

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(options[0]).toMatchObject({
      value: '30000000-0000-4000-8000-000000000003',
      label: 'کاربر دوم',
    });
  });
});
