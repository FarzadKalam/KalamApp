import { MODULES } from '../moduleRegistry';
import { BlockType, FieldType, type BlockDefinition, type ModuleField } from '../types';
import { getSyntheticWorkflowAssigneeField, getWorkflowConditionFields } from './workflowHelpers';
import { parseWorkflowRelatedFieldKey, WORKFLOW_ASSIGNEE_FIELD_KEY, type WorkflowCondition } from './workflowTypes';

export type ReportMetricType = 'count' | 'sum' | 'avg';
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
  secondary_module_ids: string[];
  columns: string[];
  conditions_all: WorkflowCondition[];
  conditions_any: WorkflowCondition[];
  row_limit: number;
  group_bys: ReportGroupingDefinition[];
  metric_type: ReportMetricType;
  metric_fields: string[];
  show_group_summaries: boolean;
  chart_dimension_field: string | null;
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

export const createDefaultReportScheduleConfig = (): ReportScheduleConfig => ({
  enabled: false,
  interval_value: 1,
  interval_unit: 'day',
  recipient_user_ids: [],
  delivery_channels: ['note'],
});

export const createDefaultReportConfig = (): ReportDefinitionConfig => ({
  secondary_module_id: null,
  secondary_module_ids: [],
  columns: [],
  conditions_all: [],
  conditions_any: [],
  row_limit: 200,
  group_bys: [],
  metric_type: 'count',
  metric_fields: [],
  show_group_summaries: true,
  chart_dimension_field: null,
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
  const metricType: ReportMetricType =
    value?.metric_type === 'sum' || value?.metric_type === 'avg' ? value.metric_type : 'count';
  const legacyGroupBy = value && (value as any).group_by ? String((value as any).group_by || '').trim() : '';
  const legacyMetricField = value && (value as any).metric_field ? String((value as any).metric_field || '').trim() : '';

  const metricFields = Array.isArray(value?.metric_fields)
    ? value!.metric_fields.map((item) => String(item || '').trim()).filter(Boolean)
    : legacyMetricField
      ? [legacyMetricField]
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

  return {
    ...defaults,
    ...value,
    secondary_module_id: secondaryModuleIds[0] || null,
    secondary_module_ids: Array.from(new Set(secondaryModuleIds)),
    columns: Array.isArray(value?.columns) ? value!.columns.map((item) => String(item || '').trim()).filter(Boolean) : defaults.columns,
    conditions_all: Array.isArray(value?.conditions_all) ? value!.conditions_all : defaults.conditions_all,
    conditions_any: Array.isArray(value?.conditions_any) ? value!.conditions_any : defaults.conditions_any,
    row_limit: clampReportRowLimit(value?.row_limit),
    group_bys: groupBys,
    metric_type: metricType,
    metric_fields: metricType === 'sum' || metricType === 'avg' ? metricFields.slice(0, 4) : [],
    show_group_summaries: (value as any)?.show_group_summaries === false ? false : true,
    chart_dimension_field: chartDimensionField,
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
  const relatedOptions = Array.from(
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
  );

  const tableOptions = getReportTableBlocks(mainModuleId).map((block) => ({
    label: `جدول فرعی: ${block.titles?.fa || block.id}`,
    value: buildReportTableSourceId(String(block.id || '')),
  }));

  return [...relatedOptions, ...tableOptions].sort((a, b) => a.label.localeCompare(b.label, 'fa'));
};

export const getTableReportableFields = (
  mainModuleId?: string | null,
  tableSourceId?: string | null
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
      return getMainReportableFields(targetModuleId).map((field) => ({
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
  secondaryModuleId?: string | string[] | null
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
        return getTableReportableFields(normalizedMain, normalizedSecondary);
      }
      return getWorkflowConditionFields(normalizedMain).filter((field) => {
        const relatedMeta = parseWorkflowRelatedFieldKey(field.key);
        if (!relatedMeta || relatedMeta.targetModuleId !== normalizedSecondary) return false;
        return isReportableField(field) || relatedMeta.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY;
      });
    })
  );
};

export const getReportableFields = (mainModuleId?: string | null, secondaryModuleId?: string | string[] | null) =>
  dedupeFields([
    ...getMainReportableFields(mainModuleId),
    ...getSecondaryReportableFields(mainModuleId, secondaryModuleId),
  ]);

export const getReportConditionFields = (mainModuleId?: string | null, secondaryModuleId?: string | string[] | null) =>
  getReportableFields(mainModuleId, secondaryModuleId);

export const getReportableFieldMap = (mainModuleId?: string | null, secondaryModuleId?: string | string[] | null) => {
  return getReportableFields(mainModuleId, secondaryModuleId).reduce<Record<string, ModuleField>>((acc, field) => {
    acc[field.key] = field;
    return acc;
  }, {});
};

export const getGroupableReportFields = (mainModuleId?: string | null, secondaryModuleId?: string | string[] | null) =>
  getReportableFields(mainModuleId, secondaryModuleId).filter((field) => isGroupableReportField(field));

export const getSummableReportFields = (mainModuleId?: string | null, secondaryModuleId?: string | string[] | null) =>
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
