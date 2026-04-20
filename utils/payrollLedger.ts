import { SupabaseClient } from '@supabase/supabase-js';

export type PayrollLedgerEntry = {
  id: string;
  employee_id: string | null;
  entry_type: string;
  source_type: string;
  title: string | null;
  amount: number | string | null;
  details?: Record<string, any> | null;
};

export const isMissingPayrollLedgerError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('payroll_calculation_entries') && (text.includes('does not exist') || text.includes('could not find'));
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const fetchPayrollLedgerEntries = async (
  supabase: SupabaseClient,
  employeeIds: string[],
  periodStart: string,
  periodEnd: string,
): Promise<PayrollLedgerEntry[]> => {
  if (employeeIds.length === 0) return [];
  const { data, error } = await supabase
    .from('payroll_calculation_entries')
    .select('id, employee_id, entry_type, source_type, title, amount, details')
    .in('employee_id', employeeIds)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .in('status', ['draft', 'proposed']);

  if (error) {
    if (isMissingPayrollLedgerError(error)) return [];
    throw error;
  }

  return (data || []) as PayrollLedgerEntry[];
};

export const mapPayrollLedgerEntriesToLines = (entries: PayrollLedgerEntry[]) =>
  entries
    .map((entry) => {
      const amount = toNumber(entry.amount);
      if (amount === 0) return null;
      const isDeduction = amount < 0 || entry.entry_type === 'penalty' || entry.entry_type === 'employee_purchase';
      return {
        line_type: isDeduction ? 'deduction' : 'bonus',
        title: entry.title || 'آیتم محاسباتی فیش',
        amount: Math.abs(amount),
        description: `منبع: ${entry.source_type || entry.entry_type || '-'}`,
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
