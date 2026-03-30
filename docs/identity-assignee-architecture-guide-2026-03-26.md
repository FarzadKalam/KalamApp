# راهنمای مدل هویت و ارجاع

تاریخ: 2026-03-26

## هدف

این فایل برای ادامه‌ی توسعه با حداقل تداخل نوشته شده است. دو حوزه‌ی حساس پروژه:

1. مدل هویت کاربران، کارمندان و نقش‌ها
2. فیلد سیستمی `assignee` که در UI سراسری است ولی ذخیره‌سازی آن فقط روی بعضی جدول‌ها فعال می‌شود

## مدل هویت

### 1) `auth.users`

- فقط منبع احراز هویت است.
- مالک session، password، phone identity و token refresh همین جدول/namespace است.
- منطق business نباید مستقیم روی فیلدهای متنی آن بنا شود.

### 2) `public.profiles`

- هویت اپلیکیشنی کاربر است.
- کلید اصلی آن باید همان `auth.users.id` بماند.
- این جدول منبع اصلی نمایش نام، آواتار، سازمان و اتصال به نقش سازمانی است.
- `profiles.role_id` باید source of truth برای نقش سازمانی باشد.

### 3) `public.employees`

- رکورد منابع انسانی است.
- `employees.related_profile_id` لینک اختیاری به `profiles.id` است.
- هر employee لازم نیست حساب کاربری داشته باشد.
- هر profile هم اگر به employee وصل شد، باید فقط به یک employee وصل شود.

### 4) `public.org_roles`

- نقش/تیم/جایگاه سازمانی است.
- دسترسی‌ها و assignment گروهی باید بر مبنای `org_roles.id` باشد.
- مثال:
  اگر نقش «کارشناس فروش» روی یک رکورد مسئول ثبت شود، تمام کاربرانی که `profiles.role_id` آن‌ها به همان `org_roles.id` وصل است، عضو آن assignment محسوب می‌شوند.

## نقش نرم‌افزاری در برابر نقش سازمانی

در پروژه فعلا دو مفهوم وجود دارد:

### نقش سازمانی

- فیلد: `profiles.role_id`
- مرجع: `org_roles`
- کاربرد: permission، team membership، assignment به نقش

### نقش نرم‌افزاری

- فیلد: `profiles.role`
- کاربرد فعلی: نمایش/legacy compatibility
- rule:
  منطق business و permission نباید روی `profiles.role` سوار شود.

اگر در آینده فرصت refactor بود، `profiles.role` باید فقط یک display/legacy field بماند یا به‌تدریج از منطق عملیاتی حذف شود.

## قاعده‌ی `assignee`

### نکته مهم

`assignee` در UI یک فیلد سیستمی/سراسری است و عمدا در config ماژول‌ها تعریف نشده است.

اما ذخیره‌سازی آن فقط وقتی باید فعال شود که جدول ماژول این سه فیلد را داشته باشد:

- `assignee_id`
- `assignee_type`
- `assignee_role_id`

### قرارداد ذخیره‌سازی

#### ارجاع به کاربر

- `assignee_type = 'user'`
- `assignee_id = profiles.id`
- `assignee_role_id = null`

#### ارجاع به نقش

- `assignee_type = 'role'`
- `assignee_role_id = org_roles.id`
- `assignee_id = null`

### نکته سازگاری

بعضی بخش‌های قدیمی هنوز role assignment را از `assignee_id` هم fallback می‌خوانند. این فقط برای compatibility است، نه قرارداد نهایی.

## ماژول‌های فعلی که assignee سیستمی دارند

منطق مرکزی فعلی در:

- [utils/assigneeSupport.ts](/d:/Kalamapp/utils/assigneeSupport.ts)

ماژول‌های فعلی:

- `products`
- `product_bundles`
- `production_orders`
- `invoices`
- `purchase_invoices`
- `tasks`
- `attendance_logs`
- `customers`

## اگر در آینده برای ماژول جدید assignee خواستی

ترتیب درست این است:

1. در دیتابیس migration additive بزن:
   - `assignee_id`
   - `assignee_type`
   - `assignee_role_id`
2. index مناسب اضافه کن.
3. ماژول را به [utils/assigneeSupport.ts](/d:/Kalamapp/utils/assigneeSupport.ts) اضافه کن.
4. اگر import دارد، mapping آن را هم‌راستا کن.
5. اگر notifications یا automation روی آن ماژول کار می‌کند، queryهای assigned record را هم تست کن.

## تغییرات انجام‌شده تا این لحظه

- pagination جدول لیست به Refine وصل شد.
- grid list دکمه‌ی «مشاهده بیشتر» گرفت و responsive شد.
- refetch شبیه refresh هنگام برگشت به تب مهار شد.
- bootstrap cache برای user/profile/permissions اضافه شد.
- lookup cache برای `dynamic_options` و assignee directory اضافه شد.
- print dependencies به lazy-load منتقل شدند.
- `product_bundles` برای role assignee هم‌راستا شد.
- migration جدید برای یکدست‌سازی `assignee_role_id` در ماژول‌های assigneeدار اضافه شد.

## نکات مهم برای ادامه‌ی وایب‌کدینگ

- اگر خواستی چیزی را سریع درست کنی، مستقیم `profiles.role` را مبنای permission نگذار.
- برای assignment گروهی، همیشه `org_roles.id` را ذخیره کن، نه title.
- اگر یک صفحه کند شد، اول بررسی کن:
  - آیا `auth.getUser()` تکراری دارد؟
  - آیا `dynamic_options` تکراری می‌زند؟
  - آیا `profiles/org_roles` را با `select('*')` می‌خواند؟
- قبل از اینکه `assignee` را در یک ماژول جدید visible کنی، اول migration آن جدول را کامل کن.
- برای جلوگیری از drift، منطق assignee را از [utils/assigneeSupport.ts](/d:/Kalamapp/utils/assigneeSupport.ts) بخوان، نه از setهای پراکنده.
