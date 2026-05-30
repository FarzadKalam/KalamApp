const normalizeHostname = (value: string) => String(value || '').trim().toLowerCase();

export const LEGACY_API_HOST = 'api.kalamapp.ir';
export const CURRENT_API_HOST = 'api.tazesystem.ir';

export const isLocalHostName = (hostname: string) => {
  const normalized = normalizeHostname(hostname);
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal');
};

export const normalizeExternalUrl = (input: URL) => {
  const normalizedHost = normalizeHostname(input.hostname);
  if (normalizedHost === LEGACY_API_HOST) {
    input.hostname = CURRENT_API_HOST;
  }

  if (input.protocol === 'http:' && !isLocalHostName(input.hostname)) {
    input.protocol = 'https:';
  }

  return input;
};

export const normalizeApiBaseUrl = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = normalizeExternalUrl(new URL(raw));
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return raw;
  }
};
