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
    || raw.includes("email_conflict")
    || raw.includes("email address")
    || raw.includes("duplicate")
    || raw.includes("email has already been taken")
    || raw.includes("برای این ایمیل قبلاً کاربر ثبت شده است")
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

export const getDemoProvisionErrorMessage = (
  error: unknown,
  fallback = "خطا در راه‌اندازی سازمان. لطفاً با پشتیبانی تماس بگیرید.",
) => {
  const raw = String((error as any)?.message || "").trim().toLowerCase();

  if (raw.includes("needs_admin_review") || raw.includes("نیاز به بررسی مدیر دارد")) {
    return "برای این شماره یا حساب، سابقه‌ای در سیستم پیدا شد و ایجاد خودکار دمو متوقف شد. درخواست شما ثبت شد و نیاز به بررسی مدیر دارد.";
  }
  if (raw.includes("profile_already_attached") || raw.includes("دسترسی سازمانی وجود دارد")) {
    return "این شماره یا حساب قبلاً به یک سازمان متصل شده است. برای جلوگیری از ساخت دمو تکراری، درخواست شما نیاز به بررسی مدیر دارد.";
  }
  if (raw.includes("profile_exists_without_org") || raw.includes("پروفایل ناقص")) {
    return "برای این حساب یک پروفایل ناقص شناسایی شد. برای جلوگیری از اتصال اشتباه، ادامه متوقف شد و نیاز به بررسی مدیر دارد.";
  }
  if ((raw.includes("demo") && raw.includes("limit")) || raw.includes("بیش از حد مجاز نسخه دمو")) {
    return "برای این شماره موبایل قبلاً به سقف مجاز صدور نسخه دمو رسیده‌اید.";
  }
  if (raw.includes("slug") || raw.includes("ساب‌دامین") || raw.includes("available")) {
    return "این آدرس قبلاً انتخاب شده است. آدرس دیگری انتخاب کنید.";
  }
  if (raw.includes("marketing_leads") && raw.includes("description")) {
    return "زیرساخت نسخه SaaS روی سرور کامل نیست و migration سازگار با لیدهای بازاریابی باید اجرا شود.";
  }

  return toFaErrorMessage(error as any, fallback);
};
