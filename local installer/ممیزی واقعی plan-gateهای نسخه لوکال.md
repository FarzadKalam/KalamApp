# ممیزی واقعی قفل‌های پلن برای نسخهٔ لوکال KalamApp

**هدف:** مشخص‌کردن اینکه کدام محدودیت‌ها entitlement پلن SaaS هستند و کدام‌ها permission کاربر، gate ماژول، وابستگی سرویس یا کنترل امنیتی‌اند.  
**مبنای کد:** commit `75a80fc7fb41a938b353b69e5e96aa13b2181c05` از شاخهٔ `fix/organization-membership-context`، به‌علاوه فایل‌هایی که مستقیماً از checkout محلی خوانده شدند.  
**وضعیت:** inventory اولیهٔ کد، نه ممیزی جامع/تأیید Production. هیچ کدی، SQL یا migration در این کار تغییر یا اجرا نشد.

## خلاصهٔ نتیجه

پاسخ محصولی روشن است: در self-hosted نباید پلن SaaS دسترسی به قابلیت‌های محصول را محدود کند؛ اما تبدیل همهٔ plan gateها به `true` نیز راه‌حل امنی نیست. کد فعلی تصمیم entitlement را در چند مسیر جداگانه می‌گیرد: frontend helper، SQL/RLS، Edge Function و trigger/RPC. برخی gateها با نبود پلن fail-closed هستند، برخی default باز دارند، و بعضی capabilityهای AI هنگام نبود تنظیمات SaaS باز فرض می‌شوند. برداشتن شرط رابط کاربری به‌تنهایی نه وابستگی SaaS را رفع می‌کند و نه دسترسی امن را ثابت می‌کند.

قاعدهٔ هدف باید این باشد: **در self-hosted تمام entitlementهای محصولی مجاز باشند، اما role/permission، دسترسی ماژول، org scope، RLS، مالکیت رکورد، امضای webhook و محدودیت service-role مستقل باقی بمانند.** اگر سرویسی مانند SMTP، پیامک یا gateway مشتری تنظیم نشده، قابلیت موجود است ولی اتصال «تنظیم نشده» اعلام شود؛ نباید با حساب مرکزی KalamApp جایگزین شود.

## مبنای عمومی entitlement و permission

در `utils/saasPlanFeatures.ts`، helper عمومی `hasCurrentOrgPlanFeature` تصمیم را در سطح سازمان می‌گیرد، نه نقش کاربر. RPC آن `current_org_has_plan_feature` است؛ نتایج در cache با کلید سازمان/feature و زمان ۶۰ ثانیه نگهداری می‌شوند. خطای RPC به `defaultEnabled` برمی‌گردد، بنابراین defaultهای متفاوت هر فراخوانی مهم‌اند.

در migration `database_v1_phase448_org_saas_admin_feature_access.sql`، تابع `org_has_plan_feature` ابتدا org و کلید نامعتبر را رد می‌کند؛ سازمان دارای SaaS Admin را برای همهٔ featureها مجاز می‌داند؛ سپس override سازمان را بر `saas_plans.enabled_features` مقدم می‌کند و در نبود مقدار، default فراخوانی را برمی‌گرداند. تابع `current_org_has_plan_feature` در نبود `auth.uid()` یا `current_org_id()` صریحاً false می‌دهد. این مدل برای SaaS طراحی شده است و برای نسخهٔ مستقل باید منبع entitlement محلی جایگزین شود، نه اینکه کنترل هویت/سازمان حذف شود.

## کلیدها و gateهایی که در کد پیدا شدند

### کلیدهای ثابت و آشکار

`utils/saasPlanFeatures.ts` این کلیدها را تعریف می‌کند: `multi_lane_processes`، `content_calendar`، `retail_sales_invoice`، `qr_scan`، `reservations` و `wordpress_connection`. خطای RPC برای پنج مورد معمولاً به default خاموش برمی‌گردد؛ `multi_lane_processes` استثنائاً `defaultEnabled: true` دارد.

`utils/advertisingCampaigns.ts` شش feature مستقل برای کانال‌های کمپین ثبت می‌کند: `campaign_sms`، `campaign_email`، `campaign_bot_group`، `campaign_bot_private`، `campaign_instagram_post` و `campaign_voice_call`. این‌ها از plan gate ماژول `advertising_campaigns` جدا هستند.

### کلیدهای دیگر که در call-siteها یا لایه‌های دیگر دیده شدند

`customer_club`، `billboard_status_management`، `instagram_inbox`، `mbti_ai_analysis`، `online_catalog`، `custom_domain`، `own_payment_gateway`، `online_invoice_payment`، `organization_email` و `support_tickets`.

AI نیز یک خانوادهٔ جدا از capabilityها دارد: `ai_chat`، `ai_document_analysis`، `ai_deep_reasoning`، `ai_legal_assistant`، `ai_web_search`، `ai_voice_input`، `ai_image_generation`، `ai_voice_output`، `ai_video_generation`، `ai_voip_auto_reply` و `ai_knowledge`. `ai_knowledge` در بعضی مسیرهای AI نقش جایگزین دارد؛ قاعدهٔ آن را نباید به‌صورت یک entitlement مستقل در تمام actionها فرض کرد.

شناسهٔ plan module مانند `advertising_campaigns` با feature key کانال فرق دارد. همچنین کلیدهای `__customer_club`، `__communications`، `__settings_tabs`، `__saas_admin` و `advertising_campaigns:edit/send` از جنس permission کاربر/ماژول هستند، نه plan feature.

این فهرست، تمام کلیدهای پویای دیتابیس یا feature gateهای پراکنده در همهٔ ۷۴ فایل `*Config.ts`، ۳۳ پوشهٔ Edge Function و کل کد را تضمین نمی‌کند؛ جست‌وجوی کامل و تطبیق همهٔ call-siteها هنوز لازم است.

## خلاصهٔ ۱۶ حوزهٔ بررسی‌شده

| حوزه | شواهد فعلی از قفل پلن | چه چیزی باید در local بماند | اطمینان/شکاف اصلی |
|---|---|---|---|
| تقویم محتوا | frontend از `content_calendar` با default خاموش استفاده می‌کند. migration فاز 474، RLS عملیات جدول و trigger اتصال تقویم به پروژه/فعالیت را نیز به plan وابسته کرده است. | entitlement محلی جای plan؛ role access و `org_id = current_org_id()` و اعتبارسنجی اتصال رکوردها حفظ شود. | خود migration و hook محلی بررسی شد؛ RLS فعلی در شواهد خوانده‌شده به permission نقش وصل نبود. نقش/RLS نیازمند بررسی امنیتی است. |
| باشگاه مشتریان | `customer_club` در UI/Layout و quick-create بررسی می‌شود؛ بعضی مسیرها در خطا default باز و بعضی بسته‌اند. | مجوز `__customer_club` و محدودیت سازمانی مستقل از entitlement بماند. | queryها مستقیم‌اند؛ RLS و enforcement سرور/دیتابیس به‌طور کامل بررسی نشده است. |
| رزروها | plan feature `reservations` با default خاموش؛ نمایش همچنین به module `reservations` و permission نقش وابسته است. | همهٔ این کنترل‌ها جداگانه حفظ شوند؛ فقط plan SaaS با policy local جایگزین شود. | رفتار UI تأیید شده؛ RPC/RLS و کنترل CRUD سمت سرور کامل بررسی نشده است. |
| تغییر وضعیت تابلو | feature `billboard_status_management` در SQL با default باز دیده می‌شود؛ module `billboards` با default بسته، و مجوزهای view/edit/request/approve جدا هستند. | role، module، org scope، trigger و RPCهای محدود حفظ شوند. | SQL کنترل‌های قابل‌توجه دارد؛ پیش‌فرض‌های permission و تعارض defaultها نیازمند آزمون‌اند. |
| فرآیندهای چندمسیره | `multi_lane_processes` در helper با default باز؛ RPC بررسی entitlement؛ یک عملیات فعال‌سازی nodeها کنترل org دارد ولی plan gate همان عملیات از migration بررسی‌شده اثبات نشد. | احراز هویت، org ownership و permissionهای runtime حفظ شود؛ خطای SaaS نباید معادل مجوز شود. | تمام consumerها و server-side authorization آن‌ها هنوز inventory نشده‌اند. |
| کمپین‌ها و کانال‌ها | `advertising_campaigns` به‌عنوان module، به‌علاوه شش feature کانال. SQL trigger/dispatch و Edge import/runtime gate دارند. | role، module، `edit/send`، مالکیت/scope کمپین، RLS و مرز service-role دست‌نخورده بماند. | یکی از حوزه‌های دارای شواهد سروری قوی‌تر؛ تست end-to-end هنوز اجرا نشده است. |
| کاتالوگ و پرداخت آنلاین | `online_catalog`، `custom_domain`، `own_payment_gateway` و `online_invoice_payment` در UI و RPCهای عمومی/پرداخت بررسی می‌شوند؛ defaultها عمدتاً بسته‌اند. | entitlement local و دامنه/درگاه متعلق به مشتری؛ public RPC، token، RLS، idempotency پرداخت و scope سازمان حفظ شود. | SQL/RPCهای متعدد بررسی شدند؛ آزمون gateway واقعی یا کل مسیر Edge انجام نشده است. |
| ایمیل سازمانی | `organization_email` در SQL و Edge با default خاموش بررسی می‌شود؛ role و permissionهای ارتباطات/تنظیمات جدا هستند. | SMTP/IMAP سفارشی مشتری کار کند؛ secret encryption و tenant boundary حفظ شود؛ ایمیل managed مرکزی فقط با زیرساخت مستقل مشتری. | migration و Edge محلی مستقیماً خوانده شد. تغییرهای frontend ایمیل قبلاً uncommitted دیده شده بودند، اما به‌دلیل در دسترس نبودن ترمینال، diff تازه قابل تطبیق نیست. |
| WordPress/WooCommerce | Edge `external-connectors`، عضویت و نقش را همراه `wordpress_connection` بررسی می‌کند؛ webhook امضای HMAC و کلید اتصال لازم دارد. | فقط plan entitlement محلی شود؛ auth، membership، readonly، HMAC، org scope و راز webhook بماند. | مسیر Edge خوانده شد؛ RLS/RPCهای مربوط به ذخیرهٔ سفارش و تست‌ها کامل بررسی نشده‌اند. |
| AI | Edge چند capability را با plan context و `org_ai_settings.feature_flags` می‌سنجد. نبود `saas_org_settings` در یک مسیر به fallback باز منجر می‌شود. | همهٔ actionها در نسخهٔ local موجود؛ entitlement محلی، role، org، record scope، اعتبار مصرف و تنظیم provider جدا. | فایل Edge بسیار بزرگ است؛ ترتیب enforcement تمام actionها و SQL مربوط هنوز کامل audit نشده است. fallback موجود ریسک است. |
| صندوق اینستاگرام | UI/Layout از `instagram_inbox` با default بسته استفاده می‌کنند؛ Edge مجوزهای view/edit دارد ولی plan gate سروری در کد بررسی‌شده پیدا نشد. | feature موجود، provider مشتری و مجوزهای کاربر/سازمان باقی بماند. | route مستقیم UI gate اختصاصی ندارد؛ RLS/realtime و migrationها بررسی کامل نشده‌اند. |
| تحلیل MBTI | صفحه `mbti_ai_analysis` را با default باز برای UI می‌سنجد؛ Edge helperهای action permission وجود دارند. | plan local شود؛ بررسی server-side هویت، مجوز و تعلق ارزیابی به org اجباری. | فراخوانی helper از شاخهٔ کامل handler و RLS جدول در شواهد موجود اثبات نشد. |
| نمای نقشه | `map_view` فقط در UI با default باز و fallback باز در خطا دیده شد؛ نمایش به فیلد مکانی نیز وابسته است. | permissionهای ماژول/رکورد و RLS دادهٔ مکان حفظ شود. | plan gate سمت سرور یا SQL تأیید نشده؛ آن را مرز امنیتی فرض نکنید. |
| فاکتور فروش خرده‌فروشی | `retail_sales_invoice` با default بسته در helper دیده شد و عمدتاً دکمه/تنظیمات فروشگاهی را محدود می‌کند. | مجوزهای `invoices` و action-specific permission باقی بماند؛ فاکتور پایه از gate فروشگاهی جدا باشد. | enforcement SQL/API برای خود عملیات از شواهد حاضر روشن نیست. |
| QR | `qr_scan` helper با default بسته دارد. | feature entitlement local، permission و scope داده مستقل. | محل تمام consumerها و server/RLS enforcement کامل تأیید نشده است. |
| تیکت پشتیبانی | RPCهای SQL از `support_tickets` استفاده می‌کنند؛ مدل فعلی به provider org، `saas_org_settings` و مجوزهای SaaS Admin وابسته است. | اگر در دامنهٔ self-hosted عرضه شود، provider/اپراتور محلی لازم است؛ مالکیت، own/all، پیام داخلی و مجوز نقش بماند. | در عمل قابلیت پشتیبانیِ SaaS است، نه لزوماً قابلیت عملیاتی مشتری local. تصمیم محصولی/معماری جدا می‌خواهد. |

## تفسیر محصولی

1. **پلن SaaS را به Boolean سراسری «همه‌چیز true» تبدیل نکنیم.** منبع entitlement را برای deployment محلی صریح تعریف کنیم (مثلاً policy نسخهٔ self-hosted)، اما آن را از authorization نقش جدا نگه داریم.
2. **نقش و org scope مرز امنیت‌اند، نه plan gate.** خاموش‌کردن plan check فقط بعد از تعیین مرجع جایگزین امن انجام شود؛ RLS، ownership، `current_org_id()`، membership، HMAC و محدودیت service-role باقی بمانند.
3. **همهٔ کنترل‌ها صرفاً UI نیستند.** تقویم محتوا، کمپین، پرداخت و ایمیل نمونه‌هایی از plan gateهای SQL/Edge هم دارند؛ حذف شرط React به‌تنهایی قابلیت را قابل‌استفاده نمی‌کند.
4. **defaultهای فعلی یکسان نیستند.** `content_calendar`/`reservations`/`qr_scan`/`retail_sales_invoice` معمولاً بسته‌اند؛ `multi_lane_processes` و بعضی UIها مثل map/customer club/MBTI باز هستند؛ `billboard_status_management` gate باز اما module gate بسته دارد. در نسخهٔ self-hosted باید این رفتارها به policy واحد و مستند تبدیل شوند، نه اینکه تصادفی از RPC error ناشی شوند.
5. **تنظیم provider را از availability جدا نگه داریم.** entitlement مجاز یعنی قابلیت در محصول موجود است، نه اینکه provider خارجی خودکار وصل باشد. در ویزارد، «نیازمند کلید/حساب مشتری» و «اتصال سالم» دو وضعیت جدا باشند.
6. **تیکت‌های پشتیبانی نیازمند تصمیم scope است.** اگر self-hosted باید پشتیبانی را داشته باشد، لازم است مدل provider/customer SaaS با راه تماس یا اپراتور محلی جایگزین شود؛ نباید یک endpoint پشتیبانی SaaS یا دسترسی `__saas_admin` پنهانی در نصب بماند.

## شکاف‌های پوشش و وضعیت checkout محلی

- جست‌وجوی اولیه در checkout تعداد ۷۴ فایل پیکربندی ماژول و ۳۳ پوشهٔ Edge Function را شمرد. ممیزی ۱۶ حوزه، تمام این کد را بررسی نکرده است؛ بنابراین «inventory کامل همهٔ قابلیت‌ها» اعلام نمی‌شود.
- باید همهٔ `current_org_has_plan_feature`، `org_has_plan_feature`، `current_org_has_plan_module`، `org_has_plan_module`، `enabled_features`، `enabled_modules` و gateهای plan-specific را در frontend، SQL، Edge و jobs فهرست و با کلیدهای این گزارش تطبیق داد؛ سپس featureهای پیدا شده را با ماژول‌ها و routeها crosswalk کرد.
- snapshot قبلی Git در همین نشست شاخه را `fix/organization-membership-context` و HEAD را `75a80fc7fb41a938b353b69e5e96aa13b2181c05` نشان می‌داد و فایل‌های ایمیل (`EmailComposerHost`, `EmailComposerHost.test`, `EmailSettings`, `EmailWorkspace`, `useOrganizationEmail`) محلی تغییرکرده بودند. تلاش مجدد برای وضعیت/diff با خطای `terminal:config home unavailable` شکست خورد؛ بنابراین نمی‌توان گفت وضعیت فعلی checkout نسبت به commit تغییر نکرده است. متن SQL و Edge ایمیل از checkout محلی خوانده شد، ولی diff آن نسبت به commit قابل‌تطبیق نبود.
- خروجی‌های ممیزی مستقل هیچ تستی اجرا نکردند و برای تعدادی از حوزه‌ها migration/RLS/API کامل در دسترس نبود؛ «partial» و «نیازمند بررسی» در جدول نباید به «خرابی قطعی» تعبیر شوند.

## مسیر اجرای بعدی

1. **تثبیت snapshot:** در یک نشست ترمینال سالم، HEAD و `git status/diff` را ثبت کنیم؛ فایل‌های محلی تغییرکرده را پیش از هر نتیجه‌گیری با commit مبنا مقایسه کنیم.
2. **تکمیل inventory از خود کد:** برای هر کلید، فهرست تمام UI consumers، RPC/Edge/trigger، module gates، permissionها، migration/RLS و تست‌ها؛ در نهایت صفر مورد بی‌مالک/بی‌شاهد.
3. **تعریف provider entitlement:** یک abstraction مرکزی و testable برای `deployment mode -> feature availability`؛ SaaS از تنظیم پلن و self-hosted از policy محلی؛ role authorization مستقل و fail-closed.
4. **رفع وابستگی‌های مرکزی:** AI، Bot، workflow، پرداخت، sitemap و providerهای دیگر را به تنظیمات مشتری ببریم یا دامنهٔ پشتیبانی‌شان را شفاف محدود کنیم؛ fallback خاموش به host مرکزی مجاز نباشد.
5. **آزمون امنیت و مهاجرت:** ماتریس org/role/feature/config، RLS cross-org، API مستقیم، خطای config و حالت no-SaaS را روی staging self-hosted اجرا کنیم. هیچ migration یا deployment تا تأیید صریح جداگانه اجرا نشود.
6. **سپس ساخت ویزارد:** wizard تنظیم deployment/providerها و وضعیت سلامت را هدایت کند؛ feature entitlement محصولی را per-user انتخاب نکند و permission کاربران را دور نزند.

تا تکمیل این مراحل، نسخهٔ local می‌تواند از نظر محصولی «همهٔ قابلیت‌ها را شامل شود»، اما هنوز نمی‌توان گفت تمام آن‌ها در نصب مستقل عملیاتی، امن و بدون وابستگی مرکزی هستند.
