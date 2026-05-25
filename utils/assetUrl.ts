const isLocalHostName = (hostname: string) => {
  const normalized = String(hostname || '').trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal');
};

const LEGACY_API_HOST = 'api.kalamapp.ir';
const CURRENT_API_HOST = 'api.tazesystem.ir';

export const normalizePublicAssetUrl = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

  try {
    const parsed = new URL(raw);
    if (parsed.hostname === LEGACY_API_HOST) {
      parsed.hostname = CURRENT_API_HOST;
    }
    if (parsed.protocol === 'http:' && !isLocalHostName(parsed.hostname)) {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    // اگر URL مطلق نیست ولی با / شروع می‌شود (مثل /storage/v1/...) قابل قبول است
    if (!raw.startsWith('/')) return '';
    if (typeof window === 'undefined') return raw;
    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.protocol === 'http:' && !isLocalHostName(parsed.hostname)) {
        parsed.protocol = 'https:';
      }
      return parsed.toString();
    } catch {
      return '';
    }
  }
};

