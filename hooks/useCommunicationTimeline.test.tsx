import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBotConversationTimeline } from './useBotConversationTimeline';
import { useInternalConversationTimeline } from './useInternalConversationTimeline';
import { useNotificationConversationList } from './useNotificationConversationList';

const timelinePayload = (items: Array<{ id: string; created_at: string }>) => ({
  items,
  unread_count: 0,
  first_unread_id: null,
  has_more_before: false,
  next_before_cursor: null,
  read_model: 'cursor',
});

describe('communication timeline fast path', () => {
  it('uses the dedicated internal timeline RPC for a valid empty response', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: timelinePayload([]), error: null });
    const supabase = { rpc } as any;

    renderHook(() => useInternalConversationTimeline({
      supabase,
      enabled: true,
      conversationKey: 'direct:user-a:user-b',
      cacheScopeKey: 'empty-fast-path',
    }));

    await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith('get_internal_communication_timeline_v3', expect.any(Object));
  });

  it('does not fall back to a legacy internal timeline RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' },
    });
    const supabase = { rpc } as any;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      renderHook(() => useInternalConversationTimeline({
        supabase,
        enabled: true,
        conversationKey: 'direct:user-a:user-b',
        cacheScopeKey: 'no-legacy-internal-rpc',
      }));

      await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
      expect(rpc).toHaveBeenCalledWith('get_internal_communication_timeline_v3', expect.any(Object));
      expect(rpc.mock.calls.some(([name]) => name === 'get_internal_conversation_timeline')).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('does not treat a schema error as a missing unified RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42703', message: 'column reader_profile.display_name does not exist' },
    });
    const supabase = { rpc } as any;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      renderHook(() => useInternalConversationTimeline({
        supabase,
        enabled: true,
        conversationKey: 'direct:user-schema-a:user-schema-b',
        cacheScopeKey: 'schema-error-no-fallback',
      }));

      await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
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

  it('uses the dedicated bot-group timeline RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: timelinePayload([]), error: null });
    const supabase = { rpc } as any;

    renderHook(() => useBotConversationTimeline({
      supabase,
      enabled: true,
      botGroupId: 'bot-group-a',
      cacheScopeKey: 'bot-fast-path',
    }));

    await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith('get_bot_group_timeline_v2', {
      p_bot_group_id: 'bot-group-a',
      p_before_cursor: null,
      p_limit: 10,
    });
  });

  it('keeps internal conversation summaries on the unified RPC source', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        section: 'notes',
        conversation_key: 'direct:user-a:user-b',
        kind: 'direct',
        title: 'کاربر',
        subtitle: null,
        avatar_url: null,
        role_label: null,
        note_count: 10,
        unread_count: 0,
        latest_message_at: '2026-06-28T09:29:36.000Z',
        last_message_preview: 'قدیمی',
        user_id: null,
        group_id: null,
        bot_group_id: null,
        channel_type: null,
        status: null,
        counterparty_label: null,
        bot_chat_id: null,
      }],
      error: null,
    });
    const supabase = { rpc } as any;
    const fallbackLoadInitial = vi.fn().mockResolvedValue([{
      section: 'notes',
      conversation_key: 'direct:user-a:user-b',
      kind: 'direct',
      title: null,
      subtitle: null,
      avatar_url: null,
      role_label: null,
      note_count: 1,
      unread_count: 0,
      latest_message_at: '2026-06-29T09:56:28.000Z',
      last_message_preview: 'تستیییی',
      user_id: 'user-b',
      group_id: null,
      bot_group_id: null,
      channel_type: null,
      status: null,
      counterparty_label: null,
      bot_chat_id: null,
    }]);

    const { result } = renderHook(() => useNotificationConversationList({
      supabase,
      section: 'notes',
      enabled: true,
      cacheScopeKey: 'merge-missed-conversation-summary',
      fallbackLoadInitial,
      mergeFallbackInitial: true,
    }));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith('get_internal_communication_conversations_v3', {
        p_before_cursor: null,
        p_limit: 80,
      });
    });
    await waitFor(() => {
      expect(result.current.items?.[0]?.last_message_preview).toBe('قدیمی');
    });
    expect(fallbackLoadInitial).not.toHaveBeenCalled();
  });
});
