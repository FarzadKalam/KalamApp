import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Avatar, Badge, Button, Drawer, Empty, Input, Spin, Tooltip } from 'antd';
import { CloseOutlined, MenuOutlined, PlusOutlined, PushpinFilled, PushpinOutlined, SearchOutlined } from '@ant-design/icons';
import { useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';
import { formatPersianPrice } from '../../utils/persianNumberFormatter';
import AssistantPanel from './AssistantPanel';
import AiSparkleIcon from './AiSparkleIcon';
import type { AiComposerCapability } from './AiCapabilityComposerActions';

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

const getThreadSubtitle = (thread: AiThreadRow) => {
  const metadata = thread.metadata || {};
  const contextLabel = String(metadata.context_label || '').trim();
  if (contextLabel) return contextLabel;
  const moduleTitle = getModuleTitleFa(thread.module_id || metadata.module_id);
  const kind = String(metadata.context_kind || thread.context_type || '').trim();
  if (kind === 'record') return moduleTitle ? `رکورد ${moduleTitle}` : 'رکورد';
  if (kind === 'module_page' || kind === 'list') return moduleTitle ? `لیست ${moduleTitle}` : 'لیست ماژول';
  return 'گفتگوی عمومی';
};

const formatThreadTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(date);
};

const formatAiCreditSummary = (summary?: AiCreditSummary | null) => {
  if (!summary) return 'در حال دریافت...';
  if (summary.access?.allowed === false) return 'دسترسی هوش مصنوعی ندارید';
  const daily = summary.dailyUsage || {};
  const usedTokens = Math.max(0, Math.floor(Number(daily.usedTokens || 0)));
  const limitTokens = Math.max(0, Math.floor(Number(daily.dailyTokenLimit || 0)));
  const usageText = limitTokens > 0
    ? `مصرف امروز: ${formatPersianPrice(usedTokens)} از ${formatPersianPrice(limitTokens)} توکن`
    : `مصرف امروز: ${formatPersianPrice(usedTokens)} توکن`;
  if (!summary.access?.canManageAiSettings && !summary.access?.canViewSaasAdmin) return usageText;
  const currencyCode = String(summary.company?.currency_code || 'IRT').toUpperCase();
  const currencyLabel = String(summary.company?.currency_label || (currencyCode === 'IRR' ? 'ریال' : 'تومان')).trim() || 'تومان';
  const currencyMultiplier = currencyCode === 'IRR' ? 10 : 1;
  const amount = summary.orgWallet?.remainingIrt === null || summary.orgWallet?.remainingIrt === undefined
    ? null
    : Math.max(0, Number(summary.orgWallet?.remainingIrt || 0)) * currencyMultiplier;
  const amountText = amount === null ? 'نامشخص' : `${formatPersianPrice(amount)} ${currencyLabel}`;
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
  const { message } = App.useApp();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [threads, setThreads] = useState<AiThreadRow[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadListOpen, setThreadListOpen] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [aiCreditSummary, setAiCreditSummary] = useState<AiCreditSummary | null>(null);
  const [dismissedAiWarning, setDismissedAiWarning] = useState(false);
  const [search, setSearch] = useState('');
  const [newConversationSeed, setNewConversationSeed] = useState(0);
  const searchInputRef = useRef<any>(null);
  const routeState = (location.state && typeof location.state === 'object' ? location.state : {}) as Record<string, any>;
  const initialFile = routeState.aiInitialFile && typeof routeState.aiInitialFile === 'object' ? routeState.aiInitialFile : null;
  const initialFiles = useMemo(() => (
    Array.isArray(routeState.aiInitialFiles)
      ? routeState.aiInitialFiles.filter((item: any) => item && typeof item === 'object')
      : []
  ), [routeState.aiInitialFiles]);
  const initialPrompt = String(routeState.aiInitialPrompt || initialFile?.message || initialFiles[0]?.message || searchParams.get('prompt') || '').trim();
  const forceNewThread = routeState.forceNewThread === true || searchParams.get('new') === '1' || Boolean(initialPrompt) || Boolean(initialFile) || initialFiles.length > 0;
  const autoSubmitInitial = typeof routeState.aiAutoSubmitInitial === 'boolean'
    ? routeState.aiAutoSubmitInitial
    : Boolean(initialPrompt && !initialFile && initialFiles.length === 0 && forceNewThread);
  const initialCapabilities = useMemo(() => (
    Array.isArray(routeState.aiInitialCapabilities)
      ? routeState.aiInitialCapabilities.map((item: any) => String(item || '').trim()).filter(Boolean) as AiComposerCapability[]
      : null
  ), [routeState.aiInitialCapabilities]);
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
    recordCreationTarget: routeState.aiInitialRecordCreationTargetModuleId || null,
    fileCount: initialFiles.length,
    fileName: initialFile?.fileName || null,
    mediaSettings: initialMediaSettings || {},
    mediaSourceImageCount: initialMediaSourceImages.length,
    forceNewThread,
    locationKey: location.key || '',
  }), [forceNewThread, initialCapabilities, initialFile?.fileName, initialFiles.length, initialMediaSettings, initialMediaSourceImages.length, initialPrompt, location.key, routeState.aiInitialInputKind, routeState.aiInitialRecordCreationTargetModuleId]);

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
  }, [forceNewThread, message]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!forceNewThread) return;
    setActiveThreadId(null);
    setNewConversationSeed((value) => value + 1);
  }, [forceNewThread, location.key]);

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
  const aiUsageWarningText = useMemo(() => getAiUsageWarningText(aiCreditSummary), [aiCreditSummary]);

  const closeThreadList = useCallback(() => {
    setThreadListOpen(false);
    scheduleOverlayLockRelease(0);
  }, []);

  const startNewConversation = () => {
    setActiveThreadId(null);
    setNewConversationSeed((value) => value + 1);
    closeThreadList();
  };

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

  const renderThreadList = (compact = false) => (
    <div className={compact ? 'flex h-full flex-col gap-1 overflow-y-auto px-1 py-1.5' : 'flex h-full min-h-0 flex-col'}>
      {!compact ? (
        <div className="border-b border-slate-200/60 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-[#17191c]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">هوش مصنوعی تازه سیستم</div>
              <div className="mt-0.5 truncate text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">
                {formatAiCreditSummary(aiCreditSummary)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip title="جستجوی گفتگوها">
                <Button type="text" shape="circle" icon={<SearchOutlined />} aria-label="جستجوی گفتگوهای هوش مصنوعی" onClick={() => searchInputRef.current?.focus?.()} />
              </Tooltip>
              <Tooltip title="گفتگوی جدید">
                <Button type="text" shape="circle" icon={<PlusOutlined />} aria-label="گفتگوی جدید هوش مصنوعی" onClick={startNewConversation} />
              </Tooltip>
            </div>
          </div>
          <Input
            ref={searchInputRef}
            allowClear
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جستجوی گفتگوها"
            prefix={<SearchOutlined className="text-slate-400" />}
            className="mt-2"
          />
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
        </div>
      ) : null}
      <div className={compact ? 'space-y-1' : 'min-h-0 flex-1 overflow-y-auto p-1.5'}>
        {loadingThreads ? (
          <div className="flex justify-center py-8"><Spin size="small" /></div>
        ) : filteredThreads.length === 0 ? (
          compact ? null : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="گفتگویی پیدا نشد." className="mt-8" />
        ) : filteredThreads.map((thread) => {
          const active = thread.id === activeThreadId;
          const title = getThreadTitle(thread);
          if (compact) {
            return (
              <div
                role="button"
                tabIndex={0}
                key={thread.id}
                title={title}
                onClick={() => {
                  setActiveThreadId(thread.id);
                  closeThreadList();
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  setActiveThreadId(thread.id);
                  closeThreadList();
                }}
                className={`flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition ${active ? 'bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.10),0_8px_18px_rgba(15,23,42,0.08)] dark:bg-white/[0.10]' : 'hover:bg-white/80 dark:hover:bg-white/[0.06]'}`}
              >
                <Badge size="small" color="#c0392b">
                  <Avatar size={34} className="!bg-[rgba(var(--brand-100-rgb),0.88)] !text-[rgb(var(--brand-700-rgb))] dark:!bg-[rgba(var(--brand-600-rgb),0.18)] dark:!text-[rgb(var(--brand-200-rgb))]">
                    <AiSparkleIcon className="h-4 w-4" />
                  </Avatar>
                </Badge>
                <button
                  type="button"
                  onClick={(event) => void toggleThreadPin(event, thread)}
                  className="rounded-full p-0.5 text-[10px] text-slate-400 hover:bg-white hover:text-[rgb(var(--brand-700-rgb))] dark:hover:bg-white/10"
                  aria-label={thread.pinned_at ? 'برداشتن پین گفتگو' : 'پین کردن گفتگو'}
                >
                  {thread.pinned_at ? <PushpinFilled /> : <PushpinOutlined />}
                </button>
                <span className="line-clamp-2 min-h-7 text-center text-[9.5px] leading-3.5 text-slate-500 dark:text-slate-400">{title}</span>
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
                closeThreadList();
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                setActiveThreadId(thread.id);
                closeThreadList();
              }}
              className={`mb-1.5 flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2 text-right transition ${active ? 'border-slate-300/80 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-white/[0.085]' : 'border-transparent bg-white/58 hover:bg-white/92 dark:bg-transparent dark:hover:bg-white/[0.055]'}`}
            >
              <Avatar size={36} className="!bg-[rgba(var(--brand-100-rgb),0.88)] !text-[rgb(var(--brand-700-rgb))] dark:!bg-[rgba(var(--brand-600-rgb),0.18)] dark:!text-[rgb(var(--brand-200-rgb))]">
                <AiSparkleIcon className="h-4 w-4" />
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="line-clamp-2 text-[13px] font-bold leading-5 text-slate-800 dark:text-slate-100">{title}</span>
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
                <span className="mt-1 line-clamp-1 text-[11px] leading-5 text-slate-500 dark:text-slate-300">{getThreadSubtitle(thread)}</span>
              </span>
            </div>
          );
        })}
      </div>
      {!compact ? (
        <div className="border-t border-slate-200/60 p-2 dark:border-white/[0.07]">
          <Button block type="primary" icon={<PlusOutlined />} onClick={startNewConversation}>
            گفتگوی جدید
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div dir="rtl" data-testid="ai-chat-v2" className="h-full min-h-0 overflow-hidden bg-slate-100 text-slate-800 dark:bg-[#101113] dark:text-slate-100">
      <div className="flex h-full min-h-0 overflow-hidden">
        <aside className="order-last hidden h-full min-h-0 w-[292px] shrink-0 border-l border-slate-200/70 bg-slate-50/86 dark:border-white/[0.07] dark:bg-[#131518] md:block">
          {renderThreadList(false)}
        </aside>
        <aside className="order-last h-full min-h-0 w-[76px] shrink-0 border-l border-slate-200/70 bg-slate-50/90 dark:border-white/[0.07] dark:bg-[#131518] md:hidden">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-slate-200/70 px-2 py-2 dark:border-white/[0.07]">
              <Button block type="text" icon={<MenuOutlined />} onClick={() => setThreadListOpen(true)} aria-label="باز کردن فهرست گفتگوهای هوش مصنوعی" />
            </div>
            {renderThreadList(true)}
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <AssistantPanel
            key={activeThreadId || `new-${newConversationSeed}-${initialPanelKey}`}
            active
            initialThreadId={activeThreadId}
            initialThreadTitle={activeThreadTitle}
            initialPrompt={initialPrompt}
            initialInputKind={String(routeState.aiInitialInputKind || 'text')}
            initialCapabilities={initialCapabilities}
            initialRecordCreationTargetModuleId={String(routeState.aiInitialRecordCreationTargetModuleId || '').trim() || null}
            initialModelOverride={String(routeState.aiInitialModelOverride || '').trim() || null}
            initialMediaSettings={initialMediaSettings as any}
            initialMediaSourceImages={initialMediaSourceImages as any}
            initialFiles={initialFiles as any}
            initialFile={initialFile as any}
            autoSubmitInitialPrompt={autoSubmitInitial}
            onThreadDeleted={handleThreadDeleted}
            onThreadRenamed={handleThreadRenamed}
            onThreadUpserted={handleThreadUpserted}
          />
        </main>
      </div>
      <Drawer
        open={threadListOpen}
        onClose={closeThreadList}
        placement="right"
        width="min(92vw, 360px)"
        title={null}
        classNames={{ body: '!p-0' }}
        destroyOnHidden
        getContainer={typeof document === 'undefined' ? undefined : () => document.body}
        afterOpenChange={(nextOpen) => {
          if (!nextOpen) scheduleOverlayLockRelease();
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200/70 bg-white px-3 py-2 dark:border-white/[0.07] dark:bg-[#17191c]">
            <div className="text-sm font-bold">گفتگوهای هوش مصنوعی</div>
            <Button type="text" shape="circle" icon={<CloseOutlined />} onClick={closeThreadList} aria-label="بستن فهرست گفتگوهای هوش مصنوعی" />
          </div>
          {renderThreadList(false)}
        </div>
      </Drawer>
    </div>
  );
};

export default AiChatSurfaceV2;
