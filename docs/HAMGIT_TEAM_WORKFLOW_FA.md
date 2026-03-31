# راهنمای عملی کار تیمی با Hamgit و Deploy مستقیم

**وضعیت هدف**

- اینترنت بین‌الملل در دسترس نیست.
- تیم چندنفره روی یک پروژه مشترک کار می‌کند.
- Deploy مستقیم به سرور از قبل با اسکریپت پروژه انجام می‌شود.
- هدف این است که Git فقط برای همکاری تیمی و کنترل نسخه استفاده شود، نه برای Deploy خودکار.

## 1) تصمیم تیمی که باید ثابت بماند

این ruleها را از اول برای همه یکسان نگه دارید:

- مخزن مرکزی تیم: `Hamgit`
- branch اصلی قابل استقرار: `main`
- هیچ‌کس مستقیم روی `main` کار نکند
- مدل ساده فعلی تیم:
  - `feature/current` برای قابلیت‌های جدید
  - `fix/current` برای رفع باگ‌ها
- merge فقط بعد از review
- deploy فقط از روی `main`
- deploy فقط توسط یک نفر مشخص انجام شود
- هر deploy با `tag` ثبت شود

اگر این ruleها ثابت نباشند، مشکل اصلی شما GitHub یا Hamgit نیست؛ مشکل، شلوغ شدن merge و deploy اشتباه است.

### نکته مهم درباره مدل ساده

این مدل برای ساده‌سازی انتخاب شده، نه برای بهترین ایزوله‌سازی.

trade-off آن این است:

- اگر دو نفر همزمان روی `feature/current` کار کنند، احتمال conflict بالا می‌رود
- اگر commitها بزرگ شوند، review و rollback سخت‌تر می‌شود

پس این مدل فقط وقتی قابل مدیریت است که:

- تیم قبل از شروع کار pull بگیرد
- commitها کوچک بمانند
- MRها زودبه‌زود به `main` merge شوند

## 2) مرحله اول: کارهایی که فقط یک‌بار باید انجام شود

این بخش را مسئول اصلی پروژه انجام می‌دهد.

### 2.1) ساختن repository در Hamgit

1. داخل Hamgit یک repository جدید بساز.
2. اگر پروژه private است، repo را private نگه دار.
3. اسم repo را تا حد ممکن نزدیک به اسم فعلی پروژه بگذار.

### 2.2) اضافه کردن SSH key

روی سیستم هر نفر:

```powershell
ssh-keygen -t ed25519 -C "your-email@example.com"
```

اگر پرسید فایل کجا ذخیره شود، Enter بزن تا روی مسیر پیش‌فرض ذخیره شود.

برای دیدن public key:

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

محتوای این فایل را در Hamgit داخل بخش SSH Keys ثبت کن.

### 2.3) وصل کردن پروژه فعلی به Hamgit

اگر الان `origin` روی GitHub است و می‌خواهی آن را نگه داری:

```powershell
git remote rename origin github
git remote add origin <HAMGIT_SSH_URL>
git remote -v
```

اگر remote جدید را می‌خواهی با اسم جدا نگه داری:

```powershell
git remote add hamgit <HAMGIT_SSH_URL>
git remote -v
```

پیشنهاد عملی: `Hamgit` را `origin` بگذار تا VSCode و push روزمره ساده بماند.

### 2.4) ارسال branchها و tagها

```powershell
git push -u origin main
git push origin --all
git push origin --tags
```

اگر branch اصلی شما `master` است، به‌جای `main` همان را بزن.

### 2.5) تنظیم دسترسی‌های تیم

برای تیم این ruleها را اعمال کن:

- `main` باید protected باشد
- push مستقیم به `main` بسته باشد
- merge request لازم باشد
- حداقل یک review لازم باشد

اگر بعضی از این تنظیمات در پلن فعلی Hamgit در دسترس نبود، rule را به‌صورت تیمی enforce کنید.

## 3) مرحله دوم: کاری که هر همکار باید فقط یک‌بار انجام دهد

این بخش را می‌توانی دقیقا برای همکارت بفرستی.

### 3.1) clone پروژه

```powershell
git clone <HAMGIT_SSH_URL>
cd Kalamapp
```

### 3.2) تنظیم نام و ایمیل Git

اگر قبلا تنظیم نشده:

```powershell
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

### 3.3) گرفتن آخرین وضعیت

```powershell
git checkout main
git pull origin main
```

### 3.4) فایل‌های env محلی

هر نفر باید envهای محلی خودش را مستقل تنظیم کند. فایل‌های حساس نباید commit شوند.

نمونه:

- `.env.local`
- `.env.deploy`

## 4) workflow روزانه هر نفر

این بخش، روال استاندارد روزانه تیم است.

### 4.1) قبل از شروع هر task

برای feature:

```powershell
git checkout feature/current
git pull origin feature/current
```

برای bug fix:

```powershell
git checkout fix/current
git pull origin fix/current
```

اگر این branchها هنوز ساخته نشده‌اند، یک‌بار این‌ها را بزنید:

```powershell
git checkout main
git pull origin main
git checkout -b feature/current
git push -u origin feature/current
```

```powershell
git checkout main
git pull origin main
git checkout -b fix/current
git push -u origin fix/current
```

### 4.2) حین کار

commitها را کوچک و معنی‌دار نگه دار:

```powershell
git add .
git commit -m "feat: add workflow execution mode"
```

پیشنهاد:

- هر task چند commit کوچک داشته باشد
- commit با پیام مبهم مثل `update` یا `fix stuff` نزنید

### 4.3) ارسال branch

برای feature:

```powershell
git checkout feature/current
git push
```

برای fix:

```powershell
git checkout fix/current
git push
```

### 4.4) قبل از merge

branch مشترک را با `main` sync کن:

برای feature:

```powershell
git checkout main
git pull origin main
git checkout feature/current
git merge main
git push
```

برای fix:

```powershell
git checkout main
git pull origin main
git checkout fix/current
git merge main
git push
```

اگر conflict داشتی، همان‌جا حل کن و دوباره push بزن.

### 4.5) ساختن Merge Request

بعد از push:

1. داخل Hamgit یک Merge Request به `main` بساز
2. توضیح کوتاه بنویس:
   - چه چیزی تغییر کرده
   - ریسک چیست
   - آیا migration دارد یا نه
   - آیا deploy خاصی لازم دارد یا نه

در این مدل ساده:

- source branch برای قابلیت جدید: `feature/current`
- source branch برای رفع باگ: `fix/current`

## 5) ruleهای review و merge

قبل از merge این 5 مورد باید چک شود:

1. branch روی `main` merge می‌شود، نه روی branch دیگر
2. conflict حل شده
3. اگر migration دارد، ترتیب migrationها درست است
4. env secret داخل commit نرفته باشد
5. deploy impact مشخص باشد

بعد از تایید:

- فقط branch مربوطه merge شود
- چون branchها shared هستند، حذفشان نکنید
- بعد از merge، branch مشترک را دوباره با `main` sync کنید

## 6) ruleهای مخصوص migration دیتابیس

برای این پروژه این بخش مهم است.

### 6.1) rule اصلی

- هر migration در فایل جدا
- فایل migration قبلی را rewrite نکنید مگر واقعا ناچار باشید
- دو نفر روی یک migration file همزمان کار نکنند

### 6.2) naming

همان الگوی فعلی پروژه را نگه دارید:

```text
database_v1_phase57_some_change.sql
```

### 6.3) داخل Merge Request حتما مشخص شود

- migration جدید اضافه شده یا نه
- backward compatible هست یا نه
- نیاز به اجرای دستی دارد یا نه

### 6.4) ریسک مهم

بدترین حالت این است که:

- کد frontend merge شود
- migration لازم اجرا نشود

در این حالت اپ در production ممکن است نیمه‌خراب بالا بیاید.

پس برای هر MR که migration دارد، reviewer باید واضح بنویسد:

`Migration required before/with deploy`

## 7) ruleهای deploy

چون deploy مستقیم به سرور از قبل در پروژه وجود دارد، پیشنهاد این workflow است:

- Git برای همکاری تیمی
- deploy با اسکریپت پروژه
- فقط از روی `main`
- فقط توسط یک نفر مسئول

### 7.1) مسئول deploy چه کار کند

1. آخرین `main` را بگیرد
2. اگر migration لازم است، اول آن را اجرا کند
3. build/deploy را از روی همان commit انجام دهد
4. بعد از deploy یک tag بزند

### 7.2) مراحل دقیق deploy

```powershell
git checkout main
git pull origin main
npm run deploy:prod
```

بعد از deploy موفق:

```powershell
git tag vYYYY.MM.DD-HHMM
git push origin --tags
```

نمونه:

```powershell
git tag v2026.03.30-0215
git push origin --tags
```

اگر نسخه‌بندی semantic می‌خواهید:

```powershell
git tag v1.4.0
git push origin --tags
```

### 7.3) rule مهم

هیچ‌کس از branch شخصی deploy نکند.

فقط این دو حالت مجاز است:

- deploy از `main`
- rollback به tag قبلی

## 8) rollback

اگر deploy مشکل داشت:

1. commit/tag قبلی سالم را مشخص کن
2. همان نسخه را دوباره deploy کن یا روی سرور rollback کن

اگر deploy بر اساس کد محلی انجام می‌دهی، بهتر است rollback هم بر اساس tag باشد:

```powershell
git checkout tags/v2026.03.30-0215
npm run deploy:prod
```

پیشنهاد بهتر برای rollback تمیز:

- همیشه قبل از deploy tag بزن یا
- بلافاصله بعد از deploy موفق tag را ثبت کن

## 9) backup پیشنهادی

برای کاهش ریسک، فقط به یک remote اکتفا نکن.

پیشنهاد:

- remote اصلی: `Hamgit`
- backup دوره‌ای: `git bundle`

نمونه:

```powershell
git bundle create kalamapp-backup.bundle --all
```

این فایل را روی یک سیستم یا فضای ذخیره‌سازی دیگر نگه دار.

اگر بعدا اینترنت برگشت، می‌توانی GitHub را هم به‌عنوان mirror نگه داری.

## 10) کار با VSCode

VSCode همچنان قابل استفاده است. فقط remote از GitHub به Hamgit تغییر می‌کند.

روال عادی:

1. Source Control را باز کن
2. فایل‌ها را stage کن
3. commit message بنویس
4. commit کن
5. push کن

اما برای کارهای مهم‌تر بهتر است از ترمینال استفاده شود:

- ساخت branch
- sync با `main`
- tag زدن
- merge conflict

دلیلش این است که commandها شفاف‌تر و قابل تکرارتر هستند.

## 11) متن کوتاه برای فرستادن به همکار

این متن را می‌توانی مستقیم برای همکار بفرستی:

1. از Hamgit پروژه را clone کن.
2. روی سیستم خودت SSH key بساز و public key را بده تا در Hamgit ثبت شود.
3. همیشه قبل از شروع کار:
   - `git checkout main`
   - `git pull origin main`
4. برای هر task یک branch جدا بساز:
   - `git checkout -b feature/<name>`
5. commitهای کوچک و واضح بزن.
6. branch را push کن.
7. Merge Request به `main` باز کن.
8. مستقیم روی `main` کار نکن.
9. اگر migration دیتابیس داری، در MR واضح اعلام کن.
10. deploy فقط توسط مسئول deploy و فقط از روی `main` انجام می‌شود.

## 12) جمع‌بندی نهایی

مدل پیشنهادی این است:

- همکاری تیمی روی `Hamgit`
- توسعه روی branchهای جدا
- merge کنترل‌شده به `main`
- deploy مستقیم با اسکریپت پروژه
- tag برای هر نسخه deploy شده

این مدل در شرایط فعلی ساده، کم‌ریسک و قابل اجراست و بدون وابستگی به GitHub کار می‌کند.
