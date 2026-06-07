import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBotConversationTimeline } from './useBotConversationTimeline';
import { useInternalConversationTimeline } from './useInternalConversationTimeline';

const timelinePayload = (items: Array<{ id: string; created_at: string }>) => ({
  items,
  unread_count: 0,
  first_unread_id: null,
  has_more_before: false,
  next_before_cursor: null,
  read_model: 'cursor',
});

describe('communication timeline fast path', () => {
  it('uses the unified internal RPC and does not fall back for a valid empty response', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: timelinePayload([]), error: null });
    const supabase = { rpc } as any;
    const fallbackLoadInitial = vi.fn().mockResolvedValue([{ id: 'legacy' }]);

    renderHook(() => useInternalConversationTimeline({
      supabase,
      enabled: true,
      conversationKey: 'direct:user-a:user-b',
      cacheScopeKey: 'empty-fast-path',
      fallbackLoadInitial,
    }));

    await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith('get_communication_timeline', expect.any(Object));
    expect(fallbackLoadInitial).not.toHaveBeenCalled();
  });

  it('does not treat a schema error as a missing unified RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42703', message: 'column reader_profile.display_name does not exist' },
    });
    const supabase = { rpc } as any;
    const fallbackLoadInitial = vi.fn().mockResolvedValue([{ id: 'legacy' }]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      renderHook(() => useInternalConversationTimeline({
        supabase,
        enabled: true,
        conversationKey: 'direct:user-schema-a:user-schema-b',
        cacheScopeKey: 'schema-error-no-fallback',
        fallbackLoadInitial,
      }));

      await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
      expect(fallbackLoadInitial).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('ignores a late internal response after switching conversations', async () => {
    let resolveFirst: ((value: any) => void) | null = null;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const rpc = vi.fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce({
        data: timelinePayload([{ id: 'new-message', created_at: '2026-06-06T10:01:00.000Z' }]),
        error: null,
      });
    const supabase = { rpc } as any;

    const { result, rerender } = renderHook(
      ({ conversationKey }) => useInternalConversationTimeline({
        supabase,
        enabled: true,
        conversationKey,
        cacheScopeKey: 'rapid-switch',
      }),
      { initialProps: { conversationKey: 'direct:user-a:user-b' } },
    );

    rerender({ conversationKey: 'direct:user-a:user-c' });
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(['new-message']));

    await act(async () => {
      resolveFirst?.({
        data: timelinePayload([{ id: 'old-message', created_at: '2026-06-06T10:00:00.000Z' }]),
        error: null,
      });
      await firstResponse;
    });

    expect(result.current.items.map((item) => item.id)).toEqual(['new-message']);
  });

  it('uses the unified bot RPC without invoking the legacy loader', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: timelinePayload([]), error: null });
    const supabase = { rpc } as any;
    const fallbackLoadInitial = vi.fn().mockResolvedValue([{ id: 'legacy' }]);

    renderHook(() => useBotConversationTimeline({
      supabase,
      enabled: true,
      botGroupId: 'bot-group-a',
      cacheScopeKey: 'bot-fast-path',
      fallbackLoadInitial,
    }));

    await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith('get_communication_timeline', {
      p_channel: 'bot',
      p_conversation_key: 'bot:bot-group-a',
      p_before_cursor: null,
      p_limit: 10,
    });
    expect(fallbackLoadInitial).not.toHaveBeenCalled();
  });
});
