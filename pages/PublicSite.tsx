import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircleOutlined, EnvironmentOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import BlockRenderer from '../components/cms/BlockRenderer';
import SeoHead from '../components/cms/SeoHead';
import { buildHomeSeo } from '../utils/seoHelpers';
import {
  BlogIndexPage,
  BlogPostPage,
  TutorialIndexPage,
  TutorialPostPage,
} from '../components/cms/PublicCmsPages';
import useUserAnnouncements from '../hooks/useUserAnnouncements';
import UserAnnouncementsBanner from '../components/announcements/UserAnnouncementsBanner';
import UserAnnouncementsPopupHost from '../components/announcements/UserAnnouncementsPopupHost';
import LandingRenderer from '../components/publicSite/LandingRenderer';
import PricingSection from '../components/publicSite/shared/PricingSection';
import DemoForm from '../components/publicSite/shared/DemoForm';
import { PANEL_URL, DEMO_URL, sitePath } from '../components/publicSite/siteLinks';

type PublicPage = 'home' | 'features' | 'pricing' | 'blog' | 'blog-post' | 'learn' | 'learn-post' | 'updates' | 'about' | 'contact' | 'demo' | 'privacy' | 'terms' | 'rules' | 'sla';

type FooterConfig = {
  tagline?: string;
  phone?: string;
  phoneHref?: string;
  email?: string;
  address?: string;
  copyright?: string;
};

const nav = [
  ['امکانات', sitePath('/features')],
  ['تعرفه‌ها', sitePath('/pricing')],
  ['آموزش‌ها', sitePath('/learn')],
  ['بلاگ', sitePath('/blog')],
  ['تازه‌ها', sitePath('/updates')],
  ['مستندات API', '/tazesystem/developers'],
] as const;

const ENAMAD_TRUST_SEAL_HTML =
  "<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=746313&Code=7CboRX8cGQ2wJ4c6glCuftng2zueoJS3'><img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=746313&Code=7CboRX8cGQ2wJ4c6glCuftng2zueoJS3' alt='' style='cursor:pointer' code='7CboRX8cGQ2wJ4c6glCuftng2zueoJS3'></a>";

const SectionTitle = ({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) => (
  <div className="mx-auto mb-10 max-w-3xl text-center">
    <div className="text-sm font-black" style={{ color: 'rgb(var(--brand-600-rgb))' }}>{eyebrow}</div>
    <h2 className="mt-3 text-3xl font-black leading-tight text-zinc-950 md:text-4xl">{title}</h2>
    <p className="mt-4 text-base leading-8 text-zinc-600">{text}</p>
  </div>
);

const Header = () => (
  <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur-xl">
    <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
      <Link to={sitePath('/')} className="flex items-center gap-3 text-zinc-950">
        <img src="/tazesystem_logo.png" alt="لوگوی تازه سیستم" className="h-11 w-11 rounded-xl object-contain" />
        <div className="leading-tight">
          <div className="text-lg font-black">تازه سیستم</div>
          <div className="text-xs font-medium text-zinc-500">TazeSystem</div>
        </div>
      </Link>
      <nav className="hidden items-center gap-7 text-sm font-semibold text-zinc-700 lg:flex">
        {nav.map(([label, href]) => <Link key={href} to={href} className="hover:text-zinc-950">{label}</Link>)}
      </nav>
      <div className="flex items-center gap-2">
        <a href={PANEL_URL} className="hidden rounded-xl px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-100 sm:inline-flex">ورود به پنل</a>
        <a href={DEMO_URL} className="rounded-xl px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:opacity-90" style={{ background: 'rgb(var(--brand-600-rgb))' }}>شروع رایگان</a>
      </div>
    </div>
  </header>
);

const FooterColumn = ({ title, items }: { title: string; items: ReadonlyArray<readonly [string, string]> }) => (
  <div>
    <h3 className="text-sm font-bold text-zinc-950">{title}</h3>
    <div className="mt-4 grid gap-3 text-sm text-zinc-600">
      {items.map(([label, href]) => href.startsWith('http') ? <a key={href} href={href}>{label}</a> : <Link key={href} to={href}>{label}</Link>)}
    </div>
  </div>
);

const Footer = () => {
  const [f, setF] = useState<FooterConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.rpc('get_site_footer');
        if (!cancelled && data && typeof data === 'object') setF(data as FooterConfig);
      } catch { /* fallback به پیش‌فرض */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const tagline = f?.tagline || 'نرم‌افزار یکپارچه مدیریت عملیات سازمان؛ از مشتری و پروژه تا فرآیند، فایل، چت، مالی و گزارش مدیریتی.';
  const phone = f?.phone || '۰۲۱-۰۰۰۰۰۰۰۰';
  const phoneHref = f?.phoneHref || 'tel:+982100000000';
  const email = f?.email || 'hello@tazesystem.ir';
  const address = f?.address || '';
  const copyright = f?.copyright || `© ${new Date().getFullYear()} TazeSystem. تمام حقوق برای تازه سیستم محفوظ است.`;

  const legal: ReadonlyArray<readonly [string, string]> = [
    ['حریم خصوصی', sitePath('/privacy')],
    ['شرایط استفاده', sitePath('/terms')],
    ['قوانین و مقررات', sitePath('/rules')],
    ['SLA', sitePath('/sla')],
  ];

  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
        <div>
          <Link to={sitePath('/')} className="inline-flex items-center gap-3 text-zinc-950">
            <img src="/tazesystem_logo.png" alt="تازه سیستم" className="h-10 w-10 rounded-xl object-contain" />
            <span className="text-lg font-black">تازه سیستم</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-7 text-zinc-600">{tagline}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-2"
              dangerouslySetInnerHTML={{ __html: ENAMAD_TRUST_SEAL_HTML }}
            />
            {['ساماندهی', 'درگاه پرداخت'].map((item) => <span key={item} className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">{item}: در حال دریافت</span>)}
          </div>
        </div>
        <FooterColumn title="محصول" items={[['امکانات', sitePath('/features')], ['تعرفه‌ها', sitePath('/pricing')], ['شروع رایگان', DEMO_URL], ['ورود به پنل', PANEL_URL]]} />
        <FooterColumn title="منابع" items={[['بلاگ', sitePath('/blog')], ['آموزش‌ها', sitePath('/learn')], ['تازه‌های محصول', sitePath('/updates')], ['مستندات API', '/tazesystem/developers'], ['درباره ما', sitePath('/about')]]} />
        <div>
          <h3 className="text-sm font-bold text-zinc-950">ارتباط</h3>
          <div className="mt-4 grid gap-3 text-sm text-zinc-600">
            <Link to={sitePath('/contact')}>تماس با ما</Link>
            <a className="flex items-center gap-2" href={`mailto:${email}`}><MailOutlined />{email}</a>
            <a className="flex items-center gap-2" href={phoneHref}><PhoneOutlined />{phone}</a>
            {address && <span className="flex items-start gap-2"><EnvironmentOutlined className="mt-1" />{address}</span>}
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-100 px-5 py-5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-zinc-500 md:flex-row">
          <span>{copyright}</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {legal.map(([label, href]) => <Link key={href} to={href} className="hover:text-zinc-800">{label}</Link>)}
          </div>
        </div>
      </div>
    </footer>
  );
};

const HomePage = () => (
  <>
    <SeoHead {...buildHomeSeo()} />
    <LandingRenderer slug="home" />
  </>
);

const FeaturesPage = () => {
  const items = ['مدیریت مشتریان و سرنخ‌های بازاریابی', 'پروژه‌ها، وظایف، مسئول و زمان پیگیری', 'فرآیندها، الگوهای فرآیند و گزارش اجرا', 'چت داخلی، گروه‌ها و پیام روی رکوردها', 'فایل‌ها، پیوست‌ها و گالری اسناد', 'بات‌های تلگرام، بله و روبیکا', 'پیامک، VoIP و گزارش ارتباطات', 'فاکتور، هزینه، نقد و بانک و حسابداری', 'منابع انسانی، حضور، مرخصی و ماموریت', 'داشبورد، گزارش‌ساز و خروجی مدیریتی', 'نقش‌ها، دسترسی رکورد و دسترسی فیلد', 'وب‌فرم‌ها، فرم درخواست و مسیرهای عمومی'];
  return <main className="px-5 py-20"><div className="mx-auto max-w-7xl"><SectionTitle eyebrow="امکانات" title="ماژول‌هایی برای اداره عملیات روزانه" text="نسخه اول سایت، فهرست امکانات را خلاصه و واضح نشان می‌دهد؛ جزئیات هر ماژول در فاز بعدی به صفحه اختصاصی تبدیل می‌شود." /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.map((item) => <div key={item} className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm font-bold leading-7 text-zinc-700"><CheckCircleOutlined className="ml-2" style={{ color: 'rgb(var(--brand-600-rgb))' }} />{item}</div>)}</div></div></main>;
};

type ProductUpdate = {
  version: string;
  title: string;
  summary: string;
  details: string[];
};

const recentProductUpdates: ProductUpdate[] = [
  {
    version: '2.15.0.3.4',
    title: 'پایداری بیشتر پیام‌رسانی جدید',
    summary: 'نمای جدید پیام‌رسانی در موبایل، پیامک، تماس و بات‌ها روان‌تر و قابل اتکاتر شد.',
    details: [
      'فهرست فشرده موبایل با تب انتخاب‌شده هماهنگ می‌ماند و فضای کمتری اشغال می‌کند.',
      'فایل‌ها، تصاویر و مدیای بات‌ها بهتر شناسایی و نمایش داده می‌شوند.',
      'ضبط تماس‌ها از داخل گفتگوی تماس قابل پخش و دانلود است.',
    ],
  },
  {
    version: '2.15.0.3.3',
    title: 'تکمیل دکمه‌های پیام‌رسانی جدید',
    summary: 'دکمه‌های اصلی هدر گفتگو در پیام‌رسانی جدید کامل‌تر شدند تا جستجو، تماس و ویرایش گروه داخلی از همان صفحه انجام شود.',
    details: [
      'جستجوی داخل هر گفتگو به‌صورت سبک و مستقیم از هدر باز می‌شود.',
      'در گفتگوهای تماس، دکمه تماس شماره همان گفتگو را برای تماس آماده می‌کند.',
      'گروه‌های داخلی از هدر گفتگو قابل ویرایش هستند.',
    ],
  },
  {
    version: '2.15.0.3.2',
    title: 'پیام‌رسانی یکپارچه جدید',
    summary: 'نمای جدید پیام‌رسانی جایگزین صفحه قبلی شد تا پیام‌های داخلی، بات، پیامک و تماس‌ها در یک تجربه سبک‌تر و منظم‌تر مدیریت شوند.',
    details: [
      'شمار پیام‌های خوانده‌نشده در منو، تب‌ها و گفتگوها از منطق یکپارچه‌تری استفاده می‌کند.',
      'باز کردن هر گفتگو وضعیت خوانده‌شدن همان پیام‌ها را به‌روز می‌کند.',
      'ظاهر برچسب‌های داخلی با رنگ برند هماهنگ‌تر و فشرده‌تر شد.',
    ],
  },
  {
    version: '2.15.0.0.0',
    title: 'قفل کردن رکوردها',
    summary: 'برای رکوردهای نهایی یا حساس می‌توان حالت فقط مشاهده فعال کرد تا تغییر دستی یا خودکار روی آن‌ها انجام نشود.',
    details: [
      'اجازه قفل و باز کردن برای هر نقش و هر بخش جداگانه تنظیم می‌شود.',
      'وضعیت قفل در فهرست‌ها، کارت‌ها، صفحه رکورد، فعالیت‌ها و بخش‌های مالی دیده می‌شود.',
      'روی رکورد قفل‌شده هنوز می‌توان فایل جدید اضافه کرد، اما فایل‌های قبلی حذف نمی‌شوند.',
    ],
  },
  {
    version: '2.14.0.2.9',
    title: 'پرداخت آنلاین فاکتور فروش',
    summary: 'فاکتور آنلاین به مسیر پرداخت سریع وصل شد تا مشتری بتواند مبلغ قابل پرداخت را مستقیم از همان صفحه پرداخت کند.',
    details: [
      'مدیر سازمان می‌تواند اتصال زرین‌پال را در تنظیمات فعال کند.',
      'پرداخت موفق به‌صورت خودکار در دریافت‌های فاکتور ثبت می‌شود.',
      'دریافت‌های آنلاین برای حفظ صحت مالی قابل حذف یا ویرایش دستی نیستند.',
    ],
  },
  {
    version: '2.14.0.2.9',
    title: 'قابلیت‌های تازه برای پلن‌ها',
    summary: 'مدیریت پلن‌ها برای امکانات اشتراکی دقیق‌تر شد و چند قابلیت قابل کنترل به پلن‌ها اضافه شد.',
    details: [
      'دامنه اختصاصی و درگاه اختصاصی سازمان می‌تواند در سطح پلن مدیریت شود.',
      'تمدید اشتراک، شارژ هوش مصنوعی و شارژ پیامک به قابلیت‌های قابل تعریف پلن اضافه شد.',
      'این امکانات از مسیر داده قابل مدیریت هستند و به تنظیمات ثابت داخل کد محدود نیستند.',
    ],
  },
  {
    version: '2.14.0.2.0',
    title: 'تحلیل مالی با دستیار هوش مصنوعی',
    summary: 'دستیار هوشمند می‌تواند پرسش‌های مدیریتی درباره فروش، هزینه و سود و زیان را با بازه زمانی مشخص پاسخ دهد.',
    details: [
      'تحلیل‌ها فقط از داده‌های مجاز همان سازمان استفاده می‌کنند.',
      'اعداد قطعی حسابداری از شاخص‌های عملیاتی تقریبی جدا نمایش داده می‌شوند.',
      'اگر ثبت‌های دوره ناقص باشد، موضوع در پاسخ به کاربر اعلام می‌شود.',
    ],
  },
  {
    version: '2.14.0.2.1',
    title: 'اجرای کامل‌تر الگوهای فرآیند',
    summary: 'فعال‌سازی فرآیندها مرحله‌های آغازین و فعالیت‌های اولیه را خودکار آماده می‌کند تا شروع کار دستی و پراکنده نباشد.',
    details: [
      'گردش‌کارهای زمان‌بندی‌شده رکوردهای هدف را صفحه‌به‌صفحه بررسی می‌کنند.',
      'خطاهای موقت اقدام‌های امن به‌صورت کنترل‌شده دوباره امتحان می‌شوند.',
      'پرامپت هوش مصنوعی می‌تواند با محدودیت فیلدهای تعیین‌شده، رکورد جاری را ویرایش کند.',
    ],
  },
  {
    version: '2.14.0.2.5',
    title: 'افزودن سریع فعالیت و ارتباط از کنار رکورد',
    summary: 'در تب‌های مرتبط هر رکورد، ثبت فعالیت، پیامک یا تماس سریع‌تر و نزدیک‌تر به همان رکورد انجام می‌شود.',
    details: [
      'پنجره افزودن سریع فعالیت با مسئول، وضعیت و فیلدهای بیشتر در دسترس است.',
      'از تب پیامک و تماس می‌توان همان‌جا ارسال پیامک یا شروع تماس را انجام داد.',
      'افزودن مورد مرتبط مستقیم از همان پنجره کنار رکورد کامل‌تر شده است.',
    ],
  },
  {
    version: '2.14.0.0.0',
    title: 'باشگاه مشتریان',
    summary: 'برای مدیریت طرح‌های تشویقی، سطح‌بندی، کدهای تخفیف و اعتبار مشتریان یک بخش مستقل اضافه شد.',
    details: [
      'اعتبار مشتریان قابل ثبت، مصرف در فاکتور فروش و پیگیری در دفتر اعتبار است.',
      'اطلاعات خرید و مانده سیستم قبلی مشتری در آمار مالی او لحاظ می‌شود.',
      'وضعیت مالی مشتریان پیش‌پرداخت‌ها و اطلاعات قبلی را هم در محاسبات در نظر می‌گیرد.',
    ],
  },
  {
    version: '2.13.0.0.0',
    title: 'شرط‌های پیشرفته برای نقش‌ها',
    summary: 'دسترسی نقش‌ها می‌تواند با شرط‌های دقیق‌تری روی رکوردها و رکوردهای مرتبط کنترل شود.',
    details: [
      'شرط‌ها از دو بخش «همه شرط‌ها» و «یکی از شرط‌ها» پشتیبانی می‌کنند.',
      'فیلدهای رکورد، فیلدهای رکورد مرتبط و مسئول رکورد در شرط‌ها قابل بررسی هستند.',
      'شرط‌ها هنگام ذخیره دسترسی حفظ می‌شوند و در فهرست‌ها و انتخاب گروهی رکوردها اعمال می‌شوند.',
    ],
  },
  {
    version: '2.12.0.0.0',
    title: 'فرم‌های تحویل آنلاین',
    summary: 'برای فرم‌های تحویل، لینک آنلاین امن ساخته می‌شود تا طرف‌های تحویل بتوانند اطلاعات، فایل‌ها و اقلام را ببینند و تایید کنند.',
    details: [
      'تحویل‌دهنده و تحویل‌گیرنده می‌توانند داخلی، مشتری، تامین‌کننده یا شخص بیرونی باشند.',
      'تایید هر طرف با کد پیامکی انجام می‌شود و زمان تایید خودکار ثبت می‌شود.',
      'دبیرخانه و فرم‌های تحویل از تصویر یا فایل اصلی متصل به مدیریت فایل‌ها پشتیبانی می‌کنند.',
    ],
  },
];

const ResourcesPage = ({ kind }: { kind: 'blog' | 'learn' | 'updates' }) => {
  if (kind === 'updates') {
    return (
      <main className="px-5 py-20" dir="rtl">
        <div className="mx-auto max-w-6xl">
          <SectionTitle
            eyebrow="تازه‌های محصول"
            title="مسیر رشد تازه سیستم"
            text='"تازه سیستم" دائما در حال تازه تر شدن است.'
          />
          <div className="grid gap-5 md:grid-cols-2">
            {recentProductUpdates.map((item) => (
              <article key={`${item.version}-${item.title}`} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600">نسخه {item.version}</span>
                  <span className="text-xs font-black" style={{ color: 'rgb(var(--brand-600-rgb))' }}>ویژگی جدید</span>
                </div>
                <h2 className="mt-4 text-xl font-black leading-8 text-zinc-950">{item.title}</h2>
                <p className="mt-3 text-sm leading-8 text-zinc-600">{item.summary}</p>
                <ul className="mt-5 grid gap-3 text-sm leading-7 text-zinc-700">
                  {item.details.map((detail) => (
                    <li key={detail} className="flex gap-2">
                      <CheckCircleOutlined className="mt-1 flex-shrink-0" style={{ color: 'rgb(var(--brand-600-rgb))' }} />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const box = {
    blog: ['بلاگ', 'مقاله‌هایی برای مدیران در حال رشد', 'محتوای این بخش برای CRM، ERP، اتوماسیون، AI و مدیریت پروژه تکمیل می‌شود.', ['چرا CRM به‌تنهایی کافی نیست؟', 'مدیریت پروژه در شرکت تبلیغاتی', 'هوش مصنوعی در عملیات سازمانی']],
    learn: ['آموزش‌ها', 'راهنمای شروع و استفاده از محصول', 'آموزش‌های متنی و تصویری برای کاهش زمان راه‌اندازی و پشتیبانی.', ['شروع سریع با مشتریان', 'ساخت الگوی فرآیند', 'ثبت فایل و پیام روی رکورد']],
  }[kind] as [string, string, string, string[]];
  return <main className="px-5 py-20"><div className="mx-auto max-w-5xl"><SectionTitle eyebrow={box[0]} title={box[1]} text={box[2]} /><div className="grid gap-4">{box[3].map((item) => <article key={item} className="rounded-2xl border border-zinc-200 bg-white p-6"><div className="text-xs font-black" style={{ color: 'rgb(var(--brand-600-rgb))' }}>{box[0]}</div><h2 className="mt-2 text-xl font-black text-zinc-950">{item}</h2><p className="mt-3 text-sm leading-8 text-zinc-600">این محتوا در نسخه عمومی سایت تکمیل می‌شود و فعلاً زیرساخت انتشار آن آماده است.</p></article>)}</div></div></main>;
};

// رندر صفحات ثابت CMS (درباره ما، حریم خصوصی، شرایط، قوانین، SLA)
const CmsStaticPage = ({ slug, fallbackTitle }: { slug: string; fallbackTitle: string }) => {
  const [page, setPage] = useState<{ title?: string; content_blocks?: any[] } | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.rpc('get_cms_page_by_slug', { p_slug: slug });
        if (!cancelled) { setPage(data as any); setLoaded(true); }
      } catch { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [slug]);
  const blocks = page?.content_blocks ?? [];
  return (
    <main className="px-5 py-20" dir="rtl">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-3xl font-black leading-tight text-zinc-950 md:text-4xl">{page?.title || fallbackTitle}</h1>
        {blocks.length > 0 ? (
          <BlockRenderer blocks={blocks} className="text-zinc-700" />
        ) : (
          <p className="text-base leading-8 text-zinc-500">{loaded ? 'محتوای این صفحه به‌زودی از پنل مدیریت تکمیل می‌شود.' : 'در حال بارگذاری...'}</p>
        )}
      </div>
    </main>
  );
};

const ContactPage = () => <main className="px-5 py-20"><div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.8fr_1.2fr]"><div><div className="text-sm font-black" style={{ color: 'rgb(var(--brand-600-rgb))' }}>تماس با ما</div><h1 className="mt-3 text-4xl font-black text-zinc-950">برای دمو، همکاری یا پشتیبانی پیام بدهید</h1><div className="mt-8 grid gap-3 text-sm text-zinc-600"><a className="flex items-center gap-3" href="tel:+982100000000"><PhoneOutlined /> ۰۲۱-۰۰۰۰۰۰۰۰</a><a className="flex items-center gap-3" href="mailto:hello@tazesystem.ir"><MailOutlined /> hello@tazesystem.ir</a></div></div><DemoForm /></div></main>;

const PublicSite: React.FC<{ page?: PublicPage }> = ({ page = 'home' }) => {
  const location = useLocation();
  const resolvedPage = useMemo<PublicPage>(() => {
    const path = location.pathname.replace(/^\/tazesystem/, '') || '/';
    if (page !== 'home') return page;
    if (path === '/features') return 'features';
    if (path === '/pricing') return 'pricing';
    if (path === '/blog') return 'blog';
    if (path.startsWith('/blog/')) return 'blog-post';
    if (path === '/learn') return 'learn';
    if (path.startsWith('/learn/')) return 'learn-post';
    if (path === '/updates') return 'updates';
    if (path === '/about') return 'about';
    if (path === '/contact') return 'contact';
    if (path === '/privacy') return 'privacy';
    if (path === '/terms') return 'terms';
    if (path === '/rules') return 'rules';
    if (path === '/sla') return 'sla';
    if (path === '/demo') return 'demo';
    return 'home';
  }, [location.pathname, page]);
  const {
    headerAnnouncements,
    popupAnnouncements,
    dismissAnnouncement,
  } = useUserAnnouncements({
    surface: 'public_site',
    path: `${location.pathname}${location.search || ''}`,
  });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <UserAnnouncementsBanner
        items={headerAnnouncements}
        onDismiss={dismissAnnouncement}
      />
      <Header />
      {resolvedPage === 'home' && <HomePage />}
      {resolvedPage === 'features' && <FeaturesPage />}
      {resolvedPage === 'pricing' && <PricingSection detailed />}
      {resolvedPage === 'blog' && <BlogIndexPage />}
      {resolvedPage === 'blog-post' && <BlogPostPage />}
      {resolvedPage === 'learn' && <TutorialIndexPage />}
      {resolvedPage === 'learn-post' && <TutorialPostPage />}
      {resolvedPage === 'updates' && <ResourcesPage kind="updates" />}
      {resolvedPage === 'about' && <CmsStaticPage slug="about" fallbackTitle="دربارهٔ ما" />}
      {resolvedPage === 'privacy' && <CmsStaticPage slug="privacy" fallbackTitle="حریم خصوصی" />}
      {resolvedPage === 'terms' && <CmsStaticPage slug="terms" fallbackTitle="شرایط استفاده" />}
      {resolvedPage === 'rules' && <CmsStaticPage slug="rules" fallbackTitle="قوانین و مقررات" />}
      {resolvedPage === 'sla' && <CmsStaticPage slug="sla" fallbackTitle="توافق‌نامهٔ سطح خدمات (SLA)" />}
      {(resolvedPage === 'contact' || resolvedPage === 'demo') && <ContactPage />}
      <Footer />
      <UserAnnouncementsPopupHost
        items={popupAnnouncements}
        onDismiss={dismissAnnouncement}
      />
    </div>
  );
};

export default PublicSite;
