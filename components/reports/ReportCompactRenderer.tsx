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
  type ReportDefinitionRecord,
} from "../../utils/reporting";
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
};
type ReportCompactRendererProps = {
  report: ReportDefinitionRecord;
  maxHeight?: number;
};

const numberValue = (value: unknown) => Number(value || 0);
const formatValue = (value: unknown, currencyLabel = "") => {
  const formatted = formatPersianPrice(numberValue(value));
  return currencyLabel ? `${formatted} ${currencyLabel}` : formatted;
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
    config.default_view === "table" ? "table" : "bar",
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
    setRenderMode(config.default_view === "table" ? "table" : "bar");
    void executeReport();
  }, [config.default_view, executeReport]);

  const groups = runtime?.groups || [];
  const mode = runtime?.mode || config.calculation_mode;
  const chartItems = useMemo(
    () =>
      groups.map((group) => ({
        label: group.label || "—",
        value: groupValue(group, mode),
        tone:
          groupValue(group, mode) < 0
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
          render: (_, row) => formatValue(row.increase, currencyLabel),
        },
        {
          title: "کاهنده",
          key: "decrease",
          render: (_, row) => formatValue(row.decrease, currencyLabel),
        },
        {
          title: "خالص",
          key: "net",
          render: (_, row) => formatValue(groupValue(row, mode), currencyLabel),
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
        title: "نتیجه",
        key: "value",
        render: (_, row) => formatValue(groupValue(row, mode), currencyLabel),
      },
    ];
  }, [currencyLabel, mode]);

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
              valueFormatter={(value) => formatValue(value, currencyLabel)}
            />
            <SimplePieChart
              items={decreaseItems}
              valueLabel="کاهنده"
              valueFormatter={(value) => formatValue(value, currencyLabel)}
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
          valueFormatter={(value) => formatValue(value, currencyLabel)}
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
              : formatValue(value, currencyLabel)
          }
        />
      );
    if (mode === "difference")
      return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SimpleBarChart
            items={increaseItems}
            valueLabel="افزاینده"
            valueFormatter={(value) => formatValue(value, currencyLabel)}
          />
          <SimpleBarChart
            items={decreaseItems}
            valueLabel="کاهنده"
            valueFormatter={(value) => formatValue(value, currencyLabel)}
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
            : formatValue(value, currencyLabel)
        }
      />
    );
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void executeReport()}
            aria-label="به‌روزرسانی گزارش"
          />
          <Button
            size="small"
            icon={<TableOutlined />}
            type={renderMode === "table" ? "primary" : "default"}
            onClick={() => setRenderMode("table")}
          />
          <Button
            size="small"
            icon={<BarChartOutlined />}
            type={renderMode === "bar" ? "primary" : "default"}
            onClick={() => setRenderMode("bar")}
          />
          <Button
            size="small"
            icon={<LineChartOutlined />}
            type={renderMode === "line" ? "primary" : "default"}
            onClick={() => setRenderMode("line")}
          />
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
            {formatValue(totals.increase - totals.decrease, currencyLabel)}
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
