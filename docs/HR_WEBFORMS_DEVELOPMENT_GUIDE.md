# راهنمای توسعه HR و Web Forms

آخرین بروزرسانی: `2026-03-25`

## تصمیم‌های فعلی

- منبع لاگین و هویت: `auth.users`
- پروفایل سیستمی و مسئول رکوردها: `profiles`
- مسیر پیشنهادی HR: افزودن `employees` با فیلد `related_profile_id` به صورت nullable
- منبع پورسانت فعلی: `products.commission_percentage`
- فعلا فیلد پورسانت روی فاکتور فروش اضافه نمی‌شود
- در `invoices`، label فیلد `assignee` در UI با عنوان `بازاریاب` نمایش داده می‌شود

## وضعیت فعلی پروژه

- فیلد UI پورسانت محصول از قبل در کانفیگ محصول وجود دارد:
  - `modules/productsConfig.ts`
- برای پایدار شدن این تصمیم، migration دیتابیسی اضافه شده:
  - `database_v1_phase35_product_commission_percentage.sql`
- فاز هسته کارمندان هم شروع شده:
  - `database_v1_phase36_employees_module.sql`
  - `database_v1_phase37_employees_defaults_repair.sql`
  - `database_v1_phase38_employee_profit_share_fields.sql`
  - `database_v1_phase39_attendance_logs_module.sql`
  - `database_v1_phase40_attendance_assignee_repair.sql`
  - `modules/employeesConfig.ts`
  - `modules/attendanceLogsConfig.ts`
  - `moduleRegistry.ts`
  - `components/Layout.tsx`
- نکته اجرایی فاز 36:
  - فیلدهای عددی حقوقی در `employees` باید default صفر داشته باشند
  - migration فاز 36 باید nullهای احتمالی را backfill کند و دوباره `default/not null` را enforce کند
- schema کامل هم هم‌راستا شده:
  - `database_v1_full.sql`

## Migration Note

- اگر فازهای HR دیتابیس از `35` تا `39` هنوز اجرا نشده‌اند، فقط فایل `database_v1_phase40_attendance_assignee_repair.sql` را اجرا کن.
- فاز 40 الان به صورت تجمیعی این بخش‌ها را پوشش می‌دهد:
  - product commission
  - employees
  - employee profit share
  - attendance logs
  - work schedules

## منطق پورسانت مورد توافق

- پورسانت از روی رکورد محصول خوانده می‌شود
- فعلا روی خود فاکتور فروش فیلد پورسانت جداگانه اضافه نمی‌شود
- بازاریاب فعلا همان `assignee` رکورد فاکتور فروش است
- در آینده اگر نیاز به snapshot دقیق‌تر باشد، می‌توان هنگام ثبت/نهایی‌سازی فاکتور، درصد پورسانت هر ردیف را در همان ردیف فاکتور freeze کرد

## منطق درصد از سود

- حالت جدید برای برخی کارکنان/شرکا: `salary_type = profit_share`
- فیلدهای پایه روی `employees`:
  - `profit_share_percentage`
  - `profit_share_basis`
  - `profit_share_cost_center_id`
- پیشنهاد اجرایی:
  - فاز اول فقط یک مرکز هزینه برای هر نفر
  - محاسبه بر مبنای snapshot ماهانه باشد، نه گزارش زنده
  - ترجیح پیش‌فرض: `net_profit`
  - اگر کاربر بخواهد مدل ساده‌تر داشته باشد، `gross_profit` هم قابل انتخاب است

## مسیر اجرای توسعه

### فاز 1: هسته HR

- جدول `employees`
- اتصال اختیاری به `profiles` با `related_profile_id`
- ماژول کارکنان
- فیلدهای هویتی، قراردادی، بانکی، بیمه و مالیاتی

### فاز 2: تردد

- جدول `attendance_logs`
- جدول `attendance_daily_summary`
- ماژول تردد
- ثبت سریع با modal
- لینک/QR عمومی برای ثبت از بیرون پروژه

### فاز 3: فیش حقوقی

- جدول `payroll_periods`
- جدول `payslips`
- جدول `payslip_items`
- تولید خودکار draft از:
  - پایه
  - ساعتی
  - عملکردی
  - پورسانتی
  - آیتم‌های دستی مثل پاداش، جریمه، مساعده

### فاز 4: قراردادها

- ماژول `employee_contracts`
- استفاده از print templates و متغیرهای چاپ
- قرارداد قابل چاپ با اطلاعات کارمند

### فاز 5: Web Forms

- جدول `web_forms`
- جدول `web_form_fields`
- جدول `web_form_submissions`
- قابلیت تعریف:
  - نام
  - توضیح
  - فعال/غیرفعال
  - فیلدهای قابل نمایش
  - required
  - hidden
  - default value
- صفحه public داینامیک به جای فرم inquiry فعلی
- رنگ و هویت بصری از `company_settings`

## نکات اجرایی مهم

- تغییرات باید conservative بمانند
- تا وقتی مجبور نشده‌ایم، مکانیزم فعلی `assignee` دست نخورد
- HR را مستقیم روی `profiles` سنگین نکنیم، چون سناریوی کارمند بدون user داریم
- برای payroll، از محاسبه زنده صرف پرهیز شود و در نهایت `payslip snapshot` داشته باشیم

## شروع امن برای ادامه

ترتیب پیشنهادی پیاده‌سازی:

1. `employees`
2. `web_forms`
3. `attendance`
4. `commission calculation`
5. `payslips`
