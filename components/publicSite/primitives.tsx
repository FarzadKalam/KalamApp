import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion';

// ──────────────────────────────────────────────────
// Reveal: ظاهر شدن نرم هنگام اسکرول
// ──────────────────────────────────────────────────
export const Reveal: React.FC<{
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: 'div' | 'section' | 'span' | 'li';
  style?: React.CSSProperties;
}> = ({ children, className, delay = 0, y = 24, as = 'div', style }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const MotionTag = (motion as any)[as] as typeof motion.div;
  return (
    <MotionTag
      ref={ref as any}
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
};

// ──────────────────────────────────────────────────
// Counter: شمارنده عددی پرشونده (فارسی)
// ──────────────────────────────────────────────────
const toFa = (n: number) => n.toLocaleString('fa-IR');

export const Counter: React.FC<{
  to: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  decimals?: number;
}> = ({ to, suffix = '', prefix = '', decimals = 0 }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { duration: 1600, bounce: 0 });
  const [display, setDisplay] = useState('۰');

  const target = Number(to) || 0;
  useEffect(() => {
    if (inView) motionValue.set(target);
  }, [inView, target, motionValue]);

  useEffect(() => {
    const unsub = spring.on('change', (v) => {
      const val = decimals > 0 ? Number(v.toFixed(decimals)) : Math.round(v);
      setDisplay(toFa(val));
    });
    return () => unsub();
  }, [spring, decimals]);

  return (
    <span ref={ref}>
      {prefix}{display}{suffix}
    </span>
  );
};

// ──────────────────────────────────────────────────
// Aurora: پس‌زمینه گرادینت ملایم (برند‌محور)
// ──────────────────────────────────────────────────
export const AuroraBg: React.FC<{ className?: string; tone?: 'light' | 'dark' }> = ({
  className = '',
  tone = 'light',
}) => (
  <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
    <div
      className={`absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full blur-[120px] ${
        tone === 'dark' ? 'opacity-40' : 'opacity-30'
      }`}
      style={{ background: 'rgb(var(--brand-500-rgb) / 0.55)' }}
    />
    <div
      className="absolute bottom-[-20%] left-[-10%] h-[360px] w-[360px] rounded-full blur-[120px] opacity-25"
      style={{ background: 'rgb(var(--brand-accent-pink-rgb) / 0.5)' }}
    />
  </div>
);

// ──────────────────────────────────────────────────
// SectionShell: پوسته استاندارد هر سکشن (روشن/تیره/برند)
// ──────────────────────────────────────────────────
export type SectionTone = 'light' | 'soft' | 'dark' | 'brand';

const toneClasses: Record<SectionTone, string> = {
  light: 'bg-white text-zinc-950',
  soft: 'bg-zinc-50 text-zinc-950',
  dark: 'bg-zinc-950 text-white',
  brand: 'text-white',
};

export const SectionShell: React.FC<{
  children: React.ReactNode;
  tone?: SectionTone;
  aurora?: boolean;
  className?: string;
  id?: string;
}> = ({ children, tone = 'light', aurora = false, className = '', id }) => (
  <section
    id={id}
    className={`relative px-5 py-20 md:py-24 ${toneClasses[tone]} ${className}`}
    style={tone === 'brand' ? { background: 'linear-gradient(135deg, rgb(var(--brand-700-rgb)), rgb(var(--brand-900-rgb)))' } : undefined}
  >
    {aurora && <AuroraBg tone={tone === 'dark' || tone === 'brand' ? 'dark' : 'light'} />}
    <div className="relative mx-auto max-w-7xl">{children}</div>
  </section>
);

// ──────────────────────────────────────────────────
// SectionHeading: عنوان استاندارد سکشن
// ──────────────────────────────────────────────────
export const SectionHeading: React.FC<{
  eyebrow?: string;
  title: string;
  text?: string;
  invert?: boolean;
  align?: 'center' | 'start';
}> = ({ eyebrow, title, text, invert = false, align = 'center' }) => (
  <Reveal
    className={`mb-12 max-w-3xl ${align === 'center' ? 'mx-auto text-center' : 'text-right'}`}
  >
    {eyebrow && (
      <div
        className="text-sm font-black"
        style={{ color: invert ? 'rgb(var(--brand-300-rgb))' : 'rgb(var(--brand-600-rgb))' }}
      >
        {eyebrow}
      </div>
    )}
    <h2 className={`mt-3 text-3xl font-black leading-tight md:text-4xl ${invert ? 'text-white' : 'text-zinc-950'}`}>
      {title}
    </h2>
    {text && <p className={`mt-4 text-base leading-8 ${invert ? 'text-zinc-300' : 'text-zinc-600'}`}>{text}</p>}
  </Reveal>
);

// ──────────────────────────────────────────────────
// BrandButton: دکمه CTA برند‌محور
// ──────────────────────────────────────────────────
export const BrandButton: React.FC<{
  href: string;
  children: React.ReactNode;
  variant?: 'solid' | 'outline' | 'ghost' | 'invert';
  className?: string;
}> = ({ href, children, variant = 'solid', className = '' }) => {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-black transition';
  const styles: Record<string, React.CSSProperties> = {
    solid: { background: 'rgb(var(--brand-600-rgb))', color: '#fff' },
    invert: { background: '#fff', color: 'rgb(var(--brand-700-rgb))' },
    outline: {},
    ghost: {},
  };
  const variantCls =
    variant === 'outline'
      ? 'border border-zinc-300 bg-white text-zinc-950 hover:border-zinc-950'
      : variant === 'ghost'
      ? 'text-zinc-700 hover:bg-zinc-100'
      : 'shadow-sm hover:opacity-90';
  return (
    <a href={href} className={`${base} ${variantCls} ${className}`} style={styles[variant]}>
      {children}
    </a>
  );
};

export { motion, useTransform };
