import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Select, Skeleton, Tag } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import {
  canViewGoalPlacement,
  executeGoalProgress,
  isGoalVisibleToUser,
  normalizeGoalRecord,
} from '../../utils/goals';
import { type FiscalYearSnapshot } from '../../utils/goalPeriods';
import {
  fetchCurrentUserRoleContext,
} from '../../utils/permissions';
import {
  GOAL_PERIOD_UNIT_OPTIONS,
  type GoalPeriodUnit,
  type GoalProgressSnapshot,
} from '../../utils/goalTypes';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

type GoalProgressSliderProps = {
  moduleId?: string | null;
  placement: 'module_list' | 'dashboard';
  className?: string;
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
}) => {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<GoalProgressSnapshot[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [subperiodSelections, setSubperiodSelections] = useState<Record<string, GoalPeriodUnit>>({});
  const rowCacheRef = useRef<Map<string, any[]>>(new Map());
  const permissionsRef = useRef<PermissionMap | null>(null);
  const currentUserRef = useRef<string | null>(null);
  const currentRoleRef = useRef<string | null>(null);
  const fiscalYearRef = useRef<FiscalYearSnapshot | null>(null);

  const placementField = placement === 'dashboard' ? 'dashboard_widget' : 'module_list_cards';

  const loadFiscalYear = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
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
        fiscalYearRef.current = data[0] as FiscalYearSnapshot;
        return;
      }

      const fallback = await supabase
        .from('fiscal_years')
        .select('id, title, start_date, end_date, is_active')
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1);
      fiscalYearRef.current = (fallback.data || [])[0] || null;
    } catch {
      fiscalYearRef.current = null;
    }
  }, []);

  const loadCards = useCallback(async (nextSelections?: Record<string, GoalPeriodUnit>) => {
    setLoading(true);
    try {
      const roleContext = await fetchCurrentUserRoleContext(supabase);
      permissionsRef.current = roleContext.permissions;
      currentUserRef.current = roleContext.userId;
      currentRoleRef.current = roleContext.roleId;

      if (!canViewGoalPlacement(roleContext.permissions, placementField)) {
        setCards([]);
        setLoading(false);
        return;
      }

      if (moduleId && roleContext.permissions?.[moduleId]?.view === false) {
        setCards([]);
        setLoading(false);
        return;
      }

      if (!fiscalYearRef.current) {
        await loadFiscalYear();
      }

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

      const visibleGoals = (data || [])
        .map((item) => normalizeGoalRecord(item))
        .filter((goal) => roleContext.permissions?.[goal.module_id]?.view !== false)
        .filter((goal) => isGoalVisibleToUser(goal, roleContext.userId, roleContext.roleId));

      const prepared: GoalProgressSnapshot[] = [];
      for (const goal of visibleGoals) {
        const snapshot = await executeGoalProgress(goal, {
          userId: roleContext.userId,
          roleId: roleContext.roleId,
          permissions: roleContext.permissions,
          fiscalYear: fiscalYearRef.current,
          selectedSubperiodUnit: nextSelections?.[goal.id] || subperiodSelections[goal.id] || goal.subperiod_unit,
          cache: rowCacheRef.current,
        });
        if (snapshot) prepared.push(snapshot);
      }

      setCards(prepared);
      setActiveIndex((current) => (prepared.length === 0 ? 0 : Math.min(current, prepared.length - 1)));
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [loadFiscalYear, moduleId, placementField, subperiodSelections]);

  useEffect(() => {
    rowCacheRef.current = new Map();
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    if (cards.length <= 1) return;
    const handle = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % cards.length);
    }, 6500);
    return () => window.clearInterval(handle);
  }, [cards.length]);

  const activeCard = cards[activeIndex] || null;

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

  if (loading) {
    return (
      <div className={`rounded-[1.6rem] border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#1a1a1a] ${className}`}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    );
  }

  if (!activeCard) {
    return placement === 'dashboard' ? (
      <div className={`rounded-[1.6rem] border border-dashed border-gray-200 bg-white/80 p-4 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-[#1a1a1a] ${className}`}>
        <Empty description="هدف فعالی برای نمایش وجود ندارد." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    ) : null;
  }

  return (
    <div className={`relative overflow-hidden rounded-[1.7rem] border border-gray-200 bg-gradient-to-br p-4 shadow-sm dark:border-gray-800 ${shellClasses.shell} ${className}`}>
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
        </div>

        {cards.length > 1 ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="small"
              shape="circle"
              icon={<RightOutlined />}
              onClick={() => setActiveIndex((current) => (current - 1 + cards.length) % cards.length)}
            />
            <Button
              size="small"
              shape="circle"
              icon={<LeftOutlined />}
              onClick={() => setActiveIndex((current) => (current + 1) % cards.length)}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4 text-[11px] text-gray-500 dark:text-gray-400">
        بازه اصلی: از {activeCard.mainRange.startLabel} تا {activeCard.mainRange.endLabel}
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/70 dark:bg-black/20">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${shellClasses.bar}`}
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

      <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          بازه فرعی: از {activeCard.subRange.startLabel} تا {activeCard.subRange.endLabel}
        </div>
        <Select
          size="small"
          className="min-w-[120px]"
          value={activeCard.selectedSubperiodUnit}
          options={GOAL_PERIOD_UNIT_OPTIONS.filter((item) => activeCard.availableSubperiodUnits.includes(item.value))}
          onChange={(value) => void handleSubperiodChange(activeCard.goal.id, value as GoalPeriodUnit)}
        />
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70 dark:bg-black/20">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${shellClasses.subBar}`}
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
              onClick={() => setActiveIndex(index)}
              className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-leather-600' : 'w-2.5 bg-gray-300 dark:bg-gray-700'}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default GoalProgressSlider;
