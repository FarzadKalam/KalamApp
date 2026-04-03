# راه‌اندازی Storage پارس‌پک برای Supabase Self-Hosted

این پروژه در فرانت فایل‌ها را از طریق `supabase-js` آپلود می‌کند. یعنی فرانت مستقیم به S3 پارس‌پک وصل نمی‌شود؛ فرانت به `storage-api` خود Supabase وصل می‌شود و خود `storage-api` فایل را داخل S3-compatible storage پارس‌پک می‌نویسد.

## معماری نهایی

- اپ فرانت: `VITE_SUPABASE_URL`
- Supabase self-hosted روی سرور: `auth`, `rest`, `storage`, `db`
- Object storage: سرویس S3-compatible پارس‌پک

پس کار اصلی روی سرور self-hosted انجام می‌شود، نه داخل کد فرانت.

## وضعیت فعلی این پروژه

- کد فرانت آماده است و برای آپلود از [`utils/storageClient.ts`](/d:/Kalamapp/utils/storageClient.ts) استفاده می‌کند.
- سرویس `storage` در [`docker-compose.yml`](/d:/Kalamapp/docker-compose.yml) از متغیرهای S3 پشتیبانی می‌کند.
- مشکل نیمه‌تمام قبلی این بوده که نمونه env هنوز `STORAGE_BACKEND=file` داشته و باعث ابهام می‌شده است.

## تنظیمات لازم روی سرور

در فایل env مربوط به استقرار Supabase self-hosted این مقادیر را ست کنید:

```env
STORAGE_BACKEND=s3
STORAGE_TENANT_ID=
GLOBAL_S3_BUCKET=images
GLOBAL_S3_ENDPOINT=https://your-parspack-s3-endpoint
GLOBAL_S3_PROTOCOL=https
GLOBAL_S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=your_parspack_access_key
AWS_SECRET_ACCESS_KEY=your_parspack_secret_key
REGION=local
```

نکته‌ها:

- `GLOBAL_S3_BUCKET` باید از قبل در پارس‌پک ساخته شده باشد.
- `GLOBAL_S3_ENDPOINT` باید بدون مسیر اضافه باشد؛ فقط endpoint اصلی.
- `GLOBAL_S3_FORCE_PATH_STYLE=true` برای اغلب providerهای S3-compatible لازم است.
- در این پروژه، `docker-compose.yml` از `AWS_ACCESS_KEY_ID` و `AWS_SECRET_ACCESS_KEY` استفاده می‌کند، نه `S3_PROTOCOL_ACCESS_KEY_ID`.
- برای استقرار single-tenant معمولاً `STORAGE_TENANT_ID` خالی می‌ماند مگر این‌که عمداً tenant جدا تعریف کرده باشید.

## بخش مرتبط در Docker Compose

در [`docker-compose.yml`](/d:/Kalamapp/docker-compose.yml#L244) سرویس `storage` همین متغیرها را می‌خواند:

- `STORAGE_BACKEND`
- `GLOBAL_S3_BUCKET`
- `GLOBAL_S3_ENDPOINT`
- `GLOBAL_S3_PROTOCOL`
- `GLOBAL_S3_FORCE_PATH_STYLE`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `REGION`

در نتیجه اگر env درست باشد، معمولاً نیاز به تغییر کد compose نیست.

## کارهایی که باید داخل Supabase انجام شوند

1. bucket مورد استفاده را مشخص کنید.
2. اگر bucket به اسم `images` ندارید، یا همین bucket را در پارس‌پک بسازید یا `GLOBAL_S3_BUCKET` و `VITE_FILE_STORAGE_BUCKET` را با اسم واقعی هماهنگ کنید.
3. در metadata دیتابیس Supabase هم bucket باید وجود داشته باشد. اگر در Studio بخش Storage bucket را ساخته‌اید، همان را نگه دارید.

نکته مهم:

- Supabase فقط فایل را در S3 ذخیره نمی‌کند؛ metadata فایل و bucketها را هم داخل PostgreSQL خودش نگه می‌دارد.
- پس اگر bucket فقط در پارس‌پک وجود داشته باشد ولی در Storage بخش Supabase تعریف نشده باشد، آپلود ممکن است fail شود.

## تنظیمات فرانت

در اکثر حالت‌ها فرانت نیاز به تغییر ندارد و همین کافی است:

```env
VITE_SUPABASE_URL=https://api.kalamapp.ir
VITE_SUPABASE_ANON_KEY=...
```

چون فایل‌ها از همین Supabase project آپلود می‌شوند.

متغیرهای زیر فقط وقتی لازم‌اند که بخواهید فایل‌ها از یک Supabase project جدا آپلود شوند:

```env
VITE_FILE_STORAGE_URL=
VITE_FILE_STORAGE_ANON_KEY=
VITE_FILE_STORAGE_BUCKET=images
```

در این پروژه اگر این متغیرها خالی باشند، `fileStorageClient` به همان `supabase` اصلی fallback می‌کند.

## ترتیب اجرای درست

1. در پارس‌پک bucket بسازید.
2. env سرور Supabase را با مقادیر S3 کامل کنید.
3. سرویس `storage` را recreate/restart کنید.
4. لاگ `storage` را چک کنید تا خطای auth/endpoint نداشته باشد.
5. در Supabase Studio مطمئن شوید bucket موردنظر در بخش Storage وجود دارد.
6. یک فایل تستی از UI پروژه آپلود کنید.

## نمونه دستور روی سرور

اگر فایل env کنار `docker-compose.yml` قرار دارد:

```bash
docker compose up -d storage imgproxy
docker compose logs -f storage
```

اگر لازم بود container با env جدید از نو recreate شود:

```bash
docker compose up -d --force-recreate storage imgproxy
docker compose ps
docker compose logs --tail=200 storage
```

اگر bucket را در Supabase Studio قبلاً نساخته‌اید، اول آن را در بخش Storage بسازید و بعد تست آپلود بگیرید.

## چک سریع بعد از استقرار

- آپلود فایل از UI خطای `uploadError` ندهد.
- URL عمومی از `getPublicUrl(...)` ساخته شود.
- ردیف مربوطه داخل جدول `record_files` ثبت شود.
- آبجکت واقعاً داخل bucket پارس‌پک دیده شود.

## خطاهای رایج

### فایل در دیتابیس ثبت می‌شود ولی داخل S3 نمی‌رود

معمولاً یکی از این موارد است:

- `STORAGE_BACKEND` هنوز `file` است.
- endpoint اشتباه است.
- access key / secret key اشتباه است.
- bucket نامعتبر است یا وجود ندارد.

### URL عمومی ساخته می‌شود ولی فایل باز نمی‌شود

معمولاً یکی از این موارد است:

- bucket private است و policy/public access درست تنظیم نشده.
- آدرس public از لایه Supabase درست می‌شود ولی object در backend به‌درستی ذخیره نشده.

### آپلود از UI fail می‌شود

این فایل‌ها را بررسی کنید:

- [`components/SmartFieldRenderer.tsx`](/d:/Kalamapp/components/SmartFieldRenderer.tsx#L842)
- [`components/RecordFilesManager.tsx`](/d:/Kalamapp/components/RecordFilesManager.tsx#L222)
- [`utils/storageClient.ts`](/d:/Kalamapp/utils/storageClient.ts)

## نتیجه

برای این پروژه، مهاجرت به پارس‌پک S3 یعنی:

- فرانت همان Supabase client فعلی را نگه می‌دارد.
- storage backend روی سرور از `file` به `s3` تغییر می‌کند.
- bucket و credentialهای پارس‌پک در env سرور تنظیم می‌شوند.
- bucket در لایه Storage متادیتای Supabase هم باید وجود داشته باشد.

HAR را نگاه کردم. آخرین آپلود در `2026-04-01T20:55:16Z` انجام شده و این request fail شده:

`POST https://api.kalamapp.ir/storage/v1/object/images/record_files/products/.../1775076916370_x2ruoz_hamid.png`

پاسخ دقیق سرور این بوده:

```json
{"statusCode":"403","error":"Access Denied.","message":"AccessDenied"}
```

نتیجه:
این خطا از فرانت یا CORS نیست. `OPTIONS` روی همان URL با `200` جواب داده و خود `storage-api` هم request را گرفته، بعد موقع نوشتن در S3 پارس‌پک از backend جواب `AccessDenied` گرفته. یعنی مشکل اصلی روی تنظیمات S3/سرور است.

محتمل‌ترین علت‌ها:
- `GLOBAL_S3_BUCKET` با bucket واقعی پارس‌پک یکی نیست.
- access key / secret key معتبرند ولی permission نوشتن ندارند.
- bucket وجود دارد ولی key به آن bucket دسترسی `PutObject` ندارد.
- env جدید فقط edit شده ولی container `storage` با `--force-recreate` بالا نیامده.
- bucket داخل Supabase اسمش `images` است ولی bucket فیزیکی پارس‌پک چیز دیگری مثل `kalamapp-file` است و env اشتباه روی `images` مانده.

چیزی که الان باید چک کنی:
1. روی سرور مقدارهای `STORAGE_BACKEND`, `GLOBAL_S3_BUCKET`, `GLOBAL_S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `REGION` را دوباره چک کن.
2. اگر bucket فیزیکی پارس‌پک `images` نیست، `GLOBAL_S3_BUCKET` را اسم واقعی bucket بگذار.
3. سرویس را واقعاً recreate کن:
```bash
docker compose up -d --force-recreate storage imgproxy
docker compose logs --tail=200 storage
```
4. در لاگ همان لحظه آپلود باید خطایی شبیه `AccessDenied` از S3 ببینی.
5. در پارس‌پک مطمئن شو key دسترسی `PutObject`, `GetObject`, `DeleteObject`, `ListBucket` برای همان bucket دارد.

یک نکته فرعی هم هست:
در HAR هدر `Authorization: Bearer ...` روی request آپلود دیده نمی‌شود و فقط `apikey` هست. این فعلاً علت خطای فعلی نیست، چون خطا از S3 آمده؛ ولی بعد از حل S3 اگر bucket policy داخل Supabase محدود باشد، ممکن است به خطای auth هم برسی.

اگر خواستی، همین الان block مربوط به storage از `.env` سرور را بدون secret واقعی بفرست:
- `STORAGE_BACKEND`
- `GLOBAL_S3_BUCKET`
- `GLOBAL_S3_ENDPOINT`
- `GLOBAL_S3_FORCE_PATH_STYLE`
- `REGION`

من همان‌جا می‌گویم کدام مقدار مشکوک است.