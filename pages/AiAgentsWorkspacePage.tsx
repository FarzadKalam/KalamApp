import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Badge,
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Statistic,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import {
  ArrowRightOutlined,
  BookOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  ControlOutlined,
  MessageOutlined,
  PlayCircleOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SendOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import {
  AI_AGENT_CATALOG,
  formatPendingApprovalSummary,
  getAgentDefinition,
  getAgentTitleFa,
  getAgentToneLabelFa,
  resolvePendingApprovalAgentKey,
  type AgentKey,
  type AgentToneStyle,
} from '../utils/aiAgentCatalog';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import AiAgentConfigPanel from '../components/ai/AiAgentConfigPanel';
import AiAgentOnboardingWizard from '../components/ai/AiAgentOnboardingWizard';
import AiAgentMessagesCompactBox from '../components/ai/AiAgentMessagesCompactBox';
import AiAgentIcon, { AiAgentAvatar, AiAgentDeskSeatFigure } from '../components/ai/AiAgentIcon';
import AiSparkleIcon from '../components/ai/AiSparkleIcon';
import DashboardAgentDetailModal, { type DashboardAgentModalItem } from '../components/dashboard/DashboardAgentDetailModal';

const getModuleTitle = (moduleId: string): string => (
  MODULES[moduleId]?.titles?.faSingular || MODULES[moduleId]?.titles?.fa || moduleId
);

const CHANNEL_LABEL_FA: Record<string, string> = {
  web: 'پنل وب',
  staff_bot: 'بات همکار',
  agent_inbox: 'صندوق ایجنت',
  background: 'اجرای خودکار سرور',
  workflow: 'گردش کار',
};

const RUN_STATUS_META: Record<string, { label: string; color: string }> = {
  completed: { label: 'انجام شد', color: 'green' },
  running: { label: 'در حال اجرا', color: 'processing' },
  waiting_approval: { label: 'در انتظار تایید', color: 'warning' },
  waiting_confirmation: { label: 'در انتظار تایید', color: 'warning' },
  failed: { label: 'ناموفق', color: 'red' },
  skipped: { label: 'بدون تغییر', color: 'default' },
  cancelled: { label: 'لغو شد', color: 'default' },
};

const STUDIO_DESK_GROUPS: Array<{
  id: string;
  titleFa: string;
  subtitleFa: string;
  accentGradient: string;
  agentKeys: AgentKey[];
  spanClass: string;
}> = [
  {
    id: 'command',
    titleFa: 'میز فرماندهی و راهبری کل',
    subtitleFa: 'هماهنگی تیم، تحلیل بین‌دپارتمانی و جمع‌بندی گزارش‌های سازمان',
    accentGradient: 'from-indigo-50/80 via-white to-violet-50/55 dark:from-indigo-950/35 dark:via-dark-surface dark:to-violet-950/25',
    agentKeys: ['lead_orchestrator'],
    spanClass: 'xl:col-span-4',
  },
  {
    id: 'growth',
    titleFa: 'میز رشد، فروش و مشتریان',
    subtitleFa: 'سرنخ‌ها، فاکتورها، بازاریابی اینستاگرام و پاسخگویی یکپارچه',
    accentGradient: 'from-emerald-50/65 via-white to-sky-50/50 dark:from-emerald-950/25 dark:via-dark-surface dark:to-sky-950/20',
    agentKeys: ['sales_leads', 'instagrammer', 'customer_response'],
    spanClass: 'xl:col-span-8',
  },
  {
    id: 'operations',
    titleFa: 'میز عملیات، خرید، پروژه و رزرواسیون',
    subtitleFa: 'زنجیره تامین، پروژه‌ها، فرآیندهای اجرایی و زمان‌بندی قرارها',
    accentGradient: 'from-sky-50/65 via-white to-indigo-50/55 dark:from-sky-950/25 dark:via-dark-surface dark:to-indigo-950/20',
    agentKeys: ['purchase_supply', 'project_process', 'reservation'],
    spanClass: 'xl:col-span-7',
  },
  {
    id: 'people_guide',
    titleFa: 'میز منابع انسانی و راهنمای سامانه',
    subtitleFa: 'حضور و مرخصی کارکنان، ساختار چارت و آموزش عملی نرم‌افزار',
    accentGradient: 'from-rose-50/55 via-white to-teal-50/55 dark:from-rose-950/20 dark:via-dark-surface dark:to-teal-950/20',
    agentKeys: ['hr_manager', 'system_guide'],
    spanClass: 'xl:col-span-5',
  },
];

const formatJalaliDateTime = (value?: string | null) => {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
  } catch {
    return new Intl.DateTimeFormat('fa-IR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
  }
};

const AiAgentsWorkspacePage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [runningBackground, setRunningBackground] = useState(false);
  const [wizardAgentKey, setWizardAgentKey] = useState<AgentKey | null>(null);
  const [activeModalAgentKey, setActiveModalAgentKey] = useState<AgentKey | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'floor' | 'inbox' | 'config'>('floor');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'get_agents_workspace_overview' },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'دریافت میز کار ایجنت‌ها ناموفق بود.'));
      setOverview(data);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'بارگذاری میز کار ایجنت‌ها ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleResolveApproval = async (actionLogId: string, decision: 'approve' | 'reject') => {
    if (!actionLogId || resolvingId) return;
    setResolvingId(actionLogId);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'resolve_waiting_approval', actionLogId, decision },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'ثبت تصمیم ناموفق بود.'));
      message.success(decision === 'approve' ? 'عملیات تایید و اجرا شد.' : 'عملیات پیشنهادی لغو شد.');
      await loadOverview();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ثبت تصمیم تایید/رد ناموفق بود.'));
    } finally {
      setResolvingId(null);
    }
  };

  const handleRunBackgroundNow = async () => {
    setRunningBackground(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'run_background_agents' },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'اجرای دوره‌ای ایجنت‌ها ناموفق بود.'));
      message.success(`بررسی خودکار ایجنت‌ها انجام شد (${toPersianNumber(Number(data?.runsTriggered || 0))} اجرا).`);
      await loadOverview();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'اجرای ایجنت‌های پس‌زمینه ناموفق بود.'));
    } finally {
      setRunningBackground(false);
    }
  };

  const modelLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const model of Array.isArray(overview?.models) ? overview.models : []) {
      const id = String(model?.id || '').trim();
      if (id) map[id] = String(model?.displayName || model?.display_name_fa || id).trim();
    }
    return map;
  }, [overview?.models]);

  const recentRuns = useMemo(
    () => (Array.isArray(overview?.recentRuns) ? overview.recentRuns : []),
    [overview?.recentRuns],
  );

  const agentsList = useMemo(() => {
    const serverAgents = Array.isArray(overview?.agents) ? overview.agents : [];
    if (!overview) return [];
    const byKey = new Map<string, any>(serverAgents.map((item: any) => [String(item?.key || ''), item]));
    const runsByAgent: Record<string, any[]> = {};
    for (const run of recentRuns) {
      const key = String(run?.agent_key || '').trim();
      if (!key) continue;
      if (!runsByAgent[key]) runsByAgent[key] = [];
      runsByAgent[key].push(run);
    }

    return AI_AGENT_CATALOG
      .map((def) => {
        const match = byKey.get(def.key);
        if (!match) return null;
        const canView = (match.canView ?? match.canUse) !== false;
        if (!canView) return null;
        const orgEnabled = match.orgEnabled !== false && match.isEnabled !== false;
        const planAllowed = match.planAllowed !== false;
        const canChat = orgEnabled && planAllowed && (match.canChat ?? match.canUse) !== false;
        const canToggle = Boolean(match.canToggle ?? overview?.canManage);
        const canEdit = Boolean(match.canEdit ?? overview?.canManage);
        return {
          ...def,
          ...match,
          orgEnabled,
          planAllowed,
          rbacAllowed: match.rbacAllowed !== false,
          canView: true,
          canChat,
          canToggle,
          canEdit,
          canUse: canChat,
          isWorking: match.isWorking === true,
          toneStyle: (match.toneStyle || def.defaultToneStyle) as AgentToneStyle,
          backgroundConfig: match.backgroundConfig || def.defaultBackgroundConfig,
          usageStats: match.usageStats || { runs: 0, totalTokens: 0, cachedTokens: 0, savingsIrt: 0, todaySpentIrt: 0 },
          workflowTriggers: Array.isArray(match.workflowTriggers) ? match.workflowTriggers : [],
          recentRuns: runsByAgent[def.key] || [],
        };
      })
      .filter(Boolean) as any[];
  }, [overview, recentRuns]);

  const agentsByKey = useMemo(() => {
    const map = new Map<AgentKey, any>();
    for (const agent of agentsList) {
      map.set(agent.key as AgentKey, agent);
    }
    return map;
  }, [agentsList]);

  const pendingApprovals = useMemo(
    () => (Array.isArray(overview?.pendingApprovals) ? overview.pendingApprovals : []),
    [overview?.pendingApprovals],
  );

  const visibleDeskGroups = useMemo(
    () => STUDIO_DESK_GROUPS
      .map((group) => ({
        ...group,
        agents: group.agentKeys.map((k) => agentsByKey.get(k)).filter(Boolean),
      }))
      .filter((group) => group.agents.length > 0),
    [agentsByKey],
  );

  const activeModalAgent: DashboardAgentModalItem | null = useMemo(() => {
    if (!activeModalAgentKey) return null;
    const found = agentsByKey.get(activeModalAgentKey);
    if (!found) return null;
    return {
      key: found.key,
      titleFa: found.titleFa,
      shortTitleFa: found.shortTitleFa,
      subtitleFa: found.subtitleFa,
      descriptionFa: found.descriptionFa,
      badgeColor: found.badgeColor,
      iconKey: found.iconKey,
      supportsBackground: found.supportsBackground,
      orgEnabled: found.orgEnabled,
      planAllowed: found.planAllowed,
      canView: found.canView,
      canChat: found.canChat,
      canToggle: found.canToggle,
      canEdit: found.canEdit,
      isWorking: found.isWorking,
      toneStyle: found.toneStyle,
      backgroundConfig: found.backgroundConfig,
      backgroundLastRunAt: found.backgroundLastRunAt || null,
      backgroundLastStatus: found.backgroundLastStatus || null,
      backgroundLastSummary: found.backgroundLastSummary || null,
      backgroundLastError: found.backgroundLastError || null,
      nextBackgroundRunAt: found.nextBackgroundRunAt || null,
      usageStats: found.usageStats,
      effectiveModelId: found.effectiveModelId || null,
      effectiveFastModelId: found.effectiveFastModelId || null,
      workflowTriggers: found.workflowTriggers || [],
      recentRuns: found.recentRuns || [],
    };
  }, [activeModalAgentKey, agentsByKey]);

  const summaryStats = useMemo(() => {
    const permittedCount = agentsList.filter((a) => a.canChat).length;
    const workingCount = agentsList.filter((a) => a.isWorking).length;
    const totalTriggers = agentsList.reduce((sum, a) => sum + Number(a.workflowTriggers?.length || 0), 0);
    const totalSavingsIrt = agentsList.reduce((sum, a) => sum + Number(a.usageStats?.savingsIrt || 0), 0);
    return { permittedCount, workingCount, totalTriggers, totalSavingsIrt };
  }, [agentsList]);

  const canAccessConfigPanel = Boolean(
    overview?.canManage || agentsList.some((a) => a.canToggle || a.canEdit),
  );
  const canRunAnyBackground = Boolean(
    (overview?.canManage || agentsList.some((a) => a.canEdit)) && overview?.planFeatures?.ai_background_agents,
  );

  const openAgentChat = (agentKey: AgentKey, toneStyle?: string) => {
    navigate(`/ai?agent=${agentKey}`, {
      state: {
        aiInitialAgents: [agentKey],
        aiInitialToneStyle: toneStyle || 'friendly_warm',
        forceNewThread: true,
      },
    });
  };

  return (
    <div dir="rtl" className="mx-auto max-w-[1640px] space-y-5 p-4 md:p-6">
      <style>{`
        @keyframes kalamDeskWorkingFloat {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          35% { transform: translateY(-2.4px) rotate(-0.9deg); }
          70% { transform: translateY(-1.2px) rotate(0.9deg); }
        }
        @keyframes kalamDeskCalmIdle {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-1.2px); }
        }
        @keyframes kalamDeskHandTap {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-1.9px); }
        }
        @keyframes kalamScreenGlow {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.95; }
        }
        @keyframes kalamDotWave {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0px); }
          40% { opacity: 1; transform: translateY(-1px); }
        }
        @keyframes kalamAgentHalo {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.18); opacity: 0.35; }
        }
        @keyframes kalamPendingBob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-2.4px); }
        }
        .kalam-desk-agent-working {
          transform-box: fill-box;
          transform-origin: center bottom;
          animation: kalamDeskWorkingFloat 2.1s ease-in-out infinite;
        }
        .kalam-desk-agent-idle {
          transform-box: fill-box;
          transform-origin: center bottom;
          animation: kalamDeskCalmIdle 4.4s ease-in-out infinite;
        }
        .kalam-desk-hand-left {
          animation: kalamDeskHandTap 0.56s ease-in-out infinite;
        }
        .kalam-desk-hand-right {
          animation: kalamDeskHandTap 0.56s ease-in-out 0.28s infinite;
        }
        .kalam-desk-screen-glow {
          animation: kalamScreenGlow 2s ease-in-out infinite;
        }
        .kalam-desk-typing-dots .kalam-dot-1 {
          animation: kalamDotWave 1.2s ease-in-out 0s infinite;
        }
        .kalam-desk-typing-dots .kalam-dot-2 {
          animation: kalamDotWave 1.2s ease-in-out 0.2s infinite;
        }
        .kalam-desk-typing-dots .kalam-dot-3 {
          animation: kalamDotWave 1.2s ease-in-out 0.4s infinite;
        }
        .kalam-agent-working-halo {
          animation: kalamAgentHalo 2s ease-in-out infinite;
        }
        .kalam-desk-pending-bob {
          animation: kalamPendingBob 2.2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .kalam-desk-agent-working,
          .kalam-desk-agent-idle,
          .kalam-desk-hand-left,
          .kalam-desk-hand-right,
          .kalam-desk-screen-glow,
          .kalam-desk-typing-dots circle,
          .kalam-agent-working-halo,
          .kalam-desk-pending-bob {
            animation: none !important;
          }
        }
      `}</style>

      {/* Studio Header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/85 bg-gradient-to-l from-indigo-50/70 via-white to-sky-50/45 p-4 shadow-sm dark:border-white/10 dark:from-indigo-950/30 dark:via-dark-surface dark:to-slate-900 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <AiSparkleIcon className="h-5 w-5 text-[rgb(var(--brand-600-rgb))]" />
            <h1 className="m-0 text-lg font-black text-slate-900 dark:text-white">
              دفتر کار مجازی و استودیوی ایجنت‌های سازمان
            </h1>
            {summaryStats.workingCount > 0 ? (
              <Tag color="processing">{toPersianNumber(summaryStats.workingCount)} ایجنت در حال کار</Tag>
            ) : (
              <Tag color="green">همه میزها آماده پاسخ‌گویی</Tag>
            )}
          </div>
          <p className="m-0 text-xs text-slate-600 dark:text-slate-300">
            چیدمان زندهٔ کارکنان هوش مصنوعی پشت میزهای دپارتمانی، وضعیت اجرا، فعال‌کننده‌های گردش کار و گفتگو با هر تخصص.
          </p>
        </div>

        <Space wrap>
          <Button icon={<ArrowRightOutlined />} onClick={() => navigate('/ai')}>
            صفحه گفتگوی دستیار
          </Button>
          <Button icon={<MessageOutlined />} onClick={() => setActiveWorkspaceTab('inbox')}>
            صندوق گفتگوها
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void loadOverview()} loading={loading}>
            بروزرسانی
          </Button>
          {canRunAnyBackground ? (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={runningBackground}
              onClick={() => void handleRunBackgroundNow()}
            >
              اجرای خودکار همین الان
            </Button>
          ) : null}
        </Space>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card size="small" className="rounded-2xl">
          <Statistic title="ایجنت‌های آماده گفتگو" value={toPersianNumber(summaryStats.permittedCount)} suffix={`/ ${toPersianNumber(agentsList.length)}`} />
        </Card>
        <Card size="small" className="rounded-2xl">
          <Statistic title="در انتظار تایید شما" value={toPersianNumber(pendingApprovals.length)} />
        </Card>
        <Card size="small" className="rounded-2xl">
          <Statistic title="فعال‌کننده‌های گردش کار" value={toPersianNumber(summaryStats.totalTriggers)} suffix="سناریو" />
        </Card>
        <Card size="small" className="rounded-2xl">
          <Statistic title="صرفه‌جویی کش پرامپت" value={toPersianNumber(Math.round(summaryStats.totalSavingsIrt))} suffix="تومان" />
        </Card>
      </div>

      {/* Knowledge & Staff Bot Quick Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/75 bg-slate-50/85 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]">
        <span className="font-bold text-slate-600 dark:text-slate-300">منابع دانش و قوانین کاری تیم:</span>
        <Button size="small" icon={<BookOutlined />} onClick={() => navigate('/org-knowledge')}>دانش سازمان</Button>
        <Button size="small" onClick={() => navigate('/instructions')}>دستورالعمل‌ها</Button>
        <Button size="small" onClick={() => navigate('/job_descriptions')}>شرح شغل‌ها</Button>
        <Button size="small" onClick={() => navigate('/work_schedules')}>برنامه کاری</Button>
        <Button size="small" icon={<ThunderboltOutlined />} onClick={() => navigate('/settings')}>موتور گردش کارها</Button>
        {overview?.planFeatures?.ai_staff_bot === true && (overview?.canManage === true || agentsList.some((a) => a.staffBotEnabled === true)) ? (
          <Button size="small" icon={<RobotOutlined />} onClick={() => navigate('/profile')}>
            اتصال بات همکار در پروفایل
          </Button>
        ) : null}
      </div>

      {loading && !overview ? (
        <div className="flex justify-center py-14">
          <Spin size="large" />
        </div>
      ) : agentsList.length === 0 ? (
        <Card size="small" className="rounded-2xl py-8">
          <Empty description="در حال حاضر هیچ ایجنتی برای نقش سازمانی یا پلن فعلی شما فعال نیست." />
        </Card>
      ) : (
        <Tabs
          activeKey={activeWorkspaceTab}
          onChange={(k) => setActiveWorkspaceTab(k as 'floor' | 'inbox' | 'config')}
          items={[
            {
              key: 'floor',
              label: (
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <RobotOutlined />
                  سالن دفتر کار مجازی ({toPersianNumber(agentsList.length)})
                </span>
              ),
              children: (
                <div className="space-y-5">
                  {/* Multi-Desk Dynamic Virtual Office */}
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                    {visibleDeskGroups.map((desk) => {
                      const deskWorkingCount = desk.agents.filter((a: any) => a.isWorking).length;
                      const deskApprovalCount = desk.agents.reduce(
                        (sum: number, a: any) =>
                          sum + pendingApprovals.filter((p: any) => resolvePendingApprovalAgentKey(p) === a.key).length,
                        0,
                      );
                      return (
                        <div
                          key={desk.id}
                          className={`${desk.spanClass} flex flex-col justify-between rounded-3xl border border-slate-200/85 bg-gradient-to-b ${desk.accentGradient} p-4 shadow-sm dark:border-white/10`}
                        >
                          {/* Desk Header */}
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="m-0 text-sm font-black text-slate-900 dark:text-white">
                                  {desk.titleFa}
                                </h2>
                                {deskWorkingCount > 0 ? (
                                  <Tag color="processing" className="m-0 rounded-full text-[10px]">
                                    {toPersianNumber(deskWorkingCount)} در حال کار
                                  </Tag>
                                ) : null}
                                {deskApprovalCount > 0 ? (
                                  <Tag color="warning" className="m-0 rounded-full text-[10px]">
                                    {toPersianNumber(deskApprovalCount)} نیاز به تایید
                                  </Tag>
                                ) : null}
                              </div>
                              <p className="m-0 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                {desk.subtitleFa}
                              </p>
                            </div>
                          </div>

                          {/* Seated Agents Row behind this Department Desk */}
                          <div
                            className="grid gap-3 items-end"
                            style={{
                              gridTemplateColumns: `repeat(${desk.agents.length}, minmax(0, 1fr))`,
                            }}
                          >
                            {desk.agents.map((agent: any, idx: number) => {
                              const apprCount = pendingApprovals.filter(
                                (p: any) => resolvePendingApprovalAgentKey(p) === agent.key,
                              ).length;
                              return (
                                <div
                                  key={`figure-${agent.key}`}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setActiveModalAgentKey(agent.key)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setActiveModalAgentKey(agent.key);
                                    }
                                  }}
                                  className="group flex cursor-pointer flex-col items-center justify-end pt-1 transition-transform hover:-translate-y-1"
                                >
                                  <div className="mb-1 flex h-6 items-center justify-center">
                                    {apprCount > 0 ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-200">
                                        {toPersianNumber(apprCount)} تاییدیه
                                      </span>
                                    ) : agent.isWorking ? (
                                      <span
                                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1"
                                        style={{
                                          backgroundColor: `${agent.badgeColor}18`,
                                          color: agent.badgeColor,
                                          borderColor: `${agent.badgeColor}45`,
                                        }}
                                      >
                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: agent.badgeColor }} />
                                        در حال کار
                                      </span>
                                    ) : !agent.orgEnabled ? (
                                      <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">
                                        خاموش
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/20">
                                        آماده پشت میز
                                      </span>
                                    )}
                                  </div>

                                  <AiAgentDeskSeatFigure
                                    agentKey={agent.key}
                                    color={agent.badgeColor}
                                    isWorking={agent.isWorking}
                                    isSelected={false}
                                    canUse={true}
                                    orgEnabled={agent.orgEnabled}
                                    hasPending={apprCount > 0}
                                    seatIndex={idx}
                                  />
                                </div>
                              );
                            })}
                          </div>

                          {/* Sleek Architectural Desk Beam */}
                          <div className="pointer-events-none relative z-10 -mt-[2px]">
                            <div className="h-3 w-full rounded-full border border-indigo-200/80 bg-gradient-to-b from-slate-100 via-slate-200/90 to-indigo-100/80 shadow-sm dark:border-indigo-400/20 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900" />
                            <div className="mx-4 h-2 rounded-b-full bg-gradient-to-b from-slate-900/[0.08] to-transparent dark:from-black/40" />
                          </div>

                          {/* Desk Station Cards */}
                          <div className="mt-2 grid grid-cols-1 gap-2.5 md:grid-cols-[repeat(auto-fit,minmax(210px,1fr))]">
                            {desk.agents.map((agent: any) => {
                              const apprCount = pendingApprovals.filter(
                                (p: any) => resolvePendingApprovalAgentKey(p) === agent.key,
                              ).length;
                              const modelName = agent.effectiveModelId
                                ? (modelLabelMap[agent.effectiveModelId] || agent.effectiveModelId)
                                : 'پیش‌فرض سیستم';
                              const triggerCount = Number(agent.workflowTriggers?.length || 0);
                              return (
                                <div
                                  key={agent.key}
                                  onClick={() => setActiveModalAgentKey(agent.key)}
                                  className={`flex cursor-pointer flex-col justify-between rounded-2xl border bg-white/95 p-3 transition-all hover:border-indigo-300 hover:shadow-md dark:bg-white/[0.04] dark:hover:border-indigo-400/40 ${
                                    !agent.orgEnabled ? 'border-slate-200/70 opacity-75' : 'border-slate-200/90 dark:border-white/10'
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span
                                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                                          style={{
                                            backgroundColor: `${agent.badgeColor}1a`,
                                            color: agent.badgeColor,
                                          }}
                                        >
                                          <AiAgentIcon agentKey={agent.key} iconKey={agent.iconKey} size={17} color={agent.badgeColor} />
                                        </span>
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-black text-slate-900 dark:text-white">
                                              {agent.titleFa}
                                            </span>
                                            {apprCount > 0 ? (
                                              <Badge count={toPersianNumber(apprCount)} size="small" style={{ backgroundColor: '#d97706' }} />
                                            ) : null}
                                          </div>
                                          <div className="line-clamp-1 text-[10.5px] text-slate-500 dark:text-slate-400">
                                            {agent.subtitleFa}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                                      <Tooltip title="موتور هوش مصنوعی فعال برای این ایجنت">
                                        <Tag color="geekblue" className="m-0 rounded-md px-1.5 py-0 text-[10px]">
                                          {modelName}
                                        </Tag>
                                      </Tooltip>
                                      <Tag className="m-0 rounded-md px-1.5 py-0 text-[10px]">
                                        لحن: {getAgentToneLabelFa(agent.toneStyle)}
                                      </Tag>
                                      {triggerCount > 0 ? (
                                        <Tag color="purple" className="m-0 rounded-md px-1.5 py-0 text-[10px]">
                                          {toPersianNumber(triggerCount)} فعال‌کننده
                                        </Tag>
                                      ) : null}
                                      {agent.supportsBackground ? (
                                        <Tag
                                          color={agent.orgEnabled && agent.backgroundConfig?.enabled && overview?.planFeatures?.ai_background_agents ? 'green' : 'default'}
                                          className="m-0 rounded-md px-1.5 py-0 text-[10px]"
                                        >
                                          پایش خودکار: {agent.orgEnabled && agent.backgroundConfig?.enabled && overview?.planFeatures?.ai_background_agents ? 'روشن' : 'خاموش'}
                                        </Tag>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div
                                    className="mt-3 flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 pt-2 dark:border-white/10"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Space size={6}>
                                      {agent.canChat ? (
                                        <Button
                                          type="primary"
                                          size="small"
                                          icon={<SendOutlined />}
                                          onClick={() => openAgentChat(agent.key, agent.toneStyle)}
                                        >
                                          گفتگو
                                        </Button>
                                      ) : null}
                                      <Button
                                        size="small"
                                        icon={<ControlOutlined />}
                                        onClick={() => setActiveModalAgentKey(agent.key)}
                                      >
                                        گزارش و وظایف
                                      </Button>
                                    </Space>
                                    {agent.canEdit ? (
                                      <Tooltip title="پرسش و پاسخ تکمیلی برای آموزش این ایجنت">
                                        <Button
                                          size="small"
                                          icon={<QuestionCircleOutlined />}
                                          onClick={() => setWizardAgentKey(agent.key)}
                                        />
                                      </Tooltip>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Live Approvals & Recent Activity */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <Card
                      size="small"
                      className="rounded-2xl"
                      title={(
                        <span className="inline-flex items-center gap-2 font-bold">
                          <ClockCircleOutlined className="text-amber-500" />
                          صف تایید اقدامات ایجنت‌ها ({toPersianNumber(pendingApprovals.length)})
                        </span>
                      )}
                    >
                      {pendingApprovals.length === 0 ? (
                        <Empty description="اقدام معلقی برای تایید وجود ندارد." />
                      ) : (
                        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                          {pendingApprovals.map((item: any) => {
                            const agentKey = resolvePendingApprovalAgentKey(item);
                            const agentDef = getAgentDefinition(agentKey);
                            const formatted = formatPendingApprovalSummary(item, getModuleTitle);
                            const busy = resolvingId === item.id;
                            return (
                              <div
                                key={item.id}
                                className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/10"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Space size={6} wrap>
                                    <AiAgentAvatar agentKey={agentKey} size={24} />
                                    <Tag color={agentDef?.badgeColor || 'blue'} className="m-0">
                                      {agentDef?.titleFa || getAgentTitleFa(agentKey)}
                                    </Tag>
                                    <Tag color="gold" className="m-0">
                                      {formatted.titleFa}
                                    </Tag>
                                    <Tag className="m-0">{CHANNEL_LABEL_FA[String(item.channel || '')] || 'وب'}</Tag>
                                    <span className="text-[11px] text-slate-400">
                                      {formatJalaliDateTime(item.created_at)}
                                    </span>
                                  </Space>
                                  <Space size={6}>
                                    <Button
                                      type="primary"
                                      size="small"
                                      loading={busy}
                                      icon={<CheckOutlined />}
                                      onClick={() => void handleResolveApproval(item.id, 'approve')}
                                    >
                                      تایید و اجرا
                                    </Button>
                                    <Button
                                      size="small"
                                      danger
                                      disabled={busy}
                                      icon={<CloseOutlined />}
                                      onClick={() => void handleResolveApproval(item.id, 'reject')}
                                    >
                                      رد کردن
                                    </Button>
                                  </Space>
                                </div>
                                <div className="mt-2 text-xs font-semibold leading-5 text-slate-800 dark:text-slate-100">
                                  {formatted.summaryFa}
                                </div>
                                {formatted.detailLines.length > 0 ? (
                                  <ul className="m-0 mt-1 space-y-0.5 pr-4 text-[11px] text-slate-600 dark:text-slate-300">
                                    {formatted.detailLines.map((line, lineIdx) => (
                                      <li key={`ws-appr-${item.id}-${lineIdx}`}>{line}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>

                    <Card
                      size="small"
                      className="rounded-2xl"
                      title={(
                        <span className="inline-flex items-center gap-2 font-bold">
                          <RobotOutlined className="text-[rgb(var(--brand-600-rgb))]" />
                          آخرین اجراها و پیگیری‌های ایجنت‌ها
                        </span>
                      )}
                    >
                      {recentRuns.length === 0 ? (
                        <Empty description="هنوز اجرایی ثبت نشده است." />
                      ) : (
                        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                          {recentRuns.slice(0, 14).map((run: any, index: number) => {
                            const statusMeta = RUN_STATUS_META[String(run.status || '')] || { label: 'ثبت‌شده', color: 'default' };
                            const agentDef = getAgentDefinition(run.agent_key);
                            return (
                              <div
                                key={run.id || `run-${index}`}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]"
                              >
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Tag color={agentDef?.badgeColor || 'blue'} className="m-0">
                                    {agentDef?.shortTitleFa || getAgentTitleFa(run.agent_key)}
                                  </Tag>
                                  <Tag className="m-0">{CHANNEL_LABEL_FA[String(run.channel || '')] || 'وب'}</Tag>
                                  <Tag color={statusMeta.color} className="m-0">{statusMeta.label}</Tag>
                                </div>
                                <span className="text-[11px] text-slate-400">
                                  {formatJalaliDateTime(run.created_at)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  </div>
                </div>
              ),
            },
            {
              key: 'inbox',
              label: (
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <MessageOutlined />
                  پیام‌ها، گفتگوهای اخیر و تاییدیه‌ها
                  {pendingApprovals.length > 0 ? (
                    <Badge count={toPersianNumber(pendingApprovals.length)} size="small" style={{ backgroundColor: '#d97706' }} />
                  ) : null}
                </span>
              ),
              children: (
                <AiAgentMessagesCompactBox
                  layoutMode="wide"
                  onSelectAgent={(agentKey) => openAgentChat(agentKey)}
                />
              ),
            },
            ...(canAccessConfigPanel
              ? [{
                  key: 'config',
                  label: (
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <SettingOutlined />
                      تنظیمات مدل‌ها، فعال‌کننده‌ها و دسترسی‌ها
                    </span>
                  ),
                  children: (
                    <Card size="small" className="rounded-2xl">
                      <AiAgentConfigPanel overview={overview} onSaved={loadOverview} />
                    </Card>
                  ),
                }]
              : []),
          ]}
        />
      )}

      <DashboardAgentDetailModal
        open={Boolean(activeModalAgent)}
        agent={activeModalAgent}
        planFeatures={overview?.planFeatures}
        pendingApprovals={pendingApprovals}
        onClose={() => setActiveModalAgentKey(null)}
        onRefresh={loadOverview}
        onOpenChatPage={(agentKey, toneStyle) => {
          setActiveModalAgentKey(null);
          openAgentChat(agentKey, toneStyle);
        }}
      />

      <AiAgentOnboardingWizard
        open={Boolean(wizardAgentKey)}
        agentKey={wizardAgentKey}
        onClose={() => setWizardAgentKey(null)}
        onCompleted={async () => {
          await loadOverview();
        }}
      />
    </div>
  );
};

export default AiAgentsWorkspacePage;
