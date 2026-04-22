import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Avatar, Button, Empty, Input, Popconfirm, Popover, Select, Space, Spin, Tag, Tooltip } from 'antd';
import { DeleteOutlined, ReloadOutlined, SendOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { AI_CONTEXT_EVENT, type AssistantContext } from '../../utils/aiAssistantEvents';
import AiSparkleIcon from './AiSparkleIcon';
import { AI_INSTRUCTIONS_DOCUMENT_TYPE, isAiInstructionsConfigured } from '../../utils/aiKnowledge';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { narrowProcessGuideContext } from '../../utils/processGuideContext';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
  provider?: string | null;
  model?: string | null;
};

interface AssistantPanelProps {
  active: boolean;
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

const buildProcessGuidePrompt = (context: AssistantContext) => {
  const processLabel = Array.isArray(context.availableProcesses)
    ? context.availableProcesses.find((item) => String(item?.id || '') === String(context.selectedProcessId || ''))?.label
    : null;
  const processTitle = String(processLabel || 'این فرآیند').trim() || 'این فرآیند';
  return [
    `این ${processTitle} را برای آموزش کارکنان توضیح بده.`,
    'اول یک نمای کلی کوتاه بده.',
    'بعد مرحله به مرحله توضیح بده هر مرحله چه کاری است.',
    'برای هر مرحله مشخص کن پیش‌نویس است یا فعالیت واقعی دارد؛ اگر فعالیت واقعی دارد وضعیت فعلی آن را هم بگو.',
    'اگر فعالیت واقعی به نقش/تیم ارجاع شده و هنوز شخص مشخص ندارد، این موضوع را صریح بگو.',
    'برای هر مرحله بگو اگر انجام شود چه پیام، اعلان یا اقدام خودکاری رخ می‌دهد و برای چه کسی.',
    'اگر بخشی از مسئول، پیام یا اتوماسیون در داده‌ها نامشخص است، همان ابهام را صریح بگو.',
  ].join('\n');
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

const AssistantPanel: React.FC<AssistantPanelProps> = ({ active }) => {
  const { message } = App.useApp();
  const location = useLocation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [deletingThread, setDeletingThread] = useState(false);
  const [aiKnowledgeConfigured, setAiKnowledgeConfigured] = useState(true);
  const [checkingAiKnowledge, setCheckingAiKnowledge] = useState(false);
  const [liveContext, setLiveContext] = useState<AssistantContext | null>(null);
  const [pendingProcessSelectionId, setPendingProcessSelectionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastAutoPromptSignatureRef = useRef<string>('');

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
        intent: detail.intent || undefined,
        processFieldKey: detail.processFieldKey || null,
        selectedProcessId: detail.selectedProcessId || null,
        selectedProcessGroupId: detail.selectedProcessGroupId || null,
        processGuideContext: detail.processGuideContext || null,
        availableProcesses: Array.isArray(detail.availableProcesses) ? detail.availableProcesses : [],
      });
    };
    window.addEventListener(AI_CONTEXT_EVENT, handleContextUpdate as EventListener);
    return () => window.removeEventListener(AI_CONTEXT_EVENT, handleContextUpdate as EventListener);
  }, []);

  const context = useMemo(() => {
    const routeContext = parseRouteContext(location.pathname, location.search);
    const sameRouteContext = !!liveContext
      && liveContext.moduleId === routeContext.moduleId
      && String(liveContext.recordId || '') === String(routeContext.recordId || '');
    if (
      routeContext.mode === 'list'
      && liveContext?.mode === 'list'
      && liveContext.moduleId === routeContext.moduleId
    ) {
      return {
        ...routeContext,
        visibleRecordIds: liveContext.visibleRecordIds || [],
        selectedRecordIds: liveContext.selectedRecordIds || [],
        intent: liveContext.intent,
        processFieldKey: liveContext.processFieldKey || null,
        selectedProcessId: liveContext.selectedProcessId || null,
        selectedProcessGroupId: liveContext.selectedProcessGroupId || null,
        processGuideContext: liveContext.processGuideContext || null,
        availableProcesses: Array.isArray(liveContext.availableProcesses) ? liveContext.availableProcesses : [],
      };
    }
    if (sameRouteContext && liveContext?.intent === 'process_guide') {
      return {
        ...routeContext,
        intent: liveContext.intent,
        processFieldKey: liveContext.processFieldKey || null,
        selectedProcessId: liveContext.selectedProcessId || null,
        selectedProcessGroupId: liveContext.selectedProcessGroupId || null,
        processGuideContext: liveContext.processGuideContext || null,
        availableProcesses: Array.isArray(liveContext.availableProcesses) ? liveContext.availableProcesses : [],
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

  const processGuideAvailableProcesses = useMemo(
    () => Array.isArray(context.availableProcesses) ? context.availableProcesses : [],
    [context.availableProcesses]
  );

  const selectedProcessId = useMemo(
    () => String(
      context.selectedProcessId
      || context.selectedProcessGroupId
      || pendingProcessSelectionId
      || ''
    ).trim() || null,
    [context.selectedProcessGroupId, context.selectedProcessId, pendingProcessSelectionId]
  );

  const resolvedProcessGuideContext = useMemo(() => {
    if (context.intent !== 'process_guide') return null;
    return narrowProcessGuideContext(context.processGuideContext || null, selectedProcessId);
  }, [context.intent, context.processGuideContext, selectedProcessId]);

  const contextWithSelection = useMemo<AssistantContext>(() => {
    if (context.intent !== 'process_guide') return context;
    return {
      ...context,
      selectedProcessId,
      selectedProcessGroupId: selectedProcessId,
      processGuideContext: resolvedProcessGuideContext,
    };
  }, [context, resolvedProcessGuideContext, selectedProcessId]);

  const callAssistant = useCallback(async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body });
    if (error) throw error;
    if (!data?.success) throw new Error(String(data?.message || 'درخواست دستیار ناموفق بود.'));
    return data;
  }, []);

  const loadThread = useCallback(async () => {
    if (!active) return;
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
      message.error(toFaErrorMessage(error, 'خواندن تاریخچه چت ناموفق بود.'));
    } finally {
      setLoadingThread(false);
    }
  }, [active, callAssistant, context, message]);

  const loadAiKnowledgeStatus = useCallback(async () => {
    setCheckingAiKnowledge(true);
    try {
      const { data, error } = await supabase
        .from('org_documents')
        .select('id, body, document_type, status, updated_at')
        .eq('document_type', AI_INSTRUCTIONS_DOCUMENT_TYPE)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      setAiKnowledgeConfigured(isAiInstructionsConfigured(row?.body || ''));
    } catch {
      setAiKnowledgeConfigured(true);
    } finally {
      setCheckingAiKnowledge(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadThread();
  }, [active, contextKey, loadThread]);

  useEffect(() => {
    if (context.intent !== 'process_guide') {
      setPendingProcessSelectionId(null);
      return;
    }
    const nextSelectedId = String(context.selectedProcessId || context.selectedProcessGroupId || '').trim() || null;
    if (nextSelectedId) {
      setPendingProcessSelectionId(nextSelectedId);
      return;
    }
    if (processGuideAvailableProcesses.length === 1) {
      setPendingProcessSelectionId(processGuideAvailableProcesses[0].id);
      return;
    }
    setPendingProcessSelectionId(null);
  }, [context.intent, context.selectedProcessGroupId, context.selectedProcessId, processGuideAvailableProcesses]);

  useEffect(() => {
    if (!active) return;
    void loadAiKnowledgeStatus();
  }, [active, loadAiKnowledgeStatus]);

  useEffect(() => {
    if (!active) return;
    window.requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    });
  }, [active, messages, submitting]);

  useEffect(() => {
    if (!active || loadingThread || submitting || context.intent !== 'process_guide') return;
    const availableCount = processGuideAvailableProcesses.length;
    if (availableCount > 1 && !selectedProcessId) return;
    const scopedContext = contextWithSelection;
    if (!scopedContext.processGuideContext) return;
    const prompt = buildProcessGuidePrompt(scopedContext);
    const signature = JSON.stringify({
      contextKey,
      fieldKey: scopedContext.processFieldKey || null,
      selectedProcessId: scopedContext.selectedProcessId || null,
      processGuideContext: scopedContext.processGuideContext || null,
    });
    if (lastAutoPromptSignatureRef.current === signature) return;
    lastAutoPromptSignatureRef.current = signature;
    setInput((current) => String(current || '').trim() ? current : prompt);
  }, [active, context.intent, contextKey, contextWithSelection, loadingThread, processGuideAvailableProcesses.length, selectedProcessId, submitting]);

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
        context: contextWithSelection,
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
      message.error(toFaErrorMessage(error, 'ارتباط با دستیار ناموفق بود.'));
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
  }, [callAssistant, contextWithSelection, input, message, submitting, threadId]);

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
      message.error(toFaErrorMessage(error, 'پاک کردن چت ناموفق بود.'));
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
          size={28}
          className={isUser ? '' : '!bg-[#fdf2f8] !text-[#be185d] dark:!bg-[#3b1022] dark:!text-[#f9a8d4]'}
          icon={isUser ? <UserOutlined /> : <AiSparkleIcon className="h-4 w-4" />}
        />
        <div className={`min-w-0 max-w-[82%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
          <div
            className={`whitespace-pre-wrap rounded-[1.1rem] px-2.5 py-2 text-[12px] leading-5 shadow-[0_3px_10px_rgba(15,23,42,0.08)] dark:shadow-[0_3px_10px_rgba(0,0,0,0.22)] ${
              isUser
                ? 'rounded-tr-sm bg-[rgb(var(--brand-700-rgb))] text-white dark:bg-[rgb(var(--brand-500-rgb))] dark:text-white'
                : 'rounded-tl-sm bg-[rgba(var(--brand-50-rgb),0.96)] text-[rgb(var(--brand-800-rgb))] dark:bg-[rgba(var(--app-dark-surface-rgb),0.9)] dark:text-[rgb(var(--brand-100-rgb))]'
            }`}
          >
            {item.content}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] leading-4 text-gray-400">
            {item.created_at ? <span>{toFaDateTime(item.created_at)}</span> : null}
            {!isUser && item.model ? <span>{item.model}</span> : null}
            {!isUser && usageText ? <span>{usageText}</span> : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-[rgba(var(--app-dark-surface-rgb),0.96)]">
      <div className="border-b border-gray-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.85)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[13px] font-bold">دستیار هوشمند</div>
            <div className="truncate text-[10px] font-normal text-gray-500 dark:text-gray-400">{contextLabel}</div>
          </div>
          <Space size={4}>
            {!checkingAiKnowledge && !aiKnowledgeConfigured ? (
              <Popover
                trigger="click"
                placement="bottomRight"
                getPopupContainer={() => document.body}
                content={(
                  <div style={{ width: 'min(88vw, 280px)' }} className="text-xs leading-6 text-gray-600 dark:text-gray-300">
                    برای بازخورد موثرتر در استفاده هوش مصنوعی، ابتدا{' '}
                    <Link to="/settings?tab=ai_knowledge" className="font-semibold text-[rgb(var(--brand-700-rgb))] underline decoration-dotted underline-offset-2">
                      دانش سازمان
                    </Link>{' '}
                    را تکمیل کنید
                  </div>
                )}
              >
                <Button type="text" size="small" danger icon={<WarningOutlined />} aria-label="هشدار تکمیل دانش سازمان" />
              </Popover>
            ) : null}
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
        </div>
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
        {context.intent === 'process_guide' ? (
          <div className="mb-3">
            <Alert
              type="warning"
              showIcon
              message="راهنمای هوشمند فرآیند"
              description={processGuideAvailableProcesses.length > 1 && !selectedProcessId
                ? 'برای تولید راهنمای دقیق، اول فرآیند موردنظر را انتخاب کنید.'
                : 'شما در حال ارسال درخواست خلاصه‌سازی فرآیند به هوش مصنوعی هستید؛ این اقدام ممکن است توکن زیادی از شارژ هوش مصنوعی شما را بسوزاند.'}
            />
            {processGuideAvailableProcesses.length > 1 ? (
              <div className="mt-2">
                <Select
                  value={selectedProcessId || undefined}
                  onChange={(value) => setPendingProcessSelectionId(String(value || '').trim() || null)}
                  placeholder="انتخاب فرآیند"
                  className="w-full"
                  options={processGuideAvailableProcesses.map((process) => ({
                    label: `${process.label}${process.stageCount ? ` · ${Number(process.stageCount).toLocaleString('fa-IR')} مرحله` : ''}`,
                    value: process.id,
                  }))}
                />
              </div>
            ) : null}
          </div>
        ) : null}
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
          className="!text-[12px] !leading-5"
          disabled={context.intent === 'process_guide' && processGuideAvailableProcesses.length > 1 && !selectedProcessId}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={submitting}
            disabled={!input.trim() || (context.intent === 'process_guide' && processGuideAvailableProcesses.length > 1 && !selectedProcessId)}
            onClick={submitChat}
            size="small"
          >
            ارسال
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AssistantPanel;
