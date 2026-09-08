import { isMarketingHost } from './hostRouting';

const PUBLIC_OVERLAY_PATH_PREFIXES = ['/inquiry', '/i', '/d', '/c', '/account', '/payment/callback'];

export const isPublicOverlaySuppressedPath = (pathname?: string | null) => {
  if (isMarketingHost()) return true;

  const normalizedPath = String(
    pathname ?? (typeof window !== 'undefined' ? window.location.pathname : ''),
  ).trim() || '/';

  return PUBLIC_OVERLAY_PATH_PREFIXES.some((prefix) =>
    normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
};
