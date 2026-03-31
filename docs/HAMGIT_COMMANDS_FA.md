# راهنمای خیلی عملی Hamgit و Git برای تیم

این فایل یک cheat sheet سریع است. اگر فقط بخواهی بدانی برای هر کار چه دستوری باید بزنی، از همین فایل استفاده کن.

## 0) مدل ساده‌شده‌ای که در این پروژه استفاده می‌کنیم

برای ساده نگه داشتن کار تیمی، فعلا فقط این branchها را داریم:

- `main` برای نسخه قابل deploy
- `feature/current` برای توسعه قابلیت‌های جدید
- `fix/current` برای رفع باگ‌ها و اصلاحات

این مدل ساده است، ولی یک trade-off مهم دارد:

- اگر چند نفر همزمان روی یک branch مشترک کار کنند، احتمال conflict و قاطی شدن commitها بالا می‌رود.

پس این 4 rule را جدی بگیرید:

- مستقیم روی `main` کار نکن
- قبل از شروع هر کار، branch مشترک را pull کن
- commitها را کوچک و با پیام واضح بزن
- قبل از Merge Request، branch مشترک را با `main` sync کن

## 1) یک‌بار برای همیشه: clone و آماده‌سازی

### clone از Hamgit

```powershell
git clone git@hamgit.ir:fj.lyric/kalamapp.git
cd kalamapp
```

### تنظیم نام و ایمیل Git

```powershell
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

### تست SSH

```powershell
ssh -T git@hamgit.ir
```

## 2) شروع کار جدید

### برای قابلیت جدید

```powershell
git checkout feature/current
git pull origin feature/current
```

اگر branch هنوز روی سیستم یا remote ساخته نشده:

```powershell
git checkout main
git pull origin main
git checkout -b feature/current
git push -u origin feature/current
```

### برای رفع باگ

```powershell
git checkout fix/current
git pull origin fix/current
```

اگر branch هنوز روی سیستم یا remote ساخته نشده:

```powershell
git checkout main
git pull origin main
git checkout -b fix/current
git push -u origin fix/current
```

## 3) دیدن وضعیت فایل‌ها

```powershell
git status
git status --short
```

## 4) ثبت تغییرات

### ثبت همه فایل‌های لازم

```powershell
git add .
git commit -m "feat: add workflow execution mode"
```

### اگر فقط بعضی فایل‌ها را می‌خواهی commit کنی

```powershell
git add path/to/file1 path/to/file2
git commit -m "fix: update selected files"
```

## 5) ارسال branch به Hamgit

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

اگر اولین بار است که branch را می‌فرستی:

```powershell
git push -u origin feature/current
git push -u origin fix/current
```

## 6) قبل از Merge Request

### اگر می‌خواهی featureها را merge کنی

```powershell
git checkout main
git pull origin main
git checkout feature/current
git merge main
git push
```

### اگر می‌خواهی fixها را merge کنی

```powershell
git checkout main
git pull origin main
git checkout fix/current
git merge main
git push
```

اگر conflict داشتی:

1. فایل conflict را حل کن
2. فایل را add کن
3. commit بزن

```powershell
git add .
git commit -m "chore: resolve merge conflicts"
git push
```

## 7) بعد از merge شدن branch

در این مدل branchها را بعد از هر merge حذف نمی‌کنیم، چون branchها shared هستند.

بعد از merge شدن به `main` این کار را بکن:

### اگر MR از `feature/current` به `main` بوده

```powershell
git checkout feature/current
git pull origin feature/current
git checkout main
git pull origin main
git checkout feature/current
git merge main
git push
```

### اگر MR از `fix/current` به `main` بوده

```powershell
git checkout fix/current
git pull origin fix/current
git checkout main
git pull origin main
git checkout fix/current
git merge main
git push
```

## 8) deploy

deploy فقط از روی `main`:

```powershell
git checkout main
git pull origin main
npm run deploy:prod
```

اگر لازم است بعد از deploy tag بزنی:

```powershell
git tag v2026.03.30-0215
git push origin --tags
```

## 9) برای باگ فوری production

اگر نمی‌خواهی branch جدید بسازی، همان `fix/current` را استفاده کن:

```powershell
git checkout fix/current
git pull origin fix/current
```

بعد از fix:

```powershell
git add .
git commit -m "fix: resolve production issue"
git push
```

بعد برای `fix/current` یک MR به `main` باز کن.

## 10) اگر لازم شد از GitHub هم backup بگیری

دیدن remoteها:

```powershell
git remote -v
```

Push به GitHub backup:

```powershell
git push github main
git push github --tags
```

## 11) اگر لازم شد repo backup بگیری

```powershell
git bundle create kalamapp-backup.bundle --all
```

## 12) کارهایی که در VSCode Source Control خوب است

- دیدن فایل‌های تغییر کرده
- stage / unstage فایل‌ها
- نوشتن commit message
- commit
- push ساده روی branchی که از قبل upstream دارد
- pull ساده

## 13) کارهایی که بهتر است از ترمینال انجام شوند

- ساخت branch جدید
- تغییر remote
- push اول branch با `-u`
- merge با `main`
- حل conflict
- tag زدن
- force push
- کارهای مرتبط با backup و bundle
- deploy

## 14) ruleهای سریع تیم

- مستقیم روی `main` کار نکن
- برای feature فقط روی `feature/current` کار کن
- برای bugfix فقط روی `fix/current` کار کن
- قبل از شروع، branch مشترک را pull کن
- قبل از MR با `main` sync کن
- اگر migration داری، داخل MR واضح اعلام کن
- deploy فقط از `main`
- فایل‌های کلید و secret را commit نکن

## 15) 5 دستور اصلی که هر روز لازم داری

### شروع کار feature

```powershell
git checkout feature/current
git pull origin feature/current
```

### شروع کار bugfix

```powershell
git checkout fix/current
git pull origin fix/current
```

### ثبت تغییرات

```powershell
git add .
git commit -m "feat: short message"
git push
```

### قبل از MR

```powershell
git checkout main
git pull origin main
git checkout feature/current
git merge main
git push
```

### deploy

```powershell
git checkout main
git pull origin main
npm run deploy:prod
```
