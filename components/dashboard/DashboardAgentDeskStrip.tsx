import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Tag, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  BellOutlined,
  CheckOutlined,
  ControlOutlined,
  MessageOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import {
  AI_AGENT_CATALOG,
  resolvePendingApprovalAgentKey,
  type AgentKey,
  type AgentToneStyle,
  type ClientAgentAccessEvaluation,
} from '../../utils/aiAgentCatalog';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import AiAgentIcon, { AiAgentCameoFigure, AiAgentDeskSeatFigure } from '../ai/AiAgentIcon';
import DashboardAgentDetailModal, { type DashboardAgentModalItem } from './DashboardAgentDetailModal';

type AgentLiveMeta = {
  key: AgentKey;
  titleFa?: string;
  shortTitleFa?: string;
  subtitleFa?: string;
  descriptionFa?: string;
  badgeColor?: string;
  iconKey?: string;
  supportsBackground?: boolean;
  canUse?: boolean;
  canView?: boolean;
  canChat?: boolean;
  canToggle?: boolean;
  canEdit?: boolean;
  isEnabled?: boolean;
  orgEnabled?: boolean;
  planAllowed?: boolean;
  rbacAllowed?: boolean;
  memberCanUse?: boolean;
  staffBotEnabled?: boolean;
  isWorking?: boolean;
  toneStyle?: AgentToneStyle;
  backgroundConfig?: {
    enabled?: boolean;
    interval_minutes?: number;
    cooldown_minutes?: number;
    daily_budget_irt?: number;
    respect_work_schedule?: boolean;
  };
  backgroundLastRunAt?: string | null;
  backgroundLastStatus?: string | null;
  backgroundLastSummary?: string | null;
  backgroundLastError?: string | null;
  nextBackgroundRunAt?: string | null;
  usageStats?: {
    runs?: number;
    cachedTokens?: number;
    savingsIrt?: number;
    todaySpentIrt?: number;
  };
  effectiveModelId?: string | null;
  effectiveFastModelId?: string | null;
  workflowTriggers?: any[];
};

export type DashboardAgentDeskOverviewMeta = {
  workingCount: number;
  totalApprovals: number;
  pendingApprovals: any[];
  agents?: AgentLiveMeta[];
  planFeatures?: Record<string, any> | null;
  canManage?: boolean;
};

type DashboardAgentDeskStripProps = {
  selectedAgents: AgentKey[];
  onToggleAgent: (agentKey: AgentKey) => void;
  agentAccessMap?: Partial<Record<AgentKey, ClientAgentAccessEvaluation>> | null;
  toneStyle?: AgentToneStyle;
  className?: string;
  inboxOpen?: boolean;
  onToggleInbox?: (focusAgentKey?: AgentKey) => void;
  onOverviewMeta?: (meta: DashboardAgentDeskOverviewMeta) => void;
  externalInboxBadgeCount?: number;
};

const DashboardAgentDeskStrip: React.FC<DashboardAgentDeskStripProps> = ({
  selectedAgents,
  onToggleAgent,
  agentAccessMap = null,
  toneStyle = 'friendly_warm',
  className = '',
  inboxOpen = false,
  onToggleInbox,
  onOverviewMeta,
  externalInboxBadgeCount,
}) => {
  const navigate = useNavigate();
  const [deskOverviewLoaded, setDeskOverviewLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [liveAgents, setLiveAgents] = useState<Record<string, AgentLiveMeta>>({});
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [pendingApprovalsByAgent, setPendingApprovalsByAgent] = useState<Record<string, number>>({});
  const [recentRunsByAgent, setRecentRunsByAgent] = useState<Record<string, any[]>>({});
  const [planFeatures, setPlanFeatures] = useState<Record<string, any> | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [hoveredAgentKey, setHoveredAgentKey] = useState<AgentKey | null>(null);
  const [activeModalAgentKey, setActiveModalAgentKey] = useState<AgentKey | null>(null);
  const onOverviewMetaRef = useRef(onOverviewMeta);
  onOverviewMetaRef.current = onOverviewMeta;

  const loadDeskStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'get_agents_workspace_overview' },
      });
      if (error || !data?.success) return;
      const rawAgents: AgentLiveMeta[] = Array.isArray(data.agents) ? data.agents : [];
      const byKey: Record<string, AgentLiveMeta> = {};
      for (const item of rawAgents) {
        if (item?.key) byKey[String(item.key)] = item;
      }
      const approvalCounts: Record<string, number> = {};
      const nextApprovals = Array.isArray(data.pendingApprovals) ? data.pendingApprovals : [];
      for (const item of nextApprovals) {
        const key = resolvePendingApprovalAgentKey(item);
        approvalCounts[key] = (approvalCounts[key] || 0) + 1;
      }
      const runsByAgent: Record<string, any[]> = {};
      for (const run of Array.isArray(data.recentRuns) ? data.recentRuns : []) {
        const key = String(run?.agent_key || '').trim();
        if (!key) continue;
        if (!runsByAgent[key]) runsByAgent[key] = [];
        runsByAgent[key].push(run);
      }

      setLiveAgents(byKey);
      setDeskOverviewLoaded(true);
      setPendingApprovals(nextApprovals);
      setPendingApprovalsByAgent(approvalCounts);
      setRecentRunsByAgent(runsByAgent);
      setPlanFeatures(data.planFeatures && typeof data.planFeatures === 'object' ? data.planFeatures : null);
      setCanManage(data.canManage === true);
      onOverviewMetaRef.current?.({
        workingCount: Object.values(byKey).filter((item) => item?.isWorking === true).length,
        totalApprovals: nextApprovals.length,
        pendingApprovals: nextApprovals,
        agents: rawAgents,
        planFeatures: data.planFeatures && typeof data.planFeatures === 'object' ? data.planFeatures : null,
        canManage: data.canManage === true,
      });
    } catch {
      // بارگذاری پس‌زمینه نباید در داشبورد خطای مزاحم نمایش دهد.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDeskStatus();
  }, [loadDeskStatus]);

  const selectedSet = useMemo(() => new Set(selectedAgents), [selectedAgents]);

  const visibleCards = useMemo(() => {
    const cards: DashboardAgentModalItem[] = [];
    for (const def of AI_AGENT_CATALOG) {
      const live = liveAgents[def.key];
      const fallbackAccess = agentAccessMap?.[def.key];

      const canView = deskOverviewLoaded
        ? Boolean(live && (live.canView ?? live.canUse) !== false)
        : agentAccessMap
          ? Boolean(fallbackAccess && (fallbackAccess.canView ?? fallbackAccess.canUse) !== false)
          : true;

      if (!canView) continue;

      const orgEnabled = live
        ? live.orgEnabled !== false && live.isEnabled !== false
        : (fallbackAccess ? fallbackAccess.orgEnabled !== false : true);
      const planAllowed = live
        ? live.planAllowed !== false
        : (fallbackAccess ? fallbackAccess.planAllowed !== false : true);
      const canToggle = live
        ? Boolean(live.canToggle ?? canManage)
        : Boolean(fallbackAccess?.canToggle);
      const canEdit = live
        ? Boolean(live.canEdit ?? canManage)
        : Boolean(fallbackAccess?.canEdit);
      const canChat = live
        ? orgEnabled && planAllowed && (live.canChat ?? live.canUse) !== false
        : orgEnabled && planAllowed && (fallbackAccess ? (fallbackAccess.canChat ?? fallbackAccess.canUse) !== false : true);

      cards.push({
        key: def.key,
        titleFa: def.titleFa,
        shortTitleFa: def.shortTitleFa,
        subtitleFa: def.subtitleFa,
        descriptionFa: def.descriptionFa,
        badgeColor: def.badgeColor,
        iconKey: def.iconKey,
        supportsBackground: live?.supportsBackground ?? def.supportsBackground,
        orgEnabled,
        planAllowed,
        canView: true,
        canChat,
        canToggle,
        canEdit,
        isWorking: live?.isWorking === true,
        toneStyle: (live?.toneStyle || toneStyle || def.defaultToneStyle) as AgentToneStyle,
        backgroundConfig: live?.backgroundConfig || def.defaultBackgroundConfig,
        backgroundLastRunAt: live?.backgroundLastRunAt || null,
        backgroundLastStatus: live?.backgroundLastStatus || null,
        backgroundLastSummary: live?.backgroundLastSummary || null,
        backgroundLastError: live?.backgroundLastError || null,
        nextBackgroundRunAt: live?.nextBackgroundRunAt || null,
        usageStats: live?.usageStats || {},
        effectiveModelId: live?.effectiveModelId || null,
        effectiveFastModelId: live?.effectiveFastModelId || null,
        workflowTriggers: Array.isArray(live?.workflowTriggers) ? live.workflowTriggers : [],
        recentRuns: recentRunsByAgent[def.key] || [],
      });
    }
    return cards;
  }, [agentAccessMap, canManage, deskOverviewLoaded, liveAgents, recentRunsByAgent, toneStyle]);

  const activeModalAgent = useMemo(
    () => visibleCards.find((item) => item.key === activeModalAgentKey) || null,
    [activeModalAgentKey, visibleCards],
  );

  useEffect(() => {
    if (activeModalAgentKey && !activeModalAgent) {
      setActiveModalAgentKey(null);
    }
  }, [activeModalAgent, activeModalAgentKey]);

  const workingCount = visibleCards.filter((item) => item.isWorking).length;
  const visibleApprovalCount = useMemo(() => (
    visibleCards.reduce((sum, item) => sum + (pendingApprovalsByAgent[item.key] || 0), 0)
  ), [pendingApprovalsByAgent, visibleCards]);
  const effectiveInboxCount = externalInboxBadgeCount ?? visibleApprovalCount;
  const hasManagementPermission = canManage || visibleCards.some((item) => item.canToggle || item.canEdit);

  if (visibleCards.length === 0) {
    return null;
  }

  const openAgentChatPage = (agentKey: AgentKey, nextToneStyle?: AgentToneStyle) => {
    navigate(`/ai?agent=${agentKey}`, {
      state: {
        aiInitialAgents: [agentKey],
        aiInitialToneStyle: nextToneStyle || toneStyle,
        forceNewThread: true,
      },
    });
  };

  const seatCount = visibleCards.length;
  const deskGridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${seatCount}, minmax(124px, 1fr))`,
  };
  const deskMinWidth = seatCount > 1 ? Math.max(280, seatCount * 130) : 160;

  return (
    <div
      dir="rtl"
      data-testid="dashboard-agent-desk-strip"
      className={`mt-3 rounded-2xl border border-slate-200/85 bg-gradient-to-b from-slate-50/75 via-white to-slate-50/90 p-3 shadow-sm dark:border-white/[0.08] dark:from-white/[0.03] dark:via-white/[0.02] dark:to-black/15 ${className}`}
    >
      <style>{`
        @keyframes kalamDeskWorkingFloat {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          35% { transform: translateY(-2px) rotate(-0.8deg); }
          70% { transform: translateY(-1px) rotate(0.8deg); }
        }
        @keyframes kalamDeskCalmIdle {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-1.1px); }
        }
        @keyframes kalamDeskHandTap {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-1.8px); }
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
          50% { transform: scale(1.16); opacity: 0.35; }
        }
        @keyframes kalamPendingBob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-2.2px); }
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

      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-100">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/70 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/20">
              <AiAgentIcon agentKey="lead_orchestrator" size={14} />
            </span>
            میز کار ایجنت‌های تخصصی
          </span>
          {workingCount > 0 ? (
            <Tag color="processing" className="m-0 inline-flex items-center gap-1.5 rounded-full px-2.5 !text-[10.5px] font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
              {toPersianNumber(workingCount)} ایجنت در حال کار
            </Tag>
          ) : (
            <Tag color="default" className="m-0 rounded-full px-2.5 !text-[10.5px]">
              تیم آماده پشت میز مشترک
            </Tag>
          )}
          {visibleApprovalCount > 0 ? (
            <button
              type="button"
              onClick={() => onToggleInbox?.()}
              className={`inline-flex items-center gap-1 rounded-full border border-amber-300/90 bg-amber-50 px-2.5 py-0.5 text-[10.5px] font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200 ${
                onToggleInbox ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <BellOutlined className="text-[10px]" />
              <span>{toPersianNumber(visibleApprovalCount)} اقدام در انتظار تایید</span>
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onToggleInbox ? (
            <Button
              size="small"
              type={inboxOpen ? 'primary' : 'default'}
              icon={<MessageOutlined />}
              onClick={() => onToggleInbox()}
              className={`!inline-flex !items-center !gap-1.5 !rounded-xl !text-[11px] font-semibold ${
                inboxOpen
                  ? ''
                  : '!border-slate-200/90 !bg-white/95 !text-slate-700 hover:!border-indigo-300 hover:!text-indigo-700 dark:!border-white/10 dark:!bg-white/[0.05] dark:!text-slate-200'
              }`}
            >
              <span>پیام‌ها و تاییدیه‌ها</span>
              {effectiveInboxCount > 0 ? (
                <span
                  className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                    inboxOpen ? 'bg-white text-indigo-700' : 'bg-amber-500 text-white'
                  }`}
                >
                  {toPersianNumber(effectiveInboxCount)}
                </span>
              ) : null}
            </Button>
          ) : null}
          <Button
            type="link"
            size="small"
            icon={<ControlOutlined />}
            className="!h-auto !px-1.5 !text-[11px] font-semibold"
            onClick={() => navigate('/ai/agents')}
          >
            {hasManagementPermission ? 'میز گرافیکی و تنظیمات' : 'میز کار ایجنت‌ها'}
          </Button>
        </div>
      </div>

      {/* Panoramic architectural long studio desk — permitted agents seated behind one continuous desk */}
      <div className="overflow-x-auto pb-1">
        <div
          style={{ minWidth: `${deskMinWidth}px` }}
          className="relative rounded-2xl border border-slate-200/70 bg-gradient-to-b from-indigo-50/35 via-white to-slate-100/60 px-3 pb-2.5 pt-2 dark:border-white/[0.07] dark:from-indigo-950/20 dark:via-dark-surface dark:to-slate-900/50"
        >
          {/* Row 1: Seated animated workstations behind the long desk */}
          <div className="relative z-10 grid gap-1.5" style={deskGridStyle}>
            {visibleCards.map((agent, seatIndex) => {
              const isSelected = agent.canChat && selectedSet.has(agent.key);
              const isHovered = hoveredAgentKey === agent.key;
              const pendingCount = pendingApprovalsByAgent[agent.key] || 0;
              return (
                <Tooltip
                  key={`seat-${agent.key}`}
                  title={`${agent.titleFa} — کلیک برای گزارش زنده و زمان‌بندی خودکار`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`میز ${agent.shortTitleFa}`}
                    onMouseEnter={() => setHoveredAgentKey(agent.key)}
                    onMouseLeave={() => setHoveredAgentKey((curr) => (curr === agent.key ? null : curr))}
                    onClick={() => setActiveModalAgentKey(agent.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setActiveModalAgentKey(agent.key);
                      }
                    }}
                    className={`flex cursor-pointer flex-col items-center justify-end rounded-t-xl px-1 pt-0.5 transition-transform duration-200 ${
                      isSelected || isHovered
                        ? '-translate-y-0.5'
                        : 'hover:-translate-y-0.5'
                    }`}
                  >
                    {/* Tiny status float indicator above the seated agent */}
                    <div className="mb-0.5 flex h-[18px] items-center justify-center">
                      {pendingCount > 0 ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (onToggleInbox) onToggleInbox(agent.key);
                            else setActiveModalAgentKey(agent.key);
                          }}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100/95 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-800 ring-1 ring-amber-300/80 transition hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-200"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          <span>{toPersianNumber(pendingCount)} تایید</span>
                        </button>
                      ) : agent.isWorking ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold shadow-sm ring-1"
                          style={{
                            backgroundColor: `${agent.badgeColor}14`,
                            color: agent.badgeColor,
                            borderColor: `${agent.badgeColor}40`,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full animate-pulse"
                            style={{ backgroundColor: agent.badgeColor }}
                          />
                          <span>در حال کار</span>
                        </span>
                      ) : isSelected ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9.5px] font-bold text-white shadow-sm">
                          <CheckOutlined className="text-[8.5px]" />
                          <span>در گفتگو</span>
                        </span>
                      ) : !agent.orgEnabled ? (
                        <span className="inline-flex items-center rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                          خاموش
                        </span>
                      ) : null}
                    </div>

                    <AiAgentDeskSeatFigure
                      agentKey={agent.key}
                      color={agent.badgeColor}
                      isWorking={agent.isWorking}
                      isSelected={isSelected}
                      canUse={true}
                      orgEnabled={agent.orgEnabled}
                      hasPending={pendingCount > 0}
                      seatIndex={seatIndex}
                    />
                  </div>
                </Tooltip>
              );
            })}
          </div>

          {/* Continuous Long Tabletop Beam spanning underneath all laptops */}
          <div className="pointer-events-none relative z-20 -mt-[2px]">
            <div className="h-2.5 w-full rounded-full border border-indigo-200/80 bg-gradient-to-b from-slate-100 via-slate-200/85 to-indigo-100/80 shadow-sm dark:border-indigo-400/20 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900" />
            <div className="mx-3 h-1.5 rounded-b-full bg-gradient-to-b from-slate-900/[0.09] to-transparent dark:from-black/40" />
          </div>

          {/* Row 2: Synchronized Desk-Front Nameplates with bespoke SVG emblems */}
          <div className="relative z-20 mt-1.5 grid gap-1.5" style={deskGridStyle}>
            {visibleCards.map((agent) => {
              const isSelected = agent.canChat && selectedSet.has(agent.key);
              const isHovered = hoveredAgentKey === agent.key;
              const pendingCount = pendingApprovalsByAgent[agent.key] || 0;
              return (
                <Tooltip
                  key={agent.key}
                  title={`${agent.subtitleFa} — کلیک برای جزئیات، وضعیت اجرا و تنظیمات`}
                >
                  <div
                    className={`group flex cursor-pointer flex-col justify-between gap-1.5 rounded-xl border px-2 py-1.5 transition-all ${
                      !agent.orgEnabled
                        ? 'border-slate-200/70 bg-slate-100/70 opacity-75 hover:border-slate-300 dark:border-white/5 dark:bg-white/[0.02]'
                        : isSelected
                          ? 'border-indigo-400 bg-indigo-50/90 shadow-sm ring-1 ring-indigo-300/60 dark:border-indigo-400/50 dark:bg-indigo-500/15'
                          : isHovered
                            ? 'border-indigo-200 bg-white shadow-sm dark:border-indigo-400/30 dark:bg-white/[0.06]'
                            : 'border-slate-200/85 bg-white/95 hover:border-indigo-200 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.04]'
                    }`}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => setHoveredAgentKey(agent.key)}
                    onMouseLeave={() => setHoveredAgentKey((curr) => (curr === agent.key ? null : curr))}
                    onClick={() => setActiveModalAgentKey(agent.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setActiveModalAgentKey(agent.key);
                      }
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg overflow-hidden"
                        style={{
                          backgroundColor: agent.orgEnabled ? `${agent.badgeColor}18` : 'rgba(148,163,184,0.16)',
                        }}
                      >
                        <AiAgentCameoFigure
                          agentKey={agent.key}
                          size={16}
                          accentColor={agent.orgEnabled ? agent.badgeColor : '#94a3b8'}
                        />
                      </span>
                      <div className="min-w-0 flex-1 text-[11px] font-bold leading-4 text-slate-800 dark:text-slate-100 break-words">
                        {agent.shortTitleFa}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1 border-t border-slate-100/90 pt-1 dark:border-white/[0.06]">
                      <div className="truncate text-[9.5px] leading-tight text-slate-500 dark:text-slate-400">
                        {!agent.orgEnabled
                          ? 'خاموش'
                          : agent.isWorking
                            ? 'فعال'
                            : isSelected
                              ? 'انتخاب‌شده'
                              : agent.backgroundConfig?.enabled
                                ? 'زمان‌بندی روشن'
                                : 'آماده'}
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        {pendingCount > 0 && !onToggleInbox ? (
                          <Badge count={toPersianNumber(pendingCount)} size="small" style={{ backgroundColor: '#d97706' }} />
                        ) : null}
                        {agent.canChat ? (
                          <>
                            <Tooltip title={isSelected ? 'حذف از گفتگوی داشبورد' : 'افزودن به گفتگوی داشبورد'}>
                              <button
                                type="button"
                                aria-label={isSelected ? `حذف ${agent.titleFa} از گفتگو` : `افزودن ${agent.titleFa} به گفتگو`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onToggleAgent(agent.key);
                                }}
                                className={`inline-flex h-5 w-5 items-center justify-center rounded-lg text-[9.5px] transition ${
                                  isSelected
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    : 'text-slate-400 opacity-75 hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100 dark:hover:bg-white/10'
                                }`}
                              >
                                {isSelected ? <CheckOutlined /> : <PlusOutlined />}
                              </button>
                            </Tooltip>
                            <Tooltip title={`گفتگوی مستقیم با ${agent.titleFa}`}>
                              <button
                                type="button"
                                aria-label={`گفتگوی مستقیم با ${agent.titleFa}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openAgentChatPage(agent.key, agent.toneStyle);
                                }}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-lg text-slate-400 opacity-75 transition hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100 dark:hover:bg-white/10"
                              >
                                <ArrowLeftOutlined className="text-[9.5px]" />
                              </button>
                            </Tooltip>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>

      <DashboardAgentDetailModal
        open={Boolean(activeModalAgent)}
        agent={activeModalAgent}
        planFeatures={planFeatures}
        pendingApprovals={pendingApprovals}
        selectedInComposer={Boolean(activeModalAgent && selectedSet.has(activeModalAgent.key))}
        refreshing={refreshing}
        onClose={() => setActiveModalAgentKey(null)}
        onRefresh={loadDeskStatus}
        onToggleAgentInComposer={
          activeModalAgent?.canChat ? (key) => onToggleAgent(key) : undefined
        }
        onOpenChatPage={
          activeModalAgent?.canChat
            ? (key, nextTone) => {
                setActiveModalAgentKey(null);
                openAgentChatPage(key, nextTone);
              }
            : undefined
        }
      />
    </div>
  );
};

export default DashboardAgentDeskStrip;
