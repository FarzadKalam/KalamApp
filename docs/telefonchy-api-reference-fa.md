# خلاصه مستندات API تلفنچی برای KalamApp

این فایل خلاصه عملیاتی مستندات Telefonchy برای پیاده‌سازی VoIP در KalamApp است. متن کامل مستندات در سایت Telefonchy نگهداری می‌شود و این فایل فقط نکات لازم برای طراحی داخلی پروژه را ثبت می‌کند.

منابع اصلی:

- فهرست API: https://telefonchy.com/page/api/
- دریافت لیست تماس‌ها: https://telefonchy.com/tutorial/4604/
- CDR پس از پایان تماس: https://telefonchy.com/tutorial/4621/
- دریافت اطلاعات یک تماس: https://telefonchy.com/tutorial/4736/
- دریافت اطلاعات پایه سرویس: https://telefonchy.com/tutorial/%D8%AF%D8%B1%DB%8C%D8%A7%D9%81%D8%AA-%D8%A7%D8%B7%D9%84%D8%A7%D8%B9%D8%A7%D8%AA-%D9%BE%D8%A7%DB%8C%D9%87-%D8%B3%D8%B1%D9%88%DB%8C%D8%B3/
- تماس سریع: https://telefonchy.com/tutorial/4843/

## احراز هویت

در درخواست‌های API باید header زیر ارسال شود:

```http
webservice-token: <TOKEN>
```

Token باید در `integration_settings` با connection type مربوط به VoIP ذخیره شود و در client مستقیم استفاده نشود.

## دریافت لیست تماس‌ها

Endpoint:

```http
GET https://panel.telefonchy.com/webservice/v1/calls
```

پارامترهای مهم:

- `service_id`
- `started_at_from`
- `started_at_to`
- `type`: `incoming` یا `outgoing`
- `call_source`
- `call_dest`
- `status`
- `trunk`
- `exten`
- `page`
- `per_page`

فیلدهای مهم خروجی:

- شناسه تماس
- `object_id`
- `call_source`
- `call_dest`
- `type`
- `status`
- `time_wait`
- `time_talk`
- `started_at`
- `ended_at`
- `trunk`
- `exten`
- `contact`
- `file_id`

کاربرد در KalamApp:

- import تاریخچه تماس‌ها.
- sync مجدد در صورت از دست رفتن webhook.
- تکمیل اطلاعات رکورد تماس.

## CDR پس از پایان تماس

Telefonchy بعد از پایان تماس، CDR را به URL تعریف‌شده در پنل ارسال می‌کند.

فیلدهای مهم payload:

- `call_id`
- `object_id`
- `service_id`
- `exten`
- `type`
- `trunk`
- `status`
- `call_source`
- `call_dest`
- `time_wait`
- `time_talk`
- `started_at`
- `ended_at`
- `file_id`

کاربرد در KalamApp:

- ساخت یا به‌روزرسانی رکورد `voip_call_logs`.
- ثبت وضعیت نهایی تماس.
- ثبت مدت انتظار و مکالمه.
- نگهداری `file_id` برای دریافت یا پخش صوت.
- match کردن شماره با مخاطب مرتبط.

نکته: CDR برای اعلان زنده هنگام زنگ خوردن کافی نیست، چون بعد از پایان تماس ارسال می‌شود.

## دریافت اطلاعات یک تماس

Endpoint برای دریافت جزئیات یک تماس با شناسه تماس استفاده می‌شود.

کاربرد:

- تکمیل رکوردی که با webhook ناقص ثبت شده است.
- بررسی وضعیت تماس در عملیات پشتیبانی یا sync.

## دریافت اطلاعات پایه سرویس

این API اطلاعات سرویس، خطوط و داخلی‌ها را برمی‌گرداند.

کاربرد در KalamApp:

- تست اتصال VoIP.
- نمایش سرویس‌های فعال در تنظیمات اتصال.
- انتخاب `service_id` پیش‌فرض.
- ساخت mapping داخلی‌ها به کاربران.
- اعتبارسنجی `voip_extension` کاربران.

## تماس سریع

Endpoint:

```http
GET https://panel.telefonchy.com/webservice/v1/smartcall
```

پارامترهای مهم:

- `service_id`
- `exten`
- `to`

رفتار:

- Telefonchy به داخلی کاربر فرمان تماس می‌دهد.
- کاربر باید در ابزار VoIP خودش آنلاین باشد.
- مکالمه در PortSIP، IP Phone یا SoftPhone انجام می‌شود.

کاربرد در KalamApp:

- دکمه تماس VoIP کنار شماره‌ها.
- استفاده از `voip_extension` کاربر جاری.
- ثبت لاگ اولیه تماس خروجی.
- اتصال CDR نهایی به همان رکورد.

## صوت مکالمه و صندوق صوتی

در فهرست API، قابلیت‌های دریافت فایل صوت تماس و voicemail وجود دارد. در خروجی تماس‌ها و CDR، `file_id` مبنای دریافت صوت است.

کاربرد در KalamApp:

- ذخیره امن فایل صوت در storage داخلی، یا دریافت موقت با proxy امن.
- نمایش player داخل modal گزارش تماس.
- جلوگیری از افشای token Telefonchy در browser.

## نکات امنیتی

- Token تلفنچی هرگز نباید در client ارسال شود.
- فراخوانی‌های Telefonchy باید از Edge Function انجام شود.
- webhook باید secret یا signature داخلی داشته باشد.
- payload خام در `metadata` ذخیره شود، اما داده حساس در UI عمومی نمایش داده نشود.
- دسترسی شنیدن صوت تماس باید با permission و record scope کنترل شود.

## mapping شماره با مخاطب

شماره‌های تماس باید با چهار ماژول match شوند:

- `customers`
- `marketing_leads`
- `suppliers`
- `employees`

در حالت چند match:

- رکورد تماس با وضعیت نیازمند تعیین مخاطب ذخیره شود.
- notification و modal باید گزینه انتخاب مخاطب مرتبط داشته باشند.

## mapping داخلی با کاربر

هر کاربر باید `voip_extension` داشته باشد.

قانون اعلان:

- اگر تماس به داخلی کاربر آمد، اعلان به همان کاربر نمایش داده شود.
- اگر کاربر permission `__voip.fields.all_call_notifications` داشت، اعلان همه تماس‌ها را ببیند.
