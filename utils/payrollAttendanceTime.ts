const toWholeMinutes = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
};

/**
 * ساعات حضورِ بیشتر از برنامهٔ همان روز را، بدون دخالت‌دادن نرخ یا تأیید اضافه‌کاری، برمی‌گرداند.
 */
export const calculateExcessPresenceMinutes = (
  presenceMinutes: unknown,
  scheduledMinutes: unknown,
) => Math.max(0, toWholeMinutes(presenceMinutes) - toWholeMinutes(scheduledMinutes));

/**
 * دقایقی را که برای دستمزد عادیِ ساعتی قابل پرداخت هستند برمی‌گرداند.
 */
export const calculatePayablePresenceMinutes = (
  presenceMinutes: unknown,
  excludedExcessPresenceMinutes: unknown,
) => Math.max(0, toWholeMinutes(presenceMinutes) - toWholeMinutes(excludedExcessPresenceMinutes));

/**
 * سهم قابل پرداخت از یک کسری تردد را تا سقف باقی‌ماندهٔ مرخصی با حقوق تقسیم می‌کند.
 */
export const allocatePaidLeaveMinutes = (
  requestedMinutes: unknown,
  availablePaidLeaveMinutes: unknown,
) => {
  const requested = toWholeMinutes(requestedMinutes);
  const available = toWholeMinutes(availablePaidLeaveMinutes);
  const paidMinutes = Math.min(requested, available);
  return {
    requestedMinutes: requested,
    paidMinutes,
    unpaidMinutes: Math.max(0, requested - paidMinutes),
  };
};
