import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftOutlined, ArrowDownOutlined, CheckCircleFilled, ClockCircleOutlined,
  ExclamationCircleFilled, SyncOutlined,
} from '@ant-design/icons';
import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import AiSparkleIcon from '../../ai/AiSparkleIcon';
import { BrandButton, Reveal, SectionHeading, SectionShell } from '../primitives';
import { renderIcon } from '../iconMap';
import type { IconItem } from '../types';

const isInternal = (href: string) => href.startsWith('/') && !href.startsWith('//');
const Cta: React.FC<{ cta?: { label: string; href: string }; variant?: any }> = ({ cta, variant = 'solid' }) => {
  if (!cta?.label) return null;
  return isInternal(cta.href) ? (
    <Link to={cta.href}><BrandButton href={cta.href} variant={variant}>{cta.label}</BrandButton></Link>
  ) : (
    <BrandButton href={cta.href} variant={variant}>{cta.label}</BrandButton>
  );
};

// ══════════════════════════════════════════════════
// HERO TREE — گراف/درختی که با اسکرول رشد می‌کند
// مختصات بر حسب درصد (۰..۱۰۰) تا SVG و چیپ‌های HTML همیشه منطبق بمانند.
// ══════════════════════════════════════════════════
type TreeNode = { icon?: string; title: string };

const radialPositions = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    return { x: 50 + 41 * Math.cos(a), y: 50 + 40 * Math.sin(a) };
  });

const windowFor = (i: number, n: number) => {
  const span = 0.85 / n;
  const start = 0.06 + i * span;
  return { start, mid: start + span * 0.55, end: start + span };
};

// شاخهٔ SVG (خط منحنی از هسته تا نود)
const TreeBranch: React.FC<{ p: MotionValue<number>; win: { start: number; mid: number }; pt: { x: number; y: number } }> = ({ p, win, pt }) => {
  const draw = useTransform(p, [win.start, win.mid], [0, 1]);
  const c1 = `${50 + (pt.x - 50) * 0.5} ${50 + (pt.y - 50) * 0.12}`;
  const c2 = `${50 + (pt.x - 50) * 0.72} ${pt.y}`;
  const d = `M 50 50 C ${c1} ${c2} ${pt.x} ${pt.y}`;
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="rgb(var(--brand-400-rgb))"
      strokeWidth={2}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      style={{ pathLength: draw, opacity: draw }}
    />
  );
};

// چیپ HTML نوک شاخه (فونت ثابت و خوانا — مقیاس نمی‌شود)
const TreeChip: React.FC<{ p: MotionValue<number>; win: { mid: number; end: number }; pt: { x: number; y: number }; node: TreeNode }> = ({ p, win, pt, node }) => {
  const opacity = useTransform(p, [win.mid - 0.02, win.end], [0, 1]);
  const scale = useTransform(p, [win.mid - 0.02, win.end], [0.7, 1]);
  return (
    <motion.div
      style={{ left: `${pt.x}%`, top: `${pt.y}%`, x: '-50%', y: '-50%', opacity, scale }}
      className="absolute z-10 flex items-center gap-2 whitespace-nowrap rounded-2xl border border-zinc-200 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(24,24,27,0.12)]"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-white" style={{ background: 'rgb(var(--brand-600-rgb))' }}>
        {renderIcon(node.icon)}
      </span>
      <span className="text-sm font-black text-zinc-900">{node.title}</span>
    </motion.div>
  );
};

// سلول موبایل (گرید دو‌ستونه فشرده)
const MobileCell: React.FC<{ p: MotionValue<number>; win: { start: number; mid: number }; node: TreeNode }> = ({ p, win, node }) => {
  const opacity = useTransform(p, [win.start, win.mid], [0, 1]);
  const y = useTransform(p, [win.start, win.mid], [16, 0]);
  return (
    <motion.div style={{ opacity, y }} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2.5 py-2.5 shadow-sm">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm text-white" style={{ background: 'rgb(var(--brand-600-rgb))' }}>
        {renderIcon(node.icon)}
      </span>
      <span className="text-xs font-black leading-5 text-zinc-900">{node.title}</span>
    </motion.div>
  );
};

const HubNode: React.FC<{ label: string; className?: string }> = ({ label, className }) => (
  <div className={`relative flex flex-col items-center gap-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-xl ${className ?? ''}`}>
    <span className="absolute inset-0 -z-10 rounded-2xl opacity-30 blur-md" style={{ background: 'rgb(var(--brand-300-rgb))' }} />
    <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: 'linear-gradient(135deg, rgb(var(--brand-500-rgb)), rgb(var(--brand-700-rgb)))' }}>
      <AiSparkleIcon className="h-5 w-5" />
    </span>
    <span className="text-sm font-black text-zinc-900">{label}</span>
  </div>
);

export const HeroTreeSection: React.FC<{ props: any }> = ({ props }) => {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const nodes: TreeNode[] = props.nodes?.length ? props.nodes : [];
  const n = nodes.length || 1;
  const pos = radialPositions(n);
  const captionOpacity = useTransform(scrollYProgress, [0.82, 0.97], [0, 1]);
  const hintOpacity = useTransform(scrollYProgress, [0, 0.1], [1, 0]);
  const hubLabel = props.hubLabel ?? 'تازه سیستم';

  return (
    <section ref={ref} className="relative" style={{ height: '230vh' }}>
      <div className="sticky top-0 flex h-[100svh] flex-col items-center overflow-hidden bg-[radial-gradient(ellipse_75%_55%_at_50%_-5%,rgb(var(--brand-50-rgb)),#ffffff_55%,#f3f4f6_100%)] px-4 pt-24 md:px-5">
        {/* headline */}
        <div className="relative z-20 mx-auto max-w-4xl shrink-0 text-center">
          {props.eyebrow && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-black shadow-sm" style={{ borderColor: 'rgb(var(--brand-200-rgb))', background: 'rgb(var(--brand-50-rgb) / 0.7)', color: 'rgb(var(--brand-700-rgb))' }}>
              <AiSparkleIcon className="h-3.5 w-3.5" />{props.eyebrow}
            </div>
          )}
          <h1 className="text-2xl font-black leading-[1.5] text-zinc-950 md:text-[2.7rem] md:leading-[1.4]">
            {props.titleBefore}
            <span style={{ backgroundImage: 'linear-gradient(115deg, rgb(var(--brand-500-rgb)), rgb(var(--brand-accent-pink-rgb)))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              {props.highlight}
            </span>
            {props.titleAfter}
          </h1>
          {props.subtitle && <p className="mx-auto mt-3 hidden max-w-2xl text-base leading-8 text-zinc-600 md:block">{props.subtitle}</p>}
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Cta cta={props.primaryCta} variant="solid" />
            <Cta cta={props.secondaryCta} variant="outline" />
          </div>
        </div>

        {/* ── دسکتاپ: گراف رادیال ── */}
        <div className="relative mx-auto hidden aspect-[16/10] h-[clamp(300px,46vh,520px)] flex-shrink-0 md:mt-2 md:block">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            {pos.map((pt, i) => (
              <TreeBranch key={i} p={scrollYProgress} win={windowFor(i, n)} pt={pt} />
            ))}
          </svg>
          <div className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: '50%', top: '50%' }}>
            <HubNode label={hubLabel} />
          </div>
          {pos.map((pt, i) => (
            <TreeChip key={i} p={scrollYProgress} win={windowFor(i, n)} pt={pt} node={nodes[i]} />
          ))}
        </div>

        {/* ── موبایل: هسته + گرید دو‌ستونه ── */}
        <div className="mt-6 flex w-full max-w-md flex-1 flex-col items-center md:hidden">
          <HubNode label={hubLabel} />
          <div className="mt-5 grid w-full grid-cols-2 gap-2.5">
            {nodes.map((node, i) => (
              <MobileCell key={i} p={scrollYProgress} win={windowFor(i, n)} node={node} />
            ))}
          </div>
        </div>

        {/* caption + scroll hint */}
        <motion.div style={{ opacity: captionOpacity }} className="relative z-20 mt-auto shrink-0 pb-8 pt-4 text-center text-sm font-bold text-zinc-500">
          {props.caption ?? 'هر آنچه برای سیستماتیک شدن یک کسب‌وکار لازم است'}
        </motion.div>
        <motion.div style={{ opacity: hintOpacity }} className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-zinc-400">
          <ArrowDownOutlined className="animate-bounce" />
        </motion.div>
      </div>
    </section>
  );
};

// ══════════════════════════════════════════════════
// HR — منابع انسانی
// ══════════════════════════════════════════════════
export const HrSection: React.FC<{ props: any }> = ({ props }) => {
  const items: IconItem[] = props.items ?? [];
  return (
    <SectionShell tone={props.tone ?? 'soft'}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, i) => (
          <Reveal
            key={item.title}
            delay={i * 0.05}
            className={`rounded-2xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-1 hover:shadow-lg ${item.featured ? 'sm:col-span-2' : ''}`}
          >
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl text-lg" style={{ background: 'rgb(var(--brand-50-rgb))', color: 'rgb(var(--brand-600-rgb))' }}>
              {renderIcon(item.icon)}
            </div>
            <h3 className="font-black text-zinc-950">{item.title}</h3>
            {item.text && <p className="mt-2 text-sm leading-7 text-zinc-600">{item.text}</p>}
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
};

// ══════════════════════════════════════════════════
// Accounting — حسابداری
// ══════════════════════════════════════════════════
const AccountTreeMock: React.FC = () => {
  const rows: Array<[string, number, string]> = [
    ['دارایی‌ها', 0, '۱'],
    ['موجودی نقد و بانک', 1, '۱۰۱'],
    ['حساب‌های دریافتنی', 1, '۱۰۲'],
    ['بدهی‌ها', 0, '۲'],
    ['حساب‌های پرداختنی', 1, '۲۰۱'],
    ['درآمد فروش', 0, '۴'],
  ];
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_70px_rgba(24,24,27,0.12)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-black text-zinc-950">جدول درختی حساب‌ها</span>
        <span className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-500">حسابداری دوبل</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(([name, depth, code]) => (
          <div key={code} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm" style={{ paddingInlineStart: 8 + depth * 22, background: depth === 0 ? 'rgb(var(--brand-50-rgb))' : '#fafafa' }}>
            <span className={`h-2 w-2 rounded-sm ${depth === 0 ? '' : 'opacity-50'}`} style={{ background: 'rgb(var(--brand-500-rgb))' }} />
            <span className={`flex-1 ${depth === 0 ? 'font-black text-zinc-900' : 'font-medium text-zinc-600'}`}>{name}</span>
            <span className="font-mono text-xs text-zinc-400">{code}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AccountingSection: React.FC<{ props: any }> = ({ props }) => {
  const items: IconItem[] = props.items ?? [];
  return (
    <SectionShell tone={props.tone ?? 'light'}>
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} align="start" />
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((item, i) => (
              <Reveal key={item.title} delay={i * 0.05} className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: 'rgb(var(--brand-50-rgb))', color: 'rgb(var(--brand-600-rgb))' }}>
                  {renderIcon(item.icon)}
                </span>
                <div>
                  <h3 className="text-sm font-black text-zinc-950">{item.title}</h3>
                  {item.text && <p className="mt-1 text-xs leading-6 text-zinc-600">{item.text}</p>}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
        <Reveal delay={0.15}><AccountTreeMock /></Reveal>
      </div>
    </SectionShell>
  );
};

// ══════════════════════════════════════════════════
// Process Showcase — الگوی فرآیند → اجرای فرآیند
// ══════════════════════════════════════════════════
const RUN_STATUS: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  done: { color: '#22c55e', icon: <CheckCircleFilled />, label: 'انجام شد' },
  active: { color: 'rgb(var(--brand-500-rgb))', icon: <SyncOutlined spin />, label: 'در حال انجام' },
  pending: { color: '#a1a1aa', icon: <ClockCircleOutlined />, label: 'در انتظار' },
  blocked: { color: '#f43f5e', icon: <ExclamationCircleFilled />, label: 'متوقف' },
};

const Avatar: React.FC<{ name?: string }> = ({ name }) => (
  <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: 'rgb(var(--brand-500-rgb))' }}>
    {(name ?? '?').trim().charAt(0) || '?'}
  </span>
);

export const ProcessShowcaseSection: React.FC<{ props: any }> = ({ props }) => {
  const templateStages: string[] = props.templateStages ?? [];
  const run: Array<{ title: string; status?: string; assignee?: string }> = props.run ?? [];
  return (
    <SectionShell tone={props.tone ?? 'soft'}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} />
      <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
        {/* الگوی فرآیند */}
        <Reveal className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-base font-black text-zinc-950">الگوی فرآیند</span>
            <span className="rounded-lg px-2.5 py-1 text-xs font-bold" style={{ background: 'rgb(var(--brand-50-rgb))', color: 'rgb(var(--brand-700-rgb))' }}>یک‌بار طراحی می‌کنید</span>
          </div>
          <div className="relative space-y-0">
            {templateStages.map((stage, i) => (
              <div key={i} className="relative flex items-center gap-3 pb-5 last:pb-0">
                {i < templateStages.length - 1 && <span className="absolute right-[14px] top-7 h-full w-px bg-zinc-200" />}
                <span className="z-10 flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black text-white" style={{ background: 'rgb(var(--brand-600-rgb))' }}>{(i + 1).toLocaleString('fa-IR')}</span>
                <span className="text-sm font-bold text-zinc-700">{stage}</span>
              </div>
            ))}
          </div>
        </Reveal>

        {/* arrow */}
        <Reveal delay={0.1} className="flex flex-col items-center gap-2 text-center">
          <span className="hidden rounded-full border border-zinc-200 bg-white p-3 text-lg shadow-sm lg:block" style={{ color: 'rgb(var(--brand-600-rgb))' }}><ArrowLeftOutlined /></span>
          <span className="block rounded-full border border-zinc-200 bg-white p-3 text-lg shadow-sm lg:hidden" style={{ color: 'rgb(var(--brand-600-rgb))' }}><ArrowDownOutlined /></span>
          <span className="max-w-[120px] text-xs font-bold text-zinc-500">با هر بار نیاز، به فرآیند واقعی تبدیل می‌شود</span>
        </Reveal>

        {/* اجرای فرآیند */}
        <Reveal delay={0.15} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-base font-black text-zinc-950">اجرای فرآیند</span>
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-600">یک فرآیند واقعی</span>
          </div>
          <div className="space-y-2.5">
            {run.map((item, i) => {
              const st = RUN_STATUS[item.status ?? 'pending'] ?? RUN_STATUS.pending;
              return (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/70 p-3" style={{ borderInlineStartWidth: 3, borderInlineStartColor: st.color }}>
                  <span style={{ color: st.color }}>{st.icon}</span>
                  <span className="flex-1 text-sm font-bold text-zinc-800">{item.title}</span>
                  <span className="hidden text-xs font-bold sm:inline" style={{ color: st.color }}>{st.label}</span>
                  <Avatar name={item.assignee} />
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </SectionShell>
  );
};
