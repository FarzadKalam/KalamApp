// 👇👇👇 این خط باید اولین خط باشد 👇👇👇
import "./initDayjs"; 

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "./supabaseClient";
import {
  BRANDING_INTEGRATION_CONNECTION_TYPE,
  BRANDING_INTEGRATION_PROVIDER,
  DEFAULT_BRANDING,
  applyBrandCssVariables,
  mergeBrandingConfig,
  type BrandingConfig,
  type BrandingSettingsPayload,
} from "./theme/brandTheme";
import { normalizeCurrencyConfig, persistCurrencyConfig } from "./utils/currency";

const container = document.getElementById("root");
const root = createRoot(container!);
const BRANDING_CACHE_KEY = "erp:branding-cache";

const applyBrandingRuntime = (branding: BrandingConfig) => {
  applyBrandCssVariables(branding);
  document.documentElement.setAttribute("data-brand-title", branding.appTitle);
  window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(branding));
};

const readCachedBranding = (): BrandingConfig | null => {
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

const loadRuntimeBranding = async () => {
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

  const companyRow = (companyResult.data || {}) as Record<string, any>;
  const companyFullName = String(companyRow.company_full_name || companyRow.company_name || "").trim();
  const tradeName = String(companyRow.trade_name || "").trim();
  const paletteKey = String(companyRow.brand_palette_key || "").trim();
  const settingsContainer = themeResult.data?.settings;
  const rawBranding =
    settingsContainer &&
    typeof settingsContainer === "object" &&
    "branding" in (settingsContainer as Record<string, unknown>) &&
    (settingsContainer as Record<string, unknown>).branding &&
    typeof (settingsContainer as Record<string, unknown>).branding === "object"
      ? ((settingsContainer as Record<string, unknown>).branding as Record<string, unknown>)
      : (settingsContainer as Record<string, unknown> | undefined);

  const merged = mergeBrandingConfig(DEFAULT_BRANDING, {
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
  persistCurrencyConfig(currency);
  applyBrandingRuntime(merged);
};

const bootstrapAndRender = async () => {
  const cached = readCachedBranding();
  applyBrandingRuntime(cached || DEFAULT_BRANDING);
  try {
    await loadRuntimeBranding();
  } catch {
    persistCurrencyConfig(null);
  }

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

bootstrapAndRender();
