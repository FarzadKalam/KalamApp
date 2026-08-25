import React, { useMemo } from 'react';
import { Card, Empty, Progress } from 'antd';
import { formatPersianPrice, toPersianNumber } from '../../utils/persianNumberFormatter';
import { getCampaignToolLabel } from '../../utils/advertisingCampaigns';
import SimpleLineChart from '../reports/SimpleLineChart';
import type { CampaignDashboardSummary, CampaignToolRecord } from './types';

type CampaignDashboardChartsProps = {
  summary: CampaignDashboardSummary;
  tools: CampaignToolRecord[];
  currencyLabel?: string;
  timeline?: Array<{ label: string; value: number }>;
};

const ComparisonRow: React.FC<{
  label: string;
  estimated: number;
  actual: number;
  formatter: (value: number) => React.ReactNode;
}> = ({ label, estimated, actual, formatter }) => {
  const maxValue = Math.max(estimated, actual, 1);
  return (
    <div className="rounded-xl border border-gray-100 p-3 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <strong className="truncate text-gray-700 dark:text-gray-200">{label}</strong>
        <span className="shrink-0 text-gray-500">
          واقعی: <b>{formatter(actual)}</b> · برآورد: <b>{formatter(estimated)}</b>
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
          <div className="h-full rounded-full bg-slate-300 dark:bg-slate-600" style={{ width: `${(estimated / maxValue) * 100}%` }} />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
          <div className="h-full rounded-full bg-[rgb(var(--brand-600-rgb))]" style={{ width: `${(actual / maxValue) * 100}%` }} />
        </div>
      </div>
    </div>
  );
};

const CampaignDashboardCharts: React.FC<CampaignDashboardChartsProps> = ({
  summary,
  tools,
  currencyLabel = '',
  timeline = [],
}) => {
  const toolComparisons = useMemo(() => tools.map((tool) => ({
    id: tool.id,
    label: getCampaignToolLabel(tool.tool_type),
    estimated: Number(tool.estimated_cost || 0),
    actual: Number(tool.actual_cost || 0),
  })).filter((item) => item.estimated > 0 || item.actual > 0), [tools]);

  const funnelItems = [
    { label: 'لید', value: Number(summary.actualLeads || 0), color: 'blue' },
    { label: 'مشتری', value: Number(summary.actualCustomers || 0), color: 'purple' },
    { label: 'فاکتور', value: Number(summary.invoiceCount || 0), color: 'green' },
  ];
  const funnelMax = Math.max(1, ...funnelItems.map((item) => item.value));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card title="مقایسه هزینه برآوردی و واقعی ابزارها" className="!rounded-2xl dark:!border-white/10 dark:!bg-white/5">
        {toolComparisons.length > 0 ? (
          <div className="max-h-[25rem] space-y-2 overflow-y-auto pl-1">
            {toolComparisons.map((item) => (
              <ComparisonRow
                key={item.id}
                label={item.label}
                estimated={item.estimated}
                actual={item.actual}
                formatter={(value) => `${formatPersianPrice(value)} ${currencyLabel}`.trim()}
              />
            ))}
          </div>
        ) : <Empty description="هنوز هزینه‌ای برای مقایسه ثبت نشده است" />}
      </Card>

      <Card title="قیف نتیجه کمپین" className="!rounded-2xl dark:!border-white/10 dark:!bg-white/5">
        <div className="space-y-5">
          {funnelItems.map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex justify-between text-sm text-gray-600 dark:text-gray-300">
                <span>{item.label}</span>
                <strong>{toPersianNumber(item.value)}</strong>
              </div>
              <Progress
                percent={Math.round((item.value / funnelMax) * 100)}
                showInfo={false}
                strokeColor={item.color === 'green' ? '#16a34a' : item.color === 'purple' ? '#7c3aed' : '#2563eb'}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card title="روند زمانی نتایج" className="!rounded-2xl dark:!border-white/10 dark:!bg-white/5 xl:col-span-2">
        <SimpleLineChart items={timeline} valueFormatter={(value) => toPersianNumber(value)} />
      </Card>
    </div>
  );
};

export default CampaignDashboardCharts;

