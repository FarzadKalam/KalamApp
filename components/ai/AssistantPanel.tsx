import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Avatar, Button, Checkbox, Drawer, Empty, Input, Popconfirm, Popover, Progress, Space, Spin, Tag, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined, CompressOutlined, CopyOutlined, DeleteOutlined, EditOutlined, ForwardOutlined, MenuOutlined, SendOutlined, UserAddOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../../supabaseClient';
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
import AiCapabilityComposerActions, { normalizeAiComposerCapabilities, type AiComposerCapability } from './AiCapabilityComposerActions';
import AiComposeModelBar from './AiComposeModelBar';
import AiGenerationStatusCard, { type AiGenerationKind } from './AiGenerationStatusCard';
import AiAudioPlayer from './AiAudioPlayer';
import AiMediaSettingsPopover, { type AiMediaSettings, type AiMediaSourceImage } from './AiMediaSettingsPopover';
import { resolveAiAttachmentUrl } from './AiMessageAttachmentPreview';
import { blobToBase64 } from '../../utils/blobBase64';
import { buildAiRecordCreationSchema, buildAiRecordModuleOptions } from '../../utils/aiRecordCreation';
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';
import { shouldSubmitComposerOnEnter } from '../../utils/composeKeyboard';
import { buildSmartAiThreadTitle } from '../../utils/aiThreadTitle';
import MessageAttachmentGallery from '../messaging/MessageAttachmentGallery';
import { extractAiMessageAttachments, normalizeAiMessageText } from '../../utils/aiMessageParts';
import ComposerAttachmentChips, { type ComposerAttachmentChipItem } from '../common/ComposerAttachmentChips';
import AiMessageRenderer from './AiMessageRenderer';
import { type AiRecordMutationDraft } from './AiRecordMutationApprovalCard';
import QuickRecordFormModal from './QuickRecordFormModal';

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

const isAiImageFilePrompt = (file: Pick<AiUploadedFilePrompt, 'fileName' | 'mimeType'>) => {
  const mimeType = String(file?.mimeType || '').toLowerCase();
  const fileName = String(file?.fileName || '').toLowerCase();
  return mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(fileName);
};

const revokeBundleInputPreviewUrls = (items: AiBundleInput[]) => {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  items.forEach((item) => {
    if (item.type === 'voice' && item.voice.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(item.voice.previewUrl);
    }
  });
};

const buildBundleMessageAttachments = (items: AiBundleInput[]) => items.map((item) => {
  if (item.type === 'voice') {
    return {
      name: item.voice.filename || 'پیام صوتی',
      url: item.voice.previewUrl || '',
      mimeType: item.voice.mimeType,
      fileType: 'audio',
    };
  }
  const rawData = String(item.file.data || '').trim();
  const mimeType = String(item.file.mimeType || 'application/octet-stream');
  const url = String(item.file.url || '').trim()
    || (rawData ? (rawData.startsWith('data:') ? rawData : `data:${mimeType};base64,${rawData}`) : '');
  return {
    name: item.file.fileName || item.label || 'فایل پیوست',
    url,
    mimeType,
    fileType: item.type === 'image' ? 'image' : 'file',
    assetId: item.file.assetId || null,
    entryId: item.file.entryId || null,
    moduleId: item.file.moduleId || null,
    recordId: item.file.recordId || null,
  };
}).filter((attachment) => Boolean(attachment.url));

const DEFAULT_COMPOSER_CAPABILITIES: AiComposerCapability[] = [];
const NON_STREAM_CHAT_CAPABILITIES = new Set([
  'document_analysis',
  'voice_input',
  'voice_output',
  'image_generation',
  'video_generation',
  'document_generation',
  'record_creation',
  'process_operation',
]);

const IMAGE_PROMPT_ONLY_PATTERNS = [
  /(?:پرامپت|prompt|متن|توضیح|دستور).*(?:برای|جهت).*(?:تولید|ساخت|ایجاد).*(?:تصویر|عکس|پوستر|بنر|کاور|image)/i,
  /(?:برای|جهت).*(?:تولید|ساخت|ایجاد).*(?:تصویر|عکس|پوستر|بنر|کاور|image).*(?:پرامپت|prompt|متن|توضیح|دستور).*(?:بنویس|بده|تهیه کن|آماده کن)/i,
  /(?:پرامپت|prompt).*(?:تصویر|عکس|image).*(?:بنویس|بده|تهیه کن|آماده کن)/i,
];

const DIRECT_IMAGE_GENERATION_PATTERNS = [
  /(?:خودت|مستقیماً|مستقیم|همین حالا).*(?:تصویر|عکس|پوستر|بنر|کاور).*(?:بساز|تولید کن|ایجاد کن|طراحی کن)/i,
  /(?:تصویر|عکس|پوستر|بنر|کاور).*(?:را|رو).*(?:بساز|تولید کن|ایجاد کن|طراحی کن)/i,
];

const IMAGE_PROMPT_WORD_PATTERN = /(?:پرامپت|prompt|متن|توضیح|دستور).*(?:تصویر|عکس|پوستر|بنر|کاور|image)|(?:تصویر|عکس|پوستر|بنر|کاور|image).*(?:پرامپت|prompt|متن|توضیح|دستور)/i;

const isImagePromptOnlyRequest = (text: string) => {
  const value = String(text || '').trim();
  const asksForPrompt = IMAGE_PROMPT_ONLY_PATTERNS.some((pattern) => pattern.test(value));
  const explicitDirectGeneration = DIRECT_IMAGE_GENERATION_PATTERNS.some((pattern) => pattern.test(value))
    && !IMAGE_PROMPT_WORD_PATTERN.test(value);
  return asksForPrompt && !explicitDirectGeneration;
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
  if (set.has('record_creation')) return 'در حال آماده‌سازی پیش‌نویس رکورد...';
  return fallback;
};

const buildTaskBundlePendingStatusText = (inputs: Array<{ type?: string }>, capabilities: string[]) => {
  const types = (inputs || []).map((item) => String(item?.type || '').trim());
  const imageCount = types.filter((type) => type === 'image').length;
  const voiceCount = types.filter((type) => type === 'voice').length;
  const fileCount = types.filter((type) => type === 'file').length;
  const imageLabel = imageCount > 1 ? 'تصاویر' : 'تصویر';
  const voiceLabel = voiceCount > 1 ? 'فایل‌های صوتی' : 'فایل صوتی';
  const fileLabel = fileCount > 1 ? 'فایل‌ها' : 'فایل';

  if (imageCount && voiceCount) return `در حال تحلیل ${imageLabel} و ${voiceLabel} ارسالی شما هستم…`;
  if (imageCount && fileCount) return `در حال تحلیل ${imageLabel} و ${fileLabel} ارسالی شما هستم…`;
  if (voiceCount && fileCount) return `در حال تحلیل ${voiceLabel} و ${fileLabel} ارسالی شما هستم…`;
  if (imageCount) return `در حال تحلیل ${imageLabel} ارسالی شما هستم…`;
  if (voiceCount) return `در حال تحلیل ${voiceLabel} ارسالی شما هستم…`;
  if (fileCount) return `در حال تحلیل ${fileLabel} ارسالی شما هستم…`;
  return buildAiPendingStatusText(capabilities, 'در حال آماده‌سازی پاسخ…');
};

const GENERATION_PENDING_KINDS = new Set<AiGenerationKind>([
  'image_generation', 'voice_output', 'video_generation', 'document_generation', 'document_analysis',
]);
const getPendingGenerationKind = (item: { metadata?: Record<string, any> | null }): AiGenerationKind | null => {
  const metadata = item?.metadata || {};
  const kind = String(metadata?.kind || '') as AiGenerationKind;
  const recoverableImageTimeout = kind === 'image_generation'
    && (metadata?.status === 'delayed' || metadata?.error === 'image_generation_worker_timeout' || metadata?.error === 'image_generation_delayed');
  if ((!metadata?.pending_status || metadata?.failed) && !recoverableImageTimeout) return null;
  return GENERATION_PENDING_KINDS.has(kind) ? kind : null;
};

const estimateAiMessageTokens = (messages: ChatMessage[]) =>
  Math.ceil((messages || []).reduce((sum, item) => sum + normalizeAiMessageText(item.content).length, 0) / 3.8);

const estimateModelContextLimit = (model?: string | null) => {
  const value = String(model || '').toLowerCase();
  if (value.includes('gemini')) return 1000000;
  if (value.includes('gpt-5') || value.includes('gpt-4.1')) return 128000;
  if (value.includes('gpt-4o') || value.includes('o4') || value.includes('o3')) return 128000;
  if (value.includes('claude')) return 200000;
  return 128000;
};

interface AssistantPanelProps {
  active: boolean;
  initialThreadId?: string | null;
  initialThreadTitle?: string | null;
  initialPrompt?: string | null;
  initialInputKind?: string | null;
  initialCapabilities?: AiComposerCapability[] | null;
  initialRecordCreationTargetModuleId?: string | null;
  initialModelOverride?: string | null;
  initialMediaSettings?: AiMediaSettings | null;
  initialMediaSourceImages?: AiMediaSourceImage[] | null;
  initialFiles?: Array<(AiUploadedFilePrompt & { message?: string | null })> | null;
  initialFile?: (AiUploadedFilePrompt & { message?: string | null }) | null;
  autoSubmitInitialPrompt?: boolean;
  openCreateActivityFromMessage?: (input: any) => void | Promise<void>;
  onForwardMessage?: (input: any) => void | Promise<void>;
  onThreadDeleted?: (threadId: string) => void;
  onThreadRenamed?: (threadId: string, title: string, thread?: any) => void;
  onThreadUpserted?: (thread: any) => void;
  showThreadListButton?: boolean;
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

const PARTIAL_STREAM_NOTICE = 'ادامه پاسخ کامل دریافت نشد، اما متن دریافت‌شده حفظ شد. برای ادامه می‌توانید پیام «ادامه بده» را ارسال کنید.';

const isRecoverableStreamError = (payload: any) => {
  const finishReason = String(payload?.finishReason || payload?.finish_reason || '').trim();
  return payload?.incomplete === true || finishReason === 'length' || finishReason === 'stream_interrupted';
};

const buildRecoverableStreamContent = (currentContent: any, payload: any, fallbackText: string) => {
  const currentText = normalizeAiMessageText(currentContent);
  const partialText = normalizeAiMessageText(payload?.partialContent || payload?.partial_content || payload?.answer);
  const baseText = currentText || partialText;
  if (!baseText) return fallbackText || PARTIAL_STREAM_NOTICE;
  return baseText.includes(PARTIAL_STREAM_NOTICE) ? baseText : `${baseText}\n\n${PARTIAL_STREAM_NOTICE}`;
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

const getGenerationConfirmationTitle = (kind: string) => {
  if (kind === 'image_generation') return 'تایید ساخت تصویر';
  if (kind === 'video_generation') return 'تایید ساخت ویدیو';
  if (kind === 'voice_output') return 'تایید تولید صدا';
  if (kind === 'document_generation') return 'تایید ساخت فایل';
  if (kind === 'deep_reasoning') return 'تایید تفکر عمیق';
  return 'تایید ساخت خروجی';
};

const getGenerationOutputLabel = (kind: string, settings?: AiMediaSettings | null) => {
  if (kind === 'image_generation') return Number(settings?.n || 1) > 1 ? 'تصاویر' : 'تصویر';
  if (kind === 'video_generation') return 'ویدیو';
  if (kind === 'voice_output') return 'فایل صوتی';
  if (kind === 'document_generation') return 'فایل';
  if (kind === 'deep_reasoning') return 'تحلیل عمیق';
  return 'خروجی';
};

const buildGenerationSettingsRows = (kind: string, settings?: AiMediaSettings | null, extra?: Record<string, any>) => {
  const rows: Array<{ label: string; value: string }> = [];
  rows.push({ label: 'تاریخچه گفتگوی فعلی', value: settings?.useConversationHistory === true ? 'استفاده شود' : 'استفاده نشود' });
  if (kind === 'image_generation') {
    rows.push({ label: 'اندازه', value: String(settings?.size || 'خودکار') });
    rows.push({ label: 'کیفیت', value: String(settings?.quality || 'خودکار') });
    rows.push({ label: 'فرمت خروجی', value: String(settings?.imageOutputFormat || 'png').toUpperCase() });
    rows.push({ label: 'تعداد', value: Number(settings?.n || 1).toLocaleString('fa-IR') });
    rows.push({ label: 'اطلاعات سازمان', value: settings?.useOrganizationContext === true ? 'استفاده شود' : 'استفاده نشود' });
    if (extra?.sourceImageCount) rows.push({ label: 'تصویر مبنا', value: `${Number(extra.sourceImageCount).toLocaleString('fa-IR')} تصویر` });
  }
  if (kind === 'video_generation') {
    const videoStyleLabels: Record<string, string> = { cinematic: 'سینمایی', realistic: 'واقع‌گرایانه', animation: 'انیمیشنی', product: 'معرفی محصول' };
    const videoMotionLabels: Record<string, string> = { gentle: 'ملایم', dynamic: 'پویا', static: 'ثابت' };
    const videoCameraLabels: Record<string, string> = { auto: 'انتخاب خودکار', close_up: 'نمای نزدیک', wide: 'نمای باز', tracking: 'دنبال‌کننده' };
    rows.push({ label: 'ابعاد', value: String(settings?.size || 'پیش‌فرض') });
    rows.push({ label: 'مدت', value: settings?.seconds ? `${Number(settings.seconds).toLocaleString('fa-IR')} ثانیه` : 'پیش‌فرض' });
    rows.push({ label: 'کیفیت', value: settings?.videoQuality === 'high' ? 'بالاتر' : 'استاندارد' });
    if (settings?.videoStyle) rows.push({ label: 'سبک', value: videoStyleLabels[String(settings.videoStyle)] || String(settings.videoStyle) });
    if (settings?.videoMotion) rows.push({ label: 'حرکت', value: videoMotionLabels[String(settings.videoMotion)] || String(settings.videoMotion) });
    if (settings?.videoCamera) rows.push({ label: 'دوربین', value: videoCameraLabels[String(settings.videoCamera)] || String(settings.videoCamera) });
    if (extra?.sourceImageCount) rows.push({ label: 'تصویر مبنا', value: `${Number(extra.sourceImageCount).toLocaleString('fa-IR')} تصویر` });
  }
  if (kind === 'voice_output') {
    rows.push({ label: 'صدا', value: String(settings?.voice || 'alloy') });
    rows.push({ label: 'زبان', value: String(settings?.language || 'fa-IR') });
    rows.push({ label: 'فرمت خروجی', value: String(settings?.responseFormat || 'mp3').toUpperCase() });
    rows.push({ label: 'سرعت', value: `${Number(settings?.speed || 1).toLocaleString('fa-IR')}×` });
  }
  if (kind === 'document_generation') {
    rows.push({ label: 'قالب فایل', value: String(extra?.format || settings?.format || 'docx').toUpperCase() });
    if (extra?.bundleInputCount) rows.push({ label: 'ورودی پیوست', value: `${Number(extra.bundleInputCount).toLocaleString('fa-IR')} مورد` });
  }
  if (kind === 'deep_reasoning') {
    rows.push({ label: 'حالت', value: 'تحلیل عمیق مرحله‌ای' });
  }
  return rows;
};

const buildGenerationConfirmationText = (kind: string, prompt: string, rows: Array<{ label: string; value: string }>) => {
  const outputLabel = getGenerationOutputLabel(kind);
  const settingsText = rows.length
    ? rows.map((row) => `- ${row.label}: ${row.value}`).join('\n')
    : '- تنظیمات: پیش‌فرض';
  return [
    `${outputLabel} با دستور زیر ساخته خواهد شد:`,
    `«${String(prompt || '').trim() || 'درخواست کاربر'}»`,
    'تنظیمات:',
    settingsText,
    'آیا تایید می‌کنید؟',
  ].join('\n\n');
};

const buildLocalGenerationConfirmation = (params: {
  kind: 'image_generation' | 'video_generation' | 'voice_output' | 'document_generation' | 'deep_reasoning';
  prompt: string;
  settings?: AiMediaSettings | null;
  confirmBody: Record<string, any>;
  rows?: Array<{ label: string; value: string }>;
}) => {
  const rows = params.rows || buildGenerationSettingsRows(params.kind, params.settings);
  const title = getGenerationConfirmationTitle(params.kind);
  return {
    success: true,
    autoAction: 'confirm_generation',
    answer: buildGenerationConfirmationText(params.kind, params.prompt, rows),
    proposedAction: {
      id: `local-generation-${Date.now()}`,
      actionType: 'confirm_generation',
      title,
      generationKind: params.kind,
      prompt: params.prompt,
      settingsRows: rows,
      confirmBody: params.confirmBody,
    },
  };
};

const buildPendingActionRevisionPrompt = (pendingAction: any, text: string) => {
  const proposedPayload = pendingAction?.proposedPayload || pendingAction?.proposed_payload || {};
  const payload = proposedPayload?.payload && typeof proposedPayload.payload === 'object' ? proposedPayload.payload : {};
  const records = Array.isArray(proposedPayload?.records) && proposedPayload.records.length
    ? proposedPayload.records
    : [{ fields: payload }];
  const moduleLabel = String(pendingAction?.title || proposedPayload?.module_label || '').trim();
  if (!records.some((record: any) => Object.keys(record?.fields || {}).length > 0)) return text;
  const isUpdate = String(pendingAction?.actionType || '') === 'update_record_from_prompt';
  return [
    `کاربر می‌خواهد پیش‌نویس ${isUpdate ? 'ویرایش' : 'ساخت'} رکورد قبلی را اصلاح یا تکمیل کند.`,
    moduleLabel ? `نوع رکورد: ${moduleLabel}` : '',
    'پیش‌نویس قبلی:',
    JSON.stringify(records),
    '',
    'توضیح جدید کاربر:',
    text,
    '',
    `با حفظ اطلاعات قبلی، فقط موارد جدید یا اصلاح‌شده را اعمال کن و دوباره پیش‌نویس تایید ${isUpdate ? 'ویرایش' : 'ساخت'} بساز.`,
  ].filter(Boolean).join('\n');
};

const normalizeInitialCapabilities = (items?: AiComposerCapability[] | null) => {
  return normalizeAiComposerCapabilities(items || []);
};

const AssistantPanel: React.FC<AssistantPanelProps> = ({
  active,
  initialThreadId,
  initialThreadTitle,
  initialPrompt,
  initialInputKind,
  initialCapabilities,
  initialRecordCreationTargetModuleId,
  initialModelOverride,
  initialMediaSettings,
  initialMediaSourceImages,
  initialFiles,
  initialFile,
  autoSubmitInitialPrompt = false,
  openCreateActivityFromMessage,
  onForwardMessage,
  onThreadDeleted,
  onThreadRenamed,
  onThreadUpserted,
  showThreadListButton = false,
}) => {
  const { message } = App.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [deletingThread, setDeletingThread] = useState(false);
  const deletingThreadRef = useRef(false);
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
  const [selectedCapabilities, setSelectedCapabilities] = useState<AiComposerCapability[]>(DEFAULT_COMPOSER_CAPABILITIES);
  const [autoSuggestedCapabilities, setAutoSuggestedCapabilities] = useState<AiComposerCapability[]>([]);
  const [mediaSettings, setMediaSettings] = useState<AiMediaSettings>({});
  const [mediaSourceImages, setMediaSourceImages] = useState<AiMediaSourceImage[]>([]);
  const [bundleInputs, setBundleInputs] = useState<AiBundleInput[]>([]);
  const composerImageSources = useMemo(() => {
    const seen = new Set<string>();
    const candidates = [
      ...mediaSourceImages,
      ...bundleInputs.flatMap((item) => {
        if (item.type !== 'image' || !String(item.file.data || '').trim()) return [];
        return [{
          data: String(item.file.data || ''),
          mimeType: String(item.file.mimeType || 'image/png'),
          filename: String(item.file.fileName || 'image.png'),
        }];
      }),
    ];
    return candidates.flatMap((item) => {
      const data = String(item?.data || '').trim();
      if (!data || seen.has(data)) return [];
      seen.add(data);
      return [{
        data,
        mimeType: String(item?.mimeType || 'image/png'),
        filename: String(item?.filename || 'image.png'),
      }];
    });
  }, [bundleInputs, mediaSourceImages]);
  const bundleInputsRef = useRef<AiBundleInput[]>([]);
  const [contextRecordLabel, setContextRecordLabel] = useState<string | null>(null);
  const [liveContext, setLiveContext] = useState<AssistantContext | null>(null);
  const [pendingProcessSelectionId, setPendingProcessSelectionId] = useState<string | null>(null);
  const [recordCreationTargetModuleId, setRecordCreationTargetModuleId] = useState<string | null>(null);
  const [processOperationMode, setProcessOperationMode] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<any | null>(null);
  const [quickRecordFormOpen, setQuickRecordFormOpen] = useState(false);
  const [confirmingAiAction, setConfirmingAiAction] = useState(false);
  const [rememberGenerationPreference, setRememberGenerationPreference] = useState(false);
  const [skipGenerationConfirmationByKind, setSkipGenerationConfirmationByKind] = useState<Record<string, boolean>>({});
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});
  const initialTitle = String(initialThreadTitle || '').trim() || 'گفتگوی هوش مصنوعی';
  const [threadTitle, setThreadTitle] = useState(initialTitle);
  const [editingThreadTitle, setEditingThreadTitle] = useState(false);
  const [draftThreadTitle, setDraftThreadTitle] = useState(initialTitle);
  const [renamingThread, setRenamingThread] = useState(false);
  const [compressingContext, setCompressingContext] = useState(false);
  const [threadListOpen, setThreadListOpen] = useState(false);
  const [drawerThreads, setDrawerThreads] = useState<any[]>([]);
  const [drawerThreadsLoading, setDrawerThreadsLoading] = useState(false);
  const renamingThreadRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const streamAbortRef = useRef<AbortController | null>(null);
  const autoSubmittedInitialPromptRef = useRef('');
  const autoSubmittedInitialBundleRef = useRef('');
  const modelOverrideRef = useRef<string | null>(null);
  const composerPreferencesRef = useRef<Record<string, any>>({});
  const autoCompressedSignatureRef = useRef('');
  const appliedInitialPromptRef = useRef('');
  const normalizedInitialThreadId = String(initialThreadId || '').trim() || null;
  const normalizedInitialInputKind = String(initialInputKind || 'text').trim() || 'text';

  useEffect(() => {
    bundleInputsRef.current = bundleInputs;
  }, [bundleInputs]);

  useEffect(() => () => {
    revokeBundleInputPreviewUrls(bundleInputsRef.current);
  }, []);

  const applyThreadTitleFromResponse = useCallback((payload: any, fallbackPrompt?: string) => {
    const nextThreadId = String(payload?.threadId || payload?.thread?.id || '').trim();
    const nextTitle = String(payload?.threadTitle || payload?.thread?.title || '').trim()
      || (!threadId && fallbackPrompt ? buildSmartAiThreadTitle(fallbackPrompt) : '');
    if (!nextTitle) return;
    setThreadTitle(nextTitle);
    setDraftThreadTitle(nextTitle);
    if (nextThreadId) onThreadUpserted?.({
      ...(payload?.thread && typeof payload.thread === 'object' ? payload.thread : {}),
      id: nextThreadId,
      title: nextTitle,
      module_id: payload?.thread?.module_id || null,
      record_id: payload?.thread?.record_id || null,
      updated_at: payload?.thread?.updated_at || new Date().toISOString(),
    });
    if (nextThreadId) onThreadRenamed?.(nextThreadId, nextTitle, payload?.thread || { id: nextThreadId, title: nextTitle });
  }, [onThreadRenamed, onThreadUpserted, threadId]);

  const sanitizeMediaSourceImagesForPreferences = useCallback((items: AiMediaSourceImage[]) => (
    (Array.isArray(items) ? items : [])
      .slice(0, 4)
      .map((item) => ({
        data: String(item?.data || '').trim(),
        mimeType: String(item?.mimeType || 'image/png').trim() || 'image/png',
        filename: String(item?.filename || '').trim() || undefined,
        previewUrl: String(item?.previewUrl || '').trim(),
      }))
      .filter((item) => item.data)
  ), []);

  const buildComposerPreferences = useCallback(() => ({
    selectedCapabilities,
    mediaSettings,
    mediaSourceImages: sanitizeMediaSourceImagesForPreferences(mediaSourceImages),
    recordCreationTargetModuleId,
    processOperationMode,
    modelOverrides,
    skipGenerationConfirmationByKind,
    currentModelOverride: modelOverrideRef.current || null,
  }), [mediaSettings, mediaSourceImages, modelOverrides, processOperationMode, recordCreationTargetModuleId, sanitizeMediaSourceImagesForPreferences, selectedCapabilities, skipGenerationConfirmationByKind]);

  useEffect(() => {
    composerPreferencesRef.current = buildComposerPreferences();
  }, [buildComposerPreferences]);

  const applyComposerPreferences = useCallback((raw: any, options: { preferCurrentInitial?: boolean } = {}) => {
    const prefs = raw && typeof raw === 'object' ? raw : {};
    const preferenceCapabilities = Array.isArray(prefs.selectedCapabilities)
      ? normalizeInitialCapabilities(prefs.selectedCapabilities)
      : null;
    if (Array.isArray(prefs.selectedCapabilities)) {
      const nextCapabilities = preferenceCapabilities || [];
      if (nextCapabilities.length || !options.preferCurrentInitial) {
        setSelectedCapabilities(nextCapabilities);
        setProcessOperationMode(nextCapabilities.includes('process_operation'));
      }
    }
    if (Object.prototype.hasOwnProperty.call(prefs, 'processOperationMode') && !Array.isArray(prefs.selectedCapabilities)) {
      setProcessOperationMode(prefs.processOperationMode === true);
    }
    if (prefs.mediaSettings && typeof prefs.mediaSettings === 'object') {
      setMediaSettings(prefs.mediaSettings as AiMediaSettings);
    }
    if (Array.isArray(prefs.mediaSourceImages)) {
      setMediaSourceImages(sanitizeMediaSourceImagesForPreferences(prefs.mediaSourceImages as AiMediaSourceImage[]));
    }
    if (Object.prototype.hasOwnProperty.call(prefs, 'recordCreationTargetModuleId')) {
      setRecordCreationTargetModuleId(String(prefs.recordCreationTargetModuleId || '').trim() || null);
    }
    const loadedOverrides = prefs.modelOverrides && typeof prefs.modelOverrides === 'object'
      ? Object.fromEntries(Object.entries(prefs.modelOverrides)
        .map(([key, value]) => [String(key), String(value || '').trim()])
        .filter(([, value]) => value))
      : {};
    if (prefs.modelOverrides && typeof prefs.modelOverrides === 'object') setModelOverrides(loadedOverrides);
    if (Object.prototype.hasOwnProperty.call(prefs, 'currentModelOverride')) {
      modelOverrideRef.current = String(prefs.currentModelOverride || '').trim() || null;
    }
    if (preferenceCapabilities?.includes('text_chat')) {
      setProcessOperationMode(false);
      setRecordCreationTargetModuleId(null);
      setMediaSourceImages([]);
      setPendingAiAction(null);
    }
    if (prefs.skipGenerationConfirmationByKind && typeof prefs.skipGenerationConfirmationByKind === 'object') {
      setSkipGenerationConfirmationByKind(Object.fromEntries(Object.entries(prefs.skipGenerationConfirmationByKind)
        .map(([key, value]) => [String(key), value === true])
        .filter(([, value]) => value)));
    }
  }, [sanitizeMediaSourceImagesForPreferences]);

  useEffect(() => {
    if (pendingAiAction?.actionType === 'confirm_generation') setRememberGenerationPreference(false);
  }, [pendingAiAction?.id, pendingAiAction?.actionType]);

  useEffect(() => {
    const actionType = String(pendingAiAction?.actionType || '');
    if (actionType === 'create_record_from_prompt' || actionType === 'update_record_from_prompt') {
      setQuickRecordFormOpen(true);
    }
  }, [pendingAiAction?.id, pendingAiAction?.actionType]);

  useEffect(() => {
    if (active) return undefined;
    return scheduleOverlayLockRelease();
  }, [active]);

  useEffect(() => () => {
    scheduleOverlayLockRelease(0);
  }, []);

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
  const activeMediaModelId = imageMode
    ? modelOverrides.image_generation || modelOverrideRef.current
    : videoMode
      ? modelOverrides.video_generation || modelOverrideRef.current
      : voiceOutputMode
        ? modelOverrides.voice_output || modelOverrideRef.current
        : null;
  const workflowCapabilityCount = selectedCapabilities.filter((capability) => (
    capability === 'record_creation'
    || capability === 'process_operation'
    || capability === 'document_generation'
  )).length;
  // Image and video generation consume attached images as provider references,
  // so they must not be diverted into the generic analysis bundle.
  const shouldUseTaskBundle = !imageMode && !videoMode && (bundleInputs.length > 0 || workflowCapabilityCount > 1);
  const handleComposerCapabilitiesChange = useCallback((next: AiComposerCapability[]) => {
    const normalizedNext = normalizeAiComposerCapabilities(next);
    setSelectedCapabilities(normalizedNext);
    setAutoSuggestedCapabilities([]);
    const wantsProcessOperation = normalizedNext.includes('process_operation');
    setProcessOperationMode(wantsProcessOperation);
    if (normalizedNext.includes('text_chat')) setPendingAiAction(null);
    if (!normalizedNext.includes('record_creation')) {
      setRecordCreationTargetModuleId(null);
    }
  }, []);
  const recordCreationModuleOptions = useMemo(() => buildAiRecordModuleOptions(), []);
  const recordCreationSchema = useMemo(
    () => recordCreationTargetModuleId ? buildAiRecordCreationSchema(recordCreationTargetModuleId) : null,
    [recordCreationTargetModuleId],
  );
  const pendingRecordCreationSchema = useMemo(
    () => ['create_record_from_prompt', 'update_record_from_prompt'].includes(String(pendingAiAction?.actionType || '')) && pendingAiAction?.schema
      ? pendingAiAction.schema
      : null,
    [pendingAiAction],
  );
  const activeRecordCreationSchema = recordCreationSchema || pendingRecordCreationSchema;

  const callAssistant = useCallback(async (body: Record<string, any>) => {
    const requestBody = {
      ...body,
      composerPreferences: body.composerPreferences ?? composerPreferencesRef.current,
    };
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body: requestBody });
    if (error) throw error;
    if (!data?.success) {
      const nextError: any = new Error(String(data?.message || 'درخواست دستیار ناموفق بود.'));
      nextError.payload = data;
      throw nextError;
    }
    return data;
  }, []);

  const copyText = useCallback(async (text: string, label = 'متن') => {
    const value = String(text || '').trim();
    if (!value) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(value);
      message?.success?.(`${label} کپی شد.`);
    } catch {
      message?.error?.('کپی کردن متن ناموفق بود.');
    }
  }, [message]);

  const forwardMessage = useCallback(async (input: any) => {
    if (onForwardMessage) {
      await onForwardMessage(input);
      return;
    }
    const text = String(input?.content || '').trim();
    const attachments = Array.isArray(input?.attachments) ? input.attachments : [];
    if (!text && attachments.length === 0) return;
    navigate('/messages', {
      state: {
        aiForwardMessage: {
          ...input,
          content: text,
          attachments,
        },
      },
    });
  }, [navigate, onForwardMessage]);

  const createActivityFromMessage = useCallback(async (input: any) => {
    if (openCreateActivityFromMessage) {
      await openCreateActivityFromMessage(input);
      return;
    }
    const content = String(input?.content || '').trim();
    if (!content) return;
    const relatedModuleId = context.mode === 'record' ? String(context.moduleId || '').trim() : '';
    const relatedRecordId = context.mode === 'record' ? String(context.recordId || '').trim() : '';
    if (!relatedModuleId || !relatedRecordId) {
      message.info('برای ایجاد فعالیت، گفتگو باید روی صفحه یک رکورد باز باشد.');
      return;
    }
    try {
      const title = content.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 90) || 'پیگیری پیام هوش مصنوعی';
      const description = [
        `منبع: ${input?.actorName || 'هوش مصنوعی'}`,
        input?.createdAtLabel ? `زمان پیام: ${input.createdAtLabel}` : '',
        '',
        content,
      ].filter(Boolean).join('\n');
      const { error } = await supabase.from('tasks').insert({
        name: title,
        status: 'todo',
        priority: 'medium',
        task_type: 'فعالیت سازمانی',
        related_to_module: relatedModuleId,
        source_record_id: relatedRecordId,
        description,
      });
      if (error) throw error;
      message.success('فعالیت از روی پیام ساخته شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ایجاد فعالیت از روی پیام ناموفق بود.'));
    }
  }, [context.mode, context.moduleId, context.recordId, message, openCreateActivityFromMessage]);

  const stopActiveStream = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
  }, []);

  const callAssistantStream = useCallback(async (
    body: Record<string, any>,
    handlers: {
      onMeta?: (payload: any) => void;
      onDelta?: (text: string) => void;
      onDone?: (payload: any) => void;
      onError?: (payload: any) => void;
    },
  ) => {
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    if (!token) throw new Error('نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.');
    const controller = new AbortController();
    streamAbortRef.current = controller;
    const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/ai-assistant`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, action: 'chat_stream', composerPreferences: body.composerPreferences ?? composerPreferencesRef.current }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const raw = await response.text();
      const parsed = (() => {
        try { return JSON.parse(raw); } catch { return null; }
      })();
      throw new Error(String(parsed?.message || raw || 'ارتباط با دستیار ناموفق بود.'));
    }
    if (!response.body) throw new Error('پاسخ زنده از دستیار دریافت نشد.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let terminalEventReceived = false;
    let streamedText = '';
    const handleEvent = (rawEvent: string) => {
      const eventName = rawEvent.split(/\r?\n/).find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
      const dataText = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (!dataText) return;
      let payload: any = null;
      try { payload = JSON.parse(dataText); } catch { payload = { text: dataText }; }
      if (eventName === 'meta') handlers.onMeta?.(payload);
      if (eventName === 'delta') {
        const text = String(payload?.text || '');
        streamedText += text;
        handlers.onDelta?.(text);
      }
      if (eventName === 'done') {
        terminalEventReceived = true;
        handlers.onDone?.(payload);
      }
      if (eventName === 'error') {
        terminalEventReceived = true;
        handlers.onError?.(payload);
      }
    };

    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || '';
        parts.forEach((part) => {
          if (part.trim()) handleEvent(part);
        });
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleEvent(buffer);
    } catch (error) {
      if (controller.signal.aborted) throw error;
      handlers.onError?.({
        success: false,
        message: 'ارتباط زنده با دستیار پیش از پایان پاسخ قطع شد.',
        incomplete: true,
        finishReason: 'stream_interrupted',
        partialContent: streamedText,
      });
      return;
    }
    if (!terminalEventReceived) {
      handlers.onError?.({
        success: false,
        message: 'ارتباط زنده با دستیار پیش از پایان پاسخ قطع شد.',
        incomplete: true,
        finishReason: 'stream_interrupted',
        partialContent: streamedText,
      });
    }
    if (streamAbortRef.current === controller) streamAbortRef.current = null;
  }, []);

  const buildBundleInputPayloads = useCallback(async () => Promise.all(bundleInputs.map(async (item) => {
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
  })), [bundleInputs]);

  const requestAutoRoute = useCallback(async (params: {
    messageText: string;
    inputKind: string;
    bundlePayload?: any[];
    forceNewThread?: boolean;
  }) => {
    const data = await callAssistant({
      action: 'suggest_auto_capabilities',
      message: params.messageText,
      inputKind: params.inputKind,
      bundle: params.bundlePayload?.length ? { inputs: params.bundlePayload } : undefined,
      threadId: params.forceNewThread ? null : threadId,
      forceNewThread: params.forceNewThread === true,
      context: contextWithSelection,
      modelOverride: modelOverrideRef.current,
    });
    const rawSuggestedCapabilities = Array.from(new Set(
      Array.isArray(data?.capabilities)
        ? data.capabilities.map((item: any) => String(item || '').trim()).filter(Boolean)
        : [],
    )) as AiComposerCapability[];
    const suggestedCapabilities = isImagePromptOnlyRequest(params.messageText)
      ? rawSuggestedCapabilities.filter((capability) => capability !== 'image_generation')
      : rawSuggestedCapabilities;
    const result = {
      suggestedCapabilities,
      targetModuleId: String(data?.targetModuleId || '').trim() || null,
      mutationMode: String(data?.mutationMode || '').trim() === 'update' ? 'update' as const : 'create' as const,
      voiceTranscripts: Array.isArray(data?.voiceTranscripts) ? data.voiceTranscripts : [],
      agentPlan: data?.agentPlan && typeof data.agentPlan === 'object' ? data.agentPlan : null,
    };
    setAutoSuggestedCapabilities(result.suggestedCapabilities);
    return result;
  }, [callAssistant, contextWithSelection, threadId]);

  const executeAutoRoute = useCallback(async (params: {
    messageText: string;
    inputKind: string;
    bundlePayload?: any[];
    forceNewThread?: boolean;
    route?: any;
  }) => {
    const bundlePayload = Array.isArray(params.bundlePayload) ? params.bundlePayload : [];
    const route = params.route || await requestAutoRoute({
      messageText: params.messageText,
      inputKind: params.inputKind,
      bundlePayload,
      forceNewThread: params.forceNewThread,
    });
    const clarificationQuestions = Array.isArray(route?.agentPlan?.clarification_questions)
      ? route.agentPlan.clarification_questions.map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 3)
      : [];
    const withAgentPlan = async (result: any) => ({
      ...(await result),
      ...(route?.agentPlan ? { agentPlan: route.agentPlan } : {}),
    });
    if (clarificationQuestions.length > 0) {
      return {
        success: true,
        answer: `برای انجام دقیق درخواست، لطفاً این موارد را مشخص کنید:\n${clarificationQuestions.map((question: string) => `• ${question}`).join('\n')}`,
        agentPlan: route.agentPlan,
      };
    }
    const routeCapabilities = route.suggestedCapabilities;
    const capabilitySet = new Set(routeCapabilities);
    const mutationTargetModuleId = route.targetModuleId
      || (route.mutationMode === 'update' ? String(contextWithSelection.moduleId || '').trim() : '');
    const autoRecordSchema = capabilitySet.has('record_creation') && mutationTargetModuleId
      ? buildAiRecordCreationSchema(mutationTargetModuleId)
      : null;
    if (capabilitySet.has('record_creation') && !autoRecordSchema) {
      return {
        success: true,
        answer: 'برای ساخت یا ویرایش دقیق، نوع رکورد و در صورت ویرایش، رکورد هدف را مشخص کنید.',
        agentPlan: route.agentPlan,
      };
    }

    if (capabilitySet.has('image_generation')) {
      const autoSourceImages = composerImageSources;
      const prompt = params.messageText || 'این تصویر را با توجه به درخواست کاربر اصلاح یا کامل کن.';
      const confirmBody = {
        action: 'generate_image',
        prompt,
        capabilities: routeCapabilities,
        inputKind: params.inputKind,
        threadId: params.forceNewThread ? null : threadId,
        forceNewThread: params.forceNewThread === true,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        settings: mediaSettings,
        sourceImages: autoSourceImages,
        sourceImageUrls: imageEditSourceUrl ? [imageEditSourceUrl] : [],
      };
      if (skipGenerationConfirmationByKind.image_generation === true) return await withAgentPlan(callAssistant(confirmBody));
      return await withAgentPlan(buildLocalGenerationConfirmation({
        kind: 'image_generation',
        prompt,
        settings: mediaSettings,
        rows: buildGenerationSettingsRows('image_generation', mediaSettings, {
          sourceImageCount: autoSourceImages.length + (imageEditSourceUrl ? 1 : 0),
        }),
        confirmBody,
      }));
    }

    if (capabilitySet.has('voice_output') && !capabilitySet.has('voice_input') && bundlePayload.length === 0) {
      const prompt = params.messageText || 'این متن را به فایل صوتی تبدیل کن.';
      const confirmBody = {
        action: 'generate_voice_output',
        text: prompt,
        capabilities: routeCapabilities,
        inputKind: params.inputKind,
        threadId: params.forceNewThread ? null : threadId,
        forceNewThread: params.forceNewThread === true,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        settings: mediaSettings,
      };
      if (skipGenerationConfirmationByKind.voice_output === true) return await withAgentPlan(callAssistant(confirmBody));
      return await withAgentPlan(buildLocalGenerationConfirmation({
        kind: 'voice_output',
        prompt,
        settings: mediaSettings,
        rows: buildGenerationSettingsRows('voice_output', mediaSettings),
        confirmBody,
      }));
    }

    if (capabilitySet.has('video_generation')) {
      const prompt = params.messageText || 'با توجه به درخواست کاربر ویدیو بساز.';
      const autoSourceImages = composerImageSources;
      const confirmBody = {
        action: 'generate_video',
        prompt,
        capabilities: routeCapabilities,
        inputKind: params.inputKind,
        threadId: params.forceNewThread ? null : threadId,
        forceNewThread: params.forceNewThread === true,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        settings: mediaSettings,
        sourceImages: autoSourceImages,
      };
      if (skipGenerationConfirmationByKind.video_generation === true) return await withAgentPlan(callAssistant(confirmBody));
      return await withAgentPlan(buildLocalGenerationConfirmation({
        kind: 'video_generation',
        prompt,
        settings: mediaSettings,
        rows: buildGenerationSettingsRows('video_generation', mediaSettings, {
          sourceImageCount: autoSourceImages.length,
        }),
        confirmBody,
      }));
    }

    if (capabilitySet.has('document_generation')) {
      const format = String(mediaSettings.format || 'docx');
      const prompt = params.messageText || (bundlePayload.length > 0
        ? 'بر اساس ورودی‌های پیوست‌شده فایل مناسب را بساز.'
        : 'بر اساس درخواست کاربر فایل مناسب را بساز.');
      const confirmBody = bundlePayload.length > 0
        ? {
          action: 'run_task_bundle',
          capabilities: routeCapabilities,
          message: prompt,
          userMessageText: params.messageText,
          inputKind: 'task_bundle',
          bundle: { inputs: bundlePayload },
          threadId: params.forceNewThread ? null : threadId,
          forceNewThread: params.forceNewThread === true,
          context: contextWithSelection,
          modelOverride: modelOverrideRef.current,
          settings: mediaSettings,
          previewOnly: false,
        }
        : {
          action: 'generate_document',
          prompt,
          format,
          capabilities: routeCapabilities,
          inputKind: params.inputKind,
          threadId: params.forceNewThread ? null : threadId,
          forceNewThread: params.forceNewThread === true,
          context: contextWithSelection,
          modelOverride: modelOverrideRef.current,
          settings: mediaSettings,
        };
      if (skipGenerationConfirmationByKind.document_generation === true) return await withAgentPlan(callAssistant(confirmBody));
      return await withAgentPlan(buildLocalGenerationConfirmation({
        kind: 'document_generation',
        prompt,
        settings: mediaSettings,
        rows: buildGenerationSettingsRows('document_generation', mediaSettings, {
          format,
          bundleInputCount: bundlePayload.length,
        }),
        confirmBody,
      }));
    }

    const executionBundlePayload = bundlePayload.map((item) => {
      if (String(item?.type || '') !== 'voice') return item;
      const transcript = route.voiceTranscripts.find((entry: any) => String(entry?.inputId || '') === String(item?.id || ''));
      return transcript?.transcript
        ? { ...item, text: String(transcript.transcript), audio: null }
        : item;
    });

    if (bundlePayload.length > 0
      || capabilitySet.has('document_analysis')
      || capabilitySet.has('voice_input')
      || capabilitySet.has('record_creation')
      || capabilitySet.has('process_operation')) {
      return await withAgentPlan(callAssistant({
        action: 'run_task_bundle',
        capabilities: routeCapabilities,
        message: params.messageText || (autoRecordSchema
          ? 'از ورودی‌های پیوست‌شده یک رکورد جدید بساز.'
          : capabilitySet.has('process_operation')
          ? 'با توجه به ورودی‌های پیوست‌شده، اقدام لازم را پیشنهاد بده.'
          : 'ورودی‌های پیوست‌شده را بررسی کن.'),
        userMessageText: params.messageText,
        inputKind: bundlePayload.length > 0 ? 'task_bundle' : params.inputKind,
        bundle: executionBundlePayload.length ? { inputs: executionBundlePayload } : undefined,
        threadId: params.forceNewThread ? null : threadId,
        forceNewThread: params.forceNewThread === true,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        settings: mediaSettings,
        recordCreation: autoRecordSchema,
        recordMutationMode: route.mutationMode,
        previewOnly: true,
      }));
    }

    return await withAgentPlan(callAssistant({
      action: 'chat',
      capability: routeCapabilities.includes('legal_assistant')
        ? 'legal_assistant'
        : routeCapabilities.includes('deep_reasoning')
        ? 'deep_reasoning'
        : contextWithSelection.mode === 'record'
        ? 'record_chat'
        : 'dashboard_chat',
      capabilities: routeCapabilities,
      message: params.messageText,
      inputKind: params.inputKind,
      threadId: params.forceNewThread ? null : threadId,
      forceNewThread: params.forceNewThread === true,
      context: contextWithSelection,
      modelOverride: modelOverrideRef.current,
    }));
  }, [callAssistant, composerImageSources, contextWithSelection, imageEditSourceUrl, mediaSettings, requestAutoRoute, skipGenerationConfirmationByKind, threadId]);

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
    if (recheckingId) return;
    const kind = String(item?.metadata?.kind || '') as AiGenerationKind;
    const startedAt = Number(item?.metadata?.started_at || 0);
    const currentThreadId = threadId;
    setRecheckingId(item.id);
    try {
      if (kind === 'image_generation') {
        const messageId = String(item?.metadata?.server_message_id || item?.id || '').trim();
        if (messageId && !messageId.startsWith('assistant-image-pending')) {
          const poll = await callAssistant({ action: 'get_image_status', messageId, threadId: currentThreadId });
          if (poll?.status === 'processing' || poll?.status === 'delayed') {
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
                  failed_note: poll?.diagnosticMessage || poll.message.metadata?.failed_note || m.metadata?.failed_note || null,
                  manual_recheck_only: poll?.status === 'delayed' ? true : poll.message.metadata?.manual_recheck_only || m.metadata?.manual_recheck_only || false,
                  server_message_id: poll.message.id || messageId,
                },
              } : m));
            } else if (poll?.diagnosticMessage) {
              setMessages((prev) => prev.map((m) => m.id === item.id
                ? { ...m, metadata: { ...(m.metadata || {}), failed_note: poll.diagnosticMessage, manual_recheck_only: poll?.status === 'delayed' ? true : m.metadata?.manual_recheck_only || false } }
                : m));
            }
            return;
          }
          if (poll?.status === 'completed' && poll?.message && typeof poll.message === 'object') {
            resolvePendingMessage(item.id, poll.message);
            return;
          }
          if (poll?.status === 'failed') {
            const serverMessage = poll?.message && typeof poll.message === 'object' ? poll.message : null;
            const failureContent = serverMessage
              ? normalizeAiMessageText(serverMessage.content) || 'ساخت تصویر ناموفق بود.'
              : String(poll?.message || poll?.diagnosticMessage || 'ساخت تصویر ناموفق بود.');
            setMessages((prev) => prev.map((m) => m.id === item.id
              ? {
                ...m,
                id: String(serverMessage?.id || m.id),
                content: failureContent,
                provider: serverMessage?.provider || m.provider || null,
                model: serverMessage?.model || m.model || null,
                metadata: {
                  ...(m.metadata || {}),
                  ...(serverMessage?.metadata || {}),
                  pending_status: false,
                  failed: true,
                },
              }
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
  }, [callAssistant, contextWithSelection, recheckingId, resolvePendingMessage, threadId]);

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
      if (data?.thread) onThreadUpserted?.(data.thread);
      const loadedThreadTitle = String(data?.thread?.title || '').trim() || 'گفتگوی هوش مصنوعی';
      setThreadTitle(loadedThreadTitle);
      setDraftThreadTitle(loadedThreadTitle);
      setEditingThreadTitle(false);
      const loadedOverrides = data?.thread?.metadata?.model_overrides && typeof data.thread.metadata.model_overrides === 'object'
        ? data.thread.metadata.model_overrides
        : {};
      setModelOverrides(Object.fromEntries(Object.entries(loadedOverrides)
        .map(([key, value]) => [String(key), String(value || '').trim()])
        .filter(([, value]) => value)));
      const loadedComposerPreferences = data?.thread?.metadata?.composer_preferences && typeof data.thread.metadata.composer_preferences === 'object'
        ? data.thread.metadata.composer_preferences
        : null;
      if (loadedComposerPreferences) applyComposerPreferences(loadedComposerPreferences);
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
  }, [active, applyComposerPreferences, callAssistant, message, onThreadUpserted, threadId]);

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
    setThreadTitle(initialTitle);
    setDraftThreadTitle(initialTitle);
    setEditingThreadTitle(false);
    setPendingAiAction(null);
    const nextInitialCapabilities = normalizeInitialCapabilities(initialCapabilities);
    const startsInTextChatMode = nextInitialCapabilities.includes('text_chat');
    setSelectedCapabilities(nextInitialCapabilities);
    setAutoSuggestedCapabilities([]);
    setRecordCreationTargetModuleId(startsInTextChatMode ? null : String(initialRecordCreationTargetModuleId || '').trim() || null);
    setProcessOperationMode(nextInitialCapabilities.includes('process_operation'));
    setMediaSettings(initialMediaSettings && typeof initialMediaSettings === 'object' ? initialMediaSettings : {});
    setMediaSourceImages(startsInTextChatMode ? [] : sanitizeMediaSourceImagesForPreferences(Array.isArray(initialMediaSourceImages) ? initialMediaSourceImages : []));
    const seededFiles = (startsInTextChatMode
      ? []
      : (Array.isArray(initialFiles) ? initialFiles : []).concat(initialFile?.fileName ? [initialFile] : []))
      .filter((item): item is AiUploadedFilePrompt & { message?: string | null } => Boolean(item?.fileName));
    setBundleInputs(seededFiles.map((filePrompt, index) => ({
      id: `initial-file-${Date.now()}-${index}`,
      type: isAiImageFilePrompt(filePrompt) ? 'image' : 'file',
      label: filePrompt.fileName || 'فایل پیوست',
      file: filePrompt,
    })));
    modelOverrideRef.current = String(initialModelOverride || '').trim() || null;
    setModelOverrides({});
    autoSubmittedInitialPromptRef.current = '';
    autoSubmittedInitialBundleRef.current = '';
  }, [active, contextKey, initialCapabilities, initialFile, initialFiles, initialMediaSettings, initialMediaSourceImages, initialModelOverride, initialRecordCreationTargetModuleId, initialTitle, normalizedInitialThreadId, sanitizeMediaSourceImagesForPreferences]);

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
      if (!shouldStickToBottomRef.current) return;
      if (typeof node.scrollTo === 'function') {
        node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
        return;
      }
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [active, messages, submitting]);

  const handleMessageScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    shouldStickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
  }, []);

  const submitChat = useCallback(async (rawText?: string, inputKind = 'text') => {
    const text = String(rawText ?? input).trim();
    if (!text || submitting) return;
    const assistantText = pendingAiAction && activeRecordCreationSchema
      ? buildPendingActionRevisionPrompt(pendingAiAction, text)
      : text;
    const shouldStartProcessGuideThread = false;
    if (rawText === undefined) setInput('');
    if (!threadId) {
      const optimisticTitle = buildSmartAiThreadTitle(text);
      setThreadTitle(optimisticTitle);
      setDraftThreadTitle(optimisticTitle);
    }
    setPendingAiAction(null);
    if (selectedCapabilities.length > 0) setAutoSuggestedCapabilities([]);
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString(), metadata: { input_kind: inputKind } };
    const thinkingMessage: ChatMessage = {
      id: `assistant-pending-${Date.now()}`,
      role: 'assistant',
      content: selectedCapabilities.length > 0
        ? buildAiPendingStatusText(selectedCapabilities)
        : 'در حال تصمیم‌گیری و آماده‌سازی پاسخ...',
      created_at: new Date().toISOString(),
      metadata: { pending_status: true, capabilities: selectedCapabilities.length > 0 ? selectedCapabilities : ['auto_router'] },
    };
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setSubmitting(true);
    try {
      const runStreamingChat = async (streamBody: Record<string, any>) => {
        let serverError: any = null;
        await callAssistantStream(streamBody, {
          onMeta: (payload) => {
            if (payload?.threadId) setThreadId(String(payload.threadId));
            applyThreadTitleFromResponse(payload, text);
            setMessages((prev) => prev.map((item) => {
              if (item.id === userMessage.id) return { ...item, id: payload?.userMessageId || item.id };
              if (item.id === thinkingMessage.id) {
                return {
                  ...item,
                  content: '',
                  provider: payload?.provider || null,
                  model: payload?.model || null,
                  metadata: {
                    ...(item.metadata || {}),
                    pending_status: true,
                    streaming: true,
                    source_user_text: text,
                  },
                };
              }
              return item;
            }));
          },
          onDelta: (delta) => {
            if (!delta) return;
            setMessages((prev) => prev.map((item) => item.id === thinkingMessage.id
              ? { ...item, content: `${String(item.content || '')}${delta}` }
              : item));
          },
          onDone: (payload) => {
            if (payload?.threadId) setThreadId(String(payload.threadId));
            applyThreadTitleFromResponse(payload, text);
            setMessages((prev) => prev.map((item) => {
              if (item.id === thinkingMessage.id) {
                return {
                  ...item,
                  id: payload?.messageId || item.id,
                  content: normalizeAiMessageText(payload?.answer) || normalizeAiMessageText(item.content) || 'پاسخی دریافت نشد.',
                  provider: payload?.provider || item.provider || null,
                  model: payload?.model || item.model || null,
                  metadata: {
                    ...(item.metadata || {}),
                    pending_status: false,
                    streaming: false,
                    failed: false,
                    incomplete: payload?.incomplete === true,
                    finish_reason: payload?.finishReason || payload?.finish_reason || null,
                    usage: payload?.usage,
                    attachments: Array.isArray(payload?.attachments) ? payload.attachments : [],
                  },
                };
              }
              return item;
            }));
          },
          onError: (payload) => {
            serverError = payload;
            const errorText = toFaErrorMessage(payload, String(payload?.message || 'ارتباط با دستیار ناموفق بود.'));
            const recoverableError = isRecoverableStreamError(payload);
            if (payload?.threadId) setThreadId(String(payload.threadId));
            setMessages((prev) => prev.map((item) => item.id === thinkingMessage.id
              ? {
                ...item,
                id: payload?.messageId || item.id,
                content: recoverableError ? buildRecoverableStreamContent(item.content, payload, errorText) : errorText,
                metadata: {
                  ...(item.metadata || {}),
                  pending_status: false,
                  streaming: false,
                  failed: !recoverableError,
                  incomplete: recoverableError || payload?.incomplete === true,
                  finish_reason: payload?.finishReason || payload?.finish_reason || null,
                  source_user_text: text,
                },
              }
              : item));
          },
        });
        if (serverError) {
          if (isRecoverableStreamError(serverError)) {
            message?.warning?.(PARTIAL_STREAM_NOTICE);
          } else {
            message?.error?.(toFaErrorMessage(serverError, String(serverError?.message || 'ارتباط با دستیار ناموفق بود.')));
          }
        }
      };

      let plannedAutoRoute: any = null;
      let plannedRecordMutationMode: 'create' | 'update' = pendingAiAction?.actionType === 'update_record_from_prompt'
        ? 'update'
        : 'create';
      if (activeRecordCreationSchema) {
        const route = await requestAutoRoute({
          messageText: assistantText,
          inputKind,
          forceNewThread: shouldStartProcessGuideThread,
        });
        plannedAutoRoute = route;
        if (route?.mutationMode === 'update') plannedRecordMutationMode = 'update';
        if (route?.agentPlan) {
          setMessages((prev) => prev.map((item) => item.id === thinkingMessage.id ? {
            ...item,
            metadata: { ...(item.metadata || {}), agent_plan: route.agentPlan },
          } : item));
        }
      }
      if (!processOperationMode && !activeRecordCreationSchema) {
        let streamCapabilities: AiComposerCapability[] = selectedCapabilities.filter((capability) => capability !== 'text_chat');
        let streamCapability = selectedCapabilities.includes('legal_assistant')
          ? 'legal_assistant'
          : selectedCapabilities.includes('deep_reasoning')
          ? 'deep_reasoning'
          : contextWithSelection.mode === 'record'
          ? 'record_chat'
          : 'dashboard_chat';
        let canStream = selectedCapabilities.every((capability) => !NON_STREAM_CHAT_CAPABILITIES.has(capability));
        if (selectedCapabilities.length === 0) {
          const route = await requestAutoRoute({
            messageText: assistantText,
            inputKind,
            forceNewThread: shouldStartProcessGuideThread,
          });
          plannedAutoRoute = route;
          if (route.agentPlan) {
            setMessages((prev) => prev.map((item) => item.id === thinkingMessage.id ? {
              ...item,
              metadata: { ...(item.metadata || {}), agent_plan: route.agentPlan },
            } : item));
          }
          streamCapabilities = route.suggestedCapabilities;
          const capabilitySet = new Set(streamCapabilities);
          const hasClarificationQuestions = Array.isArray(route?.agentPlan?.clarification_questions)
            && route.agentPlan.clarification_questions.some((item: any) => String(item || '').trim());
          canStream = !hasClarificationQuestions
            && streamCapabilities.every((capability) => !NON_STREAM_CHAT_CAPABILITIES.has(capability));
          streamCapability = capabilitySet.has('legal_assistant')
            ? 'legal_assistant'
            : capabilitySet.has('deep_reasoning')
            ? 'deep_reasoning'
            : contextWithSelection.mode === 'record'
            ? 'record_chat'
            : 'dashboard_chat';
        }
        if (canStream) {
          await runStreamingChat({
            action: 'chat_stream',
            capability: streamCapability,
            capabilities: streamCapabilities,
            message: assistantText,
            inputKind,
            threadId: shouldStartProcessGuideThread ? null : threadId,
            forceNewThread: shouldStartProcessGuideThread,
            context: contextWithSelection,
            modelOverride: modelOverrideRef.current,
          });
          return;
        }
      }

      const data = await (selectedCapabilities.length === 0 && !processOperationMode && !activeRecordCreationSchema
        ? executeAutoRoute({
          messageText: assistantText,
          inputKind,
          forceNewThread: shouldStartProcessGuideThread,
          route: plannedAutoRoute,
        })
        : callAssistant(processOperationMode ? {
        action: 'process_operation_from_prompt',
        capability: 'record_chat',
        capabilities: selectedCapabilities.filter((capability) => capability !== 'text_chat'),
        message: assistantText,
        inputKind,
        threadId: shouldStartProcessGuideThread ? null : threadId,
        forceNewThread: shouldStartProcessGuideThread,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        previewOnly: true,
      } : activeRecordCreationSchema ? {
        action: plannedRecordMutationMode === 'update' ? 'update_record_from_prompt' : 'create_record_from_prompt',
        outputMode: plannedRecordMutationMode === 'update' ? 'update_record' : 'create_record',
        capability: contextWithSelection.mode === 'record' ? 'record_chat' : 'dashboard_chat',
        capabilities: selectedCapabilities.filter((capability) => capability !== 'text_chat'),
        message: assistantText,
        inputKind,
        threadId: shouldStartProcessGuideThread ? null : threadId,
        forceNewThread: shouldStartProcessGuideThread,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
        recordCreation: activeRecordCreationSchema,
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
        capabilities: selectedCapabilities.filter((capability) => capability !== 'text_chat'),
        message: assistantText,
        inputKind,
        threadId: shouldStartProcessGuideThread ? null : threadId,
        forceNewThread: shouldStartProcessGuideThread,
        context: contextWithSelection,
        modelOverride: modelOverrideRef.current,
      }));
      if (data?.proposedAction?.id) setPendingAiAction(data.proposedAction);
      if (data.threadId) setThreadId(String(data.threadId));
      applyThreadTitleFromResponse(data, text);
      if (data?.autoAction === 'generate_image') {
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
                  content: 'در حال ساخت تصویر...',
                  provider: data.provider || null,
                  model: data.model || null,
                  metadata: {
                    ...(item.metadata || {}),
                    pending_status: true,
                    capabilities: ['image_generation'],
                    kind: 'image_generation',
                    started_at: Date.now(),
                    server_message_id: data.messageId || null,
                  },
                };
              }
              return item;
            }));
          }
          return;
        }
        const newImageUrl = data?.image ? resolveAiAttachmentUrl(data.image) : '';
        if (newImageUrl) setImageEditSourceUrl(newImageUrl);
      }
      if (data?.autoAction === 'generate_video') {
        const videoId = String(data?.videoId || '').trim();
        setMessages((prev) => prev.map((item) => item.id === thinkingMessage.id
          ? {
            ...item,
            id: data?.messageId || item.id,
            content: 'در حال ساخت ویدیو... (ممکن است چند دقیقه طول بکشد)',
            provider: data.provider || null,
            model: data.model || null,
            metadata: {
              ...(item.metadata || {}),
              pending_status: true,
              capabilities: ['video_generation'],
              kind: 'video_generation',
              started_at: Date.now(),
              video_id: videoId,
              server_message_id: data?.messageId || null,
            },
          }
          : item));
        return;
      }
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== thinkingMessage.id),
        {
          id: data.messageId || `assistant-${Date.now()}`,
          role: 'assistant',
          content: normalizeAiMessageText(data.answer) || (data?.autoAction === 'generate_voice_output' ? 'فایل صوتی آماده شد.' : 'پاسخی دریافت نشد.'),
            metadata: {
              usage: data.usage,
              ...(data?.agentPlan ? { agent_plan: data.agentPlan } : {}),
              attachments: Array.isArray(data.attachments) ? data.attachments : [],
            ...(data?.file ? { file: data.file } : {}),
            ...(data?.image ? { image: data.image } : {}),
          },
          provider: data.provider || null,
          model: data.model || null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        streamAbortRef.current = null;
        setMessages((prev) => prev.map((item) => item.id === thinkingMessage.id
          ? {
            ...item,
            content: normalizeAiMessageText(item.content) || 'دریافت پاسخ متوقف شد.',
            metadata: {
              ...(item.metadata || {}),
              pending_status: false,
              streaming: false,
              stopped: true,
              source_user_text: text,
            },
          }
          : item));
        return;
      }
      streamAbortRef.current = null;
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
  }, [activeRecordCreationSchema, applyThreadTitleFromResponse, callAssistant, callAssistantStream, contextWithSelection, executeAutoRoute, input, message, pendingAiAction, processOperationMode, requestAutoRoute, selectedCapabilities, submitting, threadId]);

  useEffect(() => {
    const prompt = String(initialPrompt || '').trim();
    if (!active || initialFile || !autoSubmitInitialPrompt || !prompt || submitting || loadingThread) return;
    const expectedCapabilities = normalizeInitialCapabilities(initialCapabilities);
    const capabilitiesReady = expectedCapabilities.length === selectedCapabilities.length
      && expectedCapabilities.every((capability) => selectedCapabilities.includes(capability));
    const expectedRecordTarget = String(initialRecordCreationTargetModuleId || '').trim() || null;
    const recordTargetReady = String(recordCreationTargetModuleId || '') === String(expectedRecordTarget || '');
    if (!capabilitiesReady || !recordTargetReady) return;
    const signature = `${normalizedInitialThreadId || 'new'}:${normalizedInitialInputKind}:${prompt}`;
    if (autoSubmittedInitialPromptRef.current === signature) return;
    autoSubmittedInitialPromptRef.current = signature;
    setInput('');
    void submitChat(prompt, normalizedInitialInputKind);
  }, [active, autoSubmitInitialPrompt, initialCapabilities, initialPrompt, initialRecordCreationTargetModuleId, loadingThread, normalizedInitialInputKind, normalizedInitialThreadId, recordCreationTargetModuleId, selectedCapabilities, submitChat, submitting]);

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
        sourceImages: composerImageSources,
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
  }, [callAssistant, composerImageSources, contextWithSelection, generatingImage, imageEditSourceUrl, input, markPendingError, mediaSettings, message, submitting, threadId]);

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
        sourceImages: composerImageSources,
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
  }, [callAssistant, composerImageSources, contextWithSelection, generatingVideo, input, markPendingError, mediaSettings, message, submitting, threadId]);

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
    setBundleInputs((prev) => [
      ...prev,
      {
        id: `file-${Date.now()}-${prev.length}`,
        type: isAiImageFilePrompt(filePrompt) ? 'image' : 'file',
        label: filePrompt.fileName || 'فایل پیوست',
        file: filePrompt,
      },
    ]);
  }, []);

  const queueUploadedFiles = useCallback(async (filePrompts: AiUploadedFilePrompt[]) => {
    const nextFiles = (filePrompts || []).filter((item) => String(item?.fileName || '').trim());
    if (!nextFiles.length) return;
    setBundleInputs((prev) => [
      ...prev,
      ...nextFiles.map((filePrompt, index) => ({
        id: `file-${Date.now()}-${prev.length + index}`,
        type: isAiImageFilePrompt(filePrompt) ? 'image' as const : 'file' as const,
        label: filePrompt.fileName || 'فایل پیوست',
        file: filePrompt,
      })),
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
    setBundleInputs((prev) => {
      const removed = prev.filter((item) => item.id === id);
      revokeBundleInputPreviewUrls(removed);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const bundlePreviewItems = useMemo<ComposerAttachmentChipItem[]>(() => bundleInputs.map((item) => ({
    id: item.id,
    name: item.label || (item.type === 'voice' ? 'ویس' : item.file.fileName || 'فایل پیوست'),
    mimeType: item.type === 'voice' ? item.voice.mimeType : item.file.mimeType,
    fileType: item.type === 'voice' ? 'voice' : item.type === 'image' ? 'image' : 'file',
    url: item.type === 'voice'
      ? (item.voice.previewUrl || null)
      : (item.type === 'image' ? (item.file.data || item.file.url || null) : null),
    subtitle: null,
    sizeText: item.type === 'voice'
      ? `${Math.max(1, Math.round(Number(item.voice.durationMs || 0) / 1000)).toLocaleString('fa-IR')} ثانیه`
      : `${Math.max(1, Math.round(Number(item.file.size || 0) / 1024)).toLocaleString('fa-IR')} کیلوبایت`,
    loading: false,
    onRemove: submitting ? null : () => removeBundleInput(item.id),
    removeDisabled: submitting,
  })), [bundleInputs, removeBundleInput, submitting]);

  const submitTaskBundle = useCallback(async () => {
    const prompt = input.trim();
    if (submitting || (!prompt && bundleInputs.length === 0)) return;
    const assistantPrompt = pendingAiAction && activeRecordCreationSchema && prompt
      ? buildPendingActionRevisionPrompt(pendingAiAction, prompt)
      : prompt;
    const effectiveCapabilities = (() => {
      const next = [...selectedCapabilities];
      if (selectedCapabilities.length > 0 && bundleInputs.some((item) => item.type === 'file' || item.type === 'image') && !next.includes('document_analysis')) {
        next.push('document_analysis' as AiComposerCapability);
      }
      if (selectedCapabilities.length > 0 && bundleInputs.some((item) => item.type === 'voice') && !next.includes('voice_input')) {
        next.push('voice_input' as AiComposerCapability);
      }
      return next;
    })();
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
        attachments: buildBundleMessageAttachments(bundleInputs),
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
      content: buildTaskBundlePendingStatusText(bundleInputs, effectiveCapabilities),
      created_at: new Date().toISOString(),
      metadata: {
        pending_status: true,
        capabilities: effectiveCapabilities.length > 0 ? effectiveCapabilities : ['auto_router'],
        kind: 'document_analysis',
        started_at: Date.now(),
      },
    };
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setSubmitting(true);
    try {
      const inputs = await buildBundleInputPayloads();
      const recordRoute = activeRecordCreationSchema
        ? await requestAutoRoute({
          messageText: assistantPrompt,
          inputKind: 'task_bundle',
          bundlePayload: inputs,
        })
        : null;
      const recordMutationMode = pendingAiAction?.actionType === 'update_record_from_prompt'
        ? 'update'
        : recordRoute?.mutationMode === 'update'
          ? 'update'
          : 'create';
      if (recordRoute?.agentPlan) {
        setMessages((prev) => prev.map((item) => item.id === thinkingMessage.id ? {
          ...item,
          metadata: { ...(item.metadata || {}), agent_plan: recordRoute.agentPlan },
        } : item));
      }
      const data = await (effectiveCapabilities.length === 0 && !processOperationMode && !activeRecordCreationSchema
        ? executeAutoRoute({
          messageText: assistantPrompt,
          inputKind: 'task_bundle',
          bundlePayload: inputs,
        })
        : callAssistant({
          action: 'run_task_bundle',
          capabilities: effectiveCapabilities,
          message: assistantPrompt || (activeRecordCreationSchema ? 'از ورودی‌های پیوست‌شده یک رکورد جدید بساز.' : processOperationMode ? 'با توجه به ورودی‌های پیوست‌شده، اقدام لازم را پیشنهاد بده.' : 'ورودی‌های پیوست‌شده را تحلیل کن.'),
          userMessageText: assistantPrompt,
          inputKind: 'task_bundle',
          bundle: { inputs },
          threadId,
          context: contextWithSelection,
          modelOverride: modelOverrideRef.current,
          settings: mediaSettings,
          recordCreation: activeRecordCreationSchema,
          recordMutationMode,
          previewOnly: true,
        }));
      if (data?.proposedAction?.id) setPendingAiAction(data.proposedAction);
      if (data.threadId) setThreadId(String(data.threadId));
      if (data?.autoAction === 'generate_image') {
        if (data?.pending) {
          const serverMessages = Array.isArray(data?.messages) ? data.messages as ChatMessage[] : [];
          if (serverMessages.length) {
            setMessages(serverMessages);
          } else {
            setMessages((prev) => prev.map((item) => item.id === thinkingMessage.id
              ? {
                ...item,
                id: data.messageId || item.id,
                content: 'در حال ساخت تصویر...',
                provider: data.provider || null,
                model: data.model || null,
                metadata: {
                  ...(item.metadata || {}),
                  pending_status: true,
                  capabilities: ['image_generation'],
                  kind: 'image_generation',
                  started_at: Date.now(),
                  server_message_id: data.messageId || null,
                },
              }
              : item));
          }
          setBundleInputs((prev) => {
            revokeBundleInputPreviewUrls(prev);
            return [];
          });
          return;
        }
        const newImageUrl = data?.image ? resolveAiAttachmentUrl(data.image) : '';
        if (newImageUrl) setImageEditSourceUrl(newImageUrl);
      }
      if (data?.autoAction === 'generate_video') {
        const videoId = String(data?.videoId || '').trim();
        setMessages((prev) => prev.map((item) => item.id === thinkingMessage.id
          ? {
            ...item,
            id: data?.messageId || item.id,
            content: 'در حال ساخت ویدیو... (ممکن است چند دقیقه طول بکشد)',
            provider: data.provider || null,
            model: data.model || null,
            metadata: {
              ...(item.metadata || {}),
              pending_status: true,
              capabilities: ['video_generation'],
              kind: 'video_generation',
              started_at: Date.now(),
              video_id: videoId,
              server_message_id: data?.messageId || null,
            },
          }
          : item));
        setBundleInputs((prev) => {
          revokeBundleInputPreviewUrls(prev);
          return [];
        });
        return;
      }
      const serverMessages = Array.isArray(data?.messages) ? data.messages as ChatMessage[] : [];
      if (serverMessages.length) {
        setMessages(serverMessages);
      } else {
        setMessages((prev) => [
          ...prev.filter((item) => item.id !== thinkingMessage.id),
          {
            id: data.messageId || `assistant-bundle-${Date.now()}`,
            role: 'assistant',
            content: normalizeAiMessageText(data.answer) || (data?.autoAction === 'generate_voice_output' ? 'فایل صوتی آماده شد.' : 'نتیجه آماده شد.'),
            metadata: {
              usage: data.usage,
              ...(data?.agentPlan ? { agent_plan: data.agentPlan } : {}),
              capability: activeRecordCreationSchema ? 'record_creation' : processOperationMode ? 'process_operation' : 'document_analysis',
              ...(data?.file ? { file: data.file } : {}),
              ...(data?.image ? { image: data.image } : {}),
            },
            provider: data.provider || null,
            model: data.model || null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setBundleInputs((prev) => {
        revokeBundleInputPreviewUrls(prev);
        return [];
      });
    } catch (error: any) {
      setInput(prompt);
      setMessages((prev) => prev.filter((item) => item.id !== userMessage.id && item.id !== thinkingMessage.id));
      message.error(toFaErrorMessage(error, 'ارسال درخواست هوش مصنوعی ناموفق بود.'));
    } finally {
      setSubmitting(false);
    }
  }, [activeRecordCreationSchema, buildBundleInputPayloads, bundleInputs, callAssistant, contextWithSelection, executeAutoRoute, input, message, pendingAiAction, processOperationMode, requestAutoRoute, selectedCapabilities, submitting, threadId]);

  useEffect(() => {
    if (!active || !autoSubmitInitialPrompt || !initialFile || submitting || loadingThread || bundleInputs.length === 0) return;
    const fileName = String(initialFile.fileName || '').trim();
    const signature = `${normalizedInitialThreadId || 'new'}:${fileName}:${String(initialFile.message || initialPrompt || '').trim()}`;
    if (!fileName || autoSubmittedInitialBundleRef.current === signature) return;
    autoSubmittedInitialBundleRef.current = signature;
    void submitTaskBundle();
  }, [active, autoSubmitInitialPrompt, bundleInputs.length, initialFile, initialPrompt, loadingThread, normalizedInitialThreadId, submitTaskBundle, submitting]);

  const confirmPendingAiAction = useCallback(async () => {
    const actionId = String(pendingAiAction?.id || '').trim();
    if (!actionId) return;
    setConfirmingAiAction(true);
    try {
      if (String(pendingAiAction?.actionType || '') === 'confirm_generation') {
        const confirmBody = pendingAiAction?.confirmBody && typeof pendingAiAction.confirmBody === 'object'
          ? pendingAiAction.confirmBody
          : null;
        if (!confirmBody?.action) throw new Error('دستور ساخت برای تایید کامل نیست.');
        const generationKind = String(pendingAiAction?.generationKind || '').trim();
        const finalConfirmBody: Record<string, any> = {
          ...confirmBody,
          modelOverride: modelOverrideRef.current || confirmBody.modelOverride || null,
          composerPreferences: buildComposerPreferences(),
        };
        if (rememberGenerationPreference && generationKind) {
          const nextSkipPreferences = {
            ...skipGenerationConfirmationByKind,
            [generationKind]: true,
          };
          setSkipGenerationConfirmationByKind(nextSkipPreferences);
          finalConfirmBody.composerPreferences = {
            ...finalConfirmBody.composerPreferences,
            skipGenerationConfirmationByKind: nextSkipPreferences,
          };
        }
        if (generationKind === 'image_generation') {
          finalConfirmBody.settings = mediaSettings;
          finalConfirmBody.sourceImages = Array.isArray(confirmBody.sourceImages) && confirmBody.sourceImages.length
            ? confirmBody.sourceImages
            : composerImageSources;
          finalConfirmBody.sourceImageUrls = Array.isArray(confirmBody.sourceImageUrls) && confirmBody.sourceImageUrls.length
            ? confirmBody.sourceImageUrls
            : imageEditSourceUrl ? [imageEditSourceUrl] : [];
        } else if (generationKind === 'video_generation') {
          finalConfirmBody.settings = mediaSettings;
          finalConfirmBody.sourceImages = Array.isArray(confirmBody.sourceImages) && confirmBody.sourceImages.length
            ? confirmBody.sourceImages
            : composerImageSources;
        } else if (generationKind === 'voice_output') {
          finalConfirmBody.settings = mediaSettings;
        } else if (generationKind === 'document_generation') {
          finalConfirmBody.settings = mediaSettings;
          finalConfirmBody.format = String(mediaSettings.format || confirmBody.format || 'docx');
        }
        const data = await callAssistant(finalConfirmBody);
        message.success('درخواست تایید شد و اجرا شد.');
        setPendingAiAction(null);
        setQuickRecordFormOpen(false);
        const nextThreadId = String(data?.threadId || finalConfirmBody?.threadId || threadId || '').trim();
        if (data?.threadId) setThreadId(String(data.threadId));
        if (rememberGenerationPreference && generationKind && nextThreadId) {
          await callAssistant({
            action: 'save_agent_confirmation_grant',
            threadId: nextThreadId,
            operatorKey: generationKind,
          }).catch(() => undefined);
        }
        if (nextThreadId) {
          await loadThread(nextThreadId);
        }
        setBundleInputs((prev) => {
          revokeBundleInputPreviewUrls(prev);
          return [];
        });
        return;
      }
      const proposedRecords = Array.isArray(pendingAiAction?.proposedPayload?.records)
        ? pendingAiAction.proposedPayload.records.filter((record: any) => record?.selected !== false)
        : null;
      if (Array.isArray(proposedRecords) && proposedRecords.length === 0) {
        throw new Error('حداقل یک رکورد را برای اجرا انتخاب کنید.');
      }
      const data = await callAssistant({
        action: 'confirm_action',
        actionLogId: actionId,
        proposedRecords,
      });
      const executedRecords = [
        ...(Array.isArray(data?.createdRecords) ? data.createdRecords : []),
        ...(Array.isArray(data?.updatedRecords) ? data.updatedRecords : []),
      ];
      if (data?.executed !== true || executedRecords.length === 0) {
        throw new Error('ثبت یا ویرایش رکورد نتیجه قابل تایید نداشت.');
      }
      message.success(`${executedRecords.length.toLocaleString('fa-IR')} رکورد با موفقیت ثبت یا ویرایش شد.`);
      setPendingAiAction(null);
      setQuickRecordFormOpen(false);
      await loadThread();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'اجرای اقدام تاییدشده ناموفق بود.'));
    } finally {
      setConfirmingAiAction(false);
    }
  }, [buildComposerPreferences, callAssistant, composerImageSources, imageEditSourceUrl, loadThread, mediaSettings, message, pendingAiAction, rememberGenerationPreference, skipGenerationConfirmationByKind, threadId]);

  const saveThreadTitle = useCallback(async () => {
    if (renamingThreadRef.current) return;
    const nextTitle = String(draftThreadTitle || '').trim();
    if (!threadId) {
      setEditingThreadTitle(false);
      setThreadTitle(nextTitle || 'گفتگوی هوش مصنوعی');
      return;
    }
    if (!nextTitle) {
      message.warning?.('عنوان گفتگو نمی‌تواند خالی باشد.');
      setDraftThreadTitle(threadTitle);
      return;
    }
    if (nextTitle === threadTitle) {
      setEditingThreadTitle(false);
      return;
    }
    renamingThreadRef.current = true;
    setRenamingThread(true);
    try {
      const data = await callAssistant({
        action: 'rename_thread',
        threadId,
        title: nextTitle,
      });
      setThreadTitle(nextTitle);
      setDraftThreadTitle(nextTitle);
      setEditingThreadTitle(false);
      onThreadRenamed?.(threadId, nextTitle, data?.thread || null);
      message.success?.('عنوان گفتگو به‌روزرسانی شد.');
    } catch (error: any) {
      message.error?.(toFaErrorMessage(error, 'تغییر عنوان گفتگو ناموفق بود.'));
    } finally {
      renamingThreadRef.current = false;
      setRenamingThread(false);
    }
  }, [callAssistant, draftThreadTitle, message, onThreadRenamed, threadId, threadTitle]);

  const cancelThreadTitleEdit = useCallback(() => {
    setDraftThreadTitle(threadTitle || 'گفتگوی هوش مصنوعی');
    setEditingThreadTitle(false);
  }, [threadTitle]);

  const clearThread = useCallback(async () => {
    if (deletingThreadRef.current) return;
    if (!threadId) {
      setMessages([]);
      return;
    }
    deletingThreadRef.current = true;
    setDeletingThread(true);
    try {
      const data = await callAssistant({
        action: 'delete_thread',
        threadId,
      });
      if (data?.archived === false && data?.deleted === false) {
        throw new Error('گفتگو پیدا نشد یا اجازه حذف آن را ندارید.');
      }
      const deletedThreadId = threadId;
      setThreadId(null);
      setMessages([]);
      setThreadTitle('گفتگوی هوش مصنوعی');
      setDraftThreadTitle('گفتگوی هوش مصنوعی');
      onThreadDeleted?.(deletedThreadId);
      message.success?.('گفتگو حذف شد.');
    } catch (error: any) {
      message.error?.(toFaErrorMessage(error, 'حذف گفتگو ناموفق بود.'));
    } finally {
      deletingThreadRef.current = false;
      setDeletingThread(false);
    }
  }, [callAssistant, message, onThreadDeleted, threadId]);

  const compressThreadContext = useCallback(async () => {
    if (!threadId || compressingContext) return;
    setCompressingContext(true);
    try {
      const data = await callAssistant({
        action: 'compress_thread_context',
        threadId,
        modelOverride: modelOverrideRef.current,
      });
      if (data?.thread) onThreadUpserted?.(data.thread);
      message.success?.('زمینه گفتگو فشرده شد و برای ادامه همین گفتگو ذخیره شد.');
    } catch (error: any) {
      message.error?.(toFaErrorMessage(error, 'فشرده‌سازی زمینه گفتگو ناموفق بود.'));
    } finally {
      setCompressingContext(false);
    }
  }, [callAssistant, compressingContext, message, onThreadUpserted, threadId]);

  const renderMessage = (item: ChatMessage, index: number) => {
    const isUser = item.role === 'user';
    const usageText = !isUser ? formatUsageMetadata(item.metadata?.usage || item.metadata) : '';
    const messageText = normalizeAiMessageText(item.content);
    const attachments = extractAiMessageAttachments(item);
    const pendingKind = getPendingGenerationKind(item);
    const retryText = !isUser
      ? normalizeAiMessageText([...messages].slice(0, index).reverse().find((messageItem) => messageItem.role === 'user')?.content)
      : '';
    const isStreaming = !isUser && item.metadata?.streaming === true;
    const isFailed = !isUser && (item.metadata?.failed === true || item.metadata?.incomplete === true);
    const isStopped = !isUser && item.metadata?.stopped === true;
    const providerRaw = item.metadata?.provider_raw_response || item.metadata?.provider_error_raw || item.metadata?.avalai_raw_response || null;
    const providerRawText = providerRaw
      ? (typeof providerRaw === 'string' ? providerRaw : JSON.stringify(providerRaw, null, 2))
      : '';
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
              providerRaw={item.metadata?.provider_raw_response || item.metadata?.provider_error_raw || item.metadata?.avalai_raw_response || null}
              onRecheck={() => recheckPending(item)}
              onDismiss={() => setMessages((prev) => prev.filter((m) => m.id !== item.id))}
              autoPoll={item.metadata?.manual_recheck_only !== true && item.metadata?.error !== 'image_generation_worker_timeout'}
            />
          ) : (
          <div
            className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12px] leading-6 shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.24)] ${
              isUser
                ? 'rounded-tr-md bg-[rgb(var(--brand-600-rgb))] text-white dark:bg-[rgb(var(--brand-500-rgb))] dark:text-white'
                : 'rounded-tl-md border border-slate-200/70 bg-white text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.055] dark:text-slate-100'
            }`}
          >
            {isUser ? messageText : (
              <AiMessageRenderer
                text={messageText}
                streaming={isStreaming}
                failed={isFailed}
                stopped={isStopped}
                onCopyText={copyText}
                onStop={isStreaming ? stopActiveStream : undefined}
                onRetry={retryText ? () => void submitChat(retryText, 'text') : undefined}
              />
            )}
            <MessageAttachmentGallery attachments={attachments} />
            {!pendingKind && providerRawText && attachments.length === 0 ? (
              <details className="mt-2 rounded-lg border border-white/20 bg-black/5 p-2 text-left text-[10px] leading-4 dark:bg-black/20" dir="ltr">
                <summary className="cursor-pointer text-right font-semibold" dir="rtl">
                  پاسخ خام سرویس‌دهنده
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono">
                  {providerRawText.slice(0, 4000)}
                </pre>
              </details>
            ) : null}
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
            {messageText ? (
              <Tooltip title={isUser ? 'کپی پیام' : 'کپی کل پاسخ'}>
                <Button
                  type="text"
                  size="small"
                  className="!h-5 !px-1 !text-gray-400 hover:!text-[rgb(var(--brand-700-rgb))]"
                  icon={<CopyOutlined />}
                  onClick={() => copyText(messageText, isUser ? 'پیام' : 'پاسخ')}
                  aria-label={isUser ? 'کپی پیام' : 'کپی کل پاسخ'}
                />
              </Tooltip>
            ) : null}
            {messageText || attachments.length > 0 ? (
              <Tooltip title="فوروارد">
                <Button
                  type="text"
                  size="small"
                  className="!h-5 !px-1 !text-gray-400 hover:!text-[rgb(var(--brand-700-rgb))]"
                  icon={<ForwardOutlined />}
                  onClick={() => void forwardMessage({
                    channel: 'assistant',
                    actorName: isUser ? 'شما' : 'دستیار هوشمند',
                    createdAt: item.created_at || null,
                    createdAtLabel: item.created_at ? toFaDateTime(item.created_at) : '',
                    content: messageText,
                    attachments,
                    relatedModuleId: context.mode === 'record' ? context.moduleId : null,
                    relatedRecordId: context.mode === 'record' ? context.recordId : null,
                  })}
                  aria-label="فوروارد پیام"
                />
              </Tooltip>
            ) : null}
            {messageText ? (
              <Tooltip title="ایجاد فعالیت">
                <Button
                  type="text"
                  size="small"
                  className="!h-5 !px-1 !text-gray-400 hover:!text-[rgb(var(--brand-700-rgb))]"
                  icon={<UserAddOutlined />}
                  onClick={() => void createActivityFromMessage({
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

  const pendingGenerationKind = String(pendingAiAction?.generationKind || '').trim();
  const pendingRecordMutationType = ['create_record_from_prompt', 'update_record_from_prompt'].includes(String(pendingAiAction?.actionType || ''))
    ? String(pendingAiAction.actionType) as 'create_record_from_prompt' | 'update_record_from_prompt'
    : null;
  const pendingRecordMutationRecords = useMemo<AiRecordMutationDraft[]>(() => {
    if (!pendingRecordMutationType) return [];
    const proposedPayload = pendingAiAction?.proposedPayload || {};
    if (Array.isArray(proposedPayload?.records) && proposedPayload.records.length) {
      return proposedPayload.records.map((record: any) => ({
        record_id: String(record?.record_id || '').trim() || null,
        record_title: String(record?.record_title || '').trim() || null,
        selected: record?.selected !== false,
        fields: record?.fields && typeof record.fields === 'object' ? record.fields : {},
      }));
    }
    return proposedPayload?.payload && typeof proposedPayload.payload === 'object'
      ? [{ selected: true, fields: proposedPayload.payload }]
      : [];
  }, [pendingAiAction, pendingRecordMutationType]);
  const pendingGenerationCanChooseModel = pendingAiAction?.actionType === 'confirm_generation'
    && ['image_generation', 'video_generation', 'voice_output', 'document_generation', 'deep_reasoning'].includes(pendingGenerationKind);
  const pendingGenerationSourceImageCount = useMemo(() => {
    const body = pendingAiAction?.confirmBody && typeof pendingAiAction.confirmBody === 'object' ? pendingAiAction.confirmBody : {};
    const bodySources = Array.isArray(body?.sourceImages) ? body.sourceImages.length : 0;
    const bodySourceUrls = Array.isArray(body?.sourceImageUrls) ? body.sourceImageUrls.length : 0;
    return bodySources + bodySourceUrls + (bodySources || bodySourceUrls ? 0 : composerImageSources.length + (imageEditSourceUrl ? 1 : 0));
  }, [composerImageSources.length, imageEditSourceUrl, pendingAiAction]);
  const pendingGenerationSettingsRows = useMemo(() => {
    if (!pendingGenerationCanChooseModel) return [];
    const body = pendingAiAction?.confirmBody && typeof pendingAiAction.confirmBody === 'object' ? pendingAiAction.confirmBody : {};
    return buildGenerationSettingsRows(pendingGenerationKind, mediaSettings, {
      format: mediaSettings.format || body?.format,
      sourceImageCount: pendingGenerationSourceImageCount,
      bundleInputCount: Array.isArray(body?.bundle?.inputs) ? body.bundle.inputs.length : 0,
    });
  }, [mediaSettings, pendingAiAction, pendingGenerationCanChooseModel, pendingGenerationKind, pendingGenerationSourceImageCount]);
  const activeModelForContext = useMemo(() => {
    const latestModel = [...messages].reverse().find((item) => item.model)?.model;
    return latestModel || modelOverrideRef.current || null;
  }, [messages]);
  const estimatedContextTokens = useMemo(() => estimateAiMessageTokens(messages), [messages]);
  const estimatedContextLimit = estimateModelContextLimit(activeModelForContext);
  const estimatedContextPercent = Math.max(0, Math.min(100, Math.round((estimatedContextTokens / Math.max(1, estimatedContextLimit)) * 100)));
  const loadDrawerThreads = useCallback(async () => {
    if (!showThreadListButton) return;
    setDrawerThreadsLoading(true);
    try {
      const data = await callAssistant({ action: 'list_threads', limit: 80 });
      const rows = Array.isArray(data?.threads) ? data.threads : [];
      setDrawerThreads(rows);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت فهرست گفتگوها ناموفق بود.'));
    } finally {
      setDrawerThreadsLoading(false);
    }
  }, [callAssistant, message, showThreadListButton]);

  useEffect(() => {
    if (threadListOpen) void loadDrawerThreads();
  }, [loadDrawerThreads, threadListOpen]);

  useEffect(() => {
    if (!threadId || compressingContext || estimatedContextPercent < 90 || messages.length < 8) return;
    const signature = `${threadId}:${messages.length}:${estimatedContextPercent}`;
    if (autoCompressedSignatureRef.current === signature) return;
    autoCompressedSignatureRef.current = signature;
    void compressThreadContext();
  }, [compressThreadContext, compressingContext, estimatedContextPercent, messages.length, threadId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100 text-slate-800 dark:bg-[#101113] dark:text-slate-100">
      <div className="border-b border-slate-200/65 bg-white/92 px-3 py-2.5 backdrop-blur dark:border-white/[0.07] dark:bg-[#17191c]/95">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {editingThreadTitle ? (
              <div className="flex min-w-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                <Input
                  size="small"
                  value={draftThreadTitle}
                  autoFocus
                  maxLength={120}
                  disabled={renamingThread}
                  onChange={(event) => setDraftThreadTitle(event.target.value)}
                  onPressEnter={() => void saveThreadTitle()}
                  onBlur={() => {
                    if (!renamingThread) void saveThreadTitle();
                  }}
                  aria-label="ویرایش عنوان گفتگو"
                  className="max-w-[320px]"
                />
                <Button
                  type="text"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={renamingThread}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void saveThreadTitle()}
                  aria-label="ذخیره عنوان گفتگو"
                />
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  disabled={renamingThread}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={cancelThreadTitleEdit}
                  aria-label="لغو ویرایش عنوان گفتگو"
                />
              </div>
            ) : (
              <button
                type="button"
                className="group flex max-w-full items-center gap-1 rounded-md px-0.5 text-right text-[13px] font-bold text-slate-800 hover:text-[rgb(var(--brand-700-rgb))] dark:text-slate-100"
                onClick={() => {
                  setDraftThreadTitle(threadTitle || 'گفتگوی هوش مصنوعی');
                  setEditingThreadTitle(true);
                }}
                title="ویرایش عنوان گفتگو"
              >
                <span className="truncate">{threadTitle || 'گفتگوی هوش مصنوعی'}</span>
                <EditOutlined className="shrink-0 text-[11px] text-slate-400 opacity-0 transition group-hover:opacity-100" />
              </button>
            )}
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
            {showThreadListButton ? (
              <Tooltip title="فهرست گفتگوها">
                <Button type="text" size="small" icon={<MenuOutlined />} onClick={() => setThreadListOpen(true)} aria-label="فهرست گفتگوهای هوش مصنوعی" />
              </Tooltip>
            ) : null}
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
            <Tooltip title={`زمینه گفتگو: حدود ${estimatedContextTokens.toLocaleString('fa-IR')} توکن`}>
              <span className="inline-flex h-6 w-6 items-center justify-center">
                <Progress
                  type="circle"
                  percent={estimatedContextPercent}
                  size={22}
                  strokeWidth={12}
                  showInfo={false}
                  strokeColor={estimatedContextPercent > 85 ? '#dc2626' : estimatedContextPercent > 65 ? '#d97706' : '#2563eb'}
                />
              </span>
            </Tooltip>
            <Tooltip title="فشرده‌سازی زمینه گفتگو">
              <Button
                type="text"
                size="small"
                icon={<CompressOutlined />}
                loading={compressingContext}
                disabled={!threadId || messages.length < 4}
                onClick={() => void compressThreadContext()}
                aria-label="فشرده‌سازی زمینه گفتگو"
              />
            </Tooltip>
            <Popconfirm
              title="این گفتگوی هوش مصنوعی حذف شود؟"
              description="این گفتگو از فهرست گفتگوهای شما حذف می‌شود."
              okText="حذف گفتگو"
              cancelText="انصراف"
              onConfirm={() => void clearThread()}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} loading={deletingThread} disabled={messages.length === 0 && !threadId} aria-label="حذف گفتگوی هوش مصنوعی" />
            </Popconfirm>
          </Space>
        </div>
        <Space size={[6, 6]} wrap>
          {context.mode === 'list' && (context.selectedRecordIds?.length || 0) > 0 ? (
            <Tag color="blue">{Math.min(context.selectedRecordIds?.length || 0, 10).toLocaleString('fa-IR')} انتخاب‌شده</Tag>
          ) : null}
        </Space>
      </div>

      <div ref={scrollRef} onScroll={handleMessageScroll} className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(241,245,249,0.82))] px-3 py-3 dark:bg-none dark:bg-[#101113]">
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
          </div>
        )}
      </div>

      <div className="max-h-[48vh] shrink-0 overflow-y-auto border-t border-slate-200/65 bg-white/95 px-3 py-2.5 dark:border-white/[0.07] dark:bg-[#17191c]">
        {pendingAiAction ? (
          <div className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 shadow-sm dark:border-amber-400/20 dark:bg-[#241a0d] dark:text-amber-100">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-bold">
                  {String(pendingAiAction?.actionType || '') === 'confirm_generation'
                    ? String(pendingAiAction?.title || 'تایید ساخت خروجی')
                    : pendingRecordMutationType
                    ? `پیش‌نویس ${pendingRecordMutationType === 'update_record_from_prompt' ? 'ویرایش' : 'ساخت'} ${String(pendingAiAction?.title || 'رکورد').trim()}`
                    : 'هوش مصنوعی یک اقدام قابل اجرا پیشنهاد داده است.'}
                </div>
                <div className="mt-1 text-amber-800 dark:text-amber-200/85">
                  {String(pendingAiAction?.actionType || '') === 'confirm_generation'
                    ? 'قبل از ساخت، دستور و تنظیمات را بررسی کنید؛ اجرا فقط بعد از تایید شما انجام می‌شود.'
                    : 'اطلاعات فهمیده‌شده را بررسی کنید؛ می‌توانید تایید کنید، رد کنید یا با پیام/ویس توضیح تکمیلی بدهید.'}
                </div>
              </div>
            </div>
            {String(pendingAiAction?.actionType || '') === 'confirm_generation' ? (
              <div className="mt-2 space-y-2 rounded-xl border border-amber-200/70 bg-white/72 p-2 dark:border-amber-300/15 dark:bg-white/[0.045]">
                <div>
                  <div className="font-semibold text-amber-900 dark:text-amber-100">دستور ساخت</div>
                  <div className="mt-1 whitespace-pre-wrap rounded-lg bg-amber-50/80 p-2 text-amber-900 dark:bg-black/20 dark:text-amber-50">
                    {String(pendingAiAction?.prompt || pendingAiAction?.confirmBody?.prompt || pendingAiAction?.confirmBody?.message || '').trim() || 'درخواست کاربر'}
                  </div>
                </div>
                {pendingGenerationCanChooseModel ? (
                  <div className="rounded-lg border border-amber-100/80 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.035]">
                    <div className="mb-1 font-semibold text-amber-900 dark:text-amber-100">موتور هوش مصنوعی</div>
                    <AiComposeModelBar
                      selectedCapabilities={[pendingGenerationKind]}
                      fallbackCapability={contextWithSelection.mode === 'record' ? 'record_chat' : 'dashboard_chat'}
                      persistedOverrides={modelOverrides}
                      onModelOverrideChange={(model, capability) => {
                        modelOverrideRef.current = model;
                        const key = String(capability || pendingGenerationKind || '').trim();
                        if (!key) return;
                        setModelOverrides((prev) => {
                          if (model) return { ...prev, [key]: model };
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                        setPendingAiAction((prev: any) => prev?.actionType === 'confirm_generation'
                          ? {
                            ...prev,
                            confirmBody: {
                              ...(prev.confirmBody || {}),
                              modelOverride: model || null,
                            },
                          }
                          : prev);
                      }}
                    />
                  </div>
                ) : null}
                {pendingGenerationCanChooseModel && ['image_generation', 'video_generation', 'voice_output', 'document_generation'].includes(pendingGenerationKind) ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-100/80 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.035]">
                    <span className="font-semibold text-amber-900 dark:text-amber-100">تنظیمات خاص خروجی</span>
                    <AiMediaSettingsPopover
                      capability={pendingGenerationKind as 'image_generation' | 'voice_output' | 'video_generation' | 'document_generation'}
                      settings={mediaSettings}
                      onSettingsChange={setMediaSettings}
                      size="small"
                      modelId={String(pendingAiAction?.confirmBody?.modelOverride || activeMediaModelId || '').trim() || null}
                    />
                  </div>
                ) : null}
                {pendingGenerationSettingsRows.length > 0 ? (
                  <div>
                    <div className="font-semibold text-amber-900 dark:text-amber-100">تنظیمات</div>
                    <div className="mt-1 space-y-1">
                      {pendingGenerationSettingsRows.map((row: any, rowIndex: number) => (
                        <div key={`${String(row?.label || 'setting')}-${rowIndex}`} className="flex items-start justify-between gap-3 border-b border-amber-100/80 py-1 last:border-b-0 dark:border-white/10">
                          <span className="shrink-0 font-semibold text-amber-900 dark:text-amber-100">{String(row?.label || 'تنظیم')}</span>
                          <span className="min-w-0 text-left text-amber-800 dark:text-amber-200/85">{String(row?.value || 'پیش‌فرض')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="font-semibold text-amber-900 dark:text-amber-100">آیا تایید می‌کنید؟</div>
                <Checkbox
                  checked={rememberGenerationPreference}
                  onChange={(event) => setRememberGenerationPreference(event.target.checked)}
                  className="text-xs text-amber-900 dark:text-amber-100"
                >
                  این اطلاعات را برای این عملکرد ({getGenerationConfirmationTitle(pendingGenerationKind).replace(/^تایید\s*/, '')}) در این گفتگو ذخیره کن و دیگر نپرس.
                </Checkbox>
              </div>
            ) : null}
            {pendingRecordMutationType && pendingRecordMutationRecords.length > 0 ? (
              <Button size="small" onClick={() => setQuickRecordFormOpen(true)}>
                بررسی و ویرایش فرم
              </Button>
            ) : null}
            <div className="mt-2">
              {String(pendingAiAction?.actionType || '') === 'confirm_generation'
                ? 'برای تغییر دستور، درخواست اصلاح‌شده را در کادر پیام بنویسید.'
                : 'برای اصلاح، توضیح جدید را در کادر پیام بنویسید یا ویس بفرستید؛ دستیار آن را به همین پیش‌نویس اضافه می‌کند.'}
            </div>
            <Space size={6} className="mt-2">
              {pendingRecordMutationType ? (
                <Button type="primary" size="small" loading={confirmingAiAction} onClick={() => setQuickRecordFormOpen(true)}>
                  بررسی و تایید در فرم
                </Button>
              ) : (
                <Button type="primary" size="small" loading={confirmingAiAction} onClick={() => void confirmPendingAiAction()}>
                  تایید و اجرا
                </Button>
              )}
              <Button size="small" onClick={() => setInput((prev) => String(prev || '').trim() ? prev : String(pendingAiAction?.actionType || '') === 'confirm_generation' ? 'دستور ساخت را این‌طور اصلاح کن: ' : 'این پیش‌نویس را این‌طور اصلاح کن: ')} disabled={confirmingAiAction}>
                ویرایش با پیام
              </Button>
              <Button size="small" danger onClick={() => setPendingAiAction(null)} disabled={confirmingAiAction}>
                رد پیشنهاد
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
        {bundlePreviewItems.length > 0 ? (
          <div className="mb-2 space-y-2">
            <ComposerAttachmentChips items={bundlePreviewItems} />
            {bundleInputs
              .filter((item) => item.type === 'voice' && item.voice.previewUrl)
              .map((item) => item.type === 'voice' ? (
                <AiAudioPlayer
                  key={`player-${item.id}`}
                  src={item.voice.previewUrl}
                  title={item.label || 'ویس آماده ارسال'}
                  subtitle={item.voice.filename}
                  downloadName={item.voice.filename}
                  compact
                />
              ) : null)}
          </div>
        ) : null}
        <Input.TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onPressEnter={(event) => {
            if (!shouldSubmitComposerOnEnter(event)) return;
            event.preventDefault();
            void (shouldUseTaskBundle ? submitTaskBundle() : documentMode ? submitDocumentPrompt() : videoMode ? submitVideoPrompt() : voiceOutputMode ? submitVoiceOutputPrompt() : imageMode ? submitImagePrompt() : submitChat());
          }}
          placeholder="سوال خود را بنویسید..."
          autoSize={{ minRows: 1, maxRows: 8 }}
          className="!rounded-2xl !border-slate-200/70 !bg-slate-50/85 !px-3 !py-2 !text-[12px] !leading-6 !shadow-none dark:!border-white/[0.08] dark:!bg-white/[0.045]"
        />
        <div className="mt-1">
          <AiComposeModelBar
            selectedCapabilities={selectedCapabilities}
            fallbackCapability={contextWithSelection.mode === 'record' ? 'record_chat' : 'dashboard_chat'}
            persistedOverrides={modelOverrides}
            onModelOverrideChange={(model, capability) => {
              modelOverrideRef.current = model;
              const key = String(capability || '').trim();
              if (key) {
                setModelOverrides((prev) => {
                  if (model) return { ...prev, [key]: model };
                  const next = { ...prev };
                  delete next[key];
                  return next;
                });
              }
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <AiCapabilityComposerActions
            selected={selectedCapabilities}
            autoSuggested={autoSuggestedCapabilities}
            onChange={handleComposerCapabilitiesChange}
            capabilityAvailability={capabilityAvailability}
            loading={submitting || generatingImage || generatingVoiceOutput || generatingVideo || generatingDocument}
            moduleId={fileRecordScope.moduleId}
            recordId={fileRecordScope.recordId}
            onVoiceSend={queueVoiceInput}
            onFilePrepared={queueUploadedFile}
            onFilesPrepared={queueUploadedFiles}
            voiceLoading={submitting}
            fileLoading={submitting}
            allowMultipleFiles
            size="small"
            recordCreationModuleOptions={recordCreationModuleOptions}
            recordCreationTargetModuleId={recordCreationTargetModuleId}
            onRecordCreationTargetModuleChange={setRecordCreationTargetModuleId}
            mediaSettings={mediaSettings}
            onMediaSettingsChange={setMediaSettings}
            mediaModelId={activeMediaModelId}
            onApplyPrompt={(text) => setInput((prev) => (String(prev || '').trim() ? `${prev}\n${text}` : text))}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            className="shrink-0"
            loading={shouldUseTaskBundle ? submitting : documentMode ? generatingDocument : videoMode ? generatingVideo : voiceOutputMode ? generatingVoiceOutput : imageMode ? generatingImage : submitting}
            disabled={!input.trim() && bundleInputs.length === 0}
            onClick={() => void (shouldUseTaskBundle ? submitTaskBundle() : documentMode ? submitDocumentPrompt() : videoMode ? submitVideoPrompt() : voiceOutputMode ? submitVoiceOutputPrompt() : imageMode ? submitImagePrompt() : submitChat())}
            size="small"
          >
            {shouldUseTaskBundle ? 'ارسال' : documentMode ? 'ساخت فایل' : videoMode ? 'ساخت ویدیو' : voiceOutputMode ? 'تولید صدا' : imageMode ? 'ساخت تصویر' : processOperationMode ? 'پیشنهاد اقدام' : activeRecordCreationSchema ? 'آماده‌سازی پیش‌نویس' : 'ارسال'}
          </Button>
        </div>
      </div>
      {pendingRecordMutationType && pendingAiAction ? (
        <QuickRecordFormModal
          open={quickRecordFormOpen}
          actionType={pendingRecordMutationType}
          moduleId={String(pendingAiAction?.targetModuleId || pendingAiAction?.proposedPayload?.target_module_id || '').trim()}
          moduleLabel={pendingAiAction?.title || pendingAiAction?.schema?.moduleLabel || null}
          schema={pendingAiAction?.schema}
          records={pendingRecordMutationRecords}
          loading={confirmingAiAction}
          onChange={(records) => setPendingAiAction((current: any) => current ? {
            ...current,
            proposedPayload: {
              ...(current.proposedPayload || {}),
              records,
              payload: records[0]?.fields || {},
            },
          } : current)}
          onCancel={() => setQuickRecordFormOpen(false)}
          onConfirm={() => void confirmPendingAiAction()}
        />
      ) : null}
      <Drawer
        open={threadListOpen}
        onClose={() => setThreadListOpen(false)}
        placement="right"
        width="min(92vw, 360px)"
        title="گفتگوهای هوش مصنوعی"
        classNames={{ body: '!p-0' }}
        destroyOnHidden
        getContainer={typeof document === 'undefined' ? undefined : () => document.body}
      >
        <div className="h-full overflow-y-auto bg-slate-50 p-2 dark:bg-[#131518]">
          {drawerThreadsLoading ? (
            <div className="flex justify-center py-10"><Spin /></div>
          ) : drawerThreads.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="گفتگویی پیدا نشد." />
          ) : drawerThreads.map((thread) => {
            const nextThreadId = String(thread?.id || '').trim();
            const activeThread = nextThreadId && nextThreadId === threadId;
            return (
              <button
                key={nextThreadId}
                type="button"
                className={`mb-1.5 flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-right transition ${activeThread ? 'border-slate-300 bg-white dark:border-white/15 dark:bg-white/10' : 'border-transparent bg-white/70 hover:bg-white dark:bg-white/[0.035] dark:hover:bg-white/[0.07]'}`}
                onClick={() => {
                  setThreadListOpen(false);
                  void loadThread(nextThreadId);
                }}
              >
                <Avatar size={30} className="!bg-[rgba(var(--brand-100-rgb),0.88)] !text-[rgb(var(--brand-700-rgb))] dark:!bg-[rgba(var(--brand-600-rgb),0.18)] dark:!text-[rgb(var(--brand-200-rgb))]">
                  <AiSparkleIcon className="h-3.5 w-3.5" />
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[12px] font-bold text-slate-800 dark:text-slate-100">{String(thread?.title || 'گفتگوی هوش مصنوعی')}</span>
                  <span className="mt-0.5 line-clamp-1 text-[10px] text-slate-500 dark:text-slate-300">
                    {thread?.updated_at ? new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(new Date(thread.updated_at)) : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Drawer>
    </div>
  );
};

export default AssistantPanel;
