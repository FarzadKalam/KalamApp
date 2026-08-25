import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Collapse, Empty, Progress, Select, Spin, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BarChartOutlined, CopyOutlined, EditOutlined, EyeOutlined, FileExcelOutlined, PieChartOutlined, PrinterOutlined, ReloadOutlined, TableOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import PrintSection from '../components/moduleShow/PrintSection';
import SimpleBarChart from '../components/reports/SimpleBarChart';
import SimplePieChart from '../components/reports/SimplePieChart';
import SimpleLineChart from '../components/reports/SimpleLineChart';
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
  prefetchWorkflowRecordTags,
  resolveWorkflowFieldValue,
} from '../utils/workflowRuntime';
import {
  buildReportBaseSelectColumns,
  getReportConditionFields,
  getReportTableBlock,
  getReportableFields,
  isDeletedReportRecord,
  buildReportTableFieldKey,
  parseReportTableFieldKey,
  parseReportTableRelationFieldKey,
  normalizeReportConfig,
  type ReportDefinitionRecord,
} from '../utils/reporting';
import { runSelectWithCompatibleColumns } from '../utils/selectCompat';
import { getSurveyTemplateScopedIdFromConditions, loadSurveyTemplateDefinition, normalizeSurveyTemplateSnapshot } from '../utils/surveyTemplates';
import { loadWorkflowConditionEditorOptions } from '../utils/workflowConditionOptions';
import { escapeCsvCell, formatListCellValue } from '../utils/listPrintExport';
import { formatPersianPrice, toPersianNumber } from '../utils/persianNumberFormatter';
import { getSafeOptionFallback } from '../utils/optionHelpers';
import { generatePdfBlob, prepareGeneratedPdfWindow, printAsPdf } from '../utils/printTemplates/printAsPdf';
import { createPrintPreviewFingerprint } from '../utils/printTemplates/previewFingerprint';
import { readCurrencyConfig } from '../utils/currency';
import {
  isReportTaskProcessFieldKey,
  loadTaskReportProcessRuntimeCatalog,
  resolveTaskReportProcessFieldValue,
} from '../utils/reportTaskProcessFields';
import { getTaskStatusLabel, getTaskStatusOptions } from '../utils/processTaskStatusOptions';
import { parseProcessLinkedFieldKey } from '../utils/processTargets';
import WorkflowConditionsGroup from '../components/workflows/WorkflowConditionsGroup';

const { Title, Text } = Typography;

type RenderMode = 'table' | 'bar' | 'pie' | 'line';

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
  __is_group_summary?: boolean;
  __group_summary?: GroupedRow | null;
};

type ExportCell = {
  value: any;
  rowSpan?: number;
};

type ReportPrintFieldDefinition = {
  key: string;
  label: string;
  type: 'column' | 'metric_card';
};

type ServerReportRuntime = {
  mode: 'normal' | 'difference' | 'percentage';
  groups: Array<{ key: string; label: string; row_count: number; increase: number; decrease: number; target: number; total: number; metrics: Record<string, number> }>;
  group_tree?: Array<{ key: string; label: string; row_count: number; increase: number; decrease: number; target: number; total: number; metrics: Record<string, number>; children?: any[] }>;
  metric_sources?: Record<string, { module_id: string; metric_key: string }>;
  generated_at?: string;
};

const getCompositeMetricFieldType = (runtime: ServerReportRuntime, metrics: Array<{ report_id: string; metric_key: string }>) => {
  const sources = runtime.metric_sources || {};
  const selected = metrics
    .map((metric) => sources[`${metric.report_id}::${metric.metric_key}`])
    .filter((source): source is { module_id: string; metric_key: string } => !!source);
  if (selected.length === 0 || selected.length !== metrics.length) return 'number';
  return selected.every((source) => {
    const tableField = parseReportTableFieldKey(source.metric_key);
    const field = tableField
      ? getReportTableBlock(source.module_id, `__report_table__${tableField.blockId}`)?.tableColumns?.find((column: any) => column.key === tableField.columnKey)
      : MODULES[source.module_id]?.fields?.find((candidate: any) => candidate.key === source.metric_key);
    return String(field?.type || '').toLowerCase() === 'price';
  }) ? 'price' : 'number';
};

const DifferenceBarChart: React.FC<{ groups: ServerReportRuntime['groups']; currencyLabel: string; fieldType: string }> = ({ groups, currencyLabel, fieldType }) => {
  const maxValue = Math.max(1, ...groups.flatMap((row) => [Number(row.increase || 0), Number(row.decrease || 0)]));
  return <div className="space-y-3">{groups.map((row) => {
    const increase = Number(row.increase || 0); const decrease = Number(row.decrease || 0); const net = increase - decrease;
    const percent = increase > 0 ? (net / increase) * 100 : null;
    return <div key={row.key} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Text strong>{row.label || '-'}</Text><Text type={net < 0 ? 'danger' : 'success'}>خالص: {formatMetricValue(net, fieldType, currencyLabel)}{percent === null ? '' : ` (${toPersianNumber(percent.toFixed(1))}٪)`}</Text></div><div className="space-y-2 text-xs"><div className="flex items-center gap-2"><span className="w-16 text-green-700">افزاینده</span><div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-full rounded-full bg-green-500" style={{ width: `${Math.max(2, increase / maxValue * 100)}%` }} /></div><span className="persian-number w-28 text-left">{formatMetricValue(increase, fieldType, currencyLabel)}</span></div><div className="flex items-center gap-2"><span className="w-16 text-red-700">کاهنده</span><div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(2, decrease / maxValue * 100)}%` }} /></div><span className="persian-number w-28 text-left">{formatMetricValue(decrease, fieldType, currencyLabel)}</span></div></div></div>;
  })}</div>;
};

const ServerReportResultView: React.FC<{ report: ReportDefinitionRecord; runtime: ServerReportRuntime; currencyLabel: string; onRefresh: () => void; refreshing: boolean; canEdit: boolean; onEdit: () => void; onCopy: () => void; onExport: () => void; onConfigurePrint: () => void; onPrint: () => void }> = ({ report, runtime, currencyLabel, onRefresh, refreshing, canEdit, onEdit, onCopy, onExport, onConfigurePrint, onPrint }) => {
  const config = normalizeReportConfig(report.config);
  const [view, setView] = useState<'table' | 'bar' | 'pie' | 'line'>(config.output_modes[0] || 'table');
  const groups = runtime.groups || [];
  const totals = groups.reduce((acc, row) => ({ increase: acc.increase + Number(row.increase || 0), decrease: acc.decrease + Number(row.decrease || 0), target: acc.target + Number(row.target || 0), total: acc.total + Number(row.total || 0), count: acc.count + Number(row.row_count || 0) }), { increase: 0, decrease: 0, target: 0, total: 0, count: 0 });
  const isDifference = runtime.mode === 'difference';
  const differenceFieldType = getCompositeMetricFieldType(runtime, [...config.increase_metrics, ...config.decrease_metrics]);
  const isPercentage = runtime.mode === 'percentage';
  const value = (row: ServerReportRuntime['groups'][number]) => isDifference ? Number(row.increase || 0) - Number(row.decrease || 0) : isPercentage ? (Number(row.total || 0) > 0 ? Number(row.target || 0) / Number(row.total || 0) * 100 : 0) : Number(Object.values(row.metrics || {})[0] || row.row_count || 0);
  const items = groups.map((row) => ({ label: row.label || '-', value: value(row), tone: value(row) < 0 ? 'decrease' as const : 'increase' as const }));
  const increaseItems = groups.map((row) => ({ label: row.label || '-', value: Number(row.increase || 0), tone: 'increase' as const }));
  const decreaseItems = groups.map((row) => ({ label: row.label || '-', value: Number(row.decrease || 0), tone: 'decrease' as const }));
  const columns: ColumnsType<ServerReportRuntime['groups'][number]> = isDifference ? [{ title: 'گروه', dataIndex: 'label', key: 'label' }, { title: 'افزاینده', key: 'increase', render: (_, row) => formatMetricValue(row.increase, differenceFieldType, currencyLabel) }, { title: 'کاهنده', key: 'decrease', render: (_, row) => formatMetricValue(row.decrease, differenceFieldType, currencyLabel) }, { title: 'خالص', key: 'net', render: (_, row) => formatMetricValue(Number(row.increase || 0) - Number(row.decrease || 0), differenceFieldType, currencyLabel) }, { title: 'درصد تغییر', key: 'change', render: (_, row) => Number(row.increase || 0) > 0 ? `${toPersianNumber(((Number(row.increase || 0) - Number(row.decrease || 0)) / Number(row.increase || 0) * 100).toFixed(1))}٪` : '—' }] : isPercentage ? [{ title: 'گروه', dataIndex: 'label', key: 'label' }, { title: 'مقدار هدف', dataIndex: 'target', key: 'target', render: (amount) => formatMetricValue(amount, 'number') }, { title: 'مقدار کل', dataIndex: 'total', key: 'total', render: (amount) => formatMetricValue(amount, 'number') }, { title: 'نرخ', key: 'rate', render: (_, row) => Number(row.total || 0) > 0 ? `${toPersianNumber((Number(row.target || 0) / Number(row.total || 0) * 100).toFixed(1))}٪` : '—' }] : [{ title: 'گروه', dataIndex: 'label', key: 'label' }, { title: 'تعداد', dataIndex: 'row_count', key: 'row_count', render: (amount) => toPersianNumber(amount) }, { title: 'نتیجه', key: 'metric', render: (_, row) => formatMetricValue(value(row), 'number', currencyLabel) }];
  const pie = isDifference ? <div className="grid grid-cols-1 gap-5 xl:grid-cols-2"><div><Text strong>ترکیب افزاینده‌ها</Text><SimplePieChart items={increaseItems} valueLabel="افزاینده" valueFormatter={(amount) => formatMetricValue(amount, differenceFieldType, currencyLabel)} /></div><div><Text strong>ترکیب کاهنده‌ها</Text><SimplePieChart items={decreaseItems} valueLabel="کاهنده" valueFormatter={(amount) => formatMetricValue(amount, differenceFieldType, currencyLabel)} /></div></div> : isPercentage ? <SimplePieChart items={[{ label: 'هدف تحقق‌یافته', value: totals.target, tone: 'increase' }, { label: 'باقی‌مانده تا کل', value: Math.max(0, totals.total - totals.target), tone: 'decrease' }]} valueLabel="تقسیم هدف و کل" valueFormatter={(amount) => formatMetricValue(amount, 'number')} /> : <SimplePieChart items={items} valueLabel="مقدار" valueFormatter={(amount) => formatMetricValue(amount, 'number', currencyLabel)} />;
  const availableViews = config.output_modes;
  const visibleView = availableViews.includes(view) ? view : availableViews[0] || 'table';
  return <div className="mx-auto max-w-[1680px] animate-fadeIn p-4 md:p-8"><div className="rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1a1a1a]">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><Title level={3} className="!mb-1">{report.name}</Title><Text className="text-gray-500">{report.description || 'بدون توضیح'}</Text></div><div className="flex flex-wrap gap-2"><Button icon={<ReloadOutlined />} loading={refreshing} onClick={onRefresh}>به‌روزرسانی</Button><Button icon={<FileExcelOutlined />} onClick={onExport}>خروجی Excel</Button><Button icon={<EyeOutlined />} onClick={onConfigurePrint}>تنظیم چاپ</Button><Button icon={<PrinterOutlined />} onClick={onPrint}>چاپ</Button><Button icon={<CopyOutlined />} onClick={onCopy}>کپی</Button>{canEdit && <Button icon={<EditOutlined />} onClick={onEdit}>ویرایش</Button>}</div></div>
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">{isDifference ? <><div className="rounded-[1.5rem] border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-white/5"><Statistic title="جمع افزاینده‌ها" value={totals.increase} formatter={() => formatMetricValue(totals.increase, differenceFieldType, currencyLabel)} /></div><div className="rounded-[1.5rem] border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-white/5"><Statistic title="جمع کاهنده‌ها" value={totals.decrease} formatter={() => formatMetricValue(totals.decrease, differenceFieldType, currencyLabel)} /></div><div className="rounded-[1.5rem] border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-white/5"><Statistic title="تفاضل نهایی" value={totals.increase - totals.decrease} formatter={() => formatMetricValue(totals.increase - totals.decrease, differenceFieldType, currencyLabel)} /></div></> : <><div className="rounded-[1.5rem] border border-gray-200 bg-gray-50/70 p-4"><Statistic title={isPercentage ? 'مقدار هدف' : 'تعداد نتیجه'} value={isPercentage ? totals.target : totals.count} formatter={() => isPercentage ? formatMetricValue(totals.target, 'number') : toPersianNumber(totals.count)} /></div><div className="rounded-[1.5rem] border border-gray-200 bg-gray-50/70 p-4"><Statistic title={isPercentage ? 'مقدار کل' : 'تعداد گروه‌ها'} value={isPercentage ? totals.total : groups.length} formatter={() => isPercentage ? formatMetricValue(totals.total, 'number') : toPersianNumber(groups.length)} /></div><div className="rounded-[1.5rem] border border-gray-200 bg-gray-50/70 p-4"><Statistic title={isPercentage ? 'نرخ' : 'آخرین محاسبه'} value={isPercentage ? (totals.total > 0 ? totals.target / totals.total * 100 : 0) : (runtime.generated_at ? formatLastUpdatedAt(runtime.generated_at) : '—')} suffix={isPercentage ? '٪' : undefined} /></div></>}</div>
    {groups.length > 0 && <div className="mb-5 flex flex-wrap gap-2">{availableViews.includes('table') && <Button icon={<TableOutlined />} type={visibleView === 'table' ? 'primary' : 'default'} onClick={() => setView('table')}>جدول</Button>}{availableViews.includes('bar') && <Button icon={<BarChartOutlined />} type={visibleView === 'bar' ? 'primary' : 'default'} onClick={() => setView('bar')}>ستونی</Button>}{availableViews.includes('pie') && <Button icon={<PieChartOutlined />} type={visibleView === 'pie' ? 'primary' : 'default'} onClick={() => setView('pie')}>دایره‌ای</Button>}{availableViews.includes('line') && <Button icon={<BarChartOutlined />} type={visibleView === 'line' ? 'primary' : 'default'} onClick={() => setView('line')}>خطی</Button>}</div>}
    {visibleView === 'table' ? <Table rowKey="key" columns={columns} dataSource={runtime.group_tree || groups} pagination={{ pageSize: 20 }} scroll={{ x: true }} locale={{ emptyText: 'داده‌ای یافت نشد' }} /> : visibleView === 'bar' ? isDifference ? <DifferenceBarChart groups={groups} currencyLabel={currencyLabel} fieldType={differenceFieldType} /> : <SimpleBarChart items={items} valueLabel={isPercentage ? 'نرخ' : 'مقدار'} valueFormatter={(amount) => isPercentage ? `${toPersianNumber(amount.toFixed(1))}٪` : formatMetricValue(amount, 'number', currencyLabel)} /> : visibleView === 'pie' ? pie : <SimpleLineChart items={items} valueFormatter={(amount) => isPercentage ? `${toPersianNumber(amount.toFixed(1))}٪` : formatMetricValue(amount, isDifference ? differenceFieldType : 'number', currencyLabel)} />}
  </div></div>;
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

/**
 * گزارش‌های قدیمیِ فعالیت ممکن است مقدار شرط وضعیت را با عنوان فارسی ذخیره
 * کرده باشند، در حالی که مقدار واقعی وضعیت (به‌خصوص در فرآیندها) یک کلید
 * اختصاصی است. این تبدیل فقط در زمان اجرای گزارش انجام می‌شود تا هم گزارش
 * قدیمی و هم وضعیت‌های اختصاصی هر فعالیت، با یک منطق واحد ارزیابی شوند.
 */
const normalizeTaskStatusConditionForRow = (condition: any, row: Record<string, any>) => {
  if (String(condition?.field || '').trim() !== 'status') return condition;

  const options = getTaskStatusOptions(row);
  const resolveValue = (value: any) => {
    const normalized = String(value ?? '').trim();
    if (!normalized) return value;
    const option = options.find((item) => (
      String(item?.value || '').trim() === normalized
      || String(item?.label || '').trim() === normalized
    ));
    return option?.value ?? value;
  };
  const rawValue = condition?.value;
  const value = Array.isArray(rawValue)
    ? rawValue.map(resolveValue)
    : resolveValue(rawValue);
  return { ...condition, value };
};

const normalizeTaskStatusConditionsForRow = (conditions: any[], row: Record<string, any>) =>
  (Array.isArray(conditions) ? conditions : []).map((condition) => normalizeTaskStatusConditionForRow(condition, row));

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
  if ((field as any)?.__reportTaskRuntimeStatus === true) {
    return getTaskStatusLabel(row?.[field.key], row) || '-';
  }
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

const isDeletedReportTableRow = (row: Record<string, any> | null | undefined) =>
  isDeletedReportRecord(row) || row?.__deleted === true || row?._destroy === true;

const isGroupingFieldAvailableForRow = (fieldKey: string, row: Record<string, any>) => {
  const tableFieldMeta = parseReportTableFieldKey(fieldKey);
  const tableRelationMeta = parseReportTableRelationFieldKey(fieldKey);
  const blockId = tableFieldMeta?.blockId || tableRelationMeta?.blockId || '';
  if (!blockId) return true;
  return !!row?.__report_table_rows?.[blockId];
};

const getDateGroupingValue = (value: any, granularity?: string) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime()) || !granularity) return null;
  const parts = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const year = Number(parts.year || 0); const month = Number(parts.month || 0); const day = Number(parts.day || 0);
  const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const quarters = ['بهار', 'تابستان', 'پاییز', 'زمستان'];
  if (!year || !month || !day) return null;
  if (granularity === 'yearly') return { value: `${year}`, label: `سال ${toPersianNumber(year)}` };
  if (granularity === 'quarterly') {
    const quarter = Math.floor((month - 1) / 3);
    return { value: `${year}-q${quarter + 1}`, label: `${quarters[quarter]} ${toPersianNumber(year)}` };
  }
  if (granularity === 'monthly') return { value: `${year}-${String(month).padStart(2, '0')}`, label: `${months[month - 1]} ${toPersianNumber(year)}` };
  if (granularity === 'weekly') {
    const week = Math.ceil(day / 7);
    return { value: `${year}-${String(month).padStart(2, '0')}-w${week}`, label: `هفته ${toPersianNumber(week)} ${months[month - 1]} ${toPersianNumber(year)}` };
  }
  return { value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, label: `${toPersianNumber(day)} ${months[month - 1]} ${toPersianNumber(year)}` };
};

const getReportGroupingValue = (grouping: any, field: any, row: Record<string, any>, relationOptions: Record<string, Array<{ label: string; value: string }>>, currencyLabel: string) => {
  const isDate = String(field?.type || '').toLowerCase() === 'date' || String(field?.type || '').toLowerCase() === 'datetime';
  const temporal = isDate ? getDateGroupingValue(row[grouping.field], grouping.date_granularity) : null;
  return temporal || {
    value: row[grouping.field],
    label: field ? formatReportCellValue(field, row, relationOptions, currencyLabel) : String(row[grouping.field] ?? '-'),
  };
};

const buildFlatGroupedRows = (
  sourceRows: ReportRow[],
  groupBys: Array<{ field: string; direction: 'asc' | 'desc'; date_granularity?: string }>,
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
      const groupValue = getReportGroupingValue(grouping, field, row, relationOptions, currencyLabel);
      groupValues[grouping.field] = groupValue.value;
      groupLabels[grouping.field] = groupValue.label;
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

const REPORT_RESULT_CACHE_PREFIX = 'kalamapp:report-result:v1:';

const buildReportResultCacheKey = (report: ReportDefinitionRecord, normalizedConfig: ReturnType<typeof normalizeReportConfig>) =>
  `${REPORT_RESULT_CACHE_PREFIX}${report.id}:${report.updated_at || ''}:${JSON.stringify({
    module_id: report.module_id,
    config: normalizedConfig,
  })}`;

const removeCachedReportResult = (cacheKey: string) => {
  try {
    sessionStorage.removeItem(cacheKey);
  } catch {
    // ignore cache cleanup failures
  }
};

const writeCachedReportResult = (cacheKey: string, value: unknown) => {
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(value));
  } catch (error) {
    console.warn('Could not cache report result', error);
  }
};

const formatLastUpdatedAt = (value?: string | null) =>
  value ? new Date(value).toLocaleString('fa-IR') : '-';

const getGroupSummaryMetricText = (
  summary: GroupedRow,
  config: ReturnType<typeof normalizeReportConfig>,
  metricFieldKeys: string[],
  fieldMap: Record<string, any>,
  currencyLabel = ''
) => {
  const parts = [`تعداد: ${toPersianNumber(summary.row_count)}`];
  if (config.metric_type === 'difference') {
    parts.push(`جمع و تفریق: ${formatMetricValue(Number(summary.metrics.__difference || 0), 'number', currencyLabel)}`);
  } else if (config.metric_type === 'sum' || config.metric_type === 'avg') {
    metricFieldKeys.forEach((fieldKey) => {
      const value = config.metric_type === 'avg'
        ? Number(summary.metrics[fieldKey] || 0) / Math.max(1, Number(summary.metric_counts[fieldKey] || 0))
        : Number(summary.metrics[fieldKey] || 0);
      parts.push(`${config.metric_type === 'avg' ? 'میانگین' : 'جمع'} ${fieldMap[fieldKey]?.labels?.fa || fieldKey}: ${formatMetricValue(value, String(fieldMap[fieldKey]?.type || '').toLowerCase(), currencyLabel)}`);
    });
  }
  return parts.join(' | ');
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
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const reportPrintTargetWindowRef = useRef<Window | null>(null);
  const [selectedPrintFields, setSelectedPrintFields] = useState<Record<string, string[]>>({});
  const [savingPrintFields, setSavingPrintFields] = useState(false);
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [taskProcessFields, setTaskProcessFields] = useState<any[]>([]);
  const [taskProcessStatusOptions, setTaskProcessStatusOptions] = useState<any[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [surveyTemplateSnapshot, setSurveyTemplateSnapshot] = useState(() => normalizeSurveyTemplateSnapshot({}));
  const [serverRuntime, setServerRuntime] = useState<ServerReportRuntime | null>(null);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [draftConditionsAll, setDraftConditionsAll] = useState<any[]>([]);
  const [draftConditionsAny, setDraftConditionsAny] = useState<any[]>([]);

  const config = useMemo(() => normalizeReportConfig(report?.config), [report?.config]);
  const moduleId = String(report?.module_id || '').trim();
  const secondaryModuleIds = config.secondary_module_ids;
  const scopedSurveyTemplateId = useMemo(
    () => (
      moduleId === 'surveys'
        ? getSurveyTemplateScopedIdFromConditions(config.conditions_all, config.conditions_any)
        : null
    ),
    [config.conditions_all, config.conditions_any, moduleId]
  );
  const moduleConfig = MODULES[moduleId];
  const currencyLabel = readCurrencyConfig().label || '';
  const selectedTableBlocks = useMemo(
    () => secondaryModuleIds
      .map((sourceId) => getReportTableBlock(moduleId, sourceId))
      .filter((block): block is NonNullable<typeof block> => !!block),
    [moduleId, secondaryModuleIds]
  );
  const reportableFields = useMemo(() => (
    getReportableFields(moduleId, secondaryModuleIds, surveyTemplateSnapshot, taskProcessFields).map((field) => (
      field.dynamicOptionsCategory
        ? {
            ...field,
            options: [
              ...(Array.isArray(field.options) ? field.options : []),
              ...(dynamicOptions[field.dynamicOptionsCategory] || []),
            ],
          }
        : (field as any).__reportTaskRuntimeStatus === true
          ? { ...field, options: [...(field.options || []), ...taskProcessStatusOptions] }
          : field
    ))
  ), [dynamicOptions, moduleId, secondaryModuleIds, surveyTemplateSnapshot, taskProcessFields, taskProcessStatusOptions]);
  const fieldMap = useMemo(
    () => reportableFields.reduce<Record<string, any>>((acc, field) => {
      acc[field.key] = field;
      return acc;
    }, {}),
    [reportableFields]
  );
  const visibleFields = useMemo(
    () => reportableFields.filter((field) => config.columns.includes(field.key)),
    [config.columns, reportableFields]
  );
  useEffect(() => {
    setDraftConditionsAll(config.conditions_all);
    setDraftConditionsAny(config.conditions_any);
  }, [config.conditions_all, config.conditions_any, reportId]);

  const applyTemporaryConditions = useCallback(() => {
    setReport((current) => current ? {
      ...current,
      config: { ...config, conditions_all: draftConditionsAll, conditions_any: draftConditionsAny },
    } : current);
    message.success('شرایط برای همین مشاهده اعمال شد.');
  }, [config, draftConditionsAll, draftConditionsAny, message]);

  const saveReportConditions = useCallback(async () => {
    if (!report || !reportId || !canEditReport) return;
    const nextConfig = { ...config, conditions_all: draftConditionsAll, conditions_any: draftConditionsAny };
    const { error } = await supabase.from('report_definitions').update({ config: nextConfig }).eq('id', reportId);
    if (error) throw error;
    setReport((current) => current ? { ...current, config: nextConfig } : current);
    message.success('شرایط گزارش ذخیره شد.');
  }, [canEditReport, config, draftConditionsAll, draftConditionsAny, message, report, reportId]);
  const groupingFields = useMemo(
    () => config.group_bys.map((item) => fieldMap[item.field]).filter(Boolean),
    [config.group_bys, fieldMap]
  );
  const groupingSummaryLabel = useMemo(
    () => groupingFields.map((field) => field.labels?.fa || field.key).join(' / '),
    [groupingFields]
  );
  const metricFieldKeys = useMemo(
    () => (config.metric_type === 'sum' || config.metric_type === 'avg'
      ? config.metric_fields.filter((key) => !!fieldMap[key])
      : config.metric_type === 'difference' ? ['__difference'] : ['__count']),
    [config.metric_fields, config.metric_type, fieldMap]
  );
  const metricOptions = useMemo(
    () =>
      config.metric_type === 'sum' || config.metric_type === 'avg'
        ? metricFieldKeys.map((key) => ({
            value: key,
            label: `${config.metric_type === 'avg' ? 'میانگین' : 'جمع'} ${fieldMap[key]?.labels?.fa || key}`,
          }))
        : config.metric_type === 'difference'
          ? [{ value: '__difference', label: 'جمع فیلدهای افزایشی منهای کاهشی' }]
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

  useEffect(() => {
    let cancelled = false;
    if (moduleId !== 'surveys' || !scopedSurveyTemplateId) {
      setSurveyTemplateSnapshot(normalizeSurveyTemplateSnapshot({}));
      return () => {
        cancelled = true;
      };
    }
    const run = async () => {
      try {
        const definition = await loadSurveyTemplateDefinition(supabase, scopedSurveyTemplateId);
        if (cancelled) return;
        setSurveyTemplateSnapshot(normalizeSurveyTemplateSnapshot(definition?.snapshot || {}));
      } catch {
        if (!cancelled) {
          setSurveyTemplateSnapshot(normalizeSurveyTemplateSnapshot({}));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [moduleId, scopedSurveyTemplateId]);

  useEffect(() => {
    let cancelled = false;
    if (moduleId !== 'tasks') {
      setTaskProcessFields([]);
      setTaskProcessStatusOptions([]);
      return () => { cancelled = true; };
    }
    void loadTaskReportProcessRuntimeCatalog(supabase)
      .then((catalog) => {
        if (cancelled) return;
        setTaskProcessFields([...catalog.fields, ...catalog.linkedFields]);
        setTaskProcessStatusOptions(catalog.statusOptions);
      })
      .catch(() => {
        if (cancelled) return;
        setTaskProcessFields([]);
        setTaskProcessStatusOptions([]);
      });
    return () => { cancelled = true; };
  }, [moduleId]);

  const loadReport = useCallback(async () => {
    if (!reportId) {
      setCanViewPage(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setServerRuntime(null);
    try {
      const roleContext = await fetchCurrentUserRecordAccessContext(supabase);
      const access = resolveReportsAccessPermissions(roleContext.permissions);
      setCanEditReport(access.canUseBuilder);
      const { data, error } = await supabase
        .from('report_definitions')
        .select('id, name, description, module_id, config, is_active, updated_at')
        .eq('id', reportId)
        .maybeSingle();
      if (error) throw error;

      const nextReport = (data || null) as ReportDefinitionRecord | null;
      if (!nextReport) {
        setCanViewPage(false);
        setLoading(false);
        return;
      }

      const normalizedConfig = normalizeReportConfig(nextReport.config);
      const hasExplicitReportAccess = normalizedConfig.viewer_user_ids.includes(String(roleContext.userId || ''))
        || normalizedConfig.viewer_role_ids.includes(String(roleContext.roleId || ''));
      if (roleContext.permissions?.[String(nextReport.module_id || '').trim()]?.view === false && !hasExplicitReportAccess) {
        setCanViewPage(false);
        setLoading(false);
        return;
      }

      const nextModuleId = String(nextReport.module_id || '').trim();
      const nextScopedSurveyTemplateId = nextModuleId === 'surveys'
        ? getSurveyTemplateScopedIdFromConditions(normalizedConfig.conditions_all, normalizedConfig.conditions_any)
        : null;
      const nextSurveyTemplateSnapshot = nextScopedSurveyTemplateId
        ? normalizeSurveyTemplateSnapshot((await loadSurveyTemplateDefinition(supabase, nextScopedSurveyTemplateId))?.snapshot || {})
        : normalizeSurveyTemplateSnapshot({});
      const optionFields = [
        ...getReportConditionFields(nextModuleId, normalizedConfig.secondary_module_ids, nextSurveyTemplateSnapshot, taskProcessFields),
        ...getReportableFields(nextModuleId, normalizedConfig.secondary_module_ids, nextSurveyTemplateSnapshot, taskProcessFields),
      ];
      const loadedOptions = await loadWorkflowConditionEditorOptions(nextModuleId, optionFields);

      setRelationOptions(loadedOptions.relationOptions);
      setDynamicOptions(loadedOptions.dynamicOptions);
      setSurveyTemplateSnapshot(nextSurveyTemplateSnapshot);
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
  }, [message, reportId, taskProcessFields]);

  const executeReport = useCallback(async (forceRefresh = false) => {
    if (!report) return;
    const cacheKey = buildReportResultCacheKey(report, config);
    if (forceRefresh) removeCachedReportResult(cacheKey);
    setExecuting(true);
    try {
      // گزارش‌های عادی باید همان نمای کامل و قدیمی (جزئیات، جدول‌های داخلی،
      // کارت‌ها، چاپ و خروجی) را حفظ کنند. فقط گزارش‌های ترکیبی به جمع‌بندی
      // سروری نیاز دارند؛ انتقال اجباری همهٔ گزارش‌ها به نمای فشرده باعث
      // حذف جزئیات و باز نشدن گزارش‌های قدیمی شده بود.
      if (config.calculation_mode !== 'normal') {
        const { data: runtimeData, error: runtimeError } = await supabase.functions.invoke('report-runtime', { body: { reportId: report.id } });
        if (runtimeError) {
          const runtimeFailure = await (runtimeError as any)?.context?.json?.().catch(() => null);
          throw new Error(String(runtimeFailure?.error || runtimeError.message || 'report_runtime_failed'));
        }
        if (!runtimeData || !Array.isArray(runtimeData.groups)) throw new Error('خروجی محاسبهٔ گزارش معتبر نیست.');
        setServerRuntime(runtimeData as ServerReportRuntime);
        setCanViewPage(true);
        setRows([]); setGroupedRows([]); setGroupedTreeRows([]); setChartRows([]);
        setLastUpdatedAt(String(runtimeData.generated_at || new Date().toISOString()));
        return;
      }
      setServerRuntime(null);
      if (!moduleConfig) return;
      const roleContext = await fetchCurrentUserRecordAccessContext(supabase);
      const modulePerm = roleContext.permissions?.[moduleId] || {};
      if (modulePerm.view === false) {
        setCanViewPage(false);
        setRows([]);
        setGroupedRows([]);
        return;
      }

      const neededKeys = Array.from(new Set([
        ...config.columns,
        ...config.group_bys.map((item) => item.field),
        chartDimensionField,
        ...config.metric_fields,
        ...config.metric_subtract_fields,
      ].filter((item): item is string => !!item)));
      const conditionFieldKeys = [
        ...config.conditions_all,
        ...config.conditions_any,
      ].map((condition: any) => String(condition?.field || '').trim()).filter(Boolean);
      const taskProcessFieldKeys = Array.from(new Set([
        ...neededKeys,
        ...conditionFieldKeys,
      ].filter(isReportTaskProcessFieldKey)));
      const baseColumns = buildReportBaseSelectColumns(
        moduleConfig,
        [...neededKeys, ...conditionFieldKeys],
        selectedTableBlocks,
      );

      const baseResult = await runSelectWithCompatibleColumns<any[]>({
        cacheKey: `report-viewer:${moduleId}`,
        columns: baseColumns,
        execute: (selectExpr) =>
          supabase
            .from(moduleConfig.table || moduleId)
            .select(selectExpr)
            .limit(config.row_limit),
      });
      if (baseResult.error) throw baseResult.error;

      const scopedRows = (baseResult.data || []).filter((row: any) =>
        !isDeletedReportRecord(row) && canAccessAssignedRecord(row, roleContext.userId, roleContext.roleId, modulePerm.record_scope || 'all', {
          currentOrgId: roleContext.orgId,
          allowedRoleIds: roleContext.allowedRoleIds,
          allowedUserIds: roleContext.allowedUserIds,
        })
      );
      const processLinkedFieldKeys = Array.from(new Set([
        ...neededKeys,
        ...conditionFieldKeys,
      ].filter((fieldKey) => !!parseProcessLinkedFieldKey(fieldKey))));
      const canResolveProcessConditionsOnServer = conditionFieldKeys.every((fieldKey) => (
        !parseReportTableFieldKey(fieldKey) && !parseReportTableRelationFieldKey(fieldKey)
      ));
      let reportSourceRows = scopedRows;
      let conditionsResolvedByServer = false;
      if (moduleId === 'tasks' && processLinkedFieldKeys.length > 0) {
        const runIds = Array.from(new Set(scopedRows
          .map((row: any) => String(row?.process_run_id || row?.recurrence_info?.process_run_id || '').trim())
          .filter(Boolean)));
        const linksByRun = new Map<string, Record<string, string>>();
        for (let offset = 0; offset < runIds.length; offset += 100) {
          const { data: linkRows, error: linkError } = await supabase
            .from('process_run_links')
            .select('process_run_id, module_id, record_id, is_primary')
            .in('process_run_id', runIds.slice(offset, offset + 100))
            .order('is_primary', { ascending: false });
          if (linkError) throw linkError;
          (linkRows || []).forEach((link: any) => {
            const runId = String(link?.process_run_id || '').trim();
            const linkedModuleId = String(link?.module_id || '').trim();
            const linkedRecordId = String(link?.record_id || '').trim();
            if (!runId || !linkedModuleId || !linkedRecordId) return;
            const current = linksByRun.get(runId) || {};
            if (!current[linkedModuleId]) current[linkedModuleId] = linkedRecordId;
            linksByRun.set(runId, current);
          });
        }
        reportSourceRows = scopedRows.map((row: any) => {
          const recurrence = row?.recurrence_info && typeof row.recurrence_info === 'object' ? row.recurrence_info : {};
          const runId = String(row?.process_run_id || recurrence?.process_run_id || '').trim();
          const runLinks = linksByRun.get(runId) || {};
          return Object.keys(runLinks).length > 0
            ? { ...row, recurrence_info: { ...recurrence, process_links: { ...(recurrence?.process_links || {}), ...runLinks } } }
            : row;
        });
      }
      if (moduleId === 'tasks' && canResolveProcessConditionsOnServer && conditionFieldKeys.some((fieldKey) => !!parseProcessLinkedFieldKey(fieldKey)) && reportSourceRows.length > 0) {
        try {
          const { data, error } = await supabase.functions.invoke('goal-progress', {
            body: {
              items: [{
                key: 'report_conditions',
                kind: 'report_conditions',
                moduleId: 'tasks',
                table: moduleConfig.table || 'tasks',
                selectColumns: baseColumns.join(','),
                recordIds: reportSourceRows.map((row: any) => row.id),
                conditionsAll: config.conditions_all,
                conditionsAny: config.conditions_any,
              }],
            },
          });
          const result = data?.items?.report_conditions;
          if (!error && result?.mode === 'server') {
            const passedIds = new Set((Array.isArray(result?.passedIds) ? result.passedIds : []).map((id: any) => String(id || '').trim()));
            reportSourceRows = reportSourceRows.filter((row: any) => passedIds.has(String(row?.id || '').trim()));
            conditionsResolvedByServer = true;
          }
        } catch {
          // تا زمان deploy شدن resolver سرور، مسیر سازگار قبلی در ادامه اجرا می‌شود.
        }
      }
      const tableRelationFieldKeys = Array.from(new Set([
        ...neededKeys,
        ...conditionFieldKeys,
      ].filter((fieldKey) => !!parseReportTableRelationFieldKey(fieldKey))));
      const tableRelationRecordCache = new Map<string, Record<string, any> | null>();
      const relationIdsByModule = new Map<string, Set<string>>();

      tableRelationFieldKeys.forEach((fieldKey) => {
        const relationMeta = parseReportTableRelationFieldKey(fieldKey);
        if (!relationMeta) return;
        reportSourceRows.forEach((sourceRow: any) => {
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
        for (let offset = 0; offset < ids.length; offset += 50) {
          const chunk = ids.slice(offset, offset + 50);
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
      const sharedContext = createWorkflowEvaluationContext(moduleId);
      if (neededKeys.includes('tags') || conditionFieldKeys.includes('tags')) {
        await prefetchWorkflowRecordTags({ moduleId, records: reportSourceRows, context: sharedContext });
      }
      for (let index = 0; index < reportSourceRows.length; index += 1) {
        const sourceRow = reportSourceRows[index];
        const tableSources = selectedTableBlocks.map((block: any) => ({
          block,
          rows: Array.isArray(sourceRow?.[block.id])
            ? sourceRow[block.id].filter((tableRow: any) => !isDeletedReportTableRow(tableRow))
            : [],
        }));

        const rawTableCombos = tableSources.flatMap((source) =>
          source.rows.map((tableRow: any, tableIndex: number) => ({
            rowsByBlockId: { [source.block.id]: tableRow },
            keyParts: [`${source.block.id}:${tableIndex}`],
          }))
        );
        const tableCombos = tableSources.length === 0 || rawTableCombos.length > 0
          ? (tableSources.length === 0 ? [{ rowsByBlockId: {}, keyParts: [] as string[] }] : rawTableCombos)
          : [{ rowsByBlockId: {}, keyParts: [] as string[] }];

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

          taskProcessFieldKeys.forEach((fieldKey) => {
            candidateRow[fieldKey] = resolveTaskReportProcessFieldValue(candidateRow, fieldKey);
          });

          for (const fieldKey of tableRelationFieldKeys) {
            const relationMeta = parseReportTableRelationFieldKey(fieldKey);
            if (!relationMeta) continue;
            const { blockId, relationColumnKey, targetModuleId, targetFieldKey } = relationMeta!;
            const relationValue = candidateRow[buildReportTableFieldKey(blockId, relationColumnKey)];
            const relationRecordId = normalizeRelationRecordId(relationValue);
            if (!relationRecordId) {
              candidateRow[fieldKey] = null;
              continue;
            }
            const relatedRecord = await fetchTableRelationRecord(targetModuleId, relationRecordId);
            candidateRow[fieldKey] = relatedRecord?.[targetFieldKey] ?? null;
          }

          const passed = conditionsResolvedByServer || await evaluateWorkflowConditions({
            conditionsAll: moduleId === 'tasks'
              ? normalizeTaskStatusConditionsForRow(config.conditions_all, candidateRow)
              : config.conditions_all,
            conditionsAny: moduleId === 'tasks'
              ? normalizeTaskStatusConditionsForRow(config.conditions_any, candidateRow)
              : config.conditions_any,
            currentRecord: candidateRow,
            moduleId,
            context: sharedContext,
          });
          if (!passed) continue;

          const resolvedRow: ReportRow = { ...candidateRow };

          for (const fieldKey of neededKeys) {
            if (isReportTaskProcessFieldKey(fieldKey)) {
              resolvedRow[fieldKey] = candidateRow[fieldKey];
              continue;
            }
            if (parseReportTableFieldKey(fieldKey) || parseReportTableRelationFieldKey(fieldKey)) {
              resolvedRow[fieldKey] = candidateRow[fieldKey];
              continue;
            }
            resolvedRow[fieldKey] = await resolveWorkflowFieldValue({
              fieldKey,
              currentRecord: candidateRow,
              moduleId,
              context: sharedContext,
            });
          }

          nextRows.push(resolvedRow);
        }
      }

      const nextChartRows = chartDimensionField ? buildFlatGroupedRows(
        nextRows,
        [config.group_bys.find((group) => group.field === chartDimensionField) || { field: String(chartDimensionField || ''), direction: 'asc' as const }],
        fieldMap,
        relationOptions,
        config.metric_type,
        config.metric_fields,
        currencyLabel
      ) : [];

      setRows(nextRows);
      setChartRows(nextChartRows);

      if (config.group_bys.length === 0) {
        setGroupedRows([]);
        setGroupedTreeRows([]);
        const now = new Date().toISOString();
        setLastUpdatedAt(now);
        writeCachedReportResult(cacheKey, {
          rows: nextRows,
          groupedRows: [],
          groupedTreeRows: [],
          chartRows: nextChartRows,
          lastUpdatedAt: now,
        });
        return;
      }

      const buckets = new Map<string, GroupedRow>();
      nextRows.forEach((row) => {
        const groupLabels: Record<string, string> = {};
        const groupValues: Record<string, any> = {};

        config.group_bys.forEach((grouping) => {
          const field = fieldMap[grouping.field];
          const groupValue = getReportGroupingValue(grouping, field, row, relationOptions, currencyLabel);
          groupValues[grouping.field] = groupValue.value;
          groupLabels[grouping.field] = groupValue.label;
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

          if (config.metric_type === 'difference') {
            const sourceKeys = ((current as any).__metric_source_keys || {}) as Record<string, Set<string>>;
            const addFields = config.metric_fields;
            const subtractFields = config.metric_subtract_fields;
            [...addFields, ...subtractFields].forEach((fieldKey) => {
              sourceKeys[fieldKey] = sourceKeys[fieldKey] || new Set<string>();
              const sourceKey = getMetricSourceKey(fieldKey, row);
              if (sourceKeys[fieldKey].has(sourceKey)) return;
              sourceKeys[fieldKey].add(sourceKey);
              const numericValue = Number(row[fieldKey] || 0);
              const signedValue = (Number.isFinite(numericValue) ? numericValue : 0) * (subtractFields.includes(fieldKey) ? -1 : 1);
              current.metrics.__difference = Number(current.metrics.__difference || 0) + signedValue;
              current.metric_counts.__difference = Number(current.metric_counts.__difference || 0) + 1;
            });
            (current as any).__metric_source_keys = sourceKeys;
          } else if (config.metric_type === 'sum' || config.metric_type === 'avg') {
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
      const finalGroupedRows = nextGroupedRows.filter((row) => row.group_depth === config.group_bys.length - 1);
      const finalGroupedTreeRows = normalizeChildren(nextTreeRows);
      setGroupedRows(finalGroupedRows);
      setGroupedTreeRows(finalGroupedTreeRows);
      const now = new Date().toISOString();
      setLastUpdatedAt(now);
      writeCachedReportResult(cacheKey, {
        rows: nextRows,
        groupedRows: finalGroupedRows,
        groupedTreeRows: finalGroupedTreeRows,
        chartRows: nextChartRows,
        lastUpdatedAt: now,
      });
    } catch (error) {
      const reason = String((error as any)?.message || error || '');
      if (reason.includes('report_row_limit_exceeded') || reason.includes('report_expanded_row_limit_exceeded')) {
        message.error('حجم داده گزارش از سقف اجرای امن عبور کرده است؛ برای اجرای کامل، بازه یا شرط‌های گزارش را محدود کنید.');
      } else if (reason.includes('unsupported_report_grouping') || reason.includes('unsupported_report_metric') || reason.includes('unsupported_report_condition')) {
        message.error('یکی از فیلدهای انتخاب‌شده در این گزارش هنوز برای اجرای سروری قابل محاسبه نیست؛ هیچ نتیجه ناقصی نمایش داده نشد.');
      } else if (reason.includes('report_conditions_')) {
        message.error('ارزیابی شرط‌های گزارش ناموفق بود؛ هیچ نتیجه ناقصی نمایش داده نشد.');
      } else {
        message.error('اجرای گزارش ناموفق بود.');
      }
      setRows([]);
      setGroupedRows([]);
      setGroupedTreeRows([]);
      setChartRows([]);
      setLastUpdatedAt(null);
    } finally {
      setExecuting(false);
    }
  }, [chartDimensionField, config.conditions_all, config.conditions_any, config.columns, config.group_bys, config.metric_fields, config.metric_subtract_fields, config.metric_type, config.row_limit, config.show_group_summaries, currencyLabel, fieldMap, message, moduleConfig, moduleId, relationOptions, report, selectedTableBlocks]);

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
    if (activeMetricKey === '__difference') {
      const seen = new Set<string>();
      return [...config.metric_fields, ...config.metric_subtract_fields].reduce((total, fieldKey) => rows.reduce((sum, row) => {
        const sourceKey = `${fieldKey}:${getMetricSourceKey(fieldKey, row)}`;
        if (seen.has(sourceKey)) return sum;
        seen.add(sourceKey);
        const amount = Number(row[fieldKey] || 0);
        return sum + (Number.isFinite(amount) ? amount : 0) * (config.metric_subtract_fields.includes(fieldKey) ? -1 : 1);
      }, total), 0);
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
  }, [activeMetricKey, config.group_bys.length, config.metric_fields, config.metric_subtract_fields, config.metric_type, groupedRows, rows]);

  const metricCardValues = useMemo<Array<{ key: string; label: string; value: number; fieldType: string; tone?: 'increase' | 'decrease' }>>(() => {
    if (config.metric_type === 'count') {
      return [{ key: '__count', label: 'تعداد رکوردها', value: rows.length, fieldType: 'number' }];
    }
    if (config.metric_type === 'difference') {
      const calculate = (fieldKeys: string[]) => {
        const seen = new Set<string>();
        return fieldKeys.reduce((total, fieldKey) => rows.reduce((sum, row) => {
          const sourceKey = `${fieldKey}:${getMetricSourceKey(fieldKey, row)}`;
          if (seen.has(sourceKey)) return sum;
          seen.add(sourceKey);
          const amount = Number(row[fieldKey] || 0);
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, total), 0);
      };
      return [
        { key: '__difference_add', label: 'جمع افزایشی‌ها', value: calculate(config.metric_fields), fieldType: 'number' },
        { key: '__difference_subtract', label: 'جمع کاهشی‌ها', value: calculate(config.metric_subtract_fields), fieldType: 'number' },
        { key: '__difference', label: 'تفاضل نهایی', value: totalMetricValue, fieldType: 'number' },
      ];
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
  }, [config.group_bys.length, config.metric_type, fieldMap, groupedRows, metricFieldKeys, rows, totalMetricValue]);
  const summaryCards = useMemo(
    () => [
      { key: '__report_card__rows', label: 'تعداد ردیف نتیجه', value: rows.length, fieldType: 'number' },
      { key: '__report_card__groups', label: 'گروه‌ها', value: groupedRows.length, fieldType: 'number' },
      {
        key: '__report_card__active_metric',
        label: metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار',
        value: totalMetricValue,
        fieldType: String(fieldMap[activeMetricKey]?.type || '').toLowerCase(),
      },
      ...metricCardValues.map((metric) => ({
        key: `__report_metric_card__${metric.key}`,
        label: metric.label,
        value: metric.value,
        fieldType: metric.fieldType,
      })),
    ],
    [activeMetricKey, fieldMap, groupedRows.length, metricCardValues, metricOptions, rows.length, totalMetricValue]
  );
  const reportPrintableFields = useMemo<ReportPrintFieldDefinition[]>(
    () => [
      ...summaryCards.map((card) => ({ key: card.key, label: card.label, type: 'metric_card' as const })),
      ...visibleFields.map((field) => ({
        key: String(field.key),
        label: String(field.labels?.fa || field.key),
        type: 'column' as const,
      })),
    ],
    [summaryCards, visibleFields]
  );
  const activePrintFieldKeys = useMemo(
    () => selectedPrintFields[printTemplate] || [],
    [printTemplate, selectedPrintFields]
  );
  const selectedPrintFieldKeySet = useMemo(
    () => new Set(activePrintFieldKeys.map((item) => String(item || '').trim()).filter(Boolean)),
    [activePrintFieldKeys]
  );
  const hasExplicitPrintFieldSelection = activePrintFieldKeys.length > 0;
  const selectedPrintCards = useMemo(
    () => summaryCards.filter((card) => !hasExplicitPrintFieldSelection || selectedPrintFieldKeySet.has(card.key)),
    [hasExplicitPrintFieldSelection, selectedPrintFieldKeySet, summaryCards]
  );
  const selectedPrintVisibleFields = useMemo(
    () => visibleFields.filter((field) => !hasExplicitPrintFieldSelection || selectedPrintFieldKeySet.has(String(field.key))),
    [hasExplicitPrintFieldSelection, selectedPrintFieldKeySet, visibleFields]
  );
  const groupByFields = useMemo(
    () => config.group_bys.map((item) => fieldMap[item.field]).filter(Boolean),
    [config.group_bys, fieldMap]
  );
  const selectedPrintGroupFields = useMemo(
    () => groupByFields.filter((field) => !hasExplicitPrintFieldSelection || selectedPrintFieldKeySet.has(String(field.key))),
    [groupByFields, hasExplicitPrintFieldSelection, selectedPrintFieldKeySet]
  );
  const visibleDetailFields = useMemo(
    () => visibleFields.filter((field) => !config.group_bys.some((grouping) => grouping.field === field.key)),
    [config.group_bys, visibleFields]
  );
  const selectedPrintDetailFields = useMemo(
    () => visibleDetailFields.filter((field) => !hasExplicitPrintFieldSelection || selectedPrintFieldKeySet.has(String(field.key))),
    [hasExplicitPrintFieldSelection, selectedPrintFieldKeySet, visibleDetailFields]
  );
  const groupedDetailRows = useMemo<GroupedDetailRow[]>(() => {
    if (config.group_bys.length === 0) return [];
    const detailRows = rows
      .filter((row) => config.group_bys.every((grouping) => isGroupingFieldAvailableForRow(grouping.field, row)))
      .map((row, index): GroupedDetailRow => {
        const groupLabels: Record<string, string> = {};
        const groupValues: Record<string, any> = {};
        config.group_bys.forEach((grouping) => {
          const field = fieldMap[grouping.field];
          const groupValue = getReportGroupingValue(grouping, field, row, relationOptions, currencyLabel);
          groupValues[grouping.field] = groupValue.value;
          groupLabels[grouping.field] = groupValue.label;
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

    const summaryByKey = new Map(
      groupedRows.map((row) => [
        config.group_bys
          .map((item) => `${item.field}:${getGroupingValueKey(row.group_values[item.field], row.group_labels[item.field])}`)
          .join('||'),
        row,
      ])
    );
    const eligibleRows: GroupedDetailRow[] = [];
    let start = 0;
    while (start < detailRows.length) {
      let end = start + 1;
      const currentKey = config.group_bys
        .map((item) => `${item.field}:${getGroupingValueKey(detailRows[start].__group_values[item.field], detailRows[start].__group_labels[item.field])}`)
        .join('||');
      while (end < detailRows.length) {
        const nextKey = config.group_bys
          .map((item) => `${item.field}:${getGroupingValueKey(detailRows[end].__group_values[item.field], detailRows[end].__group_labels[item.field])}`)
          .join('||');
        if (nextKey !== currentKey) break;
        end += 1;
      }
      eligibleRows.push(...detailRows.slice(start, end));
      const summary = summaryByKey.get(currentKey);
      if (config.show_group_summaries !== false && summary) {
        eligibleRows.push({
          ...detailRows[start],
          __group_row_key: `${currentKey}:summary`,
          __is_group_summary: true,
          __group_summary: summary,
          __group_row_spans: {},
        });
      }
      start = end;
    }

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
  }, [config.group_bys, config.show_group_summaries, currencyLabel, fieldMap, groupedRows, relationOptions, rows]);

  const rawColumns = useMemo<ColumnsType<ReportRow>>(
    () =>
      visibleFields.map((field) => ({
        title: field.labels?.fa || field.key,
        dataIndex: field.key,
        key: field.key,
        render: (_value, row) => {
          const content = formatReportCellValue(field as any, row, relationOptions, currencyLabel);
          if (config.metric_type !== 'difference') return content;
          if (config.metric_subtract_fields.includes(field.key)) return <span className="font-semibold text-red-600 dark:text-red-300">{content}</span>;
          if (config.metric_fields.includes(field.key)) return <span className="font-semibold text-green-600 dark:text-green-300">{content}</span>;
          return content;
        },
      })),
    [config.metric_fields, config.metric_subtract_fields, config.metric_type, currencyLabel, relationOptions, visibleFields]
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
          // با تکرار عنوان گروه در هر ردیف، صفحه‌بندی Ant Design هیچ صفحه‌ای را
          // بدون نام گروه باقی نمی‌گذارد (rowSpan بین دو صفحه قابل اتکا نیست).
          props: { rowSpan: 1 },
        }),
      })),
      ...visibleDetailFields.map((field) => ({
        title: field.labels?.fa || field.key,
        dataIndex: field.key,
        key: field.key,
        render: (_value: unknown, row: GroupedDetailRow, _index: number) => {
          if (row.__is_group_summary) {
            const isFirstDetailColumn = visibleDetailFields[0]?.key === field.key;
            return {
              children: isFirstDetailColumn ? (
                <div className={`rounded-lg px-3 py-2 text-sm font-bold ${config.metric_type === 'difference' && Number(row.__group_summary?.metrics?.__difference || 0) < 0 ? 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200' : config.metric_type === 'difference' ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-gray-100'}`}>
                  جمع گروه: {row.__group_summary ? getGroupSummaryMetricText(row.__group_summary, config, metricFieldKeys, fieldMap, currencyLabel) : '-'}
                </div>
              ) : null,
              props: { colSpan: isFirstDetailColumn ? Math.max(1, visibleDetailFields.length) : 0 },
            };
          }
          const tone = config.metric_type === 'difference'
            ? (config.metric_subtract_fields.includes(field.key) ? 'decrease' : config.metric_fields.includes(field.key) ? 'increase' : null)
            : null;
          const content = formatReportCellValue(field as any, row, relationOptions, currencyLabel);
          return tone ? <span className={tone === 'decrease' ? 'font-semibold text-red-600 dark:text-red-300' : 'font-semibold text-green-600 dark:text-green-300'}>{content}</span> : content;
        },
      })),
      ...(visibleDetailFields.length === 0 ? [{
        title: 'جمع گروه',
        key: '__group_summary',
        render: (_value: unknown, row: GroupedDetailRow) => row.__is_group_summary && row.__group_summary
          ? getGroupSummaryMetricText(row.__group_summary, config, metricFieldKeys, fieldMap, currencyLabel)
          : '',
      }] : []),
    ],
    [config, currencyLabel, fieldMap, groupByFields, metricFieldKeys, relationOptions, visibleDetailFields]
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
      return { label, value, count: row.row_count, tone: config.metric_type === 'difference' ? (value < 0 ? 'decrease' as const : 'increase' as const) : undefined };
    });
  }, [activeMetricKey, chartAvailable, chartDimensionField, chartRows, config.metric_type]);

  const exportHeaders = useMemo(() => {
    if (config.group_bys.length > 0) {
      return [
        ...groupByFields.map((field) => field.labels?.fa || field.key),
        ...(visibleDetailFields.length > 0 ? visibleDetailFields.map((field) => field.labels?.fa || field.key) : ['جمع گروه']),
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
        ...(visibleDetailFields.length > 0
          ? visibleDetailFields.map((field, index) => ({
              value: row.__is_group_summary
                ? (index === 0 && row.__group_summary ? `جمع گروه: ${getGroupSummaryMetricText(row.__group_summary, config, metricFieldKeys, fieldMap, currencyLabel)}` : '')
                : formatReportCellValue(field as any, row, relationOptions, currencyLabel),
            }))
          : [{
              value: row.__is_group_summary && row.__group_summary
                ? `جمع گروه: ${getGroupSummaryMetricText(row.__group_summary, config, metricFieldKeys, fieldMap, currencyLabel)}`
                : '',
            }]),
      ]);
    }
    return rows.map((row) => visibleFields.map((field) => ({
      value: formatReportCellValue(field as any, row, relationOptions, currencyLabel),
    })));
  }, [config, currencyLabel, fieldMap, groupByFields, groupedDetailRows, metricFieldKeys, relationOptions, rows, visibleDetailFields, visibleFields]);

  const exportRows = useMemo(
    () => exportCellRows.map((line) => line.map((cell) => cell.rowSpan === 0 ? '' : cell.value)),
    [exportCellRows]
  );

  useEffect(() => {
    setSelectedPrintFields(config.print_selected_field_keys || {});
  }, [config.print_selected_field_keys]);

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
    const printHeaders = config.group_bys.length > 0
      ? [
          ...selectedPrintGroupFields.map((field) => field.labels?.fa || field.key),
          ...(selectedPrintDetailFields.length > 0 ? selectedPrintDetailFields.map((field) => field.labels?.fa || field.key) : ['جمع گروه']),
        ]
      : selectedPrintVisibleFields.map((field) => field.labels?.fa || field.key);
    const printCellRows: ExportCell[][] = config.group_bys.length > 0
      ? groupedDetailRows.map((row) => [
          ...selectedPrintGroupFields.map((field) => ({
            value: row.__group_labels[field.key] || '-',
            rowSpan: row.__group_row_spans[field.key] || 0,
          })),
          ...(selectedPrintDetailFields.length > 0
            ? selectedPrintDetailFields.map((field, index) => ({
                value: row.__is_group_summary
                  ? (index === 0 && row.__group_summary ? `جمع گروه: ${getGroupSummaryMetricText(row.__group_summary, config, metricFieldKeys, fieldMap, currencyLabel)}` : '')
                  : formatReportCellValue(field as any, row, relationOptions, currencyLabel),
              }))
            : [{
                value: row.__is_group_summary && row.__group_summary
                  ? `جمع گروه: ${getGroupSummaryMetricText(row.__group_summary, config, metricFieldKeys, fieldMap, currencyLabel)}`
                  : '',
              }]),
        ])
      : rows.map((row) => selectedPrintVisibleFields.map((field) => ({
          value: formatReportCellValue(field as any, row, relationOptions, currencyLabel),
        })));
    const effectiveHeaders = printHeaders.length > 0 ? printHeaders : exportHeaders;
    const effectiveCellRows = printHeaders.length > 0
      ? printCellRows
      : exportCellRows;
    const printFontSize = effectiveHeaders.length > 14 ? (orientation === 'landscape' ? 6.5 : 5.8) : (orientation === 'landscape' ? 8 : 7);
    const tableRowsHtml = effectiveCellRows.map((line) => `
      <tr>${line.map((cell) => {
        if (cell.rowSpan === 0) return '';
        const rowSpanAttr = Number(cell.rowSpan || 0) > 1 ? ` rowspan="${Number(cell.rowSpan)}"` : '';
        return `<td${rowSpanAttr}>${escapePrintHtml(cell.value ?? '-')}</td>`;
      }).join('')}</tr>
    `).join('');
    const cardsHtml = selectedPrintCards.length > 0 ? `
      <section class="report-print-section">
        <div class="report-print-cards">
          ${selectedPrintCards.map((card) => `
            <div class="report-print-card">
              <div class="report-print-card-label">${escapePrintHtml(card.label)}</div>
              <div class="report-print-card-value">${escapePrintHtml(
                card.key === '__report_card__rows' || card.key === '__report_card__groups'
                  ? toPersianNumber(card.value)
                  : formatMetricValue(Number(card.value || 0), card.fieldType, currencyLabel)
              )}</div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '';
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
          .report-print-page { width:100%; max-width:${orientation === 'landscape' ? '297mm' : '210mm'}; min-height:${orientation === 'landscape' ? '210mm' : '297mm'}; padding:${orientation === 'landscape' ? '7mm' : '8mm'}; background:#fff; color:#111827; font-family:Peyda,Tahoma,Arial,sans-serif; overflow:hidden; }
          .report-print-header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; border-bottom:2px solid #111827; padding-bottom:8px; margin-bottom:10px; }
          .report-print-title { font-size:18px; font-weight:900; }
          .report-print-meta { font-size:10px; color:#6b7280; text-align:left; }
          .report-print-section h3 { margin:10px 0 6px; font-size:13px; }
          .report-print-cards { display:grid; grid-template-columns:repeat(${Math.max(1, Math.min(4, selectedPrintCards.length || 1))}, minmax(0, 1fr)); gap:8px; margin-bottom:8px; }
          .report-print-card { border:1px solid #d1d5db; background:#f9fafb; padding:8px; min-height:58px; }
          .report-print-card-label { font-size:9px; color:#6b7280; margin-bottom:4px; }
          .report-print-card-value { font-size:13px; font-weight:800; color:#111827; line-height:1.8; }
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
        ${cardsHtml}
        ${chartHtml}
        <section class="report-print-section">
          <h3>جدول گزارش</h3>
          <table class="report-print-table">
            <thead><tr>${effectiveHeaders.map((header) => `<th>${escapePrintHtml(header)}</th>`).join('')}</tr></thead>
            <tbody>${tableRowsHtml}</tbody>
          </table>
        </section>
      </div>
    `;
  };

  const prepareReportPrint = () => {
    reportPrintTargetWindowRef.current = prepareGeneratedPdfWindow(report?.name || 'گزارش', { force: true });
  };

  const handlePrint = (orientation: 'portrait' | 'landscape' = 'landscape') => {
    const title = report?.name || 'گزارش';
    const targetWindow = reportPrintTargetWindowRef.current || prepareGeneratedPdfWindow(title, { force: true });
    reportPrintTargetWindowRef.current = null;
    void printAsPdf({
      pageSize: `A4 ${orientation}`,
      sourceHtml: buildReportPrintHtml(orientation),
      title,
      filename: title,
      targetWindow,
      openInPdfViewer: true,
    }).catch((error) => {
      console.error('Report PDF print failed', error);
    });
  };

  const generateFinalReportPdfPreview = async (
    onProgress: (progress: { percent: number; label: string }) => void,
  ) => {
    const title = report?.name || 'گزارش';
    return {
      blob: await generatePdfBlob({
        pageSize: `A4 ${printTemplate}`,
        sourceHtml: buildReportPrintHtml(printTemplate),
        title,
        filename: title,
        onProgress,
      }),
      filename: `${title}.pdf`,
      title,
    };
  };

  const handleCopyReport = useCallback(async () => {
    if (!report) return;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      const { data, error } = await supabase
        .from('report_definitions')
        .insert([{
          name: `${String(report.name || 'گزارش').trim()} (کپی)`,
          description: report.description || null,
          module_id: report.module_id,
          report_type: report.report_type || 'module_report',
          config: normalizeReportConfig(report.config),
          is_active: report.is_active !== false,
          created_by: userId,
          updated_by: userId,
        }])
        .select('id')
        .single();
      if (error) throw error;
      message.success('کپی گزارش ساخته شد.');
      navigate(`/reports/${data.id}/edit`);
    } catch (error) {
      message.error(String((error as any)?.message || 'کپی گزارش ناموفق بود.'));
    }
  }, [message, navigate, report]);

  const handleTogglePrintField = useCallback((templateId: string, fieldName: string) => {
    setSelectedPrintFields((prev) => {
      const current = prev[templateId] || [];
      return current.includes(fieldName)
        ? { ...prev, [templateId]: current.filter((item) => item !== fieldName) }
        : { ...prev, [templateId]: [...current, fieldName] };
    });
  }, []);
  const handleSavePrintFields = useCallback(async () => {
    if (!reportId || !report) return false;
    setSavingPrintFields(true);
    try {
      const nextConfig = {
        ...config,
        print_selected_field_keys: Object.fromEntries(
          Object.entries(selectedPrintFields).map(([templateKey, fieldKeys]) => [
            String(templateKey || '').trim(),
            Array.from(new Set((Array.isArray(fieldKeys) ? fieldKeys : []).map((item) => String(item || '').trim()).filter(Boolean))),
          ])
        ),
      };
      const { error } = await supabase
        .from('report_definitions')
        .update({ config: nextConfig })
        .eq('id', reportId);
      if (error) throw error;
      setReport((prev) => prev ? { ...prev, config: nextConfig } : prev);
      message.success('تنظیمات چاپ گزارش ذخیره شد');
      return true;
    } catch (error) {
      message.error(String((error as any)?.message || 'ذخیره تنظیمات چاپ گزارش انجام نشد'));
      return false;
    } finally {
      setSavingPrintFields(false);
    }
  }, [config, message, report, reportId, selectedPrintFields]);
  const reportPrintTemplates = useMemo(
    () => [
      { id: 'landscape', title: 'A4 افقی', description: 'مناسب گزارش‌های جدولی عریض', isSystem: true },
      { id: 'portrait', title: 'A4 عمودی', description: 'مناسب گزارش‌های فشرده‌تر', isSystem: true },
    ],
    []
  );
  const reportPrintPreviewSourceVersion = useMemo(
    () => createPrintPreviewFingerprint({
      report,
      rows,
      groupedDetailRows,
      selectedPrintVisibleFields,
      selectedPrintCards,
      selectedPrintGroupFields,
      activeMetricKey,
      renderMode,
    }),
    [
      activeMetricKey,
      groupedDetailRows,
      renderMode,
      report,
      rows,
      selectedPrintCards,
      selectedPrintGroupFields,
      selectedPrintVisibleFields,
    ],
  );
  const renderPrintCard = useCallback(
    () => <div dangerouslySetInnerHTML={{ __html: buildReportPrintHtml(printTemplate) }} />,
    [printTemplate, buildReportPrintHtml]
  );

  if (loading) {
    return <div className="flex h-[70vh] items-center justify-center"><Spin size="large" /></div>;
  }

  if (report && serverRuntime) {
    return <>
      <ServerReportResultView
        report={report}
        runtime={serverRuntime}
        currencyLabel={currencyLabel}
        onRefresh={() => void executeReport(true)}
        refreshing={executing}
        canEdit={canEditReport}
        onEdit={() => navigate(`/reports/${report.id}/edit`)}
        onCopy={() => void handleCopyReport()}
        onExport={() => void handleExportExcel()}
        onConfigurePrint={() => setIsPrintModalOpen(true)}
        onPrint={() => handlePrint(printTemplate)}
      />
      <PrintSection
        isPrintModalOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        onPreparePrint={prepareReportPrint}
        onPrint={() => handlePrint(printTemplate)}
        onGenerateFinalPdfPreview={generateFinalReportPdfPreview}
        previewContentVersion={reportPrintPreviewSourceVersion}
        printTemplates={reportPrintTemplates}
        selectedTemplateId={printTemplate}
        onSelectTemplate={(id) => setPrintTemplate(id as 'landscape' | 'portrait')}
        renderPrintCard={renderPrintCard}
        printMode={false}
        printableFields={reportPrintableFields}
        selectedPrintFields={selectedPrintFields}
        onTogglePrintField={handleTogglePrintField}
        onSavePrintFields={handleSavePrintFields}
        savingPrintFields={savingPrintFields}
        allowFieldSelectionTab
        previewMeta={{ paperSize: 'A4', orientation: printTemplate }}
      />
    </>;
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
            {lastUpdatedAt && (
              <div className="mt-2 text-xs font-medium text-gray-500">
                آخرین بروزرسانی: {formatLastUpdatedAt(lastUpdatedAt)}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<ReloadOutlined />} loading={executing} onClick={() => void executeReport(true)}>بروزرسانی</Button>
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
            <Button icon={<EyeOutlined />} onClick={() => setIsPrintModalOpen(true)}>تنظیم چاپ</Button>
            <Button icon={<PrinterOutlined />} onClick={() => handlePrint(printTemplate)}>چاپ</Button>
            <Button icon={<CopyOutlined />} onClick={() => void handleCopyReport()}>کپی</Button>
            {canEditReport && <Button icon={<EditOutlined />} onClick={() => navigate(`/reports/${report?.id}/edit`)}>ویرایش</Button>}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className={`rounded-[1.5rem] border p-4 ${config.metric_type === 'difference' ? (totalMetricValue < 0 ? 'border-red-200 bg-red-50/70 dark:border-red-900/70 dark:bg-red-950/20' : 'border-green-200 bg-green-50/70 dark:border-green-900/70 dark:bg-green-950/20') : 'border-gray-200 bg-gray-50/70 dark:border-gray-700 dark:bg-white/5'}`}>
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

        <Collapse
          className="mb-6"
          activeKey={conditionsOpen ? ['conditions'] : []}
          onChange={(keys) => setConditionsOpen((keys as string[]).includes('conditions'))}
          items={[{
            key: 'conditions',
            label: 'شرایط گزارش',
            children: <div className="space-y-4">
              <WorkflowConditionsGroup value={draftConditionsAll} onChange={setDraftConditionsAll} fields={reportableFields} dynamicOptions={dynamicOptions} relationOptions={relationOptions} />
              <WorkflowConditionsGroup value={draftConditionsAny} onChange={setDraftConditionsAny} fields={reportableFields} dynamicOptions={dynamicOptions} relationOptions={relationOptions} />
              <div className="flex flex-wrap gap-2">
                <Button type="primary" className="kalam-btn-brand" onClick={applyTemporaryConditions}>اعمال موقت</Button>
                <Button disabled={!canEditReport} onClick={() => void saveReportConditions().catch((error) => message.error(String(error?.message || 'ذخیره گزارش ناموفق بود')))}>ذخیره گزارش</Button>
              </div>
            </div>,
          }]}
        />

        {metricCardValues.length > 1 && (
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metricCardValues.map((metric) => (
              <div key={metric.key} className={`rounded-[1.5rem] border p-4 ${metric.tone === 'decrease' ? 'border-red-200 bg-red-50/70 dark:border-red-900/70 dark:bg-red-950/20' : metric.tone === 'increase' ? 'border-green-200 bg-green-50/70 dark:border-green-900/70 dark:bg-green-950/20' : 'border-gray-200 bg-gray-50/70 dark:border-gray-700 dark:bg-white/5'}`}>
                <Statistic
                  title={metric.label}
                  value={metric.value}
                  formatter={(value) => metric.key === '__count' ? toPersianNumber(value) : formatMetricValue(Number(value || 0), metric.fieldType, currencyLabel)}
                />
              </div>
            ))}
          </div>
        )}

        {chartAvailable && config.output_modes.some((mode) => mode !== 'table') && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-gray-200 p-4 dark:border-gray-700">
            <div className="text-sm font-bold text-gray-700 dark:text-gray-100">نمایش‌های انتخاب‌شدهٔ گزارش</div>
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

        {config.output_modes.includes('bar') && chartAvailable && (
          <SimpleBarChart
            items={chartItems}
            valueLabel={metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار'}
            valueFormatter={(value) => activeMetricKey === '__count'
              ? toPersianNumber(value)
              : formatMetricValue(Number(value || 0), String(fieldMap[activeMetricKey]?.type || '').toLowerCase(), currencyLabel)}
          />
        )}

        {config.output_modes.includes('pie') && chartAvailable && (
          <SimplePieChart
            items={chartItems}
            valueLabel={metricOptions.find((item) => item.value === activeMetricKey)?.label || 'معیار'}
            valueFormatter={(value) => activeMetricKey === '__count'
              ? toPersianNumber(value)
              : formatMetricValue(Number(value || 0), String(fieldMap[activeMetricKey]?.type || '').toLowerCase(), currencyLabel)}
          />
        )}

        {config.output_modes.includes('line') && chartAvailable && (
          <SimpleLineChart items={chartItems} valueFormatter={(value) => activeMetricKey === '__count' ? toPersianNumber(value) : formatMetricValue(Number(value || 0), String(fieldMap[activeMetricKey]?.type || '').toLowerCase(), currencyLabel)} />
        )}

        {executing && <ReportExecutionProgress />}

        {(config.output_modes.includes('table') || !chartAvailable) && (
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
      <PrintSection
        isPrintModalOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        onPreparePrint={prepareReportPrint}
        onPrint={() => handlePrint(printTemplate)}
        onGenerateFinalPdfPreview={generateFinalReportPdfPreview}
        previewContentVersion={reportPrintPreviewSourceVersion}
        printTemplates={reportPrintTemplates}
        selectedTemplateId={printTemplate}
        onSelectTemplate={(id) => setPrintTemplate(id as 'landscape' | 'portrait')}
        renderPrintCard={renderPrintCard}
        printMode={false}
        printableFields={reportPrintableFields}
        selectedPrintFields={selectedPrintFields}
        onTogglePrintField={handleTogglePrintField}
        onSavePrintFields={handleSavePrintFields}
        savingPrintFields={savingPrintFields}
        allowFieldSelectionTab
        previewMeta={{ paperSize: 'A4', orientation: printTemplate }}
      />
    </div>
  );
};

export default ReportViewerPage;
