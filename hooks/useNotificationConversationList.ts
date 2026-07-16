import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type NotificationConversationSection,
  type NotificationConversationSummary,
  isMissingRpcError,
} from '../utils/notificationConversationRpc';
import { preloadAvatarUrls } from '../utils/profileAvatar';

// ---------------------------------------------------------------------------
// Module-level cache — persists across mount/unmount cycles.
// Opening the popover a second time renders the list instantly from here,
// then a background fetch silently refreshes the data.
// ---------------------------------------------------------------------------
type ConvListCacheEntry = {
  items: NotificationConversationSummary[];
  fetchedAt: number;
};
const _convListCache = new Map<string, ConvListCacheEntry>();
const CONV_LIST_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const buildCacheKey = (scopeKey: string | null | undefined, section: string) =>
  `${String(scopeKey || 'default').trim() || 'default'}:${section}`;

const readCache = (cacheKey: string): NotificationConversationSummary[] | null => {
  const entry = _convListCache.get(cacheKey);
  if (entry && Date.now() - entry.fetchedAt < CONV_LIST_CACHE_TTL_MS) return entry.items;
  return null;
};

const isCacheFresh = (cacheKey: string) => {
  const entry = _convListCache.get(cacheKey);
  return Boolean(entry && Date.now() - entry.fetchedAt < CONV_LIST_CACHE_TTL_MS);
};

// ---------------------------------------------------------------------------

type UseNotificationConversationListOptions = {
  supabase: SupabaseClient<any, 'public', any>;
  section: NotificationConversationSection;
  enabled: boolean;
  cacheScopeKey?: string | null;
  fallbackLoadInitial?: () => Promise<NotificationConversationSummary[]>;
  mergeFallbackInitial?: boolean;
};

type RefreshOptions = {
  force?: boolean;
};

export const useNotificationConversationList = ({
  supabase,
  section,
  enabled,
  cacheScopeKey,
  fallbackLoadInitial,
  mergeFallbackInitial = false,
}: UseNotificationConversationListOptions) => {
  const cacheKey = buildCacheKey(cacheScopeKey, section);
  // Initialize from module-level cache so first render shows data immediately
  const [items, setItemsState] = useState<NotificationConversationSummary[] | null>(
    () => readCache(cacheKey),
  );
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);
  const [v2Available, setV2Available] = useState(true);
  // Deduplicate concurrent refresh() calls — only one in-flight at a time.
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    setItemsState(readCache(cacheKey));
    refreshInFlightRef.current = false;
  }, [cacheKey]);

  // Recovery: when enabled cycles false→true, reset available so RPC is retried
  useEffect(() => {
    if (enabled) {
      setAvailable(true);
      setV2Available(true);
    }
  }, [enabled]);

  // Ref so refresh() can check current items without needing them in its dep array
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Wrapped setter: keeps the module-level cache in sync whenever the list is
  // mutated externally (e.g. mark-as-read optimistic update).
  const setItems = useCallback(
    (
      updater:
        | NotificationConversationSummary[]
        | null
        | ((
            prev: NotificationConversationSummary[] | null,
          ) => NotificationConversationSummary[] | null),
    ) => {
      setItemsState((prev) => {
        const next =
          typeof updater === 'function'
            ? (
                updater as (
                  p: NotificationConversationSummary[] | null,
                ) => NotificationConversationSummary[] | null
              )(prev)
            : updater;
        if (Array.isArray(next)) {
          _convListCache.set(cacheKey, { items: next, fetchedAt: Date.now() });
        }
        return next;
      });
    },
    [cacheKey],
  );

  const refresh = useCallback(async (options?: RefreshOptions) => {
    if (!enabled || !available) return null;
    if (!options?.force && isCacheFresh(cacheKey)) {
      const cached = readCache(cacheKey);
      if (cached) {
        if (itemsRef.current === null) setItemsState(cached);
        return cached;
      }
    }
    if (refreshInFlightRef.current) return null;
    refreshInFlightRef.current = true;
    // Show spinner only on a true cold load (no cached data in state yet)
    if (itemsRef.current === null) setLoading(true);
    try {
      let data: any = null;
      let error: any = null;
      if (v2Available) {
        ({ data, error } = await supabase.rpc('get_communication_conversations_v2', {
          p_channel: section === 'notes' ? 'internal' : 'bot',
          p_before_cursor: null,
          p_limit: 80,
        }));
        if (error && isMissingRpcError(error)) {
          setV2Available(false);
          data = null;
          error = null;
        } else if (error) {
          throw error;
        }
      }
      if (!v2Available || data === null) {
        ({ data, error } = section === 'notes'
          ? await supabase.rpc('get_communication_conversations', {
            p_channel: 'internal',
            p_before_cursor: null,
            p_limit: 80,
          })
          : await supabase.rpc('get_notification_conversations', {
            p_section: section,
          }));
      }
      if (section === 'notes' && error && isMissingRpcError(error)) {
        ({ data, error } = await supabase.rpc('get_notification_conversations', {
          p_section: section,
        }));
      }
      if (error) {
        if (isMissingRpcError(error)) {
          setAvailable(false);
          setItemsState(null);
          return null;
        }
        throw error;
      }
      let nextItems = Array.isArray(data)
        ? (data as NotificationConversationSummary[])
        : [];
      if (mergeFallbackInitial && fallbackLoadInitial) {
        // The communication RPC is the fast, paginated source of truth for the
        // first paint. Publish it before running compatibility loaders, which
        // can require several larger table queries on older installations.
        setItemsState(nextItems);
        _convListCache.set(cacheKey, { items: nextItems, fetchedAt: Date.now() });
        const fallbackItems = await fallbackLoadInitial();
        if (fallbackItems.length > 0) {
          const merged = new Map<string, NotificationConversationSummary>();
          nextItems.forEach((item) => {
            const key = String(item?.conversation_key || '').trim();
            if (key) merged.set(key, item);
          });
          fallbackItems.forEach((fallbackItem) => {
            const key = String(fallbackItem?.conversation_key || '').trim();
            if (!key) return;
            const existing = merged.get(key);
            if (!existing) {
              merged.set(key, fallbackItem);
              return;
            }
            const existingLatestMs = new Date(existing.latest_message_at || 0).getTime();
            const fallbackLatestMs = new Date(fallbackItem.latest_message_at || 0).getTime();
            if (Number.isFinite(fallbackLatestMs) && fallbackLatestMs > existingLatestMs) {
              merged.set(key, {
                ...existing,
                ...fallbackItem,
                title: fallbackItem.title || existing.title,
                subtitle: fallbackItem.subtitle || existing.subtitle,
                avatar_url: fallbackItem.avatar_url || existing.avatar_url,
                role_label: fallbackItem.role_label || existing.role_label,
                unread_count: existing.unread_count,
                note_count: Math.max(Number(existing.note_count || 0), Number(fallbackItem.note_count || 0)),
              });
            }
          });
          nextItems = Array.from(merged.values()).sort((left, right) => (
            new Date(right.latest_message_at || 0).getTime() - new Date(left.latest_message_at || 0).getTime()
          ));
        }
      }
      setItemsState(nextItems);
      _convListCache.set(cacheKey, { items: nextItems, fetchedAt: Date.now() });
      return nextItems;
    } finally {
      setLoading(false);
      refreshInFlightRef.current = false;
    }
  }, [available, cacheKey, enabled, fallbackLoadInitial, mergeFallbackInitial, section, supabase, v2Available]);

  useEffect(() => {
    if (!enabled || !available) return;
    void refresh();
  }, [available, enabled, refresh]);

  // Preload conversation sidebar avatars into browser cache as soon as they arrive
  useEffect(() => {
    if (!Array.isArray(items) || items.length === 0) return;
    const urls = items
      .map((item) => item.avatar_url)
      .filter((url): url is string => Boolean(url));
    preloadAvatarUrls(urls, 'avatar');
  }, [items]);

  return {
    items,
    loading,
    available,
    refresh,
    setItems,
  };
};
