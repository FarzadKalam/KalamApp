# راهنمای ساختار دیتابیس

## جدول Dynamic Options

برای فیلدهایی که نیاز به گزینه‌های قابل تغییر توسط کاربر دارند (مثل دسته‌بندی محصولات، رنگ‌ها و...)، باید جدول `dynamic_options` ایجاد شود:

```sql
-- جدول گزینه‌های پویا
CREATE TABLE IF NOT EXISTS dynamic_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  value VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ایجاد ایندکس برای جستجوی سریع‌تر
CREATE INDEX idx_dynamic_options_category ON dynamic_options(category);
CREATE INDEX idx_dynamic_options_active ON dynamic_options(is_active);

-- داده‌های اولیه برای دسته‌بندی محصولات
INSERT INTO dynamic_options (category, label, value, display_order) VALUES
('product_categories', 'کیف', 'bag', 1),
('product_categories', 'کمربند', 'belt', 2),
('product_categories', 'جاکارتی', 'card_holder', 3),
('product_categories', 'دستکش', 'glove', 4),
('product_categories', 'کیف پول', 'wallet', 5);

-- داده‌های اولیه برای رنگ چرم
INSERT INTO dynamic_options (category, label, value, display_order) VALUES
('leather_color', 'مشکی', 'black', 1),
('leather_color', 'قهوه‌ای', 'brown', 2),
('leather_color', 'عسلی', 'honey', 3),
('leather_color', 'قرمز', 'red', 4),
('leather_color', 'سرمه‌ای', 'navy', 5);

-- داده‌های اولیه برای صفحه چرم
INSERT INTO dynamic_options (category, label, value, display_order) VALUES
('leather_finish', 'مات', 'matte', 1),
('leather_finish', 'براق', 'glossy', 2),
('leather_finish', 'نیمه براق', 'semi_glossy', 3),
('leather_finish', 'ساده', 'plain', 4);

-- داده‌های اولیه برای سورت چرم
INSERT INTO dynamic_options (category, label, value, display_order) VALUES
('leather_sort', 'درجه یک', 'grade_a', 1),
('leather_sort', 'درجه دو', 'grade_b', 2),
('leather_sort', 'درجه سه', 'grade_c', 3);

-- داده‌های اولیه برای جنس آستر
INSERT INTO dynamic_options (category, label, value, display_order) VALUES
('lining_material', 'پارچه', 'fabric', 1),
('lining_material', 'چرم', 'leather', 2),
('lining_material', 'مخمل', 'velvet', 3),
('lining_material', 'ساتن', 'satin', 4);

-- داده‌های اولیه برای رنگ عمومی
INSERT INTO dynamic_options (category, label, value, display_order) VALUES
('general_color', 'مشکی', 'black', 1),
('general_color', 'سفید', 'white', 2),
('general_color', 'قرمز', 'red', 3),
('general_color', 'آبی', 'blue', 4),
('general_color', 'سبز', 'green', 5);

-- داده‌های اولیه برای جنس خرجکار
INSERT INTO dynamic_options (category, label, value, display_order) VALUES
('acc_material', 'نخ', 'thread', 1),
('acc_material', 'زیپ', 'zipper', 2),
('acc_material', 'دکمه', 'button', 3),
('acc_material', 'چسب', 'adhesive', 4);

-- داده‌های اولیه برای نوع یراق
INSERT INTO dynamic_options (category, label, value, display_order) VALUES
('fitting_type', 'سگک', 'buckle', 1),
('fitting_type', 'زنجیر', 'chain', 2),
('fitting_type', 'قفل', 'lock', 3),
('fitting_type', 'حلقه', 'ring', 4);
```

## جدول محصولات (Products)

اگر فیلدهای جدید اضافه شده‌اند، مطمئن شوید که در جدول products موجود هستند:

```sql
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS manual_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS product_category VARCHAR(100);
```

## دسترسی‌های RLS

برای اطمینان از امنیت، Row Level Security را فعال کنید:

```sql
-- فعال کردن RLS
ALTER TABLE dynamic_options ENABLE ROW LEVEL SECURITY;

-- سیاست خواندن برای همه
CREATE POLICY "Allow read access to all users" ON dynamic_options
  FOR SELECT USING (true);

-- سیاست نوشتن فقط برای ادمین‌ها
CREATE POLICY "Allow insert for authenticated users" ON dynamic_options
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update for authenticated users" ON dynamic_options
  FOR UPDATE USING (auth.role() = 'authenticated');
```

## استفاده در کد

فیلدهای با `dynamicOptionsCategory` به صورت خودکار گزینه‌های خود را از این جدول بارگذاری می‌کنند:

```typescript
{
  key: 'product_category',
  labels: { fa: 'دسته بندی محصول', en: 'Product Category' },
  type: FieldType.SELECT,
  dynamicOptionsCategory: 'product_categories', // نام دسته در جدول
  mode: 'tags', // قابلیت افزودن گزینه جدید
}
```

## افزودن گزینه جدید توسط کاربر

با استفاده از `mode: 'tags'` در فیلد SELECT، کاربران می‌توانند گزینه‌های جدید اضافه کنند. 
این گزینه‌ها باید به صورت خودکار در جدول `dynamic_options` ذخیره شوند (این قابلیت در نسخه آینده اضافه می‌شود).

## یادداشت‌ها (Notes)

```sql
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id text NOT NULL,
  record_id uuid NOT NULL,
  content text NOT NULL,
  reply_to uuid,
  mention_user_ids uuid[] DEFAULT '{}'::uuid[],
  mention_role_ids uuid[] DEFAULT '{}'::uuid[],
  author_id uuid REFERENCES auth.users(id),
  author_name text,
  is_edited boolean DEFAULT false,
  edited_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Notes" ON public.notes FOR SELECT USING (true);
CREATE POLICY "Public Insert Notes" ON public.notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Notes" ON public.notes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public Delete Notes" ON public.notes FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_notes_module_record ON public.notes (module_id, record_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON public.notes (created_at);
```

## وضعیت مشاهده سایدبار (Unread)

```sql
CREATE TABLE IF NOT EXISTS public.sidebar_unread (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  module_id text NOT NULL,
  record_id uuid NOT NULL,
  tab_key text NOT NULL,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, module_id, record_id, tab_key)
);

ALTER TABLE public.sidebar_unread ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User Access Sidebar Unread" ON public.sidebar_unread FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "User Upsert Sidebar Unread" ON public.sidebar_unread FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User Update Sidebar Unread" ON public.sidebar_unread FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sidebar_unread_user ON public.sidebar_unread (user_id, module_id, record_id);
```

## وظایف مرتبط با فاکتور

```sql
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS related_invoice uuid;
```
