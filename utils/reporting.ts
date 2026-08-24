import { MODULES } from '../moduleRegistry';
import { BlockType, FieldType, type BlockDefinition, type ModuleField } from '../types';
import { isSaasAdminModuleId } from './permissions';
import { supportsModuleAssignee } from './assigneeSupport';
import { buildSurveyReportFieldsFromSnapshot } from './surveyTemplates';
import { getSyntheticWorkflowAssigneeField, getWorkflowConditionFields } from './workflowHelpers';
import { parseWorkflowRelatedFieldKey, WORKFLOW_ASSIGNEE_FIELD_KEY, type WorkflowCondition } from './workflowTypes';
import { isReportTaskProcessFieldKey } from './reportTaskProcessFields';
import { parseProcessLinkedFieldKey } from './processTargets';
import { getCanonicalModuleFields } from './recordVariableCatalog';

/** `difference` is retained only to safely read old stored configurations; the builder no longer creates it. */
export type ReportMetricType = 'count' | 'sum' | 'avg' | 'difference';
export type ReportCalculationMode = 'normal' | 'difference' | 'percentage';
export type ReportDateGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type ReportOutputMode = 'table' | 'bar' | 'pie' | 'line';
/** فقط برای خواندن تنظیمات ذخیره‌شدهٔ پیش از خروجی‌های قابل انتخاب نگه داشته شده است. */
export type ReportDefaultView = 'table' | 'table_and_chart';
export type ReportGroupDirection = 'asc' | 'desc';
export type ReportScheduleUnit = 'hour' | 'day';
export type ReportScheduleChannel = 'note' | 'email' | 'sms' | 'bot_group';

export interface ReportGroupingDefinition {
  field: string;
  direction: ReportGroupDirection;
  date_granularity?: ReportDateGranularity;
  /** For composite reports, the equivalent source field for every reference report. */
  source_fields?: Record<string, string>;
}

export interface ReportReferenceMetric {
  report_id: string;
  metric_key: string;
}

export interface ReportScheduleConfig {
  enabled: boolean;
  interval_value: number;
  interval_unit: ReportScheduleUnit;
  interval_at: string;
  /** ISO timestamp in UTC for the first scheduled execution. */
  first_run_at: string | null;
  /** Persian module title captured with the schedule for delivery messages. */
  module_label: string;
  recipient_user_ids: string[];
  bot_group_ids: string[];
  delivery_channels: ReportScheduleChannel[];
}

export interface ReportDefinitionConfig {
  calculation_mode: ReportCalculationMode;
  /** Explicit report viewers. These grants are scoped to the report and organization. */
  viewer_user_ids: string[];
  viewer_role_ids: string[];
  /** Opt-in only: show this report as a compact slide on members' dashboards. */
  show_in_members_dashboard: boolean;
  reference_report_ids: string[];
  increase_metrics: ReportReferenceMetric[];
  decrease_metrics: ReportReferenceMetric[];
  percentage_target_metric: ReportReferenceMetric | null;
  percentage_total_metric: ReportReferenceMetric | null;
  secondary_module_id: string | null;
  secondary_module_ids: string[];
  columns: string[];
  conditions_all: WorkflowCondition[];
  conditions_any: WorkflowCondition[];
  row_limit: number;
  group_bys: ReportGroupingDefinition[];
  metric_type: ReportMetricType;
  metric_fields: string[];
  metric_subtract_fields: string[];
  show_group_summaries: boolean;
  chart_dimension_field: string | null;
  output_modes: ReportOutputMode[];
  default_view: ReportDefaultView;
  schedule: ReportScheduleConfig;
  print_selected_field_keys: Record<string, string[]>;
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

export const REPORT_TABLE_SOURCE_PREFIX = '__report_table__';
export const REPORT_TABLE_FIELD_PREFIX = '__report_table_field__';
export const REPORT_TABLE_RELATION_FIELD_PREFIX = '__report_table_relation_field__';

export const buildReportTableSourceId = (blockId: string) =>
  `${REPORT_TABLE_SOURCE_PREFIX}${String(blockId || '').trim()}`;

export const parseReportTableSourceId = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith(REPORT_TABLE_SOURCE_PREFIX)) return null;
  const blockId = normalized.slice(REPORT_TABLE_SOURCE_PREFIX.length).trim();
  return blockId ? { blockId } : null;
};

export const isReportTableSourceId = (value?: string | null) => !!parseReportTableSourceId(value);

export const buildReportTableFieldKey = (blockId: string, columnKey: string) =>
  `${REPORT_TABLE_FIELD_PREFIX}${String(blockId || '').trim()}::${String(columnKey || '').trim()}`;

export const parseReportTableFieldKey = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith(REPORT_TABLE_FIELD_PREFIX)) return null;
  const raw = normalized.slice(REPORT_TABLE_FIELD_PREFIX.length);
  const [blockId, columnKey] = raw.split('::');
  if (!blockId || !columnKey) return null;
  return { blockId, columnKey };
};

export const isReportTableFieldKey = (value?: string | null) => !!parseReportTableFieldKey(value);

export const buildReportTableRelationFieldKey = (
  blockId: string,
  relationColumnKey: string,
  targetModuleId: string,
  targetFieldKey: string
) =>
  `${REPORT_TABLE_RELATION_FIELD_PREFIX}${String(blockId || '').trim()}::${String(relationColumnKey || '').trim()}::${String(targetModuleId || '').trim()}::${String(targetFieldKey || '').trim()}`;

export const parseReportTableRelationFieldKey = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith(REPORT_TABLE_RELATION_FIELD_PREFIX)) return null;
  const raw = normalized.slice(REPORT_TABLE_RELATION_FIELD_PREFIX.length);
  const [blockId, relationColumnKey, targetModuleId, targetFieldKey] = raw.split('::');
  if (!blockId || !relationColumnKey || !targetModuleId || !targetFieldKey) return null;
  return { blockId, relationColumnKey, targetModuleId, targetFieldKey };
};

export const isReportTableRelationFieldKey = (value?: string | null) => !!parseReportTableRelationFieldKey(value);

export const REPORT_BASE_SELECT_COLUMNS = [
  'id',
  'org_id',
  'created_at',
  'updated_at',
] as const;

export const REPORT_ASSIGNEE_SELECT_COLUMNS = [
  'assignee_id',
  'assignee_role_id',
  'assignee_type',
] as const;

export const REPORT_SOFT_DELETE_SELECT_COLUMNS = [
  'is_deleted',
  'deleted',
  '_deleted',
  'deleted_at',
] as const;

export const isDeletedReportRecord = (row: Record<string, any> | null | undefined) =>
  !!row && (
    row.is_deleted === true
    || row.deleted === true
    || row._deleted === true
    || !!row.deleted_at
  );

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
  'petty_funds',
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

export const getReportTableBlocks = (moduleId?: string | null): BlockDefinition[] => {
  const normalizedModuleId = String(moduleId || '').trim();
  const blocks = MODULES[normalizedModuleId]?.blocks || [];
  return blocks
    .filter((block) => block?.type === BlockType.TABLE && Array.isArray(block?.tableColumns) && block.tableColumns.length > 0)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
};

export const getReportTableBlock = (moduleId?: string | null, tableSourceId?: string | null) => {
  const meta = parseReportTableSourceId(tableSourceId);
  if (!meta) return null;
  return getReportTableBlocks(moduleId).find((block) => String(block.id || '') === meta.blockId) || null;
};

export const buildReportBaseSelectColumns = (
  moduleConfig: {
    id?: string;
    table?: string;
    fields?: ModuleField[] | null;
  } | null | undefined,
  keys: readonly string[],
  selectedTableBlocks: readonly Pick<BlockDefinition, 'id'>[],
) => {
  const moduleFieldKeys = new Set(
    getCanonicalModuleFields(String(moduleConfig?.id || '')).concat(moduleConfig?.fields || [])
      .map((field) => String(field?.key || '').trim())
      .filter(Boolean)
  );
  const selectedTableBlockIds = new Set(
    (selectedTableBlocks || [])
      .map((block) => String(block?.id || '').trim())
      .filter(Boolean)
  );
  const requiredColumns = new Set<string>(REPORT_BASE_SELECT_COLUMNS);
  if (supportsModuleAssignee(moduleConfig)) {
    REPORT_ASSIGNEE_SELECT_COLUMNS.forEach((column) => requiredColumns.add(column));
  }
  REPORT_SOFT_DELETE_SELECT_COLUMNS.forEach((column) => {
    if (moduleFieldKeys.has(column)) requiredColumns.add(column);
  });

  selectedTableBlockIds.forEach((blockId) => requiredColumns.add(blockId));

  (keys || []).forEach((rawKey) => {
    const key = String(rawKey || '').trim();
    if (!key) return;

    if (isReportTaskProcessFieldKey(key)) {
      requiredColumns.add('recurrence_info');
      requiredColumns.add('source_template_id');
      requiredColumns.add('process_node_key');
      return;
    }

    if (String(moduleConfig?.id || '').trim() === 'tasks' && parseProcessLinkedFieldKey(key)) {
      requiredColumns.add('recurrence_info');
      requiredColumns.add('process_run_id');
      return;
    }

    if (String(moduleConfig?.id || '').trim() === 'tasks' && key === 'status') {
      requiredColumns.add('recurrence_info');
    }

    const tableFieldMeta = parseReportTableFieldKey(key);
    if (tableFieldMeta?.blockId) {
      requiredColumns.add(tableFieldMeta.blockId);
      return;
    }

    const tableRelationMeta = parseReportTableRelationFieldKey(key);
    if (tableRelationMeta?.blockId) {
      requiredColumns.add(tableRelationMeta.blockId);
      return;
    }

    const relatedMeta = parseWorkflowRelatedFieldKey(key);
    if (relatedMeta?.relationFieldKey && moduleFieldKeys.has(relatedMeta.relationFieldKey)) {
      requiredColumns.add(relatedMeta.relationFieldKey);
      return;
    }

    if (moduleFieldKeys.has(key)) {
      requiredColumns.add(key);
    }
  });

  return Array.from(requiredColumns);
};

export const createDefaultReportScheduleConfig = (): ReportScheduleConfig => ({
  enabled: false,
  interval_value: 1,
  interval_unit: 'day',
  interval_at: '',
  first_run_at: null,
  module_label: '',
  recipient_user_ids: [],
  bot_group_ids: [],
  delivery_channels: ['note'],
});

export const createDefaultReportConfig = (): ReportDefinitionConfig => ({
  calculation_mode: 'normal',
  viewer_user_ids: [],
  viewer_role_ids: [],
  show_in_members_dashboard: false,
  reference_report_ids: [],
  increase_metrics: [],
  decrease_metrics: [],
  percentage_target_metric: null,
  percentage_total_metric: null,
  secondary_module_id: null,
  secondary_module_ids: [],
  columns: [],
  conditions_all: [],
  conditions_any: [],
  row_limit: 200,
  group_bys: [],
  metric_type: 'count',
  metric_fields: [],
  metric_subtract_fields: [],
  show_group_summaries: true,
  chart_dimension_field: null,
  output_modes: ['table', 'bar'],
  default_view: 'table_and_chart',
  schedule: createDefaultReportScheduleConfig(),
  print_selected_field_keys: {},
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
        date_granularity: ['monthly', 'weekly', 'daily', 'quarterly', 'yearly'].includes(String((item as any)?.date_granularity || ''))
          ? String((item as any).date_granularity) as ReportDateGranularity
          : undefined,
        source_fields: (item as any)?.source_fields && typeof (item as any).source_fields === 'object'
          ? Object.entries((item as any).source_fields).reduce<Record<string, string>>((acc, [reportId, fieldKey]) => {
              const normalizedReportId = String(reportId || '').trim();
              const normalizedFieldKey = String(fieldKey || '').trim();
              if (normalizedReportId && normalizedFieldKey) acc[normalizedReportId] = normalizedFieldKey;
              return acc;
            }, {})
          : undefined,
      };
    })
    .filter((item) => !!item.field)
    .slice(0, 3);
};

export const normalizeReportScheduleConfig = (value: unknown): ReportScheduleConfig => {
  const defaults = createDefaultReportScheduleConfig();
  const raw = value && typeof value === 'object' ? (value as Record<string, any>) : {};
  const intervalValue = Number.parseInt(String(raw.interval_value || defaults.interval_value), 10);
  const rawIntervalAt = String(raw.interval_at || '').trim();
  const intervalAt = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawIntervalAt) ? rawIntervalAt : defaults.interval_at;
  const rawFirstRunAt = String(raw.first_run_at || '').trim();
  const firstRunDate = rawFirstRunAt ? new Date(rawFirstRunAt) : null;
  const firstRunAt = firstRunDate && !Number.isNaN(firstRunDate.getTime()) ? firstRunDate.toISOString() : defaults.first_run_at;
  const channels = Array.isArray(raw.delivery_channels)
    ? raw.delivery_channels
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item): item is ReportScheduleChannel => item === 'note' || item === 'email' || item === 'sms' || item === 'bot_group')
    : defaults.delivery_channels;

  return {
    enabled: raw.enabled === true,
    interval_value: Number.isFinite(intervalValue) ? Math.max(1, intervalValue) : defaults.interval_value,
    interval_unit: String(raw.interval_unit || '').trim().toLowerCase() === 'hour' ? 'hour' : 'day',
    interval_at: intervalAt,
    first_run_at: firstRunAt,
    module_label: String(raw.module_label || '').trim(),
    recipient_user_ids: Array.isArray(raw.recipient_user_ids)
      ? raw.recipient_user_ids.map((item) => String(item || '').trim()).filter(Boolean)
      : defaults.recipient_user_ids,
    bot_group_ids: Array.isArray(raw.bot_group_ids)
      ? raw.bot_group_ids.map((item) => String(item || '').trim()).filter(Boolean)
      : defaults.bot_group_ids,
    delivery_channels: channels.length > 0 ? channels : defaults.delivery_channels,
  };
};

export const normalizeReportConfig = (value: Partial<ReportDefinitionConfig> | null | undefined): ReportDefinitionConfig => {
  const defaults = createDefaultReportConfig();
  const calculationMode: ReportCalculationMode = (value as any)?.calculation_mode === 'difference' || (value as any)?.calculation_mode === 'percentage'
    ? (value as any).calculation_mode
    : 'normal';
  // گزارش‌های تفاضلی نسخه‌های قبل از این نسخه، گزارش عادی‌اند؛ تفاضل آن‌ها عمداً
  // به مدل جدید تبدیل نمی‌شود تا هیچ منبع یا معنای مالی به‌صورت حدسی تغییر نکند.
  const metricType: ReportMetricType = value?.metric_type === 'sum' || value?.metric_type === 'avg' ? value.metric_type : 'count';
  const legacyGroupBy = value && (value as any).group_by ? String((value as any).group_by || '').trim() : '';
  const legacyMetricField = value && (value as any).metric_field ? String((value as any).metric_field || '').trim() : '';

  const metricFields = Array.isArray(value?.metric_fields)
    ? value!.metric_fields.map((item) => String(item || '').trim()).filter(Boolean)
    : legacyMetricField
      ? [legacyMetricField]
      : [];
  const normalizeReferenceMetric = (candidate: any): ReportReferenceMetric | null => {
    const reportId = String(candidate?.report_id || '').trim();
    const metricKey = String(candidate?.metric_key || '').trim();
    return reportId && metricKey ? { report_id: reportId, metric_key: metricKey } : null;
  };
  const referenceReportIds: string[] = Array.isArray((value as any)?.reference_report_ids)
    ? Array.from(new Set<string>((value as any).reference_report_ids.map((item: any) => String(item || '').trim()).filter(Boolean)))
    : [];

  const secondaryModuleIds = Array.isArray((value as any)?.secondary_module_ids)
    ? (value as any).secondary_module_ids.map((item: any) => String(item || '').trim()).filter(Boolean)
    : value?.secondary_module_id
      ? [String(value.secondary_module_id).trim()].filter(Boolean)
      : [];
  const groupBys = clampGroupingDefinitions(
    Array.isArray(value?.group_bys)
      ? value?.group_bys
      : legacyGroupBy
        ? [{ field: legacyGroupBy, direction: 'asc' }]
        : []
  );
  const chartDimensionField = String((value as any)?.chart_dimension_field || '').trim()
    || groupBys[0]?.field
    || null;
  const printSelectedFieldKeys = value && typeof (value as any)?.print_selected_field_keys === 'object'
    ? Object.entries((value as any).print_selected_field_keys || {}).reduce<Record<string, string[]>>((acc, [templateKey, fieldKeys]) => {
        const normalizedTemplateKey = String(templateKey || '').trim();
        if (!normalizedTemplateKey) return acc;
        acc[normalizedTemplateKey] = Array.isArray(fieldKeys)
          ? fieldKeys.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        return acc;
      }, {})
    : defaults.print_selected_field_keys;
  const outputModes = Array.isArray((value as any)?.output_modes)
    ? Array.from(new Set((value as any).output_modes
      .map((item: unknown) => String(item || '').trim())
      .filter((item: string): item is ReportOutputMode => ['table', 'bar', 'pie', 'line'].includes(item))))
    : value?.default_view === 'table'
      ? ['table']
      : defaults.output_modes;

  return {
    ...defaults,
    ...value,
    calculation_mode: calculationMode,
    viewer_user_ids: Array.isArray((value as any)?.viewer_user_ids)
      ? Array.from(new Set<string>((value as any).viewer_user_ids.map((item: any) => String(item || '').trim()).filter(Boolean)))
      : [],
    viewer_role_ids: Array.isArray((value as any)?.viewer_role_ids)
      ? Array.from(new Set<string>((value as any).viewer_role_ids.map((item: any) => String(item || '').trim()).filter(Boolean)))
      : [],
    show_in_members_dashboard: (value as any)?.show_in_members_dashboard === true,
    reference_report_ids: referenceReportIds,
    increase_metrics: Array.isArray((value as any)?.increase_metrics)
      ? (value as any).increase_metrics.map(normalizeReferenceMetric).filter(Boolean).slice(0, 24) as ReportReferenceMetric[]
      : [],
    decrease_metrics: Array.isArray((value as any)?.decrease_metrics)
      ? (value as any).decrease_metrics.map(normalizeReferenceMetric).filter(Boolean).slice(0, 24) as ReportReferenceMetric[]
      : [],
    percentage_target_metric: normalizeReferenceMetric((value as any)?.percentage_target_metric),
    percentage_total_metric: normalizeReferenceMetric((value as any)?.percentage_total_metric),
    secondary_module_id: secondaryModuleIds[0] || null,
    secondary_module_ids: Array.from(new Set(secondaryModuleIds)),
    columns: Array.isArray(value?.columns) ? value!.columns.map((item) => String(item || '').trim()).filter(Boolean) : defaults.columns,
    conditions_all: Array.isArray(value?.conditions_all) ? value!.conditions_all : defaults.conditions_all,
    conditions_any: Array.isArray(value?.conditions_any) ? value!.conditions_any : defaults.conditions_any,
    row_limit: clampReportRowLimit(value?.row_limit),
    group_bys: groupBys,
    metric_type: metricType,
    metric_fields: metricType === 'sum' || metricType === 'avg' ? metricFields.slice(0, 4) : [],
    // این تنظیم قدیمی دیگر نباید وارد هیچ مسیر اجرایی تازه‌ای شود.
    metric_subtract_fields: [],
    show_group_summaries: (value as any)?.show_group_summaries === false ? false : true,
    chart_dimension_field: chartDimensionField,
    output_modes: (outputModes.length > 0 ? outputModes : ['table']) as ReportOutputMode[],
    default_view: value?.default_view === 'table' ? 'table' : 'table_and_chart',
    schedule: normalizeReportScheduleConfig((value as any)?.schedule),
    print_selected_field_keys: printSelectedFieldKeys,
  };
};

export const isReportableField = (field?: ModuleField | null) => {
  if (!field?.key) return false;
  if (REPORT_UNSUPPORTED_FIELD_TYPES.has(field.type)) return false;
  return true;
};

export const isGroupableReportField = (field?: ModuleField | null) => !!field && GROUPABLE_FIELD_TYPES.has(field.type);

export const isSummableReportField = (field?: ModuleField | null) => !!field && SUMMABLE_FIELD_TYPES.has(field.type);

export const getMainReportableFields = (
  moduleId?: string | null,
  surveyTemplateSnapshot?: unknown,
  taskProcessFields: ModuleField[] = [],
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  // فیلدهای سیستم (ایجادکننده، آخرین ویرایشگر و زمان‌های ثبت/ویرایش) باید
  // برای خودِ رکورد اصلی هم از همان catalog مرکزی در دسترس باشند؛ نه فقط وقتی
  // همان ماژول به‌عنوان رکورد مرتبط استفاده می‌شود.
  const fields = getCanonicalModuleFields(normalizedModuleId);
  const assigneeField = getSyntheticWorkflowAssigneeField(normalizedModuleId);
  const surveyTemplateFields = normalizedModuleId === 'surveys'
    ? buildSurveyReportFieldsFromSnapshot(surveyTemplateSnapshot)
    : [];
  const moduleFields = fields
    .filter((field) => isReportableField(field) && (!assigneeField || String(field.key || '').trim() !== 'assignee_id'))
    .map((field) => (
      normalizedModuleId === 'tasks' && String(field?.key || '').trim() === 'status'
        ? { ...field, __reportTaskRuntimeStatus: true } as ModuleField
        : field
    ));
  return dedupeFields([
    // گزارش باید مسئول را از فیلد مصنوعی بخواند تا نام کاربر/نقش نمایش داده شود،
    // نه شناسه خام assignee_id؛ در نتیجه این ستون دوبار هم ظاهر نمی‌شود.
    ...moduleFields,
    ...surveyTemplateFields.filter((field) => isReportableField(field)),
    ...(normalizedModuleId === 'tasks' ? taskProcessFields.filter((field) => isReportableField(field)) : []),
    ...(assigneeField ? [assigneeField] : []),
  ]);
};

export const getSecondaryModuleOptions = (
  mainModuleId?: string | null,
  permissions?: Record<string, { view?: boolean }> | null
) => {
  const mainFields = MODULES[String(mainModuleId || '').trim()]?.fields || [];
  const relatedOptions = Array.from(
    new Map(
      mainFields
        .filter((field) => field.type === FieldType.RELATION && field.relationConfig?.targetModule)
        .map((field) => String(field.relationConfig?.targetModule || '').trim())
        .filter((targetModuleId) => !!targetModuleId && !!MODULES[targetModuleId])
        .filter((targetModuleId) => !isSaasAdminModuleId(targetModuleId))
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
  );

  const tableOptions = getReportTableBlocks(mainModuleId).map((block) => ({
    label: `جدول فرعی: ${block.titles?.fa || block.id}`,
    value: buildReportTableSourceId(String(block.id || '')),
  }));

  return [...relatedOptions, ...tableOptions].sort((a, b) => a.label.localeCompare(b.label, 'fa'));
};

export const getTableReportableFields = (
  mainModuleId?: string | null,
  tableSourceId?: string | null,
  surveyTemplateSnapshot?: unknown,
) => {
  const tableBlock = getReportTableBlock(mainModuleId, tableSourceId);
  if (!tableBlock) return [];
  const tableColumnFields = (tableBlock.tableColumns || []).map((column: any, index: number) => ({
      key: buildReportTableFieldKey(String(tableBlock.id || ''), String(column?.key || '')),
      labels: {
        fa: `${tableBlock.titles?.fa || tableBlock.id} / ${String(column?.title || column?.label || column?.key || '')}`,
        en: String(column?.title || column?.key || ''),
      },
      type: column?.type || FieldType.TEXT,
      options: Array.isArray(column?.options) ? column.options : undefined,
      dynamicOptionsCategory: column?.dynamicOptionsCategory,
      relationConfig: column?.relationConfig,
      order: Number.isFinite(Number(column?.order)) ? Number(column.order) : index,
      nature: column?.nature,
      readonly: column?.readonly,
    } as ModuleField)).filter((field) => isReportableField(field));

  const relatedRecordFields = (tableBlock.tableColumns || []).flatMap((column: any) => {
    if (column?.type !== FieldType.RELATION || !column?.relationConfig) return [];
    const relationColumnKey = String(column?.key || '').trim();
    if (!relationColumnKey) return [];

    const sources = Array.isArray(column.relationConfig?.sourceModules) && column.relationConfig.sourceModules.length > 0
      ? column.relationConfig.sourceModules
      : [column.relationConfig];

    return sources.flatMap((source: any) => {
      const targetModuleId = String(source?.targetModule || column.relationConfig?.targetModule || '').trim();
      const targetModule = MODULES[targetModuleId];
      if (!targetModule) return [];
      const relationTitle = String(column?.title || column?.label || relationColumnKey);
      const targetModuleTitle = targetModule.titles?.fa || targetModuleId;
      return getMainReportableFields(targetModuleId, targetModuleId === 'surveys' ? surveyTemplateSnapshot : null).map((field) => ({
        ...field,
        key: buildReportTableRelationFieldKey(
          String(tableBlock.id || ''),
          relationColumnKey,
          targetModuleId,
          String(field.key || '')
        ),
        labels: {
          fa: `${tableBlock.titles?.fa || tableBlock.id} / ${relationTitle} / ${targetModuleTitle} / ${field.labels?.fa || field.key}`,
          en: `${relationTitle} / ${targetModule.titles?.en || targetModuleId} / ${field.labels?.en || field.key}`,
        },
        workflowOptionScopeModuleId: targetModuleId,
      } as ModuleField));
    });
  }).filter((field) => isReportableField(field));

  return dedupeFields([...tableColumnFields, ...relatedRecordFields]);
};

export const getSecondaryReportableFields = (
  mainModuleId?: string | null,
  secondaryModuleId?: string | string[] | null,
  surveyTemplateSnapshot?: unknown,
) => {
  const normalizedMain = String(mainModuleId || '').trim();
  const normalizedSecondaryIds = Array.from(
    new Set(
      (Array.isArray(secondaryModuleId) ? secondaryModuleId : [secondaryModuleId])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
  if (!normalizedMain || normalizedSecondaryIds.length === 0) return [];
  return dedupeFields(
    normalizedSecondaryIds.flatMap((normalizedSecondary) => {
      if (isReportTableSourceId(normalizedSecondary)) {
        return getTableReportableFields(normalizedMain, normalizedSecondary, surveyTemplateSnapshot);
      }
      return getWorkflowConditionFields(normalizedMain).filter((field) => {
        const relatedMeta = parseWorkflowRelatedFieldKey(field.key);
        if (!relatedMeta || relatedMeta.targetModuleId !== normalizedSecondary) return false;
        return isReportableField(field) || relatedMeta.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY;
      });
    })
  );
};

export const getReportableFields = (
  mainModuleId?: string | null,
  secondaryModuleId?: string | string[] | null,
  surveyTemplateSnapshot?: unknown,
  taskProcessFields: ModuleField[] = [],
) =>
  dedupeFields([
    ...getMainReportableFields(mainModuleId, surveyTemplateSnapshot, taskProcessFields),
    ...getSecondaryReportableFields(mainModuleId, secondaryModuleId, surveyTemplateSnapshot),
  ]);

export const getReportConditionFields = (
  mainModuleId?: string | null,
  secondaryModuleId?: string | string[] | null,
  surveyTemplateSnapshot?: unknown,
  taskProcessFields: ModuleField[] = [],
) =>
  getReportableFields(mainModuleId, secondaryModuleId, surveyTemplateSnapshot, taskProcessFields);

export const getReportableFieldMap = (
  mainModuleId?: string | null,
  secondaryModuleId?: string | string[] | null,
  surveyTemplateSnapshot?: unknown,
  taskProcessFields: ModuleField[] = [],
) => {
  return getReportableFields(mainModuleId, secondaryModuleId, surveyTemplateSnapshot, taskProcessFields).reduce<Record<string, ModuleField>>((acc, field) => {
    acc[field.key] = field;
    return acc;
  }, {});
};

export const getGroupableReportFields = (
  mainModuleId?: string | null,
  secondaryModuleId?: string | string[] | null,
  surveyTemplateSnapshot?: unknown,
  taskProcessFields: ModuleField[] = [],
) =>
  getReportableFields(mainModuleId, secondaryModuleId, surveyTemplateSnapshot, taskProcessFields).filter((field) => isGroupableReportField(field));

export const getSummableReportFields = (
  mainModuleId?: string | null,
  secondaryModuleId?: string | string[] | null,
  surveyTemplateSnapshot?: unknown,
  taskProcessFields: ModuleField[] = [],
) =>
  getReportableFields(mainModuleId, secondaryModuleId, surveyTemplateSnapshot, taskProcessFields).filter((field) => isSummableReportField(field));

export const getReportModuleOptions = (permissions?: Record<string, { view?: boolean }> | null) =>
  Object.values(MODULES)
    .filter((module) => !isSaasAdminModuleId(module.id))
    .filter((module) => !REPORT_BUILDER_EXCLUDED_MODULE_IDS.has(module.id))
    .filter((module) => permissions?.[module.id]?.view !== false)
    .map((module) => ({
      label: module.titles?.fa || module.id,
      value: module.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fa'));
