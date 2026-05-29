import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { supportsModuleAssignee } from '../utils/assigneeSupport';
import {
  isMissingTableLikeError,
  fetchAssignedIdsForModule,
  safeFetchResponsibilityRows,
} from '../utils/notificationAssigneeHelpers';

// ---------------------------------------------------------------------------
// Module-level cache — persists across popover open/close cycles.
// ---------------------------------------------------------------------------
type ResponsibilitiesCacheEntry = { items: any[]; fetchedAt: number };
const _responsibilitiesCache = new Map<string, ResponsibilitiesCacheEntry>();
const RESPONSIBILITIES_CACHE_TTL_MS = 90_000;

const buildCacheKey = (userId: string, roleId: string | null) =>
  `${userId}:${roleId || 'norole'}`;

const readCache = (key: string): any[] | null => {
  const entry = _responsibilitiesCache.get(key);
  if (entry && Date.now() - entry.fetchedAt < RESPONSIBILITIES_CACHE_TTL_MS) return entry.items;
  return null;
};

// ---------------------------------------------------------------------------

type InboxItem = {
  id: string;
  module_id: string | null;
  record_id: string | null;
  source_type: string | null;
  source_id: string | null;
  title: string | null;
  body: string | null;
  last_event_at: string | null;
  created_at: string | null;
  payload: any;
};

const fetchInboxSection = async (limit = 200): Promise<InboxItem[] | null> => {
  const { data, error } = await supabase
    .from('notification_inbox_items')
    .select('id,source_type,source_id,section,category,title,body,module_id,record_id,payload,last_event_at,created_at')
    .eq('section', 'responsibilities')
    .order('last_event_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableLikeError(error)) return null;
    throw error;
  }
  return (data || []) as InboxItem[];
};

const isPlainObject = (v: unknown): v is Record<string, any> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Core fetch — optimized with Promise.all for parallel row loading
// ---------------------------------------------------------------------------
const fetchResponsibilities = async (userId: string, roleId: string | null): Promise<any[]> => {
  // ── Primary path: notification_inbox_items (single query) ──────────────
  const inboxItems = await fetchInboxSection(200);
  if (inboxItems !== null) {
    const moduleByTable = new Map<string, any>();
    Object.values(MODULES).forEach((mod: any) => {
      const moduleId = String(mod?.id || '').trim();
      const tableName = String(mod?.table || mod?.id || '').trim();
      if (moduleId) moduleByTable.set(moduleId, mod);
      if (tableName) moduleByTable.set(tableName, mod);
    });

    const grouped = new Map<string, { mod: any; table: string; ids: string[]; items: InboxItem[] }>();
    inboxItems.forEach((item) => {
      const payload = isPlainObject(item.payload) ? item.payload : {};
      const sourceTable = String(
        item.module_id || (payload as any)?.table || item.source_type || '',
      ).trim();
      const recordId = String(item.record_id || item.source_id || '').trim();
      if (!sourceTable || !recordId) return;

      const mod = moduleByTable.get(sourceTable) || { id: sourceTable, table: sourceTable, titles: { fa: sourceTable } };
      const moduleId = String(mod?.id || sourceTable).trim();
      const table = String(mod?.table || sourceTable).trim();
      const key = `${moduleId}:${table}`;
      const current = grouped.get(key) || { mod, table, ids: [], items: [] };
      current.ids.push(recordId);
      current.items.push(item);
      grouped.set(key, current);
    });

    const groupEntries = Array.from(grouped.values());

    // Parallel row fetching — all module groups load simultaneously
    const rowsPerGroup = await Promise.all(
      groupEntries.map(async (group) => {
        const idList = Array.from(new Set(group.ids.filter(Boolean)));
        if (idList.length === 0) return [];
        try {
          return await safeFetchResponsibilityRows(
            group.table,
            String(group.mod?.id || group.table),
            idList,
          );
        } catch {
          return [];
        }
      }),
    );

    const results: any[] = [];
    groupEntries.forEach((group, i) => {
      const rows: any[] = rowsPerGroup[i] || [];
      const itemByRecordId = new Map(
        group.items.map((item) => [String(item.record_id || item.source_id || '').trim(), item]),
      );
      const loadedIds = new Set(rows.map((row: any) => String(row?.id || '').trim()).filter(Boolean));

      rows.forEach((row: any) => {
        const item = itemByRecordId.get(String(row?.id || '').trim());
        results.push({
          ...row,
          module_id: group.mod.id,
          module_title: group.mod.titles?.fa || group.mod.id,
          __notification_inbox_item: item || null,
        });
      });

      // Include inbox items whose rows couldn't be fetched (deleted records, etc.)
      group.items.forEach((item) => {
        const recordId = String(item.record_id || item.source_id || '').trim();
        if (!recordId || loadedIds.has(recordId)) return;
        results.push({
          id: recordId,
          name: item.title,
          title: item.title,
          description: item.body,
          created_at: item.last_event_at || item.created_at,
          updated_at: item.last_event_at || item.created_at,
          module_id: group.mod.id,
          module_title: group.mod.titles?.fa || group.mod.id,
          __notification_inbox_item: item,
        });
      });
    });

    return results.sort(
      (a, b) =>
        new Date(b.created_at || b.updated_at || 0).getTime()
        - new Date(a.created_at || a.updated_at || 0).getTime(),
    );
  }

  // ── Fallback: query each assignee-supporting module table in parallel ───
  const modules = Object.values(MODULES).filter(
    (mod: any) => mod?.id !== 'tasks' && (mod?.table || mod?.id) && supportsModuleAssignee(mod),
  );

  // All modules queried simultaneously — O(1) latency regardless of module count
  const moduleResults = await Promise.all(
    modules.map(async (mod: any) => {
      const table = String(mod?.table || mod?.id || '').trim();
      try {
        const ids = await fetchAssignedIdsForModule(table, userId, roleId);
        const idList = (ids || []).map((row: any) => row.id).filter(Boolean);
        if (!idList.length) return [];
        const data = await safeFetchResponsibilityRows(table, String(mod?.id || table), idList);
        return (data || []).map((row: any) => ({
          ...row,
          module_id: mod.id,
          module_title: mod.titles?.fa || mod.id,
        }));
      } catch {
        return [];
      }
    }),
  );

  const results = moduleResults.flat();
  return results.sort(
    (a, b) =>
      new Date(b.created_at || b.updated_at || 0).getTime()
      - new Date(a.created_at || a.updated_at || 0).getTime(),
  );
};

// ---------------------------------------------------------------------------

type UseMyResponsibilitiesOptions = {
  userId: string | null;
  roleId: string | null;
  enabled: boolean;
};

export const useMyResponsibilities = ({
  userId,
  roleId,
  enabled,
}: UseMyResponsibilitiesOptions) => {
  const cacheKey = buildCacheKey(userId || '', roleId);
  const [responsibilities, setResponsibilities] = useState<any[]>(
    () => readCache(cacheKey) || [],
  );
  const [loading, setLoading] = useState(false);
  const refreshInFlightRef = useRef(false);

  const updateResponsibilities = useCallback((value: React.SetStateAction<any[]>) => {
    setResponsibilities((prev) => {
      const next = typeof value === 'function'
        ? (value as (previous: any[]) => any[])(prev)
        : value;
      _responsibilitiesCache.set(cacheKey, { items: next, fetchedAt: Date.now() });
      return next;
    });
  }, [cacheKey]);

  useEffect(() => {
    const cached = readCache(cacheKey);
    setResponsibilities(cached || []);
    refreshInFlightRef.current = false;
  }, [cacheKey]);

  const refresh = useCallback(
    async (options?: { force?: boolean }): Promise<any[]> => {
      if (!userId || !enabled) return responsibilities;
      if (refreshInFlightRef.current) return responsibilities;

      if (!options?.force) {
        const cached = readCache(cacheKey);
        if (cached) {
          setResponsibilities(cached);
          return cached;
        }
      }

      refreshInFlightRef.current = true;
      const isFirstLoad = responsibilities.length === 0;
      if (isFirstLoad) setLoading(true);
      try {
        const data = await fetchResponsibilities(userId, roleId);
        _responsibilitiesCache.set(cacheKey, { items: data, fetchedAt: Date.now() });
        setResponsibilities(data);
        return data;
      } catch (e) {
        console.warn('useMyResponsibilities: refresh failed', e);
        return responsibilities;
      } finally {
        setLoading(false);
        refreshInFlightRef.current = false;
      }
    },
    [userId, roleId, enabled, cacheKey, responsibilities],
  );

  useEffect(() => {
    if (!enabled || !userId) return;
    const cached = readCache(cacheKey);
    if (cached) {
      setResponsibilities(cached);
    } else {
      void refresh();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, roleId, enabled]);

  return { responsibilities, setResponsibilities: updateResponsibilities, loading, refresh };
};
