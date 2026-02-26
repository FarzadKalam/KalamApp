# Database V1 Phase 1

**Date:** 2026-02-25  
**SQL File:** `database_v1_phase1.sql`  
**Type:** Additive / non-breaking migration

## Scope

این migration برای نیازهای فعلی شما ساخته شده و موارد زیر را پوشش می‌دهد:

1. افزودن جدول `projects` (با وضعیت، مالک، بودجه، پیشرفت، location، draft process)
2. افزودن جدول `marketing_leads` (با فرآیند بازاریابی و اتصال به پروژه/مشتری)
3. ساخت موتور فرآیند مشترک:
   - `process_templates`
   - `process_template_stages`
   - `process_runs`
   - `process_run_stages`
4. اضافه شدن قابلیت کپی فرآیند از الگو به رکورد با تابع:
   - `public.create_process_run_from_template(...)`
5. افزودن جدول‌های عمومی اتصال:
   - `module_relations` (relation بین ماژول‌ها)
   - `ai_record_contexts` (context داده برای AI)
6. افزودن ستون‌های سازگاری به جدول‌های فعلی (اگر موجود باشند):
   - `production_boms`, `production_orders`
   - `customers`, `suppliers`
   - `tasks`, `invoices`, `purchase_invoices`
7. RLS سازمان‌محور (`org_id`) برای جدول‌های جدید

## Why This Matches Current Direction

1. `productionStages` فعلی حذف نشده و دست‌نخورده می‌ماند.
2. برای پروژه و بازاریابی، مدل template/run اضافه شده که همان الگوی draft -> copy را پوشش می‌دهد.
3. اتصال عمومی تقریباً همه ماژول‌ها به `tasks/notes/changelog/ai` در لایه دیتابیس آماده شده است.
4. برای دیتابیس قبلی هم migration شکست نمی‌خورد چون FKها به‌صورت شرطی و `NOT VALID` اضافه می‌شوند.

## Apply Order

برای دیتابیس جدید:

1. `database.sql`
2. `database_v1_phase1.sql`

برای دیتابیس قبلی:

1. از بکاپ بگیرید.
2. مستقیم `database_v1_phase1.sql` را اجرا کنید.
3. اگر خطای داده قدیمی داشتید، FKهای `NOT VALID` را بعد از پاکسازی داده `VALIDATE` کنید.

## Next DB Step (Phase 2)

1. هسته حسابداری دوبل (`fiscal_years`, `chart_of_accounts`, `journal_entries`, `journal_lines`)
2. شروع سال مالی 1405 + تنظیم VAT 10%
3. migration تدریجی JSON-heavy بخش‌ها به جداول نرمال
