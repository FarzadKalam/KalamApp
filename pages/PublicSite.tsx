import React, { FormEvent, useMemo, useState } from 'react';
import { App } from 'antd';
import {
  ApiOutlined,
  ArrowLeftOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  MailOutlined,
  MessageOutlined,
  NodeIndexOutlined,
  PhoneOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getMarketingPanelUrl, getMarketingSiteBasePath } from '../utils/hostRouting';

type PublicPage = 'home' | 'features' | 'pricing' | 'blog' | 'blog-post' | 'learn' | 'learn-post' | 'updates' | 'about' | 'contact' | 'demo';

const PANEL_URL = getMarketingPanelUrl();
const SITE_BASE = getMarketingSiteBasePath();
const sitePath = (path = '/') => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!SITE_BASE) return normalized;
  return normalized === '/' ? SITE_BASE : `${SITE_BASE}${normalized}`;
};

const nav = [
  ['امکانات', sitePath('/features')],
  ['تعرفه‌ها', sitePath('/pricing')],
  ['آموزش‌ها', sitePath('/learn')],
  ['بلاگ', sitePath('/blog')],
  ['تازه‌ها', sitePath('/updates')],
] as const;

const featureCards = [
  ['هوش مصنوعی سازمانی', 'دستیار هوشمند کنار رکورد، لیست و دانش سازمانی می‌نشیند و برای خلاصه، پاسخ و پیشنهاد اقدام کمک می‌کند.', <RobotOutlined />],
  ['الگوهای فرآیند', 'مسیرهایی مثل جذب مشتری، اجرای کمپین، تایید هزینه و تحویل پروژه را به الگوی قابل اجرا تبدیل کنید.', <NodeIndexOutlined />],
  ['چت داخلی و پیام روی رکورد', 'گفت‌وگو، فایل و تصمیم‌های مربوط به مشتری یا پروژه همان‌جا ثبت می‌شود که کار انجام می‌شود.', <MessageOutlined />],
  ['فایل‌ها و دانش سازمان', 'پیوست‌ها، تصاویر، اسناد و فایل‌های کاری از حالت پراکنده خارج می‌شوند و به رکوردها وصل می‌شوند.', <FolderOpenOutlined />],
  ['بات، پیامک و VoIP', 'ارتباط با مشتری از کانال‌های بیرونی وارد سیستم می‌شود و گزارش تماس‌ها و پیام‌ها قابل پیگیری است.', <ApiOutlined />],
  ['داشبورد مدیریتی', 'مدیر از وضعیت سرنخ‌ها، پروژه‌ها، فعالیت‌ها، فاکتورها، هزینه‌ها و اجرای فرآیندها تصویر یکپارچه می‌گیرد.', <BarChartOutlined />],
] as const;

const plans = [
  ['ابری شروع', '۲,۹۰۰,۰۰۰', '۵ کاربر شامل', 'کاربر اضافه: ۳۵۰ هزار تومان', 'برای شروع نظم فروش، مشتری و پروژه', ['CRM و سرنخ‌ها', 'پروژه و فعالیت', 'فاکتور و هزینه ساده', '۲۰GB فایل', 'داشبورد پایه']],
  ['ابری رشد', '۶,۹۰۰,۰۰۰', '۱۰ کاربر شامل', 'کاربر اضافه: ۴۹۰ هزار تومان', 'پیشنهادی برای شرکت‌های خدماتی و تبلیغاتی', ['همه امکانات شروع', 'فرآیندها و اتوماسیون', 'چت داخلی', 'بات، پیامک و VoIP', 'AI و دانش سازمانی محدود'], 'recommended'],
  ['ابری سازمانی', '۱۳,۹۰۰,۰۰۰', '۲۰ کاربر شامل', 'کاربر اضافه: ۶۹۰ هزار تومان', 'برای سازمانی که سیستم را مرکز عملیات می‌خواهد', ['حسابداری و نقد و بانک', 'سامانه مودیان', 'گزارش‌ساز', 'دسترسی پیشرفته', '۳۰۰GB فایل']],
] as const;

const faq = [
  ['آیا تازه سیستم جایگزین CRM است؟', 'بله، اما فقط CRM نیست. مشتری، سرنخ، پروژه، فعالیت، فرآیند، فایل، ارتباطات و گزارش مدیریتی کنار هم قرار می‌گیرند.'],
  ['آیا جایگزین حسابداری هم می‌شود؟', 'برای عملیات مالی، فاکتور، هزینه، نقد و بانک و حسابداری دوبل آماده شده است؛ مهاجرت رسمی بعد از بررسی وضعیت حسابداری انجام می‌شود.'],
  ['نسخه لوکال دارید؟', 'بله. نسخه لوکال برای سازمان‌هایی است که نصب روی سرور خودشان، کنترل کامل داده و قرارداد اختصاصی می‌خواهند.'],
  ['هزینه AI و پیامک چطور محاسبه می‌شود؟', 'مصرف سرویس‌های بیرونی مثل پیامک، تماس، فضای اضافه و AI مازاد جدا از اشتراک نرم‌افزار محاسبه می‌شود.'],
  ['مهاجرت از CRM قبلی ممکن است؟', 'بله. داده‌های مشتریان، سرنخ‌ها و فایل‌های ساختارمند پس از بررسی کیفیت داده منتقل می‌شوند.'],
  ['داده‌ها کجا نگهداری می‌شوند؟', 'در نسخه ابری روی زیرساخت مدیریت‌شده تازه سیستم و در نسخه لوکال روی زیرساخت سازمان شما نگهداری می‌شود.'],
] as const;

const SectionTitle = ({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) => (
  <div className="mx-auto mb-10 max-w-3xl text-center">
    <div className="text-sm font-black text-teal-700">{eyebrow}</div>
    <h2 className="mt-3 text-3xl font-black leading-tight text-zinc-950 md:text-4xl">{title}</h2>
    <p className="mt-4 text-base leading-8 text-zinc-600">{text}</p>
  </div>
);

const Header = () => (
  <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
    <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
      <Link to={sitePath('/')} className="flex items-center gap-3 text-zinc-950">
        <img src="/tazesystem_logo.png" alt="لوگوی تازه سیستم" className="h-11 w-11 rounded-lg object-contain" />
        <div className="leading-tight">
          <div className="text-lg font-black">تازه سیستم</div>
          <div className="text-xs font-medium text-zinc-500">TazeSystem</div>
        </div>
      </Link>
      <nav className="hidden items-center gap-7 text-sm font-semibold text-zinc-700 lg:flex">
        {nav.map(([label, href]) => <Link key={href} to={href} className="hover:text-zinc-950">{label}</Link>)}
      </nav>
      <div className="flex items-center gap-2">
        <a href={PANEL_URL} className="hidden rounded-lg px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-100 sm:inline-flex">ورود به پنل</a>
        <Link to={sitePath('/demo')} className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-black text-white hover:bg-zinc-800">درخواست دمو</Link>
      </div>
    </div>
  </header>
);

const Footer = () => (
  <footer className="border-t border-zinc-200 bg-white">
    <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
      <div>
        <Link to={sitePath('/')} className="inline-flex items-center gap-3 text-zinc-950">
          <img src="/tazesystem_logo.png" alt="تازه سیستم" className="h-10 w-10 rounded-lg object-contain" />
          <span className="text-lg font-black">تازه سیستم</span>
        </Link>
        <p className="mt-4 max-w-sm text-sm leading-7 text-zinc-600">نرم‌افزار یکپارچه مدیریت عملیات سازمان؛ از مشتری و پروژه تا فرآیند، فایل، چت، مالی و گزارش مدیریتی.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {['اینماد', 'ساماندهی', 'درگاه پرداخت'].map((item) => <span key={item} className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">{item}: در حال دریافت</span>)}
        </div>
      </div>
      <FooterColumn title="محصول" items={[['امکانات', sitePath('/features')], ['تعرفه‌ها', sitePath('/pricing')], ['درخواست دمو', sitePath('/demo')], ['ورود به پنل', PANEL_URL]]} />
      <FooterColumn title="منابع" items={[['بلاگ', sitePath('/blog')], ['آموزش‌ها', sitePath('/learn')], ['تازه‌های محصول', sitePath('/updates')], ['درباره ما', sitePath('/about')]]} />
      <div>
        <h3 className="text-sm font-bold text-zinc-950">ارتباط</h3>
        <div className="mt-4 grid gap-3 text-sm text-zinc-600">
          <Link to={sitePath('/contact')}>تماس با ما</Link>
          <a href="mailto:hello@tazesystem.ir">hello@tazesystem.ir</a>
          <a href="tel:+982100000000">۰۲۱-۰۰۰۰۰۰۰۰</a>
          <span>حریم خصوصی | شرایط استفاده | SLA</span>
        </div>
      </div>
    </div>
    <div className="border-t border-zinc-100 px-5 py-5 text-center text-xs text-zinc-500">© {new Date().getFullYear()} TazeSystem. تمام حقوق برای تازه سیستم محفوظ است.</div>
  </footer>
);

const FooterColumn = ({ title, items }: { title: string; items: ReadonlyArray<readonly [string, string]> }) => (
  <div>
    <h3 className="text-sm font-bold text-zinc-950">{title}</h3>
    <div className="mt-4 grid gap-3 text-sm text-zinc-600">
      {items.map(([label, href]) => href.startsWith('http') ? <a key={href} href={href}>{label}</a> : <Link key={href} to={href}>{label}</Link>)}
    </div>
  </div>
);

const ProductMockup = () => (
  <div className="relative mx-auto max-w-2xl rounded-lg border border-zinc-200 bg-white p-3 shadow-[0_22px_70px_rgba(24,24,27,0.13)]">
    <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-3">
      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rose-500" /><span className="h-3 w-3 rounded-full bg-amber-400" /><span className="h-3 w-3 rounded-full bg-teal-500" /></div>
      <span className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">داشبورد عملیات</span>
    </div>
    <div className="grid gap-3 p-3 lg:grid-cols-[1.1fr_.9fr]">
      <div className="space-y-3">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-4 flex items-center justify-between"><span className="text-sm font-black text-zinc-950">مسیر اجرای کمپین</span><span className="rounded-lg bg-teal-100 px-2 py-1 text-xs font-bold text-teal-800">۷۲٪ پیشرفت</span></div>
          {['دریافت brief', 'تایید طرح', 'اجرای رسانه', 'تحویل گزارش'].map((item, index) => (
            <div key={item} className="mb-3 flex items-center gap-3">
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black ${index < 3 ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-500 ring-1 ring-zinc-200'}`}>{index + 1}</span>
              <div className="h-2 flex-1 rounded-full bg-zinc-200"><div className={`${index < 3 ? 'w-full bg-teal-500' : 'w-1/3 bg-amber-400'} h-2 rounded-full`} /></div>
              <span className="w-24 text-xs font-bold text-zinc-600">{item}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[['سرنخ جدید', '۲۴'], ['پروژه فعال', '۱۲'], ['فاکتور ماه', '۸۴۰م']].map(([label, value]) => <div key={label} className="rounded-lg border border-zinc-200 bg-white p-3"><div className="text-xs text-zinc-500">{label}</div><div className="mt-2 text-xl font-black text-zinc-950">{value}</div></div>)}
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-black text-zinc-950"><RobotOutlined className="text-rose-600" />دستیار هوشمند</div>
          <p className="mt-3 rounded-lg bg-zinc-100 p-3 text-sm leading-7 text-zinc-700">این مشتری دو پیگیری عقب‌افتاده دارد. پیشنهاد: تماس امروز و ارسال پروپوزال اصلاح‌شده.</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-4 text-white">
          <div className="text-sm font-black">گفت‌وگوی تیم پروژه</div>
          <div className="mt-3 space-y-2 text-xs leading-6 text-zinc-200"><p>فایل طرح نهایی روی رکورد پروژه ثبت شد.</p><p className="rounded-lg bg-white/10 p-2">تایید مدیر رسانه برای مرحله بعد گرفته شد.</p></div>
        </div>
      </div>
    </div>
  </div>
);

const DemoForm = ({ dark = false }: { dark?: boolean }) => {
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', company: '', users: '', need: '' });
  const inputClass = 'rounded-lg border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-950';
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.fullName.trim() || !form.phone.trim()) {
      message.warning('نام و موبایل را وارد کنید.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('marketing_leads').insert({
        name: `درخواست دمو تازه سیستم - ${form.company || form.fullName}`,
        business_name: form.company || null,
        first_name: form.fullName,
        mobile: form.phone,
        status: 'new',
        lead_type: 'new_lead',
        source: 'website',
        description: [form.need, form.users ? `تعداد کاربر: ${form.users}` : ''].filter(Boolean).join('\n'),
      });
      if (error) throw error;
      message.success('درخواست شما ثبت شد. برای هماهنگی دمو با شما تماس می‌گیریم.');
      setForm({ fullName: '', phone: '', company: '', users: '', need: '' });
    } catch {
      message.info('درخواست آماده شد. اگر ثبت مستقیم فعال نبود، از تماس یا ایمیل سایت استفاده کنید.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <form onSubmit={submit} className={`rounded-lg border p-5 shadow-sm md:p-7 ${dark ? 'border-white/10 bg-white text-zinc-950' : 'border-zinc-200 bg-white'}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold text-zinc-700">نام و نام خانوادگی<input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={inputClass} placeholder="مثلاً علی رضایی" /></label>
        <label className="grid gap-2 text-sm font-bold text-zinc-700">موبایل<input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} placeholder="۰۹۱۲..." /></label>
        <label className="grid gap-2 text-sm font-bold text-zinc-700">نام شرکت<input value={form.company} onChange={(e) => set('company', e.target.value)} className={inputClass} placeholder="نام سازمان" /></label>
        <label className="grid gap-2 text-sm font-bold text-zinc-700">تعداد کاربران<input value={form.users} onChange={(e) => set('users', e.target.value)} className={inputClass} placeholder="مثلاً ۱۰ نفر" /></label>
      </div>
      <label className="mt-4 grid gap-2 text-sm font-bold text-zinc-700">نیاز اصلی شما<textarea value={form.need} onChange={(e) => set('need', e.target.value)} className={`${inputClass} min-h-28`} placeholder="CRM، پروژه، فرآیند، حسابداری، نسخه لوکال..." /></label>
      <button disabled={submitting} className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-zinc-950 px-5 py-3 text-sm font-black text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'در حال ثبت...' : 'ثبت درخواست دمو'}</button>
    </form>
  );
};

const PricingSection = ({ detailed = false }: { detailed?: boolean }) => (
  <section className="bg-white px-5 py-20">
    <div className="mx-auto max-w-7xl">
      <SectionTitle eyebrow="تعرفه‌ها" title="پلنی انتخاب کنید که با تیم شما رشد کند" text="مدل قیمت‌گذاری تازه سیستم ترکیبی از هزینه پایه پکیج و کاربر اضافه است تا رشد تیم قابل پیش‌بینی بماند." />
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map(([name, price, users, extra, description, features, tag]) => {
          const highlighted = tag === 'recommended';
          return (
            <div key={name} className={`rounded-lg border p-6 ${highlighted ? 'border-zinc-950 bg-zinc-950 text-white shadow-xl' : 'border-zinc-200 bg-white text-zinc-950'}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black">{name}</h3>
                {highlighted && <span className="rounded-lg bg-teal-400 px-3 py-1 text-xs font-black text-zinc-950">پیشنهادی</span>}
              </div>
              <p className={`mt-3 text-sm leading-7 ${highlighted ? 'text-zinc-200' : 'text-zinc-600'}`}>{description}</p>
              <div className="mt-6"><span className="text-4xl font-black">{price}</span><span className={`mr-2 text-sm ${highlighted ? 'text-zinc-300' : 'text-zinc-500'}`}>تومان / ماه</span></div>
              <div className={`mt-3 text-sm font-bold ${highlighted ? 'text-zinc-200' : 'text-zinc-700'}`}>{users}</div>
              <div className={`mt-1 text-xs ${highlighted ? 'text-zinc-300' : 'text-zinc-500'}`}>{extra}</div>
              <ul className="mt-6 space-y-3">
                {features.map((item) => <li key={item} className="flex items-center gap-2 text-sm"><CheckCircleOutlined className={highlighted ? 'text-teal-300' : 'text-teal-600'} /><span>{item}</span></li>)}
              </ul>
              <Link to={sitePath('/demo')} className={`mt-7 inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-black ${highlighted ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-zinc-950 text-white hover:bg-zinc-800'}`}>درخواست دمو</Link>
            </div>
          );
        })}
      </div>
      <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-6 lg:flex lg:items-center lg:justify-between">
        <div>
          <h3 className="text-xl font-black text-zinc-950">نسخه لوکال کامل</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-600">نصب روی سرور سازمان شما، همه ماژول‌ها، کنترل کامل داده، قرارداد اختصاصی و پشتیبانی سالانه. قیمت پیشنهادی از ۲۹۰ میلیون تومان شروع می‌شود.</p>
        </div>
        <Link to={sitePath('/demo')} className="mt-5 inline-flex rounded-lg border border-zinc-950 px-5 py-3 text-sm font-black text-zinc-950 hover:bg-zinc-950 hover:text-white lg:mt-0">مشاوره نسخه لوکال</Link>
      </div>
      <p className="mt-5 text-center text-sm leading-7 text-zinc-500">هزینه پیامک، VoIP، مصرف AI مازاد، فضای اضافه، مهاجرت داده و توسعه اختصاصی جداگانه محاسبه می‌شود.</p>
      {!detailed && <div className="mt-6 text-center"><Link to={sitePath('/pricing')} className="inline-flex items-center gap-2 text-sm font-black text-zinc-950">مقایسه کامل پلن‌ها <ArrowLeftOutlined /></Link></div>}
    </div>
  </section>
);

const HomePage = () => (
  <>
    <section className="bg-[linear-gradient(180deg,#ffffff_0%,#f4f4f5_100%)] px-5 py-16 md:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[.95fr_1.05fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-black text-teal-800"><ThunderboltOutlined />تازه سیستم فقط CRM نیست</div>
          <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.35] text-zinc-950 md:text-6xl">سیستم عامل هوشمند کسب‌وکار شما</h1>
          <p className="mt-5 max-w-xl text-lg leading-9 text-zinc-600">مشتری، پروژه، فرآیند، چت، فایل، فاکتور، منابع انسانی و گزارش مدیریتی را در یک پنل فارسی و قابل سفارشی‌سازی مدیریت کنید.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={sitePath('/demo')} className="rounded-lg bg-zinc-950 px-6 py-3.5 text-sm font-black text-white hover:bg-zinc-800">درخواست دمو</Link>
            <Link to={sitePath('/features')} className="rounded-lg border border-zinc-300 bg-white px-6 py-3.5 text-sm font-black text-zinc-950 hover:border-zinc-950">مشاهده امکانات</Link>
          </div>
          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            {['۱ پنل برای CRM، پروژه و مالی', '۴ مسیر ابری و لوکال', 'AI-ready برای دانش سازمان'].map((item) => <div key={item} className="rounded-lg border border-zinc-200 bg-white p-4 text-sm font-bold leading-7 text-zinc-700">{item}</div>)}
          </div>
        </div>
        <ProductMockup />
      </div>
    </section>

    <section className="px-5 py-20">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.85fr_1.15fr]">
        <div>
          <div className="text-sm font-black text-rose-700">مسئله بازار</div>
          <h2 className="mt-3 text-3xl font-black leading-tight text-zinc-950 md:text-4xl">مدیریت واقعی وقتی ابزارها از هم جدا باشند سخت می‌شود</h2>
          <p className="mt-4 text-base leading-8 text-zinc-600">تازه سیستم برای سازمان‌هایی ساخته شده که نمی‌خواهند مشتری، پروژه، مالی، فایل و ارتباطاتشان در چند ابزار جدا از هم گم شود.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {['CRM جدا، حسابداری جدا و پیگیری‌ها در واتساپ', 'فایل‌های پروژه بین افراد، گروه‌ها و درایوها پخش می‌شود', 'مدیر برای دیدن وضعیت واقعی، باید از چند نفر گزارش بگیرد', 'فرآیندهای تکراری هر بار از اول و با خطای انسانی اجرا می‌شوند'].map((item) => <div key={item} className="rounded-lg border border-zinc-200 bg-white p-5 text-sm font-bold leading-7 text-zinc-700">{item}</div>)}
        </div>
      </div>
    </section>

    <section className="bg-zinc-950 px-5 py-20 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <div className="text-sm font-black text-teal-300">مزیت رقابتی</div>
          <h2 className="mt-3 text-3xl font-black leading-tight md:text-4xl">یکپارچگی که از فروش شروع می‌شود و به عملیات واقعی می‌رسد</h2>
          <p className="mt-4 text-base leading-8 text-zinc-300">تازه سیستم CRM، فرآیند، همکاری تیمی، فایل، ارتباطات، مالی و AI را در یک تجربه محصول کنار هم قرار می‌دهد.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {featureCards.map(([title, text, icon]) => <div key={title} className="rounded-lg border border-white/10 bg-white/[0.04] p-6"><div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white text-lg text-zinc-950">{icon}</div><h3 className="text-lg font-black">{title}</h3><p className="mt-3 text-sm leading-8 text-zinc-300">{text}</p></div>)}
        </div>
      </div>
    </section>

    <section className="bg-white px-5 py-20">
      <div className="mx-auto max-w-7xl">
        <SectionTitle eyebrow="سناریوی محصول" title="از اولین تماس تا گزارش مدیر، یک مسیر قابل پیگیری" text="هر مرحله صاحب، وضعیت، فایل، پیام، وظیفه و گزارش خودش را دارد؛ بدون اینکه تیم بین چند ابزار جابه‌جا شود." />
        <div className="grid gap-3 md:grid-cols-7">
          {['سرنخ', 'مشتری', 'پروژه', 'فرآیند', 'وظیفه', 'فاکتور', 'گزارش'].map((step, index) => <div key={step} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-sm font-black text-white">{index + 1}</div><div className="mt-3 text-sm font-black text-zinc-950">{step}</div></div>)}
        </div>
      </div>
    </section>

    <PricingSection />

    <section className="px-5 py-20">
      <div className="mx-auto max-w-7xl">
        <SectionTitle eyebrow="اعتمادسازی" title="برای استقرار واقعی در شرکت ایرانی طراحی شده است" text="فقط نمایش امکانات کافی نیست؛ استقرار، آموزش، خروجی داده و کنترل دسترسی از ابتدا در مدل محصول دیده شده است." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ['مناسب شرکت‌های ایرانی', 'فارسی، تقویم شمسی، نقش‌ها، پیامک داخلی و نیازهای عملیاتی ایران.', <SafetyCertificateOutlined />],
            ['ابری یا لوکال', 'شروع سریع ابری یا نصب کامل روی زیرساخت سازمان شما.', <CloudServerOutlined />],
            ['مالکیت و خروجی داده', 'داده‌های سازمان باید قابل خروج، قابل کنترل و قابل توسعه باقی بماند.', <DatabaseOutlined />],
            ['راه‌اندازی با آموزش', 'تمرکز فقط فروش نرم‌افزار نیست؛ مسیر استقرار و پذیرش تیم هم دیده می‌شود.', <TeamOutlined />],
          ].map(([title, text, icon]) => <div key={String(title)} className="rounded-lg border border-zinc-200 bg-white p-5"><div className="mb-4 text-2xl text-teal-700">{icon}</div><h3 className="font-black text-zinc-950">{title}</h3><p className="mt-2 text-sm leading-7 text-zinc-600">{text}</p></div>)}
        </div>
      </div>
    </section>

    <section className="bg-zinc-50 px-5 py-20">
      <div className="mx-auto max-w-7xl">
        <SectionTitle eyebrow="نظر کاربران" title="بازخوردهایی از مسیر راه‌اندازی" text="این بخش با نمونه‌های واقعی مشتریان تکمیل می‌شود؛ ساختار آن از ابتدا برای اعتمادسازی محصول آماده است." />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['مدیر عملیات', 'شرکت تبلیغاتی', 'برای ما مهم بود کار از لحظه ورود سرنخ تا اجرای پروژه و فاکتور، از هم جدا نباشد.'],
            ['مدیر فروش', 'شرکت خدماتی', 'پیگیری‌ها از چت و حافظه افراد بیرون آمد و هر مشتری مسئول، وضعیت و قدم بعدی مشخص دارد.'],
            ['مدیر مالی', 'سازمان متوسط', 'اتصال فروش، هزینه و گزارش مدیریتی باعث شد نگاه عملیاتی و مالی از هم جدا نماند.'],
          ].map(([name, role, text]) => <div key={name} className="rounded-lg border border-zinc-200 bg-white p-6"><p className="text-sm leading-8 text-zinc-700">«{text}»</p><div className="mt-5 border-t border-zinc-100 pt-4"><div className="font-black text-zinc-950">{name}</div><div className="text-sm text-zinc-500">{role}</div></div></div>)}
        </div>
      </div>
    </section>

    <section className="bg-white px-5 py-20">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.9fr_1.1fr]">
        <div><div className="text-sm font-black text-teal-700">سوالات پرتکرار</div><h2 className="mt-3 text-3xl font-black text-zinc-950">قبل از درخواست دمو</h2><p className="mt-4 text-base leading-8 text-zinc-600">پاسخ‌های کوتاه برای تصمیم اولیه. جزئیات در جلسه نیازسنجی بررسی می‌شود.</p></div>
        <div className="grid gap-3">{faq.map(([q, a]) => <details key={q} className="rounded-lg border border-zinc-200 bg-zinc-50 p-5"><summary className="cursor-pointer text-sm font-black text-zinc-950">{q}</summary><p className="mt-3 text-sm leading-8 text-zinc-600">{a}</p></details>)}</div>
      </div>
    </section>

    <section className="bg-zinc-950 px-5 py-20 text-white">
      <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[.9fr_1.1fr]">
        <div><div className="text-sm font-black text-teal-300">درخواست دمو</div><h2 className="mt-3 text-3xl font-black leading-tight md:text-4xl">ببینید تازه سیستم چطور با فرآیند شرکت شما می‌نشیند</h2><p className="mt-4 text-base leading-8 text-zinc-300">در دمو، مسیر واقعی شما را از سرنخ تا پروژه، فرآیند، فاکتور و گزارش مرور می‌کنیم.</p></div>
        <DemoForm dark />
      </div>
    </section>
  </>
);

const FeaturesPage = () => {
  const items = ['مدیریت مشتریان و سرنخ‌های بازاریابی', 'پروژه‌ها، وظایف، مسئول و زمان پیگیری', 'فرآیندها، الگوهای فرآیند و گزارش اجرا', 'چت داخلی، گروه‌ها و پیام روی رکوردها', 'فایل‌ها، پیوست‌ها و گالری اسناد', 'بات‌های تلگرام، بله و روبیکا', 'پیامک، VoIP و گزارش ارتباطات', 'فاکتور، هزینه، نقد و بانک و حسابداری', 'منابع انسانی، حضور، مرخصی و ماموریت', 'داشبورد، گزارش‌ساز و خروجی مدیریتی', 'نقش‌ها، دسترسی رکورد و دسترسی فیلد', 'وب‌فرم‌ها، فرم درخواست و مسیرهای عمومی'];
  return <main className="px-5 py-20"><div className="mx-auto max-w-7xl"><SectionTitle eyebrow="امکانات" title="ماژول‌هایی برای اداره عملیات روزانه" text="نسخه اول سایت، فهرست امکانات را خلاصه و واضح نشان می‌دهد؛ جزئیات هر ماژول در فاز بعدی به صفحه اختصاصی تبدیل می‌شود." /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.map((item) => <div key={item} className="rounded-lg border border-zinc-200 bg-white p-5 text-sm font-bold leading-7 text-zinc-700"><CheckCircleOutlined className="ml-2 text-teal-700" />{item}</div>)}</div></div></main>;
};

const ResourcesPage = ({ kind }: { kind: 'blog' | 'learn' | 'updates' }) => {
  const box = {
    blog: ['بلاگ', 'مقاله‌هایی برای مدیران در حال رشد', 'محتوای این بخش برای CRM، ERP، اتوماسیون، AI و مدیریت پروژه تکمیل می‌شود.', ['چرا CRM به‌تنهایی کافی نیست؟', 'مدیریت پروژه در شرکت تبلیغاتی', 'هوش مصنوعی در عملیات سازمانی']],
    learn: ['آموزش‌ها', 'راهنمای شروع و استفاده از محصول', 'آموزش‌های متنی و تصویری برای کاهش زمان راه‌اندازی و پشتیبانی.', ['شروع سریع با مشتریان', 'ساخت الگوی فرآیند', 'ثبت فایل و پیام روی رکورد']],
    updates: ['تازه‌های محصول', 'مسیر رشد تازه سیستم', 'قابلیت‌های جدید، بهبودها و تغییرات مهم محصول در این بخش منتشر می‌شود.', ['دستیار هوشمند کنار رکوردها', 'گروه‌های چت داخلی', 'گزارش اجرای فرآیندها']],
  }[kind] as [string, string, string, string[]];
  return <main className="px-5 py-20"><div className="mx-auto max-w-5xl"><SectionTitle eyebrow={box[0]} title={box[1]} text={box[2]} /><div className="grid gap-4">{box[3].map((item) => <article key={item} className="rounded-lg border border-zinc-200 bg-white p-6"><div className="text-xs font-black text-teal-700">{box[0]}</div><h2 className="mt-2 text-xl font-black text-zinc-950">{item}</h2><p className="mt-3 text-sm leading-8 text-zinc-600">این محتوا در نسخه عمومی سایت تکمیل می‌شود و فعلاً زیرساخت انتشار آن آماده است.</p></article>)}</div></div></main>;
};

const AboutPage = () => <main className="px-5 py-20"><div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.85fr_1.15fr]"><div><div className="text-sm font-black text-teal-700">درباره تازه سیستم</div><h1 className="mt-3 text-4xl font-black leading-tight text-zinc-950">نرم‌افزاری برای یکپارچه کردن کار واقعی شرکت‌ها</h1></div><div className="rounded-lg border border-zinc-200 bg-white p-7 text-base leading-9 text-zinc-600">تازه سیستم برای سازمان‌هایی ساخته می‌شود که بین CRM، حسابداری، فایل، پیام‌رسان، اکسل و پیگیری‌های دستی پراکنده شده‌اند. هدف ما ساخت محیطی است که مدیر، تیم فروش، پروژه، مالی و منابع انسانی تصویر مشترک و قابل اتکا داشته باشند.</div></div></main>;

const ContactPage = () => <main className="px-5 py-20"><div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.8fr_1.2fr]"><div><div className="text-sm font-black text-teal-700">تماس با ما</div><h1 className="mt-3 text-4xl font-black text-zinc-950">برای دمو، همکاری یا پشتیبانی پیام بدهید</h1><div className="mt-8 grid gap-3 text-sm text-zinc-600"><a className="flex items-center gap-3" href="tel:+982100000000"><PhoneOutlined /> ۰۲۱-۰۰۰۰۰۰۰۰</a><a className="flex items-center gap-3" href="mailto:hello@tazesystem.ir"><MailOutlined /> hello@tazesystem.ir</a></div></div><DemoForm /></div></main>;

const SimplePostPage = ({ type }: { type: 'blog' | 'learn' }) => <main className="px-5 py-20"><article className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-7"><div className="text-xs font-black text-teal-700">{type === 'blog' ? 'بلاگ' : 'آموزش'}</div><h1 className="mt-3 text-3xl font-black leading-tight text-zinc-950">{type === 'blog' ? 'چرا CRM به‌تنهایی برای شرکت‌های خدماتی کافی نیست؟' : 'شروع سریع با تازه سیستم'}</h1><p className="mt-5 text-base leading-9 text-zinc-600">این صفحه برای زیرساخت محتوایی سایت آماده شده است. محتوای کامل پس از نهایی شدن استراتژی انتشار و تصاویر محصول تکمیل می‌شود.</p></article></main>;

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
    if (path === '/demo') return 'demo';
    return 'home';
  }, [location.pathname, page]);
  return <div className="min-h-screen bg-zinc-50 text-zinc-950"><Header />{resolvedPage === 'home' && <HomePage />}{resolvedPage === 'features' && <FeaturesPage />}{resolvedPage === 'pricing' && <PricingSection detailed />}{resolvedPage === 'blog' && <ResourcesPage kind="blog" />}{resolvedPage === 'blog-post' && <SimplePostPage type="blog" />}{resolvedPage === 'learn' && <ResourcesPage kind="learn" />}{resolvedPage === 'learn-post' && <SimplePostPage type="learn" />}{resolvedPage === 'updates' && <ResourcesPage kind="updates" />}{resolvedPage === 'about' && <AboutPage />}{(resolvedPage === 'contact' || resolvedPage === 'demo') && <ContactPage />}<Footer /></div>;
};

export default PublicSite;
