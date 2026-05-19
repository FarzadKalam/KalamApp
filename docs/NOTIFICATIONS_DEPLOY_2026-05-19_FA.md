# Deploy Note: Notifications Stabilization

این تغییرات فقط با deploy فرانت کامل نمی‌شوند.

## باید deploy شوند

1. فرانت
2. migration دیتابیس:
   - `database_v1_phase157_notifications_access_hardening.sql`
3. Supabase Edge Function:
   - `bot-admin`

## ترتیب پیشنهادی اجرا

1. اجرای migration دیتابیس
2. deploy تابع `bot-admin`
3. deploy فرانت

این ترتیب مهم است چون:
- RLS جدید باید قبل از تکیه کامل UI به visibility هدفمند فعال باشد.
- پاسخ کنترل‌شده‌ی `bot-admin/import_rubika_file` باید قبل از باز شدن UI جدید روی production در دسترس باشد.

## دستورات پیشنهادی

### اجرای migrationهای سرور

```powershell
npm run db:migrate:server:list
npm run db:migrate:server:latest
```

اگر فقط همین migration را می‌خواهی اجرا کنی:

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/run-server-db-migrations.ps1 -SqlFiles ./database_v1_phase157_notifications_access_hardening.sql
```

### deploy تابع `bot-admin`

```powershell
npm run deploy:function -- -Function bot-admin
```

### deploy فرانت

```powershell
npm run deploy:prod
```

## تنظیمات لازم در `.env.deploy`

برای migration سرور:
- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`

در صورت نیاز:
- `DB_MIGRATE_SSH_USER`
- `DB_MIGRATE_CONTAINER`
- `DB_MIGRATE_DATABASE`
- `DB_MIGRATE_DB_USER`
- `DB_MIGRATE_USE_SUDO`

برای deploy function:
- `DEPLOY_FUNCTIONS_PATH`

در صورت نیاز:
- `DEPLOY_FUNCTIONS_COMPOSE_DIR`
- `DEPLOY_FUNCTIONS_COMPOSE_FILE`
- `DEPLOY_FUNCTIONS_SERVICE`
- `DEPLOY_FUNCTIONS_FILES_WITH_SUDO`
- `DEPLOY_FUNCTIONS_RESTART_WITH_SUDO`

## چک بعد از deploy

1. کاربر A یک `system note` هدفمند دریافت کند.
2. کاربر B همان note را نبیند.
3. در Console مرورگر دیگر loop خطای `bot-admin 400` برای hydrate فایل Rubika تکرار نشود.
4. در Console مرورگر دیگر `demo-data-admin 400` برای org غیردمو دیده نشود.
5. `instructions` دیگر query ناسازگار با `process_template_id` نزند.
