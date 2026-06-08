export type GoalScope = 'personal' | 'team';
export type GoalPeriodUnit = 'day' | 'week' | 'month' | 'quarter' | 'half_year' | 'year';
export type GoalMetricType = 'count' | 'sum' | 'avg';
export type GoalLevelKey = 'bronze' | 'silver' | 'gold';
export type GoalTone = 'base' | 'bronze' | 'silver' | 'gold';

export type GoalRecord = {
  id: string;
  org_id?: string | null;
  module_id: string;
  name: string;
  description?: string | null;
  goal_scope: GoalScope;
  period_unit: GoalPeriodUnit;
  subperiod_unit: GoalPeriodUnit;
  metric_type: GoalMetricType;
  metric_field_key?: string | null;
  date_field_key?: string | null;
  target_value?: number | null;
  levels_enabled?: boolean | null;
  bronze_value?: number | null;
  silver_value?: number | null;
  gold_value?: number | null;
  assignee_user_ids?: string[] | null;
  assignee_role_ids?: string[] | null;
  conditions_all?: any[] | null;
  conditions_any?: any[] | null;
  config?: Record<string, any> | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type GoalLevelDefinition = {
  key: GoalLevelKey;
  label: string;
  value: number;
};

export type GoalDateRange = {
  startIso: string;
  endIso: string;
  startLabel: string;
  endLabel: string;
};

export type GoalProgressSnapshot = {
  goal: GoalRecord;
  achievedValue: number;
  targetValue: number;
  subAchievedValue: number;
  subTargetValue: number;
  goalRange?: GoalDateRange | null;
  mainRange: GoalDateRange;
  subRange: GoalDateRange;
  tone: GoalTone;
  activeLevelKey: GoalLevelKey | null;
  levels: GoalLevelDefinition[];
  availableSubperiodUnits: GoalPeriodUnit[];
  selectedSubperiodUnit: GoalPeriodUnit;
  metricLabel: string;
  moduleLabel: string;
  subjectUserId?: string | null;
  subjectRoleId?: string | null;
  subjectLabel?: string | null;
  isSharedView?: boolean;
};

export const GOAL_PERIOD_UNIT_OPTIONS: Array<{ label: string; value: GoalPeriodUnit }> = [
  { label: 'روزانه', value: 'day' },
  { label: 'هفتگی', value: 'week' },
  { label: 'ماهانه', value: 'month' },
  { label: 'فصلی', value: 'quarter' },
  { label: 'شش ماهه', value: 'half_year' },
  { label: 'سالانه', value: 'year' },
];

export const GOAL_SCOPE_OPTIONS: Array<{ label: string; value: GoalScope }> = [
  { label: 'فردی', value: 'personal' },
  { label: 'تیمی', value: 'team' },
];

export const GOAL_METRIC_TYPE_OPTIONS: Array<{ label: string; value: GoalMetricType }> = [
  { label: 'تعداد رکوردها', value: 'count' },
  { label: 'جمع فیلد عددی', value: 'sum' },
  { label: 'میانگین فیلد عددی', value: 'avg' },
];

export const GOAL_LEVEL_META: Record<GoalLevelKey, { label: string }> = {
  bronze: { label: 'برنزی' },
  silver: { label: 'نقره‌ای' },
  gold: { label: 'طلایی' },
};
