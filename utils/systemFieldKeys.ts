/**
 * کلیدهای فنی فیلدهای ساخته‌شده از رابط کاربری نباید از کاربر خواسته شوند.
 * این کلیدها تنها برای نگه‌داری داده و اتصال‌های داخلی‌اند؛ عنوان فارسی فیلد
 * هویت قابل‌مشاهدهٔ آن برای کاربر است.
 */
const normalizeText = (value: unknown) => String(value || '').trim();

const stableTextHash = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const normalizeNamespace = (value: string) => (
  normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  || 'field'
);

/** یک کلید فنی ASCII، پایدار و یکتا در مجموعهٔ جاری تولید می‌کند. */
export const buildSystemFieldKey = ({
  namespace = 'field',
  label,
  existingKeys = [],
  fallbackIndex = 0,
}: {
  namespace?: string;
  label?: unknown;
  existingKeys?: Iterable<unknown>;
  fallbackIndex?: number;
}) => {
  const normalizedNamespace = normalizeNamespace(namespace);
  const normalizedLabel = normalizeText(label) || `field-${Math.max(0, fallbackIndex) + 1}`;
  const baseKey = `${normalizedNamespace}_${stableTextHash(normalizedLabel)}`;
  const occupied = new Set(Array.from(existingKeys, (key) => normalizeText(key)).filter(Boolean));
  if (!occupied.has(baseKey)) return baseKey;

  let suffix = 2;
  while (occupied.has(`${baseKey}_${suffix}`)) suffix += 1;
  return `${baseKey}_${suffix}`;
};

/** کلیدهای قبلی حفظ می‌شوند؛ برای تعریف تازه، کلید سیستمی ایجاد می‌شود. */
export const preserveOrBuildSystemFieldKey = ({
  currentKey,
  ...options
}: Parameters<typeof buildSystemFieldKey>[0] & { currentKey?: unknown }) => (
  normalizeText(currentKey) || buildSystemFieldKey(options)
);
