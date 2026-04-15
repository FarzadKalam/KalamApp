# سازوکار حرفه‌ای Rollout + اعلان نسخه + Release Notes برای KalamApp

## Summary
- پیاده‌سازی بر پایه‌ی زیرساخت فعلی پروژه باشد، نه یک سیستم موازی: `Supabase Realtime + notification_inbox_items + notification_read_states + service worker`.
- دو لایه جدا تعریف شود:
  1. `Deployment version detection` برای فهمیدن اینکه کلاینت از نسخه سرور عقب افتاده است.
  2. `Release management` برای متن اعلان، release note، و وضعیت مشاهده/تایید هر کاربر.
- رفتار پیش‌فرض rollout از نوع `Soft gate` باشد: کاربر بلافاصله اعلان می‌بیند، اما refresh اجباری فقط وقتی اعمال شود که در وضعیت امن باشد؛ نه وسط فرم و کار نیمه‌تمام.

## Key Changes
- یک موجودیت دیتابیسی مستقل برای نسخه‌ها اضافه شود؛ توصیه:
  - `app_releases`
  - فیلدهای اصلی: `id`, `org_id`, `version_code`, `version_name`, `status`, `deployment_scope`, `announcement_title`, `announcement_body`, `release_notes`, `published_at`, `force_after_at`, `created_by`
  - `version_code` باید monotonic باشد تا مقایسه نسخه ساده و بدون parsing پیچیده انجام شود.
- یک جدول برای وضعیت مشاهده کاربر اضافه شود؛ توصیه:
  - `app_release_user_states`
  - فیلدهای اصلی: `release_id`, `user_id`, `seen_at`, `opened_notes_at`, `acknowledged_at`, `dismissed_at`, `refreshed_to_version_code`
  - این را از `notification_read_states` جدا نگه دارید چون semantics آن متفاوت است و بعداً برای onboarding/replay مفید می‌شود.
- از `notification_inbox_items` فعلی برای پخش اعلان release استفاده شود، نه برای نگهداری release note اصلی:
  - `section = 'system'`
  - `source_type = 'app_release'`
  - `source_id = release_id`
  - payload شامل `version_code`, `version_name`, `published_at`, `force_after_at`
- یک runtime endpoint/source برای نسخه فعال سرور تعریف شود؛ ساده‌ترین شکل:
  - فایل build-time مثل `public/version.json` یا asset معادل با `version_code`, `build_id`, `deployed_at`
  - کلاینت این مقدار را در startup و سپس با polling سبک یا هنگام `visibilitychange/focus` چک کند.
- سمت فرانت یک `ReleaseRuntimeProvider` یا hook مرکزی اضافه شود که این وظایف را انجام دهد:
  - خواندن نسخه فعلی build
  - fetch نسخه فعال سرور
  - تشخیص stale client
  - لود آخرین release منتشرشده برای سازمان
  - تصمیم‌گیری برای `banner`, `modal`, `refresh prompt`, و `safe reload`
- نمایش UX به این شکل باشد:
  - اگر کاربر اولین بار وارد نسخه جدید می‌شود: یک `release notes modal` نمایش داده شود.
  - اگر کاربر روی نسخه قدیمی در حال کار است و release جدید publish شده: یک `top banner` + `modal قابل باز شدن` ببیند.
  - اگر کاربر روی فرم dirty، modal باز، یا workflow حساس است: فقط هشدار ببیند و refresh defer شود.
  - اگر کاربر به وضعیت امن رسید: CTA اصلی `بروزرسانی و بارگذاری نسخه جدید`.
- منبع release notes از نوع `Manual curated` باشد:
  - متن، تیتر و bulletها در تنظیمات یا صفحه مدیریتی release ثبت شوند.
  - از changelogهای رکوردی فعلی فقط به‌عنوان منبع داخلی تیم استفاده شود، نه متن نهایی کاربر.
- برای مدیریت ادمین، یک تب جدید در `Settings` یا یک صفحه کوچک مدیریت release اضافه شود:
  - ایجاد draft
  - ثبت عنوان اعلان
  - ثبت bulletهای تغییرات
  - preview
  - publish
  - تعیین `org-wide`
  - تعیین `force_after_at` اختیاری برای تبدیل soft gate به سخت‌گیرانه در آینده
- چون `integration_settings.connection_type` فعلی محدود است، releaseها داخل `integration_settings` ذخیره نشوند. اگر تنظیمات سراسری لازم شد، یک connection type جدید فقط برای pointer سبک تعریف شود، نه برای خود release data.

## Public Interfaces / Runtime Contracts
- قرارداد نسخه فعال سرور:
  - `version_code: number`
  - `version_name: string`
  - `build_id: string`
  - `deployed_at: string`
- قرارداد release فعال برای کلاینت:
  - `release_id`
  - `version_code`
  - `announcement_title`
  - `announcement_body`
  - `release_notes: string[] | rich text json`
  - `published_at`
  - `force_after_at: string | null`
  - `requires_refresh: boolean`
- eventهای داخلی فرانت:
  - `kalam:release-update-available`
  - `kalam:release-notes-opened`
  - `kalam:release-refresh-requested`
- رفتار service worker:
  - فقط برای دریافت asset جدید و کنترل cache باشد.
  - تصمیم UX و اجبار refresh در app runtime بماند، نه داخل SW، تا روی فرم‌های باز و unsaved work کنترل داشته باشید.

## Test Plan
- کاربر روی نسخه فعلی login می‌کند و release جدیدی publish می‌شود:
  - اعلان realtime دریافت می‌کند.
  - release note را می‌بیند.
  - تا قبل از safe state، refresh اجباری نمی‌شود.
- کاربر اولین بار بعد از deployment وارد می‌شود:
  - اگر هنوز release را ندیده، modal تغییرات نمایش داده می‌شود.
  - بعد از acknowledgement، دوباره بی‌جهت popup تکرار نمی‌شود.
- کاربر در فرم dirty یا modal فرایندی است:
  - banner نمایش داده می‌شود.
  - CTA refresh به defer mode می‌رود.
  - بعد از navigation/idle/close modal، reload ممکن می‌شود.
- چند تب باز از یک کاربر:
  - فقط یک تب refresh را انجام دهد یا همه تب‌ها همگام پیام بگیرند ولی رفتار loop ایجاد نشود.
- stale cache / service worker:
  - نسخه جدید بعد از refresh واقعاً load شود.
  - cache قدیمی مانع دریافت bundle جدید نشود.
- permission و targeting:
  - release org-wide برای کاربران همان org قابل مشاهده باشد.
  - کاربران org دیگر هیچ release یا inbox item را نبینند.
- regression:
  - `NotificationsPopover` فعلی برای notes/tasks/bot/sms آسیب نبیند.
  - login flow و bootstrap فعلی App بدون release هم عادی کار کند.

## Assumptions
- دامنه فاز اول `Org-wide` است و targeting بر اساس role/user به فاز بعدی موکول می‌شود.
- release notes به‌صورت دستی و curated ثبت می‌شوند.
- rollout پیش‌فرض `Soft gate` است؛ hard gate فقط در صورت عبور از `force_after_at` یا فعال‌سازی صریح release.
- محل مناسب نمایش release UX در shell اصلی app است، نزدیک `App.tsx` و `Layout`, نه داخل `NotificationsPopover` به‌عنوان feature فرعی.
- اگر build pipeline فعلی ساده بماند، تولید `version.json` در مرحله build/deploy کافی است و نیازی به سرویس مستقل version registry نیست.
