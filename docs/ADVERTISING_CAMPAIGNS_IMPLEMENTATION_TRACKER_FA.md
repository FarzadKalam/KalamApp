# رهگیری اجرای ماژول کمپین‌های تبلیغاتی

این سند مرجع ادامه کار در صورت فشرده‌شدن گفتگو است. وضعیت‌ها باید هم‌زمان با پیشرفت اجرا به‌روزرسانی شوند.

## تصمیم‌های قطعی محصول

- منوی «ارتباطات»: پیام‌رسانی، صندوق اینستاگرام، دستیار هوشمند، نامه‌ها و مکاتبات، کمپین‌های تبلیغاتی.
- فرم‌های تحویل زیر «منابع»؛ گروه دبیرخانه حذف می‌شود ولی داده و routeهای فعلی حذف نمی‌شوند.
- «پیام انبوه» ساخته نمی‌شود و همه ارسال‌ها داخل کمپین هستند.
- فهرست کمپین از ModuleList پروژه استفاده می‌کند؛ create/show به ویزارد اختصاصی می‌روند.
- ابزارهای پلنی: پیامک، ایمیل، گروه بات، پی‌وی بات، پست اینستاگرام و تماس صوتی. تماس صوتی فعلاً release-disabled است.
- ابزارهای دستی علاوه بر موارد اولیه: اینفلوئنسر، محتوا/سئو، همکاری در فروش و اسپانسرینگ.
- اینستاگرام در نسخه اول فقط برنامه‌ریزی/ثبت دستی و اتصال به پست همگام‌شده دارد.
- مخاطبان هنگام تأیید ارسال snapshot می‌شوند؛ فایل و مخاطبان داخلی union و dedupe می‌شوند.
- VAT ابزارها قابل ویرایش با پیش‌فرض ۱۰٪ است.
- بازه تطبیق پاسخ پیامک برای هر ابزار اجباری است؛ لغو۱۱ عدم تمایل تبلیغاتی per-org می‌سازد.
- همکار ابزار بدون دسترسی کامل، همان داشبورد را به‌شکل محدود و بدون Related/آمار کل می‌بیند.
- Related کامل کمپین: AI رکورد، یادداشت، فعالیت/تغییرات، لید، مشتری و فاکتور فروش.
- روی لید، مشتری و فاکتور علاوه بر کمپین، ابزار کمپین اختیاری ثبت می‌شود تا Attribution کانالی ممکن باشد.
- همه فیلدهای دارای معادل مرکزی باید با SmartFieldRenderer/SmartForm و pickerهای Adaptive رندر شوند؛ فیلد سفارشی فقط برای رفتار اختصاصی واقعی مجاز است.
- همه صفحات، تب‌ها، جدول‌ها و مودال‌ها mobile-first هستند و هیچ popup/dropdown نباید پشت Modal یا Drawer قرار بگیرد.

## مالکیت موازی

- ایجنت دیتابیس/Runtime: migrationهای جدید، RLS/RPC/index، import، dispatch، response، suppression و اتصال inbound SMS.
- ایجنت ویزارد: فایل‌های جدید ماژول/ویزارد/تب مشخصات و تنظیمات کانال‌ها و اجزای مشترک UI.
- ایجنت داشبورد: فایل‌های جدید داشبورد/مودال/گزارش/تقویم کمپین و تغییر configهای lead/customer/invoice.
- ایجنت اصلی: Layout، App routes، moduleRegistry، types مرکزی، SaaS Admin Plans، ادغام، نسخه، تازه‌ها و تست نهایی.
- فقط ایجنت دیتابیس مجاز به ساخت migration است تا شماره فاز تداخل نکند.

## Checklist اجرا

### پایه و قراردادها

- [x] تعریف typeها و constantهای مرکزی کمپین و plan featureها
- [ ] تعریف advertisingCampaignsConfig و support config ابزار/پاسخ
- [ ] ثبت moduleها در registry و system-code/assignee/tags
- [ ] route اختصاصی ویزارد و preloader
- [~] plan module gate عمومی و کنترل Layout/deep-link انجام شد؛ RPC و کنترل Runtime در انتظار تکمیل migration است

### Layout و SaaS Admin

- [x] ساخت گروه ارتباطات و جابه‌جایی گزینه‌ها
- [x] انتقال فرم‌های تحویل به منابع و حذف گروه دبیرخانه
- [x] افزودن کمپین به enabled_modules و قابلیت‌های کانالی به enabled_features
- [x] تطبیق گروه‌بندی نامه‌ها/فرم تحویل در صفحه پلن‌ها

### دیتابیس و امنیت

- [ ] جداول campaign shell/details/tools/content/customer-club joins
- [ ] جداول audience rules/import contacts/dispatch/recipients/responses/suppressions
- [ ] افزودن campaign_id و campaign_tool_id به lead/customer/invoice و outbound_messages
- [ ] RLS fail-closed، grants محدود، indexهای org و queryهای پرتکرار
- [ ] RPCهای dashboard/access/audience/dispatch/inbound matching
- [ ] triggerهای audit، system code، workflow queue و realtime-friendly updates

### ویزارد

- [ ] تب مشخصات با Hero فشرده، ابزارها، باشگاه، تخفیف، visibility و زمان
- [ ] تب تنظیمات با بلاک‌های lazy/toggle و فیلدهای عمومی ابزار
- [ ] پیامک: sender چندخطی، متن/متغیر/صفحه، هشدارها، هزینه، import و receive actions
- [ ] ایمیل، گروه بات، پی‌وی بات و پست اینستاگرام دستی
- [ ] ابزارهای دستی و custom tool types
- [ ] تب شرط‌ها با WorkflowConditionsGroup و preview/freeze سروری
- [ ] autosave، validation و archive بدون حذف اطلاعات
- [ ] بازبینی استفاده از renderer/pickerهای مرکزی برای همه فیلدها
- [ ] بازبینی responsive گوشی و popup container/z-index تمام dropdownها و date pickerها

### Runtime و فایل

- [ ] پوشه FileManager کمپین/ابزار/content و فایل‌های ستاره‌دار
- [ ] import امن XLSX/XLS/CSV با UTF-8، ارقام فارسی، progress و گزارش خطا
- [ ] صف batch idempotent با pause/resume/cancel/retry
- [ ] اتصال send-sms/send-email/bot-admin و ثبت canonical در outbound_messages
- [ ] sender_numbers سازگار با sender_number قدیمی و جلوگیری از sender جعلی
- [ ] پاسخ پیامک، بازه اجباری، update_related_record و عدم تمایل per-org
- [ ] حفظ قرارداد Process V2 برای ابزارها

### داشبورد و گزارش

- [ ] تفکیک ابزارهای خودکار/دستی، countdown و دکمه‌های عملیاتی
- [ ] KPI و نمودارهای estimate/actual، funnel و delivery
- [ ] تقویم range با انتخاب start/end و legend نوع ابزار
- [ ] مودال عریض ابزار با فایل/تغییرات/AI/گفتگو/custom fields/process
- [ ] گزارش ابزار با لید/مشتری/فاکتور صفحه‌بندی‌شده
- [ ] RelatedSidebar کامل و حالت محدود همکار ابزار
- [ ] افزودن سریع رکوردهای منتسب و conditional fields منبع جذب

### کیفیت و انتشار

- [ ] تست RLS چندسازمانی، visibility و tool-limited
- [ ] تست صفحه SMS، هزینه، import، snapshot، dispatch، inbound و opt-out
- [ ] تست ویزارد، داشبورد، تقویم، Related و Attribution
- [ ] تست viewport موبایل و بازشدن popupها روی Modal/Drawer بدون قرارگرفتن زیر overlay
- [ ] اجرای تست‌های فرآیند/گردش‌کار/SmartForm/اعلان/گزارش و npm run build
- [x] به‌روزرسانی minor version، version changes فارسی و صفحه تازه‌ها
- [ ] حفظ تغییرات محلی موجود در ReportBuilder/report-runtime و merge بدون overwrite
- [ ] عدم deploy تا تأیید صریح کاربر
