import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useInternalConversationTimeline } from './useInternalConversationTimeline';

describe('viewer-scoped internal timeline', () => {
  it('clears old system messages immediately and ignores a late response from the previous viewer', async () => {
    let resolveOld!: (value: any) => void;
    let resolveNew!: (value: any) => void;
    const rpc = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
    const supabase = { rpc } as unknown as SupabaseClient;
    const { result, rerender } = renderHook(({ scope }) => useInternalConversationTimeline<any>({ supabase, enabled: true, conversationKey: 'system', cacheScopeKey: scope }), { initialProps: { scope: 'scope-old-viewer' } });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    rerender({ scope: 'scope-new-viewer' });
    expect(result.current.items).toEqual([]);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    await act(async () => resolveNew({ data: { items: [{ id: 'new-private-message' }] }, error: null }));
    await waitFor(() => expect(result.current.items[0]?.id).toBe('new-private-message'));
    await act(async () => resolveOld({ data: { items: [{ id: 'other-users-private-message' }] }, error: null }));
    expect(result.current.items.map((item) => item.id)).toEqual(['new-private-message']);
  });

  it('removes previously visible system messages when a fresh authorized response is empty', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { items: [{ id: 'revoked-message' }] }, error: null })
      .mockResolvedValue({ data: { items: [] }, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const { result } = renderHook(() => useInternalConversationTimeline<any>({ supabase, enabled: true, conversationKey: 'system', cacheScopeKey: 'scope-revocation' }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => { await result.current.refresh({ force: true }); });
    expect(result.current.items).toEqual([]);
  });
});
