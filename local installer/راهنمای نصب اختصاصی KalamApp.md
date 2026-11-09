# راهنمای نصب اختصاصی KalamApp

> پیش‌نویس فاز اول. این بسته از Compose فعلی مخزن و فایل‌های رسمی Supabase در commit ثبت‌شده در `UPSTREAM.json` استفاده می‌کند. نصب clean و اجرای migration هنوز تأیید نشده است.

## پیش‌نیازها و آماده‌سازی

روی Ubuntu سرور اختصاصی، Docker Engine و افزونه Docker Compose v2، حداقل ۴ هسته CPU، ۸ گیگابایت RAM و فضای ذخیره‌سازی متناسب با فایل‌های مشتری لازم است. حداقل منابع نهایی باید پس از آزمون clean روی سرور واقعی تعیین شود.

دایرکتوری پروژه را در یک مسیر مستقل قرار دهید. فایل تنظیمات و Secretها را بیرون مخزن در `$HOME/.config/kalamapp/customer.env` نگه دارید. بار اول `install.sh` قالب بدون Secret را آنجا کپی می‌کند؛ سپس `CUSTOMER_PUBLIC_URL` را روی origin نهایی HTTPS مشتری بگذارید و نصب را دوباره اجرا کنید. در نصب اول، `KALAM_AUTH_SMS_HOOK_ENABLED` خاموش بماند مگر Hook و Secret مختص مشتری جداگانه پیکربندی شده باشد.

```bash
mkdir -p "$HOME/.config/kalamapp"
cp config/customer.env.example "$HOME/.config/kalamapp/customer.env"
chmod 600 "$HOME/.config/kalamapp/customer.env"
# CUSTOMER_PUBLIC_URL را در فایل بالا وارد کنید، سپس:
./scripts/generate-secrets.sh "$HOME/.config/kalamapp/customer.env"
./scripts/validate-environment.sh "$HOME/.config/kalamapp/customer.env"
```

اسکریپت `install.sh` ابتدا Compose را اعتبارسنجی می‌کند و سپس با تأیید متنی صریح imageها را می‌کشد و سرویس‌ها را بالا می‌آورد. در این جلسه نصب واقعی اجرا نشده است.

## TLS و دسترسی عمومی

سرویس Nginx داخل بسته، فایل‌های SPA را سرو می‌کند و مسیرهای API و Realtime را به Kong می‌فرستد. پورت Frontend فقط روی `127.0.0.1` باز است؛ reverse proxy مشتری باید روی همان میزبان به آن وصل شود. TLS باید روی آن reverse proxy terminate شود و فقط HTTPS به کاربران ارائه شود. فایل Nginx این بسته خودش گواهی صادر یا تمدید نمی‌کند؛ تنظیم گواهی و DNS به اپراتور مشتری وابسته است و باید قبل از تولید استفاده آزمایش شود.

## دیتابیس

`migrate.sh` عمداً migration اجرا نمی‌کند. فهرست SQL شامل صدها فایل، شماره‌های فاز تکراری و یک فایل bootstrap کامل است. تا وقتی ترتیب رسمی و آزمون clean تأیید نشده، اجرای migration مسدود است. از اجرای تصادفی یا صرفاً مرتب‌سازی نام فایل‌ها خودداری کنید.

## پشتیبان‌گیری و بازگردانی

`backup.sh` از PostgreSQL و فایل‌های storage نسخه می‌گیرد، checksum، زمان و اندازه را ثبت می‌کند و یک snapshot تنظیمات می‌سازد که مقادیر غیرمحرمانه را نگه می‌دارد و Secretها/credentialها را خالی می‌کند. Backup به‌طور پیش‌فرض بیرون مخزن ذخیره می‌شود. Secretها باید جداگانه در Secret Manager نگهداری شوند. `restore.sh` قبل از توقف سرویس‌ها و بازنویسی دیتابیس و storage تأیید متنی می‌خواهد. اسکریپت‌ها با دادهٔ ساختگی آزموده شده‌اند؛ Restore واقعی روی DB مشتری اجرا نشده است.

## محدودیت دامنه‌های ثابت

گزارش `HARD_CODE_AUDIT_FA.md` چند تابعی را نشان می‌دهد که هنوز به دامنه‌های مرکزی یا providerهای بیرونیِ ثابت وابسته‌اند. بسته تا رفع/تأیید این موارد و تست هر ماژول برای production پذیرفته نیست؛ این فاز عمداً منطق Functionها را تغییر نداده است.
