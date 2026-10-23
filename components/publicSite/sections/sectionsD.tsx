import React from 'react';
import { ArrowLeftOutlined, ArrowDownOutlined, CheckCircleFilled, ClockCircleOutlined, ExclamationCircleFilled, SyncOutlined } from '@ant-design/icons';
import { Reveal, SectionHeading, SectionShell } from '../primitives';
import { renderIcon } from '../iconMap';
import type { IconItem } from '../types';

export { default as HeroTreeSection } from './ProductHeroSection';

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
            className={`site-card p-6 ${item.featured ? 'sm:col-span-2' : ''}`}
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
              <Reveal key={item.title} delay={i * 0.04} className="flex items-start gap-3 border-b border-zinc-200 py-5">
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
        <Reveal className="site-card p-6 md:p-8">
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
        <Reveal delay={0.15} className="site-card p-6 md:p-8" style={{ borderTop: '3px solid rgb(var(--brand-500-rgb))' }}>
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
