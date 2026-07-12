const normalizeText = (value: unknown) => String(value ?? '').trim();

const FIELD_VALUE_LABELS: Record<string, Record<string, string>> = {
  log_type: {
    check_in: 'ورود',
    check_out: 'خروج',
  },
  source_type: {
    manual: 'دستی',
    web_form: 'وب‌فرم',
    qr: 'کد QR',
    system: 'سیستم',
  },
};

export const getWorkflowStaticValueLabel = (fieldKey: unknown, value: unknown): string | null => {
  const normalizedFieldKey = normalizeText(fieldKey).split('.').pop()?.toLowerCase() || '';
  const normalizedValue = normalizeText(value);
  if (!normalizedFieldKey || !normalizedValue) return null;
  return FIELD_VALUE_LABELS[normalizedFieldKey]?.[normalizedValue] || null;
};

export const parseWorkflowIdentityReference = (
  value: unknown,
): { type: 'user' | 'role'; id: string } | null => {
  const raw = normalizeText(value);
  const match = raw.match(/^(user|role)[:_]([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  if (!match) return null;
  return {
    type: match[1].toLowerCase() === 'role' ? 'role' : 'user',
    id: match[2],
  };
};

export const formatWorkflowNumericValue = (fieldKey: unknown, value: unknown): string | null => {
  const normalizedFieldKey = normalizeText(fieldKey).toLowerCase();
  if (!/(^|_)(price|amount|cost|total|balance|wage|salary|fee|credit|debit|payment)(_|$)/.test(normalizedFieldKey)) {
    return null;
  }
  const normalizedValue = normalizeText(value)
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[٬,]/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalizedValue)) return null;
  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue)
    ? numericValue.toLocaleString('fa-IR', { maximumFractionDigits: 6 })
    : null;
};
