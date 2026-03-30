# Reporting Roadmap

## Scope Decision

در این فاز، گزارشات به دو مسیر اصلی تقسیم می‌شوند:

1. `گزارشات حسابداری`
2. `گزارش‌ساز پیشرفته برای ماژول‌های غیرحسابداری`

دلیل این تصمیم:

- گزارشات حسابداری باید استاندارد، کنترل‌شده و نزدیک به منطق نرم‌افزارهای مالی واقعی باشند.
- گزارش‌ساز پیشرفته باید flexible باشد و برای فروش، انبار، تولید و منابع انسانی استفاده شود.
- این تفکیک ریسک پیچیدگی زودهنگام را کم می‌کند و همسو با معماری meta-driven پروژه است.

## Agreed Product Direction

### Accounting Reports

- ورود از `داشبورد حسابداری`
- دارای `Hub` مستقل برای لیست گزارشات
- تعریف گزارشات به‌صورت `meta-driven`
- عدم ساخت صفحه مجزا برای هر گزارش مگر در موارد خاص
- حفظ `مرور حساب‌ها` فعلی به‌عنوان یکی از گزارشات اصلی

### Advanced Report Builder

- مخصوص ماژول‌های غیرحسابداری
- ویزارد چندمرحله‌ای
- اشتراک‌گذاری با کاربر و نقش
- گزارشات پیش‌فرض برای هر ماژول
- خروجی Excel / PDF / Print
- ارسال خودکار روزانه / هفتگی / ماهانه

## Architecture Direction

### Accounting Reports Runtime

هدف: یک runtime مشترک برای اجرای گزارشات حسابداری با rendererهای محدود و کنترل‌شده.

rendererهای پایه:

1. `linked_page`
2. `journal_book`
3. `general_ledger`
4. `trial_balance`
5. `financial_statement` (فاز بعد)

هر گزارش شامل این اجزا است:

- `key`
- `title`
- `group`
- `description`
- `renderer`
- `params`
- `export capabilities`

### Shared Shell

برای حفظ انسجام UX، این shell بین گزارشات حسابداری و report builder آینده تا حد ممکن مشترک می‌ماند:

- header
- parameter bar
- actions
- viewer body
- export actions

## Phase Plan

### Phase A - Foundation

1. ساخت سند roadmap
2. اضافه شدن `گزارشات حسابداری` به داشبورد حسابداری
3. ساخت routeهای مستقل:
   - `/accounting/reports`
   - `/accounting/reports/:reportKey`
4. تعریف config پایه گزارشات حسابداری

### Phase B - Core Accounting Reports

گزارشات اولیه:

1. مرور حساب‌ها
2. دفتر روزنامه
3. دفتر کل
4. تراز آزمایشی

پارامترهای کلیدی:

- بازه تاریخ
- انتخاب حساب در گزارشات مبتنی بر دفتر کل
- فیلترهای پایه قابل توسعه

### Phase C - Export / Print

1. خروجی Excel
2. چاپ
3. خروجی PDF واقعی

### Phase D - Financial Statements

1. سود و زیان
2. ترازنامه
3. جریان وجوه نقد

این فاز نیازمند data source دقیق‌تر و renderer اختصاصی است.

### Phase E - Advanced Builder

1. ویزارد گزارش‌ساز برای ماژول‌های غیرحسابداری
2. اشتراک‌گذاری با user / role
3. گزارشات پیش‌فرض هر ماژول
4. زمان‌بندی ارسال

## System Accounting Reports Backlog

### Core Reports

1. دفتر روزنامه
2. دفتر کل
3. دفتر معین
4. گردش حساب
5. تراز آزمایشی
6. تراز آزمایشی چندستونی

### Person / Treasury Reports

1. مانده مشتریان
2. مانده تامین‌کنندگان
3. چک‌های دریافتی
4. چک‌های پرداختی
5. سررسید چک‌ها
6. دریافت و پرداخت

### Financial Statements

1. سود و زیان
2. ترازنامه
3. جریان وجوه نقد

## Current Non-Goals

در این فاز وارد این موارد نمی‌شویم:

1. گزارش‌ساز عمومی برای حسابداری
2. cross-module builder پیچیده
3. SQL builder آزاد برای کاربر
4. schedule واقعی برای accounting reports
5. editable بودن report definitions سیستمی

## Risks

1. گزارشات مالی اگر با queryهای فرانت-heavy ساخته شوند، در مقیاس رشد مشکل performance می‌دهند.
2. صورت‌های مالی به renderer و data contract دقیق‌تر نیاز دارند و نباید با الگوی گزارشات جدولی ساده یکی فرض شوند.
3. مخلوط شدن system reports با advanced builder باعث افت کیفیت UX و maintainability می‌شود.

## Notes

- `مرور حساب‌ها` فعلی در short term حفظ می‌شود و از hub گزارشات حسابداری قابل دسترسی خواهد بود.
- گزارشات حسابداری باید به‌مرور به runtime مشترک نزدیک شوند، نه با refactor یک‌باره.
- در فازهای بعد، permissionهای گزارشات حسابداری می‌توانند granularتر شوند.
