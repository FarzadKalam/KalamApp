import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftOutlined, ArrowDownOutlined, CheckCircleFilled, ClockCircleOutlined,
  ExclamationCircleFilled, SyncOutlined,
} from '@ant-design/icons';
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
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
// HERO TREE — هستهٔ محصول و جریان‌های متصل آن
// مختصات بر حسب درصد هستند تا شاخه‌ها و گره‌ها در هر اندازه هم‌راستا بمانند.
// ══════════════════════════════════════════════════
type TreeNode = { icon?: string; title: string; text?: string; href?: string };
type TreePosition = { x: number; y: number; start: number; mid: number };

// این چیدمان عمداً نامتقارن است: حس شبکهٔ زندهٔ محصول می‌دهد، نه نمودار مفهومی.
const TREE_POSITIONS: TreePosition[] = [
  { x: 17, y: 25, start: 0.1, mid: 0.23 },
  { x: 84, y: 23, start: 0.18, mid: 0.31 },
  { x: 11, y: 68, start: 0.27, mid: 0.4 },
  { x: 88, y: 67, start: 0.35, mid: 0.48 },
  { x: 52, y: 87, start: 0.44, mid: 0.57 },
];

const TreeBranch: React.FC<{
  p: MotionValue<number>;
  position: TreePosition;
  active: boolean;
  dimmed: boolean;
}> = ({ p, position, active, dimmed }) => {
  const { x, y, start, mid } = position;
  const draw = useTransform(p, [start, mid], [0, 1]);
  const c1 = `${50 + (x - 50) * 0.34} ${50 + (y - 50) * 0.05}`;
  const c2 = `${50 + (x - 50) * 0.82} ${y}`;
  const d = `M 50 50 C ${c1} ${c2} ${x} ${y}`;
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={active ? 'rgb(var(--brand-500-rgb))' : 'rgb(var(--brand-400-rgb))'}
      strokeWidth={active ? 2.5 : 1.25}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      style={{ pathLength: draw, opacity: dimmed ? 0.18 : draw }}
    />
  );
};

const TreeNodeCard: React.FC<{
  p: MotionValue<number>;
  position: TreePosition;
  node: TreeNode;
  active: boolean;
  dimmed: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}> = ({ p, position, node, active, dimmed, onActivate, onDeactivate }) => {
  const opacity = useTransform(p, [position.mid - 0.03, position.mid + 0.09], [0, 1]);
  const scale = useTransform(p, [position.mid - 0.03, position.mid + 0.09], [0.92, 1]);
  return (
    <motion.div
      style={{ left: `${position.x}%`, top: `${position.y}%`, x: '-50%', y: '-50%', opacity, scale }}
      className="absolute z-10 w-[clamp(132px,15vw,185px)]"
    >
      <button
        type="button"
        onMouseEnter={onActivate}
        onMouseLeave={onDeactivate}
        onFocus={onActivate}
        onBlur={onDeactivate}
        onClick={onActivate}
        className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-right backdrop-blur-md transition duration-300 ${
          active
            ? 'border-white/90 bg-white text-zinc-950 shadow-[0_20px_45px_rgba(24,24,27,0.2)]'
            : dimmed
            ? 'border-white/40 bg-white/45 text-zinc-500 opacity-55'
            : 'border-white/70 bg-white/70 text-zinc-800 shadow-[0_12px_32px_rgba(24,24,27,0.1)] hover:border-white hover:bg-white'
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base text-white shadow-sm" style={{ background: 'rgb(var(--brand-600-rgb))' }}>
          {renderIcon(node.icon)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{node.title}</span>
          {node.text && <span className="mt-0.5 block truncate text-[11px] font-medium text-zinc-500">{node.text}</span>}
        </span>
      </button>
    </motion.div>
  );
};

const ProductCore: React.FC<{ label: string; media?: string; activeNode?: TreeNode }> = ({ label, media, activeNode }) => (
  <div className="relative overflow-hidden rounded-[1.65rem] border border-white/80 bg-white shadow-[0_30px_90px_rgba(24,24,27,0.2)]">
    {media ? (
      <img src={media} alt="نمایی از محیط تازه سیستم" className="aspect-[1.25/1] h-full w-full object-cover" />
    ) : (
      <div className="aspect-[1.25/1] bg-[linear-gradient(145deg,#ffffff_0%,#f4f7fb_100%)] p-3">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
          <div className="flex gap-1.5"><i className="h-2 w-2 rounded-full bg-zinc-200" /><i className="h-2 w-2 rounded-full bg-zinc-200" /><i className="h-2 w-2 rounded-full bg-zinc-200" /></div>
          <span className="text-[10px] font-bold text-zinc-400">نمای عملیات امروز</span>
          <span className="h-5 w-5 rounded-md" style={{ background: 'rgb(var(--brand-600-rgb))' }} />
        </div>
        <div className="mt-3 grid grid-cols-[.75fr_1.25fr] gap-2.5">
          <div className="space-y-2 rounded-xl bg-zinc-50 p-2">
            <span className="block h-2 w-3/5 rounded-full bg-zinc-200" />
            <span className="block h-2 w-4/5 rounded-full" style={{ background: 'rgb(var(--brand-100-rgb))' }} />
            <span className="block h-2 w-2/3 rounded-full bg-zinc-200" />
            <span className="block h-2 w-3/4 rounded-full bg-zinc-200" />
          </div>
          <div className="space-y-2.5">
            <div className="rounded-xl p-2.5 text-right text-[10px] text-white" style={{ background: 'rgb(var(--brand-600-rgb))' }}>
              <span className="block font-black">{activeNode?.title ?? label}</span>
              <span className="mt-1 block text-white/75">وضعیت کارها، لحظه‌ای و یکپارچه</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[['۲۴', 'پیگیری'], ['۱۲', 'کار فعال'], ['۷', 'اقدام امروز']].map(([value, text]) => <div key={text} className="rounded-lg border border-zinc-100 bg-white p-1.5 text-center"><b className="block text-xs text-zinc-900">{value}</b><span className="text-[8px] text-zinc-400">{text}</span></div>)}
            </div>
            <div className="h-12 rounded-xl border border-zinc-100 bg-white p-2"><span className="block h-1.5 w-3/4 rounded-full bg-zinc-200" /><span className="mt-2 block h-1.5 w-full rounded-full" style={{ background: 'rgb(var(--brand-100-rgb))' }} /></div>
          </div>
        </div>
      </div>
    )}
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-zinc-100 bg-white/95 px-3 py-2 backdrop-blur">
      <span className="text-[10px] font-bold text-zinc-400">یک هسته، همهٔ جریان‌ها</span>
      <span className="text-xs font-black text-zinc-900">{label}</span>
    </div>
  </div>
);

const MobileCell: React.FC<{ node: TreeNode; active: boolean; onActivate: () => void }> = ({ node, active, onActivate }) => {
  return (
    <button type="button" onClick={onActivate} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2.5 text-right transition ${active ? 'border-zinc-400 bg-white shadow-md' : 'border-zinc-200 bg-white/75'}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm text-white" style={{ background: 'rgb(var(--brand-600-rgb))' }}>
        {renderIcon(node.icon)}
      </span>
      <span className="min-w-0"><span className="block truncate text-xs font-black leading-5 text-zinc-900">{node.title}</span>{node.text && <span className="block truncate text-[10px] text-zinc-500">{node.text}</span>}</span>
    </button>
  );
};

export const HeroTreeSection: React.FC<{ props: any }> = ({ props }) => {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const sceneX = useSpring(useTransform(pointerX, [-0.5, 0.5], [-10, 10]), { stiffness: 90, damping: 22 });
  const sceneY = useSpring(useTransform(pointerY, [-0.5, 0.5], [-7, 7]), { stiffness: 90, damping: 22 });
  const glowX = useTransform(pointerX, [-0.5, 0.5], ['28%', '72%']);
  const glowY = useTransform(pointerY, [-0.5, 0.5], ['32%', '66%']);
  const nodes: TreeNode[] = (props.nodes?.length ? props.nodes : []).slice(0, TREE_POSITIONS.length);
  const captionOpacity = useTransform(scrollYProgress, [0.58, 0.75], [0, 1]);
  const hintOpacity = useTransform(scrollYProgress, [0, 0.1], [1, 0]);
  const hubLabel = props.hubLabel ?? 'تازه سیستم';
  const activeNode = activeIndex === null ? undefined : nodes[activeIndex];

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  return (
    <>
    <section ref={ref} className="relative hidden md:block" style={{ height: '155vh' }}>
      <div onPointerMove={handlePointerMove} onPointerLeave={resetPointer} className="sticky top-0 flex h-[100svh] flex-col items-center overflow-hidden bg-[#f7f8fa] px-5 pt-24">
        <motion.div aria-hidden className="pointer-events-none absolute h-[620px] w-[620px] rounded-full blur-[130px]" style={{ left: glowX, top: glowY, x: '-50%', y: '-50%', background: 'rgb(var(--brand-200-rgb) / .55)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.42]" style={{ backgroundImage: 'linear-gradient(rgb(24 24 27 / .045) 1px, transparent 1px), linear-gradient(90deg, rgb(24 24 27 / .045) 1px, transparent 1px)', backgroundSize: '46px 46px', maskImage: 'radial-gradient(ellipse 68% 70% at 50% 50%, black, transparent)' }} />
        {/* headline */}
        <div className="relative z-20 mx-auto max-w-4xl shrink-0 text-center">
          {props.eyebrow && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3.5 py-1.5 text-xs font-black text-zinc-600 shadow-sm backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'rgb(var(--brand-500-rgb))' }} />{props.eyebrow}
            </div>
          )}
          <h1 className="text-3xl font-black leading-[1.35] tracking-[-.035em] text-zinc-950 md:text-[2.8rem]">
            {props.titleBefore}
            <span style={{ color: 'rgb(var(--brand-600-rgb))' }}>
              {props.highlight}
            </span>
            {props.titleAfter}
          </h1>
          {props.subtitle && <p className="mx-auto mt-3 max-w-2xl text-base leading-8 text-zinc-600">{props.subtitle}</p>}
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Cta cta={props.primaryCta} variant="solid" />
            <Cta cta={props.secondaryCta} variant="outline" />
          </div>
        </div>

        {/* ── دسکتاپ: اکوسیستم تعاملی محصول ── */}
        <motion.div style={reduceMotion ? undefined : { x: sceneX, y: sceneY }} className="relative mx-auto mt-1 aspect-[1.8/1] h-[clamp(310px,43vh,500px)] w-full max-w-6xl flex-shrink-0">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <defs><linearGradient id="tree-flow" x1="0" x2="1"><stop stopColor="rgb(var(--brand-300-rgb))" /><stop offset="1" stopColor="rgb(var(--brand-600-rgb))" /></linearGradient></defs>
            {nodes.map((_, i) => (
              <TreeBranch key={i} p={scrollYProgress} position={TREE_POSITIONS[i]} active={activeIndex === i} dimmed={activeIndex !== null && activeIndex !== i} />
            ))}
          </svg>
          <div className="absolute z-20 w-[clamp(210px,24vw,310px)] -translate-x-1/2 -translate-y-1/2" style={{ left: '50%', top: '50%' }}>
            <ProductCore label={hubLabel} media={props.media} activeNode={activeNode} />
          </div>
          {nodes.map((node, i) => (
            <TreeNodeCard key={node.title} p={scrollYProgress} position={TREE_POSITIONS[i]} node={node} active={activeIndex === i} dimmed={activeIndex !== null && activeIndex !== i} onActivate={() => setActiveIndex(i)} onDeactivate={() => setActiveIndex(null)} />
          ))}
        </motion.div>

        {/* caption + scroll hint */}
        <motion.div style={{ opacity: captionOpacity }} className="relative z-20 mt-auto shrink-0 pb-8 pt-4 text-center text-sm font-bold text-zinc-500">
          {props.caption ?? 'هر آنچه برای سیستماتیک شدن یک کسب‌وکار لازم است'}
        </motion.div>
        <motion.div style={{ opacity: hintOpacity }} className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-zinc-400">
          <ArrowDownOutlined className="animate-bounce" />
        </motion.div>
      </div>
    </section>
    <section className="relative overflow-hidden bg-[#f7f8fa] px-4 pb-10 pt-24 md:hidden">
      <div className="mx-auto max-w-md text-center">
        {props.eyebrow && <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-black text-zinc-600"><span className="h-1.5 w-1.5 rounded-full" style={{ background: 'rgb(var(--brand-500-rgb))' }} />{props.eyebrow}</div>}
        <h1 className="text-3xl font-black leading-[1.4] tracking-[-.03em] text-zinc-950">{props.titleBefore}<span style={{ color: 'rgb(var(--brand-600-rgb))' }}>{props.highlight}</span>{props.titleAfter}</h1>
        {props.subtitle && <p className="mt-3 text-sm leading-7 text-zinc-600">{props.subtitle}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-3"><Cta cta={props.primaryCta} variant="solid" /><Cta cta={props.secondaryCta} variant="outline" /></div>
        <div className="mx-auto mt-8 w-[min(82vw,310px)]"><ProductCore label={hubLabel} media={props.media} activeNode={activeNode} /></div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">{nodes.map((node, i) => <MobileCell key={node.title} node={node} active={activeIndex === i} onActivate={() => setActiveIndex(i)} />)}</div>
        <p className="mt-6 text-xs font-bold leading-6 text-zinc-500">{props.caption ?? 'هر آنچه برای سیستماتیک شدن یک کسب‌وکار لازم است'}</p>
      </div>
    </section>
    </>
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
