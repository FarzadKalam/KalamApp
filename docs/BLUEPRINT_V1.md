# KalamApp V1 Blueprint (3-Week Internal Stable Release)

**Last Update:** 2026-02-25  
**Target:** نسخه پایدار قابل استفاده داخلی + آماده‌سازی SaaS

## 1) Product Direction

این پروژه از حالت ERP سفارشی یک کسب‌وکار خاص، به سمت یک ERP عمومی برای سازمان‌های مختلف حرکت می‌کند.

اولویت‌ها:

1. استفاده پایدار برای کسب‌وکار داخلی در کوتاه‌مدت.
2. معماری آماده فروش اشتراک و نسخه دمو.
3. عمومی‌سازی ماژول‌ها و حذف وابستگی‌های دامنه‌ای (مثل چرم).
4. قرار دادن AI در بطن عملیات روزانه.

## 2) Locked Decisions

1. مهاجرت کامل UI انجام نمی‌شود.
2. Ant Design فعلا حفظ می‌شود و یک Design System یکدست روی آن سوار می‌شود.
3. تولید حذف نمی‌شود و محور آن `productionStages` باقی می‌ماند.
4. JSON-heavy sections مرحله‌ای کم می‌شوند (بدون شکستن سیستم فعلی).
5. Tenant model فعلا `org_id` در یک دیتابیس مشترک است.
6. Trial نسخه دمو 15 روزه و بعد از آن حالت `readonly`.
7. گزارش‌ساز در scope v1 کامل نمی‌شود، اما بستر فنی آن از الان آماده می‌شود.
8. نقشه باید حتی‌الامکان وابستگی حداقلی به اینترنت بین‌الملل داشته باشد.
9. سال مالی عملیاتی v1 برای سازمان داخلی، سال 1405 است.
10. نرخ VAT پیش‌فرض سیستم 10٪ در نظر گرفته می‌شود.
11. AI API باید OpenAI-compatible باشد و Base URL قابل تغییر بماند.
12. BOM فعلی حفظ می‌شود و در کنار آن مدل Formula نیز اضافه می‌شود.

## 3) v1 Modules (Business Scope)

ماژول‌های ضروری نسخه v1:

1. مشتریان
2. تامین‌کنندگان
3. کالا و خدمات
4. فاکتور فروش
5. فاکتور خرید
6. پروژه‌ها (بر پایه stage/task)
7. منابع انسانی (task-centric)
8. حسابداری دوبل
9. تبلیغات محیطی (Billboards)
10. AI Assistant

ملاحظات:

1. نمایش نقشه برای مشتریان و بیلبوردها از v1 لازم است.
2. معماری map باید generic باشد تا هر ماژول بتواند از آن استفاده کند.

## 4) Architecture Blueprint

### 4.1 Application Layers

1. Presentation: React + Antd + Tailwind
2. Meta Layer: `modules/*.ts` + `moduleRegistry.ts`
3. Data Access: Supabase client / domain services
4. Data Layer: PostgreSQL + RLS + Storage + Functions
5. AI Layer: Provider adapter + org-scoped tools

### 4.2 Multi-Tenant Model

1. تمام جداول business باید `org_id` داشته باشند.
2. RLS روی `org_id` enforce شود.
3. سطح دسترسی role-based داخل هر org اعمال شود.
4. مسیر export tenant برای مهاجرت آینده به دیتابیس اختصاصی از الان دیده شود.

### 4.3 Production Model (Stage-First)

اصول:

1. موتور اصلی اجرا: `productionStages` + `tasks`.
2. BOM فعلی برای backward compatibility حفظ می‌شود.
3. مدل Formula به‌صورت موازی اضافه می‌شود.
4. وابستگی به دسته‌بندی‌های خاص دامنه‌ای حذف می‌شود.

ساختار هدف:

1. `production_formulas`
2. `production_formula_items`
3. `production_formula_stage_templates`
4. `production_orders`
5. `production_order_stages`
6. `production_stage_transfers`
7. `production_definitions` (optional unified table with `definition_type = bom|formula`)

### 4.4 Accounting Model (Double-Entry)

حداقل هسته v1:

1. `fiscal_years`
2. `chart_of_accounts`
3. `journal_entries`
4. `journal_lines`
5. `cost_centers`
6. `cash_boxes`
7. `bank_accounts`

اتصال رویدادها:

1. فاکتور خرید/فروش -> سند خودکار
2. دریافت/پرداخت -> سند خودکار
3. برگشت‌ها -> سند اصلاحی/معکوس

پارامترهای نسخه داخلی:

1. سال مالی هدف: 1405
2. VAT پیش‌فرض: 10٪
3. نیاز به فرآیند انتقال اطلاعات پایه: مشتریان، کالا/خدمات، مانده حساب‌ها، اسناد اولیه

### 4.5 AI-First Foundations

Provider:

1. `AvalAI` به عنوان provider اصلی v1.
2. API contract به‌شکل OpenAI-compatible طراحی می‌شود.
3. `base_url` و `model` در env قابل تغییر هستند.
4. پیاده‌سازی با adapter تا lock-in ایجاد نشود.

دامنه AI:

1. brief روزانه (task, receivable/payable, alerts)
2. پاسخ به سوالات بر اساس داده سازمان
3. کمک در ارتباط با مشتری/پرسنل
4. استفاده از اسناد سازمان (SOP / دستورالعمل / business plan)

جداول پایه:

1. `org_documents`
2. `document_chunks`
3. `document_embeddings`
4. `ai_threads`
5. `ai_messages`
6. `ai_action_logs`

### 4.6 Reporting Foundations

نسخه v1:

1. گزارش‌ساز کامل ساخته نمی‌شود.
2. اما data contracts و fact-ready tables آماده می‌شوند.

پایه پیشنهادی:

1. `report_definitions`
2. `report_widgets`
3. `report_data_sources`

## 5) JSON Reduction Strategy

وضعیت فعلی شامل JSONهای حجیم در حوزه تولید و فاکتور است.

روش اجرا:

1. Add normalized tables (non-breaking)
2. Dual-write (JSON + normalized)
3. Read-path migration
4. Freeze legacy JSON writes (پس از پایداری)

اهداف:

1. ساده‌سازی logic
2. کاهش bug
3. آماده‌سازی گزارش‌ساز

## 6) UX and Design Strategy

1. مهاجرت کامل UI از scope v1 خارج است.
2. یک Design Token Layer مرکزی ایجاد می‌شود:
   - color
   - spacing
   - typography
   - radius
   - elevation
3. dark/light mode یکپارچه می‌شود.
4. بازطراحی `ModuleShow` مرحله‌ای و کنترل‌شده انجام می‌شود.

## 6.1) Map Strategy (Domestic-First)

نیاز محصول:

1. نوع فیلد جدید برای موقعیت (انتخاب نقطه روی نقشه)
2. نمایش همه رکوردهای دارای موقعیت در نمای نقشه `ModuleList`

خط مشی:

1. پرداختی بودن provider الزامی نیست.
2. چون نیاز ترافیک/مسیر نداریم، نقشه خام کافی است.
3. برای کاهش ریسک قطع اینترنت بین‌الملل، provider داخلی یا self-hosted tile strategy ترجیح دارد.

پیاده‌سازی پیشنهادی v1:

1. `FieldType.LOCATION` واقعی (lat/lng + optional label)
2. renderer انتخاب نقطه روی نقشه
3. Map View عمومی در `ModuleList` برای ماژول‌های دارای فیلد location
4. abstraction برای provider نقشه (switchable)

## 7) 3-Week Execution Plan

### Week 1 - Foundation

1. Tenant-safe schema + RLS policies
2. Accounting core tables + posting engine skeleton
3. AI adapter + org documents foundation
4. Design token base + dark/light unification
5. Non-breaking schema for JSON reduction

### Week 2 - Core Workflows

1. CRM + کالا/خدمات + خرید/فروش تثبیت
2. تولید stage-first (حفظ `productionStages`)
3. پروژه‌ها روی stage/task
4. نقد و بانک (core flows)
5. Billboards + map view پایه

### Week 3 - Stability + AI Rollout

1. AI briefing + org Q&A
2. trial/readonly enforcement
3. bug fix + hardening + edge cases
4. report-builder foundations validation

## 8) Quality Gates

1. هیچ رکورد business بدون `org_id` وارد نشود.
2. تمام عملیات write زیر RLS تست شوند.
3. مسیرهای اصلی بدون JSON parsing پیچیده کار کنند.
4. خطاهای auth/session مانیتور شوند.
5. قابلیت readonly برای tenant دمو قطعی enforce شود.

## 9) Risks and Mitigation

1. Scope creep
   - Mitigation: قفل کردن scope هفتگی و freeze feature late.
2. Regression در تولید
   - Mitigation: حفظ `productionStages` و مهاجرت gradual.
3. ناسازگاری مالی
   - Mitigation: ledger-first و auto-posting rule tests.
4. نشت داده بین tenantها
   - Mitigation: RLS mandatory + policy review checklist.

## 10) Documentation Governance

این سند مرجع اصلی مسیر v1 است. هر تغییر مهم در scope/sequence باید اینجا ثبت شود.

نقش اسناد:

1. `README.md`: نمای کلی و quick start
2. `PROJECT_GUIDE.md`: توضیح فنی پروژه و الگوهای توسعه
3. `ARCHITECTURE.md`: جزئیات لایه‌ها و الگوهای معماری
4. `DATABASE_SETUP.md`: setup و migration notes دیتابیس
5. `BLUEPRINT_V1.md` (این سند): مسیر اجرایی رسمی
