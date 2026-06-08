# راهنمای کامل SEO — تازه سیستم

**آخرین بروزرسانی:** ۱۴۰۵/۰۳/۱۸  
**نویسنده:** تیم فنی  
**وضعیت زیرساخت فنی:** ✅ پیاده‌سازی شده (فاز ۱۶۴ + فاز Analytics)

---

## فهرست

1. [زیرساخت فنی موجود](#زیرساخت-فنی-موجود)
2. [راه‌اندازی اولیه](#راه‌اندازی-اولیه)
3. [چک‌لیست انتشار هر پست](#چک‌لیست-انتشار-هر-پست)
4. [نگهداری دوره‌ای](#نگهداری-دورهای)
5. [مانیتورینگ و هشدار](#مانیتورینگ-و-هشدار)
6. [SEO برای موتورهای جستجوی هوش مصنوعی](#seo-برای-موتورهای-جستجوی-هوش-مصنوعی)
7. [محدودیت‌های فعلی و راه‌حل‌ها](#محدودیتهای-فعلی-و-راهحلها)

---

## زیرساخت فنی موجود

همه موارد زیر در کد پیاده شده‌اند و نیاز به اقدام مجدد ندارند:

| آیتم | فایل | توضیح |
|------|------|-------|
| JSON-LD schemas | `utils/seoHelpers.ts` | BlogPosting، HowTo، BreadcrumbList، Organization، WebSite |
| Open Graph + Twitter Cards | `components/cms/SeoHead.tsx` | همه صفحات عمومی |
| Sitemap.xml دینامیک | `supabase/functions/sitemap/` | از DB — پست‌های published |
| robots.txt | `public/robots.txt` | با قوانین AI bot |
| llms.txt | `public/llms.txt` | استاندارد ۲۰۲۶ برای AI crawlers |
| GTM Container | `index.html` | متغیر `VITE_GTM_ID` |
| SPA Route Tracking | `App.tsx` → `RouteTracker` | هر route change یک page_view |
| Core Web Vitals | `utils/analytics.ts` → `sendWebVitals()` | CLS، INP، LCP، FCP، TTFB → GA4 |
| SEO Editor پنل | `components/cms/SeoEditor.tsx` | در ادیتور هر پست |

---

## راه‌اندازی اولیه

### مرحله ۱ — Google Tag Manager (یک‌بار)

1. به [tagmanager.google.com](https://tagmanager.google.com) برو
2. **حساب جدید** → نام: TazeSystem → Container URL: `tazesystem.ir` → نوع: Web
3. Container ID را کپی کن (مثل `GTM-ABC1234`)
4. در فایل `.env.local` اضافه کن:
   ```
   VITE_GTM_ID=GTM-ABC1234
   ```
5. Build جدید deploy کن تا GTM فعال شود

---

### مرحله ۲ — Google Analytics 4 (یک‌بار)

1. به [analytics.google.com](https://analytics.google.com) برو
2. **Property جدید** → نام: TazeSystem → تایم‌زون: Iran → ارز: IRR
3. **Data Stream** → Web → URL: `tazesystem.ir`
4. Measurement ID را کپی کن (مثل `G-XXXXXXXXXX`)
5. **در GTM** (داخل dashboard — بدون کد):
   - Tags → New → Google Analytics: GA4 Configuration
   - Measurement ID: `G-XXXXXXXXXX`
   - Trigger: **All Pages**
   - Save → Submit → Publish

---

### مرحله ۳ — Google Search Console (یک‌بار)

1. به [search.google.com/search-console](https://search.google.com/search-console) برو
2. **Add Property** → Domain: `tazesystem.ir`
3. روش تأیید DNS انتخاب کن (پایدارترین روش):
   - یک TXT record به DNS اضافه کن
4. بعد از تأیید:
   - **Sitemaps** → `https://tazesystem.ir/sitemap.xml` → Submit
5. GSC را به GA4 لینک کن:
   - GSC → Settings → Associations → Link to Analytics property

---

### مرحله ۴ — Deploy Edge Function Sitemap

```bash
npm run deploy:function -- --function sitemap
```

یا اگر همه functions را deploy می‌کنی:
```bash
npm run deploy:function:all
```

بعد از deploy، آدرس را تست کن:
```
https://tazesystem.ir/sitemap.xml
```

---

### مرحله ۵ — Bing Webmaster Tools (یک‌بار، ۵ دقیقه)

1. به [bing.com/webmasters](https://bing.com/webmasters) برو
2. **Import from Google Search Console** → یک کلیک
3. Bing همه تنظیمات GSC را import می‌کند

> **چرا مهم است؟** Bing موتور جستجوی Microsoft Copilot، بخشی از Perplexity، و ChatGPT Search است.

---

### مرحله ۶ — IndexNow (برای ایندکس فوری)

IndexNow پروتکلی است که وقتی محتوا publish می‌شود، فوراً به Bing/Yandex اطلاع می‌دهد.

**راه‌اندازی:**
1. یک key یکتا بساز (مثل UUID): `f4e9d1c2b8a7...`
2. فایل `public/[key].txt` بساز که فقط خود key را داشته باشد
3. از Supabase Edge Function یا webhook هنگام publish پست، این request را بفرست:

```
POST https://api.indexnow.org/indexnow
{
  "host": "tazesystem.ir",
  "key": "f4e9d1c2b8a7...",
  "keyLocation": "https://tazesystem.ir/f4e9d1c2b8a7....txt",
  "urlList": ["https://tazesystem.ir/blog/slug-post"]
}
```

> **اولویت:** متوسط — تأثیر اصلی روی Bing، Google sitemap را خودش می‌خواند.

---

### مرحله ۷ — Google Rich Results Test (یک‌بار، تأیید)

بعد از publish اولین پست بلاگ:
1. به [search.google.com/test/rich-results](https://search.google.com/test/rich-results) برو
2. URL صفحه بلاگ را وارد کن
3. باید `Article` schema را معتبر تشخیص دهد
4. برای آموزش‌ها: `HowTo` schema را بررسی کن

---

## چک‌لیست انتشار هر پست

### قبل از Publish

در پنل ادیتور CMS، تب **SEO** را باز کن:

- [ ] **عنوان SEO** نوشته شده — بین ۵۰ تا ۶۰ کاراکتر
- [ ] **توضیح SEO** نوشته شده — بین ۱۲۰ تا ۱۵۸ کاراکتر
- [ ] **کلمه کلیدی اصلی** تعیین شده
- [ ] کلمه کلیدی در عنوان SEO وجود دارد
- [ ] کلمه کلیدی در اولین پاراگراف بدنه مقاله وجود دارد
- [ ] **تصویر cover** آپلود شده (حداقل ۱۲۰۰×۶۳۰ پیکسل)
- [ ] **تصویر OG** تعیین شده (همان cover یا اختصاصی)
- [ ] **Slug** خوانا و کوتاه است (فقط حروف لاتین، خط تیره، اعداد)
- [ ] **خلاصه (Excerpt)** نوشته شده

### بعد از Publish

- [ ] آدرس صفحه را در GSC با **URL Inspection → Request Indexing** درخواست ایندکس بده
- [ ] لینک صفحه را در شبکه‌های اجتماعی به اشتراک بگذار (سیگنال social)
- [ ] اگر مقاله مرتبطی دارد، از آن به این مقاله لینک بده (internal linking)

### قوانین کلی محتوا

| آیتم | حداقل | هدف |
|------|-------|-----|
| طول مقاله | ۸۰۰ کلمه | ۱۵۰۰+ کلمه |
| تصویر | ۱ | ۳-۵ |
| Heading H2 | ۲ | ۴-۶ |
| لینک داخلی | ۱ | ۳-۵ |
| لینک خارجی | ۰ | ۱-۲ |
| زمان مطالعه | — | ۵-۱۰ دقیقه بهتر است |

---

## نگهداری دوره‌ای

### هفتگی (۱۵ دقیقه)

- [ ] GSC → **Coverage** — چک کن index errors جدید نداشته باشیم
- [ ] GSC → **Core Web Vitals** — صفحات Poor چند تا هستند؟
- [ ] GA4 → **Realtime** — ترافیک normal است؟

### ماهانه (۱ ساعت)

- [ ] **GSC → Performance**: کلمات کلیدی جدید که در top 10 آمده‌اند را شناسایی کن — برای آن‌ها محتوا تقویت کن
- [ ] **GA4 → Engagement Rate**: صفحاتی که bounce rate بالاست را بررسی کن
- [ ] **Core Web Vitals audit**: PageSpeed Insights را روی چند صفحه مهم اجرا کن
- [ ] **Sitemap بررسی**: `https://tazesystem.ir/sitemap.xml` — همه پست‌های published هستند؟
- [ ] **Broken links**: یک crawl با Screaming Frog یا `ahrefs.com/broken-link-checker` انجام بده
- [ ] `public/llms.txt` — اگر بخش جدیدی اضافه شد، آپدیت کن

### فصلی (نیم‌روز)

- [ ] **Keyword Research**: با Google Search Console ببین کدام queries CTR پایین دارند — عناوین را بهبود بده
- [ ] **Content Audit**: پست‌های قدیمی‌تر از ۶ ماه — آمار → تصمیم: بروزرسانی یا redirect
- [ ] **Backlink audit**: با Google Search Console → Links → External links — سایت‌های ضعیف را Disavow کن
- [ ] **Schema validation**: Rich Results Test را روی ۵ صفحه مهم اجرا کن
- [ ] `robots.txt` بررسی کن — آیا مسیرهای جدیدی باید block شوند؟

---

## مانیتورینگ و هشدار

### هشدارهایی که باید در GSC فعال کنی

1. GSC → Settings → **Email preferences**:
   - ✅ Coverage issues — هر بار که صفحه‌ای از index حذف شد
   - ✅ Manual actions — اگر Google دستی اقدام کرد
   - ✅ Security issues — هر گونه هک یا malware

### Dashboards در GA4 که باید راه‌اندازی کنی

**Exploration جدید → بساز:**

```
داشبورد ۱: محتوا
  - Metric: Engaged Sessions, Avg Engagement Time
  - Dimension: Page Path
  - Filter: /blog/ یا /learn/

داشبورد ۲: SEO Performance
  - Metric: Users, New Users
  - Dimension: Session Source/Medium
  - Filter: Source = google, Medium = organic

داشبورد ۳: Core Web Vitals
  - Event = web_vitals
  - Custom dimension: metric_name
```

### معیارهای سلامت سایت

| معیار | قابل قبول | هدف ۲۰۲۶ |
|-------|-----------|----------|
| LCP (Largest Contentful Paint) | < ۴s | < ۲.۵s |
| INP (Interaction to Next Paint) | < ۵۰۰ms | < ۲۰۰ms |
| CLS (Cumulative Layout Shift) | < ۰.۲۵ | < ۰.۱ |
| FCP (First Contentful Paint) | < ۳s | < ۱.۸s |
| Indexed Pages | همه published | — |
| GSC Coverage Errors | ۰ | ۰ |

---

## SEO برای موتورهای جستجوی هوش مصنوعی

در ۲۰۲۶، ChatGPT Search، Perplexity، Microsoft Copilot، و Google AI Overviews درصد قابل توجهی از ترافیک محتوا هستند.

### آنچه در کد داریم

- **`public/llms.txt`** — استاندارد جدید که AI crawlers برای درک ساختار سایت استفاده می‌کنند
- **`public/robots.txt`** — `GPTBot`، `Claude-Web`، `PerplexityBot` به `/blog/` و `/learn/` دسترسی دارند
- **JSON-LD schemas** — ماشین‌خوان‌پذیر، مستقل از JS rendering

### اصول محتوا برای AI Search

**۱. پرسش-پاسخ صریح:**
AI engines محتوایی را ترجیح می‌دهند که سوال را در ۲-۳ جمله اول مستقیم پاسخ دهد، بعد توضیح کامل بدهد.

**۲. ساختار واضح:**
- از Heading های H2/H3 منطقی استفاده کن
- لیست‌های numbered و bulleted
- جداول برای مقایسه

**۳. E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness):**
- نام نویسنده + bio در هر پست
- تاریخ نوشتن و آخرین بروزرسانی
- منابع و لینک‌های خارجی معتبر

**۴. `llms.txt` را بروز نگه‌دار:**

```markdown
# TazeSystem
> نرم‌افزار مدیریت سازمانی B2B ایرانی — [توضیح کوتاه بروز]

## بخش‌های اصلی
- /blog — [تعداد پست‌های فعلی] مقاله در حوزه مدیریت
- /learn — [تعداد آموزش‌ها] آموزش کاربردی
...
```

### ابزارهای رایگان برای بررسی AI visibility

- [perplexity.ai](https://perplexity.ai) — جستجوی برند و محصول
- [you.com](https://you.com) — بررسی منابع نمایش داده شده
- ChatGPT Search — جستجوی «نرم‌افزار حسابداری ایران» — آیا تازه سیستم ذکر می‌شود؟

---

## محدودیت‌های فعلی و راه‌حل‌ها

### مشکل اصلی: React SPA و Crawling

**وضعیت:** تازه سیستم یک Single Page Application است. Google می‌تواند JS را اجرا کند اما با تأخیر. اکثر AI crawlers و بعضی botها JS اجرا نمی‌کنند.

**تأثیر:**
- صفحات بلاگ و آموزش شاید به درستی ایندکس نشوند
- زمان ایندکس اولیه کند است
- AI crawlers محتوای واقعی را نمی‌بینند

**گزینه‌های حل:**

| گزینه | پیچیدگی | تأثیر | توضیح |
|-------|---------|-------|-------|
| **Prerender.io** | کم | متوسط | یک proxy — برای botها HTML استاتیک، برای کاربران React |
| **SSG برای /blog و /learn** | متوسط | زیاد | فقط صفحات عمومی static export شوند |
| **Next.js migration** | زیاد | بسیار زیاد | بازنویسی کامل — مناسب نسخه بعدی |

**توصیه فعلی:** Prerender.io (یا Prerender رایگان self-hosted) برای صفحات `/blog/*` و `/learn/*` — حداکثر ۱ روز کار.

---

## خلاصه اولویت‌بندی

### فوری (این هفته)
1. ✅ GTM + GA4 راه‌اندازی کن (مرحله ۱-۲)
2. ✅ Google Search Console verify و sitemap submit (مرحله ۳-۴)
3. ✅ Bing Webmaster Tools import (مرحله ۵)

### کوتاه‌مدت (ماه اول)
4. اولین ۵-۱۰ پست بلاگ با چک‌لیست SEO کامل publish کن
5. Rich Results Test را تأیید کن
6. IndexNow پیاده کن

### میان‌مدت (ماه ۲-۳)
7. Prerendering برای صفحات عمومی
8. پایش ماهانه GSC را به روتین تبدیل کن
9. بر اساس داده GSC، محتوای موجود را بهینه کن

### بلندمدت (۶ ماه+)
10. Link building strategy (مهمان‌نویسی، partnerships)
11. بررسی SSR/SSG برای نسخه ۲
