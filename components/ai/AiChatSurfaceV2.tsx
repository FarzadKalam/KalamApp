import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Avatar, Badge, Button, Drawer, Empty, Input, Spin, Tooltip } from 'antd';
import { CloseOutlined, MenuOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import AssistantPanel from './AssistantPanel';
import AiSparkleIcon from './AiSparkleIcon';

type AiThreadRow = {
  id: string;
  title?: string | null;
  context_type?: string | null;
  context_key?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  module_id?: string | null;
  record_id?: string | null;
  metadata?: Record<string, any> | null;
};

const THREAD_LIMIT = 80;

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
  const [threads, setThreads] = useState<AiThreadRow[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadListOpen, setThreadListOpen] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [search, setSearch] = useState('');
  const [newConversationSeed, setNewConversationSeed] = useState(0);
  const searchInputRef = useRef<any>(null);

  const loadThreads = useCallback(async (preferredThreadId?: string | null) => {
    setLoadingThreads(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', { body: { action: 'list_threads', limit: THREAD_LIMIT } });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error(String((data as any)?.message || 'دریافت گفتگوها ناموفق بود.'));
      const nextThreads = (Array.isArray((data as any)?.threads) ? (data as any).threads as AiThreadRow[] : [])
        .filter((thread) => !isHiddenAssistantThread(thread));
      setThreads(nextThreads);
      setActiveThreadId((current) => {
        if (preferredThreadId && nextThreads.some((thread) => String(thread.id) === String(preferredThreadId))) return preferredThreadId;
        if (current && nextThreads.some((thread) => String(thread.id) === String(current))) return current;
        return nextThreads[0]?.id || null;
      });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت گفتگوهای هوش مصنوعی ناموفق بود.'));
    } finally {
      setLoadingThreads(false);
    }
  }, [message]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const filteredThreads = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('fa');
    if (!normalized) return threads;
    return threads.filter((thread) =>
      `${getThreadTitle(thread)} ${getThreadSubtitle(thread)}`.toLocaleLowerCase('fa').includes(normalized)
    );
  }, [search, threads]);

  const startNewConversation = () => {
    setActiveThreadId(null);
    setNewConversationSeed((value) => value + 1);
    setThreadListOpen(false);
  };

  const renderThreadList = (compact = false) => (
    <div className={compact ? 'flex h-full flex-col gap-1 overflow-y-auto px-1 py-1.5' : 'flex h-full min-h-0 flex-col'}>
      {!compact ? (
        <div className="border-b border-slate-200/60 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-[#17191c]">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">هوش مصنوعی تازه سیستم</div>
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
              <button
                type="button"
                key={thread.id}
                title={title}
                onClick={() => {
                  setActiveThreadId(thread.id);
                  setThreadListOpen(false);
                }}
                className={`flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition ${active ? 'bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.10),0_8px_18px_rgba(15,23,42,0.08)] dark:bg-white/[0.10]' : 'hover:bg-white/80 dark:hover:bg-white/[0.06]'}`}
              >
                <Badge size="small" color="#c0392b">
                  <Avatar size={34} className="!bg-[rgba(var(--brand-100-rgb),0.88)] !text-[rgb(var(--brand-700-rgb))] dark:!bg-[rgba(var(--brand-600-rgb),0.18)] dark:!text-[rgb(var(--brand-200-rgb))]">
                    <AiSparkleIcon className="h-4 w-4" />
                  </Avatar>
                </Badge>
                <span className="line-clamp-2 min-h-7 text-center text-[9.5px] leading-3.5 text-slate-500 dark:text-slate-400">{title}</span>
              </button>
            );
          }
          return (
            <button
              type="button"
              key={thread.id}
              onClick={() => {
                setActiveThreadId(thread.id);
                setThreadListOpen(false);
              }}
              className={`mb-1.5 flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2 text-right transition ${active ? 'border-slate-300/80 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-white/[0.085]' : 'border-transparent bg-white/58 hover:bg-white/92 dark:bg-transparent dark:hover:bg-white/[0.055]'}`}
            >
              <Avatar size={36} className="!bg-[rgba(var(--brand-100-rgb),0.88)] !text-[rgb(var(--brand-700-rgb))] dark:!bg-[rgba(var(--brand-600-rgb),0.18)] dark:!text-[rgb(var(--brand-200-rgb))]">
                <AiSparkleIcon className="h-4 w-4" />
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="line-clamp-2 text-[13px] font-bold leading-5 text-slate-800 dark:text-slate-100">{title}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{formatThreadTime(thread.updated_at || thread.created_at)}</span>
                </span>
                <span className="mt-1 line-clamp-1 text-[11px] leading-5 text-slate-500 dark:text-slate-300">{getThreadSubtitle(thread)}</span>
              </span>
            </button>
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
            key={activeThreadId || `new-${newConversationSeed}`}
            active
            initialThreadId={activeThreadId}
          />
        </main>
      </div>
      <Drawer
        open={threadListOpen}
        onClose={() => setThreadListOpen(false)}
        placement="right"
        width="min(92vw, 360px)"
        title={null}
        classNames={{ body: '!p-0' }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200/70 bg-white px-3 py-2 dark:border-white/[0.07] dark:bg-[#17191c]">
            <div className="text-sm font-bold">گفتگوهای هوش مصنوعی</div>
            <Button type="text" shape="circle" icon={<CloseOutlined />} onClick={() => setThreadListOpen(false)} aria-label="بستن فهرست گفتگوهای هوش مصنوعی" />
          </div>
          {renderThreadList(false)}
        </div>
      </Drawer>
    </div>
  );
};

export default AiChatSurfaceV2;
