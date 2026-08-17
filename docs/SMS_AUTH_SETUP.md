# راه‌اندازی Phone OTP با Supabase و ملی‌پیامک

این پروژه فعلا برای OTP گوشی از مسیر built-in خود `Supabase Auth` استفاده می‌کند:

1. فرانت با `supabase.auth.signInWithOtp` و `verifyOtp`
2. `GoTrue` با `Send SMS Hook`
3. Edge Function پروژه در `send-sms`
4. ارسال نهایی توسط ملی‌پیامک

## وضعیت فعلی

- `Supabase Auth` و payload hook در پروژه درست شده‌اند.
- مشکل اصلی فعلی در فرانت نیست.
- ریسک اصلی در مسیر provider، sender معتبر، و latency/route ملی‌پیامک است.

## migrationهای مرتبط

این migrationها برای همگام‌سازی شماره با سیستم کاربران سوپابیس مهم‌اند:

- `database_v1_phase27_auth_phone_login_sync.sql`
- `database_v1_phase28_phone_login_precheck.sql`
- `database_v1_phase29_phone_identity_precheck.sql`

خروجی مورد انتظار:

- `profiles.mobile_1` به فرم `+989...` نرمال شود
- `auth.users.phone` با همان شماره sync شود
- قبل از OTP، وجود کاربر و phone identity قابل precheck باشد

## تنظیمات پیشنهادی برای آخرین تست روش built-in

### auth hook

در self-hosted Supabase، `GoTrue` برای hookهای `http://` فقط `localhost` و `127.0.0.1` و `::1` را می‌پذیرد.  
پس آدرس‌هایی مثل `http://kong:8000/...` معتبر نیستند و باعث خطای config می‌شوند.

بنابراین در این پروژه باید از آدرس عمومی HTTPS استفاده شود:

```text
https://api.tazesystem.ir/functions/v1/send-sms?hook_secret=YOUR_SECRET
```

در `docker-compose.yml`:

```yml
GOTRUE_HOOK_SEND_SMS_ENABLED: "true"
GOTRUE_HOOK_SEND_SMS_URI: "https://api.tazesystem.ir/functions/v1/send-sms?hook_secret=${KALAM_AUTH_SMS_HOOK_SECRET}"
```

نکته:

- `GOTRUE_HOOK_SEND_SMS_SECRETS` را نگذار. قبلا باعث `invalid secret format` شده بود.

### envهای functions

```env
MELIPAYAMAK_USERNAME=
MELIPAYAMAK_PASSWORD=
MELIPAYAMAK_API_KEY=
MELIPAYAMAK_SENDER_NUMBER=

MELIPAYAMAK_SMS_CREDIT_URL=http://46.245.77.196/post/send.asmx/GetCredit
MELIPAYAMAK_OTP_URL=https://rest.payamak-panel.com/api/SendSMS/SendOtp
MELIPAYAMAK_OTP_SOAP_URL=http://46.245.77.196/post/Send.asmx/SendOtp
MELIPAYAMAK_CONSOLE_ADVANCED_URL=

KALAM_AUTH_SMS_HOOK_SECRET=
MELIPAYAMAK_OTP_MODE=soap
MELIPAYAMAK_OTP_TIMEOUT_MS=4200
MELIPAYAMAK_OTP_TEXT_TEMPLATE=کد تایید شما: {code}
```

اگر عمداً از `console_shared` استفاده می‌کنید، مقدار زمان پاسخ را کمتر از ۴۰۰۰ میلی‌ثانیه قرار ندهید. این مسیر گاهی پیامک را ثبت می‌کند اما پاسخ HTTP را با تأخیر کوتاه برمی‌گرداند؛ زمان کمتر باعث خطای داخلی در ورود، با وجود دریافت پیامک، می‌شود. خود تابع نیز برای این مسیر حداقل ۴۰۰۰ میلی‌ثانیه را اعمال می‌کند تا پاسخ hook پیش از سقف GoTrue برگردد.

چرا `soap`؟

- برای آخرین تست built-in، این کم‌ریسک‌ترین مسیر است.
- `SOAP` را توانستیم با IP مستقیم سریع‌تر از DNS/domain عمومی تست کنیم.
- `auto` داخل hook اگر چند fallback بزند، سریع به سقف ۵ ثانیه `GoTrue` می‌خورد.

## جمع‌بندی عیب‌یابی

تا اینجا این موارد قطعی شده‌اند:

- hook به function می‌رسد
- secret و payload درست parse می‌شوند
- فرانت مسیر built-in را درست صدا می‌زند
- `hook_timeout` فقط یک symptom است، نه ریشه اصلی

ریشه‌های واقعی که دیده‌ایم:

- sender برای بعضی متدهای ملی‌پیامک معتبر نیست
- بعضی endpointها maintenance/instability دارند
- برگشت از دامنه عمومی به خود `api.tazesystem.ir` برای hook، latency غیرضروری می‌سازد

## نتیجه عملی

اگر با این تنظیم نهایی:

- `GOTRUE_HOOK_SEND_SMS_URI=https://api.tazesystem.ir/functions/v1/send-sms?...`
- `MELIPAYAMAK_OTP_MODE=soap`
- `MELIPAYAMAK_OTP_SOAP_URL=http://46.245.77.196/post/Send.asmx/SendOtp`

باز هم پاسخ provider خطای `0` یا `5` بدهد، blocker دیگر سمت پروژه نیست؛
سمت ملی‌پیامک، sender provisioning، یا مجوز متد OTP است.
