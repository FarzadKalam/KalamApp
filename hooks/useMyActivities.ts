import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { supabase } from '../supabaseClient';
import { isMissingColumnError } from '../utils/notificationAssigneeHelpers';
import { runSelectWithCompatibleColumns } from '../utils/selectCompat';

// ---------------------------------------------------------------------------
// Module-level cache — persists across popover open/close cycles.
// Opening the drawer a second time shows data instantly, then refreshes silently.
// ---------------------------------------------------------------------------
type ActivitiesCacheEntry = { tasks: any[]; fetchedAt: number };
const _activitiesCache = new Map<string, ActivitiesCacheEntry>();
const ACTIVITIES_CACHE_TTL_MS = 90_000;
const ACTIVITIES_CACHE_VERSION = 'v2-title-context';

const buildCacheKey = (userId: string, roleId: string | null) =>
  `${ACTIVITIES_CACHE_VERSION}:${userId}:${roleId || 'norole'}`;

const readCache = (key: string): any[] | null => {
  const entry = _activitiesCache.get(key);
  if (entry && Date.now() - entry.fetchedAt < ACTIVITIES_CACHE_TTL_MS) return entry.tasks;
  return null;
};

const TASK_SELECT_COLUMNS = [
  'id', 'name', 'status', 'priority', 'produced_qty',
  'created_at', 'start_date', 'due_date',
  'assignee_id', 'assignee_role_id', 'assignee_type',
  'process_group_id', 'process_run_id', 'process_run_stage_id',
  'process_node_key', 'process_lane_key',
  'source_template_id', 'source_stage_sort_order',
  'recurrence_info', 'metadata',
  'production_line_id', 'related_to_module',
  'related_product', 'related_customer', 'related_supplier',
  'related_production_order', 'related_invoice', 'purchase_invoice_id',
  'project_id', 'marketing_lead_id', 'source_module_id', 'source_record_id',
] as const;

// ---------------------------------------------------------------------------

type UseMyActivitiesOptions = {
  userId: string | null;
  roleId: string | null;
  enabled: boolean;
};

export const useMyActivities = ({ userId, roleId, enabled }: UseMyActivitiesOptions) => {
  const cacheKey = buildCacheKey(userId || '', roleId);
  const [tasks, setTasks] = useState<any[]>(() => readCache(cacheKey) || []);
  const [loading, setLoading] = useState(false);
  const refreshInFlightRef = useRef(false);

  const updateTasks = useCallback((value: React.SetStateAction<any[]>) => {
    setTasks((prev) => {
      const next = typeof value === 'function'
        ? (value as (previous: any[]) => any[])(prev)
        : value;
      _activitiesCache.set(cacheKey, { tasks: next, fetchedAt: Date.now() });
      return next;
    });
  }, [cacheKey]);

  // Keep cache key up-to-date when user changes
  useEffect(() => {
    const cached = readCache(cacheKey);
    setTasks(cached || []);
    refreshInFlightRef.current = false;
  }, [cacheKey]);

  const fetchTasks = useCallback(async (): Promise<any[]> => {
    if (!userId) return [];

    const buildBase = (selectExpr: string) =>
      supabase
        .from('tasks')
        .select(selectExpr)
        .neq('status', 'canceled')
        .order('created_at', { ascending: false })
        .limit(100);

    // Single query with OR — one round-trip for both user and role assignments
    const orFilter = roleId
      ? `and(assignee_type.eq.user,assignee_id.eq.${userId}),and(assignee_type.eq.role,assignee_role_id.eq.${roleId})`
      : `and(assignee_type.eq.user,assignee_id.eq.${userId})`;

    const primaryResult = await runSelectWithCompatibleColumns<any[]>({
      cacheKey: 'notifications:my-activities:tasks',
      columns: TASK_SELECT_COLUMNS,
      execute: (selectExpr) => buildBase(selectExpr).or(orFilter),
    });
    const { data, error } = primaryResult;
    if (!error) return data || [];

    // Fallback: schema might not have assignee_type / assignee_role_id columns
    if (
      isMissingColumnError(error, 'assignee_type')
      || isMissingColumnError(error, 'assignee_role_id')
    ) {
      const legacyFilter = roleId
        ? `assignee_id.eq.${userId},assignee_id.eq.${roleId}`
        : `assignee_id.eq.${userId}`;
      const legacyResult = await runSelectWithCompatibleColumns<any[]>({
        cacheKey: 'notifications:my-activities:tasks:legacy',
        columns: TASK_SELECT_COLUMNS,
        execute: (selectExpr) => buildBase(selectExpr).or(legacyFilter),
      });
      const { data: legacyData, error: legacyError } = legacyResult;
      if (!legacyError) return legacyData || [];
    }

    console.warn('useMyActivities: task fetch failed', error);
    return [];
  }, [userId, roleId]);

  const refresh = useCallback(
    async (options?: { force?: boolean }): Promise<any[]> => {
      if (!userId || !enabled) return tasks;
      if (refreshInFlightRef.current) return tasks;

      if (!options?.force) {
        const cached = readCache(cacheKey);
        if (cached) {
          setTasks(cached);
          return cached;
        }
      }

      refreshInFlightRef.current = true;
      const isFirstLoad = tasks.length === 0;
      if (isFirstLoad) setLoading(true);
      try {
        const data = await fetchTasks();
        _activitiesCache.set(cacheKey, { tasks: data, fetchedAt: Date.now() });
        setTasks(data);
        return data;
      } catch (e) {
        console.warn('useMyActivities: refresh failed', e);
        return tasks;
      } finally {
        setLoading(false);
        refreshInFlightRef.current = false;
      }
    },
    [userId, enabled, cacheKey, fetchTasks, tasks],
  );

  // Auto-fetch on mount / when user changes
  useEffect(() => {
    if (!enabled || !userId) return;
    const cached = readCache(cacheKey);
    if (cached) {
      setTasks(cached);
    } else {
      void refresh();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, roleId, enabled]);

  return { tasks, setTasks: updateTasks, loading, refresh };
};
