import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingPayrollLedgerError } from './payrollLedger';

type CompensationSourceType = 'employee_bonus' | 'employee_penalty';

type CompensationRecord = {
  id: string;
  employee_id: string | null;
  title?: string | null;
  request_date?: string | null;
  effective_date?: string | null;
  created_at?: string | null;
  amount?: number | string | null;
  status?: string | null;
  assignee_id?: string | null;
  reason?: string | null;
  notes?: string | null;
};

type ExistingLedgerRow = {
  id: string;
  source_key?: string | null;
  source_type?: string | null;
  source_record_id?: string | null;
  status?: string | null;
  period_start?: string | null;
  period_end?: string | null;
};

const ELIGIBLE_STATUSES = new Set(['approved', 'completed']);

const toNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildSourceKey = (sourceType: CompensationSourceType, recordId: string) =>
  `${sourceType}:${String(recordId || '').trim()}`;

const parseDateValue = (value: string | null | undefined) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isRecordInPayrollPeriod = (record: CompensationRecord, periodStart: string, periodEnd: string) => {
  const start = parseDateValue(`${periodStart}T00:00:00`);
  const end = parseDateValue(`${periodEnd}T23:59:59`);
  if (!start || !end) return false;
  const date = parseDateValue(record.effective_date)
    || parseDateValue(record.request_date)
    || parseDateValue(record.created_at);
  if (!date) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
};

const buildPayload = (
  sourceType: CompensationSourceType,
  record: CompensationRecord,
  periodStart: string,
  periodEnd: string,
) => {
  const sourceRecordId = String(record.id || '').trim();
  const amount = Math.abs(toNumber(record.amount));
  const signedAmount = sourceType === 'employee_penalty' ? -amount : amount;
  return {
    employee_id: String(record.employee_id || '').trim(),
    period_start: periodStart,
    period_end: periodEnd,
    entry_type: sourceType === 'employee_penalty' ? 'penalty' : 'manual_bonus',
    source_type: sourceType,
    source_key: buildSourceKey(sourceType, sourceRecordId),
    source_module_id: sourceType === 'employee_penalty' ? 'employee_penalty_requests' : 'employee_bonus_requests',
    source_record_id: sourceRecordId || null,
    title: String(record.title || record.reason || (sourceType === 'employee_penalty' ? 'جریمه پرسنلی' : 'پاداش پرسنلی')).trim(),
    amount: signedAmount,
    quantity: null,
    rate: null,
    status: 'proposed',
    assignee_id: record.assignee_id || null,
    details: {
      source_key: buildSourceKey(sourceType, sourceRecordId),
      request_date: record.request_date || null,
      effective_date: record.effective_date || null,
      reason: record.reason || null,
      notes: record.notes || null,
      raw_amount: amount,
      output_type: sourceType === 'employee_penalty' ? 'penalty' : 'bonus',
    },
  };
};

const resolveExistingRowKey = (sourceType: CompensationSourceType, row: ExistingLedgerRow) =>
  String(row.source_key || buildSourceKey(sourceType, String(row.source_record_id || ''))).trim();

const pickPreferredExistingRow = (
  current: ExistingLedgerRow | undefined,
  candidate: ExistingLedgerRow,
  periodStart: string,
  periodEnd: string,
) => {
  if (!current) return candidate;
  const candidateInPeriod = candidate.period_start === periodStart && candidate.period_end === periodEnd;
  const currentInPeriod = current.period_start === periodStart && current.period_end === periodEnd;
  if (candidateInPeriod && !currentInPeriod) return candidate;
  const candidateEditable = ['draft', 'proposed'].includes(String(candidate.status || ''));
  const currentEditable = ['draft', 'proposed'].includes(String(current.status || ''));
  if (candidateEditable && !currentEditable) return candidate;
  return current;
};

const syncCompensationSource = async (
  supabase: SupabaseClient,
  {
    table,
    sourceType,
    employeeIds,
    periodStart,
    periodEnd,
  }: {
    table: 'employee_bonus_requests' | 'employee_penalty_requests';
    sourceType: CompensationSourceType;
    employeeIds: string[];
    periodStart: string;
    periodEnd: string;
  },
) => {
  const recordsResult = await supabase
    .from(table)
    .select('id, employee_id, title, request_date, effective_date, amount, status, assignee_id, reason, notes, created_at')
    .in('employee_id', employeeIds)
    .or(`effective_date.gte.${periodStart},request_date.gte.${periodStart},created_at.gte.${periodStart}`)
    .or(`effective_date.lte.${periodEnd},request_date.lte.${periodEnd},created_at.lte.${periodEnd}`);
  if (recordsResult.error) throw recordsResult.error;

  const initialExistingResult = await supabase
    .from('payroll_calculation_entries')
    .select('id, period_start, period_end, source_key, source_type, source_record_id, status')
    .in('employee_id', employeeIds)
    .eq('source_type', sourceType);
  let existingResult: any = initialExistingResult;
  if (existingResult.error && String(existingResult.error?.message || existingResult.error?.details || '').toLowerCase().includes('source_key')) {
    existingResult = await supabase
      .from('payroll_calculation_entries')
      .select('id, period_start, period_end, source_type, source_record_id, status')
      .in('employee_id', employeeIds)
      .eq('source_type', sourceType);
  }
  if (existingResult.error) {
    if (isMissingPayrollLedgerError(existingResult.error)) return;
    throw existingResult.error;
  }

  const records = ((recordsResult.data || []) as CompensationRecord[])
    .filter((record) => String(record.employee_id || '').trim())
    .filter((record) => isRecordInPayrollPeriod(record, periodStart, periodEnd))
    .filter((record) => Math.abs(toNumber(record.amount)) > 0);
  const desiredRecords = records.filter((record) => ELIGIBLE_STATUSES.has(String(record.status || '').trim().toLowerCase()));

  const existingRows = (existingResult.data || []) as ExistingLedgerRow[];
  const currentPeriodExistingRows = existingRows.filter((row) => row.period_start === periodStart && row.period_end === periodEnd);
  const existingByKey = existingRows.reduce<Map<string, ExistingLedgerRow>>((acc, row) => {
    const key = resolveExistingRowKey(sourceType, row);
    if (!key) return acc;
    acc.set(key, pickPreferredExistingRow(acc.get(key), row, periodStart, periodEnd));
    return acc;
  }, new Map());
  const desiredByKey = new Map(
    desiredRecords.map((record) => [buildSourceKey(sourceType, record.id), record] as const),
  );

  const inserts = desiredRecords
    .filter((record) => !existingByKey.has(buildSourceKey(sourceType, record.id)))
    .map((record) => buildPayload(sourceType, record, periodStart, periodEnd));

  const updates = desiredRecords
    .map((record) => ({ record, existing: existingByKey.get(buildSourceKey(sourceType, record.id)) }))
    .filter((item) => item.existing?.id && String(item.existing.status || '') !== 'included_in_payroll');

  const voidIds = existingRows
    .filter((row) => currentPeriodExistingRows.some((currentRow) => currentRow.id === row.id))
    .filter((row) => {
      const key = resolveExistingRowKey(sourceType, row);
      return !desiredByKey.has(key) && ['draft', 'proposed'].includes(String(row.status || ''));
    })
    .map((row) => String(row.id || '').trim())
    .filter(Boolean);

  if (inserts.length > 0) {
    const { error } = await supabase.from('payroll_calculation_entries').insert(inserts);
    if (error && String(error?.code || '').toUpperCase() !== '23505' && !isMissingPayrollLedgerError(error)) throw error;
  }

  if (updates.length > 0) {
    await Promise.all(updates.map(async ({ record, existing }) => {
      const payload = buildPayload(sourceType, record, periodStart, periodEnd);
      const { error } = await supabase
        .from('payroll_calculation_entries')
        .update({
          period_start: payload.period_start,
          period_end: payload.period_end,
          source_key: payload.source_key,
          source_module_id: payload.source_module_id,
          source_record_id: payload.source_record_id,
          entry_type: payload.entry_type,
          title: payload.title,
          amount: payload.amount,
          assignee_id: payload.assignee_id,
          details: payload.details,
          status: 'proposed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing!.id);
      if (error && !isMissingPayrollLedgerError(error)) throw error;
    }));
  }

  if (voidIds.length > 0) {
    const { error } = await supabase
      .from('payroll_calculation_entries')
      .update({
        status: 'voided',
        updated_at: new Date().toISOString(),
      })
      .in('id', voidIds);
    if (error && !isMissingPayrollLedgerError(error)) throw error;
  }
};

export const syncEmployeeCompensationEntriesForPayroll = async (
  supabase: SupabaseClient,
  {
    employeeIds,
    periodStart,
    periodEnd,
  }: {
    employeeIds: string[];
    periodStart: string;
    periodEnd: string;
  },
) => {
  const normalizedEmployeeIds = Array.from(new Set((employeeIds || []).map((value) => String(value || '').trim()).filter(Boolean)));
  if (normalizedEmployeeIds.length === 0) return;

  await Promise.all([
    syncCompensationSource(supabase, {
      table: 'employee_bonus_requests',
      sourceType: 'employee_bonus',
      employeeIds: normalizedEmployeeIds,
      periodStart,
      periodEnd,
    }),
    syncCompensationSource(supabase, {
      table: 'employee_penalty_requests',
      sourceType: 'employee_penalty',
      employeeIds: normalizedEmployeeIds,
      periodStart,
      periodEnd,
    }),
  ]);
};
