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

type LegacyLoader<TItem> = () => Promise<TItem[]>;

type UseBotConversationTimelineOptions<TItem> = {
  supabase: SupabaseClient<any, 'public', any>;
  enabled: boolean;
  botGroupId: string | null;
  pageSize?: number;
  fallbackLoadInitial?: LegacyLoader<TItem>;
  cacheScopeKey?: string | null;
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
let _botUnifiedTimelineRpcAvailable = false;

const buildCacheKey = (scopeKey: string | null | undefined, botGroupId: string) =>
  `${String(scopeKey || 'default').trim() || 'default'}:${botGroupId}`;

const readCache = <TItem>(cacheKey: string): NotificationTimelinePayload<TItem> | null => {
  const entry = _botTimelineCache.get(cacheKey);
  if (entry && Date.now() - entry.fetchedAt < TIMELINE_CACHE_TTL_MS)
    return entry.payload as NotificationTimelinePayload<TItem>;
  return null;
};

const isCacheFresh = (cacheKey: string) => {
  const entry = _botTimelineCache.get(cacheKey);
  return Boolean(entry && Date.now() - entry.fetchedAt < TIMELINE_CACHE_TTL_MS);
};

const sortByDate = <T>(items: T[]): T[] =>
  items.slice().sort((a: any, b: any) => compareIsoAsc(a?.created_at, b?.created_at));

const _botTimelinePrefetchInFlight = new Set<string>();

export const prefetchBotConversationTimeline = async <TItem,>({
  supabase,
  botGroupId,
  cacheScopeKey,
  pageSize = 10,
}: {
  supabase: SupabaseClient<any, 'public', any>;
  botGroupId: string | null;
  cacheScopeKey?: string | null;
  pageSize?: number;
}) => {
  const normalizedBotGroupId = String(botGroupId || '').trim();
  const cacheKey = buildCacheKey(cacheScopeKey, normalizedBotGroupId);
  if (!normalizedBotGroupId || readCache<TItem>(cacheKey) || _botTimelinePrefetchInFlight.has(normalizedBotGroupId)) return;
  _botTimelinePrefetchInFlight.add(normalizedBotGroupId);
  try {
    if (_botUnifiedTimelineRpcAvailable) {
      const { data, error } = await supabase.rpc('get_communication_timeline', {
        p_channel: 'bot',
        p_conversation_key: `bot:${normalizedBotGroupId}`,
        p_before_cursor: null,
        p_limit: pageSize,
      });
      if (!error) {
        const payload = normalizeTimelinePayload<TItem>(data);
        _botTimelineCache.set(cacheKey, {
          payload: { ...payload, items: sortByDate(payload.items || []) },
          fetchedAt: Date.now(),
        });
        return;
      }
      _botUnifiedTimelineRpcAvailable = false;
    }

    const { data: fallbackData, error: fallbackError } = await supabase.rpc('get_bot_conversation_timeline', {
      p_bot_group_id: normalizedBotGroupId,
      p_limit: pageSize,
      p_before_cursor: null,
      p_include_unread_window: false,
    });
    if (fallbackError) return;
    const payload = normalizeTimelinePayload<TItem>(fallbackData);
    _botTimelineCache.set(cacheKey, {
      payload: { ...payload, items: sortByDate(payload.items || []) },
      fetchedAt: Date.now(),
    });
  } finally {
    _botTimelinePrefetchInFlight.delete(normalizedBotGroupId);
  }
};

// ---------------------------------------------------------------------------

export const useBotConversationTimeline = <TItem,>({
  supabase,
  enabled,
  botGroupId,
  pageSize = 10,
  fallbackLoadInitial,
  cacheScopeKey,
}: UseBotConversationTimelineOptions<TItem>) => {
  const [items, setItemsState] = useState<TItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialAnchorId, setInitialAnchorId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [available, setAvailable] = useState(true);
  const [communicationApiAvailable, setCommunicationApiAvailable] = useState(_botUnifiedTimelineRpcAvailable);
  const [readModel, setReadModel] = useState<NotificationReadModel>('item');
  const itemsRef = useRef<TItem[]>([]);
  const normalizedBotGroupId = String(botGroupId || '').trim();
  const activeBotGroupIdRef = useRef(normalizedBotGroupId);
  activeBotGroupIdRef.current = normalizedBotGroupId;
  const timelineCacheKey = normalizedBotGroupId ? buildCacheKey(cacheScopeKey, normalizedBotGroupId) : '';

  // True when the current view was already populated from cache.
  // refresh() uses this to skip the loading skeleton for the background fetch.
  const cacheAppliedRef = useRef(false);
  // Deduplicate concurrent refresh() calls — only one in-flight at a time.
  const refreshInFlightRef = useRef(false);

  // Recovery: when enabled cycles false→true, reset available so RPC is retried
  useEffect(() => {
    if (enabled) {
      setAvailable(true);
      setCommunicationApiAvailable(_botUnifiedTimelineRpcAvailable);
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
    return true;
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
    // Bot group changed — release in-flight guard for the old group.
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
  }, [enabled, botGroupId, timelineCacheKey, applyPayload]);

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
    if (communicationApiAvailable) {
      const { data, error } = await supabase.rpc('get_communication_timeline', {
        p_channel: 'bot',
        p_conversation_key: `bot:${botGroupId}`,
        p_before_cursor: beforeCursor,
        p_limit: pageSize,
      });
      if (!error) {
        return normalizeTimelinePayload<TItem>(data);
      }
      _botUnifiedTimelineRpcAvailable = false;
      setCommunicationApiAvailable(false);
    }

    const { data, error } = await supabase.rpc('get_bot_conversation_timeline', {
      p_bot_group_id: botGroupId,
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
  }, [botGroupId, communicationApiAvailable, pageSize, supabase]);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (!enabled || !botGroupId) {
      applyPayload(EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>);
      return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
    }
    const requestBotGroupId = String(botGroupId || '').trim();

    if (!options?.force && timelineCacheKey && isCacheFresh(timelineCacheKey)) {
      const cached = readCache<TItem>(timelineCacheKey);
      if (cached) {
        applyPayload(cached);
        return cached;
      }
    }

    if (refreshInFlightRef.current) {
      return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
    }
    refreshInFlightRef.current = true;

    // Show skeleton only on cold start (no items in view). Background refreshes
    // run silently to avoid interrupting the user mid-conversation.
    if (!cacheAppliedRef.current && itemsRef.current.length === 0) {
      setLoadingInitial(true);
    }

    try {
      if (activeBotGroupIdRef.current !== requestBotGroupId) {
        return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
      }
      if (!available) {
        if (activeBotGroupIdRef.current !== requestBotGroupId) {
          return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
        }
        return await loadFallbackInitial({ preserveExistingItemsOnEmpty: true });
      }

      const payload = await fetchTimelinePage(null);
      if (activeBotGroupIdRef.current !== requestBotGroupId) {
        return EMPTY_TIMELINE_PAYLOAD as NotificationTimelinePayload<TItem>;
      }
      if (!payload) {
        return await loadFallbackInitial({ preserveExistingItemsOnEmpty: true });
      }
      if ((payload.items || []).length === 0 && fallbackLoadInitial) {
        const fallbackPayload = await loadFallbackInitial({ preserveExistingItemsOnEmpty: true });
        if ((fallbackPayload.items || []).length > 0) {
          _botTimelineCache.set(timelineCacheKey, { payload: fallbackPayload, fetchedAt: Date.now() });
          return fallbackPayload;
        }
      }
      const applied = applyPayload(payload, { preserveExistingItemsOnEmpty: true, mergeWithExisting: true });
      if (applied) {
        _botTimelineCache.set(timelineCacheKey, { payload: { ...payload, items: itemsRef.current }, fetchedAt: Date.now() });
      }
      return payload;
    } finally {
      setLoadingInitial(false);
      cacheAppliedRef.current = false;
      refreshInFlightRef.current = false;
    }
  }, [applyPayload, available, botGroupId, enabled, fallbackLoadInitial, fetchTimelinePage, loadFallbackInitial, timelineCacheKey]);

  const loadOlder = useCallback(async () => {
    if (!enabled || !botGroupId || !cursor || !available || loadingOlder) return;
    const requestBotGroupId = String(botGroupId || '').trim();
    setLoadingOlder(true);
    try {
      const payload = await fetchTimelinePage(cursor);
      if (activeBotGroupIdRef.current !== requestBotGroupId) return;
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
        const existing = _botTimelineCache.get(timelineCacheKey);
        if (existing) {
          _botTimelineCache.set(timelineCacheKey, {
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
  }, [available, botGroupId, cursor, enabled, fetchTimelinePage, loadingOlder, timelineCacheKey]);

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
        itemsRef.current = next;
        if (timelineCacheKey) {
          const existing = _botTimelineCache.get(timelineCacheKey);
          if (existing) {
            _botTimelineCache.set(timelineCacheKey, {
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
