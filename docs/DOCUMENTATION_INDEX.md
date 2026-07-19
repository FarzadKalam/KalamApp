# Documentation Index

**Last Updated:** 2026-07-19

**Purpose:** مرجع وضعیت اسناد پروژه برای جلوگیری از استفاده از فایل‌های قدیمی

## 1) Current (Primary Sources)

این فایل‌ها مرجع رسمی تصمیم و اجرا هستند:

1. `BLUEPRINT_V1.md` - مسیر رسمی محصول و اجرای v1
2. `README.md` - نمای کلی پروژه و شروع سریع
3. `PROJECT_GUIDE.md` - راهنمای فنی توسعه
4. `ARCHITECTURE.md` - معماری فنی و الگوها
5. `DEPLOYMENT.md` - استقرار
6. `DATABASE_V1_FULL.md` - پایگاه داده کامل هماهنگ با کانفیگ ماژول‌ها
7. `WORKFLOWS_PROCESS_AUTOMATION_FA.md` - مرجع طراحی workflow های عمومی و process automation
8. `VOIP_TELEFONCHY_IMPLEMENTATION_GUIDE_FA.md` - راهنمای پیاده‌سازی VoIP با Telefonchy
9. `telefonchy-api-reference-fa.md` - خلاصه مستندات API تلفنچی برای KalamApp
10. `PERFORMANCE_RUNTIME_GUIDE_FA.md` - قواعد اجباری کارایی برای Dashboard، ModuleList، ModuleShow و lookupهای جنریک
11. `app-versioning.md` - روال رسمی ثبت نسخه و release notes
12. `SEO_COMPLETE_GUIDE_FA.md` - راهنمای کامل SEO: راه‌اندازی اولیه، چک‌لیست انتشار محتوا، نگهداری دوره‌ای، AI search
13. `HARDWARE_ATTENDANCE_CUSTOMER_KIOSK_FA.md` - راهنمای ساخت پایلوت پلکسی دستگاه تردد، ثبت شماره مشتری و بارکدخوان فروشگاهی
14. `PROCESS_V2_PRODUCT_CONTRACT_FA.md` - قرارداد رسمی رفتار پیش‌نویس، اجرای واقعی، فعالیت، ذخیره و بارگذاری فرآیندهای V2
15. `CENTRAL_RECORD_RUNTIME_FA.md` - قرارداد مرکزی شرط‌ها، متغیرها، اکشن‌ها، Scope و خروجی امن

## 2) Needs Update (Not Fully Aligned With v1)

این فایل‌ها ارزشمند هستند اما هنوز با مسیر جدید کامل sync نیستند:

1. `RELATIONS_GUIDE.md`  
   - هنوز نام/برند قدیمی دارد.
   - باید با مدل tenant-safe و map/location و formula/bom sync شود.

2. `DATABASE_SETUP.md`  
   - بخشی از محتوا legacy و domain-specific است.
   - باید با `database_v1` و migration strategy جدید تکمیل شود.

3. `PRODUCTION_WORKFLOW_GUIDE.md`  
   - باید با مسیر stage-first + dual model (BOM + Formula) بازنویسی شود.

4. `FIELD_CONFIGURATION.md`  
   - نیازمند تکمیل برای `FieldType.LOCATION` واقعی و `Map View`.

## 3) Historical / Reference (Use With Caution)

این فایل‌ها بیشتر مرجع تاریخی/موضوعی هستند:

1. `AUTO_FILL_COMPLETE_GUIDE.md`
2. `DATE_FIX_SUMMARY.md`
3. `RAHNAMA_FARSI.md`

## 4) Rules

1. هر تصمیم مهم محصول/معماری اول در `BLUEPRINT_V1.md` ثبت شود.
2. اگر تصمیم روی توسعه اثر مستقیم دارد، `README.md` و `PROJECT_GUIDE.md` هم sync شوند.
3. قبل از شروع هر فاز، `DOCUMENTATION_INDEX.md` بررسی شود تا منبع قدیمی مبنا قرار نگیرد.
