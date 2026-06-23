import { calculatePayrollSlipTotals } from './payrollSlipTotals';

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
    const totals = calculatePayrollSlipTotals({
      lines: Array.isArray(next.lines) ? next.lines : [],
      payments: Array.isArray(next.payments) ? next.payments : [],
    });
    next.gross_amount = totals.grossAmount;
    next.net_amount = totals.netPayable;
    return next;
  }

  return next;
};
