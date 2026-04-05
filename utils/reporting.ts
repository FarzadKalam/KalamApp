import { MODULES } from '../moduleRegistry';
import { FieldType, type ModuleField } from '../types';
import { getSyntheticWorkflowAssigneeField, getWorkflowConditionFields } from './workflowHelpers';
import { parseWorkflowRelatedFieldKey, WORKFLOW_ASSIGNEE_FIELD_KEY, type WorkflowCondition } from './workflowTypes';

export type ReportMetricType = 'count' | 'sum';
export type ReportDefaultView = 'table' | 'table_and_chart';
export type ReportGroupDirection = 'asc' | 'desc';
export type ReportScheduleUnit = 'hour' | 'day';
export type ReportScheduleChannel = 'note' | 'email';

export interface ReportGroupingDefinition {
  field: string;
  direction: ReportGroupDirection;
}

export interface ReportScheduleConfig {
  enabled: boolean;
  interval_value: number;
  interval_unit: ReportScheduleUnit;
  recipient_user_ids: string[];
  delivery_channels: ReportScheduleChannel[];
}

export interface ReportDefinitionConfig {
  secondary_module_id: string | null;
  columns: string[];
  conditions_all: WorkflowCondition[];
  conditions_any: WorkflowCondition[];
  row_limit: number;
  group_bys: ReportGroupingDefinition[];
  metric_type: ReportMetricType;
  metric_fields: string[];
  default_view: ReportDefaultView;
  schedule: ReportScheduleConfig;
}

export interface ReportDefinitionRecord {
  id: string;
  org_id?: string | null;
  name: string;
  description?: string | null;
  module_id: string;
  report_type?: string | null;
  config?: Partial<ReportDefinitionConfig> | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

const REPORT_UNSUPPORTED_FIELD_TYPES = new Set<FieldType>([
  FieldType.IMAGE,
  FieldType.JSON,
  FieldType.PROGRESS_STAGES,
  FieldType.LOCATION,
]);

const GROUPABLE_FIELD_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.PHONE,
  FieldType.SELECT,
  FieldType.STATUS,
  FieldType.RELATION,
  FieldType.USER,
  FieldType.DATE,
  FieldType.DATETIME,
  FieldType.CHECKBOX,
  FieldType.TAGS,
  FieldType.MULTI_SELECT,
]);

const SUMMABLE_FIELD_TYPES = new Set<FieldType>([
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.PERCENTAGE,
  FieldType.STOCK,
]);

export const REPORT_BUILDER_EXCLUDED_MODULE_IDS = new Set<string>([
  'fiscal_years',
  'chart_of_accounts',
  'journal_entries',
  'accounting_event_rules',
  'cost_centers',
  'cash_boxes',
  'bank_accounts',
  'cheques',
  'cash_bank_operations',
]);

const dedupeFields = (fields: ModuleField[]) => {
  const map = new Map<string, ModuleField>();
  fields.forEach((field) => {
    const key = String(field?.key || '').trim();
    if (!key || map.has(key)) return;
    map.set(key, field);
  });
  return Array.from(map.values());
};

export const createDefaultReportScheduleConfig = (): ReportScheduleConfig => ({
  enabled: false,
  interval_value: 1,
  interval_unit: 'day',
  recipient_user_ids: [],
  delivery_channels: ['note'],
});

export const createDefaultReportConfig = (): ReportDefinitionConfig => ({
  secondary_module_id: null,
  columns: [],
  conditions_all: [],
  conditions_any: [],
  row_limit: 200,
  group_bys: [],
  metric_type: 'count',
  metric_fields: [],
  default_view: 'table_and_chart',
  schedule: createDefaultReportScheduleConfig(),
});

export const clampReportRowLimit = (value: unknown) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return 200;
  return Math.min(500, Math.max(20, parsed));
};

export const clampGroupingDefinitions = (value: unknown): ReportGroupingDefinition[] => {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item): ReportGroupingDefinition => {
      const direction: ReportGroupDirection =
        String((item as any)?.direction || '').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
      return {
        field: String((item as any)?.field || '').trim(),
        direction,
      };
    })
    .filter((item) => !!item.field)
    .slice(0, 3);
};

export const normalizeReportScheduleConfig = (value: unknown): ReportScheduleConfig => {
  const defaults = createDefaultReportScheduleConfig();
  const raw = value && typeof value === 'object' ? (value as Record<string, any>) : {};
  const intervalValue = Number.parseInt(String(raw.interval_value || defaults.interval_value), 10);
  const channels = Array.isArray(raw.delivery_channels)
    ? raw.delivery_channels
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item): item is ReportScheduleChannel => item === 'note' || item === 'email')
    : defaults.delivery_channels;

  return {
    enabled: raw.enabled === true,
    interval_value: Number.isFinite(intervalValue) ? Math.max(1, intervalValue) : defaults.interval_value,
    interval_unit: String(raw.interval_unit || '').trim().toLowerCase() === 'hour' ? 'hour' : 'day',
    recipient_user_ids: Array.isArray(raw.recipient_user_ids)
      ? raw.recipient_user_ids.map((item) => String(item || '').trim()).filter(Boolean)
      : defaults.recipient_user_ids,
    delivery_channels: channels.length > 0 ? channels : defaults.delivery_channels,
  };
};

export const normalizeReportConfig = (value: Partial<ReportDefinitionConfig> | null | undefined): ReportDefinitionConfig => {
  const defaults = createDefaultReportConfig();
  const metricType = value?.metric_type === 'sum' ? 'sum' : 'count';
  const legacyGroupBy = value && (value as any).group_by ? String((value as any).group_by || '').trim() : '';
  const legacyMetricField = value && (value as any).metric_field ? String((value as any).metric_field || '').trim() : '';

  const metricFields = Array.isArray(value?.metric_fields)
    ? value!.metric_fields.map((item) => String(item || '').trim()).filter(Boolean)
    : legacyMetricField
      ? [legacyMetricField]
      : [];

  return {
    ...defaults,
    ...value,
    secondary_module_id: value?.secondary_module_id ? String(value.secondary_module_id).trim() : null,
    columns: Array.isArray(value?.columns) ? value!.columns.map((item) => String(item || '').trim()).filter(Boolean) : defaults.columns,
    conditions_all: Array.isArray(value?.conditions_all) ? value!.conditions_all : defaults.conditions_all,
    conditions_any: Array.isArray(value?.conditions_any) ? value!.conditions_any : defaults.conditions_any,
    row_limit: clampReportRowLimit(value?.row_limit),
    group_bys: clampGroupingDefinitions(
      Array.isArray(value?.group_bys)
        ? value?.group_bys
        : legacyGroupBy
          ? [{ field: legacyGroupBy, direction: 'asc' }]
          : []
    ),
    metric_type: metricType,
    metric_fields: metricType === 'sum' ? metricFields.slice(0, 4) : [],
    default_view: value?.default_view === 'table' ? 'table' : 'table_and_chart',
    schedule: normalizeReportScheduleConfig((value as any)?.schedule),
  };
};

export const isReportableField = (field?: ModuleField | null) => {
  if (!field?.key) return false;
  if (REPORT_UNSUPPORTED_FIELD_TYPES.has(field.type)) return false;
  return true;
};

export const isGroupableReportField = (field?: ModuleField | null) => !!field && GROUPABLE_FIELD_TYPES.has(field.type);

export const isSummableReportField = (field?: ModuleField | null) => !!field && SUMMABLE_FIELD_TYPES.has(field.type);

export const getMainReportableFields = (moduleId?: string | null) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const fields = MODULES[normalizedModuleId]?.fields || [];
  const assigneeField = getSyntheticWorkflowAssigneeField(normalizedModuleId);
  return dedupeFields([
    ...fields.filter((field) => isReportableField(field)),
    ...(assigneeField ? [assigneeField] : []),
  ]);
};

export const getSecondaryModuleOptions = (
  mainModuleId?: string | null,
  permissions?: Record<string, { view?: boolean }> | null
) => {
  const mainFields = MODULES[String(mainModuleId || '').trim()]?.fields || [];
  return Array.from(
    new Map(
      mainFields
        .filter((field) => field.type === FieldType.RELATION && field.relationConfig?.targetModule)
        .map((field) => String(field.relationConfig?.targetModule || '').trim())
        .filter((targetModuleId) => !!targetModuleId && !!MODULES[targetModuleId])
        .filter((targetModuleId) => !REPORT_BUILDER_EXCLUDED_MODULE_IDS.has(targetModuleId))
        .filter((targetModuleId) => permissions?.[targetModuleId]?.view !== false)
        .map((targetModuleId) => [
          targetModuleId,
          {
            label: MODULES[targetModuleId]?.titles?.fa || targetModuleId,
            value: targetModuleId,
          },
        ] as const)
    ).values()
  ).sort((a, b) => a.label.localeCompare(b.label, 'fa'));
};

export const getSecondaryReportableFields = (
  mainModuleId?: string | null,
  secondaryModuleId?: string | null
) => {
  const normalizedMain = String(mainModuleId || '').trim();
  const normalizedSecondary = String(secondaryModuleId || '').trim();
  if (!normalizedMain || !normalizedSecondary) return [];
  return dedupeFields(
    getWorkflowConditionFields(normalizedMain).filter((field) => {
      const relatedMeta = parseWorkflowRelatedFieldKey(field.key);
      if (!relatedMeta || relatedMeta.targetModuleId !== normalizedSecondary) return false;
      return isReportableField(field) || relatedMeta.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY;
    })
  );
};

export const getReportableFields = (mainModuleId?: string | null, secondaryModuleId?: string | null) =>
  dedupeFields([
    ...getMainReportableFields(mainModuleId),
    ...getSecondaryReportableFields(mainModuleId, secondaryModuleId),
  ]);

export const getReportConditionFields = (mainModuleId?: string | null, secondaryModuleId?: string | null) =>
  getReportableFields(mainModuleId, secondaryModuleId);

export const getReportableFieldMap = (mainModuleId?: string | null, secondaryModuleId?: string | null) => {
  return getReportableFields(mainModuleId, secondaryModuleId).reduce<Record<string, ModuleField>>((acc, field) => {
    acc[field.key] = field;
    return acc;
  }, {});
};

export const getGroupableReportFields = (mainModuleId?: string | null, secondaryModuleId?: string | null) =>
  getReportableFields(mainModuleId, secondaryModuleId).filter((field) => isGroupableReportField(field));

export const getSummableReportFields = (mainModuleId?: string | null, secondaryModuleId?: string | null) =>
  getReportableFields(mainModuleId, secondaryModuleId).filter((field) => isSummableReportField(field));

export const getReportModuleOptions = (permissions?: Record<string, { view?: boolean }> | null) =>
  Object.values(MODULES)
    .filter((module) => !REPORT_BUILDER_EXCLUDED_MODULE_IDS.has(module.id))
    .filter((module) => permissions?.[module.id]?.view !== false)
    .map((module) => ({
      label: module.titles?.fa || module.id,
      value: module.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fa'));
