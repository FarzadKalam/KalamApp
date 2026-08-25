import React from 'react';
import { Card, Progress, Tooltip } from 'antd';
import {
  DollarOutlined,
  FileTextOutlined,
  FunnelPlotOutlined,
  RiseOutlined,
  ShoppingOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { formatPersianPrice, toPersianNumber } from '../../utils/persianNumberFormatter';
import type { CampaignDashboardSummary } from './types';

type CampaignKpiGridProps = {
  summary: CampaignDashboardSummary;
  currencyLabel?: string;
};

const ratio = (actual: number, expected: number) => (
  expected > 0 ? Math.max(0, Math.min(100, Math.round((actual / expected) * 100))) : 0
);

const KpiCard: React.FC<{
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  hint?: string;
  progress?: number;
}> = ({ title, value, icon, hint, progress }) => (
  <Card size="small" className="h-full !rounded-2xl !border-gray-200 dark:!border-white/10 dark:!bg-white/5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{title}</div>
        <div className="mt-2 truncate text-lg font-black text-gray-800 dark:text-gray-100">{value}</div>
      </div>
      <Tooltip title={hint || title}>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--brand-50-rgb),0.9)] text-lg text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-500-rgb),0.15)] dark:text-[rgb(var(--brand-200-rgb))]">
          {icon}
        </span>
      </Tooltip>
    </div>
    {typeof progress === 'number' ? (
      <Progress percent={progress} size="small" showInfo={false} className="!mt-3" />
    ) : null}
  </Card>
);

const CampaignKpiGrid: React.FC<CampaignKpiGridProps> = ({ summary, currencyLabel = '' }) => {
  const estimatedCost = Number(summary.estimatedCost || 0);
  const actualCost = Number(summary.actualCost || 0);
  const expectedLeads = Number(summary.expectedLeads || 0);
  const actualLeads = Number(summary.actualLeads || 0);
  const expectedCustomers = Number(summary.expectedCustomers || 0);
  const actualCustomers = Number(summary.actualCustomers || 0);
  const attributedRevenue = Number(summary.attributedRevenue || 0);
  const costPerLead = actualLeads > 0 ? actualCost / actualLeads : 0;
  const costPerCustomer = actualCustomers > 0 ? actualCost / actualCustomers : 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="هزینه برآوردی / واقعی"
        value={`${formatPersianPrice(actualCost)} / ${formatPersianPrice(estimatedCost)} ${currencyLabel}`.trim()}
        icon={<DollarOutlined />}
        progress={ratio(actualCost, estimatedCost)}
      />
      <KpiCard
        title="لید واقعی / مورد انتظار"
        value={`${toPersianNumber(actualLeads)} / ${toPersianNumber(expectedLeads)}`}
        icon={<FunnelPlotOutlined />}
        progress={ratio(actualLeads, expectedLeads)}
      />
      <KpiCard
        title="مشتری واقعی / مورد انتظار"
        value={`${toPersianNumber(actualCustomers)} / ${toPersianNumber(expectedCustomers)}`}
        icon={<UserAddOutlined />}
        progress={ratio(actualCustomers, expectedCustomers)}
      />
      <KpiCard
        title="فاکتور و درآمد منتسب"
        value={`${toPersianNumber(summary.invoiceCount || 0)} · ${formatPersianPrice(attributedRevenue)} ${currencyLabel}`.trim()}
        icon={<ShoppingOutlined />}
      />
      <KpiCard
        title="هزینه واقعی هر لید"
        value={actualLeads > 0 ? `${formatPersianPrice(costPerLead)} ${currencyLabel}`.trim() : 'هنوز محاسبه نشده'}
        icon={<RiseOutlined />}
      />
      <KpiCard
        title="هزینه واقعی هر مشتری"
        value={actualCustomers > 0 ? `${formatPersianPrice(costPerCustomer)} ${currencyLabel}`.trim() : 'هنوز محاسبه نشده'}
        icon={<RiseOutlined />}
      />
      <KpiCard
        title="ارسال / تحویل / ناموفق"
        value={`${toPersianNumber(summary.sentCount || 0)} / ${toPersianNumber(summary.deliveredCount || 0)} / ${toPersianNumber(summary.failedCount || 0)}`}
        icon={<FileTextOutlined />}
      />
      <KpiCard
        title="پاسخ / عدم تمایل"
        value={`${toPersianNumber(summary.repliedCount || 0)} / ${toPersianNumber(summary.unsubscribedCount || 0)}`}
        icon={<FileTextOutlined />}
      />
    </div>
  );
};

export default CampaignKpiGrid;
