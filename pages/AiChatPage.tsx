import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Avatar,
  Button,
  Drawer,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  SearchOutlined,
  SendOutlined,
  ShareAltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { loadProfilesWithCompat } from '../utils/profileDirectory';
import ProfileAvatar from '../components/common/ProfileAvatar';
import AiSparkleIcon from '../components/ai/AiSparkleIcon';
import type { RecordedVoice } from '../components/ai/AiVoiceRecorder';
import type { AiUploadedFilePrompt } from '../components/ai/AiFileUploadButton';
import AiCapabilityComposerActions, { type AiComposerCapability } from '../components/ai/AiCapabilityComposerActions';
import AiComposeModelBar from '../components/ai/AiComposeModelBar';
import AiGenerationStatusCard, { type AiGenerationKind } from '../components/ai/AiGenerationStatusCard';
import type { AiMediaSettings, AiMediaSourceImage } from '../components/ai/AiMediaSettingsPopover';
import AiMessageAttachmentPreview, { resolveAiAttachmentUrl } from '../components/ai/AiMessageAttachmentPreview';
import { blobToBase64 } from '../utils/blobBase64';
import { buildAiRecordCreationSchema, buildAiRecordModuleOptions } from '../utils/aiRecordCreation';

const AiChatSurfacePrototype = React.lazy(() => import('../components/ai/AiChatSurfacePrototype'));

type AiThread = {
  id: string;
  title?: string | null;
  context_type?: string | null;
  context_key?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  archived_at?: string | null;
  is_shared?: boolean | null;
  is_owner?: boolean | null;
  owner_user_id?: string | null;
  shared_user_ids?: string[] | null;
  shared_role_ids?: string[] | null;
  module_id?: string | null;
  record_id?: string | null;
  metadata?: Record<string, any> | null;
};

type AiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  created_at?: string | null;
  model?: string | null;
  provider?: string | null;
  metadata?: Record<string, any> | null;
};

type CurrentUserView = {
  id: string | null;
  name: string;
  avatarUrl: string | null;
};

type DirectoryOption = {
  label: string;
  value: string;
};

type SubmitMediaOptions = {
  mediaSettings?: AiMediaSettings;
  mediaSourceImages?: AiMediaSourceImage[];
};

const THREAD_SELECT_LIMIT = 80;
const IMAGE_GENERATION_CLIENT_TIMEOUT_MS = 70000;

const GENERATION_PENDING_KINDS = new Set<AiGenerationKind>([
  'image_generation', 'voice_output', 'video_generation', 'document_generation', 'document_analysis',
]);
const getPendingGenerationKind = (item: { metadata?: Record<string, any> | null }): AiGenerationKind | null => {
  if (!item?.metadata?.pending_status || item.metadata?.failed) return null;
  const kind = String(item.metadata?.kind || '') as AiGenerationKind;
  return GENERATION_PENDING_KINDS.has(kind) ? kind : null;
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

const withClientTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const formatThreadDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
};

const formatMessageTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const formatCostFa = (msg: AiMessage): string | null => {
  const billed = msg.metadata?.usage?.customer_billing?.amount_irt
    ?? msg.metadata?.usage?.billing?.billed_amount_irt
    ?? msg.metadata?.customer_billing?.amount_irt
    ?? null;
  if (billed == null || Number(billed) <= 0) return null;
  return `${Math.round(Number(billed)).toLocaleString('fa-IR')} تومان`;
};

const normalizeIdArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

const getModuleTitleFa = (moduleId?: string | null) => {
  const key = String(moduleId || '').trim();
  if (!key) return '';
  return MODULES[key]?.titles?.fa || key;
};

const getThreadContextLabel = (thread?: AiThread | null) => {
  if (!thread) return 'گفتگوی جدید';
  const metadata = thread.metadata || {};
  const storedLabel = String(metadata.context_label || '').trim();
  if (storedLabel) return storedLabel;
  const moduleTitle = getModuleTitleFa(thread.module_id || metadata.module_id);
  const kind = String(metadata.context_kind || thread.context_type || '').trim();
  if (kind === 'process_guide') return moduleTitle ? `راهنمای فرآیند ${moduleTitle}` : 'راهنمای فرآیند';
  if (kind === 'record') return moduleTitle ? `رکورد ${moduleTitle}` : 'رکورد';
  if (kind === 'module_page' || kind === 'list') return moduleTitle ? `صفحه ${moduleTitle}` : 'صفحه ماژول';
  if (moduleTitle) return moduleTitle;
  return 'گفتگوی عمومی';
};

const getThreadStoredContext = (thread?: AiThread | null): Record<string, any> | null => {
  const context = thread?.metadata?.context;
  if (context && typeof context === 'object') return context;
  if (thread?.context_type === 'record' && thread.module_id) {
    return {
      mode: 'record',
      moduleId: thread.module_id,
      recordId: thread.record_id || null,
    };
  }
  if (thread?.module_id) {
    return {
      mode: thread.context_type === 'module_page' ? 'list' : 'page',
      moduleId: thread.module_id,
      recordId: null,
    };
  }
  return null;
};

const getRecordScopeFromContext = (context?: Record<string, any> | null) => {
  const moduleId = String(context?.moduleId || '').trim();
  const recordId = String(context?.recordId || '').trim();
  return moduleId && recordId ? { moduleId, recordId } : { moduleId: null, recordId: null };
};

const isHiddenAssistantThread = (thread?: AiThread | null) => {
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

const AiChatPageRuntime: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const routeStateAtMount = (location.state || {}) as any;
  const hasInitialForcedRequest = Boolean(
    routeStateAtMount.forceNewThread !== false
    && (routeStateAtMount.aiInitialFile || String(routeStateAtMount.aiInitialPrompt || '').trim())
  );
  const autoPromptHandledRef = useRef(false);
  const [threads, setThreads] = useState<AiThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [input, setInput] = useState('');
  const [threadSearch, setThreadSearch] = useState('');
  const [renameTitle, setRenameTitle] = useState('');
  const [shareUserIds, setShareUserIds] = useState<string[]>([]);
  const [shareRoleIds, setShareRoleIds] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<DirectoryOption[]>([]);
  const [roleOptions, setRoleOptions] = useState<DirectoryOption[]>([]);
  const [recordCreationTargetModuleId, setRecordCreationTargetModuleId] = useState<string | null>(null);
  const [mediaSettings, setMediaSettings] = useState<AiMediaSettings>({});
  const [mediaSourceImages, setMediaSourceImages] = useState<AiMediaSourceImage[]>([]);
  const [processOperationMode, setProcessOperationMode] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<any | null>(null);
  const [confirmingAiAction, setConfirmingAiAction] = useState(false);
  const [currentUserView, setCurrentUserView] = useState<CurrentUserView>({ id: null, name: 'شما', avatarUrl: null });
  const [voiceSending, setVoiceSending] = useState(false);
  const [fileSending, setFileSending] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVoiceOutput, setGeneratingVoiceOutput] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatingDocument, setGeneratingDocument] = useState(false);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [imageEditSourceUrl, setImageEditSourceUrl] = useState<string | null>(null);
  const modelOverrideRef = useRef<string | null>(null);
  const [threadDrawerOpen, setThreadDrawerOpen] = useState(false);
  const [capabilityAvailability, setCapabilityAvailability] = useState<Record<string, any>>({});
  const [selectedCapabilities, setSelectedCapabilities] = useState<AiComposerCapability[]>([]);
  const [chatContext, setChatContext] = useState<Record<string, any>>({ mode: 'dashboard', source: 'ai_chat_page' });
  const skipNextThreadMessageLoadRef = useRef<string | null>(null);
  const creatingForcedThreadRef = useRef(hasInitialForcedRequest);
  const protectedActiveThreadIdRef = useRef<string | null>(null);
  const visibleMessagesRef = useRef<AiMessage[]>([]);

  const activeThread = useMemo(
    () => threads.find((thread) => String(thread.id) === String(activeThreadId)) || null,
    [threads, activeThreadId]
  );
  const isActiveOwner = activeThread ? activeThread.is_owner !== false : true;
  const recordCreationModuleOptions = useMemo(() => buildAiRecordModuleOptions(), []);
  const recordCreationSchema = useMemo(
    () => recordCreationTargetModuleId ? buildAiRecordCreationSchema(recordCreationTargetModuleId) : null,
    [recordCreationTargetModuleId],
  );

  useEffect(() => {
    visibleMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!activeThread) return;
    if (creatingForcedThreadRef.current) return;
    const storedContext = getThreadStoredContext(activeThread);
    if (storedContext) {
      setChatContext({ ...storedContext, source: 'ai_chat_page' });
    }
  }, [activeThread]);

  const invokeAi = useCallback(async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body });
    if (error) throw error;
    if ((data as any)?.error) throw new Error(String((data as any).error));
    if ((data as any)?.success === false) {
      const nextError: any = new Error(String((data as any)?.message || 'درخواست هوش مصنوعی ناموفق بود.'));
      nextError.payload = data;
      throw nextError;
    }
    return data as any;
  }, []);

  const loadThreads = useCallback(async (preferredThreadId?: string | null) => {
    setThreadLoading(true);
    try {
      const data = await invokeAi({ action: 'list_threads', limit: THREAD_SELECT_LIMIT });
      const nextThreads = (Array.isArray(data?.threads) ? data.threads as AiThread[] : [])
        .filter((thread) => !isHiddenAssistantThread(thread));
      setThreads(nextThreads);
      const preferred = preferredThreadId
        ? nextThreads.find((thread) => String(thread.id) === String(preferredThreadId))
        : null;
      // Honor preferredThreadId when provided (even if not yet in list due to timing).
      // Use a functional update so a thread selected by an in-flight send (e.g. a
      // forceNewThread message coming from the dashboard chat box) is NOT clobbered
      // by this list refresh resolving later with a stale activeThreadId closure.
      let resolvedActive: string | null = null;
      setActiveThreadId((current) => {
        if (preferred?.id) { resolvedActive = preferred.id; return preferred.id; }
        if (preferredThreadId) { resolvedActive = preferredThreadId; return preferredThreadId; }
        if (protectedActiveThreadIdRef.current) { resolvedActive = protectedActiveThreadIdRef.current; return protectedActiveThreadIdRef.current; }
        if (creatingForcedThreadRef.current) { resolvedActive = current; return current; }
        if (current) { resolvedActive = current; return current; }
        resolvedActive = nextThreads[0]?.id || null;
        return resolvedActive;
      });
      if (!resolvedActive && !creatingForcedThreadRef.current) setMessages([]);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت تاریخچه گفتگوها ناموفق بود'));
      // Don't clear the thread list on a transient error — preserve what the user sees
    } finally {
      setThreadLoading(false);
    }
  }, [invokeAi, message]);

  const mergeThreadMessages = useCallback((serverMessages: AiMessage[]) => {
    setMessages((prev) => {
      const pending = prev.filter((item) => String(item.id || '').startsWith('pending-'));
      const serverKeys = new Set(serverMessages.map((item) => `${item.role}:${String(item.content || '').trim()}`));
      const unresolvedPending = pending.filter((item) => {
        const pendingKey = `${item.role}:${String(item.content || '').trim()}`;
        if (serverKeys.has(pendingKey)) return false;
        const pendingTime = new Date(item.created_at || 0).getTime();
        const hasFreshServerReplacement = serverMessages.some((serverItem) => {
          if (String(serverItem.role || '') !== String(item.role || '')) return false;
          const serverTime = new Date(serverItem.created_at || 0).getTime();
          return Number.isFinite(pendingTime)
            && Number.isFinite(serverTime)
            && pendingTime > 0
            && serverTime >= pendingTime - 1500;
        });
        return !hasFreshServerReplacement;
      });
      return [...serverMessages, ...unresolvedPending].sort((a, b) =>
        String(a.created_at || '').localeCompare(String(b.created_at || ''))
      );
    });
  }, []);

  const loadThreadMessages = useCallback(async (threadId: string | null) => {
    if (!threadId) {
      if (
        creatingForcedThreadRef.current
        || protectedActiveThreadIdRef.current
        || visibleMessagesRef.current.some((item) => item.metadata?.pending_status)
      ) {
        return;
      }
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    try {
      const data = await invokeAi({ action: 'get_thread', threadId });
      const thread = data?.thread as AiThread | undefined;
      mergeThreadMessages(Array.isArray(data?.messages) ? data.messages as AiMessage[] : []);
      if (thread?.id) {
        setThreads((prev) =>
          prev.map((item) => String(item.id) === String(thread.id) ? { ...item, ...thread } : item)
        );
      }
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت پیام‌های گفتگو ناموفق بود'));
      // Preserve the visible chat on transient get_thread failures. Clearing here
      // makes a valid newly-created thread look empty until the user reselects it.
    } finally {
      setMessagesLoading(false);
    }
  }, [invokeAi, mergeThreadMessages, message]);

  // Replace a still-pending generation card with the finished server message.
  const resolvePendingMessage = useCallback((pendingId: string, serverMsg: any) => {
    setMessages((prev) => prev.map((item) => item.id === pendingId ? {
      id: String(serverMsg?.id || pendingId),
      role: 'assistant',
      content: String(serverMsg?.content || '').trim() || 'آماده شد.',
      provider: serverMsg?.provider || null,
      model: serverMsg?.model || null,
      metadata: serverMsg?.metadata || null,
      created_at: serverMsg?.created_at || new Date().toISOString(),
    } : item));
  }, []);

  // On a request error/timeout, KEEP the pending card (so auto-poll/recheck can
  // still pick up a result the server produced) instead of removing it.
  const markPendingError = useCallback((pendingId: string, note: string) => {
    setMessages((prev) => prev.map((m) => m.id === pendingId
      ? { ...m, metadata: { ...(m.metadata || {}), pending_status: true, recheckable: true, failed_note: note } }
      : m));
  }, []);

  const recoverRecentImageThread = useCallback(async (prompt: string) => {
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) return null;
    const data = await invokeAi({ action: 'list_threads', limit: 12 });
    const candidates = Array.isArray(data?.threads) ? data.threads : [];
    for (const thread of candidates) {
      const threadId = String(thread?.id || '').trim();
      if (!threadId) continue;
      const threadData = await invokeAi({ action: 'get_thread', threadId });
      const serverMessages = Array.isArray(threadData?.messages) ? threadData.messages as AiMessage[] : [];
      const hasPrompt = serverMessages.some((item) =>
        item.role === 'user'
        && String(item.content || '').trim() === normalizedPrompt
        && String(item.metadata?.input_kind || '') === 'image_prompt'
      );
      if (hasPrompt) {
        return {
          threadId,
          messages: serverMessages,
          thread: threadData?.thread || thread,
        };
      }
    }
    return null;
  }, [invokeAi]);

  const activateGenerationThread = useCallback(async (
    threadId: string,
    fallbackMessages?: AiMessage[],
  ) => {
    const normalizedThreadId = String(threadId || '').trim();
    if (!normalizedThreadId) return;
    creatingForcedThreadRef.current = false;
    protectedActiveThreadIdRef.current = normalizedThreadId;
    skipNextThreadMessageLoadRef.current = normalizedThreadId;
    setActiveThreadId(normalizedThreadId);
    if (Array.isArray(fallbackMessages)) {
      mergeThreadMessages(fallbackMessages);
    } else {
      const data = await invokeAi({ action: 'get_thread', threadId: normalizedThreadId });
      mergeThreadMessages(Array.isArray(data?.messages) ? data.messages as AiMessage[] : []);
      if (data?.thread?.id) {
        setThreads((prev) =>
          prev.map((item) => String(item.id) === String(data.thread.id) ? { ...item, ...data.thread } : item)
        );
      }
    }
    void loadThreads(normalizedThreadId);
  }, [invokeAi, loadThreads, mergeThreadMessages]);

  // Re-check a pending generation/analysis WITHOUT re-triggering it: poll the job
  // (video) or reload the thread and adopt the result the server already produced.
  // This fixes the "error toast, then the message shows up a few seconds later".
  const recheckPending = useCallback(async (item: AiMessage) => {
    const kind = String(item?.metadata?.kind || '') as AiGenerationKind;
    const startedAt = Number(item?.metadata?.started_at || 0);
    const threadId = activeThreadId;
    setRecheckingId(item.id);
    try {
      if (kind === 'image_generation') {
        const messageId = String(item?.metadata?.server_message_id || item?.id || '').trim();
        if (messageId && !messageId.startsWith('pending-')) {
          const poll = await invokeAi({ action: 'get_image_status', messageId, threadId });
          if (poll?.message && typeof poll.message === 'object') {
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
        if (!videoId && threadId) {
          const data = await invokeAi({ action: 'get_thread', threadId });
          const msgs = Array.isArray(data?.messages) ? data.messages : [];
          const vmsg = msgs
            .filter((m: any) => m.role === 'assistant' && String(m.metadata?.capability || '') === 'video_generation')
            .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
          if (vmsg?.metadata?.file) { resolvePendingMessage(item.id, vmsg); return; }
          videoId = String(vmsg?.metadata?.video_id || '').trim();
        }
        if (videoId) {
          const poll = await invokeAi({ action: 'get_video_status', videoId, threadId, prompt: item.metadata?.prompt || '', context: chatContext });
          if (poll?.status === 'completed') {
            resolvePendingMessage(item.id, { content: 'ویدیو آماده شد.', metadata: { file: poll.file, usage: poll.usage, capability: 'video_generation' } });
          } else if (poll?.status === 'failed') {
            setMessages((prev) => prev.map((m) => m.id === item.id
              ? { ...m, content: 'ساخت ویدیو ناموفق بود.', metadata: { ...m.metadata, pending_status: false, failed: true } }
              : m));
          }
        }
        return;
      }
      if (!threadId) return;
      const data = await invokeAi({ action: 'get_thread', threadId });
      const msgs = Array.isArray(data?.messages) ? data.messages : [];
      const match = msgs
        .filter((m: any) => m.role === 'assistant'
          && !m.metadata?.pending_status
          && new Date(m.created_at || 0).getTime() >= startedAt - 3000
          && (kind === 'document_analysis'
            ? true // analysis output is text; adopt the next real assistant reply
            : (String(m.metadata?.capability || '') === kind && (m.metadata?.image || m.metadata?.file))))
        .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
      if (match) resolvePendingMessage(item.id, match);
    } catch {
      // Stay in the pending state and let the next poll/recheck try again.
    } finally {
      setRecheckingId(null);
    }
  }, [activeThreadId, chatContext, invokeAi, resolvePendingMessage]);

  useEffect(() => {
    void loadThreads();
  }, []);

  useEffect(() => {
    let active = true;
    const loadUser = async () => {
      try {
        const bootstrap = await fetchSessionBootstrap(supabase);
        if (!active) return;
        setCurrentUserView({
          id: bootstrap?.user?.id || null,
          name: String(bootstrap?.profile?.full_name || bootstrap?.user?.email || bootstrap?.profile?.mobile_1 || 'شما').trim() || 'شما',
          avatarUrl: bootstrap?.profile?.avatar_url || null,
        });
        const data = await invokeAi({ action: 'get_ai_overview' });
        if (!active) return;
        setCapabilityAvailability(data?.capabilityAvailability || {});
      } catch {
        // Overview is an enhancement for controls; chat errors are handled on send.
      }
    };
    void loadUser();
    return () => {
      active = false;
    };
  }, [invokeAi]);

  useEffect(() => {
    if (creatingForcedThreadRef.current) return;
    if (activeThreadId && skipNextThreadMessageLoadRef.current === activeThreadId) {
      skipNextThreadMessageLoadRef.current = null;
      return;
    }
    void loadThreadMessages(activeThreadId);
  }, [activeThreadId, loadThreadMessages]);

  useEffect(() => {
    if (creatingForcedThreadRef.current) return;
    setGeneratingImage(false);
    setGeneratingVoiceOutput(false);
    setGeneratingVideo(false);
    setGeneratingDocument(false);
  }, [activeThreadId]);

  useEffect(() => {
    const incomingContext = (location.state as any)?.assistantContext;
    if (incomingContext && typeof incomingContext === 'object') {
      setChatContext({ ...incomingContext, source: 'ai_chat_page' });
    }
  }, [location.state]);

  const submitMessage = useCallback(async (
    rawText?: string,
    forceNewThread = false,
    inputKind = 'text',
    contextOverride?: Record<string, any>,
    options?: { capabilities?: AiComposerCapability[]; processOperationMode?: boolean; recordCreationSchema?: any },
  ) => {
    const text = String(rawText ?? input).trim();
    if (!text || sending) return;
    if (activeThread && !isActiveOwner) {
      message.warning('این گفتگو توسط همکار شما به اشتراک گذاشته شده و فقط قابل مشاهده است.');
      return;
    }
    const effectiveCapabilities = options?.capabilities || selectedCapabilities;
    const effectiveProcessOperationMode = options?.processOperationMode ?? processOperationMode;
    const effectiveRecordCreationSchema = options?.recordCreationSchema ?? recordCreationSchema;

    const optimistic: AiMessage = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    const thinking: AiMessage = {
      id: `pending-assistant-${Date.now()}`,
      role: 'assistant',
      content: buildAiPendingStatusText(effectiveCapabilities),
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: effectiveCapabilities },
    };
    const protectsPendingThread = forceNewThread || !activeThreadId;
    if (protectsPendingThread) {
      creatingForcedThreadRef.current = true;
      protectedActiveThreadIdRef.current = null;
    }
    setInput('');
    setPendingAiAction(null);
    setMessages((prev) => [...prev, optimistic, thinking]);
    setSending(true);
    try {
      const effectiveContext = contextOverride || chatContext;
      const data = await invokeAi(effectiveProcessOperationMode ? {
        action: 'process_operation_from_prompt',
        capability: 'record_chat',
        capabilities: effectiveCapabilities,
        message: text,
        inputKind,
        threadId: forceNewThread ? null : activeThreadId,
        forceNewThread,
        context: effectiveContext,
        modelOverride: modelOverrideRef.current,
        previewOnly: true,
      } : effectiveRecordCreationSchema ? {
        action: 'create_record_from_prompt',
        capability: effectiveContext?.mode === 'record' ? 'record_chat' : 'dashboard_chat',
        capabilities: effectiveCapabilities,
        message: text,
        inputKind,
        threadId: forceNewThread ? null : activeThreadId,
        forceNewThread,
        context: effectiveContext,
        modelOverride: modelOverrideRef.current,
        recordCreation: effectiveRecordCreationSchema,
        previewOnly: true,
      } : {
        action: 'chat',
        capability: effectiveCapabilities.includes('legal_assistant')
          ? 'legal_assistant'
          : effectiveCapabilities.includes('deep_reasoning')
          ? 'deep_reasoning'
          : effectiveContext?.mode === 'record'
          ? 'record_chat'
          : 'dashboard_chat',
        capabilities: effectiveCapabilities,
        message: text,
        inputKind,
        threadId: forceNewThread ? null : activeThreadId,
        forceNewThread,
        context: effectiveContext,
        modelOverride: modelOverrideRef.current,
      });
      if (!data?.proposedAction && effectiveRecordCreationSchema && Array.isArray(data?.createdRecords) && data.createdRecords.length > 0) {
        message.success('رکورد جدید با هوش مصنوعی ساخته شد.');
      }
      if (data?.proposedAction?.id) setPendingAiAction(data.proposedAction);
      const nextThreadId = String(data?.thread?.id || data?.threadId || activeThreadId || '').trim() || null;
      if (nextThreadId) {
        creatingForcedThreadRef.current = false;
        protectedActiveThreadIdRef.current = nextThreadId;
        skipNextThreadMessageLoadRef.current = nextThreadId;
        setActiveThreadId(nextThreadId);
        setMessages((prev) => {
          const withoutThinking = prev.filter((item) => item.id !== thinking.id);
          const withRealUser = withoutThinking.map((item) =>
            item.id === optimistic.id
              ? { ...item, id: data.userMessageId || item.id }
              : item
          );
          return [
            ...withRealUser,
            {
              id: data.messageId || `assistant-${Date.now()}`,
              role: 'assistant',
              content: String(data.answer || '').trim() || 'پاسخ آماده شد.',
              provider: data.provider || null,
              model: data.model || null,
              metadata: {
                usage: data.usage || null,
                capability: data.capability || null,
                knowledgeSources: data.knowledgeSources || [],
              },
              created_at: new Date().toISOString(),
            },
          ];
        });
        void loadThreads(nextThreadId);
      }
    } catch (error: any) {
      const errorText = toFaErrorMessage(error, 'ارسال پیام به هوش مصنوعی ناموفق بود');
      const payload = error?.payload && typeof error.payload === 'object' ? error.payload : null;
      const payloadThreadId = String(payload?.threadId || payload?.thread?.id || '').trim();
      const serverMessages = Array.isArray(payload?.messages) ? payload.messages as AiMessage[] : [];
      if (payloadThreadId && serverMessages.length) {
        creatingForcedThreadRef.current = false;
        protectedActiveThreadIdRef.current = payloadThreadId;
        skipNextThreadMessageLoadRef.current = payloadThreadId;
        setActiveThreadId(payloadThreadId);
        setMessages((prev) => [
          ...prev.filter((item) => item.id !== optimistic.id && item.id !== thinking.id),
          ...serverMessages,
        ]);
        void loadThreads(payloadThreadId);
        setInput(text);
        message.error(errorText);
        return;
      }
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== thinking.id),
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: errorText,
          created_at: new Date().toISOString(),
          metadata: { failed: true, capability: effectiveProcessOperationMode ? 'process_operation' : effectiveRecordCreationSchema ? 'record_creation' : 'chat' },
        },
      ]);
      setInput(text);
      message.error(errorText);
    } finally {
      if (protectsPendingThread) creatingForcedThreadRef.current = false;
      setSending(false);
    }
  }, [activeThread, activeThreadId, chatContext, input, invokeAi, isActiveOwner, loadThreadMessages, loadThreads, message, processOperationMode, recordCreationSchema, selectedCapabilities, sending]);

  useEffect(() => {
    if (autoPromptHandledRef.current) return;
    const params = new URLSearchParams(location.search);
    const prompt = String(params.get('prompt') || '').trim();
    if (!prompt) return;
    autoPromptHandledRef.current = true;
    void submitMessage(prompt, true);
    navigate('/ai', { replace: true });
  }, [location.search, navigate, submitMessage]);

  const submitVoice = useCallback(async (voice: RecordedVoice) => {
    if (voiceSending || sending) return;
    setVoiceSending(true);
    try {
      const transcriptData = await invokeAi({
        action: 'transcribe_voice',
        audio: {
          data: await blobToBase64(voice.blob),
          mimeType: voice.mimeType,
          durationMs: voice.durationMs,
          filename: voice.filename,
        },
      });
      const transcript = String(transcriptData?.transcript || '').trim();
      if (!transcript) throw new Error('متنی از ویس دریافت نشد.');
      await submitMessage(transcript, false, 'voice');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ارسال ویس به هوش مصنوعی ناموفق بود'));
    } finally {
      setVoiceSending(false);
    }
  }, [invokeAi, message, sending, submitMessage, voiceSending]);

  const submitImagePrompt = useCallback(async (
    rawText?: string,
    forceNewThread = false,
    contextOverride?: Record<string, any>,
    options?: SubmitMediaOptions,
  ) => {
    const text = String(rawText ?? input).trim();
    if (!text || generatingImage || sending) return;
    if (activeThread && !isActiveOwner) {
      message.warning('این گفتگو توسط همکار شما به اشتراک گذاشته شده و فقط قابل مشاهده است.');
      return;
    }
    const optimistic: AiMessage = {
      id: `pending-image-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      metadata: { input_kind: 'image_prompt' },
    };
    const thinking: AiMessage = {
      id: `pending-assistant-image-${Date.now()}`,
      role: 'assistant',
      content: 'در حال ساخت تصویر...',
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: ['image_generation'], kind: 'image_generation', started_at: Date.now(), prompt: text },
    };
    const protectsPendingThread = forceNewThread || !activeThreadId;
    if (protectsPendingThread) {
      creatingForcedThreadRef.current = true;
      protectedActiveThreadIdRef.current = null;
    }
    setInput('');
    setMessages((prev) => [...prev, optimistic, thinking]);
    setGeneratingImage(true);
    const effectiveSettings = options?.mediaSettings || mediaSettings;
    const effectiveSourceImages = options?.mediaSourceImages || mediaSourceImages;
    try {
      const data = await withClientTimeout(invokeAi({
        action: 'generate_image',
        prompt: text,
        threadId: forceNewThread ? null : activeThreadId,
        forceNewThread,
        context: contextOverride || chatContext,
        modelOverride: modelOverrideRef.current,
        settings: effectiveSettings,
        sourceImages: effectiveSourceImages.map((src) => ({ data: src.data, mimeType: src.mimeType, filename: src.filename })),
        sourceImageUrls: imageEditSourceUrl ? [imageEditSourceUrl] : [],
      }), IMAGE_GENERATION_CLIENT_TIMEOUT_MS, 'زمان انتظار ساخت تصویر تمام شد.');
      const nextThreadId = String(data?.threadId || activeThreadId || '').trim() || null;
      if (data?.pending) {
        const serverMessages = Array.isArray(data?.messages) ? data.messages as AiMessage[] : [];
        if (nextThreadId) {
          creatingForcedThreadRef.current = false;
          protectedActiveThreadIdRef.current = nextThreadId;
          skipNextThreadMessageLoadRef.current = nextThreadId;
          setActiveThreadId(nextThreadId);
        }
        if (serverMessages.length) {
          setMessages((prev) => [
            ...prev.filter((item) => item.id !== optimistic.id && item.id !== thinking.id),
            ...serverMessages.map((item) => item.id === data.messageId
              ? { ...item, metadata: { ...(item.metadata || {}), server_message_id: data.messageId } }
              : item),
          ]);
        } else {
          setMessages((prev) => prev.map((item) => {
            if (item.id === optimistic.id) return { ...item, id: data.userMessageId || item.id };
            if (item.id === thinking.id) {
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
        if (nextThreadId) void loadThreads(nextThreadId);
        return;
      }
      // Continue editing: the new output becomes the source for the next refinement.
      const newImageUrl = data?.image ? resolveAiAttachmentUrl(data.image) : '';
      if (newImageUrl) setImageEditSourceUrl(newImageUrl);
      if (nextThreadId) {
        creatingForcedThreadRef.current = false;
        protectedActiveThreadIdRef.current = nextThreadId;
        skipNextThreadMessageLoadRef.current = nextThreadId;
        setActiveThreadId(nextThreadId);
        setMessages((prev) => [
          ...prev
            .filter((item) => item.id !== thinking.id)
            .map((item) => item.id === optimistic.id ? { ...item, id: data.userMessageId || item.id } : item),
          {
            id: data.messageId || `assistant-image-${Date.now()}`,
            role: 'assistant',
            content: String(data.answer || '').trim() || 'تصویر آماده شد.',
            provider: data.provider || null,
            model: data.model || null,
            metadata: {
              usage: data.usage || null,
              image: data.image || null,
              capability: 'image_generation',
            },
            created_at: new Date().toISOString(),
          },
        ]);
        void loadThreads(nextThreadId);
      }
    } catch (error: any) {
      // Keep the pending card; the server may still finish. Re-check resolves it.
      const payload = error?.payload && typeof error.payload === 'object' ? error.payload : null;
      const payloadThreadId = String(payload?.threadId || '').trim();
      try {
        if (payloadThreadId) {
          const threadData = await invokeAi({ action: 'get_thread', threadId: payloadThreadId });
          await activateGenerationThread(
            payloadThreadId,
            Array.isArray(threadData?.messages) ? threadData.messages as AiMessage[] : undefined,
          );
        } else if (forceNewThread) {
          const recovered = await recoverRecentImageThread(text);
          if (recovered?.threadId) {
            await activateGenerationThread(recovered.threadId, recovered.messages);
          }
        }
      } catch {
        // If recovery fails, keep the visible pending card and let manual recheck handle it.
      } finally {
        creatingForcedThreadRef.current = false;
      }
      markPendingError(thinking.id, toFaErrorMessage(error, 'ارتباط قطع شد؛ وضعیت همین گفتگوی تصویر حفظ شد. دوباره تلاش کنید یا نتیجه را بررسی کنید.'));
    } finally {
      if (protectsPendingThread) creatingForcedThreadRef.current = false;
      setGeneratingImage(false);
    }
  }, [activeThread, activeThreadId, activateGenerationThread, chatContext, generatingImage, imageEditSourceUrl, input, invokeAi, isActiveOwner, loadThreads, markPendingError, mediaSettings, mediaSourceImages, message, recoverRecentImageThread, sending]);

  const handleEditImage = useCallback((url: string) => {
    const clean = String(url || '').trim();
    if (!clean) return;
    setImageEditSourceUrl(clean);
    setSelectedCapabilities((prev) => prev.includes('image_generation') ? prev : [...prev, 'image_generation']);
    message.info('این تصویر به‌عنوان مبنای اصلاح انتخاب شد؛ تغییر موردنظر را بنویسید و «ساخت تصویر» را بزنید.');
  }, [message]);

  const submitVoiceOutputPrompt = useCallback(async (
    rawText?: string,
    forceNewThread = false,
    contextOverride?: Record<string, any>,
    options?: SubmitMediaOptions,
  ) => {
    const text = String(rawText ?? input).trim();
    if (!text || generatingVoiceOutput || sending) return;
    if (activeThread && !isActiveOwner) {
      message.warning('این گفتگو توسط همکار شما به اشتراک گذاشته شده و فقط قابل مشاهده است.');
      return;
    }
    const optimistic: AiMessage = {
      id: `pending-voice-output-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      metadata: { input_kind: 'voice_output_prompt' },
    };
    const thinking: AiMessage = {
      id: `pending-assistant-voice-output-${Date.now()}`,
      role: 'assistant',
      content: 'در حال تولید صدا...',
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: ['voice_output'], kind: 'voice_output', started_at: Date.now(), prompt: text },
    };
    const protectsPendingThread = forceNewThread || !activeThreadId;
    if (protectsPendingThread) {
      creatingForcedThreadRef.current = true;
      protectedActiveThreadIdRef.current = null;
    }
    setInput('');
    setMessages((prev) => [...prev, optimistic, thinking]);
    setGeneratingVoiceOutput(true);
    const effectiveSettings = options?.mediaSettings || mediaSettings;
    try {
      const data = await invokeAi({
        action: 'generate_voice_output',
        text,
        threadId: forceNewThread ? null : activeThreadId,
        forceNewThread,
        context: contextOverride || chatContext,
        modelOverride: modelOverrideRef.current,
        settings: effectiveSettings,
      });
      const nextThreadId = String(data?.threadId || activeThreadId || '').trim() || null;
      if (nextThreadId) {
        creatingForcedThreadRef.current = false;
        protectedActiveThreadIdRef.current = nextThreadId;
        skipNextThreadMessageLoadRef.current = nextThreadId;
        setActiveThreadId(nextThreadId);
        setMessages((prev) => [
          ...prev
            .filter((item) => item.id !== thinking.id)
            .map((item) => item.id === optimistic.id ? { ...item, id: data.userMessageId || item.id } : item),
          {
            id: data.messageId || `assistant-voice-output-${Date.now()}`,
            role: 'assistant',
            content: String(data.answer || '').trim() || 'فایل صوتی آماده شد.',
            provider: data.provider || null,
            model: data.model || null,
            metadata: {
              usage: data.usage || null,
              file: data.file || null,
              capability: 'voice_output',
            },
            created_at: new Date().toISOString(),
          },
        ]);
        void loadThreads(nextThreadId);
      }
    } catch (error: any) {
      markPendingError(thinking.id, toFaErrorMessage(error, 'ارتباط قطع شد؛ در حال بررسی وضعیت تولید صدا…'));
    } finally {
      if (protectsPendingThread) creatingForcedThreadRef.current = false;
      setGeneratingVoiceOutput(false);
    }
  }, [activeThread, activeThreadId, chatContext, generatingVoiceOutput, input, invokeAi, isActiveOwner, loadThreads, markPendingError, mediaSettings, message, sending]);

  const submitVideoPrompt = useCallback(async (
    rawText?: string,
    forceNewThread = false,
    contextOverride?: Record<string, any>,
    options?: SubmitMediaOptions,
  ) => {
    const text = String(rawText ?? input).trim();
    if (!text || generatingVideo || sending) return;
    if (activeThread && !isActiveOwner) {
      message.warning('این گفتگو توسط همکار شما به اشتراک گذاشته شده و فقط قابل مشاهده است.');
      return;
    }
    const optimistic: AiMessage = {
      id: `pending-video-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      metadata: { input_kind: 'video_prompt' },
    };
    const thinkingId = `pending-assistant-video-${Date.now()}`;
    const thinking: AiMessage = {
      id: thinkingId,
      role: 'assistant',
      content: 'در حال ساخت ویدیو... (ممکن است چند دقیقه طول بکشد)',
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: ['video_generation'], kind: 'video_generation', started_at: Date.now(), prompt: text },
    };
    const protectsPendingThread = forceNewThread || !activeThreadId;
    if (protectsPendingThread) {
      creatingForcedThreadRef.current = true;
      protectedActiveThreadIdRef.current = null;
    }
    setInput('');
    setMessages((prev) => [...prev, optimistic, thinking]);
    setGeneratingVideo(true);
    const effectiveContext = contextOverride || chatContext;
    const effectiveSettings = options?.mediaSettings || mediaSettings;
    const effectiveSourceImages = options?.mediaSourceImages || mediaSourceImages;
    try {
      // Create the async job, then hand off to the pending card's auto-poll
      // (recheckPending → get_video_status), so the UI isn't blocked for minutes.
      const data = await invokeAi({
        action: 'generate_video',
        prompt: text,
        threadId: forceNewThread ? null : activeThreadId,
        forceNewThread,
        context: effectiveContext,
        modelOverride: modelOverrideRef.current,
        settings: effectiveSettings,
        sourceImages: effectiveSourceImages.map((src) => ({ data: src.data, mimeType: src.mimeType, filename: src.filename })),
      });
      const nextThreadId = String(data?.threadId || activeThreadId || '').trim() || null;
      if (nextThreadId) {
        creatingForcedThreadRef.current = false;
        protectedActiveThreadIdRef.current = nextThreadId;
        skipNextThreadMessageLoadRef.current = nextThreadId;
        setActiveThreadId(nextThreadId);
      }
      const videoId = String(data?.videoId || '').trim();
      setMessages((prev) => prev
        .map((item) => item.id === optimistic.id ? { ...item, id: data?.userMessageId || item.id } : item)
        .map((item) => item.id === thinkingId
          ? { ...item, metadata: { ...(item.metadata || {}), video_id: videoId, server_message_id: data?.messageId || null } }
          : item));
    } catch (error: any) {
      markPendingError(thinkingId, toFaErrorMessage(error, 'ارتباط قطع شد؛ در حال بررسی وضعیت ساخت ویدیو…'));
    } finally {
      if (protectsPendingThread) creatingForcedThreadRef.current = false;
      setGeneratingVideo(false);
    }
  }, [activeThread, activeThreadId, chatContext, generatingVideo, input, invokeAi, isActiveOwner, markPendingError, mediaSettings, mediaSourceImages, message, sending]);

  const submitDocumentPrompt = useCallback(async (
    rawText?: string,
    forceNewThread = false,
    contextOverride?: Record<string, any>,
    options?: SubmitMediaOptions,
  ) => {
    const text = String(rawText ?? input).trim();
    if (!text || generatingDocument || sending) return;
    if (activeThread && !isActiveOwner) {
      message.warning('این گفتگو توسط همکار شما به اشتراک گذاشته شده و فقط قابل مشاهده است.');
      return;
    }
    const effectiveSettings = options?.mediaSettings || mediaSettings;
    const format = String(effectiveSettings.format || 'docx');
    const optimistic: AiMessage = { id: `pending-doc-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString(), metadata: { input_kind: 'document_prompt' } };
    const thinkingId = `pending-assistant-doc-${Date.now()}`;
    const thinking: AiMessage = {
      id: thinkingId,
      role: 'assistant',
      content: `در حال ساخت فایل ${format.toUpperCase()}...`,
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: ['document_generation'], kind: 'document_generation', started_at: Date.now(), prompt: text },
    };
    const protectsPendingThread = forceNewThread || !activeThreadId;
    if (protectsPendingThread) {
      creatingForcedThreadRef.current = true;
      protectedActiveThreadIdRef.current = null;
    }
    setInput('');
    setMessages((prev) => [...prev, optimistic, thinking]);
    setGeneratingDocument(true);
    try {
      const data = await invokeAi({
        action: 'generate_document',
        prompt: text,
        format,
        threadId: forceNewThread ? null : activeThreadId,
        forceNewThread,
        context: contextOverride || chatContext,
        modelOverride: modelOverrideRef.current,
        settings: effectiveSettings,
      });
      const nextThreadId = String(data?.threadId || activeThreadId || '').trim() || null;
      if (nextThreadId) {
        creatingForcedThreadRef.current = false;
        protectedActiveThreadIdRef.current = nextThreadId;
        skipNextThreadMessageLoadRef.current = nextThreadId;
        setActiveThreadId(nextThreadId);
        setMessages((prev) => [
          ...prev
            .filter((item) => item.id !== thinkingId)
            .map((item) => item.id === optimistic.id ? { ...item, id: data?.userMessageId || item.id } : item),
          {
            id: data.messageId || `assistant-doc-${Date.now()}`,
            role: 'assistant',
            content: String(data.answer || '').trim() || 'فایل آماده شد.',
            provider: data.provider || null,
            model: data.model || null,
            metadata: { usage: data.usage || null, file: data.file || null, capability: 'document_generation', format: data.format || format },
            created_at: new Date().toISOString(),
          },
        ]);
        void loadThreads(nextThreadId);
      }
    } catch (error: any) {
      markPendingError(thinkingId, toFaErrorMessage(error, 'ارتباط قطع شد؛ در حال بررسی وضعیت ساخت فایل…'));
    } finally {
      if (protectsPendingThread) creatingForcedThreadRef.current = false;
      setGeneratingDocument(false);
    }
  }, [activeThread, activeThreadId, chatContext, generatingDocument, input, invokeAi, isActiveOwner, loadThreads, markPendingError, mediaSettings, message, sending]);

  const submitUploadedFile = useCallback( async (
    filePrompt: AiUploadedFilePrompt,
    promptOverride?: string,
    contextOverride?: Record<string, any>,
    forceNewThread = false,
    options?: { capabilities?: AiComposerCapability[]; processOperationMode?: boolean; recordCreationSchema?: any },
  ) => {
    if (fileSending || sending) return;
    if (activeThread && !isActiveOwner) {
      message.warning('این گفتگو توسط همکار شما به اشتراک گذاشته شده و فقط قابل مشاهده است.');
      return;
    }
    const baseCapabilities = options?.capabilities || selectedCapabilities;
    const effectiveCapabilities = baseCapabilities.includes('document_analysis') ? baseCapabilities : [...baseCapabilities, 'document_analysis' as AiComposerCapability];
    const effectiveProcessOperationMode = options?.processOperationMode ?? processOperationMode;
    const effectiveRecordCreationSchema = options?.recordCreationSchema ?? recordCreationSchema;
    const isPlainAnalysis = !effectiveProcessOperationMode && !effectiveRecordCreationSchema;
    const optimistic: AiMessage = {
      id: `pending-file-${Date.now()}`,
      role: 'user',
      content: `فایل پیوست: ${filePrompt.fileName}`,
      created_at: new Date().toISOString(),
      metadata: { input_kind: 'file' },
    };
    const thinking: AiMessage = {
      id: `pending-assistant-file-${Date.now()}`,
      role: 'assistant',
      content: buildAiPendingStatusText(effectiveCapabilities, 'در حال تحلیل فایل...'),
      created_at: new Date().toISOString(),
      metadata: isPlainAnalysis
        ? { pending_status: true, capabilities: effectiveCapabilities, kind: 'document_analysis', started_at: Date.now() }
        : { pending_status: true, capabilities: effectiveCapabilities },
    };
    const protectsPendingThread = forceNewThread || !activeThreadId;
    if (protectsPendingThread) {
      creatingForcedThreadRef.current = true;
      protectedActiveThreadIdRef.current = null;
    }
    setMessages((prev) => [...prev, optimistic, thinking]);
    setPendingAiAction(null);
    setFileSending(true);
    try {
      const effectiveContext = contextOverride || chatContext;
      const data = await invokeAi(effectiveProcessOperationMode ? {
        action: 'process_operation_from_prompt',
        capability: 'record_chat',
        capabilities: effectiveCapabilities,
        message: String(promptOverride ?? input).trim() || 'با توجه به این فایل، اقدام فرآیندی لازم را پیشنهاد بده.',
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
        threadId: forceNewThread ? null : activeThreadId,
        forceNewThread,
        context: effectiveContext,
        modelOverride: modelOverrideRef.current,
        previewOnly: true,
      } : effectiveRecordCreationSchema ? {
        action: 'create_record_from_prompt',
        capability: effectiveContext?.mode === 'record' ? 'record_chat' : 'dashboard_chat',
        capabilities: effectiveCapabilities,
        message: String(promptOverride ?? input).trim() || 'از اطلاعات این فایل یک رکورد جدید بساز.',
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
        threadId: forceNewThread ? null : activeThreadId,
        forceNewThread,
        context: effectiveContext,
        modelOverride: modelOverrideRef.current,
        recordCreation: effectiveRecordCreationSchema,
        previewOnly: true,
      } : {
        action: 'chat_with_file',
        capabilities: effectiveCapabilities,
        message: String(promptOverride ?? input).trim() || 'این فایل را تحلیل کن و خلاصه، نکات مهم و اقدام‌های پیشنهادی را بگو.',
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
        threadId: forceNewThread ? null : activeThreadId,
        forceNewThread,
        context: effectiveContext,
        modelOverride: modelOverrideRef.current,
      });
      if (!data?.proposedAction && effectiveRecordCreationSchema && Array.isArray(data?.createdRecords) && data.createdRecords.length > 0) {
        message.success('رکورد جدید با هوش مصنوعی ساخته شد.');
      }
      if (data?.proposedAction?.id) setPendingAiAction(data.proposedAction);
      setInput('');
      const nextThreadId = String(data?.threadId || activeThreadId || '').trim() || null;
      if (nextThreadId) {
        creatingForcedThreadRef.current = false;
        protectedActiveThreadIdRef.current = nextThreadId;
        skipNextThreadMessageLoadRef.current = nextThreadId;
        setActiveThreadId(nextThreadId);
        setMessages((prev) => [
          ...prev
            .filter((item) => item.id !== thinking.id)
            .map((item) => item.id === optimistic.id ? { ...item, id: data.userMessageId || item.id } : item),
          {
            id: data.messageId || `assistant-file-${Date.now()}`,
            role: 'assistant',
            content: String(data.answer || data.reply || data.message || '').trim() || 'پاسخ آماده شد.',
            provider: data.provider || null,
            model: data.model || null,
            metadata: {
              usage: data.usage || null,
              capability: data.capability || null,
              proposedAction: data.proposedAction || null,
              createdRecords: data.createdRecords || null,
            },
            created_at: new Date().toISOString(),
          },
        ]);
        void loadThreads(nextThreadId);
      }
    } catch (error: any) {
      if (isPlainAnalysis) {
        markPendingError(thinking.id, toFaErrorMessage(error, 'ارتباط قطع شد؛ در حال بررسی نتیجهٔ تحلیل…'));
      } else {
        setMessages((prev) => prev.filter((item) => item.id !== optimistic.id && item.id !== thinking.id));
        message.error(toFaErrorMessage(error, 'ارسال فایل به هوش مصنوعی ناموفق بود'));
      }
    } finally {
      if (protectsPendingThread) creatingForcedThreadRef.current = false;
      setFileSending(false);
    }
  }, [activeThread, activeThreadId, chatContext, fileSending, input, invokeAi, isActiveOwner, loadThreadMessages, loadThreads, markPendingError, message, processOperationMode, recordCreationSchema, selectedCapabilities, sending]);

  const confirmPendingAiAction = useCallback(async () => {
    const actionId = String(pendingAiAction?.id || '').trim();
    if (!actionId) return;
    setConfirmingAiAction(true);
    try {
      const data = await invokeAi({ action: 'confirm_action', actionLogId: actionId });
      message.success('اقدام تایید و اجرا شد.');
      setPendingAiAction(null);
      const nextThreadId = String(data?.threadId || activeThreadId || '').trim() || activeThreadId;
      if (nextThreadId) await loadThreadMessages(nextThreadId);
      if (nextThreadId) void loadThreads(nextThreadId);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'اجرای اقدام تاییدشده ناموفق بود'));
    } finally {
      setConfirmingAiAction(false);
    }
  }, [activeThreadId, invokeAi, loadThreadMessages, loadThreads, message, pendingAiAction]);

  useEffect(() => {
    if (autoPromptHandledRef.current) return;
    const state = (location.state || {}) as {
      aiInitialPrompt?: string;
      aiInitialInputKind?: string;
      assistantContext?: Record<string, any>;
      aiInitialFile?: {
        fileName?: string;
        mimeType?: string;
        size?: number;
        prompt?: string;
        data?: string | null;
        inputKind?: 'text' | 'file' | 'image';
        message?: string;
        url?: string | null;
        assetId?: string | null;
        entryId?: string | null;
        moduleId?: string | null;
        recordId?: string | null;
      };
      aiInitialCapabilities?: string[];
      aiInitialRecordCreationTargetModuleId?: string | null;
      aiInitialModelOverride?: string | null;
      aiInitialMediaSettings?: AiMediaSettings;
      aiInitialMediaSourceImages?: AiMediaSourceImage[];
      forceNewThread?: boolean;
    };
    const initialFile = state.aiInitialFile;
    const initialPrompt = String(state.aiInitialPrompt || '').trim();
    const initialContext = state.assistantContext ? { ...state.assistantContext, source: 'ai_chat_page' } : undefined;
    if (!initialFile && !initialPrompt) return;
    autoPromptHandledRef.current = true;
    const allowedCapabilities = new Set([
      'document_analysis',
      'voice_input',
      'voice_output',
      'image_generation',
      'video_generation',
      'document_generation',
      'web_search',
      'deep_reasoning',
      'legal_assistant',
      'record_creation',
      'process_operation',
    ]);
    const initialCapabilities = (Array.isArray(state.aiInitialCapabilities) ? state.aiInitialCapabilities : [])
      .map((item) => String(item || '').trim())
      .filter((item): item is AiComposerCapability => allowedCapabilities.has(item));
    const initialRecordCreationTargetModuleId = String(state.aiInitialRecordCreationTargetModuleId || '').trim() || null;
    const initialModelOverride = String(state.aiInitialModelOverride || '').trim() || null;
    const initialMediaSettings = state.aiInitialMediaSettings && typeof state.aiInitialMediaSettings === 'object'
      ? state.aiInitialMediaSettings
      : {};
    const initialMediaSourceImages = Array.isArray(state.aiInitialMediaSourceImages)
      ? state.aiInitialMediaSourceImages.filter((item) => String(item?.data || '').trim())
      : [];
    modelOverrideRef.current = initialModelOverride;
    const initialProcessOperationMode = initialCapabilities.includes('process_operation');
    const initialRecordCreationSchema = initialCapabilities.includes('record_creation') && initialRecordCreationTargetModuleId
      ? buildAiRecordCreationSchema(initialRecordCreationTargetModuleId)
      : null;
    if (initialCapabilities.length > 0) setSelectedCapabilities(initialCapabilities);
    setProcessOperationMode(initialProcessOperationMode);
    setRecordCreationTargetModuleId(initialRecordCreationTargetModuleId);
    setMediaSettings(initialMediaSettings);
    setMediaSourceImages(initialMediaSourceImages);
    if (state.forceNewThread !== false) {
      creatingForcedThreadRef.current = true;
      setActiveThreadId(null);
      setMessages([]);
    }
    if (initialFile?.prompt) {
      void submitUploadedFile({
        fileName: String(initialFile.fileName || 'فایل پیوست'),
        mimeType: String(initialFile.mimeType || 'text/plain'),
        size: Number(initialFile.size || 0),
        prompt: String(initialFile.prompt || ''),
        data: initialFile.data || null,
        inputKind: initialFile.inputKind || 'file',
        url: initialFile.url || null,
        assetId: initialFile.assetId || null,
        entryId: initialFile.entryId || null,
        moduleId: initialFile.moduleId || null,
        recordId: initialFile.recordId || null,
      }, String(initialFile.message || '').trim(), initialContext, state.forceNewThread !== false, {
        capabilities: initialCapabilities,
        processOperationMode: initialProcessOperationMode,
        recordCreationSchema: initialRecordCreationSchema,
      });
      navigate('/ai', { replace: true });
      return;
    }
    if (initialCapabilities.includes('voice_output')) {
      void submitVoiceOutputPrompt(initialPrompt, state.forceNewThread !== false, initialContext, {
        mediaSettings: initialMediaSettings,
        mediaSourceImages: initialMediaSourceImages,
      });
      navigate('/ai', { replace: true });
      return;
    }
    if (initialCapabilities.includes('image_generation')) {
      void submitImagePrompt(initialPrompt, state.forceNewThread !== false, initialContext, {
        mediaSettings: initialMediaSettings,
        mediaSourceImages: initialMediaSourceImages,
      });
      navigate('/ai', { replace: true });
      return;
    }
    if (initialCapabilities.includes('video_generation')) {
      void submitVideoPrompt(initialPrompt, state.forceNewThread !== false, initialContext, {
        mediaSettings: initialMediaSettings,
        mediaSourceImages: initialMediaSourceImages,
      });
      navigate('/ai', { replace: true });
      return;
    }
    if (initialCapabilities.includes('document_generation')) {
      void submitDocumentPrompt(initialPrompt, state.forceNewThread !== false, initialContext, {
        mediaSettings: initialMediaSettings,
        mediaSourceImages: initialMediaSourceImages,
      });
      navigate('/ai', { replace: true });
      return;
    }
    void submitMessage(initialPrompt, state.forceNewThread !== false, String(state.aiInitialInputKind || 'text'), initialContext, {
      capabilities: initialCapabilities,
      processOperationMode: initialProcessOperationMode,
      recordCreationSchema: initialRecordCreationSchema,
    });
    navigate('/ai', { replace: true });
  }, [input, location.state, navigate, submitDocumentPrompt, submitImagePrompt, submitMessage, submitUploadedFile, submitVideoPrompt, submitVoiceOutputPrompt]);

  const loadShareOptions = useCallback(async () => {
    try {
      const bootstrap = await fetchSessionBootstrap(supabase);
      const currentOrgId = String(bootstrap?.orgId || '').trim();
      const currentUserId = String(bootstrap?.user?.id || '').trim();
      if (!currentOrgId) return;
      const [profilesResult, rolesResult] = await Promise.all([
        loadProfilesWithCompat(supabase, {
          orgId: currentOrgId,
          limit: 500,
          cacheKey: `ai-chat-share:profiles:${currentOrgId}`,
          orderByFullName: true,
        }),
        supabase
          .from('org_roles')
          .select('id, title')
          .eq('org_id', currentOrgId)
          .order('title', { ascending: true })
          .limit(200),
      ]);
      if (profilesResult.error) throw profilesResult.error;
      if (rolesResult.error) throw rolesResult.error;
      setUserOptions((profilesResult.data || [])
        .filter((user: any) => String(user?.id || '') !== currentUserId)
        .map((user: any) => ({
          label: String(user?.full_name || user?.email || user?.mobile_1 || '').trim() || 'کاربر بدون نام',
          value: String(user.id),
        })));
      setRoleOptions((rolesResult.data || []).map((role: any) => ({
        label: String(role?.title || '').trim() || 'نقش بدون نام',
        value: String(role.id),
      })));
    } catch (error) {
      console.warn('Could not load AI chat share options', error);
    }
  }, []);

  const openShareModal = () => {
    if (!activeThread || !isActiveOwner) return;
    setShareUserIds(normalizeIdArray(activeThread.shared_user_ids));
    setShareRoleIds(normalizeIdArray(activeThread.shared_role_ids));
    setShareOpen(true);
    void loadShareOptions();
  };

  const saveShare = async () => {
    if (!activeThreadId) return;
    setShareSaving(true);
    try {
      await invokeAi({
        action: 'share_thread',
        threadId: activeThreadId,
        sharedUserIds: shareUserIds,
        sharedRoleIds: shareRoleIds,
      });
      message.success('اشتراک‌گذاری گفتگو ذخیره شد.');
      setShareOpen(false);
      await loadThreads(activeThreadId);
      await loadThreadMessages(activeThreadId);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره اشتراک‌گذاری گفتگو ناموفق بود'));
    } finally {
      setShareSaving(false);
    }
  };

  const renameActiveThread = async () => {
    if (!activeThreadId || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      await invokeAi({ action: 'rename_thread', threadId: activeThreadId, title: renameTitle.trim() });
      message.success('عنوان گفتگو تغییر کرد.');
      setRenameTitle('');
      await loadThreads(activeThreadId);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'تغییر عنوان گفتگو ناموفق بود'));
    } finally {
      setRenaming(false);
    }
  };

  const archiveActiveThread = async () => {
    if (!activeThreadId) return;
    try {
      await invokeAi({ action: 'archive_thread', threadId: activeThreadId });
      message.success('گفتگو آرشیو شد.');
      setActiveThreadId(null);
      setMessages([]);
      await loadThreads(null);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'آرشیو گفتگو ناموفق بود'));
    }
  };

  const filteredThreads = useMemo(() => {
    const query = threadSearch.trim().toLocaleLowerCase('fa-IR');
    const visibleThreads = threads.filter((thread) => !isHiddenAssistantThread(thread));
    if (!query) return visibleThreads;
    return visibleThreads.filter((thread) =>
      String(thread.title || 'گفتگوی بدون عنوان').toLocaleLowerCase('fa-IR').includes(query)
    );
  }, [threadSearch, threads]);

  const startNewChat = () => {
    protectedActiveThreadIdRef.current = null;
    setActiveThreadId(null);
    setMessages([]);
    setInput('');
    setChatContext({ mode: 'dashboard', source: 'ai_chat_page' });
    setThreadDrawerOpen(false);
  };

  const fileRecordScope = getRecordScopeFromContext(chatContext);
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

  const renderThreadsPanel = () => (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-dark-border dark:bg-dark-surface md:border md:shadow-sm">
      <Button type="primary" block icon={<PlusOutlined />} onClick={startNewChat}>
        گفتگوی جدید
      </Button>
      <Input
        className="mt-3"
        allowClear
        prefix={<SearchOutlined className="text-gray-400" />}
        placeholder="جستجوی گفتگوها"
        value={threadSearch}
        onChange={(event) => setThreadSearch(event.target.value)}
      />
      <div className="mt-3 max-h-[calc(100vh-210px)] space-y-2 overflow-auto pr-1">
        {threadLoading ? (
          <div className="py-8 text-center"><Spin /></div>
        ) : filteredThreads.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="گفتگویی ثبت نشده است" />
        ) : (
          filteredThreads.map((thread) => {
            const active = String(thread.id) === String(activeThreadId);
            const threadSwitchBlocked = creatingForcedThreadRef.current && generatingImage;
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  if (threadSwitchBlocked) return;
                  protectedActiveThreadIdRef.current = null;
                  setActiveThreadId(thread.id);
                  setThreadDrawerOpen(false);
                }}
                disabled={threadSwitchBlocked}
                className={`w-full rounded-lg border px-3 py-3 text-right transition ${
                  active
                    ? 'border-leather-400 bg-leather-50 text-leather-800 dark:border-leather-500 dark:bg-leather-900/20 dark:text-leather-100'
                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-dark-border dark:bg-dark-surface'
                } ${threadSwitchBlocked ? 'cursor-wait opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-sm font-semibold">
                    {thread.title || 'گفتگوی بدون عنوان'}
                  </span>
                  {thread.is_shared ? <Tag color="blue" className="m-0 shrink-0">مشترک</Tag> : null}
                </div>
                <div className="mt-2 text-xs text-gray-500">{formatThreadDate(thread.updated_at || thread.created_at)}</div>
                <div className="mt-1 truncate text-[11px] text-gray-400">{getThreadContextLabel(thread)}</div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="relative z-[1] min-h-screen w-full overflow-x-hidden bg-gray-50 p-3 dark:bg-dark-bg md:p-4" dir="rtl">
      <div className="flex w-full min-w-0 flex-col gap-4 md:flex-row-reverse">
        <aside className="hidden w-full shrink-0 md:block md:w-80">
          {renderThreadsPanel()}
        </aside>

        <main className="h-[calc(100vh-24px)] min-h-0 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface md:h-[calc(100vh-32px)]">
          <div className="flex h-full min-h-0 flex-col">
            <header className="flex flex-col gap-3 border-b border-gray-100 p-4 dark:border-dark-border md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  className="inline-flex !h-9 !w-9 shrink-0 items-center justify-center !p-0 md:hidden"
                  icon={<MenuUnfoldOutlined />}
                  onClick={() => setThreadDrawerOpen(true)}
                  aria-label="باز کردن لیست گفتگوها"
                />
                <Avatar
                  size={36}
                  icon={<span className="inline-flex h-full w-full items-center justify-center"><AiSparkleIcon className="h-4 w-4 shrink-0" /></span>}
                  className="shrink-0 bg-leather-500"
                />
                <div className="min-w-0">
                  <Typography.Title level={4} className="!mb-0 truncate">
                    {activeThread?.title || 'هوش مصنوعی تازه سیستم'}
                  </Typography.Title>
                  <div className="text-xs text-gray-500">
                    {activeThread
                      ? activeThread.is_owner === false
                        ? 'گفتگوی به‌اشتراک‌گذاشته‌شده'
                        : getThreadContextLabel(activeThread)
                      : 'گفتگوی جدید'}
                  </div>
                </div>
              </div>
              <Space wrap>
                {activeThread && isActiveOwner ? (
                  <>
                    <Tooltip title="اشتراک‌گذاری با همکاران یا نقش‌ها">
                      <Button icon={<ShareAltOutlined />} onClick={openShareModal}>
                        اشتراک‌گذاری
                      </Button>
                    </Tooltip>
                    <Input
                      className="w-56"
                      placeholder="عنوان جدید"
                      value={renameTitle}
                      onChange={(event) => setRenameTitle(event.target.value)}
                      onPressEnter={renameActiveThread}
                    />
                    <Button icon={<EditOutlined />} loading={renaming} onClick={renameActiveThread}>
                      تغییر عنوان
                    </Button>
                    <Tooltip title="آرشیو گفتگو">
                      <Button danger icon={<DeleteOutlined />} onClick={archiveActiveThread} />
                    </Tooltip>
                  </>
                ) : null}
              </Space>
            </header>

            <section className="min-h-0 flex-1 overflow-auto p-4">
              {messagesLoading && messages.length === 0 ? (
                <div className="py-16 text-center"><Spin /></div>
              ) : messages.length === 0 ? (
                <div className="flex h-full min-h-[360px] items-center justify-center">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="سوال خود را بپرسید تا یک گفتگوی جدید شروع شود"
                  />
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-4">
                  {messagesLoading ? (
                    <div className="sticky top-0 z-10 flex justify-center">
                      <div className="rounded-full border border-gray-200 bg-white/90 px-3 py-1 text-[11px] text-gray-500 shadow-sm dark:border-dark-border dark:bg-dark-surface/90">
                        در حال همگام‌سازی گفتگو...
                      </div>
                    </div>
                  ) : null}
                  {messages.map((item) => {
                    const isUser = item.role === 'user';
                    const isAssistant = item.role === 'assistant';
                    const modelName = item.model || item.metadata?.usage?.model || null;
                    const cost = isAssistant ? formatCostFa(item) : null;
                    const time = formatMessageTime(item.created_at);
                    const aiAttachment = item.metadata?.image || item.metadata?.file || (item.metadata?.image_url ? { url: item.metadata.image_url } : null);
                    const pendingKind = getPendingGenerationKind(item);
                    return (
                      <div key={item.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                        {!isUser ? (
                          <Avatar
                            size={32}
                            icon={<span className="inline-flex h-full w-full items-center justify-center"><AiSparkleIcon className="h-4 w-4 shrink-0" /></span>}
                            className="mt-1 shrink-0 bg-leather-500"
                          />
                        ) : null}
                        <div className={`flex max-w-[85%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
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
                            className={`whitespace-pre-wrap rounded-lg px-4 py-3 leading-7 ${
                              isUser
                                ? 'bg-leather-500 text-white'
                                : 'border border-gray-200 bg-gray-50 text-gray-800 dark:border-dark-border dark:bg-dark-bg dark:text-gray-100'
                            }`}
                          >
                            {item.content}
                            <AiMessageAttachmentPreview
                              attachment={aiAttachment}
                              fallbackName={isAssistant ? 'خروجی هوش مصنوعی' : 'فایل پیوست'}
                              onEditImage={isAssistant ? handleEditImage : undefined}
                            />
                          </div>
                          )}
                          {(time || modelName || cost) ? (
                            <div
                              className={`mt-1 flex flex-wrap items-center gap-x-2 px-1 text-[10px] text-gray-400 dark:text-gray-500 ${isUser ? 'justify-end' : 'justify-start'}`}
                              dir="rtl"
                            >
                              {isUser ? <span>{currentUserView.name}</span> : null}
                              {time ? <span>{time}</span> : null}
                              {modelName ? <span className="font-mono">{modelName}</span> : null}
                              {cost ? <span>{cost}</span> : null}
                            </div>
                          ) : null}
                        </div>
                        {isUser ? (
                          <ProfileAvatar
                            size={32}
                            src={currentUserView.avatarUrl}
                            name={currentUserView.name}
                            icon={<UserOutlined />}
                            className="mt-1 bg-gray-500"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <footer className="max-h-[48vh] shrink-0 overflow-y-auto border-t border-gray-100 p-3 dark:border-dark-border md:p-4">
              {activeThread && !isActiveOwner ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-100">
                  این گفتگو توسط همکار شما به اشتراک گذاشته شده و فقط قابل مشاهده است.
                </div>
              ) : null}
              {pendingAiAction ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-100">
                  <div className="mb-2 font-medium">هوش مصنوعی یک اقدام قابل اجرا پیشنهاد داده است.</div>
                  <div className="mb-3 leading-6">
                    می‌توانید تایید کنید، یا در کادر پیام توضیح بیشتری بنویسید تا پیشنهاد اصلاح شود.
                  </div>
                  <Space>
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
                  <img src={imageEditSourceUrl} alt="مبنای اصلاح" className="h-9 w-9 rounded object-cover" />
                  <span className="flex-1">در حال اصلاح روی این تصویر — تغییر موردنظر را بنویسید.</span>
                  <Button type="text" size="small" onClick={() => setImageEditSourceUrl(null)}>شروع از نو</Button>
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <Input.TextArea
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  placeholder="از هوش مصنوعی تازه سیستم بپرسید..."
                  value={input}
                  disabled={Boolean(activeThread && !isActiveOwner)}
                  onChange={(event) => setInput(event.target.value)}
                  onPressEnter={(event) => {
                    if (!event.shiftKey) {
                      event.preventDefault();
                      void (documentMode ? submitDocumentPrompt() : videoMode ? submitVideoPrompt() : voiceOutputMode ? submitVoiceOutputPrompt() : imageMode ? submitImagePrompt() : submitMessage());
                    }
                  }}
                />
                <AiCapabilityComposerActions
                  selected={selectedCapabilities}
                  onChange={handleComposerCapabilitiesChange}
                  capabilityAvailability={capabilityAvailability}
                  disabled={Boolean(activeThread && !isActiveOwner)}
                  loading={sending || generatingImage || generatingVoiceOutput || generatingVideo || generatingDocument}
                  moduleId={fileRecordScope.moduleId}
                  recordId={fileRecordScope.recordId}
                  onVoiceSend={submitVoice}
                  onFilePrepared={submitUploadedFile}
                  voiceLoading={voiceSending}
                  fileLoading={fileSending}
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
                  loading={documentMode ? generatingDocument : videoMode ? generatingVideo : voiceOutputMode ? generatingVoiceOutput : imageMode ? generatingImage : sending}
                  disabled={!input.trim() || Boolean(activeThread && !isActiveOwner)}
                  onClick={() => void (documentMode ? submitDocumentPrompt() : videoMode ? submitVideoPrompt() : voiceOutputMode ? submitVoiceOutputPrompt() : imageMode ? submitImagePrompt() : submitMessage())}
                >
                  {documentMode ? 'ساخت فایل' : videoMode ? 'ساخت ویدیو' : voiceOutputMode ? 'تولید صدا' : imageMode ? 'ساخت تصویر' : processOperationMode ? 'پیشنهاد اقدام' : recordCreationSchema ? 'پیشنهاد ساخت' : 'ارسال'}
                </Button>
              </div>
              <div className="mt-1 px-1">
                <AiComposeModelBar
                  selectedCapabilities={selectedCapabilities}
                  contextMode={chatContext?.mode}
                  onModelOverrideChange={(model) => { modelOverrideRef.current = model; }}
                />
              </div>
            </footer>
          </div>
        </main>
      </div>

      <Drawer
        title="گفتگوها"
        open={threadDrawerOpen}
        onClose={() => setThreadDrawerOpen(false)}
        placement="right"
        width="86%"
        classNames={{ body: '!p-3' }}
      >
        {renderThreadsPanel()}
      </Drawer>

      <Modal
        title="اشتراک‌گذاری گفتگو"
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        onOk={saveShare}
        confirmLoading={shareSaving}
        okText="ذخیره"
        cancelText="انصراف"
      >
        <div className="space-y-4">
          <Select
            mode="multiple"
            allowClear
            className="w-full"
            placeholder="انتخاب همکاران"
            options={userOptions}
            value={shareUserIds}
            onChange={(values) => setShareUserIds(values.map((item) => String(item)))}
            optionFilterProp="label"
          />
          <Select
            mode="multiple"
            allowClear
            className="w-full"
            placeholder="انتخاب نقش‌ها"
            options={roleOptions}
            value={shareRoleIds}
            onChange={(values) => setShareRoleIds(values.map((item) => String(item)))}
            optionFilterProp="label"
          />
          <div className="text-xs leading-6 text-gray-500">
            گفتگوها در حالت پیش‌فرض فقط برای مالک قابل مشاهده‌اند. با ذخیره این بخش، فقط کاربران یا نقش‌های انتخاب‌شده در همین سازمان می‌توانند گفتگو را ببینند.
          </div>
        </div>
      </Modal>
    </div>
  );
};

const AiChatPage: React.FC = () => {
  const location = useLocation();
  const useOmnichannelPrototype = new URLSearchParams(location.search).get('prototype') === 'omni';

  if (useOmnichannelPrototype) {
    return (
      <React.Suspense fallback={null}>
        <AiChatSurfacePrototype />
      </React.Suspense>
    );
  }

  return <AiChatPageRuntime />;
};

export default AiChatPage;
