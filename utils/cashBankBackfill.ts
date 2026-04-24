import { supabase as sharedSupabase } from '../supabaseClient';
import { resolveOperationalCashBankPaymentType } from './cashBankPaymentType';
import { syncRecordTags } from './recordTags';

type BackfillSupabaseClient = typeof sharedSupabase;

type BackfillSourceModule = {
  moduleId: 'invoices' | 'purchase_invoices' | 'expense_documents' | 'employee_advances' | 'payroll_slips';
  table: string;
  operationType: 'receipt' | 'payment';
  dateField: string;
  accountField: 'target_account' | 'source_account';
  sourceLinkField: 'sales_invoice_id' | 'purchase_invoice_id' | 'expense_document_id' | 'employee_advance_id' | 'payroll_slip_id';
  selectFields: string[];
};

type BackfillSummary = {
  inserted: number;
  updated: number;
  canceled: number;
  sourceRowsUpdated: number;
  sourceRecordsUpdated: number;
};

const SOURCE_MODULES: BackfillSourceModule[] = [
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

const BATCH_SIZE = 200;

const normalizeText = (value: any) => String(value ?? '').trim();

const toSafeNumber = (value: any) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const createLocalRowKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

const parseMetadata = (value: any): Record<string, any> | null => {
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

const fetchAllRows = async (supabase: BackfillSupabaseClient, table: string, selectClause: string) => {
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

const buildSourceOperationKey = (moduleId: string, recordId: string, rowKey: string) =>
  `${moduleId}:${recordId}:${rowKey}`;

const buildOperationMetadata = (moduleId: string, recordId: string, rowKey: string) => ({
  source_table: moduleId,
  source_record_id: recordId,
  source_block_id: 'payments',
  source_row_key: rowKey,
  is_auto_generated: true,
});

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

const fetchExistingAutoGeneratedOperations = async (supabase: BackfillSupabaseClient) => {
  const rows = await fetchAllRows(
    supabase,
    'cash_bank_operations',
    'id,metadata,status,operation_type,payment_type,operation_date,amount,bank_account_id,customer_id,supplier_id,employee_id,assignee_id,assignee_type,assignee_role_id,image_url,description,attachment_url,barter_id,cheque_id,sales_invoice_id,purchase_invoice_id,expense_document_id,employee_advance_id,payroll_slip_id,tags',
  );
  const map = new Map<string, any>();
  const byId = new Map<string, any>();

  rows.forEach((row: any) => {
    const rowId = normalizeText(row?.id);
    if (rowId) byId.set(rowId, row);
    const metadata = parseMetadata(row?.metadata);
    if (!metadata || metadata.is_auto_generated !== true) return;
    const sourceTable = normalizeText(metadata.source_table);
    const sourceRecordId = normalizeText(metadata.source_record_id);
    const sourceRowKey = normalizeText(metadata.source_row_key);
    if (!sourceTable || !sourceRecordId || !sourceRowKey) return;
    map.set(buildSourceOperationKey(sourceTable, sourceRecordId, sourceRowKey), { ...row, metadata });
  });

  return { bySourceKey: map, byId };
};

const OPERATION_COMPARE_KEYS = [
  'operation_type',
  'payment_type',
  'status',
  'operation_date',
  'amount',
  'bank_account_id',
  'customer_id',
  'supplier_id',
  'employee_id',
  'assignee_id',
  'assignee_type',
  'assignee_role_id',
  'image_url',
  'description',
  'attachment_url',
  'tags',
  'barter_id',
  'cheque_id',
  'sales_invoice_id',
  'purchase_invoice_id',
  'expense_document_id',
  'employee_advance_id',
  'payroll_slip_id',
] as const;

const sameValue = (left: any, right: any) => {
  if (left === right) return true;
  if (left === null || left === undefined || left === '') {
    return right === null || right === undefined || right === '';
  }
  if (right === null || right === undefined || right === '') return false;
  if (typeof left === 'number' || typeof right === 'number') {
    return Number(left) === Number(right);
  }
  if (typeof left === 'object' || typeof right === 'object') {
    try {
      return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    } catch {
      return false;
    }
  }
  return String(left) === String(right);
};

const shouldUpdateOperation = (existingRow: any, nextPayload: Record<string, any>) =>
  OPERATION_COMPARE_KEYS.some((key) => !sameValue(existingRow?.[key], nextPayload[key]));

export const backfillOperationalCashBankOperations = async (
  supabase: BackfillSupabaseClient = sharedSupabase,
): Promise<BackfillSummary> => {
  const existingOperations = await fetchExistingAutoGeneratedOperations(supabase);
  const nowIso = new Date().toISOString();
  const summary: BackfillSummary = {
    inserted: 0,
    updated: 0,
    canceled: 0,
    sourceRowsUpdated: 0,
    sourceRecordsUpdated: 0,
  };
  const activeSourceKeys = new Set<string>();

  for (const source of SOURCE_MODULES) {
    const records = await fetchAllRows(supabase, source.table, source.selectFields.join(','));

    for (const record of records) {
      const recordId = normalizeText(record?.id);
      if (!recordId) continue;
      const payments = parsePayments(record?.payments);
      if (payments.length === 0) continue;

      const nextPayments = payments.map((row) => ({ ...row }));
      const inserts: Record<string, any>[] = [];
      const insertTargets: number[] = [];
      let sourceChanged = false;

      for (let index = 0; index < nextPayments.length; index += 1) {
        const row = nextPayments[index];
        let rowKey = normalizeText(row?.row_key || row?._cash_bank_operation_id || row?._barter_allocation_key);
        if (!rowKey) {
          rowKey = createLocalRowKey();
          row.row_key = rowKey;
          sourceChanged = true;
          summary.sourceRowsUpdated += 1;
        }

        const sourceKey = buildSourceOperationKey(source.moduleId, recordId, rowKey);
        const existingOperation =
          existingOperations.bySourceKey.get(sourceKey)
          || existingOperations.byId.get(normalizeText(row?._cash_bank_operation_id));
        if (existingOperation) {
          if (normalizeText(row?._cash_bank_operation_id) !== existingOperation.id) {
            row._cash_bank_operation_id = existingOperation.id;
            sourceChanged = true;
            summary.sourceRowsUpdated += 1;
          }
        }

        const paymentType = resolveOperationalCashBankPaymentType(row);
        const amount = Math.abs(toSafeNumber(row?.amount));
        const statusRaw = normalizeText(row?.status);
        const status = ['pending', 'received', 'returned', 'canceled'].includes(statusRaw) ? statusRaw : 'pending';
        if (!paymentType || amount <= 0 || status === 'canceled') {
          if (existingOperation && normalizeText(existingOperation?.status) !== 'canceled') {
            const { error: cancelError } = await supabase
              .from('cash_bank_operations')
              .update({
                status: 'canceled',
                metadata: buildOperationMetadata(source.moduleId, recordId, rowKey),
                updated_at: nowIso,
              })
              .eq('id', existingOperation.id);
            if (cancelError) throw cancelError;
            summary.canceled += 1;
          }
          continue;
        }

        const accountId = resolvePaymentRowAccountId(row, source.accountField);
        const assigneeId = resolvePaymentRowAssigneeId(row, record);
        const rowTags = normalizeRowTags(row?.tags);
        const payload: Record<string, any> = {
          operation_type: source.operationType,
          payment_type: paymentType,
          status,
          operation_date: resolvePaymentRowDate(row, record, source.dateField),
          amount,
          bank_account_id: accountId,
          customer_id: normalizeText(record?.customer_id) || null,
          supplier_id: normalizeText(record?.supplier_id) || null,
          assignee_id: assigneeId,
          assignee_type: assigneeId ? 'user' : null,
          assignee_role_id: null,
          employee_id: assigneeId,
          image_url: resolvePaymentRowAttachment(row),
          description: row?.description || null,
          attachment_url: resolvePaymentRowAttachment(row),
          tags: rowTags,
          barter_id: normalizeText(row?.barter_id) || null,
          cheque_id: normalizeText(row?.cheque_id || row?.spent_cheque_id) || null,
          metadata: buildOperationMetadata(source.moduleId, recordId, rowKey),
          updated_at: nowIso,
          [source.sourceLinkField]: recordId,
        };
        activeSourceKeys.add(sourceKey);

        if (existingOperation) {
          if (shouldUpdateOperation(existingOperation, payload)) {
            const { error: updateError } = await supabase
              .from('cash_bank_operations')
              .update(payload)
              .eq('id', existingOperation.id);
            if (updateError) throw updateError;
            summary.updated += 1;
          }
          await syncRecordTags(supabase, 'cash_bank_operations', existingOperation.id, rowTags);
          existingOperations.bySourceKey.set(sourceKey, {
            ...existingOperation,
            ...payload,
            id: existingOperation.id,
            metadata: payload.metadata,
          });
          continue;
        }

        inserts.push(payload);
        insertTargets.push(index);
      }

      if (inserts.length > 0) {
        const { data: insertedRows, error: insertError } = await supabase
          .from('cash_bank_operations')
          .insert(inserts)
          .select('id,metadata');
        if (insertError) throw insertError;

        for (let insertedIndex = 0; insertedIndex < (insertedRows || []).length; insertedIndex += 1) {
          const insertedRow: any = (insertedRows || [])[insertedIndex];
          const paymentIndex = insertTargets[insertedIndex];
          if (paymentIndex === undefined) continue;
          const insertedId = normalizeText(insertedRow?.id);
          if (!insertedId) continue;
          const paymentRow = nextPayments[paymentIndex];
          nextPayments[paymentIndex]._cash_bank_operation_id = insertedId;
          sourceChanged = true;
          summary.sourceRowsUpdated += 1;
          summary.inserted += 1;
          await syncRecordTags(supabase, 'cash_bank_operations', insertedId, normalizeRowTags(paymentRow?.tags));

          const metadata = parseMetadata(insertedRow?.metadata);
          const sourceTable = normalizeText(metadata?.source_table) || source.moduleId;
          const sourceRecordId = normalizeText(metadata?.source_record_id) || recordId;
          const sourceRowKey = normalizeText(metadata?.source_row_key || nextPayments[paymentIndex]?.row_key);
          if (sourceRowKey) {
            existingOperations.bySourceKey.set(buildSourceOperationKey(sourceTable, sourceRecordId, sourceRowKey), {
              id: insertedId,
              status: 'pending',
              metadata,
            });
            activeSourceKeys.add(buildSourceOperationKey(sourceTable, sourceRecordId, sourceRowKey));
          }
          existingOperations.byId.set(insertedId, insertedRow);
        }
      }

      if (sourceChanged) {
        const { error: updateSourceError } = await supabase
          .from(source.table)
          .update({
            payments: nextPayments,
            updated_at: nowIso,
          })
          .eq('id', recordId);
        if (updateSourceError) throw updateSourceError;
        summary.sourceRecordsUpdated += 1;
      }
    }
  }

  for (const [sourceKey, existingOperation] of existingOperations.bySourceKey.entries()) {
    if (activeSourceKeys.has(sourceKey)) continue;
    if (normalizeText(existingOperation?.status) === 'canceled') continue;
    const metadata = parseMetadata(existingOperation?.metadata);
    const rowKey = normalizeText(metadata?.source_row_key);
    const sourceTable = normalizeText(metadata?.source_table);
    const sourceRecordId = normalizeText(metadata?.source_record_id);
    const { error: cancelError } = await supabase
      .from('cash_bank_operations')
      .update({
        status: 'canceled',
        metadata: buildOperationMetadata(sourceTable, sourceRecordId, rowKey),
        updated_at: nowIso,
      })
      .eq('id', existingOperation.id);
    if (cancelError) throw cancelError;
    summary.canceled += 1;
  }

  return summary;
};
