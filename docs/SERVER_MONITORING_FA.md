# مانیتورینگ سرور Kalamapp

این watchdog هر دقیقه روی خود سرور اجرا می‌شود و برای پرشدن دیسک، توقف یا unhealthy شدن سرویس‌های حیاتی، آماده‌نبودن PostgreSQL و خطاهای pool/timeout PostgREST هشدار بله می‌فرستد. برای تشخیص قطع کامل سرور، باید یک `MONITOR_HEARTBEAT_URL` از سرویسی خارج از همین سرور تنظیم شود. بررسی‌های SSL و API در اختلال کوتاه DNS یا شبکه، پیش از هشدار تا سه بار تلاش می‌کنند.

## نصب روی سرور

برای نصب اولیه، فایل محرمانهٔ تنظیمات را فقط یک‌بار روی سرور بسازید:

```bash
install -m 600 ops/monitor.env.example /etc/kalamapp-monitor.env
nano /etc/kalamapp-monitor.env
```

در فایل تنظیمات، token بات بله، chat id مدیر و URL heartbeat بیرونی را وارد کنید. این مقادیر محرمانه‌اند و نباید در git قرار گیرند.

پس از آن، از workspace پروژه اجرا کنید:

```powershell
npm run deploy:monitor
```

این دستور watchdog را در `/usr/local/sbin/kalamapp-health-watchdog` نصب می‌کند، یک cron مستقل در `/etc/cron.d/kalamapp-health-watchdog` می‌سازد و صحت اجرای آن را بررسی می‌کند. اگر از نصب‌های قبلی یک زمان‌بندی تکراری در crontab کاربر root باقی مانده باشد، فقط همان خط تکراری حذف می‌شود. فایل token و chat id در `/etc/kalamapp-monitor.env` دست‌نخورده می‌ماند.

اگر کاربر دیپلوی root نیست، اسکریپت به‌صورت پیش‌فرض از `sudo` استفاده می‌کند. در صورت نیاز می‌توانید `MONITOR_DEPLOY_SSH_USER` و `MONITOR_DEPLOY_USE_SUDO=true` را در `.env.deploy` صریحاً تنظیم کنید.

## آزمایش

```bash
/usr/local/sbin/kalamapp-health-watchdog
```

برای آزمایش امن هشدار، به‌صورت موقت `MONITOR_DISK_WARNING_PERCENT=1` قرار دهید، اسکریپت را اجرا کنید و سپس مقدار را به 80 برگردانید.

## سیاست پیشنهادی اعلان

- بله: هشدار فوری عملیاتی برای سرور ایران.
- ایمیل: گزارش و پیگیری.
- SMS: فقط قطع API/DB بیش از دو دقیقه یا دیسک بالای 95٪.
- cooldown پیش‌فرض 15 دقیقه است تا یک خطا باعث بمباران پیام نشود.
