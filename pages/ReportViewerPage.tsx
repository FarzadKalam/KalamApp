import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Select, Spin, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BarChartOutlined, EditOutlined, FileExcelOutlined, PieChartOutlined, PrinterOutlined, ReloadOutlined, TableOutlined } from '@ant-design/icons';
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
  getReportableFieldMap,
  getReportableFields,
  normalizeReportConfig,
  type ReportDefinitionRecord,
} from '../utils/reporting';
import { loadWorkflowConditionEditorOptions } from '../utils/workflowConditionOptions';
import { escapeCsvCell, formatListCellValue } from '../utils/listPrintExport';
import { formatPersianPrice, toPersianNumber } from '../utils/persianNumberFormatter';

const { Title, Text } = Typography;

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

const escapePrintHtml = (value: any) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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
  const [renderMode, setRenderMode] = useState<RenderMode>('table');
  const [activeMetricKey, setActiveMetricKey] = useState<string>('__count');
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});

  const config = useMemo(() => normalizeReportConfig(report?.config), [report?.config]);
  const moduleId = String(report?.module_id || '').trim();
  const secondaryModuleId = config.secondary_module_id || undefined;
  const moduleConfig = MODULES[moduleId];
  const reportableFields = useMemo(() => getReportableFields(moduleId, secondaryModuleId), [moduleId, secondaryModuleId]);
  const fieldMap = useMemo(() => getReportableFieldMap(moduleId, secondaryModuleId), [moduleId, secondaryModuleId]);
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
  const includeRowCountColumn = useMemo(
    () => !metricOptions.some((item) => item.value === '__count'),
    [metricOptions]
  );

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
        ...getReportConditionFields(String(nextReport.module_id || '').trim(), normalizedConfig.secondary_module_id || undefined),
        ...getReportableFields(String(nextReport.module_id || '').trim(), normalizedConfig.secondary_module_id || undefined),
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
        canAccessAssignedRecord(row, roleContext.userId, roleContext.roleId, modulePerm.record_scope || 'all', {
          currentOrgId: roleContext.orgId,
          allowedRoleIds: roleContext.allowedRoleIds,
          allowedUserIds: roleContext.allowedUserIds,
        })
      );

      const neededKeys = Array.from(new Set([
        ...config.columns,
        ...config.group_bys.map((item) => item.field),
        ...config.metric_fields,
      ].filter(Boolean)));

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
            ? formatListCellValue(field as any, row, relationOptions)
            : String(row[grouping.field] ?? '-');
        });

        const bucketKey = config.group_bys.map((grouping) => String(groupValues[grouping.field] ?? groupLabels[grouping.field] ?? '-')).join('||');
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
      setExecuting(false);
    }
  }, [config.conditions_all, config.conditions_any, config.columns, config.group_bys, config.metric_fields, config.metric_type, config.row_limit, fieldMap, message, moduleConfig, moduleId, relationOptions, report]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (!report) return;
    setRenderMode(config.default_view === 'table_and_chart' && config.group_bys.length > 0 ? 'bar' : 'table');
    void executeReport();
  }, [config.default_view, config.group_bys.length, executeReport, report]);

  useEffect(() => {
    const fallback = metricOptions[0]?.value || '__count';
    if (!metricOptions.some((item) => item.value === activeMetricKey)) {
      setActiveMetricKey(fallback);
    }
  }, [activeMetricKey, metricOptions]);

  const totalMetricValue = useMemo(() => {
    if (activeMetricKey === '__count') return rows.length;
    return rows.reduce((sum, row) => sum + Number(row[activeMetricKey] || 0), 0);
  }, [activeMetricKey, rows]);

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

  const chartItems = useMemo(() => {
    if (!chartAvailable) return [];
    return groupedRows.map((row) => {
      const label = config.group_bys.map((grouping) => row.group_labels[grouping.field] || '-').join(' / ');
      const value = activeMetricKey === '__count' ? row.row_count : Number(row.metrics[activeMetricKey] || 0);
      return { label, value, count: row.row_count };
    });
  }, [activeMetricKey, chartAvailable, config.group_bys, groupedRows]);

  const exportHeaders = useMemo(() => {
    if (config.group_bys.length > 0) {
      return [
        ...config.group_bys.map((grouping) => fieldMap[grouping.field]?.labels?.fa || grouping.field),
        ...metricOptions.map((metric) => metric.label),
        ...(includeRowCountColumn ? ['تعداد رکورد'] : []),
      ];
    }
    return visibleFields.map((field) => field.labels?.fa || field.key);
  }, [config.group_bys, fieldMap, includeRowCountColumn, metricOptions, visibleFields]);

  const exportRows = useMemo(() => {
    if (config.group_bys.length > 0) {
      return groupedRows.map((row) => ([
        ...config.group_bys.map((grouping) => row.group_labels[grouping.field] || '-'),
        ...metricOptions.map((metric) => metric.value === '__count' ? row.row_count : row.metrics[metric.value] || 0),
        ...(includeRowCountColumn ? [row.row_count] : []),
      ]));
    }
    return rows.map((row) => visibleFields.map((field) => formatListCellValue(field as any, row, relationOptions)));
  }, [config.group_bys, groupedRows, includeRowCountColumn, metricOptions, relationOptions, rows, visibleFields]);

  const handleExportCsv = () => {
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
  };

  const handlePrint = () => {
    const html = `
      <html dir="rtl" lang="fa">
        <head>
          <meta charset="utf-8" />
          <title>${escapePrintHtml(report?.name || 'گزارش')}</title>
          <style>
            body { font-family: Tahoma, sans-serif; padding: 24px; direction: rtl; color: #111827; }
            h2 { margin: 0 0 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: right; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h2>${escapePrintHtml(report?.name || 'گزارش')}</h2>
          <table>
            <thead><tr>${exportHeaders.map((header) => `<th>${escapePrintHtml(header)}</th>`).join('')}</tr></thead>
            <tbody>${exportRows.map((line) => `<tr>${line.map((cell) => `<td>${escapePrintHtml(cell ?? '-')}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </body>
      </html>
    `;
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);

    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument || frameWindow?.document;
    if (!frameWindow || !frameDocument) {
      document.body.removeChild(frame);
      message.error('آماده‌سازی چاپ ناموفق بود.');
      return;
    }

    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();

    window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      window.setTimeout(() => {
        if (document.body.contains(frame)) {
          document.body.removeChild(frame);
        }
      }, 1000);
    }, 250);
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
            <Button icon={<FileExcelOutlined />} onClick={handleExportCsv}>خروجی CSV</Button>
            <Button icon={<PrinterOutlined />} onClick={handlePrint}>چاپ</Button>
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
              formatter={(value) => activeMetricKey === '__count' ? toPersianNumber(value) : formatMetricValue(Number(value || 0), String(fieldMap[activeMetricKey]?.type || '').toLowerCase())}
            />
          </div>
        </div>

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
          <SimpleBarChart items={chartItems} valueLabel={metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار'} />
        )}

        {renderMode === 'pie' && chartAvailable && (
          <SimplePieChart items={chartItems} valueLabel={metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار'} />
        )}

        {(renderMode === 'table' || !chartAvailable) && (
          <Table<ReportRow>
            loading={executing}
            rowKey="__report_row_key"
            dataSource={rows}
            columns={rawColumns}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: true }}
            locale={{ emptyText: 'برای این گزارش داده‌ای پیدا نشد' }}
          />
        )}
      </div>
    </div>
  );
};

export default ReportViewerPage;
