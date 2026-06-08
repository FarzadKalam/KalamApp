# راهنمای کارایی سراسری Runtime

**آخرین بروزرسانی:** 2026-06-08  
**دامنه:** Dashboard، ModuleList، ModuleShow و همه مسیرهای جنریک ماژول‌ها

## هدف

این سند قواعدی را ثبت می‌کند که refactor کارایی اخیر روی آن بنا شده است تا در توسعه‌های بعدی دوباره به الگوهای کند قبلی برنگردیم.

## اصول اجباری

1. مسیرهای critical path نباید `select('*')` بزنند.
2. هیچ list view نباید برای هر ردیف query مستقل relation/user/process اجرا کند.
3. bootstrapهای سراسری باید `per-org` cache داشته باشند و با promise dedupe کار کنند.
4. hydration داده‌های سنگین باید مرحله‌ای باشد: `shell first` سپس `deferred panels`.
5. relation lookupها باید `search-first` و `exact-id hydration` باشند، نه page-scan عمومی.
6. هر summary پرتکرار که با scan سنگین ساخته می‌شود باید به RPC یا batch API منتقل شود.

## لایه cache مشترک

فایل [utils/appRuntimeCache.ts](/d:/Kalamapp/utils/appRuntimeCache.ts:1) cache مشترک per-org را فراهم می‌کند. این لایه برای داده‌های زیر مبنای استفاده مجدد است:

- `session bootstrap`
- `permissions context`
- `org saas status`
- `announcements`
- `notification summary/overlay`
- `assignee directory`
- `dynamic options` و lookupهای پرتکرار

قاعده:

- هر سرویس سراسری ابتدا باید `cache hit` بدهد.
- refresh فعال فقط باید در background یا با invalidation مشخص انجام شود.
- keyها باید tenant-safe باشند و بدون `org_id` مشترک نشوند.

## Module List

برای [pages/ModuleList_Refine.tsx](/d:/Kalamapp/pages/ModuleList_Refine.tsx:1) و utilityهای وابسته:

- query اولیه فقط ستون‌های لازم برای view فعلی را بگیرد.
- relation labels برای فیلترها و سلول‌های visible با exact ids یا search term hydrate شوند.
- quick previewها، tag mapها و decorationهای ثانویه بعد از data اصلی و به‌صورت bounded اجرا شوند.
- widget یا cell سنگین باید از parent provider یا batch provider بخواند.

ممنوع:

- preload کامل relation options برای mount اولیه
- scan چندصد یا چندهزار رکوردی برای ساخت label چند سلول
- fetch مستقل per-row در fieldهای جنریک

## Module Show

برای [pages/ModuleShow.tsx](/d:/Kalamapp/pages/ModuleShow.tsx:1):

1. مرحله اول: record shell، hero و header با projection حداقلی
2. مرحله دوم: relationها و optionهای visible/current-value
3. مرحله سوم: tabها و panelهای سنگین هنگام visible شدن

panelهای زیر باید deferred بمانند مگر دلیل روشن وجود داشته باشد:

- activity
- related records
- process runtime
- print/runtime preview
- accounting side panels

## Process Runtime

برای fieldهای process-enabled، مخصوصاً [components/ProductionStagesField.tsx](/d:/Kalamapp/components/ProductionStagesField.tsx:1):

- حالت compact باید data-injected باشد.
- queryهای per-row به `tasks`، `profiles` یا runtime functionهای تکی مجاز نیست.
- مسیر اصلی باید از batch client [utils/processRuntimeBatch.ts](/d:/Kalamapp/utils/processRuntimeBatch.ts:1) استفاده کند.

## Relation Data

برای lookupهای relation:

- مسیر اصلی باید RPC `search_relation_options_v1` باشد.
- exact-id hydration برای نمایش label رکوردهای موجود اولویت دارد.
- fallbackهای scan فقط باید bounded و نادر باشند.

قاعده طراحی:

- label-focused query
- index-friendly predicate
- بدون `select('*')` در lookup path

## Dashboard

داشبورد باید `snapshot + lazy widgets` بماند:

- shell و summary سریع بالا بیاید
- widgetهای سنگین dataset کامل را فقط در صورت نیاز بگیرند
- report compactها و recent previewها به summary محدود باشند

## چک‌لیست review

قبل از merge هر تغییری در مسیرهای read-heavy این موارد بررسی شود:

1. آیا query projection حداقلی است؟
2. آیا fetch سراسری جدید cache یا dedupe دارد؟
3. آیا list/show برای داده سنگین lazy شده است؟
4. آیا relation یا process preview به batch provider متکی است؟
5. آیا query یا cache به‌صورت `per-org` طراحی شده است؟
