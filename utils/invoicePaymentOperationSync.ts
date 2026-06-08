import { SupabaseClient } from '@supabase/supabase-js';
import {
  buildCashBankOperationPayloadFromPaymentRow,
  buildSourceOperationKey,
  collectPaymentAccountIds,
  fetchTreasuryAccountModuleMap,
  getOperationalPaymentRowKeyCandidates,
  normalizeOperationalText,
  normalizeRowTags,
  OPERATIONAL_CASH_BANK_SOURCE_MODULES,
  parseCashBankMetadata,
  parseOperationalPayments,
  resolveOperationalPaymentRowKey,
} from './operationalCashBankSources';
import { runWriteWithCompatiblePayload } from './writeCompat';
import { syncRecordTags } from './recordTags';
import { InvoicePaymentAllocationModule } from './invoicePaymentAllocation';

export const syncInvoicePaymentOperations = async (args: {
  supabase: SupabaseClient;
  moduleId: InvoicePaymentAllocationModule;
  invoiceIds: string[];
}) => {
  const source = OPERATIONAL_CASH_BANK_SOURCE_MODULES.find((item) => item.moduleId === args.moduleId);
  const invoiceIds = Array.from(new Set(args.invoiceIds.map((id) => String(id).trim()).filter(Boolean)));
  if (!source || invoiceIds.length === 0) return;

  const { data: records, error: recordsError } = await args.supabase
    .from(source.table)
    .select(source.selectFields.join(','))
    .in('id', invoiceIds);
  if (recordsError) throw recordsError;

  const accountModuleById = await fetchTreasuryAccountModuleMap(
    args.supabase as any,
    collectPaymentAccountIds(records || [], source.accountField)
  );
  const { data: existingOperations, error: operationsError } = await args.supabase
    .from('cash_bank_operations')
    .select('id,status,metadata')
    .in(source.sourceLinkField, invoiceIds);
  if (operationsError) throw operationsError;

  const existingBySourceKey = new Map<string, any>();
  (existingOperations || []).forEach((operation: any) => {
    const metadata = parseCashBankMetadata(operation?.metadata);
    const sourceTable = normalizeOperationalText(metadata?.source_table);
    const sourceRecordId = normalizeOperationalText(metadata?.source_record_id);
    const sourceRowKey = normalizeOperationalText(metadata?.source_row_key);
    if (sourceTable && sourceRecordId && sourceRowKey) {
      existingBySourceKey.set(buildSourceOperationKey(sourceTable, sourceRecordId, sourceRowKey), operation);
    }
  });

  const nowIso = new Date().toISOString();
  for (const record of records || []) {
    const recordId = normalizeOperationalText((record as any)?.id);
    const payments = parseOperationalPayments((record as any)?.payments).map((row) => ({ ...row }));
    let paymentsChanged = false;

    for (let index = 0; index < payments.length; index += 1) {
      const row = payments[index];
      const rowKey = resolveOperationalPaymentRowKey(row, index);
      if (!rowKey) continue;
      const sourceKeys = getOperationalPaymentRowKeyCandidates(row, index)
        .map((candidate) => buildSourceOperationKey(source.moduleId, recordId, candidate));
      const existing = sourceKeys.map((key) => existingBySourceKey.get(key)).find(Boolean);
      const { payload, paymentType, amount, status, rowTags } = buildCashBankOperationPayloadFromPaymentRow({
        source,
        record,
        row,
        rowKey,
        accountModuleById,
        nowIso,
      });

      if (!paymentType || amount <= 0 || status === 'canceled') {
        if (existing && normalizeOperationalText(existing.status) !== 'canceled') {
          const { error } = await args.supabase
            .from('cash_bank_operations')
            .update({ status: 'canceled', metadata: payload.metadata, updated_at: nowIso })
            .eq('id', existing.id);
          if (error) throw error;
        }
        continue;
      }

      if (existing) {
        const result = await runWriteWithCompatiblePayload<null>({
          cacheKey: 'invoice-payment-allocation:operation-update',
          payload,
          execute: (compatiblePayload) =>
            args.supabase.from('cash_bank_operations').update(compatiblePayload).eq('id', existing.id),
        });
        if (result.error) throw result.error;
        await syncRecordTags(args.supabase as any, 'cash_bank_operations', existing.id, rowTags);
        if (normalizeOperationalText(row._cash_bank_operation_id) !== normalizeOperationalText(existing.id)) {
          row._cash_bank_operation_id = existing.id;
          paymentsChanged = true;
        }
        continue;
      }

      const result = await runWriteWithCompatiblePayload<any>({
        cacheKey: 'invoice-payment-allocation:operation-insert',
        payload,
        execute: (compatiblePayload) =>
          args.supabase.from('cash_bank_operations').insert(compatiblePayload).select('id').single(),
      });
      if (result.error) throw result.error;
      const insertedId = normalizeOperationalText(result.data?.id);
      if (insertedId) {
        row._cash_bank_operation_id = insertedId;
        paymentsChanged = true;
        await syncRecordTags(args.supabase as any, 'cash_bank_operations', insertedId, normalizeRowTags(row?.tags));
      }
    }

    if (paymentsChanged) {
      const { error } = await args.supabase
        .from(source.table)
        .update({ payments, updated_at: nowIso })
        .eq('id', recordId);
      if (error) throw error;
    }
  }
};

