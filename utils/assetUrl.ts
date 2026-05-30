import { normalizeExternalUrl } from './urlHostNormalization';

export const normalizePublicAssetUrl = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

  try {
    return normalizeExternalUrl(new URL(raw)).toString();
  } catch {
    // اگر URL مطلق نیست ولی با / شروع می‌شود (مثل /storage/v1/...) قابل قبول است
    if (!raw.startsWith('/')) return '';
    if (typeof window === 'undefined') return raw;
    try {
      return normalizeExternalUrl(new URL(raw, window.location.origin)).toString();
    } catch {
      return '';
    }
  }
};
