# TazeSystem — Agent Instructions (Codex & Claude)

> این فایل برای هر دو ابزار **Codex** و **Claude** است.
> قوانین مشترک پروژه اینجا تعریف می‌شوند تا هر دو ابزار همسو باشند.

---

## قوانین مشترک — همیشه رعایت شود

### ۱. قبل از پیاده‌سازی — ابهام را هدفمند روشن کن
اول از خود repo، کد موجود، migrationها، تست‌ها و رفتار قابل مشاهده استفاده کن. فقط وقتی سوال بپرس که جواب آن واقعاً روی spec، امنیت، داده، دسترسی یا تجربه کاربر اثر دارد و از کد/محیط قابل کشف نیست.

برای هر تسک جدیدی که تغییری در کد ایجاد می‌کند، بدون پرسیدن از کاربر، نوع تغییر را طبق اصول نسخه‌بندی رایج تشخیص بده و `package.json`، `package-lock.json` و `.version-changes.json` را هم‌زمان به‌روزرسانی کن. برای تغییرات سازگار و کوچک patch، برای قابلیت سازگار جدید minor، و برای تغییر ناسازگار major در نظر بگیر؛ اگر پروژه قالب نسخه چندبخشی دارد، همین تصمیم را با نزدیک‌ترین بخش متناظر همان قالب اعمال کن.

متن تغییرات نسخه در `.version-changes.json` باید برای کاربر عمومی و غیرتوسعه‌دهنده نوشته شود: نتیجه و اثر قابل مشاهده تغییر را با زبان ساده فارسی بیان کن و از اصطلاحات فنی، نام فایل، نام تابع، جزئیات دیتابیس و واژه‌های داخلی توسعه تا حد ممکن پرهیز کن.

هر زمان یک ویژگی جدید محصولی به پروژه اضافه شد، همان قابلیت را با متن قابل فهم برای کاربر عمومی در صفحه عمومی «تازه‌ها» هم ثبت کن. صفحه «تازه‌ها» فقط برای معرفی ویژگی‌های جدید است؛ رفع ایرادها، بهینه‌سازی‌های داخلی، تغییرات جزئی و اصلاحات رفتاری، حتی اگر اثر قابل مشاهده داشته باشند، نباید در صفحه «تازه‌ها» درج شوند و فقط باید در `.version-changes.json` نسخه اخیر ثبت شوند.

این موارد checklist فیچرهای محصولی هستند، نه الزام کورکورانه برای هر bugfix/hotfix:
- رفتار دقیق موردنظر، اگر از متن تسک یا کد موجود مشخص نیست
- role/access، اگر تغییر سطح دسترسی یا policy داریم
- دیتابیس، اگر table/view/function/index/policy جدید یا تغییر داده لازم است
- Realtime/notification، اگر رفتار زنده یا اطلاع‌رسانی تغییر می‌کند
- موبایل، اگر UI یا interaction جدید داریم

### ۲. دیتابیس — فقط فایل جدید
- هرگز فایل SQL قدیمی ویرایش نکن
- فرمت: `database_v1_phase###_توضیح.sql`
- آخرین phase فعلی: **344** (بعدی: 345)
- همه دستورات باید idempotent باشند

### ۳. انکودینگ
- UTF-8 برای همه فایل‌ها
- متن فارسی را تبدیل نکن

### ۴. هرگز UUID به کاربر نشان نده
```typescript
import { getRecordTitle } from 'utils/recordTitle';
const title = getRecordTitle(record, moduleConfig);
// اولویت: system_code > فیلدهای isKey > name/title > '[بدون عنوان]'
```
هیچ‌وقت `record.id` یا UUID خام در UI نمایش نده.

### ۵. همه لیبل‌ها فارسی
- از `getFieldLabelFa(field, { moduleId })` در `utils/fieldLabel.ts` استفاده کن
- از `utils/errorMessageFa.ts` برای پیام خطا
- placeholder، tooltip، عنوان ستون — همه فارسی

### ۶. طراحی یکدست
- از کامپوننت‌های موجود استفاده کن، چیز جدید اختراع نکن
- `AdaptivePickerSurface` برای picker، `Modal` برای فرم
- الگوی موجود در پروژه را تکرار کن

### ۷. تغییرات مقیاس‌پذیر و اصولی
- hardcode کردن ID یا string ممنوع
- تغییرات برای همه tenant ها باید کار کنند
- index گذاری دیتابیس را جدی بگیر

### ۷.۱. اصل SaaS و per-org بودن
- این پروژه ذاتاً SaaS و multi-tenant است؛ پیش‌فرض همه طراحی‌ها، تنظیمات، queryها، cacheها، permissionها و UI stateها باید `per-org` باشد مگر اینکه صریحاً ثابت شود متعلق به لایه ۱ یا SaaS Admin است
- هر تنظیم، فیچر، workflow، automation، branding، notification config و integration config باید در سطح سازمان قابل تفکیک باشد و نباید به‌صورت global برای همه tenantها فرض شود مگر با دلیل مستند
- در طراحی دیتابیس، API، module config و frontend state، همیشه مسیر scale برای چندسازمانی را در نظر بگیر و از هر پیاده‌سازی‌ای که باعث leakage یا coupling بین orgها شود پرهیز کن

### ۷.۲. ویژگی‌های پلن
- هر قابلیتی که ماهیت plan/اشتراکی دارد باید از بخش `ویژگی‌های پلن` قابل اضافه/حذف باشد و به‌صورت hardcode در UI، permission یا business logic قفل نشود
- پیش‌فرض پیاده‌سازی feature gating باید data-driven و قابل مدیریت باشد تا بتوان برای هر پلن، feature را فعال/غیرفعال کرد بدون fork کردن کد
- اگر فیچری علاوه بر permission به plan dependency هم نیاز دارد، هر دو لایه باید جداگانه بررسی شوند: access control و plan feature availability

### ۸. معماری سه‌لایه — تداخل ممنوع
```
لایه ۱: پنل داخلی (اپراتور TazeSystem)
  └── لایه ۲: SaaS Admin (/taze-system/*) — فقط با __saas_admin permission
لایه ۳: پنل‌های tenant (هر سازمان جداگانه)
```
- کد لایه ۳ هرگز به `/taze-system/*` دسترسی ندارد
- برندینگ هر tenant از `saas_org_settings` بارگذاری می‌شود
- `isSaasAppHost()` / `isMarketingHost()` در `utils/hostRouting.ts`

### ۹. امنیت دیتابیس — قوانین سخت‌گیرانه (اجباری)

#### RLS و Policy
- **ممنوع:** هر policy با `using (true)`، `with check (true)`، `org_id is null` یا `current_org_id() is null` برای داده tenant
- هر policy tenant-owned باید دقیقاً `org_id = public.current_org_id()` باشد — نه looser، نه nullable
- اگر `current_org_id()` مقدار null برگرداند، دسترسی باید **fail-closed** باشد (هیچ داده‌ای لیک نشود)
- هر جدول جدید public حتماً باید RLS داشته باشد یا دلیل مستند برای public بودنش ثبت شده باشد

#### Views و Functions
- **ممنوع:** `security definer view` بدون justification صریح و review امنیتی
- همه views حساس (مخصوصاً SaaS admin) باید `with (security_invoker = true)` داشته باشند
- همه `security definer` functions باید `set search_path = public` داشته باشند
- `system_code_counters` و `app_schema_migrations` فقط از طریق function کنترل‌شده، نه دسترسی مستقیم authenticated

#### قبل از هر feature جدید
اگر table یا function جدید ساخته می‌شود، حتماً چک کن:
- آیا RLS فعال است؟ آیا policy های آن fail-closed هستند؟
- آیا grants به authenticated فقط برای آنچه واقعاً نیاز است؟
- آیا index روی `org_id` و ستون‌های پرکاربرد وجود دارد؟
- آیا `search_path` برای functions تعریف شده؟

#### Production Drift
بررسی drift بین migration repo و Supabase production در حالت عادی فقط دستی انجام می‌شود و Agent نباید خودسرانه دستورهای remote migration/drift یا اسکریپت‌های نیازمند SSH/سرور را اجرا کند.

**استثنای تأییدشده توسط کاربر:** اگر کاربر در همان گفتگو صریحاً اجازهٔ استقرار migration با کلید deploy را بدهد، Agent مجاز است migrationها را با این ترتیب مستقر کند: ابتدا فهرست و hash فایل‌های مشخص را بررسی کند، فقط همان فایل‌ها را به‌ترتیب phase اجرا کند، در اولین خطا متوقف شود و نتیجهٔ هر فایل را گزارش کند. در این حالت اجرای کورِ همهٔ migrationهای pending ممنوع است، مگر کاربر صریحاً همان مجموعه را تأیید کرده باشد. اگر history migration خالی یا نامطمئن است، Agent باید به‌جای حدس‌زدن baseline، فقط فایل‌های جدید و تأییدشده را با `-SqlFiles` اجرا کند. پس از اجرا نیز باید سلامت migrationهای اعمال‌شده و endpointهای وابسته را بررسی کند. هیچ رمز، کلید یا مقدار حساس نباید در خروجی یا گزارش نمایش داده شود.

---

## Stack فنی
- **Frontend:** React 18 + TypeScript + Ant Design + Refine
- **Backend:** Supabase (PostgreSQL + RLS + Realtime + Edge Functions)
- **State:** Zustand + React Query
- **Build:** Vite | **Test:** Vitest

---

## ساختار پروژه

```
/pages          — صفحات route
/components     — کامپوننت‌های React
/hooks          — custom hooks
/utils          — utilities و stores
/modules        — تعریف ماژول‌های داده (*Config.ts)
/supabase/functions — Edge Functions (Deno)
```

---

## سیستم ماژول — معماری مرکزی

هر entity در پروژه یک `ModuleDefinition` دارد. همه صفحات لیست/نمایش/ایجاد از کامپوننت‌های جنریک استفاده می‌کنند.

```
modules/*Config.ts → moduleRegistry.ts → ModuleList / ModuleShow / SmartForm
```

| کامپوننت | کاربرد |
|---------|--------|
| `SmartForm` | فرم ایجاد/ویرایش جنریک |
| `SmartFieldRenderer` | رندر تک‌فیلد (همه FieldType ها) |
| `SmartTableRenderer` | ستون‌های جدول با فیلتر و sort |
| `AdaptivePickerSurface` | Modal/Drawer برای picker |
| `AdaptiveSelectField` | Select با جستجو و lazy load |
| `EditableTable` | جدول inline-edit (ردیف‌های فاکتور، BOM) |
| `FilterBuilder` | فیلتر چندشرطی |

---

## الگوهای کد

### Permission Keys
```typescript
SETTINGS_PERMISSION_KEY   = '__settings_tabs'
ACCOUNTING_PERMISSION_KEY = '__accounting'
STORIES_PERMISSION_KEY    = '__stories'
SAAS_ADMIN_PERMISSION_KEY = '__saas_admin'
```

### Realtime
```typescript
const channel = supabase
  .channel(`channel-name-${id}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: '...' }, handler)
  .subscribe();
return () => { supabase.removeChannel(channel); };
```

> **قانون:** Realtime subscription باید تا حد ممکن server-side filtered باشد (مثل `filter: \`org_id=eq.${orgId}\``). subscription بدون filter که سمت client فیلتر می‌شود ممنوع است مگر با دلیل مستند.

### Query بهینه
- **ممنوع:** `select('*')` در صفحات سنگین بدون دلیل روشن — فقط ستون‌های مورد نیاز را fetch کن
- **ممنوع:** `limit(3000)` یا `limit(5000)` بدون pagination یا lazy loading
- fetch های چند‌هزار‌تایی فقط با دلیل روشن مجازند — ترجیحاً pagination یا summary query جایگزین شود

### State
- UI/Drawer: Zustand store
- Server data: React Query
- Module data: Refine data provider

---

## بخش‌های حساس — احتیاط ویژه

### قرارداد محصول فرآیندهای V2
- مرجع رسمی رفتار فرآیندها: `docs/PROCESS_V2_PRODUCT_CONTRACT_FA.md`
- پیش‌نویس، اجرای واقعی و حالت ترکیبی باید هم‌زمان و بدون حذف ضمنی یکدیگر قابل نمایش باشند.
- ایجاد یا تبدیل موفق باید همان لحظه در UI دیده شود؛ هیچ خطای ذخیره‌ای نباید بلعیده شود یا موفقیت کاذب نشان دهد.
- پس از تبدیل یک مرحله پیش‌نویس به فعالیت واقعی، فقط همان پیش‌نویس متناظر حذف می‌شود و فعالیت واقعی جای آن را می‌گیرد.
- تعریف فیلدها و وضعیت‌های اختصاصی همراه فعالیت snapshot می‌شود و مودال V2 از هر مسیر ورود باید context کامل و tenant-safe را بارگذاری کند.
- لینک رکوردها، وابستگی مرحله‌ها و اکشن‌های اتوماسیون بخشی از هویت اجرای فرآیندند و هنگام copy/append/assign نباید از بین بروند.
- نماهای کامل، فشرده و ستونی باید از منبع runtime مشترک، کش per-org و invalidation یکسان استفاده کنند.

### NotificationsPopover.tsx (~8000 خط)
- فقط با Grep خط دقیق را پیدا کن، سپس فقط همان بخش را ویرایش کن
- Bug قبلی: bot read state باید از `seenBotMessageIds.has(id)` استفاده کند، نه `false`

### SaaS Admin (تازه سیستم)
- Route: `/taze-system/*`
- فعال‌سازی: `{ "__saas_admin": { "view": true, "edit": true } }` در `org_roles`

---

## Naming Conventions
| نوع | قالب | مثال |
|-----|------|------|
| کامپوننت | PascalCase | `StoryEditorModal.tsx` |
| Hook | use* | `useOrgStories.ts` |
| Store | *Store | `uiNotificationOverlayStore.ts` |
| Config ماژول | *Config | `invoicesConfig.ts` |
| Migration | `database_v1_phase###_*.sql` | `database_v1_phase161_*.sql` |
| Edge Function | kebab-case | `send-sms/` |

---

## اجرا و تست

```bash
npm run dev              # محیط توسعه
npm run build            # build + TypeScript check
npm run test             # همه تست‌ها
npm run test:notifications
npm run deploy:function  # deploy یک Edge Function
```

---

## یادداشت برای همکاری Codex + Claude

- هر دو ابزار باید این فایل را راهنمای اصلی بدانند
- اگر Claude تغییری داد، Codex باید همان کد را ادامه دهد و نه revert کند
- اگر Codex تغییری داد، Claude همان را ادامه می‌دهد
- migration های دیتابیس: هر دو ابزار فقط فایل جدید می‌سازند
