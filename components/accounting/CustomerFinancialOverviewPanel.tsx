import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PrinterOutlined, ShareAltOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import RelatedRecordPopover from '../RelatedRecordPopover';
import { ACCOUNTING_PERMISSION_KEY, fetchCurrentUserRolePermissions } from '../../utils/permissions';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { useCurrencyConfig } from '../../utils/currency';
import { createChoiceFilter, createDateRangeFilter, createNumberRangeFilter, createTextFilter } from './tableColumnFilters';

type CustomerFinancialOverviewPanelProps = {
  customerId: string;
  customerData?: Record<string, any> | null;
};

type TimelineRow = {
  key: string;
  rowType: 'invoice' | 'receipt' | 'payment' | 'barter';
  sourceLabel: string;
  paymentType: string;
  status: string;
  chequeStatus: string;
  date: string | null;
  debit: number;
  credit: number;
  balance: number;
  invoiceLabel: string;
  bankLabel: string;
  description: string;
  createdAt: string | null;
  invoiceRelation?: { moduleId: string; recordId: string } | null;
  bankRelation?: { moduleId: string; recordId: string } | null;
};

const FINAL_SALES_INVOICE_STATUSES = new Set(['confirmed', 'final', 'settled', 'completed']);
const FINAL_PAYMENT_STATUSES = new Set(['', 'received', 'paid', 'cleared']);
const FAILED_CHEQUE_STATUSES = new Set(['bounced', 'returned']);

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  cash: 'نقد',
  card: 'کارت',
  transfer: 'انتقال',
  cheque: 'چک',
  online: 'آنلاین',
  barter: 'تهاتر',
};

const STATUS_LABEL: Record<string, string> = {
  created: 'ایجاد شده',
  proforma: 'پیش فاکتور',
  confirmed: 'تایید شده',
  pending: 'در انتظار',
  received: 'انجام شده',
  returned: 'برگشت',
  canceled: 'لغو',
  new: 'جدید',
  in_bank: 'در بانک',
  cleared: 'وصول شده',
  bounced: 'برگشتی',
  open: 'باز',
  partial: 'مصرف‌شده جزئی',
  closed: 'بسته',
  draft: 'پیش نویس',
  final: 'نهایی',
  paid: 'تسویه',
  settled: 'تسویه شده',
  completed: 'تکمیل شده',
};

const statusColor = (status?: string) =>
  ['received', 'cleared', 'final', 'paid', 'closed'].includes(String(status))
    ? 'success'
    : ['returned', 'bounced', 'canceled'].includes(String(status))
      ? 'error'
      : 'processing';

const rowTag = (type: TimelineRow['rowType']) => {
  if (type === 'invoice') return { color: 'blue', label: 'فاکتور' };
  if (type === 'barter') return { color: 'purple', label: 'تهاتر' };
  if (type === 'payment') return { color: 'red', label: 'پرداخت' };
  return { color: 'green', label: 'دریافت' };
};

const CustomerFinancialOverviewPanel: React.FC<CustomerFinancialOverviewPanelProps> = ({ customerId, customerData }) => {
  const { message } = App.useApp();
  const { label: currencyLabel } = useCurrencyConfig();
  const [loading, setLoading] = useState(true);
  const [canView, setCanView] = useState(true);
  const [rows, setRows] = useState<TimelineRow[]>([]);

  const copyShareLink = useCallback(async () => {
    const shareUrl = typeof window !== 'undefined' ? `${window.location.href}#customer-financial-overview` : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'وضعیت مالی مشتری', url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      message.success('لینک بخش وضعیت مالی کپی شد.');
    } catch {
      message.error('اشتراک گذاری این بخش ناموفق بود.');
    }
  }, [message]);

  const loadData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const permissions = await fetchCurrentUserRolePermissions(supabase);
      const accountingPerms = permissions?.[ACCOUNTING_PERMISSION_KEY] || {};
      const canViewCustomer = permissions?.customers?.view !== false;
      const canViewOperational =
        permissions?.invoices?.view !== false ||
        permissions?.cash_bank_operations?.view !== false ||
        permissions?.barters?.view !== false;
      const allowView =
        canViewCustomer &&
        accountingPerms.view !== false &&
        canViewOperational;
      setCanView(allowView);
      if (!allowView) {
        setRows([]);
        return;
      }

      const [banksRes, cashRes, pettyRes, invoicesRes, opsRes, bartersRes] = await Promise.all([
        supabase.from('bank_accounts').select('id, bank_name, account_number').eq('is_active', true).limit(1000),
        supabase.from('cash_boxes').select('id, name, code').eq('is_active', true).limit(1000),
        supabase.from('petty_funds').select('id, name, code').eq('is_active', true).limit(1000),
        permissions?.invoices?.view !== false
          ? supabase
              .from('invoices')
              .select('id, name, system_code, invoice_date, status, total_invoice_amount, total_received_amount, remaining_balance, payments, created_at')
              .eq('customer_id', customerId)
              .limit(3000)
          : Promise.resolve({ data: [], error: null } as any),
        permissions?.cash_bank_operations?.view !== false
          ? supabase
              .from('cash_bank_operations')
              .select('*')
              .eq('customer_id', customerId)
              .limit(3000)
          : Promise.resolve({ data: [], error: null } as any),
        permissions?.barters?.view !== false
          ? supabase
              .from('barters')
              .select('id, name, system_code, status, barter_type, barter_date, initial_amount, remaining_amount, source_invoice_id, notes, created_at')
              .eq('customer_id', customerId)
              .limit(3000)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const error = banksRes.error || cashRes.error || pettyRes.error || invoicesRes.error || opsRes.error || bartersRes.error;
      if (error) throw error;

      const nextFinancialAccountLabels = Object.fromEntries(
        [
          ...((banksRes.data || []) as any[]).map((bank) => [
            String(bank.id),
            {
              label: `${String(bank.bank_name || 'بانک')} ${bank.account_number ? `(${toPersianNumber(bank.account_number)})` : ''}`.trim(),
              moduleId: 'bank_accounts',
            },
          ]),
          ...((cashRes.data || []) as any[]).map((cashBox) => [
            String(cashBox.id),
            {
              label: `${String(cashBox.name || 'صندوق')} ${cashBox.code ? `(${toPersianNumber(cashBox.code)})` : ''}`.trim(),
              moduleId: 'cash_boxes',
            },
          ]),
          ...((pettyRes.data || []) as any[]).map((fund) => [
            String(fund.id),
            {
              label: `${String(fund.name || 'تنخواه')} ${fund.code ? `(${toPersianNumber(fund.code)})` : ''}`.trim(),
              moduleId: 'petty_funds',
            },
          ]),
        ]
      );
      const visibleInvoices = ((invoicesRes.data || []) as any[]).filter((invoice) =>
        FINAL_SALES_INVOICE_STATUSES.has(String(invoice?.status || '').trim().toLowerCase())
      );
      const invoiceRows = visibleInvoices.map((invoice) => ({
        key: `invoice_${invoice.id}`,
        rowType: 'invoice' as const,
        sourceLabel: 'صدور فاکتور فروش',
        paymentType: '',
        status: String(invoice?.status || ''),
        chequeStatus: '',
        date: invoice?.invoice_date || null,
        debit: Number(invoice?.total_invoice_amount || 0),
        credit: 0,
        balance: 0,
        invoiceLabel: String(invoice?.name || invoice?.system_code || invoice?.id || '-'),
        bankLabel: '-',
        description: `فاکتور فروش${invoice?.remaining_balance ? ` | مانده: ${formatPersianPrice(Number(invoice.remaining_balance || 0))}` : ''}`,
        createdAt: invoice?.created_at || null,
        invoiceRelation: invoice?.id ? { moduleId: 'invoices', recordId: String(invoice.id) } : null,
        bankRelation: null,
      }));

      const paymentRows = visibleInvoices.flatMap((invoice) =>
        (Array.isArray(invoice?.payments) ? invoice.payments : [])
          .filter((payment: any) => {
            const paymentStatus = String(payment?.status || '').trim().toLowerCase();
            const chequeStatus = String(payment?.cheque_status || '').trim().toLowerCase();
            const paymentType = String(payment?.payment_type || '').trim().toLowerCase();
            if (!FINAL_PAYMENT_STATUSES.has(paymentStatus)) return false;
            if (paymentType === 'cheque' && FAILED_CHEQUE_STATUSES.has(chequeStatus)) return false;
            return Number(payment?.amount || 0) > 0;
          })
          .map((payment: any, index: number) => {
            const account = nextFinancialAccountLabels[String(payment?.target_account || '')];
            return ({
              key: `payment_${invoice.id}_${index}`,
              rowType: 'receipt' as const,
              sourceLabel: `دریافت فاکتور فروش${PAYMENT_TYPE_LABEL[String(payment?.payment_type || '')] ? ` (${PAYMENT_TYPE_LABEL[String(payment?.payment_type || '')]})` : ''}`,
              paymentType: String(payment?.payment_type || ''),
              status: String(payment?.status || ''),
              chequeStatus: String(payment?.cheque_status || ''),
              date: payment?.date || invoice?.invoice_date || null,
              debit: 0,
              credit: Number(payment?.amount || 0),
              balance: 0,
              invoiceLabel: String(invoice?.name || invoice?.system_code || invoice?.id || '-'),
              bankLabel: account?.label || String(payment?.target_account || '-'),
              description: String(payment?.description || ''),
              createdAt: invoice?.created_at || null,
              invoiceRelation: invoice?.id ? { moduleId: 'invoices', recordId: String(invoice.id) } : null,
              bankRelation: payment?.target_account ? { moduleId: account?.moduleId || 'bank_accounts', recordId: String(payment.target_account) } : null,
            });
          })
      );

      const directOperationRows = ((opsRes.data || []) as any[])
        .filter((op) => !op?.sales_invoice_id && !op?.purchase_invoice_id)
        .filter((op) => {
          const status = String(op?.status || '').trim().toLowerCase();
          const paymentType = String(op?.payment_type || '').trim().toLowerCase();
          const chequeStatus = String(op?.cheque_status || '').trim().toLowerCase();
          if (!FINAL_PAYMENT_STATUSES.has(status)) return false;
          if (paymentType === 'cheque' && FAILED_CHEQUE_STATUSES.has(chequeStatus)) return false;
          return Number(op?.amount || 0) > 0;
        })
        .map((op) => {
          const accountId = String(op?.bank_account_id || op?.cash_box_id || op?.petty_fund_id || '').trim();
          const account = nextFinancialAccountLabels[accountId];
          return ({
            key: `op_${op.id}`,
            rowType: String(op?.operation_type || '') === 'payment' ? ('payment' as const) : ('receipt' as const),
            sourceLabel: 'ثبت مستقیم نقد و بانک',
            paymentType: String(op?.payment_type || ''),
            status: String(op?.status || ''),
            chequeStatus: String(op?.cheque_status || ''),
            date: op?.operation_date || null,
            debit: String(op?.operation_type || '') === 'payment' ? 0 : Number(op?.amount || 0),
            credit: String(op?.operation_type || '') === 'payment' ? Number(op?.amount || 0) : 0,
            balance: 0,
            invoiceLabel: '-',
            bankLabel: account?.label || '-',
            description: String(op?.description || ''),
            createdAt: op?.created_at || null,
            invoiceRelation: null,
            bankRelation: accountId ? { moduleId: account?.moduleId || (op?.cash_box_id ? 'cash_boxes' : op?.petty_fund_id ? 'petty_funds' : 'bank_accounts'), recordId: accountId } : null,
          });
        });

      const barterRows = ((bartersRes.data || []) as any[]).map((barter) => ({
        key: `barter_${barter.id}`,
        rowType: 'barter' as const,
        sourceLabel: 'تهاتر مشتری',
        paymentType: 'barter',
        status: String(barter?.status || ''),
        chequeStatus: '',
        date: barter?.barter_date || null,
        debit: 0,
        credit: Number(barter?.initial_amount || barter?.remaining_amount || 0),
        balance: 0,
        invoiceLabel: String(barter?.name || barter?.system_code || barter?.source_invoice_id || '-'),
        bankLabel: '-',
        description: String(barter?.notes || ''),
        createdAt: barter?.created_at || null,
        invoiceRelation: barter?.source_invoice_id ? { moduleId: 'invoices', recordId: String(barter.source_invoice_id) } : null,
        bankRelation: null,
      }));

      const merged = [...invoiceRows, ...paymentRows, ...directOperationRows, ...barterRows].sort((a, b) => {
        const aDate = new Date(a.date || a.createdAt || 0).getTime();
        const bDate = new Date(b.date || b.createdAt || 0).getTime();
        return aDate - bDate;
      });

      let runningBalance = 0;
      const nextRows = merged.map((row) => {
        runningBalance += Number(row.debit || 0) - Number(row.credit || 0);
        return { ...row, balance: runningBalance };
      });
      setRows(nextRows);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت وضعیت مالی مشتری'));
    } finally {
      setLoading(false);
    }
  }, [customerId, message]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalDebit = useMemo(() => rows.reduce((sum, row) => sum + Number(row.debit || 0), 0), [rows]);
  const totalCredit = useMemo(() => rows.reduce((sum, row) => sum + Number(row.credit || 0), 0), [rows]);
  const finalBalance = totalDebit - totalCredit;
  const rowTypeFilters = useMemo(
    () => [
      { label: 'فاکتور', value: 'invoice' },
      { label: 'دریافت', value: 'receipt' },
      { label: 'پرداخت', value: 'payment' },
      { label: 'تهاتر', value: 'barter' },
    ],
    []
  );
  const statusFilters = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => String(row.status || '').trim()).filter(Boolean))).map((value) => ({
        label: STATUS_LABEL[value] || value,
        value,
      })),
    [rows]
  );
  const paymentTypeFilters = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => String(row.paymentType || '').trim()).filter(Boolean))).map((value) => ({
        label: PAYMENT_TYPE_LABEL[value] || value,
        value,
      })),
    [rows]
  );

  const columns: ColumnsType<TimelineRow> = useMemo(
    () => [
      {
        title: 'نوع',
        dataIndex: 'rowType',
        key: 'rowType',
        width: 110,
        ...createChoiceFilter('نوع', rowTypeFilters, (record) => record.rowType),
        render: (value: TimelineRow['rowType']) => {
          const tag = rowTag(value);
          return <Tag color={tag.color}>{tag.label}</Tag>;
        },
      },
      {
        title: 'منبع',
        dataIndex: 'sourceLabel',
        key: 'sourceLabel',
        width: 170,
        ...createTextFilter('جستجو در منبع', (record) => record.sourceLabel),
      },
      {
        title: 'روش',
        dataIndex: 'paymentType',
        key: 'paymentType',
        width: 130,
        ...createChoiceFilter('روش', paymentTypeFilters, (record) => record.paymentType),
        render: (value: string) => PAYMENT_TYPE_LABEL[value] || value || '-',
      },
      {
        title: 'وضعیت',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        ...createChoiceFilter('وضعیت', statusFilters, (record) => record.status),
        render: (value: string) => <Tag color={statusColor(value)}>{STATUS_LABEL[value] || value || '-'}</Tag>,
      },
      {
        title: 'تاریخ',
        dataIndex: 'date',
        key: 'date',
        width: 120,
        ...createDateRangeFilter('تاریخ', (record) => record.date),
        render: (value: string | null) => (value ? toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD')) : '-'),
      },
      {
        title: `بدهکار (${currencyLabel})`,
        dataIndex: 'debit',
        key: 'debit',
        align: 'right',
        width: 160,
        ...createNumberRangeFilter('بدهکار', (record) => record.debit),
        render: (value: number) => <span className="persian-number">{formatPersianPrice(value || 0)}</span>,
      },
      {
        title: `بستانکار (${currencyLabel})`,
        dataIndex: 'credit',
        key: 'credit',
        align: 'right',
        width: 160,
        ...createNumberRangeFilter('بستانکار', (record) => record.credit),
        render: (value: number) => <span className="persian-number">{formatPersianPrice(value || 0)}</span>,
      },
      {
        title: 'مانده',
        dataIndex: 'balance',
        key: 'balance',
        align: 'right',
        width: 170,
        ...createNumberRangeFilter('مانده', (record) => Math.abs(record.balance)),
        render: (value: number) => {
          const side = value >= 0 ? 'بدهکار' : 'بستانکار';
          return (
            <div className="flex items-center justify-end gap-2">
              <span className="persian-number">{formatPersianPrice(Math.abs(value || 0))}</span>
              <Tag className="!m-0">{side}</Tag>
            </div>
          );
        },
      },
      {
        title: 'فاکتور',
        dataIndex: 'invoiceLabel',
        key: 'invoiceLabel',
        width: 180,
        ...createTextFilter('جستجو در فاکتور', (record) => record.invoiceLabel),
        render: (_: string, record) => {
          if (!record.invoiceRelation?.moduleId || !record.invoiceRelation?.recordId) return record.invoiceLabel || '-';
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <RelatedRecordPopover
                moduleId={record.invoiceRelation.moduleId}
                recordId={record.invoiceRelation.recordId}
                label={record.invoiceLabel || '-'}
              />
            </div>
          );
        },
      },
      {
        title: 'بانک / صندوق',
        dataIndex: 'bankLabel',
        key: 'bankLabel',
        width: 180,
        ...createTextFilter('جستجو در بانک', (record) => record.bankLabel),
        render: (_: string, record) => {
          if (!record.bankRelation?.moduleId || !record.bankRelation?.recordId) return record.bankLabel || '-';
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <RelatedRecordPopover
                moduleId={record.bankRelation.moduleId}
                recordId={record.bankRelation.recordId}
                label={record.bankLabel || '-'}
              />
            </div>
          );
        },
      },
      {
        title: 'توضیحات',
        dataIndex: 'description',
        key: 'description',
        width: 240,
        ...createTextFilter('جستجو در توضیحات', (record) => record.description || ''),
        render: (value: string) => value || '-',
      },
    ],
    [currencyLabel, paymentTypeFilters, rowTypeFilters, statusFilters]
  );

  if (!customerId) return null;

  return (
    <div id="customer-financial-overview" className="mt-6">
      <Card
        title="وضعیت مالی"
        extra={
          <div className="flex flex-wrap gap-2">
            <Button size="small" icon={<PrinterOutlined />} onClick={() => window.print()}>
              چاپ
            </Button>
            <Button size="small" icon={<ShareAltOutlined />} onClick={copyShareLink}>
              اشتراک گذاری
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <Tag className="!m-0 px-3 py-1">جمع خرید/فروش: <span className="persian-number">{formatPersianPrice(Number(customerData?.total_spend || 0))}</span></Tag>
          <Tag className="!m-0 px-3 py-1">جمع پرداختی: <span className="persian-number">{formatPersianPrice(Number(customerData?.total_paid_amount || 0))}</span></Tag>
          <Tag color={finalBalance >= 0 ? 'blue' : 'green'} className="!m-0 px-3 py-1">
            مانده عملیاتی: <span className="persian-number">{formatPersianPrice(Math.abs(finalBalance || 0))}</span> {finalBalance >= 0 ? 'بدهکار' : 'بستانکار'}
          </Tag>
        </div>

        <div className="mb-3 text-xs text-gray-500">
          این بخش بر اساس عملیات مالی ثبت‌شده در سیستم نمایش داده می‌شود و ممکن است هنوز به سند حسابداری تبدیل نشده باشد.
        </div>

        {!canView ? (
          <Empty description="دسترسی مشاهده وضعیت مالی مشتری را ندارید" />
        ) : (
          <Table<TimelineRow>
            className="custom-erp-table"
            rowKey="key"
            loading={loading}
            dataSource={rows}
            columns={columns}
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1450 }}
            locale={{ emptyText: 'گردش عملیاتی برای این مشتری یافت نشد' }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <span className="font-bold text-gray-800 dark:text-gray-100">جمع کل</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totalDebit)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totalCredit)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(Math.abs(finalBalance))}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} />
                  <Table.Summary.Cell index={8} />
                  <Table.Summary.Cell index={9} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default CustomerFinancialOverviewPanel;
