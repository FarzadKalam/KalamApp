/**
 * Produces a compact, deterministic cache version for a print document.  The
 * version is deliberately not a security hash; it only tells the print modal
 * when an already generated PDF no longer represents its source.
 */
const stableSerialize = (value: unknown, seen = new WeakSet<object>()): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'function' || typeof value === 'symbol') return typeof value;
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item, seen)).join(',')}]`;
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    const objectValue = value as Record<string, unknown>;
    const result = `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(objectValue[key], seen)}`)
      .join(',')}}`;
    seen.delete(value);
    return result;
  }
  return String(value);
};

export const createPrintPreviewFingerprint = (value: unknown): string => {
  const source = stableSerialize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${source.length.toString(36)}-${(hash >>> 0).toString(36)}`;
};
