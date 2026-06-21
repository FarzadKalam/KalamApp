import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ThunderboltOutlined } from '@ant-design/icons';
import { motion, useScroll, useTransform } from 'framer-motion';
import AiSparkleIcon from '../../ai/AiSparkleIcon';
import { BrandButton, Counter, Reveal, SectionHeading, SectionShell } from '../primitives';
import { renderIcon } from '../iconMap';
import type { IconItem, StatItem } from '../types';

const isInternal = (href: string) => href.startsWith('/') && !href.startsWith('//');

const Cta: React.FC<{ cta?: { label: string; href: string }; variant?: any }> = ({ cta, variant = 'solid' }) => {
  if (!cta?.label) return null;
  if (isInternal(cta.href)) {
    return (
      <Link to={cta.href}>
        <BrandButton href={cta.href} variant={variant}>{cta.label}</BrandButton>
      </Link>
    );
  }
  return <BrandButton href={cta.href} variant={variant}>{cta.label}</BrandButton>;
};

// شبکه نقطه‌چین محو شونده پس‌زمینه
const GridPattern: React.FC = () => (
  <div
    className="pointer-events-none absolute inset-0"
    aria-hidden
    style={{
      backgroundImage:
        'linear-gradient(rgb(var(--brand-500-rgb) / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--brand-500-rgb) / 0.06) 1px, transparent 1px)',
      backgroundSize: '42px 42px',
      maskImage: 'radial-gradient(ellipse 75% 70% at 50% 0%, black, transparent 75%)',
      WebkitMaskImage: 'radial-gradient(ellipse 75% 70% at 50% 0%, black, transparent 75%)',
    }}
  />
);

// ──────────────────────────────────────────────────
// HeroMockup: ماک‌آپ پیش‌فرض محیط نرم‌افزار
// ──────────────────────────────────────────────────
const HeroMockup: React.FC = () => (
  <div className="relative rounded-2xl border border-zinc-200 bg-white/90 p-3 shadow-[0_40px_120px_-20px_rgba(24,24,27,0.35)] backdrop-blur">
    <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-rose-400" />
        <span className="h-3 w-3 rounded-full bg-amber-400" />
        <span className="h-3 w-3 rounded-full" style={{ background: 'rgb(var(--brand-500-rgb))' }} />
      </div>
      <span className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">داشبورد عملیات</span>
    </div>
    <div className="grid gap-3 p-3 lg:grid-cols-[1.1fr_.9fr]">
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-black text-zinc-950">مسیر اجرای کمپین</span>
            <span className="rounded-lg px-2 py-1 text-xs font-bold text-white" style={{ background: 'rgb(var(--brand-600-rgb))' }}>۷۲٪ پیشرفت</span>
          </div>
          {['دریافت brief', 'تایید طرح', 'اجرای رسانه', 'تحویل گزارش'].map((item, index) => (
            <div key={item} className="mb-3 flex items-center gap-3">
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black ${index < 3 ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-500 ring-1 ring-zinc-200'}`}>{index + 1}</span>
              <div className="h-2 flex-1 rounded-full bg-zinc-200">
                <div className={`${index < 3 ? 'w-full' : 'w-1/3 bg-amber-400'} h-2 rounded-full`} style={index < 3 ? { background: 'rgb(var(--brand-500-rgb))' } : undefined} />
              </div>
              <span className="w-24 text-xs font-bold text-zinc-600">{item}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[['سرنخ جدید', '۲۴'], ['پروژه فعال', '۱۲'], ['فاکتور ماه', '۸۴۰م']].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="text-xs text-zinc-500">{label}</div>
              <div className="mt-2 text-xl font-black text-zinc-950">{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-black text-zinc-950"><AiSparkleIcon className="h-4 w-4" style={{ color: 'rgb(var(--brand-accent-pink-rgb))' }} />دستیار هوشمند</div>
          <p className="mt-3 rounded-lg bg-zinc-100 p-3 text-sm leading-7 text-zinc-700">این مشتری دو پیگیری عقب‌افتاده دارد. پیشنهاد: تماس امروز و ارسال پروپوزال اصلاح‌شده.</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-white">
          <div className="text-sm font-black">گفت‌وگوی تیم پروژه</div>
          <div className="mt-3 space-y-2 text-xs leading-6 text-zinc-200">
            <p>فایل طرح نهایی روی رکورد پروژه ثبت شد.</p>
            <p className="rounded-lg bg-white/10 p-2">تایید مدیر رسانه برای مرحله بعد گرفته شد.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// چیپ شناور کنار ماک‌آپ
const FloatingChip: React.FC<{ icon: React.ReactNode; title: string; sub: string; className?: string; style?: any }> = ({ icon, title, sub, className, style }) => (
  <motion.div
    style={style}
    className={`absolute z-20 hidden items-center gap-3 rounded-2xl border border-white/60 bg-white/80 p-3 shadow-xl backdrop-blur-md md:flex ${className ?? ''}`}
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: 'rgb(var(--brand-600-rgb))' }}>{icon}</span>
    <div>
      <div className="text-xs font-black text-zinc-900">{title}</div>
      <div className="text-[11px] text-zinc-500">{sub}</div>
    </div>
  </motion.div>
);

// ──────────────────────────────────────────────────
// Hero — با پارالاکس اسکرول
// ──────────────────────────────────────────────────
export const HeroSection: React.FC<{ props: any }> = ({ props }) => {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });

  const textY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const mockY = useTransform(scrollYProgress, [0, 1], [0, -70]);
  const mockScale = useTransform(scrollYProgress, [0, 1], [1, 0.93]);
  const blobA = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const blobB = useTransform(scrollYProgress, [0, 1], [0, -130]);
  const chip1Y = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const chip2Y = useTransform(scrollYProgress, [0, 1], [0, 50]);

  const badges: string[] = props.badges ?? [];

  return (
    <section ref={ref} className="relative overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f6f6f7_55%,#eef0f3_100%)] px-5 pb-20 pt-16 md:pb-28 md:pt-24">
      <GridPattern />
      {/* aurora blobs پارالاکس */}
      <motion.div style={{ y: blobA }} aria-hidden className="pointer-events-none absolute -top-32 right-[-8%] h-[460px] w-[460px] rounded-full blur-[130px]" >
        <div className="h-full w-full rounded-full" style={{ background: 'rgb(var(--brand-500-rgb) / 0.5)' }} />
      </motion.div>
      <motion.div style={{ y: blobB }} aria-hidden className="pointer-events-none absolute bottom-[-25%] left-[-8%] h-[400px] w-[400px] rounded-full blur-[130px]">
        <div className="h-full w-full rounded-full" style={{ background: 'rgb(var(--brand-accent-pink-rgb) / 0.4)' }} />
      </motion.div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[.98fr_1.02fr]">
        <motion.div style={{ y: textY, opacity: textOpacity }}>
          {props.eyebrow && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-black shadow-sm"
              style={{ borderColor: 'rgb(var(--brand-200-rgb))', background: 'rgb(var(--brand-50-rgb) / 0.7)', color: 'rgb(var(--brand-700-rgb))' }}
            >
              <ThunderboltOutlined />{props.eyebrow}
            </motion.div>
          )}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-6 max-w-2xl text-4xl font-black leading-[1.3] md:text-6xl"
            style={{
              backgroundImage: 'linear-gradient(115deg, #18181b 30%, rgb(var(--brand-600-rgb)) 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {props.title}
          </motion.h1>
          {props.subtitle && (
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-5 max-w-xl text-lg leading-9 text-zinc-600"
            >
              {props.subtitle}
            </motion.p>
          )}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="mt-8 flex flex-wrap gap-3">
            <Cta cta={props.primaryCta} variant="solid" />
            <Cta cta={props.secondaryCta} variant="outline" />
          </motion.div>
          {badges.length > 0 && (
            <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
              {badges.map((item, i) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.28 + i * 0.08 }}
                  className="rounded-xl border border-zinc-200 bg-white/70 p-4 text-sm font-bold leading-7 text-zinc-700 backdrop-blur"
                >
                  {item}
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div style={{ y: mockY, scale: mockScale }} className="relative mx-auto w-full max-w-2xl">
          {props.mediaType === 'image' && props.imageUrl ? (
            <img src={props.imageUrl} alt={props.title} className="rounded-2xl border border-zinc-200 shadow-[0_40px_120px_-20px_rgba(24,24,27,0.35)]" />
          ) : (
            <>
              <HeroMockup />
              <FloatingChip style={{ y: chip1Y, top: '-6%', insetInlineStart: '-7%' }} icon={<AiSparkleIcon className="h-5 w-5" />} title="پیشنهاد هوشمند" sub="اقدام بعدی آماده شد" />
              <FloatingChip style={{ y: chip2Y, bottom: '-8%', insetInlineEnd: '-6%' }} icon={<ThunderboltOutlined />} title="اتومات اجرا شد" sub="۳ وظیفه ساخته شد" />
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
};

// ──────────────────────────────────────────────────
// Logos / trust bar
// ──────────────────────────────────────────────────
export const LogosSection: React.FC<{ props: any }> = ({ props }) => {
  const items: Array<{ label?: string; imageUrl?: string }> = props.items ?? [];
  return (
    <section className="border-y border-zinc-100 bg-white px-5 py-10">
      <div className="mx-auto max-w-7xl">
        {props.title && <div className="mb-6 text-center text-sm font-bold text-zinc-400">{props.title}</div>}
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 opacity-70">
          {items.map((it, i) =>
            it.imageUrl ? (
              <img key={i} src={it.imageUrl} alt={it.label ?? ''} className="h-8 object-contain grayscale" />
            ) : (
              <span key={i} className="text-lg font-black text-zinc-400">{it.label}</span>
            ),
          )}
        </div>
      </div>
    </section>
  );
};

// ──────────────────────────────────────────────────
// Stats — باند آماری اسکرول‌محور (پارالاکس افقی + گرادینت متحرک)
// ──────────────────────────────────────────────────
export const StatsSection: React.FC<{ props: any }> = ({ props }) => {
  const items: StatItem[] = props.items ?? [];
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const glowX = useTransform(scrollYProgress, [0, 1], ['10%', '90%']);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden px-5 py-24 text-white"
      style={{ background: 'linear-gradient(135deg, rgb(var(--brand-800-rgb)), #0a0a0b 70%)' }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 h-[420px] w-[420px] -translate-y-1/3 rounded-full blur-[140px]"
        style={{ left: glowX, background: 'rgb(var(--brand-500-rgb) / 0.45)' }}
      />
      <div className="relative mx-auto max-w-7xl">
        {(props.title || props.eyebrow) && (
          <SectionHeading eyebrow={props.eyebrow} title={props.title ?? ''} text={props.text} invert />
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((s, i) => (
            <Reveal
              key={i}
              delay={i * 0.1}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-center transition hover:bg-white/[0.08]"
            >
              <div
                className="absolute inset-x-0 -top-px mx-auto h-px w-2/3 opacity-60"
                style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--brand-400-rgb)), transparent)' }}
              />
              <div className="text-5xl font-black tracking-tight md:text-6xl" style={{ color: 'rgb(var(--brand-300-rgb))' }}>
                <Counter to={s.value} suffix={s.suffix} />
              </div>
              <div className="mt-3 text-sm font-bold text-zinc-300">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

// ──────────────────────────────────────────────────
// Features — Bento grid
// ──────────────────────────────────────────────────
export const FeaturesSection: React.FC<{ props: any }> = ({ props }) => {
  const items: IconItem[] = props.items ?? [];
  const tone = props.tone ?? 'soft';
  const invert = tone === 'dark' || tone === 'brand';
  return (
    <SectionShell tone={tone} aurora={invert}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} invert={invert} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <Reveal
            key={item.title}
            delay={i * 0.06}
            className={`group rounded-2xl border p-6 transition hover:-translate-y-1 ${
              invert ? 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]' : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-lg'
            } ${item.featured ? 'md:col-span-2' : ''}`}
          >
            <div
              className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl text-lg"
              style={{ background: invert ? '#fff' : 'rgb(var(--brand-50-rgb))', color: invert ? '#18181b' : 'rgb(var(--brand-600-rgb))' }}
            >
              {renderIcon(item.icon)}
            </div>
            <h3 className={`text-lg font-black ${invert ? 'text-white' : 'text-zinc-950'}`}>{item.title}</h3>
            {item.text && <p className={`mt-3 text-sm leading-8 ${invert ? 'text-zinc-300' : 'text-zinc-600'}`}>{item.text}</p>}
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
};
