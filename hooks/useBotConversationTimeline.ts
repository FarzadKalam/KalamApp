import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  compareIsoAsc,
  EMPTY_TIMELINE_PAYLOAD,
  isMissingRpcError,
  normalizeTimelinePayload,
  type NotificationTimelinePayload,
} from '../utils/notificationConversationRpc';

type LegacyLoader<TItem> = () => Promise<TItem[]>;

type UseBotConversationTimelineOptions<TItem> = {
  supabase: SupabaseClient<any, 'public', any>;
  enabled: boolean;
  botGroupId: string | null;
  pageSize?: number;
  fallbackLoadInitial?: LegacyLoader<TItem>;
};

// ---------------------------------------------------------------------------
// Module-level cache — persists across mount/unmount cycles.
// When the user switches between bot conversations and returns to one they
// already opened, the timeline renders instantly from cache while a
// background fetch brings in any new messages.
// ---------------------------------------------------------------------------
type TimelineCacheEntry<TItem> = {
  payload: NotificationTimelinePayload<TItem>;
  fetchedAt: number;
};
const _botTimelineCache = new Map<string, TimelineCacheEntry<any>>();
const TIMELINE_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

const readCache = <TItem>(key: string): NotificationTimelinePayload<TItem> | null => {
  const entry = _botTimelineCache.get(key);
  if (entry && Date.now() - entry.fetchedAt < TIMELINE_CACHE_TTL_MS)
    return entry.payload as NotificationTimelinePayload<TItem>;
  return null;
};

const sortByDate = <T>(items: T[]): T[] =>
  items.slice().sort((a: any, b: any) => compareIsoAsc(a?.created_at, b?.created_at));

// ---------------------------------------------------------------------------

export const useBotConversationTimeline = <TItem,>({
  supabase,
  enabled,
  botGroupId,
  pageSize = 10,
  fallbackLoadInitial,
}: UseBotConversationTimelineOptions<TItem>) => {
  const [items, setItemsState] = useState<TItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialAnchorId, setInitialAnchorId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [available, setAvailable] = useState(true);

  // True when the current view was already populated from cache.
  // refresh() uses this to skip the loading skeleton for the background fetch.
  const cacheAppliedRef = useRef(false);

  // Recovery: when enabled cycles false→true, reset available so RPC is retried
  useEffect(() => {
    if (enabled) setAvailable(true);
  }, [enabled]);

  const applyPayload = useCallback((payload: NotificationTimelinePayload<TItem>) => {
    setItemsState(sortByDate(payload.items || []));
    setHasMore(Boolean(payload.has_more_before));
    setCursor(payload.next_before_cursor || null);
    setInitialAnchorId(payload.first_unread_id || null);
    setUnreadCount(Number(payload.unread_count || 0));
  }, []);

  // Track the last key that triggered loading so we can detect key changes
  // synchronously (useLayoutEffect fires before the browser paints).
  const loadingInitialKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!enabled || !botGroupId) {
      loadingInitialKeyRef.current = null;
      return;
    }
    if (loadingInitialKeyRef.current === botGroupId) return;
    loadingInitialKeyRef.current = botGroupId;

    // Cache hit → render instantly, background refresh will run without skeleton
    const cached = readCache<TItem>(botGroupId);
    if (cached) {
      applyPayload(cached);
      cacheAppliedRef.current = true;
      setLoadingInitial(false);
    } else {
      cacheAppliedRef.current = false;
      setLoadingInitial(true);
    }
  }, [enabled, botGroupId, applyPayload]);

  const loadFallbackInitial = useCallback(async () => {
    if (!fallbackLoadInitial) {
      applyPayload(EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>);
      return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
    }
    const fallbackItems = await fallbackLoadInitial();
    const payload = {
      ...EMPTY_TIMELINE_PAYLOAD,
      items: sortByDate(fallbackItems || []),
    } as NotificationTimelinePayload<TItem>;
    applyPayload(payload);
    return payload;
  }, [applyPayload, fallbackLoadInitial]);

  const refresh = useCallback(async () => {
    if (!enabled || !botGroupId) {
      applyPayload(EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>);
      return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
    }

    // Cache was already applied synchronously — skip skeleton, fetch silently
    if (!cacheAppliedRef.current) {
      setLoadingInitial(true);
    }

    try {
      if (!available) {
        return await loadFallbackInitial();
      }

      const { data, error } = await supabase.rpc('get_bot_conversation_timeline', {
        p_bot_group_id: botGroupId,
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
      _botTimelineCache.set(botGroupId, { payload, fetchedAt: Date.now() });
      return payload;
    } finally {
      setLoadingInitial(false);
      cacheAppliedRef.current = false;
    }
  }, [applyPayload, available, botGroupId, enabled, loadFallbackInitial, pageSize, supabase]);

  const loadOlder = useCallback(async () => {
    if (!enabled || !botGroupId || !cursor || !available || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const { data, error } = await supabase.rpc('get_bot_conversation_timeline', {
        p_bot_group_id: botGroupId,
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
      setItemsState((prev) => {
        const merged = [...(payload.items || []), ...prev];
        const unique = new Map<string, TItem>();
        merged.forEach((item: any) => {
          const key = String(item?.id || '');
          if (key) unique.set(key, item);
        });
        const next = sortByDate(Array.from(unique.values()));
        // Persist the expanded history into cache
        const existing = _botTimelineCache.get(botGroupId);
        if (existing) {
          _botTimelineCache.set(botGroupId, {
            ...existing,
            payload: {
              ...existing.payload,
              items: next,
              has_more_before: Boolean(payload.has_more_before),
              next_before_cursor: payload.next_before_cursor || null,
            },
          });
        }
        return next;
      });
      setHasMore(Boolean(payload.has_more_before));
      setCursor(payload.next_before_cursor || null);
    } finally {
      setLoadingOlder(false);
    }
  }, [available, botGroupId, cursor, enabled, loadingOlder, pageSize, supabase]);

  useEffect(() => {
    if (!enabled || !botGroupId) {
      applyPayload(EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>);
      return;
    }
    void refresh();
  }, [applyPayload, botGroupId, enabled, refresh]);

  // Wrapped setItems: keeps cache in sync when realtime messages are pushed in
  // from outside (NotificationsPopover realtime handlers).
  const setItems = useCallback(
    (updater: TItem[] | ((prev: TItem[]) => TItem[])) => {
      setItemsState((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (p: TItem[]) => TItem[])(prev)
            : updater;
        if (botGroupId) {
          const existing = _botTimelineCache.get(botGroupId);
          if (existing) {
            _botTimelineCache.set(botGroupId, {
              ...existing,
              payload: { ...existing.payload, items: next },
              fetchedAt: Date.now(),
            });
          }
        }
        return next;
      });
    },
    [botGroupId],
  );

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
