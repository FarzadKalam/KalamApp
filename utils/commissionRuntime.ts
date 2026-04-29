export type CommissionBasis =
  | 'approved_invoices'
  | 'settled_invoices'
  | 'prepaid_and_settled_invoices'
  | 'settled_and_collected_cheques';

export type CommissionPercentMode = 'product_default' | 'employee_default';

export type CommissionInvoiceRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  invoice_date?: string | null;
  updated_at?: string | null;
  tags?: unknown;
  total_invoice_amount?: number | string | null;
  total_received_amount?: number | string | null;
  remaining_balance?: number | string | null;
  assignee_id?: string | null;
  invoiceItems?: any[] | null;
  payments?: any[] | null;
};

export type CommissionPreviewLine = {
  key: string;
  item_key: string;
  product_id: string | null;
  product_label: string;
  quantity: number;
  net_amount: number;
  commission_percent: number;
  commission_amount: number;
};

export type CommissionPreviewRow = {
  key: string;
  employee_id: string;
  assignee_id: string;
  invoice_id: string;
  invoice_name: string;
  invoice_date: string | null;
  invoice_status: string | null;
  invoice_total_amount: number;
  invoice_received_amount: number;
  invoice_tags: unknown;
  basis: CommissionBasis;
  percent_mode: CommissionPercentMode;
  base_amount: number;
  eligible_ratio: number;
  eligible_amount: number;
  commission_percent: number;
  commission_amount: number;
  item_count: number;
  item_keys: string[];
  lines: CommissionPreviewLine[];
  commission_status: 'calculated' | 'not_calculated';
  exclusion_reason: string | null;
  already_calculated: boolean;
};

const APPROVED_STATUSES = new Set(['confirmed', 'final', 'settled', 'completed']);
const SETTLED_STATUSES = new Set(['settled', 'completed']);
const PREPAYMENT_STATUSES = new Set(['prepayment', 'partially_paid', 'partial_paid']);
const FINAL_PAYMENT_STATUSES = new Set(['approved', 'paid', 'posted', 'settled', 'completed', 'received', 'cleared']);
const COLLECTED_CHEQUE_STATUSES = new Set(['cleared', 'collected', 'cashed', 'settled', 'completed', 'passed']);
const FAILED_CHEQUE_STATUSES = new Set(['bounced', 'returned', 'rejected', 'failed', 'canceled', 'cancelled']);

const toNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampRatio = (value: number) => Math.max(0, Math.min(1, value));

const normalizeText = (value: unknown) => String(value ?? '').trim();

const parseDateTime = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) return null;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? time : null;
};

const isInPeriod = (value: unknown, periodStart?: string | null, periodEnd?: string | null) => {
  if (!periodStart || !periodEnd) return true;
  const time = parseDateTime(value);
  if (time === null) return false;
  const start = new Date(`${periodStart}T00:00:00`).getTime();
  const end = new Date(`${periodEnd}T23:59:59.999`).getTime();
  return time >= start && time <= end;
};

const paymentDate = (payment: any) =>
  payment?.date || payment?.operation_date || payment?.payment_date || payment?.paid_at || payment?.created_at || null;

const discountAmount = (item: any, gross: number) => {
  const discount = Math.max(0, toNumber(item?.discount));
  const type = normalizeText(item?.discount_type || 'amount').toLowerCase();
  return type === 'percent' ? gross * (discount / 100) : discount;
};

const vatAmount = (item: any, net: number) => {
  const vat = Math.max(0, toNumber(item?.vat));
  const type = normalizeText(item?.vat_type || 'percent').toLowerCase();
  return type === 'percent' ? net * (vat / 100) : vat;
};

const resolveInvoiceItemNetAmount = (item: any) => {
  const qty = toNumber(item?.quantity ?? item?.qty ?? item?.usage ?? item?.stock);
  const price = toNumber(item?.unit_price ?? item?.price ?? item?.fee);
  const gross = qty > 0 && price > 0 ? qty * price : toNumber(item?.line_total ?? item?.amount);
  if (gross > 0) return Math.max(0, gross - discountAmount(item, gross));

  const total = toNumber(item?.total_price ?? item?.total);
  if (total <= 0) return 0;
  const vat = vatAmount(item, Math.max(0, total));
  return Math.max(0, total - vat);
};

const resolvePaymentAmount = (payment: any) => {
  const amount = toNumber(payment?.amount);
  return amount > 0 ? amount : 0;
};

const resolveInvoiceReceivedAmount = (invoice: CommissionInvoiceRecord) => {
  const directAmount = toNumber(invoice.total_received_amount);
  if (directAmount > 0) return directAmount;
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  return payments.reduce((sum, payment) => sum + resolvePaymentAmount(payment), 0);
};

const isInvoiceFullySettled = (
  invoice: CommissionInvoiceRecord,
  invoiceTotal: number,
  payments: any[],
) => {
  const status = normalizeText(invoice.status).toLowerCase();
  const hasRemainingBalance = invoice.remaining_balance !== null
    && invoice.remaining_balance !== undefined
    && normalizeText(invoice.remaining_balance) !== '';
  const receivedAmount = resolveInvoiceReceivedAmount(invoice);

  if (hasRemainingBalance) return toNumber(invoice.remaining_balance) <= 0;
  if (receivedAmount > 0) return receivedAmount >= invoiceTotal;
  return SETTLED_STATUSES.has(status) && payments.length === 0;
};

const isFinalPayment = (payment: any) =>
  FINAL_PAYMENT_STATUSES.has(normalizeText(payment?.status).toLowerCase());

const isCollectedChequePayment = (payment: any) => {
  const paymentType = normalizeText(payment?.payment_type).toLowerCase();
  if (paymentType !== 'cheque') return false;
  const chequeStatus = normalizeText(payment?.cheque_status).toLowerCase();
  if (FAILED_CHEQUE_STATUSES.has(chequeStatus)) return false;
  return COLLECTED_CHEQUE_STATUSES.has(chequeStatus);
};

const hasRelevantPeriodSignal = (
  invoice: CommissionInvoiceRecord,
  payments: any[],
  periodStart?: string | null,
  periodEnd?: string | null,
) => {
  if (!periodStart || !periodEnd) return true;
  if (isInPeriod(invoice.invoice_date, periodStart, periodEnd)) return true;
  if (isInPeriod(invoice.updated_at, periodStart, periodEnd)) return true;
  return payments.some((payment) => isInPeriod(paymentDate(payment), periodStart, periodEnd));
};

const sumEligiblePayments = (
  payments: any[],
  {
    periodStart,
    periodEnd,
    requireCollectedCheques,
  }: {
    periodStart?: string | null;
    periodEnd?: string | null;
    requireCollectedCheques?: boolean;
  },
) =>
  payments
    .filter((payment) => {
      if (!isFinalPayment(payment)) return false;
      if (periodStart && periodEnd && paymentDate(payment) && !isInPeriod(paymentDate(payment), periodStart, periodEnd)) return false;
      const paymentType = normalizeText(payment?.payment_type).toLowerCase();
      if (requireCollectedCheques && paymentType === 'cheque') return isCollectedChequePayment(payment);
      return true;
    })
    .reduce((sum, payment) => sum + resolvePaymentAmount(payment), 0);

const getEligibleRatio = (
  invoice: CommissionInvoiceRecord,
  basis: CommissionBasis,
  periodStart?: string | null,
  periodEnd?: string | null,
) => {
  const invoiceTotal = Math.max(0, toNumber(invoice.total_invoice_amount));
  if (invoiceTotal <= 0) return 0;

  const status = normalizeText(invoice.status).toLowerCase();
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  const relevantInPeriod = hasRelevantPeriodSignal(invoice, payments, periodStart, periodEnd);

  if (basis === 'approved_invoices') {
    return APPROVED_STATUSES.has(status) && isInPeriod(invoice.invoice_date || invoice.updated_at, periodStart, periodEnd) ? 1 : 0;
  }

  if (basis === 'settled_invoices') {
    return relevantInPeriod && isInvoiceFullySettled(invoice, invoiceTotal, payments) ? 1 : 0;
  }

  if (basis === 'prepaid_and_settled_invoices') {
    if (SETTLED_STATUSES.has(status) && relevantInPeriod) return 1;
    const paidAmount = sumEligiblePayments(payments, { periodStart, periodEnd });
    if (paidAmount > 0) return clampRatio(paidAmount / invoiceTotal);
    return PREPAYMENT_STATUSES.has(status) && toNumber(invoice.total_received_amount) > 0 && relevantInPeriod
      ? clampRatio(toNumber(invoice.total_received_amount) / invoiceTotal)
      : 0;
  }

  const collectedAmount = sumEligiblePayments(payments, { periodStart, periodEnd, requireCollectedCheques: true });
  if (collectedAmount > 0) return clampRatio(collectedAmount / invoiceTotal);
  return SETTLED_STATUSES.has(status) && relevantInPeriod && payments.length === 0 ? 1 : 0;
};

const getItemKey = (invoiceId: string, item: any, index: number) => {
  const directId = normalizeText(item?.id || item?.row_id || item?.line_id || item?.uuid);
  if (directId) return `${invoiceId}:${directId}`;
  const product = normalizeText(item?.product_id || item?.package_id || item?.description || 'item');
  return `${invoiceId}:${index}:${product}`;
};

const getProductLabel = (item: any, index: number) =>
  normalizeText(item?.product_name || item?.name || item?.title || item?.description || item?.product_id || item?.package_id)
  || `ردیف ${index + 1}`;

const getItemCommissionPercent = (
  item: any,
  employeeId: string,
  mode: CommissionPercentMode,
  employeeDefaultCommissionByEmployeeId: Record<string, number>,
) => {
  if (mode === 'employee_default') return toNumber(employeeDefaultCommissionByEmployeeId[employeeId]);
  const productPercent = toNumber(item?.commission_percentage);
  return productPercent > 0 ? productPercent : toNumber(employeeDefaultCommissionByEmployeeId[employeeId]);
};

const buildCalculatedKey = (basis: CommissionBasis, percentMode: CommissionPercentMode, itemKey: string) =>
  `${basis}::${percentMode}::${itemKey}`;

export const buildCommissionCalculatedKey = buildCalculatedKey;

export const buildCommissionPreviewRows = ({
  invoices,
  employeeIdByAssigneeId,
  employeeDefaultCommissionByEmployeeId,
  basis,
  percentMode = 'product_default',
  periodStart = null,
  periodEnd = null,
  alreadyCalculatedKeys = new Set<string>(),
  includeNotCalculated = false,
  groupByPercent = false,
}: {
  invoices: CommissionInvoiceRecord[];
  employeeIdByAssigneeId: Record<string, string>;
  employeeDefaultCommissionByEmployeeId: Record<string, number>;
  basis: CommissionBasis;
  percentMode?: CommissionPercentMode;
  periodStart?: string | null;
  periodEnd?: string | null;
  alreadyCalculatedKeys?: Set<string>;
  includeNotCalculated?: boolean;
  groupByPercent?: boolean;
}): CommissionPreviewRow[] => {
  const rows: CommissionPreviewRow[] = [];

  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    const assigneeId = normalizeText(invoice.assignee_id);
    const employeeId = assigneeId ? normalizeText(employeeIdByAssigneeId[assigneeId]) : '';
    if (!employeeId) continue;

    const invoiceItems = Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : [];
    if (invoiceItems.length === 0) continue;

    const eligibleRatio = getEligibleRatio(invoice, basis, periodStart, periodEnd);
    const invoiceTotal = Math.max(0, toNumber(invoice.total_invoice_amount));
    const invoiceReceivedAmount = Math.max(0, resolveInvoiceReceivedAmount(invoice));
    const grouped = new Map<string, CommissionPreviewLine[]>();

    invoiceItems.forEach((item, index) => {
      const itemKey = getItemKey(String(invoice.id), item, index);
      const alreadyCalculated = alreadyCalculatedKeys.has(buildCalculatedKey(basis, percentMode, itemKey));
      const netAmount = resolveInvoiceItemNetAmount(item);
      const percent = getItemCommissionPercent(item, employeeId, percentMode, employeeDefaultCommissionByEmployeeId);
      const commissionAmount = netAmount * (percent / 100) * eligibleRatio;
      const productId = normalizeText(item?.product_id || item?.package_id) || null;
      const line: CommissionPreviewLine = {
        key: itemKey,
        item_key: itemKey,
        product_id: productId,
        product_label: getProductLabel(item, index),
        quantity: toNumber(item?.quantity ?? item?.qty ?? 0),
        net_amount: netAmount,
        commission_percent: percent,
        commission_amount: alreadyCalculated ? 0 : commissionAmount,
      };
      const groupKey = groupByPercent ? `${percent}::${alreadyCalculated ? 'done' : 'open'}` : 'invoice';
      grouped.set(groupKey, [...(grouped.get(groupKey) || []), line]);
    });

    Array.from(grouped.values()).forEach((lines, groupIndex) => {
      const itemKeys = lines.map((line) => line.item_key);
      const alreadyCalculated = itemKeys.every((itemKey) => alreadyCalculatedKeys.has(buildCalculatedKey(basis, percentMode, itemKey)));
      const baseAmount = lines.reduce((sum, line) => sum + line.net_amount, 0);
      const commissionAmount = lines.reduce((sum, line) => sum + line.commission_amount, 0);
      const commissionPercent = lines[0]?.commission_percent || 0;
      const status: CommissionPreviewRow['commission_status'] =
        eligibleRatio > 0 && commissionPercent > 0 && baseAmount > 0 && !alreadyCalculated ? 'calculated' : 'not_calculated';
      const exclusionReason =
        alreadyCalculated ? 'قبلا محاسبه شده'
          : eligibleRatio <= 0 ? 'با نوع محاسبه انتخاب‌شده تطبیق ندارد'
            : commissionPercent <= 0 ? 'درصد پورسانت صفر است'
              : baseAmount <= 0 ? 'مبلغ نهایی ردیف صفر است'
                : null;

      if (status === 'not_calculated' && !includeNotCalculated) return;

      rows.push({
        key: `${employeeId}_${invoice.id}_${basis}_${percentMode}_${groupIndex}`,
        employee_id: employeeId,
        assignee_id: assigneeId,
        invoice_id: String(invoice.id),
        invoice_name: normalizeText(invoice.name) || String(invoice.id || 'فاکتور فروش'),
        invoice_date: invoice.invoice_date || null,
        invoice_status: invoice.status || null,
        invoice_total_amount: invoiceTotal,
        invoice_received_amount: invoiceReceivedAmount,
        invoice_tags: invoice.tags ?? null,
        basis,
        percent_mode: percentMode,
        base_amount: baseAmount,
        eligible_ratio: eligibleRatio,
        eligible_amount: invoiceTotal * eligibleRatio,
        commission_percent: commissionPercent,
        commission_amount: commissionAmount,
        item_count: lines.length,
        item_keys: itemKeys,
        lines,
        commission_status: status,
        exclusion_reason: exclusionReason,
        already_calculated: alreadyCalculated,
      });
    });
  }

  return rows.sort((a, b) => {
    const aTime = new Date(a.invoice_date || 0).getTime();
    const bTime = new Date(b.invoice_date || 0).getTime();
    return bTime - aTime;
  });
};
