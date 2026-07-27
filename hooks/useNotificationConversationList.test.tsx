import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNotificationConversationList } from './useNotificationConversationList';

describe('useNotificationConversationList', () => {
  it('گفتگوهای داخلی فقط از RPC یکپارچه دریافت می‌شوند', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: [{ conversation_key: 'system', latest_message_at: '2026-07-17T08:00:00.000Z' }], error: null }),
    } as any;
    const primaryItem = {
      conversation_key: 'system',
      latest_message_at: '2026-07-17T08:00:00.000Z',
    };

    const fallbackLoadInitial = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() => useNotificationConversationList({
      supabase,
      section: 'notes',
      enabled: true,
      cacheScopeKey: 'progressive-test',
      fallbackLoadInitial,
      mergeFallbackInitial: true,
    }));

    await waitFor(() => expect(result.current.items).toEqual([primaryItem]));
    expect(result.current.loading).toBe(false);
    expect(fallbackLoadInitial).not.toHaveBeenCalled();
  });
});
