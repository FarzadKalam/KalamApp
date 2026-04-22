import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Progress, Select, Spin, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BarChartOutlined, EditOutlined, FileExcelOutlined, FilePdfOutlined, PieChartOutlined, PrinterOutlined, ReloadOutlined, TableOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import SimpleBarChart from '../components/reports/SimpleBarChart';
import SimplePieChart from '../components/reports/SimplePieChart';
import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import {
  canAccessAssignedRecord,
  fetchCurrentUserRecordAccessContext,
  resolveReportsAccessPermissions,
} from '../utils/permissions';
import {
  createWorkflowEvaluationContext,
  evaluateWorkflowConditions,
  resolveWorkflowFieldValue,
} from '../utils/workflowRuntime';
import {
  getReportConditionFields,
  getReportTableBlock,
  getReportableFieldMap,
  getReportableFields,
  buildReportTableFieldKey,
  parseReportTableFieldKey,
  parseReportTableRelationFieldKey,
  normalizeReportConfig,
  type ReportDefinitionRecord,
} from '../utils/reporting';
import { loadWorkflowConditionEditorOptions } from '../utils/workflowConditionOptions';
import { escapeCsvCell, formatListCellValue } from '../utils/listPrintExport';
import { formatPersianPrice, toPersianNumber } from '../utils/persianNumberFormatter';
import { getSafeOptionFallback } from '../utils/optionHelpers';
import { printInIframe } from '../utils/printTemplates/printInIframe';
import { prepareGeneratedPdfWindow, printAsPdf } from '../utils/printTemplates/printAsPdf';
import { readCurrencyConfig } from '../utils/currency';

const { Title, Text } = Typography;

type RenderMode = 'table' | 'bar' | 'pie';

type ReportRow = Record<string, any> & {
  __report_row_key: string;
};

type GroupedRow = {
  key: string;
  parent_key?: string;
  group_field?: string;
  group_label?: string;
  group_depth: number;
  group_values: Record<string, any>;
  group_labels: Record<string, string>;
  metrics: Record<string, number>;
  metric_counts: Record<string, number>;
  row_count: number;
  detail_rows: ReportRow[];
  children?: GroupedRow[];
};

type GroupedDetailRow = ReportRow & {
  __group_row_key: string;
  __group_labels: Record<string, string>;
  __group_values: Record<string, any>;
  __group_row_spans: Record<string, number>;
};

type ExportCell = {
  value: any;
  rowSpan?: number;
};

const isMissingReportsTableError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('report_definitions') && (text.includes('does not exist') || text.includes('could not find'));
};

const normalizeCompareValue = (value: any) => {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '')).join(', ');
  if (value === null || value === undefined) return '';
  const asNumber = Number(String(value).replace(/,/g, '').trim());
  if (String(value).trim() !== '' && Number.isFinite(asNumber)) return asNumber;
  return String(value);
};

const normalizeRelationRecordId = (value: any) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return String(value?.id || value?.value || '').trim();
  }
  return String(value || '').trim();
};

const compareValues = (left: any, right: any) => {
  const a = normalizeCompareValue(left);
  const b = normalizeCompareValue(right);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'fa', { numeric: true, sensitivity: 'base' });
};

const formatMetricValue = (value: number, fieldType?: string, currencyLabel = '') => {
  if (fieldType === 'price') {
    const formatted = formatPersianPrice(value);
    return currencyLabel ? `${formatted} ${currencyLabel}` : formatted;
  }
  return toPersianNumber(Number(value || 0).toLocaleString('en-US'));
};

const formatReportCellValue = (
  field: any,
  row: Record<string, any>,
  relationOptions: Record<string, Array<{ label: string; value: string }>>,
  currencyLabel = '',
) => {
  const formatted = formatListCellValue(field, row, relationOptions, currencyLabel);
  const safeFormatted = getSafeOptionFallback(formatted, '');
  if (safeFormatted) return safeFormatted;

  const tableFieldMeta = parseReportTableFieldKey(field?.key);
  const tableRow = tableFieldMeta ? row?.__report_table_rows?.[tableFieldMeta.blockId] : null;
  const columnKey = tableFieldMeta?.columnKey || '';
  const fallbackLabel = tableRow && columnKey
    ? tableRow[`${columnKey}_label`]
      || tableRow[`${columnKey}_name`]
      || tableRow[`${columnKey}_title`]
      || tableRow[`${columnKey}_bank_name`]
      || tableRow[`${columnKey}_full_name`]
      || tableRow[`${columnKey}_display`]
    : null;
  return getSafeOptionFallback(fallbackLabel, '-');
};

const getMetricSourceKey = (fieldKey: string, row: Record<string, any>) => {
  const tableFieldMeta = parseReportTableFieldKey(fieldKey);
  if (tableFieldMeta) return `table:${tableFieldMeta.blockId}:${row.__report_row_key || ''}`;

  const tableRelationMeta = parseReportTableRelationFieldKey(fieldKey);
  if (tableRelationMeta) {
    const relationValue = row[buildReportTableFieldKey(tableRelationMeta.blockId, tableRelationMeta.relationColumnKey)];
    return `table-relation:${tableRelationMeta.blockId}:${tableRelationMeta.targetModuleId}:${normalizeRelationRecordId(relationValue) || row.__report_row_key || ''}`;
  }

  return `record:${String(row?.id || row?.__report_parent_row?.id || row.__report_row_key || '')}`;
};

const isDeletedReportRecord = (row: Record<string, any> | null | undefined) =>
  !!row && (row.is_deleted === true || row.deleted === true || row._deleted === true || !!row.deleted_at);

const isDeletedReportTableRow = (row: Record<string, any> | null | undefined) =>
  isDeletedReportRecord(row) || row?.__deleted === true || row?._destroy === true;

const isGroupingFieldAvailableForRow = (fieldKey: string, row: Record<string, any>) => {
  const tableFieldMeta = parseReportTableFieldKey(fieldKey);
  const tableRelationMeta = parseReportTableRelationFieldKey(fieldKey);
  const blockId = tableFieldMeta?.blockId || tableRelationMeta?.blockId || '';
  if (!blockId) return true;
  return !!row?.__report_table_rows?.[blockId];
};

const buildFlatGroupedRows = (
  sourceRows: ReportRow[],
  groupBys: Array<{ field: string; direction: 'asc' | 'desc' }>,
  fieldMap: Record<string, any>,
  relationOptions: Record<string, Array<{ label: string; value: string }>>,
  metricType: string,
  metricFields: string[],
  currencyLabel = '',
) => {
  if (groupBys.length === 0) return [];
  const buckets = new Map<string, GroupedRow>();
  sourceRows.forEach((row) => {
    if (!groupBys.every((item) => isGroupingFieldAvailableForRow(item.field, row))) return;
    const groupLabels: Record<string, string> = {};
    const groupValues: Record<string, any> = {};
    groupBys.forEach((grouping) => {
      const field = fieldMap[grouping.field];
      groupValues[grouping.field] = row[grouping.field];
      groupLabels[grouping.field] = field
        ? formatReportCellValue(field as any, row, relationOptions, currencyLabel)
        : String(row[grouping.field] ?? '-');
    });

    const bucketKey = groupBys
      .map((grouping) => `${grouping.field}:${String(groupValues[grouping.field] ?? groupLabels[grouping.field] ?? '-')}`)
      .join('||');
    const current = buckets.get(bucketKey) || {
      key: bucketKey,
      group_depth: groupBys.length - 1,
      group_field: groupBys[groupBys.length - 1]?.field,
      group_label: groupLabels[groupBys[groupBys.length - 1]?.field] || '-',
      group_values: groupValues,
      group_labels: groupLabels,
      metrics: {},
      metric_counts: {},
      row_count: 0,
      detail_rows: [],
    };

    current.row_count += 1;
    current.detail_rows.push(row);
    current.metrics.__count = Number(current.metrics.__count || 0) + 1;

    if (metricType === 'sum' || metricType === 'avg') {
      const metricSourceKeys = ((current as any).__metric_source_keys || {}) as Record<string, Set<string>>;
      metricFields.forEach((fieldKey) => {
        metricSourceKeys[fieldKey] = metricSourceKeys[fieldKey] || new Set<string>();
        const sourceKey = getMetricSourceKey(fieldKey, row);
        if (metricSourceKeys[fieldKey].has(sourceKey)) return;
        metricSourceKeys[fieldKey].add(sourceKey);
        const numericValue = Number(row[fieldKey] || 0);
        current.metrics[fieldKey] = Number(current.metrics[fieldKey] || 0) + (Number.isFinite(numericValue) ? numericValue : 0);
        current.metric_counts[fieldKey] = Number(current.metric_counts[fieldKey] || 0) + 1;
      });
      (current as any).__metric_source_keys = metricSourceKeys;
    }

    buckets.set(bucketKey, current);
  });

  return Array.from(buckets.values()).map((row) => {
    const { __metric_source_keys: _ignored, ...cleanRow } = row as any;
    return cleanRow as GroupedRow;
  }).sort((left, right) => {
    for (const grouping of groupBys) {
      const base = compareValues(left.group_values[grouping.field], right.group_values[grouping.field]);
      if (base !== 0) return grouping.direction === 'desc' ? -base : base;
    }
    return 0;
  });
};

const escapePrintHtml = (value: any) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ReportExecutionProgress: React.FC = () => (
  <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-white/5">
    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-gray-500">
      <span>در حال اجرای گزارش</span>
      <Spin size="small" />
    </div>
    <Progress percent={70} status="active" showInfo={false} />
  </div>
);

const getGroupingValueKey = (value: any, label: string) => {
  if (value === null || value === undefined || value === '') return `label:${label || '-'}`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};


const ReportViewerPage: React.FC = () => {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [setupMissing, setSetupMissing] = useState(false);
  const [canViewPage, setCanViewPage] = useState(true);
  const [canEditReport, setCanEditReport] = useState(false);
  const [report, setReport] = useState<ReportDefinitionRecord | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [groupedRows, setGroupedRows] = useState<GroupedRow[]>([]);
  const [, setGroupedTreeRows] = useState<GroupedRow[]>([]);
  const [chartRows, setChartRows] = useState<GroupedRow[]>([]);
  const [renderMode, setRenderMode] = useState<RenderMode>('table');
  const [activeMetricKey, setActiveMetricKey] = useState<string>('__count');
  const [printTemplate, setPrintTemplate] = useState<'landscape' | 'portrait'>('landscape');
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});

  const config = useMemo(() => normalizeReportConfig(report?.config), [report?.config]);
  const moduleId = String(report?.module_id || '').trim();
  const secondaryModuleIds = config.secondary_module_ids;
  const moduleConfig = MODULES[moduleId];
  const currencyLabel = readCurrencyConfig().label || '';
  const selectedTableBlocks = useMemo(
    () => secondaryModuleIds.map((sourceId) => getReportTableBlock(moduleId, sourceId)).filter(Boolean),
    [moduleId, secondaryModuleIds]
  );
  const reportableFields = useMemo(() => getReportableFields(moduleId, secondaryModuleIds), [moduleId, secondaryModuleIds]);
  const fieldMap = useMemo(() => getReportableFieldMap(moduleId, secondaryModuleIds), [moduleId, secondaryModuleIds]);
  const visibleFields = useMemo(
    () => reportableFields.filter((field) => config.columns.includes(field.key)),
    [config.columns, reportableFields]
  );
  const groupingFields = useMemo(
    () => config.group_bys.map((item) => fieldMap[item.field]).filter(Boolean),
    [config.group_bys, fieldMap]
  );
  const groupingSummaryLabel = useMemo(
    () => groupingFields.map((field) => field.labels?.fa || field.key).join(' / '),
    [groupingFields]
  );
  const metricFieldKeys = useMemo(
    () => (config.metric_type === 'sum' || config.metric_type === 'avg' ? config.metric_fields.filter((key) => !!fieldMap[key]) : ['__count']),
    [config.metric_fields, config.metric_type, fieldMap]
  );
  const metricOptions = useMemo(
    () =>
      config.metric_type === 'sum' || config.metric_type === 'avg'
        ? metricFieldKeys.map((key) => ({
            value: key,
            label: `${config.metric_type === 'avg' ? 'میانگین' : 'جمع'} ${fieldMap[key]?.labels?.fa || key}`,
          }))
        : [{ value: '__count', label: 'تعداد رکوردها' }],
    [config.metric_type, fieldMap, metricFieldKeys]
  );
  const chartDimensionField = config.chart_dimension_field || config.group_bys[0]?.field || null;
  const chartAvailable = !!chartDimensionField && chartRows.length > 0;
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: { moduleTitle: 'ابزارها', moduleId: 'reports', recordName: report?.name || 'گزارش' },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [report?.name]);

  const loadReport = useCallback(async () => {
    if (!reportId) {
      setCanViewPage(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const roleContext = await fetchCurrentUserRecordAccessContext(supabase);
      const access = resolveReportsAccessPermissions(roleContext.permissions);
      setCanEditReport(access.canUseBuilder);
      if (!access.canViewHub) {
        setCanViewPage(false);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('report_definitions')
        .select('id, name, description, module_id, config, is_active')
        .eq('id', reportId)
        .maybeSingle();
      if (error) throw error;

      const nextReport = (data || null) as ReportDefinitionRecord | null;
      if (!nextReport) {
        setCanViewPage(false);
        setLoading(false);
        return;
      }

      if (roleContext.permissions?.[String(nextReport.module_id || '').trim()]?.view === false) {
        setCanViewPage(false);
        setLoading(false);
        return;
      }

      const normalizedConfig = normalizeReportConfig(nextReport.config);
      const optionFields = [
        ...getReportConditionFields(String(nextReport.module_id || '').trim(), normalizedConfig.secondary_module_ids),
        ...getReportableFields(String(nextReport.module_id || '').trim(), normalizedConfig.secondary_module_ids),
      ];
      const loadedOptions = await loadWorkflowConditionEditorOptions(String(nextReport.module_id || '').trim(), optionFields);

      setRelationOptions(loadedOptions.relationOptions);
      setReport(nextReport);
      setCanViewPage(true);
      setSetupMissing(false);
    } catch (error) {
      if (isMissingReportsTableError(error)) {
        setSetupMissing(true);
      } else {
        message.error('خواندن تعریف گزارش ناموفق بود.');
      }
    } finally {
      setLoading(false);
    }
  }, [message, reportId]);

  const executeReport = useCallback(async () => {
    if (!report || !moduleConfig) return;
    setExecuting(true);
    try {
      const roleContext = await fetchCurrentUserRecordAccessContext(supabase);
      const modulePerm = roleContext.permissions?.[moduleId] || {};
      if (modulePerm.view === false) {
        setCanViewPage(false);
        setRows([]);
        setGroupedRows([]);
        return;
      }

      const { data, error } = await supabase
        .from(moduleConfig.table || moduleId)
        .select('*')
        .limit(config.row_limit);
      if (error) throw error;

      const scopedRows = (data || []).filter((row: any) =>
        !isDeletedReportRecord(row) && canAccessAssignedRecord(row, roleContext.userId, roleContext.roleId, modulePerm.record_scope || 'all', {
          currentOrgId: roleContext.orgId,
          allowedRoleIds: roleContext.allowedRoleIds,
          allowedUserIds: roleContext.allowedUserIds,
        })
      );

      const neededKeys = Array.from(new Set([
        ...config.columns,
        ...config.group_bys.map((item) => item.field),
        chartDimensionField,
        ...config.metric_fields,
      ].filter((item): item is string => !!item)));
      const conditionFieldKeys = [
        ...config.conditions_all,
        ...config.conditions_any,
      ].map((condition: any) => String(condition?.field || '').trim()).filter(Boolean);
      const tableRelationFieldKeys = Array.from(new Set([
        ...neededKeys,
        ...conditionFieldKeys,
      ].filter((fieldKey) => !!parseReportTableRelationFieldKey(fieldKey))));
      const tableRelationRecordCache = new Map<string, Record<string, any> | null>();
      const relationIdsByModule = new Map<string, Set<string>>();

      tableRelationFieldKeys.forEach((fieldKey) => {
        const relationMeta = parseReportTableRelationFieldKey(fieldKey);
        if (!relationMeta) return;
        scopedRows.forEach((sourceRow: any) => {
          const blockRows = Array.isArray(sourceRow?.[relationMeta.blockId]) ? sourceRow[relationMeta.blockId] : [];
          blockRows.forEach((tableRow: any) => {
            const relationRecordId = normalizeRelationRecordId(tableRow?.[relationMeta.relationColumnKey]);
            if (!relationRecordId) return;
            const ids = relationIdsByModule.get(relationMeta.targetModuleId) || new Set<string>();
            ids.add(relationRecordId);
            relationIdsByModule.set(relationMeta.targetModuleId, ids);
          });
        });
      });

      await Promise.all(Array.from(relationIdsByModule.entries()).map(async ([targetModuleId, idSet]) => {
        const targetModule = MODULES[targetModuleId];
        const ids = Array.from(idSet);
        if (!targetModule || ids.length === 0) return;
        for (let offset = 0; offset < ids.length; offset += 200) {
          const chunk = ids.slice(offset, offset + 200);
          const { data: relatedRows, error: relatedRowsError } = await supabase
            .from(targetModule.table || targetModuleId)
            .select('*')
            .in('id', chunk);
          if (relatedRowsError) throw relatedRowsError;
          (relatedRows || []).forEach((relatedRow: any) => {
            const relatedId = String(relatedRow?.id || '').trim();
            if (relatedId) tableRelationRecordCache.set(`${targetModuleId}:${relatedId}`, isDeletedReportRecord(relatedRow) ? null : relatedRow);
          });
          chunk.forEach((id) => {
            const cacheKey = `${targetModuleId}:${id}`;
            if (!tableRelationRecordCache.has(cacheKey)) tableRelationRecordCache.set(cacheKey, null);
          });
        }
      }));

      const fetchTableRelationRecord = async (targetModuleId: string, recordId: string) => {
        const targetModule = MODULES[targetModuleId];
        const normalizedRecordId = String(recordId || '').trim();
        if (!targetModule || !normalizedRecordId) return null;
        const cacheKey = `${targetModuleId}:${normalizedRecordId}`;
        if (tableRelationRecordCache.has(cacheKey)) {
          return tableRelationRecordCache.get(cacheKey) || null;
        }
        const { data: relatedRecord, error: relatedError } = await supabase
          .from(targetModule.table || targetModuleId)
          .select('*')
          .eq('id', normalizedRecordId)
          .maybeSingle();
        if (relatedError) throw relatedError;
        const normalizedRelatedRecord = relatedRecord && !isDeletedReportRecord(relatedRecord)
          ? relatedRecord as Record<string, any>
          : null;
        tableRelationRecordCache.set(cacheKey, normalizedRelatedRecord);
        return normalizedRelatedRecord;
      };

      const nextRows: ReportRow[] = [];
      const reportEvaluationContext = createWorkflowEvaluationContext(moduleId);
      for (let index = 0; index < scopedRows.length; index += 1) {
        const sourceRow = scopedRows[index];
        const tableSources = selectedTableBlocks.map((block: any) => ({
          block,
          rows: Array.isArray(sourceRow?.[block.id])
            ? sourceRow[block.id].filter((tableRow: any) => !isDeletedReportTableRow(tableRow))
            : [],
        }));

        const tableCombos = tableSources.length === 0
          ? [{ rowsByBlockId: {}, keyParts: [] as string[] }]
          : tableSources.flatMap((source) =>
              source.rows.map((tableRow: any, tableIndex: number) => ({
                rowsByBlockId: { [source.block.id]: tableRow },
                keyParts: [`${source.block.id}:${tableIndex}`],
              }))
            );

        for (const tableCombo of tableCombos) {
          const candidateRow: ReportRow = {
            ...sourceRow,
            __report_parent_row: sourceRow,
            __report_table_rows: tableCombo.rowsByBlockId,
            __report_row_key: tableCombo.keyParts.length > 0
              ? `${String(sourceRow?.id || index)}:${tableCombo.keyParts.join(':')}`
              : String(sourceRow?.id || index),
          };

          selectedTableBlocks.forEach((block: any) => {
            const tableRow = tableCombo.rowsByBlockId[block.id];
            if (!tableRow || typeof tableRow !== 'object') return;
            (block.tableColumns || []).forEach((column: any) => {
              const columnKey = String(column?.key || '').trim();
              if (!columnKey) return;
              const reportFieldKey = buildReportTableFieldKey(String(block.id || ''), columnKey);
              candidateRow[reportFieldKey] = tableRow?.[columnKey];
            });
          });

          for (const fieldKey of tableRelationFieldKeys) {
            const relationMeta = parseReportTableRelationFieldKey(fieldKey);
            if (!relationMeta) continue;
            const relationValue = candidateRow[buildReportTableFieldKey(relationMeta.blockId, relationMeta.relationColumnKey)];
            const relationRecordId = normalizeRelationRecordId(relationValue);
            if (!relationRecordId) {
              candidateRow[fieldKey] = null;
              continue;
            }
            const relatedRecord = await fetchTableRelationRecord(relationMeta.targetModuleId, relationRecordId);
            candidateRow[fieldKey] = relatedRecord?.[relationMeta.targetFieldKey] ?? null;
          }

          const passed = await evaluateWorkflowConditions({
            conditionsAll: config.conditions_all,
            conditionsAny: config.conditions_any,
            currentRecord: candidateRow,
            moduleId,
            context: reportEvaluationContext,
          });
          if (!passed) continue;

          const context = createWorkflowEvaluationContext(moduleId);
          const resolvedRow: ReportRow = { ...candidateRow };

          for (const fieldKey of neededKeys) {
            if (parseReportTableFieldKey(fieldKey) || parseReportTableRelationFieldKey(fieldKey)) {
              resolvedRow[fieldKey] = candidateRow[fieldKey];
              continue;
            }
            resolvedRow[fieldKey] = await resolveWorkflowFieldValue({
              fieldKey,
              currentRecord: candidateRow,
              moduleId,
              context,
            });
          }

          nextRows.push(resolvedRow);
        }
      }

      setRows(nextRows);
      setChartRows(chartDimensionField ? buildFlatGroupedRows(
        nextRows,
        [{ field: chartDimensionField, direction: 'asc' }],
        fieldMap,
        relationOptions,
        config.metric_type,
        config.metric_fields,
        currencyLabel
      ) : []);

      if (config.group_bys.length === 0) {
        setGroupedRows([]);
        setGroupedTreeRows([]);
        return;
      }

      const buckets = new Map<string, GroupedRow>();
      nextRows.forEach((row) => {
        const groupLabels: Record<string, string> = {};
        const groupValues: Record<string, any> = {};

        config.group_bys.forEach((grouping) => {
          const field = fieldMap[grouping.field];
          groupValues[grouping.field] = row[grouping.field];
          groupLabels[grouping.field] = field
            ? formatReportCellValue(field as any, row, relationOptions, currencyLabel)
            : String(row[grouping.field] ?? '-');
        });

        config.group_bys.forEach((grouping, depth) => {
          const activeGroupings = config.group_bys.slice(0, depth + 1);
          if (!activeGroupings.every((item) => isGroupingFieldAvailableForRow(item.field, row))) return;
          const bucketKey = activeGroupings
            .map((item) => `${item.field}:${String(groupValues[item.field] ?? groupLabels[item.field] ?? '-')}`)
            .join('||');
          const parentKey = depth > 0
            ? activeGroupings
                .slice(0, -1)
                .map((item) => `${item.field}:${String(groupValues[item.field] ?? groupLabels[item.field] ?? '-')}`)
                .join('||')
            : undefined;
          const current = buckets.get(bucketKey) || {
            key: bucketKey,
            parent_key: parentKey,
            group_field: grouping.field,
            group_label: groupLabels[grouping.field] || '-',
            group_depth: depth,
            group_values: activeGroupings.reduce<Record<string, any>>((acc, item) => {
              acc[item.field] = groupValues[item.field];
              return acc;
            }, {}),
            group_labels: activeGroupings.reduce<Record<string, string>>((acc, item) => {
              acc[item.field] = groupLabels[item.field];
              return acc;
            }, {}),
            metrics: {},
            metric_counts: {},
            row_count: 0,
            detail_rows: [],
          };

          current.row_count += 1;
          current.detail_rows.push(row);
          current.metrics.__count = Number(current.metrics.__count || 0) + 1;

          if (config.metric_type === 'sum' || config.metric_type === 'avg') {
            const metricSourceKeys = ((current as any).__metric_source_keys || {}) as Record<string, Set<string>>;
            config.metric_fields.forEach((fieldKey) => {
              metricSourceKeys[fieldKey] = metricSourceKeys[fieldKey] || new Set<string>();
              const sourceKey = getMetricSourceKey(fieldKey, row);
              if (metricSourceKeys[fieldKey].has(sourceKey)) return;
              metricSourceKeys[fieldKey].add(sourceKey);
              const numericValue = Number(row[fieldKey] || 0);
              current.metrics[fieldKey] = Number(current.metrics[fieldKey] || 0) + (Number.isFinite(numericValue) ? numericValue : 0);
              current.metric_counts[fieldKey] = Number(current.metric_counts[fieldKey] || 0) + 1;
            });
            (current as any).__metric_source_keys = metricSourceKeys;
          }

          buckets.set(bucketKey, current);
        });
      });

      const nextGroupedRows = Array.from(buckets.values()).map((row) => {
        const { __metric_source_keys: _ignored, ...cleanRow } = row as any;
        return { detail_rows: [], ...cleanRow } as GroupedRow;
      }).sort((left, right) => {
        for (const grouping of config.group_bys) {
          const base = compareValues(left.group_values[grouping.field], right.group_values[grouping.field]);
          if (base !== 0) return grouping.direction === 'desc' ? -base : base;
        }
        return 0;
      });
      const rowsByKey = new Map(nextGroupedRows.map((row) => [row.key, { ...row, children: [] as GroupedRow[] }]));
      const nextTreeRows: GroupedRow[] = [];
      rowsByKey.forEach((row) => {
        if (row.parent_key && rowsByKey.has(row.parent_key)) {
          rowsByKey.get(row.parent_key)!.children!.push(row);
          return;
        }
        nextTreeRows.push(row);
      });
      const normalizeChildren = (items: GroupedRow[]): GroupedRow[] =>
        items.map((item) => {
          const children = item.children && item.children.length > 0 ? normalizeChildren(item.children) : [];
          if (children.length === 1 && String(children[0].group_label || '') === String(item.group_label || '')) {
            return { ...children[0], parent_key: item.parent_key, group_depth: item.group_depth };
          }
          return { ...item, children: children.length > 0 ? children : undefined };
        });
      setGroupedRows(nextGroupedRows.filter((row) => row.group_depth === config.group_bys.length - 1));
      setGroupedTreeRows(normalizeChildren(nextTreeRows));
    } catch {
      message.error('اجرای گزارش ناموفق بود.');
      setRows([]);
      setGroupedRows([]);
      setGroupedTreeRows([]);
      setChartRows([]);
    } finally {
      setExecuting(false);
    }
  }, [chartDimensionField, config.conditions_all, config.conditions_any, config.columns, config.group_bys, config.metric_fields, config.metric_type, config.row_limit, currencyLabel, fieldMap, message, moduleConfig, moduleId, relationOptions, report, selectedTableBlocks]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (!report) return;
    setRenderMode(config.default_view === 'table_and_chart' && chartDimensionField ? 'bar' : 'table');
    void executeReport();
  }, [chartDimensionField, config.default_view, executeReport, report]);

  useEffect(() => {
    const fallback = metricOptions[0]?.value || '__count';
    if (!metricOptions.some((item) => item.value === activeMetricKey)) {
      setActiveMetricKey(fallback);
    }
  }, [activeMetricKey, metricOptions]);

  const totalMetricValue = useMemo(() => {
    if (activeMetricKey === '__count') return rows.length;
    if (config.group_bys.length > 0) {
      const sum = groupedRows.reduce((current, row) => current + Number(row.metrics[activeMetricKey] || 0), 0);
      const count = groupedRows.reduce((current, row) => current + Number(row.metric_counts[activeMetricKey] || 0), 0);
      return config.metric_type === 'avg' ? (count > 0 ? sum / count : 0) : sum;
    }
    const seen = new Set<string>();
    let sum = 0;
    let count = 0;
    rows.forEach((row) => {
      const sourceKey = getMetricSourceKey(activeMetricKey, row);
      if (seen.has(sourceKey)) return;
      seen.add(sourceKey);
      const numericValue = Number(row[activeMetricKey] || 0);
      sum += Number.isFinite(numericValue) ? numericValue : 0;
      count += 1;
    });
    return config.metric_type === 'avg' ? (count > 0 ? sum / count : 0) : sum;
  }, [activeMetricKey, config.group_bys.length, config.metric_type, groupedRows, rows]);

  const metricCardValues = useMemo(() => {
    if (config.metric_type === 'count') {
      return [{ key: '__count', label: 'تعداد رکوردها', value: rows.length, fieldType: 'number' }];
    }
    return metricFieldKeys.map((fieldKey) => {
      let sum = 0;
      let count = 0;
      if (config.group_bys.length > 0) {
        sum = groupedRows.reduce((current, row) => current + Number(row.metrics[fieldKey] || 0), 0);
        count = groupedRows.reduce((current, row) => current + Number(row.metric_counts[fieldKey] || 0), 0);
      } else {
        const seen = new Set<string>();
        rows.forEach((row) => {
          const sourceKey = getMetricSourceKey(fieldKey, row);
          if (seen.has(sourceKey)) return;
          seen.add(sourceKey);
          const numericValue = Number(row[fieldKey] || 0);
          sum += Number.isFinite(numericValue) ? numericValue : 0;
          count += 1;
        });
      }
      return {
        key: fieldKey,
        label: `${config.metric_type === 'avg' ? 'میانگین' : 'جمع'} ${fieldMap[fieldKey]?.labels?.fa || fieldKey}`,
        value: config.metric_type === 'avg' ? (count > 0 ? sum / count : 0) : sum,
        fieldType: String(fieldMap[fieldKey]?.type || '').toLowerCase(),
      };
    });
  }, [config.group_bys.length, config.metric_type, fieldMap, groupedRows, metricFieldKeys, rows]);

  const groupByFields = useMemo(
    () => config.group_bys.map((item) => fieldMap[item.field]).filter(Boolean),
    [config.group_bys, fieldMap]
  );
  const visibleDetailFields = useMemo(
    () => visibleFields.filter((field) => !config.group_bys.some((grouping) => grouping.field === field.key)),
    [config.group_bys, visibleFields]
  );
  const groupedDetailRows = useMemo<GroupedDetailRow[]>(() => {
    if (config.group_bys.length === 0) return [];
    const eligibleRows = rows
      .filter((row) => config.group_bys.every((grouping) => isGroupingFieldAvailableForRow(grouping.field, row)))
      .map((row, index): GroupedDetailRow => {
        const groupLabels: Record<string, string> = {};
        const groupValues: Record<string, any> = {};
        config.group_bys.forEach((grouping) => {
          const field = fieldMap[grouping.field];
          groupValues[grouping.field] = row[grouping.field];
          groupLabels[grouping.field] = field
            ? formatReportCellValue(field as any, row, relationOptions, currencyLabel)
            : String(row[grouping.field] ?? '-');
        });
        return {
          ...row,
          __group_row_key: `${row.__report_row_key || index}:grouped:${index}`,
          __group_labels: groupLabels,
          __group_values: groupValues,
          __group_row_spans: {},
        };
      })
      .sort((left, right) => {
        for (const grouping of config.group_bys) {
          const base = compareValues(left.__group_values[grouping.field], right.__group_values[grouping.field]);
          if (base !== 0) return grouping.direction === 'desc' ? -base : base;
        }
        return 0;
      });

    config.group_bys.forEach((grouping, depth) => {
      let start = 0;
      while (start < eligibleRows.length) {
        let end = start + 1;
        const currentKey = config.group_bys
          .slice(0, depth + 1)
          .map((item) => `${item.field}:${getGroupingValueKey(eligibleRows[start].__group_values[item.field], eligibleRows[start].__group_labels[item.field])}`)
          .join('||');
        while (end < eligibleRows.length) {
          const nextKey = config.group_bys
            .slice(0, depth + 1)
            .map((item) => `${item.field}:${getGroupingValueKey(eligibleRows[end].__group_values[item.field], eligibleRows[end].__group_labels[item.field])}`)
            .join('||');
          if (nextKey !== currentKey) break;
          end += 1;
        }
        eligibleRows[start].__group_row_spans[grouping.field] = end - start;
        for (let index = start + 1; index < end; index += 1) {
          eligibleRows[index].__group_row_spans[grouping.field] = 0;
        }
        start = end;
      }
    });

    return eligibleRows;
  }, [config.group_bys, currencyLabel, fieldMap, relationOptions, rows]);

  const rawColumns = useMemo<ColumnsType<ReportRow>>(
    () =>
      visibleFields.map((field) => ({
        title: field.labels?.fa || field.key,
        dataIndex: field.key,
        key: field.key,
        render: (_value, row) => formatReportCellValue(field as any, row, relationOptions, currencyLabel),
      })),
    [currencyLabel, relationOptions, visibleFields]
  );

  const groupedDetailColumns = useMemo<ColumnsType<GroupedDetailRow>>(
    () => [
      ...groupByFields.map((field) => ({
        title: field.labels?.fa || field.key,
        dataIndex: field.key,
        key: `group:${field.key}`,
        render: (_value: unknown, row: GroupedDetailRow) => ({
          children: (
            <div className="flex min-h-[44px] items-center font-bold text-gray-800 dark:text-gray-100">
              {row.__group_labels[field.key] || '-'}
            </div>
          ),
          props: { rowSpan: row.__group_row_spans[field.key] || 0 },
        }),
      })),
      ...visibleDetailFields.map((field) => ({
        title: field.labels?.fa || field.key,
        dataIndex: field.key,
        key: field.key,
        render: (_value: unknown, row: GroupedDetailRow) => formatReportCellValue(field as any, row, relationOptions, currencyLabel),
      })),
    ],
    [currencyLabel, groupByFields, relationOptions, visibleDetailFields]
  );

  const chartItems = useMemo(() => {
    if (!chartAvailable) return [];
    return chartRows.map((row) => {
      const label = getSafeOptionFallback(row.group_label || (chartDimensionField ? row.group_labels[chartDimensionField] : ''), '-');
      const value = activeMetricKey === '__count'
        ? row.row_count
        : config.metric_type === 'avg'
          ? Number(row.metrics[activeMetricKey] || 0) / Math.max(1, Number(row.metric_counts[activeMetricKey] || 0))
          : Number(row.metrics[activeMetricKey] || 0);
      return { label, value, count: row.row_count };
    });
  }, [activeMetricKey, chartAvailable, chartDimensionField, chartRows, config.metric_type]);

  const exportHeaders = useMemo(() => {
    if (config.group_bys.length > 0) {
      return [
        ...groupByFields.map((field) => field.labels?.fa || field.key),
        ...visibleDetailFields.map((field) => field.labels?.fa || field.key),
      ];
    }
    return visibleFields.map((field) => field.labels?.fa || field.key);
  }, [config.group_bys.length, groupByFields, visibleDetailFields, visibleFields]);

  const exportCellRows = useMemo<ExportCell[][]>(() => {
    if (config.group_bys.length > 0) {
      return groupedDetailRows.map((row) => [
        ...groupByFields.map((field) => ({
          value: row.__group_labels[field.key] || '-',
          rowSpan: row.__group_row_spans[field.key] || 0,
        })),
        ...visibleDetailFields.map((field) => ({
          value: formatReportCellValue(field as any, row, relationOptions, currencyLabel),
        })),
      ]);
    }
    return rows.map((row) => visibleFields.map((field) => ({
      value: formatReportCellValue(field as any, row, relationOptions, currencyLabel),
    })));
  }, [config.group_bys.length, currencyLabel, groupByFields, groupedDetailRows, relationOptions, rows, visibleDetailFields, visibleFields]);

  const exportRows = useMemo(
    () => exportCellRows.map((line) => line.map((cell) => cell.rowSpan === 0 ? '' : cell.value)),
    [exportCellRows]
  );

  const exportMergeRanges = useMemo(() => {
    if (config.group_bys.length === 0) return [];
    const ranges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];
    exportCellRows.forEach((line, rowIndex) => {
      line.slice(0, groupByFields.length).forEach((cell, columnIndex) => {
        const rowSpan = Number(cell.rowSpan || 0);
        if (rowSpan > 1) {
          ranges.push({
            s: { r: rowIndex + 1, c: columnIndex },
            e: { r: rowIndex + rowSpan, c: columnIndex },
          });
        }
      });
    });
    return ranges;
  }, [config.group_bys.length, exportCellRows, groupByFields.length]);

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const sheet = XLSX.utils.aoa_to_sheet([exportHeaders, ...exportRows]);
      sheet['!cols'] = exportHeaders.map((header) => ({ wch: Math.max(14, String(header).length + 6) }));
      if (exportMergeRanges.length > 0) {
        sheet['!merges'] = exportMergeRanges;
      }
      const workbook = XLSX.utils.book_new();
      workbook.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(workbook, sheet, 'گزارش');
      XLSX.writeFile(workbook, `${report?.name || 'report'}.xlsx`);
    } catch {
      const csv = [exportHeaders, ...exportRows]
        .map((line) => line.map((cell) => escapeCsvCell(cell)).join(','))
        .join('\n');
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${report?.name || 'report'}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const buildReportPrintHtml = (orientation: 'portrait' | 'landscape') => {
    const chartMax = Math.max(1, ...chartItems.map((item) => Number(item.value || 0)));
    const printFontSize = exportHeaders.length > 14 ? (orientation === 'landscape' ? 6.5 : 5.8) : (orientation === 'landscape' ? 8 : 7);
    const tableRowsHtml = exportCellRows.map((line) => `
      <tr>${line.map((cell) => {
        if (cell.rowSpan === 0) return '';
        const rowSpanAttr = Number(cell.rowSpan || 0) > 1 ? ` rowspan="${Number(cell.rowSpan)}"` : '';
        return `<td${rowSpanAttr}>${escapePrintHtml(cell.value ?? '-')}</td>`;
      }).join('')}</tr>
    `).join('');
    const chartHtml = chartAvailable && chartItems.length > 0 ? `
      <section class="report-print-section">
        <h3>نمودار</h3>
        <div class="report-print-chart">
          ${chartItems.map((item) => `
            <div class="report-print-chart-row">
              <span>${escapePrintHtml(item.label)}</span>
              <div><i style="width:${Math.max(4, Math.round((Number(item.value || 0) / chartMax) * 100))}%"></i></div>
              <b>${escapePrintHtml(formatMetricValue(Number(item.value || 0), String(fieldMap[activeMetricKey]?.type || '').toLowerCase(), currencyLabel))}</b>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '';

    return `
      <div class="list-print-page report-print-page ${orientation === 'landscape' ? 'report-print-landscape' : ''}" dir="rtl">
        <style>
          .report-print-page, .report-print-page * { box-sizing:border-box; }
          .report-print-page { width:100%; max-width:${orientation === 'landscape' ? '297mm' : '210mm'}; min-height:${orientation === 'landscape' ? '210mm' : '297mm'}; padding:${orientation === 'landscape' ? '7mm' : '8mm'}; background:#fff; color:#111827; font-family:Vazirmatn,Tahoma,sans-serif; overflow:hidden; }
          .report-print-header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; border-bottom:2px solid #111827; padding-bottom:8px; margin-bottom:10px; }
          .report-print-title { font-size:18px; font-weight:900; }
          .report-print-meta { font-size:10px; color:#6b7280; text-align:left; }
          .report-print-section h3 { margin:10px 0 6px; font-size:13px; }
          .report-print-table { width:100%; max-width:100%; border-collapse:collapse; table-layout:fixed; font-size:${printFontSize}px; }
          .report-print-table th, .report-print-table td { border:1px solid #d1d5db; padding:4px; text-align:right; vertical-align:middle; overflow-wrap:anywhere; word-break:break-word; line-height:1.7; }
          .report-print-table th { background:#f3f4f6; font-weight:800; }
          .report-print-chart { border:1px solid #d1d5db; padding:8px; }
          .report-print-chart-row { display:grid; grid-template-columns:120px 1fr 90px; gap:8px; align-items:center; margin:5px 0; font-size:9px; }
          .report-print-chart-row div { height:10px; background:#f3f4f6; overflow:hidden; }
          .report-print-chart-row i { display:block; height:100%; background:#8b5e3c; }
        </style>
        <header class="report-print-header">
          <div>
            <div class="report-print-title">${escapePrintHtml(report?.name || 'گزارش')}</div>
            <div>${escapePrintHtml(moduleConfig?.titles?.fa || moduleId)}</div>
          </div>
          <div class="report-print-meta">${escapePrintHtml(new Date().toLocaleString('fa-IR'))}</div>
        </header>
        ${chartHtml}
        <section class="report-print-section">
          <h3>جدول گزارش</h3>
          <table class="report-print-table">
            <thead><tr>${exportHeaders.map((header) => `<th>${escapePrintHtml(header)}</th>`).join('')}</tr></thead>
            <tbody>${tableRowsHtml}</tbody>
          </table>
        </section>
      </div>
    `;
  };

  const handlePrint = (orientation: 'portrait' | 'landscape' = 'landscape') => {
    void printInIframe({
      pageSize: `A4 ${orientation}`,
      sourceHtml: buildReportPrintHtml(orientation),
      title: report?.name || 'گزارش',
    });
  };

  const handleExportPdf = (orientation: 'portrait' | 'landscape') => {
    const title = report?.name || 'گزارش';
    const targetWindow = prepareGeneratedPdfWindow(title);
    void printAsPdf({
      filename: `${title}.pdf`,
      pageSize: `A4 ${orientation}`,
      sourceHtml: buildReportPrintHtml(orientation),
      targetWindow,
      title,
    }).catch(() => {
      void printInIframe({ pageSize: `A4 ${orientation}`, sourceHtml: buildReportPrintHtml(orientation), title });
    });
  };

  if (loading) {
    return <div className="flex h-[70vh] items-center justify-center"><Spin size="large" /></div>;
  }

  if (!canViewPage) {
    return <div className="flex h-[70vh] items-center justify-center"><Empty description="دسترسی به این گزارش ندارید" /></div>;
  }

  if (setupMissing) {
    return <div className="flex h-[70vh] items-center justify-center"><Empty description="زیرساخت دیتابیس گزارشات هنوز اعمال نشده است" /></div>;
  }

  return (
    <div className="mx-auto max-w-[1680px] animate-fadeIn p-4 md:p-8">
      <div className="min-h-[70vh] rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm transition-colors dark:border-gray-800 dark:bg-[#1a1a1a]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Title level={3} className="!mb-1">{report?.name}</Title>
            <Text className="text-gray-500">{report?.description || 'بدون توضیح'}</Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<ReloadOutlined />} loading={executing} onClick={() => void executeReport()}>اجرای دوباره</Button>
            <Button icon={<FileExcelOutlined />} onClick={() => void handleExportExcel()}>خروجی Excel</Button>
            <Select
              className="min-w-[150px]"
              value={printTemplate}
              options={[
                { value: 'landscape', label: 'A4 افقی' },
                { value: 'portrait', label: 'A4 عمودی' },
              ]}
              onChange={(value) => setPrintTemplate(value)}
            />
            <Button icon={<PrinterOutlined />} onClick={() => handlePrint(printTemplate)}>چاپ</Button>
            <Button icon={<FilePdfOutlined />} onClick={() => handleExportPdf(printTemplate)}>PDF</Button>
            {canEditReport && <Button icon={<EditOutlined />} onClick={() => navigate(`/reports/${report?.id}/edit`)}>ویرایش</Button>}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-white/5">
            <Statistic title="تعداد ردیف نتیجه" value={rows.length} formatter={(value) => toPersianNumber(value)} />
          </div>
          <div className="rounded-[1.5rem] border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-white/5">
            <Statistic title="گروه‌ها" value={groupedRows.length} formatter={(value) => toPersianNumber(value)} />
            {groupingSummaryLabel ? (
              <div className="mt-2 text-xs text-gray-500">
                گروه‌بندی بر اساس: {groupingSummaryLabel}
              </div>
            ) : null}
          </div>
          <div className="rounded-[1.5rem] border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-white/5">
            <Statistic
              title={metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار'}
              value={totalMetricValue}
              formatter={(value) => activeMetricKey === '__count' ? toPersianNumber(value) : formatMetricValue(Number(value || 0), String(fieldMap[activeMetricKey]?.type || '').toLowerCase(), currencyLabel)}
            />
          </div>
        </div>

        {metricCardValues.length > 1 && (
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metricCardValues.map((metric) => (
              <div key={metric.key} className="rounded-[1.5rem] border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-white/5">
                <Statistic
                  title={metric.label}
                  value={metric.value}
                  formatter={(value) => metric.key === '__count' ? toPersianNumber(value) : formatMetricValue(Number(value || 0), metric.fieldType, currencyLabel)}
                />
              </div>
            ))}
          </div>
        )}

        {chartAvailable && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-gray-200 p-4 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={<TableOutlined />} type={renderMode === 'table' ? 'primary' : 'default'} className={renderMode === 'table' ? 'bg-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-500-rgb),1)] border-none' : ''} onClick={() => setRenderMode('table')}>جدول</Button>
              <Button icon={<BarChartOutlined />} type={renderMode === 'bar' ? 'primary' : 'default'} className={renderMode === 'bar' ? 'bg-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-500-rgb),1)] border-none' : ''} onClick={() => setRenderMode('bar')}>نمودار ستونی</Button>
              <Button icon={<PieChartOutlined />} type={renderMode === 'pie' ? 'primary' : 'default'} className={renderMode === 'pie' ? 'bg-[rgba(var(--brand-600-rgb),1)] hover:!bg-[rgba(var(--brand-500-rgb),1)] border-none' : ''} onClick={() => setRenderMode('pie')}>نمودار دایره‌ای</Button>
            </div>
            {metricOptions.length > 1 && (
              <Select
                className="min-w-[260px]"
                value={activeMetricKey}
                options={metricOptions}
                onChange={(value) => setActiveMetricKey(String(value))}
              />
            )}
          </div>
        )}

        {renderMode === 'bar' && chartAvailable && (
          <SimpleBarChart
            items={chartItems}
            valueLabel={metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار'}
            valueFormatter={(value) => activeMetricKey === '__count'
              ? toPersianNumber(value)
              : formatMetricValue(Number(value || 0), String(fieldMap[activeMetricKey]?.type || '').toLowerCase(), currencyLabel)}
          />
        )}

        {renderMode === 'pie' && chartAvailable && (
          <SimplePieChart
            items={chartItems}
            valueLabel={metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار'}
            valueFormatter={(value) => activeMetricKey === '__count'
              ? toPersianNumber(value)
              : formatMetricValue(Number(value || 0), String(fieldMap[activeMetricKey]?.type || '').toLowerCase(), currencyLabel)}
          />
        )}

        {executing && <ReportExecutionProgress />}

        {(renderMode === 'table' || !chartAvailable) && (
          config.group_bys.length > 0 ? (
            <Table<GroupedDetailRow>
              loading={executing}
              rowKey="__group_row_key"
              dataSource={groupedDetailRows}
              columns={groupedDetailColumns}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              scroll={{ x: true }}
              locale={{ emptyText: 'برای این گزارش داده‌ای پیدا نشد' }}
            />
          ) : (
            <Table<ReportRow>
              loading={executing}
              rowKey="__report_row_key"
              dataSource={rows}
              columns={rawColumns}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              scroll={{ x: true }}
              locale={{ emptyText: 'برای این گزارش داده‌ای پیدا نشد' }}
            />
          )
        )}
      </div>
    </div>
  );
};

export default ReportViewerPage;
