export type CommissionBasis =
  | 'approved_invoices'
  | 'settled_invoices'
  | 'prepaid_and_settled_invoices'
  | 'prepaid_and_collected_cheques'
  | 'settled_and_collected_cheques'
  | 'full_settlement_only';

export type CommissionPercentMode = 'product_default' | 'employee_default';

export type CommissionDecisionStatus = 'auto' | 'include' | 'exclude' | 'defer_to_next_period';

export type CommissionDraftRecordStatus = 'draft' | 'posted' | 'canceled';

export type CommissionReviewBucket = 'current_period' | 'backlog' | 'excluded';

export type CommissionInvoiceRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  invoice_date?: string | null;
  approved_at?: string | null;
  settled_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  tags?: unknown;
  total_invoice_amount?: number | string | null;
  total_received_amount?: number | string | null;
  remaining_balance?: number | string | null;
  assignee_id?: string | null;
  invoiceItems?: any[] | null;
  payments?: any[] | null;
};

export type CommissionPostedAllocation = {
  basis: CommissionBasis;
  percent_mode: CommissionPercentMode;
  invoice_id: string;
  invoice_item_key: string;
  posted_amount: number;
};

export type CommissionPersistedDraft = {
  id?: string | null;
  source_key: string;
  employee_id: string;
  assignee_id?: string | null;
  period_start: string;
  period_end: string;
  source_basis: CommissionBasis;
  percent_mode: CommissionPercentMode;
  eligibility_event_type?: string | null;
  eligibility_event_at?: string | null;
  invoice_id: string;
  invoice_item_key: string;
  entitled_amount: number;
  posted_amount: number;
  remaining_amount: number;
  decision_status: CommissionDecisionStatus;
  decision_reason?: string | null;
  deferred_from_period?: string | null;
  deferred_to_period?: string | null;
  manual_decision_by?: string | null;
  manual_decision_at?: string | null;
  draft_status?: CommissionDraftRecordStatus | null;
  details?: Record<string, any> | null;
};

export type CommissionDraftLine = {
  key: string;
  source_key: string;
  draft_id: string | null;
  employee_id: string;
  assignee_id: string;
  invoice_id: string;
  invoice_name: string;
  invoice_date: string | null;
  invoice_status: string | null;
  invoice_item_key: string;
  product_id: string | null;
  product_label: string;
  quantity: number;
  net_amount: number;
  commission_percent: number;
  entitled_amount: number;
  posted_amount: number;
  remaining_amount: number;
  selected_amount: number;
  decision_status: CommissionDecisionStatus;
  decision_reason: string | null;
  manual_decision_by: string | null;
  manual_decision_at: string | null;
  source_period_start: string;
  source_period_end: string;
  deferred_from_period: string | null;
  deferred_to_period: string | null;
  source_basis: CommissionBasis;
  percent_mode: CommissionPercentMode;
  eligibility_event_type: string | null;
  eligibility_event_at: string | null;
  is_from_previous_period: boolean;
  draft_status: CommissionDraftRecordStatus;
  exclusion_reason: string | null;
};

export type CommissionDraftRow = {
  key: string;
  mode: 'pool' | 'fixed';
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
  source_period_start: string;
  source_period_end: string;
  eligibility_event_type: string | null;
  eligibility_event_at: string | null;
  event_pool_amount: number;
  base_amount: number;
  entitled_amount: number;
  posted_amount: number;
  remaining_amount: number;
  selected_amount: number;
  item_count: number;
  lines: CommissionDraftLine[];
  exclusion_reason: string | null;
  is_from_previous_period: boolean;
};

const APPROVED_STATUSES = new Set(['confirmed', 'final', 'prepayment', 'settled', 'completed']);
const FINAL_PAYMENT_STATUSES = new Set(['approved', 'paid', 'posted', 'settled', 'completed', 'received', 'cleared', 'done']);
// «paid» در وضعیت خود چک، یعنی چک دریافت‌شده در یک پرداخت معتبر خرج شده است.
const COLLECTED_CHEQUE_STATUSES = new Set(['cleared', 'collected', 'cashed', 'settled', 'completed', 'passed', 'paid']);
const FAILED_CHEQUE_STATUSES = new Set(['bounced', 'returned', 'rejected', 'failed', 'canceled', 'cancelled']);

const toNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value: unknown) => String(value ?? '').trim();

const clamp = (value: number, min = 0, max = Number.POSITIVE_INFINITY) => Math.min(max, Math.max(min, value));

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

const chequeCollectionDate = (payment: any) =>
  payment?.cheque_cleared_at || payment?.cleared_at || payment?.spent_date || paymentDate(payment);

const receiptDate = (payment: any) => isChequePayment(payment) ? chequeCollectionDate(payment) : paymentDate(payment);

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

const resolveInvoiceTotalAmount = (invoice: CommissionInvoiceRecord) => {
  const recordedTotal = toNumber(invoice.total_invoice_amount);
  if (recordedTotal > 0) return recordedTotal;
  return (Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : [])
    .reduce((sum, item) => sum + resolveInvoiceItemNetAmount(item), 0);
};

const resolvePaymentAmount = (payment: any) => {
  const amount = toNumber(payment?.amount);
  return amount > 0 ? amount : 0;
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

const isChequePayment = (payment: any) =>
  normalizeText(payment?.payment_type).toLowerCase() === 'cheque';

/**
 * تنها دریافتی‌های قطعی وارد محاسبه پورسانت می‌شوند. همه روش‌های غیرچکی
 * (نقد، آنلاین، اعتباری، تهاتر و ...) در صورت نهایی بودن معتبرند؛ چک نیز
 * باید علاوه بر نهایی بودن، وصول یا خرج‌شده باشد.
 */
const isValidReceiptPayment = (payment: any) =>
  isFinalPayment(payment) && (!isChequePayment(payment) || isCollectedChequePayment(payment));

/**
 * ردیف‌های دریافت روی خود فاکتور، مرجع نمایش و محاسبه‌اند. عملیات خزانه فقط
 * برای فاکتورهای قدیمیِ فاقد ردیف دریافت استفاده می‌شود؛ در غیر این صورت یک
 * دریافتِ واحد که در هر دو محل همگام‌سازی شده، دوبار جمع می‌شود.
 */
export const mergeCommissionInvoicePayments = (
  invoicePayments: unknown,
  operationPayments: unknown,
): any[] => {
  const sourcePayments = Array.isArray(invoicePayments) ? invoicePayments : [];
  const operations = Array.isArray(operationPayments) ? operationPayments : [];
  if (sourcePayments.length === 0) return operations;

  const operationById = new Map(
    operations
      .map((operation: any) => [normalizeText(operation?._cash_bank_operation_id), operation] as const)
      .filter(([operationId]) => Boolean(operationId)),
  );
  return sourcePayments.map((payment: any) => {
    const operation = operationById.get(normalizeText(payment?._cash_bank_operation_id));
    if (!operation) return payment;
    return {
      ...operation,
      ...payment,
      cheque_status: payment?.cheque_status ?? operation?.cheque_status ?? null,
      cheque_cleared_at: payment?.cheque_cleared_at ?? operation?.cheque_cleared_at ?? null,
    };
  });
};

const resolveInvoiceReceivedAmount = (invoice: CommissionInvoiceRecord) => {
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  const datedValidReceipts = payments
    .filter((payment) => isValidReceiptPayment(payment))
    .reduce((sum, payment) => sum + resolvePaymentAmount(payment), 0);
  // برای داده‌های قدیمی که هنوز سطر پرداخت ندارند، مقدار موجود فقط نمایشی است
  // و هرگز مبنای ایجاد پورسانت نخواهد بود.
  return datedValidReceipts > 0 ? datedValidReceipts : toNumber(invoice.total_received_amount);
};

const resolveLegacyRecordedCollection = (
  invoice: CommissionInvoiceRecord,
  invoiceTotal: number,
  periodStart: string,
  periodEnd: string,
) => {
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  const hasDatedValidReceipt = payments.some((payment) =>
    isValidReceiptPayment(payment)
    && resolvePaymentAmount(payment) > 0
    && parseDateTime(paymentDate(payment)) !== null,
  );
  if (hasDatedValidReceipt) return null;

  const recordedReceived = clamp(toNumber(invoice.total_received_amount), 0, invoiceTotal);
  const hasZeroRemainingBalance = normalizeText(invoice.remaining_balance) !== ''
    && toNumber(invoice.remaining_balance) <= 0;
  const amount = recordedReceived > 0 ? recordedReceived : hasZeroRemainingBalance ? invoiceTotal : 0;
  const recordedAt = normalizeText(invoice.settled_at || invoice.completed_at || invoice.updated_at || invoice.invoice_date) || null;
  if (amount <= 0 || !recordedAt || !isInPeriod(recordedAt, periodStart, periodEnd)) return null;

  return { amount, recordedAt };
};

export const buildCommissionInvoiceItemKey = (invoiceId: string, item: any, index: number) => {
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
  const productPercent = toNumber(item?.commission_percentage_snapshot ?? item?.commission_percentage);
  return productPercent > 0 ? productPercent : toNumber(employeeDefaultCommissionByEmployeeId[employeeId]);
};

const sumPaymentsInPeriod = (
  payments: any[],
  periodStart: string,
  periodEnd: string,
  filter: (payment: any) => boolean,
  dateResolver: (payment: any) => unknown = paymentDate,
) =>
  payments
    .filter((payment) => filter(payment) && isInPeriod(dateResolver(payment), periodStart, periodEnd))
    .reduce((sum, payment) => sum + resolvePaymentAmount(payment), 0);

const sumPaymentsUntil = (
  payments: any[],
  periodEnd: string,
  filter: (payment: any) => boolean,
  dateResolver: (payment: any) => unknown = paymentDate,
) => payments
  .filter((payment) => {
    if (!filter(payment)) return false;
    const at = parseDateTime(dateResolver(payment));
    const end = parseDateTime(`${periodEnd}T23:59:59.999`);
    return at !== null && end !== null && at <= end;
  })
  .reduce((sum, payment) => sum + resolvePaymentAmount(payment), 0);

const findLatestPaymentDate = (
  payments: any[],
  filter: (payment: any) => boolean,
  dateResolver: (payment: any) => unknown = paymentDate,
) => {
  const latest = payments
    .filter(filter)
    .map((payment) => parseDateTime(dateResolver(payment)))
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)[0];
  return latest ? new Date(latest).toISOString() : null;
};

const resolveFullSettlementAt = (
  invoice: CommissionInvoiceRecord,
  invoiceTotal: number,
  calculationEnd: string,
) => {
  const end = parseDateTime(`${calculationEnd}T23:59:59.999`);
  if (end === null) return null;

  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  // تسویهٔ کامل به وصول چک وابسته نیست؛ کافی است پرداخت معتبر ثبت شده باشد.
  const validPayments = payments
    .filter((payment) => isFinalPayment(payment) && resolvePaymentAmount(payment) > 0)
    .map((payment) => ({ payment, at: parseDateTime(paymentDate(payment)) }))
    .filter((entry): entry is { payment: any; at: number } => entry.at !== null && entry.at <= end)
    .sort((left, right) => left.at - right.at);

  let receivedAmount = 0;
  for (const entry of validPayments) {
    receivedAmount += resolvePaymentAmount(entry.payment);
    if (receivedAmount >= invoiceTotal) return new Date(entry.at).toISOString();
  }
  const recordedReceived = clamp(toNumber(invoice.total_received_amount), 0, invoiceTotal);
  const hasZeroRemainingBalance = normalizeText(invoice.remaining_balance) !== ''
    && toNumber(invoice.remaining_balance) <= 0;
  const settledAt = normalizeText(invoice.settled_at || invoice.completed_at || invoice.updated_at || invoice.invoice_date) || null;
  if ((recordedReceived >= invoiceTotal || hasZeroRemainingBalance) && settledAt) {
    const settledTime = parseDateTime(settledAt);
    if (settledTime !== null && settledTime <= end) return settledAt;
  }
  return null;
};

const resolveInvoiceApprovalDate = (invoice: CommissionInvoiceRecord) =>
  normalizeText(invoice.approved_at || invoice.completed_at || invoice.settled_at || invoice.invoice_date) || null;

const getInvoiceEvent = (
  invoice: CommissionInvoiceRecord,
  basis: CommissionBasis,
  periodStart: string,
  periodEnd: string,
) => {
  const invoiceTotal = Math.max(0, resolveInvoiceTotalAmount(invoice));
  if (invoiceTotal <= 0) {
    return {
      eventType: null,
      eventAt: null,
      poolAmount: 0,
      exclusionReason: 'مبلغ فاکتور نامعتبر است',
    };
  }

  const status = normalizeText(invoice.status).toLowerCase();
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];

  if (basis === 'approved_invoices') {
    const approvedAt = resolveInvoiceApprovalDate(invoice);
    if (!APPROVED_STATUSES.has(status) || !isInPeriod(approvedAt, periodStart, periodEnd)) {
      return {
        eventType: 'invoice_approval',
        eventAt: approvedAt,
        poolAmount: 0,
        exclusionReason: 'تایید فاکتور در این بازه انجام نشده است',
      };
    }
    return {
      eventType: 'invoice_approval',
      eventAt: approvedAt,
      poolAmount: invoiceTotal,
      exclusionReason: null,
    };
  }

  if (basis === 'settled_invoices') {
    const settledAt = resolveFullSettlementAt(invoice, invoiceTotal, periodEnd);
    if (!settledAt || !isInPeriod(settledAt, periodStart, periodEnd)) {
      return {
        eventType: 'invoice_settlement',
        eventAt: settledAt,
        poolAmount: 0,
        exclusionReason: 'تسویه کامل فاکتور تا زمان محاسبه محقق نشده است',
      };
    }
    return {
      eventType: 'invoice_settlement',
      eventAt: settledAt,
      poolAmount: invoiceTotal,
      exclusionReason: null,
    };
  }

  if (basis === 'full_settlement_only') {
    const collectedAt = resolveFullSettlementAt(invoice, invoiceTotal, periodEnd);
    if (!collectedAt || !isInPeriod(collectedAt, periodStart, periodEnd)) {
      return {
        eventType: 'full_collection',
        eventAt: collectedAt,
        poolAmount: 0,
        exclusionReason: 'تا وصول آخرین بخش تسویه، پورسانتی ایجاد نمی‌شود',
      };
    }
    return {
      eventType: 'full_collection',
      eventAt: collectedAt,
      poolAmount: invoiceTotal,
      exclusionReason: null,
    };
  }

  if (basis === 'prepaid_and_settled_invoices') {
    const paidAmount = sumPaymentsInPeriod(
      payments,
      periodStart,
      periodEnd,
      isValidReceiptPayment,
      receiptDate,
    );
    if (paidAmount > 0) {
      return {
        eventType: 'payment_collection',
        eventAt: findLatestPaymentDate(
          payments,
          (payment) => isValidReceiptPayment(payment) && isInPeriod(receiptDate(payment), periodStart, periodEnd),
          receiptDate,
        ),
        // سهم این دوره از جمع دریافتی‌های معتبر تا پایان دوره به دست می‌آید؛
        // سهم‌های ثبت‌شدهٔ قبلی در مرحلهٔ تخصیص کم می‌شوند.
        poolAmount: clamp(sumPaymentsUntil(payments, periodEnd, isValidReceiptPayment, receiptDate), 0, invoiceTotal),
        exclusionReason: null,
      };
    }
    // داده‌های قدیمی ممکن است فقط جمع دریافتی و مانده را داشته باشند و برای
    // آن‌ها هنوز ردیف پرداخت ثبت نشده باشد. این fallback به وضعیت فاکتور وابسته نیست.
    const legacyCollection = resolveLegacyRecordedCollection(invoice, invoiceTotal, periodStart, periodEnd);
    if (legacyCollection) {
      return {
        eventType: 'recorded_collection',
        eventAt: legacyCollection.recordedAt,
        poolAmount: legacyCollection.amount,
        exclusionReason: null,
      };
    }
    return {
      eventType: 'payment_collection',
      eventAt: null,
      poolAmount: 0,
      exclusionReason: 'دریافت معتبر با تاریخ ثبت‌شده در این بازه وجود ندارد',
    };
  }

  if (basis === 'prepaid_and_collected_cheques') {
    const collectedChequeAmount = sumPaymentsInPeriod(
      payments,
      periodStart,
      periodEnd,
      (payment) => isValidReceiptPayment(payment) && isChequePayment(payment),
      chequeCollectionDate,
    );
    const nonChequePaidAmount = sumPaymentsInPeriod(
      payments,
      periodStart,
      periodEnd,
      (payment) => isValidReceiptPayment(payment) && !isChequePayment(payment),
      receiptDate,
    );
    if (collectedChequeAmount + nonChequePaidAmount > 0) {
      return {
        eventType: 'prepayment_or_collected_cheque',
        eventAt: findLatestPaymentDate(
          payments,
          (payment) => isInPeriod(receiptDate(payment), periodStart, periodEnd)
            && isValidReceiptPayment(payment),
          receiptDate,
        ),
        // برای پرداخت مرحله‌ای، سهم قابل احراز باید تجمعی باشد تا پس از کم
        // کردن پورسانتِ ثبت‌شدهٔ ماه‌های قبل، دقیقاً فقط مانده پرداخت شود.
        poolAmount: clamp(sumPaymentsUntil(
          payments,
          periodEnd,
          isValidReceiptPayment,
          receiptDate,
        ), 0, invoiceTotal),
        exclusionReason: null,
      };
    }
    return {
      eventType: 'prepayment_or_collected_cheque',
      eventAt: null,
      poolAmount: 0,
      exclusionReason: 'پیش‌پرداخت یا چک وصول‌شده‌ای در این بازه ثبت نشده است',
    };
  }

  if (basis === 'settled_and_collected_cheques') {
    const settledAt = resolveFullSettlementAt(invoice, invoiceTotal, periodEnd);
    if (!settledAt) {
      return {
        eventType: 'invoice_settlement',
        eventAt: null,
        poolAmount: 0,
        exclusionReason: 'فاکتور تا پایان این بازه به‌طور کامل تسویه نشده است',
      };
    }
    const collectedInPeriod = sumPaymentsInPeriod(
      payments,
      periodStart,
      periodEnd,
      (payment) => isFinalPayment(payment) && isChequePayment(payment) && isCollectedChequePayment(payment),
      chequeCollectionDate,
    );
    if (collectedInPeriod <= 0) {
      return {
        eventType: 'cheque_collection',
        eventAt: null,
        poolAmount: 0,
        exclusionReason: 'چک وصول‌شده‌ای از این فاکتور در این بازه وجود ندارد',
      };
    }
    return {
      eventType: 'cheque_collection',
      eventAt: findLatestPaymentDate(
        payments,
        (payment) => (
          isFinalPayment(payment)
          && isChequePayment(payment)
          && isCollectedChequePayment(payment)
          && isInPeriod(chequeCollectionDate(payment), periodStart, periodEnd)
        ),
        chequeCollectionDate,
      ),
      poolAmount: clamp(sumPaymentsUntil(
        payments,
        periodEnd,
        (payment) => isFinalPayment(payment) && isChequePayment(payment) && isCollectedChequePayment(payment),
        chequeCollectionDate,
      ), 0, invoiceTotal),
      exclusionReason: null,
    };
  }

  const clearedChequeAmount = sumPaymentsInPeriod(
    payments,
    periodStart,
    periodEnd,
    (payment) => isValidReceiptPayment(payment) && isChequePayment(payment),
  );
  const nonChequePaidAmount = sumPaymentsInPeriod(
    payments,
    periodStart,
    periodEnd,
    (payment) => isValidReceiptPayment(payment) && !isChequePayment(payment),
  );
  const poolAmount = clamp(clearedChequeAmount + nonChequePaidAmount, 0, invoiceTotal);
  if (poolAmount <= 0) {
    return {
      eventType: 'mixed_collection',
      eventAt: null,
      poolAmount: 0,
      exclusionReason: 'پرداخت معتبر یا چک وصول‌شده‌ای در این بازه وجود ندارد',
    };
  }
  return {
    eventType: 'mixed_collection',
    eventAt: findLatestPaymentDate(
      payments,
      (payment) => isInPeriod(paymentDate(payment), periodStart, periodEnd)
        && isValidReceiptPayment(payment),
    ),
    poolAmount,
    exclusionReason: null,
  };
};

const buildPostedAllocationMap = (allocations: CommissionPostedAllocation[]) => {
  const map = new Map<string, number>();
  allocations.forEach((entry) => {
    // یک قلم فاکتور، حتی اگر روش محاسبه بعداً تغییر کند، نباید دوباره پرداخت شود.
    const key = `${entry.invoice_id}::${entry.invoice_item_key}`;
    map.set(key, (map.get(key) || 0) + Math.max(0, toNumber(entry.posted_amount)));
  });
  return map;
};

const buildDraftIndex = (drafts: CommissionPersistedDraft[]) => {
  const map = new Map<string, CommissionPersistedDraft>();
  drafts.forEach((draft) => {
    map.set(draft.source_key, draft);
  });
  return map;
};

export const buildCommissionDraftSourceKey = ({
  employeeId,
  basis,
  percentMode,
  invoiceId,
  itemKey,
  sourcePeriodStart,
  sourcePeriodEnd,
}: {
  employeeId: string;
  basis: CommissionBasis;
  percentMode: CommissionPercentMode;
  invoiceId: string;
  itemKey: string;
  sourcePeriodStart: string;
  sourcePeriodEnd: string;
}) =>
  [
    'commission_draft',
    normalizeText(employeeId),
    normalizeText(basis),
    normalizeText(percentMode),
    normalizeText(invoiceId),
    normalizeText(itemKey),
    normalizeText(sourcePeriodStart),
    normalizeText(sourcePeriodEnd),
  ].join(':');

const recomputePoolRow = (row: CommissionDraftRow): CommissionDraftRow => {
  const manualIncludeLines = row.lines.filter((line) => line.decision_status === 'include' && line.net_amount > 0 && line.commission_percent > 0);
  const allocatableLines = row.event_pool_amount > 0 || manualIncludeLines.length === 0
    ? row.lines.filter((line) => line.decision_status !== 'exclude' && line.net_amount > 0 && line.commission_percent > 0)
    : manualIncludeLines;
  const allocatableNetTotal = allocatableLines.reduce((sum, line) => sum + line.net_amount, 0);
  const manualIncludeNetTotal = manualIncludeLines.reduce((sum, line) => sum + line.net_amount, 0);
  const effectivePoolAmount = row.event_pool_amount > 0 ? row.event_pool_amount : manualIncludeNetTotal;
  const cappedPoolAmount = allocatableNetTotal > 0 ? clamp(effectivePoolAmount, 0, allocatableNetTotal) : 0;
  const ratio = allocatableNetTotal > 0 ? cappedPoolAmount / allocatableNetTotal : 0;

  const nextLines = row.lines.map((line) => {
    const active = allocatableLines.some((item) => item.key === line.key);
    const entitledAmount = active ? (line.net_amount * (line.commission_percent / 100) * ratio) : 0;
    const postedAmount = clamp(line.posted_amount, 0, entitledAmount);
    const remainingAmount = Math.max(0, entitledAmount - postedAmount);
    const selectedAmount = line.decision_status === 'defer_to_next_period' ? 0 : remainingAmount;
    const exclusionReason =
      line.decision_status === 'exclude' ? 'با تصمیم کاربر از محاسبه خارج شده است'
        : line.decision_status === 'defer_to_next_period' && remainingAmount > 0 ? 'به دوره بعد منتقل شده است'
          : line.net_amount <= 0 ? 'مبلغ نهایی ردیف صفر است'
            : line.commission_percent <= 0 ? 'درصد پورسانت صفر است'
              : entitledAmount <= 0 && row.exclusion_reason ? row.exclusion_reason
                : null;

    return {
      ...line,
      entitled_amount: entitledAmount,
      remaining_amount: remainingAmount,
      selected_amount: selectedAmount,
      exclusion_reason: exclusionReason,
    };
  });

  return {
    ...row,
    base_amount: nextLines.reduce((sum, line) => sum + line.net_amount, 0),
    entitled_amount: nextLines.reduce((sum, line) => sum + line.entitled_amount, 0),
    posted_amount: nextLines.reduce((sum, line) => sum + line.posted_amount, 0),
    remaining_amount: nextLines.reduce((sum, line) => sum + line.remaining_amount, 0),
    selected_amount: nextLines.reduce((sum, line) => sum + line.selected_amount, 0),
    item_count: nextLines.length,
    lines: nextLines,
    exclusion_reason: nextLines.every((line) => line.selected_amount <= 0 && line.remaining_amount <= 0)
      ? nextLines.find((line) => line.exclusion_reason)?.exclusion_reason || row.exclusion_reason
      : row.exclusion_reason,
  };
};

const recomputeFixedRow = (row: CommissionDraftRow): CommissionDraftRow => {
  const nextLines = row.lines.map((line) => {
    const remainingAmount = Math.max(0, line.remaining_amount);
    const selectedAmount = line.decision_status === 'exclude' || line.decision_status === 'defer_to_next_period' ? 0 : remainingAmount;
    const exclusionReason =
      line.decision_status === 'exclude' ? 'با تصمیم کاربر از محاسبه خارج شده است'
        : line.decision_status === 'defer_to_next_period' ? 'به دوره بعد منتقل شده است'
          : remainingAmount <= 0 ? 'مانده‌ای برای ثبت باقی نمانده است'
            : null;
    return {
      ...line,
      remaining_amount: remainingAmount,
      selected_amount: selectedAmount,
      exclusion_reason: exclusionReason,
    };
  });

  return {
    ...row,
    entitled_amount: nextLines.reduce((sum, line) => sum + line.entitled_amount, 0),
    posted_amount: nextLines.reduce((sum, line) => sum + line.posted_amount, 0),
    remaining_amount: nextLines.reduce((sum, line) => sum + line.remaining_amount, 0),
    selected_amount: nextLines.reduce((sum, line) => sum + line.selected_amount, 0),
    item_count: nextLines.length,
    lines: nextLines,
    exclusion_reason: nextLines.every((line) => line.selected_amount <= 0)
      ? nextLines.find((line) => line.exclusion_reason)?.exclusion_reason || row.exclusion_reason
      : row.exclusion_reason,
  };
};

export const recomputeCommissionDraftRow = (row: CommissionDraftRow) =>
  row.mode === 'pool' ? recomputePoolRow(row) : recomputeFixedRow(row);

export const getCommissionLineReviewBucket = (
  _row: CommissionDraftRow,
  line: CommissionDraftLine,
): CommissionReviewBucket => {
  if (line.decision_status === 'exclude') return 'excluded';
  if (line.decision_status === 'include' && line.selected_amount > 0) return 'current_period';
  if (line.is_from_previous_period || line.decision_status === 'defer_to_next_period') return 'backlog';
  if (line.selected_amount > 0 || line.remaining_amount > 0) return 'current_period';
  return 'excluded';
};

const normalizeDraftStatus = (value: unknown): CommissionDraftRecordStatus => {
  const text = normalizeText(value).toLowerCase();
  if (text === 'posted' || text === 'canceled') return text;
  return 'draft';
};

export const buildCommissionDraftRows = ({
  invoices,
  employeeIdByAssigneeId,
  employeeDefaultCommissionByEmployeeId,
  basis,
  percentMode = 'product_default',
  periodStart,
  periodEnd,
  postedAllocations = [],
  existingDrafts = [],
  includeNotCalculated = false,
}: {
  invoices: CommissionInvoiceRecord[];
  employeeIdByAssigneeId: Record<string, string>;
  employeeDefaultCommissionByEmployeeId: Record<string, number>;
  basis: CommissionBasis;
  percentMode?: CommissionPercentMode;
  periodStart: string;
  periodEnd: string;
  postedAllocations?: CommissionPostedAllocation[];
  existingDrafts?: CommissionPersistedDraft[];
  includeNotCalculated?: boolean;
}): CommissionDraftRow[] => {
  const rows: CommissionDraftRow[] = [];
  const postedByKey = buildPostedAllocationMap(postedAllocations);
  const matchingDrafts = existingDrafts.filter((draft) =>
    draft.source_basis === basis
    && draft.percent_mode === percentMode
    && normalizeDraftStatus(draft.draft_status) !== 'canceled'
  );
  const currentDraftIndex = buildDraftIndex(matchingDrafts.filter((draft) => draft.period_start === periodStart && draft.period_end === periodEnd));
  const consumedDraftKeys = new Set<string>();

  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    const assigneeId = normalizeText(invoice.assignee_id);
    const employeeId = assigneeId ? normalizeText(employeeIdByAssigneeId[assigneeId]) : '';
    if (!employeeId) continue;

    const invoiceItems = Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : [];
    if (invoiceItems.length === 0) continue;

    const event = getInvoiceEvent(invoice, basis, periodStart, periodEnd);
    if (!includeNotCalculated && event.poolAmount <= 0) continue;

    const lines: CommissionDraftLine[] = invoiceItems.map((item, index) => {
      const itemKey = buildCommissionInvoiceItemKey(String(invoice.id), item, index);
      const sourceKey = buildCommissionDraftSourceKey({
        employeeId,
        basis,
        percentMode,
        invoiceId: String(invoice.id),
        itemKey,
        sourcePeriodStart: periodStart,
        sourcePeriodEnd: periodEnd,
      });
      const savedDraft = currentDraftIndex.get(sourceKey);
      if (savedDraft) consumedDraftKeys.add(sourceKey);
      const postedKey = `${invoice.id}::${itemKey}`;
      const netAmount = resolveInvoiceItemNetAmount(item);
      // نرخ پس از اولین ذخیره روی خود محاسبهٔ پورسانت snapshot می‌شود، نه روی
      // فاکتور؛ بنابراین ثبت پورسانت برای فاکتورهای قفل‌شده نیز امن است.
      const savedPercent = savedDraft?.details && Object.prototype.hasOwnProperty.call(savedDraft.details, 'commission_percent')
        ? toNumber(savedDraft.details.commission_percent)
        : null;
      const percent = savedPercent === null
        ? getItemCommissionPercent(item, employeeId, percentMode, employeeDefaultCommissionByEmployeeId)
        : Math.max(0, savedPercent);
      return {
        key: sourceKey,
        source_key: sourceKey,
        draft_id: savedDraft?.id ? String(savedDraft.id) : null,
        employee_id: employeeId,
        assignee_id: assigneeId,
        invoice_id: String(invoice.id),
        invoice_name: normalizeText(invoice.name) || String(invoice.id || 'فاکتور فروش'),
        invoice_date: invoice.invoice_date || null,
        invoice_status: invoice.status || null,
        invoice_item_key: itemKey,
        product_id: normalizeText(item?.product_id || item?.package_id) || null,
        product_label: getProductLabel(item, index),
        quantity: toNumber(item?.quantity ?? item?.qty ?? 0),
        net_amount: netAmount,
        commission_percent: percent,
        entitled_amount: Math.max(0, toNumber(savedDraft?.entitled_amount)),
        posted_amount: Math.max(
          Math.max(0, toNumber(savedDraft?.posted_amount)),
          Math.max(0, postedByKey.get(postedKey) || 0),
        ),
        remaining_amount: Math.max(0, toNumber(savedDraft?.remaining_amount)),
        selected_amount: 0,
        decision_status: savedDraft?.decision_status || 'auto',
        decision_reason: savedDraft?.decision_reason || null,
        manual_decision_by: savedDraft?.manual_decision_by || null,
        manual_decision_at: savedDraft?.manual_decision_at || null,
        source_period_start: periodStart,
        source_period_end: periodEnd,
        deferred_from_period: savedDraft?.deferred_from_period || null,
        deferred_to_period: savedDraft?.deferred_to_period || null,
        source_basis: basis,
        percent_mode: percentMode,
        eligibility_event_type: savedDraft?.eligibility_event_type || event.eventType,
        eligibility_event_at: savedDraft?.eligibility_event_at || event.eventAt,
        is_from_previous_period: false,
        draft_status: normalizeDraftStatus(savedDraft?.draft_status),
        exclusion_reason: event.exclusionReason,
      };
    });

    const calculatedRow = recomputeCommissionDraftRow({
      key: `commission_row:${employeeId}:${invoice.id}:${basis}:${percentMode}:${periodStart}:${periodEnd}`,
      mode: 'pool',
      employee_id: employeeId,
      assignee_id: assigneeId,
      invoice_id: String(invoice.id),
      invoice_name: normalizeText(invoice.name) || String(invoice.id || 'فاکتور فروش'),
      invoice_date: invoice.invoice_date || null,
      invoice_status: invoice.status || null,
      invoice_total_amount: Math.max(0, resolveInvoiceTotalAmount(invoice)),
      invoice_received_amount: Math.max(0, resolveInvoiceReceivedAmount(invoice)),
      invoice_tags: invoice.tags ?? null,
      basis,
      percent_mode: percentMode,
      source_period_start: periodStart,
      source_period_end: periodEnd,
      eligibility_event_type: event.eventType,
      eligibility_event_at: event.eventAt,
      event_pool_amount: Math.max(0, event.poolAmount),
      base_amount: 0,
      entitled_amount: 0,
      posted_amount: 0,
      remaining_amount: 0,
      selected_amount: 0,
      item_count: lines.length,
      lines,
      exclusion_reason: event.exclusionReason,
      is_from_previous_period: false,
    });
    // فاکتورهای قدیمی که برای این دوره هیچ رویداد تازه یا تصمیم دستی ندارند،
    // نباید در معوق یا مستثنا نمایش داده شوند.
    if (includeNotCalculated || calculatedRow.lines.some((line) => line.selected_amount > 0 || line.decision_status !== 'auto')) {
      rows.push(calculatedRow);
    }
  }

  const backlogDrafts = matchingDrafts.filter((draft) =>
    normalizeDraftStatus(draft.draft_status) !== 'posted'
    && !consumedDraftKeys.has(draft.source_key)
    && draft.decision_status === 'defer_to_next_period'
    && draft.remaining_amount > 0
  );

  const backlogByInvoiceId = new Map<string, Array<{ draft: CommissionPersistedDraft; line: CommissionDraftLine }>>();
  backlogDrafts.forEach((draft) => {
    const details = draft.details || {};
    const line: CommissionDraftLine = {
      key: draft.source_key,
      source_key: draft.source_key,
      draft_id: draft.id ? String(draft.id) : null,
      employee_id: draft.employee_id,
      assignee_id: normalizeText(draft.assignee_id),
      invoice_id: draft.invoice_id,
      invoice_name: String(details.invoice_name || draft.invoice_id || 'فاکتور فروش'),
      invoice_date: details.invoice_date || null,
      invoice_status: details.invoice_status || null,
      invoice_item_key: draft.invoice_item_key,
      product_id: details.product_id ? String(details.product_id) : null,
      product_label: String(details.product_label || draft.invoice_item_key || 'ردیف فاکتور'),
      quantity: toNumber(details.quantity),
      net_amount: Math.max(0, toNumber(details.net_amount)),
      commission_percent: Math.max(0, toNumber(details.commission_percent)),
      entitled_amount: Math.max(0, toNumber(draft.entitled_amount)),
      posted_amount: Math.max(0, toNumber(draft.posted_amount)),
      remaining_amount: Math.max(0, toNumber(draft.remaining_amount)),
      selected_amount: 0,
      decision_status: draft.decision_status || 'auto',
      decision_reason: draft.decision_reason || null,
      manual_decision_by: draft.manual_decision_by || null,
      manual_decision_at: draft.manual_decision_at || null,
      source_period_start: draft.period_start,
      source_period_end: draft.period_end,
      deferred_from_period: draft.deferred_from_period || null,
      deferred_to_period: draft.deferred_to_period || null,
      source_basis: draft.source_basis,
      percent_mode: draft.percent_mode,
      eligibility_event_type: draft.eligibility_event_type || null,
      eligibility_event_at: draft.eligibility_event_at || null,
      is_from_previous_period: draft.period_start !== periodStart || draft.period_end !== periodEnd,
      draft_status: normalizeDraftStatus(draft.draft_status),
      exclusion_reason: null,
    };

    const invoiceKey = `${draft.employee_id}::${draft.invoice_id}`;
    const invoiceLines = backlogByInvoiceId.get(invoiceKey) || [];
    invoiceLines.push({ draft, line });
    backlogByInvoiceId.set(invoiceKey, invoiceLines);
  });

  backlogByInvoiceId.forEach((entries) => {
    const first = entries[0];
    if (!first) return;
    const details = first.draft.details || {};
    const lines = entries.map((entry) => entry.line);
    rows.push(recomputeCommissionDraftRow({
      key: `commission_backlog:${first.draft.employee_id}:${first.draft.invoice_id}`,
      mode: 'fixed',
      employee_id: first.draft.employee_id,
      assignee_id: normalizeText(first.draft.assignee_id),
      invoice_id: first.draft.invoice_id,
      invoice_name: String(details.invoice_name || first.draft.invoice_id || 'فاکتور فروش'),
      invoice_date: details.invoice_date || null,
      invoice_status: details.invoice_status || null,
      invoice_total_amount: Math.max(0, toNumber(details.invoice_total_amount)),
      invoice_received_amount: Math.max(0, toNumber(details.invoice_received_amount)),
      invoice_tags: details.invoice_tags ?? null,
      basis: first.draft.source_basis,
      percent_mode: first.draft.percent_mode,
      source_period_start: first.draft.period_start,
      source_period_end: first.draft.period_end,
      eligibility_event_type: first.draft.eligibility_event_type || null,
      eligibility_event_at: first.draft.eligibility_event_at || null,
      event_pool_amount: Math.max(0, toNumber(details.event_pool_amount)),
      base_amount: 0,
      entitled_amount: 0,
      posted_amount: 0,
      remaining_amount: 0,
      selected_amount: 0,
      item_count: lines.length,
      lines,
      exclusion_reason: null,
      is_from_previous_period: true,
    }));
  });

  return rows.sort((a, b) => {
    const aCurrent = a.is_from_previous_period ? 1 : 0;
    const bCurrent = b.is_from_previous_period ? 1 : 0;
    if (aCurrent !== bCurrent) return aCurrent - bCurrent;
    const aTime = parseDateTime(a.eligibility_event_at || a.invoice_date || a.source_period_end) || 0;
    const bTime = parseDateTime(b.eligibility_event_at || b.invoice_date || b.source_period_end) || 0;
    return bTime - aTime;
  });
};

export const buildCommissionCalculatedKey = ({
  basis,
  percentMode,
  itemKey,
  sourcePeriodStart,
  sourcePeriodEnd,
}: {
  basis: CommissionBasis;
  percentMode: CommissionPercentMode;
  itemKey: string;
  sourcePeriodStart: string;
  sourcePeriodEnd: string;
}) => `${basis}::${percentMode}::${itemKey}::${sourcePeriodStart}::${sourcePeriodEnd}`;
