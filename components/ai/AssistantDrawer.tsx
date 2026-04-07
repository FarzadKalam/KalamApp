import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Avatar, Button, Drawer, Empty, Input, Popconfirm, Space, Spin, Tag, Tooltip } from 'antd';
import { DeleteOutlined, ReloadOutlined, SendOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { AI_CONTEXT_EVENT } from '../../utils/aiAssistantEvents';
import AiSparkleIcon from './AiSparkleIcon';

type AssistantContext = {
  route?: string;
  mode?: 'record' | 'list' | 'page';
  moduleId?: string | null;
  recordId?: string | null;
  visibleRecordIds?: string[];
  selectedRecordIds?: string[];
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
  provider?: string | null;
  model?: string | null;
};

interface AssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  isMobile?: boolean;
}

const parseRouteContext = (pathname: string, search: string): AssistantContext => {
  const parts = pathname.split('/').filter(Boolean);
  const moduleId = parts[0] || null;
  const isKnownModule = moduleId && MODULES[moduleId];
  if (!isKnownModule) {
    return {
      route: `${pathname}${search || ''}`,
      mode: 'page',
      moduleId: null,
      recordId: null,
      visibleRecordIds: [],
      selectedRecordIds: [],
    };
  }

  if (parts.length >= 2 && parts[1] !== 'create') {
    return {
      route: `${pathname}${search || ''}`,
      mode: 'record',
      moduleId,
      recordId: parts[1],
      visibleRecordIds: [],
      selectedRecordIds: [],
    };
  }

  return {
    route: `${pathname}${search || ''}`,
    mode: 'list',
    moduleId,
    recordId: null,
    visibleRecordIds: [],
    selectedRecordIds: [],
  };
};

const buildClientContextKey = (context: AssistantContext) => {
  if (context.mode === 'record' && context.moduleId && context.recordId) return `record:${context.moduleId}:${context.recordId}`;
  if (context.route) return `route:${context.route}`;
  if (context.moduleId) return `${context.mode || 'page'}:${context.moduleId}`;
  return 'page:unknown';
};

const toFaDateTime = (value?: string | null) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return '';
  }
};

const formatUsageMetadata = (metadata?: Record<string, any> | null) => {
  const usageBox = metadata?.usage || metadata;
  const usage = usageBox?.usage || usageBox;
  const cost = usageBox?.cost || {};
  const parts: string[] = [];
  const totalTokens = usage?.total_tokens ?? usage?.totalTokens ?? usage?.total;
  const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? usage?.promptTokens;
  const completionTokens = usage?.completion_tokens ?? usage?.output_tokens ?? usage?.completionTokens;
  if (totalTokens) parts.push(`${Number(totalTokens).toLocaleString('fa-IR')} توکن`);
  if (!totalTokens && (promptTokens || completionTokens)) {
    parts.push(`${Number(promptTokens || 0).toLocaleString('fa-IR')} ورودی / ${Number(completionTokens || 0).toLocaleString('fa-IR')} خروجی`);
  }

  const rial = cost?.rial ?? cost?.rials ?? cost?.amount_rial;
  const toman = cost?.toman ?? cost?.tomans ?? cost?.amount_toman;
  const usd = cost?.usd ?? cost?.cost_usd ?? cost?.amount_usd;
  const amount = cost?.amount ?? cost?.cost;
  const currency = cost?.currency;
  if (toman) parts.push(`${Number(toman).toLocaleString('fa-IR')} تومان`);
  if (rial) parts.push(`${Number(rial).toLocaleString('fa-IR')} ریال`);
  if (usd) parts.push(`$${Number(usd).toLocaleString('en-US', { maximumFractionDigits: 6 })}`);
  if (!rial && !toman && !usd && amount) parts.push(`${Number(amount).toLocaleString('fa-IR')} ${currency || ''}`.trim());
  return parts.join(' · ');
};

const AssistantDrawer: React.FC<AssistantDrawerProps> = ({ open, onClose, isMobile = false }) => {
  const { message } = App.useApp();
  const location = useLocation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [deletingThread, setDeletingThread] = useState(false);
  const [liveContext, setLiveContext] = useState<AssistantContext | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleContextUpdate = (event: Event) => {
      const detail = (event as CustomEvent<AssistantContext>).detail || null;
      if (!detail?.moduleId) return;
      setLiveContext({
        route: detail.route,
        mode: detail.mode || 'list',
        moduleId: detail.moduleId,
        recordId: detail.recordId || null,
        visibleRecordIds: Array.isArray(detail.visibleRecordIds) ? detail.visibleRecordIds : [],
        selectedRecordIds: Array.isArray(detail.selectedRecordIds) ? detail.selectedRecordIds : [],
      });
    };
    window.addEventListener(AI_CONTEXT_EVENT, handleContextUpdate as EventListener);
    return () => window.removeEventListener(AI_CONTEXT_EVENT, handleContextUpdate as EventListener);
  }, []);

  const context = useMemo(() => {
    const routeContext = parseRouteContext(location.pathname, location.search);
    if (
      routeContext.mode === 'list'
      && liveContext?.mode === 'list'
      && liveContext.moduleId === routeContext.moduleId
    ) {
      return {
        ...routeContext,
        visibleRecordIds: liveContext.visibleRecordIds || [],
        selectedRecordIds: liveContext.selectedRecordIds || [],
      };
    }
    return routeContext;
  }, [liveContext, location.pathname, location.search]);

  const contextKey = useMemo(() => buildClientContextKey(context), [context]);

  const contextLabel = useMemo(() => {
    if (!context.moduleId) return 'صفحه فعلی';
    const moduleTitle = MODULES[context.moduleId]?.titles?.fa || context.moduleId;
    if (context.mode === 'record' && context.recordId) return `${moduleTitle} / رکورد فعلی`;
    if (context.mode === 'list') {
      const selectedCount = context.selectedRecordIds?.length || 0;
      const visibleCount = context.visibleRecordIds?.length || 0;
      if (selectedCount > 0) return `${moduleTitle} / ${selectedCount} رکورد انتخاب‌شده`;
      return visibleCount > 0 ? `${moduleTitle} / ${Math.min(visibleCount, 10)} رکورد صفحه` : `${moduleTitle} / لیست`;
    }
    return moduleTitle;
  }, [context]);

  const callAssistant = useCallback(async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body });
    if (error) throw error;
    if (!data?.success) throw new Error(String(data?.message || 'درخواست دستیار ناموفق بود.'));
    return data;
  }, []);

  const loadThread = useCallback(async () => {
    if (!open) return;
    setLoadingThread(true);
    try {
      const data = await callAssistant({
        action: 'get_thread',
        context,
      });
      setThreadId(data.threadId ? String(data.threadId) : null);
      const nextMessages = (Array.isArray(data.messages) ? data.messages : [])
        .filter((item: any) => item?.role === 'user' || item?.role === 'assistant')
        .map((item: any) => ({
          id: String(item.id || `${item.role}-${item.created_at}`),
          role: item.role,
          content: String(item.content || ''),
          metadata: item.metadata || null,
          created_at: item.created_at || null,
          provider: item.provider || null,
          model: item.model || null,
        }));
      setMessages(nextMessages);
    } catch (error: any) {
      message.error(String(error?.message || 'خواندن تاریخچه چت ناموفق بود.'));
    } finally {
      setLoadingThread(false);
    }
  }, [callAssistant, context, message, open]);

  useEffect(() => {
    void loadThread();
  }, [contextKey, loadThread]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    });
  }, [messages, open, submitting]);

  const submitChat = useCallback(async () => {
    const text = input.trim();
    if (!text || submitting) return;
    setInput('');
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setSubmitting(true);
    try {
      const data = await callAssistant({
        action: 'chat',
        message: text,
        threadId,
        context,
      });
      if (data.threadId) setThreadId(String(data.threadId));
      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId || `assistant-${Date.now()}`,
          role: 'assistant',
          content: String(data.answer || '').trim() || 'پاسخی دریافت نشد.',
          metadata: { usage: data.usage },
          provider: data.provider || null,
          model: data.model || null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      message.error(String(error?.message || 'ارتباط با دستیار ناموفق بود.'));
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'در حال حاضر نتوانستم پاسخ را دریافت کنم. تنظیمات provider و کلید AI را بررسی کنید.',
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  }, [callAssistant, context, input, message, submitting, threadId]);

  const clearThread = useCallback(async () => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    setDeletingThread(true);
    try {
      await callAssistant({
        action: 'delete_thread',
        threadId,
      });
      setThreadId(null);
      setMessages([]);
      message.success('تاریخچه چت این صفحه پاک شد.');
    } catch (error: any) {
      message.error(String(error?.message || 'پاک کردن چت ناموفق بود.'));
    } finally {
      setDeletingThread(false);
    }
  }, [callAssistant, message, threadId]);

  const renderMessage = (item: ChatMessage) => {
    const isUser = item.role === 'user';
    const usageText = !isUser ? formatUsageMetadata(item.metadata?.usage || item.metadata) : '';
    return (
      <div key={item.id} className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <Avatar
          size={32}
          className={isUser ? '' : '!bg-[#fdf2f8] !text-[#be185d] dark:!bg-[#3b1022] dark:!text-[#f9a8d4]'}
          icon={isUser ? <UserOutlined /> : <AiSparkleIcon className="h-4 w-4" />}
        />
        <div className={`min-w-0 max-w-[82%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
          <div
            className={`whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm leading-6 shadow-sm ${
              isUser
                ? 'rounded-tr-sm border-[rgba(var(--brand-300-rgb),0.55)] bg-[rgba(var(--brand-100-rgb),0.9)] text-gray-800 dark:bg-[rgba(var(--brand-600-rgb),0.2)] dark:text-gray-100'
                : 'rounded-tl-sm border-[#f0abfc] bg-[#fdf2f8] text-gray-800 dark:border-[#be185d]/45 dark:bg-[#3b1022] dark:text-gray-100'
            }`}
          >
            {item.content}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] leading-4 text-gray-400">
            {item.created_at ? <span>{toFaDateTime(item.created_at)}</span> : null}
            {!isUser && item.model ? <span>{item.model}</span> : null}
            {!isUser && usageText ? <span>{usageText}</span> : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Drawer
      title={(
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#f0abfc] bg-[#fdf2f8] text-[#be185d] dark:border-[#be185d]/55 dark:bg-[#3b1022] dark:text-[#f9a8d4]">
            <AiSparkleIcon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold">دستیار هوشمند</div>
            <div className="truncate text-[11px] font-normal text-gray-500 dark:text-gray-400">{contextLabel}</div>
          </div>
        </div>
      )}
      extra={(
        <Space size={4}>
          <Tooltip title="بارگذاری دوباره">
            <Button type="text" size="small" icon={<ReloadOutlined spin={loadingThread} />} onClick={() => void loadThread()} />
          </Tooltip>
          <Popconfirm
            title="تاریخچه چت این صفحه پاک شود؟"
            okText="پاک شود"
            cancelText="انصراف"
            onConfirm={() => void clearThread()}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} loading={deletingThread} disabled={messages.length === 0 && !threadId} />
          </Popconfirm>
        </Space>
      )}
      open={open}
      onClose={onClose}
      width={isMobile ? '100%' : 460}
      placement="left"
      classNames={{ body: '!p-0' }}
      destroyOnClose={false}
      getContainer={typeof document === 'undefined' ? undefined : () => document.body}
    >
      <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-[rgba(var(--app-dark-surface-rgb),0.96)]">
        <div className="border-b border-gray-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.85)]">
          <Space size={[6, 6]} wrap>
            <Tag color="magenta">AI</Tag>
            <Tag>{context.mode === 'record' ? 'رکورد' : context.mode === 'list' ? 'لیست' : 'صفحه'}</Tag>
            {context.mode === 'list' && (context.selectedRecordIds?.length || 0) > 0 ? (
              <Tag color="blue">{Math.min(context.selectedRecordIds?.length || 0, 10).toLocaleString('fa-IR')} انتخاب‌شده</Tag>
            ) : null}
          </Space>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {loadingThread && messages.length === 0 ? (
            <div className="flex justify-center py-10">
              <Spin />
            </div>
          ) : messages.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="از دستیار درباره همین صفحه یا داده‌های مجاز سازمان بپرسید."
            />
          ) : (
            <div className="space-y-4">
              {messages.map(renderMessage)}
              {submitting ? (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Spin size="small" />
                  در حال دریافت پاسخ...
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.9)]">
          <Input.TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                void submitChat();
              }
            }}
            placeholder="سوال خود را بنویسید..."
            autoSize={{ minRows: 2, maxRows: 5 }}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={submitting}
              disabled={!input.trim()}
              onClick={submitChat}
            >
              ارسال
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
};

export default AssistantDrawer;
