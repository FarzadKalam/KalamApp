export type CommissionBasis = 'approved_invoices' | 'settled_invoices' | 'settled_and_collected_cheques';

export type CommissionInvoiceRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  invoice_date?: string | null;
  total_invoice_amount?: number | string | null;
  assignee_id?: string | null;
  invoiceItems?: any[] | null;
  payments?: any[] | null;
};

export type CommissionPreviewRow = {
  employee_id: string;
  invoice_id: string;
  invoice_name: string;
  invoice_date: string | null;
  basis: CommissionBasis;
  base_amount: number;
  eligible_ratio: number;
  eligible_amount: number;
  commission_percent: number;
  commission_amount: number;
  item_count: number;
};

const APPROVED_STATUSES = new Set(['confirmed', 'final', 'settled', 'completed']);
const SETTLED_STATUSES = new Set(['settled', 'completed']);
const FINAL_PAYMENT_STATUSES = new Set(['approved', 'paid', 'posted', 'settled', 'completed']);
const COLLECTED_CHEQUE_STATUSES = new Set(['cleared', 'collected', 'cashed', 'settled', 'completed', 'passed']);
const FAILED_CHEQUE_STATUSES = new Set(['bounced', 'returned', 'rejected', 'failed']);

const toNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampRatio = (value: number) => Math.max(0, Math.min(1, value));

const resolveInvoiceItemAmount = (item: any) => {
  const directAmount = toNumber(item?.line_total ?? item?.total_price ?? item?.total ?? item?.amount);
  if (directAmount > 0) return directAmount;
  return toNumber(item?.quantity) * toNumber(item?.unit_price ?? item?.price ?? item?.fee);
};

const resolvePaymentAmount = (payment: any) => {
  const amount = toNumber(payment?.amount);
  return amount > 0 ? amount : 0;
};

const isFinalPayment = (payment: any) =>
  FINAL_PAYMENT_STATUSES.has(String(payment?.status || '').trim().toLowerCase());

const isCollectedChequePayment = (payment: any) => {
  const paymentType = String(payment?.payment_type || '').trim().toLowerCase();
  if (paymentType !== 'cheque') return false;
  const chequeStatus = String(payment?.cheque_status || '').trim().toLowerCase();
  if (FAILED_CHEQUE_STATUSES.has(chequeStatus)) return false;
  return COLLECTED_CHEQUE_STATUSES.has(chequeStatus);
};

const getEligibleRatio = (invoice: CommissionInvoiceRecord, basis: CommissionBasis) => {
  const invoiceTotal = Math.max(0, toNumber(invoice.total_invoice_amount));
  if (invoiceTotal <= 0) return 0;

  const status = String(invoice.status || '').trim().toLowerCase();
  if (basis === 'approved_invoices') {
    return APPROVED_STATUSES.has(status) ? 1 : 0;
  }
  if (basis === 'settled_invoices') {
    if (SETTLED_STATUSES.has(status)) return 1;
    const paidAmount = (Array.isArray(invoice.payments) ? invoice.payments : [])
      .filter((payment) => isFinalPayment(payment))
      .reduce((sum, payment) => sum + resolvePaymentAmount(payment), 0);
    return clampRatio(paidAmount / invoiceTotal);
  }

  const collectedAmount = (Array.isArray(invoice.payments) ? invoice.payments : [])
    .filter((payment) => {
      if (!isFinalPayment(payment)) return false;
      const paymentType = String(payment?.payment_type || '').trim().toLowerCase();
      if (paymentType === 'cheque') return isCollectedChequePayment(payment);
      return true;
    })
    .reduce((sum, payment) => sum + resolvePaymentAmount(payment), 0);
  return clampRatio(collectedAmount / invoiceTotal);
};

export const buildCommissionPreviewRows = ({
  invoices,
  employeeIdByAssigneeId,
  employeeDefaultCommissionByEmployeeId,
  basis,
}: {
  invoices: CommissionInvoiceRecord[];
  employeeIdByAssigneeId: Record<string, string>;
  employeeDefaultCommissionByEmployeeId: Record<string, number>;
  basis: CommissionBasis;
}): CommissionPreviewRow[] => {
  const rows: CommissionPreviewRow[] = [];

  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    const assigneeId = String(invoice.assignee_id || '').trim();
    const employeeId = assigneeId ? String(employeeIdByAssigneeId[assigneeId] || '').trim() : '';
    if (!employeeId) continue;

    const invoiceItems = Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : [];
    if (invoiceItems.length === 0) continue;

    const baseAmount = invoiceItems.reduce((sum, item) => {
      const lineAmount = Math.max(0, resolveInvoiceItemAmount(item));
      const productPercent = toNumber(item?.commission_percentage);
      const employeePercent = toNumber(employeeDefaultCommissionByEmployeeId[employeeId]);
      const percent = productPercent > 0 ? productPercent : employeePercent;
      return sum + ((lineAmount * percent) / 100);
    }, 0);

    if (baseAmount <= 0) continue;

    const eligibleRatio = getEligibleRatio(invoice, basis);
    const commissionAmount = baseAmount * eligibleRatio;
    if (commissionAmount <= 0) continue;

    rows.push({
      employee_id: employeeId,
      invoice_id: String(invoice.id),
      invoice_name: String(invoice.name || invoice.id || 'فاکتور فروش'),
      invoice_date: invoice.invoice_date || null,
      basis,
      base_amount: baseAmount,
      eligible_ratio: eligibleRatio,
      eligible_amount: Math.max(0, toNumber(invoice.total_invoice_amount)) * eligibleRatio,
      commission_percent: 0,
      commission_amount: commissionAmount,
      item_count: invoiceItems.length,
    });
  }

  return rows.sort((a, b) => {
    const aTime = new Date(a.invoice_date || 0).getTime();
    const bTime = new Date(b.invoice_date || 0).getTime();
    return bTime - aTime;
  });
};
