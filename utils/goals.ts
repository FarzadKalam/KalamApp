import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { FieldType } from '../types';
import {
  canAccessAssignedRecord,
  GOALS_PERMISSION_KEY,
  type PermissionMap,
} from './permissions';
import {
  buildGoalCurrentRange,
  buildGoalRangeSnapshot,
  calculateRangeRatio,
  clampGoalSubperiodUnit,
  getAvailableGoalSubperiodUnits,
  type FiscalYearSnapshot,
} from './goalPeriods';
import {
  GOAL_LEVEL_META,
  type GoalLevelDefinition,
  type GoalMetricType,
  type GoalPeriodUnit,
  type GoalProgressSnapshot,
  type GoalRecord,
  type GoalTone,
} from './goalTypes';
import { evaluateWorkflowConditions } from './workflowRuntime';

const GOAL_NUMERIC_FIELD_TYPES = new Set<FieldType>([
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.PERCENTAGE,
  FieldType.STOCK,
]);

const GOAL_DATE_FIELD_TYPES = new Set<FieldType>([
  FieldType.DATE,
  FieldType.DATETIME,
]);

const normalizeArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveMetricValue = (rows: any[], metricType: GoalMetricType, metricFieldKey?: string | null) => {
  if (metricType === 'count') return rows.length;
  const values = rows
    .map((row) => Number(row?.[String(metricFieldKey || '')] || 0))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return 0;
  if (metricType === 'avg') {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return values.reduce((sum, value) => sum + value, 0);
};

const buildGoalLevels = (goal: GoalRecord): GoalLevelDefinition[] =>
  (['bronze', 'silver', 'gold'] as const)
    .map((key) => ({
      key,
      label: GOAL_LEVEL_META[key].label,
      value: normalizeNumber((goal as any)?.[`${key}_value`]),
    }))
    .filter((item) => item.value > 0);

const resolveGoalTone = (achievedValue: number, levels: GoalLevelDefinition[]): { tone: GoalTone; activeLevelKey: 'bronze' | 'silver' | 'gold' | null } => {
  if (levels.some((item) => item.key === 'gold' && achievedValue >= item.value)) {
    return { tone: 'gold', activeLevelKey: 'gold' };
  }
  if (levels.some((item) => item.key === 'silver' && achievedValue >= item.value)) {
    return { tone: 'silver', activeLevelKey: 'silver' };
  }
  if (levels.some((item) => item.key === 'bronze' && achievedValue >= item.value)) {
    return { tone: 'bronze', activeLevelKey: 'bronze' };
  }
  return { tone: 'base', activeLevelKey: null };
};

export const normalizeGoalRecord = (value: any): GoalRecord => ({
  ...value,
  goal_scope: String(value?.goal_scope || 'personal') === 'team' ? 'team' : 'personal',
  period_unit: (String(value?.period_unit || 'month') as GoalPeriodUnit),
  subperiod_unit: (String(value?.subperiod_unit || 'week') as GoalPeriodUnit),
  metric_type: (String(value?.metric_type || 'count') as GoalMetricType),
  assignee_user_ids: normalizeArray(value?.assignee_user_ids),
  assignee_role_ids: normalizeArray(value?.assignee_role_ids),
  conditions_all: Array.isArray(value?.conditions_all) ? value.conditions_all : [],
  conditions_any: Array.isArray(value?.conditions_any) ? value.conditions_any : [],
  config: value?.config && typeof value.config === 'object' ? value.config : {},
});

export const getGoalModuleOptions = (permissions?: PermissionMap | null) =>
  Object.values(MODULES)
    .filter((module) => permissions?.[module.id]?.view !== false)
    .map((module) => ({
      label: module.titles.fa,
      value: module.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fa'));

export const getGoalNumericFieldOptions = (moduleId?: string | null) =>
  (MODULES[String(moduleId || '').trim()]?.fields || [])
    .filter((field) => GOAL_NUMERIC_FIELD_TYPES.has(field.type))
    .map((field) => ({
      label: field.labels?.fa || field.key,
      value: field.key,
    }));

export const getGoalDateFieldOptions = (moduleId?: string | null) => {
  const module = MODULES[String(moduleId || '').trim()];
  if (!module) return [];
  const options = (module.fields || [])
    .filter((field) => GOAL_DATE_FIELD_TYPES.has(field.type))
    .map((field) => ({
      label: field.labels?.fa || field.key,
      value: field.key,
    }));

  const syntheticOptions = [
    { label: 'تاریخ ایجاد', value: 'created_at' },
    { label: 'آخرین بروزرسانی', value: 'updated_at' },
  ];

  return Array.from(
    new Map(
      [...syntheticOptions, ...options].map((item) => [item.value, item] as const)
    ).values()
  );
};

export const isGoalVisibleToUser = (
  goal: GoalRecord,
  userId: string | null,
  roleId: string | null
) => {
  const userIds = normalizeArray(goal.assignee_user_ids);
  const roleIds = normalizeArray(goal.assignee_role_ids);
  if (userIds.length === 0 && roleIds.length === 0) return true;
  return (!!userId && userIds.includes(userId)) || (!!roleId && roleIds.includes(roleId));
};

export const canViewGoalPlacement = (
  permissions: PermissionMap | null | undefined,
  placement: 'module_list_button' | 'module_list_cards' | 'dashboard_widget'
) => {
  const perm = permissions?.[GOALS_PERMISSION_KEY] || {};
  const fields = perm.fields || {};
  return perm.view !== false && fields[placement] !== false;
};

const resolveMetricLabel = (goal: GoalRecord) => {
  if (goal.metric_type === 'count') {
    return 'رکورد';
  }
  if (goal.metric_type === 'avg') {
    return 'میانگین';
  }
  return 'جمع';
};

const resolveGoalTargetValue = (goal: GoalRecord, levels: GoalLevelDefinition[]) => {
  const explicit = normalizeNumber(goal.target_value);
  if (explicit > 0) return explicit;
  if (levels.length > 0) {
    return levels.reduce((max, item) => Math.max(max, item.value), 0);
  }
  return 0;
};

const resolveGoalDateFilterValue = (row: any, dateFieldKey: string) => {
  const raw = row?.[dateFieldKey];
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dateOnly = new Date(`${raw}T12:00:00`);
    if (!Number.isNaN(dateOnly.getTime())) return dateOnly;
  }

  return null;
};

const resolveFilterFieldKey = (goal: GoalRecord) => {
  const preferred = String(goal.date_field_key || '').trim();
  if (preferred) return preferred;
  return 'created_at';
};

const queryRowsByDateRange = async (
  table: string,
  dateFieldKey: string,
  startValue: string,
  endValue: string
) => {
  const pageSize = 1000;
  let from = 0;
  let rows: any[] = [];

  while (true) {
    let query = supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1);

    if (dateFieldKey) {
      query = query.gte(dateFieldKey, startValue).lte(dateFieldKey, endValue);
    }

    const { data, error } = await query;
    if (error) throw error;
    const chunk = data || [];
    rows = rows.concat(chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};

const loadScopedRows = async (
  goal: GoalRecord,
  range: { startIso: string; endIso: string },
  options: {
    userId: string | null;
    roleId: string | null;
    permissions?: PermissionMap | null;
    cache: Map<string, any[]>;
  }
) => {
  const module = MODULES[goal.module_id];
  if (!module) return [];

  const dateFieldKey = resolveFilterFieldKey(goal);
  const fieldMeta = module.fields.find((field) => field.key === dateFieldKey);
  const cacheKey = `${goal.module_id}:${dateFieldKey}:${range.startIso}:${range.endIso}`;
  if (options.cache.has(cacheKey)) {
    return options.cache.get(cacheKey) || [];
  }

  const startValue =
    fieldMeta?.type === FieldType.DATE
      ? range.startIso.slice(0, 10)
      : range.startIso;
  const endValue =
    fieldMeta?.type === FieldType.DATE
      ? range.endIso.slice(0, 10)
      : range.endIso;

  let rows: any[] = [];
  try {
    rows = await queryRowsByDateRange(module.table, dateFieldKey, startValue, endValue);
  } catch {
    rows = await queryRowsByDateRange(module.table, '', range.startIso, range.endIso);
  }

  const modulePerm = options.permissions?.[goal.module_id] || {};
  const filteredByDate = rows.filter((row) => {
    const dateValue = resolveGoalDateFilterValue(row, dateFieldKey);
    if (!dateValue) return false;
    return (
      dateValue.getTime() >= new Date(range.startIso).getTime() &&
      dateValue.getTime() <= new Date(range.endIso).getTime()
    );
  });

  const scoped = filteredByDate.filter((row) =>
    canAccessAssignedRecord(row, options.userId, options.roleId, modulePerm.record_scope || 'all')
  );
  options.cache.set(cacheKey, scoped);
  return scoped;
};

const filterGoalRows = async (goal: GoalRecord, rows: any[]) => {
  const filtered: any[] = [];
  for (const row of rows) {
    const passed = await evaluateWorkflowConditions({
      conditionsAll: goal.conditions_all,
      conditionsAny: goal.conditions_any,
      currentRecord: row,
      moduleId: goal.module_id,
    });
    if (passed) filtered.push(row);
  }
  return filtered;
};

export const executeGoalProgress = async (
  goalInput: GoalRecord,
  options: {
    userId: string | null;
    roleId: string | null;
    permissions?: PermissionMap | null;
    fiscalYear?: FiscalYearSnapshot | null;
    selectedSubperiodUnit?: GoalPeriodUnit | null;
    cache?: Map<string, any[]>;
  }
): Promise<GoalProgressSnapshot | null> => {
  const goal = normalizeGoalRecord(goalInput);
  const module = MODULES[goal.module_id];
  if (!module) return null;

  const subperiodUnit = clampGoalSubperiodUnit(
    goal.period_unit,
    options.selectedSubperiodUnit || goal.subperiod_unit
  );

  const mainBounds = buildGoalCurrentRange(goal.period_unit, options.fiscalYear);
  const subBounds = buildGoalCurrentRange(subperiodUnit, options.fiscalYear);
  const mainRange = buildGoalRangeSnapshot(mainBounds.start, mainBounds.end);
  const subRange = buildGoalRangeSnapshot(subBounds.start, subBounds.end);

  const cache = options.cache || new Map<string, any[]>();
  const [mainRows, subRows] = await Promise.all([
    loadScopedRows(goal, mainRange, {
      userId: options.userId,
      roleId: options.roleId,
      permissions: options.permissions,
      cache,
    }),
    loadScopedRows(goal, subRange, {
      userId: options.userId,
      roleId: options.roleId,
      permissions: options.permissions,
      cache,
    }),
  ]);

  const [filteredMainRows, filteredSubRows] = await Promise.all([
    filterGoalRows(goal, mainRows),
    filterGoalRows(goal, subRows),
  ]);

  const levels = buildGoalLevels(goal);
  const targetValue = resolveGoalTargetValue(goal, levels);
  const achievedValue = resolveMetricValue(filteredMainRows, goal.metric_type, goal.metric_field_key);
  const subAchievedValue = resolveMetricValue(filteredSubRows, goal.metric_type, goal.metric_field_key);
  const ratio = calculateRangeRatio(mainRange, subRange);
  const subTargetValue = targetValue > 0 ? targetValue * ratio : 0;
  const { tone, activeLevelKey } = resolveGoalTone(achievedValue, levels);

  return {
    goal,
    achievedValue,
    targetValue,
    subAchievedValue,
    subTargetValue,
    mainRange,
    subRange,
    tone,
    activeLevelKey,
    levels,
    availableSubperiodUnits: getAvailableGoalSubperiodUnits(goal.period_unit),
    selectedSubperiodUnit: subperiodUnit,
    metricLabel: resolveMetricLabel(goal),
    moduleLabel: module.titles.fa,
  };
};
