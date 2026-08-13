# مستندات رسمی API دایرکت و کامنت اینستاگرام — BoxAPI / SendBox

> منبع رسمی: `https://boxapi.ir/docs/instagram/instagram-official-api/`
>
> این سند، نسخهٔ ذخیره‌شدهٔ مرجع ارائه‌شده توسط کاربر در تاریخ ۱۴۰۵/۰۵/۲۳ است. هر توسعهٔ اتصال BoxAPI باید فقط بر پایهٔ قابلیت‌ها، محدودیت‌ها و payloadهای این سند انجام شود؛ قابلیتِ مستندنشده نباید به کاربر به‌عنوان قابلیت قطعی ارائه شود.

## ۱. احراز هویت

تمامی endpointها با هدر زیر فراخوانی می‌شوند:

| Header | مقدار | توضیح |
| --- | --- | --- |
| `X-Api-Key` | `YOUR_ACCESS_TOKEN` | توکن اختصاصی از بخش تنظیمات API پنل BoxAPI |

توکن هرگز نباید در Frontend یا مخزن عمومی قرار گیرد؛ فراخوانی‌ها فقط از سرور/Edge Function انجام می‌شوند.

## ۲. وب‌هوک

برای دایرکت، کامنت و پاسخ‌های آسنکرون `follow_status` و `list_posts` باید Webhook در تنظیمات API BoxAPI ثبت شود. BoxAPI می‌تواند آن را با `POST` یا `GET` فراخوانی کند.

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

## ۵. محدودیت‌ها و الزامات عملیاتی

- حداکثر ۲۰۰ درخواست در ساعت برای هر پیج، مطابق محدودیت Meta؛ BoxAPI صف‌بندی داخلی دارد.
- با حذف دسترسی توسط کاربر اینستاگرام یا BoxAPI، اطلاعات پیج ممکن است بدون اطلاع قبلی پاک شود.
- استفاده باید با سیاست‌های Instagram/Meta و حریم خصوصی سازگار باشد.
- payloadهای Webhook برای eventهای کامنت و نتیجهٔ `list_posts` در این نسخه از مرجع نمونهٔ کامل ندارند؛ parser باید نسخه‌پذیر و محافظه‌کار باشد و نمونهٔ واقعی لاگ‌شده را مبنای تکمیل schema قرار دهد.

## ۶. قرارداد محصول TazeSystem

1. یک Provider BoxAPI می‌تواند چند پیج داشته باشد و یک سازمان چند Provider؛ همهٔ داده‌ها per-org هستند.
2. دکمه‌های ویترین در مدل داخلی می‌توانند رفتارهایی مانند نمایش فیلد، درخواست اپراتور یا شروع گردش‌کار داشته باشند، اما در خروجی BoxAPI به یکی از دو نوع رسمی نگاشت می‌شوند:
   - رفتار داخلی → `postback` با JSON payload نسخه‌دار؛
   - لینک خارجی → `web_url`.
3. کلیک `postback` یک **رویداد** است، نه صرفاً شرط. موتور گردش‌کار باید trigger `instagram_button_clicked` داشته باشد و سپس پیج، ویترین، آیتم، دکمه، برچسب و payload را شرط‌گذاری کند.
4. دایرکت، کامنت و خروجی async پست‌ها باید ابتدا به جدول رویداد/دادهٔ مستقل ذخیره شوند تا Inbox دایرکت با حجم کامنت‌ها سنگین نشود.
