# راهنمای جامع تنظیم فیلدها

این مستند شامل تمام اطلاعات مورد نیاز برای تنظیم و مدیریت فیلدها در ماژول‌های سیستم می‌باشد.

---

## فهرست مطالب
1. [انواع فیلدها (FieldType)](#انواع-فیلدها)
2. [نحوه تعریف فیلد](#نحوه-تعریف-فیلد)
3. [خصوصیات فیلدها](#خصوصیات-فیلدها)
4. [فیلدهای دراپ‌داون قابل افزودن](#فیلدهای-دراپداون-قابل-افزودن)
5. [تنظیم ستون‌های جدول لیست](#تنظیم-ستونهای-جدول-لیست)
6. [شرطی کردن فیلدها](#شرطی-کردن-فیلدها)
7. [مثال‌های کامل](#مثالهای-کامل)

---

## انواع فیلدها

### 1. TEXT
متن ساده - برای نام، کد، توضیحات

```typescript
{
  key: 'name',
  labels: { fa: 'نام محصول', en: 'Product Name' },
  type: FieldType.TEXT,
  validation: { required: true }
}
```

### 2. NUMBER
عدد - برای مقادیر عددی عمومی

```typescript
{
  key: 'quantity',
  labels: { fa: 'تعداد', en: 'Quantity' },
  type: FieldType.NUMBER
}
```

### 3. PRICE
قیمت - با فرمت جداکننده هزارگان

```typescript
{
  key: 'unit_price',
  labels: { fa: 'قیمت واحد', en: 'Unit Price' },
  type: FieldType.PRICE
}
```

### 4. SELECT
لیست انتخابی - دراپ‌داون با گزینه‌های ثابت یا دینامیک

#### الف) گزینه‌های ثابت:
```typescript
{
  key: 'product_type',
  labels: { fa: 'نوع محصول', en: 'Product Type' },
  type: FieldType.SELECT,
  options: [
    { label: 'مواد اولیه', value: 'raw_material' },
    { label: 'بسته نیمه آماده', value: 'semi_finished_package' },
    { label: 'محصول نهایی', value: 'final_product' }
  ]
}
```

#### ب) گزینه‌های دینامیک (قابل افزودن/حذف توسط کاربر):
```typescript
{
  key: 'leather_color_1',
  labels: { fa: 'رنگ چرم ۱', en: 'Color 1' },
  type: FieldType.SELECT,
  dynamicOptionsCategory: 'leather_color' // ✅ این فیلد از جدول dynamic_options می‌خواند
}
```

> **نکته مهم:** فیلدهای با `dynamicOptionsCategory` به صورت خودکار از کامپوننت `DynamicSelectField` استفاده می‌کنند که قابلیت‌های زیر را دارد:
> - ✅ جستجو در گزینه‌ها
> - ✅ افزودن گزینه جدید با دکمه (برای موبایل) یا Enter
> - ✅ حذف گزینه‌ها با آیکون سطل آشغال
> - ✅ Popconfirm برای تایید حذف
> - ✅ رفرش خودکار لیست بعد از تغییرات
> - ✅ نرمال‌سازی مقدار/برچسب و Deduplicate بر اساس برچسب برای جلوگیری از گزینه‌های تکراری

### 5. RELATION
ارتباط با جدول دیگر

```typescript
{
  key: 'supplier_id',
  labels: { fa: 'تأمین‌کننده', en: 'Supplier' },
  type: FieldType.RELATION,
  relationTable: 'suppliers',
  relationLabel: 'name'
}
```

### 6. IMAGE
آپلود تصویر - با Supabase Storage

```typescript
{
  key: 'image_url',
  labels: { fa: 'تصویر محصول', en: 'Product Image' },
  type: FieldType.IMAGE
}
```

### 7. STATUS
وضعیت - با رنگ‌بندی مخصوص

```typescript
{
  key: 'status',
  labels: { fa: 'وضعیت', en: 'Status' },
  type: FieldType.STATUS,
  options: [
    { label: 'فعال', value: 'active' },
    { label: 'غیرفعال', value: 'inactive' }
  ]
}
```

### 8. DATE
تاریخ - با تقویم جلالی

```typescript
{
  key: 'production_date',
  labels: { fa: 'تاریخ تولید', en: 'Production Date' },
  type: FieldType.DATE
}
```

### 9. CHECKBOX
چک‌باکس - برای مقادیر بله/خیر

```typescript
{
  key: 'is_available',
  labels: { fa: 'موجود', en: 'Available' },
  type: FieldType.CHECKBOX
}
```

### 10. TEXTAREA
متن چند خطی - برای توضیحات طولانی

```typescript
{
  key: 'description',
  labels: { fa: 'توضیحات', en: 'Description' },
  type: FieldType.TEXTAREA
}
```

---

## نحوه تعریف فیلد

ساختار استاندارد یک فیلد:

```typescript
{
  key: 'field_name',                    // نام فیلد در دیتابیس
  labels: { fa: 'نام فارسی', en: 'English Name' },
  type: FieldType.TEXT,                 // نوع فیلد
  location: FieldLocation.HEADER,       // محل قرارگیری (HEADER/BLOCK/TABLE)
  blockId?: 'block_name',               // اگر در بلوک است
  order: 1,                             // ترتیب نمایش
  validation?: {                        // اعتبارسنجی
    required: true,
    min: 0,
    max: 1000
  },
  readonly?: true,                      // غیرقابل ویرایش
  isTableColumn?: true,                 // نمایش در جدول لیست
  isKey?: true,                         // فیلد کلیدی (برای لینک)
  nature?: FieldNature.PREDEFINED,      // ماهیت فیلد
  options?: [...],                      // گزینه‌های ثابت
  dynamicOptionsCategory?: 'category',  // دسته گزینه‌های دینامیک
  mode?: 'tags',                        // حالت دراپ‌داون (برای قابل افزودن)
  logic?: {                             // منطق شرطی
    visibleIf: {
      field: 'other_field',
      operator: LogicOperator.EQUALS,
      value: 'some_value'
    }
  }
}
```

---

## خصوصیات فیلدها

### خصوصیات اصلی

| خصوصیت | نوع | توضیح | مثال |
|--------|-----|-------|------|
| `key` | string | نام فیلد در دیتابیس | `'product_name'` |
| `labels` | object | برچسب‌های فارسی و انگلیسی | `{ fa: 'نام', en: 'Name' }` |
| `type` | FieldType | نوع فیلد | `FieldType.TEXT` |
| `location` | FieldLocation | محل نمایش | `FieldLocation.HEADER` |
| `order` | number | ترتیب نمایش | `1` |

### خصوصیات اختیاری

| خصوصیت | نوع | توضیح | پیش‌فرض |
|--------|-----|-------|---------|
| `validation` | object | قوانین اعتبارسنجی | - |
| `readonly` | boolean | غیرقابل ویرایش | `false` |
| `isTableColumn` | boolean | نمایش در لیست | `false` |
| `isKey` | boolean | فیلد کلیدی | `false` |
| `blockId` | string | شناسه بلوک | - |
| `options` | array | گزینه‌های ثابت | - |
| `dynamicOptionsCategory` | string | دسته گزینه‌های دینامیک | - |
| `mode` | 'tags' | حالت قابل افزودن | - |
| `relationTable` | string | جدول مرتبط | - |
| `relationLabel` | string | فیلد نمایشی رابطه | - |
| `logic` | object | منطق شرطی | - |

---

## بهینه‌سازی عملکرد

### Cache کردن گزینه‌های دراپ‌داون
برای جلوگیری از بارگذاری مجدد گزینه‌ها هر بار که فرم باز می‌شود:
- گزینه‌ها فقط یک بار در اولین render بارگذاری می‌شوند
- با افزودن/حذف گزینه جدید، cache به‌روز می‌شود
- fetch های موازی با `Promise.all` برای سرعت بیشتر

```typescript
// در SmartForm.tsx
const [optionsLoaded, setOptionsLoaded] = useState(false);

useEffect(() => {
  if (!optionsLoaded) {
    fetchAllRelationOptionsWrapper(); // فقط یک بار
  }
}, []);
```

### موازی‌سازی درخواست‌ها
همه queryهای دیتابیس به‌صورت موازی اجرا می‌شوند:

```typescript
const fetchPromises: Promise<{ key: string; options: any[] }>[] = [];

// جمع‌آوری همه fetchها
dynamicFields.forEach(field => {
  fetchPromises.push(
    fetchDynamicOptions(field.dynamicOptionsCategory)
      .then(options => ({ key: field.key, options }))
  );
});

// اجرای موازی
const results = await Promise.all(fetchPromises);
```

## فیلدهای دراپ‌داون قابل افزودن

برای اینکه یک دراپ‌داون قابل افزودن/حذف باشد، فقط `dynamicOptionsCategory` را تعریف کنید:

### گام 1: تعریف فیلد با dynamicOptionsCategory

```typescript
{
  key: 'leather_color',
  labels: { fa: 'رنگ چرم', en: 'Leather Color' },
  type: FieldType.SELECT,
  dynamicOptionsCategory: 'leather_color'  // ✅ فقط این کافی است
}
```

> **نکته:** دیگر نیازی به `mode: 'tags'` نیست! سیستم به صورت خودکار از کامپوننت `DynamicSelectField` استفاده می‌کند.

### گام 2: ایجاد دسته در جدول dynamic_options

```sql
INSERT INTO dynamic_options (category, label_fa, label_en, value)
VALUES 
  ('leather_color', 'مشکی', 'Black', 'black'),
  ('leather_color', 'قهوه‌ای', 'Brown', 'brown'),
  ('leather_color', 'عسلی', 'Honey', 'honey');
```

### گام 3: تست کردن

1. فرم ایجاد محصول را باز کنید
2. در فیلد رنگ چرم، گزینه‌های موجود را ببینید
3. یک مقدار جدید تایپ کنید و Enter بزنید
4. مقدار جدید اضافه می‌شود

### دسته‌های موجود در سیستم

| دسته | فارسی | استفاده |
|------|-------|---------|
| `leather_type` | نوع چرم | گاوی، بزی، گوسفندی، شتری |
| `leather_color` | رنگ چرم | مشکی، قهوه‌ای، عسلی، سورمه‌ای |
| `leather_finish` | صفحه چرم | براق، مات، کرک، کروکو، آبرنگ |
| `leather_sort` | سورت چرم | درجه 1، درجه 2، درجه 3 |
| `lining_material` | جنس آستر | پارچه، مخمل، چرم |
| `general_color` | رنگ عمومی | برای آستر، خرج‌کار |
| `acc_material` | جنس خرج‌کار | نخ، چسب، لاکر |
| `fitting_type` | نوع یراق | سگک، زیپ، قلاب، گیره |
| `product_category` | دسته محصول | کیف، کمربند، کیف‌پول |

> **نکته:** برای فیلدهای رنگِ مختلف (مثل `leather_colors`, `lining_color`, `fitting_colors`) می‌توان از دسته‌ی مشترک `general_color` استفاده کرد تا یک لیست واحد و قابل نگهداری داشته باشید.

---

## تنظیم ستون‌های جدول لیست

برای نمایش فیلد در جدول لیست محصولات:

```typescript
{
  key: 'name',
  labels: { fa: 'نام محصول', en: 'Product Name' },
  type: FieldType.TEXT,
  isTableColumn: true,  // ✅ نمایش در لیست
  isKey: true           // ✅ قابل کلیک (لینک به صفحه نمایش)
}
```

### نکات مهم:
- `isTableColumn: true` → فیلد در جدول لیست نمایش داده می‌شود
- `isKey: true` → فیلد لینک‌دار می‌شود (باز کردن صفحه نمایش)
- معمولاً فیلدهای کلیدی: `system_code`، `name`

---

## شرطی کردن فیلدها

برای نمایش شرطی فیلدها بر اساس مقدار فیلد دیگر:

### مثال 1: نمایش مشخصات چرم فقط برای مواد اولیه چرمی

```typescript
{
  key: 'leather_color',
  labels: { fa: 'رنگ چرم', en: 'Leather Color' },
  type: FieldType.SELECT,
  dynamicOptionsCategory: 'leather_color',
  mode: 'tags',
  logic: {
    visibleIf: {
      field: 'category',
      operator: LogicOperator.EQUALS,
      value: 'leather'
    }
  }
}
```

### مثال 2: نمایش جدول اقلام فقط برای بسته نیمه‌آماده

```typescript
BLOCKS: [
  {
    id: 'items_leather',
    title: { fa: 'اقلام چرمی', en: 'Leather Items' },
    type: BlockType.TABLE,
    columns: [...],
    logic: {
      visibleIf: {
        field: 'product_type',
        operator: LogicOperator.EQUALS,
        value: 'semi_finished_package'
      }
    }
  }
]
```

### عملگرهای منطقی

| عملگر | کاربرد |
|-------|--------|
| `LogicOperator.EQUALS` | برابر |
| `LogicOperator.NOT_EQUALS` | نابرابر |
| `LogicOperator.CONTAINS` | شامل |
| `LogicOperator.GREATER_THAN` | بزرگتر از |
| `LogicOperator.LESS_THAN` | کوچکتر از |

---

## مثال‌های کامل

### مثال 1: فیلد متنی ساده

```typescript
{
  key: 'name',
  labels: { fa: 'نام محصول', en: 'Product Name' },
  type: FieldType.TEXT,
  location: FieldLocation.HEADER,
  order: 2,
  validation: { required: true },
  isTableColumn: true,
  isKey: true,
  nature: FieldNature.PREDEFINED
}
```

### مثال 2: فیلد دراپ‌داون ثابت

```typescript
{
  key: 'product_type',
  labels: { fa: 'نوع محصول', en: 'Product Type' },
  type: FieldType.SELECT,
  location: FieldLocation.HEADER,
  order: 3,
  options: [
    { label: 'مواد اولیه', value: 'raw_material' },
    { label: 'بسته نیمه آماده', value: 'semi_finished_package' },
    { label: 'محصول نهایی', value: 'final_product' }
  ],
  validation: { required: true },
  isTableColumn: true
}
```

### مثال 3: فیلد دراپ‌داون قابل افزودن

```typescript
{
  key: 'leather_color_1',
  labels: { fa: 'رنگ چرم ۱', en: 'Color 1' },
  type: FieldType.SELECT,
  location: FieldLocation.BLOCK,
  blockId: 'leatherSpec',
  order: 2,
  dynamicOptionsCategory: 'leather_color',
  mode: 'tags',
  logic: {
    visibleIf: {
      field: 'category',
      operator: LogicOperator.EQUALS,
      value: 'leather'
    }
  }
}
```

### مثال 4: فیلد رابطه‌ای (Relation)

```typescript
{
  key: 'supplier_id',
  labels: { fa: 'تأمین‌کننده', en: 'Supplier' },
  type: FieldType.RELATION,
  location: FieldLocation.HEADER,
  order: 10,
  relationTable: 'suppliers',
  relationLabel: 'name',
  isTableColumn: true
}
```

### مثال 5: فیلد تصویر

```typescript
{
  key: 'image_url',
  labels: { fa: 'تصویر محصول', en: 'Product Image' },
  type: FieldType.IMAGE,
  location: FieldLocation.HEADER,
  order: 15
}
```

### مثال 6: فیلد قیمت

```typescript
{
  key: 'unit_price',
  labels: { fa: 'قیمت واحد', en: 'Unit Price' },
  type: FieldType.PRICE,
  location: FieldLocation.HEADER,
  order: 8,
  validation: { required: true, min: 0 },
  isTableColumn: true
}
```

### مثال 7: فیلد readonly (فقط خواندنی)

```typescript
{
  key: 'system_code',
  labels: { fa: 'کد سیستمی', en: 'System Code' },
  type: FieldType.TEXT,
  location: FieldLocation.HEADER,
  order: 1,
  readonly: true,  // ✅ غیرقابل ویرایش
  isTableColumn: true,
  isKey: true
}
```

---

## نحوه افزودن فیلد جدید به ماژول

### گام 1: باز کردن فایل تنظیمات ماژول

فایل مربوطه در پوشه `modules/` را باز کنید:
- `productsConfig.ts` برای محصولات
- `customerConfig.ts` برای مشتریان
- `supplierConfig.ts` برای تأمین‌کنندگان
- و غیره...

### گام 2: اضافه کردن فیلد به آرایه FIELDS

```typescript
export const FIELDS: ModuleField[] = [
  // ... فیلدهای موجود ...
  
  // فیلد جدید
  {
    key: 'new_field_name',
    labels: { fa: 'نام فارسی', en: 'English Name' },
    type: FieldType.TEXT,
    location: FieldLocation.HEADER,
    order: 20, // ترتیب نمایش
    validation: { required: false },
    isTableColumn: true
  }
];
```

### گام 3: اضافه کردن فیلد به دیتابیس (در صورت نیاز)

اگر فیلد در جدول دیتابیس وجود ندارد:

```sql
ALTER TABLE products 
ADD COLUMN new_field_name TEXT;
```

### گام 4: تست کردن

1. صفحه ایجاد محصول را رفرش کنید
2. فیلد جدید را در فرم ببینید
3. اطلاعات را پر کنید و ذخیره کنید
4. بررسی کنید که فیلد در دیتابیس ذخیره شده است

---

## نحوه ویرایش فیلد موجود

### برای تغییر برچسب:

```typescript
// قبل
labels: { fa: 'نام قدیمی', en: 'Old Name' }

// بعد
labels: { fa: 'نام جدید', en: 'New Name' }
```

### برای تغییر نوع:

```typescript
// قبل
type: FieldType.TEXT

// بعد
type: FieldType.NUMBER
```

### برای قابل افزودن کردن دراپ‌داون:

```typescript
// قبل
{
  key: 'color',
  type: FieldType.SELECT,
  options: [
    { label: 'قرمز', value: 'red' },
    { label: 'آبی', value: 'blue' }
  ]
}

// بعد
{
  key: 'color',
  type: FieldType.SELECT,
  dynamicOptionsCategory: 'general_color',
  mode: 'tags'  // ✅ اضافه شد
}
```

---

## رفع مشکلات رایج

### مشکل 1: فیلد در فرم نمایش داده نمی‌شود
- بررسی کنید `location` را تنظیم کرده‌اید
- بررسی کنید `logic` شرطی ندارد یا شرط برقرار است
- بررسی کنید `order` تنظیم شده است

### مشکل 2: دراپ‌داون گزینه ندارد
- بررسی کنید `options` یا `dynamicOptionsCategory` تنظیم شده
- بررسی کنید دسته در جدول `dynamic_options` وجود دارد
- کنسول مرورگر را چک کنید برای خطاهای احتمالی

### مشکل 3: نمی‌توانم گزینه جدید به دراپ‌داون اضافه کنم
- بررسی کنید `dynamicOptionsCategory` تنظیم شده است
- توجه: در نسخه‌های جدید، `mode: 'tags'` الزامی نیست و `DynamicSelectField` به‌صورت خودکار استفاده می‌شود.

### مشکل 4: فیلد در جدول لیست نمایش داده نمی‌شود
- بررسی کنید `isTableColumn: true` تنظیم شده است

### مشکل 5: تصویر آپلود نمی‌شود
- بررسی کنید Supabase Storage تنظیم شده است
- بررسی کنید باکت `images` ایجاد شده و عمومی است
- بررسی کنید نوع فیلد `FieldType.IMAGE` است

---

## منابع بیشتر

- **فایل types.ts**: برای دیدن تمام enum ها و interface ها
- **فایل SmartFieldRenderer.tsx**: برای دیدن نحوه رندر فیلدها
- **فایل SmartForm.tsx**: برای دیدن نحوه مدیریت فرم
- **فایل DATABASE_SETUP.md**: برای راه‌اندازی جدول dynamic_options
- **فایل TROUBLESHOOTING.md**: برای رفع مشکلات رایج

---

**آخرین به‌روزرسانی:** 9 فوریه 2026
**نسخه مستند:** 1.1
