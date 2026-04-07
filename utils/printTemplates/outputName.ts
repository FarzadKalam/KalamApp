const INVALID_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]+/g;
const MULTIPLE_SPACES = /\s+/g;

const RECORD_TITLE_KEYS = [
  'name',
  'title',
  'source_record_title',
  'full_name',
  'business_name',
  'legal_name',
  'company_name',
  'trade_name',
  'subject',
];

const RECORD_CODE_KEYS = [
  'manual_code',
  'system_code',
  'entry_no',
  'invoice_no',
  'legacy_invoice_number',
  'accounting_code',
  'code',
  'id',
];

const normalizeCandidate = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const direct =
      normalizeCandidate(record.name) ||
      normalizeCandidate(record.title) ||
      normalizeCandidate(record.label) ||
      normalizeCandidate(record.value);
    if (direct) return direct;
  }

  return '';
};

const pickFromKeys = (record: any, keys: string[]) => {
  for (const key of keys) {
    const value = normalizeCandidate(record?.[key]);
    if (value) return value;
  }
  return '';
};

const buildCompositePersonName = (record: any) => {
  const parts = [normalizeCandidate(record?.first_name), normalizeCandidate(record?.last_name)].filter(Boolean);
  return parts.join(' ').trim();
};

export const sanitizePrintOutputPart = (value: string, fallback = 'print') => {
  const cleaned = String(value || '')
    .replace(INVALID_FILE_NAME_CHARS, ' ')
    .replace(MULTIPLE_SPACES, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
};

export const buildPrintTimestamp = (date = new Date()) => {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yy}${mm}${dd}-${hh}${mi}`;
};

export const getRecordPrintLabel = (record: any) => {
  if (!record || typeof record !== 'object') return '';
  return (
    pickFromKeys(record, RECORD_TITLE_KEYS) ||
    buildCompositePersonName(record) ||
    pickFromKeys(record, RECORD_CODE_KEYS)
  );
};

export const buildPrintOutputName = ({
  record,
  fallbackLabel,
}: {
  record?: any;
  fallbackLabel?: string;
}) => {
  const baseName = sanitizePrintOutputPart(getRecordPrintLabel(record) || fallbackLabel || 'print');
  return `${baseName} ${buildPrintTimestamp()}`;
};

export const ensurePdfExtension = (filename: string) => {
  const safeName = sanitizePrintOutputPart(filename || 'print');
  return /\.pdf$/i.test(safeName) ? safeName : `${safeName}.pdf`;
};
