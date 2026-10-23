# مستندات رسمی API دایرکت و کامنت اینستاگرام — BoxAPI / SendBox

> منابع رسمی: `https://boxapi.ir/docs/instagram/`، `https://boxapi.ir/docs/instagram/privacy/` و `https://boxapi.ir/docs/instagram/dm/rate-limit/`
>
> آخرین بررسی: ۲۰۲۶/۱۰/۲۳. هر توسعهٔ اتصال BoxAPI باید فقط بر پایهٔ قابلیت‌ها، محدودیت‌ها و payloadهای این سند انجام شود؛ قابلیتِ مستندنشده نباید به کاربر به‌عنوان قابلیت قطعی ارائه شود.

## ۱. احراز هویت

تمامی endpointها با هدر زیر فراخوانی می‌شوند:

| Header | مقدار | توضیح |
| --- | --- | --- |
| `X-Api-Key` | `YOUR_ACCESS_TOKEN` | توکن اختصاصی از بخش تنظیمات API پنل BoxAPI |

توکن هرگز نباید در Frontend یا مخزن عمومی قرار گیرد؛ فراخوانی‌ها فقط از سرور/Edge Function انجام می‌شوند.

## ۲. وب‌هوک

برای دایرکت، کامنت و پاسخ‌های آسنکرون `follow_status`، `list_posts` و `list_stories` باید Webhook در تنظیمات API BoxAPI ثبت شود. رویدادها ممکن است retry شوند؛ `event_id` باید کلید idempotency باشد.

نمونهٔ رویداد پیام:

```json
[
  {
    "body": {
      "event_id": "client_ig_111111111_1111111116",
      "event_type": "messaging",
      "account_id": "00000000-0000-0000-0000-000000000000",
      "data": {
        "time": 1785081317446,
        "id": "1234567890",
        "messaging": [
          {
            "sender": { "id": "1234567890" },
            "recipient": { "id": "1234567890" },
            "timestamp": 1785081317081,
            "message": { "mid": "abcxyz", "text": "سلام" }
          }
        ]
      }
    }
  }
]
```

`data.messaging[].sender.id` همان شناسهٔ گیرنده برای ارسال پیام دایرکت است.

### امنیت Webhook

- فقط HTTPS پذیرفته شود.
- Webhook Secret در پنل BoxAPI باید فعال باشد؛ امضای HMAC-SHA256 بدنهٔ خام و timestamp با مقایسهٔ زمان‌ثابت بررسی شود.
- timestamp بیش از ۵ دقیقه قدیمی پذیرفته نشود.
- BoxAPI تا ۳ بار با فاصلهٔ ۶۰ ثانیه رویداد تحویل‌نگرفته را تکرار می‌کند؛ پردازش باید idempotent بماند.

## ۳. Domain و Redirect URL

- Domain سرویس باید در پنل BoxAPI ثبت شود؛ در نبود آن `https://boxapi.ir` پیش‌فرض است.
- Redirect URL پس از ورود رسمی اینستاگرام فراخوانی می‌شود.
- Redirect URL باید زیرمجموعهٔ Domain ثبت‌شده باشد.

## ۴. Endpointها

### `GET /service/info`

اطلاعات حساب، پلن، Domain، Redirect و پیج‌های متصل را برمی‌گرداند.

پاسخ `data` شامل `id`، `domain`، `token`، `login_redirect_url`، `instagram_oauth_url`، اطلاعات کاربر و پلن، و `accounts` است. هر حساب شامل `id`، `username`، `instagram_user_id`، `profile_photo`، `internal_token`، `is_active` و `expires_at` است. سقف پیج قابل اتصال در `plan.account_limit` می‌آید.

### `GET /service/accounts`

فهرست صفحه‌بندی‌شدهٔ پیج‌های متصل را برمی‌گرداند. `id` هر پیج همان مقدار `account_id` برای endpointهای دیگر است.

### `DELETE /service/accounts/{id}`

پیج متصل را از BoxAPI حذف می‌کند. این حذف در سمت BoxAPI غیرقابل بازگشت است.

### `POST /service/actions/send_message`

ارسال دایرکت متنی یا Button Template.

```json
{
  "account_id": "ACCOUNT_UUID",
  "recipient_id": "SENDER_ID_FROM_WEBHOOK",
  "message": "برای ادامه یکی را انتخاب کنید",
  "buttons": [
    { "type": "postback", "title": "شروع", "payload": "START" },
    { "type": "web_url", "title": "سایت", "url": "https://example.com" }
  ]
}
```

پارامترهای الزامی: `account_id`، `recipient_id` و `message`.

انواع مستند دکمه فقط این‌ها هستند:

| type | پارامتر لازم | کاربرد |
| --- | --- | --- |
| `postback` | `title` و `payload` | انتخاب کاربر به Webhook بازمی‌گردد و باید به رویداد گردش‌کار تبدیل شود. |
| `web_url` | `title` و `url` | باز کردن یک لینک برای کاربر. |

> این مرجع هیچ endpoint یا schema مستندی برای «لیست محصول» یا «carousel محصول» در دایرکت تعریف نمی‌کند. ساختار محصولی داخلی فقط زمانی native ارسال می‌شود که BoxAPI قرارداد رسمی آن را منتشر کند؛ تا آن زمان باید به Button Template یا لینک امن تبدیل شود.

### `POST /service/actions/send_generic_template`

ارسال ۱ تا ۱۰ کارت در دایرکت. هر کارت می‌تواند `title`، `subtitle`، `image_url` و حداکثر سه دکمهٔ `web_url` یا `postback` داشته باشد. برای پیام‌های دکمه‌دار دارای تصویر، این endpoint مرجع است.

### `POST /service/actions/send_attachment`

ارسال فایل، صوت، ویدئو یا PDF. URL باید HTTPS باشد؛ تصویر PNG/JPEG حداکثر ۸ مگابایت و صوت/ویدئو/PDF حداکثر ۲۵ مگابایت است.

### `POST /service/actions/reply_comment`

پاسخ به کامنت مشخص روی پست:

```json
{
  "account_id": "ACCOUNT_UUID",
  "comment_id": "COMMENT_ID_FROM_WEBHOOK",
  "message": "پاسخ کامنت"
}
```

### `POST /service/actions/follow_status`

بررسی وضعیت فالو به‌صورت آسنکرون:

```json
{ "account_id": "ACCOUNT_UUID", "customer_id": "SENDER_OR_COMMENTER_ID" }
```

نتیجه از طریق Webhook دریافت می‌شود.

### `POST /service/actions/list_posts`

واکشی آسنکرون پست‌های یک پیج:

```json
{
  "account_id": "ACCOUNT_UUID",
  "fields": ["id", "media_type", "media_url", "permalink", "caption", "timestamp"],
  "limit": 10
}
```

نتیجه از طریق Webhook دریافت می‌شود، نه پاسخ مستقیم HTTP. فیلدهای نمونه شامل شناسه، نوع رسانه، URL رسانه، permalink، کپشن و زمان انتشار هستند.

### قابلیت‌های تکمیلی مستند

- Quick Reply در ارسال دایرکت؛
- Private Reply برای کامنت، فقط تا ۷ روز و فقط برای کاربری که پیش‌تر با پیج دایرکت نداشته است؛
- دریافت تاریخچهٔ چت و پیام، جزئیات پیام، فهرست استوری و پست، وضعیت فالو، لاگ API/Webhook، مدیریت کامنت‌ها و وضعیت پیج.

«پاسخ به یک پیام مشخص در دایرکت» و «ارسال لایک/Reaction پیام» endpoint یا payload منتشرشده ندارند؛ تا انتشار قرارداد رسمی، نباید در رابط کاربری به‌عنوان اقدام قابل انجام عرضه شوند.

## ۵. محدودیت‌ها و الزامات عملیاتی

- ارسال DM سرد یا انبوه ممنوع است: فقط به کاربری پیام بفرستید که قبلاً با پیج تعامل داشته است. این پروژه منبع مجاز را به مخاطبِ گفتگو/کامنتِ ثبت‌شده محدود می‌کند.
- نرخ‌ها به‌ازای هر پیج مستقل هستند: متن/لینک/Reaction/استیکر تا ۱۰۰ درخواست در ثانیه، صوت/ویدئو تا ۱۰ درخواست در ثانیه و Private Reply پست/ریل تا ۷۵۰ درخواست در ساعت. BoxAPI درخواست اضافه را صف می‌کند؛ صف داخلی جای rate-limit کنترل‌شده در برنامه نیست.
- با حذف دسترسی توسط کاربر اینستاگرام یا BoxAPI، اطلاعات پیج ممکن است بدون اطلاع قبلی پاک شود.
- استفاده باید با سیاست‌های Instagram/Meta و حریم خصوصی سازگار باشد.
- payloadهای Webhook برای eventهای کامنت و نتیجهٔ `list_posts` در این نسخه از مرجع نمونهٔ کامل ندارند؛ parser باید نسخه‌پذیر و محافظه‌کار باشد و نمونهٔ واقعی لاگ‌شده را مبنای تکمیل schema قرار دهد.

## ۶. قرارداد محصول TazeSystem

1. یک Provider BoxAPI می‌تواند چند پیج داشته باشد و یک سازمان چند Provider؛ همهٔ داده‌ها per-org هستند.
2. دکمه‌های ویترین در مدل داخلی می‌توانند رفتارهایی مانند نمایش فیلد، درخواست اپراتور یا شروع گردش‌کار داشته باشند، اما در خروجی BoxAPI به یکی از دو نوع رسمی نگاشت می‌شوند:
   - رفتار داخلی → `postback` با JSON payload نسخه‌دار؛
   - لینک خارجی → `web_url`.
3. ویترینِ دارای تصویر با `send_generic_template` و ۱ تا ۱۰ کارت ارسال می‌شود؛ ویترین بدون تصویر به پیام متنی/دکمه‌ای رسمی تبدیل می‌شود.
4. کلیک `postback` یک **رویداد** است، نه اقدامِ قطعی. موتور گردش‌کار باید رویداد `showcase_button_clicked` را بگیرد و سپس پیج، ویترین، آیتم، دکمه، برچسب و payload را شرط‌گذاری کند.
5. دایرکت، کامنت و خروجی async پست‌ها باید ابتدا به جدول رویداد/دادهٔ مستقل ذخیره شوند تا Inbox دایرکت با حجم کامنت‌ها سنگین نشود.
