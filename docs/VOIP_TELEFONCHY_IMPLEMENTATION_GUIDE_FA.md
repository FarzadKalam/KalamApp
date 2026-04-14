# راهنمای پیاده‌سازی VoIP با Telefonchy

این سند تصمیم‌های فنی و مسیر پیاده‌سازی پشتیبانی VoIP در KalamApp را ثبت می‌کند.

## هدف

هدف، ساختن یک مرکز کنترل تماس داخل CRM است، نه ساختن WebPhone داخل مرورگر.

قابلیت‌های اصلی:

- ثبت خودکار تماس‌های ورودی و خروجی.
- نمایش اعلان تماس ورودی با تشخیص مخاطب مرتبط.
- تماس سریع از روی شماره‌های رکوردها.
- اتصال تماس و پیامک به مشتریان، بازاریابی، تامین‌کنندگان و کارکنان.
- ویرایش سریع برچسب‌ها، گزارش اپراتور، مخاطب مرتبط، مسئول و وظیفه مرتبط در modal خلاصه.
- پخش صوت تماس داخل modal گزارش تماس.
- کنترل دسترسی مشاهده، ویرایش و اعلان‌های تماس از زیرساخت نقش‌ها.

## مدل تماس

API فعلی Telefonchy برای کنترل و گزارش تماس است. تماس سریع، به داخلی کاربر فرمان تماس می‌دهد و خود مکالمه روی ابزار VoIP کاربر انجام می‌شود؛ مثلا PortSIP روی موبایل یا PC، IP Phone یا SoftPhone دیگر.

بنابراین در فاز فعلی:

- KalamApp مکالمه صوتی داخل مرورگر اجرا نمی‌کند.
- کاربر در PortSIP یا داخلی خودش صحبت می‌کند.
- KalamApp اعلان، شناسایی مخاطب، ثبت لاگ، اتصال به رکورد، گزارش اپراتور و پخش فایل ضبط را انجام می‌دهد.

برای WebPhone واقعی داخل مرورگر، نیاز به SIP/WebRTC جداگانه داریم: SIP credentials، WebRTC gateway، STUN/TURN و کتابخانه‌ای مثل SIP.js یا JsSIP. این مورد جزو فاز اول نیست.

## PortSIP

چون PortSIP روی موبایل و PC استفاده می‌شود، دو مسیر قابل پشتیبانی است:

1. مسیر اصلی: تماس سریع Telefonchy
   - KalamApp از `smartcall` استفاده می‌کند.
   - تماس از داخلی و اپراتور همان کاربر برقرار می‌شود.
   - کاربر تماس را در PortSIP یا دستگاه VoIP خودش پاسخ می‌دهد.

2. مسیر کمکی: deep link
   - اگر سیستم عامل و PortSIP، schemeهایی مثل `sip:` یا `tel:` را ثبت کرده باشند، مرورگر می‌تواند PortSIP را باز کند.
   - این رفتار بین Windows، Android، iOS و تنظیمات PortSIP متفاوت است.
   - این مسیر باید قابل تنظیم و fallback باشد، نه منطق اصلی CRM.

پیشنهاد: در تنظیمات VoIP یک گزینه برای preferred dial mode داشته باشیم:

- `telefonchy_smartcall`
- `sip_link`
- `tel_link`

## پروفایل VoIP کاربر

برای هر کاربر/پروفایل این فیلدها لازم است:

- `voip_operator_code`: کد اپراتور در Telefonchy.
- `voip_extension`: داخلی کاربر.
- `voip_service_id`: سرویس پیش‌فرض در صورت چند سرویس بودن.
- `voip_enabled`: فعال بودن قابلیت تماس برای کاربر.
- `voip_dial_mode`: حالت تماس ترجیحی.

رفتار پیش‌فرض:

- تماس سریع از `voip_extension` همان کاربر انجام شود.
- `assignee_id` رکورد تماس به صورت پیش‌فرض همان کاربر باشد.
- اعلان تماس ورودی فقط به کاربری نمایش داده شود که داخلی مقصد با `voip_extension` او برابر است.
- کاربری که permission `__voip.fields.all_call_notifications` دارد، می‌تواند اعلان همه تماس‌ها را ببیند.

## دریافت تماس ورودی

دو نوع داده از Telefonchy لازم است:

- Event زنده تماس: برای اعلان هنگام زنگ خوردن.
- CDR بعد از پایان تماس: برای ثبت رکورد نهایی، مدت مکالمه، وضعیت و فایل صوت.

اگر Telefonchy event تماس زنده را فعال کند:

1. Edge Function رویداد را دریافت می‌کند.
2. شماره تماس با چهار ماژول هدف match می‌شود.
3. داخلی مقصد به کاربر مربوطه وصل می‌شود.
4. اعلان فقط برای همان کاربر و کاربران دارای دسترسی همه اعلان‌ها منتشر می‌شود.

اگر فقط CDR داشته باشیم:

- اعلان پس از پایان تماس ساخته می‌شود و برای پاسخ دادن در لحظه کافی نیست.

## ماژول تماس

ماژول پیشنهادی: `voip_call_reports`

رفتار:

- `systemManaged: true`
- `disableCreate: true`
- `disableDetailView: true`
- `listPreviewMode: 'modal'`
- کارت عمومی در ریلیشن‌بار
- کلیک کارت در ریلیشن‌بار، modal خلاصه را باز کند

فیلدهای اصلی:

- `title`
- `provider`
- `service_id`
- `call_id`
- `object_id`
- `direction`
- `status`
- `source_number`
- `destination_number`
- `extension`
- `operator_code`
- `trunk`
- `started_at`
- `ended_at`
- `wait_seconds`
- `talk_seconds`
- `file_id`
- `recording_url`
- `module_id`
- `record_id`
- `assignee_id`
- `operator_report`
- `related_task_id`
- `metadata`
- `tags`

## پیامک‌ها

گزارش پیامک فعلی از view `sms_delivery_reports` روی `outbound_messages` ساخته می‌شود. برای یکسان شدن تجربه، همین فیلدها باید برای پیامک‌ها هم قابل پشتیبانی شوند:

- `module_id`
- `record_id`
- `assignee_id`
- `operator_report`
- `related_task_id`
- `tags`

## Modal خلاصه قابل ویرایش

`RelatedRecordPopover` باید config-driven شود.

برای تماس و پیامک، فیلدهای قابل ویرایش:

- برچسب‌ها
- گزارش اپراتور
- مسئول
- مخاطب مرتبط
- وظیفه مرتبط

برای تماس:

- پخش فایل صوت تماس از `recording_url` یا دانلود بر اساس `file_id`.

برای مخاطب مرتبط:

- ابتدا `module_id` از میان `customers`، `marketing_leads`، `suppliers` و `employees` انتخاب شود.
- سپس `record_id` از همان ماژول انتخاب شود.

## ریلیشن‌بار

این تب‌ها به ماژول‌های زیر اضافه می‌شوند:

- مشتریان
- بازاریابی
- تامین‌کنندگان
- کارکنان

تب‌ها:

- تماس‌ها
- پیامک‌ها

فیلتر:

- `module_id = currentModuleId`
- `record_id = currentRecordId`

کارت‌ها از کارت عمومی استفاده می‌کنند، اما action کلیک برای تماس و پیامک باید modal خلاصه باشد.

## دسترسی‌ها

دسترسی‌های ماژولی:

- `voip_call_reports.view`
- `voip_call_reports.edit`
- `voip_call_reports.delete`
- `sms_delivery_reports.view`
- `sms_delivery_reports.edit`

دسترسی ویژه VoIP:

- `__voip.fields.all_call_notifications`

معنی:

- کاربر عادی فقط اعلان تماس داخلی خودش را می‌بیند.
- کاربر دارای این دسترسی، اعلان همه تماس‌ها را می‌بیند.

## ترتیب اجرای پیشنهادی

1. دیتابیس و ماژول `voip_call_reports`.
2. افزودن اتصال `voip`/`telefonchy` در تنظیمات اتصالات.
3. افزودن فیلدهای VoIP به پروفایل کاربر.
4. Edge Function تماس سریع.
5. Edge Function webhook تماس و CDR.
6. match شماره با چهار ماژول هدف.
7. اعلان زنده بر اساس داخلی کاربر و permission همه اعلان‌ها.
8. ارتقای modal خلاصه برای inline edit.
9. افزودن تب‌های تماس و پیامک به ریلیشن‌بار.
10. پخش صوت تماس داخل modal.
11. اعمال کامل permission و record scope.
