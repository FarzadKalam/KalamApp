import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: {}, supabasePublic: { rpc: mocks.rpc } }));
vi.mock('../utils/sessionCache', () => ({ fetchSessionBootstrap: vi.fn() }));
vi.mock('../utils/appRuntimeCache', () => ({ getAppRuntimeCached: ({ loader }: any) => loader() }));
import { useContextualTutorials } from './useContextualTutorials';

beforeEach(() => { localStorage.clear();mocks.rpc.mockReset(); });

describe('contextual tutorial unread state', () => {
  it('marks only the opened article and isolates the organization', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: 'one', title: 'آموزش اول' }, { id: 'two', title: 'آموزش دوم' }], error: null });
    const { result, rerender } = renderHook(({ orgId }) => useContextualTutorials(['dashboard'], { orgId, userId: 'viewer' }), { initialProps: { orgId: 'first' } });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    act(() => result.current.markSeen('one'));
    expect(result.current.unreadCount).toBe(1);
    rerender({ orgId: 'second' });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    rerender({ orgId: 'first' });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    expect(mocks.rpc).toHaveBeenCalledWith('get_cms_contextual_tutorial_posts', { p_contexts: ['dashboard'], p_limit: 100 });
  });

  it('fails closed without a viewer and surfaces request failures', async () => {
    const denied = renderHook(() => useContextualTutorials(['dashboard'], { orgId: null, userId: 'viewer' }));
    await waitFor(() => expect(denied.result.current.loading).toBe(false));
    expect(mocks.rpc).not.toHaveBeenCalled();
    denied.unmount();
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('unavailable') });
    const { result } = renderHook(() => useContextualTutorials(['dashboard'], { orgId: 'first', userId: 'viewer' }));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.items).toEqual([]);
  });
});
