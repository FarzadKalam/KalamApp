import { toPersianNumber } from './persianNumberFormatter';

export const normalizeDigitsToEnglish = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
};

export const normalizeNumericString = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  const englishDigits = normalizeDigitsToEnglish(raw)
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/\s+/g, '')
    .replace(/,/g, '');

  const sign = englishDigits.startsWith('-') ? '-' : '';
  const unsigned = englishDigits.replace(/-/g, '');
  const cleaned = unsigned.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const integerPart = parts[0] ?? '';
  const decimalPart = parts.slice(1).join('');
  const hasDot = cleaned.includes('.');
  return `${sign}${integerPart}${hasDot ? `.${decimalPart}` : ''}`;
};

export const formatNumericForInput = (raw: any, withGrouping = false): string => {
  const normalized = normalizeNumericString(raw);
  if (!normalized) return '';
  if (!withGrouping) return toPersianNumber(normalized);
  if (normalized === '-' || normalized === '.' || normalized === '-.') return toPersianNumber(normalized);

  const sign = normalized.startsWith('-') ? '-' : '';
  const unsigned = sign ? normalized.slice(1) : normalized;
  const [integerPart = '', decimalPart] = unsigned.split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const output = decimalPart !== undefined ? `${sign}${grouped}.${decimalPart}` : `${sign}${grouped}`;
  return toPersianNumber(output);
};

export const parseNumericInput = (raw: any): number => {
  const normalized = normalizeNumericString(raw);
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return 0;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

type KeyDownLikeEvent = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  preventDefault: () => void;
};

type PasteLikeEvent = {
  clipboardData?: { getData: (type: string) => string };
  preventDefault: () => void;
};

const NAVIGATION_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Enter',
  'Escape',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

const SHORTCUT_KEYS = new Set(['a', 'c', 'v', 'x', 'z', 'y']);
const NUMERIC_CHAR_PATTERN = /^[0-9\u06F0-\u06F9\u0660-\u0669.,\u066b\u066c-]$/;

export const preventNonNumericKeyDown = (event: KeyDownLikeEvent) => {
  const key = String(event.key || '');
  if (!key) return;

  if (NAVIGATION_KEYS.has(key)) return;

  const ctrlOrMeta = Boolean(event.ctrlKey || event.metaKey);
  if (ctrlOrMeta && SHORTCUT_KEYS.has(key.toLowerCase())) return;

  if (event.altKey) return;
  if (key.length > 1) return;

  if (!NUMERIC_CHAR_PATTERN.test(key)) {
    event.preventDefault();
  }
};

export const preventNonNumericPaste = (event: PasteLikeEvent) => {
  const raw = String(event.clipboardData?.getData('text') || '');
  if (!raw.trim()) return;
  const normalized = normalizeNumericString(raw);
  if (!normalized) {
    event.preventDefault();
  }
};
