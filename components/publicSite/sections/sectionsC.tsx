import React, { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { Reveal, SectionHeading, SectionShell } from '../primitives';
import DemoForm from '../shared/DemoForm';

// ──────────────────────────────────────────────────
// Calendar — نمای تقویم
// ──────────────────────────────────────────────────
const WEEK_DAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const toFa = (n: number) => n.toLocaleString('fa-IR');

export const CalendarSection: React.FC<{ props: any }> = ({ props }) => {
  const events: Array<{ day: number; title: string; tone?: 'brand' | 'amber' | 'rose' }> = props.events ?? [];
  const eventByDay = new Map(events.map((e) => [Number(e.day), e]));
  const days = Array.from({ length: 35 }, (_, i) => i - 2); // چند روز خالی ابتدای ماه

  return (
    <SectionShell tone={props.tone ?? 'soft'}>
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
        <Reveal>
          <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} align="start" />
          {Array.isArray(props.highlights) && (
            <ul className="space-y-3">
              {props.highlights.map((h: string) => (
                <li key={h} className="flex items-center gap-2 text-sm font-bold text-zinc-700">
                  <CheckCircleOutlined style={{ color: 'rgb(var(--brand-600-rgb))' }} />{h}
                </li>
              ))}
            </ul>
          )}
        </Reveal>
        <Reveal delay={0.12} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_70px_rgba(24,24,27,0.12)]">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-base font-black text-zinc-950">{props.monthLabel ?? 'تقویم این ماه'}</span>
            <div className="flex gap-1 text-zinc-400">
              <ArrowRightOutlined /><ArrowLeftOutlined />
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-zinc-400">
            {WEEK_DAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              const valid = day >= 1 && day <= 30;
              const ev = valid ? eventByDay.get(day) : undefined;
              const toneBg = ev?.tone === 'amber' ? '#f59e0b' : ev?.tone === 'rose' ? '#f43f5e' : 'rgb(var(--brand-600-rgb))';
              return (
                <div key={idx} className={`relative aspect-square rounded-lg border text-[11px] ${valid ? 'border-zinc-100 bg-zinc-50' : 'border-transparent'}`}>
                  {valid && <span className="absolute right-1 top-1 text-zinc-500">{toFa(day)}</span>}
                  {ev && (
                    <span className="absolute inset-x-1 bottom-1 truncate rounded px-1 py-0.5 text-[9px] font-bold text-white" style={{ background: toneBg }}>
                      {ev.title}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </SectionShell>
  );
};

// ──────────────────────────────────────────────────
// Screenshots — اسلایدر «ورق زدن محیط» (embla)
// ──────────────────────────────────────────────────
export const ScreenshotsSection: React.FC<{ props: any }> = ({ props }) => {
  const images: Array<{ url: string; caption?: string }> = props.images ?? [];
  const [emblaRef, emblaApi] = useEmblaCarousel({ direction: 'rtl', loop: true, align: 'center' });
  const [selected, setSelected] = useState(0);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    onSelect();
  }, [emblaApi, onSelect]);

  const tone = props.tone ?? 'dark';
  const invert = tone === 'dark' || tone === 'brand';

  return (
    <SectionShell tone={tone} aurora={invert}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} invert={invert} />
      {images.length === 0 ? (
        <div className={`mx-auto max-w-3xl rounded-2xl border p-12 text-center text-sm ${invert ? 'border-white/10 bg-white/5 text-zinc-400' : 'border-dashed border-zinc-300 bg-zinc-50 text-zinc-400'}`}>
          اسکرین‌شات‌های محیط نرم‌افزار به‌زودی از پنل مدیریت اضافه می‌شوند.
        </div>
      ) : (
        <>
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {images.map((img, i) => (
                <div key={i} className="min-w-0 flex-[0_0_85%] px-2 md:flex-[0_0_70%]">
                  <div className={`overflow-hidden rounded-2xl border ${invert ? 'border-white/10' : 'border-zinc-200'} shadow-2xl`}>
                    <img src={img.url} alt={img.caption ?? ''} className="w-full object-cover" />
                  </div>
                  {img.caption && <div className={`mt-3 text-center text-sm font-bold ${invert ? 'text-zinc-300' : 'text-zinc-600'}`}>{img.caption}</div>}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button onClick={() => emblaApi?.scrollPrev()} className={`flex h-10 w-10 items-center justify-center rounded-full border ${invert ? 'border-white/20 text-white hover:bg-white/10' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'}`}>
              <ArrowRightOutlined />
            </button>
            <div className="flex gap-1.5">
              {images.map((_, i) => (
                <button key={i} onClick={() => emblaApi?.scrollTo(i)} className="h-2 rounded-full transition-all" style={{ width: i === selected ? 24 : 8, background: i === selected ? 'rgb(var(--brand-500-rgb))' : invert ? 'rgba(255,255,255,.3)' : '#d4d4d8' }} />
              ))}
            </div>
            <button onClick={() => emblaApi?.scrollNext()} className={`flex h-10 w-10 items-center justify-center rounded-full border ${invert ? 'border-white/20 text-white hover:bg-white/10' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'}`}>
              <ArrowLeftOutlined />
            </button>
          </div>
        </>
      )}
    </SectionShell>
  );
};

// ──────────────────────────────────────────────────
// Comparison — جدول مقایسه با رقبا
// ──────────────────────────────────────────────────
export const ComparisonSection: React.FC<{ props: any }> = ({ props }) => {
  const columns: string[] = props.columns ?? ['تازه سیستم', 'نرم‌افزارهای دیگر'];
  const rows: Array<{ feature: string; values: Array<boolean | string> }> = props.rows ?? [];
  const renderCell = (v: boolean | string) => {
    if (v === true) return <CheckCircleOutlined style={{ color: 'rgb(var(--brand-600-rgb))', fontSize: 18 }} />;
    if (v === false) return <CloseCircleOutlined className="text-zinc-300" style={{ fontSize: 18 }} />;
    return <span className="text-sm font-bold text-zinc-700">{v}</span>;
  };
  return (
    <SectionShell tone={props.tone ?? 'light'}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} />
      <Reveal className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 overflow-hidden rounded-2xl border border-zinc-200">
          <thead>
            <tr>
              <th className="bg-zinc-50 p-4 text-right text-sm font-black text-zinc-500">ویژگی</th>
              {columns.map((col, i) => (
                <th key={col} className={`p-4 text-center text-sm font-black ${i === 0 ? 'text-white' : 'bg-zinc-50 text-zinc-700'}`} style={i === 0 ? { background: 'rgb(var(--brand-600-rgb))' } : undefined}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.feature} className={ri % 2 ? 'bg-zinc-50/50' : 'bg-white'}>
                <td className="border-t border-zinc-100 p-4 text-right text-sm font-bold text-zinc-800">{row.feature}</td>
                {row.values.map((v, ci) => (
                  <td key={ci} className={`border-t border-zinc-100 p-4 text-center ${ci === 0 ? 'bg-[rgb(var(--brand-50-rgb)/0.5)]' : ''}`}>{renderCell(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
    </SectionShell>
  );
};

// ──────────────────────────────────────────────────
// Testimonials — نظر مشتریان
// ──────────────────────────────────────────────────
export const TestimonialsSection: React.FC<{ props: any }> = ({ props }) => {
  const items: Array<{ name: string; role: string; text: string; avatarUrl?: string }> = props.items ?? [];
  return (
    <SectionShell tone={props.tone ?? 'soft'}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} />
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((t, i) => (
          <Reveal key={t.name} delay={i * 0.08} className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm leading-8 text-zinc-700">«{t.text}»</p>
            <div className="mt-5 flex items-center gap-3 border-t border-zinc-100 pt-4">
              {t.avatarUrl ? (
                <img src={t.avatarUrl} alt={t.name} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: 'rgb(var(--brand-500-rgb))' }}>{t.name.charAt(0)}</span>
              )}
              <div>
                <div className="font-black text-zinc-950">{t.name}</div>
                <div className="text-sm text-zinc-500">{t.role}</div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
};

// ──────────────────────────────────────────────────
// FAQ — سوالات پرتکرار
// ──────────────────────────────────────────────────
export const FaqSection: React.FC<{ props: any }> = ({ props }) => {
  const items: Array<{ q: string; a: string }> = props.items ?? [];
  return (
    <SectionShell tone={props.tone ?? 'light'}>
      <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
        <div>
          <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} align="start" />
        </div>
        <div className="grid gap-3">
          {items.map(({ q, a }) => (
            <details key={q} className="group rounded-2xl border border-zinc-200 bg-zinc-50 p-5 transition open:bg-white open:shadow-sm">
              <summary className="cursor-pointer list-none text-sm font-black text-zinc-950">{q}</summary>
              <p className="mt-3 text-sm leading-8 text-zinc-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </SectionShell>
  );
};

// ──────────────────────────────────────────────────
// CTA — فراخوان نهایی + فرم دمو
// ──────────────────────────────────────────────────
export const CtaSection: React.FC<{ props: any }> = ({ props }) => (
  <SectionShell tone="dark" aurora>
    <div className="grid items-center gap-8 lg:grid-cols-[.9fr_1.1fr]">
      <Reveal>
        <div className="text-sm font-black" style={{ color: 'rgb(var(--brand-300-rgb))' }}>{props.eyebrow ?? 'درخواست دمو'}</div>
        <h2 className="mt-3 text-3xl font-black leading-tight text-white md:text-4xl">{props.title}</h2>
        {props.text && <p className="mt-4 text-base leading-8 text-zinc-300">{props.text}</p>}
      </Reveal>
      <Reveal delay={0.12}>
        <DemoForm dark />
      </Reveal>
    </div>
  </SectionShell>
);

// ──────────────────────────────────────────────────
// Feature Slider — اسلایدر با مدیا (تصویر/گیف/ویدیو) برای هر اسلاید
// ──────────────────────────────────────────────────
const isVideoUrl = (url?: string) => !!url && /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(url);

const SlideMedia: React.FC<{ url?: string; title?: string; invert?: boolean }> = ({ url, title, invert }) => {
  if (!url) {
    return (
      <div className={`flex aspect-video w-full items-center justify-center rounded-2xl border text-sm ${invert ? 'border-white/10 bg-white/5 text-zinc-400' : 'border-dashed border-zinc-300 bg-zinc-50 text-zinc-400'}`}>
        تصویر/ویدیو این اسلاید از پنل مدیریت اضافه می‌شود
      </div>
    );
  }
  if (isVideoUrl(url)) {
    return <video src={url} autoPlay muted loop playsInline className="aspect-video w-full rounded-2xl object-cover shadow-lg" />;
  }
  return <img src={url} alt={title ?? ''} className="aspect-video w-full rounded-2xl object-cover shadow-lg" />;
};

export const FeatureSliderSection: React.FC<{ props: any }> = ({ props }) => {
  const slides: Array<{ media?: string; title?: string; text?: string; bullets?: string[] }> = props.slides ?? [];
  const tone = props.tone ?? 'soft';
  const invert = tone === 'dark' || tone === 'brand';
  const [emblaRef, emblaApi] = useEmblaCarousel({ direction: 'rtl', loop: true, align: 'start' });
  const [selected, setSelected] = useState(0);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    onSelect();
  }, [emblaApi, onSelect]);

  return (
    <SectionShell tone={tone} aurora={invert}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} invert={invert} />
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {slides.map((slide, i) => (
            <div key={i} className="min-w-0 flex-[0_0_100%] px-1.5">
              <div className={`grid items-center gap-6 rounded-3xl border p-5 md:grid-cols-2 md:p-8 ${invert ? 'border-white/10 bg-white/[0.04]' : 'border-zinc-200 bg-white shadow-sm'}`}>
                <div className="order-2 md:order-1">
                  {slide.title && <h3 className={`text-2xl font-black ${invert ? 'text-white' : 'text-zinc-950'}`}>{slide.title}</h3>}
                  {slide.text && <p className={`mt-3 text-sm leading-8 ${invert ? 'text-zinc-300' : 'text-zinc-600'}`}>{slide.text}</p>}
                  {Array.isArray(slide.bullets) && slide.bullets.length > 0 && (
                    <ul className="mt-4 space-y-2.5">
                      {slide.bullets.map((b, bi) => (
                        <li key={bi} className={`flex items-center gap-2 text-sm font-bold ${invert ? 'text-zinc-200' : 'text-zinc-700'}`}>
                          <CheckCircleOutlined style={{ color: 'rgb(var(--brand-500-rgb))' }} />{b}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="order-1 md:order-2">
                  <SlideMedia url={slide.media} title={slide.title} invert={invert} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {slides.length > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={() => emblaApi?.scrollPrev()} className={`flex h-10 w-10 items-center justify-center rounded-full border ${invert ? 'border-white/20 text-white hover:bg-white/10' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'}`}>
            <ArrowRightOutlined />
          </button>
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <button key={i} onClick={() => emblaApi?.scrollTo(i)} className="h-2 rounded-full transition-all" style={{ width: i === selected ? 24 : 8, background: i === selected ? 'rgb(var(--brand-500-rgb))' : invert ? 'rgba(255,255,255,.3)' : '#d4d4d8' }} />
            ))}
          </div>
          <button onClick={() => emblaApi?.scrollNext()} className={`flex h-10 w-10 items-center justify-center rounded-full border ${invert ? 'border-white/20 text-white hover:bg-white/10' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'}`}>
            <ArrowLeftOutlined />
          </button>
        </div>
      )}
    </SectionShell>
  );
};
