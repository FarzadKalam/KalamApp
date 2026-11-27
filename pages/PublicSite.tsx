import { TAZE_SYSTEM_BRAND_ASSETS } from '../utils/tazeSystemBrandAssets';
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { CheckCircleOutlined, EnvironmentOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import BlockRenderer from '../components/cms/BlockRenderer';
import SeoHead from '../components/cms/SeoHead';
import { buildHomeSeo } from '../utils/seoHelpers';
import { getStaticPublicPageSeo } from '../shared/publicSiteSeo.mjs';
import { RECENT_PRODUCT_UPDATES } from '../shared/publicProductUpdates.mjs';
import { PUBLIC_SOLUTIONS, PUBLIC_SOLUTIONS_BY_PATH } from '../shared/publicSolutions.mjs';
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
import { DEFAULT_ENAMAD_TRUST_HTML } from '../utils/publicSiteTrustSeals';
import { PUBLIC_SITE_CSS_VARS, PUBLIC_SITE_THEME } from '../components/publicSite/publicSiteTheme';
import { MotionConfig } from 'framer-motion';
import '../components/publicSite/publicSite.css';

type PublicPage = 'home' | 'features' | 'pricing' | 'blog' | 'blog-post' | 'learn' | 'learn-post' | 'updates' | 'about' | 'contact' | 'demo' | 'privacy' | 'terms' | 'rules' | 'sla' | 'solutions-index' | 'solution';

type FooterConfig = {
  tagline?: string;
  phone?: string;
  phoneHref?: string;
  email?: string;
  address?: string;
  copyright?: string;
  enamadTrustHtml?: string;
  zarinpalTrustHtml?: string;
};

const nav = [
  ['امکانات', sitePath('/features')],
  ['راهکارها', sitePath('/solutions')],
  ['تعرفه‌ها', sitePath('/pricing')],
  ['آموزش‌ها', sitePath('/learn')],
  ['بلاگ', sitePath('/blog')],
  ['تازه‌ها', sitePath('/updates')],
  ['مستندات API', '/tazesystem/developers'],
] as const;

const featuredSolutionPaths = [
  '/solutions/report-builder',
  '/solutions/ai-crm',
  '/solutions/smart-instagram-direct',
  '/solutions/process-automation',
] as const;

const footerSolutionLinks = [
  ['همه راهکارها', sitePath('/solutions')],
  ['سیستم گزارش‌ساز و داشبورد', sitePath('/solutions/report-builder')],
  ['CRM ایرانی دارای هوش مصنوعی', sitePath('/solutions/ai-crm')],
  ['دایرکت هوشمند اینستاگرام', sitePath('/solutions/smart-instagram-direct')],
  ['مدیریت فرآیند و اتوماسیون', sitePath('/solutions/process-automation')],
  ['حسابداری و سامانه مؤدیان', sitePath('/solutions/accounting-moadian')],
] as const;

const SectionTitle = ({ eyebrow, title, text, headingLevel = 'h2' }: { eyebrow: string; title: string; text: string; headingLevel?: 'h1' | 'h2' }) => {
  const HeadingTag = headingLevel;
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center">
      <div className="text-sm font-black" style={{ color: 'rgb(var(--brand-600-rgb))' }}>{eyebrow}</div>
      <HeadingTag className="mt-3 text-3xl font-black leading-tight text-zinc-950 md:text-4xl">{title}</HeadingTag>
      <p className="mt-4 text-base leading-8 text-zinc-600">{text}</p>
    </div>
  );
};

const Header = () => (
  <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/95 shadow-[0_1px_0_rgba(24,24,27,0.03)] backdrop-blur-xl">
    <a href="#public-page-content" className="sr-only focus:not-sr-only focus:absolute focus:bg-white focus:p-3">رفتن به محتوای صفحه</a>
    <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
      <Link to={sitePath('/')} className="flex items-center gap-3 text-zinc-950">
        <img src={TAZE_SYSTEM_BRAND_ASSETS.logo} alt="لوگوی تازه سیستم" className="h-11 w-11 rounded-xl object-contain" />
        <div className="leading-tight">
          <div className="text-lg font-black">تازه سیستم</div>
          <div className="text-xs font-medium text-zinc-500">نرم‌افزار یکپارچه کسب‌وکار</div>
        </div>
      </Link>
      <nav className="hidden items-center gap-7 text-sm font-semibold text-zinc-700 lg:flex">
        {nav.map(([label, href]) => <Link key={href} to={href} className="rounded-lg px-1.5 py-2 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-500-rgb))]">{label}</Link>)}
      </nav>
      <div className="flex items-center gap-2">
        <a href={PANEL_URL} className="hidden rounded-xl px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-100 sm:inline-flex">ورود به پنل</a>
        <a href={DEMO_URL} className="rounded-xl px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={{ background: 'rgb(var(--brand-600-rgb))', outlineColor: 'rgb(var(--brand-500-rgb))' }}>شروع رایگان</a>
      </div>
    </div>
    <details className="site-mobile-nav">
      <summary>فهرست سایت</summary>
      <nav aria-label="فهرست موبایل">{nav.map(([label, href]) => <Link key={href} to={href}>{label}</Link>)}<a href={PANEL_URL}>ورود به پنل</a></nav>
    </details>
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
  const copyright = f?.copyright || `© ${new Date().getFullYear()} تازه سیستم. تمام حقوق محفوظ است.`;
  const enamadTrustHtml = f?.enamadTrustHtml?.trim() || DEFAULT_ENAMAD_TRUST_HTML;
  const zarinpalTrustHtml = f?.zarinpalTrustHtml?.trim();

  const legal: ReadonlyArray<readonly [string, string]> = [
    ['حریم خصوصی', sitePath('/privacy')],
    ['شرایط استفاده', sitePath('/terms')],
    ['قوانین و مقررات', sitePath('/rules')],
    ['SLA', sitePath('/sla')],
  ];

  return (
    <footer className="site-footer border-t border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
        <div>
          <Link to={sitePath('/')} className="inline-flex items-center gap-3 text-zinc-950">
            <img src={TAZE_SYSTEM_BRAND_ASSETS.logo} alt="تازه سیستم" className="h-10 w-10 rounded-xl object-contain" />
            <span className="text-lg font-black">تازه سیستم</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-7 text-zinc-600">{tagline}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-2"
              aria-label="نماد اعتماد الکترونیکی"
              dangerouslySetInnerHTML={{ __html: enamadTrustHtml }}
            />
            {zarinpalTrustHtml ? (
              <div
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-2"
                aria-label="نشان زرین‌پال"
                dangerouslySetInnerHTML={{ __html: zarinpalTrustHtml }}
              />
            ) : null}
          </div>
        </div>
        <FooterColumn title="راهکارها" items={footerSolutionLinks} />
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
    <LandingRenderer slug="home" themeOverride={PUBLIC_SITE_THEME} />
    <SolutionsOverview />
  </>
);

const SolutionsOverview = () => (
  <section className="px-5 py-20">
    <div className="mx-auto max-w-7xl">
      <SectionTitle eyebrow="راهکارهای هوشمند" title="CRM، گزارش‌ساز، فرآیند و هوش مصنوعی در یک مسیر کاری" text="برای هر نیاز سازمان، راهنمای دقیق امکانات، کاربردها و معیار انتخاب را بخوانید." />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {featuredSolutionPaths.map((solutionPath) => {
          const item = PUBLIC_SOLUTIONS_BY_PATH[solutionPath];
          if (!item) return null;
          return (
            <Link key={item.path} to={sitePath(item.path)} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
              <div className="text-xs font-bold text-zinc-500">{item.category}</div>
              <h3 className="mt-2 font-black leading-7 text-zinc-950">{item.navLabel}</h3>
              <span className="mt-5 inline-block text-sm font-bold" style={{ color: 'rgb(var(--brand-600-rgb))' }}>مشاهده راهکار ←</span>
            </Link>
          );
        })}
      </div>
      <div className="mt-8 text-center">
        <Link to={sitePath('/solutions')} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-black text-zinc-950 transition hover:border-zinc-950">
          مشاهده همه ۱۲ راهکار تازه سیستم ←
        </Link>
      </div>
    </div>
  </section>
);

const SolutionsHubPage = () => {
  const categories = Array.from(new Set(PUBLIC_SOLUTIONS.map((item) => item.category)));
  return (
    <main className="px-5 py-20" dir="rtl">
      <SeoHead {...getStaticPublicPageSeo('/solutions')} />
      <div className="mx-auto max-w-7xl">
        <SectionTitle
          eyebrow="مرکز راهکارها"
          title="راهکارهای یکپارچه تازه سیستم برای هر بخش کسب‌وکار"
          text="از CRM هوشمند و دایرکت اینستاگرام تا سیستم گزارش‌ساز، اتوماسیون فرآیند، حسابداری و سامانه مؤدیان، منابع انسانی و تلفن ابری."
          headingLevel="h1"
        />
        <div className="grid gap-14">
          {categories.map((category) => (
            <section key={category}>
              <h2 className="mb-6 text-2xl font-black text-zinc-950">{category}</h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {PUBLIC_SOLUTIONS.filter((item) => item.category === category).map((item) => (
                  <Link
                    key={item.path}
                    to={sitePath(item.path)}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                  >
                    <div className="aspect-[16/10] overflow-hidden border-b border-zinc-100 bg-zinc-50">
                      <img src={item.screenshot} alt={item.screenshotAlt} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <div className="text-xs font-black" style={{ color: 'rgb(var(--brand-600-rgb))' }}>{item.eyebrow}</div>
                      <h3 className="mt-2 text-lg font-black leading-7 text-zinc-950">{item.navLabel}</h3>
                      <p className="mt-3 flex-1 text-sm leading-7 text-zinc-600">{item.intro}</p>
                      <span className="mt-5 inline-block text-sm font-bold" style={{ color: 'rgb(var(--brand-600-rgb))' }}>بررسی کامل راهکار ←</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
};

const SolutionPage = () => {
  const location = useLocation();
  const normalizedPath = location.pathname.replace(/^\/tazesystem/, '');
  const solution = PUBLIC_SOLUTIONS_BY_PATH[normalizedPath] || PUBLIC_SOLUTIONS[0];
  const canonical = `https://tazesystem.ir${solution.path}`;
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: solution.faq.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
  };
  return (
    <main dir="rtl">
      <SeoHead title={solution.title} description={solution.description} canonical={canonical} ogImage={`https://tazesystem.ir${solution.screenshot}`} jsonLd={faqJsonLd} />
      <section className="px-5 py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <div>
            <Link to={sitePath('/solutions')} className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-zinc-900">همه راهکارها / {solution.category}</Link>
            <div className="mt-3 text-sm font-black" style={{ color: 'rgb(var(--brand-600-rgb))' }}>{solution.eyebrow}</div>
            <h1 className="mt-4 text-4xl font-black leading-tight text-zinc-950 md:text-5xl">{solution.title.replace(' | تازه سیستم', '')}</h1>
            <p className="mt-6 text-lg leading-9 text-zinc-600">{solution.intro}</p>
            <a href={DEMO_URL} className="mt-8 inline-flex rounded-xl px-6 py-3 font-black text-white" style={{ background: 'rgb(var(--brand-600-rgb))' }}>شروع رایگان</a>
          </div>
          <img src={solution.screenshot} alt={solution.screenshotAlt} width="1536" height="1024" className="w-full rounded-3xl border border-zinc-200 bg-white shadow-xl" />
        </div>
      </section>
      <section className="bg-zinc-50 px-5 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-black text-zinc-950">امکانات و مزایا</h2>
            <ul className="mt-6 grid gap-4">{solution.benefits.map((item) => <li key={item} className="rounded-xl bg-white p-4 leading-7 text-zinc-700"><CheckCircleOutlined className="ml-2 text-emerald-600" />{item}</li>)}</ul>
          </div>
          <div>
            <h2 className="text-3xl font-black text-zinc-950">کاربردهای واقعی</h2>
            <ul className="mt-6 grid gap-4">{solution.useCases.map((item) => <li key={item} className="rounded-xl bg-white p-4 leading-7 text-zinc-700"><CheckCircleOutlined className="ml-2 text-emerald-600" />{item}</li>)}</ul>
          </div>
        </div>
      </section>
      {solution.relatedLinks.length > 0 && (
        <section className="px-5 pt-16">
          <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-xl font-black text-zinc-950">مطالب و آموزش‌های مرتبط</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {solution.relatedLinks.map((link) => (
                <Link key={link.to} to={link.to.startsWith('/tazesystem') ? link.to : sitePath(link.to)} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-bold text-zinc-800 transition hover:border-zinc-950 hover:bg-white">
                  {link.label} ←
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-black text-zinc-950">پرسش‌های پرتکرار</h2>
          <div className="mt-8 grid gap-4">{solution.faq.map((item) => <article key={item.question} className="rounded-2xl border border-zinc-200 p-6"><h3 className="font-black text-zinc-950">{item.question}</h3><p className="mt-3 leading-8 text-zinc-600">{item.answer}</p></article>)}</div>
        </div>
      </section>
      <SolutionsOverview />
    </main>
  );
};

const FeaturesPage = () => {
  const items = ['مدیریت مشتریان و سرنخ‌های بازاریابی', 'اتصال امن به ChatGPT، Codex، Gemini و Claude با پروتکل MCP و رعایت سطح دسترسی کاربران', 'کمپین‌های تبلیغاتی چندکاناله با مخاطب، زمان‌بندی و داشبورد نتیجه', 'پروژه‌ها، وظایف، مسئول و زمان پیگیری', 'فرآیندها، الگوهای فرآیند و گزارش اجرا', 'چت داخلی، گروه‌ها و پیام روی رکوردها', 'فایل‌ها، پیوست‌ها و گالری اسناد', 'بات‌های تلگرام، بله و روبیکا', 'دایرکت و کامنت اینستاگرام با پاسخ‌گویی و گردش‌کار خودکار', 'پیامک، VoIP و گزارش ارتباطات', 'فاکتور، هزینه، نقد و بانک و حسابداری', 'منابع انسانی، حضور، مرخصی و ماموریت', 'داشبورد، گزارش‌ساز و خروجی مدیریتی', 'نقش‌ها، دسترسی رکورد و دسترسی فیلد', 'وب‌فرم‌ها، فرم درخواست و مسیرهای عمومی'];
  return <main className="px-5 py-20"><SeoHead {...getStaticPublicPageSeo('/features')} /><div className="mx-auto max-w-7xl"><SectionTitle eyebrow="امکانات" title="ماژول‌هایی برای اداره عملیات روزانه" text="نسخه اول سایت، فهرست امکانات را خلاصه و واضح نشان می‌دهد؛ جزئیات هر ماژول در فاز بعدی به صفحه اختصاصی تبدیل می‌شود." headingLevel="h1" /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.map((item) => <div key={item} className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm font-bold leading-7 text-zinc-700"><CheckCircleOutlined className="ml-2" style={{ color: 'rgb(var(--brand-600-rgb))' }} />{item}</div>)}</div></div></main>;
};

const ResourcesPage = ({ kind }: { kind: 'blog' | 'learn' | 'updates' }) => {
  if (kind === 'updates') {
    return (
      <main className="px-5 py-20" dir="rtl">
        <SeoHead {...getStaticPublicPageSeo('/updates')} />
        <div className="mx-auto max-w-6xl">
          <SectionTitle
            eyebrow="تازه‌های محصول"
            title="مسیر رشد تازه سیستم"
            text='"تازه سیستم" دائما در حال تازه تر شدن است.'
            headingLevel="h1"
          />
          <div className="grid gap-5 md:grid-cols-2">
            {RECENT_PRODUCT_UPDATES.map((item) => (
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
  const staticSeo = getStaticPublicPageSeo(`/${slug}`);
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
      <SeoHead {...staticSeo} title={page?.title ? `${page.title} | تازه سیستم` : staticSeo.title} />
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-3xl font-black leading-tight text-zinc-950 md:text-4xl">{page?.title || fallbackTitle}</h1>
        {blocks.length > 0 ? (
          <BlockRenderer colorScheme="light" blocks={blocks} className="text-zinc-700" />
        ) : (
          <p className="text-base leading-8 text-zinc-500">{loaded ? 'محتوای این صفحه به‌زودی از پنل مدیریت تکمیل می‌شود.' : 'در حال بارگذاری...'}</p>
        )}
      </div>
    </main>
  );
};

const ContactPage = ({ isDemo = false }: { isDemo?: boolean }) => <main className="px-5 py-20"><SeoHead {...getStaticPublicPageSeo(isDemo ? '/demo' : '/contact')} /><div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.8fr_1.2fr]"><div><div className="text-sm font-black" style={{ color: 'rgb(var(--brand-600-rgb))' }}>تماس با ما</div><h1 className="mt-3 text-4xl font-black text-zinc-950">برای دمو، همکاری یا پشتیبانی پیام بدهید</h1><div className="mt-8 grid gap-3 text-sm text-zinc-600"><a className="flex items-center gap-3" href="tel:+982100000000"><PhoneOutlined /> ۰۲۱-۰۰۰۰۰۰۰۰</a><a className="flex items-center gap-3" href="mailto:hello@tazesystem.ir"><MailOutlined /> hello@tazesystem.ir</a></div></div><DemoForm /></div></main>;

const PublicSiteScrollRestoration = () => {
  const { key, hash } = useLocation();
  useLayoutEffect(() => {
    document.documentElement.classList.add('taze-public-document');
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      document.documentElement.classList.remove('taze-public-document');
      window.history.scrollRestoration = previous;
    };
  }, []);
  useLayoutEffect(() => {
    document.querySelectorAll<HTMLDetailsElement>('.site-mobile-nav[open]').forEach(menu => { menu.open = false; });
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.getElementById('public-page-content')?.focus({ preventScroll: true });
      return;
    }
    let targetId: string;
    try { targetId = decodeURIComponent(hash.slice(1)); } catch { return; }
    const scrollToAnchor = () => {
      const target = document.getElementById(targetId);
      if (!target) return false;
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
      return true;
    };
    if (scrollToAnchor()) return;
    const observer = new MutationObserver(() => { if (scrollToAnchor()) observer.disconnect(); });
    observer.observe(document.getElementById('public-page-content') ?? document.body, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => observer.disconnect(), 5000);
    return () => { observer.disconnect(); window.clearTimeout(timeout); };
  }, [key, hash]);
  return null;
};

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
    if (path === '/solutions') return 'solutions-index';
    if (path.startsWith('/solutions/')) return 'solution';
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
    <MotionConfig reducedMotion="user">
    <div className="public-site min-h-screen bg-zinc-50 text-zinc-950" style={PUBLIC_SITE_CSS_VARS as React.CSSProperties} dir="rtl">
      <PublicSiteScrollRestoration />
      <UserAnnouncementsBanner
        items={headerAnnouncements}
        onDismiss={dismissAnnouncement}
      />
      <Header />
      <div id="public-page-content" tabIndex={-1}>
      {resolvedPage === 'home' && <HomePage />}
      {resolvedPage === 'features' && <FeaturesPage />}
      {resolvedPage === 'pricing' && <PricingSection detailed />}
      {resolvedPage === 'blog' && <BlogIndexPage />}
      {resolvedPage === 'blog-post' && <BlogPostPage />}
      {resolvedPage === 'learn' && <TutorialIndexPage />}
      {resolvedPage === 'learn-post' && <TutorialPostPage />}
      {resolvedPage === 'solutions-index' && <SolutionsHubPage />}
      {resolvedPage === 'solution' && <SolutionPage />}
      {resolvedPage === 'updates' && <ResourcesPage kind="updates" />}
      {resolvedPage === 'about' && <CmsStaticPage slug="about" fallbackTitle="دربارهٔ ما" />}
      {resolvedPage === 'privacy' && <CmsStaticPage slug="privacy" fallbackTitle="حریم خصوصی" />}
      {resolvedPage === 'terms' && <CmsStaticPage slug="terms" fallbackTitle="شرایط استفاده" />}
      {resolvedPage === 'rules' && <CmsStaticPage slug="rules" fallbackTitle="قوانین و مقررات" />}
      {resolvedPage === 'sla' && <CmsStaticPage slug="sla" fallbackTitle="توافق‌نامهٔ سطح خدمات (SLA)" />}
      {(resolvedPage === 'contact' || resolvedPage === 'demo') && <ContactPage isDemo={resolvedPage === 'demo'} />}
      </div>
      <Footer />
      <UserAnnouncementsPopupHost
        items={popupAnnouncements}
        onDismiss={dismissAnnouncement}
      />
    </div>
    </MotionConfig>
  );
};

export default PublicSite;
