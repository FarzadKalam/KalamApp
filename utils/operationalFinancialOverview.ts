import { supabase as sharedSupabase } from '../supabaseClient';
import { localizeFinancialValue, FINANCIAL_PAYMENT_TYPE_LABELS_FA } from './financialValueLabels';
import {
  buildSourceOperationKey,
  getOperationalPaymentRowKeyCandidates,
  normalizeOperationalText,
  normalizePaymentRowStatus,
  parseCashBankMetadata,
  parseOperationalPayments,
  resolvePaymentRowAccountId,
  resolvePaymentRowDate,
  toOperationalSafeNumber,
} from './operationalCashBankSources';

export type OperationalFinancialEntityType = 'customer' | 'supplier' | 'employee';
export type OperationalFinancialRowType =
  | 'opening'
  | 'invoice'
  | 'receipt'
  | 'payment'
  | 'barter'
  | 'payroll_slip'
  | 'advance';

export type OperationalFinancialRow = {
  key: string;
  rowType: OperationalFinancialRowType;
  sourceLabel: string;
  sourceModuleId: string;
  sourceRecordId: string | null;
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
  printableFields?: Record<string, any>;
};

export type OperationalFinancialOverviewResult = {
  rows: OperationalFinancialRow[];
  recentItems: OperationalFinancialRow[];
  summary: {
    totalDebit: number;
    totalCredit: number;
    finalBalance: number;
  };
  totals: {
    totalDebit: number;
    totalCredit: number;
    finalBalance: number;
  };
  printFields: Array<{ key: string; label: string; type?: string; options?: Array<{ label: string; value: string }> }>;
};

export type OperationalFinancialEntityPrintField = {
  key: string;
  label: string;
  group?: string;
  printValue: any;
};

export const OPERATIONAL_FINANCIAL_ENTITY_PRINT_FIELD_PREFIX = 'entity__';

export const buildOperationalFinancialEntityPrintFields = (
  fields: OperationalFinancialEntityPrintField[] = [],
) => fields
  .filter((field) => String(field?.key || '').trim())
  .map((field) => ({
    key: `${OPERATIONAL_FINANCIAL_ENTITY_PRINT_FIELD_PREFIX}${String(field.key).trim()}`,
    label: String(field.label || field.key),
    type: 'text',
    group: field.group || 'اطلاعات رکورد',
    defaultSelected: false,
    printSection: 'context' as const,
  }));

export const buildOperationalFinancialEntityPrintValues = (
  fields: OperationalFinancialEntityPrintField[] = [],
) => Object.fromEntries(
    fields
      .filter((field) => String(field?.key || '').trim())
      .map((field) => [
        `${OPERATIONAL_FINANCIAL_ENTITY_PRINT_FIELD_PREFIX}${String(field.key).trim()}`,
        field.printValue,
      ])
  );

type OverviewArgs = {
  entityType: OperationalFinancialEntityType;
  entityId: string;
  supabase?: typeof sharedSupabase;
};

type AccountLabel = {
  label: string;
  moduleId: 'bank_accounts' | 'cash_boxes' | 'petty_funds';
};

type EmployeeScope = {
  employeeId: string;
  profileIds: string[];
};

const SALES_INVOICE_STATUSES = new Set(['confirmed', 'final', 'settled', 'completed']);
const PURCHASE_INVOICE_STATUSES = new Set(['confirmed', 'final', 'settled', 'completed']);
const PAYROLL_VISIBLE_STATUSES = new Set(['approved', 'paid', 'posted']);
const ADVANCE_VISIBLE_STATUSES = new Set(['requested', 'approved', 'paid', 'settled', 'posted']);
const SETTLED_OPERATION_STATUSES = new Set(['received', 'approved', 'paid', 'settled', 'cleared']);
const FAILED_CHEQUE_STATUSES = new Set(['bounced', 'returned']);

// از منبع مرکزی مشتق می‌شود تا لیبل نوع پرداخت در همه‌جا یکدست بماند.
export const OPERATIONAL_FINANCIAL_PAYMENT_TYPE_LABEL: Record<string, string> = {
  ...FINANCIAL_PAYMENT_TYPE_LABELS_FA,
};

export const OPERATIONAL_FINANCIAL_STATUS_LABEL: Record<string, string> = {
  created: 'ایجاد شده',
  proforma: 'پیش فاکتور',
  confirmed: 'تایید شده',
  pending: 'در انتظار',
  received: 'انجام شده',
  returned: 'برگشت',
  canceled: 'لغو',
  cancelled: 'لغو',
  new: 'جدید',
  in_bank: 'در بانک',
  cleared: 'وصول شده',
  bounced: 'برگشتی',
  open: 'باز',
  partial: 'مصرف‌شده جزئی',
  closed: 'بسته',
  draft: 'پیش نویس',
  final: 'نهایی',
  paid: 'پرداخت شده',
  settled: 'تسویه شده',
  completed: 'تکمیل شده',
  approved: 'تایید شده',
  posted: 'سند شده',
  requested: 'درخواست شده',
  rejected: 'رد شده',
};

export const OPERATIONAL_FINANCIAL_ROW_TYPE_LABEL: Record<OperationalFinancialRowType, string> = {
  opening: 'اول دوره',
  invoice: 'فاکتور',
  receipt: 'دریافت',
  payment: 'پرداخت',
  barter: 'تهاتر',
  payroll_slip: 'فیش حقوقی',
  advance: 'مساعده',
};

export const OPERATIONAL_FINANCIAL_PRINT_FIELDS: OperationalFinancialOverviewResult['printFields'] = [
  {
    key: 'rowTypeLabel',
    label: 'نوع',
    type: 'select',
    options: Object.entries(OPERATIONAL_FINANCIAL_ROW_TYPE_LABEL).map(([value, label]) => ({ value, label })),
  },
  { key: 'sourceLabel', label: 'منبع', type: 'text' },
  {
    key: 'paymentTypeLabel',
    label: 'روش',
    type: 'select',
    options: Object.entries(OPERATIONAL_FINANCIAL_PAYMENT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
  },
  {
    key: 'statusLabel',
    label: 'وضعیت',
    type: 'select',
    options: Object.entries(OPERATIONAL_FINANCIAL_STATUS_LABEL).map(([value, label]) => ({ value, label })),
  },
  { key: 'date', label: 'تاریخ', type: 'date' },
  { key: 'debit', label: 'بدهکار', type: 'price' },
  { key: 'credit', label: 'بستانکار', type: 'price' },
  { key: 'balance', label: 'مانده', type: 'price' },
  { key: 'invoiceLabel', label: 'مرجع', type: 'text' },
  { key: 'bankLabel', label: 'بانک / صندوق', type: 'text' },
  { key: 'description', label: 'توضیحات', type: 'long_text' },
];

export const OPERATIONAL_FINANCIAL_PRINT_SUMMARY_FIELDS = [
  { key: 'totalDebit', label: 'جمع بدهکار', type: 'price' },
  { key: 'totalCredit', label: 'جمع بستانکار', type: 'price' },
  { key: 'finalBalanceAmount', label: 'مانده نهایی', type: 'price' },
  {
    key: 'finalBalanceSide',
    label: 'ماهیت مانده',
    type: 'select',
    options: [
      { value: 'بدهکار', label: 'بدهکار' },
      { value: 'بستانکار', label: 'بستانکار' },
    ],
  },
] as const;

const toNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: any) => String(value || '').trim().toLowerCase();
const isSettledOperationStatus = (value: any) => SETTLED_OPERATION_STATUSES.has(normalizeStatus(value));
const isFailedCheque = (value: any) => FAILED_CHEQUE_STATUSES.has(normalizeStatus(value));

const buildBalanceRow = (row: Omit<OperationalFinancialRow, 'balance' | 'printableFields'>, balance: number): OperationalFinancialRow => ({
  ...row,
  balance,
  printableFields: {
    rowTypeLabel: OPERATIONAL_FINANCIAL_ROW_TYPE_LABEL[row.rowType] || row.rowType,
    sourceLabel: row.sourceLabel,
    paymentTypeLabel: localizeFinancialValue(row.paymentType, 'payment_type') || OPERATIONAL_FINANCIAL_PAYMENT_TYPE_LABEL[row.paymentType] || row.paymentType || '-',
    statusLabel: OPERATIONAL_FINANCIAL_STATUS_LABEL[row.status] || localizeFinancialValue(row.status, 'status') || row.status || '-',
    date: row.date,
    debit: row.debit,
    credit: row.credit,
    balance,
    invoiceLabel: row.invoiceLabel,
    bankLabel: row.bankLabel,
    description: row.description,
  },
});

const buildAccountLabelMap = (
  banks: any[],
  cashBoxes: any[],
  pettyFunds: any[],
): Record<string, AccountLabel> => Object.fromEntries(
  [
    ...(banks || []).map((bank) => [
      String(bank.id),
      {
        label: `${String(bank.bank_name || 'بانک')} ${bank.account_number ? `(${String(bank.account_number)})` : ''}`.trim(),
        moduleId: 'bank_accounts' as const,
      },
    ]),
    ...(cashBoxes || []).map((cashBox) => [
      String(cashBox.id),
      {
        label: `${String(cashBox.name || 'صندوق')} ${cashBox.code ? `(${String(cashBox.code)})` : ''}`.trim(),
        moduleId: 'cash_boxes' as const,
      },
    ]),
    ...(pettyFunds || []).map((fund) => [
      String(fund.id),
      {
        label: `${String(fund.name || 'تنخواه')} ${fund.code ? `(${String(fund.code)})` : ''}`.trim(),
        moduleId: 'petty_funds' as const,
      },
    ]),
  ],
);

const resolveEntityScope = async (
  supabase: typeof sharedSupabase,
  entityType: OperationalFinancialEntityType,
  entityId: string,
): Promise<EmployeeScope | null> => {
  if (entityType !== 'employee') return null;
  const { data, error } = await supabase
    .from('employees')
    .select('id, related_profile_id')
    .eq('id', entityId)
    .maybeSingle();
  if (error) throw error;
  const employeeId = normalizeOperationalText(data?.id) || entityId;
  const profileIds = [entityId, normalizeOperationalText(data?.related_profile_id)].filter(Boolean);
  return {
    employeeId,
    profileIds: Array.from(new Set(profileIds)),
  };
};

const resolveOperationAccountInfo = (
  row: any,
  accountById: Record<string, AccountLabel>,
) => {
  const directAccountId = String(row?.bank_account_id || row?.cash_box_id || row?.petty_fund_id || '').trim();
  if (directAccountId) {
    const account = accountById[directAccountId];
    return {
      label: account?.label || '-',
      relation: {
        moduleId: account?.moduleId || (row?.cash_box_id ? 'cash_boxes' : row?.petty_fund_id ? 'petty_funds' : 'bank_accounts'),
        recordId: directAccountId,
      },
    };
  }

  const paymentAccountId = String(row?.payment_bank_account_id || row?.payment_cash_box_id || row?.payment_petty_fund_id || '').trim();
  const receiptAccountId = String(row?.receipt_bank_account_id || row?.receipt_cash_box_id || row?.receipt_petty_fund_id || '').trim();
  if (!paymentAccountId && !receiptAccountId) {
    return { label: '-', relation: null };
  }

  const paymentAccount = accountById[paymentAccountId];
  const receiptAccount = accountById[receiptAccountId];
  return {
    label: `${paymentAccount?.label || '-'} ← ${receiptAccount?.label || '-'}`,
    relation: null,
  };
};

const isSourceBackedCashBankOperation = (op: any) => {
  const metadata = parseCashBankMetadata(op?.metadata);
  if (metadata?.is_auto_generated === true) return true;
  return Boolean(
    op?.sales_invoice_id
    || op?.purchase_invoice_id
    || op?.expense_document_id
    || op?.employee_advance_id
    || op?.payroll_slip_id,
  );
};

const resolveOperationSourceModuleId = (operation: any) => {
  const metadata = parseCashBankMetadata(operation?.metadata);
  const metadataSourceTable = normalizeOperationalText(metadata?.source_table);
  if (metadataSourceTable) return metadataSourceTable;
  if (operation?.sales_invoice_id) return 'invoices';
  if (operation?.purchase_invoice_id) return 'purchase_invoices';
  if (operation?.employee_advance_id) return 'employee_advances';
  if (operation?.payroll_slip_id) return 'payroll_slips';
  if (operation?.expense_document_id) return 'expense_documents';
  return 'cash_bank_operations';
};

export const isEmployeeFinancialOverviewOperation = (operation: any) => {
  const sourceModuleId = resolveOperationSourceModuleId(operation);
  return sourceModuleId === 'employee_advances' || sourceModuleId === 'payroll_slips';
};

const buildExistingSourceOperationKeys = (operations: any[]) => {
  const keys = new Set<string>();
  (operations || []).forEach((operation) => {
    const metadata = parseCashBankMetadata(operation?.metadata);
    const sourceTable = normalizeOperationalText(metadata?.source_table);
    const sourceRecordId = normalizeOperationalText(metadata?.source_record_id);
    const sourceRowKey = normalizeOperationalText(metadata?.source_row_key);
    if (sourceTable && sourceRecordId && sourceRowKey) {
      keys.add(buildSourceOperationKey(sourceTable, sourceRecordId, sourceRowKey));
    }
  });
  return keys;
};

const buildLegacyPaymentRows = (args: {
  sourceTable: 'invoices' | 'purchase_invoices' | 'employee_advances' | 'payroll_slips';
  sourceRecord: any;
  operationType: 'receipt' | 'payment';
  existingOperationKeys: Set<string>;
  accountById: Record<string, AccountLabel>;
}) => {
  const { sourceTable, sourceRecord, operationType, existingOperationKeys, accountById } = args;
  const rows = parseOperationalPayments(sourceRecord?.payments);
  return rows
    .flatMap((paymentRow: any, index: number) => {
      const rowKeyCandidates = getOperationalPaymentRowKeyCandidates(paymentRow, index);
      const hasSyncedOperation = rowKeyCandidates.some((candidate) =>
        existingOperationKeys.has(buildSourceOperationKey(sourceTable, String(sourceRecord?.id || ''), candidate)),
      );
      if (hasSyncedOperation) return [];

      const amount = Math.abs(toOperationalSafeNumber(paymentRow?.amount));
      if (amount <= 0) return [];
      if (!isSettledOperationStatus(paymentRow?.status)) return [];
      const paymentType = String(paymentRow?.payment_type || '').trim().toLowerCase();
      if (paymentType === 'cheque' && isFailedCheque(paymentRow?.cheque_status)) return [];

      const accountId = resolvePaymentRowAccountId(paymentRow, operationType === 'receipt' ? 'target_account' : 'source_account');
      const account = accountId ? accountById[accountId] : null;
      const debit = operationType === 'payment' ? amount : 0;
      const credit = operationType === 'receipt' ? amount : 0;

      return [{
        key: `${sourceTable}_legacy_${String(sourceRecord?.id || '')}_${rowKeyCandidates[0] || index}`,
        rowType: operationType === 'payment' ? 'payment' as const : 'receipt' as const,
        sourceLabel: sourceTable === 'invoices'
          ? 'دریافت فاکتور فروش'
          : sourceTable === 'purchase_invoices'
            ? 'پرداخت فاکتور خرید'
            : sourceTable === 'employee_advances'
              ? 'پرداخت مساعده'
              : 'پرداخت فیش حقوقی',
        sourceModuleId: sourceTable,
        sourceRecordId: String(sourceRecord?.id || ''),
        paymentType,
        status: normalizePaymentRowStatus(paymentRow?.status),
        chequeStatus: String(paymentRow?.cheque_status || ''),
        date: resolvePaymentRowDate(paymentRow, sourceRecord, sourceTable === 'employee_advances' ? 'request_date' : sourceTable === 'payroll_slips' ? 'period_end' : 'invoice_date'),
        debit,
        credit,
        invoiceLabel: String(sourceRecord?.name || sourceRecord?.system_code || sourceRecord?.id || '-'),
        bankLabel: account?.label || String(accountId || '-'),
        description: String(paymentRow?.description || ''),
        createdAt: sourceRecord?.created_at || null,
        invoiceRelation: sourceRecord?.id ? { moduleId: sourceTable, recordId: String(sourceRecord.id) } : null,
        bankRelation: accountId ? { moduleId: account?.moduleId || 'bank_accounts', recordId: String(accountId) } : null,
      }];
    });
};

export const buildOperationAmountPair = (
  entityType: OperationalFinancialEntityType,
  operationType: string,
  amount: number,
) => {
  if (entityType === 'customer') {
    return operationType === 'payment'
      ? { debit: amount, credit: 0 }
      : { debit: 0, credit: amount };
  }
  return operationType === 'payment'
    ? { debit: amount, credit: 0 }
    : { debit: 0, credit: amount };
};

export const computeOperationalFinancialTotals = (rows: Array<Pick<OperationalFinancialRow, 'debit' | 'credit' | 'balance'>>) => {
  const totalDebit = rows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const totalCredit = rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const finalBalance = rows.length ? Number(rows[rows.length - 1]?.balance || 0) : totalDebit - totalCredit;
  return {
    totalDebit,
    totalCredit,
    finalBalance,
  };
};

const fetchSingleOperationalFinancialOverview = async ({
  entityType,
  entityId,
  supabase = sharedSupabase,
}: OverviewArgs): Promise<OperationalFinancialOverviewResult> => {
  const normalizedEntityId = normalizeOperationalText(entityId);
  if (!normalizedEntityId) {
    return {
      rows: [],
      recentItems: [],
      summary: { totalDebit: 0, totalCredit: 0, finalBalance: 0 },
      totals: { totalDebit: 0, totalCredit: 0, finalBalance: 0 },
      printFields: OPERATIONAL_FINANCIAL_PRINT_FIELDS,
    };
  }

  if (entityType === 'customer') {
    try {
      const { data, error } = await supabase.rpc('get_customer_operational_financial_overview', {
        p_customer_id: normalizedEntityId,
      });
      if (error) throw error;
      const rows = ((data || []) as any[]).map((row: any): OperationalFinancialRow => {
        const rowType = String(row?.row_type || 'invoice') as OperationalFinancialRowType;
        const sourceModuleId = String(row?.source_module_id || '');
        const sourceRecordId = normalizeOperationalText(row?.source_record_id) || null;
        const base = {
          key: String(row?.key || `${sourceModuleId}_${sourceRecordId || Math.random()}`),
          rowType,
          sourceLabel: String(row?.source_label || ''),
          sourceModuleId,
          sourceRecordId,
          paymentType: String(row?.payment_type || ''),
          status: String(row?.status || ''),
          chequeStatus: String(row?.cheque_status || ''),
          date: row?.row_date || null,
          debit: toNumber(row?.debit),
          credit: toNumber(row?.credit),
          balance: toNumber(row?.balance),
          invoiceLabel: String(row?.invoice_label || '-'),
          bankLabel: String(row?.bank_label || '-'),
          description: String(row?.description || ''),
          createdAt: row?.created_at || null,
          invoiceRelation: sourceRecordId && sourceModuleId && sourceModuleId !== 'customers'
            ? { moduleId: sourceModuleId, recordId: sourceRecordId }
            : null,
          bankRelation: null,
        };
        return {
          ...base,
          printableFields: {
            rowTypeLabel: OPERATIONAL_FINANCIAL_ROW_TYPE_LABEL[rowType] || rowType,
            sourceLabel: base.sourceLabel,
            paymentTypeLabel: localizeFinancialValue(base.paymentType, 'payment_type') || OPERATIONAL_FINANCIAL_PAYMENT_TYPE_LABEL[base.paymentType] || base.paymentType || '-',
            statusLabel: OPERATIONAL_FINANCIAL_STATUS_LABEL[base.status] || localizeFinancialValue(base.status, 'status') || base.status || '-',
            date: base.date,
            debit: base.debit,
            credit: base.credit,
            balance: base.balance,
            invoiceLabel: base.invoiceLabel,
            bankLabel: base.bankLabel,
            description: base.description,
          },
        };
      });
      const totals = computeOperationalFinancialTotals(rows);
      return {
        rows,
        recentItems: [...rows].sort((a, b) => {
          const aDate = new Date(a.date || a.createdAt || 0).getTime();
          const bDate = new Date(b.date || b.createdAt || 0).getTime();
          return bDate - aDate;
        }).slice(0, 6),
        summary: totals,
        totals,
        printFields: OPERATIONAL_FINANCIAL_PRINT_FIELDS,
      };
    } catch (error: any) {
      const raw = String(error?.message || error?.details || '').toLowerCase();
      const missingRpc = raw.includes('get_customer_operational_financial_overview') || raw.includes('function');
      if (!missingRpc) throw error;
    }
  }

  const employeeScope = await resolveEntityScope(supabase, entityType, normalizedEntityId);

  const [banksRes, cashRes, pettyRes] = await Promise.all([
    supabase.from('bank_accounts').select('id, bank_name, account_number').eq('is_active', true).limit(1000),
    supabase.from('cash_boxes').select('id, name, code').eq('is_active', true).limit(1000),
    supabase.from('petty_funds').select('id, name, code').eq('is_active', true).limit(1000),
  ]);
  const accountError = banksRes.error || cashRes.error || pettyRes.error;
  if (accountError) throw accountError;
  const accountById = buildAccountLabelMap(banksRes.data || [], cashRes.data || [], pettyRes.data || []);

  const operationsQuery = supabase.from('cash_bank_operations').select('*').limit(3000);
  const bartersQuery = supabase.from('barters')
    .select('id, name, system_code, status, barter_type, barter_date, initial_amount, remaining_amount, source_invoice_id, source_purchase_invoice_id, notes, created_at, customer_id, supplier_id, employee_id')
    .limit(3000);

  let entityOperationsQuery = operationsQuery;
  let entityBartersQuery = bartersQuery;

  if (entityType === 'customer') {
    entityOperationsQuery = entityOperationsQuery.eq('customer_id', normalizedEntityId);
    entityBartersQuery = entityBartersQuery.eq('customer_id', normalizedEntityId);
  } else if (entityType === 'supplier') {
    entityOperationsQuery = entityOperationsQuery.eq('supplier_id', normalizedEntityId);
    entityBartersQuery = entityBartersQuery.eq('supplier_id', normalizedEntityId);
  } else {
    const employeeIds = employeeScope?.profileIds || [normalizedEntityId];
    entityOperationsQuery = employeeIds.length > 1
      ? entityOperationsQuery.in('employee_id', employeeIds)
      : entityOperationsQuery.eq('employee_id', employeeIds[0]);
    entityBartersQuery = employeeIds.length > 1
      ? entityBartersQuery.in('employee_id', employeeIds)
      : entityBartersQuery.eq('employee_id', employeeIds[0]);
  }

  const requests: any[] = [
    entityOperationsQuery,
    entityBartersQuery,
  ];

  if (entityType === 'customer') {
    requests.push(
      supabase.from('invoices')
        .select('id, name, system_code, invoice_date, status, total_invoice_amount, total_received_amount, remaining_balance, payments, created_at')
        .eq('customer_id', normalizedEntityId)
        .limit(3000),
    );
  } else if (entityType === 'supplier') {
    requests.push(
      supabase.from('purchase_invoices')
        .select('id, name, system_code, invoice_date, status, total_invoice_amount, total_received_amount, remaining_balance, payments, created_at')
        .eq('supplier_id', normalizedEntityId)
        .limit(3000),
    );
  } else {
    const employeeId = employeeScope?.employeeId || normalizedEntityId;
    requests.push(
      supabase.from('payroll_slips')
        .select('id, name, system_code, period_end, status, net_amount, payments, created_at')
        .eq('employee_id', employeeId)
        .limit(3000),
      supabase.from('employee_advances')
        .select('id, name, system_code, request_date, status, amount, paid_amount, remaining_amount, payments, created_at')
        .eq('employee_id', employeeId)
        .limit(3000),
    );
  }

  const responses = await Promise.all(requests);
  const [opsRes, barterRes, primaryRes, secondaryRes] = responses as any[];
  const sourceError = opsRes?.error || barterRes?.error || primaryRes?.error || secondaryRes?.error;
  if (sourceError) throw sourceError;

  const operations = (opsRes?.data || []) as any[];
  const barters = (barterRes?.data || []) as any[];
  const primaryRows = (primaryRes?.data || []) as any[];
  const secondaryRows = (secondaryRes?.data || []) as any[];
  const sourceRecordLabelByKey = new Map<string, string>();
  [...primaryRows, ...secondaryRows].forEach((row: any) => {
    const rowId = normalizeOperationalText(row?.id);
    if (!rowId) return;
    const label = String(row?.name || row?.system_code || rowId || '-');
    if (row?.payments !== undefined || row?.total_invoice_amount !== undefined) {
      if (row?.invoice_date !== undefined) {
        const moduleId = entityType === 'supplier' ? 'purchase_invoices' : 'invoices';
        sourceRecordLabelByKey.set(`${moduleId}:${rowId}`, label);
      }
      if (row?.period_end !== undefined) {
        sourceRecordLabelByKey.set(`payroll_slips:${rowId}`, label);
      }
      if (row?.request_date !== undefined) {
        sourceRecordLabelByKey.set(`employee_advances:${rowId}`, label);
      }
    }
  });
  const sourceBackedOperationKeys = buildExistingSourceOperationKeys(operations);
  const rows: Array<Omit<OperationalFinancialRow, 'balance' | 'printableFields'>> = [];

  if (entityType === 'customer') {
    const invoices = ((primaryRes?.data || []) as any[])
      .filter((invoice) => SALES_INVOICE_STATUSES.has(normalizeStatus(invoice?.status)));
    invoices.forEach((invoice) => {
      const totalAmount = toNumber(invoice?.total_invoice_amount);
      if (totalAmount <= 0) return;
      rows.push({
        key: `invoice_${invoice.id}`,
        rowType: 'invoice',
        sourceLabel: 'صدور فاکتور فروش',
        sourceModuleId: 'invoices',
        sourceRecordId: String(invoice.id),
        paymentType: '',
        status: String(invoice?.status || ''),
        chequeStatus: '',
        date: invoice?.invoice_date || null,
        debit: totalAmount,
        credit: 0,
        invoiceLabel: String(invoice?.name || invoice?.system_code || invoice?.id || '-'),
        bankLabel: '-',
        description: `فاکتور فروش${invoice?.remaining_balance ? ` | مانده: ${String(invoice.remaining_balance)}` : ''}`,
        createdAt: invoice?.created_at || null,
        invoiceRelation: { moduleId: 'invoices', recordId: String(invoice.id) },
        bankRelation: null,
      });
    });

    rows.push(...invoices.flatMap((invoice) => buildLegacyPaymentRows({
      sourceTable: 'invoices',
      sourceRecord: invoice,
      operationType: 'receipt',
      existingOperationKeys: sourceBackedOperationKeys,
      accountById,
    })));
  } else if (entityType === 'supplier') {
    const invoices = ((primaryRes?.data || []) as any[])
      .filter((invoice) => PURCHASE_INVOICE_STATUSES.has(normalizeStatus(invoice?.status)));
    invoices.forEach((invoice) => {
      const totalAmount = toNumber(invoice?.total_invoice_amount);
      if (totalAmount <= 0) return;
      rows.push({
        key: `purchase_invoice_${invoice.id}`,
        rowType: 'invoice',
        sourceLabel: 'ثبت فاکتور خرید',
        sourceModuleId: 'purchase_invoices',
        sourceRecordId: String(invoice.id),
        paymentType: '',
        status: String(invoice?.status || ''),
        chequeStatus: '',
        date: invoice?.invoice_date || null,
        debit: 0,
        credit: totalAmount,
        invoiceLabel: String(invoice?.name || invoice?.system_code || invoice?.id || '-'),
        bankLabel: '-',
        description: `فاکتور خرید${invoice?.remaining_balance ? ` | مانده: ${String(invoice.remaining_balance)}` : ''}`,
        createdAt: invoice?.created_at || null,
        invoiceRelation: { moduleId: 'purchase_invoices', recordId: String(invoice.id) },
        bankRelation: null,
      });
    });

    rows.push(...invoices.flatMap((invoice) => buildLegacyPaymentRows({
      sourceTable: 'purchase_invoices',
      sourceRecord: invoice,
      operationType: 'payment',
      existingOperationKeys: sourceBackedOperationKeys,
      accountById,
    })));
  } else {
    const payrollSlips = ((primaryRes?.data || []) as any[])
      .filter((slip) => PAYROLL_VISIBLE_STATUSES.has(normalizeStatus(slip?.status)));
    payrollSlips.forEach((slip) => {
      const amount = toNumber(slip?.net_amount);
      if (amount <= 0) return;
      rows.push({
        key: `payroll_${slip.id}`,
        rowType: 'payroll_slip',
        sourceLabel: 'فیش حقوقی',
        sourceModuleId: 'payroll_slips',
        sourceRecordId: String(slip.id),
        paymentType: '',
        status: String(slip?.status || ''),
        chequeStatus: '',
        date: slip?.period_end || null,
        debit: 0,
        credit: amount,
        invoiceLabel: String(slip?.name || slip?.system_code || slip?.id || '-'),
        bankLabel: '-',
        description: 'تعهد پرداخت حقوق',
        createdAt: slip?.created_at || null,
        invoiceRelation: { moduleId: 'payroll_slips', recordId: String(slip.id) },
        bankRelation: null,
      });
    });
    rows.push(...payrollSlips.flatMap((slip) => buildLegacyPaymentRows({
      sourceTable: 'payroll_slips',
      sourceRecord: slip,
      operationType: 'payment',
      existingOperationKeys: sourceBackedOperationKeys,
      accountById,
    })));

    const advances = ((secondaryRes?.data || []) as any[])
      .filter((advance) => ADVANCE_VISIBLE_STATUSES.has(normalizeStatus(advance?.status)));
    advances.forEach((advance) => {
      const amount = toNumber(advance?.amount);
      if (amount <= 0) return;
      rows.push({
        key: `advance_${advance.id}`,
        rowType: 'advance',
        sourceLabel: 'درخواست مساعده',
        sourceModuleId: 'employee_advances',
        sourceRecordId: String(advance.id),
        paymentType: '',
        status: String(advance?.status || ''),
        chequeStatus: '',
        date: advance?.request_date || null,
        debit: 0,
        credit: amount,
        invoiceLabel: String(advance?.name || advance?.system_code || advance?.id || '-'),
        bankLabel: '-',
        description: `مساعده${advance?.remaining_amount ? ` | مانده: ${String(advance.remaining_amount)}` : ''}`,
        createdAt: advance?.created_at || null,
        invoiceRelation: { moduleId: 'employee_advances', recordId: String(advance.id) },
        bankRelation: null,
      });
    });
    rows.push(...advances.flatMap((advance) => buildLegacyPaymentRows({
      sourceTable: 'employee_advances',
      sourceRecord: advance,
      operationType: 'payment',
      existingOperationKeys: sourceBackedOperationKeys,
      accountById,
    })));
  }

  operations
    .filter((operation) => {
      const operationType = normalizeOperationalText(operation?.operation_type);
      if (operationType === 'transfer') return false;
      if (String(operation?.payment_type || '').trim().toLowerCase() === 'cheque' && isFailedCheque(operation?.cheque_status)) return false;
      if (entityType === 'employee' && !isEmployeeFinancialOverviewOperation(operation)) return false;
      return isSettledOperationStatus(operation?.status);
    })
    .forEach((operation) => {
      const amount = Math.abs(toNumber(operation?.amount));
      if (amount <= 0) return;
      const operationType = String(operation?.operation_type || '').trim();
      const { debit, credit } = buildOperationAmountPair(entityType, operationType, amount);
      const accountInfo = resolveOperationAccountInfo(operation, accountById);
      const sourceModuleId = resolveOperationSourceModuleId(operation);
      const sourceRecordId = normalizeOperationalText(
        operation?.sales_invoice_id
        || operation?.purchase_invoice_id
        || operation?.employee_advance_id
        || operation?.payroll_slip_id
        || operation?.id,
      ) || null;
      rows.push({
        key: `op_${operation.id}`,
        rowType: operationType === 'payment' ? 'payment' : 'receipt',
        sourceLabel: isSourceBackedCashBankOperation(operation)
          ? sourceModuleId === 'invoices'
            ? 'دریافت فاکتور فروش'
            : sourceModuleId === 'purchase_invoices'
              ? 'پرداخت فاکتور خرید'
              : sourceModuleId === 'employee_advances'
                ? 'پرداخت مساعده'
                : sourceModuleId === 'payroll_slips'
                  ? 'پرداخت فیش حقوقی'
                  : 'عملیات نقد و بانک'
          : 'ثبت مستقیم نقد و بانک',
        sourceModuleId,
        sourceRecordId,
        paymentType: String(operation?.payment_type || ''),
        status: String(operation?.status || ''),
        chequeStatus: String(operation?.cheque_status || ''),
        date: operation?.operation_date || null,
        debit,
        credit,
        invoiceLabel: sourceRecordId && sourceModuleId !== 'cash_bank_operations'
          ? String(sourceRecordLabelByKey.get(`${sourceModuleId}:${String(sourceRecordId)}`) || sourceRecordId)
          : '-',
        bankLabel: accountInfo.label,
        description: String(operation?.description || ''),
        createdAt: operation?.created_at || null,
        invoiceRelation: sourceRecordId
          ? { moduleId: sourceModuleId, recordId: String(sourceRecordId) }
          : null,
        bankRelation: accountInfo.relation,
      });
    });

  barters
    .filter((barter) => entityType !== 'employee' && normalizeStatus(barter?.status) !== 'canceled')
    .forEach((barter) => {
      const amount = Math.abs(toNumber(barter?.initial_amount));
      if (amount <= 0) return;
      const barterType = normalizeStatus(barter?.barter_type);
      rows.push({
        key: `barter_${barter.id}`,
        rowType: 'barter',
        sourceLabel: 'تهاتر',
        sourceModuleId: 'barters',
        sourceRecordId: String(barter.id),
        paymentType: 'barter',
        status: String(barter?.status || ''),
        chequeStatus: '',
        date: barter?.barter_date || null,
        debit: barterType === 'outgoing' ? amount : 0,
        credit: barterType === 'incoming' ? amount : 0,
        invoiceLabel: String(barter?.name || barter?.system_code || barter?.id || '-'),
        bankLabel: '-',
        description: String(barter?.notes || ''),
        createdAt: barter?.created_at || null,
        invoiceRelation: { moduleId: 'barters', recordId: String(barter.id) },
        bankRelation: null,
      });
    });

  const sortedRows = rows.sort((a, b) => {
    const aDate = new Date(a.date || a.createdAt || 0).getTime();
    const bDate = new Date(b.date || b.createdAt || 0).getTime();
    if (aDate === bDate) return String(a.key).localeCompare(String(b.key));
    return aDate - bDate;
  });

  let runningBalance = 0;
  const finalizedRows = sortedRows.map((row) => {
    runningBalance += Number(row.debit || 0) - Number(row.credit || 0);
    return buildBalanceRow(row, runningBalance);
  });

  const totals = computeOperationalFinancialTotals(finalizedRows);
  return {
    rows: finalizedRows,
    recentItems: [...finalizedRows].sort((a, b) => {
      const aDate = new Date(a.date || a.createdAt || 0).getTime();
      const bDate = new Date(b.date || b.createdAt || 0).getTime();
      return bDate - aDate;
    }).slice(0, 6),
    summary: totals,
    totals,
    printFields: OPERATIONAL_FINANCIAL_PRINT_FIELDS,
  };
};

type LinkedFinancialEntity = {
  entityType: OperationalFinancialEntityType;
  entityId: string;
};

type LinkedFinancialEntityRow = {
  is_customer?: boolean | null;
  is_supplier?: boolean | null;
  is_employee?: boolean | null;
  linked_customer_id?: string | null;
  linked_supplier_id?: string | null;
  linked_employee_id?: string | null;
};

const resolveLinkedFinancialEntities = async (
  supabase: typeof sharedSupabase,
  entityType: OperationalFinancialEntityType,
  entityId: string,
): Promise<LinkedFinancialEntity[]> => {
  const table = entityType === 'customer' ? 'customers' : entityType === 'supplier' ? 'suppliers' : 'employees';
  const fields = entityType === 'customer'
    ? 'is_supplier, is_employee, linked_supplier_id, linked_employee_id'
    : entityType === 'supplier'
      ? 'is_customer, is_employee, linked_customer_id, linked_employee_id'
      : 'is_customer, is_supplier, linked_customer_id, linked_supplier_id';
  const { data, error } = await supabase
    .from(table)
    .select(fields)
    .eq('id', entityId)
    .maybeSingle();

  // تا پیش از اجرای migration جدید، نمایش مالی نقش اصلی باید بدون اختلال ادامه پیدا کند.
  if (error || !data) return [];
  const linkedRow = data as unknown as LinkedFinancialEntityRow;

  const linkedEntities: LinkedFinancialEntity[] = [];
  const add = (type: OperationalFinancialEntityType, id: any, enabled: any) => {
    const normalizedId = normalizeOperationalText(id);
    if (enabled === true && normalizedId) linkedEntities.push({ entityType: type, entityId: normalizedId });
  };

  if (entityType !== 'customer') add('customer', linkedRow.linked_customer_id, linkedRow.is_customer);
  if (entityType !== 'supplier') add('supplier', linkedRow.linked_supplier_id, linkedRow.is_supplier);
  if (entityType !== 'employee') add('employee', linkedRow.linked_employee_id, linkedRow.is_employee);
  return linkedEntities;
};

/**
 * گردش عملیاتی رکورد و نقش‌های مالی متصل آن را یکجا برمی‌گرداند.
 * هر منبع با کلید پایدار خود فقط یک‌بار وارد محاسبه می‌شود تا اتصال دوطرفه باعث دوباره‌شماری نشود.
 */
export const fetchOperationalFinancialOverview = async ({
  entityType,
  entityId,
  supabase = sharedSupabase,
}: OverviewArgs): Promise<OperationalFinancialOverviewResult> => {
  const normalizedEntityId = normalizeOperationalText(entityId);
  if (!normalizedEntityId) return fetchSingleOperationalFinancialOverview({ entityType, entityId, supabase });

  const linkedEntities = await resolveLinkedFinancialEntities(supabase, entityType, normalizedEntityId);
  const overviews = await Promise.all([
    fetchSingleOperationalFinancialOverview({ entityType, entityId: normalizedEntityId, supabase }),
    ...linkedEntities.map((linked) => fetchSingleOperationalFinancialOverview({ ...linked, supabase })),
  ]);

  const distinctRows = Array.from(
    new Map(overviews.flatMap((overview) => overview.rows).map((row) => [row.key, row])).values(),
  ).sort((a, b) => {
    const aDate = new Date(a.date || a.createdAt || 0).getTime();
    const bDate = new Date(b.date || b.createdAt || 0).getTime();
    if (aDate === bDate) return String(a.key).localeCompare(String(b.key));
    return aDate - bDate;
  });

  let runningBalance = 0;
  const rows = distinctRows.map((row) => {
    runningBalance += Number(row.debit || 0) - Number(row.credit || 0);
    return buildBalanceRow(row, runningBalance);
  });
  const totals = computeOperationalFinancialTotals(rows);

  return {
    rows,
    recentItems: [...rows].sort((a, b) => {
      const aDate = new Date(a.date || a.createdAt || 0).getTime();
      const bDate = new Date(b.date || b.createdAt || 0).getTime();
      return bDate - aDate;
    }).slice(0, 6),
    summary: totals,
    totals,
    printFields: OPERATIONAL_FINANCIAL_PRINT_FIELDS,
  };
};
