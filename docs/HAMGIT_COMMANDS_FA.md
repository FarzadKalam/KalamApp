# راهنمای خیلی عملی Hamgit و Git برای تیم

این فایل یک cheat sheet سریع است. اگر فقط بخواهی بدانی برای هر کار چه دستوری باید بزنی، از همین فایل استفاده کن.

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

## 2) شروع هر کار جدید

همیشه از `main` شروع کن:

```powershell
git checkout main
git pull origin main
git checkout -b feature/<task-name>
```

مثال:

```powershell
git checkout -b feature/workflow-execution-mode
```

برای bug fix:

```powershell
git checkout main
git pull origin main
git checkout -b fix/<task-name>
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

```powershell
git push -u origin feature/<task-name>
```

بعد از بار اول، pushهای بعدی فقط:

```powershell
git push
```

## 6) قبل از Merge Request

branch خودت را با `main` sync کن:

```powershell
git checkout main
git pull origin main
git checkout feature/<task-name>
git merge main
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

### پاک کردن branch محلی

```powershell
git checkout main
git pull origin main
git branch -d feature/<task-name>
```

### پاک کردن branch روی remote در صورت نیاز

```powershell
git push origin --delete feature/<task-name>
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

## 9) ساخت hotfix

```powershell
git checkout main
git pull origin main
git checkout -b hotfix/<task-name>
```

بعد از fix:

```powershell
git add .
git commit -m "fix: resolve production issue"
git push -u origin hotfix/<task-name>
```

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
- هر task روی branch جدا
- قبل از شروع، `main` را pull کن
- قبل از MR با `main` sync کن
- اگر migration داری، داخل MR واضح اعلام کن
- deploy فقط از `main`
- فایل‌های کلید و secret را commit نکن
