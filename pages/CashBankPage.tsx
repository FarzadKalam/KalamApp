import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Grid, Row, Spin, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ApartmentOutlined, BankOutlined, CreditCardOutlined, PlusOutlined, WalletOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import RelatedRecordPopover from '../components/RelatedRecordPopover';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { useCurrencyConfig } from '../utils/currency';
import { createChoiceFilter, createDateRangeFilter, createNumberRangeFilter, createTextFilter } from '../components/accounting/tableColumnFilters';
import { ACCOUNTING_PERMISSION_KEY, fetchCurrentUserRoleContext } from '../utils/permissions';

const { Title, Text } = Typography;

type RowKind = 'sales_payment' | 'purchase_payment' | 'cash_bank_operation' | 'cheque' | 'barter';

type RowItem = {
  key: string;
  kind: RowKind;
  rowType: 'receipt' | 'payment' | 'cheque' | 'barter';
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
  invoiceRelation?: { moduleId: string; recordId: string } | null;
  personRelation?: { moduleId: string; recordId: string } | null;
  bankRelation?: { moduleId: string; recordId: string } | null;
  chequeRelation?: { moduleId: string; recordId: string } | null;
};

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  cash: 'نقد',
  card: 'کارت',
  transfer: 'انتقال',
  cheque: 'چک',
  online: 'آنلاین',
  barter: 'تهاتر',
};

const STATUS_LABEL: Record<string, string> = {
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
};

const statusColor = (status?: string) =>
  ['received', 'cleared'].includes(String(status))
    ? 'success'
    : ['returned', 'bounced', 'canceled'].includes(String(status))
      ? 'error'
      : 'processing';

const rowTag = (type: RowItem['rowType']) => {
  if (type === 'receipt') return { color: 'green', label: 'دریافت' };
  if (type === 'payment') return { color: 'red', label: 'پرداخت' };
  if (type === 'barter') return { color: 'purple', label: 'تهاتر' };
  return { color: 'blue', label: 'چک' };
};

const today = () => new Date().toISOString().slice(0, 10);

const CashBankPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { label: currencyLabel } = useCurrencyConfig();

  const [loading, setLoading] = useState(true);
  const [canViewPage, setCanViewPage] = useState(true);
  const [rows, setRows] = useState<RowItem[]>([]);
  const [stats, setStats] = useState({ bankAccounts: 0, cashBoxes: 0, pettyFunds: 0, openCheques: 0, chequesAmount: 0, openBarters: 0, bartersAmount: 0 });
  const [banks, setBanks] = useState<any[]>([]);
  const [cashBoxes, setCashBoxes] = useState<any[]>([]);
  const [pettyFunds, setPettyFunds] = useState<any[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<any[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [cheques, setCheques] = useState<any[]>([]);
  const [barters, setBarters] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  const financialAccountById = useMemo(
    () =>
      Object.fromEntries(
        [
          ...(banks || []).map((b: any) => [
            String(b.id),
            {
              label: `${String(b.bank_name || 'بانک')} ${b.account_number ? `(${toPersianNumber(b.account_number)})` : ''}`.trim(),
              moduleId: 'bank_accounts',
            },
          ]),
          ...(cashBoxes || []).map((c: any) => [
            String(c.id),
            {
              label: `${String(c.name || 'صندوق')} ${c.code ? `(${toPersianNumber(c.code)})` : ''}`.trim(),
              moduleId: 'cash_boxes',
            },
          ]),
          ...(pettyFunds || []).map((fund: any) => [
            String(fund.id),
            {
              label: `${String(fund.name || 'تنخواه')} ${fund.code ? `(${toPersianNumber(fund.code)})` : ''}`.trim(),
              moduleId: 'petty_funds',
            },
          ]),
        ]
      ),
    [banks, cashBoxes, pettyFunds]
  );
  const customerLabelById = useMemo(
    () =>
      Object.fromEntries(
        (customers || []).map((c: any) => [
          String(c.id),
          `${String(c.first_name || '')} ${String(c.last_name || '')}`.trim() || String(c.business_name || '-'),
        ])
      ),
    [customers]
  );
  const supplierLabelById = useMemo(
    () => Object.fromEntries((suppliers || []).map((s: any) => [String(s.id), String(s.business_name || '-') ])),
    [suppliers]
  );
  const employeeLabelById = useMemo(
    () => Object.fromEntries((employees || []).map((e: any) => [String(e.id), String(e.full_name || '-') ])),
    [employees]
  );
  const chequeLabelById = useMemo(
    () =>
      Object.fromEntries(
        (cheques || []).map((c: any) => [
          String(c.id),
          `${String(c.serial_no || 'بدون شماره')} ${c.sayad_id ? `(${toPersianNumber(c.sayad_id)})` : ''}`.trim(),
        ])
      ),
    [cheques]
  );
  const salesById = useMemo(() => Object.fromEntries((salesInvoices || []).map((i: any) => [String(i.id), i])), [salesInvoices]);
  const purchaseById = useMemo(
    () => Object.fromEntries((purchaseInvoices || []).map((i: any) => [String(i.id), i])),
    [purchaseInvoices]
  );

  const resolvePartyLabel = useCallback(
    (type?: string, id?: string) => {
      if (!id) return '-';
      if (type === 'customer') return customerLabelById[id] || id;
      if (type === 'supplier') return supplierLabelById[id] || id;
      if (type === 'employee') return employeeLabelById[id] || id;
      return id;
    },
    [customerLabelById, employeeLabelById, supplierLabelById]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const context = await fetchCurrentUserRoleContext(supabase);
      const accountingPerms = context.permissions?.[ACCOUNTING_PERMISSION_KEY] || {};
      const canViewCashBankPage =
        accountingPerms.view !== false &&
        accountingPerms.fields?.cash_bank_page !== false;
      setCanViewPage(canViewCashBankPage);
      if (!canViewCashBankPage) {
        setRows([]);
        return;
      }

      const [
        banksRes,
        cashRes,
        pettyRes,
        chequesRes,
        salesRes,
        purchaseRes,
        opsRes,
        bartersRes,
        customersRes,
        suppliersRes,
        employeesRes,
      ] = await Promise.all([
        supabase.from('bank_accounts').select('id, bank_name, account_number').eq('is_active', true).limit(1000),
        supabase.from('cash_boxes').select('id, name, code').eq('is_active', true).limit(1000),
        supabase.from('petty_funds').select('id, name, code').eq('is_active', true).limit(1000),
        supabase
          .from('cheques')
          .select('id, cheque_type, status, amount, issue_date, due_date, party_type, party_id, serial_no, sayad_id, bank_account_id, notes, metadata, created_at')
          .limit(3000),
        supabase.from('invoices').select('id, name, system_code, invoice_date, customer_id, payments, created_at').limit(3000),
        supabase
          .from('purchase_invoices')
          .select('id, name, system_code, invoice_date, supplier_id, payments, created_at')
          .limit(3000),
        supabase.from('cash_bank_operations').select('*').limit(3000),
        supabase
          .from('barters')
          .select('id, name, system_code, status, barter_type, barter_date, initial_amount, remaining_amount, customer_id, supplier_id, employee_id, source_invoice_id, source_purchase_invoice_id, notes, created_at')
          .limit(3000),
        supabase.from('customers').select('id, first_name, last_name, business_name').limit(3000),
        supabase.from('suppliers').select('id, business_name').limit(3000),
        supabase.from('profiles').select('id, full_name').limit(3000),
      ]);

      const hasError =
        banksRes.error ||
        cashRes.error ||
        pettyRes.error ||
        chequesRes.error ||
        salesRes.error ||
        purchaseRes.error ||
        opsRes.error ||
        bartersRes.error ||
        customersRes.error ||
        suppliersRes.error ||
        employeesRes.error;
      if (hasError) throw new Error('خطا در واکشی اطلاعات');

      const chequeRows = chequesRes.data || [];
      setBanks(banksRes.data || []);
      setCashBoxes(cashRes.data || []);
      setPettyFunds(pettyRes.data || []);
      setCheques(chequeRows);
      setSalesInvoices(salesRes.data || []);
      setPurchaseInvoices(purchaseRes.data || []);
      setOperations(opsRes.data || []);
      setBarters(bartersRes.data || []);
      setCustomers(customersRes.data || []);
      setSuppliers(suppliersRes.data || []);
      setEmployees(employeesRes.data || []);

      const barterRows = bartersRes.data || [];
      const openBarterRows = barterRows.filter((b: any) => ['open', 'partial'].includes(String(b?.status || '')));

      setStats({
        bankAccounts: (banksRes.data || []).length,
        cashBoxes: (cashRes.data || []).length,
        pettyFunds: (pettyRes.data || []).length,
        openCheques: chequeRows.filter((c: any) => ['new', 'in_bank'].includes(String(c?.status || ''))).length,
        chequesAmount: chequeRows.reduce((sum: number, c: any) => sum + (Number(c?.amount) || 0), 0),
        openBarters: openBarterRows.length,
        bartersAmount: openBarterRows.reduce((sum: number, b: any) => sum + (Number(b?.remaining_amount) || 0), 0),
      });
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت اطلاعات'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const fromSales = (salesInvoices || []).flatMap((inv: any) =>
      (Array.isArray(inv?.payments) ? inv.payments : []).map(
        (p: any, idx: number): RowItem => {
          const account = financialAccountById[String(p?.target_account || '')];
          return ({
          key: `sales_${inv.id}_${idx}`,
          kind: 'sales_payment',
          rowType: 'receipt',
          sourceLabel: 'دریافت فاکتور فروش',
          sourceRecordId: String(inv.id),
          paymentType: String(p?.payment_type || ''),
          status: String(p?.status || ''),
          date: p?.date || inv?.invoice_date || null,
          amount: Number(p?.amount || 0),
          invoiceLabel: String(inv?.name || inv?.system_code || inv?.id || '-'),
          personLabel: resolvePartyLabel('customer', inv?.customer_id ? String(inv.customer_id) : undefined),
          bankLabel: account?.label || String(p?.target_account || '-'),
          chequeLabel: chequeLabelById[String(p?.cheque_id || '')] || '-',
          description: String(p?.description || ''),
          createdAt: inv?.created_at || null,
          invoiceRelation: inv?.id ? { moduleId: 'invoices', recordId: String(inv.id) } : null,
          personRelation: inv?.customer_id ? { moduleId: 'customers', recordId: String(inv.customer_id) } : null,
          bankRelation: p?.target_account ? { moduleId: account?.moduleId || 'bank_accounts', recordId: String(p.target_account) } : null,
          chequeRelation: p?.cheque_id ? { moduleId: 'cheques', recordId: String(p.cheque_id) } : null,
        });
        }
      )
    );

    const fromPurchase = (purchaseInvoices || []).flatMap((inv: any) =>
      (Array.isArray(inv?.payments) ? inv.payments : []).map(
        (p: any, idx: number): RowItem => {
          const account = financialAccountById[String(p?.source_account || '')];
          return ({
          key: `purchase_${inv.id}_${idx}`,
          kind: 'purchase_payment',
          rowType: 'payment',
          sourceLabel: 'پرداخت فاکتور خرید',
          sourceRecordId: String(inv.id),
          paymentType: String(p?.payment_type || ''),
          status: String(p?.status || ''),
          date: p?.date || inv?.invoice_date || null,
          amount: Number(p?.amount || 0),
          invoiceLabel: String(inv?.name || inv?.system_code || inv?.id || '-'),
          personLabel: resolvePartyLabel('supplier', inv?.supplier_id ? String(inv.supplier_id) : undefined),
          bankLabel: account?.label || String(p?.source_account || '-'),
          chequeLabel: chequeLabelById[String(p?.cheque_id || '')] || '-',
          description: String(p?.description || ''),
          createdAt: inv?.created_at || null,
          invoiceRelation: inv?.id ? { moduleId: 'purchase_invoices', recordId: String(inv.id) } : null,
          personRelation: inv?.supplier_id ? { moduleId: 'suppliers', recordId: String(inv.supplier_id) } : null,
          bankRelation: p?.source_account ? { moduleId: account?.moduleId || 'bank_accounts', recordId: String(p.source_account) } : null,
          chequeRelation: p?.cheque_id ? { moduleId: 'cheques', recordId: String(p.cheque_id) } : null,
        });
        }
      )
    );

    const fromOps = (operations || []).map((op: any): RowItem => {
      const accountId = String(op?.bank_account_id || op?.cash_box_id || op?.petty_fund_id || '').trim();
      const account = financialAccountById[accountId];
      return ({
      key: `op_${op.id}`,
      kind: 'cash_bank_operation',
      rowType: String(op?.operation_type || '') === 'payment' ? 'payment' : 'receipt',
      sourceLabel: 'ثبت مستقیم نقد و بانک',
      sourceRecordId: String(op.id),
      paymentType: String(op?.payment_type || ''),
      status: String(op?.status || ''),
      date: op?.operation_date || null,
      amount: Number(op?.amount || 0),
      invoiceLabel: op?.sales_invoice_id
        ? String(salesById[String(op.sales_invoice_id)]?.name || op.sales_invoice_id)
        : op?.purchase_invoice_id
          ? String(purchaseById[String(op.purchase_invoice_id)]?.name || op.purchase_invoice_id)
          : '-',
      personLabel: op?.customer_id
        ? resolvePartyLabel('customer', String(op.customer_id))
        : op?.supplier_id
          ? resolvePartyLabel('supplier', String(op.supplier_id))
          : op?.employee_id
            ? resolvePartyLabel('employee', String(op.employee_id))
            : '-',
      bankLabel: account?.label || '-',
      chequeLabel: chequeLabelById[String(op?.cheque_id || '')] || '-',
      description: String(op?.description || ''),
      createdAt: op?.created_at || null,
      invoiceRelation: op?.sales_invoice_id
        ? { moduleId: 'invoices', recordId: String(op.sales_invoice_id) }
        : op?.purchase_invoice_id
          ? { moduleId: 'purchase_invoices', recordId: String(op.purchase_invoice_id) }
          : null,
      personRelation: op?.customer_id
        ? { moduleId: 'customers', recordId: String(op.customer_id) }
        : op?.supplier_id
          ? { moduleId: 'suppliers', recordId: String(op.supplier_id) }
          : op?.employee_id
            ? { moduleId: 'profiles', recordId: String(op.employee_id) }
            : null,
      bankRelation: accountId ? { moduleId: account?.moduleId || (op?.cash_box_id ? 'cash_boxes' : op?.petty_fund_id ? 'petty_funds' : 'bank_accounts'), recordId: accountId } : null,
      chequeRelation: op?.cheque_id ? { moduleId: 'cheques', recordId: String(op.cheque_id) } : null,
    });
    });

    const fromCheques = (cheques || []).map((c: any): RowItem => ({
      key: `cheque_${c.id}`,
      kind: 'cheque',
      rowType: 'cheque',
      sourceLabel: String(c?.cheque_type || '') === 'issued' ? 'چک پرداختی' : 'چک دریافتی',
      sourceRecordId: String(c.id),
      paymentType: 'cheque',
      status: String(c?.status || ''),
      date: c?.issue_date || c?.due_date || null,
      amount: Number(c?.amount || 0),
      invoiceLabel: '-',
      personLabel: resolvePartyLabel(String(c?.party_type || ''), c?.party_id ? String(c.party_id) : undefined),
      bankLabel: financialAccountById[String(c?.bank_account_id || '')]?.label || '-',
      chequeLabel: chequeLabelById[String(c?.id || '')] || '-',
      description: String(c?.notes || ''),
      createdAt: c?.created_at || null,
      invoiceRelation: null,
      personRelation: c?.party_id && c?.party_type
        ? {
            moduleId: String(c.party_type) === 'customer'
              ? 'customers'
              : String(c.party_type) === 'supplier'
                ? 'suppliers'
                : 'profiles',
            recordId: String(c.party_id),
          }
        : null,
      bankRelation: c?.bank_account_id ? { moduleId: 'bank_accounts', recordId: String(c.bank_account_id) } : null,
      chequeRelation: c?.id ? { moduleId: 'cheques', recordId: String(c.id) } : null,
    }));

    const fromBarters = (barters || []).map((b: any): RowItem => ({
      key: `barter_${b.id}`,
      kind: 'barter',
      rowType: 'barter',
      sourceLabel: String(b?.barter_type || '') === 'outgoing' ? 'تهاتر پرداختی' : 'تهاتر دریافتی',
      sourceRecordId: String(b.id),
      paymentType: 'barter',
      status: String(b?.status || ''),
      date: b?.barter_date || null,
      amount: Number(b?.remaining_amount || 0),
      invoiceLabel: b?.source_invoice_id
        ? String(salesById[String(b.source_invoice_id)]?.name || b.source_invoice_id)
        : b?.source_purchase_invoice_id
          ? String(purchaseById[String(b.source_purchase_invoice_id)]?.name || b.source_purchase_invoice_id)
          : '-',
      personLabel: b?.customer_id
        ? resolvePartyLabel('customer', String(b.customer_id))
        : b?.supplier_id
          ? resolvePartyLabel('supplier', String(b.supplier_id))
          : b?.employee_id
            ? resolvePartyLabel('employee', String(b.employee_id))
            : '-',
      bankLabel: '-',
      chequeLabel: '-',
      description: String(b?.notes || ''),
      createdAt: b?.created_at || null,
      invoiceRelation: b?.source_invoice_id
        ? { moduleId: 'invoices', recordId: String(b.source_invoice_id) }
        : b?.source_purchase_invoice_id
          ? { moduleId: 'purchase_invoices', recordId: String(b.source_purchase_invoice_id) }
          : null,
      personRelation: b?.customer_id
        ? { moduleId: 'customers', recordId: String(b.customer_id) }
        : b?.supplier_id
          ? { moduleId: 'suppliers', recordId: String(b.supplier_id) }
          : b?.employee_id
            ? { moduleId: 'profiles', recordId: String(b.employee_id) }
            : null,
      bankRelation: null,
      chequeRelation: null,
    }));

    const merged = [...fromSales, ...fromPurchase, ...fromOps, ...fromCheques, ...fromBarters];
    merged.sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime());
    setRows(merged);
  }, [
    salesInvoices,
    purchaseInvoices,
    operations,
    cheques,
    barters,
    financialAccountById,
    chequeLabelById,
    purchaseById,
    resolvePartyLabel,
    salesById,
  ]);

  const goCreateOperation = useCallback(
    (operationType: 'receipt' | 'payment') => {
      navigate('/cash_bank_operations/create', {
        state: {
          initialValues: {
            operation_type: operationType,
            payment_type: 'cash',
            status: 'received',
            operation_date: today(),
            amount: 0,
          },
        },
      });
    },
    [navigate]
  );

  const openRow = useCallback(
    (row: RowItem) => {
      if (row.kind === 'cheque' && row.sourceRecordId) {
        navigate(`/cheques/${row.sourceRecordId}`);
        return;
      }
      if (row.kind === 'sales_payment' && row.sourceRecordId) {
        navigate(`/invoices/${row.sourceRecordId}`);
        return;
      }
      if (row.kind === 'purchase_payment' && row.sourceRecordId) {
        navigate(`/purchase_invoices/${row.sourceRecordId}`);
        return;
      }
      if (row.kind === 'cash_bank_operation' && row.sourceRecordId) {
        navigate(`/cash_bank_operations/${row.sourceRecordId}`);
        return;
      }
      if (row.kind === 'barter' && row.sourceRecordId) {
        navigate(`/barters/${row.sourceRecordId}`);
        return;
      }
      navigate('/cash_bank_operations');
    },
    [navigate]
  );

  const paymentTypeFilters = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.paymentType).filter(Boolean))).map((value) => ({
        text: PAYMENT_TYPE_LABEL[value] || value,
        value,
      })),
    [rows]
  );

  const statusFilters = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.status).filter(Boolean))).map((value) => ({
        text: STATUS_LABEL[value] || value,
        value,
      })),
    [rows]
  );

  const columns: ColumnsType<RowItem> = useMemo(
    () => [
      {
        title: 'نوع',
        dataIndex: 'rowType',
        key: 'rowType',
        width: 95,
        ...createChoiceFilter('نوع', [
          { label: 'دریافت', value: 'receipt' },
          { label: 'پرداخت', value: 'payment' },
          { label: 'چک', value: 'cheque' },
          { label: 'تهاتر', value: 'barter' },
        ], (record) => record.rowType),
        render: (v: RowItem['rowType']) => {
          const t = rowTag(v);
          return <Tag color={t.color}>{t.label}</Tag>;
        },
      },
      {
        title: 'منبع',
        dataIndex: 'sourceLabel',
        key: 'sourceLabel',
        width: 180,
        ...createTextFilter('جستجو در منبع', (record) => record.sourceLabel),
      },
      {
        title: 'روش',
        dataIndex: 'paymentType',
        key: 'paymentType',
        width: 130,
        ...createChoiceFilter('روش', paymentTypeFilters.map((item) => ({ label: String(item.text), value: String(item.value) })), (record) => record.paymentType),
        render: (v: string) => PAYMENT_TYPE_LABEL[v] || v || '-',
      },
      {
        title: 'وضعیت',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        ...createChoiceFilter('وضعیت', statusFilters.map((item) => ({ label: String(item.text), value: String(item.value) })), (record) => record.status),
        render: (v: string) => <Tag color={statusColor(v)}>{STATUS_LABEL[v] || v || '-'}</Tag>,
      },
      {
        title: 'تاریخ',
        dataIndex: 'date',
        key: 'date',
        width: 130,
        ...createDateRangeFilter('تاریخ', (record) => record.date),
        render: (v: string | null) => (v ? toPersianNumber(safeJalaliFormat(v, 'YYYY/MM/DD')) : '-'),
      },
      {
        title: `مبلغ (${currencyLabel})`,
        dataIndex: 'amount',
        key: 'amount',
        width: 170,
        sorter: (a, b) => a.amount - b.amount,
        ...createNumberRangeFilter('مبلغ', (record) => record.amount),
        render: (v: number) => <span className="persian-number">{formatPersianPrice(v)}</span>,
      },
      {
        title: 'فاکتور مرتبط',
        dataIndex: 'invoiceLabel',
        key: 'invoiceLabel',
        width: 190,
        ...createTextFilter('جستجو در فاکتور', (record) => record.invoiceLabel),
        render: (_: string, record: RowItem) => {
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
        title: 'شخص مرتبط',
        dataIndex: 'personLabel',
        key: 'personLabel',
        width: 190,
        ...createTextFilter('جستجو در شخص', (record) => record.personLabel),
        render: (_: string, record: RowItem) => {
          if (!record.personRelation?.moduleId || !record.personRelation?.recordId) return record.personLabel || '-';
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <RelatedRecordPopover
                moduleId={record.personRelation.moduleId}
                recordId={record.personRelation.recordId}
                label={record.personLabel || '-'}
              />
            </div>
          );
        },
      },
      {
        title: 'حساب بانکی',
        dataIndex: 'bankLabel',
        key: 'bankLabel',
        width: 190,
        ...createTextFilter('جستجو در حساب بانکی', (record) => record.bankLabel),
        render: (_: string, record: RowItem) => {
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
        title: 'چک',
        dataIndex: 'chequeLabel',
        key: 'chequeLabel',
        width: 220,
        ...createTextFilter('جستجو در چک', (record) => record.chequeLabel),
        render: (_: string, record: RowItem) => {
          if (!record.chequeRelation?.moduleId || !record.chequeRelation?.recordId) return record.chequeLabel || '-';
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <RelatedRecordPopover
                moduleId={record.chequeRelation.moduleId}
                recordId={record.chequeRelation.recordId}
                label={record.chequeLabel || '-'}
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
        render: (v: string) => v || '-',
      },
    ],
    [currencyLabel, paymentTypeFilters, statusFilters]
  );

  if (loading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!canViewPage) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Card className="max-w-md text-center">
          دسترسی به بخش نقد و بانک ندارید
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1700px] mx-auto animate-fadeIn">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 p-4 md:p-6 min-h-[70vh] transition-colors">
        <div className="mb-6">
          <Title level={3} className="!mb-1">
            نقد و بانک
          </Title>
          <Text className="text-gray-500">نمای یکپارچه دریافت‌ها، پرداخت‌ها و چک‌ها</Text>
        </div>

        <Row gutter={[12, 12]} className="mb-6">
          <Col xs={12} lg={4}>
            <Card>
              <Statistic title="حساب‌های بانکی فعال" value={toPersianNumber(stats.bankAccounts)} prefix={<BankOutlined />} />
            </Card>
          </Col>
          <Col xs={12} lg={4}>
            <Card>
              <Statistic title="صندوق‌ها" value={toPersianNumber(stats.cashBoxes)} prefix={<WalletOutlined />} />
            </Card>
          </Col>
          <Col xs={12} lg={4}>
            <Card>
              <Statistic title="تنخواه‌ها" value={toPersianNumber(stats.pettyFunds)} prefix={<WalletOutlined />} />
            </Card>
          </Col>
          <Col xs={12} lg={4}>
            <Card>
              <Statistic title="چک‌های باز" value={toPersianNumber(stats.openCheques)} prefix={<CreditCardOutlined />} />
            </Card>
          </Col>
          <Col xs={12} lg={4}>
            <Card>
              <Statistic title="مبلغ چک‌های باز" value={formatPersianPrice(stats.chequesAmount)} suffix={currencyLabel} />
            </Card>
          </Col>
          <Col xs={12} lg={4}>
            <Card>
              <Statistic title="تهاترهای باز" value={toPersianNumber(stats.openBarters)} prefix={<ApartmentOutlined />} />
            </Card>
          </Col>
          <Col xs={12} lg={4}>
            <Card>
              <Statistic title="مانده تهاترهای باز" value={formatPersianPrice(stats.bartersAmount)} suffix={currencyLabel} />
            </Card>
          </Col>
        </Row>

        <Card title="عملیات">
          <Row gutter={[8, 8]} className="mb-3">
            <Col xs={24} md={6}>
              <Button type="primary" block icon={<PlusOutlined />} onClick={() => goCreateOperation('receipt')}>
                ثبت دریافت جدید
              </Button>
            </Col>
            <Col xs={24} md={6}>
              <Button block icon={<PlusOutlined />} onClick={() => goCreateOperation('payment')}>
                ثبت پرداخت جدید
              </Button>
            </Col>
            <Col xs={24} md={6}>
              <Button block icon={<PlusOutlined />} onClick={() => navigate('/cheques/create')}>
                ثبت چک جدید
              </Button>
            </Col>
            <Col xs={24} md={6}>
              <Button block icon={<PlusOutlined />} onClick={() => navigate('/barters/create')}>
                افزودن تهاتر جدید
              </Button>
            </Col>
          </Row>

          <Table
            className="custom-erp-table"
            dataSource={rows}
            columns={columns}
            rowKey="key"
            size={isMobile ? 'small' : 'middle'}
            pagination={{ pageSize: isMobile ? 10 : 20, showSizeChanger: true }}
            scroll={{ x: isMobile ? 1450 : 1800 }}
            onRow={(record) => ({
              onClick: () => openRow(record),
              style: { cursor: 'pointer' },
            })}
          />
        </Card>
      </div>
    </div>
  );
};

export default CashBankPage;

