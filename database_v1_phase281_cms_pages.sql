-- ============================================================
-- Phase 281: CMS — صفحات ثابت سایت (درباره ما، تماس، حریم خصوصی، ...)
-- ============================================================
-- محتوای بلوکی (مثل بلاگ) برای صفحات اطلاع‌رسانی/حقوقی سایت عمومی.
-- Global (بدون org_id) — مدیریت توسط SaaS admin، خواندن عمومی برای منتشرشده.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cms_pages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  title           text NOT NULL,
  content_blocks  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status          text NOT NULL DEFAULT 'published'
                    CHECK (status IN ('draft', 'published', 'archived')),
  seo_title       text,
  seo_description text,
  og_image_url    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cms_pages_public_read" ON public.cms_pages;
CREATE POLICY "cms_pages_public_read"
  ON public.cms_pages FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "cms_pages_saas_admin_all" ON public.cms_pages;
CREATE POLICY "cms_pages_saas_admin_all"
  ON public.cms_pages FOR ALL
  USING (public.current_user_has_saas_admin_permission())
  WITH CHECK (public.current_user_has_saas_admin_permission('edit'));

CREATE INDEX IF NOT EXISTS idx_cms_pages_slug ON public.cms_pages (slug);
CREATE INDEX IF NOT EXISTS idx_cms_pages_status ON public.cms_pages (status);

DROP TRIGGER IF EXISTS cms_pages_updated_at ON public.cms_pages;
CREATE TRIGGER cms_pages_updated_at
  BEFORE UPDATE ON public.cms_pages
  FOR EACH ROW EXECUTE FUNCTION public.cms_set_updated_at();

CREATE OR REPLACE FUNCTION public.get_cms_page_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'title', p.title,
    'content_blocks', p.content_blocks,
    'seo_title', p.seo_title,
    'seo_description', p.seo_description,
    'og_image_url', p.og_image_url,
    'updated_at', p.updated_at
  )
  FROM public.cms_pages p
  WHERE p.slug = p_slug AND p.status = 'published'
  LIMIT 1;
$$;

GRANT SELECT ON public.cms_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cms_pages TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cms_page_by_slug TO anon, authenticated;

-- ──────────────────────────────────────────────────
-- Seed: محتوای حرفه‌ای پیش‌فرض (قابل ویرایش بعدی از CMS)
-- ──────────────────────────────────────────────────
INSERT INTO public.cms_pages (slug, title, status, seo_title, seo_description, content_blocks) VALUES
('about', 'دربارهٔ ما', 'published', 'دربارهٔ تازه سیستم', 'تازه سیستم؛ پلتفرم یکپارچهٔ سیستم‌سازی و اتوماسیون کسب‌وکار.',
'[
  {"id":"h1","type":"heading","level":2,"content":"دربارهٔ تازه سیستم"},
  {"id":"p1","type":"paragraph","content":"تازه سیستم یک پلتفرم یکپارچهٔ مدیریت کسب‌وکار است که با هدف ساده‌سازی و سیستماتیک‌کردن عملیات روزمرهٔ سازمان‌ها توسعه یافته است. ما باور داریم رشد پایدار یک کسب‌وکار در گرو نظم داده‌ها، شفافیت فرآیندها و تصمیم‌گیری مبتنی بر اطلاعات دقیق است."},
  {"id":"p2","type":"paragraph","content":"به‌جای استفاده از چند نرم‌افزار پراکنده برای فروش، مالی، منابع انسانی و ارتباطات، تازه سیستم همهٔ این بخش‌ها را در یک محیط فارسی، یکپارچه و قابل سفارشی‌سازی کنار هم قرار می‌دهد."},
  {"id":"h2","type":"heading","level":3,"content":"ماموریت ما"},
  {"id":"p3","type":"paragraph","content":"ماموریت ما این است که ابزاری حرفه‌ای، امن و مقیاس‌پذیر در اختیار سازمان‌های ایرانی قرار دهیم تا بتوانند بدون پیچیدگی، کسب‌وکار خود را سیستماتیک کنند و بر رشد تمرکز داشته باشند."},
  {"id":"h3","type":"heading","level":3,"content":"چرا تازه سیستم"},
  {"id":"p4","type":"paragraph","content":"تمرکز بر نیازهای واقعی کسب‌وکارهای ایرانی، پشتیبانی از زبان فارسی و تقویم شمسی، امکان استقرار ابری یا روی سرور اختصاصی سازمان، و توسعهٔ مستمر بر اساس بازخورد مشتریان، تازه سیستم را به انتخابی مطمئن برای مدیریت یکپارچهٔ سازمان تبدیل می‌کند."}
]'::jsonb),

('contact', 'تماس با ما', 'published', 'تماس با تازه سیستم', 'راه‌های ارتباطی با تیم تازه سیستم برای دمو، همکاری و پشتیبانی.',
'[
  {"id":"h1","type":"heading","level":2,"content":"تماس با ما"},
  {"id":"p1","type":"paragraph","content":"خوشحال می‌شویم صدای شما را بشنویم. برای دریافت دموی اختصاصی، مشاورهٔ راه‌اندازی، همکاری یا پشتیبانی می‌توانید از راه‌های زیر با ما در ارتباط باشید و کارشناسان ما در سریع‌ترین زمان ممکن پاسخگوی شما خواهند بود."},
  {"id":"p2","type":"paragraph","content":"همچنین می‌توانید فرم درخواست دمو را تکمیل کنید تا تیم ما برای هماهنگی جلسه با شما تماس بگیرد."}
]'::jsonb),

('privacy', 'حریم خصوصی', 'published', 'سیاست حریم خصوصی تازه سیستم', 'سیاست حفظ حریم خصوصی و حفاظت از داده‌های کاربران تازه سیستم.',
'[
  {"id":"h1","type":"heading","level":2,"content":"سیاست حریم خصوصی"},
  {"id":"p1","type":"paragraph","content":"حفظ حریم خصوصی و امنیت اطلاعات کاربران از اصول بنیادین تازه سیستم است. این سند توضیح می‌دهد که چه اطلاعاتی جمع‌آوری می‌شود، چگونه از آن استفاده و محافظت می‌شود و کاربران چه حقوقی نسبت به داده‌های خود دارند."},
  {"id":"h2","type":"heading","level":3,"content":"اطلاعاتی که جمع‌آوری می‌کنیم"},
  {"id":"p2","type":"paragraph","content":"اطلاعات حساب کاربری (مانند نام، شماره تماس و ایمیل)، داده‌هایی که در جریان استفاده از سرویس ثبت می‌کنید، و اطلاعات فنی لازم برای ارائهٔ سرویس و بهبود کیفیت آن، از جمله مواردی است که ممکن است جمع‌آوری شود."},
  {"id":"h3","type":"heading","level":3,"content":"نحوهٔ استفاده از اطلاعات"},
  {"id":"p3","type":"paragraph","content":"از اطلاعات صرفاً برای ارائه و بهبود سرویس، پشتیبانی، اطلاع‌رسانی و رعایت الزامات قانونی استفاده می‌شود. داده‌های سازمانی شما متعلق به شماست و بدون اجازهٔ شما در اختیار اشخاص ثالث قرار نمی‌گیرد."},
  {"id":"h4","type":"heading","level":3,"content":"نگهداری و امنیت داده"},
  {"id":"p4","type":"paragraph","content":"داده‌ها با استفاده از سازوکارهای امنیتی استاندارد و کنترل دسترسی مبتنی بر نقش محافظت می‌شوند. در نسخهٔ ابری روی زیرساخت مدیریت‌شدهٔ تازه سیستم و در نسخهٔ لوکال روی زیرساخت سازمان شما نگهداری می‌شوند."},
  {"id":"h5","type":"heading","level":3,"content":"حقوق کاربران"},
  {"id":"p5","type":"paragraph","content":"شما حق دسترسی، اصلاح و دریافت خروجی از داده‌های خود را دارید. برای هر درخواست مرتبط با داده‌ها می‌توانید با پشتیبانی تماس بگیرید."}
]'::jsonb),

('terms', 'شرایط استفاده', 'published', 'شرایط استفاده از تازه سیستم', 'شرایط و ضوابط استفاده از سرویس‌های تازه سیستم.',
'[
  {"id":"h1","type":"heading","level":2,"content":"شرایط استفاده"},
  {"id":"p1","type":"paragraph","content":"استفاده از سرویس‌های تازه سیستم به منزلهٔ پذیرش شرایط و ضوابط زیر است. لطفاً پیش از استفاده، این شرایط را با دقت مطالعه کنید."},
  {"id":"h2","type":"heading","level":3,"content":"حساب کاربری"},
  {"id":"p2","type":"paragraph","content":"مسئولیت حفظ محرمانگی اطلاعات حساب کاربری و فعالیت‌های انجام‌شده با آن بر عهدهٔ کاربر است. هرگونه استفادهٔ غیرمجاز باید در اسرع وقت به تازه سیستم اطلاع داده شود."},
  {"id":"h3","type":"heading","level":3,"content":"استفادهٔ مجاز"},
  {"id":"p3","type":"paragraph","content":"کاربر متعهد می‌شود از سرویس صرفاً در چارچوب قوانین جاری و اهداف مشروع کسب‌وکار استفاده کند و از هرگونه سوءاستفاده، اخلال در سرویس یا نقض حقوق دیگران خودداری نماید."},
  {"id":"h4","type":"heading","level":3,"content":"مالکیت فکری"},
  {"id":"p4","type":"paragraph","content":"کلیهٔ حقوق مادی و معنوی نرم‌افزار، برند و محتوای تولیدشده توسط تازه سیستم متعلق به این مجموعه است. داده‌های سازمانی واردشده توسط کاربر، متعلق به کاربر باقی می‌ماند."},
  {"id":"h5","type":"heading","level":3,"content":"محدودیت مسئولیت"},
  {"id":"p5","type":"paragraph","content":"تازه سیستم تمام تلاش خود را برای ارائهٔ سرویس پایدار و امن به کار می‌گیرد؛ با این حال مسئولیت خسارات ناشی از استفادهٔ نادرست یا عوامل خارج از کنترل، در چارچوب قرارداد تعیین می‌شود."}
]'::jsonb),

('rules', 'قوانین و مقررات', 'published', 'قوانین و مقررات تازه سیستم', 'قوانین و مقررات عمومی، اشتراک و پرداخت در تازه سیستم.',
'[
  {"id":"h1","type":"heading","level":2,"content":"قوانین و مقررات"},
  {"id":"p1","type":"paragraph","content":"این بخش قوانین عمومی مربوط به اشتراک، پرداخت و استفاده از سرویس‌های تازه سیستم را تشریح می‌کند."},
  {"id":"h2","type":"heading","level":3,"content":"اشتراک و پرداخت"},
  {"id":"p2","type":"paragraph","content":"هزینهٔ اشتراک بر اساس پلن انتخابی و تعداد کاربران محاسبه می‌شود. سرویس‌های مصرفی مانند پیامک، تماس و مصرف هوش مصنوعی مازاد، جدا از هزینهٔ اشتراک محاسبه می‌گردد."},
  {"id":"h3","type":"heading","level":3,"content":"تمدید و لغو"},
  {"id":"p3","type":"paragraph","content":"اشتراک تا پایان دورهٔ فعال معتبر است و کاربر می‌تواند پیش از پایان دوره نسبت به تمدید یا لغو آن اقدام کند. شرایط استرداد بر اساس قرارداد و مقررات جاری تعیین می‌شود."},
  {"id":"h4","type":"heading","level":3,"content":"تغییر در قوانین"},
  {"id":"p4","type":"paragraph","content":"تازه سیستم این حق را برای خود محفوظ می‌دارد که در صورت نیاز، قوانین و مقررات را به‌روزرسانی کند. تغییرات مهم از طریق سایت یا پنل کاربری اطلاع‌رسانی خواهد شد."}
]'::jsonb),

('sla', 'توافق‌نامهٔ سطح خدمات (SLA)', 'published', 'توافق‌نامهٔ سطح خدمات تازه سیستم', 'تعهدات تازه سیستم دربارهٔ در دسترس‌بودن، پشتیبانی و پشتیبان‌گیری.',
'[
  {"id":"h1","type":"heading","level":2,"content":"توافق‌نامهٔ سطح خدمات (SLA)"},
  {"id":"p1","type":"paragraph","content":"این توافق‌نامه تعهدات تازه سیستم در خصوص کیفیت، در دسترس‌بودن و پشتیبانی سرویس را تشریح می‌کند. جزئیات دقیق بر اساس پلن و قرارداد هر سازمان تعیین می‌شود."},
  {"id":"h2","type":"heading","level":3,"content":"در دسترس‌بودن سرویس"},
  {"id":"p2","type":"paragraph","content":"تازه سیستم متعهد به حفظ بالاترین سطح پایداری سرویس است و تلاش می‌کند زمان در دسترس‌بودن سرویس ابری را در سطح مطلوب نگه دارد. زمان‌بندی به‌روزرسانی‌های برنامه‌ریزی‌شده پیشاپیش اطلاع‌رسانی می‌شود."},
  {"id":"h3","type":"heading","level":3,"content":"پشتیبانی و زمان پاسخ"},
  {"id":"p3","type":"paragraph","content":"پشتیبانی از طریق کانال‌های اعلام‌شده ارائه می‌شود و زمان پاسخ‌گویی بسته به اولویت و شدت مسئله و نوع پلن متفاوت است."},
  {"id":"h4","type":"heading","level":3,"content":"پشتیبان‌گیری از داده‌ها"},
  {"id":"p4","type":"paragraph","content":"در نسخهٔ ابری، پشتیبان‌گیری منظم از داده‌ها انجام می‌شود تا در شرایط اضطراری امکان بازیابی فراهم باشد. در نسخهٔ لوکال، سیاست پشتیبان‌گیری مطابق توافق با سازمان اجرا می‌شود."},
  {"id":"h5","type":"heading","level":3,"content":"موارد استثنا"},
  {"id":"p5","type":"paragraph","content":"اختلالات ناشی از عوامل خارج از کنترل تازه سیستم، قطعی زیرساخت‌های شخص ثالث یا استفادهٔ نادرست کاربر، از شمول تعهدات این توافق‌نامه خارج است."}
]'::jsonb)
ON CONFLICT (slug) DO NOTHING;
