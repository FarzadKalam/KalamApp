import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Modal, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import SmartFieldRenderer from '../SmartFieldRenderer';
import {
  TAXPAYER_INVOICE_SUBJECT_OPTIONS,
  TAXPAYER_INVOICE_TYPE_OPTIONS,
  TAXPAYER_SETTLEMENT_METHOD_OPTIONS,
} from '../../utils/taxpayerSystem';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { FieldNature, FieldType, ModuleField } from '../../types';
import { getTaxpayerInvoicePatternForModule, getTaxpayerInvoiceSubjectForModule, isReturnInvoiceModuleId } from '../../utils/invoiceModuleRouting';

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
  request_payload?: any;
  response_payload?: any;
  inquiry_payload?: any;
  integration_mode?: string | null;
};

type Props = {
  open: boolean;
  moduleId: 'invoices' | 'sales_return_invoices';
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

const getStatusMeta = (value?: string | null) => {
  const key = String(value || '').trim().toLowerCase();
  return STATUS_LABELS[key] || { label: value || '-', color: 'default' };
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
};

const getSubmissionDebug = (record: TaxpayerSubmission) => {
  const requestDebug = record?.request_payload?._kalam_debug || {};
  const responseDebug = record?.response_payload?._kalam_debug || {};
  return {
    stage: String(responseDebug?.stage || requestDebug?.stage || '').trim(),
  };
};

const collectTaxpayerMessages = (items: any, prefix = '') => {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((item: any) => `${item?.code ? `[${item.code}] ` : ''}${prefix}${String(item?.message || item?.errorDetail || item?.errorMessage || '').trim()}`.trim())
    .filter(Boolean);
};

const getSubmissionErrorMessage = (record: TaxpayerSubmission) => {
  const row = Array.isArray(record?.inquiry_payload?.result?.data)
    ? record.inquiry_payload.result.data[0]
    : Array.isArray(record?.inquiry_payload?.data)
      ? record.inquiry_payload.data[0]
      : null;
  const data = row?.data || {};
  const inquiryMessages = [
    ...collectTaxpayerMessages(data.error),
    ...collectTaxpayerMessages(data.errors),
    ...collectTaxpayerMessages(data.warning, 'هشدار: '),
    ...collectTaxpayerMessages(data.warnings, 'هشدار: '),
  ];
  return record.error_message || inquiryMessages.join(' | ') || '';
};

const TAXPAYER_FIELDS: ModuleField[] = [
  {
    key: 'taxpayer_invoice_type',
    labels: { fa: 'نوع صورتحساب', en: 'Taxpayer Invoice Type' },
    type: FieldType.SELECT,
    nature: FieldNature.STANDARD,
    options: TAXPAYER_INVOICE_TYPE_OPTIONS,
  },
  {
    key: 'taxpayer_invoice_subject',
    labels: { fa: 'موضوع صورتحساب', en: 'Taxpayer Invoice Subject' },
    type: FieldType.SELECT,
    nature: FieldNature.STANDARD,
    options: TAXPAYER_INVOICE_SUBJECT_OPTIONS,
  },
  {
    key: 'taxpayer_settlement_method',
    labels: { fa: 'روش تسویه', en: 'Taxpayer Settlement Method' },
    type: FieldType.SELECT,
    nature: FieldNature.STANDARD,
    options: TAXPAYER_SETTLEMENT_METHOD_OPTIONS,
  },
];

const getInitialTaxpayerValues = (moduleId: Props['moduleId'], invoiceRecord: any) => ({
  taxpayer_invoice_type: String(invoiceRecord?.taxpayer_invoice_type || '1'),
  taxpayer_invoice_pattern: getTaxpayerInvoicePatternForModule(moduleId, invoiceRecord?.taxpayer_invoice_pattern),
  taxpayer_invoice_subject: getTaxpayerInvoiceSubjectForModule(moduleId, invoiceRecord?.taxpayer_invoice_subject),
  taxpayer_settlement_method: String(invoiceRecord?.taxpayer_settlement_method || ''),
});

const isReferenceSubject = (value: string) => ['2', '3', '4'].includes(String(value || '').trim());

const resolveInvokeErrorMessage = async (error: any, fallback: string) => {
  const context = error?.context;
  if (context) {
    try {
      const payload = typeof context.json === 'function'
        ? await context.json()
        : typeof context.text === 'function'
          ? await context.text()
          : null;
      if (typeof payload === 'string' && payload.trim()) return toFaErrorMessage(payload.trim(), fallback);
      if (payload && typeof payload === 'object') {
        const direct = String(payload.message || payload.error || '').trim();
        if (direct) return toFaErrorMessage(direct, fallback);
      }
    } catch {
      // Ignore context parse errors and fall back to the generic formatter below.
    }
  }
  const raw = typeof error?.message === 'string' ? error.message.trim() : '';
  return raw || toFaErrorMessage(error, fallback);
};

const TaxpayerInvoiceModal: React.FC<Props> = ({ open, moduleId, invoiceId, invoiceRecord, onClose, onRefresh }) => {
  const { message } = App.useApp();
  const [history, setHistory] = useState<TaxpayerSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [inquiringId, setInquiringId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>(() => getInitialTaxpayerValues(moduleId, invoiceRecord));
  const [lastError, setLastError] = useState<string>('');
  const invoiceStatus = String(invoiceRecord?.status || '').trim();
  const canSendInvoice = ['confirmed', 'final', 'settled', 'completed'].includes(invoiceStatus);
  const settlementMethod = String(formValues.taxpayer_settlement_method || '').trim();
  const isReturnInvoiceModule = isReturnInvoiceModuleId(moduleId);
  const selectedSubject = getTaxpayerInvoiceSubjectForModule(moduleId, formValues.taxpayer_invoice_subject);
  const needsReferenceInvoice = isReferenceSubject(selectedSubject);
  const hasPriorTaxpayerSubmission = history.some((item) => {
    const taxid = String(item?.taxid || '').trim();
    const status = String(item?.status || '').trim().toLowerCase();
    return !!taxid && !['failed', 'rejected', 'sending'].includes(status);
  });
  const hasReferenceInvoice = isReturnInvoiceModule
    ? !!String(invoiceRecord?.source_invoice_id || '').trim()
    : hasPriorTaxpayerSubmission;
  const overlayZIndexBase = 1400;
  const popupContainer = useCallback((triggerNode?: HTMLElement | null) => {
    const modalBodyHost = triggerNode?.closest?.('.ant-modal-body, .ant-modal-content, .ant-modal') as HTMLElement | null;
    return modalBodyHost || resolveOverlayPopupContainer(triggerNode);
  }, []);
  const renderEditableField = useCallback((field: ModuleField) => {
    const isLockedReturnSubject = isReturnInvoiceModule && field.key === 'taxpayer_invoice_subject';
    const fieldOptions = field.key === 'taxpayer_invoice_subject'
      ? (isReturnInvoiceModule
        ? TAXPAYER_INVOICE_SUBJECT_OPTIONS.filter((option) => option.value === '4')
        : TAXPAYER_INVOICE_SUBJECT_OPTIONS.filter((option) => option.value !== '4'))
      : field.options;
    const effectiveField = fieldOptions === field.options && !isLockedReturnSubject
      ? field
      : { ...field, options: fieldOptions, readonly: isLockedReturnSubject || field.readonly };
    return (
    <div key={field.key} className="space-y-1">
      <Typography.Text className="block">{field.labels.fa}</Typography.Text>
      <SmartFieldRenderer
        field={effectiveField}
        value={formValues[field.key]}
        onChange={(value) => {
          setFormValues((prev) => ({
            ...prev,
            [field.key]: String(value || ''),
          }));
        }}
        forceEditMode
        compactMode
        options={fieldOptions}
        moduleId={moduleId}
        allValues={formValues}
        overlayZIndexBase={overlayZIndexBase}
        popupContainer={popupContainer}
        preferLocalPopupContainer
      />
    </div>
    );
  }, [formValues, isReturnInvoiceModule, moduleId, popupContainer]);

  useEffect(() => {
    if (!open) return;
    setFormValues(getInitialTaxpayerValues(moduleId, invoiceRecord));
    setLastError('');
  }, [invoiceId, invoiceRecord, moduleId, open]);

  const fetchHistory = useCallback(async () => {
    if (!invoiceId || !open) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('taxpayer_invoice_submissions')
        .select('id,taxid,uid,reference_number,status,error_message,sent_at,last_inquiry_at,created_at,request_payload,response_payload,inquiry_payload,integration_mode')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setHistory((data || []) as TaxpayerSubmission[]);
    } catch (err: any) {
      const errorMessage = await resolveInvokeErrorMessage(err, 'خطا در دریافت تاریخچه ارسال سامانه مودیان');
      setLastError(errorMessage);
      message.error(errorMessage);
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
      setLastError('');
      const nextInvoiceType = String(formValues.taxpayer_invoice_type || '1');
      const nextInvoicePattern = getTaxpayerInvoicePatternForModule(moduleId, formValues.taxpayer_invoice_pattern);
      const nextInvoiceSubject = getTaxpayerInvoiceSubjectForModule(moduleId, formValues.taxpayer_invoice_subject);
      const nextSettlementMethod = String(settlementMethod || '').trim();
      if (isReferenceSubject(nextInvoiceSubject) && !hasReferenceInvoice) {
        const referenceMessage = isReturnInvoiceModule
          ? 'برای برگشت از فروش، انتخاب فاکتور فروش اصلی الزامی است.'
          : 'برای ارسال اصلاحی یا ابطالی، ابتدا باید همین فاکتور یک ارسال موفق یا دارای شماره مالیاتی داشته باشد.';
        message.warning(referenceMessage);
        return;
      }
      const updatePayload: Record<string, string> = {};
      if (String(invoiceRecord?.taxpayer_invoice_type || '1') !== nextInvoiceType) {
        updatePayload.taxpayer_invoice_type = nextInvoiceType;
      }
      if (String(invoiceRecord?.taxpayer_invoice_pattern || '1') !== nextInvoicePattern) {
        updatePayload.taxpayer_invoice_pattern = nextInvoicePattern;
      }
      if (String(invoiceRecord?.taxpayer_invoice_subject || '1') !== nextInvoiceSubject) {
        updatePayload.taxpayer_invoice_subject = nextInvoiceSubject;
      }
      if (String(invoiceRecord?.taxpayer_settlement_method || '') !== nextSettlementMethod) {
        updatePayload.taxpayer_settlement_method = nextSettlementMethod;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await supabase
          .from('invoices')
          .update(updatePayload)
          .eq('id', invoiceId);
        if (updateError) throw updateError;
      }
      const { data, error } = await supabase.functions.invoke('taxpayer_system', {
        body: { action: 'send_invoice', invoice_id: invoiceId, settlement_method: nextSettlementMethod },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'ارسال به سامانه مودیان ناموفق بود.'));
      message.success(data.message || 'فاکتور با موفقیت به سامانه مودیان ارسال شد.');
      await fetchHistory();
      await onRefresh?.();
    } catch (err: any) {
      const errorMessage = await resolveInvokeErrorMessage(err, 'خطا در ارسال به سامانه مودیان');
      setLastError(errorMessage);
      message.error(errorMessage);
      await fetchHistory();
    } finally {
      setSending(false);
    }
  };

  const handleInquiry = async (submissionId: string) => {
    setInquiringId(submissionId);
    try {
      setLastError('');
      const { data, error } = await supabase.functions.invoke('taxpayer_system', {
        body: { action: 'inquire_submission', submission_id: submissionId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'استعلام وضعیت ناموفق بود.'));
      message.success(data.message || 'استعلام وضعیت سامانه مودیان با موفقیت انجام شد.');
      await fetchHistory();
    } catch (err: any) {
      const errorMessage = await resolveInvokeErrorMessage(err, 'خطا در استعلام وضعیت سامانه مودیان');
      setLastError(errorMessage);
      message.error(errorMessage);
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
          const meta = getStatusMeta(value);
          return <Tag color={meta.color}>{meta.label}</Tag>;
        },
      },
      { title: 'مرحله', key: 'debug_stage', render: (_: unknown, record: TaxpayerSubmission) => getSubmissionDebug(record).stage || '-' },
      { title: 'شماره مالیاتی', dataIndex: 'taxid', key: 'taxid', render: (value: string) => value || '-' },
      {
        title: 'مسیر',
        dataIndex: 'integration_mode',
        key: 'integration_mode',
        render: (value: string) => value === 'no_certificate_legacy' ? 'بدون گواهی' : value === 'certificate_v2' ? 'نسخه ۲' : '-',
      },
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
            disabled={!record.uid && !record.reference_number && !record.taxid}
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
          description="نوع، موضوع و روش تسویه صورتحساب را بر اساس وضعیت همین فاکتور انتخاب کنید. برای اصلاحی، ابطالی و برگشت از فروش، شماره مالیاتی صورتحساب مرجع به‌صورت خودکار از ارسال‌های قبلی یا فاکتور اصلی خوانده می‌شود."
        />
        {needsReferenceInvoice ? (
          <Alert
            type={hasReferenceInvoice ? 'success' : 'warning'}
            showIcon
            message={hasReferenceInvoice ? 'مرجع صورتحساب آماده است.' : 'مرجع صورتحساب پیدا نشد.'}
            description={
              isReturnInvoiceModule
                ? 'برای برگشت از فروش، فاکتور فروش اصلی باید در همین رکورد انتخاب شده باشد و قبلاً به سامانه مودیان ارسال شده باشد.'
                : 'برای اصلاحی یا ابطالی، همین فاکتور باید قبلاً به سامانه مودیان ارسال شده و شماره مالیاتی داشته باشد.'
            }
          />
        ) : null}
        {!canSendInvoice ? (
          <Alert
            type="warning"
            showIcon
            message="ارسال برای وضعیت فعلی فعال نیست."
            description="ابتدا وضعیت فاکتور را به تاییدشده، فاکتور نهایی، تسویه‌شده یا تکمیل‌شده تغییر دهید."
          />
        ) : null}
        {lastError ? (
          <Alert
            type="error"
            showIcon
            message="خطای آخر"
            description={lastError}
          />
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TAXPAYER_FIELDS.map(renderEditableField)}
        </div>
        <div className="flex flex-wrap gap-2">
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
            expandedRowRender: (record) => {
              const debug = getSubmissionDebug(record);
              const errorMessage = getSubmissionErrorMessage(record);
              return (
                <Space direction="vertical" size={4} className="w-full">
                  <Typography.Paragraph className="!mb-0 whitespace-pre-wrap text-xs">
                    {errorMessage || 'متن خطایی برای این ارسال ثبت نشده است.'}
                  </Typography.Paragraph>
                  {debug.stage ? <Typography.Text className="text-xs">مرحله: {debug.stage}</Typography.Text> : null}
                </Space>
              );
            },
            rowExpandable: (record) => !!getSubmissionErrorMessage(record) || !!getSubmissionDebug(record).stage,
          }}
        />
      </Space>
    </Modal>
  );
};

export default TaxpayerInvoiceModal;



