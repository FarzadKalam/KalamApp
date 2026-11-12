import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Input, Spin, Tooltip } from 'antd';
import {
  ArrowRightOutlined,
  CheckOutlined,
  CloseOutlined,
  DownOutlined,
  ExportOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import {
  AI_AGENT_CATALOG,
  formatPendingApprovalSummary,
  getAgentTitleFa,
  resolvePendingApprovalAgentKey,
  type AgentKey,
  type ClientAgentAccessEvaluation,
} from '../../utils/aiAgentCatalog';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import MessageAttachmentGallery from '../messaging/MessageAttachmentGallery';
import { AiAgentAvatar } from './AiAgentIcon';

type AgentInboxThread = {
  agentKey: AgentKey;
  titleFa: string;
  conversationKey: string;
  lastMessageAt: string;
  lastPreview: string;
  unreadCount: number;
  messages: any[];
};

type WaitingApprovalItem = {
  id: string;
  action_type?: string | null;
  agent_key?: string | null;
  module_id?: string | null;
  record_id?: string | null;
  proposed_payload?: Record<string, any> | null;
  created_at?: string | null;
};

export type AiAgentMessagesCompactBoxProps = {
  onSelectAgent?: (agentKey: AgentKey) => void;
  agentAccessMap?: Partial<Record<AgentKey, ClientAgentAccessEvaluation>> | null;
  className?: string;
  layoutMode?: 'compact' | 'wide';
  initialAgentKey?: AgentKey | null;
  onClose?: () => void;
  onMetaChange?: (meta: { approvalCount: number; unreadCount: number; threadCount: number }) => void;
};

const getModuleTitle = (moduleId: string): string => (
  MODULES[moduleId]?.titles?.faSingular || MODULES[moduleId]?.titles?.fa || moduleId
);

const formatCompactTime = (value?: string | null) => {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(dt);
};

const AiAgentMessagesCompactBox: React.FC<AiAgentMessagesCompactBoxProps> = ({
  onSelectAgent,
  agentAccessMap = null,
  className = '',
  layoutMode = 'compact',
  initialAgentKey = null,
  onClose,
  onMetaChange,
}) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [rawThreads, setRawThreads] = useState<AgentInboxThread[]>([]);
  const [rawApprovals, setRawApprovals] = useState<WaitingApprovalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeAgentKey, setActiveAgentKey] = useState<AgentKey | null>(initialAgentKey || null);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'approvals' | 'messages'>('all');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const onMetaChangeRef = useRef(onMetaChange);
  onMetaChangeRef.current = onMetaChange;
  const lastEmittedMetaRef = useRef<string>('');

  const canViewAgent = useCallback((agentKey: AgentKey | string) => {
    if (!agentAccessMap) return true;
    const access = agentAccessMap[agentKey as AgentKey];
    if (!access) return false;
    return (access.canView ?? access.canUse) !== false;
  }, [agentAccessMap]);

  const canChatWithAgent = useCallback((agentKey: AgentKey | string) => {
    if (!agentAccessMap) return true;
    const access = agentAccessMap[agentKey as AgentKey];
    if (!access) return false;
    return (access.canView ?? access.canUse) !== false && (access.canChat ?? access.canUse) !== false;
  }, [agentAccessMap]);

  const hasAnyVisibleAgent = useMemo(() => {
    if (!agentAccessMap) return true;
    return AI_AGENT_CATALOG.some((def) => {
      const access = agentAccessMap[def.key];
      return Boolean(access && (access.canView ?? access.canUse) !== false);
    });
  }, [agentAccessMap]);

  const threads = useMemo(
    () => rawThreads.filter((item) => canViewAgent(item.agentKey)),
    [canViewAgent, rawThreads],
  );

  const approvals = useMemo(
    () => rawApprovals.filter((item) => canViewAgent(resolvePendingApprovalAgentKey(item))),
    [canViewAgent, rawApprovals],
  );

  useEffect(() => {
    if (initialAgentKey && canViewAgent(initialAgentKey)) {
      setActiveAgentKey(initialAgentKey);
      setSelectedApprovalId(null);
      setCollapsed(false);
    }
  }, [canViewAgent, initialAgentKey]);

  const loadAgentInbox = useCallback(async () => {
    setLoading(true);
    try {
      const [msgRes, apprRes] = await Promise.all([
        supabase.functions.invoke('ai-assistant', { body: { action: 'list_agent_messages', limit: 40 } }),
        supabase.functions.invoke('ai-assistant', { body: { action: 'list_waiting_approvals' } }),
      ]);
      const nextThreads = Array.isArray((msgRes.data as any)?.threads)
        ? ((msgRes.data as any).threads as AgentInboxThread[])
        : [];
      const nextApprovals = Array.isArray((apprRes.data as any)?.approvals)
        ? ((apprRes.data as any).approvals as WaitingApprovalItem[])
        : [];
      setRawThreads(nextThreads);
      setRawApprovals(nextApprovals);
    } catch {
      // بی‌سروصدا — صندوق ایجنت نباید مزاحم صفحه شود.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unreadCount = threads.reduce((sum, item) => sum + Number(item?.unreadCount || 0), 0);
    const metaKey = `${approvals.length}:${unreadCount}:${threads.length}`;
    if (lastEmittedMetaRef.current !== metaKey) {
      lastEmittedMetaRef.current = metaKey;
      onMetaChangeRef.current?.({
        approvalCount: approvals.length,
        unreadCount,
        threadCount: threads.length,
      });
    }
    setActiveAgentKey((current) => {
      if (current && threads.some((item) => item.agentKey === current)) return current;
      if (layoutMode === 'wide' && threads.length > 0 && !selectedApprovalId) return threads[0].agentKey;
      return null;
    });
    setSelectedApprovalId((current) => {
      if (current && approvals.some((item) => item.id === current)) return current;
      if (layoutMode === 'wide' && threads.length === 0 && approvals.length > 0) return approvals[0].id;
      return null;
    });
  }, [approvals, layoutMode, selectedApprovalId, threads]);

  useEffect(() => {
    void loadAgentInbox();
  }, [loadAgentInbox]);

  const activeThread = useMemo(
    () => threads.find((item) => item.agentKey === activeAgentKey) || null,
    [activeAgentKey, threads],
  );

  const selectedApproval = useMemo(
    () => approvals.find((item) => item.id === selectedApprovalId) || null,
    [approvals, selectedApprovalId],
  );

  const unreadTotal = useMemo(
    () => threads.reduce((sum, item) => sum + Number(item?.unreadCount || 0), 0),
    [threads],
  );

  const handleSendQuickReply = useCallback(async () => {
    const content = replyText.trim();
    if (!activeThread || !content || sendingReply || !canChatWithAgent(activeThread.agentKey)) return;
    setSendingReply(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'reply_agent_message',
          agentKey: activeThread.agentKey,
          conversationKey: activeThread.conversationKey,
          content,
        },
      });
      if (error) throw error;
      if ((data as any)?.success === false) {
        throw new Error(String((data as any)?.message || 'ارسال پیام به ایجنت ناموفق بود.'));
      }
      setReplyText('');
      message.success('پاسخ برای ایجنت ارسال شد.');
      await loadAgentInbox();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ارسال پیام به ایجنت ناموفق بود.'));
    } finally {
      setSendingReply(false);
    }
  }, [activeThread, canChatWithAgent, loadAgentInbox, message, replyText, sendingReply]);

  const handleApprovalDecision = useCallback(async (actionLogId: string, decision: 'approve' | 'reject') => {
    if (!actionLogId || resolvingApprovalId) return;
    setResolvingApprovalId(actionLogId);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'resolve_waiting_approval',
          actionLogId,
          decision,
        },
      });
      if (error) throw error;
      if ((data as any)?.success === false) {
        throw new Error(String((data as any)?.message || 'پردازش تصمیم ناموفق بود.'));
      }
      message.success(decision === 'approve' ? 'اقدام ایجنت تایید و اجرا شد.' : 'اقدام ایجنت لغو شد.');
      await loadAgentInbox();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ثبت تصمیم تایید/رد ناموفق بود.'));
    } finally {
      setResolvingApprovalId(null);
    }
  }, [loadAgentInbox, message, resolvingApprovalId]);

  const visibleMessages = useMemo(() => {
    if (!activeThread) return [];
    return [...(activeThread.messages || [])].slice(0, 8).reverse();
  }, [activeThread]);

  const activeThreadApprovals = useMemo(() => {
    if (!activeThread) return [];
    return approvals.filter((item) => resolvePendingApprovalAgentKey(item) === activeThread.agentKey);
  }, [activeThread, approvals]);

  const renderApprovalCard = (item: WaitingApprovalItem) => {
    const formatted = formatPendingApprovalSummary(item, getModuleTitle);
    const agentKey = resolvePendingApprovalAgentKey(item);
    const agentTitle = getAgentTitleFa(agentKey);
    const busy = resolvingApprovalId === item.id;
    const timeLabel = formatCompactTime(item?.created_at);
    const isSelectedApproval = layoutMode === 'wide' && selectedApprovalId === item.id;

    return (
      <div
        key={item.id}
        role={layoutMode === 'wide' ? 'button' : undefined}
        tabIndex={layoutMode === 'wide' ? 0 : undefined}
        onClick={() => {
          if (layoutMode === 'wide') {
            setSelectedApprovalId(item.id);
            setActiveAgentKey(null);
          }
        }}
        onKeyDown={(event) => {
          if (layoutMode === 'wide' && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            setSelectedApprovalId(item.id);
            setActiveAgentKey(null);
          }
        }}
        className={`rounded-xl border border-r-[3px] border-r-amber-400 bg-white p-2.5 shadow-sm transition dark:bg-white/[0.04] ${
          isSelectedApproval
            ? 'border-indigo-400 ring-1 ring-indigo-300/60 dark:border-indigo-400/60'
            : 'border-slate-200/85 hover:border-slate-300 dark:border-white/10'
        } ${layoutMode === 'wide' ? 'cursor-pointer' : ''}`}
      >
        <div className="flex items-start gap-2">
          <AiAgentAvatar agentKey={agentKey} size={28} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate text-[11.5px] font-bold text-slate-800 dark:text-slate-100">
                {agentTitle} • {formatted.titleFa}
              </span>
              <span className="shrink-0 rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[9.5px] font-semibold text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-200">
                نیاز به تایید{timeLabel ? ` • ${timeLabel}` : ''}
              </span>
            </div>
            <p className="m-0 mt-1 line-clamp-2 text-[11px] leading-5 text-slate-700 dark:text-slate-200">
              {formatted.summaryFa}
            </p>
            {formatted.detailLines.length > 0 ? (
              <div className="mt-1 line-clamp-1 text-[10px] text-slate-500 dark:text-slate-400">
                {formatted.detailLines[0]}
              </div>
            ) : null}
            <div
              className="mt-2 flex items-center justify-end gap-1.5"
              onClick={(event) => event.stopPropagation()}
            >
              <Button
                size="small"
                disabled={busy}
                icon={<CloseOutlined />}
                className="!h-6 !rounded-lg !border-slate-200 !px-2 !text-[10.5px] !text-slate-600 hover:!border-rose-300 hover:!text-rose-600 dark:!border-white/15 dark:!text-slate-300"
                onClick={() => void handleApprovalDecision(item.id, 'reject')}
              >
                رد
              </Button>
              <Button
                type="primary"
                size="small"
                loading={busy}
                icon={<CheckOutlined />}
                className="!h-6 !rounded-lg !px-2.5 !text-[10.5px] font-semibold"
                onClick={() => void handleApprovalDecision(item.id, 'approve')}
              >
                تایید
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderThreadCard = (thread: AgentInboxThread) => {
    const isSelected = activeAgentKey === thread.agentKey && !selectedApprovalId;
    return (
      <button
        key={thread.conversationKey}
        type="button"
        onClick={() => {
          setSelectedApprovalId(null);
          setActiveAgentKey(thread.agentKey);
        }}
        className={`group flex w-full items-center gap-2.5 rounded-xl border p-2 text-right transition-all ${
          isSelected
            ? 'border-indigo-400 bg-indigo-50/75 shadow-sm ring-1 ring-indigo-300/50 dark:border-indigo-400/50 dark:bg-indigo-500/15'
            : 'border-slate-200/80 bg-white hover:border-indigo-200 hover:shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:border-white/20'
        }`}
      >
        <div className="relative shrink-0">
          <AiAgentAvatar agentKey={thread.agentKey} size={32} />
          {thread.unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-indigo-600 ring-2 ring-white dark:ring-slate-900" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="truncate text-[11.5px] font-bold text-slate-800 dark:text-slate-100">
              {thread.titleFa}
            </span>
            <span className="shrink-0 text-[9.5px] font-medium text-slate-400">
              {formatCompactTime(thread.lastMessageAt)}
            </span>
          </div>
          <div className="mt-0.5 line-clamp-1 text-[10.5px] text-slate-500 dark:text-slate-400">
            {thread.lastPreview || 'پیام جدید'}
          </div>
        </div>
        <LeftOutlined className="shrink-0 text-[10px] text-slate-300 transition group-hover:text-indigo-500" />
      </button>
    );
  };

  const renderActiveConversation = () => {
    if (selectedApproval && layoutMode === 'wide') {
      const apprAgentKey = resolvePendingApprovalAgentKey(selectedApproval);
      const formatted = formatPendingApprovalSummary(selectedApproval, getModuleTitle);
      const busy = resolvingApprovalId === selectedApproval.id;
      return (
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 rounded-xl border border-amber-200/80 bg-amber-50/40 p-3 dark:border-amber-400/25 dark:bg-amber-500/10">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 pb-2 dark:border-amber-400/20">
              <div className="flex items-center gap-2">
                <AiAgentAvatar agentKey={apprAgentKey} size={28} />
                <div>
                  <div className="text-xs font-black text-slate-800 dark:text-slate-100">
                    {getAgentTitleFa(apprAgentKey)} — {formatted.titleFa}
                  </div>
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    ثبت‌شده در {formatCompactTime(selectedApproval.created_at) || 'هم‌اکنون'}
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/25 dark:text-amber-100">
                در انتظار تایید شما
              </span>
            </div>

            <div className="rounded-xl border border-amber-200/60 bg-white/95 p-3 text-xs leading-6 text-slate-800 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100">
              <div className="font-bold">{formatted.summaryFa}</div>
              {formatted.detailLines.length > 0 ? (
                <ul className="m-0 mt-2 space-y-1 pr-4 text-[11.5px] text-slate-600 dark:text-slate-300">
                  {formatted.detailLines.map((line, lineIdx) => (
                    <li key={`appr-detail-${lineIdx}`}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              size="small"
              danger
              disabled={busy}
              icon={<CloseOutlined />}
              onClick={() => void handleApprovalDecision(selectedApproval.id, 'reject')}
            >
              رد پیشنهاد
            </Button>
            <Button
              type="primary"
              size="small"
              loading={busy}
              icon={<CheckOutlined />}
              onClick={() => void handleApprovalDecision(selectedApproval.id, 'approve')}
            >
              تایید و اجرای نهایی
            </Button>
          </div>
        </div>
      );
    }

    if (!activeThread) {
      return (
        <div className="flex h-full min-h-[190px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200/85 bg-slate-50/50 p-4 text-center dark:border-white/10 dark:bg-white/[0.02]">
          <AiAgentAvatar agentKey="lead_orchestrator" size={34} />
          <div className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-200">
            گفتگوی ایجنت یا تاییدیه را انتخاب کنید
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-400">
            برای مشاهده جزئیات، پیوست‌ها و ارسال پاسخ سریع روی هر مورد کلیک کنید.
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {/* Conversation sub-header */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/85 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex min-w-0 items-center gap-2">
            {layoutMode === 'compact' ? (
              <Tooltip title="بازگشت به فهرست">
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowRightOutlined />}
                  onClick={() => setActiveAgentKey(null)}
                  className="!h-6 !w-6 !rounded-lg !p-0 !text-slate-600 hover:!bg-white"
                  aria-label="بازگشت"
                />
              </Tooltip>
            ) : null}
            <AiAgentAvatar agentKey={activeThread.agentKey} size={26} />
            <span className="truncate text-[11.5px] font-bold text-slate-800 dark:text-slate-100">
              {activeThread.titleFa}
            </span>
          </div>
          {onSelectAgent && canChatWithAgent(activeThread.agentKey) ? (
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => onSelectAgent(activeThread.agentKey)}
              className="!inline-flex !h-6 !items-center !gap-1 !rounded-lg !border-indigo-200/90 !bg-white !px-2 !text-[10.5px] !font-semibold !text-indigo-700 hover:!border-indigo-400 dark:!border-indigo-400/30 dark:!bg-slate-900 dark:!text-indigo-200"
            >
              انتخاب در گفتگو
            </Button>
          ) : null}
        </div>

        {/* If this specific agent also has a waiting approval, show a concise 1-row banner */}
        {layoutMode === 'compact' && activeThreadApprovals.length > 0 ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-amber-50/75 px-2.5 py-1.5 text-[10.5px] text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100">
            <span className="line-clamp-1 flex-1 font-medium">
              {formatPendingApprovalSummary(activeThreadApprovals[0], getModuleTitle).summaryFa}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="primary"
                size="small"
                loading={resolvingApprovalId === activeThreadApprovals[0].id}
                onClick={() => void handleApprovalDecision(activeThreadApprovals[0].id, 'approve')}
                className="!h-5 !rounded-md !px-2 !text-[10px]"
              >
                تایید
              </Button>
              <Button
                size="small"
                danger
                onClick={() => void handleApprovalDecision(activeThreadApprovals[0].id, 'reject')}
                className="!h-5 !rounded-md !px-1.5 !text-[10px]"
              >
                رد
              </Button>
            </div>
          </div>
        ) : null}

        {/* Messages stream with generous height so thumbnails never clip weirdly */}
        <div className="max-h-[250px] space-y-2 overflow-y-auto px-0.5 py-0.5">
          {visibleMessages.map((msg) => {
            const isUser = String(msg?.source_type || '') === 'user';
            const attachments = Array.isArray(msg?.metadata?.attachments) ? msg.metadata.attachments : [];
            const timeStr = formatCompactTime(msg?.created_at);
            return (
              <div
                key={msg.id}
                className={`rounded-2xl px-2.5 py-2 text-[11px] leading-5 ${
                  isUser
                    ? 'mr-4 rounded-tl-sm border border-indigo-200/75 bg-indigo-50/85 text-slate-800 dark:border-indigo-400/25 dark:bg-indigo-500/15 dark:text-slate-100'
                    : 'ml-2 rounded-tr-sm border border-slate-200/80 bg-slate-50/75 text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-[9.5px] text-slate-400">
                  <span className="font-semibold text-slate-500 dark:text-slate-300">
                    {isUser ? 'پاسخ شما' : activeThread.titleFa}
                  </span>
                  {timeStr ? <span>{timeStr}</span> : null}
                </div>
                <div className="whitespace-pre-wrap break-words">{String(msg?.content || '')}</div>
                {attachments.length > 0 ? (
                  <div className="mt-1.5 [&_.aspect-square]:!max-h-[118px] [&_.aspect-square]:!w-[118px]">
                    <MessageAttachmentGallery attachments={attachments} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Integrated pill quick-reply bar */}
        {canChatWithAgent(activeThread.agentKey) ? (
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/70 p-1 transition focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus-within:bg-slate-900">
            <Input
              variant="borderless"
              size="small"
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              onPressEnter={() => void handleSendQuickReply()}
              placeholder="پاسخ سریع به این ایجنت..."
              className="flex-1 !px-2 !text-[11.5px]"
            />
            <Button
              type="primary"
              size="small"
              shape="circle"
              icon={<SendOutlined className="text-[11px]" />}
              loading={sendingReply}
              disabled={!replyText.trim()}
              onClick={() => void handleSendQuickReply()}
              aria-label="ارسال پاسخ به ایجنت"
              className="!h-7 !w-7 !shrink-0"
            />
          </div>
        ) : null}
      </div>
    );
  };

  if (!hasAnyVisibleAgent) {
    return null;
  }

  const showApprovalsSection = filterTab === 'all' || filterTab === 'approvals';
  const showMessagesSection = filterTab === 'all' || filterTab === 'messages';

  return (
    <div
      dir="rtl"
      data-testid="ai-agent-messages-compact-box"
      className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200/85 bg-white text-right shadow-sm dark:border-white/[0.09] dark:bg-dark-surface ${className}`}
    >
      {/* Sleek Glass Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/75 bg-gradient-to-l from-indigo-50/70 via-white to-teal-50/45 px-3 py-2 dark:border-white/[0.07] dark:from-indigo-950/25 dark:via-dark-surface dark:to-teal-950/15">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <AiAgentAvatar
            agentKey={activeThread?.agentKey || 'lead_orchestrator'}
            size={24}
          />
          <span className="truncate text-[11.5px] font-black text-slate-800 dark:text-slate-100">
            پیام‌های ایجنت‌ها
          </span>
          {approvals.length > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100/90 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
              {toPersianNumber(approvals.length)} تاییدیه
            </span>
          ) : null}
          {unreadTotal > 0 ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-indigo-100/90 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
              {toPersianNumber(unreadTotal)} جدید
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip title="به‌روزرسانی پیام‌های ایجنت‌ها">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined className="text-[11px]" />}
              loading={loading}
              onClick={() => void loadAgentInbox()}
              className="!h-6 !w-6 !rounded-lg !p-0 !text-slate-500 hover:!bg-slate-100 dark:hover:!bg-white/10"
              aria-label="به‌روزرسانی پیام‌های ایجنت‌ها"
            />
          </Tooltip>
          <Tooltip title="باز کردن در پیام‌رسانی">
            <Button
              type="text"
              size="small"
              icon={<ExportOutlined className="text-[11px]" />}
              onClick={() => navigate('/messages', { state: { tab: 'agent' } })}
              className="!h-6 !w-6 !rounded-lg !p-0 !text-slate-500 hover:!bg-slate-100 dark:hover:!bg-white/10"
              aria-label="باز کردن پیام‌های ایجنت‌ها در پیام‌رسانی"
            />
          </Tooltip>
          {onClose ? (
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined className="text-[11px]" />}
              onClick={onClose}
              className="!h-6 !w-6 !rounded-lg !p-0 !text-slate-500 hover:!bg-slate-100 dark:hover:!bg-white/10"
              aria-label="بستن باکس پیام‌های ایجنت‌ها"
            />
          ) : (
            <Button
              type="text"
              size="small"
              icon={collapsed ? <UpOutlined className="text-[11px]" /> : <DownOutlined className="text-[11px]" />}
              onClick={() => setCollapsed((prev) => !prev)}
              className="!h-6 !w-6 !rounded-lg !p-0 !text-slate-500 hover:!bg-slate-100 dark:hover:!bg-white/10"
              aria-label={collapsed ? 'باز کردن باکس پیام‌های ایجنت‌ها' : 'جمع کردن باکس پیام‌های ایجنت‌ها'}
            />
          )}
        </div>
      </div>

      {!collapsed ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-2.5">
          {loading && threads.length === 0 && approvals.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spin size="small" />
            </div>
          ) : threads.length === 0 && approvals.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span className="text-[11px] text-slate-400">پیام یا اقدام معلقی از ایجنت‌ها ثبت نشده است</span>}
              className="!my-3"
            />
          ) : layoutMode === 'wide' ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="flex flex-col gap-2 lg:col-span-5">
                {approvals.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-0.5 text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
                      <span>صف تایید اقدامات</span>
                      <span>{toPersianNumber(approvals.length)} مورد</span>
                    </div>
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pl-0.5">
                      {approvals.slice(0, 4).map(renderApprovalCard)}
                    </div>
                  </div>
                ) : null}
                {threads.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-0.5 text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
                      <span>گفتگوهای ایجنت‌ها</span>
                      <span>{toPersianNumber(threads.length)} رشته</span>
                    </div>
                    <div className="max-h-48 space-y-1.5 overflow-y-auto pl-0.5">
                      {threads.map(renderThreadCard)}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col lg:col-span-7">
                {renderActiveConversation()}
              </div>
            </div>
          ) : activeThread ? (
            renderActiveConversation()
          ) : (
            <div className="flex flex-col gap-2">
              {/* Compact filter bar when both approvals & threads exist */}
              {approvals.length > 0 && threads.length > 0 ? (
                <div className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1 text-[10.5px] dark:bg-white/[0.05]">
                  {[
                    { key: 'all' as const, label: 'همه' },
                    { key: 'approvals' as const, label: `تاییدیه‌ها (${toPersianNumber(approvals.length)})` },
                    { key: 'messages' as const, label: `پیام‌ها (${toPersianNumber(threads.length)})` },
                  ].map((tab) => {
                    const active = filterTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setFilterTab(tab.key)}
                        className={`flex-1 rounded-lg px-2 py-1 font-semibold transition ${
                          active
                            ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-200'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {showApprovalsSection && approvals.length > 0 ? (
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {approvals.slice(0, filterTab === 'approvals' ? 6 : 2).map(renderApprovalCard)}
                </div>
              ) : null}

              {showMessagesSection && threads.length > 0 ? (
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {threads.map(renderThreadCard)}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default AiAgentMessagesCompactBox;
