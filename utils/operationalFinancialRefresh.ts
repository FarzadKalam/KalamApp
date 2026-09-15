const OPERATIONAL_FINANCIAL_REFRESH_EVENT = 'tazesystem:operational-financial-refresh';

// این رویداد فقط در همان تب مرورگر منتشر می‌شود؛ جایگزین subscription گستردهٔ
// مالی است و پس از ثبت موفق، پنل‌های باز را از منبع سروری واحد تازه می‌کند.
export const OPERATIONAL_FINANCIAL_SOURCE_MODULE_IDS = new Set([
  'invoices',
  'purchase_invoices',
  'expense_documents',
  'employee_advances',
  'payroll_slips',
  'cash_bank_operations',
  'barters',
]);

export const isOperationalFinancialSourceModule = (moduleId?: string | null) =>
  OPERATIONAL_FINANCIAL_SOURCE_MODULE_IDS.has(String(moduleId || '').trim());

export const notifyOperationalFinancialRefresh = (moduleId?: string | null) => {
  if (!isOperationalFinancialSourceModule(moduleId) || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPERATIONAL_FINANCIAL_REFRESH_EVENT));
};

export const subscribeOperationalFinancialRefresh = (listener: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(OPERATIONAL_FINANCIAL_REFRESH_EVENT, listener);
  return () => window.removeEventListener(OPERATIONAL_FINANCIAL_REFRESH_EVENT, listener);
};
