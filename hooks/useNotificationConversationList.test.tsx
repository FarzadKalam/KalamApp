import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNotificationConversationList } from './useNotificationConversationList';

describe('useNotificationConversationList', () => {
  it('rejects a late conversation summary belonging to the previous viewer', async () => {
    let resolveOld!: (value: any) => void;
    const supabase = { rpc: vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValue({ data: [{ conversation_key: 'system', title: 'پیام کاربر جدید' }], error: null }) } as any;
    const { result, rerender } = renderHook(({ scope }) => useNotificationConversationList({ supabase, section: 'notes', enabled: true, cacheScopeKey: scope }), { initialProps: { scope: 'summary-old-viewer' } });
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));
    rerender({ scope: 'summary-new-viewer' });
    await waitFor(() => expect(result.current.items?.[0].title).toBe('پیام کاربر جدید'));
    await act(async () => resolveOld({ data: [{ conversation_key: 'system', title: 'پیام خصوصی کاربر قبلی' }], error: null }));
    expect(result.current.items?.[0].title).toBe('پیام کاربر جدید');
  });
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
