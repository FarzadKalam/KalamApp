import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Avatar, Button, Empty, Input, Popconfirm, Popover, Select, Space, Spin, Tag, Tooltip } from 'antd';
import { DeleteOutlined, ReloadOutlined, SendOutlined, UserAddOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { AI_CONTEXT_EVENT, type AssistantContext } from '../../utils/aiAssistantEvents';
import AiSparkleIcon from './AiSparkleIcon';
import { AI_INSTRUCTIONS_DOCUMENT_TYPE, isAiInstructionsConfigured } from '../../utils/aiKnowledge';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { narrowProcessGuideContext } from '../../utils/processGuideContext';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import { fetchRecordReferenceLabels } from '../../utils/recordReference';
import ProfileAvatar from '../common/ProfileAvatar';
import type { RecordedVoice } from './AiVoiceRecorder';
import type { AiUploadedFilePrompt } from './AiFileUploadButton';
import AiCapabilityComposerActions, { type AiComposerCapability } from './AiCapabilityComposerActions';
import AiComposeModelBar from './AiComposeModelBar';
import type { AiMediaSettings, AiMediaSourceImage } from './AiMediaSettingsPopover';
import AiMessageAttachmentPreview from './AiMessageAttachmentPreview';
import { blobToBase64 } from '../../utils/blobBase64';
import { buildAiRecordCreationSchema, buildAiRecordModuleOptions } from '../../utils/aiRecordCreation';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
  provider?: string | null;
  model?: string | null;
};

const buildAiPendingStatusText = (capabilities: string[], fallback = 'در حال فکر کردن...') => {
  const set = new Set((capabilities || []).map((item) => String(item || '').trim()));
  if (set.has('voice_output')) return 'در حال تولید صدا...';
  if (set.has('image_generation')) return 'در حال ساخت تصویر...';
  if (set.has('document_analysis')) return 'در حال تحلیل فایل...';
  if (set.has('legal_assistant')) return 'در حال جستجو و بررسی حقوقی...';
  if (set.has('web_search')) return 'در حال جستجو...';
  if (set.has('deep_reasoning')) return 'در حال فکر کردن...';
  if (set.has('process_operation')) return 'در حال بررسی اقدام فرآیندی...';
  if (set.has('record_creation')) return 'در حال آماده‌سازی پیشنهاد ساخت...';
  return fallback;
};

interface AssistantPanelProps {
  active: boolean;
  openCreateActivityFromMessage?: (input: any) => void | Promise<void>;
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
  const parts: string[] = [];
  const totalTokens = usage?.total_tokens ?? usage?.totalTokens ?? usage?.total;
  const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? usage?.promptTokens;
  const completionTokens = usage?.completion_tokens ?? usage?.output_tokens ?? usage?.completionTokens;
  if (totalTokens) parts.push(`${Number(totalTokens).toLocaleString('fa-IR')} توکن`);
  if (!totalTokens && (promptTokens || completionTokens)) {
    parts.push(`${Number(promptTokens || 0).toLocaleString('fa-IR')} ورودی / ${Number(completionTokens || 0).toLocaleString('fa-IR')} خروجی`);
  }

  const billed = usageBox?.customer_billing?.amount_irt
    ?? usageBox?.billing?.billed_amount_irt
    ?? metadata?.customer_billing?.amount_irt
    ?? null;
  if (billed && Number(billed) > 0) parts.push(`${Math.round(Number(billed)).toLocaleString('fa-IR')} تومان`);
  return parts.join(' · ');
};

const AssistantPanel: React.FC<AssistantPanelProps> = ({ active, openCreateActivityFromMessage }) => {
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
  const [voiceSending, setVoiceSending] = useState(false);
  const [fileSending, setFileSending] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVoiceOutput, setGeneratingVoiceOutput] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatingDocument, setGeneratingDocument] = useState(false);
  const [currentUserView, setCurrentUserView] = useState({ name: 'شما', avatarUrl: null as string | null });
  const [capabilityAvailability, setCapabilityAvailability] = useState<Record<string, any>>({});
  const [selectedCapabilities, setSelectedCapabilities] = useState<AiComposerCapability[]>([]);
  const [mediaSettings, setMediaSettings] = useState<AiMediaSettings>({});
  const [mediaSourceImages, setMediaSourceImages] = useState<AiMediaSourceImage[]>([]);
  const [contextRecordLabel, setContextRecordLabel] = useState<string | null>(null);
  const [liveContext, setLiveContext] = useState<AssistantContext | null>(null);
  const [pendingProcessSelectionId, setPendingProcessSelectionId] = useState<string | null>(null);
  const [recordCreationTargetModuleId, setRecordCreationTargetModuleId] = useState<string | null>(null);
  const [processOperationMode, setProcessOperationMode] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<any | null>(null);
  const [confirmingAiAction, setConfirmingAiAction] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastAutoPromptSignatureRef = useRef<string>('');
  const modelOverrideRef = useRef<string | null>(null);

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

  useEffect(() => {
    let active = true;
    const moduleId = String(context.moduleId || '').trim();
    const recordId = String(context.recordId || '').trim();
    if (context.mode !== 'record' || !moduleId || !recordId) {
      setContextRecordLabel(null);
      return () => { active = false; };
    }
    fetchRecordReferenceLabels(supabase, [{ moduleId, recordId }])
      .then((labels) => {
        if (!active) return;
        setContextRecordLabel(String(labels[`${moduleId}:${recordId}`] || '').trim() || null);
      })
      .catch(() => {
        if (active) setContextRecordLabel(null);
      });
    return () => { active = false; };
  }, [context.mode, context.moduleId, context.recordId]);

  const contextLabel = useMemo(() => {
    if (!context.moduleId) return 'صفحه فعلی';
    const moduleTitle = MODULES[context.moduleId]?.titles?.fa || context.moduleId;
    if (context.mode === 'record' && context.recordId) return contextRecordLabel || `${moduleTitle} / رکورد فعلی`;
    if (context.mode === 'list') {
      const selectedCount = context.selectedRecordIds?.length || 0;
      const visibleCount = context.visibleRecordIds?.length || 0;
      if (selectedCount > 0) return `${moduleTitle} / ${selectedCount} رکورد انتخاب‌شده`;
      return visibleCount > 0 ? `${moduleTitle} / ${Math.min(visibleCount, 10)} رکورد صفحه` : `${moduleTitle} / لیست`;
    }
    return moduleTitle;
  }, [context, contextRecordLabel]);

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

  const fileRecordScope = useMemo(() => ({
    moduleId: contextWithSelection.mode === 'record' ? String(contextWithSelection.moduleId || '').trim() || null : null,
    recordId: contextWithSelection.mode === 'record' ? String(contextWithSelection.recordId || '').trim() || null : null,
  }), [contextWithSelection]);
  const imageMode = selectedCapabilities.includes('image_generation');
  const voiceOutputMode = selectedCapabilities.includes('voice_output');
  const videoMode = selectedCapabilities.includes('video_generation');
  const documentMode = selectedCapabilities.includes('document_generation');
  const handleComposerCapabilitiesChange = useCallback((next: AiComposerCapability[]) => {
    setSelectedCapabilities(next);
    const wantsProcessOperation = next.includes('process_operation');
    setProcessOperationMode(wantsProcessOperation);
    if (wantsProcessOperation || !next.includes('record_creation')) {
      setRecordCreationTargetModuleId(null);
    }
  }, []);
  const recordCreationModuleOptions = useMemo(() => buildAiRecordModuleOptions(), []);
  const recordCreationSchema = useMemo(
    () => recordCreationTargetModuleId ? buildAiRecordCreationSchema(recordCreationTargetModuleId) : null,
    [recordCreationTargetModuleId],
  );

  const callAssistant = useCallback(async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body });
    if (error) throw error;
    if (!data?.success) throw new Error(String(data?.message || 'درخواست دستیار ناموفق بود.'));
    return data;
  }, []);

  const loadThread = useCallback(async () => {
    if (!active) return;
    if (!threadId) {
      setMessages([]);
      return;
    }
    setLoadingThread(true);
    try {
      const data = await callAssistant({
        action: 'get_thread',
        threadId,
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
  }, [active, callAssistant, message, threadId]);

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
    setThreadId(null);
    setMessages([]);
    setPendingAiAction(null);
  }, [active, contextKey]);

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
    let mounted = true;
    const loadUserAndAiOverview = async () => {
      try {
        const bootstrap = await fetchSessionBootstrap(supabase);
        if (!mounted) return;
        setCurrentUserView({
          name: String(bootstrap?.profile?.full_name || bootstrap?.user?.email || bootstrap?.profile?.mobile_1 || 'شما').trim() || 'شما',
          avatarUrl: bootstrap?.profile?.avatar_url || null,
        });
        const overview = await callAssistant({ action: 'get_ai_overview' });
        if (mounted) setCapabilityAvailability(overview?.capabilityAvailability || {});
      } catch {
        // Sending requests will surface capability errors.
      }
    };
    void loadUserAndAiOverview();
    return () => {
      mounted = false;
    };
  }, [active, callAssistant]);

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

  const submitChat = useCallback(async (rawText?: string, inputKind = 'text') => {
    const text = String(rawText ?? input).trim();
    if (!text || submitting) return;
    if (rawText === undefined) setInput('');
    setPendingAiAction(null);
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString(), metadata: { input_kind: inputKind } };
    const thinkingMessage: ChatMessage = {
      id: `assistant-pending-${Date.now()}`,
      role: 'assistant',
      content: buildAiPendingStatusText(selectedCapabilities),
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: selectedCapabilities },
    };
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setSubmitting(true);
    try {
      const data = await callAssistant(processOperationMode ? {
        action: 'process_operation_from_prompt',
        capability: 'record_chat',
        capabilities: selectedCapabilities,
        message: text,
        inputKind,
        threadId,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        previewOnly: true,
      } : recordCreationSchema ? {
        action: 'create_record_from_prompt',
        capability: contextWithSelection.mode === 'record' ? 'record_chat' : 'dashboard_chat',
        capabilities: selectedCapabilities,
        message: text,
        inputKind,
        threadId,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        recordCreation: recordCreationSchema,
        previewOnly: true,
      } : {
        action: 'chat',
        capability: selectedCapabilities.includes('legal_assistant')
          ? 'legal_assistant'
          : selectedCapabilities.includes('deep_reasoning')
          ? 'deep_reasoning'
          : contextWithSelection.mode === 'record'
          ? 'record_chat'
          : 'dashboard_chat',
        capabilities: selectedCapabilities,
        message: text,
        inputKind,
        threadId,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
      });
      if (!data?.proposedAction && recordCreationSchema && Array.isArray(data?.createdRecords) && data.createdRecords.length > 0) {
        message.success('رکورد جدید با هوش مصنوعی ساخته شد.');
      }
      if (data?.proposedAction?.id) setPendingAiAction(data.proposedAction);
      if (data.threadId) setThreadId(String(data.threadId));
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== thinkingMessage.id),
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
        ...prev.filter((item) => item.id !== thinkingMessage.id),
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'در حال حاضر نتوانستم پاسخ را دریافت کنم. تنظیمات provider و کلید AI را بررسی کنید.',
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  }, [callAssistant, contextWithSelection, input, message, processOperationMode, recordCreationSchema, selectedCapabilities, submitting, threadId]);

  const submitVoice = useCallback(async (voice: RecordedVoice) => {
    if (voiceSending || submitting) return;
    setVoiceSending(true);
    try {
      const data = await callAssistant({
        action: 'transcribe_voice',
        audio: {
          data: await blobToBase64(voice.blob),
          mimeType: voice.mimeType,
          durationMs: voice.durationMs,
          filename: voice.filename,
        },
      });
      const transcript = String(data?.transcript || '').trim();
      if (!transcript) throw new Error('متنی از ویس دریافت نشد.');
      await submitChat(transcript, 'voice');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ارسال ویس ناموفق بود.'));
    } finally {
      setVoiceSending(false);
    }
  }, [callAssistant, message, submitChat, submitting, voiceSending]);

  const submitImagePrompt = useCallback(async () => {
    const text = input.trim();
    if (!text || generatingImage || submitting) return;
    setInput('');
    const userMessage: ChatMessage = { id: `user-image-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString(), metadata: { input_kind: 'image_prompt' } };
    const thinkingMessage: ChatMessage = {
      id: `assistant-image-pending-${Date.now()}`,
      role: 'assistant',
      content: 'در حال ساخت تصویر...',
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: ['image_generation'] },
    };
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setGeneratingImage(true);
    try {
      const data = await callAssistant({
        action: 'generate_image',
        prompt: text,
        threadId,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        settings: mediaSettings,
        sourceImages: mediaSourceImages.map((src) => ({ data: src.data, mimeType: src.mimeType, filename: src.filename })),
      });
      if (data.threadId) setThreadId(String(data.threadId));
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== thinkingMessage.id),
        {
          id: data.messageId || `assistant-image-${Date.now()}`,
          role: 'assistant',
          content: String(data.answer || '').trim() || 'تصویر آماده شد.',
          metadata: { usage: data.usage, image: data.image, capability: 'image_generation' },
          provider: data.provider || null,
          model: data.model || null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      setInput(text);
      setMessages((prev) => prev.filter((item) => item.id !== userMessage.id && item.id !== thinkingMessage.id));
      message.error(toFaErrorMessage(error, 'تولید تصویر ناموفق بود.'));
    } finally {
      setGeneratingImage(false);
    }
  }, [callAssistant, contextWithSelection, generatingImage, input, mediaSettings, mediaSourceImages, message, submitting, threadId]);

  const submitVoiceOutputPrompt = useCallback(async () => {
    const text = input.trim();
    if (!text || generatingVoiceOutput || submitting) return;
    setInput('');
    const userMessage: ChatMessage = { id: `user-voice-output-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString(), metadata: { input_kind: 'voice_output_prompt' } };
    const thinkingMessage: ChatMessage = {
      id: `assistant-voice-output-pending-${Date.now()}`,
      role: 'assistant',
      content: 'در حال تولید صدا...',
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: ['voice_output'] },
    };
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setGeneratingVoiceOutput(true);
    try {
      const data = await callAssistant({
        action: 'generate_voice_output',
        text,
        threadId,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        settings: mediaSettings,
      });
      if (data.threadId) setThreadId(String(data.threadId));
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== thinkingMessage.id),
        {
          id: data.messageId || `assistant-voice-output-${Date.now()}`,
          role: 'assistant',
          content: String(data.answer || '').trim() || 'فایل صوتی آماده شد.',
          metadata: { usage: data.usage, file: data.file, capability: 'voice_output' },
          provider: data.provider || null,
          model: data.model || null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      setInput(text);
      setMessages((prev) => prev.filter((item) => item.id !== userMessage.id && item.id !== thinkingMessage.id));
      message.error(toFaErrorMessage(error, 'تولید صدا ناموفق بود.'));
    } finally {
      setGeneratingVoiceOutput(false);
    }
  }, [callAssistant, contextWithSelection, generatingVoiceOutput, input, mediaSettings, message, submitting, threadId]);

  const submitVideoPrompt = useCallback(async () => {
    const text = input.trim();
    if (!text || generatingVideo || submitting) return;
    setInput('');
    const userMessage: ChatMessage = { id: `user-video-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString(), metadata: { input_kind: 'video_prompt' } };
    const thinkingMessage: ChatMessage = {
      id: `assistant-video-pending-${Date.now()}`,
      role: 'assistant',
      content: 'در حال ساخت ویدیو... (ممکن است چند دقیقه طول بکشد)',
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: ['video_generation'] },
    };
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setGeneratingVideo(true);
    try {
      const data = await callAssistant({
        action: 'generate_video',
        prompt: text,
        threadId,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        settings: mediaSettings,
        sourceImages: mediaSourceImages.map((src) => ({ data: src.data, mimeType: src.mimeType, filename: src.filename })),
      });
      if (data.threadId) setThreadId(String(data.threadId));
      const videoId = String(data?.videoId || '').trim();
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      let finalStatus = String(data?.status || 'processing');
      let fileResult: any = null;
      let usage: any = null;
      for (let attempt = 0; attempt < 60 && videoId; attempt += 1) {
        if (finalStatus === 'completed' || finalStatus === 'failed') break;
        await sleep(5000);
        try {
          const poll = await callAssistant({
            action: 'get_video_status',
            videoId,
            messageId: data?.messageId || null,
            threadId: data?.threadId || threadId,
            prompt: text,
            context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
          });
          finalStatus = String(poll?.status || 'processing');
          if (finalStatus === 'completed') { fileResult = poll?.file || null; usage = poll?.usage || null; break; }
          if (finalStatus === 'failed') break;
        } catch {
          // transient — keep polling
        }
      }
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== thinkingMessage.id),
        {
          id: data.messageId || `assistant-video-${Date.now()}`,
          role: 'assistant',
          content: finalStatus === 'completed' ? 'ویدیو آماده شد.' : finalStatus === 'failed' ? 'ساخت ویدیو ناموفق بود.' : 'ساخت ویدیو طول کشید؛ بعداً در همین گفتگو در دسترس خواهد بود.',
          metadata: { usage, file: fileResult, capability: 'video_generation' },
          provider: data.provider || null,
          model: data.model || null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      setInput(text);
      setMessages((prev) => prev.filter((item) => item.id !== userMessage.id && item.id !== thinkingMessage.id));
      message.error(toFaErrorMessage(error, 'تولید ویدیو ناموفق بود.'));
    } finally {
      setGeneratingVideo(false);
    }
  }, [callAssistant, contextWithSelection, generatingVideo, input, mediaSettings, mediaSourceImages, message, submitting, threadId]);

  const submitDocumentPrompt = useCallback(async () => {
    const text = input.trim();
    if (!text || generatingDocument || submitting) return;
    const format = String(mediaSettings.format || 'docx');
    setInput('');
    const userMessage: ChatMessage = { id: `user-doc-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString(), metadata: { input_kind: 'document_prompt' } };
    const thinkingMessage: ChatMessage = {
      id: `assistant-doc-pending-${Date.now()}`,
      role: 'assistant',
      content: `در حال ساخت فایل ${format.toUpperCase()}...`,
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: ['document_generation'] },
    };
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setGeneratingDocument(true);
    try {
      const data = await callAssistant({
        action: 'generate_document',
        prompt: text,
        format,
        threadId,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        settings: mediaSettings,
      });
      if (data.threadId) setThreadId(String(data.threadId));
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== thinkingMessage.id),
        {
          id: data.messageId || `assistant-doc-${Date.now()}`,
          role: 'assistant',
          content: String(data.answer || '').trim() || 'فایل آماده شد.',
          metadata: { usage: data.usage, file: data.file, capability: 'document_generation', format: data.format || format },
          provider: data.provider || null,
          model: data.model || null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      setInput(text);
      setMessages((prev) => prev.filter((item) => item.id !== userMessage.id && item.id !== thinkingMessage.id));
      message.error(toFaErrorMessage(error, 'ساخت فایل ناموفق بود.'));
    } finally {
      setGeneratingDocument(false);
    }
  }, [callAssistant, contextWithSelection, generatingDocument, input, mediaSettings, message, submitting, threadId]);

  const submitUploadedFile = useCallback(async (filePrompt: AiUploadedFilePrompt) => {
    if (fileSending || submitting) return;
    const prompt = input.trim() || 'این فایل را تحلیل کن و خلاصه، نکات مهم و اقدام‌های پیشنهادی را بگو.';
    setInput('');
    setPendingAiAction(null);
    const userMessage: ChatMessage = {
      id: `user-file-${Date.now()}`,
      role: 'user',
      content: `فایل پیوست: ${filePrompt.fileName}`,
      created_at: new Date().toISOString(),
      metadata: { input_kind: 'file' },
    };
    const fileCapabilities = selectedCapabilities.includes('document_analysis') ? selectedCapabilities : [...selectedCapabilities, 'document_analysis'];
    const thinkingMessage: ChatMessage = {
      id: `assistant-file-pending-${Date.now()}`,
      role: 'assistant',
      content: buildAiPendingStatusText(fileCapabilities, 'در حال تحلیل فایل...'),
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: fileCapabilities },
    };
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setFileSending(true);
    try {
      const data = await callAssistant(processOperationMode ? {
        action: 'process_operation_from_prompt',
        capability: 'record_chat',
        capabilities: selectedCapabilities,
        message: input.trim() || 'با توجه به این فایل، اقدام فرآیندی لازم را پیشنهاد بده.',
        inputKind: filePrompt.inputKind || 'file',
        file: {
          filename: filePrompt.fileName,
          mimeType: filePrompt.mimeType,
          size: filePrompt.size,
          text: filePrompt.inputKind === 'text' ? filePrompt.prompt : '',
          data: filePrompt.data || null,
          url: filePrompt.url || null,
          assetId: filePrompt.assetId || null,
          entryId: filePrompt.entryId || null,
          moduleId: filePrompt.moduleId || null,
          recordId: filePrompt.recordId || null,
        },
        threadId,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        previewOnly: true,
      } : recordCreationSchema ? {
        action: 'create_record_from_prompt',
        capability: contextWithSelection.mode === 'record' ? 'record_chat' : 'dashboard_chat',
        capabilities: selectedCapabilities,
        message: input.trim() || 'از اطلاعات این فایل یک رکورد جدید بساز.',
        inputKind: filePrompt.inputKind || 'file',
        file: {
          filename: filePrompt.fileName,
          mimeType: filePrompt.mimeType,
          size: filePrompt.size,
          text: filePrompt.inputKind === 'text' ? filePrompt.prompt : '',
          data: filePrompt.data || null,
          url: filePrompt.url || null,
          assetId: filePrompt.assetId || null,
          entryId: filePrompt.entryId || null,
          moduleId: filePrompt.moduleId || null,
          recordId: filePrompt.recordId || null,
        },
        threadId,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        recordCreation: recordCreationSchema,
        previewOnly: true,
      } : {
        action: 'chat_with_file',
        capabilities: selectedCapabilities,
        message: prompt,
        file: {
          filename: filePrompt.fileName,
          mimeType: filePrompt.mimeType,
          size: filePrompt.size,
          text: filePrompt.prompt,
          data: filePrompt.data || null,
          url: filePrompt.url || null,
          assetId: filePrompt.assetId || null,
          entryId: filePrompt.entryId || null,
          moduleId: filePrompt.moduleId || null,
          recordId: filePrompt.recordId || null,
        },
        threadId,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
      });
      if (!data?.proposedAction && recordCreationSchema && Array.isArray(data?.createdRecords) && data.createdRecords.length > 0) {
        message.success('رکورد جدید با هوش مصنوعی ساخته شد.');
      }
      if (data?.proposedAction?.id) setPendingAiAction(data.proposedAction);
      if (data.threadId) setThreadId(String(data.threadId));
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== thinkingMessage.id),
        {
          id: data.messageId || `assistant-file-${Date.now()}`,
          role: 'assistant',
          content: String(data.answer || '').trim() || 'تحلیل فایل آماده شد.',
          metadata: { usage: data.usage, capability: 'document_analysis' },
          provider: data.provider || null,
          model: data.model || null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      setInput(prompt);
      setMessages((prev) => prev.filter((item) => item.id !== userMessage.id && item.id !== thinkingMessage.id));
      message.error(toFaErrorMessage(error, 'ارسال فایل ناموفق بود.'));
    } finally {
      setFileSending(false);
    }
  }, [callAssistant, contextWithSelection, fileSending, input, message, processOperationMode, recordCreationSchema, selectedCapabilities, submitting, threadId]);

  const confirmPendingAiAction = useCallback(async () => {
    const actionId = String(pendingAiAction?.id || '').trim();
    if (!actionId) return;
    setConfirmingAiAction(true);
    try {
      await callAssistant({ action: 'confirm_action', actionLogId: actionId });
      message.success('اقدام تایید و اجرا شد.');
      setPendingAiAction(null);
      await loadThread();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'اجرای اقدام تاییدشده ناموفق بود.'));
    } finally {
      setConfirmingAiAction(false);
    }
  }, [callAssistant, loadThread, message, pendingAiAction]);

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
    const aiAttachment = item.metadata?.image || item.metadata?.file || (item.metadata?.image_url ? { url: item.metadata.image_url } : null);
    return (
      <div key={item.id} className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {isUser ? (
          <ProfileAvatar size={28} src={currentUserView.avatarUrl} name={currentUserView.name} icon={<UserOutlined />} />
        ) : (
          <Avatar
            size={28}
            className="!bg-[#fdf2f8] !text-[#be185d] dark:!bg-[#3b1022] dark:!text-[#f9a8d4]"
            icon={<AiSparkleIcon className="h-4 w-4" />}
          />
        )}
        <div className={`min-w-0 max-w-[82%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
          <div
            className={`whitespace-pre-wrap rounded-[1.1rem] px-2.5 py-2 text-[12px] leading-5 shadow-[0_3px_10px_rgba(15,23,42,0.08)] dark:shadow-[0_3px_10px_rgba(0,0,0,0.22)] ${
              isUser
                ? 'rounded-tr-sm bg-[rgb(var(--brand-700-rgb))] text-white dark:bg-[rgb(var(--brand-500-rgb))] dark:text-white'
                : 'rounded-tl-sm bg-[rgba(var(--brand-50-rgb),0.96)] text-[rgb(var(--brand-800-rgb))] dark:bg-[rgba(var(--app-dark-surface-rgb),0.9)] dark:text-[rgb(var(--brand-100-rgb))]'
            }`}
          >
            {item.content}
            <AiMessageAttachmentPreview attachment={aiAttachment} fallbackName={isUser ? 'فایل پیوست' : 'خروجی هوش مصنوعی'} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] leading-4 text-gray-400">
            {isUser ? <span>{currentUserView.name}</span> : null}
            {item.created_at ? <span>{toFaDateTime(item.created_at)}</span> : null}
            {!isUser && item.model ? <span>{item.model}</span> : null}
            {!isUser && usageText ? <span>{usageText}</span> : null}
            {openCreateActivityFromMessage ? (
              <Tooltip title="ایجاد فعالیت">
                <Button
                  type="text"
                  size="small"
                  className="!h-5 !px-1 !text-gray-400 hover:!text-[rgb(var(--brand-700-rgb))]"
                  icon={<UserAddOutlined />}
                  onClick={() => openCreateActivityFromMessage({
                    channel: 'assistant',
                    actorName: isUser ? 'شما' : 'دستیار هوشمند',
                    createdAt: item.created_at || null,
                    createdAtLabel: item.created_at ? toFaDateTime(item.created_at) : '',
                    content: item.content,
                    attachments: [],
                    relatedModuleId: context.mode === 'record' ? context.moduleId : null,
                    relatedRecordId: context.mode === 'record' ? context.recordId : null,
                  })}
                />
              </Tooltip>
            ) : null}
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
            <div className="truncate text-[10px] font-normal text-gray-500 dark:text-gray-400">
              گفتگو در خصوص{' '}
              {context.moduleId ? (
                <Link
                  to={context.mode === 'record' && context.recordId ? `/${context.moduleId}/${context.recordId}` : `/${context.moduleId}`}
                  className="font-semibold text-[rgb(var(--brand-700-rgb))] underline decoration-dotted underline-offset-2"
                >
                  {contextLabel}
                </Link>
              ) : (
                <span className="font-semibold">{contextLabel}</span>
              )}
            </div>
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
                    <Link to="/org-knowledge" className="font-semibold text-[rgb(var(--brand-700-rgb))] underline decoration-dotted underline-offset-2">
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
        {pendingAiAction ? (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900">
            <div className="font-medium">هوش مصنوعی یک اقدام قابل اجرا پیشنهاد داده است.</div>
            <div className="mt-1">تایید کنید یا در کادر پیام توضیح بیشتری بنویسید.</div>
            <Space size={6} className="mt-2">
              <Button type="primary" size="small" loading={confirmingAiAction} onClick={() => void confirmPendingAiAction()}>
                تایید و اجرا
              </Button>
              <Button size="small" onClick={() => setPendingAiAction(null)} disabled={confirmingAiAction}>
                فعلا نه
              </Button>
            </Space>
          </div>
        ) : null}
        <Input.TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              void (documentMode ? submitDocumentPrompt() : videoMode ? submitVideoPrompt() : voiceOutputMode ? submitVoiceOutputPrompt() : imageMode ? submitImagePrompt() : submitChat());
            }
          }}
          placeholder="سوال خود را بنویسید..."
          autoSize={{ minRows: 2, maxRows: 5 }}
          className="!text-[12px] !leading-5"
          disabled={context.intent === 'process_guide' && processGuideAvailableProcesses.length > 1 && !selectedProcessId}
        />
        <div className="mt-1">
          <AiComposeModelBar
            selectedCapabilities={selectedCapabilities}
            contextMode={context.mode}
            onModelOverrideChange={(model) => { modelOverrideRef.current = model; }}
          />
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <AiCapabilityComposerActions
            selected={selectedCapabilities}
            onChange={handleComposerCapabilitiesChange}
            capabilityAvailability={capabilityAvailability}
            loading={submitting || generatingImage || generatingVoiceOutput || generatingVideo || generatingDocument}
            moduleId={fileRecordScope.moduleId}
            recordId={fileRecordScope.recordId}
            onVoiceSend={submitVoice}
            onFilePrepared={submitUploadedFile}
            voiceLoading={voiceSending}
            fileLoading={fileSending}
            size="small"
            recordCreationModuleOptions={recordCreationModuleOptions}
            recordCreationTargetModuleId={recordCreationTargetModuleId}
            onRecordCreationTargetModuleChange={setRecordCreationTargetModuleId}
            mediaSettings={mediaSettings}
            onMediaSettingsChange={setMediaSettings}
            mediaSourceImages={mediaSourceImages}
            onMediaSourceImagesChange={setMediaSourceImages}
            onApplyPrompt={(text) => setInput((prev) => (String(prev || '').trim() ? `${prev}\n${text}` : text))}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={documentMode ? generatingDocument : videoMode ? generatingVideo : voiceOutputMode ? generatingVoiceOutput : imageMode ? generatingImage : submitting}
            disabled={!input.trim() || (context.intent === 'process_guide' && processGuideAvailableProcesses.length > 1 && !selectedProcessId)}
            onClick={() => void (documentMode ? submitDocumentPrompt() : videoMode ? submitVideoPrompt() : voiceOutputMode ? submitVoiceOutputPrompt() : imageMode ? submitImagePrompt() : submitChat())}
            size="small"
          >
            {documentMode ? 'ساخت فایل' : videoMode ? 'ساخت ویدیو' : voiceOutputMode ? 'تولید صدا' : imageMode ? 'ساخت تصویر' : processOperationMode ? 'پیشنهاد اقدام' : recordCreationSchema ? 'پیشنهاد ساخت' : 'ارسال'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AssistantPanel;
