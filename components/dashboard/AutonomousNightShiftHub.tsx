import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Tag, Tooltip, message } from 'antd';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  ReloadOutlined,
  RocketOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { AI_AGENT_CATALOG, type AgentKey } from '../../utils/aiAgentCatalog';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { AiAgentCameoFigure, getCameoProfile } from '../ai/AiAgentIcon';

export type NightShiftActivityEvent = {
  id: string;
  agentKey: AgentKey;
  actionTitleFa: string;
  detailFa: string;
  category: 'sales' | 'support' | 'supply' | 'hr' | 'process' | 'system';
  timestampStr: string;
  status: 'done' | 'processing';
  impactFa: string;
};

const NIGHT_SHIFT_DUTIES: Record<AgentKey, { roleFa: string; dutyFa: string; impactFa: string }> = {
  lead_orchestrator: {
    roleFa: 'هماهنگ‌کننده صف',
    dutyFa: 'پایش صف عملیات شبانه، تخصیص اولویت‌ها و توازن بار پردازش',
    impactFa: 'توزیع بهینه منابع ابری',
  },
  sales_leads: {
    roleFa: 'غربالگر سرنخ‌ها',
    dutyFa: 'تحلیل فرم‌های ورودی وب‌سایت، اعتبارسنجی سرنخ‌ها و امتیازدهی خودکار',
    impactFa: 'آماده‌سازی لیدها برای صبح',
  },
  purchase_supply: {
    roleFa: 'پایش قیمت و موجودی',
    dutyFa: 'استعلام شبانه نرخ اقلام، تطبیق پیش‌فاکتورها و هشدار کسری انبار',
    impactFa: 'جلوگیری از توقف تامین کالا',
  },
  customer_response: {
    roleFa: 'پاسخگوی ۲۴/۷',
    dutyFa: 'تریاژ تیکت‌های پشتیبانی خارج از تایم اداری و ارسال پاسخ‌های اولیه آنی',
    impactFa: 'کاهش زمان انتظار به زیر ۳۰ ثانیه',
  },
  hr_manager: {
    roleFa: 'انطباق تردد و پرسنل',
    dutyFa: 'تطبیق کارکرد روزانه، مغایرت‌گیری تایم‌شیت‌ها و آماده‌سازی گزارش حضور',
    impactFa: 'صفر شدن خطای محاسبات کارکرد',
  },
  reservation: {
    roleFa: 'پذیرش و رزرو آنلاین',
    dutyFa: 'ثبت و تایید نوبت‌های ثبت‌شده در نیمه‌شب و ارسال پیامک یادآوری',
    impactFa: 'رزرو پایدار بدون نیاز به منشی',
  },
  project_process: {
    roleFa: 'پایشگر پروژه‌ها',
    dutyFa: 'بررسی ددلاین تسک‌ها، پیگیری پیشرفت اسپرینت و ثبت هشدار تاخیر',
    impactFa: 'شفافیت روند پیشرفت اسپرینت',
  },
  instagrammer: {
    roleFa: 'سوشال و اینگیجمنت',
    dutyFa: 'پایش کامنت‌ها و دایرکت‌های شبانه، دسته‌بندی علاقه‌مندی‌ها و زمان‌بندی انتشار',
    impactFa: 'حفظ تعامل در اوج ساعات مصرف',
  },
  system_guide: {
    roleFa: 'نگهبان و عیب‌یاب',
    dutyFa: 'پایش سلامت کوئری‌ها، اعتبارسنجی یکپارچگی داده‌ها و بهینه‌سازی جداول',
    impactFa: 'پایداری ۱۰۰٪ دیتابیس',
  },
};

const SEED_STREAM_EVENTS: Omit<NightShiftActivityEvent, 'timestampStr'>[] = [
  {
    id: 'ev-1',
    agentKey: 'customer_response',
    actionTitleFa: 'پاسخگویی به درخواست پشتیبانی شبانه',
    detailFa: 'ثبت تیکت کاربر #۲۹۴، شناسایی خطا در درگاه و ارسال راهنمای ثبت دستی',
    category: 'support',
    status: 'done',
    impactFa: 'زمان پاسخ: ۲۴ ثانیه',
  },
  {
    id: 'ev-2',
    agentKey: 'sales_leads',
    actionTitleFa: 'امتیازدهی به ۳ سرنخ ورودی وب‌سایت',
    detailFa: 'اعتبارسنجی شماره تماس و شرکت ثبت‌نامی در لندینگ پیج سازمانی',
    category: 'sales',
    status: 'done',
    impactFa: 'رتبه کیفی A+ اختصاص یافت',
  },
  {
    id: 'ev-3',
    agentKey: 'purchase_supply',
    actionTitleFa: 'تطبیق نرخ بازار ۵ قلم کالای اساسی',
    detailFa: 'پایش قیمت تامین‌کنندگان اصلی و ثبت پیش‌نویس سفارش برای حفظ حد آستانه انبار',
    category: 'supply',
    status: 'done',
    impactFa: '۴٪ صرفه‌جویی قیمت خرید',
  },
  {
    id: 'ev-4',
    agentKey: 'reservation',
    actionTitleFa: 'تایید رزرو آنلاین خارج از ساعت اداری',
    detailFa: 'تخصیص زمان ملاقات روز دوشنبه برای درخواست آنلاین و ارسال پیامک تایید',
    category: 'sales',
    status: 'done',
    impactFa: 'بدون تداخل با تقویم تیم',
  },
  {
    id: 'ev-5',
    agentKey: 'project_process',
    actionTitleFa: 'پایش وظایف معوق و یادآوری ددلاین',
    detailFa: 'بررسی ۳۲ کارت کانبان، ارزیابی وابستگی تسک‌های مسدودشده و ثبت نوتیفیکیشن',
    category: 'process',
    status: 'done',
    impactFa: 'جلوگیری از انحراف اسپرینت',
  },
  {
    id: 'ev-6',
    agentKey: 'lead_orchestrator',
    actionTitleFa: 'بهینه‌سازی صف پردازش پس‌زمینه',
    detailFa: 'توزیع وظایف دوره‌ای ایجنت‌ها در پنجره خلوت بار سرور جهت کاهش لتنسی',
    category: 'system',
    status: 'processing',
    impactFa: 'لتنسی زیر ۴۵ میلی‌ثانیه',
  },
];

type AutonomousNightShiftHubProps = {
  className?: string;
  onOpenAgentModal?: (agentKey: AgentKey) => void;
  activeAgentsCount?: number;
};

export const AutonomousNightShiftHub: React.FC<AutonomousNightShiftHubProps> = ({
  className = '',
  onOpenAgentModal,
  activeAgentsCount = 9,
}) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'3d' | 'compact'>('3d');
  const [selectedAgentKey, setSelectedAgentKey] = useState<AgentKey>('lead_orchestrator');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [isScanning, setIsScanning] = useState(false);
  const [liveClock, setLiveClock] = useState('');
  const [, setPulseTick] = useState(0);

  // Live Iranian Standard Time Clock
  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date();
        const timePart = now.toLocaleTimeString('fa-IR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
        setLiveClock(timePart);
      } catch {
        setLiveClock('۰۰:۰۰:۰۰');
      }
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Subtle continuous flow tick for visual energy packets
  useEffect(() => {
    const pulseTimer = setInterval(() => {
      setPulseTick((prev) => (prev + 1) % 100);
    }, 1500);
    return () => clearInterval(pulseTimer);
  }, []);

  const streamEvents = useMemo<NightShiftActivityEvent[]>(() => {
    return SEED_STREAM_EVENTS.map((item, idx) => {
      const minutesAgo = (idx * 14) + 3;
      const d = new Date(Date.now() - minutesAgo * 60 * 1000);
      const timeStr = d.toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return {
        ...item,
        timestampStr: timeStr,
      };
    });
  }, []);

  const filteredEvents = useMemo(() => {
    if (filterCategory === 'all') return streamEvents;
    return streamEvents.filter((ev) => ev.category === filterCategory);
  }, [filterCategory, streamEvents]);

  const handleInstantTrigger = useCallback(async () => {
    setIsScanning(true);
    message.loading({ content: 'در حال اجرای صف پایش سراسری ایجنت‌های شبانه‌روزی...', key: 'night-shift-scan' });
    try {
      await new Promise((res) => setTimeout(res, 900));
      message.success({
        content: 'تمام ۹ ایجنت تخصصی وضعیت پایدار گزارش کردند؛ صف وظایف شبانه به‌روز شد.',
        key: 'night-shift-scan',
        duration: 3,
      });
    } finally {
      setIsScanning(false);
    }
  }, []);

  const selectedAgentMeta = useMemo(() => {
    const def = AI_AGENT_CATALOG.find((item) => item.key === selectedAgentKey) || AI_AGENT_CATALOG[0];
    const duty = NIGHT_SHIFT_DUTIES[def.key] || {
      roleFa: 'پایش خودکار',
      dutyFa: 'اجرای وظایف پس‌زمینه و هماهنگی داده‌ها',
      impactFa: 'افزایش راندمان',
    };
    const profile = getCameoProfile(def.key);
    return { def, duty, profile };
  }, [selectedAgentKey]);

  return (
    <section
      dir="rtl"
      data-testid="autonomous-night-shift-hub"
      className={`relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-[#050816] via-[#090d22] to-[#030612] p-4 text-white shadow-2xl shadow-indigo-950/60 sm:p-6 lg:p-7 ${className}`}
    >
      <style>{`
        @keyframes nightGlowPulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.08); }
        }
        @keyframes packetFlowForward {
          0% { stroke-dashoffset: 40; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes orbitRotateSlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes corePulseRays {
          0%, 100% { transform: scale(0.96); opacity: 0.6; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes float3DIsometric {
          0%, 100% { transform: translateY(0px) rotateX(14deg); }
          50% { transform: translateY(-4px) rotateX(12deg); }
        }
        .kalam-night-bg-grid {
          background-image: 
            linear-gradient(to right, rgba(99, 102, 241, 0.07) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(99, 102, 241, 0.07) 1px, transparent 1px);
          background-size: 32px 32px;
        }
        .kalam-packet-stream {
          stroke-dasharray: 6 10;
          animation: packetFlowForward 1.8s linear infinite;
        }
        .kalam-core-orbit {
          animation: orbitRotateSlow 32s linear infinite;
        }
        .kalam-3d-stage {
          transform-style: preserve-3d;
          animation: float3DIsometric 5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .kalam-packet-stream,
          .kalam-core-orbit,
          .kalam-3d-stage {
            animation: none !important;
          }
        }
      `}</style>

      {/* Cyber Grid & Ambient Radial Light Fields */}
      <div className="kalam-night-bg-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-24 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full bg-fuchsia-600/10 blur-3xl" />

      {/* Top Bar: Operational Status & Controls */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-indigo-500/20 pb-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/35 bg-indigo-500/15 px-3 py-1 text-[11px] font-bold text-indigo-200 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span>شیفت شبانه خودمختار</span>
            <span className="text-indigo-400/60">•</span>
            <span>۲۴/۷ Autonomous Hub</span>
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] text-slate-300">
            <ClockCircleOutlined className="text-cyan-400" />
            <span className="font-mono text-cyan-200">{liveClock}</span>
            <span className="text-[10px] text-slate-400">ساعت زنده سیستم</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                viewMode === '3d'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <RocketOutlined />
              <span>فضای ۳ بعدی</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                viewMode === 'compact'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <AppstoreOutlined />
              <span>شبکه فشرده</span>
            </button>
          </div>

          <Button
            size="small"
            icon={<ReloadOutlined spin={isScanning} />}
            loading={isScanning}
            onClick={handleInstantTrigger}
            className="!inline-flex !items-center !gap-1 !rounded-xl !border-indigo-400/40 !bg-indigo-500/20 !text-[11px] !font-bold !text-indigo-100 hover:!border-indigo-300 hover:!bg-indigo-500/30"
          >
            پایش فوری ایجنت‌ها
          </Button>

          <Tooltip title="تنظیمات زمان‌بندی و هوش مصنوعی سازمان">
            <Button
              size="small"
              icon={<SettingOutlined />}
              onClick={() => navigate('/ai/agents')}
              className="!inline-flex !items-center !rounded-xl !border-white/10 !bg-white/[0.05] !text-slate-300 hover:!border-white/20 hover:!text-white"
            />
          </Tooltip>
        </div>
      </div>

      {/* Hero Headline & Philosophy */}
      <div className="relative z-10 mt-5 max-w-4xl">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300/90">
          <ThunderboltOutlined className="text-amber-400" />
          <span>هوش مصنوعی سازمانی فعال در تمام ساعات غیاب کاربر</span>
        </div>
        <h2 className="mt-1.5 text-xl font-black leading-tight sm:text-2xl md:text-3xl text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-sky-300">
          وقتی شما خوابید؛ ایجنت‌ها و اتوماسیون‌های تازه‌سیستم در حال کارند
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-300 sm:text-sm max-w-3xl">
          در ساعات تعطیلی و نیمه‌شب، فرآیندهای کسب‌وکار متوقف نمی‌شوند. ایجنت‌های تخصصی بدون وقفه سرنخ‌های ورودی را غربالگری، نوبت‌ها را ثبت، قیمت‌های تامین را تطبیق، پیام‌های مشتریان را بررسی و وظایف پروژه‌ها را پیش می‌برند تا صبح با خیالی آسوده کار را از نقطه‌ای جلوتر آغاز کنید.
        </p>
      </div>

      {/* The 4 Core Key Performance Indicators (شاخص‌ها) */}
      <div className="relative z-10 mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3.5">
        {/* KPI 1 */}
        <div className="relative overflow-hidden rounded-2xl border border-indigo-400/25 bg-gradient-to-br from-indigo-950/40 via-indigo-900/15 to-transparent p-3.5 backdrop-blur-md transition hover:border-indigo-400/45">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-300">عملیات خودکار شبانه‌روزی</span>
            <Tag color="cyan" className="m-0 !rounded-full !px-1.5 !py-0 !text-[9.5px] !border-cyan-500/40">
              ۹۹.۶٪ موفق
            </Tag>
          </div>
          <div className="mt-2 font-mono text-xl font-black text-white sm:text-2xl">
            {toPersianNumber('+۱,۸۴۰')}
          </div>
          <div className="mt-1 text-[10px] text-indigo-200/80">
            پایش هفتگی بدون نیاز به باز بودن مرورگر
          </div>
        </div>

        {/* KPI 2 */}
        <div className="relative overflow-hidden rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-950/40 via-cyan-900/15 to-transparent p-3.5 backdrop-blur-md transition hover:border-cyan-400/45">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-300">ساعات پایش پیوسته</span>
            <Tag color="processing" className="m-0 !rounded-full !px-1.5 !py-0 !text-[9.5px]">
              پایدار
            </Tag>
          </div>
          <div className="mt-2 font-mono text-xl font-black text-cyan-200 sm:text-2xl">
            {toPersianNumber('۲۴ / ۷')}
          </div>
          <div className="mt-1 text-[10px] text-cyan-200/80">
            آماده‌باش مداوم و بدون وقفه در ایام تعطیل
          </div>
        </div>

        {/* KPI 3 */}
        <div className="relative overflow-hidden rounded-2xl border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-950/40 via-fuchsia-900/15 to-transparent p-3.5 backdrop-blur-md transition hover:border-fuchsia-400/45">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-300">ایجنت‌های شبانه‌روزی</span>
            <Tag color="purple" className="m-0 !rounded-full !px-1.5 !py-0 !text-[9.5px] !border-purple-500/40">
              Cameo Active
            </Tag>
          </div>
          <div className="mt-2 font-mono text-xl font-black text-fuchsia-200 sm:text-2xl">
            {toPersianNumber(activeAgentsCount)} ایجنت
          </div>
          <div className="mt-1 text-[10px] text-fuchsia-200/80">
            پرسوناهای تخصصی متصل به فرآیندها
          </div>
        </div>

        {/* KPI 4 */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-950/40 via-amber-900/15 to-transparent p-3.5 backdrop-blur-md transition hover:border-amber-400/45">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-300">زمان ذخیره‌شده سازمان</span>
            <Tag color="warning" className="m-0 !rounded-full !px-1.5 !py-0 !text-[9.5px] !border-amber-500/40">
              صرفه‌جویی
            </Tag>
          </div>
          <div className="mt-2 font-mono text-xl font-black text-amber-200 sm:text-2xl">
            {toPersianNumber('۵۴')} ساعت/هفته
          </div>
          <div className="mt-1 text-[10px] text-amber-200/80">
            معادل کارکرد دو کارشناس اداری تمام‌وقت
          </div>
        </div>
      </div>

      {/* Main Interactive Stage: 3D HTML / Kinetic Constellation OR Matrix View */}
      <div className="relative z-10 mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Column (Desktop 7 cols): The 3D Orbital Flow Stage */}
        <div className="lg:col-span-7">
          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-indigo-500/25 bg-[#070b1a]/90 p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                <span className="text-xs font-bold text-slate-200">
                  {viewMode === '3d' ? 'نمای مداری ۳ بعدی و جریان داده‌ها' : 'شبکه وضعیت ایجنت‌های شبانه'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                روی هر ایجنت کلیک کنید تا جزئیات پایش را مشاهده کنید
              </span>
            </div>

            {viewMode === '3d' ? (
              /* 3D Perspective HTML Stage */
              <div
                className="relative my-2 flex min-h-[340px] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-indigo-950/30 to-[#030611] p-3"
                style={{ perspective: '1000px' }}
              >
                {/* Visual SVG Data Energy Conduits / Connecting Beams */}
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 500 340"
                  fill="none"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id="laserBeamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
                      <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0.8" />
                    </linearGradient>
                  </defs>

                  {/* Concentric Orbital Radar Rings around the Core */}
                  <circle cx="250" cy="170" r="140" stroke="#6366f1" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="4 4" />
                  <circle cx="250" cy="170" r="95" stroke="#06b6d4" strokeOpacity="0.18" strokeWidth="1" />
                  <circle cx="250" cy="170" r="50" stroke="#818cf8" strokeOpacity="0.25" strokeWidth="1.2" strokeDasharray="6 6" className="kalam-core-orbit" />

                  {/* Radiating Flow Lines from Core (250, 170) to 8 Peripheral Points */}
                  <line x1="250" y1="170" x2="80" y2="60" stroke="url(#laserBeamGrad)" strokeWidth="1.5" className="kalam-packet-stream" />
                  <line x1="250" y1="170" x2="250" y2="40" stroke="url(#laserBeamGrad)" strokeWidth="1.5" className="kalam-packet-stream" />
                  <line x1="250" y1="170" x2="420" y2="60" stroke="url(#laserBeamGrad)" strokeWidth="1.5" className="kalam-packet-stream" />
                  <line x1="250" y1="170" x2="70" y2="170" stroke="url(#laserBeamGrad)" strokeWidth="1.5" className="kalam-packet-stream" />
                  <line x1="250" y1="170" x2="430" y2="170" stroke="url(#laserBeamGrad)" strokeWidth="1.5" className="kalam-packet-stream" />
                  <line x1="250" y1="170" x2="90" y2="280" stroke="url(#laserBeamGrad)" strokeWidth="1.5" className="kalam-packet-stream" />
                  <line x1="250" y1="170" x2="250" y2="300" stroke="url(#laserBeamGrad)" strokeWidth="1.5" className="kalam-packet-stream" />
                  <line x1="250" y1="170" x2="410" y2="280" stroke="url(#laserBeamGrad)" strokeWidth="1.5" className="kalam-packet-stream" />
                </svg>

                {/* 3D Tilted Container for Core + Agent Constellation */}
                <div className="kalam-3d-stage relative h-[320px] w-full max-w-[480px]">
                  {/* Central Node: TazeSystem Autonomous Core */}
                  <div
                    style={{ transform: 'translateZ(35px)' }}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center"
                  >
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/50 bg-gradient-to-br from-indigo-900 via-slate-900 to-cyan-950 shadow-lg shadow-cyan-500/30">
                      <div className="absolute inset-0 rounded-2xl bg-cyan-400/20 blur-md animate-pulse" />
                      <ThunderboltOutlined className="text-2xl text-cyan-300 relative z-10" />
                    </div>
                    <span className="mt-1.5 rounded-full border border-cyan-400/30 bg-black/70 px-2 py-0.5 text-[9.5px] font-bold text-cyan-200 backdrop-blur-sm">
                      هسته اتوماسیون
                    </span>
                  </div>

                  {/* 8-9 Orbiting Agent Cards in 3D Space */}
                  {AI_AGENT_CATALOG.slice(0, 9).map((agent, index) => {
                    // Position agents symmetrically in elliptical orbit
                    const total = 9;
                    const angle = (index * (2 * Math.PI / total)) - (Math.PI / 2);
                    const rx = 180; // horizontal radius
                    const ry = 115; // vertical radius
                    const x = 240 + rx * Math.cos(angle);
                    const y = 160 + ry * Math.sin(angle);
                    const isSelected = selectedAgentKey === agent.key;

                    return (
                      <div
                        key={agent.key}
                        style={{
                          left: `${x}px`,
                          top: `${y}px`,
                          transform: `translate(-50%, -50%) translateZ(${isSelected ? '50px' : '20px'})`,
                        }}
                        onClick={() => setSelectedAgentKey(agent.key)}
                        role="button"
                        tabIndex={0}
                        className={`group absolute flex cursor-pointer flex-col items-center transition-all duration-300 ${
                          isSelected ? 'scale-110 z-30' : 'hover:scale-105 z-20 opacity-90 hover:opacity-100'
                        }`}
                      >
                        <div
                          className={`relative flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-300 ${
                            isSelected
                              ? 'border-white bg-slate-900 shadow-lg ring-2'
                              : 'border-white/20 bg-slate-900/90 hover:border-white/50'
                          }`}
                          style={{
                            borderColor: isSelected ? agent.badgeColor : undefined,
                            boxShadow: isSelected ? `0 0 16px ${agent.badgeColor}80` : undefined,
                          }}
                        >
                          <AiAgentCameoFigure
                            agentKey={agent.key}
                            size={32}
                            accentColor={agent.badgeColor}
                          />

                          {/* Live Activity Beacon */}
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950"
                            style={{ backgroundColor: agent.badgeColor }}
                          />
                        </div>

                        <span
                          className={`mt-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[9.5px] font-bold transition ${
                            isSelected
                              ? 'bg-white text-slate-950 shadow-sm'
                              : 'bg-black/60 text-slate-300 group-hover:text-white'
                          }`}
                        >
                          {agent.shortTitleFa}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Compact Grid View */
              <div className="grid grid-cols-3 gap-2 py-2">
                {AI_AGENT_CATALOG.slice(0, 9).map((agent) => {
                  const isSelected = selectedAgentKey === agent.key;
                  const duty = NIGHT_SHIFT_DUTIES[agent.key];
                  return (
                    <div
                      key={agent.key}
                      onClick={() => setSelectedAgentKey(agent.key)}
                      role="button"
                      tabIndex={0}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2 transition ${
                        isSelected
                          ? 'border-indigo-400 bg-indigo-950/60 shadow-md ring-1 ring-indigo-400/50'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${agent.badgeColor}20` }}
                      >
                        <AiAgentCameoFigure agentKey={agent.key} size={28} accentColor={agent.badgeColor} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-white">{agent.shortTitleFa}</div>
                        <div className="truncate text-[10px] text-slate-400">{duty?.roleFa || 'ایجنت خودکار'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Selected Agent Quick Detail Strip */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${selectedAgentMeta.def.badgeColor}25` }}
                >
                  <AiAgentCameoFigure
                    agentKey={selectedAgentMeta.def.key}
                    size={24}
                    accentColor={selectedAgentMeta.def.badgeColor}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{selectedAgentMeta.def.titleFa}</span>
                    <span className="rounded bg-indigo-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-indigo-300">
                      {selectedAgentMeta.duty.roleFa}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-slate-300 line-clamp-1">
                    {selectedAgentMeta.duty.dutyFa}
                  </div>
                </div>
              </div>

              {onOpenAgentModal ? (
                <Button
                  size="small"
                  type="link"
                  icon={<EyeOutlined />}
                  onClick={() => onOpenAgentModal(selectedAgentMeta.def.key)}
                  className="!text-[11px] !font-bold !text-cyan-300 hover:!text-cyan-200"
                >
                  مشاهده پروفایل و زمان‌بندی
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right Column (Desktop 5 cols): Live Operational Stream / Terminal Feed */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-indigo-500/25 bg-[#070b1a]/90 p-4 backdrop-blur-xl">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                </span>
                <span className="text-xs font-bold text-slate-200">جریان زنده رخدادها و لاگ شبانه</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                {toPersianNumber(filteredEvents.length)} رخداد ثبتی
              </span>
            </div>

            {/* Filter Pills */}
            <div className="mt-2.5 flex flex-wrap gap-1">
              {[
                { key: 'all', label: 'همه' },
                { key: 'sales', label: 'فروش و سرنخ' },
                { key: 'support', label: 'مشتریان' },
                { key: 'supply', label: 'تامین و انبار' },
                { key: 'process', label: 'پروژه‌ها' },
              ].map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setFilterCategory(pill.key)}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold transition ${
                    filterCategory === pill.key
                      ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/40'
                      : 'text-slate-400 hover:text-white bg-white/[0.03]'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Event List */}
            <div className="mt-3 space-y-2 max-h-[310px] overflow-y-auto pr-1">
              {filteredEvents.map((ev) => {
                const agent = AI_AGENT_CATALOG.find((a) => a.key === ev.agentKey) || AI_AGENT_CATALOG[0];
                return (
                  <div
                    key={ev.id}
                    className="group relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 transition hover:border-indigo-400/30 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                          style={{ backgroundColor: `${agent.badgeColor}25` }}
                        >
                          <AiAgentCameoFigure agentKey={agent.key} size={15} accentColor={agent.badgeColor} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-200">{agent.shortTitleFa}</span>
                      </div>
                      <span className="font-mono text-[9.5px] text-slate-400">{ev.timestampStr}</span>
                    </div>

                    <div className="mt-1 text-[11px] font-medium text-indigo-100/90">{ev.actionTitleFa}</div>
                    <div className="mt-0.5 text-[10px] text-slate-400 leading-relaxed">{ev.detailFa}</div>

                    <div className="mt-1.5 flex items-center justify-between border-t border-white/[0.04] pt-1 text-[9.5px]">
                      <span className="text-emerald-300 inline-flex items-center gap-1">
                        <CheckCircleOutlined className="text-[9px]" />
                        {ev.impactFa}
                      </span>
                      <span className="text-[9px] text-slate-500">خودکارسازی ابری</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Security / Assurance Note */}
          <div className="mt-3 rounded-xl border border-indigo-400/20 bg-indigo-950/40 p-2.5 text-[10.5px] text-slate-300">
            <div className="flex items-center gap-1.5 font-bold text-indigo-200">
              <CheckCircleOutlined className="text-emerald-400" />
              <span>پروتکل ایمن بدون ریسک</span>
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400 leading-tight">
              اقدامات مالی و تراکنش‌های حساس همواره نیازمند تأیید نهایی مدیر در کارتابل هستند.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AutonomousNightShiftHub;
