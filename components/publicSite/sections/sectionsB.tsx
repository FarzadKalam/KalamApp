import React from 'react';
import { ArrowLeftOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import AiSparkleIcon from '../../ai/AiSparkleIcon';
import { BrandButton, Reveal, SectionHeading, SectionShell } from '../primitives';
import { renderIcon } from '../iconMap';
import type { IconItem } from '../types';

// ──────────────────────────────────────────────────
// Process — دیاگرام مرحله‌ای (n8n-style)
// ──────────────────────────────────────────────────
export const ProcessSection: React.FC<{ props: any }> = ({ props }) => {
  const steps: Array<string | { title: string; text?: string }> = props.steps ?? [];
  const tone = props.tone ?? 'light';
  const invert = tone === 'dark' || tone === 'brand';
  return (
    <SectionShell tone={tone} aurora={invert}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} invert={invert} />
      <div className="relative grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((raw, index) => {
          const step = typeof raw === 'string' ? { title: raw } : raw;
          return (
            <Reveal key={index} delay={index * 0.08} className="relative">
              <div className={`relative z-10 h-full rounded-2xl border p-5 ${invert ? 'border-white/10 bg-white/[0.05]' : 'border-zinc-200 bg-white shadow-sm'}`}>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black text-white" style={{ background: 'rgb(var(--brand-600-rgb))' }}>{(index + 1).toLocaleString('fa-IR')}</span>
                  <span className={`text-sm font-black ${invert ? 'text-white' : 'text-zinc-950'}`}>{step.title}</span>
                </div>
                {step.text && <p className={`mt-3 text-xs leading-6 ${invert ? 'text-zinc-300' : 'text-zinc-600'}`}>{step.text}</p>}
              </div>
              {index < steps.length - 1 && (
                <div className="absolute left-[-10px] top-1/2 z-0 hidden -translate-y-1/2 lg:block" style={{ color: 'rgb(var(--brand-400-rgb))' }}>
                  <ArrowLeftOutlined />
                </div>
              )}
            </Reveal>
          );
        })}
      </div>
    </SectionShell>
  );
};

// ──────────────────────────────────────────────────
// Automation — قبل/بعد اتومات‌سازی
// ──────────────────────────────────────────────────
export const AutomationSection: React.FC<{ props: any }> = ({ props }) => {
  const before: string[] = props.before ?? [];
  const after: string[] = props.after ?? [];
  return (
    <SectionShell tone={props.tone ?? 'soft'}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal className="rounded-2xl border border-rose-200 bg-rose-50/60 p-7">
          <div className="mb-5 inline-flex items-center gap-2 rounded-lg bg-rose-100 px-3 py-1.5 text-sm font-black text-rose-700">{props.beforeLabel ?? 'بدون اتومات‌سازی'}</div>
          <ul className="space-y-3">
            {before.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-7 text-zinc-700">
                <CloseOutlined className="mt-1 text-rose-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.12} className="rounded-2xl border p-7" style={{ borderColor: 'rgb(var(--brand-200-rgb))', background: 'rgb(var(--brand-50-rgb) / 0.6)' }}>
          <div className="mb-5 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-black text-white" style={{ background: 'rgb(var(--brand-600-rgb))' }}>{props.afterLabel ?? 'با اتومات‌سازی تازه سیستم'}</div>
          <ul className="space-y-3">
            {after.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-7 text-zinc-800">
                <CheckOutlined className="mt-1" style={{ color: 'rgb(var(--brand-600-rgb))' }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </SectionShell>
  );
};

// ──────────────────────────────────────────────────
// Communications — کانال‌های ارتباطی بیرونی
// ──────────────────────────────────────────────────
export const CommunicationsSection: React.FC<{ props: any }> = ({ props }) => {
  const channels: IconItem[] = props.channels ?? [];
  return (
    <SectionShell tone={props.tone ?? 'light'}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((ch, i) => (
          <Reveal key={ch.title} delay={i * 0.05} className="flex items-start gap-4 rounded-2xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-1 hover:shadow-lg">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl" style={{ background: 'rgb(var(--brand-50-rgb))', color: 'rgb(var(--brand-600-rgb))' }}>
              {renderIcon(ch.icon)}
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-950">{ch.title}</h3>
              {ch.text && <p className="mt-2 text-sm leading-7 text-zinc-600">{ch.text}</p>}
            </div>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
};

// ──────────────────────────────────────────────────
// Integrations — اتصالات
// ──────────────────────────────────────────────────
export const IntegrationsSection: React.FC<{ props: any }> = ({ props }) => {
  const items: IconItem[] = props.items ?? [];
  return (
    <SectionShell tone={props.tone ?? 'soft'}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} text={props.text} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.05} className="rounded-2xl border border-zinc-200 bg-white p-6">
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

// ──────────────────────────────────────────────────
// AI — بلاک ویژه هوش مصنوعی (سکشن تیره برند)
// ──────────────────────────────────────────────────
export const AiSection: React.FC<{ props: any }> = ({ props }) => {
  const capabilities: IconItem[] = props.capabilities ?? [];
  return (
    <SectionShell tone="dark" aurora>
      <div className="grid items-center gap-10 lg:grid-cols-[.85fr_1.15fr]">
        <Reveal>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-black" style={{ color: 'rgb(var(--brand-300-rgb))' }}>
            <AiSparkleIcon className="h-4 w-4" />{props.eyebrow ?? 'هوش مصنوعی سازمانی'}
          </div>
          <h2 className="mt-5 text-3xl font-black leading-tight text-white md:text-4xl">{props.title}</h2>
          {props.text && <p className="mt-4 text-base leading-8 text-zinc-300">{props.text}</p>}
          {props.cta?.label && (
            <div className="mt-7">
              <BrandButton href={props.cta.href} variant="invert">{props.cta.label}</BrandButton>
            </div>
          )}
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-2">
          {capabilities.map((cap, i) => (
            <Reveal key={cap.title} delay={i * 0.05} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.08]">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: 'rgb(var(--brand-accent-pink-rgb) / 0.25)' }}>{renderIcon(cap.icon, <AiSparkleIcon className="h-4 w-4" />)}</span>
                <span className="text-sm font-black text-white">{cap.title}</span>
              </div>
              {cap.text && <p className="mt-2 text-xs leading-6 text-zinc-400">{cap.text}</p>}
            </Reveal>
          ))}
        </div>
      </div>
    </SectionShell>
  );
};
