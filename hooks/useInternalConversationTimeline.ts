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

type UseInternalConversationTimelineOptions<TItem> = {
  supabase: SupabaseClient<any, 'public', any>;
  enabled: boolean;
  conversationKey: string | null;
  pageSize?: number;
  fallbackLoadInitial?: LegacyLoader<TItem>;
};

// ---------------------------------------------------------------------------
// Module-level cache — persists across mount/unmount cycles.
// When the user switches between internal conversations and returns to one
// they already opened, the timeline renders instantly from cache while a
// background fetch brings in any new messages.
// ---------------------------------------------------------------------------
type TimelineCacheEntry<TItem> = {
  payload: NotificationTimelinePayload<TItem>;
  fetchedAt: number;
};
const _internalTimelineCache = new Map<string, TimelineCacheEntry<any>>();
const TIMELINE_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

const readCache = <TItem>(key: string): NotificationTimelinePayload<TItem> | null => {
  const entry = _internalTimelineCache.get(key);
  if (entry && Date.now() - entry.fetchedAt < TIMELINE_CACHE_TTL_MS)
    return entry.payload as NotificationTimelinePayload<TItem>;
  return null;
};

const sortByDate = <T>(items: T[]): T[] =>
  items.slice().sort((a: any, b: any) => compareIsoAsc(a?.created_at, b?.created_at));

// ---------------------------------------------------------------------------

export const useInternalConversationTimeline = <TItem,>({
  supabase,
  enabled,
  conversationKey,
  pageSize = 10,
  fallbackLoadInitial,
}: UseInternalConversationTimelineOptions<TItem>) => {
  const [items, setItemsState] = useState<TItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialAnchorId, setInitialAnchorId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [available, setAvailable] = useState(true);
  const itemsRef = useRef<TItem[]>([]);

  // True when the current view was already populated from cache.
  // refresh() uses this to skip the loading skeleton for the background fetch.
  const cacheAppliedRef = useRef(false);

  // Recovery: when enabled cycles false→true, reset available so RPC is retried
  useEffect(() => {
    if (enabled) setAvailable(true);
  }, [enabled]);

  const applyPayload = useCallback((
    payload: NotificationTimelinePayload<TItem>,
    options?: { preserveExistingItemsOnEmpty?: boolean; mergeWithExisting?: boolean },
  ) => {
    let nextItems = sortByDate(payload.items || []);
    if (options?.preserveExistingItemsOnEmpty && nextItems.length === 0 && itemsRef.current.length > 0) {
      return false;
    }
    if (options?.mergeWithExisting && itemsRef.current.length > 0 && nextItems.length > 0) {
      const merged = [...itemsRef.current, ...nextItems];
      const unique = new Map<string, TItem>();
      merged.forEach((item: any) => {
        const key = String(item?.id || '').trim();
        if (key) unique.set(key, item);
      });
      nextItems = sortByDate(Array.from(unique.values()));
    }
    itemsRef.current = nextItems;
    setItemsState(nextItems);
    setHasMore(Boolean(payload.has_more_before));
    setCursor(payload.next_before_cursor || null);
    setInitialAnchorId(payload.first_unread_id || null);
    setUnreadCount(Number(payload.unread_count || 0));
    return true;
  }, []);

  // Track the last key that triggered loading so we can detect key changes
  // synchronously (useLayoutEffect fires before the browser paints).
  const loadingInitialKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!enabled || !conversationKey) {
      loadingInitialKeyRef.current = null;
      return;
    }
    if (loadingInitialKeyRef.current === conversationKey) return;
    loadingInitialKeyRef.current = conversationKey;

    // Cache hit → render instantly, background refresh will run without skeleton
    const cached = readCache<TItem>(conversationKey);
    if (cached) {
      applyPayload(cached);
      cacheAppliedRef.current = true;
      setLoadingInitial(false);
    } else {
      cacheAppliedRef.current = false;
      itemsRef.current = [];
      setItemsState([]);
      setHasMore(false);
      setCursor(null);
      setInitialAnchorId(null);
      setUnreadCount(0);
      setLoadingInitial(true);
    }
  }, [enabled, conversationKey, applyPayload]);

  const loadFallbackInitial = useCallback(async (options?: { preserveExistingItemsOnEmpty?: boolean }) => {
    if (!fallbackLoadInitial) {
      applyPayload(EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>, options);
      return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
    }
    const fallbackItems = await fallbackLoadInitial();
    const payload = {
      ...EMPTY_TIMELINE_PAYLOAD,
      items: sortByDate(fallbackItems || []),
    } as NotificationTimelinePayload<TItem>;
    applyPayload(payload, options);
    return payload;
  }, [applyPayload, fallbackLoadInitial]);

  const refresh = useCallback(async () => {
    if (!enabled || !conversationKey) {
      applyPayload(EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>);
      return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
    }

    // Cache was already applied synchronously — skip skeleton, fetch silently
    if (!cacheAppliedRef.current) {
      setLoadingInitial(true);
    }

    try {
      if (!available) {
        return await loadFallbackInitial({ preserveExistingItemsOnEmpty: true });
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
          return await loadFallbackInitial({ preserveExistingItemsOnEmpty: true });
        }
        throw error;
      }
      const payload = normalizeTimelinePayload<TItem>(data);
      if ((payload.items || []).length === 0 && fallbackLoadInitial) {
        const fallbackPayload = await loadFallbackInitial({ preserveExistingItemsOnEmpty: true });
        if ((fallbackPayload.items || []).length > 0) {
          _internalTimelineCache.set(conversationKey, { payload: fallbackPayload, fetchedAt: Date.now() });
          return fallbackPayload;
        }
      }
      const applied = applyPayload(payload, { preserveExistingItemsOnEmpty: true, mergeWithExisting: true });
      if (applied) {
        _internalTimelineCache.set(conversationKey, { payload: { ...payload, items: itemsRef.current }, fetchedAt: Date.now() });
      }
      return payload;
    } finally {
      setLoadingInitial(false);
      cacheAppliedRef.current = false;
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
      setItemsState((prev) => {
        const merged = [...(payload.items || []), ...prev];
        const unique = new Map<string, TItem>();
        merged.forEach((item: any) => {
          const key = String(item?.id || '');
          if (key) unique.set(key, item);
        });
        const next = sortByDate(Array.from(unique.values()));
        itemsRef.current = next;
        // Persist the expanded history into cache
        const existing = _internalTimelineCache.get(conversationKey);
        if (existing) {
          _internalTimelineCache.set(conversationKey, {
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
  }, [available, conversationKey, cursor, enabled, loadingOlder, pageSize, supabase]);

  useEffect(() => {
    if (!enabled || !conversationKey) {
      applyPayload(EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>);
      return;
    }
    void refresh();
  }, [applyPayload, conversationKey, enabled, refresh]);

  // Wrapped setItems: keeps cache in sync when realtime messages are pushed in
  // from outside (NotificationsPopover realtime handlers).
  const setItems = useCallback(
    (updater: TItem[] | ((prev: TItem[]) => TItem[])) => {
      setItemsState((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (p: TItem[]) => TItem[])(prev)
            : updater;
        itemsRef.current = next;
        if (conversationKey) {
          const existing = _internalTimelineCache.get(conversationKey);
          if (existing) {
            _internalTimelineCache.set(conversationKey, {
              ...existing,
              payload: { ...existing.payload, items: next },
              fetchedAt: Date.now(),
            });
          }
        }
        return next;
      });
    },
    [conversationKey],
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
