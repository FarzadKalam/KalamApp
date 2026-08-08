/** فیلدهای خلاصهٔ سروری فیش که پس از ذخیرهٔ هر جدول باید دوباره خوانده شوند. */
export const PAYROLL_SLIP_SERVER_SUMMARY_SELECT = [
  'lines',
  'payments',
  'base_salary',
  'task_wage_total',
  'bonus_total',
  'earnings_total',
  'deduction_total',
  'insurance_employee_amount',
  'insurance_employer_amount',
  'gross_amount',
  'net_amount',
  'updated_at',
].join(',');

export const fetchPayrollSlipServerSummary = async (
  supabaseClient: any,
  payrollSlipId: string,
): Promise<Record<string, any>> => {
  const { data, error } = await supabaseClient
    .from('payroll_slips')
    .select(PAYROLL_SLIP_SERVER_SUMMARY_SELECT)
    .eq('id', payrollSlipId)
    .maybeSingle();
  if (error) throw error;
  return data || {};
};
