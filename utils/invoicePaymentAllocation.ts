export const INVOICE_PAYMENT_FINAL_STATUSES = new Set(['received', 'paid', 'approved', 'cleared']);

export type InvoicePaymentAllocationModule = 'invoices' | 'purchase_invoices';

export type InvoicePaymentOverflowSegment = {
  sourceRowKey: string;
  amount: number;
  paymentRow: Record<string, any>;
};

export type InvoicePaymentOverflowPlan = {
  excessAmount: number;
  sourcePayments: Record<string, any>[];
  segments: InvoicePaymentOverflowSegment[];
};

export type InvoiceAllocationCandidate = {
  id: string;
  title: string;
  invoiceDate: string | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
};

export type InvoiceAllocationAmount = {
  invoiceId: string;
  amount: number;
};

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export const isInvoicePaymentEffective = (row: Record<string, any> | null | undefined) => {
  if (!row) return false;
  if (!Object.prototype.hasOwnProperty.call(row, 'status')) return true;
  const status = String(row.status || '').trim().toLowerCase();
  return !status || INVOICE_PAYMENT_FINAL_STATUSES.has(status);
};

export const getInvoicePaymentAmount = (row: Record<string, any> | null | undefined) =>
  isInvoicePaymentEffective(row) ? Math.abs(Number(row?.amount) || 0) : 0;

const getRowKey = (row: Record<string, any>, index: number) =>
  String(row?.row_key || row?.id || row?.key || `legacy_${index}`).trim();

export const buildInvoicePaymentOverflowPlan = (args: {
  totalAmount: number;
  previousPayments?: Record<string, any>[];
  nextPayments?: Record<string, any>[];
  allocationGroupKey: string;
}): InvoicePaymentOverflowPlan | null => {
  const totalAmount = Math.max(0, roundMoney(args.totalAmount));
  const previousPayments = Array.isArray(args.previousPayments) ? args.previousPayments : [];
  const nextPayments = (Array.isArray(args.nextPayments) ? args.nextPayments : []).map((row) => ({ ...row }));
  const previousByKey = new Map(
    previousPayments.map((row, index) => [getRowKey(row, index), getInvoicePaymentAmount(row)])
  );
  const nextByKey = new Map(
    nextPayments.map((row, index) => [getRowKey(row, index), getInvoicePaymentAmount(row)])
  );
  const releasedAmount = previousPayments.reduce((sum, row, index) => {
    const rowKey = getRowKey(row, index);
    const previousAmount = getInvoicePaymentAmount(row);
    const nextAmount = nextByKey.get(rowKey) || 0;
    return sum + Math.max(0, previousAmount - nextAmount);
  }, 0);
  let availableAmount = Math.max(
    0,
    roundMoney(
      totalAmount
      - previousPayments.reduce((sum, row) => sum + getInvoicePaymentAmount(row), 0)
      + releasedAmount
    )
  );
  const segments: InvoicePaymentOverflowSegment[] = [];

  nextPayments.forEach((row, index) => {
    const sourceRowKey = getRowKey(row, index);
    const previousAmount = previousByKey.get(sourceRowKey) || 0;
    const nextAmount = getInvoicePaymentAmount(row);
    const increase = Math.max(0, roundMoney(nextAmount - previousAmount));
    if (increase <= 0) return;

    const acceptedIncrease = Math.min(availableAmount, increase);
    const overflow = roundMoney(increase - acceptedIncrease);
    availableAmount = roundMoney(availableAmount - acceptedIncrease);
    if (overflow <= 0) return;

    const sourceAmount = Math.max(0, roundMoney((Number(row.amount) || 0) - overflow));
    row.amount = sourceAmount;
    row.allocation_group_key = args.allocationGroupKey;
    row.row_key = sourceRowKey;
    segments.push({
      sourceRowKey,
      amount: overflow,
      paymentRow: {
        ...row,
        amount: overflow,
        _cash_bank_operation_id: null,
        allocation_group_key: args.allocationGroupKey,
      },
    });
  });

  const excessAmount = roundMoney(segments.reduce((sum, item) => sum + item.amount, 0));
  if (excessAmount <= 0) return null;
  return { excessAmount, sourcePayments: nextPayments, segments };
};

export const autoAllocateInvoiceExcess = (
  excessAmount: number,
  candidates: InvoiceAllocationCandidate[]
): InvoiceAllocationAmount[] => {
  let remaining = Math.max(0, roundMoney(excessAmount));
  const allocations: InvoiceAllocationAmount[] = [];
  for (const candidate of candidates) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, Math.max(0, roundMoney(candidate.remainingAmount)));
    if (amount <= 0) continue;
    allocations.push({ invoiceId: candidate.id, amount });
    remaining = roundMoney(remaining - amount);
  }
  return allocations;
};

export const expandInvoiceAllocationRows = (
  allocations: InvoiceAllocationAmount[],
  segments: InvoicePaymentOverflowSegment[],
  allocationGroupKey: string
) => {
  const mutableSegments = segments.map((segment) => ({ ...segment }));
  let segmentIndex = 0;
  return allocations.flatMap((allocation) => {
    let remaining = roundMoney(allocation.amount);
    const rows: Array<{ invoice_id: string; amount: number; payment_row: Record<string, any> }> = [];
    while (remaining > 0 && segmentIndex < mutableSegments.length) {
      const segment = mutableSegments[segmentIndex];
      const amount = Math.min(remaining, segment.amount);
      rows.push({
        invoice_id: allocation.invoiceId,
        amount,
        payment_row: {
          ...segment.paymentRow,
          amount,
          row_key: `${allocationGroupKey}_${allocation.invoiceId}_${segment.sourceRowKey}`,
          allocation_source_row_key: segment.sourceRowKey,
          allocation_group_key: allocationGroupKey,
        },
      });
      remaining = roundMoney(remaining - amount);
      segment.amount = roundMoney(segment.amount - amount);
      if (segment.amount <= 0) segmentIndex += 1;
    }
    return rows;
  });
};
