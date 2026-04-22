import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Select, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BarChartOutlined, PieChartOutlined, ReloadOutlined, TableOutlined } from '@ant-design/icons';
import SimpleBarChart from './SimpleBarChart';
import SimplePieChart from './SimplePieChart';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import { canAccessAssignedRecord, fetchCurrentUserRecordAccessContext } from '../../utils/permissions';
import {
  createWorkflowEvaluationContext,
  evaluateWorkflowConditions,
  resolveWorkflowFieldValue,
} from '../../utils/workflowRuntime';
import {
  buildReportTableFieldKey,
  getReportConditionFields,
  getReportTableBlock,
  getReportableFieldMap,
  getReportableFields,
  normalizeReportConfig,
  parseReportTableFieldKey,
  parseReportTableRelationFieldKey,
  type ReportDefinitionRecord,
} from '../../utils/reporting';
import { loadWorkflowConditionEditorOptions } from '../../utils/workflowConditionOptions';
import { formatListCellValue } from '../../utils/listPrintExport';
import { formatPersianPrice, toPersianNumber } from '../../utils/persianNumberFormatter';
import { readCurrencyConfig } from '../../utils/currency';

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
  children?: GroupedRow[];
};

type ReportCompactRendererProps = {
  report: ReportDefinitionRecord;
  maxHeight?: number;
  rowLimitCap?: number;
};

const normalizeCompareValue = (value: any) => {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '')).join(', ');
  if (value === null || value === undefined) return '';
  const asNumber = Number(String(value).replace(/,/g, '').trim());
  if (String(value).trim() !== '' && Number.isFinite(asNumber)) return asNumber;
  return String(value);
};

const compareValues = (left: any, right: any) => {
  const a = normalizeCompareValue(left);
  const b = normalizeCompareValue(right);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'fa', { numeric: true, sensitivity: 'base' });
};

const normalizeRelationRecordId = (value: any) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return String(value?.id || value?.value || '').trim();
  }
  return String(value || '').trim();
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
  if (formatted && formatted !== '-') return formatted;

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
  return fallbackLabel || '-';
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
    };
    current.row_count += 1;
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

const ReportCompactRenderer: React.FC<ReportCompactRendererProps> = ({
  report,
  maxHeight = 360,
  rowLimitCap = 120,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [canView, setCanView] = useState(true);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [, setGroupedRows] = useState<GroupedRow[]>([]);
  const [groupedTreeRows, setGroupedTreeRows] = useState<GroupedRow[]>([]);
  const [chartRows, setChartRows] = useState<GroupedRow[]>([]);
  const [renderMode, setRenderMode] = useState<RenderMode>('table');
  const [activeMetricKey, setActiveMetricKey] = useState<string>('__count');
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});

  const config = useMemo(() => {
    const normalized = normalizeReportConfig(report?.config);
    return {
      ...normalized,
      row_limit: Math.min(normalized.row_limit, Math.max(20, rowLimitCap)),
    };
  }, [report?.config, rowLimitCap]);

  const moduleId = String(report?.module_id || '').trim();
  const moduleConfig = MODULES[moduleId];
  const currencyLabel = readCurrencyConfig().label || '';
  const selectedTableBlocks = useMemo(
    () => config.secondary_module_ids.map((sourceId) => getReportTableBlock(moduleId, sourceId)).filter(Boolean),
    [config.secondary_module_ids, moduleId]
  );
  const reportableFields = useMemo(() => getReportableFields(moduleId, config.secondary_module_ids), [moduleId, config.secondary_module_ids]);
  const fieldMap = useMemo(() => getReportableFieldMap(moduleId, config.secondary_module_ids), [moduleId, config.secondary_module_ids]);
  const visibleFields = useMemo(
    () => reportableFields.filter((field) => config.columns.includes(field.key)),
    [config.columns, reportableFields]
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

  const executeReport = React.useCallback(async () => {
    if (!moduleConfig) return;
    setExecuting(true);
    try {
      const roleContext = await fetchCurrentUserRecordAccessContext(supabase);
      const modulePerm = roleContext.permissions?.[moduleId] || {};
      if (modulePerm.view === false) {
        setCanView(false);
        setRows([]);
        setGroupedRows([]);
        return;
      }

      const optionFields = [
        ...getReportConditionFields(moduleId, config.secondary_module_ids),
        ...getReportableFields(moduleId, config.secondary_module_ids),
      ];
      const loadedOptions = await loadWorkflowConditionEditorOptions(moduleId, optionFields);
      setRelationOptions(loadedOptions.relationOptions);

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

      const neededKeys = Array.from(
        new Set([...config.columns, ...config.group_bys.map((item) => item.field), chartDimensionField, ...config.metric_fields].filter((item): item is string => !!item))
      );
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

      setCanView(true);
      setRows(nextRows);
      setChartRows(chartDimensionField ? buildFlatGroupedRows(
        nextRows,
        [{ field: chartDimensionField, direction: 'asc' }],
        fieldMap,
        loadedOptions.relationOptions,
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
            ? formatReportCellValue(field as any, row, loadedOptions.relationOptions, currencyLabel)
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
          };

          current.row_count += 1;
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
        return cleanRow as GroupedRow;
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
      setLoading(false);
      setExecuting(false);
    }
  }, [
    config.columns,
    config.conditions_all,
    config.conditions_any,
    chartDimensionField,
    config.group_bys,
    config.metric_fields,
    config.metric_type,
    config.row_limit,
    config.secondary_module_ids,
    currencyLabel,
    fieldMap,
    message,
    moduleConfig,
    moduleId,
    selectedTableBlocks,
  ]);

  useEffect(() => {
    setLoading(true);
    setRows([]);
    setGroupedRows([]);
    setRenderMode(config.default_view === 'table_and_chart' && chartDimensionField ? 'bar' : 'table');
    setActiveMetricKey('__count');
    void executeReport();
  }, [chartDimensionField, config.default_view, executeReport, report?.id]);

  useEffect(() => {
    const fallback = metricOptions[0]?.value || '__count';
    if (!metricOptions.some((item) => item.value === activeMetricKey)) {
      setActiveMetricKey(fallback);
    }
  }, [activeMetricKey, metricOptions]);

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

  const groupedColumns = useMemo<ColumnsType<GroupedRow>>(
    () => [
      {
        title: 'گروه‌بندی',
        key: '__group_label',
        render: (_value: unknown, row: GroupedRow) => row.group_label || '-',
      },
      ...metricOptions.map((metric) => ({
        title: metric.label,
        key: metric.value,
        render: (_value: unknown, row: GroupedRow) =>
          metric.value === '__count'
            ? toPersianNumber(row.row_count)
            : formatMetricValue(
                config.metric_type === 'avg'
                  ? Number(row.metrics[metric.value] || 0) / Math.max(1, Number(row.metric_counts[metric.value] || 0))
                  : row.metrics[metric.value] || 0,
                String(fieldMap[metric.value]?.type || '').toLowerCase(),
                currencyLabel
              ),
      })),
    ],
    [config.metric_type, currencyLabel, fieldMap, metricOptions]
  );

  const chartItems = useMemo(() => {
    if (!chartAvailable) return [];
    return chartRows.map((row) => {
      const label = row.group_label || (chartDimensionField ? row.group_labels[chartDimensionField] : '') || '-';
      const value = activeMetricKey === '__count'
        ? row.row_count
        : config.metric_type === 'avg'
          ? Number(row.metrics[activeMetricKey] || 0) / Math.max(1, Number(row.metric_counts[activeMetricKey] || 0))
          : Number(row.metrics[activeMetricKey] || 0);
      return { label, value, count: row.row_count };
    });
  }, [activeMetricKey, chartAvailable, chartDimensionField, chartRows, config.metric_type]);

  if (!canView) {
    return <Empty description="دسترسی به این گزارش ندارید" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button size="small" icon={<ReloadOutlined />} loading={executing} onClick={() => void executeReport()} />
          <Button size="small" icon={<TableOutlined />} type={renderMode === 'table' ? 'primary' : 'default'} onClick={() => setRenderMode('table')} />
          <Button size="small" icon={<BarChartOutlined />} type={renderMode === 'bar' ? 'primary' : 'default'} onClick={() => setRenderMode('bar')} />
          <Button size="small" icon={<PieChartOutlined />} type={renderMode === 'pie' ? 'primary' : 'default'} onClick={() => setRenderMode('pie')} />
        </div>
        {metricOptions.length > 1 && (
          <Select
            size="small"
            className="min-w-[200px]"
            value={activeMetricKey}
            options={metricOptions}
            onChange={(value) => setActiveMetricKey(String(value))}
          />
        )}
      </div>

      <div className="overflow-auto rounded-xl border border-gray-200 p-2 dark:border-gray-700" style={{ maxHeight }}>
        {loading ? (
          <div className="flex h-[180px] items-center justify-center"><Spin /></div>
        ) : rows.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center"><Empty description="برای این گزارش داده‌ای پیدا نشد" /></div>
        ) : renderMode === 'bar' && chartAvailable ? (
          <SimpleBarChart
            items={chartItems}
            valueLabel={metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار'}
            valueFormatter={(value) => activeMetricKey === '__count'
              ? toPersianNumber(value)
              : formatMetricValue(Number(value || 0), String(fieldMap[activeMetricKey]?.type || '').toLowerCase(), currencyLabel)}
          />
        ) : renderMode === 'pie' && chartAvailable ? (
          <SimplePieChart
            items={chartItems}
            valueLabel={metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار'}
            valueFormatter={(value) => activeMetricKey === '__count'
              ? toPersianNumber(value)
              : formatMetricValue(Number(value || 0), String(fieldMap[activeMetricKey]?.type || '').toLowerCase(), currencyLabel)}
          />
        ) : config.group_bys.length > 0 ? (
          <Table<GroupedRow>
            loading={executing}
            rowKey="key"
            dataSource={groupedTreeRows}
            columns={groupedColumns}
            expandable={{ defaultExpandAllRows: true }}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            scroll={{ x: true }}
            locale={{ emptyText: 'داده‌ای پیدا نشد' }}
            size="small"
          />
        ) : (
          <Table<ReportRow>
            loading={executing}
            rowKey="__report_row_key"
            dataSource={rows}
            columns={rawColumns}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            scroll={{ x: true }}
            locale={{ emptyText: 'داده‌ای پیدا نشد' }}
            size="small"
          />
        )}
      </div>
    </div>
  );
};

export default ReportCompactRenderer;
