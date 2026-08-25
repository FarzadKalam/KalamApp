import React, { useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Skeleton, Table, Tag } from 'antd';
import { LeftOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { getRecordTitle } from '../../utils/recordTitle';
import { getFinancialStatusLabelFa } from '../../utils/financialValueLabels';
import type { CampaignAttributionRecord, CampaignToolReport } from './dashboardTypes';
import { loadCampaignToolReport } from './campaignDashboardService';

type ReportSection = 'leads' | 'customers' | 'invoices';

type CampaignToolReportPanelProps = {
  toolId: string;
  currencyLabel?: string;
  pageSize?: number;
  loader?: typeof loadCampaignToolReport;
};

const SECTION_META: Record<ReportSection, { label: string; moduleId: string }> = {
  leads: { label: 'لیدها', moduleId: 'marketing_leads' },
  customers: { label: 'مشتریان', moduleId: 'customers' },
  invoices: { label: 'فاکتورهای فروش', moduleId: 'invoices' },
};

const safeRecordTitle = (record: CampaignAttributionRecord, moduleId: string) => {
  const moduleConfig = MODULES[moduleId];
  if (moduleConfig) {
    const configuredTitle = getRecordTitle(record as any, moduleConfig, { fallback: '' });
    if (configuredTitle) return configuredTitle;
  }
  return getRecordTitle(record as any, undefined, { fallback: 'رکورد مرتبط' });
};

const safeStatusLabel = (value: unknown, moduleId: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const statusField = MODULES[moduleId]?.fields?.find((field) => field.key === 'status');
  const configuredLabel = statusField?.options?.find((option) => String(option.value) === raw)?.label;
  return configuredLabel || getFinancialStatusLabelFa(raw);
};

const CampaignToolReportPanel: React.FC<CampaignToolReportPanelProps> = ({
  toolId,
  currencyLabel = '',
  pageSize = 25,
  loader = loadCampaignToolReport,
}) => {
  const [section, setSection] = useState<ReportSection>('leads');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<CampaignToolReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = React.useCallback(async (targetPage = page) => {
    setLoading(true);
    setError('');
    try {
      const next = await loader(toolId, { limit: pageSize, offset: (targetPage - 1) * pageSize });
      setReport(next);
    } catch {
      setError('دریافت گزارش ابزار با خطا روبه‌رو شد. دوباره تلاش کنید.');
    } finally {
      setLoading(false);
    }
  }, [loader, page, pageSize, toolId]);

  React.useEffect(() => {
    void load(1);
  }, [toolId]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = report?.[section] || [];
  const total = report?.totals?.[section] || 0;
  const moduleId = SECTION_META[section].moduleId;
  const columns = useMemo(() => [
    {
      title: 'رکورد',
      key: 'title',
      render: (_: unknown, record: CampaignAttributionRecord) => (
        <span className="font-bold text-gray-700 dark:text-gray-200">{safeRecordTitle(record, moduleId)}</span>
      ),
    },
    {
      title: 'وضعیت',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (value: unknown) => value ? <Tag>{safeStatusLabel(value, moduleId)}</Tag> : '-',
    },
    {
      title: 'زمان ثبت',
      key: 'created_at',
      width: 180,
      render: (_: unknown, record: CampaignAttributionRecord) => safeJalaliFormat(record.attributed_at || record.created_at, 'YYYY/MM/DD HH:mm') || '-',
    },
    ...(section === 'invoices' ? [{
      title: 'مبلغ فاکتور',
      key: 'amount',
      width: 170,
      render: (_: unknown, record: CampaignAttributionRecord) => `${formatPersianPrice(record.total_invoice_amount ?? record.amount ?? 0)} ${currencyLabel}`.trim(),
    }] : []),
  ], [currencyLabel, moduleId, section]);

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    void load(nextPage);
  };

  const changeSection = (nextSection: ReportSection) => {
    setSection(nextSection);
    if (page !== 1) {
      setPage(1);
      void load(1);
    }
  };

  if (loading && !report) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <div className="space-y-4">
      {error ? <Alert type="error" showIcon message={error} action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>تلاش دوباره</Button>} /> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card size="small" className="!rounded-xl"><div className="text-xs text-gray-500">لیدها</div><strong>{toPersianNumber(report?.totals.leads || 0)}</strong></Card>
        <Card size="small" className="!rounded-xl"><div className="text-xs text-gray-500">مشتریان</div><strong>{toPersianNumber(report?.totals.customers || 0)}</strong></Card>
        <Card size="small" className="!rounded-xl"><div className="text-xs text-gray-500">فاکتورها</div><strong>{toPersianNumber(report?.totals.invoices || 0)}</strong></Card>
        <Card size="small" className="!rounded-xl"><div className="text-xs text-gray-500">درآمد منتسب</div><strong>{formatPersianPrice(report?.summary.attributedRevenue || 0)} {currencyLabel}</strong></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(SECTION_META) as ReportSection[]).map((key) => (
          <Button key={key} type={section === key ? 'primary' : 'default'} onClick={() => changeSection(key)}>
            {SECTION_META[key].label} ({toPersianNumber(report?.totals[key] || 0)})
          </Button>
        ))}
      </div>

      {rows.length === 0 && !loading ? <Empty description="رکورد مرتبطی در این صفحه وجود ندارد" /> : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <Table
              rowKey={(record) => String(record.id || `${safeRecordTitle(record, moduleId)}:${record.created_at || ''}`)}
              columns={columns}
              dataSource={rows}
              loading={loading}
              pagination={false}
              scroll={{ x: 680 }}
              locale={{ emptyText: 'رکوردی یافت نشد' }}
            />
          </div>
          <div className="space-y-2 md:hidden">
            {rows.map((record, index) => (
              <Card key={String(record.id || index)} size="small" className="!rounded-xl">
                <div className="font-bold">{safeRecordTitle(record, moduleId)}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                  {record.status ? <Tag>{safeStatusLabel(record.status, moduleId)}</Tag> : null}
                  <span>{safeJalaliFormat(record.attributed_at || record.created_at, 'YYYY/MM/DD HH:mm') || '-'}</span>
                  {section === 'invoices' ? <span>{formatPersianPrice(record.total_invoice_amount ?? record.amount ?? 0)} {currencyLabel}</span> : null}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-white/10">
        <Button icon={<RightOutlined />} disabled={page <= 1 || loading} onClick={() => changePage(page - 1)}>صفحه قبل</Button>
        <span className="text-xs text-gray-500">صفحه {toPersianNumber(page)} · مجموع {toPersianNumber(total)}</span>
        <Button icon={<LeftOutlined />} disabled={page * pageSize >= total || loading} onClick={() => changePage(page + 1)}>صفحه بعد</Button>
      </div>
    </div>
  );
};

export default CampaignToolReportPanel;
