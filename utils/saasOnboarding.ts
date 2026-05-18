import { BRAND_PALETTE_PRESETS, type BrandingPaletteKey } from "../theme/brandTheme";
import { toFaErrorMessage } from "./errorMessageFa";

export const SAAS_DEFAULT_BRAND_PALETTE_KEY: BrandingPaletteKey = "kalam_sky";

export const SAAS_BRAND_PALETTE_OPTIONS = Object.entries(BRAND_PALETTE_PRESETS).map(([key, value]) => ({
  value: key,
  label: value.label,
}));

export const normalizeSaasSlug = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

export const normalizeOwnerEmail = (value: string) =>
  String(value || "").trim().toLowerCase();

export const isValidOwnerEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeOwnerEmail(value));

export const isValidOwnerPassword = (value: string) =>
  String(value || "").trim().length >= 6;

export const isBrandPaletteKey = (value: string): value is BrandingPaletteKey =>
  Object.prototype.hasOwnProperty.call(BRAND_PALETTE_PRESETS, value);

export const getOwnerSetupErrorMessage = (error: unknown, fallback = "تنظیم حساب مدیر اصلی ناموفق بود.") => {
  const raw = String((error as any)?.message || "").trim().toLowerCase();
  if (
    raw.includes("already registered")
    || raw.includes("already exists")
    || raw.includes("email address")
    || raw.includes("duplicate")
    || raw.includes("email has already been taken")
  ) {
    return "این ایمیل قبلاً استفاده شده است. لطفاً ایمیل دیگری وارد کنید.";
  }
  if (raw.includes("invalid email")) {
    return "ایمیل واردشده معتبر نیست.";
  }
  if (raw.includes("password") && raw.includes("least")) {
    return "رمز عبور باید حداقل ۶ کاراکتر باشد.";
  }
  return toFaErrorMessage(error as any, fallback);
};
