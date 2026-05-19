---
description: قوانین و الگوهای دیتابیس — فقط وقتی روی فایل‌های SQL یا migration کار می‌کنی
paths:
  - "database_v1_phase*.sql"
  - "supabase/**/*.sql"
  - "supabase/functions/**/*.ts"
---

# قوانین دیتابیس TazeSystem

## ساختار جداول
- همه جداول سازمانی باید `org_id uuid NOT NULL REFERENCES org_settings(id) ON DELETE CASCADE` داشته باشند
- timestamps استاندارد: `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- soft delete با `deleted_at TIMESTAMPTZ` (نه حذف فیزیکی)
- سیستم‌کد: از `generate_system_code(org_id, table_name)` استفاده کن

## RLS الزامی
هر جدول جدید باید RLS داشته باشد:
```sql
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

-- دسترسی سازمانی
CREATE POLICY "org members can view" ON my_table
  FOR SELECT USING (org_id = get_current_org_id());

CREATE POLICY "org members can insert" ON my_table
  FOR INSERT WITH CHECK (org_id = get_current_org_id());
```

## Functions و RPCs
- prefix: `get_` برای read، `update_` برای write، `record_` برای ثبت رویداد
- همیشه `SECURITY DEFINER` برای توابعی که به auth.users دسترسی دارند
- grant به `authenticated` و `anon` به‌صورت صریح

## Migrations
- فرمت نام: `database_v1_phase###_توضیح.sql`
- آخرین phase: **160** — بعدی باید **161** باشد
- همه دستورات باید idempotent باشند (`IF NOT EXISTS`, `OR REPLACE`)
- هرگز DROP بدون `IF EXISTS`

## ایندکس‌گذاری
- `org_id` روی همه جداول سازمانی
- `created_at DESC` برای جداولی که sort می‌شوند
- composite index برای `(org_id, status)` اگر فیلتر ترکیبی داری
