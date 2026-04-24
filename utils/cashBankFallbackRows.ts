import { supabase as sharedSupabase } from '../supabaseClient';
import { resolveOperationalCashBankPaymentType } from './cashBankPaymentType';

type FallbackSupabaseClient = typeof sharedSupabase;

type SourceModule = {
  moduleId: 'invoices' | 'purchase_invoices' | 'expense_documents' | 'employee_advances' | 'payroll_slips';
  table: string;
  operationType: 'receipt' | 'payment';
  dateField: string;
  accountField: 'target_account' | 'source_account';
  selectFields: string[];
};

const SOURCE_MODULES: SourceModule[] = [
  { moduleId: 'invoices', table: 'invoices', operationType: 'receipt', dateField: 'invoice_date', accountField: 'target_account', selectFields: ['id', 'invoice_date', 'customer_id', 'assignee_id', 'payments'] },
  { moduleId: 'purchase_invoices', table: 'purchase_invoices', operationType: 'payment', dateField: 'invoice_date', accountField: 'source_account', selectFields: ['id', 'invoice_date', 'supplier_id', 'assignee_id', 'payments'] },
  { moduleId: 'expense_documents', table: 'expense_documents', operationType: 'payment', dateField: 'expense_date', accountField: 'source_account', selectFields: ['id', 'expense_date', 'customer_id', 'supplier_id', 'assignee_id', 'payments'] },
  { moduleId: 'employee_advances', table: 'employee_advances', operationType: 'payment', dateField: 'request_date', accountField: 'source_account', selectFields: ['id', 'request_date', 'assignee_id', 'payments'] },
  { moduleId: 'payroll_slips', table: 'payroll_slips', operationType: 'payment', dateField: 'period_end', accountField: 'source_account', selectFields: ['id', 'period_end', 'assignee_id', 'payments'] },
];

const BATCH_SIZE = 200;

const normalizeText = (value: any) => String(value ?? '').trim();

const toSafeNumber = (value: any) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const parsePayments = (value: any): Record<string, any>[] => {
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

const fetchAllRows = async (supabase: FallbackSupabaseClient, table: string, selectClause: string) => {
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select(selectClause)
      .range(from, to);
    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }
  return rows;
};

const buildSourceKey = (sourceTable: string, sourceRecordId: string, sourceRowKey: string) =>
  `${sourceTable}:${sourceRecordId}:${sourceRowKey}`;

const resolvePaymentRowAccountId = (row: any, preferredField: 'target_account' | 'source_account') =>
  normalizeText(
    row?.[preferredField]
    || row?.receipt_account_id
    || row?.payment_account_id
    || row?.bank_account_id
    || row?.cash_box_id
    || row?.petty_fund_id
  ) || null;

const resolvePaymentRowAttachment = (row: any) =>
  normalizeText(
    row?.attachment
    || row?.attachment_url
    || row?.file
    || row?.file_url
    || row?.image_url
    || row?.cheque_image_url
  ) || null;

const resolvePaymentRowAssigneeId = (row: any, record: any) =>
  normalizeText(
    row?.responsible_id
    || row?.assignee_id
    || row?.employee_id
    || record?.assignee_id
  ) || null;

const resolvePaymentRowDate = (row: any, record: any, dateField: string) =>
  normalizeText(row?.date || row?.operation_date || row?.receipt_date || row?.payment_date || record?.[dateField]) || null;

const normalizeRowTags = (value: any) => {
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

export const fetchMissingCashBankFallbackRows = async (
  supabase: FallbackSupabaseClient = sharedSupabase,
) => {
  const operations = await fetchAllRows(supabase, 'cash_bank_operations', 'id,metadata,status');
  const existingSourceKeys = new Set<string>();

  operations.forEach((row: any) => {
    const metadata = row?.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : (() => {
          try {
            return typeof row?.metadata === 'string' ? JSON.parse(row.metadata) : null;
          } catch {
            return null;
          }
        })();
    if (!metadata || metadata.is_auto_generated !== true) return;
    const sourceTable = normalizeText(metadata.source_table);
    const sourceRecordId = normalizeText(metadata.source_record_id);
    const sourceRowKey = normalizeText(metadata.source_row_key);
    if (!sourceTable || !sourceRecordId || !sourceRowKey) return;
    if (normalizeText(row?.status) === 'canceled') return;
    existingSourceKeys.add(buildSourceKey(sourceTable, sourceRecordId, sourceRowKey));
  });

  const fallbackRows: any[] = [];

  for (const source of SOURCE_MODULES) {
    const records = await fetchAllRows(supabase, source.table, source.selectFields.join(','));
    for (const record of records) {
      const recordId = normalizeText(record?.id);
      if (!recordId) continue;
      const payments = parsePayments(record?.payments);
      for (let index = 0; index < payments.length; index += 1) {
        const row = payments[index];
        const rowKey =
          normalizeText(row?.row_key || row?._cash_bank_operation_id || row?._barter_allocation_key)
          || `legacy_${index}`;
        const sourceKey = buildSourceKey(source.moduleId, recordId, rowKey);
        if (existingSourceKeys.has(sourceKey)) continue;

        const paymentType = resolveOperationalCashBankPaymentType(row);
        const amount = Math.abs(toSafeNumber(row?.amount));
        const statusRaw = normalizeText(row?.status);
        const status = ['pending', 'received', 'returned', 'canceled'].includes(statusRaw) ? statusRaw : 'pending';
        if (!paymentType || amount <= 0 || status === 'canceled') continue;

        const accountId = resolvePaymentRowAccountId(row, source.accountField);
        const assigneeId = resolvePaymentRowAssigneeId(row, record);
        fallbackRows.push({
          id: `fallback_${sourceKey}`,
          operation_type: source.operationType,
          payment_type: paymentType,
          status,
          operation_date: resolvePaymentRowDate(row, record, source.dateField),
          amount,
          payment_account_id: source.operationType === 'payment' ? accountId : null,
          receipt_account_id: source.operationType === 'receipt' ? accountId : null,
          customer_id: normalizeText(record?.customer_id) || null,
          supplier_id: normalizeText(record?.supplier_id) || null,
          image_url: resolvePaymentRowAttachment(row),
          employee_id: assigneeId,
          assignee_id: assigneeId,
          assignee_type: assigneeId ? 'user' : null,
          assignee_role_id: null,
          description: row?.description || null,
          attachment_url: resolvePaymentRowAttachment(row),
          tags: normalizeRowTags(row?.tags),
          metadata: {
            source_table: source.moduleId,
            source_record_id: recordId,
            source_block_id: 'payments',
            source_row_key: rowKey,
            is_auto_generated: true,
          },
          sales_invoice_id: source.moduleId === 'invoices' ? recordId : null,
          purchase_invoice_id: source.moduleId === 'purchase_invoices' ? recordId : null,
          expense_document_id: source.moduleId === 'expense_documents' ? recordId : null,
          employee_advance_id: source.moduleId === 'employee_advances' ? recordId : null,
          payroll_slip_id: source.moduleId === 'payroll_slips' ? recordId : null,
        });
      }
    }
  }

  return fallbackRows;
};
