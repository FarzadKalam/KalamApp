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

export type PayrollSlipLine = {
  key?: string;
  line_type: 'earning' | 'bonus' | 'deduction';
  title: string;
  amount: number;
  description: string;
  metadata?: Record<string, any>;
  source_entry_id?: string;
  source_entry_ids?: string[];
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
  attendance_excess_presence_exclusion: 'ساعات مازاد حضورِ لحاظ‌نشده',
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
    details.excluded_excess_presence_minutes,
  ];
  for (const candidate of candidates) {
    const minutes = toNumber(candidate);
    if (minutes > 0) return minutes;
  }
  const quantityHours = toNumber(entry.quantity);
  return quantityHours > 0 ? quantityHours * 60 : 0;
};

const isTimeBasedLedgerEntry = (entry: PayrollLedgerEntry) => {
  const sourceType = String(entry.source_type || '').trim();
  return sourceType === 'attendance_overtime'
    || sourceType === 'attendance_early_bonus'
    || sourceType === 'attendance_delay_absence'
    || sourceType === 'attendance_paid_leave'
    || sourceType === 'attendance_excess_presence_exclusion'
    || sourceType === 'attendance_unpaid_leave'
    || sourceType === 'attendance_absence'
    || sourceType === 'attendance_late';
};

const buildLedgerDescription = (entry: PayrollLedgerEntry, currencyLabel: string) => {
  const details = entry.details || {};
  const sourceLabel = resolveLedgerSourceLabel(entry);
  const descriptionParts: string[] = [sourceLabel];
  const minutes = isTimeBasedLedgerEntry(entry) ? resolveLedgerMinutes(entry) : 0;
  const hours = minutes > 0 ? minutes / 60 : 0;
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

const joinDescriptions = (items: string[]) =>
  Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean))).join('؛ ');

const resolveGroupedLedgerTitle = (entries: PayrollLedgerEntry[]) => {
  const first = entries[0];
  const details = first?.details || {};
  const sourceType = String(first?.source_type || '');
  if (sourceType === 'activity_performance') return String(first?.title || details.metric_label || 'حقوق عملکردی');
  if (sourceType === 'goal_reward') return `تحقق هدف - ${String(details.goal_name || first?.title || 'هدف')}`;
  if (sourceType === 'commission') return 'پورسانت‌ها';
  if (sourceType === 'employee_bonus') return 'پاداش‌های دستی';
  if (sourceType === 'employee_penalty') return 'جریمه‌ها';
  if (sourceType === 'attendance_paid_leave') return 'مرخصی‌های با حقوق';
  if (sourceType === 'attendance_overtime') return 'اضافه‌کاری‌ها';
  if (sourceType === 'attendance_early_bonus') return 'پاداش تعجیل';
  if (sourceType === 'attendance_unpaid_leave') return 'مرخصی‌های بدون حقوق';
  if (sourceType === 'attendance_absence') return 'غیبت‌ها';
  if (sourceType === 'attendance_late') return 'تاخیرها';
  if (sourceType === 'attendance_delay_absence') {
    const subtype = String(details.deduction_subtype || '').trim();
    if (subtype === 'unpaid_leave') return 'مرخصی‌های بدون حقوق';
    if (subtype === 'absence') return 'غیبت‌ها';
    if (subtype === 'late') return 'تاخیرها';
    return 'تاخیر / غیبت';
  }
  if (sourceType === 'mission') return 'ماموریت‌ها';
  if (sourceType === 'seniority') return first?.title || 'پایه سنوات';
  return first?.title || resolveLedgerSourceLabel(first);
};

const resolveGroupedLedgerKey = (entry: PayrollLedgerEntry) => {
  const details = entry.details || {};
  const sourceType = String(entry.source_type || '').trim();
  if (sourceType === 'activity_performance') {
    return `activity_performance:${String(details.formula_id || details.source_rule_id || entry.title || entry.entry_type || '').trim()}`;
  }
  if (sourceType === 'goal_reward') return `goal_reward:${String(details.goal_id || entry.source_record_id || entry.title || '').trim()}`;
  if (sourceType === 'commission') return 'commission';
  if (sourceType === 'employee_bonus') return 'employee_bonus';
  if (sourceType === 'employee_penalty') return 'employee_penalty';
  if (sourceType === 'attendance_paid_leave') return 'attendance_paid_leave';
  if (sourceType === 'attendance_overtime') return 'attendance_overtime';
  if (sourceType === 'attendance_early_bonus') return 'attendance_early_bonus';
  if (sourceType === 'attendance_delay_absence') {
    const subtype = String(details.deduction_subtype || '').trim();
    return subtype ? `attendance_${subtype}` : 'attendance_delay_absence';
  }
  if (sourceType === 'mission' || sourceType === 'attendance_mission') return 'mission';
  if (sourceType === 'seniority') return 'seniority';
  return `${sourceType || entry.entry_type}:${String(entry.title || '').trim()}`;
};

export const groupPayrollLedgerEntriesToSlipLines = (entries: PayrollLedgerEntry[], currencyLabel = 'تومان'): PayrollSlipLine[] => {
  const groups = new Map<string, PayrollLedgerEntry[]>();
  entries.forEach((entry) => {
    if (toNumber(entry.amount) === 0) return;
    const key = resolveGroupedLedgerKey(entry);
    groups.set(key, [...(groups.get(key) || []), entry]);
  });

  return Array.from(groups.values())
    .map((group) => {
      const amount = group.reduce((sum, entry) => sum + toNumber(entry.amount), 0);
      if (amount === 0) return null;
      const isDeduction = amount < 0 || group.some((entry) => entry.entry_type === 'penalty' || entry.entry_type === 'employee_purchase');
      return {
        line_type: isDeduction ? 'deduction' : 'bonus',
        title: resolveGroupedLedgerTitle(group),
        amount: Math.abs(amount),
        description: joinDescriptions(group.map((entry) => buildLedgerDescription(entry, currencyLabel))),
        source_entry_id: group.length === 1 ? group[0].id : undefined,
        source_entry_ids: group.map((entry) => entry.id).filter(Boolean),
      } as PayrollSlipLine;
    })
    .filter((item): item is PayrollSlipLine => Boolean(item));
};

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
