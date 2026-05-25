import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { FieldType } from '../types';
import type { AssigneeDirectory } from './referenceData';
import {
  canAccessAssignedRecord,
  GOALS_PERMISSION_KEY,
  isSaasAdminModuleId,
  resolveModuleGoalAccessPermissions,
  type PermissionMap,
} from './permissions';
import {
  buildGoalExplicitRange,
  buildGoalCurrentRange,
  buildGoalRangeSnapshot,
  buildGoalRangeSnapshotFromIso,
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
import { createWorkflowEvaluationContext, evaluateWorkflowConditions, prefetchWorkflowRecordTags } from './workflowRuntime';

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

const normalizeGoalConfigArray = (value: unknown) => normalizeArray(value);

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

export const getGoalResultShareUserIds = (goal?: GoalRecord | null) =>
  normalizeGoalConfigArray(goal?.config?.result_share_user_ids);

export const getGoalResultShareRoleIds = (goal?: GoalRecord | null) =>
  normalizeGoalConfigArray(goal?.config?.result_share_role_ids);

export const getGoalUserSelectionValue = (goal?: GoalRecord | null) => {
  if (!goal) return [];
  if (isGoalAssignedToAllUsers(goal)) return [GOAL_ALL_USERS_VALUE];
  return normalizeArray(goal.assignee_user_ids);
};

export const getGoalModuleOptions = (permissions?: PermissionMap | null) =>
  Object.values(MODULES)
    .filter((module) => !isSaasAdminModuleId(module.id))
    .filter((module) => resolveModuleGoalAccessPermissions(permissions, module.id).canViewGoal)
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

export const isGoalSharedWithUser = (
  goal: GoalRecord,
  userId: string | null,
  roleId: string | null
) => {
  const sharedUserIds = getGoalResultShareUserIds(goal);
  const sharedRoleIds = getGoalResultShareRoleIds(goal);
  return (!!userId && sharedUserIds.includes(userId)) || (!!roleId && sharedRoleIds.includes(roleId));
};

export const canUserViewGoalResults = (
  goal: GoalRecord,
  userId: string | null,
  roleId: string | null
) => isGoalVisibleToUser(goal, userId, roleId) || isGoalSharedWithUser(goal, userId, roleId);

export type GoalAssignedMember = {
  userId: string;
  roleId: string | null;
  label: string;
};

export type GoalProgressSubject = {
  userId: string | null;
  roleId?: string | null;
  label?: string | null;
  isSharedView?: boolean;
};

export const resolveGoalAssignedMembers = (
  goal: GoalRecord,
  directory: AssigneeDirectory | null | undefined
): GoalAssignedMember[] => {
  const users = Array.isArray(directory?.users) ? directory!.users : [];
  const userIds = normalizeArray(goal.assignee_user_ids);
  const roleIds = normalizeArray(goal.assignee_role_ids);
  const directUserMap = new Map(users.map((item) => [String(item.id || '').trim(), item] as const));
  const results = new Map<string, GoalAssignedMember>();

  const addMember = (userId: string, roleId: string | null, label: string) => {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return;
    if (results.has(normalizedUserId)) return;
    results.set(normalizedUserId, {
      userId: normalizedUserId,
      roleId: roleId ? String(roleId).trim() : null,
      label: String(label || normalizedUserId).trim() || normalizedUserId,
    });
  };

  if (isGoalAssignedToAllUsers(goal)) {
    users.forEach((user) => {
      addMember(
        String(user.id || ''),
        user.role_id ? String(user.role_id) : null,
        String(user.display_name || user.full_name || user.email || user.id || '')
      );
    });
    return Array.from(results.values()).sort((a, b) => a.label.localeCompare(b.label, 'fa'));
  }

  if (userIds.length === 0 && roleIds.length === 0) {
    users.forEach((user) => {
      addMember(
        String(user.id || ''),
        user.role_id ? String(user.role_id) : null,
        String(user.display_name || user.full_name || user.email || user.id || '')
      );
    });
    return Array.from(results.values()).sort((a, b) => a.label.localeCompare(b.label, 'fa'));
  }

  userIds.forEach((userId) => {
    const user = directUserMap.get(String(userId));
    addMember(
      userId,
      user?.role_id ? String(user.role_id) : null,
      String(user?.display_name || user?.full_name || user?.email || userId)
    );
  });

  if (roleIds.length > 0) {
    users
      .filter((user) => user.role_id && roleIds.includes(String(user.role_id)))
      .forEach((user) => {
        addMember(
          String(user.id || ''),
          user.role_id ? String(user.role_id) : null,
          String(user.display_name || user.full_name || user.email || user.id || '')
        );
      });
  }

  return Array.from(results.values()).sort((a, b) => a.label.localeCompare(b.label, 'fa'));
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
  const context = createWorkflowEvaluationContext(goal.module_id);
  await prefetchWorkflowRecordTags({
    moduleId: goal.module_id,
    records: rows,
    context,
  });
  const filtered: any[] = [];
  for (const row of rows) {
    try {
      const passed = await evaluateWorkflowConditions({
        conditionsAll: goal.conditions_all,
        conditionsAny: goal.conditions_any,
        currentRecord: row,
        moduleId: goal.module_id,
        context,
      });
      if (passed) filtered.push(row);
    } catch {
      continue;
    }
  }
  return filtered;
};

const resolveRecordAssigneeKey = (row: any) => {
  if (!row || typeof row !== 'object') return null;
  if (row.assignee_type === 'role') {
    return {
      assigneeType: 'role' as const,
      assigneeId: String(row.assignee_role_id || row.assignee_id || '').trim() || null,
    };
  }
  return {
    assigneeType: 'user' as const,
    assigneeId: String(row.assignee_id || '').trim() || null,
  };
};

const filterRowsForGoalSubject = (
  rows: any[],
  subjectUserId: string | null | undefined,
  subjectRoleId: string | null | undefined
) => {
  const normalizedUserId = String(subjectUserId || '').trim();
  const normalizedRoleId = String(subjectRoleId || '').trim();
  return rows.filter((row) => {
    const recordAssignee = resolveRecordAssigneeKey(row);
    if (!recordAssignee?.assigneeId) return false;
    if (recordAssignee.assigneeType === 'role') {
      return !!normalizedRoleId && recordAssignee.assigneeId === normalizedRoleId;
    }
    return !!normalizedUserId && recordAssignee.assigneeId === normalizedUserId;
  });
};

const buildGoalProgressSnapshotFromRows = (
  goal: GoalRecord,
  mainRange: GoalProgressSnapshot['mainRange'],
  subRange: GoalProgressSnapshot['subRange'],
  subperiodUnit: GoalPeriodUnit,
  filteredMainRows: any[],
  filteredSubRows: any[],
  subject?: { userId?: string | null; roleId?: string | null; label?: string | null; isSharedView?: boolean }
): GoalProgressSnapshot => {
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
    subjectUserId: subject?.userId || null,
    subjectRoleId: subject?.roleId || null,
    subjectLabel: subject?.label || null,
    isSharedView: subject?.isSharedView === true,
  };
};

const prepareGoalProgressRows = async (
  goal: GoalRecord,
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
    overridePeriodRange?: { startIso: string; endIso: string };
  }
) => {
  const subperiodUnit = clampGoalSubperiodUnit(
    goal.period_unit,
    options.selectedSubperiodUnit || goal.subperiod_unit
  );

  let mainRange: ReturnType<typeof buildGoalRangeSnapshot>;
  let subRange: ReturnType<typeof buildGoalRangeSnapshot>;

  if (options.overridePeriodRange) {
    mainRange = buildGoalRangeSnapshotFromIso(options.overridePeriodRange.startIso, options.overridePeriodRange.endIso);
    subRange = mainRange;
  } else {
    const { mainBounds, subBounds } = resolveGoalPeriodBounds(
      goal,
      subperiodUnit,
      options.fiscalYear
    );
    mainRange = buildGoalRangeSnapshot(mainBounds.start, mainBounds.end);
    subRange = buildGoalRangeSnapshot(subBounds.start, subBounds.end);
  }

  const cache = options.cache || new Map<string, any[]>();
  const [mainRows, subRows] = await Promise.all([
    loadScopedRows(goal, mainRange, {
      userId: options.userId,
      roleId: options.roleId,
      orgId: options.orgId,
      allowedRoleIds: options.allowedRoleIds,
      allowedUserIds: options.allowedUserIds,
      permissions: options.permissions,
      cache,
    }),
    loadScopedRows(goal, subRange, {
      userId: options.userId,
      roleId: options.roleId,
      orgId: options.orgId,
      allowedRoleIds: options.allowedRoleIds,
      allowedUserIds: options.allowedUserIds,
      permissions: options.permissions,
      cache,
    }),
  ]);

  const [filteredMainRows, filteredSubRows] = await Promise.all([
    filterGoalRows(goal, mainRows),
    filterGoalRows(goal, subRows),
  ]);

  return {
    subperiodUnit,
    mainRange,
    subRange,
    filteredMainRows,
    filteredSubRows,
  };
};

export const executeGoalProgressForSubjects = async (
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
    subjects: GoalProgressSubject[];
  }
): Promise<GoalProgressSnapshot[]> => {
  const goal = normalizeGoalRecord(goalInput);
  const module = MODULES[goal.module_id];
  if (!module) return [];

  const prepared = await prepareGoalProgressRows(goal, options);
  return (Array.isArray(options.subjects) ? options.subjects : []).map((subject) =>
    buildGoalProgressSnapshotFromRows(
      goal,
      prepared.mainRange,
      prepared.subRange,
      prepared.subperiodUnit,
      filterRowsForGoalSubject(prepared.filteredMainRows, subject.userId, subject.roleId),
      filterRowsForGoalSubject(prepared.filteredSubRows, subject.userId, subject.roleId),
      {
        userId: subject.userId,
        roleId: subject.roleId || null,
        label: subject.label || null,
        isSharedView: subject.isSharedView === true,
      }
    )
  );
};

const DEFAULT_SALES_INVOICE_GOAL_SEED_KEY = 'sales_invoices_monthly_paid_total_v1';
const DEFAULT_SALES_INVOICE_GOAL_CHECK_TTL_MS = 5 * 60_000;
const DEFAULT_HR_TASK_GOAL_CHECK_TTL_MS = 5 * 60_000;
const DEFAULT_HR_TASK_GOAL_SEEDS = [
  {
    seedKey: 'hr_tasks_completed_monthly',
    name: 'تعداد فعالیت‌های تکمیل‌شده',
    description: 'تعداد فعالیت‌های تکمیل‌شده در بازه جاری',
    goal_scope: 'team',
    period_unit: 'month',
    subperiod_unit: 'week',
    metric_type: 'count',
    metric_field_key: null,
    date_field_key: 'completed_at',
    target_value: null,
    levels_enabled: true,
    bronze_value: 30,
    silver_value: 60,
    gold_value: 120,
    conditions_all: [
      {
        id: 'seed_hr_goal_completed_status',
        field: 'status',
        operator: 'in',
        value: ['done', 'completed'],
      },
    ],
    conditions_any: [],
  },
  {
    seedKey: 'hr_tasks_on_time_monthly',
    name: 'تکمیل به‌موقع فعالیت‌ها',
    description: 'تعداد فعالیت‌هایی که بدون دیرکرد یا با تعجیل تکمیل شده‌اند',
    goal_scope: 'team',
    period_unit: 'month',
    subperiod_unit: 'week',
    metric_type: 'count',
    metric_field_key: null,
    date_field_key: 'completed_at',
    target_value: null,
    levels_enabled: true,
    bronze_value: 20,
    silver_value: 45,
    gold_value: 90,
    conditions_all: [
      {
        id: 'seed_hr_goal_on_time_status',
        field: 'status',
        operator: 'in',
        value: ['done', 'completed'],
      },
      {
        id: 'seed_hr_goal_on_time_variance',
        field: 'schedule_variance_hours',
        operator: 'gte',
        value: 0,
      },
    ],
    conditions_any: [],
  },
  {
    seedKey: 'hr_tasks_produced_qty_monthly',
    name: 'خروجی تولید ثبت‌شده',
    description: 'جمع مقدار تولید ثبت‌شده روی فعالیت‌های تکمیل‌شده',
    goal_scope: 'team',
    period_unit: 'month',
    subperiod_unit: 'week',
    metric_type: 'sum',
    metric_field_key: 'produced_qty',
    date_field_key: 'completed_at',
    target_value: null,
    levels_enabled: true,
    bronze_value: 100,
    silver_value: 250,
    gold_value: 500,
    conditions_all: [
      {
        id: 'seed_hr_goal_production_status',
        field: 'status',
        operator: 'in',
        value: ['done', 'completed'],
      },
    ],
    conditions_any: [],
  },
] as const;

let defaultSalesInvoiceGoalCheckCache: {
  checkedAt: number;
  promise: Promise<void> | null;
} = {
  checkedAt: 0,
  promise: null,
};

let defaultHrTaskGoalsCheckCache: {
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

export const ensureDefaultHrTaskGoals = async (options?: { userId?: string | null }) => {
  const now = Date.now();
  if (defaultHrTaskGoalsCheckCache.checkedAt > 0 && (now - defaultHrTaskGoalsCheckCache.checkedAt) < DEFAULT_HR_TASK_GOAL_CHECK_TTL_MS) {
    return;
  }
  if (defaultHrTaskGoalsCheckCache.promise) {
    return defaultHrTaskGoalsCheckCache.promise;
  }

  const pending = (async () => {
    try {
      const { data: existingRows, error: existingError } = await supabase
        .from('goals')
        .select('id, module_id, config')
        .eq('module_id', 'tasks')
        .limit(100);

      if (existingError) throw existingError;

      const existingSeedKeys = new Set(
        (existingRows || [])
          .map((row: any) => String(row?.config?.seed_key || '').trim())
          .filter(Boolean)
      );

      const missingSeeds = DEFAULT_HR_TASK_GOAL_SEEDS.filter((seed) => !existingSeedKeys.has(seed.seedKey));
      if (missingSeeds.length === 0) return;

      const userId = options?.userId || (await supabase.auth.getUser()).data?.user?.id || null;
      const payloads = missingSeeds.map((seed) => ({
        module_id: 'tasks',
        name: seed.name,
        description: seed.description,
        goal_scope: seed.goal_scope,
        period_unit: seed.period_unit,
        subperiod_unit: seed.subperiod_unit,
        metric_type: seed.metric_type,
        metric_field_key: seed.metric_field_key,
        date_field_key: seed.date_field_key,
        target_value: seed.target_value,
        levels_enabled: seed.levels_enabled,
        bronze_value: seed.bronze_value,
        silver_value: seed.silver_value,
        gold_value: seed.gold_value,
        assignee_user_ids: [],
        assignee_role_ids: [],
        conditions_all: seed.conditions_all,
        conditions_any: seed.conditions_any,
        config: {
          seed_key: seed.seedKey,
          assignment_users_mode: 'all',
          is_seeded_default: true,
          kpi_scope: 'hr',
        },
        is_active: true,
        created_by: userId,
        updated_by: userId,
      }));

      const { error } = await supabase.from('goals').insert(payloads);
      if (error) throw error;
    } catch {
      return;
    }
  })();

  defaultHrTaskGoalsCheckCache.promise = pending;
  try {
    await pending;
    defaultHrTaskGoalsCheckCache.checkedAt = Date.now();
  } finally {
    if (defaultHrTaskGoalsCheckCache.promise === pending) {
      defaultHrTaskGoalsCheckCache.promise = null;
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
      subjectUserId: null,
      subjectRoleId: null,
      subjectLabel: null,
      isSharedView: false,
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
      subjectUserId: null,
      subjectRoleId: null,
      subjectLabel: null,
      isSharedView: false,
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
    subjectUserId?: string | null;
    subjectRoleId?: string | null;
    subjectLabel?: string | null;
    fallbackSubjects?: GoalAssignedMember[];
    overridePeriodRange?: { startIso: string; endIso: string };
  }
): Promise<GoalProgressSnapshot | null> => {
  const goal = normalizeGoalRecord(goalInput);
  const module = MODULES[goal.module_id];
  if (!module) return null;
  const prepared = await prepareGoalProgressRows(goal, options);

  const explicitSubjectUserId = String(options.subjectUserId || '').trim();
  const explicitSubjectRoleId = String(options.subjectRoleId || '').trim();
  if (explicitSubjectUserId || explicitSubjectRoleId) {
    return buildGoalProgressSnapshotFromRows(
      goal,
      prepared.mainRange,
      prepared.subRange,
      prepared.subperiodUnit,
      filterRowsForGoalSubject(prepared.filteredMainRows, explicitSubjectUserId, explicitSubjectRoleId),
      filterRowsForGoalSubject(prepared.filteredSubRows, explicitSubjectUserId, explicitSubjectRoleId),
      {
        userId: explicitSubjectUserId || null,
        roleId: explicitSubjectRoleId || null,
        label: options.subjectLabel || null,
        isSharedView: false,
      }
    );
  }

  if (goal.goal_scope === 'personal') {
    if (isGoalVisibleToUser(goal, options.userId, options.roleId)) {
      return buildGoalProgressSnapshotFromRows(
        goal,
        prepared.mainRange,
        prepared.subRange,
        prepared.subperiodUnit,
        filterRowsForGoalSubject(prepared.filteredMainRows, options.userId, options.roleId),
        filterRowsForGoalSubject(prepared.filteredSubRows, options.userId, options.roleId),
        {
          userId: options.userId,
          roleId: options.roleId,
          label: null,
          isSharedView: false,
        }
      );
    }

    const fallbackSubjects = Array.isArray(options.fallbackSubjects) ? options.fallbackSubjects : [];
    if (fallbackSubjects.length > 0) {
      const ranked = fallbackSubjects
        .map((subject) =>
          buildGoalProgressSnapshotFromRows(
            goal,
            prepared.mainRange,
            prepared.subRange,
            prepared.subperiodUnit,
            filterRowsForGoalSubject(prepared.filteredMainRows, subject.userId, subject.roleId),
            filterRowsForGoalSubject(prepared.filteredSubRows, subject.userId, subject.roleId),
            {
              userId: subject.userId,
              roleId: subject.roleId,
              label: subject.label,
              isSharedView: true,
            }
          )
        )
        .sort((a, b) => {
          if (b.achievedValue !== a.achievedValue) return b.achievedValue - a.achievedValue;
          if (b.subAchievedValue !== a.subAchievedValue) return b.subAchievedValue - a.subAchievedValue;
          return String(a.subjectLabel || '').localeCompare(String(b.subjectLabel || ''), 'fa');
        });
      if (ranked[0]) return ranked[0];
    }
  }

  return buildGoalProgressSnapshotFromRows(
    goal,
    prepared.mainRange,
    prepared.subRange,
    prepared.subperiodUnit,
    prepared.filteredMainRows,
    prepared.filteredSubRows,
    {
      userId: null,
      roleId: null,
      label: null,
      isSharedView: false,
    }
  );
};
