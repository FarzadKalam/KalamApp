import { SupabaseClient } from '@supabase/supabase-js';

export type PayrollLedgerEntry = {
  id: string;
  employee_id: string | null;
  entry_type: string;
  source_type: string;
  source_record_id?: string | null;
  source_key?: string | null;
  title: string | null;
  amount: number | string | null;
  quantity?: number | string | null;
  rate?: number | string | null;
  details?: Record<string, any> | null;
};

export const isMissingPayrollLedgerError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('payroll_calculation_entries') && (text.includes('does not exist') || text.includes('could not find'));
};

const isMissingSourceKeyError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('source_key') && (text.includes('column') || text.includes('could not find') || text.includes('schema cache'));
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const PAYROLL_LEDGER_SOURCE_LABELS: Record<string, string> = {
  activity_performance: 'عملکرد فعالیت',
  commission: 'پورسانت',
  goal_reward: 'پاداش هدف',
  attendance_overtime: 'اضافه‌کاری تردد',
  attendance_early_bonus: 'پاداش تعجیل',
  attendance_delay_absence: 'تاخیر / غیبت',
  attendance_paid_leave: 'مرخصی با حقوق',
  employee_bonus: 'پاداش پرسنلی',
  employee_penalty: 'جریمه پرسنلی',
  seniority: 'پایه سنوات',
};

const formatNumber = (value: number, fractionDigits = 2) =>
  value.toLocaleString('fa-IR', { maximumFractionDigits: fractionDigits });

const resolveLedgerSourceLabel = (entry: PayrollLedgerEntry) =>
  PAYROLL_LEDGER_SOURCE_LABELS[String(entry.source_type || '').trim()]
  || PAYROLL_LEDGER_SOURCE_LABELS[String(entry.entry_type || '').trim()]
  || String(entry.title || entry.source_type || entry.entry_type || 'آیتم فیش');

const resolveLedgerMinutes = (entry: PayrollLedgerEntry) => {
  const details = entry.details || {};
  const candidates = [
    details.minutes,
    details.overtime_minutes,
    details.early_bonus_minutes,
    details.delay_absence_minutes,
    details.paid_leave_minutes,
    details.unpaid_leave_minutes,
  ];
  for (const candidate of candidates) {
    const minutes = toNumber(candidate);
    if (minutes > 0) return minutes;
  }
  const quantityHours = toNumber(entry.quantity);
  return quantityHours > 0 ? quantityHours * 60 : 0;
};

const buildLedgerDescription = (entry: PayrollLedgerEntry, currencyLabel: string) => {
  const details = entry.details || {};
  const sourceLabel = resolveLedgerSourceLabel(entry);
  const descriptionParts: string[] = [sourceLabel];
  const minutes = resolveLedgerMinutes(entry);
  const hours = minutes > 0 ? minutes / 60 : toNumber(entry.quantity);
  const rate = toNumber(entry.rate || details.rate);

  if (hours > 0 && rate > 0) {
    descriptionParts.push(`${formatNumber(hours)} ساعت × ${formatNumber(rate, 0)} ${currencyLabel}`);
  } else if (hours > 0) {
    descriptionParts.push(`${formatNumber(hours)} ساعت`);
  }

  const attendanceDate = String(details.attendance_date || '').trim();
  if (attendanceDate) descriptionParts.push(`تاریخ: ${attendanceDate}`);

  if (String(entry.source_type || '') === 'commission') {
    const invoiceCount = toNumber(details.invoice_count);
    const itemCount = toNumber(details.item_count);
    if (invoiceCount > 0) descriptionParts.push(`${formatNumber(invoiceCount, 0)} فاکتور`);
    if (itemCount > 0) descriptionParts.push(`${formatNumber(itemCount, 0)} ردیف کالا/خدمت`);
  }

  if (String(entry.source_type || '') === 'employee_bonus' || String(entry.source_type || '') === 'employee_penalty') {
    const effectiveDate = String(details.effective_date || details.request_date || '').trim();
    const reason = String(details.reason || details.notes || '').trim();
    if (effectiveDate) descriptionParts.push(`تاریخ اعمال: ${effectiveDate}`);
    if (reason) descriptionParts.push(reason);
  }

  return descriptionParts.join('؛ ');
};

export const fetchPayrollLedgerEntries = async (
  supabase: SupabaseClient,
  employeeIds: string[],
  periodStart: string,
  periodEnd: string,
): Promise<PayrollLedgerEntry[]> => {
  if (employeeIds.length === 0) return [];

  const runQuery = (selectColumns: string) => supabase
    .from('payroll_calculation_entries')
    .select(selectColumns)
    .in('employee_id', employeeIds)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .in('status', ['draft', 'proposed']);

  let { data, error } = await runQuery('id, employee_id, entry_type, source_type, source_record_id, source_key, title, amount, quantity, rate, details');
  if (error && isMissingSourceKeyError(error)) {
    const fallback = await runQuery('id, employee_id, entry_type, source_type, source_record_id, title, amount, quantity, rate, details');
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingPayrollLedgerError(error)) return [];
    throw error;
  }

  return (data || []) as unknown as PayrollLedgerEntry[];
};

export const mapPayrollLedgerEntriesToLines = (entries: PayrollLedgerEntry[], currencyLabel = 'تومان') =>
  entries
    .map((entry) => {
      const amount = toNumber(entry.amount);
      if (amount === 0) return null;
      const isDeduction = amount < 0 || entry.entry_type === 'penalty' || entry.entry_type === 'employee_purchase';
      return {
        line_type: isDeduction ? 'deduction' : 'bonus',
        title: entry.title || 'آیتم محاسباتی فیش',
        amount: Math.abs(amount),
        description: buildLedgerDescription(entry, currencyLabel),
        source_entry_id: entry.id,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

export const sumPayrollLedgerEntries = (entries: PayrollLedgerEntry[]) =>
  entries.reduce((sum, entry) => sum + toNumber(entry.amount), 0);

export const markPayrollLedgerEntriesIncluded = async (
  supabase: SupabaseClient,
  entryIds: string[],
  payrollSlipId: string,
) => {
  if (entryIds.length === 0 || !payrollSlipId) return;
  const { error } = await supabase
    .from('payroll_calculation_entries')
    .update({
      status: 'included_in_payroll',
      payroll_slip_id: payrollSlipId,
      updated_at: new Date().toISOString(),
    })
    .in('id', entryIds);
  if (error && !isMissingPayrollLedgerError(error)) throw error;
};
