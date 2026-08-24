import { supabase as sharedSupabase } from '../supabaseClient';
import { getFinancialPaymentTypeLabelFa, getFinancialStatusLabelFa, FINANCIAL_PAYMENT_TYPE_LABELS_FA } from './financialValueLabels';
import { formatPersianNumberWithGrouping } from './persianNumberFormatter';
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
  | 'expense'
  | 'payroll_slip'
  | 'advance'
  | 'club_credit';

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
  // اعتبار باشگاه پول نقد یا ماندهٔ بدهکار/بستانکار نیست؛ جدا نگه می‌داریم
  // تا در سابقه دیده شود اما محاسبهٔ حساب عملیاتی را تغییر ندهد.
  clubCreditAmount?: number;
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
  opening: 'اول دوره',
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
  expense: 'هزینه',
  payroll_slip: 'فیش حقوقی',
  advance: 'مساعده',
  club_credit: 'اعتبار باشگاه مشتریان',
};

// هر نوع گردش رنگ اختصاصی دارد تا در همهٔ نمایش‌های سوابق از هم تفکیک شود.
export const OPERATIONAL_FINANCIAL_ROW_TYPE_COLOR: Record<OperationalFinancialRowType, string> = {
  opening: 'gold',
  invoice: 'blue',
  receipt: 'green',
  payment: 'red',
  barter: 'purple',
  expense: 'orange',
  payroll_slip: 'cyan',
  advance: 'magenta',
  club_credit: 'geekblue',
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
  { key: 'clubCreditAmount', label: 'اعتبار باشگاه', type: 'price' },
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

const FINANCIAL_DESCRIPTION_AMOUNT_PATTERN = /((?:مبلغ|مانده|جمع(?: کل)?|بدهکار|بستانکار)\s*(?:[:：]\s*)?)([-+]?\s*[\d۰-۹٠-٩][\d۰-۹٠-٩٬,٫.]*)/g;

export const formatOperationalFinancialDescription = (value: any) => String(value ?? '').replace(
  FINANCIAL_DESCRIPTION_AMOUNT_PATTERN,
  (_match, label: string, amount: string) => `${label}${formatPersianNumberWithGrouping(amount.replace(/\s+/g, ''))}`,
);

const normalizeStatus = (value: any) => String(value || '').trim().toLowerCase();
const isSettledOperationStatus = (value: any) => SETTLED_OPERATION_STATUSES.has(normalizeStatus(value));
const isFailedCheque = (value: any) => FAILED_CHEQUE_STATUSES.has(normalizeStatus(value));

const buildBalanceRow = (row: Omit<OperationalFinancialRow, 'balance' | 'printableFields'>, balance: number): OperationalFinancialRow => {
  const description = formatOperationalFinancialDescription(row.description);
  return {
    ...row,
    description,
    balance,
    printableFields: {
      rowTypeLabel: OPERATIONAL_FINANCIAL_ROW_TYPE_LABEL[row.rowType] || row.rowType,
      sourceLabel: row.sourceLabel,
      paymentTypeLabel: OPERATIONAL_FINANCIAL_PAYMENT_TYPE_LABEL[row.paymentType] || getFinancialPaymentTypeLabelFa(row.paymentType),
      statusLabel: OPERATIONAL_FINANCIAL_STATUS_LABEL[row.status] || getFinancialStatusLabelFa(row.status),
      date: row.date,
      debit: row.debit,
      credit: row.credit,
      balance,
      invoiceLabel: row.invoiceLabel,
      bankLabel: row.bankLabel,
      description,
    },
  };
};

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

// عملیات مالی متصل به کارمند، از جمله هزینه یا تهاتر، بخشی از سوابق همان شخص است.
// نگه‌داشتن فیلتر محدود اینجا باعث می‌شد یک شخص با چند نقش، بخشی از گردش خود را نبیند.
export const isEmployeeFinancialOverviewOperation = (_operation: any) => true;

/**
 * مساعده‌ای که در فیش حقوقی کسر شده، یک‌بار در خالص همان فیش منعکس شده است.
 * برای سازگاری با فیش‌های قدیمی، هم اتصال مستقیم و هم snapshot فیش بررسی می‌شود.
 */
export const isEmployeeAdvanceIncludedInPayroll = (advance: any, payrollSlips: any[] = []) => {
  if (normalizeOperationalText(advance?.related_payroll_slip_id)) return true;
  const advanceId = normalizeOperationalText(advance?.id);
  if (!advanceId) return false;
  return (Array.isArray(payrollSlips) ? payrollSlips : []).some((slip) => {
    const advanceIds = Array.isArray(slip?.performance_snapshot?.employee_advance_ids)
      ? slip.performance_snapshot.employee_advance_ids
      : [];
    return advanceIds.some((id: unknown) => normalizeOperationalText(id) === advanceId);
  });
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
  sourceTable: 'invoices' | 'purchase_invoices' | 'expense_documents' | 'employee_advances' | 'payroll_slips';
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
            : sourceTable === 'expense_documents'
              ? 'پرداخت هزینه'
            : sourceTable === 'employee_advances'
              ? 'پرداخت مساعده'
              : 'پرداخت فیش حقوقی',
        sourceModuleId: sourceTable,
        sourceRecordId: String(sourceRecord?.id || ''),
        paymentType,
        status: normalizePaymentRowStatus(paymentRow?.status),
        chequeStatus: String(paymentRow?.cheque_status || ''),
        date: resolvePaymentRowDate(paymentRow, sourceRecord, sourceTable === 'employee_advances' ? 'request_date' : sourceTable === 'payroll_slips' ? 'period_end' : sourceTable === 'expense_documents' ? 'expense_date' : 'invoice_date'),
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
  // جمع کارت و footer جدول باید همواره از همان ستون‌های قابل مشاهده به‌دست
  // آید؛ استفاده از ماندهٔ ردیف آخر پس از فیلتر کردن جدول، جمع را نادرست می‌کرد.
  const finalBalance = totalDebit - totalCredit;
  return {
    totalDebit,
    totalCredit,
    finalBalance,
  };
};

export const buildPreviousSystemOpeningAmountPair = (
  entityType: OperationalFinancialEntityType,
  balance: number,
) => {
  const amount = Math.abs(balance);
  const isDebit = entityType === 'customer' ? balance >= 0 : balance < 0;
  return {
    debit: isDebit ? amount : 0,
    credit: isDebit ? 0 : amount,
  };
};

export const getPreviousSystemOpeningDate = (entity: any): string | null => {
  const createdAt = String(entity?.created_at || '').trim();
  return createdAt || null;
};

const buildPreviousSystemOpeningRow = (
  entityType: OperationalFinancialEntityType,
  entity: any,
): Omit<OperationalFinancialRow, 'balance' | 'printableFields'> | null => {
  const balance = toNumber(entity?.previous_system_balance_total);
  const invoiceTotal = toNumber(entity?.previous_system_invoice_total);
  const paidTotal = toNumber(entity?.previous_system_paid_total);
  if (balance === 0 && invoiceTotal === 0 && paidTotal === 0) return null;

  const { debit, credit } = buildPreviousSystemOpeningAmountPair(entityType, balance);
  const hasBalance = Math.abs(balance) > 0;
  const amountDescription = [
    invoiceTotal !== 0 ? `جمع فاکتورهای سیستم قبلی: ${invoiceTotal}` : '',
    paidTotal !== 0 ? `جمع پرداخت‌های سیستم قبلی: ${paidTotal}` : '',
    `مانده اول دوره: ${balance}`,
  ].filter(Boolean).join(' | ');

  return {
    key: `previous_system_opening_${String(entity?.id || '')}`,
    rowType: 'opening',
    sourceLabel: 'مانده اول دوره (سیستم قبلی)',
    sourceModuleId: entityType === 'customer' ? 'customers' : entityType === 'supplier' ? 'suppliers' : 'employees',
    sourceRecordId: String(entity?.id || '') || null,
    paymentType: '',
    status: 'opening',
    chequeStatus: '',
    date: getPreviousSystemOpeningDate(entity),
    debit: hasBalance ? debit : 0,
    credit: hasBalance ? credit : 0,
    invoiceLabel: 'سیستم قبلی',
    bankLabel: '-',
    description: amountDescription,
    createdAt: entity?.created_at || null,
    invoiceRelation: null,
    bankRelation: null,
  };
};

export const fetchSingleOperationalFinancialOverview = async ({
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

  const entityTable = entityType === 'customer' ? 'customers' : entityType === 'supplier' ? 'suppliers' : 'employees';
  const entityRecordQuery = supabase
    .from(entityTable)
    .select('id, created_at, previous_system_first_purchase_date, previous_system_invoice_total, previous_system_paid_total, previous_system_balance_total')
    .eq('id', normalizedEntityId)
    .maybeSingle();

  const primarySourceQuery = entityType === 'customer'
    ? supabase.from('invoices')
      .select('id, name, system_code, invoice_date, status, total_invoice_amount, total_received_amount, remaining_balance, payments, created_at')
      .eq('customer_id', normalizedEntityId)
      .limit(3000)
    : entityType === 'supplier'
      ? supabase.from('purchase_invoices')
        .select('id, name, system_code, invoice_date, status, total_invoice_amount, total_received_amount, remaining_balance, payments, created_at')
        .eq('supplier_id', normalizedEntityId)
        .limit(3000)
      : supabase.from('payroll_slips')
        .select('id, name, system_code, period_end, status, net_amount, payments, performance_snapshot, created_at')
        .eq('employee_id', employeeScope?.employeeId || normalizedEntityId)
        .limit(3000);

  const secondarySourceQuery: PromiseLike<any> = entityType === 'employee'
    ? supabase.from('employee_advances')
      .select('id, name, system_code, request_date, status, amount, paid_amount, remaining_amount, related_payroll_slip_id, payments, created_at')
      .eq('employee_id', employeeScope?.employeeId || normalizedEntityId)
      .limit(3000)
    : Promise.resolve({ data: [], error: null });

  let expenseDocumentsQuery = supabase.from('expense_documents')
    .select('id, name, system_code, expense_date, status, total_amount, paid_amount, remaining_amount, payments, created_at')
    .limit(3000);
  if (entityType === 'customer') {
    expenseDocumentsQuery = expenseDocumentsQuery.eq('customer_id', normalizedEntityId);
  } else if (entityType === 'supplier') {
    expenseDocumentsQuery = expenseDocumentsQuery.eq('supplier_id', normalizedEntityId);
  } else {
    const employeeIds = employeeScope?.profileIds || [normalizedEntityId];
    expenseDocumentsQuery = employeeIds.length > 1
      ? expenseDocumentsQuery.in('employee_id', employeeIds)
      : expenseDocumentsQuery.eq('employee_id', employeeIds[0]);
  }

  const [entityRes, opsRes, barterRes, primaryRes, secondaryRes, expensesRes] = await Promise.all([
    entityRecordQuery,
    entityOperationsQuery,
    entityBartersQuery,
    primarySourceQuery,
    secondarySourceQuery,
    expenseDocumentsQuery,
  ]);
  const sourceError = entityRes?.error || opsRes?.error || barterRes?.error || primaryRes?.error || secondaryRes?.error || expensesRes?.error;
  if (sourceError) throw sourceError;

  const entityRecord = entityRes?.data || null;
  const operations = (opsRes?.data || []) as any[];
  const barters = (barterRes?.data || []) as any[];
  const primaryRows = (primaryRes?.data || []) as any[];
  const secondaryRows = (secondaryRes?.data || []) as any[];
  const expenseRows = (expensesRes?.data || []) as any[];
  const sourceRecordLabelByKey = new Map<string, string>();
  [...primaryRows, ...secondaryRows, ...expenseRows].forEach((row: any) => {
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
      if (row?.expense_date !== undefined) {
        sourceRecordLabelByKey.set(`expense_documents:${rowId}`, label);
      }
    }
  });
  const sourceBackedOperationKeys = buildExistingSourceOperationKeys(operations);
  const rows: Array<Omit<OperationalFinancialRow, 'balance' | 'printableFields'>> = [];
  const openingRow = buildPreviousSystemOpeningRow(entityType, entityRecord);
  if (openingRow) rows.push(openingRow);
  const payrollSlips = entityType === 'employee'
    ? primaryRows.filter((slip) => PAYROLL_VISIBLE_STATUSES.has(normalizeStatus(slip?.status)))
    : [];
  const payrollDeductedAdvanceIds = new Set(
    secondaryRows
      .filter((advance) => isEmployeeAdvanceIncludedInPayroll(advance, payrollSlips))
      .map((advance) => normalizeOperationalText(advance?.id))
      .filter(Boolean),
  );

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
      .filter((advance) => (
        ADVANCE_VISIBLE_STATUSES.has(normalizeStatus(advance?.status))
        && !payrollDeductedAdvanceIds.has(normalizeOperationalText(advance?.id))
      ));
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

  const expenses = expenseRows
    .filter((expense) => ['approved', 'paid', 'posted', 'settled', 'completed'].includes(normalizeStatus(expense?.status)));
  expenses.forEach((expense) => {
    const amount = toNumber(expense?.total_amount);
    if (amount <= 0) return;
    rows.push({
      key: `expense_${expense.id}`,
      rowType: 'expense',
      sourceLabel: 'ثبت هزینه',
      sourceModuleId: 'expense_documents',
      sourceRecordId: String(expense.id),
      paymentType: '',
      status: String(expense?.status || ''),
      chequeStatus: '',
      date: expense?.expense_date || null,
      debit: 0,
      credit: amount,
      invoiceLabel: String(expense?.name || expense?.system_code || expense?.id || '-'),
      bankLabel: '-',
      description: `هزینه${expense?.remaining_amount ? ` | مانده: ${String(expense.remaining_amount)}` : ''}`,
      createdAt: expense?.created_at || null,
      invoiceRelation: { moduleId: 'expense_documents', recordId: String(expense.id) },
      bankRelation: null,
    });
  });
  rows.push(...expenses.flatMap((expense) => buildLegacyPaymentRows({
    sourceTable: 'expense_documents',
    sourceRecord: expense,
    operationType: 'payment',
    existingOperationKeys: sourceBackedOperationKeys,
    accountById,
  })));

  operations
    .filter((operation) => {
      const operationType = normalizeOperationalText(operation?.operation_type);
      if (operationType === 'transfer') return false;
      if (String(operation?.payment_type || '').trim().toLowerCase() === 'cheque' && isFailedCheque(operation?.cheque_status)) return false;
      const metadata = parseCashBankMetadata(operation?.metadata);
      const sourceModuleId = resolveOperationSourceModuleId(operation);
      const advanceId = sourceModuleId === 'employee_advances'
        ? normalizeOperationalText(operation?.employee_advance_id || metadata?.source_record_id)
        : '';
      if (advanceId && payrollDeductedAdvanceIds.has(advanceId)) return false;
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
        || operation?.expense_document_id
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
                  : sourceModuleId === 'expense_documents'
                    ? 'پرداخت هزینه'
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
    .filter((barter) => normalizeStatus(barter?.status) !== 'canceled')
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
    if (a.rowType === 'opening' && b.rowType !== 'opening') return -1;
    if (a.rowType !== 'opening' && b.rowType === 'opening') return 1;
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
  linked_customer_id?: string | null;
  linked_supplier_id?: string | null;
  linked_employee_id?: string | null;
};

export const resolveLinkedFinancialEntities = async (
  supabase: typeof sharedSupabase,
  entityType: OperationalFinancialEntityType,
  entityId: string,
): Promise<LinkedFinancialEntity[]> => {
  const queue: LinkedFinancialEntity[] = [{ entityType, entityId }];
  const seen = new Set<string>();
  const linked = new Map<string, LinkedFinancialEntity>();
  const add = (type: OperationalFinancialEntityType, id: any) => {
    const normalizedId = normalizeOperationalText(id);
    if (!normalizedId) return;
    const key = `${type}:${normalizedId}`;
    if (!seen.has(key)) queue.push({ entityType: type, entityId: normalizedId });
    if (key !== `${entityType}:${entityId}`) linked.set(key, { entityType: type, entityId: normalizedId });
  };

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = `${current.entityType}:${current.entityId}`;
    if (seen.has(currentKey)) continue;
    seen.add(currentKey);

    const table = current.entityType === 'customer' ? 'customers' : current.entityType === 'supplier' ? 'suppliers' : 'employees';
    const fields = current.entityType === 'customer'
      ? 'linked_supplier_id, linked_employee_id'
      : current.entityType === 'supplier'
        ? 'linked_customer_id, linked_employee_id'
        : 'linked_customer_id, linked_supplier_id';
    const { data, error } = await supabase.from(table).select(fields).eq('id', current.entityId).maybeSingle();
    // لینک ناقص یا migration اجرا نشده نباید نمایش نقش اصلی را از کار بیندازد.
    if (error || !data) continue;
    const row = data as unknown as LinkedFinancialEntityRow;

    if (current.entityType !== 'customer') add('customer', row.linked_customer_id);
    if (current.entityType !== 'supplier') add('supplier', row.linked_supplier_id);
    if (current.entityType !== 'employee') add('employee', row.linked_employee_id);

    const reverseRequests = current.entityType === 'customer'
      ? [
        supabase.from('suppliers').select('id').eq('linked_customer_id', current.entityId),
        supabase.from('employees').select('id').eq('linked_customer_id', current.entityId),
      ]
      : current.entityType === 'supplier'
        ? [
          supabase.from('customers').select('id').eq('linked_supplier_id', current.entityId),
          supabase.from('employees').select('id').eq('linked_supplier_id', current.entityId),
        ]
        : [
          supabase.from('customers').select('id').eq('linked_employee_id', current.entityId),
          supabase.from('suppliers').select('id').eq('linked_employee_id', current.entityId),
        ];
    const [firstReverse, secondReverse] = await Promise.all(reverseRequests);
    if (current.entityType === 'customer') {
      (firstReverse.data || []).forEach((item: any) => add('supplier', item?.id));
      (secondReverse.data || []).forEach((item: any) => add('employee', item?.id));
    } else if (current.entityType === 'supplier') {
      (firstReverse.data || []).forEach((item: any) => add('customer', item?.id));
      (secondReverse.data || []).forEach((item: any) => add('employee', item?.id));
    } else {
      (firstReverse.data || []).forEach((item: any) => add('customer', item?.id));
      (secondReverse.data || []).forEach((item: any) => add('supplier', item?.id));
    }
  }

  return Array.from(linked.values());
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
  if (!normalizedEntityId) {
    return {
      rows: [],
      recentItems: [],
      summary: { totalDebit: 0, totalCredit: 0, finalBalance: 0 },
      totals: { totalDebit: 0, totalCredit: 0, finalBalance: 0 },
      printFields: OPERATIONAL_FINANCIAL_PRINT_FIELDS,
    };
  }

  // صفحهٔ داخلی و کارت حساب آنلاین هر دو از همین RPC سروری استفاده می‌کنند.
  // هیچ fallback کلاینتی نداریم تا یک رکورد در دو مسیر با دو منطق متفاوت
  // محاسبه نشود.
  const [{ data, error }, { data: clubHistoryData, error: clubHistoryError }] = await Promise.all([
    supabase.rpc('get_operational_financial_history', {
      p_entity_type: entityType,
      p_entity_id: normalizedEntityId,
    }),
    supabase.rpc('get_customer_club_financial_history', {
      p_entity_type: entityType,
      p_entity_id: normalizedEntityId,
    }),
  ]);
  if (error) throw error;
  if (clubHistoryError) throw clubHistoryError;

  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, any>;
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const allowedRowTypes = new Set<OperationalFinancialRowType>([
    'opening', 'invoice', 'receipt', 'payment', 'barter', 'expense', 'payroll_slip', 'advance', 'club_credit',
  ]);
  const rows = rawRows.map((raw: any, index: number) => {
    const rowTypeCandidate = String(raw?.row_type || 'payment') as OperationalFinancialRowType;
    const rowType = allowedRowTypes.has(rowTypeCandidate) ? rowTypeCandidate : 'payment';
    const sourceModuleId = normalizeOperationalText(raw?.source_module_id || 'cash_bank_operations');
    const sourceRecordId = normalizeOperationalText(raw?.source_record_id) || null;
    const bankModuleId = normalizeOperationalText(raw?.bank_module_id);
    const bankRecordId = normalizeOperationalText(raw?.bank_record_id);
    return buildBalanceRow({
      key: normalizeOperationalText(raw?.key) || `financial_row_${index}`,
      rowType,
      sourceLabel: String(raw?.source_label || 'ثبت مالی'),
      sourceModuleId,
      sourceRecordId,
      paymentType: String(raw?.payment_type || ''),
      status: String(raw?.status || ''),
      chequeStatus: String(raw?.cheque_status || ''),
      date: raw?.date || null,
      debit: toNumber(raw?.debit),
      credit: toNumber(raw?.credit),
      clubCreditAmount: toNumber(raw?.club_credit_amount),
      invoiceLabel: String(raw?.invoice_label || '-'),
      bankLabel: String(raw?.bank_label || '-'),
      description: String(raw?.description || ''),
      createdAt: raw?.created_at || null,
      invoiceRelation: sourceRecordId && sourceModuleId
        ? { moduleId: sourceModuleId, recordId: sourceRecordId }
        : null,
      bankRelation: bankModuleId && bankRecordId
        ? { moduleId: bankModuleId, recordId: bankRecordId }
        : null,
    }, toNumber(raw?.balance));
  });
  const clubRows = Array.isArray(clubHistoryData) ? clubHistoryData : [];
  clubRows.forEach((raw: any, index: number) => {
    rows.push(buildBalanceRow({
      key: normalizeOperationalText(raw?.key) || `club_credit_${index}`,
      rowType: 'club_credit',
      sourceLabel: String(raw?.source_label || 'باشگاه مشتریان'),
      sourceModuleId: 'customer_club',
      sourceRecordId: null,
      paymentType: '',
      status: String(raw?.status || 'ثبت شده'),
      chequeStatus: '',
      date: raw?.date || null,
      debit: 0,
      credit: 0,
      clubCreditAmount: toNumber(raw?.club_credit_amount),
      invoiceLabel: String(raw?.invoice_label || '-'),
      bankLabel: '-',
      description: String(raw?.description || ''),
      createdAt: raw?.created_at || null,
      invoiceRelation: null,
      bankRelation: null,
    }, 0));
  });
  const rawSummary = payload.summary && typeof payload.summary === 'object' ? payload.summary : {};
  const totals = {
    totalDebit: toNumber(rawSummary.total_debit),
    totalCredit: toNumber(rawSummary.total_credit),
    finalBalance: toNumber(rawSummary.final_balance),
  };

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
