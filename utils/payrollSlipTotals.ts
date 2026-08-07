const INCLUDED_PAYMENT_STATUSES = new Set(['received', 'paid', 'approved', 'cleared']);

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePaymentStatus = (value: unknown) => String(value || '').trim().toLowerCase();

type PayrollSlipLineLike = {
  line_type?: string | null;
  amount?: unknown;
  total_price?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
};

type PayrollSlipPaymentLike = {
  status?: string | null;
  amount?: unknown;
};

const resolveLineAmount = (line: PayrollSlipLineLike) => {
  const directAmount = toNumber(line?.amount);
  if (directAmount !== 0) return directAmount;
  const totalPrice = toNumber(line?.total_price);
  if (totalPrice !== 0) return totalPrice;
  const quantity = toNumber(line?.quantity);
  const unitPrice = toNumber(line?.unit_price);
  return quantity > 0 && unitPrice > 0 ? quantity * unitPrice : 0;
};

export const sumPayrollSlipLines = (lines: PayrollSlipLineLike[] | null | undefined) => {
  return (Array.isArray(lines) ? lines : []).reduce((sum, line) => {
    const amount = Math.abs(resolveLineAmount(line));
    if (amount === 0) return sum;
    return sum + (String(line?.line_type || '').trim().toLowerCase() === 'deduction' ? -amount : amount);
  }, 0);
};

export const sumPayrollSlipPayments = (payments: PayrollSlipPaymentLike[] | null | undefined) => {
  const rows = Array.isArray(payments) ? payments : [];
  const hasStatusColumn = rows.some((row) => row && Object.prototype.hasOwnProperty.call(row, 'status'));
  return rows.reduce((sum, row) => {
    const status = normalizePaymentStatus(row?.status);
    if (hasStatusColumn && status && !INCLUDED_PAYMENT_STATUSES.has(status)) return sum;
    return sum + Math.abs(toNumber(row?.amount));
  }, 0);
};

export const calculatePayrollSlipTotals = ({
  lines,
  payments,
}: {
  lines?: PayrollSlipLineLike[] | null;
  payments?: PayrollSlipPaymentLike[] | null;
}) => {
  const grossAmount = sumPayrollSlipLines(lines);
  const paidAmount = sumPayrollSlipPayments(payments);
  return {
    grossAmount,
    paidAmount,
    netPayable: grossAmount - paidAmount,
  };
};
