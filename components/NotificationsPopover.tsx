import React, { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { App, Badge, Button, Drawer, Empty, Input, Modal, Popover, Select, Tabs } from 'antd';
import { BellOutlined, TeamOutlined, CloseOutlined, ReloadOutlined, RobotOutlined, MessageOutlined, EyeOutlined, CopyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { fetchAssigneeDirectory } from '../utils/referenceData';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { supportsModuleAssignee } from '../utils/assigneeSupport';
import { parseNoteContent, serializeNoteContent } from '../utils/noteContent';
import type { NoteAttachment } from '../utils/noteContent';
import { ensureNoteAttachmentShortcuts, uploadNoteAttachments } from '../utils/noteAttachments';
import { normalizeNoteScope } from '../utils/noteScope';
import { buildTaskSourceInitialValues, normalizeTaskSourceValues, resolveTaskSourceLink } from '../utils/taskMeta';
import { attachTaskCompletionIfNeeded } from '../utils/taskCompletion';
import SharedNoteComposer from './notes/SharedNoteComposer';
import { AI_CONTEXT_EVENT, AI_OPEN_EVENT, NOTES_UPDATED_EVENT, type AssistantContext } from '../utils/aiAssistantEvents';
import { getTaskStatusLabel } from '../utils/processTaskStatusOptions';
import { setUiNotificationOverlayItems, setUiNotificationOverlaySuppressed } from '../utils/uiNotificationOverlayStore';
import { insertNotesWithFallback, sendNoteSmsNotifications } from '../utils/noteDispatch';
import { getActiveChannelSettings } from '../utils/channelSettings';
import { renderRecordTemplate } from '../utils/recordMessaging';
import { resolveTemplateOptionLabelMaps } from '../utils/messageTemplateRenderer';
import { openTaskProcessModal } from '../utils/taskProcessModalEvents';
import { getRecordDisplayLabel } from '../utils/recordLabel';
import { buildRecordReferenceKey, fetchRecordReferenceLabels } from '../utils/recordReference';
import { buildRecordTitleSelectColumns, runSelectWithCompatibleColumns, selectByIdsWithCompatibleColumns } from '../utils/selectCompat';
import { resolveVoipAccessPermissions } from '../utils/permissions';
import AiSparkleIcon from './ai/AiSparkleIcon';
import {
  buildNoteConversations,
  buildSmsThreads,
  buildVoipThreads,
  getSmsThreadKey,
  getVoipThreadKey,
  normalizePhoneThreadValue,
} from '../utils/notificationViewModels';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { shortenAttachmentsForExternalShare } from '../utils/fileShortLinks';
import { extractBotMessageAttachments } from '../utils/messageAttachments';
import { buildMessageActivityDescription, buildMessageActivityTitle, filterUsableMessageAttachments } from '../utils/messageActivity';
import { createFileManagerShortcut } from '../utils/fileManagerService';
import { buildClientFallbackSystemCode, supportsSystemCode } from '../utils/systemCode';
import { syncRecordTags } from '../utils/recordTags';
import { insertRecordActivity } from '../utils/recordActivity';
import { runWorkflowsForEvent } from '../utils/workflowRuntime';
import { useNotificationConversationList } from '../hooks/useNotificationConversationList';
import { prefetchInternalConversationTimeline, useInternalConversationTimeline } from '../hooks/useInternalConversationTimeline';
import { prefetchBotConversationTimeline, useBotConversationTimeline } from '../hooks/useBotConversationTimeline';
import { useNotificationRealtimeSync } from '../hooks/useNotificationRealtimeSync';
import { isMissingRpcError, type NotificationConversationSummary } from '../utils/notificationConversationRpc';
import ProfileAvatar from './common/ProfileAvatar';
import { preloadAvatarUrls } from '../utils/profileAvatar';
import { PROFILE_AVATAR_UPDATED_EVENT, type ProfileAvatarUpdatedDetail } from '../utils/profileAvatarEvents';
import type { BotChannel, BotPlatformState } from './bot/CounterpartyBotStatusModal';
import { loadScopedCompanySettings } from '../utils/companySettings';

const NOTIFICATIONS_MODAL_Z_INDEX = 15100;
const VoipCallsPanel = React.lazy(() => import('./notifications/VoipCallsPanel'));
const ResponsibilitiesPanel = React.lazy(() => import('./notifications/ResponsibilitiesPanel'));
const TasksPanel = React.lazy(() => import('./notifications/TasksPanel'));
const SmsMessagesPanel = React.lazy(() => import('./notifications/SmsMessagesPanel'));
const BotMessagesPanel = React.lazy(() => import('./notifications/BotMessagesPanel'));
const NotesPanel = React.lazy(() => import('./notifications/NotesPanel'));
const RelatedRecordPopover = React.lazy(() => import('./RelatedRecordPopover'));
const AssistantPanel = React.lazy(() => import('./ai/AssistantPanel'));
const MessageComposerModal = React.lazy(() => import('./MessageComposerModal'));
const CounterpartyBotStatusModal = React.lazy(() => import('./bot/CounterpartyBotStatusModal'));
const ProductionStagesField = React.lazy(() => import('./ProductionStagesField'));
const SmartForm = React.lazy(() => import('./SmartForm'));

const renderNotificationTemplate = async (
  template: string,
  record: Record<string, any> | null | undefined,
  moduleId: string | null | undefined
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  if (!normalizedModuleId || !record) return String(template || '');
  const optionLabelMaps = await resolveTemplateOptionLabelMaps(supabase, template, normalizedModuleId, record)
    .catch(() => ({}));
  return renderRecordTemplate(template, record, normalizedModuleId, { optionLabelMaps });
};

interface NotificationsPopoverProps {
  isMobile: boolean;
  variant?: 'chat' | 'alerts';
  requestedTab?: 'notes' | 'tasks' | 'responsibilities' | 'bot_messages' | 'sms_messages' | 'voip_calls' | 'assistant';
  /** When true, renders as a full-page component (no drawer/popover wrapper, always open) */
  standalone?: boolean;
  /** Open on first mount when a lightweight launcher mounts the heavy panel. */
  initialOpen?: boolean;
  /** Render only drawer content; the lightweight launcher owns the header button. */
  triggerless?: boolean;
  /** Called after the close animation so the launcher can release this component. */
  onClosed?: () => void;
}

type AiSuggestionPopoverActionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  disabled: boolean;
  onSubmit: (instruction: string) => void | Promise<void>;
};

type MessageActivityDraft = {
  initialValues: Record<string, any>;
  attachments: NoteAttachment[];
  relatedModuleId: string | null;
  relatedRecordId: string | null;
  sourceLabel: string;
};

const AiSuggestionPopoverAction: React.FC<AiSuggestionPopoverActionProps> = ({
  open,
  onOpenChange,
  loading,
  disabled,
  onSubmit,
}) => {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!open) {
      setDraft('');
    }
  }, [open]);

  return (
    <Popover
      trigger="click"
      placement="topRight"
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled && nextOpen) return;
        onOpenChange(nextOpen);
      }}
      content={(
        <div className="w-[280px] max-w-[80vw]">
          <div className="text-[12px] font-semibold text-gray-700 dark:text-gray-100">
            توضیحات بیشتر برای هوش مصنوعی
          </div>
          <div className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
            کاربر بتونه راجع به این موضوع و پیام های رد و بدل شده و چیزی که میخواد، توضیحی اضافه کنه
          </div>
          <Input.TextArea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoSize={{ minRows: 3, maxRows: 6 }}
            className="mt-2"
            placeholder="مثلا لحن پاسخ، نکته مهم، یا چیزی که باید در نظر گرفته شود..."
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button size="small" onClick={() => onOpenChange(false)}>
              بستن
            </Button>
            <Button
              type="primary"
              size="small"
              loading={loading}
              onClick={() => void onSubmit(draft)}
            >
              دریافت پیشنهاد
            </Button>
          </div>
        </div>
      )}
    >
      <button
        type="button"
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] transition-colors ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-black/5 dark:hover:bg-white/10'
        }`}
      >
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${
            loading
              ? 'bg-[rgba(var(--brand-500-rgb),0.12)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.16)] dark:text-[rgb(var(--brand-300-rgb))]'
              : 'text-gray-600 dark:text-gray-300'
          }`}
        >
          <AiSparkleIcon className="h-4 w-4" />
        </span>
        {loading ? (
          <span className="whitespace-nowrap text-[11px] text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]">
            در حال فکر کردن...
          </span>
        ) : null}
      </button>
    </Popover>
  );
};

type SmsDrawerComposerProps = {
  recipient: string;
  activeThreadId?: string | null;
  sending: boolean;
  onSubmit: (text: string) => Promise<boolean> | boolean;
  onSuggestReply: (instruction: string) => Promise<string | null>;
};

const SmsDrawerComposer = React.memo<SmsDrawerComposerProps>(({
  recipient,
  activeThreadId,
  sending,
  onSubmit,
  onSuggestReply,
}) => {
  const [draft, setDraft] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);
  const canSuggest = Boolean(activeThreadId || String(recipient || '').trim());

  const submitDraft = useCallback(async () => {
    const text = String(draft || '').trim();
    const sent = await onSubmit(text);
    if (sent) {
      setDraft('');
    }
  }, [draft, onSubmit]);

  const requestSuggestion = useCallback(async (instruction: string) => {
    if (suggesting) return;
    setSuggesting(true);
    setAiPopoverOpen(false);
    try {
      const suggested = await onSuggestReply(instruction);
      if (suggested) {
        setDraft(suggested);
      }
    } finally {
      setSuggesting(false);
    }
  }, [onSuggestReply, suggesting]);

  return (
    <SharedNoteComposer
      value={draft}
      onChange={setDraft}
      onSubmit={submitDraft}
      placeholder="متن پیامک..."
      submitText="ارسال پیامک"
      allowMentions={false}
      allowAttachments={false}
      submitLoading={sending}
      submitDisabled={sending || suggesting || !String(recipient || '').trim() || !String(draft || '').trim()}
      extraActions={(
        <AiSuggestionPopoverAction
          open={aiPopoverOpen}
          onOpenChange={setAiPopoverOpen}
          loading={suggesting}
          disabled={sending || suggesting || !canSuggest}
          onSubmit={requestSuggestion}
        />
      )}
    />
  );
});

SmsDrawerComposer.displayName = 'SmsDrawerComposer';

const MAX_ITEMS = 10;
const NOTIFICATIONS_CACHE_TTL_MS = 90_000;
// Minimum time between two realtime-triggered live refreshes for the same section.
// Prevents rapid postgres_changes events from hammering the DB on every row insert.
const LIVE_REFRESH_COOLDOWN_MS = 5_000;
const ASSIGNED_NOTE_PAIRS_TTL_MS = 3 * 60 * 1000;
const BOT_MEDIA_HYDRATION_MAX_FAILURES = 1;
const BOT_MEDIA_HYDRATION_BACKOFF_MS = 30 * 60 * 1000;
const BOT_MEDIA_AUTO_HYDRATION_BATCH_SIZE = 2;
const SEEN_NOTES_STORAGE_KEY = 'notif_seen_notes_v1';
const SEEN_TASKS_STORAGE_KEY = 'notif_seen_tasks_v1';
const SEEN_RESP_STORAGE_KEY = 'notif_seen_responsibilities_v1';
const SEEN_COMPLETED_TASKS_STORAGE_KEY = 'notif_seen_completed_tasks_v1';
const SEEN_BOT_MESSAGES_STORAGE_KEY = 'notif_seen_bot_messages_v1';
const SEEN_SMS_MESSAGES_STORAGE_KEY = 'notif_seen_sms_messages_v1';
const SEEN_VOIP_CALLS_STORAGE_KEY = 'notif_seen_voip_calls_v1';
type AssigneeQueryMode = 'primary' | 'typed_legacy_role' | 'id_only' | 'owner_only' | 'none';
const ASSIGNEE_QUERY_MODE_CACHE = new Map<string, AssigneeQueryMode>();
// Module-level directory cache: keeps users/roles across popover open-close cycles
// so avatars load instantly on re-open instead of re-fetching each time.
const _notifDirectoryCache: {
  orgId: string | null;
  users: Array<{ id: string; display_name: string; avatar_url?: string | null; role_id?: string | null }>;
  roles: Array<{ id: string; title: string }>;
} = { orgId: null, users: [], roles: [] };
type NotificationSectionKey = 'notes' | 'tasks' | 'responsibilities' | 'bot_messages' | 'sms_messages' | 'voip_calls';
type NotificationStateSectionKey = 'notes' | 'tasks' | 'responsibilities' | 'bot_messages' | 'sms' | 'voip_calls';
type DrawerTabKey = NotificationSectionKey | 'assistant';
type CreatedSortDirection = 'desc' | 'asc';
const CHAT_TAB_KEYS: DrawerTabKey[] = ['notes', 'bot_messages', 'sms_messages', 'voip_calls', 'assistant'];
const ALERT_TAB_KEYS: DrawerTabKey[] = ['tasks', 'responsibilities'];
const CHAT_SECTION_KEYS: NotificationSectionKey[] = ['notes', 'bot_messages', 'sms_messages', 'voip_calls'];
const ALERT_SECTION_KEYS: NotificationSectionKey[] = ['tasks', 'responsibilities'];
const normalizeTabForVariant = (
  variant: 'chat' | 'alerts',
  value: DrawerTabKey | null | undefined,
): DrawerTabKey => {
  const key = String(value || '').trim() as DrawerTabKey;
  if (variant === 'chat') {
    return CHAT_TAB_KEYS.includes(key) ? key : 'notes';
  }
  return ALERT_TAB_KEYS.includes(key) ? key : 'tasks';
};
const buildEnglishActivationBase = (value: any) => {
  const ascii = String(value || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
  if (!ascii) return '';
  const words = ascii.split(/\s+/).filter(Boolean).slice(0, 3);
  return words.join('-').slice(0, 20);
};

const DEFAULT_BOT_PLATFORM_STATE: BotPlatformState = {
  groupTitle: '',
  currentStatus: 'pending_join',
  activationCode: '',
  lastInboundAt: '',
  lastInboundText: '',
  allowedUserIds: [],
  allowedRoleIds: [],
  aiAutoReplyEnabled: false,
  aiCounterpartyGuide: '',
};

const createBotActivationCode = (englishName?: string, orgPrefix?: string) => {
  const prefix = String(orgPrefix || 'TAZESYSTEM').toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const base = buildEnglishActivationBase(englishName);
  return base ? `${prefix}-${base}-${random}` : `${prefix}-${random}`;
};
const loadOrgBotPrefix = async (): Promise<string> => {
  try {
    const result = await loadScopedCompanySettings(supabase);
    const nameEn = String(result?.data?.company_name_en || result?.data?.name_en || '').trim();
    if (!nameEn) return 'TAZESYSTEM';
    const ascii = nameEn.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').replace(/[^a-zA-Z0-9]+/g, '').toUpperCase().slice(0, 8);
    return ascii || 'TAZESYSTEM';
  } catch {
    return 'TAZESYSTEM';
  }
};
const isSectionTabKey = (value: DrawerTabKey): value is NotificationSectionKey =>
  value === 'notes' || value === 'tasks' || value === 'responsibilities' || value === 'bot_messages' || value === 'sms_messages' || value === 'voip_calls';
const getSectionsForVariant = (variant: 'chat' | 'alerts'): NotificationSectionKey[] =>
  variant === 'chat' ? CHAT_SECTION_KEYS : ALERT_SECTION_KEYS;
const SYSTEM_MESSAGES_USER_ID = '__system_messages__';
const CHAT_GROUP_PREFIX = 'group:';
const BOT_GROUP_FORWARD_PREFIX = 'botgroup:';
const NOTE_SELECT_FIELDS = 'id, module_id, record_id, content, author_id, author_name, mention_user_ids, mention_role_ids, created_at, reply_to, source_type, metadata, is_edited, edited_at';
type ChatGroupRow = {
  id: string;
  org_id: string | null;
  name: string;
  user_ids: string[];
  role_ids: string[];
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CounterpartyBotGroupRow = {
  id: string;
  target_type: 'customers' | 'suppliers' | string;
  customer_id: string | null;
  supplier_id: string | null;
  channel_type: 'rubika' | 'telegram' | 'bale' | string;
  status: string;
  group_title: string | null;
  group_join_link: string | null;
  bot_chat_id: string | null;
  updated_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  metadata?: Record<string, any> | null;
  counterparty_label?: string | null;
  counterparty_image_url?: string | null;
};

type CounterpartyBotMessageRow = {
  id: string;
  bot_group_id: string | null;
  direction: 'inbound' | 'outbound' | string;
  message_type: 'text' | 'image' | 'file' | 'invoice' | 'other' | string;
  chat_id?: string | null;
  provider_message_id?: string | null;
  content_text: string | null;
  file_url: string | null;
  file_name: string | null;
  mime_type?: string | null;
  payload?: Record<string, any> | null;
  created_by?: string | null;
  created_at: string | null;
};

const BOT_CHANNEL_LABELS_FA: Record<string, string> = {
  rubika: 'روبیکا',
  telegram: 'تلگرام',
  bale: 'بله',
};

type ConversationListItem = {
  id: string;
  kind: 'system' | 'direct' | 'group';
  conversationKey?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  noteCount: number;
  unreadCount: number;
  latestMessageAt: number;
  roleLabel?: string | null;
  userId?: string | null;
  groupId?: string | null;
  isGroup?: boolean;
};

type ConversationAvatarModel = {
  src?: string | null;
  className?: string;
  fallback: React.ReactNode;
};

const UnifiedConversationAvatar: React.FC<{
  size: number;
  src?: string | null;
  className?: string;
  fallback: React.ReactNode;
}> = ({ size, src, className, fallback }) => (
  <ProfileAvatar
    size={size}
    src={src || undefined}
    className={className}
    fallback={fallback}
    preset="avatar"
  />
);

const buildNoteConversationAvatarModel = ({
  kind,
  displayName,
  avatarUrl,
  systemAvatarSrc,
}: {
  kind: 'system' | 'direct' | 'group';
  displayName?: string | null;
  avatarUrl?: string | null;
  systemAvatarSrc?: string | null;
}): ConversationAvatarModel => {
  if (kind === 'system') {
    return {
      src: systemAvatarSrc || null,
      className: '!bg-slate-200 !text-slate-700 dark:!bg-white/10 dark:!text-slate-200',
      fallback: <BellOutlined />,
    };
  }
  if (kind === 'group') {
    return {
      src: null,
      className: '!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300',
      fallback: <TeamOutlined />,
    };
  }
  const normalizedDisplayName = String(displayName || '?').trim();
  return {
    src: avatarUrl || null,
    className: '',
    fallback: normalizedDisplayName.slice(0, 1) || '?',
  };
};

const buildBotConversationAvatarModel = (): ConversationAvatarModel => ({
  src: null,
  className: '!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300',
  fallback: <RobotOutlined />,
});

type UiNotificationItem = {
  id: string;
  dedupeKey?: string;
  kind: 'note' | 'task' | 'responsibility' | 'bot' | 'assistant' | 'voip_call' | 'sms';
  kindLabel?: string;
  title: string;
  body: string;
  createdAt: string | null;
  hasAttachments?: boolean;
  note?: any;
  task?: any;
  responsibility?: any;
  botMessage?: CounterpartyBotMessageRow | null;
  botGroupId?: string | null;
  smsMessage?: any;
  voipCall?: any;
};

const getBotMessageOverlayDedupeKey = (row: CounterpartyBotMessageRow) => {
  const groupId = String(row?.bot_group_id || '').trim();
  const providerMessageId = String(row?.provider_message_id || '').trim();
  if (groupId && providerMessageId) {
    return `bot-provider:${groupId}:${providerMessageId}`;
  }
  return `bot-row:${String(row?.id || '').trim()}`;
};

type ReadReceiptEntry = {
  userId: string;
  userName: string;
  readAt: string | null;
};

type LikeReceiptEntry = {
  userId: string;
  userName: string;
  likedAt: string | null;
};

type NotificationReadStateRow = {
  section: NotificationStateSectionKey;
  source_type: string;
  source_id: string;
  read_at: string | null;
  dismissed_at: string | null;
};

type NotificationInboxItemRow = {
  id: string;
  source_type: string;
  source_id: string;
  section: NotificationStateSectionKey;
  category: string | null;
  title: string | null;
  body: string | null;
  module_id: string | null;
  record_id: string | null;
  payload: Record<string, any> | null;
  last_event_at: string | null;
  created_at: string | null;
};

type NotificationStateEntry = {
  readAt: string | null;
  dismissedAt: string | null;
};

type NotificationStateEntryInput = {
  section: NotificationSectionKey;
  sourceType: string;
  sourceId: string;
  readAt?: string | null;
  dismissedAt?: string | null;
};

type DrawerCloseSnapshot = {
  variant: 'chat' | 'alerts';
  activeDrawerSection: NotificationSectionKey | null;
  selectedNoteUserId: string | null;
  selectedBotGroupId: string | null;
  displayedChatNotes: any[];
  botMessages: CounterpartyBotMessageRow[];
  displayedSmsMessages: any[];
  tasks: any[];
  responsibilities: any[];
  displayedVoipCalls: any[];
};

type SmsThreadItem = {
  id: string;
  phone: string;
  phoneNumberId: string | null;
  phoneMatchStatus: string | null;
  title: string;
  preview: string;
  unreadCount: number;
  latestMessageAt: number;
  messages: any[];
  moduleId: string | null;
  recordId: string | null;
};

type VoipThreadItem = {
  id: string;
  phone: string;
  phoneNumberId: string | null;
  phoneMatchStatus: string | null;
  title: string;
  unreadCount: number;
  latestEventAt: number;
  calls: any[];
  moduleId: string | null;
  recordId: string | null;
};

const loadSeenSet = (key: string) => {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.map((item: any) => String(item)));
  } catch {
    return new Set<string>();
  }
};

const persistSeenSet = (key: string, values: Set<string>) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(values)));
  } catch {
    // ignore storage errors
  }
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuidValue = (value: unknown) => UUID_REGEX.test(String(value || '').trim());
const formatBadgeCount = (count: number) => (count ? toPersianNumber(count) : 0);
const ENTRY_ANIMATION_WINDOW_MS = 12_000;
const LIKES_KEY = 'likes';
const EMPTY_READ_FALLBACK_SET = new Set<string>();

const TASK_VIEW_PRESETS = [
  { key: 'all', label: 'همه فعالیت‌ها' },
  { key: 'overdue', label: 'سررسیدگذشته‌ها' },
  { key: 'in_progress', label: 'در حال انجام' },
  { key: 'upcoming', label: 'فعالیت‌های پیش‌رو' },
] as const;

const STATUS_LABEL_FALLBACKS: Record<string, string> = {
  todo: 'انجام نشده',
  pending: 'در انتظار',
  in_progress: 'در حال انجام',
  review: 'بازبینی',
  done: 'تکمیل شده',
  completed: 'تکمیل شده',
  canceled: 'لغو شده',
};

const resolveStatusLabelFallback = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return STATUS_LABEL_FALLBACKS[normalized] || String(value || '').trim();
};

const toNotificationStateSection = (section: NotificationSectionKey): NotificationStateSectionKey => (
  section === 'sms_messages' ? 'sms' : section
);

const buildNotificationStateKey = (
  section: NotificationSectionKey | NotificationStateSectionKey,
  sourceType: string,
  sourceId: string,
) => `${section}:${String(sourceType || '').trim()}:${String(sourceId || '').trim()}`;

const getResponsibilitySourceType = (item: any) =>
  String(MODULES[String(item?.module_id || '')]?.table || item?.module_id || 'responsibility').trim();

const getModuleFieldOptionLabel = (moduleId: string, fieldKey: string, value: any) => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';
  const field = (MODULES[moduleId]?.fields || []).find((item: any) => String(item?.key || '') === fieldKey);
  const option = (field?.options || []).find((item: any) => String(item?.value ?? '').trim() === rawValue);
  return String(option?.label || rawValue).trim();
};

const getPhoneMatchLabel = (value: any) => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue || rawValue === 'matched') return '';
  if (rawValue === 'ambiguous') return 'نیاز به انتخاب مخاطب';
  if (rawValue === 'unknown') return 'شماره ناشناس';
  if (rawValue === 'manual') return 'تطبیق دستی';
  return rawValue;
};

const isPlainRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getReadReceiptsSource = (box: any) => {
  if (!isPlainRecord(box)) return null;
  return (
    box.read_receipts
    || box.readReceipts
    || box.seen_by
    || box.seenBy
    || box.read_by
    || box.readBy
    || null
  );
};

const getReadReceiptUserId = (value: any, fallback?: string) =>
  String(value?.user_id || value?.userId || value?.id || fallback || '').trim();

const getReadReceiptReadAt = (value: any) =>
  String(value?.read_at || value?.readAt || value?.seen_at || value?.seenAt || value?.at || '').trim() || null;

const getReadReceiptUserName = (value: any) =>
  String(value?.user_name || value?.userName || value?.name || value?.display_name || value?.displayName || '').trim();

const readReceiptMapFromBox = (box: any): Record<string, any> => {
  const source = getReadReceiptsSource(box);
  const map: Record<string, any> = {};
  if (Array.isArray(source)) {
    source.forEach((item) => {
      const userId = getReadReceiptUserId(item);
      if (!userId) return;
      map[userId] = item;
    });
    return map;
  }
  if (isPlainRecord(source)) {
    Object.entries(source).forEach(([key, value]) => {
      const userId = getReadReceiptUserId(value, key);
      if (!userId) return;
      map[userId] = isPlainRecord(value) ? value : { read_at: String(value || '').trim() || null };
    });
  }
  return map;
};

const getLikesSource = (box: any) => {
  if (!isPlainRecord(box)) return null;
  return box.likes || box.liked_by || box.likedBy || null;
};

const getLikeUserId = (value: any, fallback?: string) =>
  String(value?.user_id || value?.userId || value?.id || fallback || '').trim();

const getLikeUserName = (value: any) =>
  String(value?.user_name || value?.userName || value?.name || value?.display_name || value?.displayName || '').trim();

const getLikeAt = (value: any) =>
  String(value?.liked_at || value?.likedAt || value?.created_at || value?.createdAt || value?.at || '').trim() || null;

const likeReceiptMapFromBox = (box: any): Record<string, any> => {
  const source = getLikesSource(box);
  const map: Record<string, any> = {};
  if (Array.isArray(source)) {
    source.forEach((item) => {
      const userId = getLikeUserId(item);
      if (!userId) return;
      map[userId] = item;
    });
    return map;
  }
  if (isPlainRecord(source)) {
    Object.entries(source).forEach(([key, value]) => {
      const userId = getLikeUserId(value, key);
      if (!userId) return;
      map[userId] = isPlainRecord(value) ? value : { liked_at: String(value || '').trim() || null };
    });
  }
  return map;
};

const RESPONSIBILITY_REALTIME_TABLES = Array.from(
  new Set(
    Object.values(MODULES)
      .filter((mod: any) => mod?.id !== 'tasks' && mod?.id !== 'notes' && (mod?.table || mod?.id))
      .filter((mod: any) => supportsModuleAssignee(mod))
      .map((mod: any) => String(mod.table || mod.id))
      .filter(Boolean)
  )
);

type TaskViewPresetKey = typeof TASK_VIEW_PRESETS[number]['key'];

const formatRecordLabel = (row: any, moduleId?: string | null) => {
  if (!row) return '';
  const normalizedModuleId = String(moduleId || row?.module_id || '').trim() || null;
  const primary = getRecordDisplayLabel(row, normalizedModuleId, { fallback: '' }) || row.full_name || row.name || row.title || row.system_code;
  const code = row.system_code && primary !== row.system_code ? ` - ${row.system_code}` : '';
  const label = `${primary || ''}`.trim();
  if (!label) {
    const fallbackId = String(row.id || '').trim();
    if (fallbackId && !UUID_REGEX.test(fallbackId)) {
      return fallbackId;
    }
    return row.system_code || 'رکورد';
  }
  return `${label}${code}`.trim();
};

const isChatGroupSelection = (value: string | null | undefined) =>
  String(value || '').startsWith(CHAT_GROUP_PREFIX);

const getChatGroupSelectionId = (value: string | null | undefined) =>
  isChatGroupSelection(value) ? String(value).slice(CHAT_GROUP_PREFIX.length) : null;

const buildDirectConversationKey = (currentUserId: string, otherUserId: string) => {
  const left = String(currentUserId || '').trim();
  const right = String(otherUserId || '').trim();
  if (!left || !right) return null;
  return left <= right ? `direct:${left}:${right}` : `direct:${right}:${left}`;
};

const isMissingColumnError = (error: any, columnName: string) => {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'PGRST200' || code === 'PGRST204' || code === '42703') return true;
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const col = columnName.toLowerCase();
  return (
    message.includes(`column "${col}"`) ||
    message.includes(`${col} does not exist`) ||
    message.includes(`could not find the '${col}' column`) ||
    message.includes(`could not find the "${col}" column`) ||
    message.includes(`schema cache`) && message.includes(col)
  );
};

const isMissingTableLikeError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || message.includes('could not find the table') || message.includes('relation') && message.includes('does not exist');
};

const isAssigneeValueTypeError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '22P02'
    || code === '42883'
    || message.includes('invalid input syntax')
    || message.includes('operator does not exist')
  );
};

const probeAssigneeSelect = async (table: string, select: string) => {
  const { error } = await supabase
    .from(table)
    .select(select)
    .limit(0);
  return error || null;
};

const buildResponsibilitySelectColumns = (moduleId?: string | null) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const moduleConfig = MODULES[normalizedModuleId];
  const moduleFieldKeys = new Set(
    (moduleConfig?.fields || [])
      .map((field: any) => String(field?.key || '').trim())
      .filter(Boolean)
  );

  const moduleAwareColumns = [
    ...buildRecordTitleSelectColumns(normalizedModuleId),
    ...(moduleFieldKeys.has('status') ? ['status'] : []),
    ...(moduleFieldKeys.has('category') ? ['category'] : []),
    ...(moduleFieldKeys.has('created_by') ? ['created_by'] : []),
    ...(moduleFieldKeys.has('created_by_id') ? ['created_by_id'] : []),
  ];

  return Array.from(
    new Set([
      'id',
      'created_at',
      'updated_at',
      ...moduleAwareColumns,
    ])
  );
};

const safeFetchResponsibilityRows = async (table: string, moduleId: string, ids: string[]) => {
  const normalizedTable = String(table || '').trim();
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedIds = Array.from(new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!normalizedTable || normalizedIds.length === 0) return [] as any[];

  const rows: any[] = [];
  const chunkSize = normalizedTable === 'customers' || normalizedTable === 'suppliers' ? 40 : 80;
  const selectColumns = buildResponsibilitySelectColumns(normalizedModuleId);

  for (let index = 0; index < normalizedIds.length; index += chunkSize) {
    const chunk = normalizedIds.slice(index, index + chunkSize);
    const result = await runSelectWithCompatibleColumns<any[]>({
      cacheKey: `responsibility:${normalizedModuleId || normalizedTable}:${normalizedTable}`,
      columns: selectColumns,
      execute: (selectExpr) =>
        supabase
          .from(normalizedTable)
          .select(selectExpr)
          .in('id', chunk),
    });

    if (result.error) {
      if (isMissingTableLikeError(result.error)) {
        throw result.error;
      }
      throw result.error;
    }

    rows.push(...(result.data || []));
  }

  return rows;
};

const resolveAssigneeQueryModeForTable = async (table: string): Promise<AssigneeQueryMode> => {
  const normalizedTable = String(table || '').trim();
  if (!normalizedTable) return 'none';

  const cached = ASSIGNEE_QUERY_MODE_CACHE.get(normalizedTable);
  if (cached) return cached;

  const cache = (mode: AssigneeQueryMode) => {
    ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, mode);
    return mode;
  };

  const primaryError = await probeAssigneeSelect(normalizedTable, 'id,assignee_id,assignee_type,assignee_role_id');
  if (!primaryError) return cache('primary');
  if (isMissingTableLikeError(primaryError) || isMissingColumnError(primaryError, 'assignee_id')) return cache('none');

  const typedError = await probeAssigneeSelect(normalizedTable, 'id,assignee_id,assignee_type');
  if (!typedError) return cache('typed_legacy_role');
  if (isMissingTableLikeError(typedError) || isMissingColumnError(typedError, 'assignee_id')) return cache('none');

  const idOnlyError = await probeAssigneeSelect(normalizedTable, 'id,assignee_id');
  if (!idOnlyError) return cache('id_only');
  if (isMissingTableLikeError(idOnlyError) || isMissingColumnError(idOnlyError, 'assignee_id')) return cache('none');

  return cache('none');
};

const normalizeRoleRows = (rows: any[]) =>
  (rows || []).map((row: any) => ({
    id: row?.id,
    title: String(row?.title || row?.name || row?.id || '').trim(),
  }));

const getNoteMentionUserIds = (note: any) =>
  Array.isArray(note?.mention_user_ids)
    ? note.mention_user_ids.map((id: string) => String(id))
    : [];

const isSystemNote = (note: any) =>
  !String(note?.metadata?.chat_group_id || '').trim()
  && (String(note?.source_type || '').trim() === 'system'
  || String(note?.metadata?.source_type || '').trim() === 'system'
  || String(note?.source_type || '').trim() === 'ai'
  || String(note?.metadata?.source_type || '').trim() === 'ai'
  || Boolean(note?.metadata?.workflow_id || note?.metadata?.automation_rule_id || note?.metadata?.process_automation_rule_id));

const isAiNote = (note: any) =>
  String(note?.source_type || '').trim() === 'ai'
  || String(note?.metadata?.source_type || '').trim() === 'ai';

const isDirectConversationNote = (
  note: any,
  currentUserId: string,
  otherUserId: string,
  noteLookup?: Map<string, any>,
) => {
  if (!currentUserId || !otherUserId) return false;
  if (String(note?.metadata?.chat_group_id || '').trim()) return false;
  if (isSystemNote(note) || isAiNote(note)) return false;

  const authorId = String(note?.author_id || '').trim();
  const mentionUserIds = getNoteMentionUserIds(note);
  const isDirectMention = (
    (authorId === otherUserId && mentionUserIds.includes(currentUserId))
    || (authorId === currentUserId && mentionUserIds.includes(otherUserId))
  );

  if (isDirectMention) return true;
  if (!noteLookup || !note?.reply_to) return false;

  const replyTarget = noteLookup.get(String(note.reply_to));
  if (!replyTarget) return false;
  if (String(replyTarget?.metadata?.chat_group_id || '').trim()) return false;

  const replyAuthorId = String(replyTarget?.author_id || '').trim();
  const replyMentionUserIds = getNoteMentionUserIds(replyTarget);

  return (
    (authorId === otherUserId && replyAuthorId === currentUserId)
    || (authorId === currentUserId && replyAuthorId === otherUserId)
    || (authorId === otherUserId && replyMentionUserIds.includes(currentUserId))
    || (authorId === currentUserId && replyMentionUserIds.includes(otherUserId))
  );
};

const buildDirectoryMaps = async () => {
  const directory = await fetchAssigneeDirectory(supabase);
  return {
    userNameMap: directory.users.reduce<Record<string, string>>((acc, user) => {
      acc[user.id] = user.display_name || user.id;
      return acc;
    }, {}),
    roleTitleMap: directory.roles.reduce<Record<string, string>>((acc, role) => {
      acc[role.id] = role.title || role.id;
      return acc;
    }, {}),
  };
};

const shouldPauseNotesPolling = (error: any) => {
  if (!error) return false;
  const status = Number(error?.status || 0);
  if (status >= 500) return true;
  const code = String(error?.code || '').toUpperCase();
  if (code === 'PGRST301' || code === 'PGRST302') return true;
  return false;
};

const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({
  isMobile,
  variant = 'alerts',
  requestedTab,
  standalone = false,
  initialOpen = false,
  triggerless = false,
  onClosed,
}) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const initialTab = normalizeTabForVariant(variant, requestedTab);
  const [open, setOpen] = useState(standalone || initialOpen);
  const [drawerContentMounted, setDrawerContentMounted] = useState(standalone || initialOpen);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteLikeNotifications, setNoteLikeNotifications] = useState<NotificationInboxItemRow[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [responsibilities, setResponsibilities] = useState<any[]>([]);
  const [botGroups, setBotGroups] = useState<CounterpartyBotGroupRow[]>([]);
  const [selectedBotGroupId, setSelectedBotGroupId] = useState<string | null>(null);
  const [botMessageText, setBotMessageText] = useState('');
  const [botSending, setBotSending] = useState(false);
  const [botSuggesting, setBotSuggesting] = useState(false);
  const [botStatusModalOpen, setBotStatusModalOpen] = useState(false);
  const [botStatusModalLoading, setBotStatusModalLoading] = useState(false);
  const [botStatusModalSaving, setBotStatusModalSaving] = useState(false);
  const [botStatusActiveTab, setBotStatusActiveTab] = useState<BotChannel>('rubika');
  const [botStatusDefaultChannel, setBotStatusDefaultChannel] = useState<BotChannel>('rubika');
  const [botStatusFallbackToActive, setBotStatusFallbackToActive] = useState(false);
  const [botStatusPlatformData, setBotStatusPlatformData] = useState<Record<BotChannel, BotPlatformState>>({
    rubika: { ...DEFAULT_BOT_PLATFORM_STATE },
    telegram: { ...DEFAULT_BOT_PLATFORM_STATE },
    bale: { ...DEFAULT_BOT_PLATFORM_STATE },
  });
  const [botStatusCountdown, setBotStatusCountdown] = useState(0);
  const [botStatusWatchingChannel, setBotStatusWatchingChannel] = useState<BotChannel | null>(null);
  const [botAiPopoverOpen, setBotAiPopoverOpen] = useState(false);
  const [botGroupSearch, setBotGroupSearch] = useState('');
  const [botMessageSearch, setBotMessageSearch] = useState('');
  const [botNotificationMessages, setBotNotificationMessages] = useState<CounterpartyBotMessageRow[]>([]);
  const [smsMessages, setSmsMessages] = useState<any[]>([]);
  const [selectedSmsThreadKey, setSelectedSmsThreadKey] = useState<string | null>(null);
  const [smsRecipient, setSmsRecipient] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [voipCalls, setVoipCalls] = useState<any[]>([]);
  const [selectedVoipThreadKey, setSelectedVoipThreadKey] = useState<string | null>(null);
  const [botReplyToId, setBotReplyToId] = useState<string | null>(null);
  const [botAttachments, setBotAttachments] = useState<File[]>([]);
  const [botLinkedAttachments, setBotLinkedAttachments] = useState<NoteAttachment[]>([]);
  const [editingBotMessageId, setEditingBotMessageId] = useState<string | null>(null);
  const [editingBotMessageValue, setEditingBotMessageValue] = useState('');
  const [botMentionPickerOpen, setBotMentionPickerOpen] = useState(false);
  const [botTemplateRecord, setBotTemplateRecord] = useState<Record<string, any> | null>(null);
  const [mobileBotSearchOpen, setMobileBotSearchOpen] = useState(false);
  const [noteNewIncomingCount, setNoteNewIncomingCount] = useState(0);
  const [botNewIncomingCount, setBotNewIncomingCount] = useState(0);
  const [showMore, setShowMore] = useState({ notes: false, tasks: false, responsibilities: false });
  const [taskViewKey, setTaskViewKey] = useState<TaskViewPresetKey>('all');
  const [taskSortDirection, setTaskSortDirection] = useState<CreatedSortDirection>('desc');
  const [profile, setProfile] = useState<{ id: string | null; role_id: string | null; org_id?: string | null; full_name?: string | null; avatar_url?: string | null; voip_extension?: string | null; can_view_all_calls?: boolean }>({ id: null, role_id: null, org_id: null, full_name: null, avatar_url: null });
  const [recordTitleMap, setRecordTitleMap] = useState<Record<string, string>>({});
  const [assigneeNameMap, setAssigneeNameMap] = useState<Record<string, string>>({});
  const [roleNameMap, setRoleNameMap] = useState<Record<string, string>>({});
  const [authorNameMap, setAuthorNameMap] = useState<Record<string, string>>({});
  const [createdByNameMap, setCreatedByNameMap] = useState<Record<string, string>>({});
  const [directoryUsers, setDirectoryUsers] = useState<Array<{ id: string; display_name: string; avatar_url?: string | null; role_id?: string | null }>>(() => _notifDirectoryCache.users);
  const [directoryRoles, setDirectoryRoles] = useState<Array<{ id: string; title: string }>>(() => _notifDirectoryCache.roles);
  const [chatGroups, setChatGroups] = useState<ChatGroupRow[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ChatGroupRow | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupMemberDrafts, setGroupMemberDrafts] = useState<string[]>([]);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [noteModuleId, setNoteModuleId] = useState<string | null>(null);
  const [noteRecordId, setNoteRecordId] = useState<string | null>(null);
  const [noteRecordOptions, setNoteRecordOptions] = useState<{ label: string; value: string }[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteReplyTo, setNoteReplyTo] = useState<string | null>(null);
  const [noteAttachments, setNoteAttachments] = useState<File[]>([]);
  const [noteLinkedAttachments, setNoteLinkedAttachments] = useState<NoteAttachment[]>([]);
  const [noteSmsNotificationEnabled, setNoteSmsNotificationEnabled] = useState(false);
  const [selectedNoteUserId, setSelectedNoteUserId] = useState<string | null>(null);
  const [noteUserSearch, setNoteUserSearch] = useState('');
  const [noteMessageSearch, setNoteMessageSearch] = useState('');
  const [noteMentionPickerOpen, setNoteMentionPickerOpen] = useState(false);
  const [noteTemplateRecord, setNoteTemplateRecord] = useState<Record<string, any> | null>(null);
  const [noteMessageSearchOpen, setNoteMessageSearchOpen] = useState(false);
  const [mobileNoteSearchOpen, setMobileNoteSearchOpen] = useState(false);
  const [templateComposerContext, setTemplateComposerContext] = useState<'notes' | 'bot' | 'forward' | null>(null);
  const [mentionOptions, setMentionOptions] = useState<{ label: string; value: string }[]>([]);
  const [mentionValues, setMentionValues] = useState<string[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState('');
  const [forwardingNote, setForwardingNote] = useState<any | null>(null);
  const [forwardTargetUserIds, setForwardTargetUserIds] = useState<string[]>([]);
  const [forwardMessageText, setForwardMessageText] = useState('');
  const [forwardSubmitting, setForwardSubmitting] = useState(false);
  const [desktopActiveKey, setDesktopActiveKey] = useState<DrawerTabKey>(initialTab);
  const [mobileActiveKey, setMobileActiveKey] = useState<DrawerTabKey>(initialTab);
  const activeDrawerTab = isMobile ? mobileActiveKey : desktopActiveKey;
  const activeDrawerSection = isSectionTabKey(activeDrawerTab) ? activeDrawerTab : null;
  const [responsibilityViewKey, setResponsibilityViewKey] = useState('all');
  const [responsibilitySortDirection, setResponsibilitySortDirection] = useState<CreatedSortDirection>('desc');
  const [previewRecord, setPreviewRecord] = useState<{ moduleId: string; recordId: string; label?: string } | null>(null);
  const [taskProcessModalTask, setTaskProcessModalTask] = useState<any | null>(null);
  const [messageActivityDraft, setMessageActivityDraft] = useState<MessageActivityDraft | null>(null);
  const [taskProcessHostKey] = useState(0);
  const [noteViewportReady, setNoteViewportReady] = useState(true);
  const [botViewportReady, setBotViewportReady] = useState(true);
  const [myNotesDisplayLimit, setMyNotesDisplayLimit] = useState(15);
  const [seenNoteIds, setSeenNoteIds] = useState<Set<string>>(() => loadSeenSet(SEEN_NOTES_STORAGE_KEY));
  const [seenTaskIds, setSeenTaskIds] = useState<Set<string>>(() => loadSeenSet(SEEN_TASKS_STORAGE_KEY));
  const [seenResponsibilityIds, setSeenResponsibilityIds] = useState<Set<string>>(() => loadSeenSet(SEEN_RESP_STORAGE_KEY));
  const [seenCompletedTaskIds, setSeenCompletedTaskIds] = useState<Set<string>>(() => loadSeenSet(SEEN_COMPLETED_TASKS_STORAGE_KEY));
  const [seenBotMessageIds, setSeenBotMessageIds] = useState<Set<string>>(() => loadSeenSet(SEEN_BOT_MESSAGES_STORAGE_KEY));
  const [seenSmsMessageIds, setSeenSmsMessageIds] = useState<Set<string>>(() => loadSeenSet(SEEN_SMS_MESSAGES_STORAGE_KEY));
  const [seenVoipCallIds, setSeenVoipCallIds] = useState<Set<string>>(() => loadSeenSet(SEEN_VOIP_CALLS_STORAGE_KEY));
  const [dismissedUiNotificationIds, setDismissedUiNotificationIds] = useState<Set<string>>(() => new Set());
  const [notificationStateMap, setNotificationStateMap] = useState<Record<string, NotificationStateEntry>>({});
  const [uiNotifications, setUiNotifications] = useState<UiNotificationItem[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingResponsibilities, setLoadingResponsibilities] = useState(false);
  const [loadingBotMessages, setLoadingBotMessages] = useState(false);
  const [loadingSmsMessages, setLoadingSmsMessages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [noteSending, setNoteSending] = useState(false);
  const prevNotesRef = useRef<Set<string>>(new Set());
  const prevTasksRef = useRef<Set<string>>(new Set());
  const prevResponsibilitiesRef = useRef<Set<string>>(new Set());
  const prevBotMessageIdsRef = useRef<Set<string>>(new Set());
  const prevSmsMessageIdsRef = useRef<Set<string>>(new Set());
  const prevVoipCallIdsRef = useRef<Set<string>>(new Set());
  const notificationsReadyRef = useRef(false);
  const notesPollingPausedRef = useRef(false);
  const notesPollingPauseLoggedRef = useRef(false);
  const mobileDrawerHistoryActiveRef = useRef(false);
  const skipNextDrawerPopStateRef = useRef(false);
  const drawerCloseSnapshotRef = useRef<DrawerCloseSnapshot | null>(null);
  const notesScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingNoteScrollRestoreRef = useRef<number | null>(null);
  const noteShouldStickToBottomRef = useRef(true);
  const noteForceScrollToBottomRef = useRef(false);
  const lastLoadedAtRef = useRef<Record<NotificationSectionKey, number>>({
    notes: 0,
    tasks: 0,
    responsibilities: 0,
    bot_messages: 0,
    sms_messages: 0,
    voip_calls: 0,
  });
  const liveRefreshTimerRef = useRef<number | null>(null);
  const liveSectionRefreshTimersRef = useRef<Partial<Record<NotificationSectionKey, number>>>({});
  // Tracks when the last live (realtime-triggered) refresh fired per section.
  // Prevents rapid realtime events from hammering the DB on every event.
  const lastLiveRefreshAtRef = useRef<Partial<Record<NotificationSectionKey, number>>>({});
  const realtimeDisabledRef = useRef(false);
  const refreshAllRef = useRef<((notify?: boolean, options?: { force?: boolean }) => Promise<void>) | null>(null);
  const refreshSectionRef = useRef<((section: NotificationSectionKey, options?: { force?: boolean }) => Promise<void>) | null>(null);
  const refreshClosedStateRef = useRef<((options?: { force?: boolean }) => Promise<void>) | null>(null);
  const refreshAllInFlightRef = useRef(false);
  const refreshAllPendingRef = useRef<{ notify?: boolean; options?: { force?: boolean } } | null>(null);
  const refreshSectionInFlightRef = useRef<Partial<Record<NotificationSectionKey, boolean>>>({});
  const refreshSectionPendingRef = useRef<Partial<Record<NotificationSectionKey, { force?: boolean }>>>({});
  const notificationSoundWindowRef = useRef<{ startedAt: number; plays: number }>({ startedAt: 0, plays: 0 });
  const audioInteractionUnlockedRef = useRef(false);
  const assignedRecordPairsCacheRef = useRef<{
    loadedAt: number;
    userId: string;
    roleId: string;
    pairs: { module_id: string; record_id: string }[];
  }>({ loadedAt: 0, userId: '', roleId: '', pairs: [] });
  const botMessagesScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingBotScrollRestoreRef = useRef<number | null>(null);
  const botShouldStickToBottomRef = useRef(true);
  const botForceScrollToBottomRef = useRef(false);
  const smsMessagesScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const templateRecordCacheRef = useRef<Map<string, Record<string, any> | null>>(new Map());
  const noteConversationKeyRef = useRef<string | null>(null);
  const noteConversationMessageIdsRef = useRef<Set<string>>(new Set());
  const botConversationKeyRef = useRef<string | null>(null);
  const botConversationMessageIdsRef = useRef<Set<string>>(new Set());
  const noteInitialAnchorDoneRef = useRef(false);
  const botInitialAnchorDoneRef = useRef(false);
  const botMessagesFetchSeqRef = useRef(0);
  const botMessagesRef = useRef<CounterpartyBotMessageRow[]>([]);
  const botMessagesGroupIdRef = useRef<string | null>(null);
  const hydratingBotMessageIdsRef = useRef<Set<string>>(new Set());
  const botHydrationFailuresRef = useRef<Map<string, { attempts: number; lastAttemptAt: number }>>(new Map());
  const loggedBotHydrationFailuresRef = useRef<Set<string>>(new Set());
  const botStatusWatchTimerRef = useRef<number | null>(null);
  const botGroupsEnrichSeqRef = useRef(0);
  const backgroundSectionRefreshTimerRef = useRef<number | null>(null);

  const tasksConfig = MODULES['tasks'];
  const statusOptions = tasksConfig?.fields?.find((f: any) => f.key === 'status')?.options || [];
  const toNumber = (value: any) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const communicationCacheScopeKey = `${String(profile.org_id || '').trim() || 'org'}:${String(profile.id || '').trim() || 'user'}`;
  const shouldAnimateChatEntry = useCallback((createdAt: any) => {
    const time = new Date(createdAt || '').getTime();
    if (!Number.isFinite(time)) return false;
    return Date.now() - time <= ENTRY_ANIMATION_WINDOW_MS;
  }, []);
  const moduleOptions = Object.values(MODULES)
    .filter((mod: any) => mod?.id && (mod?.table || mod?.id))
    .map((mod: any) => ({ label: mod.titles?.fa || mod.id, value: mod.id }));
  const {
    items: rpcBotConversationSummaries,
    available: botConversationSummaryAvailable,
    refresh: refreshBotConversationSummaries,
    setItems: setRpcBotConversationSummaries,
  } = useNotificationConversationList({
    supabase,
    section: 'bot_messages',
    enabled: variant === 'chat' && Boolean(profile.id),
    cacheScopeKey: communicationCacheScopeKey,
  });
  const {
    items: rpcNoteConversationSummaries,
    available: noteConversationSummaryAvailable,
    refresh: refreshNoteConversationSummaries,
    setItems: setRpcNoteConversationSummaries,
  } = useNotificationConversationList({
    supabase,
    section: 'notes',
    enabled: variant === 'chat' && Boolean(profile.id),
    cacheScopeKey: communicationCacheScopeKey,
  });

  // Debounced conversation summary refreshes — prevents N RPC calls when N messages are marked as read
  const debouncedNoteRefreshTimerRef = useRef<number | null>(null);
  const debouncedRefreshNoteConversationSummaries = useCallback(() => {
    if (debouncedNoteRefreshTimerRef.current !== null) window.clearTimeout(debouncedNoteRefreshTimerRef.current);
    debouncedNoteRefreshTimerRef.current = window.setTimeout(() => {
      debouncedNoteRefreshTimerRef.current = null;
      void refreshNoteConversationSummaries();
    }, 500);
  }, [refreshNoteConversationSummaries]);
  const debouncedBotRefreshTimerRef = useRef<number | null>(null);
  const debouncedRefreshBotConversationSummaries = useCallback(() => {
    if (debouncedBotRefreshTimerRef.current !== null) window.clearTimeout(debouncedBotRefreshTimerRef.current);
    debouncedBotRefreshTimerRef.current = window.setTimeout(() => {
      debouncedBotRefreshTimerRef.current = null;
      void refreshBotConversationSummaries();
    }, 500);
  }, [refreshBotConversationSummaries]);

  const botSummaryMap = useMemo(() => {
    const map = new Map<string, NotificationConversationSummary>();
    (rpcBotConversationSummaries || []).forEach((item) => {
      const botGroupId = String(item?.bot_group_id || '').trim();
      if (botGroupId) {
        map.set(botGroupId, item);
      }
    });
    return map;
  }, [rpcBotConversationSummaries]);
  const effectiveBotGroups = useMemo(() => {
    if (!(botConversationSummaryAvailable && rpcBotConversationSummaries)) return botGroups;
    return botGroups
      .map((row) => {
        const summary = botSummaryMap.get(String(row.id)) || null;
        return summary ? {
          ...row,
          group_title: String(summary.title || row.group_title || '').trim() || row.group_title,
          status: String(summary.status || row.status || '').trim() || row.status,
          channel_type: String(summary.channel_type || row.channel_type || '').trim() || row.channel_type,
          counterparty_label: summary.counterparty_label || row.counterparty_label || null,
          bot_chat_id: summary.bot_chat_id || row.bot_chat_id || null,
        } : row;
      })
      .sort((left, right) => {
        const leftSummary = botSummaryMap.get(String(left.id));
        const rightSummary = botSummaryMap.get(String(right.id));
        const leftTime = new Date(leftSummary?.latest_message_at || left.last_inbound_at || left.last_outbound_at || left.updated_at || 0).getTime() || 0;
        const rightTime = new Date(rightSummary?.latest_message_at || right.last_inbound_at || right.last_outbound_at || right.updated_at || 0).getTime() || 0;
        return rightTime - leftTime;
      });
  }, [botConversationSummaryAvailable, botGroups, botSummaryMap, rpcBotConversationSummaries]);
  const selectedBotGroup = useMemo(
    () => effectiveBotGroups.find((row) => String(row.id) === String(selectedBotGroupId || '')) || null,
    [effectiveBotGroups, selectedBotGroupId]
  );
  const visibleBotGroupIds = useMemo(
    () => new Set(effectiveBotGroups.map((row) => String(row.id || '').trim()).filter(Boolean)),
    [effectiveBotGroups]
  );

  const clearBotStatusWatchTimer = useCallback(() => {
    if (botStatusWatchTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(botStatusWatchTimerRef.current);
      botStatusWatchTimerRef.current = null;
    }
  }, []);

  const loadBotStatusRow = useCallback(async (group: CounterpartyBotGroupRow) => {
    const orgPrefix = await loadOrgBotPrefix();
    const counterpartyLabel = String(group?.counterparty_label || '').trim();
    const targetType = String(group?.target_type || '').trim() as 'customers' | 'suppliers';
    const counterpartyId = targetType === 'customers'
      ? String(group?.customer_id || '').trim()
      : String(group?.supplier_id || '').trim();
    if (!counterpartyId) return;

    let groupQuery = supabase
      .from('counterparty_bot_groups')
      .select('id, channel_type, status, group_title, metadata, last_inbound_at, bot_chat_id')
      .limit(10);
    groupQuery = targetType === 'customers'
      ? groupQuery.eq('customer_id', counterpartyId)
      : groupQuery.eq('supplier_id', counterpartyId);
    const { data: rows, error } = await groupQuery;
    if (error) throw error;
    const rowMap = new Map((rows || []).map((row: any) => [String(row?.channel_type || '').trim(), row] as const));

    let prefQuery = supabase.from('counterparty_bot_config').select('default_channel, fallback_to_active').limit(1);
    prefQuery = targetType === 'customers' ? prefQuery.eq('customer_id', counterpartyId) : prefQuery.eq('supplier_id', counterpartyId);
    const { data: prefRow } = await prefQuery.maybeSingle();
    const defaultChannel = (['rubika', 'telegram', 'bale'].includes(String(prefRow?.default_channel || ''))
      ? prefRow!.default_channel : 'rubika') as BotChannel;

    const groupIds = (rows || []).map((r: any) => String(r?.id || '').trim()).filter(Boolean);
    const inboundMap = new Map<string, { created_at: string; content_text: string }>();
    if (groupIds.length > 0) {
      const { data: inboundRows } = await supabase
        .from('counterparty_bot_messages').select('created_at, content_text, bot_group_id')
        .in('bot_group_id', groupIds).eq('direction', 'inbound')
        .order('created_at', { ascending: false }).limit(20);
      (inboundRows || []).forEach((r: any) => {
        const gid = String(r?.bot_group_id || '').trim();
        if (gid && !inboundMap.has(gid)) inboundMap.set(gid, r);
      });
    }

    const platforms: Record<BotChannel, BotPlatformState> = {
      rubika: { ...DEFAULT_BOT_PLATFORM_STATE },
      telegram: { ...DEFAULT_BOT_PLATFORM_STATE },
      bale: { ...DEFAULT_BOT_PLATFORM_STATE },
    };
    for (const channel of ['rubika', 'telegram', 'bale'] as BotChannel[]) {
      const row = rowMap.get(channel) || null;
      const metadata = (row?.metadata && typeof row.metadata === 'object') ? row.metadata : {};
      const existingCode = String(metadata?.activation_code || '').trim().toUpperCase();
      const rowId = String(row?.id || '').trim();
      const inbound = rowId ? inboundMap.get(rowId) : null;
      const rawStatus = String(row?.status || 'pending_join').trim();
      platforms[channel] = {
        groupTitle: String(row?.group_title || '').trim(),
        currentStatus: rawStatus === 'pending_join_link' ? 'pending_join' : (rawStatus || 'pending_join'),
        activationCode: existingCode || createBotActivationCode(counterpartyLabel, orgPrefix),
        lastInboundAt: String(inbound?.created_at || row?.last_inbound_at || '').trim(),
        lastInboundText: String(inbound?.content_text || '').trim(),
        allowedUserIds: Array.isArray(metadata?.allowed_user_ids) ? metadata.allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean) : [],
        allowedRoleIds: Array.isArray(metadata?.allowed_role_ids) ? metadata.allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean) : [],
        aiAutoReplyEnabled: Boolean(metadata?.ai_auto_reply_enabled),
        aiCounterpartyGuide: String(metadata?.ai_counterparty_guide || '').trim(),
      };
    }

    setBotStatusPlatformData(platforms);
    setBotStatusDefaultChannel(defaultChannel);
    setBotStatusFallbackToActive(Boolean(prefRow?.fallback_to_active));
    setBotStatusActiveTab(defaultChannel);
  }, []);

  const saveBotStatusSettings = useCallback(async (options?: { forceCapture?: boolean; captureChannel?: BotChannel; captureSeconds?: number }) => {
    if (!selectedBotGroup) return;
    const forceCapture = options?.forceCapture === true;
    const captureChannel = options?.captureChannel || botStatusActiveTab;
    const captureSeconds = Number(options?.captureSeconds || 30);
    const nowIso = new Date().toISOString();
    const captureExpiresAt = forceCapture ? new Date(Date.now() + Math.max(10, captureSeconds) * 1000).toISOString() : null;
    const targetType = selectedBotGroup.target_type === 'customers' ? 'customers' : 'suppliers';
    const counterpartyId = targetType === 'customers' ? String(selectedBotGroup.customer_id || '').trim() : String(selectedBotGroup.supplier_id || '').trim();

    for (const channel of ['rubika', 'telegram', 'bale'] as BotChannel[]) {
      const platformState = botStatusPlatformData[channel];
      if (!platformState) continue;
      const isCapturing = forceCapture && channel === captureChannel;
      let existingQuery = supabase.from('counterparty_bot_groups').select('id, status, bot_chat_id, metadata').eq('channel_type', channel).limit(1);
      existingQuery = targetType === 'customers' ? existingQuery.eq('customer_id', counterpartyId) : existingQuery.eq('supplier_id', counterpartyId);
      const { data: existingRows } = await existingQuery;
      const existingRow = Array.isArray(existingRows) ? existingRows[0] : null;
      const existingStatus = String(existingRow?.status || '').trim() === 'pending_join_link' ? 'pending_join' : String(existingRow?.status || '').trim();
      const existingChatId = String(existingRow?.bot_chat_id || '').trim();
      const existingMetadata = (existingRow?.metadata && typeof existingRow.metadata === 'object') ? existingRow.metadata : {};
      const nextStatus = isCapturing ? 'pending_join' : ((existingStatus === 'active' && existingChatId) ? 'active' : 'pending_join');
      const payload: Record<string, any> = {
        target_type: targetType, channel_type: channel, status: nextStatus,
        group_title: String(platformState.groupTitle || '').trim() || null,
        metadata: { ...existingMetadata, activation_code: String(platformState.activationCode || '').trim().toUpperCase(), activation_required: true, capture_mode: isCapturing, capture_started_at: isCapturing ? nowIso : null, capture_expires_at: isCapturing ? captureExpiresAt : null, last_capture_channel: isCapturing ? channel : existingMetadata?.last_capture_channel, allowed_user_ids: platformState.allowedUserIds, allowed_role_ids: platformState.allowedRoleIds, ai_auto_reply_enabled: platformState.aiAutoReplyEnabled, ai_counterparty_guide: String(platformState.aiCounterpartyGuide || '').trim() || null, activation_confirmation_sent: isCapturing ? false : Boolean(existingMetadata?.activation_confirmation_sent), last_capture_error: isCapturing ? null : existingMetadata?.last_capture_error, activation_updated_at: nowIso },
        updated_by: null, customer_id: targetType === 'customers' ? counterpartyId : null, supplier_id: targetType === 'suppliers' ? counterpartyId : null,
      };
      if (existingRow?.id) {
        const { error } = await supabase.from('counterparty_bot_groups').update(payload).eq('id', String(existingRow.id));
        if (error) throw error;
      } else {
        const { error } = await supabase.from('counterparty_bot_groups').insert([payload]);
        if (error) throw error;
      }
    }

    // ذخیره تنظیمات پیش‌فرض در counterparty_bot_config
    const configPayload = { default_channel: botStatusDefaultChannel, fallback_to_active: botStatusFallbackToActive, customer_id: targetType === 'customers' ? counterpartyId : null, supplier_id: targetType === 'suppliers' ? counterpartyId : null };
    let existingConfigQuery = supabase.from('counterparty_bot_config').select('id').limit(1);
    existingConfigQuery = targetType === 'customers' ? existingConfigQuery.eq('customer_id', counterpartyId) : existingConfigQuery.eq('supplier_id', counterpartyId);
    const { data: existingConfigRow } = await existingConfigQuery.maybeSingle();
    if (existingConfigRow?.id) {
      await supabase.from('counterparty_bot_config').update(configPayload).eq('id', String(existingConfigRow.id));
    } else {
      await supabase.from('counterparty_bot_config').insert([configPayload]);
    }
  }, [botStatusActiveTab, botStatusDefaultChannel, botStatusFallbackToActive, botStatusPlatformData, selectedBotGroup]);

  const handleOpenBotStatusModal = useCallback(async () => {
    if (!selectedBotGroup) return;
    setBotStatusModalOpen(true);
    setBotStatusModalLoading(true);
    clearBotStatusWatchTimer();
    setBotStatusWatchingChannel(null);
    setBotStatusCountdown(0);
    try {
      await loadBotStatusRow(selectedBotGroup);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'خواندن تنظیم گروه بات ناموفق بود.'));
    } finally {
      setBotStatusModalLoading(false);
    }
  }, [clearBotStatusWatchTimer, loadBotStatusRow, message, selectedBotGroup]);
  const handleCloseBotStatusModal = useCallback(() => {
    clearBotStatusWatchTimer();
    setBotStatusWatchingChannel(null);
    setBotStatusCountdown(0);
    setBotStatusModalOpen(false);
  }, [clearBotStatusWatchTimer]);
  const handleSaveBotStatusModal = useCallback(async () => {
    if (!selectedBotGroup) return;
    try {
      setBotStatusModalSaving(true);
      await saveBotStatusSettings();
      await loadBotStatusRow(selectedBotGroup);
      message.success('وضعیت گروه بات ذخیره شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره وضعیت گروه بات ناموفق بود.'));
    } finally {
      setBotStatusModalSaving(false);
    }
  }, [loadBotStatusRow, message, saveBotStatusSettings, selectedBotGroup]);
  const handleStartBotBindWatch = useCallback(async (channel: BotChannel) => {
    if (!selectedBotGroup) return;
    try {
      setBotStatusModalSaving(true);
      await saveBotStatusSettings({ forceCapture: true, captureChannel: channel, captureSeconds: 30 });
      await loadBotStatusRow(selectedBotGroup);
      clearBotStatusWatchTimer();
      setBotStatusWatchingChannel(channel);
      setBotStatusCountdown(30);
      let remaining = 30;
      botStatusWatchTimerRef.current = window.setInterval(async () => {
        remaining -= 1;
        setBotStatusCountdown(Math.max(remaining, 0));
        if (remaining % 2 === 0) {
          try {
            await loadBotStatusRow(selectedBotGroup);
          } catch {
            // ignore poll error
          }
        }
        if (remaining <= 0) {
          clearBotStatusWatchTimer();
          setBotStatusWatchingChannel(null);
          setBotStatusCountdown(0);
          message.info('زمان انتظار bind تمام شد. در صورت نیاز دوباره شروع کنید.');
        }
      }, 1000);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'شروع حالت انتظار bind ناموفق بود.'));
      setBotStatusWatchingChannel(null);
      setBotStatusCountdown(0);
    } finally {
      setBotStatusModalSaving(false);
    }
  }, [clearBotStatusWatchTimer, loadBotStatusRow, message, saveBotStatusSettings, selectedBotGroup]);
  const handleCopyBotActivationCode = useCallback(async (channel: BotChannel) => {
    try {
      const code = String(botStatusPlatformData[channel]?.activationCode || '').trim();
      await navigator.clipboard.writeText(code);
      message.success('کد فعال‌سازی کپی شد.');
    } catch {
      message.error('کپی کد فعال‌سازی ناموفق بود.');
    }
  }, [botStatusPlatformData, message]);
  useEffect(() => () => {
    clearBotStatusWatchTimer();
  }, [clearBotStatusWatchTimer]);
  const [systemAvatarSrc, setSystemAvatarSrc] = useState<string>(() => {
    if (typeof document === 'undefined') return '/favicon.svg';
    return String(document.querySelector<HTMLLinkElement>("link[rel~='icon']")?.href || '/favicon.svg').trim() || '/favicon.svg';
  });
  // Update system avatar when org branding changes (e.g. company logo set as favicon)
  useEffect(() => {
    const readFavicon = () => {
      const href = String(document.querySelector<HTMLLinkElement>("link[rel~='icon']")?.href || '/favicon.svg').trim();
      if (href) setSystemAvatarSrc(href);
    };
    window.addEventListener('erp:branding-updated', readFavicon);
    window.addEventListener('erp:branding-applied', readFavicon);
    return () => {
      window.removeEventListener('erp:branding-updated', readFavicon);
      window.removeEventListener('erp:branding-applied', readFavicon);
    };
  }, []);
  // Preload all directory avatar URLs into browser memory cache
  useEffect(() => {
    const urls = directoryUsers.map(u => u.avatar_url).filter((url): url is string => Boolean(url));
    if (systemAvatarSrc && !systemAvatarSrc.startsWith('/')) urls.push(systemAvatarSrc);
    preloadAvatarUrls(urls, 'avatar');
  }, [directoryUsers, systemAvatarSrc]);
  useEffect(() => {
    const handleAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ProfileAvatarUpdatedDetail>).detail;
      const profileId = String(detail?.profileId || '').trim();
      if (!profileId) return;
      const avatarUrl = detail?.avatarUrl || null;
      const fullName = detail?.fullName || null;

      setProfile((prev) => {
        if (String(prev?.id || '') !== profileId) return prev;
        return {
          ...prev,
          avatar_url: avatarUrl,
          full_name: fullName ?? prev.full_name ?? null,
        };
      });
      setDirectoryUsers((prev) => prev.map((user) => (
        String(user?.id || '') === profileId
          ? { ...user, avatar_url: avatarUrl, display_name: fullName || user.display_name }
          : user
      )));
    };

    window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleAvatarUpdated as EventListener);
    return () => {
      window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleAvatarUpdated as EventListener);
    };
  }, []);
  const selectedBotModuleId = useMemo(() => {
    if (!selectedBotGroup) return null;
    return String(selectedBotGroup.target_type || '').trim() === 'customers' ? 'customers' : 'suppliers';
  }, [selectedBotGroup]);
  const selectedBotRecordId = useMemo(() => {
    if (!selectedBotGroup) return null;
    return selectedBotModuleId === 'customers'
      ? String(selectedBotGroup.customer_id || '').trim() || null
      : String(selectedBotGroup.supplier_id || '').trim() || null;
  }, [selectedBotGroup, selectedBotModuleId]);

  const fetchTemplateRecord = useCallback(async (moduleId?: string | null, recordId?: string | null) => {
    const normalizedModuleId = String(moduleId || '').trim();
    const normalizedRecordId = String(recordId || '').trim();
    if (!normalizedModuleId || !normalizedRecordId) return null;

    const cacheKey = `${normalizedModuleId}:${normalizedRecordId}`;
    if (templateRecordCacheRef.current.has(cacheKey)) {
      return templateRecordCacheRef.current.get(cacheKey) || null;
    }

    const table = MODULES[normalizedModuleId]?.table || normalizedModuleId;
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', normalizedRecordId)
      .maybeSingle();
    if (error) throw error;
    const normalized = (data || null) as Record<string, any> | null;
    templateRecordCacheRef.current.set(cacheKey, normalized);
    return normalized;
  }, []);

  const openReadyTextsModal = useCallback((context: 'notes' | 'bot' | 'forward') => {
    setTemplateComposerContext(context);
  }, []);

  const insertTemplateToken = useCallback((token: string) => {
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) return;
    if (templateComposerContext === 'forward') {
      setForwardMessageText((prev) => `${String(prev || '')}${normalizedToken}`);
      return;
    }
    if (templateComposerContext === 'bot') {
      setBotMessageText((prev) => `${String(prev || '')}${normalizedToken}`);
      return;
    }
    setNoteText((prev) => `${String(prev || '')}${normalizedToken}`);
  }, [templateComposerContext]);

  const applyReadyText = useCallback((content: string) => {
    const normalizedContent = String(content || '');
    if (!normalizedContent.trim()) return;
    if (templateComposerContext === 'forward') {
      setForwardMessageText((prev) => (String(prev || '').trim() ? `${String(prev || '').trim()}\n${normalizedContent}` : normalizedContent));
      return;
    }
    if (templateComposerContext === 'bot') {
      setBotMessageText((prev) => (String(prev || '').trim() ? `${String(prev || '').trim()}\n${normalizedContent}` : normalizedContent));
      return;
    }
    setNoteText((prev) => (String(prev || '').trim() ? `${String(prev || '').trim()}\n${normalizedContent}` : normalizedContent));
  }, [templateComposerContext]);

  const requestReplySuggestion = useCallback(async (payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('ai-assistant', {
      body: {
        action: 'suggest_reply',
        ...payload,
      },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(String(data?.message || 'دریافت پیشنهاد پاسخ ناموفق بود.'));
    const suggestedReply = String(data?.suggestedReply || '').trim();
    if (!suggestedReply) throw new Error('متن پیشنهادی معتبری دریافت نشد.');
    return suggestedReply;
  }, []);

  const activeTemplateModuleId = useMemo(() => templateComposerContext === 'forward'
    ? (
      String((forwardingNote as any)?.__forward_source_type || 'note').trim() === 'note'
        ? (String(forwardingNote?.module_id || '').trim() || null)
        : selectedBotModuleId
    )
    : (templateComposerContext === 'bot' ? selectedBotModuleId : noteModuleId),
    [templateComposerContext, forwardingNote, selectedBotModuleId, noteModuleId]);
  const activeTemplateRecord = useMemo(() => templateComposerContext === 'forward'
    ? null
    : (templateComposerContext === 'bot' ? botTemplateRecord : noteTemplateRecord),
    [templateComposerContext, botTemplateRecord, noteTemplateRecord]);
useEffect(() => {
    let cancelled = false;
    if (!noteModuleId || !noteRecordId) {
      setNoteTemplateRecord(null);
      return () => {
        cancelled = true;
      };
    }
    const load = async () => {
      try {
        const row = await fetchTemplateRecord(noteModuleId, noteRecordId);
        if (!cancelled) setNoteTemplateRecord(row);
      } catch {
        if (!cancelled) setNoteTemplateRecord(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchTemplateRecord, noteModuleId, noteRecordId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedBotModuleId || !selectedBotRecordId) {
      setBotTemplateRecord(null);
      return () => {
        cancelled = true;
      };
    }
    const load = async () => {
      try {
        const row = await fetchTemplateRecord(selectedBotModuleId, selectedBotRecordId);
        if (!cancelled) setBotTemplateRecord(row);
      } catch {
        if (!cancelled) setBotTemplateRecord(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchTemplateRecord, selectedBotModuleId, selectedBotRecordId]);

  useEffect(() => {
    const loadProfile = async () => {
      const snapshot = await fetchSessionBootstrap(supabase);
      if (!snapshot.user?.id) return;
      const voipAccess = resolveVoipAccessPermissions((snapshot.permissions || null) as any);
      setProfile({
        id: snapshot.user.id,
        role_id: snapshot.roleId || null,
        org_id: snapshot.orgId || snapshot.profile?.org_id || null,
        full_name: snapshot.profile?.full_name || snapshot.user?.user_metadata?.full_name || null,
        avatar_url: snapshot.profile?.avatar_url || snapshot.user?.user_metadata?.avatar_url || null,
        voip_extension: snapshot.profile?.voip_extension ? String(snapshot.profile.voip_extension) : null,
        can_view_all_calls: voipAccess.canViewAllCallNotifications,
      });
    };
    loadProfile();
  }, []);

  useEffect(() => {
    persistSeenSet(SEEN_NOTES_STORAGE_KEY, seenNoteIds);
  }, [seenNoteIds]);

  useEffect(() => {
    persistSeenSet(SEEN_TASKS_STORAGE_KEY, seenTaskIds);
  }, [seenTaskIds]);

  useEffect(() => {
    persistSeenSet(SEEN_RESP_STORAGE_KEY, seenResponsibilityIds);
  }, [seenResponsibilityIds]);

  useEffect(() => {
    persistSeenSet(SEEN_COMPLETED_TASKS_STORAGE_KEY, seenCompletedTaskIds);
  }, [seenCompletedTaskIds]);

  useEffect(() => {
    persistSeenSet(SEEN_BOT_MESSAGES_STORAGE_KEY, seenBotMessageIds);
  }, [seenBotMessageIds]);

  useEffect(() => {
    persistSeenSet(SEEN_SMS_MESSAGES_STORAGE_KEY, seenSmsMessageIds);
  }, [seenSmsMessageIds]);

  useEffect(() => {
    persistSeenSet(SEEN_VOIP_CALLS_STORAGE_KEY, seenVoipCallIds);
  }, [seenVoipCallIds]);

  useEffect(() => {
    if (variant !== 'chat') {
      setVoipCalls([]);
    }
  }, [variant]);

  const relevantNotificationStateSections = useMemo<NotificationStateSectionKey[]>(
    () => Array.from(new Set(getSectionsForVariant(variant).map(toNotificationStateSection))),
    [variant]
  );

  const mergeNotificationStateEntries = useCallback((entries: Array<NotificationReadStateRow | NotificationStateEntryInput>) => {
    if (!Array.isArray(entries) || entries.length === 0) return;
    setNotificationStateMap((prev) => {
      let changed = false;
      const next = { ...prev };
      entries.forEach((entry: any) => {
        const rawSection = String(entry?.section || '').trim();
        const sourceType = String(entry?.source_type || entry?.sourceType || '').trim();
        const sourceId = String(entry?.source_id || entry?.sourceId || '').trim();
        if (!rawSection || !sourceType || !sourceId) return;
        const section = (rawSection === 'sms_messages' ? 'sms' : rawSection) as NotificationStateSectionKey;
        const key = buildNotificationStateKey(section, sourceType, sourceId);
        const current = next[key];
        const readAt = entry?.read_at ?? entry?.readAt ?? current?.readAt ?? null;
        const dismissedAt = entry?.dismissed_at ?? entry?.dismissedAt ?? current?.dismissedAt ?? null;
        if (!current || current.readAt !== readAt || current.dismissedAt !== dismissedAt) {
          next[key] = { readAt, dismissedAt };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const persistNotificationStateEntries = useCallback(async (entries: NotificationStateEntryInput[]) => {
    if (!profile.id || !profile.org_id || !Array.isArray(entries) || entries.length === 0) return;
    const deduped = new Map<string, any>();
    entries.forEach((entry) => {
      const sourceType = String(entry?.sourceType || '').trim();
      const sourceId = String(entry?.sourceId || '').trim();
      if (!sourceType || !sourceId) return;
      const section = toNotificationStateSection(entry.section);
      deduped.set(
        buildNotificationStateKey(section, sourceType, sourceId),
        {
          org_id: profile.org_id,
          user_id: profile.id,
          section,
          source_type: sourceType,
          source_id: sourceId,
          read_at: entry.readAt ?? null,
          dismissed_at: entry.dismissedAt ?? null,
        }
      );
    });
    if (deduped.size === 0) return;
    const { error } = await supabase
      .from('notification_read_states')
      .upsert(Array.from(deduped.values()), { onConflict: 'org_id,user_id,source_type,source_id' });
    if (error && !isMissingTableLikeError(error)) {
      console.warn('Could not persist notification read states', error);
    }
  }, [profile.id, profile.org_id]);

  useEffect(() => {
    if (!profile.id || !profile.org_id || relevantNotificationStateSections.length === 0) {
      setNotificationStateMap({});
      return;
    }
    let cancelled = false;
    const loadNotificationReadStates = async () => {
      const { data, error } = await supabase
        .from('notification_read_states')
        .select('section, source_type, source_id, read_at, dismissed_at, updated_at')
        .eq('org_id', profile.org_id)
        .eq('user_id', profile.id)
        .in('section', relevantNotificationStateSections)
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (error) {
        if (!isMissingTableLikeError(error)) {
          console.warn('Could not load notification read states', error);
        }
        if (!cancelled) setNotificationStateMap({});
        return;
      }
      if (cancelled) return;
      const nextMap: Record<string, NotificationStateEntry> = {};
      (data || []).forEach((row: any) => {
        const section = String(row?.section || '').trim() as NotificationStateSectionKey;
        const sourceType = String(row?.source_type || '').trim();
        const sourceId = String(row?.source_id || '').trim();
        if (!section || !sourceType || !sourceId) return;
        nextMap[buildNotificationStateKey(section, sourceType, sourceId)] = {
          readAt: row?.read_at ? String(row.read_at) : null,
          dismissedAt: row?.dismissed_at ? String(row.dismissed_at) : null,
        };
      });
      setNotificationStateMap(nextMap);
    };
    void loadNotificationReadStates();
    return () => {
      cancelled = true;
    };
  }, [profile.id, profile.org_id, relevantNotificationStateSections]);

  const isNotificationDismissed = useCallback((section: NotificationSectionKey, sourceType: string, sourceId: string) => {
    const key = buildNotificationStateKey(toNotificationStateSection(section), sourceType, sourceId);
    return Boolean(notificationStateMap[key]?.dismissedAt);
  }, [notificationStateMap]);

  const isNotificationRead = useCallback((
    section: NotificationSectionKey,
    sourceType: string,
    sourceId: string,
    fallbackSeen = false,
  ) => {
    const key = buildNotificationStateKey(toNotificationStateSection(section), sourceType, sourceId);
    const entry = notificationStateMap[key];
    if (entry?.dismissedAt || entry?.readAt) return true;
    return fallbackSeen;
  }, [notificationStateMap]);

  const markNotificationEntriesRead = useCallback((entries: NotificationStateEntryInput[]) => {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const readAt = new Date().toISOString();
    const normalized = entries
      .map((entry) => ({
        section: entry.section,
        sourceType: String(entry.sourceType || '').trim(),
        sourceId: String(entry.sourceId || '').trim(),
        readAt,
      }))
      .filter((entry) => entry.sourceType && entry.sourceId);
    if (normalized.length === 0) return;
    mergeNotificationStateEntries(normalized);
    void persistNotificationStateEntries(normalized);
  }, [mergeNotificationStateEntries, persistNotificationStateEntries]);

  useEffect(() => {
    if (!profile.id) return;
    let cancelled = false;
    const loadChatGroups = async () => {
      const { data, error } = await supabase
        .from('chat_groups')
        .select('id, org_id, name, user_ids, role_ids, created_by, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) {
        if (!isMissingColumnError(error, 'user_ids')) {
          console.warn('Could not load chat groups', error);
        }
        if (!cancelled) setChatGroups([]);
        return;
      }

      const visibleGroups = (data || [])
        .map((row: any) => ({
          id: String(row?.id || ''),
          org_id: row?.org_id ? String(row.org_id) : null,
          name: String(row?.name || '').trim() || 'گروه',
          user_ids: Array.isArray(row?.user_ids) ? row.user_ids.map((id: any) => String(id)) : [],
          role_ids: Array.isArray(row?.role_ids) ? row.role_ids.map((id: any) => String(id)) : [],
          created_by: row?.created_by ? String(row.created_by) : null,
          created_at: row?.created_at ? String(row.created_at) : null,
          updated_at: row?.updated_at ? String(row.updated_at) : null,
        }))
        .filter((group: ChatGroupRow) => (
          group.created_by === String(profile.id || '')
          || group.user_ids.includes(String(profile.id || ''))
          || (profile.role_id ? group.role_ids.includes(String(profile.role_id)) : false)
        ));

      if (!cancelled) {
        setChatGroups(visibleGroups);
      }
    };
    void loadChatGroups();
    return () => {
      cancelled = true;
    };
  }, [profile.id, profile.role_id]);

  useEffect(() => {
    return;
    if (!open) return;
    if (mentionOptions.length > 0) return;
    const loadMentions = async () => {
      const fetchRoles = async () => {
        const primary = await supabase
          .from('org_roles')
          .select('*')
          .limit(200);

        if (!primary.error) return normalizeRoleRows(primary.data || []);

        if (isMissingColumnError(primary.error, 'title')) {
          const byName = await supabase
            .from('org_roles')
            .select('*')
            .limit(200);
          if (!byName.error) return normalizeRoleRows(byName.data || []);

          const idOnly = await supabase.from('org_roles').select('*').limit(200);
          if (!idOnly.error) return normalizeRoleRows(idOnly.data || []);
        }

        return [] as Array<{ id: string; title: string }>;
      };

      const [{ data: profiles }, roles] = await Promise.all([
        supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true }).limit(200),
        fetchRoles(),
      ]);
      const opts = [
        ...(profiles || []).map((p: any) => ({ label: `عضو: ${p.full_name || p.id}`, value: `user:${p.id}` })),
        ...(roles || []).map((r: any) => ({ label: `نقش: ${r.title || r.id}`, value: `role:${r.id}` })),
      ];
      setMentionOptions(opts);
    };
    loadMentions();
  }, [mentionOptions.length, open]);

  useEffect(() => {
    if (!profile.id) return;
    if (!open && !groupModalOpen && !forwardingNote) return;
    let cancelled = false;
    const loadMentionDirectory = async () => {
      try {
        const directory = await fetchAssigneeDirectory(supabase);
        if (cancelled) return;
      setDirectoryUsers(directory.users || []);
      setDirectoryRoles(directory.roles || []);
      // Update module-level cache so next open skips re-fetch delay
      _notifDirectoryCache.orgId = profile.org_id || null;
      _notifDirectoryCache.users = directory.users || [];
      _notifDirectoryCache.roles = directory.roles || [];
      setMentionOptions([
        ...directory.users.map((user) => ({ label: `عضو: ${user.display_name || user.id}`, value: `user:${user.id}` })),
        ...directory.roles.map((role) => ({ label: `نقش: ${role.title || role.id}`, value: `role:${role.id}` })),
      ]);
      } catch (error) {
        if (!cancelled) {
          console.warn('Could not load assignee directory in notifications', error);
        }
      }
    };
    void loadMentionDirectory();
    return () => {
      cancelled = true;
    };
  }, [Boolean(forwardingNote), groupModalOpen, open, profile.id]);

  useEffect(() => {
    const loadNoteRecords = async () => {
      if (!noteModuleId) {
        setNoteRecordOptions([]);
        return;
      }
      const mod = MODULES[noteModuleId];
      const table = mod?.table || noteModuleId;
      const { data } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      const options = (data || []).map((row: any) => ({
        label: formatRecordLabel(row),
        value: row.id,
      }));
      setNoteRecordOptions(options);
    };
    loadNoteRecords();
  }, [noteModuleId]);

  const buildRecordTitleMap = async (items: { module_id: string; record_id: string }[]) => {
    const map = await fetchRecordReferenceLabels(supabase, items);
    if (!Object.keys(map).length) return;
    setRecordTitleMap((prev) => ({ ...prev, ...map }));
  };

  const collectRecordReferences = (items: any[]) => (
    (items || [])
      .map((item: any) => ({
        module_id: String(item?.module_id || '').trim(),
        record_id: String(item?.record_id || '').trim(),
      }))
      .filter((item) => item.module_id && item.record_id)
  );

  const getCentralRecordLabel = (moduleId?: string | null, recordId?: string | null, fallback?: string | null) => {
    const normalizedModuleId = String(moduleId || '').trim();
    const normalizedRecordId = String(recordId || '').trim();
    if (!normalizedModuleId || !normalizedRecordId) return String(fallback || 'رکورد مرتبط').trim() || 'رکورد مرتبط';
    return (
      recordTitleMap[buildRecordReferenceKey(normalizedModuleId, normalizedRecordId)]
      || String(fallback || '').trim()
      || formatRecordLabel({ id: normalizedRecordId, module_id: normalizedModuleId }, normalizedModuleId)
    );
  };

  const fetchNotificationInboxSection = async (
    section: NotificationStateSectionKey,
    limit = 200,
    options?: { excludeSystem?: boolean },
  ): Promise<NotificationInboxItemRow[] | null> => {
    let query = supabase
      .from('notification_inbox_items')
      .select('id,source_type,source_id,section,category,title,body,module_id,record_id,payload,last_event_at,created_at')
      .eq('section', section);
    if (options?.excludeSystem) {
      query = query.not('category', 'in', '("system","assistant")');
    }
    const { data, error } = await query
      .order('last_event_at', { ascending: false })
      .limit(limit);
    if (error) {
      if (isMissingTableLikeError(error)) return null;
      throw error;
    }
    return (data || []) as NotificationInboxItemRow[];
  };

  const fetchAssignedIdsForModule = async (table: string, userId: string, roleId: string | null) => {
    const mergeUniqueRows = (rows: any[]) => {
      const map = new Map<string, any>();
      (rows || []).forEach((row) => {
        if (!row?.id) return;
        map.set(String(row.id), row);
      });
      return Array.from(map.values());
    };

    const normalizedTable = String(table || '').trim();
    if (!normalizedTable || !userId) return [];

    const queryIds = async (query: any) => {
      const { data, error } = await query.limit(200);
      if (error) return { data: [] as any[], error };
      return { data: data || [], error: null };
    };

    const cacheRuntimeFailure = (error: any) => {
      if (!error) return;
      if (
        isMissingTableLikeError(error)
        || isMissingColumnError(error, 'assignee_id')
        || isAssigneeValueTypeError(error)
      ) {
        ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, 'none');
        return;
      }
      if (isMissingColumnError(error, 'assignee_type')) {
        ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, 'id_only');
        return;
      }
      if (isMissingColumnError(error, 'assignee_role_id')) {
        ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, 'typed_legacy_role');
      }
    };

    const ownerFallbackQuery = async () => {
      const { data, error } = await supabase
        .from(normalizedTable)
        .select('id')
        .limit(200)
        .eq('owner_id', userId);
      if (error) return { data: [] as any[], error };
      return { data: data || [], error: null };
    };

    const queryByMode = async (mode: AssigneeQueryMode) => {
      if (mode === 'none') return { data: [] as any[], error: null };
      if (mode === 'owner_only') {
        return ownerFallbackQuery();
      }

      if (mode === 'id_only') {
        const [userResult, roleResult] = await Promise.all([
          queryIds(
            supabase
              .from(normalizedTable)
              .select('id')
              .eq('assignee_id', userId)
          ),
          roleId
            ? queryIds(
                supabase
                  .from(normalizedTable)
                  .select('id')
                  .eq('assignee_id', roleId)
              )
            : Promise.resolve({ data: [] as any[], error: null }),
        ]);
        const firstError = userResult.error || roleResult.error;
        if (firstError) return { data: [] as any[], error: firstError };
        return { data: mergeUniqueRows([...(userResult.data || []), ...(roleResult.data || [])]), error: null };
      }

      if (mode === 'typed_legacy_role') {
        const [userResult, roleResult] = await Promise.all([
          queryIds(
            supabase
              .from(normalizedTable)
              .select('id')
              .eq('assignee_type', 'user')
              .eq('assignee_id', userId)
          ),
          roleId
            ? queryIds(
                supabase
                  .from(normalizedTable)
                  .select('id')
                  .eq('assignee_type', 'role')
                  .eq('assignee_id', roleId)
              )
            : Promise.resolve({ data: [] as any[], error: null }),
        ]);
        const firstError = userResult.error || roleResult.error;
        if (firstError) return { data: [] as any[], error: firstError };
        return { data: mergeUniqueRows([...(userResult.data || []), ...(roleResult.data || [])]), error: null };
      }

      const [userResult, roleTypedResult] = await Promise.all([
        queryIds(
          supabase
            .from(normalizedTable)
            .select('id')
            .eq('assignee_type', 'user')
            .eq('assignee_id', userId)
        ),
        roleId
          ? queryIds(
              supabase
                .from(normalizedTable)
                .select('id')
                .eq('assignee_type', 'role')
                .eq('assignee_role_id', roleId)
            )
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (userResult.error) {
        return { data: [] as any[], error: userResult.error };
      }
      if (roleTypedResult.error) {
        return { data: [] as any[], error: roleTypedResult.error };
      }
      return { data: mergeUniqueRows([...(userResult.data || []), ...(roleTypedResult.data || [])]), error: null };
    };

    const mode = await resolveAssigneeQueryModeForTable(normalizedTable);
    if (mode === 'none' && normalizedTable === 'projects') {
      const ownerFallback = await ownerFallbackQuery();
      if (!ownerFallback.error) {
        ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, 'owner_only');
        return ownerFallback.data || [];
      }
      if (isMissingColumnError(ownerFallback.error, 'owner_id')) {
        ASSIGNEE_QUERY_MODE_CACHE.set(normalizedTable, 'none');
      }
    }

    let result = await queryByMode(mode);
    if (!result.error) {
      return result.data || [];
    }

    cacheRuntimeFailure(result.error);
    const nextMode = ASSIGNEE_QUERY_MODE_CACHE.get(normalizedTable);
    if (nextMode && nextMode !== mode && nextMode !== 'none') {
      result = await queryByMode(nextMode);
      if (!result.error) return result.data || [];
      cacheRuntimeFailure(result.error);
      return [];
    }

    return [];
  };

  const getAssignedRecordPairs = async () => {
    if (!profile.id) return [] as { module_id: string; record_id: string }[];
    const userId = String(profile.id || '').trim();
    const roleId = String(profile.role_id || '').trim();
    const cached = assignedRecordPairsCacheRef.current;
    if (
      cached.userId === userId
      && cached.roleId === roleId
      && Date.now() - cached.loadedAt < ASSIGNED_NOTE_PAIRS_TTL_MS
    ) {
      return cached.pairs;
    }

    const modules = Object.values(MODULES)
      .filter((mod: any) => mod?.id !== 'tasks' && (mod?.table || mod?.id))
      .filter((mod: any) => supportsModuleAssignee(mod));

    const pairs: { module_id: string; record_id: string }[] = [];
    for (const mod of modules) {
      const table = mod.table || mod.id;
      const data = await fetchAssignedIdsForModule(table, userId, roleId);
      (data || []).forEach((row: any) => {
        pairs.push({ module_id: mod.id, record_id: row.id });
      });
    }
    assignedRecordPairsCacheRef.current = {
      loadedAt: Date.now(),
      userId,
      roleId,
      pairs,
    };
    return pairs;
  };

  const populateNoteAuthorNames = async (rows: any[]) => {
    const authorIds = Array.from(new Set((rows || []).map((note: any) => note?.author_id).filter(Boolean)));
    if (authorIds.length === 0) {
      setAuthorNameMap({});
      return;
    }

    const { userNameMap } = await buildDirectoryMaps();
    const map = authorIds.reduce<Record<string, string>>((acc, authorId) => {
      acc[String(authorId)] = userNameMap[String(authorId)] || String(authorId);
      return acc;
    }, {});
    setAuthorNameMap(map);
  };

  const fetchNotesByIds = async (noteIds: string[]) => {
    const uniqueIds = Array.from(new Set((noteIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (uniqueIds.length === 0) return [] as any[];

    const collected: any[] = [];
    for (let index = 0; index < uniqueIds.length; index += 80) {
      const idBatch = uniqueIds.slice(index, index + 80);
      const { data, error } = await supabase
        .from('notes')
        .select(NOTE_SELECT_FIELDS)
        .in('id', idBatch)
        .order('created_at', { ascending: false });
      if (shouldPauseNotesPolling(error)) {
        notesPollingPausedRef.current = true;
        if (!notesPollingPauseLoggedRef.current) {
          notesPollingPauseLoggedRef.current = true;
          console.warn('Notes polling paused due to backend error.', error);
        }
        return [] as any[];
      }
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) {
        collected.push(...data);
      }
    }

    return collected;
  };

  const fetchNotesLegacy = async () => {
    if (!profile.id) return [];
    if (notesPollingPausedRef.current) return [];
    const userId = profile.id;
    const roleId = profile.role_id;

    const [{ data: mentionedUser, error: mentionedUserError }, { data: mentionedRole, error: mentionedRoleError }] = await Promise.all([
      supabase
        .from('notes')
        .select(NOTE_SELECT_FIELDS)
        .contains('mention_user_ids', [userId])
        .order('created_at', { ascending: false })
        .limit(40),
      roleId
        ? supabase
            .from('notes')
            .select(NOTE_SELECT_FIELDS)
            .contains('mention_role_ids', [roleId])
            .order('created_at', { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    const firstError = mentionedUserError || mentionedRoleError;
    if (shouldPauseNotesPolling(firstError)) {
      notesPollingPausedRef.current = true;
      if (!notesPollingPauseLoggedRef.current) {
        notesPollingPauseLoggedRef.current = true;
        console.warn('Notes polling paused due to backend error.', firstError);
      }
      return [];
    }

    const { data: myNotes, error: myNotesError } = await supabase
      .from('notes')
      .select(NOTE_SELECT_FIELDS)
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(40);
    if (shouldPauseNotesPolling(myNotesError)) {
      notesPollingPausedRef.current = true;
      if (!notesPollingPauseLoggedRef.current) {
        notesPollingPauseLoggedRef.current = true;
        console.warn('Notes polling paused due to backend error.', myNotesError);
      }
      return [];
    }
    const myNoteIds = (myNotes || []).map((n: any) => n.id);

    let replyNotes: any[] = [];
    if (myNoteIds.length) {
      const { data, error } = await supabase
        .from('notes')
        .select(NOTE_SELECT_FIELDS)
        .in('reply_to', myNoteIds)
        .order('created_at', { ascending: false })
        .limit(40);
      if (shouldPauseNotesPolling(error)) {
        notesPollingPausedRef.current = true;
        if (!notesPollingPauseLoggedRef.current) {
          notesPollingPauseLoggedRef.current = true;
          console.warn('Notes polling paused due to backend error.', error);
        }
        return [];
      }
      replyNotes = data || [];
    }

    const withTimeout = async <T,>(promise: Promise<T>, fallback: T, timeoutMs = 1200) => {
      let timeoutId: number | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((resolve) => {
            timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs);
          }),
        ]);
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
    };

    const shouldLoadAssignedNotes = open && activeDrawerSection === 'notes';
    const assignedPairs = shouldLoadAssignedNotes
      ? await withTimeout(getAssignedRecordPairs(), [] as { module_id: string; record_id: string }[])
      : [];
    const grouped: Record<string, string[]> = {};
    assignedPairs.forEach((item) => {
      if (!item.module_id || !item.record_id) return;
      grouped[item.module_id] = grouped[item.module_id] || [];
      if (!grouped[item.module_id].includes(item.record_id)) grouped[item.module_id].push(item.record_id);
    });
    const assignedNotes: any[] = [];
    await withTimeout(Promise.all(
      Object.entries(grouped).map(async ([moduleId, ids]) => {
        const { data, error } = await supabase
          .from('notes')
          .select(NOTE_SELECT_FIELDS)
          .eq('module_id', moduleId)
          .in('record_id', ids)
          .order('created_at', { ascending: false })
          .limit(40);
        if (shouldPauseNotesPolling(error)) {
          notesPollingPausedRef.current = true;
          if (!notesPollingPauseLoggedRef.current) {
            notesPollingPauseLoggedRef.current = true;
            console.warn('Notes polling paused due to backend error.', error);
          }
          return;
        }
        if (data?.length) assignedNotes.push(...data);
      })
    ), [] as any[]);

    const merged = [...(mentionedUser || []), ...(mentionedRole || []), ...replyNotes, ...(myNotes || []), ...assignedNotes];
    const uniq = new Map<string, any>();
    merged.forEach((note) => {
      uniq.set(note.id, note);
    });
    const result = Array.from(uniq.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    await buildRecordTitleMap(result.map((n) => ({ module_id: n.module_id, record_id: n.record_id })));
    await populateNoteAuthorNames(result);
    return result;
  };

  const fetchNotes = async () => {
    if (!profile.id) return [];
    if (notesPollingPausedRef.current) return [];

    const inboxItems = await fetchNotificationInboxSection('notes', 260, { excludeSystem: true });
    if (inboxItems === null) {
      setNoteLikeNotifications([]);
      return fetchNotesLegacy();
    }

    const nextLikeNotifications = inboxItems.filter((item) => String(item?.source_type || '').trim() === 'note_like');
    setNoteLikeNotifications(nextLikeNotifications);

    const noteItems = inboxItems.filter((item) => String(item?.source_type || '').trim() === 'note');
    const noteIds = noteItems.map((item) => String(item?.source_id || '').trim()).filter(Boolean);
    if (noteIds.length === 0) {
      setAuthorNameMap({});
      return [];
    }

    const rows = await fetchNotesByIds(noteIds);
    const rowsById = new Map((rows || []).map((row: any) => [String(row?.id || '').trim(), row]));
    const orderedRows = noteIds
      .map((id) => rowsById.get(id))
      .filter(Boolean) as any[];
    const uniqueRows = Array.from(new Map(
      orderedRows.map((row: any) => [String(row?.id || '').trim(), row])
    ).values());

    await buildRecordTitleMap(uniqueRows.map((row: any) => ({
      module_id: row.module_id,
      record_id: row.record_id,
    })));
    await populateNoteAuthorNames(uniqueRows);
    return uniqueRows;
  };

  const fetchTasks = async () => {
    if (!profile.id) return [];
    const userId = profile.id;
    const roleId = profile.role_id;
    const buildTasksQuery = () =>
      supabase
        .from('tasks')
        .select('id, name, status, priority, produced_qty, created_at, start_date, due_date, assignee_id, assignee_role_id, assignee_type, production_line_id, related_to_module, related_product, related_customer, related_supplier, related_production_order, related_invoice, purchase_invoice_id, project_id, marketing_lead_id, source_module_id, source_record_id')
        .neq('status', 'canceled')
        .order('created_at', { ascending: false })
        .limit(50);

    const { data } = roleId
      ? await (async () => {
          const [userResult, roleTypedResult] = await Promise.all([
            buildTasksQuery().eq('assignee_type', 'user').eq('assignee_id', userId),
            buildTasksQuery().eq('assignee_type', 'role').eq('assignee_role_id', roleId),
          ]);
          if (!userResult.error && !roleTypedResult.error) {
            return { data: [...(userResult.data || []), ...(roleTypedResult.data || [])], error: null };
          }
          if (userResult.error && !isMissingColumnError(userResult.error, 'assignee_type') && !isMissingColumnError(userResult.error, 'assignee_id')) return userResult;
          if (roleTypedResult.error && !isMissingColumnError(roleTypedResult.error, 'assignee_role_id') && !isMissingColumnError(roleTypedResult.error, 'assignee_type') && !isMissingColumnError(roleTypedResult.error, 'assignee_id')) return roleTypedResult;
          const [legacyUserResult, legacyRoleResult] = await Promise.all([
            buildTasksQuery().eq('assignee_id', userId),
            buildTasksQuery().eq('assignee_id', roleId),
          ]);
          if (legacyUserResult.error && !isMissingColumnError(legacyUserResult.error, 'assignee_id')) return legacyUserResult;
          if (legacyRoleResult.error && !isMissingColumnError(legacyRoleResult.error, 'assignee_id')) return legacyRoleResult;
          return { data: [...(legacyUserResult.data || []), ...(legacyRoleResult.data || [])], error: null };
        })()
      : await buildTasksQuery().eq('assignee_type', 'user').eq('assignee_id', userId);
    const tasksList = (data || []).filter((task: any) => {
      const normalizedStatus = String(task?.status || '').toLowerCase();
      const isCompleted = normalizedStatus === 'done' || normalizedStatus === 'completed';
      if (isCompleted && seenCompletedTaskIds.has(String(task?.id || ''))) {
        return false;
      }
      return normalizedStatus !== 'canceled';
    });

    const relatedPairs: { module_id: string; record_id: string }[] = [];
    tasksList.forEach((task) => {
      const sourceLink = resolveTaskSourceLink(task);
      if (sourceLink.moduleId && sourceLink.recordId) {
        relatedPairs.push({ module_id: sourceLink.moduleId, record_id: sourceLink.recordId });
      }
    });
    const assigneeIds = Array.from(
      new Set(tasksList.filter((task: any) => task.assignee_type !== 'role').map((task: any) => task.assignee_id).filter(Boolean))
    );
    const roleIds = Array.from(
      new Set(tasksList.filter((task: any) => task.assignee_type === 'role').map((task: any) => task.assignee_role_id || task.assignee_id).filter(Boolean))
    );
    if (assigneeIds.length) {
      const { userNameMap } = await buildDirectoryMaps();
      const map = assigneeIds.reduce<Record<string, string>>((acc, assigneeId) => {
        acc[String(assigneeId)] = userNameMap[String(assigneeId)] || String(assigneeId);
        return acc;
      }, {});
      setAssigneeNameMap(map);
    }
    if (roleIds.length) {
      const { roleTitleMap } = await buildDirectoryMaps();
      const map = roleIds.reduce<Record<string, string>>((acc, roleLookupId) => {
        acc[String(roleLookupId)] = roleTitleMap[String(roleLookupId)] || 'نقش';
        return acc;
      }, {});
      setRoleNameMap(map);
    }
    await buildRecordTitleMap(relatedPairs);
    return tasksList;
  };

  const fetchResponsibilities = async () => {
    if (!profile.id) return [];
    const userId = profile.id;
    const roleId = profile.role_id;

    const fetchRowsByIds = async (table: string, moduleId: string, ids: string[]) =>
      safeFetchResponsibilityRows(table, moduleId, ids);

    const inboxItems = await fetchNotificationInboxSection('responsibilities', 200);
    if (inboxItems) {
      const moduleByTable = new Map<string, any>();
      Object.values(MODULES).forEach((mod: any) => {
        const moduleId = String(mod?.id || '').trim();
        const tableName = String(mod?.table || mod?.id || '').trim();
        if (moduleId) moduleByTable.set(moduleId, mod);
        if (tableName) moduleByTable.set(tableName, mod);
      });

      const grouped = new Map<string, { mod: any; table: string; ids: string[]; items: NotificationInboxItemRow[] }>();
      inboxItems.forEach((item) => {
        const payload = isPlainRecord(item.payload) ? item.payload : {};
        const sourceTable = String(item.module_id || (payload as any)?.table || item.source_type || '').trim();
        const recordId = String(item.record_id || item.source_id || '').trim();
        if (!sourceTable || !recordId) return;
        const mod = moduleByTable.get(sourceTable) || { id: sourceTable, table: sourceTable, titles: { fa: sourceTable } };
        const moduleId = String(mod?.id || sourceTable).trim();
        const table = String(mod?.table || sourceTable).trim();
        const key = `${moduleId}:${table}`;
        const current = grouped.get(key) || { mod, table, ids: [], items: [] };
        current.ids.push(recordId);
        current.items.push(item);
        grouped.set(key, current);
      });

        const results: any[] = [];
      for (const group of grouped.values()) {
        const idList = Array.from(new Set(group.ids.filter(Boolean)));
        const itemByRecordId = new Map(group.items.map((item) => [String(item.record_id || item.source_id || '').trim(), item]));
        let rows: any[] = [];
        if (idList.length > 0) {
          try {
            rows = await fetchRowsByIds(group.table, String(group.mod?.id || group.table), idList);
          } catch (error) {
            console.warn('Failed to load full responsibility rows from inbox group', group.table, error);
            rows = [];
          }
        }

        const loadedIds = new Set(rows.map((row: any) => String(row?.id || '').trim()).filter(Boolean));
        rows.forEach((row: any) => {
          const item = itemByRecordId.get(String(row?.id || '').trim());
          results.push({
            ...row,
            module_id: group.mod.id,
            module_title: group.mod.titles?.fa || group.mod.id,
            __notification_inbox_item: item || null,
          });
        });

        group.items.forEach((item) => {
          const recordId = String(item.record_id || item.source_id || '').trim();
          if (!recordId || loadedIds.has(recordId)) return;
          results.push({
            id: recordId,
            name: item.title,
            title: item.title,
            description: item.body,
            created_at: item.last_event_at || item.created_at,
            updated_at: item.last_event_at || item.created_at,
            module_id: group.mod.id,
            module_title: group.mod.titles?.fa || group.mod.id,
            __notification_inbox_item: item,
          });
        });
      }

      return results.sort((a, b) => new Date(b.created_at || b.updated_at || 0).getTime() - new Date(a.created_at || a.updated_at || 0).getTime());
    }

    const modules = Object.values(MODULES)
      .filter((mod: any) => mod?.id !== 'tasks' && (mod?.table || mod?.id))
      .filter((mod: any) => supportsModuleAssignee(mod));

    const results: any[] = [];
    for (const mod of modules) {
      const table = mod.table || mod.id;
      const ids = await fetchAssignedIdsForModule(table, userId, roleId);
      const idList = (ids || []).map((row: any) => row.id).filter(Boolean);
      if (!idList.length) continue;
      let data: any[] = [];
      try {
        data = await fetchRowsByIds(table, String(mod?.id || table), idList);
      } catch (error) {
        if (isMissingTableLikeError(error) || isMissingColumnError(error, 'id')) {
          ASSIGNEE_QUERY_MODE_CACHE.set(String(table || '').trim(), 'none');
        }
        continue;
      }
      (data || []).forEach((row: any) => {
        results.push({
          ...row,
          module_id: mod.id,
          module_title: mod.titles?.fa || mod.id,
        });
      });
    }
    return results.sort((a, b) => new Date(b.created_at || b.updated_at || 0).getTime() - new Date(a.created_at || a.updated_at || 0).getTime());
  };

  const loadPeopleMaps = async (items: any[]) => {
    const assigneeIds = Array.from(
      new Set(items.filter((item: any) => item.assignee_type !== 'role').map((item: any) => item.assignee_id).filter(Boolean))
    );
    const roleIds = Array.from(
      new Set(items.filter((item: any) => item.assignee_type === 'role').map((item: any) => item.assignee_role_id || item.assignee_id).filter(Boolean))
    );
    const createdByIds = Array.from(new Set(items.map((i: any) => i.created_by || i.created_by_id).filter(Boolean)));
    const { userNameMap, roleTitleMap } = await buildDirectoryMaps();

    if (assigneeIds.length) {
      const map = assigneeIds.reduce<Record<string, string>>((acc, assigneeId) => {
        acc[String(assigneeId)] = userNameMap[String(assigneeId)] || String(assigneeId);
        return acc;
      }, {});
      setAssigneeNameMap((prev) => ({ ...prev, ...map }));
    }
    if (roleIds.length) {
      const map = roleIds.reduce<Record<string, string>>((acc, roleLookupId) => {
        acc[String(roleLookupId)] = roleTitleMap[String(roleLookupId)] || 'نقش';
        return acc;
      }, {});
      setRoleNameMap((prev) => ({ ...prev, ...map }));
    }
    if (createdByIds.length) {
      const map = createdByIds.reduce<Record<string, string>>((acc, creatorId) => {
        acc[String(creatorId)] = userNameMap[String(creatorId)] || String(creatorId);
        return acc;
      }, {});
      setCreatedByNameMap((prev) => ({ ...prev, ...map }));
    }
  };

  const isSectionFresh = (section: NotificationSectionKey) => (
    Date.now() - lastLoadedAtRef.current[section] < NOTIFICATIONS_CACHE_TTL_MS
  );

  const safeSectionFetch = async <T,>(
    loader: () => Promise<T>,
    type: NotificationSectionKey,
    fallback: T,
  ) => {
    try {
      return await loader();
    } catch (error) {
      if (type === 'notes') {
        notesPollingPausedRef.current = true;
        if (!notesPollingPauseLoggedRef.current) {
          notesPollingPauseLoggedRef.current = true;
          console.warn('Notes polling paused due to network/CORS error.', error);
        }
      } else {
        console.warn(`Failed to fetch ${type}:`, error);
      }
      return fallback;
    }
  };

  const runRefreshSection = async (section: NotificationSectionKey, options?: { force?: boolean }) => {
    if (!profile.id) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (!options?.force && isSectionFresh(section)) return;

    if (section === 'notes') {
      const shouldUseConversationScopedNotes = (
        variant === 'chat'
        && activeDrawerSection === 'notes'
        && Boolean(selectedConversationKey)
      );
      if (shouldUseConversationScopedNotes) {
        await Promise.all([
          safeSectionFetch(() => refreshSelectedConversationTimeline(), 'notes', null as any),
          safeSectionFetch(() => refreshNoteConversationSummaries(), 'notes', null as any),
        ]);
        lastLoadedAtRef.current.notes = Date.now();
        return;
      }
      if (variant === 'chat' && activeDrawerSection !== 'notes' && noteConversationSummaryAvailable) {
        await safeSectionFetch(() => refreshNoteConversationSummaries(), 'notes', null as any);
        lastLoadedAtRef.current.notes = Date.now();
        return;
      }

      const showSkeleton = notes.length === 0;
      if (showSkeleton) setLoadingNotes(true);
      const notesData = await safeSectionFetch(() => fetchNotes(), 'notes', [] as any[]);
      setNotes(notesData);
      if (selectedConversationKey) {
        await safeSectionFetch(() => refreshSelectedConversationTimeline(), 'notes', null as any);
      }
      if (noteConversationSummaryAvailable) {
        await safeSectionFetch(() => refreshNoteConversationSummaries(), 'notes', null as any);
      }
      lastLoadedAtRef.current.notes = Date.now();
      if (showSkeleton) setLoadingNotes(false);
      return;
    }

    if (section === 'tasks') {
      const showSkeleton = tasks.length === 0;
      if (showSkeleton) setLoadingTasks(true);
      const tasksData = await safeSectionFetch(() => fetchTasks(), 'tasks', [] as any[]);
      setTasks(tasksData);
      lastLoadedAtRef.current.tasks = Date.now();
      const completedTaskIds = tasksData
        .filter((task: any) => {
          const normalizedStatus = String(task?.status || '').toLowerCase();
          return normalizedStatus === 'done' || normalizedStatus === 'completed';
        })
        .map((task: any) => String(task.id));
      if (completedTaskIds.length) {
        setSeenCompletedTaskIds((prev) => new Set([...prev, ...completedTaskIds]));
      }
      if (showSkeleton) setLoadingTasks(false);
      return;
    }

    if (section === 'bot_messages') {
      if (variant === 'chat' && activeDrawerSection !== 'bot_messages' && botConversationSummaryAvailable) {
        await safeSectionFetch(() => refreshBotConversationSummaries(), 'bot_messages', null as any);
        lastLoadedAtRef.current.bot_messages = Date.now();
        return;
      }
      const showSkeleton = botGroups.length === 0 && botMessages.length === 0;
      if (showSkeleton) setLoadingBotMessages(true);
      const groups = await safeSectionFetch(() => fetchBotGroups(), 'bot_messages', [] as CounterpartyBotGroupRow[]);
      const resolvedGroupId = String(selectedBotGroupId || groups[0]?.id || '').trim();
      if (!botConversationSummaryAvailable) {
        await safeSectionFetch(() => fetchBotNotificationMessages(groups), 'bot_messages', [] as CounterpartyBotMessageRow[]);
      }
      if (resolvedGroupId && activeDrawerSection === 'bot_messages') {
        // Skip refreshBotTimeline() here — the hook's useEffect will fire
        // automatically when selectedBotGroupId propagates via React state.
        // Calling it now would use stale state due to React batching.
        if (!botTimelineAvailable) {
          await safeSectionFetch(() => fetchBotMessages(resolvedGroupId), 'bot_messages', [] as CounterpartyBotMessageRow[]);
        }
      } else {
        setBotMessages([]);
      }
      if (botConversationSummaryAvailable) {
        await safeSectionFetch(() => refreshBotConversationSummaries(), 'bot_messages', null as any);
      }
      lastLoadedAtRef.current.bot_messages = Date.now();
      if (showSkeleton) setLoadingBotMessages(false);
      return;
    }

    if (section === 'sms_messages') {
      const showSkeleton = smsMessages.length === 0;
      if (showSkeleton) setLoadingSmsMessages(true);
      const messagesData = await safeSectionFetch(() => fetchSmsMessages(), 'sms_messages', [] as any[]);
      setSmsMessages(messagesData);
      await buildRecordTitleMap(collectRecordReferences(messagesData));
      await loadPeopleMaps(messagesData);
      lastLoadedAtRef.current.sms_messages = Date.now();
      if (showSkeleton) setLoadingSmsMessages(false);
      return;
    }

    if (section === 'voip_calls') {
      const callsData = await safeSectionFetch(() => fetchVoipCalls(), 'voip_calls', [] as any[]);
      setVoipCalls(callsData);
      await buildRecordTitleMap(collectRecordReferences(callsData));
      await loadPeopleMaps(callsData);
      lastLoadedAtRef.current.voip_calls = Date.now();
      return;
    }

    const showSkeleton = responsibilities.length === 0;
    if (showSkeleton) setLoadingResponsibilities(true);
    const responsibilitiesData = await safeSectionFetch(() => fetchResponsibilities(), 'responsibilities', [] as any[]);
    setResponsibilities(responsibilitiesData);
    lastLoadedAtRef.current.responsibilities = Date.now();
    await buildRecordTitleMap(responsibilitiesData.map((r: any) => ({ module_id: r.module_id, record_id: r.id })));
    await loadPeopleMaps(responsibilitiesData);
    if (showSkeleton) setLoadingResponsibilities(false);
  };

  const refreshSection = async (section: NotificationSectionKey, options?: { force?: boolean }) => {
    if (refreshSectionInFlightRef.current[section]) {
      const pending = refreshSectionPendingRef.current[section] || {};
      refreshSectionPendingRef.current[section] = { force: Boolean(pending.force || options?.force) };
      return;
    }

    refreshSectionInFlightRef.current[section] = true;
    try {
      await runRefreshSection(section, options);
    } finally {
      refreshSectionInFlightRef.current[section] = false;
      const pending = refreshSectionPendingRef.current[section];
      if (pending) {
        delete refreshSectionPendingRef.current[section];
        void refreshSection(section, pending);
      }
    }
  };

  const openCreateActivityFromMessage = useCallback((input: any) => {
    const actorName = String(input?.actorName || '').trim();
    const createdAtLabel = String(input?.createdAtLabel || '').trim()
      || safeJalaliFormat(input?.createdAt, 'YYYY/MM/DD HH:mm');
    const relatedModuleId = String(input?.relatedModuleId || '').trim();
    const relatedRecordId = String(input?.relatedRecordId || '').trim();
    const relationInitialValues = relatedModuleId && relatedRecordId
      ? buildTaskSourceInitialValues(relatedModuleId, relatedRecordId)
      : {};
    const attachments = filterUsableMessageAttachments(input?.attachments || []);

    setMessageActivityDraft({
      initialValues: {
        ...relationInitialValues,
        name: buildMessageActivityTitle({ actorName, sourceLabel: input?.channel }),
        status: 'todo',
        priority: 'medium',
        task_type: String(input?.taskType || '').trim() || 'فعالیت سازمانی',
        description: buildMessageActivityDescription({
          actorName,
          createdAtLabel,
          content: input?.content,
          attachments,
          sourceLabel: input?.channel,
        }),
      },
      attachments,
      relatedModuleId: relatedModuleId || null,
      relatedRecordId: relatedRecordId || null,
      sourceLabel: actorName || String(input?.channel || '').trim() || 'پیام',
    });
  }, []);

  const handleMessageActivitySave = async (values: any, meta?: { selectedTags?: any[] }) => {
    if (!messageActivityDraft) return;
    const tasksModule = MODULES.tasks;
    if (!tasksModule?.table) throw new Error('ماژول فعالیت‌ها در دسترس نیست.');

    const userId = String(profile.id || '').trim() || null;
    const selectedTags = Array.isArray(meta?.selectedTags) ? meta?.selectedTags || [] : [];
    let payload = attachTaskCompletionIfNeeded(normalizeTaskSourceValues(values || {}));
    if (supportsSystemCode('tasks') && !payload.system_code) {
      payload = {
        ...payload,
        system_code: await buildClientFallbackSystemCode(supabase, 'tasks', tasksModule.table),
      };
    }
    const withAudit = userId
      ? { ...payload, created_by: payload.created_by ?? userId, updated_by: payload.updated_by ?? userId }
      : payload;

    const isMissingAuditColumnError = (error: any) => {
      const code = String(error?.code || '').toUpperCase();
      const text = String(error?.message || error?.details || '').toLowerCase();
      return code === '42703' || code === 'PGRST204' || text.includes('created_by') || text.includes('updated_by');
    };

    let insertResult = await supabase
      .from(tasksModule.table)
      .insert(withAudit)
      .select('*')
      .single();
    if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
      insertResult = await supabase
        .from(tasksModule.table)
        .insert(payload)
        .select('*')
        .single();
    }
    if (insertResult.error) throw insertResult.error;
    const inserted = insertResult.data;
    const taskId = String(inserted?.id || '').trim();
    if (!taskId) throw new Error('ایجاد فعالیت ناموفق بود.');

    if (selectedTags.length > 0) {
      await syncRecordTags(supabase, 'tasks', taskId, selectedTags);
    }

    for (const [index, attachment] of messageActivityDraft.attachments.entries()) {
      try {
        await createFileManagerShortcut({
          assetId: attachment.assetId || null,
          sourceEntryId: attachment.entryId || null,
          sourceModuleId: attachment.moduleId || messageActivityDraft.relatedModuleId,
          sourceRecordId: attachment.recordId || messageActivityDraft.relatedRecordId,
          sourceRecordTitle: messageActivityDraft.sourceLabel,
          targetModuleId: 'tasks',
          targetRecordId: taskId,
          targetRecordTitle: String(inserted?.name || payload?.name || 'فعالیت').trim(),
          fileUrl: attachment.url,
          fileName: attachment.name || null,
          mimeType: attachment.mimeType || null,
          fileType: attachment.fileType || null,
          sortOrder: index,
        });
      } catch (error) {
        console.warn('Could not attach message file to created activity', error);
      }
    }

    try {
      await insertRecordActivity({
        supabase,
        moduleId: 'tasks',
        recordId: taskId,
        action: 'create',
        userId,
        recordTitle: String(inserted?.name || payload?.name || '').trim() || null,
      });
    } catch (error) {
      console.warn('Changelog insert failed:', error);
    }

    await runWorkflowsForEvent({
      moduleId: 'tasks',
      event: 'create',
      currentRecord: inserted as Record<string, any>,
    });

    message.success('فعالیت ثبت شد');
    setMessageActivityDraft(null);
    lastLoadedAtRef.current.tasks = 0;
    await refreshSection('tasks', { force: true });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const unlockAudio = () => {
      audioInteractionUnlockedRef.current = true;
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (variant !== 'chat') return;
    const handleNotesUpdated = () => {
      notesPollingPausedRef.current = false;
      notesPollingPauseLoggedRef.current = false;
      lastLoadedAtRef.current.notes = 0;
      void refreshSection('notes', { force: true });
    };
    window.addEventListener(NOTES_UPDATED_EVENT, handleNotesUpdated);
    return () => window.removeEventListener(NOTES_UPDATED_EVENT, handleNotesUpdated);
  }, [profile.id, variant]);

  const runRefreshAll = async (_notify = false, options?: { force?: boolean }) => {
    if (!profile.id) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const sections = getSectionsForVariant(variant);
    const now = Date.now();
    const cacheIsFresh = sections.every((key) => (
      now - lastLoadedAtRef.current[key] < NOTIFICATIONS_CACHE_TTL_MS
    ));
    if (!options?.force && cacheIsFresh) return;

    const shouldLoadNotes = sections.includes('notes');
    const shouldLoadTasks = sections.includes('tasks');
    const shouldLoadResponsibilities = sections.includes('responsibilities');
    const shouldLoadBotMessages = sections.includes('bot_messages');
    const shouldLoadSmsMessages = sections.includes('sms_messages');
    const shouldLoadVoipCalls = sections.includes('voip_calls');
    const shouldFetchBotGroups = shouldLoadBotMessages
      && (activeDrawerSection === 'bot_messages' || !botConversationSummaryAvailable);
    const shouldUseConversationScopedNotes = (
      shouldLoadNotes
      && variant === 'chat'
      && activeDrawerSection === 'notes'
      && Boolean(selectedConversationKey)
    );
    const shouldFetchGlobalNotes = shouldLoadNotes
      && !shouldUseConversationScopedNotes
      && (!noteConversationSummaryAvailable || activeDrawerSection === 'notes');
    const showNotesSkeleton = shouldFetchGlobalNotes && notes.length === 0;
    const showTasksSkeleton = shouldLoadTasks && tasks.length === 0;
    const showResponsibilitiesSkeleton = shouldLoadResponsibilities && responsibilities.length === 0;
    const showBotSkeleton = shouldFetchBotGroups && botGroups.length === 0 && botMessages.length === 0;
    const showSmsSkeleton = shouldLoadSmsMessages && smsMessages.length === 0;

    if (showNotesSkeleton) setLoadingNotes(true);
    if (showTasksSkeleton) setLoadingTasks(true);
    if (showResponsibilitiesSkeleton) setLoadingResponsibilities(true);
    if (showBotSkeleton) setLoadingBotMessages(true);
    if (showSmsSkeleton) setLoadingSmsMessages(true);
    const safeFetch = async <T,>(loader: () => Promise<T>, type: NotificationSectionKey, fallback: T) => {
      try {
        return await loader();
      } catch (error) {
        if (type === 'notes') {
          notesPollingPausedRef.current = true;
          if (!notesPollingPauseLoggedRef.current) {
            notesPollingPauseLoggedRef.current = true;
            console.warn('Notes polling paused due to network/CORS error.', error);
          }
        } else {
          console.warn(`Failed to fetch ${type}:`, error);
        }
        return fallback;
      }
    };
    const [notesData, tasksData, responsibilitiesData, botGroupsData, smsData, voipCallsData] = await Promise.all([
      shouldFetchGlobalNotes ? safeFetch(() => fetchNotes(), 'notes', [] as any[]) : Promise.resolve(notes),
      shouldLoadTasks ? safeFetch(() => fetchTasks(), 'tasks', [] as any[]) : Promise.resolve(tasks),
      shouldLoadResponsibilities ? safeFetch(() => fetchResponsibilities(), 'responsibilities', [] as any[]) : Promise.resolve(responsibilities),
      shouldFetchBotGroups ? safeFetch(() => fetchBotGroups(), 'bot_messages', [] as CounterpartyBotGroupRow[]) : Promise.resolve(botGroups),
      shouldLoadSmsMessages ? safeFetch(() => fetchSmsMessages(), 'sms_messages', [] as any[]) : Promise.resolve(smsMessages),
      shouldLoadVoipCalls ? safeFetch(() => fetchVoipCalls(), 'voip_calls', [] as any[]) : Promise.resolve(voipCalls),
    ]);
    if (shouldFetchGlobalNotes) setNotes(notesData);
    await Promise.all([
      shouldUseConversationScopedNotes
        ? safeFetch(() => refreshSelectedConversationTimeline(), 'notes', null as any)
        : Promise.resolve(null),
      shouldLoadNotes && noteConversationSummaryAvailable
        ? safeFetch(() => refreshNoteConversationSummaries(), 'notes', null as any)
        : Promise.resolve(null),
    ]);
    if (shouldLoadTasks) setTasks(tasksData);
    if (shouldLoadResponsibilities) setResponsibilities(responsibilitiesData);
    if (shouldLoadSmsMessages) setSmsMessages(smsData);
    if (shouldLoadVoipCalls) setVoipCalls(voipCallsData);
    const loadedAt = Date.now();
    sections.forEach((section) => {
      lastLoadedAtRef.current[section] = loadedAt;
    });
    if (shouldFetchBotGroups) {
      const resolvedGroupId = String(selectedBotGroupId || botGroupsData[0]?.id || '').trim();
      if (!botConversationSummaryAvailable) {
        await safeFetch(() => fetchBotNotificationMessages(botGroupsData), 'bot_messages', [] as CounterpartyBotMessageRow[]);
      }
      if (resolvedGroupId && activeDrawerSection === 'bot_messages') {
        // Skip refreshBotTimeline() here — the hook's useEffect will fire
        // automatically when selectedBotGroupId propagates via React state.
        if (!botTimelineAvailable) {
          await safeFetch(() => fetchBotMessages(resolvedGroupId), 'bot_messages', [] as CounterpartyBotMessageRow[]);
        }
      } else {
        setBotMessages([]);
      }
      if (botConversationSummaryAvailable) {
        await safeFetch(() => refreshBotConversationSummaries(), 'bot_messages', null as any);
      }
    }
    if (shouldLoadBotMessages && !shouldFetchBotGroups && botConversationSummaryAvailable) {
      await safeFetch(() => refreshBotConversationSummaries(), 'bot_messages', null as any);
    }
    const completedTaskIds = shouldLoadTasks ? tasksData
      .filter((task: any) => {
        const normalizedStatus = String(task?.status || '').toLowerCase();
        return normalizedStatus === 'done' || normalizedStatus === 'completed';
      })
      .map((task: any) => String(task.id)) : [];
    if (completedTaskIds.length) {
      setSeenCompletedTaskIds((prev) => new Set([...prev, ...completedTaskIds]));
    }
    if (shouldLoadResponsibilities) {
      await buildRecordTitleMap(responsibilitiesData.map((r: any) => ({ module_id: r.module_id, record_id: r.id })));
      await loadPeopleMaps(responsibilitiesData);
    }
    if (shouldLoadSmsMessages) {
      await buildRecordTitleMap(collectRecordReferences(smsData));
      await loadPeopleMaps(smsData);
    }
    if (shouldLoadVoipCalls) {
      await buildRecordTitleMap(collectRecordReferences(voipCallsData));
      await loadPeopleMaps(voipCallsData);
    }
    if (showNotesSkeleton) setLoadingNotes(false);
    if (showTasksSkeleton) setLoadingTasks(false);
    if (showResponsibilitiesSkeleton) setLoadingResponsibilities(false);
    if (showBotSkeleton) setLoadingBotMessages(false);
    if (showSmsSkeleton) setLoadingSmsMessages(false);

    if (!notificationsReadyRef.current) {
      notificationsReadyRef.current = true;
    }
  };

  const refreshAll = async (notify = false, options?: { force?: boolean }) => {
    if (refreshAllInFlightRef.current) {
      const pending = refreshAllPendingRef.current;
      refreshAllPendingRef.current = {
        notify: Boolean(pending?.notify || notify),
        options: { force: Boolean(pending?.options?.force || options?.force) },
      };
      return;
    }

    refreshAllInFlightRef.current = true;
    try {
      await runRefreshAll(notify, options);
    } finally {
      refreshAllInFlightRef.current = false;
      const pending = refreshAllPendingRef.current;
      if (pending) {
        refreshAllPendingRef.current = null;
        void refreshAll(Boolean(pending.notify), pending.options);
      }
    }
  };

  const refreshClosedState = useCallback(async (options?: { force?: boolean }) => {
    if (!profile.id) return;
    if (variant === 'chat') {
      const work: Array<Promise<any>> = [];
      if (noteConversationSummaryAvailable) {
        work.push(refreshNoteConversationSummaries());
      } else {
        work.push(refreshSection('notes', options));
      }
      if (botConversationSummaryAvailable) {
        work.push(refreshBotConversationSummaries());
      } else {
        work.push(refreshSection('bot_messages', options));
      }
      work.push(refreshSection('sms_messages', options));
      work.push(refreshSection('voip_calls', options));
      await Promise.all(work);
      return;
    }
    await Promise.all([
      refreshSection('tasks', options),
      refreshSection('responsibilities', options),
    ]);
  }, [
    botConversationSummaryAvailable,
    noteConversationSummaryAvailable,
    profile.id,
    refreshBotConversationSummaries,
    refreshNoteConversationSummaries,
    refreshSection,
    variant,
  ]);

  const fetchSmsMessages = async () => {
    const { data, error } = await supabase
      .from('sms_delivery_reports')
      .select('id, title, module_id, record_id, assignee_id, direction, provider, provider_message_id, sender, recipient, phone_number, phone_number_id, phone_match_status, message_text, status, error_message, metadata, sent_at, received_at, message_at, created_at, updated_at')
      .order('message_at', { ascending: false })
      .limit(80);
    if (error) {
      if (isMissingTableLikeError(error) || isMissingColumnError(error, 'direction') || isMissingColumnError(error, 'message_at')) {
        return [];
      }
      throw error;
    }
    return data || [];
  };

  const fetchVoipCalls = async () => {
    if (variant !== 'chat' || !profile.id) return [];
    const extension = String(profile.voip_extension || '').trim();
    if (!profile.can_view_all_calls && !extension) {
      return [];
    }

    let query = supabase
      .from('voip_call_logs')
      .select('id, title, direction, status, source_number, destination_number, extension, module_id, record_id, phone_number_id, phone_match_status, assignee_id, started_at, created_at')
      .eq('direction', 'incoming')
      .order('created_at', { ascending: false })
      .limit(80);

    if (!profile.can_view_all_calls) {
      query = query.eq('extension', extension);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTableLikeError(error)) return [];
      throw error;
    }
    return data || [];
  };

  const sortBotGroupsByActivity = (rows: CounterpartyBotGroupRow[]) => rows.slice().sort((a, b) => {
    const left = Math.max(
      new Date(a.last_inbound_at || '').getTime() || 0,
      new Date(a.last_outbound_at || '').getTime() || 0,
      new Date(a.updated_at || '').getTime() || 0,
    );
    const right = Math.max(
      new Date(b.last_inbound_at || '').getTime() || 0,
      new Date(b.last_outbound_at || '').getTime() || 0,
      new Date(b.updated_at || '').getTime() || 0,
    );
    return right - left;
  });

  const applyBotGroups = (rows: CounterpartyBotGroupRow[]) => {
    const sortedRows = sortBotGroupsByActivity(rows);
    setBotGroups(sortedRows);
    setSelectedBotGroupId((prev) => {
      if (prev && sortedRows.some((row) => String(row.id) === String(prev))) return prev;
      const withChat = sortedRows.find((row) => String(row.bot_chat_id || '').trim());
      return withChat ? String(withChat.id) : (sortedRows[0]?.id ? String(sortedRows[0].id) : null);
    });
    return sortedRows;
  };

  const enrichBotGroups = async (rows: CounterpartyBotGroupRow[], requestSeq: number) => {
    const customerIds = Array.from(new Set(rows.map((row) => String(row.customer_id || '').trim()).filter(Boolean)));
    const supplierIds = Array.from(new Set(rows.map((row) => String(row.supplier_id || '').trim()).filter(Boolean)));
    if (customerIds.length === 0 && supplierIds.length === 0) return;

    const counterpartyLabelMap: Record<string, string> = {};
    const counterpartyImageMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const customerResult = await selectByIdsWithCompatibleColumns<any>({
        cacheKey: 'notifications:customers',
        columns: ['id', 'full_name', 'business_name', 'legal_name', 'system_code', 'first_name', 'last_name', 'image_url'],
        ids: customerIds,
        batchSize: 25,
        execute: (selectExpr, idBatch) =>
          supabase
            .from('customers')
            .select(selectExpr)
            .in('id', idBatch),
      });
      (customerResult.data || []).forEach((item: any) => {
        const id = String(item?.id || '').trim();
        if (!id) return;
        const personName = `${String(item?.first_name || '').trim()} ${String(item?.last_name || '').trim()}`.trim();
        counterpartyLabelMap[`customers:${id}`] = String(
          item?.full_name || item?.business_name || item?.legal_name || personName || item?.system_code || ''
        ).trim();
        const imgUrl = String(item?.image_url || '').trim();
        if (imgUrl) counterpartyImageMap[`customers:${id}`] = imgUrl;
      });
    }
    if (supplierIds.length > 0) {
      const supplierResult = await selectByIdsWithCompatibleColumns<any>({
        cacheKey: 'notifications:suppliers',
        columns: ['id', 'business_name', 'full_name', 'system_code', 'image_url'],
        ids: supplierIds,
        batchSize: 25,
        execute: (selectExpr, idBatch) =>
          supabase
            .from('suppliers')
            .select(selectExpr)
            .in('id', idBatch),
      });
      (supplierResult.data || []).forEach((item: any) => {
        const id = String(item?.id || '').trim();
        if (!id) return;
        counterpartyLabelMap[`suppliers:${id}`] = String(
          item?.business_name || item?.full_name || item?.system_code || ''
        ).trim();
        const imgUrl = String(item?.image_url || '').trim();
        if (imgUrl) counterpartyImageMap[`suppliers:${id}`] = imgUrl;
      });
    }
    if (requestSeq !== botGroupsEnrichSeqRef.current) return;
    setBotGroups((prev) => prev.map((row) => {
      const customerId = String(row.customer_id || '').trim();
      const supplierId = String(row.supplier_id || '').trim();
      const key = customerId ? `customers:${customerId}` : supplierId ? `suppliers:${supplierId}` : '';
      if (!key) return row;
      return {
        ...row,
        counterparty_label: counterpartyLabelMap[key] || row.counterparty_label || null,
        counterparty_image_url: counterpartyImageMap[key] || row.counterparty_image_url || null,
      };
    }));
  };

  const fetchBotGroups = async () => {
    const { data, error } = await supabase
      .from('counterparty_bot_groups')
      .select('id,target_type,customer_id,supplier_id,channel_type,status,group_title,group_join_link,bot_chat_id,updated_at,last_inbound_at,last_outbound_at,metadata')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    const baseRows = (data || []) as CounterpartyBotGroupRow[];
    const userId = String(profile.id || '').trim();
    const roleId = String(profile.role_id || '').trim();
    const rows = baseRows.filter((row) => {
      const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const allowedUserIds = Array.isArray((metadata as any)?.allowed_user_ids)
        ? (metadata as any).allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const allowedRoleIds = Array.isArray((metadata as any)?.allowed_role_ids)
        ? (metadata as any).allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      if (!allowedUserIds.length && !allowedRoleIds.length) return true;
      if (userId && allowedUserIds.includes(userId)) return true;
      if (roleId && allowedRoleIds.includes(roleId)) return true;
      return false;
    });

    const sortedRows = applyBotGroups(rows);
    const requestSeq = ++botGroupsEnrichSeqRef.current;
    void enrichBotGroups(sortedRows, requestSeq).catch((enrichError) => {
      console.warn('Failed to enrich bot groups.', enrichError);
    });
    return sortedRows;
  };

  const fetchBotMessages = async (
    groupId?: string | null,
    options?: { showLoading?: boolean; forceFull?: boolean },
  ) => {
    const targetGroupId = String(groupId || selectedBotGroupId || '').trim();
    const requestSeq = ++botMessagesFetchSeqRef.current;
    if (options?.showLoading) {
      setBotViewportReady(false);
      setLoadingBotMessages(true);
    }
    if (!targetGroupId) {
      if (requestSeq === botMessagesFetchSeqRef.current) {
        setBotMessages([]);
        if (options?.showLoading) setLoadingBotMessages(false);
      }
      return [] as CounterpartyBotMessageRow[];
    }
    try {
      const currentRows = botMessagesRef.current;
      const canRefreshIncrementally = (
        !options?.forceFull
        && !options?.showLoading
        && targetGroupId === String(botMessagesGroupIdRef.current || '').trim()
        && currentRows.length > 0
      );

      if (canRefreshIncrementally) {
        const latestMessage = currentRows[currentRows.length - 1];
        const latestCreatedAt = String(latestMessage?.created_at || '').trim();
        if (latestCreatedAt) {
          const { data, error } = await supabase
            .from('counterparty_bot_messages')
            .select('id,bot_group_id,direction,message_type,chat_id,provider_message_id,content_text,file_url,file_name,mime_type,payload,created_by,created_at')
            .eq('bot_group_id', targetGroupId)
            .gte('created_at', latestCreatedAt)
            .order('created_at', { ascending: true })
            .limit(80);
          if (!error) {
            const nextRows = (data || []) as CounterpartyBotMessageRow[];
            if (requestSeq === botMessagesFetchSeqRef.current) {
              if (nextRows.length > 0) {
                const merged = [...currentRows];
                const seen = new Set(merged.map((row) => String(row?.id || '').trim()).filter(Boolean));
                nextRows.forEach((row) => {
                  const rowId = String(row?.id || '').trim();
                  if (rowId && seen.has(rowId)) return;
                  if (rowId) seen.add(rowId);
                  merged.push(row);
                });
                botMessagesGroupIdRef.current = targetGroupId;
                botMessagesRef.current = merged;
                setBotMessages(merged);
                return merged;
              }
              return currentRows;
            }
            return currentRows;
          }
        }
      }

      const { data, error } = await supabase
        .from('counterparty_bot_messages')
        .select('id,bot_group_id,direction,message_type,chat_id,provider_message_id,content_text,file_url,file_name,mime_type,payload,created_by,created_at')
        .eq('bot_group_id', targetGroupId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = ((data || []) as CounterpartyBotMessageRow[]).reverse();
      if (requestSeq === botMessagesFetchSeqRef.current) {
        botMessagesGroupIdRef.current = targetGroupId;
        botMessagesRef.current = rows;
        setBotMessages(rows);
      }
      return rows;
    } finally {
      if (options?.showLoading && requestSeq === botMessagesFetchSeqRef.current) {
        setLoadingBotMessages(false);
      }
    }
  };

  const fetchBotNotificationMessages = async (groups: CounterpartyBotGroupRow[] = botGroups) => {
    const groupIds = Array.from(new Set(
      (groups || [])
        .map((group) => String(group?.id || '').trim())
        .filter(Boolean)
    ));
    if (!groupIds.length) {
      setBotNotificationMessages([]);
      return [] as CounterpartyBotMessageRow[];
    }

    const { data, error } = await supabase
      .from('counterparty_bot_messages')
      .select('id,bot_group_id,direction,message_type,chat_id,provider_message_id,content_text,file_url,file_name,mime_type,payload,created_by,created_at')
      .in('bot_group_id', groupIds)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = ((data || []) as CounterpartyBotMessageRow[]).reverse();
    setBotNotificationMessages(rows);
    return rows;
  };
  const {
    items: botMessages,
    setItems: setBotMessages,
    loadingInitial: loadingBotTimelineInitial,
    loadingOlder: loadingOlderBotMessages,
    hasMore: botTimelineHasMoreBefore,
    initialAnchorId: botTimelineInitialAnchorId,
    unreadCount: botTimelineUnreadCount,
    readModel: botReadModel,
    available: botTimelineAvailable,
    refresh: refreshBotTimeline,
    loadOlder: loadOlderBotMessages,
  } = useBotConversationTimeline<CounterpartyBotMessageRow>({
    supabase,
    enabled: open && activeDrawerSection === 'bot_messages' && Boolean(selectedBotGroupId),
    botGroupId: selectedBotGroupId,
    pageSize: 10,
    cacheScopeKey: communicationCacheScopeKey,
  });
  useEffect(() => {
    setLoadingBotMessages(loadingBotTimelineInitial);
  }, [loadingBotTimelineInitial]);
  useEffect(() => {
    botMessagesRef.current = botMessages;
    if (selectedBotGroupId) {
      botMessagesGroupIdRef.current = selectedBotGroupId;
    }
  }, [botMessages, selectedBotGroupId]);

  const buildCurrentBotSenderPayload = useCallback(() => {
    const userId = String(profile.id || '').trim();
    const currentUser = directoryUsers.find((user) => String(user?.id || '') === userId) || null;
    const displayName = String(currentUser?.display_name || profile.full_name || '').trim();
    const avatarUrl = String(currentUser?.avatar_url || profile.avatar_url || '').trim();
    return {
      sender_user_id: userId || null,
      sender_profile_id: userId || null,
      sender_display_name: displayName || null,
      sender_avatar_url: avatarUrl || null,
    };
  }, [directoryUsers, profile.avatar_url, profile.full_name, profile.id]);

  const sendTextToBotGroup = useCallback(async (
    group: CounterpartyBotGroupRow,
    text: string,
    options?: {
      payload?: Record<string, any>;
      messageType?: string;
      extraPayload?: Record<string, any>;
      fallbackText?: string;
      attachments?: NoteAttachment[];
    }
  ) => {
    const channel = String(group?.channel_type || '').trim();
    if (!['rubika', 'telegram', 'bale'].includes(channel)) {
      throw new Error('کانال بات معتبر نیست.');
    }
    const chatId = String(group?.bot_chat_id || '').trim();
    if (!chatId) {
      throw new Error('برای این گروه chat id بات ثبت نشده است.');
    }
    const activeConnection = await getActiveChannelSettings(channel as any);
    const connectionId = String(activeConnection?.id || '').trim();
    if (!connectionId) {
      throw new Error(`تنظیمات فعال بات ${BOT_CHANNEL_LABELS_FA[channel] || channel} پیدا نشد.`);
    }
    const { data: proxyData, error: proxyError } = await supabase.functions.invoke('bot-admin', {
      body: {
        action: 'send_test_message',
        channel,
        connectionId,
        chatId,
        text,
        skipLog: false,
        extraPayload: options?.extraPayload,
        fallbackText: options?.fallbackText,
        attachments: (options?.attachments || []).map((item) => ({
          url: item.url,
          name: item.name,
          mimeType: item.mimeType || null,
          fileType: item.fileType || null,
        })),
      },
    });
    if (proxyError) throw proxyError;
    if (!proxyData?.success) {
      throw new Error(String(proxyData?.message || 'ارسال پیام بات ناموفق بود.'));
    }
    const providerResponse = proxyData?.provider_result || {};
    const providerMessages = Array.isArray(proxyData?.provider_messages) && proxyData.provider_messages.length > 0
      ? proxyData.provider_messages
      : [{
        message_type: String(options?.messageType || 'text').trim() || 'text',
        content_text: text,
        provider_result: providerResponse,
      }];
    const senderPayload = buildCurrentBotSenderPayload();
    const currentUserId = String(senderPayload.sender_user_id || '').trim() || null;

    const rowsToInsert = providerMessages.map((providerItem: any) => {
      const providerResult = providerItem?.provider_result || {};
      const attachment = providerItem?.attachment && typeof providerItem.attachment === 'object'
        ? providerItem.attachment
        : null;
      const rowMessageType = String(providerItem?.message_type || options?.messageType || 'text').trim() || 'text';
      return {
        bot_group_id: group.id,
        customer_id: group.customer_id,
        supplier_id: group.supplier_id,
        channel_type: group.channel_type,
        direction: 'outbound',
        message_type: rowMessageType,
        chat_id: chatId,
        provider_message_id: String(
          providerResult?.result?.message_id
          || providerResult?.message_id
          || providerResult?.data?.message_id
          || providerResult?.data?.message_update?.message_id
          || providerResult?.data?.messageUpdate?.messageId
          || ''
        ) || null,
        content_text: String(providerItem?.content_text ?? text ?? '').trim() || null,
        file_url: String(providerItem?.file_url || attachment?.url || '').trim() || null,
        file_name: String(providerItem?.file_name || attachment?.name || '').trim() || null,
        mime_type: String(providerItem?.mime_type || attachment?.mime_type || attachment?.mimeType || '').trim() || null,
        created_by: currentUserId,
        payload: {
          ...(options?.payload || {}),
          attachments: attachment ? [attachment] : (options?.payload as any)?.attachments || [],
          provider_file_id: String(providerItem?.provider_file_id || '').trim() || null,
          provider_upload: providerItem?.provider_upload || null,
          ...senderPayload,
          provider_response: providerResult || {},
        },
      };
    });
    const { error: insertError } = await supabase
      .from('counterparty_bot_messages')
      .insert(rowsToInsert);
    if (insertError) throw insertError;

    const { error: patchError } = await supabase
      .from('counterparty_bot_groups')
      .update({
        status: 'active',
        last_outbound_at: new Date().toISOString(),
      })
      .eq('id', group.id);
    if (patchError) throw patchError;

    return providerResponse;
  }, [buildCurrentBotSenderPayload]);

  const syncBotProviderMessageAction = useCallback(async (
    group: CounterpartyBotGroupRow | null | undefined,
    action: 'edit_message' | 'delete_message',
    row: CounterpartyBotMessageRow,
    text?: string,
  ) => {
    const channel = String(group?.channel_type || row?.payload?.channel_type || '').trim();
    const chatId = String(row?.chat_id || group?.bot_chat_id || '').trim();
    const providerMessageId = String(row?.provider_message_id || '').trim();
    if (!providerMessageId) return;
    if (!['rubika', 'telegram', 'bale'].includes(channel) || !chatId) return;

    const activeConnection = await getActiveChannelSettings(channel as any);
    const connectionId = String(activeConnection?.id || '').trim();
    if (!connectionId) {
      throw new Error(`تنظیمات فعال بات ${BOT_CHANNEL_LABELS_FA[channel] || channel} پیدا نشد.`);
    }

    const { data, error } = await supabase.functions.invoke('bot-admin', {
      body: {
        action,
        channel,
        connectionId,
        chatId,
        providerMessageId,
        ...(action === 'edit_message' ? { text: String(text || '').trim() } : {}),
      },
    });
    if (error) throw error;
    if (!data?.success) {
      throw new Error(String(data?.message || 'عملیات پیام بات ناموفق بود.'));
    }
  }, []);

  const scheduleBackgroundSectionRefresh = useCallback((activeSection: NotificationSectionKey | null, options?: { force?: boolean }) => {
    if (typeof window === 'undefined') return;
    if (backgroundSectionRefreshTimerRef.current !== null) {
      window.clearTimeout(backgroundSectionRefreshTimerRef.current);
    }
    backgroundSectionRefreshTimerRef.current = window.setTimeout(() => {
      backgroundSectionRefreshTimerRef.current = null;
      const sections = getSectionsForVariant(variant).filter((section) => section !== activeSection);
      void Promise.all(sections.map((section) => refreshSectionRef.current?.(section, options)));
    }, 900);
  }, [variant]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      notesPollingPausedRef.current = false;
      notesPollingPauseLoggedRef.current = false;
      const currentTab = isMobile ? mobileActiveKey : desktopActiveKey;
      const activeSection = isSectionTabKey(currentTab) ? currentTab : null;
      if (activeSection) {
        await refreshSection(activeSection, { force: true });
        scheduleBackgroundSectionRefresh(activeSection, { force: true });
      } else {
        await refreshAll(false, { force: true });
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refreshAllRef.current = refreshAll;
  }, [refreshAll]);

  useEffect(() => {
    refreshSectionRef.current = refreshSection;
  }, [refreshSection]);

  useEffect(() => {
    refreshClosedStateRef.current = refreshClosedState;
  }, [refreshClosedState]);

  useEffect(() => () => {
    if (backgroundSectionRefreshTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(backgroundSectionRefreshTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!profile.id) return;
    notificationsReadyRef.current = false;
    if (open) {
      if (activeDrawerSection) {
        void refreshSectionRef.current?.(activeDrawerSection, { force: true });
        scheduleBackgroundSectionRefresh(activeDrawerSection, { force: true });
      } else {
        void refreshAllRef.current?.(false, { force: true });
      }
      return;
    }
    void refreshClosedStateRef.current?.({ force: true });
  }, [activeDrawerSection, open, profile.id, profile.role_id, scheduleBackgroundSectionRefresh, variant]);

  useEffect(() => {
    setDesktopActiveKey((prev) => normalizeTabForVariant(variant, prev));
    setMobileActiveKey((prev) => normalizeTabForVariant(variant, prev));
  }, [variant]);

  useEffect(() => {
    const nextRequested = normalizeTabForVariant(variant, requestedTab);
    setDesktopActiveKey(nextRequested);
    setMobileActiveKey(nextRequested);
  }, [requestedTab, variant]);

  useEffect(() => {
    if (typeof window === 'undefined' || variant !== 'chat') return undefined;
    const handleAiOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ requestedTab?: DrawerTabKey; context?: AssistantContext }>).detail || {};
      const requested = normalizeTabForVariant('chat', detail.requestedTab || 'assistant');
      setDesktopActiveKey(requested);
      setMobileActiveKey(requested);
      setOpen(true);
      if (detail.context) {
        window.requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent(AI_CONTEXT_EVENT, { detail: detail.context }));
        });
      }
    };
    window.addEventListener(AI_OPEN_EVENT, handleAiOpen as EventListener);
    return () => window.removeEventListener(AI_OPEN_EVENT, handleAiOpen as EventListener);
  }, [variant]);

  useEffect(() => {
    if (!open || activeDrawerSection !== 'notes' || selectedNoteUserId) return;
    void refreshSection('notes', { force: true });
  }, [activeDrawerSection, open, profile.id, selectedNoteUserId]);

  useEffect(() => {
    if (!open) return;
    if (activeDrawerSection !== 'bot_messages') return;
    if (!selectedBotGroupId) {
      setBotMessages([]);
      return;
    }
    botShouldStickToBottomRef.current = true;
    botForceScrollToBottomRef.current = true;
    setBotViewportReady(false);
    if (!botTimelineAvailable) {
      void fetchBotMessages(selectedBotGroupId, { showLoading: true });
    }
  }, [activeDrawerSection, botTimelineAvailable, open, selectedBotGroupId]);

  useEffect(() => {
    if (!open) return;
    if (activeDrawerSection === 'notes') {
      noteShouldStickToBottomRef.current = true;
      noteForceScrollToBottomRef.current = true;
      setNoteViewportReady(false);
      return;
    }
    if (activeDrawerSection === 'bot_messages') {
      botShouldStickToBottomRef.current = true;
      botForceScrollToBottomRef.current = true;
      setBotViewportReady(false);
    }
  }, [activeDrawerSection, open]);

  useEffect(() => {
    if (!profile.id) return;
    const interval = setInterval(() => {
      if (open) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshClosedState({ force: true });
    }, 90000);
    return () => clearInterval(interval);
  }, [open, profile.id, profile.role_id, variant]);

  // Refresh data when the page becomes visible again (e.g., returning from another app/tab)
  // Also briefly suppresses transitions to prevent flicker on mobile browsers
  useEffect(() => {
    if (!profile.id) return;
    let visibilityDebounceTimer: number | null = null;
    let resumeClassTimer: number | null = null;
    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      // Add CSS class to suppress transitions/animations briefly (prevents drawer flicker)
      document.body.classList.add('page-resuming');
      if (resumeClassTimer !== null) window.clearTimeout(resumeClassTimer);
      resumeClassTimer = window.setTimeout(() => {
        document.body.classList.remove('page-resuming');
        resumeClassTimer = null;
      }, 400);
      // Debounce data refresh
      if (visibilityDebounceTimer !== null) window.clearTimeout(visibilityDebounceTimer);
      visibilityDebounceTimer = window.setTimeout(() => {
        visibilityDebounceTimer = null;
        if (open && activeDrawerSection) {
          void refreshSection(activeDrawerSection, { force: true });
          return;
        }
        if (open) {
          void refreshAll(false, { force: true });
          return;
        }
        void refreshClosedState({ force: true });
      }, 600);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityDebounceTimer !== null) window.clearTimeout(visibilityDebounceTimer);
      if (resumeClassTimer !== null) window.clearTimeout(resumeClassTimer);
      document.body.classList.remove('page-resuming');
    };
  }, [activeDrawerSection, open, profile.id, profile.role_id, variant]);

  const currentUserId = String(profile.id || '').trim();
  const currentRoleId = String(profile.role_id || '').trim();
  const hasAssigneeMatch = useCallback((row: any) => {
    if (!row || typeof row !== 'object') return false;
    const assigneeType = String(row.assignee_type || '').trim().toLowerCase();
    const assigneeId = String(row.assignee_id || '').trim();
    const assigneeRoleId = String(row.assignee_role_id || '').trim();
    if (assigneeType === 'user') return assigneeId === currentUserId;
    if (assigneeType === 'role') {
      if (!currentRoleId) return false;
      return assigneeRoleId === currentRoleId || assigneeId === currentRoleId;
    }
    return (
      assigneeId === currentUserId
      || (!!currentRoleId && (assigneeRoleId === currentRoleId || assigneeId === currentRoleId))
    );
  }, [currentRoleId, currentUserId]);
  const normalizeIdArray = useCallback((value: any): string[] => {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    if (typeof value === 'string' && value.trim().startsWith('{') && value.trim().endsWith('}')) {
      return value
        .replace(/^\{|\}$/g, '')
        .split(',')
        .map((item) => String(item || '').replace(/"/g, '').trim())
        .filter(Boolean);
    }
    return [];
  }, []);
  const hasNoteMatch = useCallback((row: any) => {
    if (!row || typeof row !== 'object') return false;
    const authorId = String(row.author_id || '').trim();
    if (authorId === currentUserId) return true;
    const mentionUserIds = normalizeIdArray(row.mention_user_ids);
    if (mentionUserIds.includes(currentUserId)) return true;
    if (currentRoleId) {
      const mentionRoleIds = normalizeIdArray(row.mention_role_ids);
      if (mentionRoleIds.includes(currentRoleId)) return true;
    }
    return false;
  }, [currentRoleId, currentUserId, normalizeIdArray]);
  const hasVoipCallMatch = useCallback((row: any) => {
    if (!row || typeof row !== 'object') return false;
    if (String(row.direction || '').trim() && String(row.direction || '').trim() !== 'incoming') return false;
    if (profile.can_view_all_calls) return true;
    const extension = String(profile.voip_extension || '').trim();
    if (!extension) return false;
    return String(row.extension || '').trim() === extension;
  }, [profile.can_view_all_calls, profile.voip_extension]);
  const scheduleLiveRefresh = useCallback((section?: NotificationSectionKey) => {
    if (liveRefreshTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(liveRefreshTimerRef.current);
    }
    if (typeof window === 'undefined') {
      if (section) {
        void refreshSectionRef.current?.(section, { force: true });
      } else {
        void refreshAllRef.current?.(true, { force: true });
      }
      return;
    }
    if (section) {
      const currentSectionTimer = liveSectionRefreshTimersRef.current[section];
      if (typeof currentSectionTimer === 'number') {
        window.clearTimeout(currentSectionTimer);
      }
      const lastAt = lastLiveRefreshAtRef.current[section] || 0;
      const elapsed = Date.now() - lastAt;
      // If within cooldown: wait out the remaining cooldown before refreshing.
      // This coalesces bursts of realtime events (e.g. workflow spam) into one refresh.
      const delay = elapsed < LIVE_REFRESH_COOLDOWN_MS ? LIVE_REFRESH_COOLDOWN_MS - elapsed : 250;
      liveSectionRefreshTimersRef.current[section] = window.setTimeout(() => {
        delete liveSectionRefreshTimersRef.current[section];
        lastLiveRefreshAtRef.current[section] = Date.now();
        void refreshSectionRef.current?.(section, { force: true });
      }, delay);
      return;
    }
    liveRefreshTimerRef.current = window.setTimeout(() => {
      liveRefreshTimerRef.current = null;
      void refreshAllRef.current?.(true, { force: true });
    }, 400);
  }, []);
  const mapBroadcastSection = useCallback((section: any): NotificationSectionKey | null => {
    const normalized = String(section || '').trim();
    if (variant === 'chat') {
      if (normalized === 'notes') return 'notes';
      if (normalized === 'bot_messages') return 'bot_messages';
      if (normalized === 'sms' || normalized === 'sms_messages') return 'sms_messages';
      if (normalized === 'voip_calls') return 'voip_calls';
      return null;
    }
    if (normalized === 'tasks') return 'tasks';
    if (normalized === 'responsibilities') return 'responsibilities';
    return null;
  }, [variant]);
  useNotificationRealtimeSync({
    supabase,
    enabled: Boolean(profile.id) && !realtimeDisabledRef.current,
    variant,
    channelKey: `notifications-live-${variant}-${currentUserId}-${currentRoleId || 'none'}`,
    currentUserId,
    currentRoleId,
    currentOrgId: String(profile.org_id || '').trim() || null,
    mapBroadcastSection,
    scheduleLiveRefresh,
    hasNoteMatch,
    hasAssigneeMatch,
    hasVoipCallMatch,
    responsibilityTables: RESPONSIBILITY_REALTIME_TABLES,
    onVoipUpsert: (row) => {
      setVoipCalls((prev) => [row, ...prev.filter((item) => String(item?.id || '') !== String(row?.id || ''))].slice(0, 20));
    },
  });

  const notesCount = useMemo(() => {
    if (noteConversationSummaryAvailable && rpcNoteConversationSummaries) {
      return (rpcNoteConversationSummaries || [])
        .filter((item) => String(item?.section || '').trim() === 'notes' && String(item?.kind || '').trim() !== 'system')
        .reduce((sum, item) => sum + Number(item?.unread_count || 0), 0);
    }
    return notes.filter((n: any) => {
      const authorId = String(n?.author_id || '').trim();
      const id = String(n?.id || '');
      return (
        (!authorId || authorId !== String(profile.id || ''))
        && !isSystemNote(n)
        && !isNotificationRead('notes', 'note', id, seenNoteIds.has(id))
      );
    }).length + noteLikeNotifications.filter((item) => (
      !isNotificationRead('notes', 'note_like', String(item?.source_id || ''), false)
    )).length;
  }, [notes, noteLikeNotifications, profile.id, isNotificationRead, seenNoteIds, noteConversationSummaryAvailable, rpcNoteConversationSummaries]);
  const tasksCount = useMemo(() => tasks.filter((t: any) => (
    !isNotificationRead('tasks', 'task', String(t?.id || ''), seenTaskIds.has(String(t?.id || '')))
  )).length, [tasks, seenTaskIds, isNotificationRead]);
  const responsibilitiesCount = useMemo(() => responsibilities.filter((r: any) => (
    !isNotificationRead('responsibilities', getResponsibilitySourceType(r), String(r?.id || ''), seenResponsibilityIds.has(String(r?.id || '')))
  )).length, [responsibilities, seenResponsibilityIds, isNotificationRead]);
  const botMessagesCount = useMemo(() => botConversationSummaryAvailable && rpcBotConversationSummaries
    ? (rpcBotConversationSummaries || []).reduce((sum, item) => {
        const groupId = String(item?.bot_group_id || '').trim();
        if (!groupId || (visibleBotGroupIds.size > 0 && !visibleBotGroupIds.has(groupId))) return sum;
        return sum + Number(item?.unread_count || 0);
      }, 0)
    : botNotificationMessages.filter((row) => {
      const id = String(row?.id || '').trim();
      return String(row?.direction || '').trim() === 'inbound'
        && !isNotificationRead('bot_messages', 'counterparty_bot_message', id, seenBotMessageIds.has(id));
    }).length, [botConversationSummaryAvailable, rpcBotConversationSummaries, botNotificationMessages, seenBotMessageIds, isNotificationRead, visibleBotGroupIds]);
  const smsMessagesCount = useMemo(() => smsMessages.filter((row: any) => {
    const id = String(row?.id || '').trim();
    return String(row?.direction || '').trim() === 'inbound'
      && !isNotificationRead('sms_messages', 'inbound_sms', id, seenSmsMessageIds.has(id));
  }).length, [smsMessages, isNotificationRead, seenSmsMessageIds]);
  const voipCallsCount = useMemo(() => voipCalls.filter((row: any) => (
    String(row?.direction || '').trim() === 'incoming'
    && !isNotificationRead('voip_calls', 'voip_call', String(row?.id || '').trim(), seenVoipCallIds.has(String(row?.id || '').trim()))
  )).length, [voipCalls, seenVoipCallIds, isNotificationRead]);
  const chatTotalCount = notesCount + botMessagesCount + smsMessagesCount + voipCallsCount;
  const alertsTotalCount = tasksCount + responsibilitiesCount;
  const totalCount = variant === 'chat' ? chatTotalCount : alertsTotalCount;
  const smsThreads = useMemo<SmsThreadItem[]>(
    () => buildSmsThreads({
      messages: smsMessages,
      recordTitleMap,
      seenSmsMessageIds: EMPTY_READ_FALLBACK_SET,
      isNotificationRead,
    }),
    [isNotificationRead, recordTitleMap, smsMessages]
  );
  const selectedSmsThread = useMemo(
    () => smsThreads.find((thread) => thread.id === selectedSmsThreadKey) || smsThreads[0] || null,
    [selectedSmsThreadKey, smsThreads]
  );
  const displayedSmsMessages = selectedSmsThread?.messages || [];
  const voipThreads = useMemo<VoipThreadItem[]>(
    () => buildVoipThreads({
      calls: voipCalls,
      recordTitleMap,
      seenVoipCallIds,
      isNotificationRead,
    }),
    [isNotificationRead, recordTitleMap, seenVoipCallIds, voipCalls]
  );
  const selectedVoipThread = useMemo(
    () => voipThreads.find((thread) => thread.id === selectedVoipThreadKey) || voipThreads[0] || null,
    [selectedVoipThreadKey, voipThreads]
  );
  const displayedVoipCalls = selectedVoipThread?.calls || [];
  useEffect(() => {
    if (smsThreads.length === 0) {
      setSelectedSmsThreadKey(null);
      return;
    }
    setSelectedSmsThreadKey((prev) => (
      prev && smsThreads.some((thread) => thread.id === prev) ? prev : smsThreads[0].id
    ));
  }, [smsThreads]);
  useEffect(() => {
    if (voipThreads.length === 0) {
      setSelectedVoipThreadKey(null);
      return;
    }
    setSelectedVoipThreadKey((prev) => (
      prev && voipThreads.some((thread) => thread.id === prev) ? prev : voipThreads[0].id
    ));
  }, [voipThreads]);
  useEffect(() => {
    if (!selectedSmsThread?.phone) return;
    setSmsRecipient((prev) => {
      const current = String(prev || '').trim();
      if (!current) return selectedSmsThread.phone;
      if (normalizePhoneThreadValue(current) === normalizePhoneThreadValue(selectedSmsThread.phone)) return prev;
      return prev;
    });
  }, [selectedSmsThread]);
  const filteredTasks = useMemo(() => {
    const parseTime = (value: any) => {
      if (!value) return null;
      const date = new Date(value);
      const time = date.getTime();
      return Number.isNaN(time) ? null : time;
    };
    const sortRows = (rows: any[], direction: CreatedSortDirection) => (
      [...rows].sort((a: any, b: any) => {
        const aTime = parseTime(a?.created_at) ?? 0;
        const bTime = parseTime(b?.created_at) ?? 0;
        return direction === 'asc' ? aTime - bTime : bTime - aTime;
      })
    );
    const now = Date.now();
    const normalized = [...tasks];
    const isDone = (task: any) => {
      const status = String(task?.status || '').toLowerCase();
      return status === 'done' || status === 'completed';
    };
    const isCanceled = (task: any) => String(task?.status || '').toLowerCase() === 'canceled';

    const next = normalized.filter((task: any) => {
      if (isCanceled(task)) return false;
      const dueAt = parseTime(task?.due_date);
      switch (taskViewKey) {
        case 'overdue':
          return !isDone(task)
            && String(task?.status || '').toLowerCase() !== 'in_progress'
            && dueAt !== null
            && dueAt < now;
        case 'in_progress':
          return String(task?.status || '').toLowerCase() === 'in_progress';
        case 'upcoming':
          return !isDone(task)
            && String(task?.status || '').toLowerCase() !== 'in_progress'
            && dueAt !== null
            && dueAt >= now;
        case 'all':
        default:
          return true;
      }
    });

    next.sort((a: any, b: any) => {
      const dueA = parseTime(a?.due_date);
      const dueB = parseTime(b?.due_date);
      const startA = parseTime(a?.start_date);
      const startB = parseTime(b?.start_date);
      const createdA = parseTime(a?.created_at) || 0;
      const createdB = parseTime(b?.created_at) || 0;

      if (taskViewKey === 'overdue') {
        if (dueA === null && dueB === null) return createdB - createdA;
        if (dueA === null) return 1;
        if (dueB === null) return -1;
        if (dueA !== dueB) return dueA - dueB;
        return createdA - createdB;
      }

      if (taskViewKey === 'in_progress') {
        const anchorA = startA ?? createdA;
        const anchorB = startB ?? createdB;
        if (anchorA !== anchorB) return anchorA - anchorB;
        return createdA - createdB;
      }

      if (taskViewKey === 'upcoming') {
        if (dueA === null && dueB === null) return createdB - createdA;
        if (dueA === null) return 1;
        if (dueB === null) return -1;
        if (dueA !== dueB) return dueA - dueB;
        return createdB - createdA;
      }

      return createdB - createdA;
    });

    return sortRows(next, taskSortDirection);
  }, [taskSortDirection, taskViewKey, tasks]);
  const directoryUserMap = useMemo(
    () => directoryUsers.reduce<Record<string, { id: string; display_name: string; avatar_url?: string | null; role_id?: string | null }>>((acc, user) => {
      acc[String(user.id)] = user;
      return acc;
    }, {}),
    [directoryUsers]
  );
  const roleLookup = useMemo(
    () => directoryRoles.reduce<Record<string, string>>((acc, role) => {
      acc[String(role.id)] = role.title;
      return acc;
    }, {}),
    [directoryRoles]
  );
  const noteLookup = useMemo(
    () => new Map(notes.map((note: any) => [String(note.id), note])),
    [notes]
  );
  const chatGroupMap = useMemo(
    () => chatGroups.reduce<Record<string, ChatGroupRow>>((acc, group) => {
      acc[String(group.id)] = group;
      return acc;
    }, {}),
    [chatGroups]
  );
  const selectedChatGroupId = useMemo(
    () => getChatGroupSelectionId(selectedNoteUserId),
    [selectedNoteUserId]
  );
  const selectedChatGroup = useMemo(
    () => (selectedChatGroupId ? chatGroupMap[selectedChatGroupId] || null : null),
    [chatGroupMap, selectedChatGroupId]
  );
  const resolveGroupMemberUserIds = useCallback((group: ChatGroupRow | null | undefined) => {
    if (!group) return [] as string[];
    const resolved = new Set<string>((group.user_ids || []).map((id) => String(id)));
    if (Array.isArray(group.role_ids) && group.role_ids.length > 0) {
      directoryUsers.forEach((user) => {
        if (user.role_id && group.role_ids.includes(String(user.role_id))) {
          resolved.add(String(user.id));
        }
      });
    }
    return Array.from(resolved);
  }, [directoryUsers]);
  const selectedRpcConversationKey = useMemo(() => {
    if (!noteConversationSummaryAvailable || !Array.isArray(rpcNoteConversationSummaries) || !selectedNoteUserId) {
      return null;
    }
    const matched = rpcNoteConversationSummaries.find((item) => {
      const kind = String(item?.kind || '').trim();
      if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) {
        return kind === 'system';
      }
      if (selectedChatGroupId) {
        return kind === 'group' && String(item?.group_id || '').trim() === selectedChatGroupId;
      }
      return kind === 'direct' && String(item?.user_id || '').trim() === String(selectedNoteUserId || '').trim();
    });
    return String(matched?.conversation_key || '').trim() || null;
  }, [noteConversationSummaryAvailable, rpcNoteConversationSummaries, selectedChatGroupId, selectedNoteUserId]);
  const selectedConversationKey = useMemo(() => {
    if (!selectedNoteUserId) return null;
    if (selectedRpcConversationKey) {
      return selectedRpcConversationKey;
    }
    if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) return 'system';
    if (selectedChatGroupId) return `group:${selectedChatGroupId}`;
    return buildDirectConversationKey(String(profile.id || ''), String(selectedNoteUserId || ''));
  }, [profile.id, selectedChatGroupId, selectedNoteUserId, selectedRpcConversationKey]);
  useEffect(() => {
    if (variant !== 'chat' || !profile.id || typeof window === 'undefined') return undefined;
    const timer = window.setTimeout(() => {
      (rpcNoteConversationSummaries || [])
        .filter((item) => {
          const key = String(item?.conversation_key || '').trim();
          return key && key !== 'system' && key !== String(selectedConversationKey || '').trim();
        })
        .slice(0, 2)
        .forEach((item) => {
          void prefetchInternalConversationTimeline<any>({
            supabase,
            conversationKey: String(item.conversation_key || '').trim(),
            cacheScopeKey: communicationCacheScopeKey,
            pageSize: 10,
          });
        });
      (rpcBotConversationSummaries || [])
        .map((item) => String(item?.bot_group_id || '').trim())
        .filter((botGroupId) => botGroupId && botGroupId !== String(selectedBotGroupId || '').trim())
        .slice(0, 2)
        .forEach((botGroupId) => {
          void prefetchBotConversationTimeline<CounterpartyBotMessageRow>({
            supabase,
            botGroupId,
            cacheScopeKey: communicationCacheScopeKey,
            pageSize: 10,
          });
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    communicationCacheScopeKey,
    profile.id,
    rpcBotConversationSummaries,
    rpcNoteConversationSummaries,
    selectedBotGroupId,
    selectedConversationKey,
    variant,
  ]);
  const {
    items: selectedConversationNotes,
    setItems: setSelectedConversationNotes,
    loadingInitial: loadingSelectedConversationNotes,
    loadingOlder: loadingOlderSelectedConversationNotes,
    hasMore: selectedConversationHasMoreBefore,
    initialAnchorId: selectedConversationInitialAnchorId,
    unreadCount: selectedConversationUnreadCount,
    readModel: selectedConversationReadModel,
    refresh: refreshSelectedConversationTimeline,
    loadOlder: loadOlderSelectedConversationNotes,
  } = useInternalConversationTimeline<any>({
    supabase,
    enabled: open && activeDrawerSection === 'notes' && Boolean(profile.id) && Boolean(selectedConversationKey),
    conversationKey: selectedConversationKey,
    pageSize: 10,
    cacheScopeKey: communicationCacheScopeKey,
  });
  const loadOlderNotesWithPreserve = useCallback(async () => {
    const container = notesScrollContainerRef.current;
    if (container) pendingNoteScrollRestoreRef.current = container.scrollHeight;
    await loadOlderSelectedConversationNotes();
  }, [loadOlderSelectedConversationNotes]);
  const loadOlderMyNotesWithPreserve = useCallback(() => {
    const container = notesScrollContainerRef.current;
    if (container) pendingNoteScrollRestoreRef.current = container.scrollHeight;
    setMyNotesDisplayLimit((prev) => prev + 15);
  }, []);
  const loadOlderBotWithPreserve = useCallback(async () => {
    const container = botMessagesScrollContainerRef.current;
    if (container) pendingBotScrollRestoreRef.current = container.scrollHeight;
    await loadOlderBotMessages();
  }, [loadOlderBotMessages]);
  const isUnreadNoteRow = useCallback((note: any) => {
    const noteId = String(note?.id || '').trim();
    if (!noteId) return false;
    const authorId = String(note?.author_id || '').trim();
    const currentUserId = String(profile.id || '').trim();
    if (authorId && currentUserId && authorId === currentUserId) return false;
    return !isNotificationRead('notes', 'note', noteId, seenNoteIds.has(noteId));
  }, [isNotificationRead, profile.id, seenNoteIds]);
  const isUnreadBotRow = useCallback((row: CounterpartyBotMessageRow | null | undefined) => {
    const rowId = String(row?.id || '').trim();
    if (!rowId) return false;
    if (String(row?.direction || '').trim() === 'outbound') return false;
    return !isNotificationRead('bot_messages', 'counterparty_bot_message', rowId, seenBotMessageIds.has(rowId));
  }, [isNotificationRead, seenBotMessageIds]);
  const isSelectedConversationLoaded = !selectedConversationKey || !loadingSelectedConversationNotes;
  const filteredNotes = useMemo(() => {
    const sourceNotes = selectedConversationKey
      ? (selectedConversationNotes || [])
      : notes;
    if (!selectedNoteUserId) {
      const currentUserId = String(profile.id || '').trim();
      return sourceNotes.filter((note: any) => (
        currentUserId
        && String(note?.author_id || '').trim() === currentUserId
        && !isSystemNote(note)
      ));
    }
    if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) {
      return sourceNotes.filter((note: any) => isSystemNote(note));
    }
    if (selectedChatGroupId) {
      return sourceNotes.filter((note: any) => String(note?.metadata?.chat_group_id || '').trim() === selectedChatGroupId);
    }
    const targetUserId = String(selectedNoteUserId);
    const currentUserId = String(profile.id || '');
    return sourceNotes.filter((note: any) =>
      isDirectConversationNote(note, currentUserId, targetUserId, noteLookup)
    );
  }, [noteLookup, notes, profile.id, selectedChatGroupId, selectedConversationKey, selectedConversationNotes, selectedNoteUserId]);
  const inferredDirectUsers = useMemo(() => {
    const currentUserId = String(profile.id || '').trim();
    if (!currentUserId) return [] as Array<{ id: string; display_name: string; avatar_url?: string | null; role_id?: string | null }>;

    const nameById: Record<string, string> = {};
    notes.forEach((note: any) => {
      const authorId = String(note?.author_id || '').trim();
      const authorName = String(note?.author_name || '').trim();
      if (authorId && authorName && !nameById[authorId]) {
        nameById[authorId] = authorName;
      }
    });

    const candidateIds = new Set<string>();
    notes.forEach((note: any) => {
      const authorId = String(note?.author_id || '').trim();
      if (authorId && authorId !== currentUserId) candidateIds.add(authorId);
      const mentionIds = Array.isArray(note?.mention_user_ids) ? note.mention_user_ids : [];
      mentionIds.forEach((id: any) => {
        const normalized = String(id || '').trim();
        if (normalized && normalized !== currentUserId) candidateIds.add(normalized);
      });
    });

    const result: Array<{ id: string; display_name: string; avatar_url?: string | null; role_id?: string | null }> = [];
    candidateIds.forEach((userId) => {
      if (directoryUserMap[userId]) return;
      const hasConversation = notes.some((note: any) =>
        isDirectConversationNote(note, currentUserId, userId, noteLookup)
      );
      if (!hasConversation) return;
      result.push({
        id: userId,
        display_name: nameById[userId] || authorNameMap[userId] || `کاربر ${userId.slice(0, 8)}`,
        avatar_url: null,
        role_id: null,
      });
    });
    return result;
  }, [authorNameMap, directoryUserMap, noteLookup, notes, profile.id]);
  const availableDirectUsers = useMemo(
    () => {
      const byId = new Map<string, { id: string; display_name: string; avatar_url?: string | null; role_id?: string | null }>();
      directoryUsers
        .filter((user) => String(user.id) !== String(profile.id || ''))
        .forEach((user) => {
          byId.set(String(user.id), user);
        });
      inferredDirectUsers.forEach((user) => {
        if (!byId.has(String(user.id))) {
          byId.set(String(user.id), user);
        }
      });
      return Array.from(byId.values());
    },
    [directoryUsers, inferredDirectUsers, profile.id]
  );
  const systemNoteStats = useMemo(() => {
    const systemNotes = notes.filter((note: any) => isSystemNote(note));
    const latestMessageAt = systemNotes.reduce<number>((latest, note: any) => {
      const createdAt = new Date(note?.created_at || '').getTime();
      return Number.isFinite(createdAt) ? Math.max(latest, createdAt) : latest;
    }, 0);
    const unreadCount = systemNotes.filter((note: any) => (
      !isNotificationRead('notes', 'note', String(note?.id || ''), seenNoteIds.has(String(note?.id || '')))
    )).length;
    return { noteCount: systemNotes.length, latestMessageAt, unreadCount };
  }, [isNotificationRead, notes, seenNoteIds]);
  const myNoteStats = useMemo(() => {
    const currentUserId = String(profile.id || '').trim();
    const myNotes = currentUserId
      ? notes.filter((note: any) => String(note?.author_id || '').trim() === currentUserId && !isSystemNote(note))
      : [];
    const latestMessageAt = myNotes.reduce<number>((latest, note: any) => {
      const createdAt = new Date(note?.created_at || '').getTime();
      return Number.isFinite(createdAt) ? Math.max(latest, createdAt) : latest;
    }, 0);
    return { noteCount: myNotes.length, latestMessageAt };
  }, [notes, profile.id]);
  const noteConversations = useMemo<ConversationListItem[]>(
    () => buildNoteConversations({
      availableDirectUsers,
      chatGroups,
      notes,
      noteLookup,
      currentUserId: profile.id,
      roleLookup,
      seenNoteIds: EMPTY_READ_FALLBACK_SET,
      isNotificationRead,
    }),
    [availableDirectUsers, chatGroups, isNotificationRead, noteLookup, notes, profile.id, roleLookup]
  );
  const noteConversationsFromRpc = useMemo<ConversationListItem[]>(() => {
    const summaries = rpcNoteConversationSummaries || [];
    const rpcGroupIds = new Set<string>();
    const rpcItems = summaries
      .filter((item) => String(item?.section || '').trim() === 'notes')
      .map((item: NotificationConversationSummary) => {
        const kind = String(item.kind || '').trim();
        if (kind === 'system') {
          return {
            id: SYSTEM_MESSAGES_USER_ID,
            kind: 'system' as const,
            conversationKey: String(item.conversation_key || 'system'),
            displayName: String(item.title || 'پیام‌های سیستم'),
            noteCount: Number(item.note_count || 0),
            unreadCount: Number(item.unread_count || 0),
            latestMessageAt: new Date(item.latest_message_at || 0).getTime() || 0,
            userId: SYSTEM_MESSAGES_USER_ID,
            isGroup: false,
          };
        }
        if (kind === 'group') {
          const groupId = String(item.group_id || '').trim();
          if (groupId) rpcGroupIds.add(groupId);
          const chatGroup = groupId ? chatGroupMap[groupId] || null : null;
          return {
            id: `${CHAT_GROUP_PREFIX}${groupId}`,
            kind: 'group' as const,
            conversationKey: String(item.conversation_key || `group:${groupId}`),
            displayName: String(chatGroup?.name || item.title || 'گروه'),
            noteCount: Number(item.note_count || 0),
            unreadCount: Number(item.unread_count || 0),
            latestMessageAt: new Date(item.latest_message_at || 0).getTime() || 0,
            groupId,
            isGroup: true,
          };
        }
        const userId = String(item.user_id || '').trim();
        const directoryUser = userId ? directoryUserMap[userId] || null : null;
        return {
          id: userId,
          kind: 'direct' as const,
          conversationKey: String(item.conversation_key || '').trim() || null,
          displayName: String(directoryUser?.display_name || item.title || 'کاربر'),
          avatarUrl: directoryUser?.avatar_url || item.avatar_url || null,
          noteCount: Number(item.note_count || 0),
          unreadCount: Number(item.unread_count || 0),
          latestMessageAt: new Date(item.latest_message_at || 0).getTime() || 0,
          roleLabel: (directoryUser?.role_id ? roleLookup[String(directoryUser.role_id)] : null) || item.role_label || null,
          userId,
          isGroup: false,
        };
      })
      .filter((item) => Boolean(item.id));

    // Merge groups the user is a member of that RPC didn't return (e.g. no recent
    // notification_inbox_items with this user in target_user_ids). These groups are
    // still accessible — clicking them loads messages via the legacy notes fallback.
    const localOnlyGroups: ConversationListItem[] = chatGroups
      .filter((group) => {
        const gid = String(group.id || '').trim();
        return gid && !rpcGroupIds.has(gid);
      })
      .map((group) => ({
        id: `${CHAT_GROUP_PREFIX}${group.id}`,
        kind: 'group' as const,
        conversationKey: `group:${group.id}`,
        displayName: group.name,
        noteCount: 0,
        unreadCount: 0,
        latestMessageAt: 0,
        groupId: group.id,
        isGroup: true,
      }));

    return [...rpcItems, ...localOnlyGroups]
      .sort((a, b) => {
        if (b.latestMessageAt !== a.latestMessageAt) return b.latestMessageAt - a.latestMessageAt;
        if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
        return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'fa');
      })
      .filter((item, index, arr) => arr.findIndex((other) => other.id === item.id) === index);
  }, [chatGroupMap, chatGroups, directoryUserMap, roleLookup, rpcNoteConversationSummaries]);
  const effectiveNoteConversations = noteConversationSummaryAvailable && rpcNoteConversationSummaries
    ? noteConversationsFromRpc.filter((item) => item.kind !== 'system')
    : noteConversations;
  const effectiveSystemNoteStats = useMemo(() => {
    const systemSummary = noteConversationSummaryAvailable && rpcNoteConversationSummaries
      ? noteConversationsFromRpc.find((item) => item.kind === 'system')
      : null;
    const baseStats = systemSummary
      ? {
          noteCount: systemSummary.noteCount,
          latestMessageAt: systemSummary.latestMessageAt,
          unreadCount: systemSummary.unreadCount,
        }
      : systemNoteStats;
    if (selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID) {
      return baseStats;
    }

    const loadedSystemNotes = (selectedConversationNotes || []).filter((note: any) => isSystemNote(note));
    if (loadedSystemNotes.length === 0) {
      return baseStats;
    }
    const latestLoadedAt = loadedSystemNotes.reduce<number>((latest, note: any) => {
      const createdAt = new Date(note?.created_at || '').getTime();
      return Number.isFinite(createdAt) ? Math.max(latest, createdAt) : latest;
    }, 0);
    const visibleUnreadCount = loadedSystemNotes.filter((note: any) => isUnreadNoteRow(note)).length;
    return {
      noteCount: Math.max(Number(baseStats.noteCount || 0), loadedSystemNotes.length),
      latestMessageAt: Math.max(Number(baseStats.latestMessageAt || 0), latestLoadedAt),
      unreadCount: systemSummary ? Number(baseStats.unreadCount || 0) : Math.max(Number(selectedConversationUnreadCount || 0), visibleUnreadCount),
    };
  }, [
    isUnreadNoteRow,
    noteConversationSummaryAvailable,
    noteConversationsFromRpc,
    rpcNoteConversationSummaries,
    selectedConversationNotes,
    selectedConversationUnreadCount,
    selectedNoteUserId,
    systemNoteStats,
  ]);
  const visibleNoteConversations = useMemo(() => {
    const search = String(noteUserSearch || '').trim().toLowerCase();
    if (!search) return effectiveNoteConversations;
    return effectiveNoteConversations.filter((item) =>
      String(item.displayName || '').toLowerCase().includes(search)
    );
  }, [effectiveNoteConversations, noteUserSearch]);
  const selectedNoteConversationListItem = useMemo(() => {
    if (!selectedNoteUserId) return null;
    return effectiveNoteConversations.find((item) => item.id === selectedNoteUserId) || null;
  }, [effectiveNoteConversations, selectedNoteUserId]);
  const selectedNoteUser = useMemo(() => {
    if (!selectedNoteUserId) return null;
    if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) {
      return {
        id: SYSTEM_MESSAGES_USER_ID,
        display_name: 'پیام‌های سیستم',
        avatar_url: systemAvatarSrc,
        role_id: null,
      };
    }
    if (selectedChatGroupId) {
      return null;
    }
    return directoryUserMap[String(selectedNoteUserId)] || inferredDirectUsers.find((user) => String(user.id) === String(selectedNoteUserId)) || null;
  }, [directoryUserMap, inferredDirectUsers, selectedChatGroupId, selectedNoteUserId, systemAvatarSrc]);
  const selectedNoteConversationAvatar = useMemo(() => buildNoteConversationAvatarModel({
    kind: selectedChatGroup
      ? 'group'
      : (selectedNoteConversationListItem?.kind || (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID ? 'system' : 'direct')),
    displayName: selectedNoteConversationListItem?.displayName || selectedChatGroup?.name || selectedNoteUser?.display_name || null,
    avatarUrl: selectedNoteConversationListItem?.avatarUrl || selectedNoteUser?.avatar_url || null,
    systemAvatarSrc,
  }), [selectedChatGroup, selectedNoteConversationListItem, selectedNoteUser, selectedNoteUserId, systemAvatarSrc]);
  const systemConversationAvatar = useMemo(() => buildNoteConversationAvatarModel({
    kind: 'system',
    displayName: 'پیام‌های سیستم',
    systemAvatarSrc,
  }), [systemAvatarSrc]);
  const patchLocalNoteConversationSummary = useCallback((conversationId: string | null, patch: { unreadCount?: number; noteCount?: number }) => {
    const normalizedConversationId = String(conversationId || '').trim();
    if (!normalizedConversationId) return;
    setRpcNoteConversationSummaries((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((item) => {
        const kind = String(item?.kind || '').trim();
        const itemId = kind === 'system'
          ? SYSTEM_MESSAGES_USER_ID
          : (kind === 'group'
            ? `${CHAT_GROUP_PREFIX}${String(item?.group_id || '').trim()}`
            : String(item?.user_id || '').trim());
        const nextUnreadCount = typeof patch.unreadCount === 'number' ? patch.unreadCount : Number(item?.unread_count || 0);
        const nextNoteCount = typeof patch.noteCount === 'number' ? patch.noteCount : Number(item?.note_count || 0);
        if (
          itemId !== normalizedConversationId
          || (
            Number(item?.unread_count || 0) === nextUnreadCount
            && Number(item?.note_count || 0) === nextNoteCount
          )
        ) {
          return item;
        }
        changed = true;
        return { ...item, unread_count: nextUnreadCount, note_count: nextNoteCount };
      });
      return changed ? next : prev;
    });
  }, [setRpcNoteConversationSummaries]);
  const patchLocalBotConversationSummary = useCallback((botGroupId: string | null, patch: { unreadCount?: number; noteCount?: number }) => {
    const normalizedBotGroupId = String(botGroupId || '').trim();
    if (!normalizedBotGroupId) return;
    setRpcBotConversationSummaries((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((item) => {
        const itemGroupId = String(item?.bot_group_id || '').trim();
        const nextUnreadCount = typeof patch.unreadCount === 'number' ? patch.unreadCount : Number(item?.unread_count || 0);
        const nextNoteCount = typeof patch.noteCount === 'number' ? patch.noteCount : Number(item?.note_count || 0);
        if (
          itemGroupId !== normalizedBotGroupId
          || (
            Number(item?.unread_count || 0) === nextUnreadCount
            && Number(item?.note_count || 0) === nextNoteCount
          )
        ) {
          return item;
        }
        changed = true;
        return { ...item, unread_count: nextUnreadCount, note_count: nextNoteCount };
      });
      return changed ? next : prev;
    });
  }, [setRpcBotConversationSummaries]);
  const orderedFilteredNotes = useMemo(
    () => [...filteredNotes].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [filteredNotes]
  );
  const normalizedNoteMessageSearch = useMemo(
    () => String(noteMessageSearch || '').trim().toLowerCase(),
    [noteMessageSearch]
  );
  const myNotesHasMoreBefore = !selectedNoteUserId && orderedFilteredNotes.length > myNotesDisplayLimit;
  const displayedChatNotes = useMemo(() => {
    if (!normalizedNoteMessageSearch) {
      if (!selectedNoteUserId) return orderedFilteredNotes.slice(-myNotesDisplayLimit);
      return orderedFilteredNotes;
    }
    return orderedFilteredNotes.filter((note: any) => {
      const parsedContent = parseNoteContent(note.content);
      const authorLabel = String(
        note.author_name
        || directoryUserMap[String(note.author_id || '')]?.display_name
        || authorNameMap[note.author_id]
        || ''
      ).toLowerCase();
      const attachmentNames = parsedContent.attachments.map((attachment) => attachment.name).join(' ').toLowerCase();
      const haystack = `${parsedContent.text || ''} ${authorLabel} ${attachmentNames}`.toLowerCase();
      return haystack.includes(normalizedNoteMessageSearch);
    });
  }, [authorNameMap, directoryUserMap, myNotesDisplayLimit, normalizedNoteMessageSearch, orderedFilteredNotes, selectedNoteUserId]);
  const firstUnreadBotMessageDomId = useMemo(() => {
    const rowId = String(
      botTimelineInitialAnchorId
      || botMessages.find((row) => isUnreadBotRow(row))?.id
      || ''
    ).trim();
    return rowId ? `bot-message-${rowId}` : null;
  }, [botMessages, botTimelineInitialAnchorId, isUnreadBotRow]);
  useEffect(() => {
    if (!noteConversationSummaryAvailable) return;
    if (!open || activeDrawerSection !== 'notes') return;
    if (!selectedNoteUserId || loadingSelectedConversationNotes) return;
    const hasVisibleUnread = displayedChatNotes.some((note: any) => isUnreadNoteRow(note));
    if (selectedConversationUnreadCount > 0 || selectedConversationInitialAnchorId || hasVisibleUnread) return;
    patchLocalNoteConversationSummary(selectedNoteUserId, {
      unreadCount: 0,
      noteCount: displayedChatNotes.length === 0 && !selectedConversationHasMoreBefore ? 0 : undefined,
    });
  }, [
    activeDrawerSection,
    displayedChatNotes,
    isUnreadNoteRow,
    loadingSelectedConversationNotes,
    noteConversationSummaryAvailable,
    open,
    patchLocalNoteConversationSummary,
    selectedConversationHasMoreBefore,
    selectedConversationInitialAnchorId,
    selectedConversationUnreadCount,
    selectedNoteUserId,
  ]);
  useEffect(() => {
    if (!botConversationSummaryAvailable) return;
    if (!open || activeDrawerSection !== 'bot_messages') return;
    if (!selectedBotGroupId || loadingBotMessages) return;
    const hasVisibleUnread = botMessages.some((row) => isUnreadBotRow(row));
    if (botTimelineUnreadCount > 0 || botTimelineInitialAnchorId || hasVisibleUnread) return;
    patchLocalBotConversationSummary(selectedBotGroupId, {
      unreadCount: 0,
      noteCount: botMessages.length === 0 && !botTimelineHasMoreBefore ? 0 : undefined,
    });
  }, [
    activeDrawerSection,
    botConversationSummaryAvailable,
    botMessages,
    botTimelineHasMoreBefore,
    botTimelineInitialAnchorId,
    botTimelineUnreadCount,
    isUnreadBotRow,
    loadingBotMessages,
    open,
    patchLocalBotConversationSummary,
    selectedBotGroupId,
  ]);
  const activeConversationRoleLabel = useMemo(() => {
    if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) return 'اعلان‌های گردش کارها و اتوماسیون‌ها';
    if (selectedChatGroup) {
      const memberCount = resolveGroupMemberUserIds(selectedChatGroup).length;
      return `${toPersianNumber(String(memberCount))} عضو`;
    }
    if (selectedNoteConversationListItem?.roleLabel) return selectedNoteConversationListItem.roleLabel;
    if (!selectedNoteUser?.role_id) return 'بدون نقش';
    return roleLookup[String(selectedNoteUser.role_id)] || 'بدون نقش';
  }, [resolveGroupMemberUserIds, roleLookup, selectedChatGroup, selectedNoteConversationListItem, selectedNoteUser, selectedNoteUserId]);
  const currentUserDisplayName = useMemo(() => (
    directoryUserMap[String(profile.id || '')]?.display_name
    || String(profile.full_name || '').trim()
    || 'شما'
  ), [directoryUserMap, profile.full_name, profile.id]);
  const currentUserConversationAvatar = useMemo(() => buildNoteConversationAvatarModel({
    kind: 'direct',
    displayName: currentUserDisplayName,
    avatarUrl: directoryUserMap[String(profile.id || '')]?.avatar_url || profile.avatar_url || null,
  }), [currentUserDisplayName, directoryUserMap, profile.avatar_url, profile.id]);
  const botConversationAvatar = useMemo(() => buildBotConversationAvatarModel(), []);
  const resolveNoteBubbleAvatar = useCallback((note: any, isMine: boolean, isSystem: boolean): ConversationAvatarModel => {
    if (isSystem) return systemConversationAvatar;
    if (isMine) return currentUserConversationAvatar;
    const author = directoryUserMap[String(note?.author_id || '')];
    return buildNoteConversationAvatarModel({
      kind: 'direct',
      displayName: note?.author_name || author?.display_name || 'کاربر',
      avatarUrl: author?.avatar_url || null,
    });
  }, [currentUserConversationAvatar, directoryUserMap, systemConversationAvatar]);
  const resolveBotBubbleAvatar = useCallback((author: { avatarUrl?: string | null; fallback?: React.ReactNode } | null | undefined, outgoing: boolean): ConversationAvatarModel => {
    if (!outgoing) return botConversationAvatar;
    return {
      src: author?.avatarUrl || currentUserConversationAvatar.src || null,
      className: currentUserConversationAvatar.className,
      fallback: author?.fallback || currentUserConversationAvatar.fallback,
    };
  }, [botConversationAvatar, currentUserConversationAvatar]);

  const normalizeReadReceipts = useCallback((box: any): ReadReceiptEntry[] => {
    const map = readReceiptMapFromBox(box);
    return Object.entries(map)
      .map(([fallbackUserId, value]) => {
        const userId = getReadReceiptUserId(value, fallbackUserId);
        if (!userId) return null;
        const directoryUser = directoryUserMap[userId];
        return {
          userId,
          userName: directoryUser?.display_name || getReadReceiptUserName(value) || (userId === String(profile.id || '') ? currentUserDisplayName : userId),
          readAt: getReadReceiptReadAt(value),
        } as ReadReceiptEntry;
      })
      .filter(Boolean)
      .sort((left, right) => new Date(right!.readAt || 0).getTime() - new Date(left!.readAt || 0).getTime()) as ReadReceiptEntry[];
  }, [currentUserDisplayName, directoryUserMap, profile.id]);

  const normalizeLikeReceipts = useCallback((box: any): LikeReceiptEntry[] => {
    const map = likeReceiptMapFromBox(box);
    return Object.entries(map)
      .map(([fallbackUserId, value]) => {
        const userId = getLikeUserId(value, fallbackUserId);
        if (!userId) return null;
        const directoryUser = directoryUserMap[userId];
        return {
          userId,
          userName: directoryUser?.display_name || getLikeUserName(value) || (userId === String(profile.id || '') ? currentUserDisplayName : userId),
          likedAt: getLikeAt(value),
        } as LikeReceiptEntry;
      })
      .filter(Boolean)
      .sort((left, right) => new Date(right!.likedAt || 0).getTime() - new Date(left!.likedAt || 0).getTime()) as LikeReceiptEntry[];
  }, [currentUserDisplayName, directoryUserMap, profile.id]);

  const toggleNoteLike = useCallback(async (note: any) => {
    const currentUserId = String(profile.id || '').trim();
    if (!currentUserId || !note?.id) return;
    const metadata = isPlainRecord(note?.metadata) ? { ...note.metadata } : {};
    const likes = likeReceiptMapFromBox(metadata);
    if (likes[currentUserId]) {
      delete likes[currentUserId];
    } else {
      likes[currentUserId] = {
        user_id: currentUserId,
        user_name: currentUserDisplayName,
        liked_at: new Date().toISOString(),
      };
    }
    const nextMetadata = { ...metadata, [LIKES_KEY]: likes };
    setNotes((prev) => prev.map((row: any) => (
      String(row?.id || '') === String(note.id) ? { ...row, metadata: nextMetadata } : row
    )));
    setSelectedConversationNotes((prev) => prev
      ? prev.map((row: any) => (String(row?.id || '') === String(note.id) ? { ...row, metadata: nextMetadata } : row))
      : prev
    );
    const { error } = await supabase.from('notes').update({ metadata: nextMetadata }).eq('id', note.id);
    if (error) {
      setNotes((prev) => prev.map((row: any) => (
        String(row?.id || '') === String(note.id) ? note : row
      )));
      setSelectedConversationNotes((prev) => prev
        ? prev.map((row: any) => (String(row?.id || '') === String(note.id) ? note : row))
        : prev
      );
      throw error;
    }
  }, [currentUserDisplayName, profile.id]);

  const renderReadReceiptStatus = useCallback((receipts: ReadReceiptEntry[], likes: LikeReceiptEntry[] = []) => {
    const content = (
      <div className="w-[230px] max-w-[70vw]">
        <div className="mb-2 text-[11px] font-bold text-gray-600 dark:text-gray-300">دیده‌شده‌ها</div>
        {receipts.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="هنوز خوانده نشده" /> : null}
        {receipts.length > 0 ? (
          <div className="max-h-[150px] overflow-y-auto space-y-2 py-1">
            {receipts.map((receipt) => (
              <div key={`${receipt.userId}-${receipt.readAt || 'read'}`} className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5">
                <span className="min-w-0 truncate font-medium">{receipt.userName}</span>
                <span className="shrink-0 text-[11px] text-gray-500">{receipt.readAt ? safeJalaliFormat(receipt.readAt, 'YYYY/MM/DD HH:mm') : '-'}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-3 border-t border-gray-100 pt-2 text-[11px] font-bold text-gray-600 dark:border-white/10 dark:text-gray-300">پسندیده‌ها</div>
        {likes.length === 0 ? <div className="py-2 text-xs text-gray-400">هنوز پسندیده نشده</div> : null}
        {likes.length > 0 ? (
          <div className="max-h-[150px] overflow-y-auto space-y-2 py-1">
            {likes.map((like) => (
              <div key={`${like.userId}-${like.likedAt || 'like'}`} className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5">
                <span className="min-w-0 truncate font-medium">{like.userName}</span>
                <span className="shrink-0 text-[11px] text-gray-500">{like.likedAt ? safeJalaliFormat(like.likedAt, 'YYYY/MM/DD HH:mm') : '-'}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );

    return (
      <span className="inline-flex items-center gap-1">
        <Popover trigger="click" placement="top" content={content}>
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition hover:bg-black/5 hover:text-[rgb(var(--brand-600-rgb))] dark:hover:bg-white/10"
            aria-label="وضعیت خوانده شدن"
            onClick={(event) => event.stopPropagation()}
          >
            <EyeOutlined className="text-[11px]" />
          </button>
        </Popover>
      </span>
    );
  }, []);
  const forwardTargetOptions = useMemo(
    () => [
      ...botGroups.map((group) => ({
        label: `گروه بات: ${String(group.group_title || '').trim() || String(group.group_join_link || '').trim() || group.id}`,
        value: `${BOT_GROUP_FORWARD_PREFIX}${group.id}`,
        searchText: `گروه بات ${String(group.group_title || '').trim() || ''} ${String(group.group_join_link || '').trim() || ''}`.toLowerCase(),
      })),
      ...chatGroups.map((group) => ({
        label: `گروه: ${group.name}`,
        value: `${CHAT_GROUP_PREFIX}${group.id}`,
        searchText: `گروه ${group.name}`.toLowerCase(),
      })),
      ...availableDirectUsers
        .filter((user) => String(user.id) !== String(profile.id || ''))
        .map((user) => {
          const roleLabel = user.role_id ? roleLookup[String(user.role_id)] : '';
          return {
            label: roleLabel ? `${user.display_name} - ${roleLabel}` : user.display_name,
            value: String(user.id),
            searchText: `${user.display_name} ${roleLabel || ''}`.toLowerCase(),
          };
        }),
    ],
    [availableDirectUsers, botGroups, chatGroups, profile.id, roleLookup]
  );

  const isBotGroupForwardSelection = (value: string) => String(value || '').startsWith(BOT_GROUP_FORWARD_PREFIX);
  const getBotGroupForwardSelectionId = (value: string) => {
    if (!isBotGroupForwardSelection(value)) return null;
    return String(value).slice(BOT_GROUP_FORWARD_PREFIX.length) || null;
  };

  const getBotMessageAttachments = useCallback((row: CounterpartyBotMessageRow) => extractBotMessageAttachments(row), []);
  const mergeHydratedBotMessageAttachment = useCallback((
    row: CounterpartyBotMessageRow,
    data: { file_url?: string | null; file_name?: string | null; mime_type?: string | null }
  ) => {
    const rowId = String(row?.id || '').trim();
    if (!rowId) return null;
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const nextPayload = {
      ...(payload || {}),
      attachments: [{
        name: String(row.file_name || data.file_name || 'فایل').trim() || 'فایل',
        url: String(data.file_url || '').trim(),
        mime_type: String(data.mime_type || row.mime_type || '').trim() || null,
        file_type: String(row.message_type || 'file').trim() || 'file',
      }],
    };
    setBotMessages((prev) => prev.map((item) => String(item?.id || '') === rowId ? {
      ...item,
      file_url: String(data.file_url || '').trim() || item.file_url,
      file_name: String(row.file_name || data.file_name || '').trim() || item.file_name,
      mime_type: String(data.mime_type || row.mime_type || '').trim() || item.mime_type,
      payload: nextPayload,
    } : item));
    setBotNotificationMessages((prev) => prev.map((item) => String(item?.id || '') === rowId ? {
      ...item,
      file_url: String(data.file_url || '').trim() || item.file_url,
      file_name: String(row.file_name || data.file_name || '').trim() || item.file_name,
      mime_type: String(data.mime_type || row.mime_type || '').trim() || item.mime_type,
      payload: nextPayload,
    } : item));
    botHydrationFailuresRef.current.delete(rowId);
    loggedBotHydrationFailuresRef.current.delete(rowId);
    return {
      name: String(row.file_name || data.file_name || 'فایل').trim() || 'فایل',
      url: String(data.file_url || '').trim(),
      mimeType: String(data.mime_type || row.mime_type || '').trim() || null,
      fileType: String(row.message_type || 'file').trim() || 'file',
    };
  }, []);

  const importBotMessageAttachment = useCallback(async (
    row: CounterpartyBotMessageRow,
    options: { force?: boolean; downloadAfter?: boolean } = {},
  ) => {
    const rowId = String(row?.id || '').trim();
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const fileId = String((payload as any)?.media_file_id || '').trim();
    if (!rowId || !fileId) {
      throw new Error('شناسه فایل این پیام در دسترس نیست.');
    }
    if (String(selectedBotGroup?.channel_type || '').trim() !== 'rubika') {
      throw new Error('این عملیات فقط برای فایل‌های روبیکا پشتیبانی می‌شود.');
    }
    const activeConnection = await getActiveChannelSettings('rubika');
    const connectionId = String(activeConnection?.id || '').trim();
    if (!connectionId) {
      throw new Error('تنظیمات فعال روبیکا پیدا نشد.');
    }
    if (!options.force) {
      const failureState = botHydrationFailuresRef.current.get(rowId);
      const now = Date.now();
      if (
        failureState
        && failureState.attempts >= BOT_MEDIA_HYDRATION_MAX_FAILURES
        && now - failureState.lastAttemptAt < BOT_MEDIA_HYDRATION_BACKOFF_MS
      ) {
        throw new Error('این فایل اخیراً ناموفق بوده است. کمی بعد دوباره تلاش کنید.');
      }
    }

    const { data, error } = await supabase.functions.invoke('bot-admin', {
      body: {
        action: 'import_rubika_file',
        channel: 'rubika',
        connectionId,
        messageId: rowId,
        fileId,
        fileName: String(row.file_name || '').trim() || undefined,
      },
    });
    if (error) throw error;
    if (!data?.success || !String(data?.file_url || '').trim()) {
      const failureMessage = String(data?.message || 'بازیابی فایل پیام بات ناموفق بود.').trim();
      const retryable = data?.retryable === true;
      botHydrationFailuresRef.current.set(rowId, {
        attempts: retryable ? 1 : BOT_MEDIA_HYDRATION_MAX_FAILURES,
        lastAttemptAt: Date.now(),
      });
      const nextError = new Error(failureMessage) as Error & { retryable?: boolean };
      nextError.retryable = retryable;
      throw nextError;
    }
    const nextAttachment = mergeHydratedBotMessageAttachment(row, data || {});
    if (options.downloadAfter && nextAttachment?.url && typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = nextAttachment.url;
      link.download = nextAttachment.name || 'file';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    return nextAttachment;
  }, [mergeHydratedBotMessageAttachment, selectedBotGroup?.channel_type]);

  const hydrateBotMessagesMedia = useCallback(async (rows: CounterpartyBotMessageRow[]) => {
    const hasBrokenRubikaStorageUrl = (url: string) => /https?:\/\/botapi\.rubika\.ir\/storage\/v1\/object\/public\//i.test(String(url || '').trim());
    const now = Date.now();
    const pendingRows = (rows || []).filter((row) => {
      if (String(row?.direction || '') !== 'inbound') return false;
      if (String(selectedBotGroup?.channel_type || '').trim() !== 'rubika') return false;
      const rowId = String(row?.id || '').trim();
      if (!rowId || hydratingBotMessageIdsRef.current.has(rowId)) return false;
      const failureState = botHydrationFailuresRef.current.get(rowId);
      if (
        failureState
        && failureState.attempts >= BOT_MEDIA_HYDRATION_MAX_FAILURES
        && now - failureState.lastAttemptAt < BOT_MEDIA_HYDRATION_BACKOFF_MS
      ) {
        return false;
      }
      const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
      const fileId = String((payload as any)?.media_file_id || '').trim();
      const hasUsableAttachment = getBotMessageAttachments(row).some((item) => {
        const url = String(item?.url || '').trim();
        return Boolean(url) && !hasBrokenRubikaStorageUrl(url);
      });
      return Boolean(fileId && !hasUsableAttachment);
    }).slice(0, BOT_MEDIA_AUTO_HYDRATION_BATCH_SIZE);
    if (pendingRows.length === 0) return;

    const activeConnection = await getActiveChannelSettings('rubika');
    const connectionId = String(activeConnection?.id || '').trim();
    if (!connectionId) return;

    for (const row of pendingRows) {
      const rowId = String(row?.id || '').trim();
      const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
      const fileId = String((payload as any)?.media_file_id || '').trim();
      if (!rowId || !fileId) continue;
      hydratingBotMessageIdsRef.current.add(rowId);
      try {
        await importBotMessageAttachment(row, { force: true });
      } catch (error) {
        const previousAttempts = botHydrationFailuresRef.current.get(rowId)?.attempts || 0;
        const retryable = (error as { retryable?: boolean } | null)?.retryable === true;
        botHydrationFailuresRef.current.set(rowId, {
          attempts: retryable ? Math.max(previousAttempts, 1) : Math.max(previousAttempts, BOT_MEDIA_HYDRATION_MAX_FAILURES),
          lastAttemptAt: Date.now(),
        });
        if (!loggedBotHydrationFailuresRef.current.has(rowId)) {
          loggedBotHydrationFailuresRef.current.add(rowId);
          console.info('Skipped Rubika bot message attachment hydration after controlled failure.', {
            messageId: rowId,
            fileId,
            error: toFaErrorMessage(error as any, 'خطای نامشخص'),
          });
        }
      } finally {
        hydratingBotMessageIdsRef.current.delete(rowId);
      }
    }
  }, [getBotMessageAttachments, importBotMessageAttachment, selectedBotGroup?.channel_type]);
  useEffect(() => {
    if (!open || activeDrawerSection !== 'bot_messages') return;
    void hydrateBotMessagesMedia(botMessages);
  }, [activeDrawerSection, botMessages, hydrateBotMessagesMedia, open]);

  const buildAttachmentNameText = useCallback((attachments: Array<{ name?: string; url?: string }>) => {
    const lines = (attachments || [])
      .map((item, index) => {
        const name = String(item?.name || `فایل ${index + 1}`).trim() || `فایل ${index + 1}`;
        const url = String(item?.url || '').trim();
        if (!url) return `🔗 ${name}`;
        return `[🔗 ${name}](${url})`;
      })
      .filter(Boolean);
    if (lines.length === 0) return '';
    return `پیوست‌ها:\n${lines.join('\n')}`;
  }, []);

  const responsibilityViews = useMemo(() => {
    const seen = new Set<string>();
    const items = [{ key: 'all', label: 'همه رکوردها' }];
    responsibilities.forEach((item: any) => {
      const moduleId = String(item?.module_id || '').trim();
      if (!moduleId || seen.has(moduleId)) return;
      seen.add(moduleId);
      items.push({
        key: moduleId,
        label: MODULES[moduleId]?.titles?.fa || moduleId,
      });
    });
    return items;
  }, [responsibilities]);
  const filteredResponsibilities = useMemo(() => (
    [...(
      responsibilityViewKey === 'all'
        ? responsibilities
        : responsibilities.filter((item: any) => String(item?.module_id || '') === responsibilityViewKey)
    )].sort((a: any, b: any) => {
      const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return responsibilitySortDirection === 'asc' ? -1 : 1;
      if (Number.isNaN(bTime)) return responsibilitySortDirection === 'asc' ? 1 : -1;
      return responsibilitySortDirection === 'asc' ? aTime - bTime : bTime - aTime;
    })
  ), [responsibilities, responsibilitySortDirection, responsibilityViewKey]);
  useEffect(() => {
    if (responsibilityViewKey === 'all') return;
    if (responsibilityViews.some((view) => view.key === responsibilityViewKey)) return;
    setResponsibilityViewKey('all');
  }, [responsibilityViewKey, responsibilityViews]);
  const openPreviewRecord = useCallback((moduleId: string, recordId: string, label?: string) => {
    if (!moduleId || !recordId) return;
    setPreviewRecord({ moduleId, recordId, label });
  }, []);
  const taskProcessTarget = useMemo(() => {
    if (!taskProcessModalTask) return null;
    const relatedModuleId = String(taskProcessModalTask?.related_to_module || '').trim();
    const relatedRecordId =
      taskProcessModalTask?.related_production_order
      || taskProcessModalTask?.project_id
      || taskProcessModalTask?.marketing_lead_id
      || taskProcessModalTask?.related_customer
      || taskProcessModalTask?.related_invoice
      || taskProcessModalTask?.purchase_invoice_id;
    if (!relatedModuleId || !relatedRecordId) return null;
    return {
      moduleId: relatedModuleId,
      recordId: String(relatedRecordId),
      lineId: taskProcessModalTask?.production_line_id ? String(taskProcessModalTask.production_line_id) : null,
    };
  }, [taskProcessModalTask]);
  const badgeColor = 'rgb(var(--brand-500-rgb))';
  const overlaySource = useMemo(() => `notifications:${variant}`, [variant]);
  const drawerHeaderStyle = useMemo<React.CSSProperties>(() => ({
    background: 'rgb(var(--app-dark-surface-rgb))',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#fff',
  }), []);
  const desktopDrawerBodyStyle = useMemo<React.CSSProperties>(() => ({
    padding: 0,
  }), []);
  const mobileDrawerBodyStyle = useMemo<React.CSSProperties>(() => ({
    padding: 0,
    overflow: 'hidden',
    background: 'transparent',
  }), []);
  const drawerContentStyle = useMemo<React.CSSProperties>(() => ({
    overflow: 'hidden',
  }), []);
  function scrollNotesToBottom(behavior: ScrollBehavior = 'auto') {
    const node = notesScrollContainerRef.current;
    if (!node) return;
    if (behavior === 'auto') {
      node.scrollTop = node.scrollHeight;
      return;
    }
    if (typeof window === 'undefined') {
      node.scrollTop = node.scrollHeight;
      return;
    }
    window.requestAnimationFrame(() => {
      const currentNode = notesScrollContainerRef.current;
      if (!currentNode) return;
      currentNode.scrollTo({ top: currentNode.scrollHeight, behavior });
    });
  }
  function scrollBotMessagesToBottom(behavior: ScrollBehavior = 'auto') {
    const node = botMessagesScrollContainerRef.current;
    if (!node) return;
    if (behavior === 'auto') {
      node.scrollTop = node.scrollHeight;
      return;
    }
    if (typeof window === 'undefined') {
      node.scrollTop = node.scrollHeight;
      return;
    }
    window.requestAnimationFrame(() => {
      const currentNode = botMessagesScrollContainerRef.current;
      if (!currentNode) return;
      currentNode.scrollTo({ top: currentNode.scrollHeight, behavior });
    });
  }
  const scrollConversationToAnchor = useCallback((
    container: HTMLDivElement | null,
    domId: string | null | undefined,
    fallback: 'bottom' | 'none' = 'bottom',
  ) => {
    if (!container) return false;
    const normalizedId = String(domId || '').trim();
    if (!normalizedId) {
      if (fallback === 'bottom') {
        container.scrollTop = container.scrollHeight;
        return true;
      }
      return false;
    }
    if (typeof document === 'undefined') {
      if (fallback === 'bottom') container.scrollTop = container.scrollHeight;
      return false;
    }
    const target = document.getElementById(normalizedId);
    if (!target) {
      if (fallback === 'bottom') {
        container.scrollTop = container.scrollHeight;
        return true;
      }
      return false;
    }
    target.scrollIntoView({ behavior: 'auto', block: 'center' });
    return true;
  }, []);
  const scrollMessageIntoView = useCallback((domId: string) => {
    if (typeof document === 'undefined') return;
    const normalizedId = String(domId || '').trim();
    if (!normalizedId) return;
    const target = document.getElementById(normalizedId);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('ring-2', 'ring-red-400', 'rounded-2xl');
    window.setTimeout(() => {
      target.classList.remove('ring-2', 'ring-red-400', 'rounded-2xl');
    }, 1400);
  }, []);
  const markCommunicationReadCursor = useCallback(async (
    channel: 'internal' | 'bot',
    conversationKey: string,
    rows: Array<{ id?: unknown; created_at?: unknown }>,
  ) => {
    const latest = rows.reduce<{ id: string; createdAt: string; createdAtMs: number } | null>((result, row) => {
      const id = String(row?.id || '').trim();
      const createdAt = String(row?.created_at || '').trim();
      const createdAtMs = new Date(createdAt).getTime();
      if (!id || !createdAt || !Number.isFinite(createdAtMs)) return result;
      if (!result || createdAtMs > result.createdAtMs || (createdAtMs === result.createdAtMs && id > result.id)) {
        return { id, createdAt, createdAtMs };
      }
      return result;
    }, null);
    if (!latest) return false;
    const { data, error } = await supabase.rpc('mark_communication_read', {
      p_channel: channel,
      p_conversation_key: conversationKey,
      p_read_through_at: latest.createdAt,
      p_read_through_id: latest.id,
    });
    if (error) {
      if (!isMissingRpcError(error)) {
        console.warn('Could not persist communication read cursor', error);
      }
      return false;
    }
    return data !== false;
  }, []);
  const markNotesAsSeen = useCallback((rows: any[]) => {
    const currentUserId = String(profile.id || '').trim();
    if (!currentUserId || !Array.isArray(rows) || rows.length === 0) return;
    const readableRows = rows.filter((note: any) => {
        const id = String(note?.id || '').trim();
        const authorId = String(note?.author_id || '').trim();
        return (
          id
          && authorId !== currentUserId
          && !isNotificationRead('notes', 'note', id, seenNoteIds.has(id))
        );
      });
    if (readableRows.length === 0) return;

    const readableIds = new Set(readableRows.map((note: any) => String(note.id)));

    // Low-priority: seenNoteIds change triggers a full re-render of the panel.
    // Wrapping in startTransition lets scroll/input events take priority first.
    startTransition(() => {
      setSeenNoteIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        readableIds.forEach((id) => {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    });

    const readEntries = Array.from(readableIds).map((sourceId) => ({ section: 'notes' as const, sourceType: 'note', sourceId }));
    const shouldUseCursor = (
      selectedConversationReadModel === 'cursor'
      && Boolean(selectedConversationKey)
      && selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID
      && readableRows.every((note: any) => !isSystemNote(note))
    );
    if (shouldUseCursor && selectedConversationKey) {
      void markCommunicationReadCursor('internal', selectedConversationKey, readableRows).then((persisted) => {
        if (!persisted) {
          markNotificationEntriesRead(readEntries);
        }
        if (noteConversationSummaryAvailable) {
          debouncedRefreshNoteConversationSummaries();
        }
      });
    } else {
      markNotificationEntriesRead(readEntries);
      if (noteConversationSummaryAvailable) {
        debouncedRefreshNoteConversationSummaries();
      }
    }
    if (selectedNoteUserId) {
      patchLocalNoteConversationSummary(selectedNoteUserId, { unreadCount: 0 });
    }
  }, [debouncedRefreshNoteConversationSummaries, isNotificationRead, markCommunicationReadCursor, markNotificationEntriesRead, noteConversationSummaryAvailable, patchLocalNoteConversationSummary, profile.id, seenNoteIds, selectedConversationKey, selectedConversationReadModel, selectedNoteUserId]);

  const markBotMessagesAsSeen = useCallback((rows: CounterpartyBotMessageRow[]) => {
    const unreadInboundRows = rows.filter((row) => {
      const id = String(row?.id || '').trim();
      return (
        String(row?.direction || '').trim() === 'inbound'
        && isUuidValue(id)
        && !isNotificationRead('bot_messages', 'counterparty_bot_message', id, seenBotMessageIds.has(id))
      );
    });
    const unreadInboundIds = unreadInboundRows.map((row) => String(row.id).trim());
    if (unreadInboundIds.length > 0) {
      startTransition(() => {
        setSeenBotMessageIds((prev) => {
          let changed = false;
          const next = new Set(prev);
          unreadInboundIds.forEach((id) => {
            if (!next.has(id)) {
              next.add(id);
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      });
      const readEntries = unreadInboundIds.map((sourceId) => ({ section: 'bot_messages' as const, sourceType: 'counterparty_bot_message', sourceId }));
      if (botReadModel === 'cursor' && selectedBotGroupId) {
        void markCommunicationReadCursor('bot', `bot:${selectedBotGroupId}`, unreadInboundRows).then((persisted) => {
          if (!persisted) {
            markNotificationEntriesRead(readEntries);
          }
          if (botConversationSummaryAvailable) {
            debouncedRefreshBotConversationSummaries();
          }
        });
      } else {
        markNotificationEntriesRead(readEntries);
        if (botConversationSummaryAvailable) {
          debouncedRefreshBotConversationSummaries();
        }
      }
      if (selectedBotGroupId) {
        patchLocalBotConversationSummary(selectedBotGroupId, { unreadCount: 0 });
      }
    }
  }, [botConversationSummaryAvailable, botReadModel, debouncedRefreshBotConversationSummaries, isNotificationRead, markCommunicationReadCursor, markNotificationEntriesRead, patchLocalBotConversationSummary, seenBotMessageIds, selectedBotGroupId]);

  const markTasksAsSeen = useCallback((rows: any[]) => {
    const taskIds = (rows || [])
      .map((row) => String(row?.id || '').trim())
      .filter((id) => id && !isNotificationRead('tasks', 'task', id, seenTaskIds.has(id)));
    if (taskIds.length === 0) return;
    startTransition(() => { setSeenTaskIds((prev) => new Set([...prev, ...taskIds])); });
    markNotificationEntriesRead(taskIds.map((sourceId) => ({ section: 'tasks' as const, sourceType: 'task', sourceId })));
  }, [isNotificationRead, markNotificationEntriesRead, seenTaskIds]);

  const markResponsibilitiesAsSeen = useCallback((rows: any[]) => {
    const entries = (rows || [])
      .map((row) => {
        const sourceId = String(row?.id || '').trim();
        const sourceType = getResponsibilitySourceType(row);
        if (!sourceId || !sourceType) return null;
        if (isNotificationRead('responsibilities', sourceType, sourceId, seenResponsibilityIds.has(sourceId))) return null;
        return { section: 'responsibilities' as const, sourceType, sourceId };
      })
      .filter(Boolean) as NotificationStateEntryInput[];
    if (entries.length === 0) return;
    startTransition(() => { setSeenResponsibilityIds((prev) => new Set([...prev, ...entries.map((entry) => entry.sourceId)])); });
    markNotificationEntriesRead(entries);
  }, [isNotificationRead, markNotificationEntriesRead, seenResponsibilityIds]);

  const markSmsMessagesAsSeen = useCallback((rows: any[]) => {
    const messageIds = (rows || [])
      .filter((row) => String(row?.direction || '').trim() === 'inbound')
      .map((row) => String(row?.id || '').trim())
      .filter((id) => id && !isNotificationRead('sms_messages', 'inbound_sms', id, false));
    if (messageIds.length === 0) return;
    startTransition(() => { setSeenSmsMessageIds((prev) => new Set([...prev, ...messageIds])); });
    markNotificationEntriesRead(messageIds.map((sourceId) => ({ section: 'sms_messages' as const, sourceType: 'inbound_sms', sourceId })));
  }, [isNotificationRead, markNotificationEntriesRead, seenSmsMessageIds]);

  const markVoipCallsAsSeen = useCallback((rows: any[]) => {
    const callIds = (rows || [])
      .filter((row) => String(row?.direction || '').trim() === 'incoming')
      .map((row) => String(row?.id || '').trim())
      .filter((id) => id && !isNotificationRead('voip_calls', 'voip_call', id, seenVoipCallIds.has(id)));
    if (callIds.length === 0) return;
    startTransition(() => { setSeenVoipCallIds((prev) => new Set([...prev, ...callIds])); });
    markNotificationEntriesRead(callIds.map((sourceId) => ({ section: 'voip_calls' as const, sourceType: 'voip_call', sourceId })));
  }, [isNotificationRead, markNotificationEntriesRead, seenVoipCallIds]);
  const handleNotesScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    noteShouldStickToBottomRef.current = distanceToBottom <= 80;
    if (distanceToBottom <= 80) {
      setNoteNewIncomingCount(0);
    }
  }, []);
  const handleBotMessagesScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    botShouldStickToBottomRef.current = distanceToBottom <= 80;
    if (distanceToBottom <= 80) {
      setBotNewIncomingCount(0);
      markBotMessagesAsSeen(botMessages);
    }
  }, [botMessages, markBotMessagesAsSeen]);

  const captureDrawerCloseSnapshot = useCallback(() => {
    drawerCloseSnapshotRef.current = {
      variant,
      activeDrawerSection,
      selectedNoteUserId,
      selectedBotGroupId,
      displayedChatNotes,
      botMessages,
      displayedSmsMessages,
      tasks,
      responsibilities,
      displayedVoipCalls,
    };
  }, [activeDrawerSection, botMessages, displayedChatNotes, displayedSmsMessages, displayedVoipCalls, responsibilities, selectedBotGroupId, selectedNoteUserId, tasks, variant]);

  const handleClose = useCallback(() => {
    mobileDrawerHistoryActiveRef.current = false;
    captureDrawerCloseSnapshot();
    setOpen(false);
  }, [captureDrawerCloseSnapshot]);

  const finalizeDrawerClose = useCallback(() => {
    const snapshot = drawerCloseSnapshotRef.current;
    drawerCloseSnapshotRef.current = null;
    if (!snapshot) {
      onClosed?.();
      return;
    }

    // Reset lightweight UI state immediately
    setMobileNoteSearchOpen(false);
    setMobileBotSearchOpen(false);
    setNoteMessageSearch('');
    setNoteMessageSearchOpen(false);
    setForwardingNote(null);
    setForwardTargetUserIds([]);
    setNoteNewIncomingCount(0);
    setBotNewIncomingCount(0);
    setPreviewRecord(null);
    setTaskProcessModalTask(null);

    // Defer heavy mark-as-seen work so the drawer close animation finishes first
    // and weak devices don't freeze on the close gesture
    window.setTimeout(() => {
      if (snapshot.variant === 'chat') {
        if (snapshot.activeDrawerSection === 'notes' && snapshot.selectedNoteUserId) {
          markNotesAsSeen(snapshot.displayedChatNotes);
        }
        if (snapshot.activeDrawerSection === 'bot_messages' && snapshot.selectedBotGroupId) {
          markBotMessagesAsSeen(snapshot.botMessages);
        }
        if (snapshot.activeDrawerSection === 'sms_messages') {
          markSmsMessagesAsSeen(snapshot.displayedSmsMessages);
        }
      } else {
        if (snapshot.activeDrawerSection === 'tasks') {
          markTasksAsSeen(snapshot.tasks);
        }
        if (snapshot.activeDrawerSection === 'responsibilities') {
          markResponsibilitiesAsSeen(snapshot.responsibilities);
        }
        if (snapshot.activeDrawerSection === 'voip_calls') {
          markVoipCallsAsSeen(snapshot.displayedVoipCalls);
        }
      }
      onClosed?.();
    }, 80);
  }, [markBotMessagesAsSeen, markNotesAsSeen, markResponsibilitiesAsSeen, markSmsMessagesAsSeen, markTasksAsSeen, markVoipCallsAsSeen, onClosed]);

  useEffect(() => {
    // Note: do NOT clear selectedConversationNotes here — the hook manages its own state
    // and may have already loaded cached data for the new conversation. Clearing here causes
    // a flash to empty even when cache is available.
    setNoteViewportReady(false);
    setMyNotesDisplayLimit(15);
    setNoteMessageSearch('');
    setNoteMessageSearchOpen(false);
    noteShouldStickToBottomRef.current = false;
    noteForceScrollToBottomRef.current = false;
    noteInitialAnchorDoneRef.current = false;
    setNoteNewIncomingCount(0);
    noteConversationKeyRef.current = null;
    noteConversationMessageIdsRef.current = new Set();
  }, [selectedNoteUserId]);

  useEffect(() => {
    setBotViewportReady(!selectedBotGroupId);
    // Mark as loading immediately so the viewport init useLayoutEffect waits for real data
    if (selectedBotGroupId) setLoadingBotMessages(true);
    botShouldStickToBottomRef.current = false;
    botForceScrollToBottomRef.current = false;
    botInitialAnchorDoneRef.current = false;
    setBotNewIncomingCount(0);
    botConversationKeyRef.current = null;
    botConversationMessageIdsRef.current = new Set();
    setBotMessages([]);
    botMessagesRef.current = [];
    botMessagesGroupIdRef.current = null;
  }, [selectedBotGroupId]);

  useLayoutEffect(() => {
    if (!open || activeDrawerSection !== 'notes') return;
    if (!isSelectedConversationLoaded) return;
    // Initial anchor scroll is handled inside NotesPanel via msgVirtualizer.scrollToIndex.
    // NotesPanel calls setNoteViewportReady(true) when done.
    if (!noteViewportReady) return;
    // Preserve scroll position after loading older messages.
    // Only consume the saved height when the container actually grew — if a
    // realtime update fires first (diff≤0), keep the ref so the real loadOlder
    // update can still restore correctly.
    if (pendingNoteScrollRestoreRef.current !== null) {
      const savedScrollHeight = pendingNoteScrollRestoreRef.current;
      const container = notesScrollContainerRef.current;
      if (container) {
        const diff = container.scrollHeight - savedScrollHeight;
        if (diff > 0) {
          pendingNoteScrollRestoreRef.current = null;
          container.scrollTop += diff;
          return;
        }
      }
    }
    const shouldForceScroll = noteForceScrollToBottomRef.current;
    if (!shouldForceScroll && !noteShouldStickToBottomRef.current) return;
    // Use 'auto' (instant) on the very first scroll so the chat doesn't animate from top to bottom
    const noteBehavior = shouldForceScroll || !noteInitialAnchorDoneRef.current ? 'auto' : 'smooth';
    noteInitialAnchorDoneRef.current = true;
    scrollNotesToBottom(noteBehavior);
    noteForceScrollToBottomRef.current = false;
  }, [activeDrawerSection, displayedChatNotes, isSelectedConversationLoaded, noteViewportReady, open]);

  useEffect(() => {
    if (!open || activeDrawerSection !== 'notes') return;
    if (!noteViewportReady) return;
    const unreadLikeEntries = noteLikeNotifications
      .filter((item) => !isNotificationRead('notes', 'note_like', String(item?.source_id || ''), false))
      .map((item) => ({ section: 'notes' as const, sourceType: 'note_like', sourceId: String(item.source_id || '') }))
      .filter((item) => item.sourceId);
    markNotificationEntriesRead(unreadLikeEntries);
    // Auto-mark system/workflow notes as read — these are informational and don't require user action
    const currentUserId = String(profile.id || '').trim();
    const systemNotes = notes.filter((note: any) => (
      isSystemNote(note)
      && String(note?.author_id || '').trim() !== currentUserId
      && !isNotificationRead('notes', 'note', String(note?.id || ''), seenNoteIds.has(String(note?.id || '')))
    ));
    if (systemNotes.length > 0) {
      markNotesAsSeen(systemNotes);
    }
    if (!selectedNoteUserId) return;
    markNotesAsSeen(displayedChatNotes);
  }, [activeDrawerSection, displayedChatNotes, isNotificationRead, markNotificationEntriesRead, markNotesAsSeen, noteLikeNotifications, noteViewportReady, notes, open, profile.id, seenNoteIds, selectedNoteUserId]);

  useLayoutEffect(() => {
    if (!open || activeDrawerSection !== 'bot_messages') return;
    if (loadingBotMessages) return;
    if (!botViewportReady) {
      const scrolledToUnread = scrollConversationToAnchor(
        botMessagesScrollContainerRef.current,
        firstUnreadBotMessageDomId,
        'bottom',
      );
      botInitialAnchorDoneRef.current = true;
      botShouldStickToBottomRef.current = !scrolledToUnread || !firstUnreadBotMessageDomId;
      botForceScrollToBottomRef.current = false;
      setBotViewportReady(true);
      return;
    }
    // Preserve scroll position after loading older messages
    if (pendingBotScrollRestoreRef.current !== null) {
      const savedScrollHeight = pendingBotScrollRestoreRef.current;
      pendingBotScrollRestoreRef.current = null;
      const container = botMessagesScrollContainerRef.current;
      if (container) {
        const diff = container.scrollHeight - savedScrollHeight;
        if (diff > 0) {
          container.scrollTop += diff;
          return;
        }
      }
    }
    const shouldForceScroll = botForceScrollToBottomRef.current;
    if (!shouldForceScroll && !botShouldStickToBottomRef.current) return;
    // Use 'auto' (instant) on the very first scroll so the chat doesn't animate from old to new messages
    const botBehavior = shouldForceScroll || !botInitialAnchorDoneRef.current ? 'auto' : 'smooth';
    botInitialAnchorDoneRef.current = true;
    scrollBotMessagesToBottom(botBehavior);
    botForceScrollToBottomRef.current = false;
  }, [activeDrawerSection, botMessages, botViewportReady, firstUnreadBotMessageDomId, loadingBotMessages, open, scrollConversationToAnchor, selectedBotGroupId]);

  useEffect(() => {
    if (!open || activeDrawerSection !== 'bot_messages') return;
    if (!botViewportReady) return;
    if (!selectedBotGroupId) return;
    markBotMessagesAsSeen(botMessages);
  }, [activeDrawerSection, botMessages, botViewportReady, markBotMessagesAsSeen, open, selectedBotGroupId]);

  useEffect(() => {
    if (!open || activeDrawerSection !== 'sms_messages') return;
    markSmsMessagesAsSeen(displayedSmsMessages);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const node = smsMessagesScrollContainerRef.current;
        if (node) node.scrollTop = node.scrollHeight;
      });
    }
  }, [activeDrawerSection, displayedSmsMessages, markSmsMessagesAsSeen, open]);

  useEffect(() => {
    if (!open) return;
    if (activeDrawerSection === 'tasks') {
      markTasksAsSeen(tasks);
      return;
    }
    if (activeDrawerSection === 'responsibilities') {
      markResponsibilitiesAsSeen(responsibilities);
      return;
    }
    if (variant === 'chat' && activeDrawerSection === 'voip_calls') {
      markVoipCallsAsSeen(displayedVoipCalls);
    }
  }, [activeDrawerSection, displayedVoipCalls, markResponsibilitiesAsSeen, markTasksAsSeen, markVoipCallsAsSeen, open, responsibilities, tasks, variant]);

  useEffect(() => {
    const currentUserId = String(profile.id || '').trim();
    const conversationKey = selectedNoteUserId && selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID
      ? (selectedChatGroupId ? `group:${selectedChatGroupId}` : `direct:${selectedNoteUserId}`)
      : null;
    const messageIds = new Set(
      displayedChatNotes
        .map((note: any) => String(note?.id || '').trim())
        .filter(Boolean)
    );
    const isActiveConversation = Boolean(open && activeDrawerSection === 'notes' && conversationKey);

    if (!isActiveConversation || !conversationKey) {
      noteConversationKeyRef.current = conversationKey;
      noteConversationMessageIdsRef.current = messageIds;
      setNoteNewIncomingCount(0);
      return;
    }

    if (noteConversationKeyRef.current !== conversationKey) {
      noteConversationKeyRef.current = conversationKey;
      noteConversationMessageIdsRef.current = messageIds;
      setNoteNewIncomingCount(0);
      return;
    }

    const previousIds = noteConversationMessageIdsRef.current;
    const incomingCount = displayedChatNotes.filter((note: any) => {
      const noteId = String(note?.id || '').trim();
      if (!noteId || previousIds.has(noteId)) return false;
      const authorId = String(note?.author_id || '').trim();
      return Boolean(authorId && authorId !== currentUserId);
    }).length;

    noteConversationMessageIdsRef.current = messageIds;
    if (incomingCount > 0 && !noteShouldStickToBottomRef.current) {
      setNoteNewIncomingCount((prev) => prev + incomingCount);
    }
  }, [activeDrawerSection, displayedChatNotes, open, profile.id, selectedChatGroupId, selectedNoteUserId]);

  useEffect(() => {
    const conversationKey = selectedBotGroupId ? `bot:${selectedBotGroupId}` : null;
    const messageIds = new Set(
      botMessages
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean)
    );
    const isActiveConversation = Boolean(open && activeDrawerSection === 'bot_messages' && conversationKey);

    if (!isActiveConversation || !conversationKey) {
      botConversationKeyRef.current = conversationKey;
      botConversationMessageIdsRef.current = messageIds;
      setBotNewIncomingCount(0);
      return;
    }

    if (botConversationKeyRef.current !== conversationKey) {
      botConversationKeyRef.current = conversationKey;
      botConversationMessageIdsRef.current = messageIds;
      setBotNewIncomingCount(0);
      return;
    }

    const previousIds = botConversationMessageIdsRef.current;
    const incomingCount = botMessages.filter((row) => {
      const rowId = String(row?.id || '').trim();
      if (!rowId || previousIds.has(rowId)) return false;
      return String(row?.direction || '').trim() === 'inbound';
    }).length;

    botConversationMessageIdsRef.current = messageIds;
    if (incomingCount > 0 && !botShouldStickToBottomRef.current) {
      setBotNewIncomingCount((prev) => prev + incomingCount);
    }
  }, [activeDrawerSection, botMessages, open, selectedBotGroupId]);

  const playNotificationChime = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!audioInteractionUnlockedRef.current) return;
    const now = Date.now();
    const soundWindow = notificationSoundWindowRef.current;
    if (now - soundWindow.startedAt > 12000) {
      soundWindow.startedAt = now;
      soundWindow.plays = 0;
    }
    if (soundWindow.plays >= 2) return;

    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const audioContext = new AudioContextCtor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const startedAt = audioContext.currentTime;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, startedAt);
      oscillator.frequency.exponentialRampToValueAtTime(660, startedAt + 0.18);
      gain.gain.setValueAtTime(0.0001, startedAt);
      gain.gain.exponentialRampToValueAtTime(0.012, startedAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.28);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + 0.3);
      oscillator.onended = () => {
        void audioContext.close().catch(() => undefined);
      };
      soundWindow.plays += 1;
    } catch {
      // Ignore autoplay/audio context failures.
    }
  }, []);

  const requestDrawerClose = useCallback(() => {
    handleClose();
    if (
      isMobile
      && open
      && mobileDrawerHistoryActiveRef.current
      && typeof window !== 'undefined'
    ) {
      skipNextDrawerPopStateRef.current = true;
      mobileDrawerHistoryActiveRef.current = false;
      window.history.back();
    }
  }, [handleClose, isMobile, open]);

  useEffect(() => {
    if (!isMobile || !open || typeof window === 'undefined') return;
    if (!mobileDrawerHistoryActiveRef.current) {
      window.history.pushState({ notificationsDrawer: true }, '', window.location.href);
      mobileDrawerHistoryActiveRef.current = true;
    }

    const handlePopState = () => {
      if (skipNextDrawerPopStateRef.current) {
        skipNextDrawerPopStateRef.current = false;
        return;
      }
      if (!mobileDrawerHistoryActiveRef.current) return;
      mobileDrawerHistoryActiveRef.current = false;
      handleClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!open) {
        mobileDrawerHistoryActiveRef.current = false;
      }
    };
  }, [handleClose, isMobile, open]);

  const handleNoteTextChange = useCallback((nextValue: string) => {
    setNoteText(nextValue);
  }, []);

  const handleBotMessageTextChange = useCallback((nextValue: string) => {
    setBotMessageText(nextValue);
  }, []);

  const handleTaskProducedQtyChange = async (taskId: string, value: number | null) => {
    try {
      const nextProducedQty = Math.max(0, toNumber(value));
      const { error } = await supabase
        .from('tasks')
        .update({ produced_qty: nextProducedQty })
        .eq('id', taskId);
      if (error) throw error;
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === String(taskId)
          ? { ...item, produced_qty: nextProducedQty }
          : item
      )));
    } catch (err) {
      console.warn('Could not save produced quantity for notification task', err);
    }
  };

  const getChatGroupPayload = useCallback((group: ChatGroupRow | null | undefined) => {
    if (!group) {
      return {
        mentionUserIds: [] as string[],
        mentionRoleIds: [] as string[],
        metadata: null as Record<string, any> | null,
      };
    }
    return {
      mentionUserIds: resolveGroupMemberUserIds(group).filter((id) => id !== String(profile.id || '')),
      mentionRoleIds: Array.from(new Set((group.role_ids || []).map((id) => String(id)))),
      metadata: { chat_group_id: String(group.id) },
    };
  }, [profile.id, resolveGroupMemberUserIds]);

  const parseMentionSelections = (values: string[]) => {
    const mentionUserIds = new Set<string>();
    const mentionRoleIds = new Set<string>();

    (values || []).forEach((value) => {
      const normalizedValue = String(value || '').trim();
      if (normalizedValue.startsWith('user:')) mentionUserIds.add(normalizedValue.replace('user:', ''));
      if (normalizedValue.startsWith('role:')) mentionRoleIds.add(normalizedValue.replace('role:', ''));
    });

    if (selectedNoteUserId && selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID && !selectedChatGroupId) {
      mentionUserIds.add(String(selectedNoteUserId));
    }

    return {
      mentionUserIds: Array.from(mentionUserIds),
      mentionRoleIds: Array.from(mentionRoleIds),
    };
  };

  const resetNoteComposer = () => {
    setNoteText('');
    setNoteReplyTo(null);
    setMentionValues([]);
    setNoteAttachments([]);
    setNoteLinkedAttachments([]);
    setNoteMentionPickerOpen(false);
    setNoteSmsNotificationEnabled(false);
  };

  const handleNoteScopeModuleChange = (value: string | null) => {
    setNoteModuleId(value);
    setNoteRecordId(null);
  };

  const handleNoteScopeRecordChange = (value: string | null) => {
    setNoteRecordId(value);
  };

  const submitNote = async () => {
    if (!noteText.trim() && noteAttachments.length === 0 && noteLinkedAttachments.length === 0) return;
    if (noteSending) return;

    setNoteSending(true);
    try {
      const scope = normalizeNoteScope(noteModuleId, noteRecordId);
      const renderedNoteText = noteModuleId && noteTemplateRecord
        ? await renderNotificationTemplate(noteText, noteTemplateRecord, noteModuleId)
        : noteText;
      const { mentionUserIds, mentionRoleIds } = parseMentionSelections(mentionValues);
      const groupPayload = getChatGroupPayload(selectedChatGroup);
      const attachments = noteAttachments.length > 0
        ? await uploadNoteAttachments(scope.hasLinkedRecord ? scope.module_id : null, scope.hasLinkedRecord ? scope.record_id : null, noteAttachments)
        : [];
      const mergedAttachments = [...noteLinkedAttachments, ...attachments].filter((attachment, index, all) => {
        const url = String(attachment?.url || '').trim();
        return url && all.findIndex((item) => String(item?.url || '').trim() === url) === index;
      });
      if (noteLinkedAttachments.length > 0) {
        await ensureNoteAttachmentShortcuts(scope.module_id, scope.record_id, noteLinkedAttachments);
      }

      const payload = {
        module_id: scope.module_id,
        record_id: scope.record_id,
        content: serializeNoteContent(renderedNoteText, mergedAttachments),
        reply_to: noteReplyTo || null,
        mention_user_ids: Array.from(new Set([...mentionUserIds, ...groupPayload.mentionUserIds])),
        mention_role_ids: Array.from(new Set([...mentionRoleIds, ...groupPayload.mentionRoleIds])),
        author_id: profile.id,
        author_name: directoryUserMap[String(profile.id || '')]?.display_name || null,
        metadata: groupPayload.metadata,
      };

      await insertNotesWithFallback([payload]);
      if (noteSmsNotificationEnabled) {
        await sendNoteSmsNotifications({
          authorName: String(directoryUserMap[String(profile.id || '')]?.display_name || '').trim() || 'کاربر',
          noteText: renderedNoteText,
          mentionUserIds: payload.mention_user_ids,
          mentionRoleIds: payload.mention_role_ids,
          moduleId: scope.module_id,
          recordId: scope.record_id,
        });
      }

      noteShouldStickToBottomRef.current = true;
      noteForceScrollToBottomRef.current = true;
      resetNoteComposer();
      await refreshSection('notes', { force: true });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ثبت یادداشت ناموفق بود.'));
    } finally {
      setNoteSending(false);
    }
  };

  const openForwardModal = (note: any, sourceType: 'note' | 'bot' = 'note') => {
    setForwardingNote({
      ...note,
      __forward_source_type: sourceType,
    });
    setForwardTargetUserIds(
      selectedNoteUserId && selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID
        ? [String(selectedNoteUserId)]
        : []
    );
    setForwardMessageText('');
  };

  const submitForward = async () => {
    if (!forwardingNote || forwardTargetUserIds.length === 0) return;

    const targetIds = Array.from(
      new Set(
        forwardTargetUserIds
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      )
    );

    if (targetIds.length === 0) {
      message.warning('حداقل یک گیرنده معتبر انتخاب کنید.');
      return;
    }

    const sourceType = String((forwardingNote as any)?.__forward_source_type || 'note').trim() === 'bot' ? 'bot' : 'note';
    const scope = sourceType === 'note'
      ? normalizeNoteScope(forwardingNote.module_id, forwardingNote.record_id)
      : normalizeNoteScope(null, null);
    const parsedContent = sourceType === 'note'
      ? parseNoteContent(forwardingNote.content)
      : { text: String(forwardingNote?.content_text || '').trim(), attachments: getBotMessageAttachments(forwardingNote as CounterpartyBotMessageRow) };

    const customForwardMessageText = String(forwardMessageText || '').trim();
    const baseForwardText = String(parsedContent.text || '').trim();
    const finalForwardText = customForwardMessageText
      ? [customForwardMessageText, baseForwardText].filter(Boolean).join('\n\n')
      : baseForwardText;
    const forwardedAttachments = parsedContent.attachments || [];
    const payloads = targetIds.flatMap((targetId) => {
      if (isBotGroupForwardSelection(targetId)) {
        return [];
      }
      if (isChatGroupSelection(targetId)) {
        const group = chatGroupMap[String(getChatGroupSelectionId(targetId) || '')] || null;
        if (!group) return [];
        const groupPayload = getChatGroupPayload(group);
        return [{
          module_id: scope.module_id,
          record_id: scope.record_id,
          content: serializeNoteContent(finalForwardText, forwardedAttachments),
          reply_to: null,
          mention_user_ids: groupPayload.mentionUserIds,
          mention_role_ids: groupPayload.mentionRoleIds,
          author_id: profile.id,
          author_name: directoryUserMap[String(profile.id || '')]?.display_name || null,
          metadata: groupPayload.metadata,
        }];
      }

      if (targetId === String(profile.id || '')) return [];
      return [{
        module_id: scope.module_id,
        record_id: scope.record_id,
        content: serializeNoteContent(finalForwardText, forwardedAttachments),
        reply_to: null,
        mention_user_ids: [targetId],
        mention_role_ids: [],
        author_id: profile.id,
        author_name: directoryUserMap[String(profile.id || '')]?.display_name || null,
        metadata: null,
      }];
    });

    const botTargets = targetIds
      .filter((value) => isBotGroupForwardSelection(value))
      .map((value) => String(getBotGroupForwardSelectionId(value) || '').trim())
      .filter(Boolean);

    if (payloads.length === 0 && botTargets.length === 0) {
      message.warning('حداقل یک گیرنده معتبر انتخاب کنید.');
      return;
    }

    setForwardSubmitting(true);
    try {
      if (payloads.length > 0) {
        await insertNotesWithFallback(payloads);
      }
      for (const botGroupId of botTargets) {
        const targetGroup = botGroups.find((row) => String(row.id) === botGroupId);
        if (!targetGroup) continue;
        const isRubikaTarget = String(targetGroup.channel_type || '').trim() === 'rubika';
        const forwardedAttachmentNameText = buildAttachmentNameText(forwardedAttachments);
        const rubikaTextWithPrefix = customForwardMessageText
          ? [customForwardMessageText, String(parsedContent.text || '').trim()].filter(Boolean).join('\n\n')
          : String(parsedContent.text || '').trim();
        const targetText = isRubikaTarget && forwardedAttachments.length > 0
          ? rubikaTextWithPrefix
          : finalForwardText;
        await sendTextToBotGroup(targetGroup, targetText, {
          fallbackText: isRubikaTarget && forwardedAttachments.length > 0
            ? [customForwardMessageText, String(parsedContent.text || '').trim(), forwardedAttachmentNameText].filter(Boolean).join('\n')
            : undefined,
          attachments: isRubikaTarget ? forwardedAttachments : undefined,
          payload: {
            attachments: forwardedAttachments,
            forwarded_from: {
              source_type: sourceType,
              source_id: String(forwardingNote?.id || '').trim() || null,
            },
          },
          messageType: forwardedAttachments.length > 0 ? 'file' : 'text',
        });
      }
      noteShouldStickToBottomRef.current = true;
      noteForceScrollToBottomRef.current = true;
      setForwardingNote(null);
      setForwardTargetUserIds([]);
      setForwardMessageText('');
      message.success('پیام فوروارد شد.');
      await refreshSection('notes', { force: true });
      await refreshSection('bot_messages', { force: true });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'فوروارد پیام ناموفق بود.'));
    } finally {
      setForwardSubmitting(false);
    }
  };

  const groupMemberOptions = useMemo(
    () => [
      ...directoryRoles.map((role) => ({
        label: `نقش: ${role.title}`,
        value: `role:${role.id}`,
      })),
      ...directoryUsers.map((user) => ({
        label: `عضو: ${user.display_name}`,
        value: `user:${user.id}`,
      })),
    ],
    [directoryRoles, directoryUsers]
  );

  const handleSubmitGroup = async () => {
    const trimmedName = String(groupNameDraft || '').trim();
    if (!trimmedName) {
      message.warning('نام گروه را وارد کنید.');
      return;
    }

    const userIds = Array.from(new Set(
      groupMemberDrafts
        .filter((value) => String(value || '').startsWith('user:'))
        .map((value) => String(value).replace('user:', ''))
        .filter(Boolean)
    ));
    const roleIds = Array.from(new Set(
      groupMemberDrafts
        .filter((value) => String(value || '').startsWith('role:'))
        .map((value) => String(value).replace('role:', ''))
        .filter(Boolean)
    ));

    setGroupSubmitting(true);
    try {
      if (editingGroup?.id) {
        const { data, error } = await supabase
          .from('chat_groups')
          .update({
            name: trimmedName,
            user_ids: userIds,
            role_ids: roleIds,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingGroup.id)
          .select('id, org_id, name, user_ids, role_ids, created_by, created_at, updated_at')
          .single();
        if (error) throw error;
        const nextGroup: ChatGroupRow = {
          id: String(data?.id || editingGroup.id),
          org_id: data?.org_id ? String(data.org_id) : null,
          name: String(data?.name || trimmedName),
          user_ids: Array.isArray(data?.user_ids) ? data.user_ids.map((id: any) => String(id)) : userIds,
          role_ids: Array.isArray(data?.role_ids) ? data.role_ids.map((id: any) => String(id)) : roleIds,
          created_by: data?.created_by ? String(data.created_by) : editingGroup.created_by,
          created_at: data?.created_at ? String(data.created_at) : editingGroup.created_at,
          updated_at: data?.updated_at ? String(data.updated_at) : new Date().toISOString(),
        };
        setChatGroups((prev) => prev.map((group) => group.id === nextGroup.id ? nextGroup : group));
        setSelectedNoteUserId(`${CHAT_GROUP_PREFIX}${nextGroup.id}`);
      } else {
        const { data, error } = await supabase
          .from('chat_groups')
          .insert([{
            name: trimmedName,
            user_ids: userIds,
            role_ids: roleIds,
            created_by: profile.id,
          }])
          .select('id, org_id, name, user_ids, role_ids, created_by, created_at, updated_at')
          .single();
        if (error) throw error;
        const nextGroup: ChatGroupRow = {
          id: String(data?.id || ''),
          org_id: data?.org_id ? String(data.org_id) : null,
          name: String(data?.name || trimmedName),
          user_ids: Array.isArray(data?.user_ids) ? data.user_ids.map((id: any) => String(id)) : userIds,
          role_ids: Array.isArray(data?.role_ids) ? data.role_ids.map((id: any) => String(id)) : roleIds,
          created_by: data?.created_by ? String(data.created_by) : String(profile.id || ''),
          created_at: data?.created_at ? String(data.created_at) : null,
          updated_at: data?.updated_at ? String(data.updated_at) : null,
        };
        setChatGroups((prev) => [nextGroup, ...prev]);
        setSelectedNoteUserId(`${CHAT_GROUP_PREFIX}${nextGroup.id}`);
      }

      setGroupModalOpen(false);
      setEditingGroup(null);
      setGroupNameDraft('');
      setGroupMemberDrafts([]);
      message.success(editingGroup ? 'گروه ویرایش شد.' : 'گروه ایجاد شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره گروه ناموفق بود.'));
    } finally {
      setGroupSubmitting(false);
    }
  };

  const resolveDirectConversationTargetUserId = useCallback((note: any) => {
    const currentUserId = String(profile.id || '');
    if (!currentUserId || !note) return null;
    const authorId = String(note?.author_id || '').trim();
    if (authorId && authorId !== currentUserId) return authorId;
    const mentioned = getNoteMentionUserIds(note).find((id: string) => String(id) !== currentUserId);
    if (mentioned) return String(mentioned);
    const replyTarget = note?.reply_to ? noteLookup.get(String(note.reply_to)) : null;
    const replyAuthorId = String(replyTarget?.author_id || '').trim();
    return replyAuthorId && replyAuthorId !== currentUserId ? replyAuthorId : null;
  }, [noteLookup, profile.id]);

  useEffect(() => {
    const currentNoteIds = new Set(notes.map((note: any) => String(note?.id || '')).filter(Boolean));
    const currentTaskIds = new Set(tasks.map((task: any) => String(task?.id || '')).filter(Boolean));
    const currentResponsibilityIds = new Set(responsibilities.map((item: any) => String(item?.id || '')).filter(Boolean));
    const currentBotMessageIds = new Set(
      botNotificationMessages
        .filter((row) => String(row?.direction || '') === 'inbound')
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean)
    );
    const currentSmsMessageIds = new Set(
      smsMessages
        .filter((row: any) => String(row?.direction || '') === 'inbound')
        .map((row: any) => String(row?.id || '').trim())
        .filter(Boolean)
    );
    const currentVoipCallIds = new Set(
      voipCalls
        .filter((row) => String(row?.direction || '') === 'incoming')
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean)
    );

    if (!notificationsReadyRef.current) {
      prevNotesRef.current = currentNoteIds;
      prevTasksRef.current = currentTaskIds;
      prevResponsibilitiesRef.current = currentResponsibilityIds;
      prevBotMessageIdsRef.current = currentBotMessageIds;
      prevSmsMessageIdsRef.current = currentSmsMessageIds;
      prevVoipCallIdsRef.current = currentVoipCallIds;
      if (currentNoteIds.size > 0 || currentTaskIds.size > 0 || currentResponsibilityIds.size > 0 || currentBotMessageIds.size > 0 || currentSmsMessageIds.size > 0 || currentVoipCallIds.size > 0) {
        notificationsReadyRef.current = true;
      }
      return;
    }

    const newNotifications: UiNotificationItem[] = [
      ...notes
        .filter((note: any) => {
          const noteId = String(note?.id || '');
          return (
            noteId
            && !isSystemNote(note)
            && !prevNotesRef.current.has(noteId)
            && !isNotificationRead('notes', 'note', noteId, seenNoteIds.has(noteId))
            && String(note?.author_id || '').trim() !== String(profile.id || '')
            && !dismissedUiNotificationIds.has(`note:${noteId}`)
            && !isNotificationDismissed('notes', 'note', noteId)
          );
        })
        .map((note: any) => {
          const parsed = parseNoteContent(note.content);
          const groupId = String(note?.metadata?.chat_group_id || '').trim();
          const group = groupId ? chatGroupMap[groupId] : null;
          const directUserId = resolveDirectConversationTargetUserId(note);
          const directUser = directUserId ? directoryUserMap[directUserId] : null;
          const aiNote = isAiNote(note);
          return {
            id: `note:${String(note.id)}`,
            kind: aiNote ? 'assistant' as const : 'note' as const,
            title: group?.name || directUser?.display_name || note.author_name || 'پیام جدید',
            body: parsed.text || (parsed.attachments.length > 0 ? 'فایل جدید ارسال شد' : 'پیام جدید'),
            createdAt: note.created_at || null,
            hasAttachments: parsed.attachments.length > 0,
            note,
            kindLabel: aiNote ? 'هوش مصنوعی' : undefined,
          };
        }),
      ...tasks
        .filter((task: any) => {
          const taskId = String(task?.id || '');
          return (
            taskId
            && !prevTasksRef.current.has(taskId)
            && !isNotificationRead('tasks', 'task', taskId, seenTaskIds.has(taskId))
            && !dismissedUiNotificationIds.has(`task:${taskId}`)
            && !isNotificationDismissed('tasks', 'task', taskId)
          );
        })
        .map((task: any) => {
          const localizedStatus = getTaskStatusLabel(task?.status, task, statusOptions) || resolveStatusLabelFallback(task?.status);
          return {
            id: `task:${String(task.id)}`,
            kind: 'task' as const,
            title: task.name || 'فعالیت جدید',
            body: String(task.description || (localizedStatus ? `وضعیت: ${localizedStatus}` : 'به شما ارجاع شده است.')),
            createdAt: task.created_at || null,
            task,
          };
        }),
      ...responsibilities
        .filter((item: any) => {
          const responsibilityId = String(item?.id || '');
          return (
            responsibilityId
            && !prevResponsibilitiesRef.current.has(responsibilityId)
            && !isNotificationRead('responsibilities', getResponsibilitySourceType(item), responsibilityId, seenResponsibilityIds.has(responsibilityId))
            && !dismissedUiNotificationIds.has(`responsibility:${responsibilityId}`)
            && !isNotificationDismissed('responsibilities', getResponsibilitySourceType(item), responsibilityId)
          );
        })
        .map((item: any) => ({
          id: `responsibility:${String(item.id)}`,
          kind: 'responsibility' as const,
          title: formatRecordLabel(item, item?.module_id) || 'مسئولیت جدید',
          body: MODULES[String(item?.module_id || '')]?.titles?.faSingular || 'رکورد جدید نیاز به رسیدگی دارد.',
          createdAt: item.created_at || null,
          responsibility: item,
        })),
      ...botNotificationMessages
        .filter((row) => {
          const id = String(row?.id || '').trim();
          if (!id) return false;
          if (String(row?.direction || '') !== 'inbound') return false;
          return !prevBotMessageIdsRef.current.has(id)
            && !dismissedUiNotificationIds.has(`bot:${id}`)
            && !isNotificationRead('bot_messages', 'counterparty_bot_message', id, seenBotMessageIds.has(id))
            && !isNotificationDismissed('bot_messages', 'counterparty_bot_message', id);
        })
        .map((row) => {
          const dedupeKey = getBotMessageOverlayDedupeKey(row);
          const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
          const sender = String((payload as any)?.sender_display_name || '').trim()
            || String((payload as any)?.sender_id || '').trim()
            || String((payload as any)?.username || '').trim()
            || 'کاربر گروه';
          const group = botGroups.find((item) => String(item.id) === String(row.bot_group_id || ''));
          const title = String(group?.group_title || '').trim() || String(group?.counterparty_label || '').trim() || 'پیام جدید بات';
          const body = String(row?.content_text || '').trim() || (row?.file_name ? `فایل: ${row.file_name}` : 'پیام جدید');
          return {
            id: `bot:${String(row.id)}`,
            dedupeKey,
            kind: 'bot' as const,
            title: `${title} - ${sender}`,
            body,
            createdAt: row.created_at || null,
            hasAttachments: Boolean(row?.file_url || row?.file_name),
            botMessage: row,
            botGroupId: row.bot_group_id || null,
          };
        }),
      ...smsMessages
        .filter((row: any) => {
          const id = String(row?.id || '').trim();
          if (!id) return false;
          if (String(row?.direction || '') !== 'inbound') return false;
          return !prevSmsMessageIdsRef.current.has(id)
            && !isNotificationRead('sms_messages', 'inbound_sms', id, seenSmsMessageIds.has(id))
            && !dismissedUiNotificationIds.has(`sms:${id}`)
            && !isNotificationDismissed('sms_messages', 'inbound_sms', id);
        })
        .map((row: any) => ({
          id: `sms:${String(row.id)}`,
          kind: 'sms' as const,
          kindLabel: 'پیامک',
          title: String(row?.sender || row?.phone_number || '').trim() || 'پیامک ورودی',
          body: [getPhoneMatchLabel(row?.phone_match_status), String(row?.message_text || '').trim() || 'پیامک جدید'].filter(Boolean).join(' - '),
          createdAt: row.message_at || row.created_at || null,
          smsMessage: row,
        })),
      ...voipCalls
        .filter((row) => {
          const id = String(row?.id || '').trim();
          if (!id) return false;
          if (String(row?.direction || '') !== 'incoming') return false;
          return !prevVoipCallIdsRef.current.has(id)
            && !isNotificationRead('voip_calls', 'voip_call', id, seenVoipCallIds.has(id))
            && !dismissedUiNotificationIds.has(`voip_call:${id}`)
            && !isNotificationDismissed('voip_calls', 'voip_call', id);
        })
        .map((row) => {
          const relatedLabel = String(row?.module_id || '').trim()
            ? MODULES[String(row.module_id)]?.titles?.faSingular || MODULES[String(row.module_id)]?.titles?.fa || ''
            : '';
          const caller = String(row?.title || row?.source_number || '').trim() || 'تماس ورودی';
          const extension = String(row?.extension || '').trim();
          return {
            id: `voip_call:${String(row.id)}`,
            kind: 'voip_call' as const,
            kindLabel: 'تماس VoIP',
            title: caller,
            body: [
              getPhoneMatchLabel(row?.phone_match_status),
              relatedLabel
                ? `تماس ورودی مرتبط با ${relatedLabel}`
                : (extension ? `تماس ورودی به داخلی ${toPersianNumber(extension)}` : 'تماس ورودی'),
            ].filter(Boolean).join(' - '),
            createdAt: row.created_at || row.started_at || null,
            voipCall: row,
          };
        }),
    ]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const relevantNewNotifications = newNotifications.filter((item) => (
      variant === 'chat'
        ? item.kind === 'note' || item.kind === 'bot' || item.kind === 'assistant' || item.kind === 'sms' || item.kind === 'voip_call'
        : item.kind === 'task' || item.kind === 'responsibility'
    ));

    if (!open && relevantNewNotifications.length > 0) {
      setUiNotifications((prev) => {
        const merged = [...relevantNewNotifications, ...prev];
        const unique = new Map<string, UiNotificationItem>();
        merged.forEach((item) => {
          const key = item.dedupeKey || item.id;
          if (!unique.has(key)) unique.set(key, item);
        });
        return Array.from(unique.values()).slice(0, 30);
      });
      playNotificationChime();
    }

    prevNotesRef.current = currentNoteIds;
    prevTasksRef.current = currentTaskIds;
    prevResponsibilitiesRef.current = currentResponsibilityIds;
    prevBotMessageIdsRef.current = currentBotMessageIds;
    prevSmsMessageIdsRef.current = currentSmsMessageIds;
    prevVoipCallIdsRef.current = currentVoipCallIds;
  }, [
    botGroups,
    botMessages,
    botNotificationMessages,
    chatGroupMap,
    directoryUserMap,
    dismissedUiNotificationIds,
    notes,
    open,
    playNotificationChime,
    resolveDirectConversationTargetUserId,
    responsibilities,
    seenSmsMessageIds,
    seenNoteIds,
    seenResponsibilityIds,
    seenTaskIds,
    smsMessages,
    tasks,
    variant,
    voipCalls,
    seenVoipCallIds,
  ]);

  useEffect(() => {
    setUiNotifications((prev) => prev.filter((item) => {
      const rawId = String(item?.id || '');
      const separatorIndex = rawId.indexOf(':');
      const kind = separatorIndex >= 0 ? rawId.slice(0, separatorIndex) : '';
      const entityId = separatorIndex >= 0 ? rawId.slice(separatorIndex + 1) : '';
      if (!kind || !entityId) return false;
      if (dismissedUiNotificationIds.has(rawId)) return false;
      if (kind === 'note' || kind === 'assistant') return !isNotificationRead('notes', 'note', entityId, seenNoteIds.has(entityId));
      if (kind === 'task') return !isNotificationRead('tasks', 'task', entityId, seenTaskIds.has(entityId));
      if (kind === 'responsibility') {
        const sourceType = item.responsibility ? getResponsibilitySourceType(item.responsibility) : 'responsibility';
        return !isNotificationRead('responsibilities', sourceType, entityId, seenResponsibilityIds.has(entityId));
      }
      if (kind === 'bot') return !isNotificationRead('bot_messages', 'counterparty_bot_message', entityId, seenBotMessageIds.has(entityId));
      if (kind === 'sms') return !isNotificationRead('sms_messages', 'inbound_sms', entityId, seenSmsMessageIds.has(entityId));
      if (kind === 'voip_call') return !isNotificationRead('voip_calls', 'voip_call', entityId, seenVoipCallIds.has(entityId));
      return false;
    }));
  }, [dismissedUiNotificationIds, isNotificationRead, seenBotMessageIds, seenNoteIds, seenResponsibilityIds, seenSmsMessageIds, seenTaskIds, seenVoipCallIds]);

  const handleDismissUiNotification = useCallback((notificationId: string) => {
    setDismissedUiNotificationIds((prev) => new Set(prev).add(notificationId));
    setUiNotifications((prev) => prev.filter((item) => item.id !== notificationId));
  }, []);

  const openUiNotification = useCallback((item: UiNotificationItem) => {
    if ((item.kind === 'note' || item.kind === 'assistant') && item.note) {
      const note = item.note;
      const groupId = String(note?.metadata?.chat_group_id || '').trim();
      if (groupId) {
        setSelectedNoteUserId(`${CHAT_GROUP_PREFIX}${groupId}`);
      } else if (isSystemNote(note)) {
        setSelectedNoteUserId(SYSTEM_MESSAGES_USER_ID);
      } else {
        const directUserId = resolveDirectConversationTargetUserId(note);
        setSelectedNoteUserId(directUserId || null);
      }
      setNoteModuleId(note.module_id || null);
      setNoteRecordId(note.record_id || null);
      setDesktopActiveKey('notes');
      setMobileActiveKey('notes');
      setOpen(true);
      return;
    }

    if (item.kind === 'task' && item.task) {
      const sourceLink = resolveTaskSourceLink(item.task);
      if (sourceLink.moduleId && sourceLink.recordId) {
        openTaskProcessModal({ task: item.task });
        return;
      }
      setDesktopActiveKey('tasks');
      setMobileActiveKey('tasks');
      setOpen(true);
      return;
    }

    if (item.kind === 'responsibility' && item.responsibility) {
      const moduleId = String(item.responsibility?.module_id || '').trim();
      const recordId = String(item.responsibility?.id || '').trim();
      if (moduleId && recordId) {
        openPreviewRecord(moduleId, recordId, recordTitleMap[`${moduleId}:${recordId}`] || formatRecordLabel(item.responsibility, moduleId));
      }
      return;
    }

    if (item.kind === 'voip_call' && item.voipCall?.id) {
      markVoipCallsAsSeen([item.voipCall]);
      setSelectedVoipThreadKey(getVoipThreadKey(item.voipCall));
      setDesktopActiveKey('voip_calls');
      setMobileActiveKey('voip_calls');
      setOpen(true);
      return;
    }

    if (item.kind === 'sms') {
      const entityId = String(item.id || '').split(':').slice(1).join(':');
      if (entityId) {
        markSmsMessagesAsSeen(item.smsMessage ? [item.smsMessage] : []);
      }
      const replyPhone = String(item.smsMessage?.sender || item.smsMessage?.phone_number || '').trim();
      if (replyPhone) {
        setSmsRecipient(replyPhone);
      }
      if (item.smsMessage) {
        setSelectedSmsThreadKey(getSmsThreadKey(item.smsMessage));
      }
      setDesktopActiveKey('sms_messages');
      setMobileActiveKey('sms_messages');
      setOpen(true);
      return;
    }

    if (item.kind === 'bot') {
      const groupId = String(item?.botGroupId || item?.botMessage?.bot_group_id || '').trim();
      if (groupId) {
        setSelectedBotGroupId(groupId);
      }
      setDesktopActiveKey('bot_messages');
      setMobileActiveKey('bot_messages');
      setOpen(true);
    }
  }, [markSmsMessagesAsSeen, markVoipCallsAsSeen, openPreviewRecord, recordTitleMap, resolveDirectConversationTargetUserId]);

  useEffect(() => {
    if (open || uiNotifications.length === 0) {
      setUiNotificationOverlayItems([], overlaySource);
      return;
    }
    const overlayItems = uiNotifications;
    if (overlayItems.length === 0) {
      setUiNotificationOverlayItems([], overlaySource);
      return;
    }

    setUiNotificationOverlayItems(
      overlayItems.map((item) => ({
        id: item.id,
        kind: item.kind,
        kindLabel: item.kindLabel,
        title: item.title,
        body: item.body,
        createdAt: item.createdAt,
        hasAttachments: item.hasAttachments,
        onOpen: () => openUiNotification(item),
        onDismiss: () => handleDismissUiNotification(item.id),
      })),
      overlaySource,
    );
  }, [handleDismissUiNotification, open, openUiNotification, overlaySource, uiNotifications]);

  useEffect(() => () => {
    setUiNotificationOverlayItems([], overlaySource);
  }, [overlaySource]);

  useEffect(() => {
    setUiNotificationOverlaySuppressed(open, overlaySource);
    return () => {
      setUiNotificationOverlaySuppressed(false, overlaySource);
    };
  }, [open, overlaySource]);

  useEffect(() => {
    if (standalone || open) {
      setDrawerContentMounted(true);
    }
  }, [open, standalone]);

  const renderNotesPanel = (layout: 'desktop' | 'mobile' = 'desktop') => (
    <NotesPanel
      layout={layout}
      context={{
        displayedChatNotes,
        notes,
        loadingNotes,
        isSelectedConversationLoaded,
        noteViewportReady,
        selectedChatGroup,
        selectedNoteConversationListItem,
        selectedNoteUser,
        activeConversationRoleLabel,
        myNoteStats,
        setEditingGroup,
        setGroupNameDraft,
        setGroupMemberDrafts,
        setGroupModalOpen,
        noteUserSearch,
        setNoteUserSearch,
        setMobileNoteSearchOpen,
        setSelectedNoteUserId,
        selectedNoteUserId,
        SYSTEM_MESSAGES_USER_ID,
        systemConversationAvatar,
        effectiveSystemNoteStats,
        UnifiedConversationAvatar,
        visibleNoteConversations,
        buildNoteConversationAvatarModel,
        systemAvatarSrc,
        selectedNoteConversationAvatar,
        profile,
        setChatGroups,
        noteMessageSearchOpen,
        normalizedNoteMessageSearch,
        setNoteMessageSearchOpen,
        setNoteMessageSearch,
        noteMessageSearch,
        notesScrollContainerRef,
        handleNotesScroll,
        selectedConversationHasMoreBefore,
        loadingOlderSelectedConversationNotes,
        loadOlderSelectedConversationNotes: loadOlderNotesWithPreserve,
        myNotesHasMoreBefore,
        loadOlderMyNotes: loadOlderMyNotesWithPreserve,
        recordTitleMap,
        formatRecordLabel,
        isSystemNote,
        directoryUserMap,
        authorNameMap,
        roleLookup,
        normalizeReadReceipts,
        normalizeLikeReceipts,
        isUnreadNoteRow,
        likeReceiptMapFromBox,
        resolveNoteBubbleAvatar,
        shouldAnimateChatEntry,
        renderReadReceiptStatus,
        editingNoteId,
        editingNoteValue,
        setNotes,
        setEditingNoteId,
        setEditingNoteValue,
        setNoteReplyTo,
        setNoteModuleId,
        setNoteRecordId,
        openForwardModal,
        toggleNoteLike,
        message,
        handleClose,
        noteNewIncomingCount,
        noteShouldStickToBottomRef,
        noteForceScrollToBottomRef,
        setNoteNewIncomingCount,
        scrollNotesToBottom,
        noteModuleId,
        noteRecordId,
        moduleOptions,
        noteRecordOptions,
        handleNoteScopeModuleChange,
        handleNoteScopeRecordChange,
        noteText,
        handleNoteTextChange,
        submitNote,
        noteSending,
        mentionOptions,
        mentionValues,
        setMentionValues,
        noteMentionPickerOpen,
        setNoteMentionPickerOpen,
        noteAttachments,
        setNoteAttachments,
        noteLinkedAttachments,
        setNoteLinkedAttachments,
        noteSmsNotificationEnabled,
        setNoteSmsNotificationEnabled,
        openReadyTextsModal,
        mobileNoteSearchOpen,
        noteReplyTo,
        scrollMessageIntoView,
        openCreateActivityFromMessage,
        selectedConversationInitialAnchorId,
        setNoteViewportReady,
        noteInitialAnchorDoneRef,
      }}
    />
  );
  const renderSmsMessagesPanel = (layout: 'desktop' | 'mobile' = 'desktop') => (
    <SmsMessagesPanel
      layout={layout}
      smsThreads={smsThreads}
      selectedSmsThread={selectedSmsThread}
      displayedSmsMessages={displayedSmsMessages}
      loadingSmsMessages={loadingSmsMessages}
      smsRecipient={smsRecipient}
      setSmsRecipient={setSmsRecipient}
      smsSending={smsSending}
      setSmsSending={setSmsSending}
      setSelectedSmsThreadKey={setSelectedSmsThreadKey}
      setSmsMessages={setSmsMessages}
      openPreviewRecord={openPreviewRecord}
      getCentralRecordLabel={getCentralRecordLabel}
      getPhoneMatchLabel={getPhoneMatchLabel}
      getModuleFieldOptionLabel={getModuleFieldOptionLabel}
      requestReplySuggestion={requestReplySuggestion}
      refreshSection={refreshSection}
      openCreateActivityFromMessage={openCreateActivityFromMessage}
    />
  );

  const renderVoipCallsPanel = (layout: 'desktop' | 'mobile' = 'desktop') => (
    <VoipCallsPanel
      layout={layout}
      voipThreads={voipThreads}
      selectedVoipThread={selectedVoipThread}
      displayedVoipCalls={displayedVoipCalls}
      assigneeNameMap={assigneeNameMap}
      setSelectedVoipThreadKey={setSelectedVoipThreadKey}
      openPreviewRecord={openPreviewRecord}
      getCentralRecordLabel={getCentralRecordLabel}
      getPhoneMatchLabel={getPhoneMatchLabel}
      getModuleFieldOptionLabel={getModuleFieldOptionLabel}
      openCreateActivityFromMessage={openCreateActivityFromMessage}
    />
  );

  const renderBotMessagesPanel = (layout: 'desktop' | 'mobile' = 'desktop') => {
    const selectedGroup = selectedBotGroup;
    const botMessageMap = new Map(botMessages.map((row) => [String(row.id), row]));
    const normalizedGroupSearch = String(botGroupSearch || '').trim().toLowerCase();
    const normalizedMessageSearch = String(botMessageSearch || '').trim().toLowerCase();
    const sidebarBotGroups = effectiveBotGroups;
    const botUnreadByGroup = botConversationSummaryAvailable && rpcBotConversationSummaries
      ? (rpcBotConversationSummaries || []).reduce<Record<string, number>>((acc, item) => {
          const groupId = String(item?.bot_group_id || '').trim();
          if (!groupId || !visibleBotGroupIds.has(groupId)) return acc;
          acc[groupId] = Number(item?.unread_count || 0);
          return acc;
        }, {})
      : botNotificationMessages.reduce<Record<string, number>>((acc, row) => {
          const groupId = String(row?.bot_group_id || '').trim();
          const id = String(row?.id || '').trim();
          if (!groupId || !id || String(row?.direction || '').trim() !== 'inbound') return acc;
          if (isNotificationRead('bot_messages', 'counterparty_bot_message', id, seenBotMessageIds.has(id))) return acc;
          acc[groupId] = (acc[groupId] || 0) + 1;
          return acc;
        }, {});
    const showBotTimelineSkeleton = loadingBotMessages;
    const hideBotTimelineUntilSettled = !showBotTimelineSkeleton && !botViewportReady && Boolean(selectedGroup);
    const filteredBotGroups = sidebarBotGroups.filter((row) => {
      if (!normalizedGroupSearch) return true;
      const title = String(row.group_title || '').trim().toLowerCase();
      const link = String(row.group_join_link || '').trim().toLowerCase();
      const channel = String(row.channel_type || '').trim().toLowerCase();
      return `${title} ${link} ${channel}`.includes(normalizedGroupSearch);
    });
    const filteredBotMessages = botMessages.filter((row) => {
      if (!normalizedMessageSearch) return true;
      const text = String(row.content_text || '').trim().toLowerCase();
      const fileName = String(row.file_name || '').trim().toLowerCase();
      return `${text} ${fileName}`.includes(normalizedMessageSearch);
    });
    const resolveOutboundBotAuthor = (row: CounterpartyBotMessageRow | null | undefined) => {
      const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
      const userId = String(
        (payload as any)?.sender_user_id
        || (payload as any)?.sender_profile_id
        || row?.created_by
        || ''
      ).trim();
      const directoryUser = userId ? directoryUserMap[userId] || null : null;
      const name = String(
        directoryUser?.display_name
        || (payload as any)?.sender_display_name
        || ''
      ).trim() || 'کاربر سازمان';
      const avatarUrl = String(directoryUser?.avatar_url || (payload as any)?.sender_avatar_url || '').trim() || null;
      return {
        name,
        metaLabel: null as string | null,
        avatarUrl,
        fallback: String(name || 'ک').trim().slice(0, 1) || 'ک',
      };
    };
    const resolveInboundBotAuthor = (row: CounterpartyBotMessageRow | null | undefined) => {
      const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
      const senderDisplayName = String((payload as any)?.sender_display_name || '').trim();
      const usernameRaw = String((payload as any)?.username || '').trim().replace(/^@+/, '');
      const username = usernameRaw ? `@${usernameRaw}` : '';
      const senderId = String((payload as any)?.sender_id || '').trim();
      const chatUserId = String((payload as any)?.user_id || (payload as any)?.object_guid || row?.chat_id || '').trim();
      const name = senderDisplayName
        || username
        || (senderId ? `ID: ${senderId}` : '')
        || (chatUserId ? `Chat: ${chatUserId}` : '')
        || 'کاربر';
      const metaLabel = senderDisplayName
        ? (username || (senderId ? `ID: ${senderId}` : '') || (chatUserId ? `Chat: ${chatUserId}` : ''))
        : null;
      return {
        name,
        metaLabel,
        avatarUrl: null as string | null,
        fallback: String(name || 'ب').trim().slice(0, 1) || 'ب',
      };
    };
    const resolveBotMessageAuthor = (row: CounterpartyBotMessageRow | null | undefined) => (
      String(row?.direction || '') === 'outbound'
        ? resolveOutboundBotAuthor(row)
        : resolveInboundBotAuthor(row)
    );

    const sendBotMessage = async () => {
      const text = String(botMessageText || '').trim();
      if (!selectedGroup) {
        message.warning('ابتدا یک گروه بات انتخاب کنید.');
        return;
      }
      const chatId = String(selectedGroup.bot_chat_id || '').trim();
      if (!chatId) {
        message.warning('این گروه هنوز chat id بات ندارد. یک پیام در گروه ارسال کنید تا فعال شود.');
        return;
      }
      setBotSending(true);
      try {
        const recordModuleId = selectedBotModuleId || (selectedGroup.target_type === 'customers' ? 'customers' : 'suppliers');
        const recordId = selectedGroup.target_type === 'customers'
          ? String(selectedGroup.customer_id || '').trim()
          : String(selectedGroup.supplier_id || '').trim();
        const renderedText = recordModuleId && botTemplateRecord
          ? await renderNotificationTemplate(text, botTemplateRecord, recordModuleId)
          : text;
        const uploadedAttachments = botAttachments.length > 0
          ? await uploadNoteAttachments(recordModuleId, recordId || null, botAttachments)
          : [];
        const attachments = [...botLinkedAttachments, ...uploadedAttachments].filter((attachment, index, all) => {
          const url = String(attachment?.url || '').trim();
          return url && all.findIndex((item) => String(item?.url || '').trim() === url) === index;
        });
        if (botLinkedAttachments.length > 0) {
          await ensureNoteAttachmentShortcuts(recordModuleId, recordId || null, botLinkedAttachments);
        }
        const outboundAttachments = attachments.length > 0
          ? await shortenAttachmentsForExternalShare(attachments, {
              moduleId: recordModuleId,
              recordId: recordId || null,
              metadata: {
                source_type: 'notifications_popover',
                channel_type: selectedGroup.channel_type,
              },
            })
          : [];
        const attachmentText = outboundAttachments
          .map((item) => `${String(item?.name || 'فایل').trim()}: ${String(item?.url || '').trim()}`)
          .filter(Boolean)
          .join('\n');
        const attachmentNameText = buildAttachmentNameText(outboundAttachments);
        const isRubikaGroup = String(selectedGroup.channel_type || '').trim() === 'rubika';
        const finalText = isRubikaGroup && attachments.length > 0
          ? String(renderedText || '').trim()
          : [renderedText, attachmentText].filter(Boolean).join('\n');
        if (!String(finalText || '').trim() && attachments.length === 0) {
          message.warning('پیام خالی است.');
          return;
        }
        botShouldStickToBottomRef.current = true;
        botForceScrollToBottomRef.current = true;
        await sendTextToBotGroup(selectedGroup, finalText, {
          fallbackText: isRubikaGroup && attachments.length > 0
            ? [String(renderedText || '').trim(), attachmentNameText].filter(Boolean).join('\n')
            : undefined,
          attachments: isRubikaGroup ? attachments : undefined,
          payload: {
            attachments,
            reply_to_message_id: botReplyToId || null,
          },
          messageType: attachments.length > 0 ? 'file' : 'text',
        });
        setBotMessageText('');
        setBotReplyToId(null);
        setBotAttachments([]);
        setBotLinkedAttachments([]);
        setBotMentionPickerOpen(false);
        await Promise.all([
          fetchBotGroups(),
          botConversationSummaryAvailable ? refreshBotConversationSummaries() : Promise.resolve(null),
          botTimelineAvailable ? refreshBotTimeline() : fetchBotMessages(selectedGroup.id, { forceFull: true }),
        ]);
        message.success('پیام بات ارسال شد.');
      } catch (error: any) {
        console.warn('Could not send bot group message', error);
        message.error(toFaErrorMessage(error, 'ارسال پیام بات ناموفق بود.'));
      } finally {
        setBotSending(false);
      }
    };

    const suggestBotReply = async (instruction = '') => {
      if (!selectedGroup) {
        message.warning('ابتدا یک گروه بات انتخاب کنید.');
        return;
      }
      if (botSuggesting) return;
      setBotSuggesting(true);
      setBotAiPopoverOpen(false);
      try {
        const recentMessages = (botMessages || []).slice(-18).map((row: any) => {
          const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
          const direction = String(row?.direction || '').trim() || 'inbound';
          const isOutbound = direction === 'outbound';
          const text = String(row?.content_text || '').trim()
            || (String(row?.file_name || '').trim() ? `فایل: ${String(row.file_name || '').trim()}` : '');
          return {
            direction,
            authorName: isOutbound
              ? 'کاربر سازمان'
              : (String(payload?.sender_display_name || '').trim()
                || String(payload?.sender_id || '').trim()
                || String(payload?.username || '').trim()
                || 'مشتری'),
            text,
            createdAt: row?.created_at || null,
          };
        }).filter((item: any) => item.text);

        const suggested = await requestReplySuggestion({
          channel: 'bot',
          botGroupId: String(selectedGroup.id || ''),
          instruction: String(instruction || '').trim() || null,
          context: {
            mode: selectedBotModuleId && selectedBotRecordId ? 'record' : 'page',
            moduleId: selectedBotModuleId || null,
            recordId: selectedBotRecordId || null,
            route: '/notifications?bot=1',
          },
          counterparty: {
            moduleId: selectedBotModuleId || null,
            recordId: selectedBotRecordId || null,
          },
          recentMessages,
        });
        setBotMessageText(suggested);
      } catch (error: any) {
        message.error(toFaErrorMessage(error, 'پیشنهاد پاسخ بات ناموفق بود.'));
      } finally {
        setBotSuggesting(false);
      }
    };

    return (
      <BotMessagesPanel
        layout={layout}
        selectedGroup={selectedGroup}
        selectedBotGroupId={selectedBotGroupId}
        setSelectedBotGroupId={setSelectedBotGroupId}
        botGroupSearch={botGroupSearch}
        setBotGroupSearch={setBotGroupSearch}
        mobileBotSearchOpen={mobileBotSearchOpen}
        setMobileBotSearchOpen={setMobileBotSearchOpen}
        filteredBotGroups={filteredBotGroups}
        botUnreadByGroup={botUnreadByGroup}
        botMessageSearch={botMessageSearch}
        setBotMessageSearch={setBotMessageSearch}
        botMessages={botMessages}
        filteredBotMessages={filteredBotMessages}
        botMessageMap={botMessageMap}
        loadingBotMessages={loadingBotMessages}
        hideBotTimelineUntilSettled={hideBotTimelineUntilSettled}
        botTimelineHasMoreBefore={botTimelineHasMoreBefore}
        loadingOlderBotMessages={loadingOlderBotMessages}
        loadOlderBotMessages={loadOlderBotWithPreserve}
        botMessagesScrollContainerRef={botMessagesScrollContainerRef}
        handleBotMessagesScroll={handleBotMessagesScroll}
        getBotMessageAttachments={getBotMessageAttachments}
        importBotMessageAttachment={importBotMessageAttachment}
        resolveBotMessageAuthor={resolveBotMessageAuthor}
        resolveBotBubbleAvatar={resolveBotBubbleAvatar}
        normalizeReadReceipts={normalizeReadReceipts}
        isUnreadBotRow={isUnreadBotRow}
        isUuidValue={isUuidValue}
        renderReadReceiptStatus={renderReadReceiptStatus}
        shouldAnimateChatEntry={shouldAnimateChatEntry}
        scrollMessageIntoView={scrollMessageIntoView}
        editingBotMessageId={editingBotMessageId}
        editingBotMessageValue={editingBotMessageValue}
        setEditingBotMessageId={setEditingBotMessageId}
        setEditingBotMessageValue={setEditingBotMessageValue}
        syncBotProviderMessageAction={syncBotProviderMessageAction}
        botConversationSummaryAvailable={botConversationSummaryAvailable}
        botTimelineAvailable={botTimelineAvailable}
        refreshBotConversationSummaries={refreshBotConversationSummaries}
        refreshBotTimeline={refreshBotTimeline}
        fetchBotMessages={fetchBotMessages}
        openForwardModal={openForwardModal}
        openCreateActivityFromMessage={openCreateActivityFromMessage}
        botNewIncomingCount={botNewIncomingCount}
        setBotNewIncomingCount={setBotNewIncomingCount}
        botShouldStickToBottomRef={botShouldStickToBottomRef}
        botForceScrollToBottomRef={botForceScrollToBottomRef}
        markBotMessagesAsSeen={markBotMessagesAsSeen}
        scrollBotMessagesToBottom={scrollBotMessagesToBottom}
        botMessageText={botMessageText}
        handleBotMessageTextChange={handleBotMessageTextChange}
        sendBotMessage={sendBotMessage}
        botSending={botSending}
        botSuggesting={botSuggesting}
        botAttachments={botAttachments}
        setBotAttachments={setBotAttachments}
        botLinkedAttachments={botLinkedAttachments}
        setBotLinkedAttachments={setBotLinkedAttachments}
        botMentionPickerOpen={botMentionPickerOpen}
        setBotMentionPickerOpen={setBotMentionPickerOpen}
        selectedBotModuleId={selectedBotModuleId}
        selectedBotRecordId={selectedBotRecordId}
        botReplyToId={botReplyToId}
        setBotReplyToId={setBotReplyToId}
        botAiPopoverOpen={botAiPopoverOpen}
        setBotAiPopoverOpen={setBotAiPopoverOpen}
        suggestBotReply={suggestBotReply}
        openReadyTextsModal={openReadyTextsModal}
        handleOpenBotStatusModal={handleOpenBotStatusModal}
        handleClose={handleClose}
      />
    );
  };
  const renderTasksPanel = (mode: 'list' | 'grid' = 'list') => (
    <TasksPanel
      mode={mode}
      tasks={tasks}
      filteredTasks={filteredTasks}
      showMore={showMore.tasks}
      setShowMore={(value: boolean) => setShowMore((prev) => ({ ...prev, tasks: value }))}
      loadingTasks={loadingTasks}
      taskViewKey={taskViewKey}
      setTaskViewKey={setTaskViewKey}
      taskSortDirection={taskSortDirection}
      setTaskSortDirection={setTaskSortDirection}
      directoryUsers={directoryUsers}
      directoryRoles={directoryRoles}
      openPreviewRecord={openPreviewRecord}
      recordTitleMap={recordTitleMap}
      formatRecordLabel={formatRecordLabel}
      assigneeNameMap={assigneeNameMap}
      roleNameMap={roleNameMap}
      createdByNameMap={createdByNameMap}
      handleClose={handleClose}
      navigate={navigate}
      setTasks={setTasks}
      lastLoadedAtRef={lastLoadedAtRef}
      handleTaskProducedQtyChange={handleTaskProducedQtyChange}
      profile={{ id: String(profile.id || '') }}
      maxItems={MAX_ITEMS}
    />
  );

  const renderResponsibilitiesPanel = (mode: 'list' | 'grid' = 'list') => (
    <ResponsibilitiesPanel
      mode={mode}
      filteredResponsibilities={filteredResponsibilities}
      showMore={showMore.responsibilities}
      setShowMore={(value: boolean) => setShowMore((prev) => ({ ...prev, responsibilities: value }))}
      loadingResponsibilities={loadingResponsibilities}
      responsibilityViewKey={responsibilityViewKey}
      setResponsibilityViewKey={setResponsibilityViewKey}
      responsibilitySortDirection={responsibilitySortDirection}
      setResponsibilitySortDirection={setResponsibilitySortDirection}
      responsibilityViews={responsibilityViews}
      directoryUsers={directoryUsers}
      directoryRoles={directoryRoles}
      openPreviewRecord={openPreviewRecord}
      recordTitleMap={recordTitleMap}
      formatRecordLabel={formatRecordLabel}
      roleNameMap={roleNameMap}
      assigneeNameMap={assigneeNameMap}
      createdByNameMap={createdByNameMap}
      handleClose={handleClose}
      maxItems={MAX_ITEMS}
    />
  );

  const renderLazyDrawerPane = (
    tabKey: DrawerTabKey,
    activeKey: DrawerTabKey,
    className: string,
    renderPane: () => React.ReactNode,
  ) => (
    <div className={className}>
      {activeKey === tabKey ? (
        <React.Suspense fallback={null}>
          {renderPane()}
        </React.Suspense>
      ) : null}
    </div>
  );

  const desktopPaneH = 'h-full min-h-0';
  const desktopModernItems = variant === 'chat'
    ? [
      {
        key: 'notes',
        label: <Badge count={formatBadgeCount(notesCount)} color={badgeColor}><span className="px-1">پیام‌های داخلی</span></Badge>,
        children: renderLazyDrawerPane('notes', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden`, () => renderNotesPanel('desktop')),
      },
      {
        key: 'bot_messages',
        label: <Badge count={formatBadgeCount(botMessagesCount)} color={badgeColor}>پیام‌های بات</Badge>,
        children: renderLazyDrawerPane('bot_messages', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden`, () => renderBotMessagesPanel('desktop')),
      },
      {
        key: 'sms_messages',
        label: <Badge count={formatBadgeCount(smsMessagesCount)} color={badgeColor}>پیامک‌ها</Badge>,
        children: renderLazyDrawerPane('sms_messages', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden`, () => renderSmsMessagesPanel('desktop')),
      },
      {
        key: 'voip_calls',
        label: <Badge count={formatBadgeCount(voipCallsCount)} color={badgeColor}>تماس‌ها</Badge>,
        children: renderLazyDrawerPane('voip_calls', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden`, () => renderVoipCallsPanel('desktop')),
      },
      {
        key: 'assistant',
        label: <span className="px-1">هوش مصنوعی</span>,
        children: renderLazyDrawerPane('assistant', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden`, () => (
          <AssistantPanel active={open && desktopActiveKey === 'assistant'} openCreateActivityFromMessage={openCreateActivityFromMessage} />
        )),
      },
    ]
    : [
      {
        key: 'tasks',
        label: <Badge count={formatBadgeCount(tasksCount)} color={badgeColor}>فعالیت‌های من</Badge>,
        children: renderLazyDrawerPane('tasks', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden px-3 pb-3`, () => renderTasksPanel('grid')),
      },
      {
        key: 'responsibilities',
        label: <Badge count={formatBadgeCount(responsibilitiesCount)} color={badgeColor}>مسئولیت‌های من</Badge>,
        children: renderLazyDrawerPane('responsibilities', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden px-3 pb-3`, () => renderResponsibilitiesPanel('grid')),
      },
    ];

  const contentDesktopInner = (
    <div className={`h-full overflow-hidden ${standalone ? '' : 'rounded-xl shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_44px_rgba(0,0,0,0.24)]'} ${
      variant === 'chat'
        ? 'border border-white/10 bg-white dark:bg-[rgb(var(--app-dark-surface-rgb))]'
        : 'border border-[rgba(var(--brand-300-rgb),0.16)] dark:border-[rgba(var(--brand-300-rgb),0.12)] bg-white dark:bg-[rgba(var(--app-dark-surface-rgb),0.95)]'
    }`}>
      <Tabs
        activeKey={desktopActiveKey}
        onChange={(key) => setDesktopActiveKey(normalizeTabForVariant(variant, key as DrawerTabKey))}
        className="h-full [&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-nav]:!px-3 [&_.ant-tabs-tab]:!py-3 [&_.ant-tabs-content-holder]:h-full [&_.ant-tabs-content]:h-full [&_.ant-tabs-tabpane]:h-full"
        items={desktopModernItems}
      />
    </div>
  );

  const contentDesktopModern = (
    <div className="w-[780px] max-w-[88vw] h-[90vh] p-3">
      {contentDesktopInner}
    </div>
  );

  const mobileModernItems = variant === 'chat'
    ? [
      {
        key: 'notes',
        label: <Badge count={formatBadgeCount(notesCount)} color={badgeColor}><span className="px-1">پیام‌های داخلی</span></Badge>,
        children: renderLazyDrawerPane('notes', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden', () => renderNotesPanel('mobile')),
      },
      {
        key: 'bot_messages',
        label: <Badge count={formatBadgeCount(botMessagesCount)} color={badgeColor}>پیام‌های بات</Badge>,
        children: renderLazyDrawerPane('bot_messages', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden', () => renderBotMessagesPanel('mobile')),
      },
      {
        key: 'sms_messages',
        label: <Badge count={formatBadgeCount(smsMessagesCount)} color={badgeColor}>پیامک‌ها</Badge>,
        children: renderLazyDrawerPane('sms_messages', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden', () => renderSmsMessagesPanel('mobile')),
      },
      {
        key: 'voip_calls',
        label: <Badge count={formatBadgeCount(voipCallsCount)} color={badgeColor}>تماس‌ها</Badge>,
        children: renderLazyDrawerPane('voip_calls', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden', () => renderVoipCallsPanel('mobile')),
      },
      {
        key: 'assistant',
        label: <span className="px-1">هوش مصنوعی</span>,
        children: renderLazyDrawerPane('assistant', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden', () => (
          <AssistantPanel active={open && mobileActiveKey === 'assistant'} openCreateActivityFromMessage={openCreateActivityFromMessage} />
        )),
      },
    ]
    : [
      {
        key: 'tasks',
        label: <Badge count={formatBadgeCount(tasksCount)} color={badgeColor}>فعالیت‌های من</Badge>,
        children: renderLazyDrawerPane('tasks', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden px-2 pb-2', () => renderTasksPanel('grid')),
      },
      {
        key: 'responsibilities',
        label: <Badge count={formatBadgeCount(responsibilitiesCount)} color={badgeColor}>مسئولیت‌های من</Badge>,
        children: renderLazyDrawerPane('responsibilities', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden px-2 pb-2', () => renderResponsibilitiesPanel('grid')),
      },
    ];

  const contentMobileModern = (
    <div className={`h-full min-h-0 flex flex-col ${variant === 'chat' ? 'bg-white dark:bg-[rgb(var(--app-dark-surface-rgb))]' : 'bg-white dark:bg-[rgb(var(--app-dark-surface-rgb))]'}`}>
      <Tabs
        activeKey={mobileActiveKey}
        onChange={(key) => setMobileActiveKey(normalizeTabForVariant(variant, key as DrawerTabKey))}
        className="h-full min-h-0 [&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-nav]:!px-1 [&_.ant-tabs-nav]:!shrink-0 [&_.ant-tabs-nav-wrap]:!overflow-x-auto [&_.ant-tabs-nav-list]:!min-w-max [&_.ant-tabs-tab]:!px-2 [&_.ant-tabs-tab]:!py-2 [&_.ant-tabs-tab]:!text-xs [&_.ant-tabs-content-holder]:h-full [&_.ant-tabs-content-holder]:min-h-0 [&_.ant-tabs-content]:h-full [&_.ant-tabs-content]:min-h-0 [&_.ant-tabs-tabpane]:h-full [&_.ant-tabs-tabpane]:min-h-0"
        items={mobileModernItems}
      />
    </div>
  );
  const drawerContainer = typeof document === 'undefined' ? undefined : () => document.body;
  const triggerIcon = variant === 'chat'
    ? <MessageOutlined className="text-gray-500 dark:text-gray-400" />
    : <BellOutlined className="text-gray-500 dark:text-gray-400" />;
  const mobileDrawerTitle = variant === 'chat' ? 'ارتباطات' : 'اعلانات';
  const desktopDrawerTitle = variant === 'chat' ? 'ارتباطات' : 'اعلانات';

  return (
    <>
      {standalone ? (
        <div className="h-full w-full overflow-hidden">
          {isMobile ? contentMobileModern : contentDesktopInner}
        </div>
      ) : (
        <>
      {!triggerless ? (
        <Badge count={formatBadgeCount(totalCount)} size="small" color={badgeColor}>
          <Button
            type="text"
            shape="circle"
            icon={triggerIcon}
            onClick={() => {
              setUiNotificationOverlaySuppressed(true, overlaySource);
              setDrawerContentMounted(true);
              setOpen(true);
            }}
          />
        </Badge>
      ) : null}

      {isMobile ? (
        <Drawer
          title={(
            <div className="flex items-center justify-between w-full pr-2">
              <span className="text-white">{mobileDrawerTitle}</span>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined spin={refreshing} style={{ color: 'white' }} />}
                onClick={handleManualRefresh}
              />
            </div>
          )}
          placement="top"
          height="var(--app-viewport-height, 100dvh)"
          open={open}
          onClose={requestDrawerClose}
          afterOpenChange={(nextOpen) => {
            if (!nextOpen) finalizeDrawerClose();
          }}
          destroyOnHidden={false}
          getContainer={drawerContainer}
          rootStyle={{ position: 'fixed', inset: 0 }}
          zIndex={1500}
          rootClassName="notifications-drawer"
          styles={{ body: mobileDrawerBodyStyle, header: drawerHeaderStyle, content: drawerContentStyle }}
          closeIcon={<CloseOutlined className="text-white" />}
        >
          {drawerContentMounted ? contentMobileModern : null}
        </Drawer>
      ) : (
        <Drawer
          title={(
            <div className="flex items-center justify-between w-full pr-2">
              <span className="text-white">{desktopDrawerTitle}</span>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined spin={refreshing} style={{ color: 'white' }} />}
                onClick={handleManualRefresh}
              />
            </div>
          )}
          placement="left"
          width={800}
          open={open}
          onClose={handleClose}
          afterOpenChange={(nextOpen) => {
            if (!nextOpen) finalizeDrawerClose();
          }}
          destroyOnHidden={false}
          getContainer={drawerContainer}
          rootStyle={{ position: 'fixed', inset: 0 }}
          zIndex={1500}
          rootClassName="notifications-drawer"
          styles={{ body: desktopDrawerBodyStyle, header: drawerHeaderStyle, content: drawerContentStyle }}
          closeIcon={<CloseOutlined className="text-white" />}
        >
          {drawerContentMounted ? contentDesktopModern : null}
        </Drawer>
      )}
        </>
      )}
      {previewRecord ? (
        <React.Suspense fallback={null}>
          <RelatedRecordPopover
            moduleId={previewRecord.moduleId}
            recordId={previewRecord.recordId}
            label={previewRecord.label}
            mode="modal"
            open={!!previewRecord}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) setPreviewRecord(null);
            }}
            overlayZIndex={NOTIFICATIONS_MODAL_Z_INDEX}
          />
        </React.Suspense>
      ) : null}
      {messageActivityDraft ? (
        <React.Suspense fallback={null}>
          <SmartForm
            module={MODULES.tasks}
            visible={Boolean(messageActivityDraft)}
            title="ایجاد فعالیت"
            initialValues={messageActivityDraft.initialValues}
            onCancel={() => setMessageActivityDraft(null)}
            onSave={handleMessageActivitySave}
            overlayZIndex={NOTIFICATIONS_MODAL_Z_INDEX}
          />
        </React.Suspense>
      ) : null}
      {taskProcessTarget ? (
        <div className="hidden" aria-hidden="true">
          <React.Suspense fallback={null}>
            <ProductionStagesField
              key={`${taskProcessHostKey}-${String(taskProcessModalTask?.id || '')}`}
              recordId={taskProcessTarget.recordId}
              moduleId={taskProcessTarget.moduleId}
              autoOpenTaskId={taskProcessModalTask?.id ? String(taskProcessModalTask.id) : null}
              readOnly
              compact
              cardCompact
              allowReportEditInReadOnly
              lazyLoad
              onlyLineId={taskProcessTarget.lineId}
            />
          </React.Suspense>
        </div>
      ) : null}
      {botStatusModalOpen ? (
        <React.Suspense fallback={null}>
          <CounterpartyBotStatusModal
            open={botStatusModalOpen}
            loading={botStatusModalLoading}
            saving={botStatusModalSaving}
            watchingChannel={botStatusWatchingChannel}
            countdown={botStatusCountdown}
            activeTab={botStatusActiveTab}
            defaultChannel={botStatusDefaultChannel}
            fallbackToActive={botStatusFallbackToActive}
            counterpartyType={selectedBotGroup?.target_type === 'suppliers' ? 'supplier' : 'customer'}
            platforms={botStatusPlatformData}
            userOptions={directoryUsers.map((user: any) => ({
              label: String(user?.display_name || user?.id || '-').trim(),
              value: String(user?.id || '').trim(),
            })).filter((item: any) => item.value)}
            roleOptions={directoryRoles.map((role: any) => ({
              label: String(role?.title || role?.id || '-').trim(),
              value: String(role?.id || '').trim(),
            })).filter((item: any) => item.value)}
            onClose={handleCloseBotStatusModal}
            onSave={() => void handleSaveBotStatusModal()}
            onChangeTab={setBotStatusActiveTab}
            onChangeDefaultChannel={setBotStatusDefaultChannel}
            onChangeFallbackToActive={setBotStatusFallbackToActive}
            onStartBindWatch={(channel) => void handleStartBotBindWatch(channel)}
            onCopyActivationCode={(channel) => void handleCopyBotActivationCode(channel)}
            onChangePlatform={(channel, key, value) => setBotStatusPlatformData((prev) => ({
              ...prev,
              [channel]: { ...prev[channel], [key]: value },
            }))}
          />
        </React.Suspense>
      ) : null}
      <Modal
        title={editingGroup ? 'ویرایش گروه' : 'ایجاد گروه جدید'}
        open={groupModalOpen}
        onCancel={() => {
          setGroupModalOpen(false);
          setEditingGroup(null);
          setGroupNameDraft('');
          setGroupMemberDrafts([]);
        }}
        onOk={handleSubmitGroup}
        confirmLoading={groupSubmitting}
        okText={editingGroup ? 'ذخیره' : 'ایجاد'}
        cancelText="انصراف"
      >
        <div className="space-y-3">
          <Input
            value={groupNameDraft}
            onChange={(event) => setGroupNameDraft(event.target.value)}
            placeholder="نام گروه"
          />
          <Select
            mode="multiple"
            showSearch
            allowClear
            value={groupMemberDrafts}
            onChange={(values) => setGroupMemberDrafts((values || []).map((value) => String(value)))}
            options={groupMemberOptions}
            optionFilterProp="label"
            placeholder="انتخاب اعضا و نقش‌ها"
            className="w-full"
            maxTagCount="responsive"
            getPopupContainer={(trigger) => trigger.parentElement || document.body}
            styles={{ popup: { root: { zIndex: 1400 } } }}
            listHeight={280}
          />
          <div className="text-xs text-gray-500">
            با انتخاب نقش، همه اعضای دارای آن نقش تا زمانی که همان نقش را داشته باشند عضو گروه می‌مانند.
          </div>
        </div>
      </Modal>
      {templateComposerContext ? (
        <React.Suspense fallback={null}>
          <MessageComposerModal
            open
            mode="template"
            moduleId={activeTemplateModuleId}
            record={activeTemplateRecord || null}
            templateOnlyTitle={
              templateComposerContext === 'bot'
                ? 'پیام‌های آماده چت بات'
                : (templateComposerContext === 'forward' ? 'پیام‌های آماده فوروارد' : 'پیام‌های آماده یادداشت')
            }
            onApplyTemplate={applyReadyText}
            onInsertVariable={insertTemplateToken}
            onCancel={() => setTemplateComposerContext(null)}
          />
        </React.Suspense>
      ) : null}
      <Modal
        title="فوروارد پیام"
        open={Boolean(forwardingNote)}
        zIndex={1700}
        onCancel={() => {
          setForwardingNote(null);
          setForwardTargetUserIds([]);
          setForwardMessageText('');
        }}
        onOk={submitForward}
        confirmLoading={forwardSubmitting}
        okText="فوروارد"
        cancelText="انصراف"
        okButtonProps={{ disabled: forwardTargetUserIds.length === 0 }}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-gray-500">متن پیام فوروارد</div>
            <Button size="small" icon={<CopyOutlined />} onClick={() => openReadyTextsModal('forward')}>
              پیام‌های آماده
            </Button>
          </div>
          <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.7)] px-3 py-2 text-sm text-gray-700">
            {forwardingNote
              ? (
                String((forwardingNote as any)?.__forward_source_type || 'note').trim() === 'bot'
                  ? (String(forwardingNote?.content_text || '').trim() || 'بدون متن')
                  : (parseNoteContent(forwardingNote.content).text || 'بدون متن')
              )
              : ''}
          </div>
          <Input.TextArea
            value={forwardMessageText}
            onChange={(event) => setForwardMessageText(event.target.value)}
            rows={3}
            placeholder="متن اختیاری قبل از محتوای فوروارد"
            className="w-full"
          />
          <Select
            mode="multiple"
            showSearch
            allowClear
            value={forwardTargetUserIds}
            onChange={(values) => setForwardTargetUserIds((values || []).map((value) => String(value)))}
            placeholder="یک یا چند گیرنده انتخاب کنید"
            optionFilterProp="searchText"
            filterOption={(input, option) => String(option?.searchText || '').includes(String(input || '').trim().toLowerCase())}
            getPopupContainer={(trigger) => trigger.parentElement || document.body}
            styles={{ popup: { root: { zIndex: 1710 } } }}
            options={forwardTargetOptions}
            maxTagCount="responsive"
            className="w-full"
          />
        </div>
      </Modal>
    </>
  );
};

export default NotificationsPopover;





