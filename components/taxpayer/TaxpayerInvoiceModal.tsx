import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { TAXPAYER_SETTLEMENT_METHOD_OPTIONS } from '../../utils/taxpayerSystem';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type TaxpayerSubmission = {
  id: string;
  taxid?: string | null;
  uid?: string | null;
  reference_number?: string | null;
  status?: string | null;
  error_message?: string | null;
  sent_at?: string | null;
  last_inquiry_at?: string | null;
  created_at?: string | null;
};

type Props = {
  open: boolean;
  invoiceId: string;
  invoiceRecord: any;
  onClose: () => void;
  onRefresh?: () => void | Promise<void>;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'پیش نویس', color: 'default' },
  sending: { label: 'در حال ارسال', color: 'processing' },
  sent: { label: 'ارسال شده', color: 'blue' },
  accepted: { label: 'پذیرفته شده', color: 'green' },
  success: { label: 'موفق', color: 'green' },
  failed: { label: 'ناموفق', color: 'red' },
  rejected: { label: 'رد شده', color: 'red' },
  inquired: { label: 'استعلام شده', color: 'purple' },
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
};

const TaxpayerInvoiceModal: React.FC<Props> = ({ open, invoiceId, invoiceRecord, onClose, onRefresh }) => {
  const { message } = App.useApp();
  const [history, setHistory] = useState<TaxpayerSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [inquiringId, setInquiringId] = useState<string | null>(null);
  const [settlementMethod, setSettlementMethod] = useState<string>('');
  const invoiceStatus = String(invoiceRecord?.status || '').trim();
  const canSendInvoice = ['confirmed', 'final', 'settled', 'completed'].includes(invoiceStatus);

  useEffect(() => {
    if (!open) return;
    setSettlementMethod(String(invoiceRecord?.taxpayer_settlement_method || ''));
  }, [invoiceRecord?.taxpayer_settlement_method, open]);

  const fetchHistory = useCallback(async () => {
    if (!invoiceId || !open) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('taxpayer_invoice_submissions')
        .select('id,taxid,uid,reference_number,status,error_message,sent_at,last_inquiry_at,created_at')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setHistory((data || []) as TaxpayerSubmission[]);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت تاریخچه ارسال سامانه مودیان'));
    } finally {
      setLoading(false);
    }
  }, [invoiceId, message, open]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const handleSend = async () => {
    if (!canSendInvoice) {
      message.warning('ارسال فقط برای فاکتور تاییدشده یا نهایی فعال است.');
      return;
    }
    if (!settlementMethod) {
      message.warning('روش تسویه را انتخاب کنید.');
      return;
    }
    setSending(true);
    try {
      if (String(invoiceRecord?.taxpayer_settlement_method || '') !== settlementMethod) {
        const { error: updateError } = await supabase
          .from('invoices')
          .update({ taxpayer_settlement_method: settlementMethod })
          .eq('id', invoiceId);
        if (updateError) throw updateError;
      }
      const { data, error } = await supabase.functions.invoke('taxpayer_system', {
        body: { action: 'send_invoice', invoice_id: invoiceId, settlement_method: settlementMethod },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'ارسال به سامانه مودیان ناموفق بود.'));
      message.success(data.message || 'فاکتور برای سامانه مودیان ارسال شد.');
      await fetchHistory();
      await onRefresh?.();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در ارسال به سامانه مودیان'));
      await fetchHistory();
    } finally {
      setSending(false);
    }
  };

  const handleInquiry = async (submissionId: string) => {
    setInquiringId(submissionId);
    try {
      const { data, error } = await supabase.functions.invoke('taxpayer_system', {
        body: { action: 'inquire_submission', submission_id: submissionId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'استعلام وضعیت ناموفق بود.'));
      message.success(data.message || 'استعلام وضعیت انجام شد.');
      await fetchHistory();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در استعلام وضعیت سامانه مودیان'));
    } finally {
      setInquiringId(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: 'وضعیت',
        dataIndex: 'status',
        key: 'status',
        render: (value: string) => {
          const meta = STATUS_LABELS[String(value || '')] || { label: value || '-', color: 'default' };
          return <Tag color={meta.color}>{meta.label}</Tag>;
        },
      },
      { title: 'شماره مالیاتی', dataIndex: 'taxid', key: 'taxid', render: (value: string) => value || '-' },
      { title: 'UID', dataIndex: 'uid', key: 'uid', render: (value: string) => value || '-' },
      { title: 'رسید', dataIndex: 'reference_number', key: 'reference_number', render: (value: string) => value || '-' },
      { title: 'ارسال', dataIndex: 'sent_at', key: 'sent_at', render: formatDateTime },
      { title: 'استعلام', dataIndex: 'last_inquiry_at', key: 'last_inquiry_at', render: formatDateTime },
      {
        title: 'عملیات',
        key: 'actions',
        render: (_: unknown, record: TaxpayerSubmission) => (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            disabled={!record.uid}
            loading={inquiringId === record.id}
            onClick={() => void handleInquiry(record.id)}
          >
            استعلام وضعیت
          </Button>
        ),
      },
    ],
    [inquiringId]
  );

  return (
    <Modal
      title="ارسال به سامانه مودیان"
      open={open}
      onCancel={onClose}
      footer={null}
      width={980}
      destroyOnHidden
    >
      <Space direction="vertical" className="w-full" size="middle">
        <Alert
          type="info"
          showIcon
          message="ارسال مستقیم توسط خود مودی"
          description="فاز اول فقط فاکتور فروش عادی را ارسال می‌کند. نوع صورتحساب پیش‌فرض نوع اول است و روش تسویه باید برای همین فاکتور مشخص شود."
        />
        {!canSendInvoice ? (
          <Alert
            type="warning"
            showIcon
            message="ارسال برای وضعیت فعلی فعال نیست."
            description="ابتدا وضعیت فاکتور را به تاییدشده، فاکتور نهایی، تسویه‌شده یا تکمیل‌شده تغییر دهید."
          />
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3 items-end">
          <div>
            <Typography.Text className="block mb-1">روش تسویه</Typography.Text>
            <Select
              className="w-full"
              value={settlementMethod || undefined}
              placeholder="انتخاب روش تسویه"
              options={TAXPAYER_SETTLEMENT_METHOD_OPTIONS}
              onChange={setSettlementMethod}
            />
          </div>
          <Space wrap>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchHistory()}>
              بروزرسانی تاریخچه
            </Button>
            <Button type="primary" icon={<SendOutlined />} loading={sending} disabled={!canSendInvoice} onClick={handleSend}>
              ارسال فاکتور
            </Button>
          </Space>
        </div>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns as any}
          dataSource={history}
          pagination={{ pageSize: 5 }}
          expandable={{
            expandedRowRender: (record) => (
              <Typography.Paragraph className="!mb-0 whitespace-pre-wrap text-xs">
                {record.error_message || 'خطایی ثبت نشده است.'}
              </Typography.Paragraph>
            ),
            rowExpandable: (record) => !!record.error_message,
          }}
        />
      </Space>
    </Modal>
  );
};

export default TaxpayerInvoiceModal;
