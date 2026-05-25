# TazeSystem — Agent Instructions (Codex & Claude)

> این فایل برای هر دو ابزار **Codex** و **Claude** است.
> قوانین مشترک پروژه اینجا تعریف می‌شوند تا هر دو ابزار همسو باشند.

---

## قوانین مشترک — همیشه رعایت شود

### ۱. قبل از هر پیاده‌سازی — سوال بپرس
هرگز بدون پرسیدن شروع نکن. سوالات الزامی:
- رفتار دقیق موردنظر چیست؟
- کدام role ها دسترسی دارند؟
- نیاز به تغییر دیتابیس دارد؟
- Realtime یا notification لازم است؟
- روی موبایل هم باید کار کند؟

### ۲. دیتابیس — فقط فایل جدید
- هرگز فایل SQL قدیمی ویرایش نکن
- فرمت: `database_v1_phase###_توضیح.sql`
- آخرین phase فعلی: **199** (بعدی: 200)
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
قبل از ادامه feature work، drift بین migration repo و Supabase production را بررسی کن — هر object (policy، view، function) که خارج از repo وجود دارد باید شناسایی و مستند شود.

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
