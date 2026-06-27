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
import AiGenerationStatusCard, { type AiGenerationKind } from './AiGenerationStatusCard';
import type { AiMediaSettings, AiMediaSourceImage } from './AiMediaSettingsPopover';
import { resolveAiAttachmentUrl } from './AiMessageAttachmentPreview';
import { blobToBase64 } from '../../utils/blobBase64';
import { buildAiRecordCreationSchema, buildAiRecordModuleOptions } from '../../utils/aiRecordCreation';
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';
import MessageAttachmentGallery from '../messaging/MessageAttachmentGallery';
import { extractAiMessageAttachments, normalizeAiMessageText } from '../../utils/aiMessageParts';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: any;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
  provider?: string | null;
  model?: string | null;
};

type AiBundleInput =
  | { id: string; type: 'file' | 'image'; label: string; file: AiUploadedFilePrompt }
  | { id: string; type: 'voice'; label: string; voice: RecordedVoice };

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

const GENERATION_PENDING_KINDS = new Set<AiGenerationKind>([
  'image_generation', 'voice_output', 'video_generation', 'document_generation', 'document_analysis',
]);
const getPendingGenerationKind = (item: { metadata?: Record<string, any> | null }): AiGenerationKind | null => {
  if (!item?.metadata?.pending_status || item.metadata?.failed) return null;
  const kind = String(item.metadata?.kind || '') as AiGenerationKind;
  return GENERATION_PENDING_KINDS.has(kind) ? kind : null;
};

interface AssistantPanelProps {
  active: boolean;
  initialThreadId?: string | null;
  initialPrompt?: string | null;
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
  if (context.intent === 'process_guide' && context.moduleId) {
    const processId = context.selectedProcessId || context.selectedProcessGroupId || 'unknown';
    return `process_guide:${context.moduleId}:${context.recordId || 'page'}:${context.processFieldKey || 'process'}:${processId}`;
  }
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
    'فیلدهای عمومی فعالیت، فیلدهای اختصاصی فعالیت و وضعیت‌های اختصاصی فعالیت را اگر در context آمده‌اند با لیبل فارسی توضیح بده.',
    'برای هر مرحله بگو زمان‌بندی، موعد، شروع، پایان یا مدت انجام آن چیست، اگر داده‌ای وجود دارد.',
    'برای اتوماسیون‌ها، شرط‌های اجرای هر اتوماسیون و اکشن‌های بعد از اجرا را جدا و دقیق توضیح بده.',
    'اگر بخشی از مسئول، پیام، شرط، اکشن، موعد یا اتوماسیون در داده‌ها نامشخص است، همان ابهام را صریح بگو.',
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

const AssistantPanel: React.FC<AssistantPanelProps> = ({ active, initialThreadId, initialPrompt, openCreateActivityFromMessage }) => {
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
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVoiceOutput, setGeneratingVoiceOutput] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatingDocument, setGeneratingDocument] = useState(false);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [imageEditSourceUrl, setImageEditSourceUrl] = useState<string | null>(null);
  const [currentUserView, setCurrentUserView] = useState({ name: 'شما', avatarUrl: null as string | null });
  const [capabilityAvailability, setCapabilityAvailability] = useState<Record<string, any>>({});
  const [selectedCapabilities, setSelectedCapabilities] = useState<AiComposerCapability[]>([]);
  const [mediaSettings, setMediaSettings] = useState<AiMediaSettings>({});
  const [mediaSourceImages, setMediaSourceImages] = useState<AiMediaSourceImage[]>([]);
  const [bundleInputs, setBundleInputs] = useState<AiBundleInput[]>([]);
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
  const appliedInitialPromptRef = useRef('');
  const normalizedInitialThreadId = String(initialThreadId || '').trim() || null;

  useEffect(() => {
    if (active) return undefined;
    return scheduleOverlayLockRelease();
  }, [active]);

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
  const workflowCapabilityCount = selectedCapabilities.filter((capability) => (
    capability === 'document_analysis'
    || capability === 'record_creation'
    || capability === 'process_operation'
    || capability === 'document_generation'
  )).length;
  const shouldUseTaskBundle = bundleInputs.length > 0 || workflowCapabilityCount > 1;
  const handleComposerCapabilitiesChange = useCallback((next: AiComposerCapability[]) => {
    setSelectedCapabilities(next);
    const wantsProcessOperation = next.includes('process_operation');
    setProcessOperationMode(wantsProcessOperation);
    if (!next.includes('record_creation')) {
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
    if (!data?.success) {
      const nextError: any = new Error(String(data?.message || 'درخواست دستیار ناموفق بود.'));
      nextError.payload = data;
      throw nextError;
    }
    return data;
  }, []);

  const resolvePendingMessage = useCallback((pendingId: string, serverMsg: any) => {
    setMessages((prev) => prev.map((item) => item.id === pendingId ? {
      id: String(serverMsg?.id || pendingId),
      role: 'assistant' as const,
      content: normalizeAiMessageText(serverMsg?.content) || 'آماده شد.',
      provider: serverMsg?.provider || null,
      model: serverMsg?.model || null,
      metadata: serverMsg?.metadata || null,
      created_at: serverMsg?.created_at || new Date().toISOString(),
    } : item));
  }, []);

  const markPendingError = useCallback((pendingId: string, note: string) => {
    setMessages((prev) => prev.map((m) => m.id === pendingId
      ? { ...m, metadata: { ...(m.metadata || {}), pending_status: true, recheckable: true, failed_note: note } }
      : m));
  }, []);

  // Re-check a pending generation WITHOUT re-triggering it (poll job / reload thread).
  const recheckPending = useCallback(async (item: ChatMessage) => {
    const kind = String(item?.metadata?.kind || '') as AiGenerationKind;
    const startedAt = Number(item?.metadata?.started_at || 0);
    const currentThreadId = threadId;
    setRecheckingId(item.id);
    try {
      if (kind === 'image_generation') {
        const messageId = String(item?.metadata?.server_message_id || item?.id || '').trim();
        if (messageId && !messageId.startsWith('assistant-image-pending')) {
          const poll = await callAssistant({ action: 'get_image_status', messageId, threadId: currentThreadId });
          if (poll?.status === 'processing') {
            if (poll?.message && typeof poll.message === 'object') {
              setMessages((prev) => prev.map((m) => m.id === item.id ? {
                ...m,
                id: String(poll.message.id || m.id),
                provider: poll.message.provider || m.provider || null,
                model: poll.message.model || m.model || null,
                metadata: {
                  ...(m.metadata || {}),
                  ...(poll.message.metadata || {}),
                  pending_status: true,
                  server_message_id: poll.message.id || messageId,
                },
              } : m));
            }
            return;
          }
          if (poll?.status === 'completed' && poll?.message && typeof poll.message === 'object') {
            resolvePendingMessage(item.id, poll.message);
            return;
          }
          if (poll?.status === 'failed') {
            setMessages((prev) => prev.map((m) => m.id === item.id
              ? { ...m, content: String(poll?.message || 'ساخت تصویر ناموفق بود.'), metadata: { ...m.metadata, pending_status: false, failed: true } }
              : m));
            return;
          }
        }
      }
      if (kind === 'video_generation') {
        let videoId = String(item?.metadata?.video_id || '').trim();
        if (!videoId && currentThreadId) {
          const data = await callAssistant({ action: 'get_thread', threadId: currentThreadId });
          const msgs = Array.isArray(data?.messages) ? data.messages : [];
          const vmsg = msgs
            .filter((m: any) => m.role === 'assistant' && String(m.metadata?.capability || '') === 'video_generation')
            .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
          if (vmsg?.metadata?.file) { resolvePendingMessage(item.id, vmsg); return; }
          videoId = String(vmsg?.metadata?.video_id || '').trim();
        }
        if (videoId) {
          const poll = await callAssistant({ action: 'get_video_status', videoId, threadId: currentThreadId, prompt: item.metadata?.prompt || '', context: contextWithSelection });
          if (poll?.status === 'completed') {
            resolvePendingMessage(item.id, { content: 'ویدیو آماده شد.', metadata: { file: poll.file, usage: poll.usage, capability: 'video_generation' } });
          } else if (poll?.status === 'failed') {
            setMessages((prev) => prev.map((m) => m.id === item.id ? { ...m, content: 'ساخت ویدیو ناموفق بود.', metadata: { ...m.metadata, pending_status: false, failed: true } } : m));
          }
        }
        return;
      }
      if (!currentThreadId) return;
      const data = await callAssistant({ action: 'get_thread', threadId: currentThreadId });
      const msgs = Array.isArray(data?.messages) ? data.messages : [];
      const match = msgs
        .filter((m: any) => m.role === 'assistant'
          && !m.metadata?.pending_status
          && new Date(m.created_at || 0).getTime() >= startedAt - 3000
          && (kind === 'document_analysis' ? true : (String(m.metadata?.capability || '') === kind && (m.metadata?.image || m.metadata?.file))))
        .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
      if (match) resolvePendingMessage(item.id, match);
    } catch {
      // keep waiting
    } finally {
      setRecheckingId(null);
    }
  }, [callAssistant, contextWithSelection, resolvePendingMessage, threadId]);

  const loadThread = useCallback(async (targetThreadId?: string | null) => {
    if (!active) return;
    const requestedThreadId = String(targetThreadId || threadId || '').trim();
    if (!requestedThreadId) {
      setMessages([]);
      return;
    }
    setLoadingThread(true);
    try {
      const data = await callAssistant({
        action: 'get_thread',
        threadId: requestedThreadId,
      });
      setThreadId(data.threadId ? String(data.threadId) : null);
      const nextMessages = (Array.isArray(data.messages) ? data.messages : [])
        .filter((item: any) => item?.role === 'user' || item?.role === 'assistant')
        .map((item: any) => ({
          id: String(item.id || `${item.role}-${item.created_at}`),
          role: item.role,
          content: normalizeAiMessageText(item.content || ''),
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
    setThreadId(normalizedInitialThreadId);
    setMessages([]);
    setPendingAiAction(null);
  }, [active, contextKey, normalizedInitialThreadId]);

  useEffect(() => {
    if (!active || !normalizedInitialThreadId) return;
    void loadThread(normalizedInitialThreadId);
  }, [active, loadThread, normalizedInitialThreadId]);

  useEffect(() => {
    const prompt = String(initialPrompt || '').trim();
    if (!active || !prompt || appliedInitialPromptRef.current === prompt) return;
    appliedInitialPromptRef.current = prompt;
    setInput((current) => (String(current || '').trim() ? current : prompt));
  }, [active, initialPrompt]);

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
    const frameId = window.requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      if (typeof node.scrollTo === 'function') {
        node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
        return;
      }
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frameId);
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
    const shouldStartProcessGuideThread = contextWithSelection.intent === 'process_guide' && !threadId;
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
        threadId: shouldStartProcessGuideThread ? null : threadId,
        forceNewThread: shouldStartProcessGuideThread,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        previewOnly: true,
      } : recordCreationSchema ? {
        action: 'create_record_from_prompt',
        capability: contextWithSelection.mode === 'record' ? 'record_chat' : 'dashboard_chat',
        capabilities: selectedCapabilities,
        message: text,
        inputKind,
        threadId: shouldStartProcessGuideThread ? null : threadId,
        forceNewThread: shouldStartProcessGuideThread,
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
        threadId: shouldStartProcessGuideThread ? null : threadId,
        forceNewThread: shouldStartProcessGuideThread,
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
          content: normalizeAiMessageText(data.answer) || 'پاسخی دریافت نشد.',
          metadata: { usage: data.usage, attachments: Array.isArray(data.attachments) ? data.attachments : [] },
          provider: data.provider || null,
          model: data.model || null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      const errorText = toFaErrorMessage(error, 'ارتباط با دستیار ناموفق بود.');
      message.error(errorText);
      const payload = error?.payload && typeof error.payload === 'object' ? error.payload : null;
      const payloadThreadId = String(payload?.threadId || payload?.thread?.id || '').trim();
      const serverMessages = Array.isArray(payload?.messages) ? payload.messages as ChatMessage[] : [];
      if (payloadThreadId && serverMessages.length) {
        setThreadId(payloadThreadId);
        setMessages((prev) => [
          ...prev.filter((item) => item.id !== userMessage.id && item.id !== thinkingMessage.id),
          ...serverMessages,
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== thinkingMessage.id),
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: errorText,
          metadata: { failed: true },
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  }, [callAssistant, contextWithSelection, input, message, processOperationMode, recordCreationSchema, selectedCapabilities, submitting, threadId]);

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
      metadata: { pending_status: true, capabilities: ['image_generation'], kind: 'image_generation', started_at: Date.now(), prompt: text },
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
        sourceImageUrls: imageEditSourceUrl ? [imageEditSourceUrl] : [],
      });
      if (data.threadId) setThreadId(String(data.threadId));
      if (data?.pending) {
        const serverMessages = Array.isArray(data?.messages) ? data.messages as ChatMessage[] : [];
        if (serverMessages.length) {
          setMessages((prev) => [
            ...prev.filter((item) => item.id !== userMessage.id && item.id !== thinkingMessage.id),
            ...serverMessages.map((item) => item.id === data.messageId
              ? { ...item, metadata: { ...(item.metadata || {}), server_message_id: data.messageId } }
              : item),
          ]);
        } else {
          setMessages((prev) => prev.map((item) => {
            if (item.id === userMessage.id) return { ...item, id: data.userMessageId || item.id };
            if (item.id === thinkingMessage.id) {
              return {
                ...item,
                id: data.messageId || item.id,
                provider: data.provider || null,
                model: data.model || null,
                metadata: { ...(item.metadata || {}), server_message_id: data.messageId || null },
              };
            }
            return item;
          }));
        }
        return;
      }
      const newImageUrl = data?.image ? resolveAiAttachmentUrl(data.image) : '';
      if (newImageUrl) setImageEditSourceUrl(newImageUrl);
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== thinkingMessage.id),
        {
          id: data.messageId || `assistant-image-${Date.now()}`,
          role: 'assistant',
          content: normalizeAiMessageText(data.answer) || 'تصویر آماده شد.',
          metadata: { usage: data.usage, image: data.image, capability: 'image_generation' },
          provider: data.provider || null,
          model: data.model || null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      markPendingError(thinkingMessage.id, toFaErrorMessage(error, 'ارتباط قطع شد؛ در حال بررسی وضعیت ساخت…'));
    } finally {
      setGeneratingImage(false);
    }
  }, [callAssistant, contextWithSelection, generatingImage, imageEditSourceUrl, input, markPendingError, mediaSettings, mediaSourceImages, message, submitting, threadId]);

  const handleEditImage = useCallback((url: string) => {
    const clean = String(url || '').trim();
    if (!clean) return;
    setImageEditSourceUrl(clean);
    setSelectedCapabilities((prev) => prev.includes('image_generation') ? prev : [...prev, 'image_generation']);
    message.info('این تصویر مبنای اصلاح شد؛ تغییر موردنظر را بنویسید و «ساخت تصویر» را بزنید.');
  }, [message]);

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
      metadata: { pending_status: true, capabilities: ['voice_output'], kind: 'voice_output', started_at: Date.now(), prompt: text },
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
          content: normalizeAiMessageText(data.answer) || 'فایل صوتی آماده شد.',
          metadata: { usage: data.usage, file: data.file, capability: 'voice_output' },
          provider: data.provider || null,
          model: data.model || null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      markPendingError(thinkingMessage.id, toFaErrorMessage(error, 'ارتباط قطع شد؛ در حال بررسی وضعیت تولید صدا…'));
    } finally {
      setGeneratingVoiceOutput(false);
    }
  }, [callAssistant, contextWithSelection, generatingVoiceOutput, input, markPendingError, mediaSettings, message, submitting, threadId]);

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
      metadata: { pending_status: true, capabilities: ['video_generation'], kind: 'video_generation', started_at: Date.now(), prompt: text },
    };
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setGeneratingVideo(true);
    try {
      // Create the async job, then hand off to the pending card's auto-poll.
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
      setMessages((prev) => prev.map((item) => item.id === thinkingMessage.id
        ? { ...item, metadata: { ...(item.metadata || {}), video_id: videoId, server_message_id: data?.messageId || null } }
        : item));
    } catch (error: any) {
      markPendingError(thinkingMessage.id, toFaErrorMessage(error, 'ارتباط قطع شد؛ در حال بررسی وضعیت ساخت ویدیو…'));
    } finally {
      setGeneratingVideo(false);
    }
  }, [callAssistant, contextWithSelection, generatingVideo, input, markPendingError, mediaSettings, mediaSourceImages, message, submitting, threadId]);

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
      metadata: { pending_status: true, capabilities: ['document_generation'], kind: 'document_generation', started_at: Date.now(), prompt: text },
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
          content: normalizeAiMessageText(data.answer) || 'فایل آماده شد.',
          metadata: { usage: data.usage, file: data.file, capability: 'document_generation', format: data.format || format },
          provider: data.provider || null,
          model: data.model || null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      markPendingError(thinkingMessage.id, toFaErrorMessage(error, 'ارتباط قطع شد؛ در حال بررسی وضعیت ساخت فایل…'));
    } finally {
      setGeneratingDocument(false);
    }
  }, [callAssistant, contextWithSelection, generatingDocument, input, markPendingError, mediaSettings, message, submitting, threadId]);

  const queueUploadedFile = useCallback(async (filePrompt: AiUploadedFilePrompt) => {
    const mimeType = String(filePrompt.mimeType || '').toLowerCase();
    setBundleInputs((prev) => [
      ...prev,
      {
        id: `file-${Date.now()}-${prev.length}`,
        type: mimeType.startsWith('image/') ? 'image' : 'file',
        label: filePrompt.fileName || 'فایل پیوست',
        file: filePrompt,
      },
    ]);
  }, []);

  const queueVoiceInput = useCallback(async (voice: RecordedVoice) => {
    setBundleInputs((prev) => [
      ...prev,
      {
        id: `voice-${Date.now()}-${prev.length}`,
        type: 'voice',
        label: `ویس ${Math.max(1, Math.round(Number(voice.durationMs || 0) / 1000)).toLocaleString('fa-IR')} ثانیه`,
        voice,
      },
    ]);
  }, []);

  const removeBundleInput = useCallback((id: string) => {
    setBundleInputs((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const submitTaskBundle = useCallback(async () => {
    const prompt = input.trim();
    if (submitting || (!prompt && bundleInputs.length === 0)) return;
    const effectiveCapabilities = bundleInputs.some((item) => item.type === 'file' || item.type === 'image')
      && !selectedCapabilities.includes('document_analysis')
      ? [...selectedCapabilities, 'document_analysis' as AiComposerCapability]
      : selectedCapabilities;
    setInput('');
    setPendingAiAction(null);
    const bundleSummary = bundleInputs.map((item) => {
      if (item.type === 'voice') return `ویس: ${item.label}`;
      return `${item.type === 'image' ? 'تصویر' : 'فایل'}: ${item.label}`;
    });
    const userMessage: ChatMessage = {
      id: `user-bundle-${Date.now()}`,
      role: 'user',
      content: [prompt, ...bundleSummary].filter(Boolean).join('\n') || 'ورودی‌های پیوست‌شده',
      created_at: new Date().toISOString(),
      metadata: {
        input_kind: 'task_bundle',
        bundle_inputs: bundleInputs.map((item) => item.type === 'voice'
          ? { type: item.type, label: item.label, durationMs: item.voice.durationMs, mimeType: item.voice.mimeType }
          : {
            type: item.type,
            label: item.label,
            name: item.file.fileName,
            filename: item.file.fileName,
            mimeType: item.file.mimeType,
            size: item.file.size,
            url: item.file.url || null,
            data: item.file.data || null,
            assetId: item.file.assetId || null,
            entryId: item.file.entryId || null,
            moduleId: item.file.moduleId || null,
            recordId: item.file.recordId || null,
          }),
      },
    };
    const thinkingMessage: ChatMessage = {
      id: `assistant-bundle-pending-${Date.now()}`,
      role: 'assistant',
      content: buildAiPendingStatusText(effectiveCapabilities, 'در حال پردازش ورودی‌ها...'),
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: effectiveCapabilities, kind: 'document_analysis', started_at: Date.now() },
    };
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setSubmitting(true);
    try {
      const inputs = await Promise.all(bundleInputs.map(async (item) => {
        if (item.type === 'voice') {
          return {
            id: item.id,
            type: 'voice',
            label: item.label,
            audio: {
              data: await blobToBase64(item.voice.blob),
              mimeType: item.voice.mimeType,
              durationMs: item.voice.durationMs,
              filename: item.voice.filename,
            },
          };
        }
        return {
          id: item.id,
          type: item.type,
          label: item.label,
          file: {
            filename: item.file.fileName,
            mimeType: item.file.mimeType,
            size: item.file.size,
            text: item.file.inputKind === 'text' ? item.file.prompt : '',
            data: item.file.data || null,
            url: item.file.url || null,
            assetId: item.file.assetId || null,
            entryId: item.file.entryId || null,
            moduleId: item.file.moduleId || null,
            recordId: item.file.recordId || null,
          },
        };
      }));
      const data = await callAssistant({
        action: 'run_task_bundle',
        capabilities: effectiveCapabilities,
        message: prompt || (recordCreationSchema ? 'از ورودی‌های پیوست‌شده یک رکورد جدید بساز.' : processOperationMode ? 'با توجه به ورودی‌های پیوست‌شده، اقدام لازم را پیشنهاد بده.' : 'ورودی‌های پیوست‌شده را تحلیل کن.'),
        inputKind: 'task_bundle',
        bundle: { inputs },
        threadId,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        recordCreation: recordCreationSchema,
        previewOnly: true,
      });
      if (!data?.proposedAction && recordCreationSchema && Array.isArray(data?.createdRecords) && data.createdRecords.length > 0) {
        message.success('رکورد جدید با هوش مصنوعی ساخته شد.');
      }
      if (data?.proposedAction?.id) setPendingAiAction(data.proposedAction);
      if (data.threadId) setThreadId(String(data.threadId));
      const serverMessages = Array.isArray(data?.messages) ? data.messages as ChatMessage[] : [];
      if (serverMessages.length) {
        setMessages(serverMessages);
      } else {
        setMessages((prev) => [
          ...prev.filter((item) => item.id !== thinkingMessage.id),
          {
            id: data.messageId || `assistant-bundle-${Date.now()}`,
            role: 'assistant',
            content: normalizeAiMessageText(data.answer) || 'نتیجه آماده شد.',
            metadata: { usage: data.usage, capability: recordCreationSchema ? 'record_creation' : processOperationMode ? 'process_operation' : 'document_analysis' },
            provider: data.provider || null,
            model: data.model || null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setBundleInputs([]);
    } catch (error: any) {
      setInput(prompt);
      setMessages((prev) => prev.filter((item) => item.id !== userMessage.id && item.id !== thinkingMessage.id));
      message.error(toFaErrorMessage(error, 'اجرای باندل هوش مصنوعی ناموفق بود.'));
    } finally {
      setSubmitting(false);
    }
  }, [bundleInputs, callAssistant, contextWithSelection, input, message, processOperationMode, recordCreationSchema, selectedCapabilities, submitting, threadId]);

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
    const messageText = normalizeAiMessageText(item.content);
    const attachments = extractAiMessageAttachments(item);
    const pendingKind = getPendingGenerationKind(item);
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
        <div className={`min-w-0 max-w-[86%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
          {pendingKind ? (
            <AiGenerationStatusCard
              kind={pendingKind}
              startedAtMs={Number(item.metadata?.started_at) || Date.now()}
              checking={recheckingId === item.id}
              failedNote={item.metadata?.failed_note || null}
              onRecheck={() => recheckPending(item)}
              onDismiss={() => setMessages((prev) => prev.filter((m) => m.id !== item.id))}
            />
          ) : (
          <div
            className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12px] leading-6 shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.24)] ${
              isUser
                ? 'rounded-tr-md bg-[rgb(var(--brand-600-rgb))] text-white dark:bg-[rgb(var(--brand-500-rgb))] dark:text-white'
                : 'rounded-tl-md border border-slate-200/70 bg-white text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.055] dark:text-slate-100'
            }`}
          >
            {messageText}
            <MessageAttachmentGallery attachments={attachments} />
            {!isUser && attachments.length === 1 && String(attachments[0]?.fileType || '').trim() === 'image' && String(attachments[0]?.url || '').trim() ? (
              <div className="mt-2 flex justify-end">
                <Button size="small" type="primary" ghost onClick={() => handleEditImage(String(attachments[0]?.url || ''))}>
                  اصلاح این تصویر
                </Button>
              </div>
            ) : null}
          </div>
          )}
          <div className={`mt-1 flex flex-wrap items-center gap-1 text-[9px] leading-4 ${isUser ? 'text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-200-rgb))]' : 'text-gray-400'}`}>
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
                    content: messageText,
                    attachments,
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
    <div className="flex h-full min-h-0 flex-col bg-slate-100 text-slate-800 dark:bg-[#101113] dark:text-slate-100">
      <div className="border-b border-slate-200/65 bg-white/92 px-3 py-2.5 backdrop-blur dark:border-white/[0.07] dark:bg-[#17191c]/95">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[13px] font-bold">هوش مصنوعی تازه سیستم</div>
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
          {context.mode === 'list' && (context.selectedRecordIds?.length || 0) > 0 ? (
            <Tag color="blue">{Math.min(context.selectedRecordIds?.length || 0, 10).toLocaleString('fa-IR')} انتخاب‌شده</Tag>
          ) : null}
        </Space>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(241,245,249,0.82))] px-3 py-3 dark:bg-none dark:bg-[#101113]">
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
          <div className="space-y-3">
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

      <div className="max-h-[48vh] shrink-0 overflow-y-auto border-t border-slate-200/65 bg-white/95 px-3 py-2.5 dark:border-white/[0.07] dark:bg-[#17191c]">
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
        {imageEditSourceUrl ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.7)] p-1.5 ps-2 text-[11px] text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
            <img src={imageEditSourceUrl} alt="مبنای اصلاح" className="h-8 w-8 rounded object-cover" />
            <span className="flex-1">در حال اصلاح روی این تصویر</span>
            <Button type="text" size="small" onClick={() => setImageEditSourceUrl(null)}>شروع از نو</Button>
          </div>
        ) : null}
        {bundleInputs.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {bundleInputs.map((item) => (
              <div
                key={item.id}
                className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/90 px-2.5 py-1.5 text-[11px] text-slate-600 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.045] dark:text-slate-200"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--brand-100-rgb),0.88)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-600-rgb),0.18)] dark:text-[rgb(var(--brand-200-rgb))]">
                  {item.type === 'voice' ? 'ویس' : item.type === 'image' ? 'عکس' : 'فایل'}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[220px] truncate font-semibold">{item.label}</span>
                  <span className="block text-[10px] text-slate-400">
                    {item.type === 'voice'
                      ? `${Math.max(1, Math.round(Number(item.voice.durationMs || 0) / 1000)).toLocaleString('fa-IR')} ثانیه`
                      : `${Math.max(1, Math.round(Number(item.file.size || 0) / 1024)).toLocaleString('fa-IR')} کیلوبایت`}
                  </span>
                </span>
                {submitting ? <Spin size="small" /> : (
                  <Button type="text" size="small" onClick={() => removeBundleInput(item.id)}>
                    حذف
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : null}
        <Input.TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              void (shouldUseTaskBundle ? submitTaskBundle() : documentMode ? submitDocumentPrompt() : videoMode ? submitVideoPrompt() : voiceOutputMode ? submitVoiceOutputPrompt() : imageMode ? submitImagePrompt() : submitChat());
            }
          }}
          placeholder="سوال خود را بنویسید..."
          autoSize={{ minRows: 1, maxRows: 3 }}
          className="!rounded-2xl !border-slate-200/70 !bg-slate-50/85 !px-3 !py-2 !text-[12px] !leading-6 !shadow-none dark:!border-white/[0.08] dark:!bg-white/[0.045]"
          disabled={context.intent === 'process_guide' && processGuideAvailableProcesses.length > 1 && !selectedProcessId}
        />
        <div className="mt-1">
          <AiComposeModelBar
            selectedCapabilities={selectedCapabilities}
            onModelOverrideChange={(model) => { modelOverrideRef.current = model; }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <AiCapabilityComposerActions
            selected={selectedCapabilities}
            onChange={handleComposerCapabilitiesChange}
            capabilityAvailability={capabilityAvailability}
            loading={submitting || generatingImage || generatingVoiceOutput || generatingVideo || generatingDocument}
            moduleId={fileRecordScope.moduleId}
            recordId={fileRecordScope.recordId}
            onVoiceSend={queueVoiceInput}
            onFilePrepared={queueUploadedFile}
            voiceLoading={submitting}
            fileLoading={submitting}
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
            className="shrink-0"
            loading={shouldUseTaskBundle ? submitting : documentMode ? generatingDocument : videoMode ? generatingVideo : voiceOutputMode ? generatingVoiceOutput : imageMode ? generatingImage : submitting}
            disabled={(!input.trim() && bundleInputs.length === 0) || (context.intent === 'process_guide' && processGuideAvailableProcesses.length > 1 && !selectedProcessId)}
            onClick={() => void (shouldUseTaskBundle ? submitTaskBundle() : documentMode ? submitDocumentPrompt() : videoMode ? submitVideoPrompt() : voiceOutputMode ? submitVoiceOutputPrompt() : imageMode ? submitImagePrompt() : submitChat())}
            size="small"
          >
            {shouldUseTaskBundle ? 'اجرای باندل' : documentMode ? 'ساخت فایل' : videoMode ? 'ساخت ویدیو' : voiceOutputMode ? 'تولید صدا' : imageMode ? 'ساخت تصویر' : processOperationMode ? 'پیشنهاد اقدام' : recordCreationSchema ? 'پیشنهاد ساخت' : 'ارسال'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AssistantPanel;
