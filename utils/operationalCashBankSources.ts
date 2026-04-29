import { supabase as sharedSupabase } from '../supabaseClient';
import { resolveOperationalCashBankPaymentType } from './cashBankPaymentType';
import { transformModulePayloadForSave } from './moduleFormRuntime';

export type OperationalCashBankSupabaseClient = typeof sharedSupabase;

export type OperationalCashBankSourceModule = {
  moduleId: 'invoices' | 'purchase_invoices' | 'expense_documents' | 'employee_advances' | 'payroll_slips';
  table: string;
  operationType: 'receipt' | 'payment';
  dateField: string;
  accountField: 'target_account' | 'source_account';
  sourceLinkField: 'sales_invoice_id' | 'purchase_invoice_id' | 'expense_document_id' | 'employee_advance_id' | 'payroll_slip_id';
  selectFields: string[];
};

export type TreasuryAccountModule = 'bank_accounts' | 'cash_boxes' | 'petty_funds';

export const OPERATIONAL_CASH_BANK_SOURCE_MODULES: OperationalCashBankSourceModule[] = [
  {
    moduleId: 'invoices',
    table: 'invoices',
    operationType: 'receipt',
    dateField: 'invoice_date',
    accountField: 'target_account',
    sourceLinkField: 'sales_invoice_id',
    selectFields: ['id', 'invoice_date', 'customer_id', 'assignee_id', 'payments'],
  },
  {
    moduleId: 'purchase_invoices',
    table: 'purchase_invoices',
    operationType: 'payment',
    dateField: 'invoice_date',
    accountField: 'source_account',
    sourceLinkField: 'purchase_invoice_id',
    selectFields: ['id', 'invoice_date', 'supplier_id', 'assignee_id', 'payments'],
  },
  {
    moduleId: 'expense_documents',
    table: 'expense_documents',
    operationType: 'payment',
    dateField: 'expense_date',
    accountField: 'source_account',
    sourceLinkField: 'expense_document_id',
    selectFields: ['id', 'expense_date', 'customer_id', 'supplier_id', 'assignee_id', 'payments'],
  },
  {
    moduleId: 'employee_advances',
    table: 'employee_advances',
    operationType: 'payment',
    dateField: 'request_date',
    accountField: 'source_account',
    sourceLinkField: 'employee_advance_id',
    selectFields: ['id', 'request_date', 'assignee_id', 'payments'],
  },
  {
    moduleId: 'payroll_slips',
    table: 'payroll_slips',
    operationType: 'payment',
    dateField: 'period_end',
    accountField: 'source_account',
    sourceLinkField: 'payroll_slip_id',
    selectFields: ['id', 'period_end', 'assignee_id', 'payments'],
  },
];

export const OPERATIONAL_CASH_BANK_BATCH_SIZE = 200;

export const normalizeOperationalText = (value: any) => String(value ?? '').trim();

const normalizeDigitsToEnglish = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
};

export const toOperationalSafeNumber = (raw: any) => {
  const normalized = normalizeDigitsToEnglish(raw)
    .replace(/[\u066B]/g, '.')
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/\s+/g, '')
    .replace(/,/g, '');
  const sign = normalized.startsWith('-') ? '-' : '';
  const unsigned = normalized.replace(/-/g, '');
  const cleaned = unsigned.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const numericText = `${sign}${parts[0] ?? ''}${cleaned.includes('.') ? `.${parts.slice(1).join('')}` : ''}`;
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseOperationalPayments = (value: any): Record<string, any>[] => {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const parseCashBankMetadata = (value: any): Record<string, any> | null => {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

export const fetchAllOperationalRows = async (
  supabase: OperationalCashBankSupabaseClient,
  table: string,
  selectClause: string,
) => {
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const to = from + OPERATIONAL_CASH_BANK_BATCH_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select(selectClause)
      .range(from, to);
    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < OPERATIONAL_CASH_BANK_BATCH_SIZE) break;
    from += OPERATIONAL_CASH_BANK_BATCH_SIZE;
  }

  return rows;
};

export const buildSourceOperationKey = (sourceTable: string, sourceRecordId: string, sourceRowKey: string) =>
  `${sourceTable}:${sourceRecordId}:${sourceRowKey}`;

export const getOperationalPaymentRowKeyCandidates = (row: any, index?: number) => {
  const candidates = [
    row?.row_key,
    row?._cash_bank_operation_id,
    row?._barter_allocation_key,
    row?.key !== null && row?.key !== undefined && String(row.key).trim() !== '' ? `key_${row.key}` : null,
    typeof index === 'number' ? `legacy_${index}` : null,
  ]
    .map((item) => normalizeOperationalText(item))
    .filter(Boolean);
  return Array.from(new Set(candidates));
};

export const resolveOperationalPaymentRowKey = (row: any, index?: number) =>
  getOperationalPaymentRowKeyCandidates(row, index)[0] || '';

export const buildOperationMetadata = (moduleId: string, recordId: string, rowKey: string) => ({
  source_table: moduleId,
  source_record_id: recordId,
  source_block_id: 'payments',
  source_row_key: rowKey,
  is_auto_generated: true,
});

export const resolvePaymentRowAccountId = (row: any, preferredField: 'target_account' | 'source_account') =>
  normalizeOperationalText(
    row?.[preferredField]
    || row?.receipt_account_id
    || row?.payment_account_id
    || row?.bank_account_id
    || row?.cash_box_id
    || row?.petty_fund_id
  ) || null;

export const resolvePaymentRowAttachment = (row: any) =>
  normalizeOperationalText(
    row?.attachment
    || row?.attachment_url
    || row?.file
    || row?.file_url
    || row?.image_url
    || row?.cheque_image_url
  ) || null;

export const resolvePaymentRowAssigneeId = (row: any, record: any) =>
  normalizeOperationalText(
    row?.responsible_id
    || row?.assignee_id
    || row?.employee_id
    || record?.assignee_id
  ) || null;

export const resolvePaymentRowDate = (row: any, record: any, dateField: string) =>
  normalizeOperationalText(row?.date || row?.operation_date || row?.receipt_date || row?.payment_date || record?.[dateField]) || null;

export const normalizePaymentRowStatus = (value: any) => {
  const statusRaw = normalizeOperationalText(value).toLowerCase();
  if (['pending', 'received', 'approved', 'returned', 'canceled'].includes(statusRaw)) return statusRaw;
  if (['paid', 'settled', 'cleared', 'done', 'completed'].includes(statusRaw)) return 'received';
  if (['cancelled', 'void'].includes(statusRaw)) return 'canceled';
  if (['تایید شده', 'تأیید شده', 'تاییدشده', 'تأییدشده'].includes(statusRaw)) return 'approved';
  if (['پرداخت شده', 'دریافت شده', 'انجام شده', 'تسویه شده', 'تسویه‌شده'].includes(statusRaw)) return 'received';
  if (['لغو شده', 'لغوشده'].includes(statusRaw)) return 'canceled';
  if (['برگشت', 'برگشتی', 'عودت'].includes(statusRaw)) return 'returned';
  return 'pending';
};

export const normalizeRowTags = (value: any) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        return [];
      }
    }
  }
  return [];
};

export const collectPaymentAccountIds = (
  records: any[],
  accountField: 'target_account' | 'source_account',
) => Array.from(
  new Set(
    (records || [])
      .flatMap((record) => parseOperationalPayments(record?.payments))
      .map((row) => resolvePaymentRowAccountId(row, accountField))
      .filter(Boolean) as string[],
  ),
);

export const fetchTreasuryAccountModuleMap = async (
  supabase: OperationalCashBankSupabaseClient,
  accountIds: string[],
) => {
  const ids = Array.from(new Set((accountIds || []).map((id) => normalizeOperationalText(id)).filter(Boolean)));
  const map = new Map<string, TreasuryAccountModule>();
  if (ids.length === 0) return map;

  const { data: banks, error: banksError } = await supabase
    .from('bank_accounts')
    .select('id')
    .in('id', ids);
  if (banksError) throw banksError;
  (banks || []).forEach((row: any) => {
    const id = normalizeOperationalText(row?.id);
    if (id) map.set(id, 'bank_accounts');
  });

  const { data: cashBoxes, error: cashBoxesError } = await supabase
    .from('cash_boxes')
    .select('id')
    .in('id', ids);
  if (cashBoxesError) throw cashBoxesError;
  (cashBoxes || []).forEach((row: any) => {
    const id = normalizeOperationalText(row?.id);
    if (id && !map.has(id)) map.set(id, 'cash_boxes');
  });

  const { data: pettyFunds, error: pettyFundsError } = await supabase
    .from('petty_funds')
    .select('id')
    .in('id', ids);
  if (pettyFundsError) throw pettyFundsError;
  (pettyFunds || []).forEach((row: any) => {
    const id = normalizeOperationalText(row?.id);
    if (id && !map.has(id)) map.set(id, 'petty_funds');
  });

  return map;
};

export const buildCashBankOperationPayloadFromPaymentRow = (args: {
  source: OperationalCashBankSourceModule;
  record: any;
  row: any;
  rowKey: string;
  accountModuleById?: Map<string, TreasuryAccountModule>;
  nowIso?: string;
}) => {
  const { source, record, row, rowKey, accountModuleById, nowIso } = args;
  const recordId = normalizeOperationalText(record?.id);
  const accountId = resolvePaymentRowAccountId(row, source.accountField);
  const accountModule = accountId ? accountModuleById?.get(accountId) : null;
  const assigneeId = resolvePaymentRowAssigneeId(row, record);
  const paymentType = resolveOperationalCashBankPaymentType(row);
  const rowTags = normalizeRowTags(row?.tags);
  const payload = transformModulePayloadForSave(
    'cash_bank_operations',
    {
      operation_type: source.operationType,
      payment_type: paymentType,
      status: normalizePaymentRowStatus(row?.status),
      operation_date: resolvePaymentRowDate(row, record, source.dateField),
      amount: Math.abs(toOperationalSafeNumber(row?.amount)),
      payment_account_id: source.operationType === 'payment' ? accountId : null,
      receipt_account_id: source.operationType === 'receipt' ? accountId : null,
      customer_id: normalizeOperationalText(record?.customer_id) || null,
      supplier_id: normalizeOperationalText(record?.supplier_id) || null,
      assignee_id: assigneeId,
      assignee_type: assigneeId ? 'user' : null,
      assignee_role_id: null,
      employee_id: assigneeId,
      image_url: resolvePaymentRowAttachment(row),
      description: row?.description || null,
      attachment_url: resolvePaymentRowAttachment(row),
      tags: rowTags,
      barter_id: normalizeOperationalText(row?.barter_id) || null,
      cheque_id: normalizeOperationalText(row?.cheque_id || row?.spent_cheque_id) || null,
      metadata: buildOperationMetadata(source.moduleId, recordId, rowKey),
      ...(nowIso ? { updated_at: nowIso } : {}),
      [source.sourceLinkField]: recordId,
    },
    {
      payment_account_id: source.operationType === 'payment' && accountId && accountModule
        ? [{ value: accountId, module: accountModule }]
        : [],
      receipt_account_id: source.operationType === 'receipt' && accountId && accountModule
        ? [{ value: accountId, module: accountModule }]
        : [],
    },
  );

  return {
    payload,
    paymentType,
    amount: Math.abs(toOperationalSafeNumber(row?.amount)),
    status: normalizePaymentRowStatus(row?.status),
    rowTags,
  };
};
