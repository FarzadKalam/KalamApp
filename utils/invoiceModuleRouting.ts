const RETURN_TAXPAYER_INVOICE_PATTERN = '2';
const DEFAULT_TAXPAYER_INVOICE_PATTERN = '1';

export const normalizeTaxpayerInvoicePattern = (value: unknown, fallback = DEFAULT_TAXPAYER_INVOICE_PATTERN) => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized;
};

export const isReturnInvoiceModuleId = (moduleId: string | null | undefined) => {
  const normalized = String(moduleId || '').trim();
  return normalized === 'sales_return_invoices' || normalized === 'purchase_return_invoices';
};

export const getTaxpayerInvoicePatternForModule = (
  moduleId: string | null | undefined,
  fallback = DEFAULT_TAXPAYER_INVOICE_PATTERN,
) => (
  isReturnInvoiceModuleId(moduleId)
    ? RETURN_TAXPAYER_INVOICE_PATTERN
    : normalizeTaxpayerInvoicePattern(fallback, DEFAULT_TAXPAYER_INVOICE_PATTERN)
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

  const pattern = normalizeTaxpayerInvoicePattern(record?.taxpayer_invoice_pattern, DEFAULT_TAXPAYER_INVOICE_PATTERN);
  if (normalizedSource === 'invoices') {
    return pattern === RETURN_TAXPAYER_INVOICE_PATTERN ? 'sales_return_invoices' : 'invoices';
  }
  if (normalizedSource === 'purchase_invoices') {
    return pattern === RETURN_TAXPAYER_INVOICE_PATTERN ? 'purchase_return_invoices' : 'purchase_invoices';
  }
  return normalizedSource;
};
