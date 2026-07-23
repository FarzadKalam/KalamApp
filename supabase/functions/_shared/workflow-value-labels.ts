const normalizeText = (value: unknown) => String(value ?? '').trim();

const FIELD_VALUE_LABELS: Record<string, Record<string, string>> = {
  priority: {
    urgent: 'بسیار بالا',
    high: 'بالا',
    medium: 'متوسط',
    low: 'پایین',
  },
  task_status: {
    pending: 'در انتظار',
    completed: 'تکمیل شده',
    done: 'تکمیل شده',
    in_progress: 'در حال انجام',
    active: 'در حال انجام',
    review: 'بازبینی',
    todo: 'انجام نشده',
    waiting: 'شروع نشده',
    planned: 'برنامه‌ریزی شده',
    canceled: 'لغو شده',
    blocked: 'متوقف',
    draft: 'پیش‌نویس',
  },
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

export const getWorkflowStaticValueLabel = (
  fieldKey: unknown,
  value: unknown,
  moduleId?: unknown,
): string | null => {
  const normalizedFieldKey = normalizeText(fieldKey).split('.').pop()?.toLowerCase() || '';
  const normalizedValue = normalizeText(value);
  if (!normalizedFieldKey || !normalizedValue) return null;
  if (normalizedFieldKey === 'status' && normalizeText(moduleId) === 'tasks') {
    return FIELD_VALUE_LABELS.task_status?.[normalizedValue] || null;
  }
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

// Monetary formatting must be based on the configured field type, never inferred from
// a field key such as "amount" or "total". Numeric fields can use those keys too.
export const formatWorkflowNumericValue = (_fieldKey: unknown, value: unknown, isPriceField = false): string | null => {
  if (!isPriceField) return null;
  const normalizedValue = normalizeText(value)
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[٬,]/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalizedValue)) return null;
  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue)
    ? Math.round(numericValue).toLocaleString('fa-IR', { maximumFractionDigits: 0 })
    : null;
};

export const resolveWorkflowCurrencyLabel = (code: unknown, label: unknown): string => {
  const explicitLabel = normalizeText(label);
  if (explicitLabel) return explicitLabel;
  const normalizedCode = normalizeText(code).toUpperCase();
  if (normalizedCode === 'IRR') return 'ریال';
  if (normalizedCode === 'USD') return 'دلار';
  if (normalizedCode === 'EUR') return 'یورو';
  return 'تومان';
};
