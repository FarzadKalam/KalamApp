import { supabase } from "../supabaseClient";
import tazeSystemLogo from "../src/tazesystem_logo.png";
import {
  BRANDING_INTEGRATION_CONNECTION_TYPE,
  BRANDING_INTEGRATION_PROVIDER,
  DEFAULT_BRANDING,
  applyBrandCssVariables,
  mergeBrandingConfig,
  type BrandingConfig,
  type BrandingSettingsPayload,
} from "../theme/brandTheme";
import { normalizeCurrencyConfig, persistCurrencyConfig, type CurrencyConfig } from "./currency";
import { normalizePublicAssetUrl } from "./assetUrl";
import { getCachedAuthUser } from "./sessionCache";
import { loadScopedCompanySettings } from "./companySettings";
import { loadScopedIntegrationSettings } from "./integrationSettings";
import { isLocalHost, isSharedAppHost, isTenantHost, isTazeSystemFamilyHost } from "./hostRouting";

export const BRANDING_CACHE_KEY = "erp:branding-cache";

const BRAND_TITLE_ATTRIBUTE = "data-brand-title";
const BRAND_LOGO_ATTRIBUTE = "data-brand-logo";
const BRAND_ICON_ATTRIBUTE = "data-brand-icon";

type RuntimeBrandingResult = {
  branding: BrandingConfig;
  currency: CurrencyConfig;
};

const RUNTIME_BRANDING_TTL_MS = 5 * 60_000;

const getCurrentHostname = () =>
  typeof window !== "undefined"
    ? String(window.location.hostname || "").trim().toLowerCase()
    : "";

const shouldUseCachedBranding = (hostname = getCurrentHostname()) =>
  Boolean(
    hostname && (
      isTenantHost(hostname)
      || (!isLocalHost(hostname) && !isTazeSystemFamilyHost(hostname))
    )
  );

const getBrandingCacheStorageKey = (hostname = getCurrentHostname()) =>
  `${BRANDING_CACHE_KEY}:${hostname || "unknown-host"}`;

let runtimeBrandingPromise: Promise<RuntimeBrandingResult> | null = null;
let runtimeBrandingCache: {
  data: RuntimeBrandingResult | null;
  expiresAt: number;
} = {
  data: null,
  expiresAt: 0,
};

const toObjectRecord = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const extractBrandingSettings = (settingsContainer: unknown) => {
  const settings = toObjectRecord(settingsContainer);
  const nested = settings.branding;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return settings;
};

const buildRuntimeBranding = (
  companyRowInput?: unknown,
  settingsInput?: unknown,
): RuntimeBrandingResult => {
  const companyRow = toObjectRecord(companyRowInput);
  const rawBranding = extractBrandingSettings(settingsInput);
  const companyFullName = String(companyRow.company_full_name || companyRow.company_name || "").trim();
  const tradeName = String(companyRow.trade_name || "").trim();
  const paletteKey = String(companyRow.brand_palette_key || "").trim();

  const branding = mergeBrandingConfig(DEFAULT_BRANDING, {
    ...(rawBranding || {}),
    palette_key: String(rawBranding?.palette_key || paletteKey || DEFAULT_BRANDING.paletteKey) as BrandingSettingsPayload["palette_key"],
    brand_name: String(rawBranding?.brand_name || tradeName || companyFullName || DEFAULT_BRANDING.brandName),
    app_title: String(rawBranding?.app_title || companyFullName || tradeName || DEFAULT_BRANDING.appTitle),
    short_name: String(rawBranding?.short_name || tradeName || companyFullName || DEFAULT_BRANDING.shortName),
  });
  branding.logoUrl = normalizePublicAssetUrl(companyRow.logo_url) || null;
  branding.iconUrl = normalizePublicAssetUrl(companyRow.icon_url) || null;

  const currency = normalizeCurrencyConfig({
    code: String(companyRow.currency_code || "").trim().toUpperCase() as any,
    label: String(companyRow.currency_label || "").trim(),
  });

  return { branding, currency };
};

export const readCachedBranding = (): BrandingConfig | null => {
  if (typeof window === "undefined") return null;
  const hostname = getCurrentHostname();
  if (!shouldUseCachedBranding(hostname)) return null;
  try {
    const raw = window.localStorage.getItem(getBrandingCacheStorageKey(hostname));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const snapshot = parsed as Partial<BrandingConfig>;
    const branding = mergeBrandingConfig(DEFAULT_BRANDING, {
      brand_name: String(snapshot.brandName || DEFAULT_BRANDING.brandName),
      short_name: String(snapshot.shortName || DEFAULT_BRANDING.shortName),
      app_title: String(snapshot.appTitle || DEFAULT_BRANDING.appTitle),
      palette_key: String(snapshot.paletteKey || DEFAULT_BRANDING.paletteKey) as BrandingSettingsPayload["palette_key"],
    });
    branding.logoUrl = normalizePublicAssetUrl(snapshot.logoUrl) || null;
    branding.iconUrl = normalizePublicAssetUrl(snapshot.iconUrl) || null;
    return branding;
  } catch {
    return null;
  }
};

const setRuntimeAttribute = (name: string, value?: string | null) => {
  if (typeof document === "undefined") return;
  if (value && value.trim()) {
    document.documentElement.setAttribute(name, value.trim());
    return;
  }
  document.documentElement.removeAttribute(name);
};

const upsertFaviconLink = () => {
  if (typeof document === "undefined") return null;
  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (existing) return existing;
  const next = document.createElement("link");
  next.rel = "icon";
  document.head.appendChild(next);
  return next;
};

const DEFAULT_FAVICON_PATH = tazeSystemLogo;

const resolveSafeFaviconHref = (iconUrl?: string | null) => {
  const rawValue = String(iconUrl || "").trim();
  if (!rawValue) return DEFAULT_FAVICON_PATH;
  if (typeof window === "undefined") return DEFAULT_FAVICON_PATH;

  try {
    const resolved = new URL(rawValue, window.location.origin);
    const protocol = resolved.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return DEFAULT_FAVICON_PATH;
    }
    return resolved.href;
  } catch {
    return DEFAULT_FAVICON_PATH;
  }
};

const applyFavicon = (iconUrl?: string | null) => {
  if (typeof document === "undefined") return;
  const favicon = upsertFaviconLink();
  if (!favicon) return;
  favicon.href = resolveSafeFaviconHref(iconUrl);
};

export const readRuntimeBranding = (): BrandingConfig => {
  const cached = readCachedBranding() || DEFAULT_BRANDING;
  if (typeof document === "undefined") return cached;

  const runtimeTitle = document.documentElement.getAttribute(BRAND_TITLE_ATTRIBUTE);
  const runtimeLogo = document.documentElement.getAttribute(BRAND_LOGO_ATTRIBUTE);
  const runtimeIcon = document.documentElement.getAttribute(BRAND_ICON_ATTRIBUTE);

  return {
    ...cached,
    appTitle: runtimeTitle?.trim() || cached.appTitle,
    logoUrl: normalizePublicAssetUrl(runtimeLogo?.trim() || cached.logoUrl) || null,
    iconUrl: normalizePublicAssetUrl(runtimeIcon?.trim() || cached.iconUrl) || null,
  };
};

export const applyBrandingRuntime = (branding: BrandingConfig) => {
  if (typeof window === "undefined") return;
  applyBrandCssVariables(branding);
  setRuntimeAttribute(BRAND_TITLE_ATTRIBUTE, branding.appTitle);
  setRuntimeAttribute(BRAND_LOGO_ATTRIBUTE, branding.logoUrl);
  setRuntimeAttribute(BRAND_ICON_ATTRIBUTE, branding.iconUrl);
  applyFavicon(branding.iconUrl);
  const hostname = getCurrentHostname();
  if (shouldUseCachedBranding(hostname)) {
    window.localStorage.setItem(getBrandingCacheStorageKey(hostname), JSON.stringify(branding));
  }
};

const loadPublicBranding = async (): Promise<RuntimeBrandingResult> => {
  const hostname =
    typeof window !== "undefined"
      ? String(window.location.hostname || "").trim().toLowerCase()
      : "";

  const { data, error } = await supabase
    .rpc("get_public_branding", { p_hostname: hostname || null });

  if (error) throw error;

  const row = toObjectRecord(Array.isArray(data) ? data[0] : data);
  return buildRuntimeBranding(row.company_settings, row.branding_settings);
};

const loadAuthenticatedBranding = async (): Promise<RuntimeBrandingResult> => {
  const [companyResult, themeResult] = await Promise.all([
    loadScopedCompanySettings(supabase as any),
    loadScopedIntegrationSettings(supabase as any, {
      connectionType: BRANDING_INTEGRATION_CONNECTION_TYPE,
      provider: BRANDING_INTEGRATION_PROVIDER,
      columns: "id, settings",
    }),
  ]);

  const themeRow = themeResult.data as Record<string, any> | null | undefined;
  return buildRuntimeBranding(companyResult.data, themeRow?.settings);
};

export const clearRuntimeBrandingCache = () => {
  runtimeBrandingPromise = null;
  runtimeBrandingCache = {
    data: null,
    expiresAt: 0,
  };
};

export const loadRuntimeBranding = async (
  options?: { force?: boolean }
): Promise<RuntimeBrandingResult> => {
  if (!options?.force && runtimeBrandingCache.data && runtimeBrandingCache.expiresAt > Date.now()) {
    return runtimeBrandingCache.data;
  }

  if (!options?.force && runtimeBrandingPromise) {
    return runtimeBrandingPromise;
  }

  const pending = (async () => {
    const hostname = getCurrentHostname();
    const authUser = await getCachedAuthUser(supabase).catch(() => null);
    const sharedHost = isSharedAppHost(hostname);
    const allowPublicBranding =
      !isLocalHost(hostname) && (sharedHost || isTenantHost(hostname) || !isTazeSystemFamilyHost(hostname));

    if (authUser?.id && !sharedHost) {
      return await loadAuthenticatedBranding();
    }

    try {
      if (allowPublicBranding) {
        return await loadPublicBranding();
      }
      return buildRuntimeBranding();
    } catch (publicError) {
      if (authUser?.id) {
        return await loadAuthenticatedBranding();
      }
      throw publicError;
    }
  })();

  runtimeBrandingPromise = pending;
  try {
    const result = await pending;
    runtimeBrandingCache = {
      data: result,
      expiresAt: Date.now() + RUNTIME_BRANDING_TTL_MS,
    };
    return result;
  } finally {
    if (runtimeBrandingPromise === pending) {
      runtimeBrandingPromise = null;
    }
  }
};

export const persistRuntimeBranding = (result: RuntimeBrandingResult) => {
  persistCurrencyConfig(result.currency);
  applyBrandingRuntime(result.branding);
};
