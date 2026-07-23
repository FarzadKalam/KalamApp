-- پیش‌فرض وضعیت لیدهای بازاریابی: پیش‌نویس
-- اجرای مجدد این تغییر بی‌خطر است.

alter table if exists public.marketing_leads
  alter column status set default 'draft';
