const DEFAULT_TAXPAYER_INVOICE_PATTERN = '1';
const DEFAULT_TAXPAYER_INVOICE_SUBJECT = '1';
const RETURN_TAXPAYER_INVOICE_SUBJECT = '4';

export const normalizeTaxpayerInvoicePattern = (value: unknown, fallback = DEFAULT_TAXPAYER_INVOICE_PATTERN) => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized;
};

export const isReturnInvoiceModuleId = (moduleId: string | null | undefined) => {
  const normalized = String(moduleId || '').trim();
  return normalized === 'sales_return_invoices' || normalized === 'purchase_return_invoices';
};

/**
 * فاکتورهای برگشتی ماژول‌های نمایشی هستند و رکوردشان در جدول اصلی فاکتور
 * نگهداری می‌شود. این نگاشت را مستقل از تنظیمات قابل ویرایش ماژول نگه می‌داریم
 * تا هیچ مسیر ثبت/ویرایشی به‌اشتباه نام ماژول را به PostgREST ارسال نکند.
 */
export const resolveInvoiceStorageTable = (
  moduleId: string | null | undefined,
  fallbackTable?: string | null,
) => {
  const normalized = String(moduleId || '').trim();
  if (normalized === 'sales_return_invoices') return 'invoices';
  if (normalized === 'purchase_return_invoices') return 'purchase_invoices';
  return String(fallbackTable || normalized).trim();
};

export const getTaxpayerInvoicePatternForModule = (
  moduleId: string | null | undefined,
  fallback = DEFAULT_TAXPAYER_INVOICE_PATTERN,
) => (
  isReturnInvoiceModuleId(moduleId)
    ? DEFAULT_TAXPAYER_INVOICE_PATTERN
    : normalizeTaxpayerInvoicePattern(fallback, DEFAULT_TAXPAYER_INVOICE_PATTERN)
);

export const normalizeTaxpayerInvoiceSubject = (value: unknown, fallback = DEFAULT_TAXPAYER_INVOICE_SUBJECT) => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized;
};

export const getTaxpayerInvoiceSubjectForModule = (
  moduleId: string | null | undefined,
  fallback = DEFAULT_TAXPAYER_INVOICE_SUBJECT,
) => (
  isReturnInvoiceModuleId(moduleId)
    ? RETURN_TAXPAYER_INVOICE_SUBJECT
    : normalizeTaxpayerInvoiceSubject(fallback, DEFAULT_TAXPAYER_INVOICE_SUBJECT)
);

export const resolveInvoiceModuleIdForRecord = (
  sourceModuleIdOrTable: string | null | undefined,
  record?: Record<string, any> | null,
) => {
  const normalizedSource = String(sourceModuleIdOrTable || '').trim();
  if (!normalizedSource) return normalizedSource;
  if (normalizedSource === 'sales_return_invoices' || normalizedSource === 'purchase_return_invoices') {
    return normalizedSource;
  }

  const subject = normalizeTaxpayerInvoiceSubject(record?.taxpayer_invoice_subject, DEFAULT_TAXPAYER_INVOICE_SUBJECT);
  const isLegacyReturnPattern = normalizeTaxpayerInvoicePattern(record?.taxpayer_invoice_pattern, DEFAULT_TAXPAYER_INVOICE_PATTERN) === '2'
    && !!record?.source_invoice_id;
  const isReturnRecord = subject === RETURN_TAXPAYER_INVOICE_SUBJECT || isLegacyReturnPattern;
  if (normalizedSource === 'invoices') {
    return isReturnRecord ? 'sales_return_invoices' : 'invoices';
  }
  if (normalizedSource === 'purchase_invoices') {
    return isReturnRecord ? 'purchase_return_invoices' : 'purchase_invoices';
  }
  return normalizedSource;
};
