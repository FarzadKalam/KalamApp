import React, { useEffect, useMemo, useState } from 'react';
import { AI_AGENT_CATALOG, type AgentKey } from '../../../utils/aiAgentCatalog';
import { AiAgentCameoFigure } from '../../ai/AiAgentIcon';

const NIGHT_DUTIES: Record<AgentKey, { dutyFa: string; metricFa: string }> = {
  lead_orchestrator: {
    dutyFa: 'پایش صف عملیات شبانه، تخصیص هوشمند اولویت‌ها و توازن بار پردازش',
    metricFa: 'پایش سراسری فعال',
  },
  sales_leads: {
    dutyFa: 'تحلیل لیدهای ورودی کمپین‌ها، آماده‌سازی پیش‌فاکتورها و پیشنهاد بسته‌های مکمل',
    metricFa: 'پایش ۲۴ ساعته لیدها',
  },
  purchase_supply: {
    dutyFa: 'استعلام شبانه نرخ اقلام، تطبیق پیش‌فاکتورهای خرید و هشدار کسری انبار',
    metricFa: 'رصد خودکار تأمین‌کنندگان',
  },
  customer_response: {
    dutyFa: 'پاسخگویی به پیام‌های ورودی، استعلام وضعیت پروژه‌ها و پیگیری امور مشتریان',
    metricFa: 'پاسخگویی بدون وقفه',
  },
  hr_manager: {
    dutyFa: 'موازنه کارکرد پرسنل، بررسی شیفت‌ها و ثبت درخواست‌های سیستمی',
    metricFa: 'کنترل خودکار کارکرد',
  },
  reservation: {
    dutyFa: 'مدیریت و ثبت رزروهای اینترنتی شبانه، محاسبه بافرها و یادآوری نوبت‌ها',
    metricFa: 'پذیرش شبانه‌روزی نوبت',
  },
  project_process: {
    dutyFa: 'پایش سررسید تسک‌ها، اجرای گام‌های اتوماسیون و به‌روزرسانی الگوهای فرآیند',
    metricFa: 'گردش خودکار فرآیندها',
  },
  instagrammer: {
    dutyFa: 'پایش کامنت‌ها و دایرکت‌های اینستاگرام، ارسال ویترین دکمه‌دار و تنظیم تقویم محتوایی',
    metricFa: 'مدیریت ۲۴ ساعته اینستاگرام',
  },
  system_guide: {
    dutyFa: 'نمایه‌سازی دانش جدید، بهینه‌سازی راهنماها و پاسخ به ابهامات کاری کاربران',
    metricFa: 'پایگاه دانش پویا',
  },
};

const LIVE_NIGHT_EVENTS = [
  { agentKey: 'instagrammer' as AgentKey, title: 'پاسخ خودکار به دایرکت اینستاگرام و ارسال کارت ویترین محصول' },
  { agentKey: 'sales_leads' as AgentKey, title: 'ثبت لید جدید از کمپین تبلیغاتی و ارسال پیش‌فاکتور در سامانه' },
  { agentKey: 'customer_response' as AgentKey, title: 'استعلام وضعیت سفارش مشتری از پروژه فعال و ارسال پیام به مشتری' },
  { agentKey: 'project_process' as AgentKey, title: 'اتمام گام اول فرآیند و ارجاع خودکار به کارشناس مرحله بعد' },
  { agentKey: 'purchase_supply' as AgentKey, title: 'بررسی موجودی انبار کالا و ثبت خودکار درخواست خرید کسری' },
  { agentKey: 'reservation' as AgentKey, title: 'تأیید نوبت جدید رزرواسیون آنلاین و ارسال پیامک یادآوری به مشتری' },
];

export const PublicNightShiftShowcase: React.FC = () => {
  const [activeAgentKey, setActiveAgentKey] = useState<AgentKey>('lead_orchestrator');
  const [liveClock, setLiveClock] = useState('');
  const [eventIndex, setEventIndex] = useState(0);

  // Live Clock (Persian formatted)
  useEffect(() => {
    const update = () => {
      try {
        const now = new Date();
        setLiveClock(
          now.toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }),
        );
      } catch {
        setLiveClock('۰۰:۰۰:۰۰');
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Event ticker rotation
  useEffect(() => {
    const timer = setInterval(() => {
      setEventIndex((prev) => (prev + 1) % LIVE_NIGHT_EVENTS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const agents = useMemo(() => AI_AGENT_CATALOG, []);
  const activeAgent = useMemo(
    () => agents.find((a) => a.key === activeAgentKey) || agents[0],
    [agents, activeAgentKey],
  );
  const activeDuty = NIGHT_DUTIES[activeAgent.key] || {
    dutyFa: activeAgent.descriptionFa,
    metricFa: 'فعال در شیفت شبانه',
  };

  const currentEvent = LIVE_NIGHT_EVENTS[eventIndex];
  const currentEventAgent = agents.find((a) => a.key === currentEvent.agentKey) || agents[0];

  return (
    <div
      dir="rtl"
      className="relative overflow-hidden rounded-3xl border border-indigo-500/25 bg-gradient-to-b from-[#070b1a] via-[#0c1228] to-[#050814] p-5 sm:p-8 text-white shadow-2xl backdrop-blur-xl"
    >
      {/* Subtle Night Starry / Radial Glow Backdrops */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 h-60 w-60 rounded-full bg-fuchsia-600/10 blur-3xl" />

      {/* Header Bar: Status + Live Clock */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span>شیفت شبانه ۲۴/۷ خودکار</span>
          </span>
          <span className="text-xs text-slate-400 hidden sm:inline">
            وقتی سازمان شما تعطیل است؛ هوش مصنوعی کار می‌کند
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-300">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-mono text-cyan-200">{liveClock || '۰۰:۰۰:۰۰'}</span>
          <span className="text-[11px] text-slate-400">ساعت زنده سیستم</span>
        </div>
      </div>

      {/* Main Showcase Stage */}
      <div className="relative z-10 mt-6 grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left Column: Interactive Agents Strip */}
        <div>
          <div className="mb-3 text-xs font-semibold text-slate-300">
            برای مشاهده وظایف شبانه، روی هر ایجنت بزنید:
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-3">
            {agents.map((agent) => {
              const isActive = agent.key === activeAgentKey;
              return (
                <button
                  type="button"
                  key={agent.key}
                  onClick={() => setActiveAgentKey(agent.key)}
                  className={`group relative flex flex-col items-center justify-center gap-2 rounded-2xl border p-2.5 text-center transition-all duration-200 ${
                    isActive
                      ? 'border-indigo-400/90 bg-indigo-500/20 shadow-lg shadow-indigo-500/10 scale-[1.02]'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <div
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 border overflow-hidden shadow-inner transition-transform group-hover:scale-105"
                    style={{ borderColor: `${agent.badgeColor}80` }}
                  >
                    <AiAgentCameoFigure agentKey={agent.key} size={32} accentColor={agent.badgeColor} />
                    <span
                      className="absolute bottom-1 right-1 h-2 w-2 rounded-full animate-ping"
                      style={{ backgroundColor: agent.badgeColor }}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-black text-slate-100">
                      {agent.shortTitleFa}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {NIGHT_DUTIES[agent.key]?.metricFa || 'فعال ۲۴/۷'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Detailed Spotlight Card */}
        <div className="relative rounded-2xl border border-indigo-400/30 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-black/60 p-5 shadow-inner backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 border overflow-hidden shadow-md"
              style={{ borderColor: `${activeAgent.badgeColor}90` }}
            >
              <AiAgentCameoFigure agentKey={activeAgent.key} size={42} accentColor={activeAgent.badgeColor} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white">{activeAgent.titleFa}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: `${activeAgent.badgeColor}25`, color: activeAgent.badgeColor }}
                >
                  {activeDuty.metricFa}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300 line-clamp-1">{activeAgent.subtitleFa}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
            <div className="text-xs font-bold text-indigo-300">وظایف و فعالیت در شیفت شبانه:</div>
            <p className="mt-1.5 text-xs leading-6 text-slate-200">
              {activeDuty.dutyFa}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 border-t border-white/10 pt-3">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>پایش و عملیات بدون نیاز به دخالت انسانی</span>
            </span>
            <span className="font-mono text-[11px] text-indigo-300">Auto Task Engine</span>
          </div>
        </div>
      </div>

      {/* Bottom Live Activity Stream Ticker */}
      <div className="relative z-10 mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-slate-300">
        <span className="flex items-center gap-1.5 font-bold text-cyan-300 shrink-0">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
          <span>لاگ زنده شیفت شب:</span>
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="rounded-full px-1.5 py-0.2 text-[10.5px] font-bold shrink-0"
            style={{
              backgroundColor: `${currentEventAgent.badgeColor}20`,
              color: currentEventAgent.badgeColor,
            }}
          >
            {currentEventAgent.shortTitleFa}
          </span>
          <span className="truncate text-slate-200 transition-opacity duration-300">
            {currentEvent.title}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PublicNightShiftShowcase;
