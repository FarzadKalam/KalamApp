import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  compareIsoAsc,
  EMPTY_TIMELINE_PAYLOAD,
  isMissingRpcError,
  normalizeTimelinePayload,
  type NotificationReadModel,
  type NotificationTimelinePayload,
} from '../utils/notificationConversationRpc';
import { preloadAvatarUrls } from '../utils/profileAvatar';

type LegacyLoader<TItem> = () => Promise<TItem[]>;

type UseInternalConversationTimelineOptions<TItem> = {
  supabase: SupabaseClient<any, 'public', any>;
  enabled: boolean;
  conversationKey: string | null;
  pageSize?: number;
  fallbackLoadInitial?: LegacyLoader<TItem>;
  cacheScopeKey?: string | null;
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

const buildCacheKey = (scopeKey: string | null | undefined, conversationKey: string) =>
  `${String(scopeKey || 'default').trim() || 'default'}:${conversationKey}`;

const readCache = <TItem>(cacheKey: string): NotificationTimelinePayload<TItem> | null => {
  const entry = _internalTimelineCache.get(cacheKey);
  if (entry && Date.now() - entry.fetchedAt < TIMELINE_CACHE_TTL_MS)
    return entry.payload as NotificationTimelinePayload<TItem>;
  return null;
};

const sortByDate = <T>(items: T[]): T[] =>
  items.slice().sort((a: any, b: any) => compareIsoAsc(a?.created_at, b?.created_at));

const _internalTimelinePrefetchInFlight = new Set<string>();

export const prefetchInternalConversationTimeline = async <TItem,>({
  supabase,
  conversationKey,
  cacheScopeKey,
  pageSize = 10,
}: {
  supabase: SupabaseClient<any, 'public', any>;
  conversationKey: string | null;
  cacheScopeKey?: string | null;
  pageSize?: number;
}) => {
  const normalizedConversationKey = String(conversationKey || '').trim();
  const cacheKey = buildCacheKey(cacheScopeKey, normalizedConversationKey);
  if (
    !normalizedConversationKey
    || normalizedConversationKey === 'system'
    || readCache<TItem>(cacheKey)
    || _internalTimelinePrefetchInFlight.has(normalizedConversationKey)
  ) return;
  _internalTimelinePrefetchInFlight.add(normalizedConversationKey);
  try {
    const { data, error } = await supabase.rpc('get_communication_timeline', {
      p_channel: 'internal',
      p_conversation_key: normalizedConversationKey,
      p_before_cursor: null,
      p_limit: pageSize,
    });
    if (error) return;
    const payload = normalizeTimelinePayload<TItem>(data);
    _internalTimelineCache.set(cacheKey, {
      payload: { ...payload, items: sortByDate(payload.items || []) },
      fetchedAt: Date.now(),
    });
  } finally {
    _internalTimelinePrefetchInFlight.delete(normalizedConversationKey);
  }
};

// ---------------------------------------------------------------------------

export const useInternalConversationTimeline = <TItem,>({
  supabase,
  enabled,
  conversationKey,
  pageSize = 10,
  fallbackLoadInitial,
  cacheScopeKey,
}: UseInternalConversationTimelineOptions<TItem>) => {
  const [items, setItemsState] = useState<TItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialAnchorId, setInitialAnchorId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [available, setAvailable] = useState(true);
  const [communicationApiAvailable, setCommunicationApiAvailable] = useState(true);
  const [readModel, setReadModel] = useState<NotificationReadModel>('item');
  const itemsRef = useRef<TItem[]>([]);
  const normalizedConversationKey = String(conversationKey || '').trim();
  const timelineCacheKey = normalizedConversationKey ? buildCacheKey(cacheScopeKey, normalizedConversationKey) : '';

  // True when the current view was already populated from cache.
  // refresh() uses this to skip the loading skeleton for the background fetch.
  const cacheAppliedRef = useRef(false);
  // Deduplicate concurrent refresh() calls — only one in-flight at a time.
  const refreshInFlightRef = useRef(false);

  // Recovery: when enabled cycles false→true, reset available so RPC is retried
  useEffect(() => {
    if (enabled) {
      setAvailable(true);
      setCommunicationApiAvailable(true);
    }
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
    setReadModel(payload.read_model);
    // Preload sender avatars so they render from browser cache on re-open
    const senderUrls = nextItems
      .map((item: any) => item?.sender_avatar_url || item?.avatar_url)
      .filter((url): url is string => typeof url === 'string' && Boolean(url));
    preloadAvatarUrls(senderUrls, 'avatar');
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
    // Conversation changed — any in-flight request was for the old key, release the guard.
    refreshInFlightRef.current = false;

    // Cache hit → render instantly, background refresh will run without skeleton
    const cached = readCache<TItem>(timelineCacheKey);
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
  }, [enabled, conversationKey, timelineCacheKey, applyPayload]);

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

  const fetchTimelinePage = useCallback(async (beforeCursor: string | null) => {
    if (conversationKey !== 'system' && communicationApiAvailable) {
      const { data, error } = await supabase.rpc('get_communication_timeline', {
        p_channel: 'internal',
        p_conversation_key: conversationKey,
        p_before_cursor: beforeCursor,
        p_limit: pageSize,
      });
      if (!error) {
        return normalizeTimelinePayload<TItem>(data);
      }
      if (!isMissingRpcError(error)) {
        throw error;
      }
      setCommunicationApiAvailable(false);
    }

    const { data, error } = await supabase.rpc('get_internal_conversation_timeline', {
      p_conversation_key: conversationKey,
      p_limit: pageSize,
      p_before_cursor: beforeCursor,
      // Avoid the legacy unread-window path, which can return the entire backlog.
      p_include_unread_window: false,
    });
    if (error) {
      if (isMissingRpcError(error)) {
        setAvailable(false);
        return null;
      }
      throw error;
    }
    return normalizeTimelinePayload<TItem>(data);
  }, [communicationApiAvailable, conversationKey, pageSize, supabase]);

  const refresh = useCallback(async () => {
    if (!enabled || !conversationKey) {
      applyPayload(EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>);
      return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
    }

    if (refreshInFlightRef.current) {
      return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
    }
    refreshInFlightRef.current = true;

    // Show skeleton only on a true cold start (no data in view yet).
    // Subsequent background refreshes (realtime updates, force-refresh) must
    // run silently so the user isn't interrupted while reading or scrolling.
    if (!cacheAppliedRef.current && itemsRef.current.length === 0) {
      setLoadingInitial(true);
    }

    try {
      if (!available) {
        return await loadFallbackInitial({ preserveExistingItemsOnEmpty: true });
      }

      const payload = await fetchTimelinePage(null);
      if (!payload) {
        return await loadFallbackInitial({ preserveExistingItemsOnEmpty: true });
      }
      if ((payload.items || []).length === 0 && fallbackLoadInitial) {
        const fallbackPayload = await loadFallbackInitial({ preserveExistingItemsOnEmpty: true });
        if ((fallbackPayload.items || []).length > 0) {
          _internalTimelineCache.set(timelineCacheKey, { payload: fallbackPayload, fetchedAt: Date.now() });
          return fallbackPayload;
        }
      }
      const applied = applyPayload(payload, { preserveExistingItemsOnEmpty: true, mergeWithExisting: true });
      if (applied) {
        _internalTimelineCache.set(timelineCacheKey, { payload: { ...payload, items: itemsRef.current }, fetchedAt: Date.now() });
      }
      return payload;
    } finally {
      setLoadingInitial(false);
      cacheAppliedRef.current = false;
      refreshInFlightRef.current = false;
    }
  }, [applyPayload, available, conversationKey, enabled, fallbackLoadInitial, fetchTimelinePage, loadFallbackInitial, timelineCacheKey]);

  const loadOlder = useCallback(async () => {
    if (!enabled || !conversationKey || !cursor || !available || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const payload = await fetchTimelinePage(cursor);
      if (!payload) {
        setHasMore(false);
        return;
      }
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
        const existing = _internalTimelineCache.get(timelineCacheKey);
        if (existing) {
          _internalTimelineCache.set(timelineCacheKey, {
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
  }, [available, conversationKey, cursor, enabled, fetchTimelinePage, loadingOlder, timelineCacheKey]);

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
        if (timelineCacheKey) {
          const existing = _internalTimelineCache.get(timelineCacheKey);
          if (existing) {
            _internalTimelineCache.set(timelineCacheKey, {
              ...existing,
              payload: { ...existing.payload, items: next },
              fetchedAt: Date.now(),
            });
          }
        }
        return next;
      });
    },
    [timelineCacheKey],
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
    readModel,
    available,
    refresh,
    loadOlder,
  };
};
