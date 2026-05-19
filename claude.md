# KalamApp — دستورالعمل‌های Claude Code

## قوانین اساسی (همیشه رعایت شود)

### ۱. انکودینگ فارسی
همه فایل‌ها را با UTF-8 بخوان و ذخیره کن. متن فارسی را **هرگز** تبدیل نکن. ابزارهای Read و Edit به‌درستی از UTF-8 پشتیبانی می‌کنند.

### ۲. سوالات محصولی — قبل از شروع هر کار
**قبل از هر پیاده‌سازی**، تمام سوالات لازم را بپرس:
- رفتار دقیق موردنظر چیست؟
- کدام role ها / permission ها دسترسی دارند؟
- روی موبایل هم باید کار کند؟
- نیاز به realtime update دارد؟
- آیا باید در داده‌های قدیمی هم اعمال شود؟
- migration دیتابیس لازم است؟
- آیا باید پیامک/اعلان ارسال شود؟

### ۳. دیتابیس
همیشه برای تغییرات schema، یک **فایل SQL جدید** بساز — هرگز فایل قدیمی را ویرایش نکن.
فرمت نام: `database_v1_phase###_توضیح.sql`
آخرین phase فعلی: **163**

### ۴. هرگز UUID به کاربر نمایش نده
رکوردها را با عنوان انسانی نشان بده. اولویت:
1. `system_code` / `manual_code` (اگر ماژول پشتیبانی کند — `utils/systemCode.ts`)
2. فیلدهای `isKey: true` در تعریف ماژول
3. `getRecordTitle(record, moduleConfig)` از `utils/recordTitle.ts`
4. نام/عنوان: `name`, `title`, `full_name`, `invoice_number`, ...

هرگز `id` یا UUID خام در UI نمایش نده.

### ۵. لیبل‌ها فارسی
- همه label ها و عنوان‌های نمایشی باید فارسی باشند
- از `getFieldLabelFa(field, { moduleId })` در `utils/fieldLabel.ts` استفاده کن
- از `utils/errorMessageFa.ts` برای پیام خطا استفاده کن
- هیچ متن انگلیسی raw در UI نداشته باشیم — حتی placeholder ها

### ۶. طراحی یکدست
- از کامپوننت‌های موجود Ant Design استفاده کن — چیز جدید اختراع نکن
- رنگ، فاصله، اندازه فونت: از تم پروژه (`theme/brandTheme.ts`) پیروی کن
- اگر یک الگوی UI در جای دیگر پروژه وجود دارد، همان را تکرار کن
- Modal → `AdaptivePickerSurface` برای picker ها، `Modal` معمولی برای فرم‌ها

### ۷. تغییرات مقیاس‌پذیر و اصولی
- قبل از پیاده‌سازی بپرس: آیا این تغییر با رشد داده‌ها کار می‌کند؟
- از hardcode کردن ID، string، یا منطق تک‌سازمانی بپرهیز
- تغییرات باید برای همه tenant ها کار کنند مگر صراحتاً داخلی باشند
- index گذاری دیتابیس را جدی بگیر

### ۸.۵. امنیت دیتابیس — قوانین اجباری (phase 163+)

#### RLS — fail-closed همیشه
- **ممنوع:** `using (true)`، `with check (true)`، `org_id is null`، یا `current_org_id() is null` برای داده tenant
- هر policy tenant-owned باید دقیقاً `org_id = public.current_org_id()` باشد
- `current_org_id()` اگر null برگرداند → **fail-closed**: هیچ داده tenant نمایش داده نشود
- هر جدول جدید public: RLS اجباری یا دلیل مستند برای public بودن

#### Views و Functions
- **ممنوع:** `security definer view` بدون justification و review امنیتی
- Views حساس باید `with (security_invoker = true)` داشته باشند
- همه `security definer` functions → `set search_path = public`
- `system_code_counters` و `app_schema_migrations`: دسترسی مستقیم authenticated ممنوع

#### قبل از هر feature جدید با table/function جدید
بررسی اجباری:
1. RLS فعال + policy fail-closed؟
2. grants فقط برای آنچه نیاز است؟
3. index روی `org_id` و ستون‌های پرکاربرد؟
4. `search_path` برای functions؟

#### Production Drift
قبل از ادامه feature work، drift بین migration repo و Supabase production را بررسی کن.

#### Frontend Query
- **ممنوع:** `select('*')` در صفحات سنگین بدون دلیل
- **ممنوع:** `limit(3000/5000)` بدون pagination یا lazy loading
- Realtime باید server-filtered باشد (`filter: \`org_id=eq.${orgId}\``) — client-only filter ممنوع

### ۸. معماری سه‌لایه — هرگز تداخل نداشته باش
```
لایه ۱: پنل داخلی (اپراتور/مدیر TazeSystem)
  └── لایه ۲: پنل SaaS Admin (/taze-system/*) — داخل لایه ۱ باز می‌شود
لایه ۳: پنل‌های tenant (هر سازمان مستقل)
```
- کد لایه ۱ و ۲ با `SAAS_ADMIN_PERMISSION_KEY` گارد شده
- لایه ۳ هرگز به route های `/taze-system/*` دسترسی ندارد
- `isSaasAppHost()` و `isMarketingHost()` در `utils/hostRouting.ts` نوع host را مشخص می‌کنند
- برندینگ و تنظیمات هر tenant کاملاً جدا و از `saas_org_settings` بارگذاری می‌شود

---

## معرفی پروژه

**TazeSystem** یک پلتفرم B2B SaaS جامع برای مدیریت سازمانی است. شامل حسابداری، CRM، HR، مسیرگردش کار، پیام‌رسانی، هوش مصنوعی، و panel مدیریت multi-tenant.
fi il
### Stack فنی
| لایه | ابزار |
|------|-------|
| Frontend | React 18 + TypeScript + Ant Design (فارسی: `antd-jalali`, `faIR locale`) |
| Framework | [Refine](https://refine.dev) — data layer، auth، routing |
| Backend | Supabase (PostgreSQL + RLS + Realtime + Edge Functions) |
| State | Zustand (UI state) + React Query (server state) |
| Rich Text | Tiptap |
| تاریخ | dayjs + jalaliday (تقویم شمسی) |
| نقشه | MapLibre GL + Leaflet |
| Build | Vite |
| Test | Vitest |

### Scripts مهم
```bash
npm run dev                    # اجرای محیط dev
npm run build                  # build
npm run test                   # همه تست‌ها
npm run test:notifications     # تست notifications
npm run test:critical-ui       # تست‌های UI بحرانی
npm run deploy:prod            # deploy به production
npm run deploy:function        # deploy یک Edge Function
npm run deploy:function:all    # deploy همه Edge Functions
```

---

## ساختار پروژه

```
/pages              — صفحات route (یک فایل = یک صفحه اصلی)
/components         — کامپوننت‌های React (بر اساس feature گروه‌بندی)
/hooks              — React hooks سفارشی
/utils              — utilities، stores، RPC clients
/modules            — تعریف ماژول‌های داده (*Config.ts)
/supabase/functions — Edge Functions (Deno)
/theme              — تم و branding
/types.ts           — تایپ‌های مرکزی (ModuleDefinition، FieldType، ...)
/moduleRegistry.ts  — ثبت همه ماژول‌ها
/App.tsx            — routing اصلی، providers، Refine setup
/supabaseClient.ts  — کلاینت supabase
```

---

## ماژول‌های داده (moduleRegistry.ts)

هر ماژول یک فایل `modules/*Config.ts` دارد که `ModuleDefinition` صادر می‌کند:

**فروش و CRM:** products، productBundles، invoices، purchaseInvoices، customers، suppliers، priceLists، marketingLeads، personas، deliveryForms، salesCatalog

**انبار و تولید:** warehouses، shelves، stockTransfers، productionBOM، productionOrders، productionGroupOrders، barters

**حسابداری:** fiscalYears، chartOfAccounts، journalEntries، accountingEventRules، costCenters، cashBoxes، bankAccounts، pettyFunds، cheques، cashBankOperations، expenseDocuments

**HR:** employees، attendanceLogs، workSchedules، leaveRequests، overtimeRequests، missionRequests، employeeAdvances، employeeBonusRequests، employeePenaltyRequests، employeeContracts، payrollSlips، recruitmentApplicants

**پروژه و فرآیند:** projects، tasks، processTemplates، processRuns، instructions، goals، webForms، surveys، secretariatDocuments

**سیستم:** profiles، billboards، calculationFormulas، automationExecutionReports، smsDeliveryReports، voipCallReports، counterpartyBotGroups

---

## Permission System (utils/permissions.ts)

```typescript
// کلیدهای ویژه permission
SETTINGS_PERMISSION_KEY   = '__settings_tabs'
DASHBOARD_PERMISSION_KEY  = '__dashboard_widgets'
WORKFLOWS_PERMISSION_KEY  = '__workflows'
GOALS_PERMISSION_KEY      = '__goals'
FILES_PERMISSION_KEY      = '__files_access'
ACCOUNTING_PERMISSION_KEY = '__accounting'
REPORTS_PERMISSION_KEY    = '__reports'
VOIP_PERMISSION_KEY       = '__voip'
STORIES_PERMISSION_KEY    = '__stories'
SAAS_ADMIN_PERMISSION_KEY = '__saas_admin'

// ساختار permission هر ماژول
type ModulePermissionConfig = {
  view?: boolean;
  edit?: boolean;
  delete?: boolean;
  record_scope?: 'all' | 'own' | 'team' | 'subtree';
  fields?: Record<string, any>;
}
```

---

## سیستم ماژول — قلب پروژه

پروژه حول یک **سیستم ماژول جنریک** بنا شده. هر entity (فاکتور، کارمند، پروژه، ...) یک `ModuleDefinition` دارد.

### چرخه داده
```
modules/*Config.ts  →  moduleRegistry.ts  →  ModuleList / ModuleShow / SmartForm
```

### فایل‌های کلیدی سیستم ماژول

| فایل | نقش |
|------|-----|
| `types.ts` | تایپ‌های مرکزی: `ModuleDefinition`، `FieldType`، `BlockType`، `ViewMode`، ... |
| `moduleRegistry.ts` | ثبت همه ماژول‌ها در آرایه `MODULES` |
| `pages/ModuleList_Refine.tsx` | لیست جنریک — جدول، گرید، نقشه، کانبان، تقویم، گانت |
| `pages/ModuleShow.tsx` | فرم نمایش/ویرایش جنریک رکورد |
| `pages/ModuleCreate.tsx` | فرم ایجاد جنریک رکورد |
| `components/SmartForm.tsx` | فرم هوشمند — render خودکار فیلدها بر اساس تعریف ماژول |
| `components/SmartFieldRenderer.tsx` | رندر تک‌فیلد — همه انواع `FieldType` |
| `components/SmartTableRenderer.tsx` | رندر ستون‌های جدول — فیلتر، sort، inline edit |
| `components/AdaptivePickerSurface.tsx` | Modal/Drawer جنریک برای picker ها |
| `components/AdaptiveSelectField.tsx` | Select هوشمند با جستجو و lazy load |
| `components/DynamicSelectField.tsx` | Select با داده‌های dynamic از Supabase |
| `components/FilterBuilder.tsx` | فیلتر چندشرطی جنریک |
| `components/ViewManager.tsx` | مدیریت view های ذخیره‌شده (جدول/گرید/...) |
| `components/EditableTable.tsx` | جدول inline-edit (برای ردیف‌های فاکتور، BOM، ...) |

### ساختار ModuleDefinition (types.ts)
```typescript
type ModuleDefinition = {
  id: string               // نام جدول supabase
  label: { fa: string }    // عنوان فارسی
  nature: ModuleNature     // STANDARD | INVOICE | TASK | ...
  fields: ModuleField[]    // تعریف تمام فیلدها
  blocks?: BlockConfig[]   // بلوک‌های نمایشی (جدول، گروه فیلد، ...)
  views?: ViewConfig[]     // view های از پیش‌تعریف‌شده
  // ...
}

type ModuleField = {
  key: string
  type: FieldType          // TEXT | NUMBER | SELECT | RELATION | ...
  labels: { fa: string; en?: string }
  isKey?: boolean          // فیلد عنوان اصلی رکورد
  location?: FieldLocation // HEADER | BODY | SIDEBAR
  nature?: FieldNature     // ASSIGNEE | STATUS | SYSTEM_CODE | ...
}
```

### FieldType های موجود
`TEXT`, `LONG_TEXT`, `NUMBER`, `PRICE`, `PERCENTAGE`, `CHECKBOX`, `SELECT`, `MULTI_SELECT`, `DATE`, `DATETIME`, `IMAGE`, `LINK`, `LOCATION`, `RELATION`, `STOCK`, `FORMULA`, `CHECKLIST`, `PHONE`, `RICH_TEXT`

### نمایش عنوان رکورد (بدون UUID)
```typescript
import { getRecordTitle } from 'utils/recordTitle';
// اولویت: system_code > فیلدهای isKey > name/title/... > '[بدون عنوان]'
const title = getRecordTitle(record, moduleConfig);
```

### لیبل فیلد (فارسی)
```typescript
import { getFieldLabelFa } from 'utils/fieldLabel';
const label = getFieldLabelFa(field, { moduleId: 'invoices' });
```

### سیستم‌کد
```typescript
import { supportsSystemCode, buildClientFallbackSystemCode } from 'utils/systemCode';
// ماژول‌هایی مثل invoices، products، employees سیستم‌کد دارند
```

---

## بخش‌های اصلی پروژه

### ۱. Notifications & Messaging
**فایل اصلی:** `components/NotificationsPopover.tsx` (~8000 خط — بزرگ‌ترین فایل)

**Store ها:**
- `utils/uiNotificationOverlayStore.ts` — state پاپ‌آپ overlay
- `utils/notificationViewModels.ts` — view model مکالمات

**Hooks جدید (untracked):**
- `hooks/useNotificationConversationList.ts`
- `hooks/useNotificationRealtimeSync.ts`
- `hooks/useBotConversationTimeline.ts`
- `hooks/useInternalConversationTimeline.ts`

**Util جدید:** `utils/notificationConversationRpc.ts`

**باگ‌های اصلاح‌شده (2026-05-13):**
- Bot messages read state: از `false` hardcoded به `seenBotMessageIds.has(id)`
- پیام‌های با تأخیر: `visibilitychange` listener با debounce 600ms
- Drawer freeze روی موبایل: عملیات سنگین با `setTimeout(..., 80ms)` تأخیر دارند
- Flicker هنگام بازگشت: CSS class `.page-resuming` روی body

**Realtime:** channel `message-events-${convoId}`

---

### ۲. Bot & AI
**Edge Functions:** `supabase/functions/bot-admin/`, `bot-webhook/`

**کامپوننت‌ها:**
- `components/bot/CounterpartyBotStatusModal.tsx`
- `components/ai/AssistantDrawer.tsx`, `AssistantPanel.tsx`

**Utils:**
- `utils/botGateway.ts` — ارتباط با bot
- `utils/aiKnowledge.ts` — دانش سازمانی AI
- `utils/aiAssistantEvents.ts`

**تنظیمات AI در settings:** `pages/Settings/AiKnowledgeTab.tsx`

---

### ۳. Stories (استوری سازمانی)
**فایل‌ها:** `components/stories/` — StoryRing، StoryBar، StoryViewerModal، StoryEditorModal، useOrgStories.ts

**DB:** `database_v1_phase146_org_stories.sql` (org_stories، org_story_views، org_story_reactions)

**Utils:** `utils/storyGradients.ts` (14 preset)، `utils/storyNotification.ts`

**Realtime:** channel `org-stories-${orgId}`

**Permission:** `STORIES_PERMISSION_KEY = '__stories'`

---

### ۴. SaaS Admin Panel (تازه سیستم)
**Route:** `/taze-system/*`

**صفحات:** `pages/SaasAdmin/` — Dashboard، Orgs، Requests، Plans

**DB:** `database_v1_phase144_saas_foundation.sql`، `database_v1_phase145_saas_schema_extension.sql`

**Utils:** `utils/saasAdminModules.ts`، `utils/saasOnboarding.ts`، `utils/orgSaasStatus.ts`

**فعال‌سازی برای کاربر:**
```json
{ "__saas_admin": { "view": true, "edit": true, "demo_override": true } }
```

**مراحل پیاده‌نشده:**
- Edge Function آروان DNS (`provision-saas-dns`)
- Demo Wizard سه‌مرحله‌ای در `SaasPortalPage.tsx`
- Tenant-aware login redirect
- Tenant Resolver از `saas_org_settings.resolved_host`

---

### ۵. حسابداری
**صفحات:** `pages/AccountingPage.tsx`، `pages/CashBankPage.tsx`، `pages/ChartOfAccountsTreePage.tsx`، `pages/JournalEntry*.tsx`

**کامپوننت‌ها:** `components/accounting/` — AccountLedgerPanel، CustomerFinancialOverviewPanel، OperationalFinancialOverviewPanel

**Utils:** `utils/accountingAutoPosting.ts`، `utils/cashBankFieldCatalog.ts`، `utils/formulaRuntime.ts`، `utils/payrollLedger.ts`

---

### ۶. HR
**صفحه:** `pages/HRPage.tsx`

**Utils:** `utils/activityPerformanceRuntime.ts`، `utils/commissionRuntime.ts`، `utils/goalRewardRuntime.ts`، `utils/employeeCompensationPayrollSync.ts`

---

### ۷. فرآیندها و Workflows
**کامپوننت‌ها:** `components/workflows/` — WorkflowEditorModal، WorkflowActionsBuilder، WorkflowsManager

**Utils:** `utils/workflowRuntime.ts`، `utils/workflowTypes.ts`، `utils/processRunRuntime.ts`، `utils/processAutomationRuntime.ts`

**انواع WorkflowActionType** شامل `publish_story` (اضافه‌شده با فیچر stories)

---

### ۸. Settings
**صفحه:** `pages/Settings/SettingsPage.tsx`

**تب‌ها:** CompanyTab، UsersTab، RolesTab، ModuleSettingsTab، PrintTemplatesTab، AiKnowledgeTab، ConnectionsTab، CustomerLevelingTab

---

### ۹. Branding & Theming
**فایل‌های اصلی:**
- `utils/brandingRuntime.ts` — بارگذاری و apply برندینگ runtime
- `utils/companySettings.ts` — تنظیمات شرکت
- `theme/brandTheme.ts` — تعریف BrandingConfig، DEFAULT_BRANDING، THEME_STORAGE_KEY

**رویدادها:** `BRANDING_APPLIED_EVENT`، `BRANDING_UPDATED_EVENT`

**Multi-tenant:** برندینگ از `saas_org_settings.resolved_host` برای tenant ها

---

### ۱۰. Edge Functions (Supabase/Deno)
```
supabase/functions/
├── ai-assistant/          — دستیار هوش مصنوعی
├── bot-admin/             — مدیریت bot
├── bot-webhook/           — webhook ورودی bot
├── demo-data-admin/       — seed داده دمو
├── melipayamak-inbound/   — webhook پیامک ملی‌پیام
├── render-pdf/            — رندر PDF
├── send-sms/              — ارسال پیامک
├── taxpayer_system/       — سیستم مؤدیان
├── telefonchy_call_webhook/ — webhook تلفنچی
├── telefonchy_smartcall/  — تماس هوشمند
└── user-admin/            — مدیریت کاربران
```

---

## الگوهای کد

### Realtime Subscription
```typescript
const channel = supabase
  .channel(`org-stories-${orgId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'org_stories', filter: `org_id=eq.${orgId}` }, handler)
  .subscribe();
return () => { supabase.removeChannel(channel); };
```

### State Management
- **UI Overlays/Drawers:** Zustand (`uiNotificationOverlayStore.ts`)
- **Server State:** React Query (`useQuery`, `useMutation`)
- **Module Data:** Refine data provider (از supabase)

### Naming Conventions
- کامپوننت: `PascalCase.tsx`
- Hook: `use*.ts`
- Store: `*Store.ts`
- Config ماژول: `*Config.ts`
- Migration: `database_v1_phase###_description.sql`

### Performance
- Modal های بزرگ: `lazy()` + `Suspense`
- لیست‌های طولانی: pagination با offset/limit در RPC
- عملیات سنگین بعد از animation: `setTimeout(..., 80)`
- Debounce رویدادهای مکرر: 300–600ms

---

## فایل‌های مهم — راهنمای سریع

| فایل | کاربرد |
|------|--------|
| `App.tsx` | routing، providers، Refine setup |
| `moduleRegistry.ts` | ثبت تمام ماژول‌های داده |
| `types.ts` | تایپ‌های مرکزی پروژه |
| `utils/permissions.ts` | سیستم دسترسی، permission keys |
| `utils/referenceData.ts` | کش داده‌های مرجع (roles، users، ...) |
| `utils/sessionCache.ts` | کش session و bootstrap |
| `utils/brandingRuntime.ts` | مدیریت برندینگ runtime |
| `utils/companySettings.ts` | تنظیمات شرکت |
| `utils/hostRouting.ts` | تشخیص نوع host (SaaS، marketing، app) |
| `utils/smsGateway.ts` | ارسال پیامک |
| `utils/voipGateway.ts` | VOIP |
| `utils/imagePreview.ts` | preview تصاویر |
| `utils/assetUrl.ts` | URL فایل‌های storage |
| `utils/profileDirectory.ts` | دایرکتوری کاربران |
| `components/NotificationsPopover.tsx` | مرکز پیام‌ها و اعلانات |
| `components/Layout.tsx` | layout اصلی + sidebar |
| `supabaseClient.ts` | کلاینت supabase |

---

## نکات تست

```bash
npm run test:notifications     # تست NotificationsPopover
npm run test:critical-ui       # تست‌های بحرانی UI
npm run test:processes         # تست process automation
npm run test:smart-form        # تست SmartForm
npm run build                  # چک TypeScript errors
```

---

## Memory System
فایل‌های memory در: `~/.claude/projects/d--Kalamapp/memory/`
قبل از عمل کردن روی claim های memory، وضعیت فعلی کد را verify کن.
