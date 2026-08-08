import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Grid, Row, Spin, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SortOrder } from 'antd/es/table/interface';
import { ApartmentOutlined, BankOutlined, CreditCardOutlined, PlusOutlined, WalletOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import RelatedRecordPopover from '../components/RelatedRecordPopover';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { getFinancialPaymentTypeLabelFa, getFinancialStatusLabelFa } from '../utils/financialValueLabels';
import { useCurrencyConfig } from '../utils/currency';
import { createChoiceFilter, createDateRangeFilter, createNumberRangeFilter, createTextFilter } from '../components/accounting/tableColumnFilters';
import { ACCOUNTING_PERMISSION_KEY, fetchCurrentUserRoleContext } from '../utils/permissions';

const { Title, Text } = Typography;

type RowKind = 'sales_payment' | 'purchase_payment' | 'cash_bank_operation' | 'cheque' | 'barter' | 'bank_account_opening' | 'cash_box_opening' | 'petty_fund_opening' | 'customer_opening' | 'supplier_opening' | 'employee_opening';
type LedgerSortField = 'row_type' | 'source_label' | 'payment_type' | 'status' | 'date' | 'amount' | 'invoice_label' | 'person_label' | 'bank_label' | 'cheque_label' | 'description';

type RelatedRecord = { moduleId: string; recordId: string; label?: string };
type RowItem = {
  key: string;
  kind: RowKind;
  rowType: 'receipt' | 'payment' | 'transfer' | 'cheque' | 'barter' | 'opening';
  sourceLabel: string;
  sourceRecordId?: string;
  paymentType: string;
  status: string;
  date: string | null;
  amount: number;
  invoiceLabel: string;
  personLabel: string;
  bankLabel: string;
  chequeLabel: string;
  description: string;
  createdAt: string | null;
  invoiceRelation?: RelatedRecord | null;
  personRelation?: RelatedRecord | null;
  bankRelation?: RelatedRecord | null;
  bankRelations?: RelatedRecord[];
  chequeRelation?: RelatedRecord | null;
};

const PAYMENT_TYPE_LABEL: Record<string, string> = { cash: 'نقد', bank: 'بانکی', card: 'کارت', pos: 'دستگاه کارت‌خوان', transfer: 'انتقال', cheque: 'چک', online: 'آنلاین', credit: 'اعتباری', barter: 'تهاتر' };
const STATUS_LABEL: Record<string, string> = { opening: 'اول دوره', pending: 'در انتظار', approved: 'تأیید شده', received: 'انجام شده', paid: 'پرداخت شده', settled: 'تسویه شده', completed: 'تکمیل شده', returned: 'برگشت', canceled: 'لغو', new: 'جدید', in_bank: 'در بانک', cleared: 'وصول شده', bounced: 'برگشتی', open: 'باز', partial: 'مصرف‌شده جزئی', closed: 'بسته' };
const SORT_FIELD_BY_COLUMN: Record<string, LedgerSortField> = { rowType: 'row_type', sourceLabel: 'source_label', paymentType: 'payment_type', status: 'status', date: 'date', amount: 'amount', invoiceLabel: 'invoice_label', personLabel: 'person_label', bankLabel: 'bank_label', chequeLabel: 'cheque_label', description: 'description' };
const PAYMENT_TYPE_OPTIONS = Object.entries(PAYMENT_TYPE_LABEL).map(([value, label]) => ({ value, label }));
const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));

const statusColor = (status?: string) => ['received', 'cleared'].includes(String(status)) ? 'success' : ['returned', 'bounced', 'canceled'].includes(String(status)) ? 'error' : 'processing';
const rowTag = (type: RowItem['rowType']) => type === 'opening' ? { color: 'gold', label: 'اول دوره' } : type === 'receipt' ? { color: 'green', label: 'دریافت' } : type === 'payment' ? { color: 'red', label: 'پرداخت' } : type === 'transfer' ? { color: 'blue', label: 'انتقال' } : type === 'barter' ? { color: 'purple', label: 'تهاتر' } : { color: 'blue', label: 'چک' };
const today = () => new Date().toISOString().slice(0, 10);

const readFirstFilter = (filters: Record<string, any>, key: string) => String(filters?.[key]?.[0] || '').trim();
const readArrayFilter = (filters: Record<string, any>, key: string) => {
  try {
    const value = JSON.parse(readFirstFilter(filters, key));
    return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
  } catch { return []; }
};
const readRangeFilter = (filters: Record<string, any>, key: string) => {
  try {
    const value = JSON.parse(readFirstFilter(filters, key));
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
};
const buildLedgerFilters = (filters: Record<string, any>) => {
  const date = readRangeFilter(filters, 'date');
  const amount = readRangeFilter(filters, 'amount');
  return {
    row_types: readArrayFilter(filters, 'rowType'),
    payment_types: readArrayFilter(filters, 'paymentType'),
    statuses: readArrayFilter(filters, 'status'),
    source_query: readFirstFilter(filters, 'sourceLabel'),
    date_from: date.from || '', date_to: date.to || '',
    amount_from: amount.from ?? '', amount_to: amount.to ?? '',
    invoice_query: readFirstFilter(filters, 'invoiceLabel'), person_query: readFirstFilter(filters, 'personLabel'),
    bank_query: readFirstFilter(filters, 'bankLabel'), cheque_query: readFirstFilter(filters, 'chequeLabel'),
    description_query: readFirstFilter(filters, 'description'),
  };
};

const toRelation = (moduleId: any, recordId: any, label?: any): RelatedRecord | null => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  return normalizedModuleId && normalizedRecordId ? { moduleId: normalizedModuleId, recordId: normalizedRecordId, label: String(label || '').trim() || undefined } : null;
};

const mapLedgerRow = (row: any): RowItem => ({
  key: String(row?.row_key || ''), kind: String(row?.kind || 'cash_bank_operation') as RowKind,
  rowType: String(row?.row_type || 'receipt') as RowItem['rowType'], sourceLabel: String(row?.source_label || '-'), sourceRecordId: String(row?.source_record_id || '') || undefined,
  paymentType: String(row?.payment_type || ''), status: String(row?.status || ''), date: row?.row_date || null, amount: Number(row?.amount || 0),
  invoiceLabel: String(row?.invoice_label || '-'), personLabel: String(row?.person_label || '-'), bankLabel: String(row?.bank_label || '-'), chequeLabel: String(row?.cheque_label || '-'), description: String(row?.description || ''), createdAt: row?.created_at || null,
  invoiceRelation: toRelation(row?.invoice_module_id, row?.invoice_record_id), personRelation: toRelation(row?.person_module_id, row?.person_record_id),
  bankRelation: toRelation(row?.bank_module_id, row?.bank_record_id),
  bankRelations: Array.isArray(row?.bank_relations) ? row.bank_relations.map((item: any) => toRelation(item?.moduleId, item?.recordId, item?.label)).filter(Boolean) as RelatedRecord[] : [],
  chequeRelation: toRelation('cheques', row?.cheque_record_id),
});

const CashBankPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { label: currencyLabel } = useCurrencyConfig();
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [accessResolved, setAccessResolved] = useState(false);
  const [canViewPage, setCanViewPage] = useState(true);
  const [rows, setRows] = useState<RowItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(isMobile ? 10 : 20);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [sort, setSort] = useState<{ field: LedgerSortField; order: 'asc' | 'desc' }>({ field: 'date', order: 'desc' });
  const [stats, setStats] = useState({ bankAccounts: 0, cashBoxes: 0, pettyFunds: 0, openCheques: 0, chequesAmount: 0, openBarters: 0, bartersAmount: 0 });

  useEffect(() => { setPageSize(isMobile ? 10 : 20); setPage(1); }, [isMobile]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const context = await fetchCurrentUserRoleContext(supabase);
      const accountingPerms = context.permissions?.[ACCOUNTING_PERMISSION_KEY] || {};
      const allowed = accountingPerms.view !== false && accountingPerms.fields?.cash_bank_page !== false;
      setCanViewPage(allowed);
      if (!allowed) { setRows([]); setTotal(0); return; }
      const { data, error } = await supabase.rpc('get_cash_bank_dashboard_stats');
      if (error) throw error;
      setStats({
        bankAccounts: Number(data?.bankAccounts || 0), cashBoxes: Number(data?.cashBoxes || 0), pettyFunds: Number(data?.pettyFunds || 0),
        openCheques: Number(data?.openCheques || 0), chequesAmount: Number(data?.chequesAmount || 0), openBarters: Number(data?.openBarters || 0), bartersAmount: Number(data?.bartersAmount || 0),
      });
    } catch (error) { message.error(toFaErrorMessage(error as any, 'خطا در دریافت اطلاعات نقد و بانک')); }
    finally { setAccessResolved(true); setLoading(false); }
  }, [message]);

  const loadLedger = useCallback(async () => {
    if (!accessResolved || !canViewPage) return;
    setTableLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_cash_bank_unified_ledger_page', {
        p_page: page, p_page_size: pageSize, p_sort_field: sort.field, p_sort_order: sort.order, p_filters: buildLedgerFilters(filters),
      });
      if (error) throw error;
      setRows(Array.isArray(data?.rows) ? data.rows.map(mapLedgerRow) : []);
      setTotal(Number(data?.total || 0));
    } catch (error) { message.error(toFaErrorMessage(error as any, 'خطا در دریافت عملیات نقد و بانک')); setRows([]); setTotal(0); }
    finally { setTableLoading(false); }
  }, [accessResolved, canViewPage, filters, message, page, pageSize, sort]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => { void loadLedger(); }, [loadLedger]);

  const goCreateOperation = useCallback((operationType: 'receipt' | 'payment' | 'transfer') => navigate('/cash_bank_operations/create', { state: { initialValues: { operation_type: operationType, payment_type: operationType === 'transfer' ? 'transfer' : 'cash', status: 'received', operation_date: today(), amount: 0 } } }), [navigate]);
  const openRow = useCallback((row: RowItem) => { const target = row.kind === 'cheque' ? 'cheques' : row.kind === 'sales_payment' ? 'invoices' : row.kind === 'purchase_payment' ? 'purchase_invoices' : row.kind === 'barter' ? 'barters' : row.kind === 'bank_account_opening' ? 'bank_accounts' : row.kind === 'cash_box_opening' ? 'cash_boxes' : row.kind === 'petty_fund_opening' ? 'petty_funds' : row.kind === 'customer_opening' ? 'customers' : row.kind === 'supplier_opening' ? 'suppliers' : row.kind === 'employee_opening' ? 'employees' : 'cash_bank_operations'; navigate(row.sourceRecordId ? `/${target}/${row.sourceRecordId}` : '/cash_bank_operations'); }, [navigate]);

  const columnControl = useCallback((key: string) => ({
    filteredValue: filters[key] ?? null, sorter: true, sortOrder: (SORT_FIELD_BY_COLUMN[key] === sort.field ? (sort.order === 'asc' ? 'ascend' : 'descend') : null) as SortOrder,
    sortDirections: ['ascend', 'descend', null] as Array<'ascend' | 'descend' | null>, showSorterTooltip: false,
  }), [filters, sort]);

  const columns: ColumnsType<RowItem> = useMemo(() => [
    { title: 'نوع', dataIndex: 'rowType', key: 'rowType', width: 95, ...columnControl('rowType'), ...createChoiceFilter('نوع', [{ label: 'اول دوره', value: 'opening' }, { label: 'دریافت', value: 'receipt' }, { label: 'پرداخت', value: 'payment' }, { label: 'انتقال', value: 'transfer' }, { label: 'چک', value: 'cheque' }, { label: 'تهاتر', value: 'barter' }], (record) => record.rowType), render: (value: RowItem['rowType']) => { const tag = rowTag(value); return <Tag color={tag.color}>{tag.label}</Tag>; } },
    { title: 'منبع', dataIndex: 'sourceLabel', key: 'sourceLabel', width: 180, ...columnControl('sourceLabel'), ...createTextFilter('جستجو در منبع', (record) => record.sourceLabel) },
    { title: 'روش', dataIndex: 'paymentType', key: 'paymentType', width: 130, ...columnControl('paymentType'), ...createChoiceFilter('روش', PAYMENT_TYPE_OPTIONS, (record) => record.paymentType), render: (value: string) => PAYMENT_TYPE_LABEL[value] || getFinancialPaymentTypeLabelFa(value) },
    { title: 'وضعیت', dataIndex: 'status', key: 'status', width: 130, ...columnControl('status'), ...createChoiceFilter('وضعیت', STATUS_OPTIONS, (record) => record.status), render: (value: string) => <Tag color={statusColor(value)}>{STATUS_LABEL[value] || getFinancialStatusLabelFa(value)}</Tag> },
    { title: 'تاریخ', dataIndex: 'date', key: 'date', width: 130, ...columnControl('date'), ...createDateRangeFilter('تاریخ', (record) => record.date), render: (value: string | null) => value ? toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD')) : '-' },
    { title: `مبلغ (${currencyLabel})`, dataIndex: 'amount', key: 'amount', width: 170, ...columnControl('amount'), ...createNumberRangeFilter('مبلغ', (record) => record.amount), render: (value: number) => <span className="persian-number">{formatPersianPrice(value)}</span> },
    { title: 'فاکتور مرتبط', dataIndex: 'invoiceLabel', key: 'invoiceLabel', width: 190, ...columnControl('invoiceLabel'), ...createTextFilter('جستجو در فاکتور', (record) => record.invoiceLabel), render: (_: string, record: RowItem) => record.invoiceRelation ? <div onClick={(event) => event.stopPropagation()}><RelatedRecordPopover moduleId={record.invoiceRelation.moduleId} recordId={record.invoiceRelation.recordId} label={record.invoiceLabel || '-'} /></div> : record.invoiceLabel || '-' },
    { title: 'شخص مرتبط', dataIndex: 'personLabel', key: 'personLabel', width: 190, ...columnControl('personLabel'), ...createTextFilter('جستجو در شخص', (record) => record.personLabel), render: (_: string, record: RowItem) => record.personRelation ? <div onClick={(event) => event.stopPropagation()}><RelatedRecordPopover moduleId={record.personRelation.moduleId} recordId={record.personRelation.recordId} label={record.personLabel || '-'} /></div> : record.personLabel || '-' },
    { title: 'حساب بانکی', dataIndex: 'bankLabel', key: 'bankLabel', width: 190, ...columnControl('bankLabel'), ...createTextFilter('جستجو در حساب بانکی', (record) => record.bankLabel), render: (_: string, record: RowItem) => record.bankRelations?.length === 2 ? <div onClick={(event) => event.stopPropagation()} className="flex flex-wrap items-center gap-1"><RelatedRecordPopover moduleId={record.bankRelations[0].moduleId} recordId={record.bankRelations[0].recordId} label={record.bankRelations[0].label || '-'} /><span className="text-gray-400">←</span><RelatedRecordPopover moduleId={record.bankRelations[1].moduleId} recordId={record.bankRelations[1].recordId} label={record.bankRelations[1].label || '-'} /></div> : record.bankRelation ? <div onClick={(event) => event.stopPropagation()}><RelatedRecordPopover moduleId={record.bankRelation.moduleId} recordId={record.bankRelation.recordId} label={record.bankLabel || '-'} /></div> : record.bankLabel || '-' },
    { title: 'چک', dataIndex: 'chequeLabel', key: 'chequeLabel', width: 220, ...columnControl('chequeLabel'), ...createTextFilter('جستجو در چک', (record) => record.chequeLabel), render: (_: string, record: RowItem) => record.chequeRelation ? <div onClick={(event) => event.stopPropagation()}><RelatedRecordPopover moduleId="cheques" recordId={record.chequeRelation.recordId} label={record.chequeLabel || '-'} /></div> : record.chequeLabel || '-' },
    { title: 'توضیحات', dataIndex: 'description', key: 'description', width: 240, ...columnControl('description'), ...createTextFilter('جستجو در توضیحات', (record) => record.description || ''), render: (value: string) => value || '-' },
  ], [columnControl, currencyLabel]);

  const handleTableChange = useCallback((pagination: any, nextFilters: Record<string, any>, sorter: any, extra: any) => {
    if (extra?.action === 'filter') { setFilters(nextFilters || {}); setPage(1); return; }
    if (extra?.action === 'sort') {
      const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter;
      const field = SORT_FIELD_BY_COLUMN[String(activeSorter?.field || activeSorter?.columnKey || '')] || 'date';
      setSort({ field, order: activeSorter?.order === 'ascend' ? 'asc' : 'desc' }); setPage(1); return;
    }
    if (extra?.action === 'paginate') { setPage(Number(pagination?.current || 1)); setPageSize(Number(pagination?.pageSize || 20)); }
  }, []);

  if (loading) return <div className="flex h-[70vh] items-center justify-center"><Spin size="large" /></div>;
  if (!canViewPage) return <div className="flex h-[70vh] items-center justify-center"><Card className="max-w-md text-center">دسترسی به بخش نقد و بانک ندارید</Card></div>;

  return <div className="mx-auto max-w-[1700px] animate-fadeIn p-4 md:p-8"><div className="min-h-[70vh] rounded-[2rem] border border-gray-200 bg-white p-4 shadow-sm transition-colors dark:border-gray-800 dark:bg-[#1a1a1a] md:p-6">
    <div className="mb-6"><Title level={3} className="!mb-1">نقد و بانک</Title><Text className="text-gray-500">نمای یکپارچه دریافت‌ها، پرداخت‌ها و چک‌ها</Text></div>
    <Row gutter={[12, 12]} className="mb-6">
      <Col xs={12} lg={4}><Card><Statistic title="حساب‌های بانکی فعال" value={toPersianNumber(stats.bankAccounts)} prefix={<BankOutlined />} /></Card></Col>
      <Col xs={12} lg={4}><Card><Statistic title="صندوق‌ها" value={toPersianNumber(stats.cashBoxes)} prefix={<WalletOutlined />} /></Card></Col>
      <Col xs={12} lg={4}><Card><Statistic title="تنخواه‌ها" value={toPersianNumber(stats.pettyFunds)} prefix={<WalletOutlined />} /></Card></Col>
      <Col xs={12} lg={4}><Card><Statistic title="چک‌های باز" value={toPersianNumber(stats.openCheques)} prefix={<CreditCardOutlined />} /></Card></Col>
      <Col xs={12} lg={4}><Card><Statistic title="مبلغ چک‌های باز" value={formatPersianPrice(stats.chequesAmount)} suffix={currencyLabel} /></Card></Col>
      <Col xs={12} lg={4}><Card><Statistic title="تهاترهای باز" value={toPersianNumber(stats.openBarters)} prefix={<ApartmentOutlined />} /></Card></Col>
      <Col xs={12} lg={4}><Card><Statistic title="مانده تهاترهای باز" value={formatPersianPrice(stats.bartersAmount)} suffix={currencyLabel} /></Card></Col>
    </Row>
    <Card title="عملیات"><Row gutter={[8, 8]} className="mb-3">
      <Col xs={24} md={6}><Button type="primary" block icon={<PlusOutlined />} onClick={() => goCreateOperation('receipt')}>ثبت دریافت جدید</Button></Col>
      <Col xs={24} md={6}><Button block icon={<PlusOutlined />} onClick={() => goCreateOperation('payment')}>ثبت پرداخت جدید</Button></Col>
      <Col xs={24} md={6}><Button block icon={<PlusOutlined />} onClick={() => goCreateOperation('transfer')}>ثبت انتقال جدید</Button></Col>
      <Col xs={24} md={6}><Button block icon={<PlusOutlined />} onClick={() => navigate('/cheques/create')}>ثبت چک جدید</Button></Col>
      <Col xs={24} md={6}><Button block icon={<PlusOutlined />} onClick={() => navigate('/barters/create')}>افزودن تهاتر جدید</Button></Col>
    </Row>
      <Table<RowItem> className="custom-erp-table" loading={tableLoading} dataSource={rows} columns={columns} rowKey="key" size={isMobile ? 'small' : 'middle'} pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: (count) => `${toPersianNumber(count)} رکورد` }} scroll={{ x: isMobile ? 1450 : 1800 }} onChange={handleTableChange} onRow={(record) => ({ onClick: () => openRow(record), style: { cursor: 'pointer' } })} />
    </Card>
  </div></div>;
};

export default CashBankPage;
