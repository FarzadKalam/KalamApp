const STORAGE_SEGMENT_FALLBACK = 'item';

export const sanitizeStoragePathSegment = (value: unknown, fallback = STORAGE_SEGMENT_FALLBACK) => {
  const raw = String(value || '').trim();
  const cleaned = raw
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
};

export const sanitizeStorageFileName = (value: unknown, fallback = 'file') => {
  const raw = String(value || '').trim();
  const extension = raw.includes('.') ? String(raw.split('.').pop() || '').trim() : '';
  const base = extension ? raw.slice(0, -1 * (extension.length + 1)) : raw;
  const safeBase = sanitizeStoragePathSegment(base || fallback, fallback);
  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
};

export const joinStoragePath = (...segments: unknown[]) =>
  segments
    .map((segment, index) => sanitizeStoragePathSegment(segment, index === 0 ? 'root' : STORAGE_SEGMENT_FALLBACK))
    .filter(Boolean)
    .join('/');
