import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Table, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { safeJalaliFormat } from '../../utils/persianNumberFormatter';

type DeliveryRow = {
  id: string;
  display_name?: string | null;
  contact_value?: string | null;
  source_module_id?: string | null;
  status?: string | null;
  attempt_count?: number | null;
  error_message?: string | null;
  last_attempt_at?: string | null;
  created_at?: string | null;
};

type DispatchRow = {
  id: string;
  status?: string | null;
  recipient_count?: number | null;
  success_count?: number | null;
  failure_count?: number | null;
  skipped_count?: number | null;
  last_error?: string | null;
  message_snapshot?: Record<string, any> | null;
  created_at?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  queued: 'در صف',
  processing: 'در حال ارسال',
  sent: 'ارسال‌شده',
  succeeded: 'موفق',
  partial: 'نیمه‌موفق',
  failed: 'ناموفق',
  skipped: 'ردشده',
  suppressed: 'مسدودشده',
  paused: 'متوقف',
  canceled: 'لغوشده',
};
const SOURCE_LABELS: Record<string, string> = {
  marketing_leads: 'لید',
  customers: 'مشتری',
  invoices: 'فاکتور',
  counterparty_bot_groups: 'گروه بات',
};
const statusColor = (value: string) => (
  ['sent', 'succeeded'].includes(value) ? 'green'
    : value === 'failed' ? 'red'
      : ['processing', 'queued'].includes(value) ? 'blue'
        : value === 'partial' ? 'orange' : 'default'
);

const CampaignDeliveryReportPanel: React.FC<{ toolId: string }> = ({ toolId }) => {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [dispatches, setDispatches] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = (page - 1) * pageSize;
      const [recipientResult, dispatchResult] = await Promise.all([
        supabase
          .from('advertising_campaign_recipients')
          .select('id,display_name,contact_value,source_module_id,status,attempt_count,error_message,last_attempt_at,created_at', { count: 'exact' })
          .eq('tool_id', toolId)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1),
        supabase
          .from('advertising_campaign_dispatches')
          .select('id,status,recipient_count,success_count,failure_count,skipped_count,last_error,message_snapshot,created_at')
          .eq('tool_id', toolId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      if (recipientResult.error) throw recipientResult.error;
      if (dispatchResult.error) throw dispatchResult.error;
      setRows(recipientResult.data || []);
      setTotal(recipientResult.count || 0);
      setDispatches(dispatchResult.data || []);
    } catch (cause: any) {
      setError(String(cause?.message || 'دریافت گزارش ارسال ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [page, toolId]);

  useEffect(() => {
    void load();
  }, [load]);

  const recipientColumns = useMemo(() => [
    {
      title: 'مخاطب',
      key: 'recipient',
      render: (_: unknown, row: DeliveryRow) => (
        <div>
          <strong>{row.display_name || 'بدون نام'}</strong>
          <div className="text-xs text-gray-500">{row.contact_value || '-'}</div>
        </div>
      ),
    },
    {
      title: 'منبع',
      dataIndex: 'source_module_id',
      width: 110,
      render: (value: string) => SOURCE_LABELS[value] || 'فایل/مستقیم',
    },
    {
      title: 'وضعیت',
      dataIndex: 'status',
      width: 120,
      render: (value: string) => <Tag color={statusColor(value)}>{STATUS_LABELS[value] || value}</Tag>,
    },
    { title: 'تلاش', dataIndex: 'attempt_count', width: 70 },
    {
      title: 'خطای دقیق',
      dataIndex: 'error_message',
      render: (value: string) => value ? <span className="text-red-600">{value}</span> : '-',
    },
    {
      title: 'آخرین تلاش',
      dataIndex: 'last_attempt_at',
      width: 170,
      render: (value: string) => safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '-',
    },
  ], []);

  const dispatchColumns = useMemo(() => [
    {
      title: 'نوع اجرا',
      dataIndex: 'message_snapshot',
      width: 110,
      render: (value: Record<string, any>) => value?.is_test ? <Tag color="purple">آزمایشی</Tag> : <Tag>اصلی</Tag>,
    },
    {
      title: 'وضعیت',
      dataIndex: 'status',
      width: 110,
      render: (value: string) => <Tag color={statusColor(value)}>{STATUS_LABELS[value] || value}</Tag>,
    },
    { title: 'گیرنده', dataIndex: 'recipient_count', width: 80 },
    { title: 'موفق', dataIndex: 'success_count', width: 70 },
    { title: 'ناموفق', dataIndex: 'failure_count', width: 70 },
    { title: 'حذف‌شده', dataIndex: 'skipped_count', width: 80 },
    {
      title: 'خطای اجرای صف',
      dataIndex: 'last_error',
      render: (value: string) => value ? <span className="text-red-600">{value}</span> : '-',
    },
    {
      title: 'زمان ایجاد',
      dataIndex: 'created_at',
      width: 170,
      render: (value: string) => safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '-',
    },
  ], []);

  return (
    <div className="space-y-4">
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <div className="flex justify-end">
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>به‌روزرسانی</Button>
      </div>

      <section className="space-y-2">
        <strong>اجراهای اخیر ارسال</strong>
        {!loading && !dispatches.length
          ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="هنوز اجرایی ثبت نشده است." />
          : <Table rowKey="id" size="small" loading={loading} columns={dispatchColumns} dataSource={dispatches} pagination={false} scroll={{ x: 950 }} />}
      </section>

      <section className="space-y-2">
        <strong>گزارش گیرندگان</strong>
        {!loading && !rows.length
          ? <Empty description="هنوز گزارشی برای گیرندگان این ابزار ثبت نشده است." />
          : (
            <Table
              rowKey="id"
              loading={loading}
              columns={recipientColumns}
              dataSource={rows}
              scroll={{ x: 900 }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: false,
                showTotal: (count) => `${count.toLocaleString('fa-IR')} گیرنده`,
                onChange: setPage,
              }}
            />
          )}
      </section>
    </div>
  );
};

export default CampaignDeliveryReportPanel;
