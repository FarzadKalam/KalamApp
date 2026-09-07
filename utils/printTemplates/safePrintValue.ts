import { sanitizeOutboundDisplay } from '../../shared/recordRuntime';

const OBJECT_DISPLAY_KEYS = [
  'label',
  'name',
  'title',
  'full_name',
  'business_name',
  'product_name',
  'selected_product_name',
  'address',
  'system_code',
] as const;

const OBJECT_STRING_PATTERN = /^\[?object Object\]?$/i;

/**
 * Converts an unknown value to user-facing print text without ever leaking a
 * raw identifier or JavaScript's `[object Object]` representation.
 */
export const getSafePrintText = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined || value === '') return fallback;

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => getSafePrintText(item, ''))
      .filter(Boolean);
    return parts.length ? parts.join('، ') : fallback;
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    for (const key of OBJECT_DISPLAY_KEYS) {
      const resolved = getSafePrintText(source[key], '');
      if (resolved) return resolved;
    }
    return fallback;
  }

  const text = String(value).trim();
  if (!text || OBJECT_STRING_PATTERN.test(text)) return fallback;

  const sanitized = sanitizeOutboundDisplay(text, '');
  return sanitized && !OBJECT_STRING_PATTERN.test(sanitized) ? sanitized : fallback;
};

export const hasUnsafeObjectPrintText = (value: unknown): boolean =>
  OBJECT_STRING_PATTERN.test(String(value ?? '').trim());
