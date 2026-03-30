import { supabase } from "../supabaseClient";
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

export const BRANDING_CACHE_KEY = "erp:branding-cache";

type RuntimeBrandingResult = {
  branding: BrandingConfig;
  currency: CurrencyConfig;
};

let runtimeBrandingPromise: Promise<RuntimeBrandingResult> | null = null;

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

  const currency = normalizeCurrencyConfig({
    code: String(companyRow.currency_code || "").trim().toUpperCase() as any,
    label: String(companyRow.currency_label || "").trim(),
  });

  return { branding, currency };
};

export const readCachedBranding = (): BrandingConfig | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BRANDING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const snapshot = parsed as Partial<BrandingConfig>;
    return mergeBrandingConfig(DEFAULT_BRANDING, {
      brand_name: String(snapshot.brandName || DEFAULT_BRANDING.brandName),
      short_name: String(snapshot.shortName || DEFAULT_BRANDING.shortName),
      app_title: String(snapshot.appTitle || DEFAULT_BRANDING.appTitle),
      palette_key: String(snapshot.paletteKey || DEFAULT_BRANDING.paletteKey) as BrandingSettingsPayload["palette_key"],
    });
  } catch {
    return null;
  }
};

export const applyBrandingRuntime = (branding: BrandingConfig) => {
  if (typeof window === "undefined") return;
  applyBrandCssVariables(branding);
  document.documentElement.setAttribute("data-brand-title", branding.appTitle);
  window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(branding));
};

const loadPublicBranding = async (): Promise<RuntimeBrandingResult> => {
  const hostname =
    typeof window !== "undefined"
      ? String(window.location.hostname || "").trim().toLowerCase()
      : "";

  const { data, error } = await supabase
    .rpc("get_public_branding", { p_hostname: hostname || null })
    .maybeSingle();

  if (error) throw error;

  const row = toObjectRecord(data);
  return buildRuntimeBranding(row.company_settings, row.branding_settings);
};

const loadAuthenticatedBranding = async (): Promise<RuntimeBrandingResult> => {
  const [companyResult, themeResult] = await Promise.all([
    supabase
      .from("company_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("integration_settings")
      .select("id, settings")
      .eq("connection_type", BRANDING_INTEGRATION_CONNECTION_TYPE)
      .eq("provider", BRANDING_INTEGRATION_PROVIDER)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return buildRuntimeBranding(companyResult.data, themeResult.data?.settings);
};

export const clearRuntimeBrandingCache = () => {
  runtimeBrandingPromise = null;
};

export const loadRuntimeBranding = async (
  options?: { force?: boolean }
): Promise<RuntimeBrandingResult> => {
  if (!options?.force && runtimeBrandingPromise) {
    return runtimeBrandingPromise;
  }

  const pending = (async () => {
    try {
      return await loadPublicBranding();
    } catch (publicError) {
      try {
        return await loadAuthenticatedBranding();
      } catch (authError) {
        throw authError || publicError;
      }
    }
  })();

  runtimeBrandingPromise = pending;
  try {
    return await pending;
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
