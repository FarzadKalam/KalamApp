import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Select, Skeleton, Tag } from 'antd';
import { CaretRightOutlined, LeftOutlined, PauseOutlined, RightOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import {
  buildGoalFallbackProgressSnapshot,
  canUserViewGoalResults,
  canViewGoalPlacement,
  dedupeGoalsForDisplay,
  ensureDefaultSalesInvoiceGoal,
  executeGoalProgress,
  normalizeGoalRecord,
  resolveGoalAssignedMembers,
} from '../../utils/goals';
import { type FiscalYearSnapshot } from '../../utils/goalPeriods';
import { fetchCurrentUserRecordAccessContext, resolveModuleGoalAccessPermissions, type PermissionMap } from '../../utils/permissions';
import { fetchAssigneeDirectory } from '../../utils/referenceData';
import {
  GOAL_PERIOD_UNIT_OPTIONS,
  type GoalPeriodUnit,
  type GoalProgressSnapshot,
} from '../../utils/goalTypes';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import GoalEditorModal from './GoalEditorModal';
import GoalResultsModal from './GoalResultsModal';

type GoalProgressSliderProps = {
  moduleId?: string | null;
  placement: 'module_list' | 'dashboard';
  className?: string;
  hideWhenEmpty?: boolean;
  autoPlay?: boolean;
  showPlaybackControls?: boolean;
  onActiveCardChange?: (card: GoalProgressSnapshot | null) => void;
};

const GOAL_PROGRESS_CACHE_TTL_MS = 60_000;
const GOAL_PROGRESS_STALE_CACHE_TTL_MS = 15 * 60_000;
const GOAL_PROGRESS_CACHE_STORAGE_KEY = 'goal-progress-cards-cache-v1';
const GOAL_PROGRESS_COMPUTE_CONCURRENCY = 3;
const GOAL_PROGRESS_REFRESH_EVENT = 'kalam:goal-progress-refresh';

type GoalProgressCacheEntry = {
  data: GoalProgressSnapshot[];
  expiresAt: number;
  staleExpiresAt?: number;
};

let goalProgressFiscalYearCache: {
  data: FiscalYearSnapshot | null;
  expiresAt: number;
  promise: Promise<FiscalYearSnapshot | null> | null;
} = {
  data: null,
  expiresAt: 0,
  promise: null,
};

const goalProgressCardsCache = new Map<string, GoalProgressCacheEntry>();
const goalProgressCardsPromiseCache = new Map<string, Promise<GoalProgressSnapshot[]>>();

const dispatchGoalProgressRefresh = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GOAL_PROGRESS_REFRESH_EVENT));
};

const readGoalProgressStorage = () => {
  try {
    const raw = window.sessionStorage.getItem(GOAL_PROGRESS_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, GoalProgressCacheEntry>;
  } catch {
    return {};
  }
};

const readGoalProgressCardsFromStorage = (cacheKey: string) => {
  try {
    const store = readGoalProgressStorage();
    const entry = store[cacheKey];
    if (!entry || !Array.isArray(entry.data) || typeof entry.expiresAt !== 'number') return null;
    return entry;
  } catch {
    return null;
  }
};

const writeGoalProgressCardsToStorage = (cacheKey: string, entry: GoalProgressCacheEntry) => {
  try {
    const store = readGoalProgressStorage();
    store[cacheKey] = entry;
    window.sessionStorage.setItem(GOAL_PROGRESS_CACHE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // noop
  }
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) break;
        results[index] = await worker(items[index], index);
      }
    })
  );

  return results;
};

const toneClassMap: Record<GoalProgressSnapshot['tone'], { shell: string; bar: string; subBar: string; tag: string }> = {
  base: {
    shell: 'from-white to-amber-50/80 dark:from-[#1b1b1b] dark:to-[#26201a]',
    bar: 'from-leather-500 to-amber-500',
    subBar: 'from-stone-400 to-stone-500',
    tag: 'text-leather-700 bg-amber-100 border-amber-200 dark:text-amber-100 dark:bg-amber-900/20 dark:border-amber-800/60',
  },
  bronze: {
    shell: 'from-orange-50 to-amber-100 dark:from-[#26180f] dark:to-[#332217]',
    bar: 'from-orange-500 to-amber-500',
    subBar: 'from-orange-300 to-orange-500',
    tag: 'text-orange-700 bg-orange-100 border-orange-200 dark:text-orange-100 dark:bg-orange-900/25 dark:border-orange-800/60',
  },
  silver: {
    shell: 'from-slate-50 to-zinc-100 dark:from-[#1c1f24] dark:to-[#2a2e35]',
    bar: 'from-slate-400 to-zinc-500',
    subBar: 'from-slate-300 to-slate-500',
    tag: 'text-slate-700 bg-slate-100 border-slate-200 dark:text-slate-100 dark:bg-slate-900/25 dark:border-slate-700/70',
  },
  gold: {
    shell: 'from-yellow-50 to-amber-100 dark:from-[#2b240e] dark:to-[#352b12]',
    bar: 'from-yellow-400 to-amber-500',
    subBar: 'from-yellow-300 to-yellow-500',
    tag: 'text-yellow-800 bg-yellow-100 border-yellow-200 dark:text-yellow-100 dark:bg-yellow-900/25 dark:border-yellow-800/60',
  },
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const formatMetricNumber = (value: number, metricType: GoalProgressSnapshot['goal']['metric_type']) => {
  if (metricType === 'avg') {
    return toPersianNumber(value.toFixed(1));
  }
  if (Math.abs(value) >= 1000) {
    return toPersianNumber(Math.round(value).toLocaleString('en-US'));
  }
  return toPersianNumber(Number(value || 0).toFixed(value % 1 === 0 ? 0 : 1));
};

const GoalProgressSlider: React.FC<GoalProgressSliderProps> = ({
  moduleId,
  placement,
  className = '',
  hideWhenEmpty = false,
  autoPlay = true,
  showPlaybackControls = true,
  onActiveCardChange,
}) => {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<GoalProgressSnapshot[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false);
  const [subperiodSelections, setSubperiodSelections] = useState<Record<string, GoalPeriodUnit>>({});
  const [rolePermissions, setRolePermissions] = useState<PermissionMap | null>(null);
  const [editingGoal, setEditingGoal] = useState<GoalProgressSnapshot['goal'] | null>(null);
  const [resultsGoal, setResultsGoal] = useState<GoalProgressSnapshot['goal'] | null>(null);
  const [isAutoPlayPaused, setIsAutoPlayPaused] = useState(false);
  const rowCacheRef = useRef<Map<string, any[]>>(new Map());
  const fiscalYearRef = useRef<FiscalYearSnapshot | null>(null);
  const switchTimerRef = useRef<number | null>(null);
  const cardsRef = useRef<GoalProgressSnapshot[]>([]);

  const placementField = placement === 'dashboard' ? 'dashboard_widget' : 'module_list_cards';

  const loadFiscalYear = useCallback(async () => {
    if (goalProgressFiscalYearCache.data && goalProgressFiscalYearCache.expiresAt > Date.now()) {
      fiscalYearRef.current = goalProgressFiscalYearCache.data;
      return;
    }

    if (goalProgressFiscalYearCache.promise) {
      fiscalYearRef.current = await goalProgressFiscalYearCache.promise;
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const pending = (async () => {
      try {
      const { data } = await supabase
        .from('fiscal_years')
        .select('id, title, start_date, end_date, is_active')
        .lte('start_date', today)
        .gte('end_date', today)
        .order('is_active', { ascending: false })
        .order('start_date', { ascending: false })
        .limit(1);

      if (Array.isArray(data) && data[0]) {
        return data[0] as FiscalYearSnapshot;
      }

      const fallback = await supabase
        .from('fiscal_years')
        .select('id, title, start_date, end_date, is_active')
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1);
      return (fallback.data || [])[0] || null;
      } catch {
        return null;
      }
    })();

    goalProgressFiscalYearCache.promise = pending;
    try {
      const result = await pending;
      goalProgressFiscalYearCache = {
        data: result,
        expiresAt: Date.now() + GOAL_PROGRESS_CACHE_TTL_MS,
        promise: null,
      };
      fiscalYearRef.current = result;
    } finally {
      if (goalProgressFiscalYearCache.promise === pending) {
        goalProgressFiscalYearCache.promise = null;
      }
    }
  }, []);

  const loadCards = useCallback(async (nextSelections?: Record<string, GoalPeriodUnit>) => {
    const hadCards = cardsRef.current.length > 0;
    setLoading(!hadCards);
    try {
      const roleContext = await fetchCurrentUserRecordAccessContext(supabase);
      setRolePermissions(roleContext.permissions);
      const resolvedSelections = nextSelections || subperiodSelections;
      const cacheKey = JSON.stringify({
        placementField,
        moduleId: moduleId || null,
        userId: roleContext.userId || null,
        roleId: roleContext.roleId || null,
        selections: Object.keys(resolvedSelections)
          .sort()
          .reduce<Record<string, GoalPeriodUnit>>((acc, key) => {
            acc[key] = resolvedSelections[key];
            return acc;
          }, {}),
      });

      if (!canViewGoalPlacement(roleContext.permissions, placementField)) {
        setCards([]);
        setLoading(false);
        return;
      }

      if (moduleId && !resolveModuleGoalAccessPermissions(roleContext.permissions, moduleId).canViewModuleCards) {
        setCards([]);
        setLoading(false);
        return;
      }

      if (!fiscalYearRef.current) {
        await loadFiscalYear();
      }

      const cached = goalProgressCardsCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        setCards(cached.data);
        setActiveIndex((current) => (cached.data.length === 0 ? 0 : Math.min(current, cached.data.length - 1)));
        setLoading(false);
        return;
      }
      if (cached && (cached.staleExpiresAt || 0) > Date.now()) {
        setCards(cached.data);
        setActiveIndex((current) => (cached.data.length === 0 ? 0 : Math.min(current, cached.data.length - 1)));
        setLoading(false);
      }

      const storageCached = readGoalProgressCardsFromStorage(cacheKey);
      if (storageCached && storageCached.expiresAt > Date.now()) {
        goalProgressCardsCache.set(cacheKey, storageCached);
        setCards(storageCached.data);
        setActiveIndex((current) => (storageCached.data.length === 0 ? 0 : Math.min(current, storageCached.data.length - 1)));
        setLoading(false);
        return;
      }
      if (storageCached && (storageCached.staleExpiresAt || storageCached.expiresAt) > Date.now()) {
        goalProgressCardsCache.set(cacheKey, storageCached);
        setCards(storageCached.data);
        setActiveIndex((current) => (storageCached.data.length === 0 ? 0 : Math.min(current, storageCached.data.length - 1)));
        setLoading(false);
      }

      const pendingCards = goalProgressCardsPromiseCache.get(cacheKey);
      if (pendingCards) {
        const sharedCards = await pendingCards;
        setCards(sharedCards);
        setActiveIndex((current) => (sharedCards.length === 0 ? 0 : Math.min(current, sharedCards.length - 1)));
        setLoading(false);
        return;
      }

      await ensureDefaultSalesInvoiceGoal({ userId: roleContext.userId });

      const cardsPromise = (async () => {
        let query = supabase
          .from('goals')
          .select('*')
          .eq('is_active', true)
          .order('updated_at', { ascending: false });

        if (moduleId) {
          query = query.eq('module_id', moduleId);
        }

        const { data, error } = await query;
        if (error) throw error;

        const directory = await fetchAssigneeDirectory(supabase);

        const visibleGoals = dedupeGoalsForDisplay(
          (data || [])
            .map((item) => normalizeGoalRecord(item))
            .filter((goal) => resolveModuleGoalAccessPermissions(roleContext.permissions, goal.module_id).canViewGoal)
            .filter((goal) => canUserViewGoalResults(goal, roleContext.userId, roleContext.roleId))
        );

        if (visibleGoals.length > 0 && cardsRef.current.length === 0) {
          const fallbackCards = visibleGoals
            .map((goal) =>
              buildGoalFallbackProgressSnapshot(goal, {
                fiscalYear: fiscalYearRef.current,
                selectedSubperiodUnit: nextSelections?.[goal.id] || subperiodSelections[goal.id] || goal.subperiod_unit,
              })
            )
            .filter(Boolean) as GoalProgressSnapshot[];
          setCards(fallbackCards);
          setActiveIndex((current) => (fallbackCards.length === 0 ? 0 : Math.min(current, fallbackCards.length - 1)));
          setLoading(false);
        }

        const prepared = await mapWithConcurrency(
          visibleGoals,
          GOAL_PROGRESS_COMPUTE_CONCURRENCY,
          async (goal) => {
            const selectedSubperiodUnit =
              nextSelections?.[goal.id] || subperiodSelections[goal.id] || goal.subperiod_unit;
            try {
              return await executeGoalProgress(goal, {
                userId: roleContext.userId,
                roleId: roleContext.roleId,
                orgId: roleContext.orgId,
                allowedRoleIds: roleContext.allowedRoleIds,
                allowedUserIds: roleContext.allowedUserIds,
                permissions: roleContext.permissions,
                fiscalYear: fiscalYearRef.current,
                selectedSubperiodUnit,
                cache: rowCacheRef.current,
                fallbackSubjects: resolveGoalAssignedMembers(goal, directory),
              });
            } catch {
              return buildGoalFallbackProgressSnapshot(goal, {
                fiscalYear: fiscalYearRef.current,
                selectedSubperiodUnit,
              });
            }
          }
        );

        return prepared.filter(Boolean) as GoalProgressSnapshot[];
      })();

      goalProgressCardsPromiseCache.set(cacheKey, cardsPromise);
      try {
        const prepared = await cardsPromise;
        goalProgressCardsCache.set(cacheKey, {
          data: prepared,
          expiresAt: Date.now() + GOAL_PROGRESS_CACHE_TTL_MS,
          staleExpiresAt: Date.now() + GOAL_PROGRESS_STALE_CACHE_TTL_MS,
        });
        writeGoalProgressCardsToStorage(cacheKey, {
          data: prepared,
          expiresAt: Date.now() + GOAL_PROGRESS_CACHE_TTL_MS,
          staleExpiresAt: Date.now() + GOAL_PROGRESS_STALE_CACHE_TTL_MS,
        });
        setCards(prepared);
        setActiveIndex((current) => (prepared.length === 0 ? 0 : Math.min(current, prepared.length - 1)));
      } finally {
        if (goalProgressCardsPromiseCache.get(cacheKey) === cardsPromise) {
          goalProgressCardsPromiseCache.delete(cacheKey);
        }
      }
    } catch {
      if (!hadCards) setCards([]);
    } finally {
      setLoading(false);
    }
  }, [loadFiscalYear, moduleId, placementField, subperiodSelections]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  const clearProgressCaches = useCallback(() => {
    rowCacheRef.current = new Map();
    goalProgressCardsCache.clear();
    goalProgressCardsPromiseCache.clear();
  }, []);

  useEffect(() => {
    rowCacheRef.current = new Map();
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    const refresh = () => {
      clearProgressCaches();
      void loadCards();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === GOAL_PROGRESS_CACHE_STORAGE_KEY) refresh();
    };

    window.addEventListener(GOAL_PROGRESS_REFRESH_EVENT, refresh);
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('storage', handleStorage);
    const pollHandle = window.setInterval(refresh, 90_000);

    const channel = supabase
      .channel(`goal-progress-live-${placement}-${moduleId || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, refresh);

    const targetTable = moduleId ? MODULES[moduleId]?.table : null;
    if (targetTable) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: targetTable }, refresh);
    }

    channel.subscribe();

    return () => {
      window.removeEventListener(GOAL_PROGRESS_REFRESH_EVENT, refresh);
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('storage', handleStorage);
      window.clearInterval(pollHandle);
      supabase.removeChannel(channel);
    };
  }, [clearProgressCaches, loadCards, moduleId, placement]);

  useEffect(() => {
    setVisibleIndex((current) => {
      if (cards.length === 0) return 0;
      return Math.min(current, cards.length - 1);
    });
  }, [cards.length]);

  useEffect(() => {
    if (switchTimerRef.current) {
      window.clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }

    if (activeIndex === visibleIndex) {
      setIsSwitching(false);
      return;
    }

    setIsSwitching(true);
    switchTimerRef.current = window.setTimeout(() => {
      setVisibleIndex(activeIndex);
      setIsSwitching(false);
      switchTimerRef.current = null;
    }, 140);

    return () => {
      if (switchTimerRef.current) {
        window.clearTimeout(switchTimerRef.current);
        switchTimerRef.current = null;
      }
    };
  }, [activeIndex, visibleIndex]);

  useEffect(() => {
    if (!autoPlay || cards.length <= 1 || isAutoPlayPaused) return;
    const handle = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % cards.length);
    }, 6500);
    return () => window.clearInterval(handle);
  }, [autoPlay, cards.length, isAutoPlayPaused]);

  const activeCard = cards[visibleIndex] || null;
  const canViewActiveGoalResults = !!activeCard;

  useEffect(() => {
    onActiveCardChange?.(activeCard);
  }, [activeCard, onActiveCardChange]);

  const handleSubperiodChange = async (goalId: string, unit: GoalPeriodUnit) => {
    const nextSelections = {
      ...subperiodSelections,
      [goalId]: unit,
    };
    setSubperiodSelections(nextSelections);
    await loadCards(nextSelections);
  };

  const shellClasses = activeCard ? toneClassMap[activeCard.tone] : toneClassMap.base;
  const mainPercent = activeCard?.targetValue
    ? clampPercent((activeCard.achievedValue / activeCard.targetValue) * 100)
    : 0;
  const subPercent = activeCard?.subTargetValue
    ? clampPercent((activeCard.subAchievedValue / activeCard.subTargetValue) * 100)
    : 0;

  const cardFooter = useMemo(() => {
    if (!activeCard || activeCard.levels.length === 0) return null;
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {activeCard.levels.map((level) => (
          <Tag
            key={level.key}
            className={`!m-0 rounded-full border px-3 py-1 text-[11px] ${shellClasses.tag}`}
          >
            {level.label}: {formatMetricNumber(level.value, activeCard.goal.metric_type)}
          </Tag>
        ))}
      </div>
    );
  }, [activeCard, shellClasses.tag]);

  const primaryReward = useMemo(() => {
    const rewardRules = Array.isArray(activeCard?.goal?.config?.goal_reward_rules)
      ? activeCard!.goal.config!.goal_reward_rules!
      : [];
    return rewardRules.find((item: any) => item?.is_primary === true) || rewardRules[0] || null;
  }, [activeCard]);

  const primaryRewardToneClass = primaryReward
    ? String(primaryReward.output_type || 'bonus').trim() === 'penalty'
      ? 'border-red-200 bg-red-50/90 text-red-700 dark:border-red-800/60 dark:bg-red-950/20 dark:text-red-100'
      : String(primaryReward.output_type || '').trim() === 'score'
        ? 'border-violet-200 bg-violet-50/90 text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/20 dark:text-violet-100'
        : 'border-emerald-200 bg-emerald-50/90 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-100'
    : '';

  const primaryRewardTriggerLabel = useMemo(() => {
    const trigger = String(primaryReward?.trigger_type || '').trim();
    if (trigger === 'touch') return 'با هر ورود به کارت هدف';
    if (trigger === 'achieve') return 'با تحقق کامل هدف';
    if (trigger === 'bronze') return 'با تحقق سطح برنزی';
    if (trigger === 'silver') return 'با تحقق سطح نقره‌ای';
    if (trigger === 'gold') return 'با تحقق سطح طلایی';
    return '';
  }, [primaryReward]);

  const editorModal = editingGoal ? (
    <GoalEditorModal
      open={!!editingGoal}
      onClose={() => setEditingGoal(null)}
      onSaved={() => {
        setEditingGoal(null);
        clearProgressCaches();
        dispatchGoalProgressRefresh();
        void loadCards();
      }}
      initialModuleId={editingGoal.module_id}
      record={editingGoal}
      canEdit={resolveModuleGoalAccessPermissions(rolePermissions, editingGoal.module_id).canEditGoal}
      permissions={rolePermissions}
    />
  ) : null;

  const resultsModal = resultsGoal ? (
    <GoalResultsModal
      open={!!resultsGoal}
      goal={resultsGoal}
      onClose={() => setResultsGoal(null)}
      onEdit={(goal) => {
        setResultsGoal(null);
        setEditingGoal(goal);
      }}
      canEdit={resolveModuleGoalAccessPermissions(rolePermissions, resultsGoal.module_id).canEditGoal}
    />
  ) : null;

  if (loading) {
    if (placement === 'module_list') {
      return null;
    }

    return (
      <div className={`rounded-[1.6rem] border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#1a1a1a] ${className}`}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    );
  }

  if (!activeCard) {
    if (hideWhenEmpty) return null;
    return placement === 'dashboard' ? (
      <div className={`rounded-[1.6rem] border border-dashed border-gray-200 bg-white/80 p-4 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-[#1a1a1a] ${className}`}>
        <Empty description="هدف فعالی برای نمایش وجود ندارد." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    ) : null;
  }

  if (placement === 'module_list') {
    return (
      <>
      <div
        role={canViewActiveGoalResults ? 'button' : undefined}
        tabIndex={canViewActiveGoalResults ? 0 : undefined}
        onClick={() => {
          if (canViewActiveGoalResults && activeCard) setResultsGoal(activeCard.goal);
        }}
        onKeyDown={(event) => {
          if (!canViewActiveGoalResults || !activeCard) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setResultsGoal(activeCard.goal);
          }
        }}
        className={`relative overflow-hidden rounded-lg border border-gray-200 bg-gradient-to-br px-2.5 py-1 shadow-sm dark:border-gray-800 ${canViewActiveGoalResults ? 'cursor-pointer hover:border-leather-300' : ''} ${shellClasses.shell} ${className}`}
      >
        <div className={`flex h-7 items-center gap-2 transition-all duration-200 ease-out ${isSwitching ? 'translate-x-1 opacity-40' : 'translate-x-0 opacity-100'}`}>
          <div className="min-w-0 w-[108px] shrink-0 md:w-[132px]">
            <div className="truncate text-[11px] font-black leading-4 text-gray-800 dark:text-gray-100">
              {activeCard.goal.name}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="h-1.5 min-w-[72px] flex-1 overflow-hidden rounded-full bg-white/70 dark:bg-black/20">
                <div
                  className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-300 ease-out ${shellClasses.bar}`}
                  style={{ width: `${mainPercent}%` }}
                />
              </div>
              <div className="shrink-0 whitespace-nowrap text-[9px] font-semibold text-gray-600 dark:text-gray-300">
                {formatMetricNumber(activeCard.achievedValue, activeCard.goal.metric_type)} / {formatMetricNumber(activeCard.targetValue, activeCard.goal.metric_type)}
              </div>
            </div>
          </div>

          {cards.length > 1 ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="small"
                shape="circle"
                icon={<RightOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex((current) => (current - 1 + cards.length) % cards.length);
                }}
                className="!h-5 !w-5 !min-w-5"
              />
              <Button
                size="small"
                shape="circle"
                icon={<LeftOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex((current) => (current + 1) % cards.length);
                }}
                className="!h-5 !w-5 !min-w-5"
              />
              {showPlaybackControls ? (
                <Button
                  size="small"
                  shape="circle"
                  icon={isAutoPlayPaused ? <CaretRightOutlined /> : <PauseOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsAutoPlayPaused((current) => !current);
                  }}
                  className="!h-5 !w-5 !min-w-5"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {editorModal}
      {resultsModal}
      </>
    );
  }

  return (
    <>
    <div
      role={canViewActiveGoalResults ? 'button' : undefined}
      tabIndex={canViewActiveGoalResults ? 0 : undefined}
      onClick={() => {
        if (canViewActiveGoalResults && activeCard) setResultsGoal(activeCard.goal);
      }}
      onKeyDown={(event) => {
        if (!canViewActiveGoalResults || !activeCard) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setResultsGoal(activeCard.goal);
        }
      }}
      className={`relative overflow-hidden rounded-[1.7rem] border border-gray-200 bg-gradient-to-br p-4 shadow-sm dark:border-gray-800 ${canViewActiveGoalResults ? 'cursor-pointer hover:border-leather-300' : ''} ${shellClasses.shell} ${className}`}
    >
      <div className={`transition-all duration-200 ease-out ${isSwitching ? 'translate-x-1 opacity-40' : 'translate-x-0 opacity-100'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <span>{activeCard.moduleLabel}</span>
            <span>•</span>
            <span>{activeCard.goal.goal_scope === 'team' ? 'هدف تیمی' : 'هدف فردی'}</span>
            {activeCard.activeLevelKey ? (
              <>
                <span>•</span>
                <span>{activeCard.levels.find((level) => level.key === activeCard.activeLevelKey)?.label}</span>
              </>
            ) : null}
          </div>
          <div className="truncate text-base font-black text-gray-800 dark:text-gray-100 md:text-lg">
            {activeCard.goal.name}
          </div>
          {activeCard.isSharedView && activeCard.subjectLabel ? (
            <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              بیشترین تحقق: {activeCard.subjectLabel}
            </div>
          ) : null}
        </div>

        {cards.length > 1 ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="small"
              shape="circle"
              icon={<RightOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                setActiveIndex((current) => (current - 1 + cards.length) % cards.length);
              }}
            />
            <Button
              size="small"
              shape="circle"
              icon={<LeftOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                setActiveIndex((current) => (current + 1) % cards.length);
              }}
            />
            {showPlaybackControls ? (
              <Button
                size="small"
                shape="circle"
                icon={isAutoPlayPaused ? <CaretRightOutlined /> : <PauseOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsAutoPlayPaused((current) => !current);
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 text-[11px] text-gray-500 dark:text-gray-400">
        بازه اصلی: از {activeCard.mainRange.startLabel} تا {activeCard.mainRange.endLabel}
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/70 dark:bg-black/20">
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-300 ease-out ${shellClasses.bar}`}
          style={{ width: `${mainPercent}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
        <span>
          محقق‌شده: {formatMetricNumber(activeCard.achievedValue, activeCard.goal.metric_type)}
        </span>
        <span>
          هدف: {formatMetricNumber(activeCard.targetValue, activeCard.goal.metric_type)}
        </span>
      </div>

      {primaryReward ? (
        <div className={`mt-4 rounded-2xl border px-4 py-3 shadow-sm ${primaryRewardToneClass}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold opacity-80">
                {primaryReward.is_primary ? 'پاداش/جریمه اصلی هدف' : 'پاداش هدف'}
              </div>
              <div className="mt-1 truncate text-sm font-black">
                {String(primaryReward.title || '').trim() || 'فرمول پاداش هدف'}
              </div>
              {primaryRewardTriggerLabel ? (
                <div className="mt-1 text-[11px] opacity-80">
                  {primaryRewardTriggerLabel}
                </div>
              ) : null}
            </div>
            <Tag
              className="!m-0 rounded-full"
              color={
                String(primaryReward.output_type || '').trim() === 'penalty'
                  ? 'red'
                  : String(primaryReward.output_type || '').trim() === 'score'
                    ? 'purple'
                    : 'green'
              }
            >
              {String(primaryReward.output_type || '').trim() === 'penalty'
                ? 'جریمه'
                : String(primaryReward.output_type || '').trim() === 'wage'
                  ? 'دستمزد'
                  : String(primaryReward.output_type || '').trim() === 'score'
                    ? 'امتیاز'
                    : 'پاداش'}
            </Tag>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          بازه فرعی: از {activeCard.subRange.startLabel} تا {activeCard.subRange.endLabel}
        </div>
        <Select
          size="small"
          className="min-w-[120px]"
          value={activeCard.selectedSubperiodUnit}
          options={GOAL_PERIOD_UNIT_OPTIONS.filter((item) => activeCard.availableSubperiodUnits.includes(item.value))}
          onClick={(event) => event.stopPropagation()}
          onChange={(value) => void handleSubperiodChange(activeCard.goal.id, value as GoalPeriodUnit)}
        />
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70 dark:bg-black/20">
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-300 ease-out ${shellClasses.subBar}`}
          style={{ width: `${subPercent}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
        <span>
          بازه فرعی: {formatMetricNumber(activeCard.subAchievedValue, activeCard.goal.metric_type)}
        </span>
        <span>
          هدف فرعی: {formatMetricNumber(activeCard.subTargetValue, activeCard.goal.metric_type)}
        </span>
      </div>

      {cardFooter}

      {cards.length > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {cards.map((item, index) => (
            <button
              key={item.goal.id}
              type="button"
              aria-label={item.goal.name}
              onClick={(event) => {
                event.stopPropagation();
                setActiveIndex(index);
              }}
              className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-leather-600' : 'w-2.5 bg-gray-300 dark:bg-gray-700'}`}
            />
          ))}
        </div>
      ) : null}
      </div>
    </div>
    {editorModal}
    {resultsModal}
    </>
  );
};

export default GoalProgressSlider;
