import type { BrandingConfig } from '../theme/brandTheme';

export type LoadingBrandIdentity = {
  englishName?: string;
  primaryName?: string;
  slogan?: string;
};

const CACHE_PREFIX = 'erp:loading-brand';

const normalizeText = (value: unknown) => String(value || '').trim();

const getHostname = () => (
  typeof window === 'undefined' ? '' : normalizeText(window.location.hostname).toLowerCase()
);

const getCacheKey = () => `${CACHE_PREFIX}:${getHostname() || 'unknown-host'}`;

export const resolveLoadingBrandIdentity = (
  companySettings?: Record<string, any> | null,
  branding?: BrandingConfig | null,
): LoadingBrandIdentity => {
  const company = companySettings && typeof companySettings === 'object' ? companySettings : {};
  return {
    englishName: normalizeText(company.company_name_en || company.name_en || company.english_name),
    primaryName: normalizeText(
      company.company_full_name
      || company.company_name
      || company.trade_name
      || branding?.appTitle
      || branding?.brandName,
    ),
    slogan: normalizeText(company.slogan || company.tagline),
  };
};

export const readCachedLoadingBrandIdentity = (): LoadingBrandIdentity | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(getCacheKey()) || 'null');
    if (!value || typeof value !== 'object') return null;
    const identity: LoadingBrandIdentity = {
      englishName: normalizeText(value.englishName),
      primaryName: normalizeText(value.primaryName),
      slogan: normalizeText(value.slogan),
    };
    return identity.primaryName || identity.englishName || identity.slogan ? identity : null;
  } catch {
    return null;
  }
};

export const persistLoadingBrandIdentity = (identity?: LoadingBrandIdentity | null) => {
  if (typeof window === 'undefined' || !identity) return;
  const normalized: LoadingBrandIdentity = {
    englishName: normalizeText(identity.englishName),
    primaryName: normalizeText(identity.primaryName),
    slogan: normalizeText(identity.slogan),
  };
  if (!normalized.primaryName && !normalized.englishName && !normalized.slogan) return;
  try {
    window.localStorage.setItem(getCacheKey(), JSON.stringify(normalized));
  } catch {
    // ذخیره‌سازی برای تجربه سریع‌تر است و نباید مسیر اصلی را متوقف کند.
  }
};
