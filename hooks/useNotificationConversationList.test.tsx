import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNotificationConversationList } from './useNotificationConversationList';

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

describe('useNotificationConversationList', () => {
  it('نمایش نتیجه اصلی را منتظر fallback سازگاری نمی‌گذارد', async () => {
    const rpcRequest = createDeferred<{ data: any[]; error: null }>();
    const fallbackRequest = createDeferred<any[]>();
    const supabase = {
      rpc: vi.fn(() => rpcRequest.promise),
    } as any;
    const primaryItem = {
      conversation_key: 'system',
      latest_message_at: '2026-07-17T08:00:00.000Z',
    };

    const { result } = renderHook(() => useNotificationConversationList({
      supabase,
      section: 'notes',
      enabled: true,
      cacheScopeKey: 'progressive-test',
      fallbackLoadInitial: () => fallbackRequest.promise,
      mergeFallbackInitial: true,
    }));

    await act(async () => {
      rpcRequest.resolve({ data: [primaryItem], error: null });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.items).toEqual([primaryItem]));
    expect(result.current.loading).toBe(true);

    await act(async () => {
      fallbackRequest.resolve([]);
      await fallbackRequest.promise;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
