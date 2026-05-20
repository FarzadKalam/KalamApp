import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  compareIsoAsc,
  EMPTY_TIMELINE_PAYLOAD,
  isMissingRpcError,
  normalizeTimelinePayload,
  type NotificationTimelinePayload,
} from '../utils/notificationConversationRpc';

type LegacyLoader<TItem> = () => Promise<TItem[]>;

type UseInternalConversationTimelineOptions<TItem> = {
  supabase: SupabaseClient<any, 'public', any>;
  enabled: boolean;
  conversationKey: string | null;
  pageSize?: number;
  fallbackLoadInitial?: LegacyLoader<TItem>;
};

export const useInternalConversationTimeline = <TItem,>({
  supabase,
  enabled,
  conversationKey,
  pageSize = 10,
  fallbackLoadInitial,
}: UseInternalConversationTimelineOptions<TItem>) => {
  const [items, setItems] = useState<TItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialAnchorId, setInitialAnchorId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [available, setAvailable] = useState(true);

  const applyPayload = useCallback((payload: NotificationTimelinePayload<TItem>) => {
    setItems((payload.items || []).slice().sort((a: any, b: any) => compareIsoAsc(a?.created_at, b?.created_at)));
    setHasMore(Boolean(payload.has_more_before));
    setCursor(payload.next_before_cursor || null);
    setInitialAnchorId(payload.first_unread_id || null);
    setUnreadCount(Number(payload.unread_count || 0));
  }, []);

  const loadFallbackInitial = useCallback(async () => {
    if (!fallbackLoadInitial) {
      applyPayload(EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>);
      return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
    }
    const fallbackItems = await fallbackLoadInitial();
    const payload = {
      ...EMPTY_TIMELINE_PAYLOAD,
      items: (fallbackItems || []).slice().sort((a: any, b: any) => compareIsoAsc(a?.created_at, b?.created_at)),
    } as NotificationTimelinePayload<TItem>;
    applyPayload(payload);
    return payload;
  }, [applyPayload, fallbackLoadInitial]);

  const refresh = useCallback(async () => {
    if (!enabled || !conversationKey) {
      applyPayload(EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>);
      return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
    }

    setLoadingInitial(true);
    try {
      if (!available) {
        return await loadFallbackInitial();
      }

      const { data, error } = await supabase.rpc('get_internal_conversation_timeline', {
        p_conversation_key: conversationKey,
        p_limit: pageSize,
        p_before_cursor: null,
        p_include_unread_window: true,
      });
      if (error) {
        if (isMissingRpcError(error)) {
          setAvailable(false);
          return await loadFallbackInitial();
        }
        throw error;
      }
      const payload = normalizeTimelinePayload<TItem>(data);
      applyPayload(payload);
      return payload;
    } finally {
      setLoadingInitial(false);
    }
  }, [applyPayload, available, conversationKey, enabled, loadFallbackInitial, pageSize, supabase]);

  const loadOlder = useCallback(async () => {
    if (!enabled || !conversationKey || !cursor || !available || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const { data, error } = await supabase.rpc('get_internal_conversation_timeline', {
        p_conversation_key: conversationKey,
        p_limit: pageSize,
        p_before_cursor: cursor,
        p_include_unread_window: false,
      });
      if (error) {
        if (isMissingRpcError(error)) {
          setAvailable(false);
          setHasMore(false);
          return;
        }
        throw error;
      }
      const payload = normalizeTimelinePayload<TItem>(data);
      setItems((prev) => {
        const merged = [...(payload.items || []), ...prev];
        const unique = new Map<string, TItem>();
        merged.forEach((item: any) => {
          const key = String(item?.id || '');
          if (key) unique.set(key, item);
        });
        return Array.from(unique.values()).sort((a: any, b: any) => compareIsoAsc(a?.created_at, b?.created_at));
      });
      setHasMore(Boolean(payload.has_more_before));
      setCursor(payload.next_before_cursor || null);
    } finally {
      setLoadingOlder(false);
    }
  }, [available, conversationKey, cursor, enabled, loadingOlder, pageSize, supabase]);

  useEffect(() => {
    if (!enabled || !conversationKey) {
      applyPayload(EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>);
      return;
    }
    void refresh();
  }, [applyPayload, conversationKey, enabled, refresh]);

  return {
    items,
    setItems,
    loadingInitial,
    loadingOlder,
    hasMore,
    cursor,
    initialAnchorId,
    unreadCount,
    available,
    refresh,
    loadOlder,
  };
};
