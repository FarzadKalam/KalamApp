import { supabase as sharedSupabase } from '../supabaseClient';
import {
  OPERATIONAL_CASH_BANK_SOURCE_MODULES,
  buildCashBankOperationPayloadFromPaymentRow,
  buildSourceOperationKey,
  collectPaymentAccountIds,
  fetchAllOperationalRows,
  fetchTreasuryAccountModuleMap,
  getOperationalPaymentRowKeyCandidates,
  normalizeOperationalText,
  parseCashBankMetadata,
  parseOperationalPayments,
  resolveOperationalPaymentRowKey,
} from './operationalCashBankSources';

type FallbackSupabaseClient = typeof sharedSupabase;

export const fetchMissingCashBankFallbackRows = async (
  supabase: FallbackSupabaseClient = sharedSupabase,
) => {
  const operations = await fetchAllOperationalRows(supabase, 'cash_bank_operations', 'id,metadata,status');
  const existingSourceKeys = new Set<string>();

  operations.forEach((row: any) => {
    const metadata = parseCashBankMetadata(row?.metadata);
    if (!metadata || metadata.is_auto_generated !== true) return;
    const sourceTable = normalizeOperationalText(metadata.source_table);
    const sourceRecordId = normalizeOperationalText(metadata.source_record_id);
    const sourceRowKey = normalizeOperationalText(metadata.source_row_key);
    if (!sourceTable || !sourceRecordId || !sourceRowKey) return;
    if (normalizeOperationalText(row?.status) === 'canceled') return;
    existingSourceKeys.add(buildSourceOperationKey(sourceTable, sourceRecordId, sourceRowKey));
  });

  const fallbackRows: any[] = [];

  for (const source of OPERATIONAL_CASH_BANK_SOURCE_MODULES) {
    const records = await fetchAllOperationalRows(supabase, source.table, source.selectFields.join(','));
    const accountModuleById = await fetchTreasuryAccountModuleMap(
      supabase,
      collectPaymentAccountIds(records, source.accountField),
    );

    for (const record of records) {
      const recordId = normalizeOperationalText(record?.id);
      if (!recordId) continue;
      const payments = parseOperationalPayments(record?.payments);
      for (let index = 0; index < payments.length; index += 1) {
        const row = payments[index];
        // پرداخت فیشِ متصل به مساعده صرفاً رابطهٔ تسویه است؛ عملیات واقعیِ
        // خزانه از خود مساعده می‌آید و نباید دوباره ساخته یا نمایش داده شود.
        if (source.moduleId === 'payroll_slips' && normalizeOperationalText(row?.employee_advance_id)) continue;
        const rowKey = resolveOperationalPaymentRowKey(row, index);
        const sourceKeyCandidates = getOperationalPaymentRowKeyCandidates(row, index)
          .map((candidate) => buildSourceOperationKey(source.moduleId, recordId, candidate));
        const sourceKey = buildSourceOperationKey(source.moduleId, recordId, rowKey);
        if (sourceKeyCandidates.some((candidate) => existingSourceKeys.has(candidate))) continue;

        const { payload, paymentType, amount, status } = buildCashBankOperationPayloadFromPaymentRow({
          source,
          record,
          row,
          rowKey,
          accountModuleById,
        });
        if (!paymentType || amount <= 0 || status === 'canceled') continue;

        fallbackRows.push({
          id: `fallback_${sourceKey}`,
          ...payload,
        });
      }
    }
  }

  return fallbackRows;
};
