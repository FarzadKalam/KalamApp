const toNumber = (value: any) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sumAmounts = (rows: any[], keys: string[]) =>
  (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    const direct = keys.map((key) => toNumber(row?.[key])).find((value) => value !== 0);
    if (direct) return sum + direct;
    const qty = toNumber(row?.quantity);
    const unitPrice = toNumber(row?.unit_price);
    return sum + (qty > 0 && unitPrice > 0 ? qty * unitPrice : 0);
  }, 0);

export const normalizeOperationalDocumentTotals = (moduleId: string, values: any) => {
  const next = { ...(values || {}) };

  if (moduleId === 'expense_documents') {
    const totalAmount = sumAmounts(next.items, ['total_price', 'amount']);
    const paidAmount = sumAmounts(next.payments, ['amount']);
    next.total_amount = totalAmount;
    next.paid_amount = paidAmount;
    next.remaining_amount = Math.max(0, totalAmount - paidAmount);
    return next;
  }

  if (moduleId === 'employee_advances') {
    const amount = toNumber(next.amount);
    const paidAmount = sumAmounts(next.payments, ['amount']);
    next.paid_amount = paidAmount;
    next.remaining_amount = Math.max(0, amount - paidAmount);
    return next;
  }

  if (moduleId === 'payroll_slips') {
    const baseSalary = toNumber(next.base_salary);
    const taskWage = toNumber(next.task_wage_total);
    const bonus = toNumber(next.bonus_total);
    const deductions = toNumber(next.deduction_total);
    const insuranceEmployee = toNumber(next.insurance_employee_amount);
    next.gross_amount = baseSalary + taskWage + bonus;
    next.net_amount = next.gross_amount - deductions - insuranceEmployee;
    return next;
  }

  return next;
};
