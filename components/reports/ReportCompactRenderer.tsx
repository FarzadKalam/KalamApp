import React, { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Spin, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  ReloadOutlined,
  TableOutlined,
} from "@ant-design/icons";
import { supabase } from "../../supabaseClient";
import {
  normalizeReportConfig,
  getReportTableBlock,
  parseReportTableFieldKey,
  type ReportDefinitionRecord,
} from "../../utils/reporting";
import { MODULES } from "../../moduleRegistry";
import {
  formatPersianPrice,
  toPersianNumber,
} from "../../utils/persianNumberFormatter";
import { readCurrencyConfig } from "../../utils/currency";
import SimpleBarChart from "./SimpleBarChart";
import SimpleLineChart from "./SimpleLineChart";
import SimplePieChart from "./SimplePieChart";

type RenderMode = "table" | "bar" | "pie" | "line";
type RuntimeGroup = {
  key: string;
  label: string;
  row_count: number;
  increase: number;
  decrease: number;
  target: number;
  total: number;
  metrics: Record<string, number>;
};
type ReportRuntime = {
  mode: "normal" | "difference" | "percentage";
  groups: RuntimeGroup[];
  metric_sources?: Record<string, { module_id: string; metric_key: string }>;
};
type ReportCompactRendererProps = {
  report: ReportDefinitionRecord;
  maxHeight?: number;
};

const numberValue = (value: unknown) => Number(value || 0);
const formatValue = (value: unknown, fieldType = "number", currencyLabel = "") => {
  if (fieldType === "price") {
    const formatted = formatPersianPrice(numberValue(value));
    return currencyLabel ? `${formatted} ${currencyLabel}` : formatted;
  }
  return toPersianNumber(numberValue(value).toLocaleString("en-US"));
};

const resolveMetricField = (moduleId: string, metricKey: string) => {
  const tableField = parseReportTableFieldKey(metricKey);
  if (tableField) {
    return getReportTableBlock(moduleId, `__report_table__${tableField.blockId}`)?.tableColumns
      ?.find((column: any) => String(column?.key || "") === tableField.columnKey);
  }
  return MODULES[moduleId]?.fields?.find((field: any) => String(field?.key || "") === metricKey);
};

const resolveRuntimeMetricType = (runtime: ReportRuntime | null, metrics: Array<{ report_id: string; metric_key: string }>) => {
  const sources = runtime?.metric_sources || {};
  const selected = metrics.map((metric) => sources[`${metric.report_id}::${metric.metric_key}`]).filter(Boolean) as Array<{ module_id: string; metric_key: string }>;
  if (!selected.length || selected.length !== metrics.length) return "number";
  return selected.every((source) => String(resolveMetricField(source.module_id, source.metric_key)?.type || "").toLowerCase() === "price") ? "price" : "number";
};
const groupValue = (group: RuntimeGroup, mode: ReportRuntime["mode"]) => {
  if (mode === "difference")
    return numberValue(group.increase) - numberValue(group.decrease);
  if (mode === "percentage")
    return numberValue(group.total) > 0
      ? (numberValue(group.target) / numberValue(group.total)) * 100
      : 0;
  return numberValue(Object.values(group.metrics || {})[0] ?? group.row_count);
};

const ReportCompactRenderer: React.FC<ReportCompactRendererProps> = ({
  report,
  maxHeight = 360,
}) => {
  const { message } = App.useApp();
  const config = useMemo(
    () => normalizeReportConfig(report.config),
    [report.config],
  );
  const [runtime, setRuntime] = useState<ReportRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [renderMode, setRenderMode] = useState<RenderMode>(
    (config.output_modes.find((mode) => mode !== "table") || config.output_modes[0] || "table") as RenderMode,
  );
  const currencyLabel = readCurrencyConfig().label || "";

  const executeReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "report-runtime",
        { body: { reportId: report.id } },
      );
      if (error) {
        const failure = await (error as any)?.context
          ?.json?.()
          .catch(() => null);
        throw new Error(
          String(failure?.error || error.message || "report_runtime_failed"),
        );
      }
      if (!data || !Array.isArray(data.groups))
        throw new Error("report_runtime_invalid");
      setRuntime(data as ReportRuntime);
    } catch (error) {
      const reason = String((error as any)?.message || error || "");
      message.error(
        reason.includes("report_row_limit_exceeded") ||
          reason.includes("report_expanded_row_limit_exceeded")
          ? "حجم داده این گزارش برای اجرای کامل زیاد است."
          : "اجرای گزارش داشبورد ناموفق بود.",
      );
      setRuntime(null);
    } finally {
      setLoading(false);
    }
  }, [message, report.id]);

  useEffect(() => {
    setRenderMode((config.output_modes.find((mode) => mode !== "table") || config.output_modes[0] || "table") as RenderMode);
    void executeReport();
  }, [config.default_view, executeReport]);

  const groups = runtime?.groups || [];
  const mode = runtime?.mode || config.calculation_mode;
  const runtimeMetricKeys = Object.keys(groups[0]?.metrics || {});
  const selectedMetrics = mode === "difference"
    ? [...config.increase_metrics, ...config.decrease_metrics]
    : runtimeMetricKeys.map((metric_key) => ({ report_id: report.id, metric_key }));
  const metricFieldType = resolveRuntimeMetricType(runtime, selectedMetrics);
  const primaryMetricField = runtimeMetricKeys.length === 1 ? resolveMetricField(report.module_id, runtimeMetricKeys[0]) : null;
  const metricLabel = (primaryMetricField as any)?.labels?.fa || (primaryMetricField as any)?.label || (mode === "normal" && config.metric_type === "count" ? "تعداد رکوردها" : "نتیجه");
  const chartItems = useMemo(
    () =>
      groups.map((group) => ({
        label: group.label || "—",
        value: groupValue(group, mode),
        tone: mode === "normal"
          ? undefined
          : groupValue(group, mode) < 0
            ? ("decrease" as const)
            : ("increase" as const),
      })),
    [groups, mode],
  );
  const increaseItems = useMemo(
    () =>
      groups.map((group) => ({
        label: group.label || "—",
        value: numberValue(group.increase),
        tone: "increase" as const,
      })),
    [groups],
  );
  const decreaseItems = useMemo(
    () =>
      groups.map((group) => ({
        label: group.label || "—",
        value: numberValue(group.decrease),
        tone: "decrease" as const,
      })),
    [groups],
  );
  const totals = useMemo(
    () =>
      groups.reduce(
        (result, group) => ({
          increase: result.increase + numberValue(group.increase),
          decrease: result.decrease + numberValue(group.decrease),
          target: result.target + numberValue(group.target),
          total: result.total + numberValue(group.total),
        }),
        { increase: 0, decrease: 0, target: 0, total: 0 },
      ),
    [groups],
  );

  const columns = useMemo<ColumnsType<RuntimeGroup>>(() => {
    const base: ColumnsType<RuntimeGroup> = [
      { title: "گروه", dataIndex: "label", key: "label", ellipsis: true },
    ];
    if (mode === "difference")
      return [
        ...base,
        {
          title: "افزاینده",
          key: "increase",
          render: (_, row) => formatValue(row.increase, metricFieldType, currencyLabel),
        },
        {
          title: "کاهنده",
          key: "decrease",
          render: (_, row) => formatValue(row.decrease, metricFieldType, currencyLabel),
        },
        {
          title: "خالص",
          key: "net",
          render: (_, row) => formatValue(groupValue(row, mode), metricFieldType, currencyLabel),
        },
      ];
    if (mode === "percentage")
      return [
        ...base,
        {
          title: "هدف",
          dataIndex: "target",
          key: "target",
          render: (value) =>
            toPersianNumber(numberValue(value).toLocaleString("en-US")),
        },
        {
          title: "کل",
          dataIndex: "total",
          key: "total",
          render: (value) =>
            toPersianNumber(numberValue(value).toLocaleString("en-US")),
        },
        {
          title: "نرخ",
          key: "rate",
          render: (_, row) =>
            `${toPersianNumber(groupValue(row, mode).toFixed(1))}٪`,
        },
      ];
    return [
      ...base,
      {
        title: metricLabel,
        key: "value",
        render: (_, row) => formatValue(groupValue(row, mode), metricFieldType, currencyLabel),
      },
    ];
  }, [currencyLabel, metricFieldType, metricLabel, mode]);

  const renderChart = () => {
    if (renderMode === "table")
      return (
        <Table<RuntimeGroup>
          rowKey="key"
          size="small"
          columns={columns}
          dataSource={groups}
          pagination={{ pageSize: 6, hideOnSinglePage: true }}
          scroll={{ x: true }}
          locale={{ emptyText: "داده‌ای یافت نشد" }}
        />
      );
    if (renderMode === "pie") {
      if (mode === "difference")
        return (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SimplePieChart
              items={increaseItems}
              valueLabel="افزاینده"
              valueFormatter={(value) => formatValue(value, metricFieldType, currencyLabel)}
            />
            <SimplePieChart
              items={decreaseItems}
              valueLabel="کاهنده"
              valueFormatter={(value) => formatValue(value, metricFieldType, currencyLabel)}
            />
          </div>
        );
      if (mode === "percentage")
        return (
          <SimplePieChart
            items={[
              {
                label: "هدف تحقق‌یافته",
                value: totals.target,
                tone: "increase",
              },
              {
                label: "باقی‌مانده تا کل",
                value: Math.max(0, totals.total - totals.target),
                tone: "decrease",
              },
            ]}
            valueLabel="نرخ"
            valueFormatter={(value) =>
              toPersianNumber(numberValue(value).toLocaleString("en-US"))
            }
          />
        );
      return (
        <SimplePieChart
          items={chartItems}
          valueLabel="مقدار"
          valueFormatter={(value) => formatValue(value, metricFieldType, currencyLabel)}
        />
      );
    }
    if (renderMode === "line")
      return (
        <SimpleLineChart
          items={chartItems}
          valueFormatter={(value) =>
            mode === "percentage"
              ? `${toPersianNumber(numberValue(value).toFixed(1))}٪`
              : formatValue(value, metricFieldType, currencyLabel)
          }
        />
      );
    if (mode === "difference")
      return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SimpleBarChart
            items={increaseItems}
            valueLabel="افزاینده"
            valueFormatter={(value) => formatValue(value, metricFieldType, currencyLabel)}
          />
          <SimpleBarChart
            items={decreaseItems}
            valueLabel="کاهنده"
            valueFormatter={(value) => formatValue(value, metricFieldType, currencyLabel)}
          />
        </div>
      );
    return (
      <SimpleBarChart
        items={chartItems}
        valueLabel={mode === "percentage" ? "نرخ" : "مقدار"}
        valueFormatter={(value) =>
          mode === "percentage"
            ? `${toPersianNumber(numberValue(value).toFixed(1))}٪`
            : formatValue(value, metricFieldType, currencyLabel)
        }
      />
    );
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {config.output_modes.includes("table") && <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void executeReport()}
            aria-label="به‌روزرسانی گزارش"
          />}
          {config.output_modes.includes("bar") && <Button
            size="small"
            icon={<TableOutlined />}
            type={renderMode === "table" ? "primary" : "default"}
            onClick={() => setRenderMode("table")}
          />}
          {config.output_modes.includes("line") && <Button
            size="small"
            icon={<BarChartOutlined />}
            type={renderMode === "bar" ? "primary" : "default"}
            onClick={() => setRenderMode("bar")}
          />}
          {config.output_modes.includes("pie") && <Button
            size="small"
            icon={<LineChartOutlined />}
            type={renderMode === "line" ? "primary" : "default"}
            onClick={() => setRenderMode("line")}
          />}
          <Button
            size="small"
            icon={<PieChartOutlined />}
            type={renderMode === "pie" ? "primary" : "default"}
            onClick={() => setRenderMode("pie")}
          />
        </div>
        {mode === "difference" && (
          <span className="text-xs text-gray-500">
            خالص:{" "}
            {formatValue(totals.increase - totals.decrease, metricFieldType, currencyLabel)}
          </span>
        )}
        {mode === "percentage" && (
          <span className="text-xs text-gray-500">
            نرخ:{" "}
            {totals.total > 0
              ? `${toPersianNumber(((totals.target / totals.total) * 100).toFixed(1))}٪`
              : "—"}
          </span>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200 p-2 dark:border-gray-700"
        style={{ maxHeight }}
      >
        {loading ? (
          <div className="flex h-[180px] items-center justify-center">
            <Spin />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center">
            <Empty description="برای این گزارش داده‌ای پیدا نشد" />
          </div>
        ) : (
          renderChart()
        )}
      </div>
    </div>
  );
};

export default ReportCompactRenderer;
