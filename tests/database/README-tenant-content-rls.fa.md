# آزمون یکپارچهٔ جداسازی tenant و انتشار دستی

این آزمون روی PostgreSQL واقعی اجرا می‌شود، اما یک schema پایهٔ حداقلی و stub برای `auth.uid()`, `auth.role()` و `current_org_id()` می‌سازد. آن را فقط روی یک دیتابیس محلی و دورریختنی اجرا کنید؛ برای production، staging مشترک یا دیتابیس زرافشان مناسب نیست.

برای sync تصویر در Edge Function، origin مربوط به `SUPABASE_URL` به‌طور پیش‌فرض مجاز است. اگر فایل‌منیجر از CDN دیگری استفاده می‌کند، متغیر غیرمحرمانهٔ `PRODUCT_CONTENT_IMAGE_ALLOWED_ORIGINS` را با originهای دقیق HTTPS و جداشده با کاما تنظیم کنید؛ hostnameهای بیرون از این فهرست رد می‌شوند. توضیح خالی هم عمداً به WooCommerce ارسال نمی‌شود تا متن فعلی فروشگاه پاک نشود.

از ریشهٔ مخزن، یک پایگاه دادهٔ آزمایشی بسازید. چون ممکن است کاربر PostgreSQL به مسیر خانهٔ مخزن دسترسی نداشته باشد، فایل‌ها را موقتاً به `/tmp` کپی کنید:

```bash
sudo -u postgres createdb kalam_feature_rls_test
mkdir -p /tmp/kalam-rls-files
cp tests/database/tenant-content-rls.integration.setup.sql \
   tests/database/tenant-content-rls.integration.test.sql \
   database_v1_phase589_external_sync_history.sql \
   database_v1_phase590_tenant_site_builder.sql \
   database_v1_phase591_product_site_content_drafts.sql \
   database_v1_phase592_woo_import_outcome.sql /tmp/kalam-rls-files/
```

سپس ترتیب زیر را اجرا کنید:

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 -P pager=off -d kalam_feature_rls_test \
  -f /tmp/kalam-rls-files/tenant-content-rls.integration.setup.sql
for f in \
  database_v1_phase589_external_sync_history.sql \
  database_v1_phase590_tenant_site_builder.sql \
  database_v1_phase591_product_site_content_drafts.sql \
  database_v1_phase592_woo_import_outcome.sql; do
  sudo -u postgres psql -v ON_ERROR_STOP=1 -P pager=off -d kalam_feature_rls_test \
    -f "/tmp/kalam-rls-files/$f"
done
sudo -u postgres psql -v ON_ERROR_STOP=1 -P pager=off -d kalam_feature_rls_test \
  -f /tmp/kalam-rls-files/tenant-content-rls.integration.test.sql
```

موفقیت باید با این پیام پایان یابد:

```text
PASS: local PostgreSQL RLS/manual publish/outcome integration assertions
```

آزمون دو tenant مجزا را می‌سازد و این موارد را بررسی می‌کند: خواندن و نوشتن tenant مقابل، جلوگیری از دسترسی به صفحه و محتوای محصول سازمان دیگر، عدم نمایش صفحهٔ پیش‌نویس به کاربر ناشناس، باقی‌ماندن نسخهٔ منتشرشده تا انتشار دستی بعدی، ردکردن URLهای `//` و backslash، ثبت تاریخچه فقط توسط سرویس، و نتیجهٔ اتمیک `created`، سپس `skipped` و `updated` برای سفارش ووکامرس.

برای حذف دیتابیس موقت پس از پایان:

```bash
sudo -u postgres dropdb kalam_feature_rls_test
```

این harness منطق PostgreSQL و policyهای migration را در یک محیط محلی با نقش‌های پایهٔ شبیه Supabase می‌آزماید؛ جایگزین آزمون نهایی با تنظیمات واقعی staging نیست.
