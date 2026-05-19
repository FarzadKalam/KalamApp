---
description: context پنل مدیریت SaaS (تازه سیستم) — فقط وقتی روی SaasAdmin یا multi-tenant کار می‌کنی
paths:
  - "pages/SaasAdmin/**"
  - "utils/saasAdminModules.ts"
  - "utils/saasOnboarding.ts"
  - "utils/orgSaasStatus.ts"
  - "utils/hostRouting.ts"
  - "pages/SaasPortalPage.tsx"
---

# Context: SaaS Admin Panel (تازه سیستم)

## Route ها
- `/taze-system` — داشبورد
- `/taze-system/orgs` — مدیریت سازمان‌ها
- `/taze-system/requests` — درخواست‌های دمو
- `/taze-system/plans` — پلن‌ها

## فعال‌سازی دسترسی
```json
{ "__saas_admin": { "view": true, "edit": true, "demo_override": true } }
```
در جدول `org_roles` برای کاربر موردنظر اضافه کن.

## جداول اصلی
- `saas_onboarding_requests` — درخواست‌های ثبت‌نام/دمو
- `saas_org_settings` — تنظیمات سازمان‌های tenant
- `saas_plans` — پلن‌های اشتراک

## فایل‌های Migration مرتبط
- `database_v1_phase144_saas_foundation.sql` — schema اصلی
- `database_v1_phase145_saas_schema_extension.sql` — extension
- `database_v1_phase149_saas_owner_branding_and_host_hardening.sql`
- `database_v1_phase150_demo_seed_manifest_and_phone_ready.sql`
- `database_v1_phase151_trial_30days_and_renewal.sql`
- `database_v1_phase152_saas_admin_modular_org_candidates.sql`

## کارهای پیاده‌نشده (TODO)
1. Edge Function آروان DNS: `supabase/functions/provision-saas-dns/`
2. Demo Wizard سه‌مرحله‌ای در `SaasPortalPage.tsx`
3. Tenant-aware login redirect بعد از login
4. Tenant Resolver از `saas_org_settings.resolved_host`

## Multi-tenant Branding
- برندینگ از `saas_org_settings.resolved_host` resolve می‌شود
- `utils/hostRouting.ts`: `isSaasAppHost()`, `isMarketingHost()`
- `utils/brandingRuntime.ts`: `loadRuntimeBranding()`, `applyBrandingRuntime()`
