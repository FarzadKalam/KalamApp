import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Badge, Button, Drawer, Empty, Input, Spin, Tooltip } from 'antd';
import { CloseOutlined, PlusOutlined, PushpinFilled, PushpinOutlined, SearchOutlined, ShareAltOutlined, MessageOutlined } from '@ant-design/icons';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import NotificationUnreadBadge from '../notifications/NotificationUnreadBadge';
import {useOptionalNotificationRuntime} from '../notifications/NotificationRuntimeProvider';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';
import { formatPersianPrice } from '../../utils/persianNumberFormatter';
import { useCurrencyConfig, type CurrencyConfig } from '../../utils/currency';
import { formatAiCurrencyFromIrt } from '../../utils/aiCurrency';
import AssistantPanel from './AssistantPanel';
import type { AiComposerCapability } from './AiCapabilityComposerActions';
import { getAgentDefinition, normalizeSelectedAgents, type AgentKey } from '../../utils/aiAgentCatalog';
import { usePersonalAssistantTitle } from '../../hooks/usePersonalAssistantTitle';
import { AiAgentCameoFigure } from './AiAgentIcon';
import './AiChatSurfaceV2.css';
const AgentInboxSurface=React.lazy(()=>import('../notifications/messaging/MessagingSurfacePrototype'));

type AiThreadRow = {
  id: string;
  title?: string | null;
  context_type?: string | null;
  context_key?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  pinned_at?: string | null;
  module_id?: string | null;
  record_id?: string | null;
  metadata?: Record<string, any> | null;
  is_shared?: boolean | null;
};

type AiCreditSummary = {
  access?: {
    allowed?: boolean;
    reason?: string | null;
    canManageAiSettings?: boolean;
    canViewSaasAdmin?: boolean;
  } | null;
  dailyUsage?: {
    usedTokens?: number | null;
    dailyTokenLimit?: number | null;
    remainingTokens?: number | null;
    usageRatio?: number | null;
    warning?: boolean;
    exhausted?: boolean;
  } | null;
  orgWallet?: {
    remainingIrt?: number | null;
    balanceIrt?: number | null;
    includedQuotaIrt?: number | null;
    warning?: boolean;
    exhausted?: boolean;
  } | null;
  company?: {
    currency_code?: string | null;
    currency_label?: string | null;
  } | null;
  liveExchangeRate?: {
    rate?: number | null;
    source?: string | null;
  } | null;
};

const THREAD_LIMIT = 80;

const sortAiThreads = (items: AiThreadRow[]) => [...items].sort((a, b) => {
  const aPinned = a.pinned_at ? 1 : 0;
  const bPinned = b.pinned_at ? 1 : 0;
  if (aPinned !== bPinned) return bPinned - aPinned;
  return String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''));
});

const getModuleTitleFa = (moduleId?: string | null) => {
  const key = String(moduleId || '').trim();
  if (!key) return '';
  return MODULES[key]?.titles?.fa || key;
};

const getThreadTitle = (thread: AiThreadRow) => {
  const title = String(thread.title || thread.metadata?.title || '').trim();
  if (title) return title;
  const moduleTitle = getModuleTitleFa(thread.module_id || thread.metadata?.module_id);
  if (moduleTitle) return `گفتگو درباره ${moduleTitle}`;
  return 'گفتگوی هوش مصنوعی';
};

type AiThreadSource = {
  href: string;
  label: string;
};

const getThreadSource = (thread: AiThreadRow): AiThreadSource | null => {
  if(thread.metadata?.free_chat === true) return null;
  const metadata = thread.metadata || {};
  const storedContext = metadata.context && typeof metadata.context === 'object' ? metadata.context : {};
  const moduleId = String(storedContext.moduleId || thread.module_id || metadata.module_id || '').trim();
  const recordId = String(storedContext.recordId || thread.record_id || metadata.record_id || '').trim();
  const storedRoute = String(storedContext.route || metadata.route || '').trim();
  const moduleTitle = getModuleTitleFa(moduleId);
  if (!moduleId) return null;
  const href = storedRoute.startsWith('/')
    ? storedRoute
    : recordId
      ? `/${moduleId}/${recordId}`
      : `/${moduleId}`;
  return {
    href,
    label: recordId ? `رکورد ${moduleTitle || moduleId}` : `فهرست ${moduleTitle || moduleId}`,
  };
};

const getThreadAgent = (thread: AiThreadRow, personalTitle: string) => {
  const metadata = thread.metadata || {};
  if (metadata.free_chat === true) return { ...getAgentDefinition('lead_orchestrator')!,titleFa: 'بدون ایجنت',badgeColor: '#64748b' };
  const rawKey = String(
    metadata.agent_key
    || (Array.isArray(metadata.selected_agents) ? metadata.selected_agents[0] : '')
    || 'lead_orchestrator'
  ).trim() as AgentKey;
  const agent = getAgentDefinition(rawKey) || getAgentDefinition('lead_orchestrator')!;
  return agent.key === 'lead_orchestrator' ? { ...agent, titleFa: personalTitle, shortTitleFa: personalTitle } : agent;
};

const getThreadSubtitle = (thread: AiThreadRow) => {
  if (thread.metadata?.free_chat === true) return 'گفتگوی آزاد';
  const source = getThreadSource(thread);
  if (source) return source.label;
  const metadata = thread.metadata || {};
  const contextLabel = String(metadata.context_label || '').trim();
  if (contextLabel) return contextLabel;
  const kind = String(metadata.context_kind || thread.context_type || '').trim();
  if (kind === 'record') return 'رکورد';
  if (kind === 'module_page' || kind === 'list') return 'فهرست ماژول';
  return 'گفتگوی عمومی';
};

const formatThreadTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(date);
};

const formatAiCreditSummary = (
  summary?: AiCreditSummary | null,
  fallbackCurrency?: CurrencyConfig | null,
) => {
  if (!summary) return 'در حال دریافت...';
  if (summary.access?.allowed === false) return 'دسترسی هوش مصنوعی ندارید';
  const daily = summary.dailyUsage || {};
  const usedTokens = Math.max(0, Math.floor(Number(daily.usedTokens || 0)));
  const limitTokens = Math.max(0, Math.floor(Number(daily.dailyTokenLimit || 0)));
  const usageText = limitTokens > 0
    ? `مصرف امروز: ${formatPersianPrice(usedTokens)} از ${formatPersianPrice(limitTokens)} توکن`
    : `مصرف امروز: ${formatPersianPrice(usedTokens)} توکن`;
  if (!summary.access?.canManageAiSettings && !summary.access?.canViewSaasAdmin) return usageText;
  const amountText = summary.orgWallet?.remainingIrt === null || summary.orgWallet?.remainingIrt === undefined
    ? 'نامشخص'
    : formatAiCurrencyFromIrt(
        Math.max(0, Number(summary.orgWallet?.remainingIrt || 0)),
        summary.company,
        fallbackCurrency,
        { exchangeRateIrt: summary.liveExchangeRate?.rate },
      );
  return `${usageText} | اعتبار سازمان: ${amountText}`;
};

const getAiUsageWarningText = (summary?: AiCreditSummary | null) => {
  if (!summary) return '';
  if (summary.access?.allowed === false) return 'شما به هوش مصنوعی دسترسی ندارید. برای فعال‌سازی با مدیر سازمان هماهنگ کنید.';
  if (summary.orgWallet?.exhausted) return 'اعتبار هوش مصنوعی سازمان تمام شده است.';
  if (summary.dailyUsage?.exhausted) return 'سقف مصرف روزانه هوش مصنوعی شما تمام شده است.';
  if (summary.orgWallet?.warning) return 'اعتبار هوش مصنوعی سازمان رو به اتمام است.';
  if (summary.dailyUsage?.warning) return 'کمتر از ده درصد سقف مصرف روزانه هوش مصنوعی شما باقی مانده است.';
  return '';
};

const isHiddenAssistantThread = (thread?: AiThreadRow | null) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const contextKey = String(thread?.context_key || metadata.context_key || '').trim();
  const lastActivityKind = String(metadata.last_activity_kind || '').trim();
  const replyChannel = String(metadata.reply_channel || '').trim();
  const source = String(metadata.source || metadata.context?.source || '').trim();
  const capability = String(metadata.capability || '').trim();
  return contextKey.startsWith('reply:sms:')
    || contextKey.startsWith('reply:bot:')
    || lastActivityKind === 'reply_suggestion'
    || replyChannel === 'sms'
    || replyChannel === 'bot'
    || source === 'reply_suggestion'
    || source === 'notifications_chat_reply_suggest'
    || capability === 'customer_reply_suggestion'
    || metadata.customer_reply_suggestion === true;
};

const AiChatSurfaceV2: React.FC = () => {
  const personalTitle = usePersonalAssistantTitle();
  const { message } = App.useApp();
  const orgCurrency = useCurrencyConfig();
  const location = useLocation();
  const navigate=useNavigate();
  const notificationRuntime=useOptionalNotificationRuntime();
  const [searchParams] = useSearchParams();
  const requestedThreadId=String(searchParams.get('thread')||'').trim()||null;
  const showAgentInbox=searchParams.get('inbox')==='1';
  const inboxAgent=normalizeSelectedAgents([searchParams.get('agent')||'lead_orchestrator'])[0]||'lead_orchestrator';
  const [threads, setThreads] = useState<AiThreadRow[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(()=>requestedThreadId);
  const [threadListOpen, setThreadListOpen] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [aiCreditSummary, setAiCreditSummary] = useState<AiCreditSummary | null>(null);
  const [dismissedAiWarning, setDismissedAiWarning] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [newConversationSeed, setNewConversationSeed] = useState(0);
  const [initialRouteConsumed, setInitialRouteConsumed] = useState(false);
  const searchInputRef = useRef<any>(null);
  const drawerSearchInputRef = useRef<any>(null);
  useEffect(() => {
    if (!searchOpen) return;
    const frame=window.requestAnimationFrame(() => (threadListOpen ? drawerSearchInputRef : searchInputRef).current?.focus?.());
    return () => window.cancelAnimationFrame(frame);
  },[searchOpen,threadListOpen]);
  const routeState = (location.state && typeof location.state === 'object' ? location.state : {}) as Record<string, any>;
  const initialFile = routeState.aiInitialFile && typeof routeState.aiInitialFile === 'object' ? routeState.aiInitialFile : null;
  const initialVoipCallLogId = String(routeState.aiInitialVoipCallLogId || '').trim() || null;
  const initialFiles = useMemo(() => (
    Array.isArray(routeState.aiInitialFiles)
      ? routeState.aiInitialFiles.filter((item: any) => item && typeof item === 'object')
      : []
  ), [routeState.aiInitialFiles]);
  const routeInitialPrompt = String(routeState.aiInitialPrompt || initialFile?.message || initialFiles[0]?.message || searchParams.get('prompt') || '').trim();
  const initialPrompt = initialRouteConsumed ? '' : routeInitialPrompt;
  const effectiveInitialFile = initialRouteConsumed ? null : initialFile;
  const effectiveInitialFiles = initialRouteConsumed ? [] : initialFiles;
  const forceNewThread = !initialRouteConsumed && (routeState.forceNewThread === true || searchParams.get('new') === '1' || Boolean(initialPrompt) || Boolean(effectiveInitialFile) || effectiveInitialFiles.length > 0);
  const autoSubmitInitial = typeof routeState.aiAutoSubmitInitial === 'boolean'
    ? routeState.aiAutoSubmitInitial
    : Boolean(initialPrompt && !effectiveInitialFile && effectiveInitialFiles.length === 0 && forceNewThread);
  const initialCapabilities = useMemo(() => (
    Array.isArray(routeState.aiInitialCapabilities)
      ? routeState.aiInitialCapabilities.map((item: any) => String(item || '').trim()).filter(Boolean) as AiComposerCapability[]
      : null
  ), [routeState.aiInitialCapabilities]);
  const initialAgents = useMemo<AgentKey[] | null>(() => {
    const queryAgent = String(searchParams.get('agent') || '').trim();
    const candidates = Array.isArray(routeState.aiInitialAgents)
      ? routeState.aiInitialAgents
      : queryAgent
        ? [queryAgent]
        : null;
    const normalized = candidates ? normalizeSelectedAgents(candidates) : [];
    return normalized.length ? normalized : null;
  }, [routeState.aiInitialAgents, searchParams]);
  const initialMediaSettings = useMemo(() => (
    routeState.aiInitialMediaSettings && typeof routeState.aiInitialMediaSettings === 'object'
      ? routeState.aiInitialMediaSettings
      : null
  ), [routeState.aiInitialMediaSettings]);
  const initialMediaSourceImages = useMemo(() => (
    Array.isArray(routeState.aiInitialMediaSourceImages)
      ? routeState.aiInitialMediaSourceImages.filter((item: any) => item && typeof item === 'object')
      : []
  ), [routeState.aiInitialMediaSourceImages]);
  const initialPanelKey = useMemo(() => JSON.stringify({
    prompt: initialPrompt,
    inputKind: routeState.aiInitialInputKind || null,
    capabilities: initialCapabilities || [],
    agents: initialAgents || [],
    recordCreationTarget: routeState.aiInitialRecordCreationTargetModuleId || null,
    fileCount: effectiveInitialFiles.length,
    fileName: effectiveInitialFile?.fileName || null,
    voipCallLogId: initialVoipCallLogId,
    mediaSettings: initialMediaSettings || {},
    mediaSourceImageCount: initialMediaSourceImages.length,
    forceNewThread,
    locationKey: location.key || '',
  }), [effectiveInitialFile?.fileName, effectiveInitialFiles.length, forceNewThread, initialAgents, initialCapabilities, initialMediaSettings, initialMediaSourceImages.length, initialPrompt, initialVoipCallLogId, location.key, routeState.aiInitialInputKind, routeState.aiInitialRecordCreationTargetModuleId]);

  const loadThreads = useCallback(async (preferredThreadId?: string | null) => {
    setLoadingThreads(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', { body: { action: 'list_threads', limit: THREAD_LIMIT } });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error(String((data as any)?.message || 'دریافت گفتگوها ناموفق بود.'));
      const nextThreads = (Array.isArray((data as any)?.threads) ? (data as any).threads as AiThreadRow[] : [])
        .filter((thread) => !isHiddenAssistantThread(thread));
      setThreads(sortAiThreads(nextThreads));
      setActiveThreadId((current) => {
        if(requestedThreadId)return requestedThreadId;
        if (preferredThreadId && nextThreads.some((thread) => String(thread.id) === String(preferredThreadId))) return preferredThreadId;
        if (current && nextThreads.some((thread) => String(thread.id) === String(current))) return current;
        if (forceNewThread) return null;
        return nextThreads[0]?.id || null;
      });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت گفتگوهای هوش مصنوعی ناموفق بود.'));
    } finally {
      setLoadingThreads(false);
    }
  }, [forceNewThread, message,requestedThreadId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);
  const aiNotificationRevision=JSON.stringify(notificationRuntime.ai?.byConversation||{});
  const notificationRevisionRef=useRef(aiNotificationRevision);
  useEffect(()=>{
    if(notificationRevisionRef.current===aiNotificationRevision)return;
    notificationRevisionRef.current=aiNotificationRevision;void loadThreads();
  },[aiNotificationRevision,loadThreads]);

  useEffect(() => {
    if (!forceNewThread) return;
    setActiveThreadId(null);
  }, [forceNewThread, location.key]);

  useEffect(() => {
    setInitialRouteConsumed(false);
  }, [location.key]);

  useEffect(() => {
    let mounted = true;
    const loadCreditSummary = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('ai-assistant', { body: { action: 'get_ai_usage_summary' } });
        if (error) throw error;
        if ((data as any)?.success === false) throw new Error(String((data as any)?.message || 'دریافت اعتبار هوش مصنوعی ناموفق بود.'));
        if (mounted) setAiCreditSummary(data as AiCreditSummary);
      } catch {
        if (mounted) setAiCreditSummary({
          access: { allowed: true },
          dailyUsage: { usedTokens: 0, dailyTokenLimit: null, remainingTokens: null },
          company: { currency_code: 'IRT', currency_label: 'تومان' },
        });
      }
    };
    void loadCreditSummary();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredThreads = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('fa');
    if (!normalized) return threads;
    return threads.filter((thread) =>
      `${getThreadTitle(thread)} ${getThreadSubtitle(thread)}`.toLocaleLowerCase('fa').includes(normalized)
    );
  }, [search, threads]);

  const activeThreadTitle = useMemo(() => {
    const activeThread = threads.find((thread) => String(thread.id) === String(activeThreadId || ''));
    return activeThread ? getThreadTitle(activeThread) : null;
  }, [activeThreadId, threads]);
  const activeThreadIsShared = useMemo(() => (
    threads.find((thread) => String(thread.id) === String(activeThreadId || ''))?.is_shared === true
  ), [activeThreadId, threads]);
  const aiUsageWarningText = useMemo(() => getAiUsageWarningText(aiCreditSummary), [aiCreditSummary]);

  const closeThreadList = useCallback(() => {
    setThreadListOpen(false);
    scheduleOverlayLockRelease(0);
  }, []);

  const startNewConversation = useCallback(() => {
    // A dashboard hand-off is consumed once.  Starting a new conversation
    // must never replay that hand-off prompt or attachment.
    setInitialRouteConsumed(true);
    setActiveThreadId(null);
    setNewConversationSeed((value) => value + 1);
    if(showAgentInbox||requestedThreadId)navigate('/ai',{replace:true});
    closeThreadList();
  }, [closeThreadList,showAgentInbox,requestedThreadId,navigate]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const onShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.getModifierState('AltGraph') || !event.altKey || !(event.ctrlKey || event.metaKey) || event.shiftKey || (event.code !== 'KeyN' && event.key.toLowerCase() !== 'n')) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      startNewConversation();
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [startNewConversation]);

  const handleThreadDeleted = useCallback((threadId: string) => {
    const normalizedThreadId = String(threadId || '').trim();
    if (!normalizedThreadId) return;
    setThreads((current) => current.filter((thread) => String(thread.id) !== normalizedThreadId));
    setActiveThreadId((current) => (String(current || '') === normalizedThreadId ? null : current));
    setNewConversationSeed((value) => value + 1);
  }, []);

  const handleThreadRenamed = useCallback((threadId: string, title: string, patchedThread?: any) => {
    const normalizedThreadId = String(threadId || '').trim();
    const normalizedTitle = String(title || '').trim();
    if (!normalizedThreadId || !normalizedTitle) return;
    setThreads((current) => sortAiThreads(current.map((thread) => (
      String(thread.id) === normalizedThreadId
        ? { ...thread, ...(patchedThread && typeof patchedThread === 'object' ? patchedThread : {}), title: normalizedTitle }
        : thread
    ))));
  }, []);

  const handleThreadUpserted = useCallback((thread: any) => {
    const threadId = String(thread?.id || thread?.threadId || '').trim();
    if (!threadId || isHiddenAssistantThread(thread)) return;
    setThreads((current) => {
      const normalized: AiThreadRow = {
        ...(thread || {}),
        id: threadId,
        title: thread?.title || thread?.threadTitle || getThreadTitle(thread),
        updated_at: thread?.updated_at || thread?.updatedAt || new Date().toISOString(),
      };
      const exists = current.some((item) => String(item.id) === threadId);
      return sortAiThreads(exists
        ? current.map((item) => (String(item.id) === threadId ? { ...item, ...normalized } : item))
        : [normalized, ...current]);
    });
  }, []);

  const toggleThreadPin = useCallback(async (event: React.MouseEvent, thread: AiThreadRow) => {
    event.preventDefault();
    event.stopPropagation();
    const threadId = String(thread?.id || '').trim();
    if (!threadId) return;
    const previous = threads;
    const optimisticPinnedAt = thread.pinned_at ? null : new Date().toISOString();
    setThreads((current) => sortAiThreads(current.map((item) => (
      String(item.id) === threadId ? { ...item, pinned_at: optimisticPinnedAt } : item
    ))));
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'toggle_thread_pin', threadId },
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error(String((data as any)?.message || 'تغییر وضعیت پین ناموفق بود.'));
      if ((data as any)?.thread) handleThreadUpserted((data as any).thread);
    } catch (error: any) {
      setThreads(previous);
      message.error(toFaErrorMessage(error, 'تغییر وضعیت پین گفتگو ناموفق بود.'));
    }
  }, [handleThreadUpserted, message, threads]);

  const renderThreadList = (compact = false, inDrawer = false) => (
    <div className={compact ? 'flex h-full flex-col gap-1 overflow-y-auto px-1 py-1.5' : 'flex min-h-0 flex-1 flex-col'}>
      {!compact ? (
        <>
        <div data-testid="ai-thread-list-header" className="ai-chat-surface-header border-b border-slate-200/60 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-[#1c1c1f]">
          <div className="ai-chat-header-row flex items-center justify-between gap-2">
            {searchOpen ? <div className="ai-chat-thread-search min-w-0 flex-1">
              <Input ref={inDrawer ? drawerSearchInputRef : searchInputRef} allowClear value={search} onChange={event => setSearch(event.target.value)} placeholder="جستجوی گفتگوها"
                onKeyDown={event => { if(event.key==='Escape'){event.stopPropagation();setSearch('');setSearchOpen(false);} }}
                suffix={<Button type="text" size="small" icon={<CloseOutlined />} aria-label="بستن جستجوی گفتگوها" onClick={() => {setSearch('');setSearchOpen(false);}} />} />
            </div> : <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">دستیار هوشمند سازمان</div>
              <div className="mt-0.5 truncate text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">
                {formatAiCreditSummary(aiCreditSummary, orgCurrency)}
              </div>
            </div>}
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip title="جستجوی گفتگوها">
                <Button type="text" shape="circle" icon={<SearchOutlined />} aria-label="جستجوی گفتگوهای هوش مصنوعی" aria-expanded={searchOpen} onClick={() => {setSearchOpen(true);(inDrawer ? drawerSearchInputRef : searchInputRef).current?.focus?.();}} />
              </Tooltip>
              <Tooltip title={<span>گفتگوی جدید <kbd className="keyboard-shortcut-hint mr-1 text-[9px] opacity-70">Ctrl+Alt+N</kbd></span>}>
                <Button type="text" shape="circle" icon={<PlusOutlined />} aria-label="گفتگوی جدید هوش مصنوعی" onClick={startNewConversation} />
              </Tooltip>
            </div>
          </div>
        </div>
          {aiUsageWarningText && !dismissedAiWarning ? (
            <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[10.5px] leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              <span>{aiUsageWarningText}</span>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                aria-label="بستن هشدار هوش مصنوعی"
                className="!h-5 !w-5 !min-w-5 !p-0 !text-red-700 dark:!text-red-200"
                onClick={() => setDismissedAiWarning(true)}
              />
            </div>
          ) : null}
        </>
      ) : null}
      <div className={compact ? 'space-y-1' : 'min-h-0 flex-1 overflow-y-auto p-1.5'}>
        <Button block type={showAgentInbox?'primary':'text'} className="mb-2" onClick={()=>{navigate('/ai?inbox=1&agent='+encodeURIComponent(inboxAgent));closeThreadList();}}>
          <Badge count={notificationRuntime.ai?.agentNoteTotal||0} size="small">پیام‌ها و یادآوری‌های ایجنت‌ها</Badge>
        </Button>
        {loadingThreads ? (
          <div className="flex justify-center py-8"><Spin size="small" /></div>
        ) : filteredThreads.length === 0 ? (
          compact ? null : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="گفتگویی پیدا نشد." className="mt-8" />
        ) : filteredThreads.map((thread) => {
          const active = thread.id === activeThreadId;
          const title = getThreadTitle(thread);
          const source = getThreadSource(thread);
          const threadAgent = getThreadAgent(thread, personalTitle);
          if (compact) {
            return (
              <div
                role="button"
                tabIndex={0}
                key={thread.id}
                title={title}
                onClick={() => {
                  setActiveThreadId(thread.id);
                  if(showAgentInbox||requestedThreadId)navigate('/ai?thread='+encodeURIComponent(thread.id),{replace:true});
                  closeThreadList();
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  setActiveThreadId(thread.id);
                  if(showAgentInbox||requestedThreadId)navigate('/ai?thread='+encodeURIComponent(thread.id),{replace:true});
                  closeThreadList();
                }}
                className={`flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition ${active ? 'bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.10),0_8px_18px_rgba(15,23,42,0.08)] dark:bg-white/[0.10]' : 'hover:bg-white/80 dark:hover:bg-white/[0.06]'}`}
              >
                <NotificationUnreadBadge kind="ai" threadId={thread.id}>
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-slate-900 overflow-hidden"
                    style={{ borderColor: `${threadAgent.badgeColor}90` }}
                    title={threadAgent.titleFa}
                  >
                    {thread.metadata?.free_chat ? <MessageOutlined /> : <AiAgentCameoFigure agentKey={threadAgent.key} size={28} accentColor={threadAgent.badgeColor} />}
                  </div>
                </NotificationUnreadBadge>
                <button
                  type="button"
                  onClick={(event) => void toggleThreadPin(event, thread)}
                  className="rounded-full p-0.5 text-[10px] text-slate-400 hover:bg-white hover:text-[rgb(var(--brand-700-rgb))] dark:hover:bg-white/10"
                  aria-label={thread.pinned_at ? 'برداشتن پین گفتگو' : 'پین کردن گفتگو'}
                >
                  {thread.pinned_at ? <PushpinFilled /> : <PushpinOutlined />}
                </button>
                  <span className="flex min-h-7 items-start justify-center gap-0.5 text-center text-[9.5px] leading-3.5 text-slate-500 dark:text-slate-400">{thread.is_shared ? <ShareAltOutlined className="mt-0.5 shrink-0 text-[9px] text-[rgb(var(--brand-600-rgb))]" /> : null}<span className="line-clamp-2">{title}</span></span>
              </div>
            );
          }
          return (
            <div
              role="button"
              tabIndex={0}
              key={thread.id}
              onClick={() => {
                setActiveThreadId(thread.id);
                if(showAgentInbox||requestedThreadId)navigate('/ai?thread='+encodeURIComponent(thread.id),{replace:true});
                closeThreadList();
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                setActiveThreadId(thread.id);
                if(showAgentInbox||requestedThreadId)navigate('/ai?thread='+encodeURIComponent(thread.id),{replace:true});
                closeThreadList();
              }}
              className={`mb-1.5 flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2 text-right transition ${active ? 'border-slate-300/80 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-white/[0.085]' : 'border-transparent bg-white/58 hover:bg-white/92 dark:bg-transparent dark:hover:bg-white/[0.055]'}`}
            >
              <NotificationUnreadBadge kind="ai" threadId={thread.id}><div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-slate-900 shadow-sm overflow-hidden mt-0.5"
                style={{ borderColor: `${threadAgent.badgeColor}90` }}
                title={threadAgent.titleFa}
              >
                {thread.metadata?.free_chat ? <MessageOutlined /> : <AiAgentCameoFigure agentKey={threadAgent.key} size={28} accentColor={threadAgent.badgeColor} />}
              </div></NotificationUnreadBadge>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="flex min-w-0 items-start gap-1"><span className="line-clamp-2 text-[13px] font-bold leading-5 text-slate-800 dark:text-slate-100">{title}</span>{thread.is_shared ? <ShareAltOutlined className="mt-1 shrink-0 text-[11px] text-[rgb(var(--brand-600-rgb))]" /> : null}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
                    <button
                      type="button"
                      onClick={(event) => void toggleThreadPin(event, thread)}
                      className="rounded-full p-1 hover:bg-slate-100 hover:text-[rgb(var(--brand-700-rgb))] dark:hover:bg-white/10"
                      aria-label={thread.pinned_at ? 'برداشتن پین گفتگو' : 'پین کردن گفتگو'}
                    >
                      {thread.pinned_at ? <PushpinFilled /> : <PushpinOutlined />}
                    </button>
                    {formatThreadTime(thread.updated_at || thread.created_at)}
                  </span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-5">
                  <span
                    className="inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium"
                    style={{ backgroundColor: `${threadAgent.badgeColor}1a`, color: threadAgent.badgeColor }}
                  >
                    {threadAgent.titleFa}
                  </span>
                  {source ? (
                    <Link
                      to={source.href}
                      onClick={(event) => event.stopPropagation()}
                      className="line-clamp-1 text-[11px] text-[rgb(var(--brand-700-rgb))] underline decoration-dotted underline-offset-2 dark:text-[rgb(var(--brand-300-rgb))]"
                      title={`باز کردن ${source.label}`}
                    >
                      {source.label}
                    </Link>
                  ) : (
                    <span className="line-clamp-1 text-slate-500 dark:text-slate-400">{getThreadSubtitle(thread)}</span>
                  )}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {!compact ? (
        <div className="sticky bottom-0 shrink-0 border-t border-slate-200/60 bg-white p-2 pb-[max(8px,env(safe-area-inset-bottom))] dark:border-white/[0.07] dark:bg-[#1c1c1f]">
          <Button block type="primary" icon={<PlusOutlined />} onClick={startNewConversation}>
            گفتگوی جدید <kbd className="keyboard-shortcut-hint mr-1 text-[9px] opacity-70">Ctrl+Alt+N</kbd>
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div dir="rtl" data-testid="ai-chat-v2" className="ai-chat-surface ai-chat-theme h-full min-h-0 overflow-hidden bg-slate-100 text-slate-800 dark:bg-[#141414] dark:text-slate-100">
      <div className="flex h-full min-h-0 gap-2 overflow-hidden p-2">
        <aside aria-label="فهرست گفتگوها" className="order-last hidden h-full min-h-0 w-[292px] shrink-0 md:flex md:flex-col">
          {renderThreadList(false)}
        </aside>
        <main className="min-w-0 flex-1">
          {showAgentInbox?<div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-2 rounded-t-2xl border-b border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-[#1c1c1f]">
              <Button onClick={()=>navigate('/ai')}>بازگشت به گفتگوها</Button>
              <Button icon={<PlusOutlined />} onClick={startNewConversation}>گفتگوی جدید</Button>
            </div>
            <div className="min-h-0 flex-1"><React.Suspense fallback={<Spin />}><AgentInboxSurface key={inboxAgent} agentsOnly initialFilter="agent" initialConversationKey={'live:agent:agent:'+inboxAgent} /></React.Suspense></div>
          </div>:<AssistantPanel
            key={activeThreadId || `new-${newConversationSeed}-${initialPanelKey}`}
            active
            initialThreadId={activeThreadId}
            initialThreadTitle={activeThreadTitle}
            initialThreadIsShared={activeThreadIsShared}
            initialPrompt={initialPrompt}
            initialInputKind={String(routeState.aiInitialInputKind || 'text')}
            initialCapabilities={initialCapabilities}
            initialAgents={initialAgents}
            initialRecordCreationTargetModuleId={String(routeState.aiInitialRecordCreationTargetModuleId || '').trim() || null}
            initialModelOverride={String(routeState.aiInitialModelOverride || '').trim() || null}
            initialReasoningOverrides={routeState.aiInitialReasoningOverrides}
            initialMediaSettings={initialMediaSettings as any}
            initialMediaSourceImages={initialMediaSourceImages as any}
            initialFiles={effectiveInitialFiles as any}
            initialFile={effectiveInitialFile as any}
            initialVoipCallLogId={initialVoipCallLogId}
            autoSubmitInitialPrompt={autoSubmitInitial}
            onThreadDeleted={handleThreadDeleted}
            onThreadRenamed={handleThreadRenamed}
            onThreadUpserted={handleThreadUpserted}
            showThreadListButton
            onOpenThreadList={() => setThreadListOpen(true)}
            threadListExpanded={threadListOpen}
            onNewConversation={startNewConversation}
          />}
        </main>
      </div>
      <Drawer
        open={threadListOpen}
        onClose={closeThreadList}
        placement="right"
        width="min(92vw, 360px)"
        title={null}
        closable={false}
        rootClassName="ai-chat-surface ai-chat-thread-drawer"
        classNames={{ body: '!p-0' }}
        destroyOnHidden
        getContainer={typeof document === 'undefined' ? undefined : () => document.body}
        afterOpenChange={(nextOpen) => {
          if (!nextOpen) scheduleOverlayLockRelease();
        }}
      >
        <div data-testid="ai-thread-drawer" className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200/70 bg-white px-3 py-2 dark:border-white/[0.07] dark:bg-[#1c1c1f]">
            <div className="text-sm font-bold">گفتگوهای هوش مصنوعی</div>
            <Button type="text" shape="circle" icon={<CloseOutlined />} onClick={closeThreadList} aria-label="بستن فهرست گفتگوهای هوش مصنوعی" />
          </div>
          {renderThreadList(false,true)}
        </div>
      </Drawer>
    </div>
  );
};

export default AiChatSurfaceV2;
