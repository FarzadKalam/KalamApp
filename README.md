# Bartar Leather ERP (مهربانو)

یک سیستم جامع مدیریت منابع سازمانی (ERP) مدرن و ماژولار برای صنایع تولیدی و خرده‌فروشی، ساخته شده با React، TypeScript و Supabase.

## 🌟 ویژگی‌های کلیدی

- **معماری ماژولار:** تولید خودکار ماژول‌ها (محصولات، CRM، SCM، تولید)
- **نماهای پیشرفته:** تغییر فوری بین نمای **لیست**، **گرید** و **کانبان**
- **کامپوننت‌های هوشمند:** فرم‌ها و جداول خودکار بر اساس فایل‌های Configuration
- **مدیریت تولید:** نمایش سلسله‌مراتبی BOM (شناسنامه مواد)
- **گردش موجودی تولید:** انتقال/مصرف مواد و اضافه شدن محصول نهایی بر اساس مراحل تولید
- **اسکن QR:** انتخاب سریع محصول/قفسه در فرآیند تولید
- **کنترل دسترسی مبتنی بر نقش (RBAC):** مدیریت دقیق مجوزها
- **سیستم تگ‌گذاری:** دسته‌بندی انعطاف‌پذیر برای همه رکوردها
- **بومی‌سازی:** پشتیبانی کامل از زبان فارسی با تقویم جلالی
- **نمایش قیمت‌ها:** فرمت فارسی قیمت و ارقام در فیلدهای PRICE
- **UI/UX:** حالت تیره/روشن، طراحی واکنش‌گرا برای موبایل و دسکتاپ

## 🛠 فناوری‌های استفاده شده

- **Frontend:** React 18, TypeScript, Vite
- **UI Library:** Ant Design (v5), Tailwind CSS
- **State/Logic:** React Router v6, React Hooks, Refine Framework
- **Backend/DB:** Supabase (PostgreSQL)
- **Icons:** Ant Design Icons
- **تاریخ:** react-multi-date-picker + react-date-object (تقویم فارسی)

## 🚀 شروع به کار

### پیش‌نیازها
- Node.js (نسخه 18 یا بالاتر)
- npm یا yarn
- یک پروژه Supabase با URL و Anon Key

### نصب

1. **کلون کردن مخزن:**
   ```bash
   git clone <repository-url>
   cd bartar-leather-erp
   ```

2. **نصب وابستگی‌ها:**
   ```bash
   npm install
   ```

3. **تنظیم محیط:**
   یک فایل `.env` در پوشه اصلی ایجاد کنید:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   
   **نکته:** کلیدها را از Dashboard Supabase خود دریافت کنید:
   - Project Settings → API → Project URL
   - Project Settings → API → anon/public key

4. **راه‌اندازی دیتابیس:**
   - فایل `database.sql` را در Supabase SQL Editor اجرا کنید
   - جداول و RLS Policies ایجاد می‌شوند
   - داده‌های نمونه (اختیاری) را اضافه کنید

5. **اجرای سرور توسعه:**
   ```bash
   npm run dev
   ```
   
   برنامه در `http://localhost:5173` در دسترس خواهد بود.

## 🗂 ساختار پروژه

```
/
├── components/           # کامپوننت‌های قابل استفاده مجدد UI
│   ├── SmartForm.tsx            # سیستم فرم داینامیک
│   ├── SmartTableRenderer.tsx   # رندر کننده جدول
│   ├── SmartFieldRenderer.tsx   # رندر کننده فیلد
│   ├── EditableTable.tsx        # جداول قابل ویرایش
│   ├── editableTable/            # کمک‌کننده‌های EditableTable
│   │   ├── TopScrollWrapper.tsx
│   │   ├── tableUtils.ts
│   │   ├── changelogHelpers.ts
│   │   ├── invoiceHelpers.ts
│   │   ├── inventoryHelpers.ts
│   │   └── productionOrderHelpers.ts
│   ├── TagInput.tsx             # سیستم تگ‌گذاری
│   ├── ViewManager.tsx          # مدیریت نماهای سفارشی
│   ├── FilterBuilder.tsx        # ساخت فیلتر پیشرفته
│   ├── renderers/               # رندرکننده‌های تخصصی
│   │   └── BomStructureRenderer.tsx
│   └── Sidebar/                 # کامپوننت‌های سایدبار
│       ├── RelatedSidebar.tsx
│       ├── ActivityPanel.tsx
│       └── RelatedRecordsPanel.tsx
├── modules/              # تعاریف ماژول‌ها (قلب سیستم)
│   ├── productsConfig.ts        # ماژول محصولات
│   ├── customerConfig.ts        # ماژول مشتریان
│   ├── supplierConfig.ts        # ماژول تامین‌کنندگان
│   ├── productionConfig.ts      # ماژول تولید (BOM)
│   └── tasksConfig.ts           # ماژول وظایف
├── pages/                # صفحات اصلی برنامه
│   ├── ModuleList_Refine.tsx    # صفحه لیست (Grid/List/Kanban)
│   ├── ModuleShow.tsx           # صفحه نمایش تک رکورد
│   ├── ModuleCreate.tsx         # صفحه ایجاد رکورد جدید
│   └── Settings/                # تنظیمات سیستم
│       ├── SettingsPage.tsx
│       ├── CompanyTab.tsx
│       ├── UsersTab.tsx
│       └── RolesTab.tsx
├── utils/                # توابع کمکی
│   └── filterUtils.tsx          # توابع فیلترینگ
│   └── productionWorkflow.ts    # گردش موجودی تولید و انتقال کالا
├── types.ts              # تعاریف TypeScript Interfaces
├── moduleRegistry.ts     # رجیستری مرکزی ماژول‌ها
├── supabaseClient.ts     # کلاینت اتصال دیتابیس
├── App.tsx               # نقطه ورود اصلی
├── database.sql          # اسکریپت ساخت دیتابیس
└── tailwind.config.js    # تنظیمات Tailwind CSS
```

## 🧩 نحوه اضافه کردن ماژول جدید

### مثال: ایجاد ماژول "Invoices"

#### 1. ساخت جدول در Supabase
```sql
CREATE TABLE invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number text UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers(id),
  total_amount int8,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);
```

#### 2. ایجاد فایل Configuration
ایجاد `modules/invoicesConfig.ts`:
```typescript
import { ModuleDefinition, FieldType, FieldLocation } from '../types';

export const invoicesConfig: ModuleDefinition = {
  id: 'invoices',
  titles: { fa: 'فاکتورها', en: 'Invoices' },
  table: 'invoices',
  fields: [
    {
      key: 'invoice_number',
      labels: { fa: 'شماره فاکتور', en: 'Invoice #' },
      type: FieldType.TEXT,
      location: FieldLocation.HEADER,
      validation: { required: true },
      isTableColumn: true
    },
    {
      key: 'customer_id',
      labels: { fa: 'مشتری', en: 'Customer' },
      type: FieldType.RELATION,
      location: FieldLocation.HEADER,
      relationConfig: {
        targetModule: 'customers',
        targetField: 'last_name'
      },
      isTableColumn: true
    },
    // ... سایر فیلدها
  ],
  blocks: [],
  relatedTabs: []
};
```

#### 3. ثبت در Registry
در `moduleRegistry.ts`:
```typescript
import { invoicesConfig } from './modules/invoicesConfig';

export const MODULES: Record<string, ModuleDefinition> = {
  // ... ماژول‌های موجود
  invoices: invoicesConfig,
};
```

#### 4. اضافه کردن به Sidebar (اختیاری)
در `components/Layout.tsx`:
```typescript
<Menu.Item key="/invoices" icon={<FileTextOutlined />}>
  <Link to="/invoices">فاکتورها</Link>
</Menu.Item>
```

✅ **تمام!** حالا می‌توانید به `/invoices` بروید.

## 🔗 سیستم ارتباطات (Relations)

### رابطه One-to-Many
```typescript
{
  key: 'supplier_id',
  type: FieldType.RELATION,
  relationConfig: {
    targetModule: 'suppliers',
    targetField: 'business_name'
  }
}
```

### رابطه معکوس (Reverse Relation)
در `supplierConfig.ts`:
```typescript
relatedTabs: [
  {
    name: 'products',
    label: 'محصولات',
    icon: 'ShoppingCart',
    relationField: 'supplier_id',  // کلید خارجی در products
    displayFields: ['name', 'category', 'stock']
  }
]
```

📖 **مستندات کامل:** `RELATIONS_GUIDE.md`

## 📊 سیستم BOM (شناسنامه تولید)

برای محصولات نهایی، سیستم BOM هزینه‌های تولید را محاسبه می‌کند:

- **بخش چرم:** مواد اولیه چرمی
- **بخش آستر:** پارچه‌های آستری
- **بخش یراق:** قطعات فلزی
- **بخش خرجکار:** مواد جانبی
- **بخش دستمزد:** هزینه‌های نیروی کار

**فرمول:** `بهای تمام شده = مقدار مصرف × قیمت خرید`

## 🔒 امنیت و RBAC

### نقش‌های کاربری:
- **ADMIN:** دسترسی کامل
- **SALES:** مدیریت فروش و مشتریان
- **WAREHOUSE:** مدیریت انبار
- **PRODUCTION:** مدیریت تولید
- **VIEWER:** فقط مشاهده

### مجوزهای سطح فیلد:
```typescript
fieldAccess: {
  viewRoles: [UserRole.ADMIN, UserRole.SALES],
  editRoles: [UserRole.ADMIN]
}
```

⚠️ **توجه:** RLS Policies در Supabase باید تکمیل شوند.

## 🎨 تم و طراحی

- **حالت تاریک/روشن:** کاملاً پشتیبانی شده
- **رنگ اصلی:** نارنجی چرمی (`#c58f60`)
- **فونت:** Vazirmatn (فارسی)
- **طراحی واکنش‌گرا:** Mobile-first approach

## 🐛 عیب‌یابی

### مشکل: "Cannot read property of undefined"
**راه‌حل:** بررسی کنید فیلد در config و دیتابیس موجود باشد.

### مشکل: دراپ‌داون‌ها باز نمی‌شوند
**راه‌حل:** اضافه کردن `getPopupContainer` به کامپوننت Select.

### مشکل: تصاویر آپلود نمی‌شوند
**راه‌حل:** بررسی مجوزهای Storage Bucket در Supabase.

### مشکل: روابط نمایش داده نمی‌شوند
**راه‌حل:** بررسی کنید `relationConfig.targetModule` با ID ماژول مطابقت دارد.

### مشکل: فیلتر محصولات براساس رنگ/آپشن درست عمل نمی‌کند
**راه‌حل:** مطمئن شوید مقادیر `label` و `value` در جدول `dynamic_options` درست تنظیم شده‌اند. سیستم فیلترها را براساس مقدار و برچسب نرمال‌سازی و گزینه‌ها را براساس برچسب Deduplicate می‌کند.

## 📚 مستندات اضافی

- 📖 **راهنمای پروژه:** `PROJECT_GUIDE.md`
- 🏗️ **معماری فنی:** `ARCHITECTURE.md`
- 🔗 **راهنمای روابط:** `RELATIONS_GUIDE.md`
- 🗄️ **طراحی دیتابیس:** `DATABASE_SCHEMA.md`

## 🤝 مشارکت

این پروژه در حال توسعه فعال است.

- **توسعه‌دهنده اصلی:** Farzad
- **شریک هوش مصنوعی:** Claude (Anthropic)

## 📄 مجوز

Private / Proprietary

---

**آخرین به‌روزرسانی:** 9 فوریه 2026  
**نسخه:** 4.1