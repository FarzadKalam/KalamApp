import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sessionCache', () => ({
  fetchSessionBootstrap: vi.fn(async () => ({ orgId: 'org-a' })),
}));

vi.mock('./referenceData', () => ({
  fetchAssigneeDirectory: vi.fn(async () => ({ users: [], roles: [] })),
}));

import { fetchSessionBootstrap } from './sessionCache';
import {
  buildUnavailableIdentityOption,
  clearIdentityDirectoryCache,
  normalizeIdentityTokens,
  parseIdentityToken,
  searchIdentityOptions,
  sortIdentityOptions,
  type IdentityOption,
} from './identityDirectory';

const createClient = (rpc: ReturnType<typeof vi.fn>) => {
  const channelApi: any = {
    on: vi.fn(() => channelApi),
    subscribe: vi.fn(() => channelApi),
  };
  return {
    rpc,
    channel: vi.fn(() => channelApi),
    removeChannel: vi.fn(),
  };
};

describe('identity directory contract', () => {
  beforeEach(() => {
    clearIdentityDirectoryCache();
    vi.clearAllMocks();
    vi.mocked(fetchSessionBootstrap).mockResolvedValue({ orgId: 'org-a' } as any);
  });

  it('canonicalizes colon, underscore, nested legacy and contextual raw values', () => {
    expect(parseIdentityToken('user:123').token).toBe('user:123');
    expect(parseIdentityToken('role_456').token).toBe('role:456');
    expect(parseIdentityToken('role:role:789').token).toBe('role:789');
    expect(parseIdentityToken('raw-id', 'chat_group').token).toBe('chat_group:raw-id');
    expect(normalizeIdentityTokens(['user_1', 'user:1', 'role_2'])).toEqual(['user:1', 'role:2']);
  });

  it('never exposes the technical identifier for unavailable selections', () => {
    const option = buildUnavailableIdentityOption('user:11111111-1111-4111-8111-111111111111');
    expect(option.label).toBe('کاربر خارج از دسترس');
    expect(`${option.label} ${option.subtitle}`).not.toContain('11111111');
    expect(option.disabled).toBe(true);
  });

  it('sorts users by chart traversal rank and keeps users without a role last', () => {
    const item = (id: string, label: string, hierarchyRank?: number): IdentityOption => ({
      id,
      label,
      hierarchyRank,
      kind: 'user',
      token: `user:${id}`,
      active: true,
    });
    expect(sortIdentityOptions([
      item('orphan', 'آزاد'),
      item('child-b', 'ب', 2),
      item('parent', 'مدیر', 0),
      item('child-a', 'الف', 2),
    ]).map((option) => option.id)).toEqual(['parent', 'child-a', 'child-b', 'orphan']);
  });

  it('deduplicates concurrent requests and scopes cache keys per organization', async () => {
    let resolveRpc: (value: any) => void = () => undefined;
    let rpcCall = 0;
    const rpc = vi.fn(() => {
      rpcCall += 1;
      if (rpcCall > 1) return Promise.resolve({ data: [], error: null });
      return new Promise((resolve) => { resolveRpc = resolve; });
    });
    const client = createClient(rpc);
    const first = searchIdentityOptions(client, { scopes: ['user'], query: 'علی' });
    const duplicate = searchIdentityOptions(client, { scopes: ['user'], query: 'علی' });
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledTimes(1);
    resolveRpc({ data: [], error: null });
    await expect(Promise.all([first, duplicate])).resolves.toHaveLength(2);

    await searchIdentityOptions(client, { scopes: ['user'], query: 'علی' });
    expect(rpc).toHaveBeenCalledTimes(1);
    vi.mocked(fetchSessionBootstrap).mockResolvedValue({ orgId: 'org-b' } as any);
    await searchIdentityOptions(client, { scopes: ['user'], query: 'علی' });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('passes bounded server-side search, pagination and selected hydration to the RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        kind: 'user', id: 'u1', token: 'user:u1', label: 'کاربر غیرفعال',
        is_active: false, hierarchy_rank: 10, total_count: 1,
      }],
      error: null,
    }));
    const client = createClient(rpc);
    const result = await searchIdentityOptions(client, {
      scopes: ['user'], query: 'کاربر', limitPerScope: 500, offset: 50, exactTokens: ['user_u1'],
    });
    expect(rpc).toHaveBeenCalledWith('search_org_identity_options', expect.objectContaining({
      p_query: 'کاربر', p_limit_per_scope: 100, p_offset: 50, p_exact_tokens: ['user:u1'],
    }));
    expect(result.items[0]).toMatchObject({ token: 'user:u1', active: false, disabled: true });
  });
});
