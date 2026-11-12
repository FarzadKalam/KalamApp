# وضعیت فاز ۲ — نصاب و بسته‌بندی «نسخه‌های لوکال»

## جمع‌بندی وضعیت

فاز ۲ **تکمیل نشده و قابل نصب/انتشار نیست**. تمام تغییرهای جدید همچنان فقط در clone کاری و شاخهٔ محلی `feature/local-versions-wizard` هستند. فایل `installer/local/install.sh`، Compose مشتری، بستهٔ `tar.gz` و SHA-256 بسته ساخته نشده‌اند؛ هیچ release فعالی ثبت نشده است. این گزارش عمداً میان پیشرفت کد و آمادگی نصب واقعی تفاوت می‌گذارد.

## پیشرفت انجام‌شده در clone

- پایهٔ runtime برای اتصال مستقل نسخهٔ محلی اضافه شد: پیش از بارگذاری React، `kalamapp-runtime-config.js` خوانده می‌شود و `supabaseClient.ts` در صورت وجود تنظیمات runtime همان‌ها را به Vite env ترجیح می‌دهد. مقدار پیش‌فرض خالی است، پس در build عادیِ ابری تنظیمات Vite فعلی باقی می‌ماند. موارد frontend که URL را مستقیم از `import.meta.env.VITE_SUPABASE_URL` می‌خواندند به URL runtime مشترک تغییر کردند. پاسخ HTTP فایل runtime نیز در `_headers` بدون cache تنظیم شده است.
- دو view مدیریتی با RPCهای محدود و دارای بررسی مستقل مجوز جایگزین شدند؛ دسترسی به اطلاعات مرتبط SaaS از طریق خروجی محدود و `search_path` ثابت انجام می‌شود، نه view با `security_invoker=false`.
- نسخهٔ کاری clone به `2.117.0.0.5` افزایش یافت و `package.json`، دو مقدار نسخه در `package-lock.json` و `.version-changes.json` هم‌راستا شدند.
- بررسی ایستای image pinها انجام شد: هر ۹ image در manifest با Compose مرکزی همین clone یکسان‌اند. سه فایل JSON (`package.json`، `.version-changes.json` و manifest pin) parse شدند؛ نسخه در `package-lock.json` با دو مقدار مورد انتظار به‌صورت متنی کنترل شد. `git diff --check` نیز موفق بود. این **جایگزین** build، تست یا اعتبارسنجی upstream نیست.
- ساختار خروجی RPCهای فهرست و لاگ و تعداد ستون‌هایشان به‌صورت متنی کنترل شد (۳۵/۳۵ و ۸/۸)، تعریف view با `security_invoker=false` در migration وجود ندارد و frontend از RPCها استفاده می‌کند. این بررسی **جایگزین parser یا اجرای SQL در PostgreSQL نیست**.
- هیچ فایل مرکزی بیرون از clone، دیتابیس، GitHub یا محیط استقرار تغییر نکرد؛ commit/push و اجرای migration انجام نشده‌اند.

## بررسی و مانع upstream

GitHub API رسمی، commit قفل‌شدهٔ `61905186409ae82ef109d961805ff15d8ff703f6` را با امضای معتبر تأیید می‌کند [1]. اما tag رسمی `self-hosted/v0.8.3` به commit دیگری، یعنی `bc27d2661edd09a5d0b8d76ce33da6d4071a756e`، اشاره می‌کند [2]. پس نام tag قبلی نباید به‌جای commit قفل‌شده مبنا قرار گیرد؛ فقط فایل‌های همان commit exact باید در بستهٔ مشتری استفاده شوند. Compose رسمی در آن commit در مسیر `docker/docker-compose.yml` قرار دارد [3].

از رایانهٔ فعلی نتوانستم در clone، درخت کامل پوشهٔ upstream را دریافت و hash هر فایل را تأیید کنم: Git با EOF/TLS قطع شد، Schannel و `curl` با `SEC_E_NO_CREDENTIALS` متوقف شدند و درخواست PowerShell نیز اتصال را هنگام دریافت از دست داد. دریافت اطلاعات متنی از ابزار وب، فایل‌های کامل upstream را در اختیار filesystem این دستگاه قرار نمی‌دهد. برای جلوگیری از بسته‌بندی Compose مرکزی به‌جای Supabase رسمی، یا استفاده از tag ناهماهنگ، فایل‌های upstream را جعل/بازسازی نکردم.

## موارد آزمون‌نشده و ریسک‌های باز

- در این Windows، `node`، `npm` و Docker در دسترس نیستند؛ بنابراین `npm ci`، تست Vitest، `npm run build`، validator واقعی release pins، Compose config validation، و تولید و checksum گرفتن از tarball انجام نشده‌اند.
- migration فاز 573 روی PostgreSQL parse یا اعمال نشده است. RLS و حفظ دسترسی دو سازمان SaaS Admin موجود باید در دیتابیس آزمایشی و با حساب‌های نقش واقعی بررسی شود.
- runtime config در کد پیاده شده، اما TypeScript/build، رفتار Service Worker/cache و اجرای واقعی frontend با کلید تولیدشدهٔ Supabase هنوز آزمون نشده‌اند.
- نصب تازه، backup/restore، upgrade/rollback و health check روی Ubuntu LTS x86-64 اجرا نشده است. پس نه `install.sh` و نه وضعیت production-ready ادعا نمی‌شود.
- راهنمای رسمی Supabase برای کل stack حداقل ۴ GB RAM، ۲ هسته CPU و ۴۰ GB SSD را ذکر می‌کند؛ مقدار پیشنهادی آن ۸ GB، ۴ هسته و ۸۰ GB SSD است [4]. این نیازمندی‌ها باید پیش‌بررسی نصاب نهایی شوند.

## گام لازم برای ادامهٔ امن

برای تکمیل این فاز باید مسیر دریافت فایل از GitHub در یک محیط دارای TLS سالم فراهم شود یا پوشهٔ `docker/` همان commit `6190518` به‌صورت محلی تحویل شود تا SHA-1 هر Git blob تأیید و در `installer/local/` قرار گیرد. پس از آن می‌توان Composer مشتری، secrets محلی، migration runner و install/upgrade/backup/health script را با پیکربندی Ubuntu آزمایش کرد، build و test را اجرا نمود و فقط در صورت موفقیت tarball نهایی و SHA-256 تولید کرد. تا آن زمان release catalog باید غیرفعال بماند.

## منابع

[1]: https://api.github.com/repos/supabase/supabase/commits/61905186409ae82ef109d961805ff15d8ff703f6 "Supabase commit 6190518"
[2]: https://api.github.com/repos/supabase/supabase/git/tags/2a678bd96864b71b3148cf0dfb0dcd8fc399749a "Supabase self-hosted v0.8.3 tag object"
[3]: https://raw.githubusercontent.com/supabase/supabase/61905186409ae82ef109d961805ff15d8ff703f6/docker/docker-compose.yml "Supabase Docker Compose at pinned commit"
[4]: https://supabase.com/docs/guides/self-hosting/docker "Supabase self-hosting with Docker"
