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
  getReportConditionFields,
  getReportableFieldMap,
  getReportableFields,
  normalizeReportConfig,
  type ReportDefinitionRecord,
} from '../../utils/reporting';
import { loadWorkflowConditionEditorOptions } from '../../utils/workflowConditionOptions';
import { formatListCellValue } from '../../utils/listPrintExport';
import { formatPersianPrice, toPersianNumber } from '../../utils/persianNumberFormatter';

type RenderMode = 'table' | 'bar' | 'pie';

type ReportRow = Record<string, any> & {
  __report_row_key: string;
};

type GroupedRow = {
  key: string;
  group_values: Record<string, any>;
  group_labels: Record<string, string>;
  metrics: Record<string, number>;
  row_count: number;
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

const formatMetricValue = (value: number, fieldType?: string) => {
  if (fieldType === 'price') return formatPersianPrice(value);
  return toPersianNumber(Number(value || 0).toLocaleString('en-US'));
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
  const [groupedRows, setGroupedRows] = useState<GroupedRow[]>([]);
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
  const secondaryModuleId = config.secondary_module_id || undefined;
  const moduleConfig = MODULES[moduleId];
  const reportableFields = useMemo(() => getReportableFields(moduleId, secondaryModuleId), [moduleId, secondaryModuleId]);
  const fieldMap = useMemo(() => getReportableFieldMap(moduleId, secondaryModuleId), [moduleId, secondaryModuleId]);
  const visibleFields = useMemo(
    () => reportableFields.filter((field) => config.columns.includes(field.key)),
    [config.columns, reportableFields]
  );
  const metricFieldKeys = useMemo(
    () => (config.metric_type === 'sum' ? config.metric_fields.filter((key) => !!fieldMap[key]) : ['__count']),
    [config.metric_fields, config.metric_type, fieldMap]
  );
  const metricOptions = useMemo(
    () =>
      config.metric_type === 'sum'
        ? metricFieldKeys.map((key) => ({ value: key, label: fieldMap[key]?.labels?.fa || key }))
        : [{ value: '__count', label: 'تعداد رکوردها' }],
    [config.metric_type, fieldMap, metricFieldKeys]
  );
  const chartAvailable = config.group_bys.length > 0 && groupedRows.length > 0;

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
        ...getReportConditionFields(moduleId, config.secondary_module_id || undefined),
        ...getReportableFields(moduleId, config.secondary_module_id || undefined),
      ];
      const loadedOptions = await loadWorkflowConditionEditorOptions(moduleId, optionFields);
      setRelationOptions(loadedOptions.relationOptions);

      const { data, error } = await supabase
        .from(moduleConfig.table || moduleId)
        .select('*')
        .limit(config.row_limit);
      if (error) throw error;

      const scopedRows = (data || []).filter((row: any) =>
        canAccessAssignedRecord(row, roleContext.userId, roleContext.roleId, modulePerm.record_scope || 'all', {
          currentOrgId: roleContext.orgId,
          allowedRoleIds: roleContext.allowedRoleIds,
          allowedUserIds: roleContext.allowedUserIds,
        })
      );

      const neededKeys = Array.from(
        new Set([...config.columns, ...config.group_bys.map((item) => item.field), ...config.metric_fields].filter(Boolean))
      );

      const nextRows: ReportRow[] = [];
      for (let index = 0; index < scopedRows.length; index += 1) {
        const sourceRow = scopedRows[index];
        const passed = await evaluateWorkflowConditions({
          conditionsAll: config.conditions_all,
          conditionsAny: config.conditions_any,
          currentRecord: sourceRow,
          moduleId,
        });
        if (!passed) continue;

        const context = createWorkflowEvaluationContext(moduleId);
        const resolvedRow: ReportRow = {
          ...sourceRow,
          __report_row_key: String(sourceRow?.id || index),
        };

        for (const fieldKey of neededKeys) {
          resolvedRow[fieldKey] = await resolveWorkflowFieldValue({
            fieldKey,
            currentRecord: sourceRow,
            moduleId,
            context,
          });
        }
        nextRows.push(resolvedRow);
      }

      setCanView(true);
      setRows(nextRows);

      if (config.group_bys.length === 0) {
        setGroupedRows([]);
        return;
      }

      const buckets = new Map<string, GroupedRow>();
      nextRows.forEach((row, index) => {
        const groupLabels: Record<string, string> = {};
        const groupValues: Record<string, any> = {};

        config.group_bys.forEach((grouping) => {
          const field = fieldMap[grouping.field];
          groupValues[grouping.field] = row[grouping.field];
          groupLabels[grouping.field] = field
            ? formatListCellValue(field as any, row, loadedOptions.relationOptions)
            : String(row[grouping.field] ?? '-');
        });

        const bucketKey = config.group_bys
          .map((grouping) => String(groupValues[grouping.field] ?? groupLabels[grouping.field] ?? '-'))
          .join('||');
        const current = buckets.get(bucketKey) || {
          key: `${bucketKey}-${index}`,
          group_values: groupValues,
          group_labels: groupLabels,
          metrics: {},
          row_count: 0,
        };

        current.row_count += 1;
        current.metrics.__count = Number(current.metrics.__count || 0) + 1;

        if (config.metric_type === 'sum') {
          config.metric_fields.forEach((fieldKey) => {
            const numericValue = Number(row[fieldKey] || 0);
            current.metrics[fieldKey] = Number(current.metrics[fieldKey] || 0) + (Number.isFinite(numericValue) ? numericValue : 0);
          });
        }

        buckets.set(bucketKey, current);
      });

      const nextGroupedRows = Array.from(buckets.values()).sort((left, right) => {
        for (const grouping of config.group_bys) {
          const base = compareValues(left.group_values[grouping.field], right.group_values[grouping.field]);
          if (base !== 0) return grouping.direction === 'desc' ? -base : base;
        }
        return 0;
      });

      setGroupedRows(nextGroupedRows);
    } catch {
      message.error('اجرای گزارش ناموفق بود.');
      setRows([]);
      setGroupedRows([]);
    } finally {
      setLoading(false);
      setExecuting(false);
    }
  }, [
    config.columns,
    config.conditions_all,
    config.conditions_any,
    config.group_bys,
    config.metric_fields,
    config.metric_type,
    config.row_limit,
    config.secondary_module_id,
    fieldMap,
    message,
    moduleConfig,
    moduleId,
  ]);

  useEffect(() => {
    setLoading(true);
    setRows([]);
    setGroupedRows([]);
    setRenderMode(config.default_view === 'table_and_chart' && config.group_bys.length > 0 ? 'bar' : 'table');
    setActiveMetricKey('__count');
    void executeReport();
  }, [config.default_view, config.group_bys.length, executeReport, report?.id]);

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
        render: (_value, row) => formatListCellValue(field as any, row, relationOptions),
      })),
    [relationOptions, visibleFields]
  );

  const groupedColumns = useMemo<ColumnsType<GroupedRow>>(
    () => [
      ...config.group_bys.map((grouping) => ({
        title: fieldMap[grouping.field]?.labels?.fa || grouping.field,
        key: grouping.field,
        render: (_value: unknown, row: GroupedRow) => row.group_labels[grouping.field] || '-',
      })),
      ...metricOptions.map((metric) => ({
        title: metric.label,
        key: metric.value,
        render: (_value: unknown, row: GroupedRow) =>
          metric.value === '__count'
            ? toPersianNumber(row.row_count)
            : formatMetricValue(row.metrics[metric.value] || 0, String(fieldMap[metric.value]?.type || '').toLowerCase()),
      })),
    ],
    [config.group_bys, fieldMap, metricOptions]
  );

  const chartItems = useMemo(() => {
    if (!chartAvailable) return [];
    return groupedRows.map((row) => {
      const label = config.group_bys.map((grouping) => row.group_labels[grouping.field] || '-').join(' / ');
      const value = activeMetricKey === '__count' ? row.row_count : Number(row.metrics[activeMetricKey] || 0);
      return { label, value, count: row.row_count };
    });
  }, [activeMetricKey, chartAvailable, config.group_bys, groupedRows]);

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
          <SimpleBarChart items={chartItems} valueLabel={metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار'} />
        ) : renderMode === 'pie' && chartAvailable ? (
          <SimplePieChart items={chartItems} valueLabel={metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار'} />
        ) : config.group_bys.length > 0 ? (
          <Table<GroupedRow>
            loading={executing}
            rowKey="key"
            dataSource={groupedRows}
            columns={groupedColumns}
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
