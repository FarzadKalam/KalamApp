import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { FieldType } from '../types';
import {
  canAccessAssignedRecord,
  GOALS_PERMISSION_KEY,
  type PermissionMap,
} from './permissions';
import {
  buildGoalExplicitRange,
  buildGoalCurrentRange,
  buildGoalRangeSnapshot,
  calculateRangeRatio,
  clampGoalSubperiodUnit,
  clampGoalRangeToBounds,
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

export const GOAL_ALL_USERS_VALUE = '__all_users__';

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

export const isGoalAssignedToAllUsers = (goal: GoalRecord) =>
  String(goal?.config?.assignment_users_mode || '').trim() === 'all';

export const getGoalUserSelectionValue = (goal?: GoalRecord | null) => {
  if (!goal) return [];
  if (isGoalAssignedToAllUsers(goal)) return [GOAL_ALL_USERS_VALUE];
  return normalizeArray(goal.assignee_user_ids);
};

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
  if (isGoalAssignedToAllUsers(goal)) return true;
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

const resolveGoalModuleLabel = (goal: GoalRecord) =>
  MODULES[goal.module_id]?.titles?.fa || goal.module_id;

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

const getGoalExplicitRangeInput = (goal: GoalRecord) => ({
  startDate: typeof goal?.config?.goal_start_date === 'string' ? goal.config.goal_start_date : null,
  endDate: typeof goal?.config?.goal_end_date === 'string' ? goal.config.goal_end_date : null,
});

const resolveGoalPeriodBounds = (
  goal: GoalRecord,
  subperiodUnit: GoalPeriodUnit,
  fiscalYear?: FiscalYearSnapshot | null
) => {
  const explicitBounds = buildGoalExplicitRange(getGoalExplicitRangeInput(goal));
  if (explicitBounds) {
    const rawSubBounds = buildGoalCurrentRange(subperiodUnit, fiscalYear);
    return {
      mainBounds: explicitBounds,
      subBounds: clampGoalRangeToBounds(rawSubBounds, explicitBounds),
    };
  }

  return {
    mainBounds: buildGoalCurrentRange(goal.period_unit, fiscalYear),
    subBounds: buildGoalCurrentRange(subperiodUnit, fiscalYear),
  };
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
    orgId?: string | null;
    allowedRoleIds?: string[];
    allowedUserIds?: string[];
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

  if (rows.length === 0 && dateFieldKey) {
    try {
      rows = await queryRowsByDateRange(module.table, '', range.startIso, range.endIso);
    } catch {
      rows = [];
    }
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
    canAccessAssignedRecord(row, options.userId, options.roleId, modulePerm.record_scope || 'all', {
      currentOrgId: options.orgId,
      allowedRoleIds: options.allowedRoleIds,
      allowedUserIds: options.allowedUserIds,
    })
  );
  options.cache.set(cacheKey, scoped);
  return scoped;
};

const filterGoalRows = async (goal: GoalRecord, rows: any[]) => {
  const filtered: any[] = [];
  for (const row of rows) {
    try {
      const passed = await evaluateWorkflowConditions({
        conditionsAll: goal.conditions_all,
        conditionsAny: goal.conditions_any,
        currentRecord: row,
        moduleId: goal.module_id,
      });
      if (passed) filtered.push(row);
    } catch {
      continue;
    }
  }
  return filtered;
};

const DEFAULT_SALES_INVOICE_GOAL_SEED_KEY = 'sales_invoices_monthly_paid_total_v1';
const DEFAULT_SALES_INVOICE_GOAL_CHECK_TTL_MS = 5 * 60_000;

let defaultSalesInvoiceGoalCheckCache: {
  checkedAt: number;
  promise: Promise<void> | null;
} = {
  checkedAt: 0,
  promise: null,
};

export const ensureDefaultSalesInvoiceGoal = async (options?: { userId?: string | null }) => {
  const now = Date.now();
  if (defaultSalesInvoiceGoalCheckCache.checkedAt > 0 && (now - defaultSalesInvoiceGoalCheckCache.checkedAt) < DEFAULT_SALES_INVOICE_GOAL_CHECK_TTL_MS) {
    return;
  }
  if (defaultSalesInvoiceGoalCheckCache.promise) {
    return defaultSalesInvoiceGoalCheckCache.promise;
  }

  const pending = (async () => {
  try {
    const { data: existingRows, error: existingError } = await supabase
      .from('goals')
      .select('id, module_id, config')
      .eq('module_id', 'invoices')
      .limit(50);

    if (existingError) throw existingError;

    const hasSeed = (existingRows || []).some((row: any) => {
      const config = row?.config && typeof row.config === 'object' ? row.config : {};
      return String(config?.seed_key || '').trim() === DEFAULT_SALES_INVOICE_GOAL_SEED_KEY;
    });

    if (hasSeed) return;

    const userId = options?.userId || (await supabase.auth.getUser()).data?.user?.id || null;
    const payload = {
      module_id: 'invoices',
      name: 'فروش ماهانه تسویه‌شده',
      description: 'جمع مبلغ فاکتورهای فروش با وضعیت تسویه‌شده یا تکمیل‌شده در بازه ماه جاری',
      goal_scope: 'team',
      period_unit: 'month',
      subperiod_unit: 'week',
      metric_type: 'sum',
      metric_field_key: 'total_invoice_amount',
      date_field_key: 'invoice_date',
      target_value: null,
      levels_enabled: true,
      bronze_value: 500000000,
      silver_value: 1000000000,
      gold_value: 1500000000,
      assignee_user_ids: [],
      assignee_role_ids: [],
      conditions_all: [],
      conditions_any: [
        {
          id: 'seed_goal_condition_invoices_paid',
          field: 'status',
          operator: 'in',
          value: ['settled', 'completed'],
        },
      ],
      config: {
        seed_key: DEFAULT_SALES_INVOICE_GOAL_SEED_KEY,
        assignment_users_mode: 'all',
        is_seeded_default: true,
      },
      is_active: true,
      created_by: userId,
      updated_by: userId,
    };

    const { error } = await supabase.from('goals').insert([payload]);
    if (error) throw error;
  } catch {
    return;
  }
  })();

  defaultSalesInvoiceGoalCheckCache.promise = pending;
  try {
    await pending;
    defaultSalesInvoiceGoalCheckCache.checkedAt = Date.now();
  } finally {
    if (defaultSalesInvoiceGoalCheckCache.promise === pending) {
      defaultSalesInvoiceGoalCheckCache.promise = null;
    }
  }
};

export const dedupeGoalsForDisplay = (goals: GoalRecord[]) => {
  const deduped = new Map<string, GoalRecord>();

  goals.forEach((goal) => {
    const seedKey = String(goal?.config?.seed_key || '').trim();
    const dedupeKey = seedKey ? `seed:${goal.module_id}:${seedKey}` : `id:${goal.id}`;
    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, goal);
    }
  });

  return Array.from(deduped.values());
};

export const buildGoalFallbackProgressSnapshot = (
  goalInput: GoalRecord,
  options: {
    fiscalYear?: FiscalYearSnapshot | null;
    selectedSubperiodUnit?: GoalPeriodUnit | null;
  }
): GoalProgressSnapshot | null => {
  const goal = normalizeGoalRecord(goalInput);
  const module = MODULES[goal.module_id];
  if (!module) return null;

  const subperiodUnit = clampGoalSubperiodUnit(
    goal.period_unit,
    options.selectedSubperiodUnit || goal.subperiod_unit
  );
  const levels = buildGoalLevels(goal);
  const targetValue = resolveGoalTargetValue(goal, levels);

  try {
    const { mainBounds, subBounds } = resolveGoalPeriodBounds(
      goal,
      subperiodUnit,
      options.fiscalYear
    );
    const mainRange = buildGoalRangeSnapshot(mainBounds.start, mainBounds.end);
    const subRange = buildGoalRangeSnapshot(subBounds.start, subBounds.end);
    const ratio = calculateRangeRatio(mainRange, subRange);
    const subTargetValue = targetValue > 0 ? targetValue * ratio : 0;

    return {
      goal,
      achievedValue: 0,
      targetValue,
      subAchievedValue: 0,
      subTargetValue,
      mainRange,
      subRange,
      tone: 'base',
      activeLevelKey: null,
      levels,
      availableSubperiodUnits: getAvailableGoalSubperiodUnits(goal.period_unit),
      selectedSubperiodUnit: subperiodUnit,
      metricLabel: resolveMetricLabel(goal),
      moduleLabel: resolveGoalModuleLabel(goal),
    };
  } catch {
    const now = new Date();
    const label = now.toLocaleDateString('fa-IR');
    return {
      goal,
      achievedValue: 0,
      targetValue,
      subAchievedValue: 0,
      subTargetValue: targetValue,
      mainRange: {
        startIso: now.toISOString(),
        endIso: now.toISOString(),
        startLabel: label,
        endLabel: label,
      },
      subRange: {
        startIso: now.toISOString(),
        endIso: now.toISOString(),
        startLabel: label,
        endLabel: label,
      },
      tone: 'base',
      activeLevelKey: null,
      levels,
      availableSubperiodUnits: getAvailableGoalSubperiodUnits(goal.period_unit),
      selectedSubperiodUnit: subperiodUnit,
      metricLabel: resolveMetricLabel(goal),
      moduleLabel: resolveGoalModuleLabel(goal),
    };
  }
};

export const executeGoalProgress = async (
  goalInput: GoalRecord,
  options: {
    userId: string | null;
    roleId: string | null;
    orgId?: string | null;
    allowedRoleIds?: string[];
    allowedUserIds?: string[];
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

  const { mainBounds, subBounds } = resolveGoalPeriodBounds(
    goal,
    subperiodUnit,
    options.fiscalYear
  );
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
    moduleLabel: resolveGoalModuleLabel(goal),
  };
};
