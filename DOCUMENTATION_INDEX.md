# Documentation Index

**Last Updated:** 2026-02-25  
**Purpose:** مرجع وضعیت اسناد پروژه برای جلوگیری از استفاده از فایل‌های قدیمی.

## 1) Current (Primary Sources)

این فایل‌ها مرجع رسمی تصمیم و اجرا هستند:

1. `BLUEPRINT_V1.md` - مسیر رسمی محصول و اجرای v1
2. `README.md` - نمای کلی پروژه و شروع سریع
3. `PROJECT_GUIDE.md` - راهنمای فنی توسعه
4. `ARCHITECTURE.md` - معماری فنی و الگوها
5. `DEPLOYMENT.md` - استقرار
6. `DATABASE_V1_FULL.md` - پایگاه داده کامل هماهنگ با کانفیگ ماژول‌ها

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
