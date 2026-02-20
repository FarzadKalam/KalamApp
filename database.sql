-- ۱. جدول پروفایل‌ها (متصل به Auth.Users)
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text,
  mobile_1 text,
  mobile_2 text,
  email text,
  team text, -- می‌توان به صورت آرایه ["team1", "team2"] ذخیره کرد
  position text,
  hire_date date,
  avatar_url text,
  role text DEFAULT 'viewer',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ۲. جدول انبارها
CREATE TABLE public.warehouses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  location text,
  manager_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- ۳. جدول قفسه‌ها
CREATE TABLE public.shelves (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
  shelf_number text NOT NULL,
  name text,
  image_url text,
  location_detail text,
  responsible_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- ۴. جدول تامین‌کنندگان
CREATE TABLE public.suppliers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prefix text,
  first_name text,
  last_name text,
  business_name text,
  mobile_1 text,
  mobile_2 text,
  landline text,
  province text,
  city text,
  address text,
  instagram_id text,
  telegram_id text,
  payment_method text,
  rating int4 DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

-- ۵. جدول محصولات
CREATE TABLE public.products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  custom_code text UNIQUE, -- کد دستی و سیستمی
  manual_code text,
  product_type text, -- مواد اولیه، نیمه آماده، نهایی
  category text, -- چرم، آستر، یراق و...
  main_unit text,
  sub_unit text,
  colors jsonb, -- آرایه‌ای از رنگ‌ها
  supplier_id uuid REFERENCES public.suppliers(id),
  brand text,
  waste_rate numeric DEFAULT 0,
  buy_price int8,
  buy_price_updated_at timestamptz,
  cost_price int8,
  sell_price int8,
  sell_price_updated_at timestamptz,
  stock numeric DEFAULT 0,
  reorder_point numeric DEFAULT 0,
  specs jsonb, -- برای فیلدهای چرم (جنس، بافت، سورت)
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

-- ۶. جدول بسته‌های محصولات
CREATE TABLE public.product_bundles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bundle_number text UNIQUE,
  shelf_id uuid REFERENCES public.shelves(id),
  created_at timestamptz DEFAULT now()
);

-- ۷. ردیف‌های داخل بسته (رابطه چند به چند بین بسته و محصول)
CREATE TABLE public.bundle_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bundle_id uuid REFERENCES public.product_bundles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  quantity numeric
);

-- ۸. جدول مشتریان
CREATE TABLE public.customers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prefix text,
  first_name text,
  last_name text,
  business_name text,
  mobile_1 text,
  mobile_2 text,
  landline text,
  instagram_id text,
  telegram_id text,
  province text,
  city text,
  address text,
  notes text,
  rating int4 DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

-- ۹. شناسنامه‌های تولید (BOM)
CREATE TABLE public.boms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  custom_code text UNIQUE,
  status text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

-- ۱۰. ردیف‌های BOM
CREATE TABLE public.bom_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bom_id uuid REFERENCES public.boms(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  length numeric,
  width numeric,
  area numeric,
  pieces_count int4,
  consumption numeric
);

-- ۱۱. پیش‌فاکتور و فاکتور
CREATE TABLE public.invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_type text, -- proforma, final
  status text,
  customer_id uuid REFERENCES public.customers(id),
  payment_method text,
  marketer_id uuid REFERENCES public.profiles(id),
  sales_channel text,
  total_amount int8,
  total_discount int8,
  total_tax int8,
  final_payable int8,
  financial_approval bool DEFAULT false,
  terms_conditions text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

-- ۱۲. ردیف‌های فاکتور
CREATE TABLE public.invoice_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  quantity numeric,
  unit_price int8,
  tax int8,
  discount int8,
  row_total int8
);

-- ۱۳. اسناد مالی
CREATE TABLE public.financial_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid REFERENCES public.invoices(id),
  doc_type text, -- income, expense
  amount int8,
  payment_date timestamptz,
  due_date timestamptz,
  payer_id uuid, -- می‌تواند به مشتری یا پروفایل وصل شود
  receiver_id uuid,
  source_account text,
  destination_account text,
  receipt_image_url text,
  tracking_code text,
  payment_mode text, -- cash, credit, check
  check_status text,
  check_number text,
  sayad_id text,
  is_sayad_registered bool,
  account_owner_name text,
  account_owner_national_id text,
  check_image_url text,
  created_at timestamptz DEFAULT now()
);

-- ۱۴. وظایف (Tasks)
CREATE TABLE public.tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_type text, -- سازمانی، تولید، بازاریابی
  name text NOT NULL,
  responsible_id uuid REFERENCES public.profiles(id),
  assigned_at timestamptz,
  due_at timestamptz,
  related_to_id uuid, -- ID ماژول مرتبط
  related_to_module text, -- نام ماژول مرتبط
  status text,
  remind_me bool DEFAULT false,
  recurrence_info jsonb,
  created_at timestamptz DEFAULT now()
);

-- اتصال وظیفه به خط تولید
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS production_line_id uuid REFERENCES public.production_lines(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.tasks ADD COLUMN IF NOT EXISTS production_shelf_id uuid REFERENCES public.shelves(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.tasks ADD COLUMN IF NOT EXISTS produced_qty numeric DEFAULT 0;

-- ۱۵. حواله‌های کالا
CREATE TABLE public.stock_transfers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_type text, -- تولید، خرید، فروش، بین‌واحدی
  product_id uuid REFERENCES public.products(id),
  required_qty numeric,
  delivered_qty numeric,
  invoice_id uuid,
  production_order_id uuid,
  sender_id uuid REFERENCES public.profiles(id),
  receiver_id uuid REFERENCES public.profiles(id),
  is_sender_confirmed bool DEFAULT false,
  is_receiver_confirmed bool DEFAULT false,
  from_shelf_id uuid REFERENCES public.shelves(id),
  to_shelf_id uuid REFERENCES public.shelves(id),
  from_warehouse_id uuid REFERENCES public.warehouses(id),
  to_warehouse_id uuid REFERENCES public.warehouses(id),
  created_at timestamptz DEFAULT now()
);

-- افزودن ستون‌های جداول مواد اولیه به سفارش تولید
ALTER TABLE public.production_orders
ADD COLUMN IF NOT EXISTS items_leather jsonb,
ADD COLUMN IF NOT EXISTS items_lining jsonb,
ADD COLUMN IF NOT EXISTS items_fitting jsonb,
ADD COLUMN IF NOT EXISTS items_accessory jsonb,
ADD COLUMN IF NOT EXISTS items_labor jsonb;

-- ذخیره جمع کل (برآورد هزینه) سفارش تولید
ALTER TABLE IF EXISTS public.production_orders
ADD COLUMN IF NOT EXISTS production_cost numeric;

-- ستون‌های گردش کار تولید
ALTER TABLE IF EXISTS public.production_orders
ADD COLUMN IF NOT EXISTS production_shelf_id uuid REFERENCES public.shelves(id),
ADD COLUMN IF NOT EXISTS production_moves jsonb,
ADD COLUMN IF NOT EXISTS production_output_product_id uuid REFERENCES public.products(id),
ADD COLUMN IF NOT EXISTS production_output_shelf_id uuid REFERENCES public.shelves(id),
ADD COLUMN IF NOT EXISTS production_output_qty numeric;

-- Production lifecycle timestamps
ALTER TABLE IF EXISTS public.production_orders
ADD COLUMN IF NOT EXISTS production_started_at timestamptz,
ADD COLUMN IF NOT EXISTS production_stopped_at timestamptz,
ADD COLUMN IF NOT EXISTS production_completed_at timestamptz;

ALTER TABLE IF EXISTS public.production_orders
ADD COLUMN IF NOT EXISTS color text,
ADD COLUMN IF NOT EXISTS auto_name_enabled boolean DEFAULT true;

-- اضافه کردن فیلد تصویر به محصولات و مشتریان
ALTER TABLE public.products ADD COLUMN image_url text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_name text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE public.customers ADD COLUMN image_url text;

-- اضافه کردن فیلد موقعیت مکانی (لینک نقشه یا مختصات)
ALTER TABLE public.customers ADD COLUMN location_url text;
ALTER TABLE public.suppliers ADD COLUMN location_url text;

ALTER TABLE public.products ADD COLUMN system_code text;
ALTER TABLE public.products ADD COLUMN image_url text;

-- ایجاد سیاست دسترسی کامل برای باکت images
CREATE POLICY "Public Access"
ON storage.objects FOR ALL
USING ( bucket_id = 'images' )
WITH CHECK ( bucket_id = 'images' );

CREATE TABLE public.views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id text NOT NULL, -- مثلا 'products'
  name text NOT NULL, -- مثلا 'کالاهای گران چرمی'
  is_default boolean DEFAULT false,
  config jsonb NOT NULL, -- تنظیمات ستون‌ها و فیلترها { columns: [], filters: [] }
  created_by uuid REFERENCES auth.users(id), -- اگر Auth فعال باشه
  created_at timestamptz DEFAULT now()
);

-- باز کردن دسترسی (فعلا برای همه)
ALTER TABLE public.views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Views Access" ON public.views FOR ALL USING (true);

-- ۱. جدول مدیریت گزینه‌های انتخابی (رنگ‌ها، جنس‌ها و...)
CREATE TABLE public.option_sets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL, -- مثلا 'leather_color', 'lining_material'
  label text NOT NULL, -- چیزی که نمایش داده میشه: 'عسلی'
  value text NOT NULL, -- چیزی که ذخیره میشه: 'honey'
  created_at timestamptz DEFAULT now()
);

-- باز کردن دسترسی برای همه (جهت تست)
ALTER TABLE public.option_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Options Access" ON public.option_sets FOR ALL USING (true);

-- ۲. اضافه کردن فیلدهای ثابت جدید به جدول محصولات (طبق اکسل)
ALTER TABLE public.products ADD COLUMN calculation_method text; -- روش محاسبه
-- waste_rate قبلاً بود، اگر نیست اضافه کن
-- specs هم قبلاً بود (jsonb) که عالیه برای فیلدهای متغیر

-- اضافه کردن ستون وضعیت (اگر قبلاً مشکل داشته)
ALTER TABLE public.products ALTER COLUMN status SET DEFAULT 'active';

-- اضافه کردن فیلدهای جدید چرم و مواد اولیه
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS leather_type text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS leather_color_1 text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS leather_finish_1 text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS leather_sort text;

-- فیلدهای آستر
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS lining_material text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS lining_color text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS lining_dims text;

-- فیلدهای خرجکار و یراق
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS acc_material text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fitting_type text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fitting_size text;

-- فیلد برای ذخیره اقلام جدول (BOM) به صورت JSON
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bundle_items jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS final_product_bom jsonb;

-- ۱. اصلاح ستون اقلام بسته (اگر قبلاً با نام bundle_items ساختید تغییر نام دهید، وگرنه بسازید)
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'bundle_items') THEN
    ALTER TABLE public.products RENAME COLUMN bundle_items TO "bundleItems";
  ELSE
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "bundleItems" jsonb;
  END IF;
END $$;

-- ۲. اصلاح ستون فرمول ساخت (اگر قبلاً با نام final_product_bom ساختید تغییر نام دهید، وگرنه بسازید)
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'final_product_bom') THEN
    ALTER TABLE public.products RENAME COLUMN final_product_bom TO "finalProductBOM";
  ELSE
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "finalProductBOM" jsonb;
  END IF;
END $$;

-- ۱. جدول تنظیمات شرکت (فقط یک رکورد خواهد داشت)
CREATE TABLE public.company_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text,
  ceo_name text,
  national_id text,
  mobile text,
  phone text,
  address text,
  website text,
  email text,
  logo_url text,
  updated_at timestamptz DEFAULT now()
);

-- ۲. جدول نقش‌ها / چارت سازمانی
CREATE TABLE public.org_roles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL, -- عنوان جایگاه (مثلا: مدیر فروش)
  parent_id uuid REFERENCES public.org_roles(id), -- برای ساختار درختی
  permissions jsonb DEFAULT '{}', -- دسترسی‌ها به صورت JSON ذخیره می‌شود
  created_at timestamptz DEFAULT now()
);

-- ۳. آپدیت جدول پروفایل‌ها (اتصال کاربر به نقش)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.org_roles(id);

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- فعال‌سازی RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Company" ON public.company_settings FOR ALL USING (true);

ALTER TABLE public.org_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Roles" ON public.org_roles FOR ALL USING (true);

-- ۱. تنظیم تولید خودکار ID (اگر قبلاً ست نشده باشد)
ALTER TABLE public.profiles 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ۲. حذف محدودیت اتصال اجباری به جدول auth (این اجازه می‌دهد پروفایل کارمند بسازید بدون اینکه هنوز ثبت نام کرده باشد)
-- نگران نباشید، بعداً می‌توان با ایمیل آنها را مچ کرد.
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- ۳. اجازه دادن به ادمین برای افزودن کاربر (رفع خطای RLS)
-- ابتدا پالیسی‌های قبلی اینزرت را پاک می‌کنیم تا تداخل پیش نیاید
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.profiles;

-- حالا اجازه درج را به همه (یا حداقل کسانی که لاگین هستند) می‌دهیم
CREATE POLICY "Enable insert for authenticated users" 
ON public.profiles 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- (اختیاری) اگر باز هم اذیت کرد، کلا امنیت این جدول را موقت خاموش کن:
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- تابع کمکی برای آپدیت خودکار زمان ویرایش
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    -- سعی میکنیم یوزر جاری را بگیریم (اگر از طریق API کال شده باشد)
    NEW.updated_by = auth.uid(); 
    RETURN NEW;
END;
$$ language 'plpgsql';

-- اطمینان از وجود pgcrypto برای gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- توابع کمکی برای RLS بر اساس مسئول/سازنده
CREATE OR REPLACE FUNCTION public.get_current_user_role_id()
RETURNS uuid AS $$
  SELECT role_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.has_assignee_access(
  assignee_id uuid,
  assignee_type text,
  created_by uuid
)
RETURNS boolean AS $$
  SELECT (
    assignee_id IS NULL
    OR created_by = auth.uid()
    OR (assignee_type = 'user' AND assignee_id = auth.uid())
    OR (assignee_type = 'role' AND assignee_id = public.get_current_user_role_id())
  );
$$ LANGUAGE sql STABLE;

-- ایجاد ستون‌های سیستمی برای جدول محصولات
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS assignee_id uuid, -- آیدی کاربر یا نقش
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user', -- 'user' یا 'role'
ADD COLUMN IF NOT EXISTS auto_name_enabled boolean DEFAULT false;

-- اضافه کردن ستون مسئول به سایر جداول ماژول‌ها
ALTER TABLE public.product_bundles
ADD COLUMN IF NOT EXISTS assignee_id uuid,
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user';

ALTER TABLE public.warehouses
ADD COLUMN IF NOT EXISTS assignee_id uuid,
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user';

ALTER TABLE public.shelves
ADD COLUMN IF NOT EXISTS assignee_id uuid,
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user';

ALTER TABLE public.production_orders
ADD COLUMN IF NOT EXISTS assignee_id uuid,
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user';

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS assignee_id uuid,
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user';

ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS assignee_id uuid,
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user';

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS assignee_id uuid,
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user';

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS assignee_id uuid,
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user';

-- ایجاد ستون‌های سیستمی برای جدول BOM
ALTER TABLE public.production_boms 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS assignee_id uuid,
ADD COLUMN IF NOT EXISTS assignee_type text DEFAULT 'user';

-- تریگر برای آپدیت خودکار زمان ویرایش (محصولات)
DROP TRIGGER IF EXISTS update_products_modtime ON public.products;
CREATE TRIGGER update_products_modtime BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- تریگر برای آپدیت خودکار زمان ویرایش (BOM)
DROP TRIGGER IF EXISTS update_boms_modtime ON public.production_boms;
CREATE TRIGGER update_boms_modtime BEFORE UPDATE ON public.production_boms FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 1. جدول مرجع تگ‌ها (Tags)
CREATE TABLE public.tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL, -- عنوان تگ (مثلا: "فوری"، "پروژه آلفا")
  color text DEFAULT 'blue', -- رنگ تگ (blue, red, gold, #ff0000)
  created_at timestamptz DEFAULT now()
);

-- 2. جدول رابط (برای اتصال تگ به رکوردها در ماژول‌های مختلف)
CREATE TABLE public.record_tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id uuid NOT NULL, -- آیدی رکورد (محصول، مشتری و...)
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE,
  module_id text NOT NULL, -- نام ماژول (products, customers...)
  created_at timestamptz DEFAULT now()
);

-- افزودن چند تگ نمونه برای تست
INSERT INTO public.tags (title, color) VALUES 
('ویژه', 'gold'),
('بدهکار', 'red'),
('همکار تجاری', 'cyan'),
('پروژه نوروز', 'purple');

-- فعال‌سازی دسترسی (RLS)
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Tags" ON public.tags FOR ALL USING (true);

ALTER TABLE public.record_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Record Tags" ON public.record_tags FOR ALL USING (true);

-- ۱۶. جدول موجودی محصول به تفکیک قفسه
CREATE TABLE IF NOT EXISTS public.product_inventory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  shelf_id uuid REFERENCES public.shelves(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  stock numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (product_id, shelf_id)
);

ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Product Inventory" ON public.product_inventory FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_product_inventory_product ON public.product_inventory (product_id);
CREATE INDEX IF NOT EXISTS idx_product_inventory_shelf ON public.product_inventory (shelf_id);
CREATE INDEX IF NOT EXISTS idx_product_inventory_warehouse ON public.product_inventory (warehouse_id);

-- اطمینان از ساخت ID در موجودی قفسه
ALTER TABLE public.product_inventory ALTER COLUMN id SET DEFAULT gen_random_uuid();
UPDATE public.product_inventory SET id = gen_random_uuid() WHERE id IS NULL;

-- RLS برای ماژول‌ها بر اساس مسئول/سازنده
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignee access products" ON public.products;
DROP POLICY IF EXISTS "Assignee update products" ON public.products;
DROP POLICY IF EXISTS "Assignee delete products" ON public.products;
DROP POLICY IF EXISTS "Authenticated insert products" ON public.products;
CREATE POLICY "Assignee access products" ON public.products FOR SELECT USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee update products" ON public.products FOR UPDATE USING (public.has_assignee_access(assignee_id, assignee_type, created_by)) WITH CHECK (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee delete products" ON public.products FOR DELETE USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Authenticated insert products" ON public.products FOR INSERT WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.production_boms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignee access production_boms" ON public.production_boms;
DROP POLICY IF EXISTS "Assignee update production_boms" ON public.production_boms;
DROP POLICY IF EXISTS "Assignee delete production_boms" ON public.production_boms;
DROP POLICY IF EXISTS "Authenticated insert production_boms" ON public.production_boms;
CREATE POLICY "Assignee access production_boms" ON public.production_boms FOR SELECT USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee update production_boms" ON public.production_boms FOR UPDATE USING (public.has_assignee_access(assignee_id, assignee_type, created_by)) WITH CHECK (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee delete production_boms" ON public.production_boms FOR DELETE USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Authenticated insert production_boms" ON public.production_boms FOR INSERT WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignee access production_orders" ON public.production_orders;
DROP POLICY IF EXISTS "Assignee update production_orders" ON public.production_orders;
DROP POLICY IF EXISTS "Assignee delete production_orders" ON public.production_orders;
DROP POLICY IF EXISTS "Authenticated insert production_orders" ON public.production_orders;
CREATE POLICY "Assignee access production_orders" ON public.production_orders FOR SELECT USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee update production_orders" ON public.production_orders FOR UPDATE USING (public.has_assignee_access(assignee_id, assignee_type, created_by)) WITH CHECK (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee delete production_orders" ON public.production_orders FOR DELETE USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Authenticated insert production_orders" ON public.production_orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.product_bundles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignee access product_bundles" ON public.product_bundles;
DROP POLICY IF EXISTS "Assignee update product_bundles" ON public.product_bundles;
DROP POLICY IF EXISTS "Assignee delete product_bundles" ON public.product_bundles;
DROP POLICY IF EXISTS "Authenticated insert product_bundles" ON public.product_bundles;
CREATE POLICY "Assignee access product_bundles" ON public.product_bundles FOR SELECT USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee update product_bundles" ON public.product_bundles FOR UPDATE USING (public.has_assignee_access(assignee_id, assignee_type, created_by)) WITH CHECK (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee delete product_bundles" ON public.product_bundles FOR DELETE USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Authenticated insert product_bundles" ON public.product_bundles FOR INSERT WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignee access warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Assignee update warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Assignee delete warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Authenticated insert warehouses" ON public.warehouses;
CREATE POLICY "Assignee access warehouses" ON public.warehouses FOR SELECT USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee update warehouses" ON public.warehouses FOR UPDATE USING (public.has_assignee_access(assignee_id, assignee_type, created_by)) WITH CHECK (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee delete warehouses" ON public.warehouses FOR DELETE USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Authenticated insert warehouses" ON public.warehouses FOR INSERT WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.shelves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignee access shelves" ON public.shelves;
DROP POLICY IF EXISTS "Assignee update shelves" ON public.shelves;
DROP POLICY IF EXISTS "Assignee delete shelves" ON public.shelves;
DROP POLICY IF EXISTS "Authenticated insert shelves" ON public.shelves;
CREATE POLICY "Assignee access shelves" ON public.shelves FOR SELECT USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee update shelves" ON public.shelves FOR UPDATE USING (public.has_assignee_access(assignee_id, assignee_type, created_by)) WITH CHECK (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee delete shelves" ON public.shelves FOR DELETE USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Authenticated insert shelves" ON public.shelves FOR INSERT WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignee access customers" ON public.customers;
DROP POLICY IF EXISTS "Assignee update customers" ON public.customers;
DROP POLICY IF EXISTS "Assignee delete customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated insert customers" ON public.customers;
DROP POLICY IF EXISTS "Public insert customers" ON public.customers;
CREATE POLICY "Assignee access customers" ON public.customers FOR SELECT USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee update customers" ON public.customers FOR UPDATE USING (public.has_assignee_access(assignee_id, assignee_type, created_by)) WITH CHECK (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee delete customers" ON public.customers FOR DELETE USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Authenticated insert customers" ON public.customers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Public insert customers" ON public.customers FOR INSERT WITH CHECK (true);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignee access suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Assignee update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Assignee delete suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated insert suppliers" ON public.suppliers;
CREATE POLICY "Assignee access suppliers" ON public.suppliers FOR SELECT USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee update suppliers" ON public.suppliers FOR UPDATE USING (public.has_assignee_access(assignee_id, assignee_type, created_by)) WITH CHECK (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee delete suppliers" ON public.suppliers FOR DELETE USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Authenticated insert suppliers" ON public.suppliers FOR INSERT WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignee access invoices" ON public.invoices;
DROP POLICY IF EXISTS "Assignee update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Assignee delete invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated insert invoices" ON public.invoices;
CREATE POLICY "Assignee access invoices" ON public.invoices FOR SELECT USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee update invoices" ON public.invoices FOR UPDATE USING (public.has_assignee_access(assignee_id, assignee_type, created_by)) WITH CHECK (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee delete invoices" ON public.invoices FOR DELETE USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Authenticated insert invoices" ON public.invoices FOR INSERT WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignee access tasks" ON public.tasks;
DROP POLICY IF EXISTS "Assignee update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Assignee delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated insert tasks" ON public.tasks;
CREATE POLICY "Assignee access tasks" ON public.tasks FOR SELECT USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee update tasks" ON public.tasks FOR UPDATE USING (public.has_assignee_access(assignee_id, assignee_type, created_by)) WITH CHECK (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Assignee delete tasks" ON public.tasks FOR DELETE USING (public.has_assignee_access(assignee_id, assignee_type, created_by));
CREATE POLICY "Authenticated insert tasks" ON public.tasks FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ستون مرتبط با فاکتور در وظایف
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS related_invoice uuid;

-- تصاویر چندگانه محصولات
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order int4 DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Product Images" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "Public Insert Product Images" ON public.product_images FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Delete Product Images" ON public.product_images FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON public.product_images (product_id);

-- ۱۶. جدول لاگ تغییرات (Changelogs)
CREATE TABLE IF NOT EXISTS public.changelogs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL, -- create/update/delete
  field_name text,
  field_label text,
  old_value jsonb,
  new_value jsonb,
  user_id uuid REFERENCES auth.users(id),
  user_name text,
  record_title text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.changelogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Changelogs" ON public.changelogs FOR SELECT USING (true);
CREATE POLICY "Public Insert Changelogs" ON public.changelogs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Changelogs" ON public.changelogs FOR UPDATE USING (true) WITH CHECK (true);

-- ۱۶.۱ جدول یادداشت‌ها (Notes)
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

-- ۱۶.۲ جدول وضعیت مشاهده سایدبار (Unread)
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

-- ۱۷. خطوط تولید برای سفارشات
CREATE TABLE IF NOT EXISTS public.production_lines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  production_order_id uuid REFERENCES public.production_orders(id) ON DELETE CASCADE,
  line_no int4 NOT NULL,
  quantity numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (production_order_id, line_no)
);

ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Production Lines" ON public.production_lines FOR SELECT USING (true);
CREATE POLICY "Public Insert Production Lines" ON public.production_lines FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Production Lines" ON public.production_lines FOR UPDATE USING (true) WITH CHECK (true);

-- ==========================================================
-- مهاجرت تکمیلی: محصولات + فاکتور خرید + گردش موجودی (2026-02-15)
-- ==========================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) ستون‌های جدید محصولات
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS production_order_id uuid REFERENCES public.production_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grid_materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sub_stock numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_production_order_id
  ON public.products(production_order_id);

-- 2) سازگاری جدول فاکتور فروش با ساختار فعلی فرانت
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS system_code text,
  ADD COLUMN IF NOT EXISTS sale_source text,
  ADD COLUMN IF NOT EXISTS marketer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "invoiceItems" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_invoice_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_received_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 3) ماژول جدید فاکتورهای خرید
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS system_code text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'created',
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_source text,
  ADD COLUMN IF NOT EXISTS "invoiceItems" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_invoice_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_received_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS assignee_type text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status
  ON public.purchase_invoices(status);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier
  ON public.purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_created_at
  ON public.purchase_invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_system_code
  ON public.purchase_invoices(system_code);

DROP TRIGGER IF EXISTS update_purchase_invoices_modtime ON public.purchase_invoices;
CREATE TRIGGER update_purchase_invoices_modtime
BEFORE UPDATE ON public.purchase_invoices
FOR EACH ROW
EXECUTE PROCEDURE public.update_updated_at_column();

-- 4) تکمیل ستون‌ها/ایندکس‌های گردش موجودی
ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS transfer_type text,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS delivered_qty numeric,
  ADD COLUMN IF NOT EXISTS required_qty numeric,
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS production_order_id uuid,
  ADD COLUMN IF NOT EXISTS from_shelf_id uuid REFERENCES public.shelves(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_shelf_id uuid REFERENCES public.shelves(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receiver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_stock_transfers_product_created_at
  ON public.stock_transfers(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_invoice
  ON public.stock_transfers(invoice_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_production_order
  ON public.stock_transfers(production_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_shelf
  ON public.stock_transfers(from_shelf_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_shelf
  ON public.stock_transfers(to_shelf_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_type
  ON public.stock_transfers(transfer_type);

-- 5) RLS ماژول فاکتورهای خرید (هم‌راستا با سایر ماژول‌ها)
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Assignee access purchase_invoices" ON public.purchase_invoices;
DROP POLICY IF EXISTS "Assignee update purchase_invoices" ON public.purchase_invoices;
DROP POLICY IF EXISTS "Assignee delete purchase_invoices" ON public.purchase_invoices;
DROP POLICY IF EXISTS "Authenticated insert purchase_invoices" ON public.purchase_invoices;

CREATE POLICY "Assignee access purchase_invoices"
ON public.purchase_invoices
FOR SELECT
USING (public.has_assignee_access(assignee_id, assignee_type, created_by));

CREATE POLICY "Assignee update purchase_invoices"
ON public.purchase_invoices
FOR UPDATE
USING (public.has_assignee_access(assignee_id, assignee_type, created_by))
WITH CHECK (public.has_assignee_access(assignee_id, assignee_type, created_by));

CREATE POLICY "Assignee delete purchase_invoices"
ON public.purchase_invoices
FOR DELETE
USING (public.has_assignee_access(assignee_id, assignee_type, created_by));

CREATE POLICY "Authenticated insert purchase_invoices"
ON public.purchase_invoices
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

COMMIT;

-- ==========================================================
-- Migration: Integration settings (SMS/Email/Site)
-- ==========================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.integration_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_type text NOT NULL,
  provider text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_settings_connection_type_check
    CHECK (connection_type IN ('sms', 'email', 'site'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_settings_connection_type
  ON public.integration_settings(connection_type);

DROP TRIGGER IF EXISTS update_integration_settings_modtime ON public.integration_settings;
CREATE TRIGGER update_integration_settings_modtime
BEFORE UPDATE ON public.integration_settings
FOR EACH ROW
EXECUTE PROCEDURE public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.has_module_permission(
  module_name text,
  permission_key text DEFAULT 'view'
)
RETURNS boolean AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE
          WHEN r.permissions IS NULL THEN true
          WHEN NOT (r.permissions ? module_name) THEN true
          WHEN jsonb_typeof(r.permissions -> module_name -> permission_key) = 'boolean'
            THEN (r.permissions -> module_name ->> permission_key)::boolean
          ELSE true
        END
      FROM public.profiles p
      JOIN public.org_roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
      LIMIT 1
    ),
    true
  );
$$ LANGUAGE sql STABLE;

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role view integration_settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Role edit integration_settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Role delete integration_settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Role create integration_settings" ON public.integration_settings;

CREATE POLICY "Role view integration_settings"
ON public.integration_settings
FOR SELECT
USING (public.has_module_permission('__settings_tabs', 'view'));

CREATE POLICY "Role edit integration_settings"
ON public.integration_settings
FOR UPDATE
USING (public.has_module_permission('__settings_tabs', 'edit'))
WITH CHECK (public.has_module_permission('__settings_tabs', 'edit'));

CREATE POLICY "Role delete integration_settings"
ON public.integration_settings
FOR DELETE
USING (public.has_module_permission('__settings_tabs', 'delete'));

CREATE POLICY "Role create integration_settings"
ON public.integration_settings
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('__settings_tabs', 'edit'));

COMMIT;

-- ==========================================================
-- Migration: Role-aware RLS for module visibility/actions (2026-02-16)
-- ==========================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.has_assignee_access(
  assignee_id uuid,
  assignee_type text,
  created_by uuid
)
RETURNS boolean AS $$
  SELECT (
    created_by = auth.uid()
    OR (assignee_type = 'user' AND assignee_id = auth.uid())
    OR (assignee_type = 'role' AND assignee_id = public.get_current_user_role_id())
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.has_module_permission(
  module_name text,
  permission_key text DEFAULT 'view'
)
RETURNS boolean AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE
          WHEN r.permissions IS NULL THEN true
          WHEN NOT (r.permissions ? module_name) THEN true
          WHEN jsonb_typeof(r.permissions -> module_name -> permission_key) = 'boolean'
            THEN (r.permissions -> module_name ->> permission_key)::boolean
          ELSE true
        END
      FROM public.profiles p
      JOIN public.org_roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
      LIMIT 1
    ),
    true
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.has_view_access(
  module_name text,
  assignee_id uuid,
  assignee_type text,
  created_by uuid
)
RETURNS boolean AS $$
  SELECT (
    public.has_module_permission(module_name, 'view')
    OR public.has_assignee_access(assignee_id, assignee_type, created_by)
  );
$$ LANGUAGE sql STABLE;

-- products
DROP POLICY IF EXISTS "Assignee access products" ON public.products;
DROP POLICY IF EXISTS "Assignee update products" ON public.products;
DROP POLICY IF EXISTS "Assignee delete products" ON public.products;
DROP POLICY IF EXISTS "Authenticated insert products" ON public.products;

CREATE POLICY "Role/assignee view products"
ON public.products
FOR SELECT
USING (public.has_view_access('products', assignee_id, assignee_type, created_by));

CREATE POLICY "Role edit products"
ON public.products
FOR UPDATE
USING (public.has_module_permission('products', 'edit'))
WITH CHECK (public.has_module_permission('products', 'edit'));

CREATE POLICY "Role delete products"
ON public.products
FOR DELETE
USING (public.has_module_permission('products', 'delete'));

CREATE POLICY "Role create products"
ON public.products
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('products', 'edit'));

-- production_boms
DROP POLICY IF EXISTS "Assignee access production_boms" ON public.production_boms;
DROP POLICY IF EXISTS "Assignee update production_boms" ON public.production_boms;
DROP POLICY IF EXISTS "Assignee delete production_boms" ON public.production_boms;
DROP POLICY IF EXISTS "Authenticated insert production_boms" ON public.production_boms;

CREATE POLICY "Role/assignee view production_boms"
ON public.production_boms
FOR SELECT
USING (public.has_view_access('production_boms', assignee_id, assignee_type, created_by));

CREATE POLICY "Role edit production_boms"
ON public.production_boms
FOR UPDATE
USING (public.has_module_permission('production_boms', 'edit'))
WITH CHECK (public.has_module_permission('production_boms', 'edit'));

CREATE POLICY "Role delete production_boms"
ON public.production_boms
FOR DELETE
USING (public.has_module_permission('production_boms', 'delete'));

CREATE POLICY "Role create production_boms"
ON public.production_boms
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('production_boms', 'edit'));

-- production_orders
DROP POLICY IF EXISTS "Assignee access production_orders" ON public.production_orders;
DROP POLICY IF EXISTS "Assignee update production_orders" ON public.production_orders;
DROP POLICY IF EXISTS "Assignee delete production_orders" ON public.production_orders;
DROP POLICY IF EXISTS "Authenticated insert production_orders" ON public.production_orders;

CREATE POLICY "Role/assignee view production_orders"
ON public.production_orders
FOR SELECT
USING (public.has_view_access('production_orders', assignee_id, assignee_type, created_by));

CREATE POLICY "Role edit production_orders"
ON public.production_orders
FOR UPDATE
USING (public.has_module_permission('production_orders', 'edit'))
WITH CHECK (public.has_module_permission('production_orders', 'edit'));

CREATE POLICY "Role delete production_orders"
ON public.production_orders
FOR DELETE
USING (public.has_module_permission('production_orders', 'delete'));

CREATE POLICY "Role create production_orders"
ON public.production_orders
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('production_orders', 'edit'));

-- product_bundles
DROP POLICY IF EXISTS "Assignee access product_bundles" ON public.product_bundles;
DROP POLICY IF EXISTS "Assignee update product_bundles" ON public.product_bundles;
DROP POLICY IF EXISTS "Assignee delete product_bundles" ON public.product_bundles;
DROP POLICY IF EXISTS "Authenticated insert product_bundles" ON public.product_bundles;

CREATE POLICY "Role/assignee view product_bundles"
ON public.product_bundles
FOR SELECT
USING (public.has_view_access('product_bundles', assignee_id, assignee_type, created_by));

CREATE POLICY "Role edit product_bundles"
ON public.product_bundles
FOR UPDATE
USING (public.has_module_permission('product_bundles', 'edit'))
WITH CHECK (public.has_module_permission('product_bundles', 'edit'));

CREATE POLICY "Role delete product_bundles"
ON public.product_bundles
FOR DELETE
USING (public.has_module_permission('product_bundles', 'delete'));

CREATE POLICY "Role create product_bundles"
ON public.product_bundles
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('product_bundles', 'edit'));

-- warehouses
DROP POLICY IF EXISTS "Assignee access warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Assignee update warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Assignee delete warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Authenticated insert warehouses" ON public.warehouses;

CREATE POLICY "Role/assignee view warehouses"
ON public.warehouses
FOR SELECT
USING (public.has_view_access('warehouses', assignee_id, assignee_type, created_by));

CREATE POLICY "Role edit warehouses"
ON public.warehouses
FOR UPDATE
USING (public.has_module_permission('warehouses', 'edit'))
WITH CHECK (public.has_module_permission('warehouses', 'edit'));

CREATE POLICY "Role delete warehouses"
ON public.warehouses
FOR DELETE
USING (public.has_module_permission('warehouses', 'delete'));

CREATE POLICY "Role create warehouses"
ON public.warehouses
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('warehouses', 'edit'));

-- shelves
DROP POLICY IF EXISTS "Assignee access shelves" ON public.shelves;
DROP POLICY IF EXISTS "Assignee update shelves" ON public.shelves;
DROP POLICY IF EXISTS "Assignee delete shelves" ON public.shelves;
DROP POLICY IF EXISTS "Authenticated insert shelves" ON public.shelves;

CREATE POLICY "Role/assignee view shelves"
ON public.shelves
FOR SELECT
USING (public.has_view_access('shelves', assignee_id, assignee_type, created_by));

CREATE POLICY "Role edit shelves"
ON public.shelves
FOR UPDATE
USING (public.has_module_permission('shelves', 'edit'))
WITH CHECK (public.has_module_permission('shelves', 'edit'));

CREATE POLICY "Role delete shelves"
ON public.shelves
FOR DELETE
USING (public.has_module_permission('shelves', 'delete'));

CREATE POLICY "Role create shelves"
ON public.shelves
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('shelves', 'edit'));

-- customers
DROP POLICY IF EXISTS "Assignee access customers" ON public.customers;
DROP POLICY IF EXISTS "Assignee update customers" ON public.customers;
DROP POLICY IF EXISTS "Assignee delete customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated insert customers" ON public.customers;
DROP POLICY IF EXISTS "Public insert customers" ON public.customers;

CREATE POLICY "Role/assignee view customers"
ON public.customers
FOR SELECT
USING (public.has_view_access('customers', assignee_id, assignee_type, created_by));

CREATE POLICY "Role edit customers"
ON public.customers
FOR UPDATE
USING (public.has_module_permission('customers', 'edit'))
WITH CHECK (public.has_module_permission('customers', 'edit'));

CREATE POLICY "Role delete customers"
ON public.customers
FOR DELETE
USING (public.has_module_permission('customers', 'delete'));

CREATE POLICY "Role create customers"
ON public.customers
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('customers', 'edit'));

-- suppliers
DROP POLICY IF EXISTS "Assignee access suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Assignee update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Assignee delete suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated insert suppliers" ON public.suppliers;

CREATE POLICY "Role/assignee view suppliers"
ON public.suppliers
FOR SELECT
USING (public.has_view_access('suppliers', assignee_id, assignee_type, created_by));

CREATE POLICY "Role edit suppliers"
ON public.suppliers
FOR UPDATE
USING (public.has_module_permission('suppliers', 'edit'))
WITH CHECK (public.has_module_permission('suppliers', 'edit'));

CREATE POLICY "Role delete suppliers"
ON public.suppliers
FOR DELETE
USING (public.has_module_permission('suppliers', 'delete'));

CREATE POLICY "Role create suppliers"
ON public.suppliers
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('suppliers', 'edit'));

-- invoices
DROP POLICY IF EXISTS "Assignee access invoices" ON public.invoices;
DROP POLICY IF EXISTS "Assignee update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Assignee delete invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated insert invoices" ON public.invoices;

CREATE POLICY "Role/assignee view invoices"
ON public.invoices
FOR SELECT
USING (public.has_view_access('invoices', assignee_id, assignee_type, created_by));

CREATE POLICY "Role edit invoices"
ON public.invoices
FOR UPDATE
USING (public.has_module_permission('invoices', 'edit'))
WITH CHECK (public.has_module_permission('invoices', 'edit'));

CREATE POLICY "Role delete invoices"
ON public.invoices
FOR DELETE
USING (public.has_module_permission('invoices', 'delete'));

CREATE POLICY "Role create invoices"
ON public.invoices
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('invoices', 'edit'));

-- tasks
DROP POLICY IF EXISTS "Assignee access tasks" ON public.tasks;
DROP POLICY IF EXISTS "Assignee update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Assignee delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated insert tasks" ON public.tasks;

CREATE POLICY "Role/assignee view tasks"
ON public.tasks
FOR SELECT
USING (public.has_view_access('tasks', assignee_id, assignee_type, created_by));

CREATE POLICY "Role edit tasks"
ON public.tasks
FOR UPDATE
USING (public.has_module_permission('tasks', 'edit'))
WITH CHECK (public.has_module_permission('tasks', 'edit'));

CREATE POLICY "Role delete tasks"
ON public.tasks
FOR DELETE
USING (public.has_module_permission('tasks', 'delete'));

CREATE POLICY "Role create tasks"
ON public.tasks
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('tasks', 'edit'));

-- purchase_invoices
DROP POLICY IF EXISTS "Assignee access purchase_invoices" ON public.purchase_invoices;
DROP POLICY IF EXISTS "Assignee update purchase_invoices" ON public.purchase_invoices;
DROP POLICY IF EXISTS "Assignee delete purchase_invoices" ON public.purchase_invoices;
DROP POLICY IF EXISTS "Authenticated insert purchase_invoices" ON public.purchase_invoices;

CREATE POLICY "Role/assignee view purchase_invoices"
ON public.purchase_invoices
FOR SELECT
USING (public.has_view_access('purchase_invoices', assignee_id, assignee_type, created_by));

CREATE POLICY "Role edit purchase_invoices"
ON public.purchase_invoices
FOR UPDATE
USING (public.has_module_permission('purchase_invoices', 'edit'))
WITH CHECK (public.has_module_permission('purchase_invoices', 'edit'));

CREATE POLICY "Role delete purchase_invoices"
ON public.purchase_invoices
FOR DELETE
USING (public.has_module_permission('purchase_invoices', 'delete'));

CREATE POLICY "Role create purchase_invoices"
ON public.purchase_invoices
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('purchase_invoices', 'edit'));

-- production_group_orders
CREATE TABLE IF NOT EXISTS public.production_group_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  system_code text,
  status text DEFAULT 'pending',
  production_order_ids jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.production_group_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role view production_group_orders" ON public.production_group_orders;
DROP POLICY IF EXISTS "Role edit production_group_orders" ON public.production_group_orders;
DROP POLICY IF EXISTS "Role delete production_group_orders" ON public.production_group_orders;
DROP POLICY IF EXISTS "Role create production_group_orders" ON public.production_group_orders;

CREATE POLICY "Role view production_group_orders"
ON public.production_group_orders
FOR SELECT
USING (public.has_module_permission('production_group_orders', 'view'));

CREATE POLICY "Role edit production_group_orders"
ON public.production_group_orders
FOR UPDATE
USING (public.has_module_permission('production_group_orders', 'edit'))
WITH CHECK (public.has_module_permission('production_group_orders', 'edit'));

CREATE POLICY "Role delete production_group_orders"
ON public.production_group_orders
FOR DELETE
USING (public.has_module_permission('production_group_orders', 'delete'));

CREATE POLICY "Role create production_group_orders"
ON public.production_group_orders
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('production_group_orders', 'edit'));

ALTER TABLE public.production_orders
ADD COLUMN IF NOT EXISTS production_group_order_id uuid REFERENCES public.production_group_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_orders_group_order_id
ON public.production_orders(production_group_order_id);

-- workflows
CREATE TABLE IF NOT EXISTS public.workflows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id text NOT NULL,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL DEFAULT 'on_create',
  interval_value int4,
  interval_unit text,
  interval_at time,
  batch_size int4,
  conditions_all jsonb DEFAULT '[]'::jsonb,
  conditions_any jsonb DEFAULT '[]'::jsonb,
  actions jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role view workflows" ON public.workflows;
DROP POLICY IF EXISTS "Role edit workflows" ON public.workflows;
DROP POLICY IF EXISTS "Role delete workflows" ON public.workflows;
DROP POLICY IF EXISTS "Role create workflows" ON public.workflows;

CREATE POLICY "Role view workflows"
ON public.workflows
FOR SELECT
USING (public.has_module_permission('workflows', 'view'));

CREATE POLICY "Role edit workflows"
ON public.workflows
FOR UPDATE
USING (public.has_module_permission('workflows', 'edit'))
WITH CHECK (public.has_module_permission('workflows', 'edit'));

CREATE POLICY "Role delete workflows"
ON public.workflows
FOR DELETE
USING (public.has_module_permission('workflows', 'delete'));

CREATE POLICY "Role create workflows"
ON public.workflows
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND public.has_module_permission('workflows', 'edit'));

COMMIT;
