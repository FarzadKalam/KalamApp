import React, { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { App, Badge, Button, Drawer, Empty, Input, Modal, Popover, Tabs } from 'antd';
import { BellOutlined, TeamOutlined, CloseOutlined, ReloadOutlined, RobotOutlined, MessageOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { fetchAssigneeDirectory } from '../utils/referenceData';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { supportsModuleAssignee } from '../utils/assigneeSupport';
import {
  isMissingTableLikeError,
  isMissingColumnError,
  fetchAssignedIdsForModule,
} from '../utils/notificationAssigneeHelpers';
import { useMyActivities } from '../hooks/useMyActivities';
import { useMyResponsibilities } from '../hooks/useMyResponsibilities';
import { parseNoteContent, serializeNoteContent } from '../utils/noteContent';
import type { NoteAttachment } from '../utils/noteContent';
import { ensureNoteAttachmentShortcuts, uploadNoteAttachments } from '../utils/noteAttachments';
import { normalizeNoteScope } from '../utils/noteScope';
import { buildTaskSourceInitialValues, normalizeTaskSourceValues, resolveTaskSourceLink } from '../utils/taskMeta';
import { attachTaskCompletionIfNeeded } from '../utils/taskCompletion';
import { NOTES_UPDATED_EVENT } from '../utils/aiAssistantEvents';
import { getTaskStatusLabel } from '../utils/processTaskStatusOptions';
import { setUiNotificationOverlayItems, setUiNotificationOverlaySuppressed } from '../utils/uiNotificationOverlayStore';
import { insertNotesWithFallback, sendNoteSmsNotifications } from '../utils/noteDispatch';
import { getActiveChannelSettings } from '../utils/channelSettings';
import { sendBotMessageViaGateway } from '../utils/botGateway';
import { renderRecordTemplate } from '../utils/recordMessaging';
import { resolveTemplateOptionLabelMaps } from '../utils/messageTemplateRenderer';
import { openTaskProcessModal } from '../utils/taskProcessModalEvents';
import { getRecordDisplayLabel } from '../utils/recordLabel';
import { buildRecordReferenceKey, fetchRecordReferenceLabels } from '../utils/recordReference';
import { selectByIdsWithCompatibleColumns } from '../utils/selectCompat';
import { canUseRecordLockPermission, resolveVoipAccessPermissions, type PermissionMap } from '../utils/permissions';
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
import { useNotificationRuntime } from './notifications/NotificationRuntimeProvider';
import { compareIsoAsc, isMissingRpcError, type NotificationConversationSummary } from '../utils/notificationConversationRpc';
import { botMessageInsertBus, noteInsertBus } from '../utils/communicationRealtimeBus';
import { loadMessagesLastState, saveMessagesLastState } from '../utils/messagesLastState';
import {
  EMPTY_NOTIFICATION_UNREAD_SUMMARY,
  normalizeNotificationUnreadSummary,
  type NotificationUnreadSummaryMap,
} from '../utils/notificationUnreadSummary';
import {
  getResponsibilityNotificationSourceType,
  mergeRowsByIdCreatedAsc,
} from '../utils/notificationAlertReadEntries';
import {
  CHAT_GROUP_PREFIX,
  MY_NOTES_CONVERSATION_KEY,
  SYSTEM_MESSAGES_USER_ID,
  buildDirectConversationKey,
  getChatGroupSelectionId,
  resolveConversationSelection,
} from '../utils/notificationConversationKeys';
import ProfileAvatar from './common/ProfileAvatar';
import AdaptiveIdentityPicker from './AdaptiveIdentityPicker';
import { clearIdentityDirectoryCache } from '../utils/identityDirectory';
import { preloadAvatarUrls } from '../utils/profileAvatar';
import { PROFILE_AVATAR_UPDATED_EVENT, type ProfileAvatarUpdatedDetail } from '../utils/profileAvatarEvents';
import type { BotChannel, BotPlatformState } from './bot/CounterpartyBotStatusModal';
import {
  BOT_CHANNELS,
  BOT_CHANNEL_LABELS_FA as BOT_CHANNEL_LABELS_FA_SHARED,
  getBotChatIdFieldKey,
  isBotTargetModuleId,
  type BotTargetModuleId,
} from '../utils/botPlatform';
import { syncBotDirectChatIdForTarget } from '../utils/botIdentityBindings';
import {
  buildPhoneTargetDisplayName,
  MANUAL_PHONE_BINDING_SOURCE_FIELD,
  MANUAL_PHONE_BINDING_SOURCE_TABLE,
  PHONE_BIND_TARGET_MODULES,
  searchPhoneBindingTargets,
  syncPhoneIdentityBinding,
  type PhoneBindTargetModuleId,
} from '../utils/phoneIdentityBindings';
import { loadScopedCompanySettings } from '../utils/companySettings';
import { NOTIFICATION_UNREAD_BADGE_COLOR } from './notifications/UnreadCountBadge';
import {
  getLikeAt,
  getLikeUserId,
  getLikeUserName,
  getReadReceiptReadAt,
  getReadReceiptUserId,
  getReadReceiptUserName,
  likeReceiptMapFromBox,
  readReceiptMapFromBox,
  selectBotReceiptCursorRows,
  selectInternalReceiptCursorRows,
  type LikeReceiptEntry,
  type ReadReceiptEntry,
} from '../utils/messageReceipts';
import {
  canCurrentUserAccessInternalSystemNote,
  isInternalSystemNoteRow,
} from '../utils/internalNoteAccess';

const NOTIFICATIONS_MODAL_Z_INDEX = 15100;
const VoipCallsPanel = React.lazy(() => import('./notifications/VoipCallsPanel'));
const ResponsibilitiesPanel = React.lazy(() => import('./notifications/ResponsibilitiesPanel'));
const TasksPanel = React.lazy(() => import('./notifications/TasksPanel'));
const SmsMessagesPanel = React.lazy(() => import('./notifications/SmsMessagesPanel'));
const PhoneMatchPickerModal = React.lazy(() => import('./notifications/PhoneMatchPickerModal'));
const BotMessagesPanel = React.lazy(() => import('./notifications/BotMessagesPanel'));
const BotDirectMessagesPanel = React.lazy(() => import('./notifications/BotDirectMessagesPanel'));
const BotChatIdentityBindModal = React.lazy(() => import('./notifications/BotChatIdentityBindModal'));
const NotesPanel = React.lazy(() => import('./notifications/NotesPanel'));
const ForwardMessageModalRuntime = React.lazy(() => import('./notifications/ForwardMessageModalRuntime'));
const RelatedRecordPopover = React.lazy(() => import('./RelatedRecordPopover'));
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
  requestedTab?: 'notes' | 'tasks' | 'responsibilities' | 'bot_messages' | 'bot_direct_messages' | 'sms_messages' | 'voip_calls';
  requestedConversationKey?: string;
  requestedBotGroupId?: string;
  requestedBotDirectThreadId?: string;
  /** When true, renders as a full-page component (no drawer/popover wrapper, always open) */
  standalone?: boolean;
  managedByRuntime?: boolean;
  controlledOpen?: boolean;
  renderTrigger?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAfterClose?: () => void;
}

type MessageActivityDraft = {
  initialValues: Record<string, any>;
  attachments: NoteAttachment[];
  relatedModuleId: string | null;
  relatedRecordId: string | null;
  sourceLabel: string;
};

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
// Module-level directory cache: keeps users/roles across popover open-close cycles
// so avatars load instantly on re-open instead of re-fetching each time.
const _notifDirectoryCache: {
  orgId: string | null;
  users: Array<{ id: string; display_name: string; avatar_url?: string | null; role_id?: string | null }>;
  roles: Array<{ id: string; title: string }>;
} = { orgId: null, users: [], roles: [] };
type NotificationSectionKey = 'notes' | 'tasks' | 'responsibilities' | 'bot_messages' | 'bot_direct_messages' | 'sms_messages' | 'voip_calls';
type NotificationStateSectionKey = 'notes' | 'tasks' | 'responsibilities' | 'bot_messages' | 'bot_direct_messages' | 'sms' | 'voip_calls';
type DrawerTabKey = NotificationSectionKey;
type CreatedSortDirection = 'desc' | 'asc';
const CHAT_TAB_KEYS: DrawerTabKey[] = ['notes', 'bot_messages', 'bot_direct_messages', 'sms_messages', 'voip_calls'];
const ALERT_TAB_KEYS: DrawerTabKey[] = ['tasks', 'responsibilities'];
const CHAT_SECTION_KEYS: NotificationSectionKey[] = ['notes', 'bot_messages', 'bot_direct_messages', 'sms_messages', 'voip_calls'];
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
  groupJoinLink: '',
  directChatId: '',
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
  value === 'notes' || value === 'tasks' || value === 'responsibilities' || value === 'bot_messages' || value === 'bot_direct_messages' || value === 'sms_messages' || value === 'voip_calls';
const getSectionsForVariant = (variant: 'chat' | 'alerts'): NotificationSectionKey[] =>
  variant === 'chat' ? CHAT_SECTION_KEYS : ALERT_SECTION_KEYS;
const NOTE_SELECT_FIELDS = 'id, module_id, record_id, content, author_id, author_name, mention_user_ids, mention_role_ids, created_at, reply_to, source_type, metadata, is_edited, edited_at';
const NOTES_INBOX_FETCH_LIMIT = 80;
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
  employee_id?: string | null;
  channel_type: 'rubika' | 'telegram' | 'bale' | string;
  status: string;
  group_title: string | null;
  group_join_link: string | null;
  bot_chat_id: string | null;
  updated_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_by?: string | null;
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

type BotDirectThreadRow = {
  id: string;
  channel_type: 'rubika' | 'telegram' | 'bale' | string;
  chat_id: string;
  binding_id?: string | null;
  target_module_id?: 'customers' | 'suppliers' | 'employees' | string | null;
  target_record_id?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  employee_id?: string | null;
  profile_id?: string | null;
  created_by?: string | null;
  display_name?: string | null;
  username?: string | null;
  phone_number?: string | null;
  last_seen_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  metadata?: Record<string, any> | null;
  binding_status?: 'bound' | 'unbound';
  counterparty_label?: string | null;
  counterparty_image_url?: string | null;
};

type BotDirectMessageRow = {
  id: string;
  direct_thread_id: string;
  direction: 'inbound' | 'outbound' | string;
  message_type: 'text' | 'image' | 'file' | 'invoice' | 'other' | string;
  content_text?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  payload?: Record<string, any> | null;
  chat_id?: string | null;
  channel_type?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

type BotIdentityBindingRow = {
  id?: string;
  target_module_id?: BotTargetModuleId | string | null;
  target_record_id?: string | null;
  display_name?: string | null;
  username?: string | null;
  phone_number?: string | null;
  profile_id?: string | null;
};

type BotChatIdentityBindDraft = {
  threadId?: string | null;
  channel: BotChannel;
  chatId: string;
  displayName: string;
  username: string;
  phoneNumber: string;
  existingBinding: BotIdentityBindingRow | null;
};

type BotIdentityMemberGroup = {
  id: string;
  title: string;
  channelLabel: string;
  statusLabel?: string | null;
  lastActivityAt?: string | null;
};

type PhoneIdentityBindDraft = {
  phone: string;
  phoneNumberId: string | null;
  phoneMatchStatus: string | null;
  existingBindingLabel?: string | null;
  existingTargetModuleId?: PhoneBindTargetModuleId | null;
  existingTargetRecordId?: string | null;
};

const BOT_CHANNEL_LABELS_FA: Record<string, string> = BOT_CHANNEL_LABELS_FA_SHARED;

const BOT_BIND_CAPTURE_SECONDS = 60;

const isBlockedBotDirectThread = (row: BotDirectThreadRow | null | undefined) => {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return (metadata as any)?.suspected_group_chat === true || (metadata as any)?.send_blocked === true;
};

const scoreBotDirectThreadCandidate = (row: BotDirectThreadRow | null | undefined) => {
  if (!row) return Number.NEGATIVE_INFINITY;
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const suspiciousPenalty = isBlockedBotDirectThread(row) ? -1_000_000 : 0;
  const verifiedBonus = (metadata as any)?.direct_chat_verified === true ? 10_000 : 0;
  const boundBonus = String(row?.target_module_id || '').trim() && String(row?.target_record_id || '').trim() ? 1_000 : 0;
  const activityTime = new Date(
    row?.last_message_at
    || row?.last_inbound_at
    || row?.last_outbound_at
    || row?.last_seen_at
    || 0
  ).getTime() || 0;
  return suspiciousPenalty + verifiedBonus + boundBonus + activityTime;
};

const isActiveCounterpartyBotGroup = (row: Pick<CounterpartyBotGroupRow, 'status'> | null | undefined) =>
  String(row?.status || '').trim() === 'active';

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
  attachments?: NoteAttachment[];
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
const EMPTY_STABLE_ARRAY: any[] = [];

const isRpcSchemaCompatibilityError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    isMissingRpcError(error)
    || status >= 500
    || code === '42703'
    || code === 'PGRST204'
    || code === 'PGRST301'
    || message.includes('schema cache')
    || message.includes('failed to fetch')
    || (message.includes('column') && message.includes('does not exist'))
  );
};

const TASK_VIEW_PRESETS = [
  { key: 'all', label: 'همه فعالیت‌ها' },
  { key: 'not_done', label: 'انجام نشده‌ها' },
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
  section === 'sms_messages'
    ? 'sms'
    : section
);

const buildNotificationStateKey = (
  section: NotificationSectionKey | NotificationStateSectionKey,
  sourceType: string,
  sourceId: string,
) => `${section}:${String(sourceType || '').trim()}:${String(sourceId || '').trim()}`;

const getResponsibilitySourceType = (item: any) =>
  getResponsibilityNotificationSourceType(item, MODULES);

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

const getResponsibilityModuleTitle = (moduleId?: string | null) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const moduleConfig = normalizedModuleId ? MODULES[normalizedModuleId] : null;
  return String(moduleConfig?.titles?.faSingular || moduleConfig?.titles?.fa || normalizedModuleId || 'رکورد').trim();
};

const isNewResponsibilityAssignment = (item: any) => {
  const inboxItem = item?.__notification_inbox_item || {};
  const payload = isPlainRecord(inboxItem?.payload) ? inboxItem.payload : {};
  const action = String(inboxItem?.action || payload?.action || '').trim().toLowerCase();
  if (action === 'insert') return true;
  if (action === 'update') return false;

  const createdAt = new Date(item?.created_at || '').getTime();
  const updatedAt = new Date(item?.updated_at || item?.last_event_at || '').getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return false;
  return Math.abs(updatedAt - createdAt) <= 60_000;
};

const getResponsibilityOverlayBody = (item: any) => {
  const moduleTitle = getResponsibilityModuleTitle(item?.module_id);
  return isNewResponsibilityAssignment(item)
    ? `یک ${moduleTitle} جدید ایجاد شد.`
    : `یک ${moduleTitle} به شما ارجاع داده شد.`;
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

const isSystemNote = isInternalSystemNoteRow;

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
    directory,
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

// Returns a referentially stable callback that always invokes the latest fn.
// Used to keep the memoized panel contexts stable while passing handlers that
// close over fresh state on every render.
const useStableCallback = <T extends (...args: any[]) => any>(fn: T): T => {
  const ref = useRef(fn);
  ref.current = fn;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(((...args: any[]) => ref.current(...args)) as T, []);
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
  requestedConversationKey,
  requestedBotGroupId,
  standalone = false,
  managedByRuntime = false,
  controlledOpen,
  renderTrigger = true,
  onOpenChange,
  onAfterClose,
  requestedBotDirectThreadId,
}) => {
  const notificationRuntime = useNotificationRuntime();
  const runtimeRefreshSummary = notificationRuntime.refreshSummary;
  const { message } = App.useApp();
  const navigate = useNavigate();
  // Last opened tab/conversation (per device). Only the standalone chat page
  // restores it, and only when the URL did not request a specific target.
  const storedLastStateRef = useRef(
    variant === 'chat' && standalone && !requestedTab && !requestedConversationKey && !requestedBotGroupId && !requestedBotDirectThreadId
      ? loadMessagesLastState()
      : null,
  );
  const initialTab = normalizeTabForVariant(
    variant,
    requestedTab || (storedLastStateRef.current?.tab as DrawerTabKey | undefined),
  );
  const [open, setOpen] = useState(standalone);
  const [drawerContentMounted, setDrawerContentMounted] = useState(standalone);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteLikeNotifications, setNoteLikeNotifications] = useState<NotificationInboxItemRow[]>([]);
  // tasks and responsibilities are managed by hooks (see below)
  const [botGroups, setBotGroups] = useState<CounterpartyBotGroupRow[]>([]);
  const [selectedBotGroupId, setSelectedBotGroupId] = useState<string | null>(
    () => String(storedLastStateRef.current?.botGroupId || '').trim() || null,
  );
  const [botDirectThreads, setBotDirectThreads] = useState<BotDirectThreadRow[]>([]);
  const [selectedBotDirectThreadId, setSelectedBotDirectThreadId] = useState<string | null>(
    () => String((storedLastStateRef.current as any)?.botDirectThreadId || '').trim() || null,
  );
  const [botDirectThreadSearch, setBotDirectThreadSearch] = useState('');
  const [botDirectMessageSearch, setBotDirectMessageSearch] = useState('');
  const [botDirectMessageText, setBotDirectMessageText] = useState('');
  const [botDirectMessages, setBotDirectMessages] = useState<BotDirectMessageRow[]>([]);
  const [botDirectSending, setBotDirectSending] = useState(false);
  const [botDirectSuggesting, setBotDirectSuggesting] = useState(false);
  const [botDirectAttachments, setBotDirectAttachments] = useState<File[]>([]);
  const [botDirectLinkedAttachments, setBotDirectLinkedAttachments] = useState<NoteAttachment[]>([]);
  const [mobileBotDirectSearchOpen, setMobileBotDirectSearchOpen] = useState(false);
  const [botMessageText, setBotMessageText] = useState('');
  const [botSending, setBotSending] = useState(false);
  const [botSuggesting, setBotSuggesting] = useState(false);
  const [botDirectAiPopoverOpen, setBotDirectAiPopoverOpen] = useState(false);
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
  const [botIdentityBindModalOpen, setBotIdentityBindModalOpen] = useState(false);
  const [botIdentityBindModalLoading, setBotIdentityBindModalLoading] = useState(false);
  const [botIdentityBindModalSaving, setBotIdentityBindModalSaving] = useState(false);
  const [botIdentityBindDraft, setBotIdentityBindDraft] = useState<BotChatIdentityBindDraft | null>(null);
  const [botIdentityBindTargetModuleId, setBotIdentityBindTargetModuleId] = useState<BotTargetModuleId>('customers');
  const [botIdentityBindTargetRecordId, setBotIdentityBindTargetRecordId] = useState<string | null>(null);
  const [botIdentityAllowedUserIds, setBotIdentityAllowedUserIds] = useState<string[]>([]);
  const [botIdentityAllowedRoleIds, setBotIdentityAllowedRoleIds] = useState<string[]>([]);
  const [botIdentityAiAutoReplyEnabled, setBotIdentityAiAutoReplyEnabled] = useState(false);
  const [botIdentityAiCounterpartyGuide, setBotIdentityAiCounterpartyGuide] = useState('');
  const [botIdentityMemberGroups, setBotIdentityMemberGroups] = useState<BotIdentityMemberGroup[]>([]);
  const [botAiPopoverOpen, setBotAiPopoverOpen] = useState(false);
  const [botGroupSearch, setBotGroupSearch] = useState('');
  const [botMessageSearch, setBotMessageSearch] = useState('');
  const [botNotificationMessages, setBotNotificationMessages] = useState<CounterpartyBotMessageRow[]>([]);
  const [botDirectNotificationMessages, setBotDirectNotificationMessages] = useState<BotDirectMessageRow[]>([]);
  const [smsMessages, setSmsMessages] = useState<any[]>([]);
  const [phoneIdentityBindModalOpen, setPhoneIdentityBindModalOpen] = useState(false);
  const [phoneIdentityBindModalLoading, setPhoneIdentityBindModalLoading] = useState(false);
  const [phoneIdentityBindModalSaving, setPhoneIdentityBindModalSaving] = useState(false);
  const [phoneIdentityBindDraft, setPhoneIdentityBindDraft] = useState<PhoneIdentityBindDraft | null>(null);
  const [phoneIdentityBindTargetModuleId, setPhoneIdentityBindTargetModuleId] = useState<PhoneBindTargetModuleId>('customers');
  const [phoneIdentityBindTargetRecordId, setPhoneIdentityBindTargetRecordId] = useState<string | null>(null);
  const [phoneIdentityBindSearch, setPhoneIdentityBindSearch] = useState('');
  const [phoneIdentityBindOptions, setPhoneIdentityBindOptions] = useState<Array<{ value: string; label: string; meta?: string | null }>>([]);
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
  const [panelVisibleCounts, setPanelVisibleCounts] = useState({ tasks: MAX_ITEMS, responsibilities: MAX_ITEMS });
  const [taskViewKey, setTaskViewKey] = useState<TaskViewPresetKey>('all');
  const [taskSortDirection, setTaskSortDirection] = useState<CreatedSortDirection>('desc');
  const [profile, setProfile] = useState<{ id: string | null; role_id: string | null; org_id?: string | null; full_name?: string | null; avatar_url?: string | null; voip_extension?: string | null; can_view_all_calls?: boolean; software_role?: string | null }>({ id: null, role_id: null, org_id: null, full_name: null, avatar_url: null });
  const [currentPermissionMap, setCurrentPermissionMap] = useState<PermissionMap | null>(null);

  // ── Activity & Responsibility hooks (optimized: cache + efficient queries) ──
  const detailRuntimeEnabled = variant === 'alerts' && (standalone || open);
  const { tasks, setTasks, loading: loadingTasks, refresh: refreshTasks } = useMyActivities({
    userId: profile.id,
    roleId: profile.role_id,
    enabled: Boolean(profile.id) && detailRuntimeEnabled,
  });
  const { responsibilities, loading: loadingResponsibilities, refresh: refreshResponsibilities } = useMyResponsibilities({
    userId: profile.id,
    roleId: profile.role_id,
    enabled: Boolean(profile.id) && detailRuntimeEnabled,
  });

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
  const [selectedNoteUserId, setSelectedNoteUserId] = useState<string | null>(() => {
    if (variant !== 'chat') return null;
    // Return to the last opened conversation; only the very first visit (no
    // stored state on this device) lands on system messages.
    const stored = storedLastStateRef.current;
    if (stored && 'noteConversationId' in stored) return stored.noteConversationId ?? null;
    return SYSTEM_MESSAGES_USER_ID;
  });
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
  const [seenSmsMessageIds, setSeenSmsMessageIds] = useState<Set<string>>(() => new Set());
  const [seenVoipCallIds, setSeenVoipCallIds] = useState<Set<string>>(() => new Set());
  const [dismissedUiNotificationIds, setDismissedUiNotificationIds] = useState<Set<string>>(() => new Set());
  const [notificationStateMap, setNotificationStateMap] = useState<Record<string, NotificationStateEntry>>({});
  const [notificationReadStateReady, setNotificationReadStateReady] = useState(false);
  const [notificationReadStateFallbackMode, setNotificationReadStateFallbackMode] = useState(false);
  const [unreadSummary, setUnreadSummary] = useState<NotificationUnreadSummaryMap>(EMPTY_NOTIFICATION_UNREAD_SUMMARY);
  const [unreadSummaryAvailable, setUnreadSummaryAvailable] = useState(false);
  const [uiNotifications, setUiNotifications] = useState<UiNotificationItem[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  // loadingTasks and loadingResponsibilities come from hooks (see below)
  const [loadingBotMessages, setLoadingBotMessages] = useState(false);
  const [loadingBotDirectMessages, setLoadingBotDirectMessages] = useState(false);
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
    bot_direct_messages: 0,
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
  const botDirectMessagesScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingBotScrollRestoreRef = useRef<number | null>(null);
  const botShouldStickToBottomRef = useRef(true);
  const botForceScrollToBottomRef = useRef(false);
  const botDirectShouldStickToBottomRef = useRef(true);
  const botDirectForceScrollToBottomRef = useRef(false);
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
  const botDirectMessagesRef = useRef<BotDirectMessageRow[]>([]);
  const botDirectMessagesThreadIdRef = useRef<string | null>(null);
  const hydratingBotMessageIdsRef = useRef<Set<string>>(new Set());
  const botHydrationFailuresRef = useRef<Map<string, { attempts: number; lastAttemptAt: number }>>(new Map());
  const loggedBotHydrationFailuresRef = useRef<Set<string>>(new Set());
  const botStatusWatchTimerRef = useRef<number | null>(null);
  const botGroupsEnrichSeqRef = useRef(0);
  const backgroundSectionRefreshTimerRef = useRef<number | null>(null);
  const communicationReadCursorInFlightRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const communicationReadCursorRecentRef = useRef<Map<string, number>>(new Map());

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
  const moduleOptions = useMemo(() => Object.values(MODULES)
    .filter((mod: any) => mod?.id && (mod?.table || mod?.id))
    .map((mod: any) => ({ label: mod.titles?.fa || mod.id, value: mod.id })), []);
  const {
    items: rpcBotConversationSummaries,
    available: botConversationSummaryAvailable,
    refresh: refreshBotConversationSummaries,
    setItems: setRpcBotConversationSummaries,
  } = useNotificationConversationList({
    supabase,
    section: 'bot_messages',
    enabled: variant === 'chat' && activeDrawerSection === 'bot_messages' && Boolean(profile.id),
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
    enabled: variant === 'chat' && activeDrawerSection === 'notes' && Boolean(profile.id),
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
    if (!(botConversationSummaryAvailable && rpcBotConversationSummaries)) {
      return botGroups.filter(isActiveCounterpartyBotGroup);
    }
    const localById = new Map(botGroups.map((row) => [String(row.id), row] as const));
    const summaryRows = (rpcBotConversationSummaries || [])
      .map((summary) => {
        const botGroupId = String(summary?.bot_group_id || '').trim();
        if (!botGroupId) return null;
        const row = localById.get(botGroupId);
        const merged = row ? {
          ...row,
          group_title: String(summary.title || row.group_title || '').trim() || row.group_title,
          status: String(summary.status || row.status || '').trim() || row.status,
          channel_type: String(summary.channel_type || row.channel_type || '').trim() || row.channel_type,
          counterparty_label: summary.counterparty_label || row.counterparty_label || null,
          bot_chat_id: summary.bot_chat_id || row.bot_chat_id || null,
        } : {
          id: botGroupId,
          target_type: '',
          customer_id: null,
          supplier_id: null,
          channel_type: String(summary.channel_type || '').trim(),
          status: String(summary.status || '').trim() || 'active',
          group_title: String(summary.title || '').trim() || 'گروه بات',
          group_join_link: null,
          bot_chat_id: summary.bot_chat_id || null,
          updated_at: summary.latest_message_at,
          last_inbound_at: null,
          last_outbound_at: null,
          metadata: null,
          counterparty_label: summary.counterparty_label || summary.subtitle || null,
          counterparty_image_url: null,
        } as CounterpartyBotGroupRow;
        return merged;
      })
      .filter(Boolean)
      .filter(isActiveCounterpartyBotGroup) as CounterpartyBotGroupRow[];
    const summaryIds = new Set(summaryRows.map((row) => String(row.id)));
    const localOnlyRows = botGroups.filter((row) => !summaryIds.has(String(row.id)) && isActiveCounterpartyBotGroup(row));
    return [...summaryRows, ...localOnlyRows].sort((left, right) => {
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
  const filteredBotDirectThreads = useMemo(() => {
    const search = String(botDirectThreadSearch || '').trim().toLowerCase();
    if (!search) return botDirectThreads;
    return botDirectThreads.filter((row) => {
      const haystack = [
        row.counterparty_label,
        row.display_name,
        row.username,
        row.phone_number,
        row.chat_id,
      ]
        .map((value) => String(value || '').trim().toLowerCase())
        .join(' ');
      return haystack.includes(search);
    });
  }, [botDirectThreadSearch, botDirectThreads]);
  const selectedBotDirectThread = useMemo(
    () => filteredBotDirectThreads.find((row) => String(row.id) === String(selectedBotDirectThreadId || ''))
      || botDirectThreads.find((row) => String(row.id) === String(selectedBotDirectThreadId || ''))
      || null,
    [botDirectThreads, filteredBotDirectThreads, selectedBotDirectThreadId],
  );
  const botDirectThreadByIdentityKey = useMemo(
    () => botDirectThreads.reduce<Record<string, BotDirectThreadRow>>((acc, row) => {
      const channel = String(row.channel_type || '').trim();
      const chatId = String(row.chat_id || '').trim();
      if (channel && chatId) acc[`${channel}:${chatId}`] = row;
      return acc;
    }, {}),
    [botDirectThreads],
  );
  const visibleBotGroupIds = useMemo(
    () => new Set(effectiveBotGroups.map((row) => String(row.id || '').trim()).filter(Boolean)),
    [effectiveBotGroups]
  );

  const applyBotTargetFilter = useCallback((
    query: any,
    targetType: BotTargetModuleId,
    counterpartyId: string,
  ) => {
    if (targetType === 'customers') return query.eq('customer_id', counterpartyId);
    if (targetType === 'suppliers') return query.eq('supplier_id', counterpartyId);
    return query.eq('employee_id', counterpartyId);
  }, []);

  const getBotTargetRecordIdFromGroup = useCallback((group: CounterpartyBotGroupRow | null | undefined) => {
    const targetType = String(group?.target_type || '').trim();
    if (targetType === 'customers') return String(group?.customer_id || '').trim() || null;
    if (targetType === 'suppliers') return String(group?.supplier_id || '').trim() || null;
    if (targetType === 'employees') return String(group?.employee_id || '').trim() || null;
    return null;
  }, []);

  const clearBotStatusWatchTimer = useCallback(() => {
    if (botStatusWatchTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(botStatusWatchTimerRef.current);
      botStatusWatchTimerRef.current = null;
    }
  }, []);

  const loadBotStatusRow = useCallback(async (group: CounterpartyBotGroupRow, options?: { activeTab?: BotChannel | null }) => {
    const orgPrefix = await loadOrgBotPrefix();
    const counterpartyLabel = String(group?.counterparty_label || '').trim();
    const targetType = String(group?.target_type || '').trim() as BotTargetModuleId;
    const counterpartyId = getBotTargetRecordIdFromGroup(group);
    if (!counterpartyId) return;

    let groupQuery = supabase
      .from('counterparty_bot_groups')
      .select('id, channel_type, status, group_title, group_join_link, metadata, last_inbound_at, bot_chat_id')
      .limit(10);
    groupQuery = applyBotTargetFilter(groupQuery, targetType, counterpartyId);
    const { data: rows, error } = await groupQuery;
    if (error) throw error;
    const rowMap = new Map((rows || []).map((row: any) => [String(row?.channel_type || '').trim(), row] as const));

    let prefQuery = supabase.from('counterparty_bot_config').select('default_channel, fallback_to_active').limit(1);
    prefQuery = applyBotTargetFilter(prefQuery, targetType, counterpartyId);
    const [prefResult, targetRecordResult] = await Promise.all([
      prefQuery.maybeSingle(),
      supabase
        .from(targetType)
        .select(BOT_CHANNELS.map((channel) => getBotChatIdFieldKey(channel)).join(','))
        .eq('id', counterpartyId)
        .maybeSingle(),
    ]);
    const { data: prefRow } = prefResult;
    const targetRecord = targetRecordResult.data || null;
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
    const currentProfileId = String(profile.id || '').trim();
    for (const channel of BOT_CHANNELS) {
      const row = rowMap.get(channel) || null;
      const metadata = (row?.metadata && typeof row.metadata === 'object') ? row.metadata : {};
      const existingCode = String(metadata?.activation_code || '').trim().toUpperCase();
      const rowId = String(row?.id || '').trim();
      const inbound = rowId ? inboundMap.get(rowId) : null;
      const rawStatus = String(row?.status || 'pending_join').trim();
      const rawAllowedUserIds = Array.isArray(metadata?.allowed_user_ids)
        ? metadata.allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      platforms[channel] = {
        groupTitle: String(row?.group_title || '').trim(),
        groupJoinLink: String(row?.group_join_link || '').trim(),
        directChatId: String((targetRecord as any)?.[getBotChatIdFieldKey(channel)] || '').trim(),
        currentStatus: rawStatus === 'pending_join_link' ? 'pending_join' : (rawStatus || 'pending_join'),
        activationCode: existingCode || createBotActivationCode(counterpartyLabel, orgPrefix),
        lastInboundAt: String(inbound?.created_at || row?.last_inbound_at || '').trim(),
        lastInboundText: String(inbound?.content_text || '').trim(),
        allowedUserIds: rawAllowedUserIds.length > 0 ? rawAllowedUserIds : (currentProfileId ? [currentProfileId] : []),
        allowedRoleIds: Array.isArray(metadata?.allowed_role_ids) ? metadata.allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean) : [],
        aiAutoReplyEnabled: Boolean(metadata?.ai_auto_reply_enabled),
        aiCounterpartyGuide: String(metadata?.ai_counterparty_guide || '').trim(),
      };
    }

    setBotStatusPlatformData(platforms);
    setBotStatusDefaultChannel(defaultChannel);
    setBotStatusFallbackToActive(Boolean(prefRow?.fallback_to_active));
    setBotStatusActiveTab(options?.activeTab || defaultChannel);
  }, [applyBotTargetFilter, getBotTargetRecordIdFromGroup, profile.id]);

  const saveBotStatusSettings = useCallback(async (options?: { forceCapture?: boolean; captureChannel?: BotChannel; captureSeconds?: number }) => {
    if (!selectedBotGroup) return;
    const forceCapture = options?.forceCapture === true;
    const captureChannel = options?.captureChannel || botStatusActiveTab;
    const captureSeconds = Number(options?.captureSeconds || 30);
    const nowIso = new Date().toISOString();
    const captureExpiresAt = forceCapture ? new Date(Date.now() + Math.max(10, captureSeconds) * 1000).toISOString() : null;
    const targetType = String(selectedBotGroup.target_type || '').trim() as BotTargetModuleId;
    const counterpartyId = getBotTargetRecordIdFromGroup(selectedBotGroup);
    const currentOrgId = String(profile.org_id || '').trim();
    if (!counterpartyId || !currentOrgId) {
      throw new Error('اطلاعات رکورد یا سازمان برای ذخیره تنظیمات بات کامل نیست.');
    }

    for (const channel of BOT_CHANNELS) {
      const platformState = botStatusPlatformData[channel];
      if (!platformState) continue;
      const isCapturing = forceCapture && channel === captureChannel;
      let existingQuery = supabase.from('counterparty_bot_groups').select('id, status, bot_chat_id, metadata').eq('channel_type', channel).limit(1);
      existingQuery = applyBotTargetFilter(existingQuery, targetType, counterpartyId);
      const { data: existingRows } = await existingQuery;
      const existingRow = Array.isArray(existingRows) ? existingRows[0] : null;
      const existingStatus = String(existingRow?.status || '').trim() === 'pending_join_link' ? 'pending_join' : String(existingRow?.status || '').trim();
      const existingChatId = String(existingRow?.bot_chat_id || '').trim();
      const existingMetadata = (existingRow?.metadata && typeof existingRow.metadata === 'object') ? existingRow.metadata : {};
      const nextStatus = isCapturing ? 'pending_join' : ((existingStatus === 'active' && existingChatId) ? 'active' : 'pending_join');
      const payload: Record<string, any> = {
        target_type: targetType, channel_type: channel, status: nextStatus,
        group_title: String(platformState.groupTitle || '').trim() || null,
        group_join_link: String(platformState.groupJoinLink || '').trim() || null,
        metadata: { ...existingMetadata, activation_code: String(platformState.activationCode || '').trim().toUpperCase(), activation_required: true, capture_mode: isCapturing, capture_started_at: isCapturing ? nowIso : null, capture_expires_at: isCapturing ? captureExpiresAt : null, last_capture_channel: isCapturing ? channel : existingMetadata?.last_capture_channel, allowed_user_ids: platformState.allowedUserIds, allowed_role_ids: platformState.allowedRoleIds, ai_auto_reply_enabled: platformState.aiAutoReplyEnabled, ai_counterparty_guide: String(platformState.aiCounterpartyGuide || '').trim() || null, activation_confirmation_sent: isCapturing ? false : Boolean(existingMetadata?.activation_confirmation_sent), last_capture_error: isCapturing ? null : existingMetadata?.last_capture_error, activation_updated_at: nowIso },
        updated_by: null, customer_id: targetType === 'customers' ? counterpartyId : null, supplier_id: targetType === 'suppliers' ? counterpartyId : null, employee_id: targetType === 'employees' ? counterpartyId : null,
      };
      if (existingRow?.id) {
        const { error } = await supabase.from('counterparty_bot_groups').update(payload).eq('id', String(existingRow.id));
        if (error) throw error;
      } else {
        const { error } = await supabase.from('counterparty_bot_groups').insert([payload]);
        if (error) throw error;
      }

      await syncBotDirectChatIdForTarget({
        client: supabase,
        orgId: currentOrgId,
        moduleId: targetType,
        recordId: counterpartyId,
        channel,
        chatId: String(platformState.directChatId || '').trim() || null,
        previousChatId: String((selectedBotGroup as any)?.[getBotChatIdFieldKey(channel)] || '').trim() || null,
      });
    }

    // ذخیره تنظیمات پیش‌فرض در counterparty_bot_config
    const configPayload = {
      org_id: currentOrgId,
      default_channel: botStatusDefaultChannel,
      fallback_to_active: botStatusFallbackToActive,
      customer_id: targetType === 'customers' ? counterpartyId : null,
      supplier_id: targetType === 'suppliers' ? counterpartyId : null,
      employee_id: targetType === 'employees' ? counterpartyId : null,
    };
    let existingConfigQuery = supabase.from('counterparty_bot_config').select('id').limit(1);
    existingConfigQuery = applyBotTargetFilter(existingConfigQuery, targetType, counterpartyId);
    const { data: existingConfigRow } = await existingConfigQuery.maybeSingle();
    if (existingConfigRow?.id) {
      const { error } = await supabase.from('counterparty_bot_config').update(configPayload).eq('id', String(existingConfigRow.id));
      if (error) throw error;
    } else {
      const { error } = await supabase.from('counterparty_bot_config').insert([configPayload]);
      if (error) throw error;
    }
  }, [applyBotTargetFilter, botStatusActiveTab, botStatusDefaultChannel, botStatusFallbackToActive, botStatusPlatformData, getBotTargetRecordIdFromGroup, profile.org_id, selectedBotGroup]);

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
      await loadBotStatusRow(selectedBotGroup, { activeTab: botStatusActiveTab });
      message.success('وضعیت گروه بات ذخیره شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره وضعیت گروه بات ناموفق بود.'));
    } finally {
      setBotStatusModalSaving(false);
    }
  }, [botStatusActiveTab, loadBotStatusRow, message, saveBotStatusSettings, selectedBotGroup]);
  const handleStartBotBindWatch = useCallback(async (channel: BotChannel) => {
    if (!selectedBotGroup) return;
    try {
      setBotStatusModalSaving(true);
      await saveBotStatusSettings({ forceCapture: true, captureChannel: channel, captureSeconds: BOT_BIND_CAPTURE_SECONDS });
      await loadBotStatusRow(selectedBotGroup, { activeTab: channel });
      clearBotStatusWatchTimer();
      setBotStatusWatchingChannel(channel);
      setBotStatusCountdown(BOT_BIND_CAPTURE_SECONDS);
      let remaining = BOT_BIND_CAPTURE_SECONDS;
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
    const targetType = String(selectedBotGroup.target_type || '').trim();
    return isBotTargetModuleId(targetType) ? targetType : null;
  }, [selectedBotGroup]);
  const selectedBotRecordId = useMemo(() => {
    if (!selectedBotGroup) return null;
    if (selectedBotModuleId === 'customers') return String(selectedBotGroup.customer_id || '').trim() || null;
    if (selectedBotModuleId === 'suppliers') return String(selectedBotGroup.supplier_id || '').trim() || null;
    if (selectedBotModuleId === 'employees') return String(selectedBotGroup.employee_id || '').trim() || null;
    return null;
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

  const closeBotIdentityBindModal = useCallback(() => {
    setBotIdentityBindModalOpen(false);
    setBotIdentityBindModalLoading(false);
    setBotIdentityBindModalSaving(false);
    setBotIdentityBindDraft(null);
    setBotIdentityBindTargetModuleId('customers');
    setBotIdentityBindTargetRecordId(null);
    setBotIdentityAllowedUserIds([]);
    setBotIdentityAllowedRoleIds([]);
    setBotIdentityAiAutoReplyEnabled(false);
    setBotIdentityAiCounterpartyGuide('');
    setBotIdentityMemberGroups([]);
  }, []);

  const openBotIdentityBindModalForIdentity = useCallback(async ({
    channel,
    chatId,
    displayName,
    username,
    phoneNumber,
    sourceGroupId,
  }: {
    channel: BotChannel;
    chatId: string;
    displayName?: string | null;
    username?: string | null;
    phoneNumber?: string | null;
    sourceGroupId?: string | null;
  }) => {
    const normalizedChatId = String(chatId || '').trim();
    if (!channel || !BOT_CHANNELS.includes(channel) || !normalizedChatId) {
      message.warning('اطلاعات لازم برای تنظیم حساب شخصی این کاربر کامل نیست.');
      return;
    }
    setBotIdentityBindModalOpen(true);
    setBotIdentityBindModalLoading(true);
    setBotIdentityBindDraft({
      channel,
      chatId: normalizedChatId,
      threadId: null,
      displayName: String(displayName || '').trim(),
      username: String(username || '').trim().replace(/^@+/, ''),
      phoneNumber: String(phoneNumber || '').trim(),
      existingBinding: null,
    });
    setBotIdentityBindTargetModuleId('customers');
    setBotIdentityBindTargetRecordId(null);
    setBotIdentityAllowedUserIds(String(profile.id || '').trim() ? [String(profile.id || '').trim()] : []);
    setBotIdentityAllowedRoleIds([]);
    setBotIdentityAiAutoReplyEnabled(false);
    setBotIdentityAiCounterpartyGuide('');
    try {
      const normalizedOrgId = String(profile.org_id || '').trim();
      const [bindingResult, threadResult, membershipResult, groupResult] = await Promise.all([
        supabase
          .from('bot_chat_identity_bindings')
          .select('id,target_module_id,target_record_id,display_name,username,phone_number,profile_id')
          .eq('org_id', normalizedOrgId)
          .eq('channel_type', channel)
          .eq('chat_id', normalizedChatId)
          .maybeSingle(),
        supabase
          .from('counterparty_bot_direct_threads')
          .select('id,metadata,display_name,username,phone_number,target_module_id,target_record_id')
          .eq('org_id', normalizedOrgId)
          .eq('channel_type', channel)
          .eq('chat_id', normalizedChatId)
          .maybeSingle(),
        supabase
          .from('counterparty_bot_messages')
          .select('bot_group_id,created_at')
          .eq('direction', 'inbound')
          .or(`payload->>sender_id.eq.${normalizedChatId},payload->>user_id.eq.${normalizedChatId},payload->>object_guid.eq.${normalizedChatId}`)
          .order('created_at', { ascending: false })
          .limit(400),
        String(sourceGroupId || '').trim()
          ? supabase
              .from('counterparty_bot_groups')
              .select('metadata')
              .eq('org_id', normalizedOrgId)
              .eq('id', String(sourceGroupId || '').trim())
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);
      if (bindingResult.error) throw bindingResult.error;
      if (threadResult.error) throw threadResult.error;
      if (membershipResult.error) throw membershipResult.error;
      if (groupResult.error) throw groupResult.error;
      const threadRow = threadResult.data as Record<string, any> | null;
      const threadMetadata = threadRow?.metadata && typeof threadRow.metadata === 'object' ? threadRow.metadata : {};
      const groupMetadata = groupResult.data?.metadata && typeof groupResult.data.metadata === 'object' ? groupResult.data.metadata : {};
      const existingBinding = (bindingResult.data || null) as BotIdentityBindingRow | null;
      const initialTargetModuleId = isBotTargetModuleId(String(existingBinding?.target_module_id || '').trim())
        ? String(existingBinding?.target_module_id || '').trim() as BotTargetModuleId
        : isBotTargetModuleId(String(threadRow?.target_module_id || '').trim())
          ? String(threadRow?.target_module_id || '').trim() as BotTargetModuleId
          : 'customers';
      setBotIdentityBindDraft({
        channel,
        chatId: normalizedChatId,
        threadId: String(threadRow?.id || '').trim() || null,
        displayName: String(displayName || existingBinding?.display_name || threadRow?.display_name || '').trim(),
        username: String(username || existingBinding?.username || threadRow?.username || '').trim().replace(/^@+/, ''),
        phoneNumber: String(phoneNumber || existingBinding?.phone_number || threadRow?.phone_number || '').trim(),
        existingBinding,
      });
      setBotIdentityBindTargetModuleId(initialTargetModuleId);
      setBotIdentityBindTargetRecordId(String(existingBinding?.target_record_id || threadRow?.target_record_id || '').trim() || null);
      const rawAllowedUserIds = Array.isArray((threadMetadata as any)?.allowed_user_ids)
        ? (threadMetadata as any).allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const groupAllowedUserIds = Array.isArray((groupMetadata as any)?.allowed_user_ids)
        ? (groupMetadata as any).allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const rawAllowedRoleIds = Array.isArray((threadMetadata as any)?.allowed_role_ids)
        ? (threadMetadata as any).allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const groupAllowedRoleIds = Array.isArray((groupMetadata as any)?.allowed_role_ids)
        ? (groupMetadata as any).allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const currentProfileId = String(profile.id || '').trim();
      setBotIdentityAllowedUserIds(
        rawAllowedUserIds.length > 0
          ? rawAllowedUserIds
          : (groupAllowedUserIds.length > 0 ? groupAllowedUserIds : (currentProfileId ? [currentProfileId] : [])),
      );
      setBotIdentityAllowedRoleIds(rawAllowedRoleIds.length > 0 ? rawAllowedRoleIds : groupAllowedRoleIds);
      setBotIdentityAiAutoReplyEnabled(Boolean((threadMetadata as any)?.ai_auto_reply_enabled ?? (groupMetadata as any)?.ai_auto_reply_enabled));
      setBotIdentityAiCounterpartyGuide(String((threadMetadata as any)?.ai_counterparty_guide || (groupMetadata as any)?.ai_counterparty_guide || '').trim());
      const statusLabelMap: Record<string, string> = {
        active: 'فعال',
        pending_join: 'در انتظار اتصال',
        inactive: 'غیرفعال',
        disabled: 'غیرفعال',
      };
      const recentGroupRows = Array.isArray(membershipResult.data) ? membershipResult.data as Array<Record<string, any>> : [];
      const groupActivityMap = new Map<string, string>();
      recentGroupRows.forEach((row) => {
        const groupId = String(row?.bot_group_id || '').trim();
        const createdAt = String(row?.created_at || '').trim();
        if (!groupId || groupActivityMap.has(groupId)) return;
        groupActivityMap.set(groupId, createdAt);
      });
      const effectiveGroupIds = Array.from(new Set([
        String(sourceGroupId || '').trim(),
        ...Array.from(groupActivityMap.keys()),
      ].filter(Boolean)));
      setBotIdentityMemberGroups(
        effectiveGroupIds.map((groupId) => {
          const groupRow = botGroups.find((row) => String(row?.id || '').trim() === groupId) || null;
          const groupChannel = String(groupRow?.channel_type || channel || '').trim();
          return {
            id: groupId,
            title: String(groupRow?.group_title || groupRow?.counterparty_label || groupRow?.group_join_link || groupId).trim() || groupId,
            channelLabel: `گروه بات ${BOT_CHANNEL_LABELS_FA[groupChannel] || groupChannel || '-'}`,
            statusLabel: statusLabelMap[String(groupRow?.status || '').trim()] || (String(groupRow?.status || '').trim() || null),
            lastActivityAt: safeJalaliFormat(groupActivityMap.get(groupId) || null, 'YYYY/MM/DD HH:mm') || null,
          };
        }),
      );
    } catch (error: any) {
      setBotIdentityBindModalOpen(false);
      message.error(toFaErrorMessage(error, 'خواندن اتصال چت آیدی ناموفق بود.'));
    } finally {
      setBotIdentityBindModalLoading(false);
    }
  }, [botGroups, message, profile.id, profile.org_id]);

  const openBotIdentityBindModal = useCallback(async (row: CounterpartyBotMessageRow) => {
    const channel = String(selectedBotGroup?.channel_type || '').trim() as BotChannel;
    if (!channel || !BOT_CHANNELS.includes(channel)) {
      message.warning('پلتفرم پیام برای اتصال sender مشخص نیست.');
      return;
    }
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const chatId = String(
      (payload as any)?.sender_id
      || (payload as any)?.user_id
      || (payload as any)?.object_guid
      || row?.chat_id
      || ''
    ).trim();
    if (!chatId) {
      message.warning('برای این پیام chat id فرستنده پیدا نشد.');
      return;
    }
    await openBotIdentityBindModalForIdentity({
      channel,
      chatId,
      displayName: String((payload as any)?.sender_display_name || '').trim(),
      username: String((payload as any)?.username || '').trim().replace(/^@+/, ''),
      phoneNumber: String((payload as any)?.phone_number || '').trim(),
      sourceGroupId: String(row?.bot_group_id || '').trim() || null,
    });
  }, [message, openBotIdentityBindModalForIdentity, selectedBotGroup]);

  const saveBotIdentityBinding = useCallback(async () => {
    const draft = botIdentityBindDraft;
    const orgId = String(profile.org_id || '').trim();
    const targetRecordId = String(botIdentityBindTargetRecordId || '').trim();
    if (!draft || !orgId) {
      throw new Error('اطلاعات لازم برای اتصال چت آیدی کامل نیست.');
    }
    if (!targetRecordId) {
      throw new Error('رکورد مقصد را انتخاب کنید.');
    }
    setBotIdentityBindModalSaving(true);
    try {
      const previousModuleId = String(draft.existingBinding?.target_module_id || '').trim();
      const previousRecordId = String(draft.existingBinding?.target_record_id || '').trim();
      if (
        isBotTargetModuleId(previousModuleId)
        && previousRecordId
        && (previousModuleId !== botIdentityBindTargetModuleId || previousRecordId !== targetRecordId)
      ) {
        await syncBotDirectChatIdForTarget({
          client: supabase,
          orgId,
          moduleId: previousModuleId,
          recordId: previousRecordId,
          channel: draft.channel,
          chatId: null,
          previousChatId: draft.chatId,
        });
      }
      const directThreadMetadata = {
        allowed_user_ids: botIdentityAllowedUserIds,
        allowed_role_ids: botIdentityAllowedRoleIds,
        ai_auto_reply_enabled: botIdentityAiAutoReplyEnabled,
        ai_counterparty_guide: String(botIdentityAiCounterpartyGuide || '').trim() || null,
      };
      await syncBotDirectChatIdForTarget({
        client: supabase,
        orgId,
        moduleId: botIdentityBindTargetModuleId,
        recordId: targetRecordId,
        channel: draft.channel,
        chatId: draft.chatId,
        previousChatId: draft.chatId,
        username: draft.username || null,
        phoneNumber: draft.phoneNumber || null,
        displayName: null,
        threadMetadata: directThreadMetadata,
      });
      await Promise.all([
        fetchBotDirectThreads(),
        refreshSection('bot_messages', { force: true }),
        refreshSection('bot_direct_messages', { force: true }),
      ]);
      message.success('اتصال چت آیدی ذخیره شد.');
      closeBotIdentityBindModal();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره اتصال چت آیدی ناموفق بود.'));
    } finally {
      setBotIdentityBindModalSaving(false);
    }
  }, [botIdentityAiAutoReplyEnabled, botIdentityAiCounterpartyGuide, botIdentityAllowedRoleIds, botIdentityAllowedUserIds, botIdentityBindDraft, botIdentityBindTargetModuleId, botIdentityBindTargetRecordId, closeBotIdentityBindModal, message, profile.org_id]);

  useEffect(() => {
    if (!phoneIdentityBindModalOpen) return;
    let cancelled = false;
    setPhoneIdentityBindModalLoading(true);
    void searchPhoneBindingTargets({
      client: supabase,
      moduleId: phoneIdentityBindTargetModuleId,
      search: phoneIdentityBindSearch,
      limit: 30,
    })
      .then((options) => {
        if (!cancelled) setPhoneIdentityBindOptions(options);
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('Could not load phone identity bind targets', error);
          setPhoneIdentityBindOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setPhoneIdentityBindModalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phoneIdentityBindModalOpen, phoneIdentityBindSearch, phoneIdentityBindTargetModuleId]);

  const closePhoneIdentityBindModal = useCallback(() => {
    setPhoneIdentityBindModalOpen(false);
    setPhoneIdentityBindModalLoading(false);
    setPhoneIdentityBindModalSaving(false);
    setPhoneIdentityBindDraft(null);
    setPhoneIdentityBindTargetModuleId('customers');
    setPhoneIdentityBindTargetRecordId(null);
    setPhoneIdentityBindSearch('');
    setPhoneIdentityBindOptions([]);
  }, []);

  const openPhoneIdentityBindModal = useCallback(async ({
    phoneNumberId,
    phone,
    moduleId,
    recordId,
    phoneMatchStatus,
  }: {
    phoneNumberId?: string | null;
    phone: string;
    moduleId?: string | null;
    recordId?: string | null;
    phoneMatchStatus?: string | null;
  }) => {
    const normalizedPhone = String(phone || '').trim();
    if (!normalizedPhone) {
      message.warning('برای این مورد شماره‌ای پیدا نشد.');
      return;
    }
    setPhoneIdentityBindModalOpen(true);
    setPhoneIdentityBindModalLoading(true);
    try {
      const normalizedPhoneNumberId = String(phoneNumberId || '').trim() || null;
      let existingBindingLabel = '';
      let existingTargetModuleId: PhoneBindTargetModuleId | null = null;
      let existingTargetRecordId: string | null = null;

      if (normalizedPhoneNumberId) {
        const { data, error } = await supabase
          .from('phone_number_links')
          .select('entity_type,entity_id,display_title,source_table,source_field')
          .eq('phone_number_id', normalizedPhoneNumberId);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        const manualBinding = rows.find((row: any) => (
          String(row?.source_table || '').trim() === MANUAL_PHONE_BINDING_SOURCE_TABLE
          && String(row?.source_field || '').trim() === MANUAL_PHONE_BINDING_SOURCE_FIELD
          && PHONE_BIND_TARGET_MODULES.includes(String(row?.entity_type || '').trim() as PhoneBindTargetModuleId)
        ));
        if (manualBinding) {
          existingTargetModuleId = String(manualBinding.entity_type || '').trim() as PhoneBindTargetModuleId;
          existingTargetRecordId = String(manualBinding.entity_id || '').trim() || null;
          existingBindingLabel = String(manualBinding.display_title || '').trim();
        }
      }

      if (!existingTargetModuleId && PHONE_BIND_TARGET_MODULES.includes(String(moduleId || '').trim() as PhoneBindTargetModuleId)) {
        existingTargetModuleId = String(moduleId || '').trim() as PhoneBindTargetModuleId;
        existingTargetRecordId = String(recordId || '').trim() || null;
      }

      if (existingTargetModuleId && existingTargetRecordId && !existingBindingLabel) {
        const { data: targetRow } = await supabase
          .from(existingTargetModuleId)
          .select(existingTargetModuleId === 'customers'
            ? 'id, full_name, business_name, legal_name, system_code, first_name, last_name'
            : existingTargetModuleId === 'suppliers'
              ? 'id, business_name, first_name, last_name, system_code'
              : 'id, full_name, first_name, last_name, system_code, legacy_system_code')
          .eq('id', existingTargetRecordId)
          .maybeSingle();
        existingBindingLabel = buildPhoneTargetDisplayName(existingTargetModuleId, targetRow) || existingBindingLabel;
      }

      setPhoneIdentityBindDraft({
        phone: normalizedPhone,
        phoneNumberId: normalizedPhoneNumberId,
        phoneMatchStatus: String(phoneMatchStatus || '').trim() || null,
        existingBindingLabel: existingBindingLabel || null,
        existingTargetModuleId,
        existingTargetRecordId,
      });
      setPhoneIdentityBindTargetModuleId(existingTargetModuleId || 'customers');
      setPhoneIdentityBindTargetRecordId(existingTargetRecordId || null);
      setPhoneIdentityBindSearch('');
    } catch (error: any) {
      setPhoneIdentityBindModalOpen(false);
      message.error(toFaErrorMessage(error, 'خواندن اطلاعات اتصال شماره ناموفق بود.'));
    } finally {
      setPhoneIdentityBindModalLoading(false);
    }
  }, [message]);

  const savePhoneIdentityBinding = useCallback(async () => {
    const draft = phoneIdentityBindDraft;
    const orgId = String(profile.org_id || '').trim();
    const targetRecordId = String(phoneIdentityBindTargetRecordId || '').trim();
    if (!draft || !orgId) {
      throw new Error('اطلاعات لازم برای اتصال شماره کامل نیست.');
    }
    if (!targetRecordId) {
      throw new Error('مخاطب مقصد را انتخاب کنید.');
    }
    setPhoneIdentityBindModalSaving(true);
    try {
      await syncPhoneIdentityBinding({
        client: supabase,
        orgId,
        moduleId: phoneIdentityBindTargetModuleId,
        recordId: targetRecordId,
        phone: draft.phone,
        phoneNumberId: draft.phoneNumberId,
      });
      await Promise.all([
        refreshSectionRef.current?.('sms_messages', { force: true }) || Promise.resolve(),
        refreshSectionRef.current?.('voip_calls', { force: true }) || Promise.resolve(),
      ]);
      message.success('اتصال شماره ذخیره شد.');
      closePhoneIdentityBindModal();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره اتصال شماره ناموفق بود.'));
    } finally {
      setPhoneIdentityBindModalSaving(false);
    }
  }, [closePhoneIdentityBindModal, message, phoneIdentityBindDraft, phoneIdentityBindTargetModuleId, phoneIdentityBindTargetRecordId, profile.org_id]);

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
      setCurrentPermissionMap((snapshot.permissions || null) as PermissionMap | null);
      setProfile({
        id: snapshot.user.id,
        role_id: snapshot.roleId || null,
        org_id: snapshot.orgId || snapshot.profile?.org_id || null,
        full_name: snapshot.profile?.full_name || snapshot.user?.user_metadata?.full_name || null,
        avatar_url: snapshot.profile?.avatar_url || snapshot.user?.user_metadata?.avatar_url || null,
        voip_extension: snapshot.profile?.voip_extension ? String(snapshot.profile.voip_extension) : null,
        can_view_all_calls: voipAccess.canViewAllCallNotifications,
        software_role: snapshot.profile?.role ? String(snapshot.profile.role) : null,
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
    if (variant !== 'chat') {
      setVoipCalls([]);
    }
  }, [variant]);

  const relevantNotificationStateSections = useMemo<NotificationStateSectionKey[]>(
    () => (
      activeDrawerSection
        ? [toNotificationStateSection(activeDrawerSection)]
        : []
    ),
    [activeDrawerSection]
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
    const rpcResult = await supabase.rpc('mark_messaging_read_v2', {
      p_channel: null,
      p_conversation_key: null,
      p_read_through_at: null,
      p_read_through_id: null,
      p_entries: Array.from(deduped.values()).map((row) => ({
        section: row.section,
        source_type: row.source_type,
        source_id: row.source_id,
      })),
    });
    if (!rpcResult.error) return;
    if (!isMissingRpcError(rpcResult.error)) {
      console.warn('Could not persist notification read states through central RPC', rpcResult.error);
      return;
    }
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
      setNotificationReadStateReady(false);
      setNotificationReadStateFallbackMode(false);
      return;
    }
    let cancelled = false;
    setNotificationReadStateReady(false);
    setNotificationReadStateFallbackMode(false);
    const loadNotificationReadStates = async () => {
      const stateSections = Array.from(new Set([
        ...relevantNotificationStateSections,
        ...(relevantNotificationStateSections.includes('bot_direct_messages') ? ['bot_messages' as NotificationStateSectionKey] : []),
        ...(relevantNotificationStateSections.includes('sms') ? ['sms_messages' as any] : []),
      ]));
      const { data, error } = await supabase
        .from('notification_read_states')
        .select('section, source_type, source_id, read_at, dismissed_at, updated_at')
        .eq('org_id', profile.org_id)
        .eq('user_id', profile.id)
        .in('section', stateSections)
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (error) {
        if (!isMissingTableLikeError(error)) {
          console.warn('Could not load notification read states', error);
        }
        if (!cancelled) {
          setNotificationStateMap({});
          setNotificationReadStateFallbackMode(true);
          setNotificationReadStateReady(true);
        }
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
      setNotificationReadStateFallbackMode(false);
      setNotificationReadStateReady(true);
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
    if (section === 'bot_direct_messages') {
      const legacyKey = buildNotificationStateKey('bot_messages', sourceType, sourceId);
      const legacyEntry = notificationStateMap[legacyKey];
      if (legacyEntry?.dismissedAt || legacyEntry?.readAt) return true;
    }
    if (section === 'sms_messages') {
      const canonicalKey = buildNotificationStateKey('sms_messages' as any, sourceType, sourceId);
      const canonicalEntry = notificationStateMap[canonicalKey];
      if (canonicalEntry?.dismissedAt || canonicalEntry?.readAt) return true;
    }
    return Boolean(fallbackSeen && (!notificationReadStateReady || notificationReadStateFallbackMode));
  }, [notificationReadStateFallbackMode, notificationReadStateReady, notificationStateMap]);

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
    if (unreadSummaryAvailable) {
      setUnreadSummary((prev) => {
        const next = { ...prev };
        normalized.forEach((entry) => {
          const section = entry.section === 'sms_messages' ? 'sms_messages' : entry.section;
          next[section] = Math.max(0, Number(next[section] || 0) - 1);
          if (section === 'bot_direct_messages') {
            next.bot_messages = Math.max(0, Number(next.bot_messages || 0) - 1);
          } else if (section === 'bot_messages') {
            next.bot_group_messages = Math.max(0, Number(next.bot_group_messages || 0) - 1);
          }
        });
        return next;
      });
    }
  }, [mergeNotificationStateEntries, persistNotificationStateEntries, unreadSummaryAvailable]);

  const refreshUnreadSummary = useCallback(async () => {
    if (!profile.id || !profile.org_id) {
      setUnreadSummary(EMPTY_NOTIFICATION_UNREAD_SUMMARY);
      setUnreadSummaryAvailable(false);
      return;
    }
    if (managedByRuntime) {
      await runtimeRefreshSummary();
      return;
    }
    let response = await supabase.rpc('get_notification_unread_summary_v2', { p_variant: variant });
    if (isMissingRpcError(response.error)) {
      response = await supabase.rpc('get_notification_unread_summary_v1', { p_variant: variant });
    }
    if (response.error) {
      if (!isMissingRpcError(response.error)) {
        console.warn('Could not refresh notification unread summary', response.error);
      }
      setUnreadSummaryAvailable(false);
      return;
    }
    setUnreadSummary(normalizeNotificationUnreadSummary(response.data));
    setUnreadSummaryAvailable(true);
  }, [managedByRuntime, profile.id, profile.org_id, runtimeRefreshSummary, variant]);

  useEffect(() => {
    if (controlledOpen === undefined) return;
    if (controlledOpen) setDrawerContentMounted(true);
    setOpen(controlledOpen);
  }, [controlledOpen]);

  useEffect(() => {
    if (!managedByRuntime || !notificationRuntime.ready) return;
    setUnreadSummary(notificationRuntime.summary);
    setUnreadSummaryAvailable(true);
  }, [managedByRuntime, notificationRuntime.ready, notificationRuntime.summary]);

  useEffect(() => {
    if (managedByRuntime) return;
    void refreshUnreadSummary();
  }, [managedByRuntime, refreshUnreadSummary]);

  useEffect(() => {
    if (!profile.id || variant !== 'chat') return;
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
  }, [profile.id, profile.role_id, variant]);

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
    const needsDirectory = variant === 'chat'
      ? (open || groupModalOpen || Boolean(forwardingNote))
      : detailRuntimeEnabled;
    if (!needsDirectory) return;
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
  }, [Boolean(forwardingNote), detailRuntimeEnabled, groupModalOpen, open, profile.id, profile.org_id, variant]);

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
    const orgId = String(profile.org_id || '').trim();
    if (!orgId) return [];

    const [{ data: mentionedUser, error: mentionedUserError }, { data: mentionedRole, error: mentionedRoleError }] = await Promise.all([
      supabase
        .from('notes')
        .select(NOTE_SELECT_FIELDS)
        .eq('org_id', orgId)
        .contains('mention_user_ids', [userId])
        .order('created_at', { ascending: false })
        .limit(40),
      roleId
        ? supabase
        .from('notes')
        .select(NOTE_SELECT_FIELDS)
        .eq('org_id', orgId)
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
      .eq('org_id', orgId)
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

    const inboxItems = await fetchNotificationInboxSection('notes', NOTES_INBOX_FETCH_LIMIT, { excludeSystem: true });
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

  const loadPeopleMaps = async (items: any[]) => {
    const assigneeIds = Array.from(
      new Set(items
        .filter((item: any) => String(item?.assignee_type || '').trim() !== 'role')
        .map((item: any) => item.assignee_id)
        .filter(Boolean))
    );
    const roleIds = Array.from(
      new Set(items
        .filter((item: any) => String(item?.assignee_type || '').trim() === 'role' || item?.assignee_role_id)
        .map((item: any) => item.assignee_role_id || item.assignee_id)
        .filter(Boolean))
    );
    const createdByIds = Array.from(new Set(items.map((i: any) => i.created_by || i.created_by_id).filter(Boolean)));
    const { directory, userNameMap, roleTitleMap } = await buildDirectoryMaps();
    setDirectoryUsers(directory.users || []);
    setDirectoryRoles(directory.roles || []);
    _notifDirectoryCache.orgId = profile.org_id || null;
    _notifDirectoryCache.users = directory.users || [];
    _notifDirectoryCache.roles = directory.roles || [];

    if (assigneeIds.length) {
      const map = assigneeIds.reduce<Record<string, string>>((acc, assigneeId) => {
        acc[String(assigneeId)] = userNameMap[String(assigneeId)] || 'کاربر خارج از دسترس';
        return acc;
      }, {});
      setAssigneeNameMap((prev) => ({ ...prev, ...map }));
    }
    if (roleIds.length) {
      const map = roleIds.reduce<Record<string, string>>((acc, roleLookupId) => {
        acc[String(roleLookupId)] = roleTitleMap[String(roleLookupId)] || 'نقش خارج از دسترس';
        return acc;
      }, {});
      setRoleNameMap((prev) => ({ ...prev, ...map }));
    }
    if (createdByIds.length) {
      const map = createdByIds.reduce<Record<string, string>>((acc, creatorId) => {
        acc[String(creatorId)] = userNameMap[String(creatorId)] || 'کاربر خارج از دسترس';
        return acc;
      }, {});
      setCreatedByNameMap((prev) => ({ ...prev, ...map }));
    }
  };

  useEffect(() => {
    if (tasks.length === 0) return;
    const relatedPairs: { module_id: string; record_id: string }[] = [];
    tasks.forEach((task: any) => {
      const sourceLink = resolveTaskSourceLink(task);
      if (sourceLink.moduleId && sourceLink.recordId) {
        relatedPairs.push({ module_id: sourceLink.moduleId, record_id: sourceLink.recordId });
      }
    });
    void buildRecordTitleMap(relatedPairs);
    void loadPeopleMaps(tasks);
  }, [tasks]);

  useEffect(() => {
    if (responsibilities.length === 0) return;
    void buildRecordTitleMap(responsibilities.map((item: any) => ({
      module_id: String(item?.module_id || '').trim(),
      record_id: String(item?.id || '').trim(),
    })));
    void loadPeopleMaps(responsibilities);
  }, [responsibilities]);

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
          safeSectionFetch(() => refreshSelectedConversationTimeline({ force: Boolean(options?.force) }), 'notes', null as any),
          safeSectionFetch(() => refreshNoteConversationSummaries(), 'notes', null as any),
          safeSectionFetch(() => refreshUnreadSummary(), 'notes', null as any),
        ]);
        lastLoadedAtRef.current.notes = Date.now();
        return;
      }
      if (variant === 'chat' && activeDrawerSection !== 'notes' && noteConversationSummaryAvailable) {
        await Promise.all([
          safeSectionFetch(() => refreshNoteConversationSummaries(), 'notes', null as any),
          safeSectionFetch(() => refreshUnreadSummary(), 'notes', null as any),
        ]);
        lastLoadedAtRef.current.notes = Date.now();
        return;
      }

      const showSkeleton = notes.length === 0;
      if (showSkeleton) setLoadingNotes(true);
      const notesData = await safeSectionFetch(() => fetchNotes(), 'notes', [] as any[]);
      setNotes(notesData);
      if (selectedConversationKey) {
        await safeSectionFetch(() => refreshSelectedConversationTimeline({ force: Boolean(options?.force) }), 'notes', null as any);
      }
      if (noteConversationSummaryAvailable) {
        await safeSectionFetch(() => refreshNoteConversationSummaries(), 'notes', null as any);
      }
      await safeSectionFetch(() => refreshUnreadSummary(), 'notes', null as any);
      lastLoadedAtRef.current.notes = Date.now();
      if (showSkeleton) setLoadingNotes(false);
      return;
    }

    if (section === 'tasks') {
      const tasksData = await safeSectionFetch(() => refreshTasks(options), 'tasks', tasks);
      await safeSectionFetch(() => refreshUnreadSummary(), 'tasks', null as any);
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
      return;
    }

    if (section === 'bot_messages') {
      if (variant === 'chat' && activeDrawerSection !== 'bot_messages' && botConversationSummaryAvailable) {
        await Promise.all([
          safeSectionFetch(() => refreshBotConversationSummaries(), 'bot_messages', null as any),
          safeSectionFetch(() => refreshUnreadSummary(), 'bot_messages', null as any),
        ]);
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
        if (botTimelineAvailable) {
          await safeSectionFetch(() => refreshBotTimeline({ force: Boolean(options?.force) }), 'bot_messages', null as any);
        } else {
          await safeSectionFetch(() => fetchBotMessages(resolvedGroupId), 'bot_messages', [] as CounterpartyBotMessageRow[]);
        }
      } else {
        setBotMessages([]);
      }
      if (botConversationSummaryAvailable) {
        await safeSectionFetch(() => refreshBotConversationSummaries(), 'bot_messages', null as any);
      }
      await safeSectionFetch(() => refreshUnreadSummary(), 'bot_messages', null as any);
      lastLoadedAtRef.current.bot_messages = Date.now();
      if (showSkeleton) setLoadingBotMessages(false);
      return;
    }

    if (section === 'bot_direct_messages') {
      const showSkeleton = botDirectThreads.length === 0 && botDirectMessages.length === 0;
      if (showSkeleton) setLoadingBotDirectMessages(true);
      const threads = await safeSectionFetch(() => fetchBotDirectThreads(), 'bot_direct_messages', [] as BotDirectThreadRow[]);
      const resolvedThreadId = String(selectedBotDirectThreadId || threads[0]?.id || '').trim();
      await safeSectionFetch(() => fetchBotDirectNotificationMessages(threads), 'bot_direct_messages', [] as BotDirectMessageRow[]);
      if (resolvedThreadId && activeDrawerSection === 'bot_direct_messages') {
        await safeSectionFetch(() => fetchBotDirectMessages(resolvedThreadId), 'bot_direct_messages', [] as BotDirectMessageRow[]);
      } else {
        setBotDirectMessages([]);
      }
      await safeSectionFetch(() => refreshUnreadSummary(), 'bot_direct_messages', null as any);
      lastLoadedAtRef.current.bot_direct_messages = Date.now();
      if (showSkeleton) setLoadingBotDirectMessages(false);
      return;
    }

    if (section === 'sms_messages') {
      const showSkeleton = smsMessages.length === 0;
      if (showSkeleton) setLoadingSmsMessages(true);
      const messagesData = await safeSectionFetch(() => fetchSmsMessages(), 'sms_messages', [] as any[]);
      setSmsMessages(messagesData);
      await buildRecordTitleMap(collectRecordReferences(messagesData));
      await loadPeopleMaps(messagesData);
      await safeSectionFetch(() => refreshUnreadSummary(), 'sms_messages', null as any);
      lastLoadedAtRef.current.sms_messages = Date.now();
      if (showSkeleton) setLoadingSmsMessages(false);
      return;
    }

    if (section === 'voip_calls') {
      const callsData = await safeSectionFetch(() => fetchVoipCalls(), 'voip_calls', [] as any[]);
      setVoipCalls(callsData);
      await buildRecordTitleMap(collectRecordReferences(callsData));
      await loadPeopleMaps(callsData);
      await safeSectionFetch(() => refreshUnreadSummary(), 'voip_calls', null as any);
      lastLoadedAtRef.current.voip_calls = Date.now();
      return;
    }

    const responsibilitiesData = await safeSectionFetch(() => refreshResponsibilities(options), 'responsibilities', responsibilities);
    await safeSectionFetch(() => refreshUnreadSummary(), 'responsibilities', null as any);
    lastLoadedAtRef.current.responsibilities = Date.now();
    await buildRecordTitleMap(responsibilitiesData.map((r: any) => ({ module_id: r.module_id, record_id: r.id })));
    await loadPeopleMaps(responsibilitiesData);
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
    if (managedByRuntime) return undefined;
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
  }, [managedByRuntime]);

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
    const shouldLoadBotDirectMessages = sections.includes('bot_direct_messages');
    const shouldLoadSmsMessages = sections.includes('sms_messages');
    const shouldLoadVoipCalls = sections.includes('voip_calls');
    const shouldFetchBotGroups = shouldLoadBotMessages
      && (activeDrawerSection === 'bot_messages' || !botConversationSummaryAvailable);
    const shouldFetchBotDirectThreads = shouldLoadBotDirectMessages;
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
    const showBotSkeleton = shouldFetchBotGroups && botGroups.length === 0 && botMessages.length === 0;
    const showBotDirectSkeleton = shouldFetchBotDirectThreads && botDirectThreads.length === 0 && botDirectMessages.length === 0;
    const showSmsSkeleton = shouldLoadSmsMessages && smsMessages.length === 0;

    if (showNotesSkeleton) setLoadingNotes(true);
    if (showBotSkeleton) setLoadingBotMessages(true);
    if (showBotDirectSkeleton) setLoadingBotDirectMessages(true);
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
    const [notesData, tasksData, responsibilitiesData, botGroupsData, botDirectThreadsData, smsData, voipCallsData] = await Promise.all([
      shouldFetchGlobalNotes ? safeFetch(() => fetchNotes(), 'notes', [] as any[]) : Promise.resolve(notes),
      shouldLoadTasks ? safeFetch(() => refreshTasks(options), 'tasks', tasks) : Promise.resolve(tasks),
      shouldLoadResponsibilities ? safeFetch(() => refreshResponsibilities(options), 'responsibilities', responsibilities) : Promise.resolve(responsibilities),
      shouldFetchBotGroups ? safeFetch(() => fetchBotGroups(), 'bot_messages', [] as CounterpartyBotGroupRow[]) : Promise.resolve(botGroups),
      shouldFetchBotDirectThreads ? safeFetch(() => fetchBotDirectThreads(), 'bot_direct_messages', [] as BotDirectThreadRow[]) : Promise.resolve(botDirectThreads),
      shouldLoadSmsMessages ? safeFetch(() => fetchSmsMessages(), 'sms_messages', [] as any[]) : Promise.resolve(smsMessages),
      shouldLoadVoipCalls ? safeFetch(() => fetchVoipCalls(), 'voip_calls', [] as any[]) : Promise.resolve(voipCalls),
    ]);
    if (shouldFetchGlobalNotes) setNotes(notesData);
    await Promise.all([
      shouldUseConversationScopedNotes
        ? safeFetch(() => refreshSelectedConversationTimeline({ force: Boolean(options?.force) }), 'notes', null as any)
        : Promise.resolve(null),
      shouldLoadNotes && noteConversationSummaryAvailable
        ? safeFetch(() => refreshNoteConversationSummaries(), 'notes', null as any)
        : Promise.resolve(null),
      safeFetch(() => refreshUnreadSummary(), variant === 'chat' ? 'notes' : 'tasks', null as any),
    ]);
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
        if (botTimelineAvailable) {
          await safeFetch(() => refreshBotTimeline({ force: Boolean(options?.force) }), 'bot_messages', null as any);
        } else {
          await safeFetch(() => fetchBotMessages(resolvedGroupId), 'bot_messages', [] as CounterpartyBotMessageRow[]);
        }
      } else {
        setBotMessages([]);
      }
      if (botConversationSummaryAvailable) {
        await safeFetch(() => refreshBotConversationSummaries(), 'bot_messages', null as any);
      }
    }
    if (shouldFetchBotDirectThreads) {
      const resolvedThreadId = String(selectedBotDirectThreadId || botDirectThreadsData[0]?.id || '').trim();
      await safeFetch(() => fetchBotDirectNotificationMessages(botDirectThreadsData), 'bot_direct_messages', [] as BotDirectMessageRow[]);
      if (resolvedThreadId && activeDrawerSection === 'bot_direct_messages') {
        await safeFetch(() => fetchBotDirectMessages(resolvedThreadId), 'bot_direct_messages', [] as BotDirectMessageRow[]);
      } else {
        setBotDirectMessages([]);
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
    if (showBotSkeleton) setLoadingBotMessages(false);
    if (showBotDirectSkeleton) setLoadingBotDirectMessages(false);
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
      work.push(refreshUnreadSummary());
      await Promise.all(work);
      return;
    }
    await Promise.all([
      refreshSection('tasks', options),
      refreshSection('responsibilities', options),
      refreshUnreadSummary(),
    ]);
  }, [
    botConversationSummaryAvailable,
    noteConversationSummaryAvailable,
    profile.id,
    refreshBotConversationSummaries,
    refreshNoteConversationSummaries,
    refreshSection,
    refreshUnreadSummary,
    variant,
  ]);

  const fetchSmsMessages = async () => {
    const rpcResult = await supabase.rpc('get_accessible_sms_delivery_reports', { p_limit: 80 });
    if (!rpcResult.error) return rpcResult.data || [];
    if (!isRpcSchemaCompatibilityError(rpcResult.error)) throw rpcResult.error;
    return [];
  };

  const fetchVoipCalls = async () => {
    if (variant !== 'chat' || !profile.id) return [];
    const rpcResult = await supabase.rpc('get_accessible_voip_call_logs', { p_limit: 80 });
    if (!rpcResult.error) return rpcResult.data || [];
    if (!isMissingRpcError(rpcResult.error)) throw rpcResult.error;

    let query = supabase
      .from('voip_call_logs')
      .select('id, title, direction, status, source_number, destination_number, extension, module_id, record_id, related_module_id, related_record_id, phone_number_id, phone_match_status, assignee_id, assignee_type, assignee_role_id, started_at, ended_at, created_at, talk_seconds, wait_seconds, call_id, file_id, recording_url')
      .order('started_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(80);

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
    const employeeIds = Array.from(new Set(rows.map((row) => String(row.employee_id || '').trim()).filter(Boolean)));
    if (customerIds.length === 0 && supplierIds.length === 0 && employeeIds.length === 0) return;

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
    if (employeeIds.length > 0) {
      const employeeResult = await selectByIdsWithCompatibleColumns<any>({
        cacheKey: 'notifications:employees',
        columns: ['id', 'full_name', 'first_name', 'last_name', 'system_code', 'legacy_system_code', 'image_url'],
        ids: employeeIds,
        batchSize: 25,
        execute: (selectExpr, idBatch) =>
          supabase
            .from('employees')
            .select(selectExpr)
            .in('id', idBatch),
      });
      (employeeResult.data || []).forEach((item: any) => {
        const id = String(item?.id || '').trim();
        if (!id) return;
        counterpartyLabelMap[`employees:${id}`] = String(
          item?.full_name || [item?.first_name, item?.last_name].filter(Boolean).join(' ') || item?.system_code || item?.legacy_system_code || ''
        ).trim();
        const imgUrl = String(item?.image_url || '').trim();
        if (imgUrl) counterpartyImageMap[`employees:${id}`] = imgUrl;
      });
    }
    if (requestSeq !== botGroupsEnrichSeqRef.current) return;
    setBotGroups((prev) => prev.map((row) => {
      const customerId = String(row.customer_id || '').trim();
      const supplierId = String(row.supplier_id || '').trim();
      const employeeId = String(row.employee_id || '').trim();
      const key = customerId
        ? `customers:${customerId}`
        : supplierId
          ? `suppliers:${supplierId}`
          : employeeId
            ? `employees:${employeeId}`
            : '';
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
      .select('id,target_type,customer_id,supplier_id,employee_id,channel_type,status,group_title,group_join_link,bot_chat_id,updated_at,last_inbound_at,last_outbound_at,created_by,metadata')
      .eq('status', 'active')
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
      const createdBy = String(row?.created_by || '').trim();
      if (!allowedUserIds.length && !allowedRoleIds.length) return Boolean(userId && createdBy === userId);
      if (userId && createdBy === userId) return true;
      if (userId && allowedUserIds.includes(userId)) return true;
      if (roleId && allowedRoleIds.includes(roleId)) return true;
      return false;
    });
    const dedupedRows = rows.reduce<CounterpartyBotGroupRow[]>((acc, row) => {
      const chatId = String(row?.bot_chat_id || '').trim();
      const channel = String(row?.channel_type || '').trim();
      if (!chatId || !channel) {
        acc.push(row);
        return acc;
      }
      const existingIndex = acc.findIndex((item) => String(item?.channel_type || '').trim() === channel && String(item?.bot_chat_id || '').trim() === chatId);
      if (existingIndex < 0) {
        acc.push(row);
        return acc;
      }
      const existing = acc[existingIndex];
      const existingTime = new Date(existing?.last_inbound_at || existing?.last_outbound_at || existing?.updated_at || 0).getTime() || 0;
      const nextTime = new Date(row?.last_inbound_at || row?.last_outbound_at || row?.updated_at || 0).getTime() || 0;
      if (nextTime >= existingTime) {
        acc[existingIndex] = row;
      }
      return acc;
    }, []);

    const sortedRows = applyBotGroups(dedupedRows);
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
  const enrichBotDirectThreads = useCallback(async (rows: BotDirectThreadRow[]): Promise<BotDirectThreadRow[]> => {
    const customerIds = Array.from(new Set(rows.map((row) => String(row.customer_id || '').trim()).filter(Boolean)));
    const supplierIds = Array.from(new Set(rows.map((row) => String(row.supplier_id || '').trim()).filter(Boolean)));
    const employeeIds = Array.from(new Set(rows.map((row) => String(row.employee_id || '').trim()).filter(Boolean)));
    const labelMap: Record<string, string> = {};
    const imageMap: Record<string, string> = {};

    if (customerIds.length > 0) {
      const customerResult = await selectByIdsWithCompatibleColumns<any>({
        cacheKey: 'notifications:bot-direct-customers',
        columns: ['id', 'full_name', 'business_name', 'legal_name', 'system_code', 'first_name', 'last_name', 'image_url'],
        ids: customerIds,
        batchSize: 25,
        execute: (selectExpr, idBatch) => supabase.from('customers').select(selectExpr).in('id', idBatch),
      });
      (customerResult.data || []).forEach((item: any) => {
        const id = String(item?.id || '').trim();
        if (!id) return;
        const personName = `${String(item?.first_name || '').trim()} ${String(item?.last_name || '').trim()}`.trim();
        labelMap[`customers:${id}`] = String(item?.full_name || item?.business_name || item?.legal_name || personName || item?.system_code || '').trim();
        const img = String(item?.image_url || '').trim();
        if (img) imageMap[`customers:${id}`] = img;
      });
    }
    if (supplierIds.length > 0) {
      const supplierResult = await selectByIdsWithCompatibleColumns<any>({
        cacheKey: 'notifications:bot-direct-suppliers',
        columns: ['id', 'business_name', 'full_name', 'system_code', 'image_url'],
        ids: supplierIds,
        batchSize: 25,
        execute: (selectExpr, idBatch) => supabase.from('suppliers').select(selectExpr).in('id', idBatch),
      });
      (supplierResult.data || []).forEach((item: any) => {
        const id = String(item?.id || '').trim();
        if (!id) return;
        labelMap[`suppliers:${id}`] = String(item?.business_name || item?.full_name || item?.system_code || '').trim();
        const img = String(item?.image_url || '').trim();
        if (img) imageMap[`suppliers:${id}`] = img;
      });
    }
    if (employeeIds.length > 0) {
      const employeeResult = await selectByIdsWithCompatibleColumns<any>({
        cacheKey: 'notifications:bot-direct-employees',
        columns: ['id', 'full_name', 'first_name', 'last_name', 'system_code', 'legacy_system_code', 'image_url'],
        ids: employeeIds,
        batchSize: 25,
        execute: (selectExpr, idBatch) => supabase.from('employees').select(selectExpr).in('id', idBatch),
      });
      (employeeResult.data || []).forEach((item: any) => {
        const id = String(item?.id || '').trim();
        if (!id) return;
        labelMap[`employees:${id}`] = String(item?.full_name || [item?.first_name, item?.last_name].filter(Boolean).join(' ') || item?.system_code || item?.legacy_system_code || '').trim();
        const img = String(item?.image_url || '').trim();
        if (img) imageMap[`employees:${id}`] = img;
      });
    }

    return rows.map((row) => {
      const moduleId = String(row.target_module_id || '').trim();
      const recordId = String(row.target_record_id || '').trim();
      const key = moduleId && recordId ? `${moduleId}:${recordId}` : '';
      return {
        ...row,
        binding_status: (moduleId && recordId ? 'bound' : 'unbound') as 'bound' | 'unbound',
        counterparty_label: key ? (labelMap[key] || String(row.display_name || '').trim() || null) : (String(row.display_name || '').trim() || null),
        counterparty_image_url: key ? (imageMap[key] || row.counterparty_image_url || null) : (row.counterparty_image_url || null),
      };
    });
  }, []);
  const fetchBotDirectThreads = async () => {
    const [{ data, error }, { data: groupData, error: groupError }] = await Promise.all([
      supabase
        .from('counterparty_bot_direct_threads')
        .select('id,binding_id,channel_type,chat_id,target_module_id,target_record_id,customer_id,supplier_id,employee_id,profile_id,display_name,username,phone_number,last_seen_at,last_inbound_at,last_outbound_at,last_message_at,last_message_preview,created_by,metadata')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('last_seen_at', { ascending: false, nullsFirst: false })
        .order('display_name', { ascending: true })
        .limit(300),
      supabase
        .from('counterparty_bot_groups')
        .select('channel_type,bot_chat_id')
        .not('bot_chat_id', 'is', null)
        .limit(300),
    ]);
    if (error) throw error;
    if (groupError) throw groupError;
    const groupIdentityKeys = new Set(
      ((groupData || []) as Array<{ channel_type?: string | null; bot_chat_id?: string | null }>)
        .map((row) => {
          const channel = String(row?.channel_type || '').trim();
          const chatId = String(row?.bot_chat_id || '').trim();
          return channel && chatId ? `${channel}:${chatId}` : '';
        })
        .filter(Boolean),
    );
    const dedupedThreadMap = new Map<string, BotDirectThreadRow>();
    ((data || []) as BotDirectThreadRow[]).forEach((row) => {
      const channel = String(row?.channel_type || '').trim();
      const chatId = String(row?.chat_id || '').trim();
      if (!channel || !chatId) return;
      const identityKey = `${channel}:${chatId}`;
      if (groupIdentityKeys.has(identityKey)) {
        return;
      }
      if (isBlockedBotDirectThread(row)) {
        return;
      }
      const previous = dedupedThreadMap.get(identityKey) || null;
      if (!previous || scoreBotDirectThreadCandidate(row) >= scoreBotDirectThreadCandidate(previous)) {
        dedupedThreadMap.set(identityKey, row);
      }
    });
    const baseRows = Array.from(dedupedThreadMap.values());
    const userId = String(profile.id || '').trim();
    const roleId = String(profile.role_id || '').trim();
    const visibleRows = baseRows.filter((row) => {
      const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const allowedUserIds = Array.isArray((metadata as any)?.allowed_user_ids)
        ? (metadata as any).allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const allowedRoleIds = Array.isArray((metadata as any)?.allowed_role_ids)
        ? (metadata as any).allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const ownerId = String(row?.created_by || row?.profile_id || '').trim();
      if (!allowedUserIds.length && !allowedRoleIds.length) return Boolean(userId && ownerId === userId);
      if (userId && ownerId === userId) return true;
      if (userId && allowedUserIds.includes(userId)) return true;
      if (roleId && allowedRoleIds.includes(roleId)) return true;
      return false;
    });
    const rows = await enrichBotDirectThreads(visibleRows);
    setBotDirectThreads(rows);
    return rows;
  };
  const fetchBotDirectNotificationMessages = async (threads: BotDirectThreadRow[] = botDirectThreads) => {
    const threadIds = Array.from(new Set((threads || []).map((row) => String(row?.id || '').trim()).filter(Boolean)));
    if (!threadIds.length) {
      setBotDirectNotificationMessages([]);
      return [] as BotDirectMessageRow[];
    }
    const { data, error } = await supabase
      .from('counterparty_bot_direct_messages')
      .select('id,direct_thread_id,direction,message_type,chat_id,channel_type,content_text,file_url,file_name,mime_type,payload,created_by,created_at')
      .in('direct_thread_id', threadIds)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = ((data || []) as BotDirectMessageRow[]).reverse();
    setBotDirectNotificationMessages(rows);
    return rows;
  };
  const fetchBotDirectMessages = async (threadId: string | null) => {
    const normalizedThreadId = String(threadId || '').trim();
    botDirectMessagesThreadIdRef.current = normalizedThreadId || null;
    if (!normalizedThreadId) {
      setBotDirectMessages([]);
      return [] as BotDirectMessageRow[];
    }
    setLoadingBotDirectMessages(true);
    try {
      const { data, error } = await supabase
        .from('counterparty_bot_direct_messages')
        .select('id,direct_thread_id,direction,message_type,chat_id,channel_type,content_text,file_url,file_name,mime_type,payload,created_by,created_at')
        .eq('direct_thread_id', normalizedThreadId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = ((data || []) as BotDirectMessageRow[]).reverse();
      botDirectMessagesRef.current = rows;
      setBotDirectMessages(rows);
      return rows;
    } finally {
      setLoadingBotDirectMessages(false);
    }
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
    const duplicateCheck = await supabase
      .from('counterparty_bot_groups')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', String(profile.org_id || '').trim())
      .eq('channel_type', channel)
      .eq('bot_chat_id', chatId);
    if (duplicateCheck.error) throw duplicateCheck.error;
    if (Number(duplicateCheck.count || 0) > 1) {
      throw new Error('این گروه در حال حاضر chat id مبهم یا تکراری دارد. ابتدا اتصال گروه‌های بات را یک‌دست کنید.');
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
          || providerItem?.provider_message_id
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
    const { data: insertedRows, error: insertError } = await supabase
      .from('counterparty_bot_messages')
      .insert(rowsToInsert)
      .select('id,bot_group_id,direction,message_type,chat_id,provider_message_id,content_text,file_url,file_name,mime_type,payload,created_by,created_at');
    if (insertError) throw insertError;

    const { error: patchError } = await supabase
      .from('counterparty_bot_groups')
      .update({
        status: 'active',
        last_outbound_at: new Date().toISOString(),
      })
      .eq('id', group.id);
    if (patchError) throw patchError;

    return {
      providerResponse,
      rows: (insertedRows || []) as CounterpartyBotMessageRow[],
    };
  }, [buildCurrentBotSenderPayload, profile.org_id]);

  const sendTextToBotDirectThread = useCallback(async (
    thread: BotDirectThreadRow,
    text: string,
    options?: {
      payload?: Record<string, any>;
      messageType?: string;
      fallbackText?: string;
      attachments?: NoteAttachment[];
    },
  ) => {
    const channel = String(thread?.channel_type || '').trim() as BotChannel;
    const chatId = String(thread?.chat_id || '').trim();
    if (!channel || !BOT_CHANNELS.includes(channel)) {
      throw new Error('کانال پیام شخصی بات معتبر نیست.');
    }
    if (!chatId) {
      throw new Error('شناسه چت این پی‌وی ثبت نشده است.');
    }
    if (isBlockedBotDirectThread(thread)) {
      throw new Error('این گفتگو به‌عنوان مسیر شخصی معتبر شناخته نشده و ارسال برای آن متوقف شده است.');
    }
    const looksLikeGroupChatId = /^(g0|c0|ch)/i.test(chatId);
    if (looksLikeGroupChatId) {
      throw new Error('شناسه این گفتگو شبیه گروه است و برای ارسال پیام شخصی معتبر نیست.');
    }
    const groupCollision = await supabase
      .from('counterparty_bot_groups')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', String(profile.org_id || '').trim())
      .eq('channel_type', channel)
      .eq('bot_chat_id', chatId);
    if (groupCollision.error) throw groupCollision.error;
    if (Number(groupCollision.count || 0) > 0) {
      throw new Error(`این چت در ${BOT_CHANNEL_LABELS_FA[channel] || channel} به یک گروه وصل شده است و ارسال شخصی برای آن متوقف شد.`);
    }
    const verifiedByMetadata = thread?.metadata && typeof thread.metadata === 'object'
      ? (thread.metadata as any).direct_chat_verified === true
      : false;
    const { count: directMessageCount, error: directMessageCountError } = await supabase
      .from('counterparty_bot_direct_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direct_thread_id', String(thread.id || '').trim())
      .eq('channel_type', channel);
    if (directMessageCountError) throw directMessageCountError;
    const hasVerifiedDirectHistory = verifiedByMetadata || Number(directMessageCount || 0) > 0;
    if (!hasVerifiedDirectHistory) {
      throw new Error(`برای ارسال پیام شخصی ${BOT_CHANNEL_LABELS_FA[channel] || channel}، لازم است کاربر ابتدا در پی‌وی به بات پیام بدهد تا مسیر خصوصی او با اطمینان ثبت شود.`);
    }
    const inboundCheck = await supabase
      .from('bot_inbound_contacts')
      .select('is_group, chat_title, chat_type')
      .eq('org_id', String(profile.org_id || '').trim())
      .eq('channel_type', channel)
      .eq('chat_id', chatId)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!inboundCheck.error && inboundCheck.data?.is_group === true) {
      throw new Error(`این چت در ${BOT_CHANNEL_LABELS_FA[channel] || channel} به عنوان گروه ثبت شده است و ارسال شخصی برای آن متوقف شد.`);
    }
    const recordModuleId = String(thread?.target_module_id || '').trim() || null;
    const recordId = String(thread?.target_record_id || '').trim() || null;
    const attachments = options?.attachments || [];
    await sendBotMessageViaGateway({
      channel,
      chatId,
      text: String(text || '').trim(),
      attachments: attachments.length > 0 ? attachments : undefined,
      fallbackText: options?.fallbackText,
      moduleId: recordModuleId || undefined,
      recordId: recordId || undefined,
    });
    const senderPayload = buildCurrentBotSenderPayload();
    const insertedPayload = {
      org_id: String(profile.org_id || '').trim() || null,
      direct_thread_id: thread.id,
      channel_type: channel,
      chat_id: chatId,
      target_module_id: recordModuleId,
      target_record_id: recordId,
      customer_id: recordModuleId === 'customers' ? recordId : null,
      supplier_id: recordModuleId === 'suppliers' ? recordId : null,
      employee_id: recordModuleId === 'employees' ? recordId : null,
      profile_id: String(thread.profile_id || '').trim() || null,
      direction: 'outbound',
      message_type: String(options?.messageType || (attachments.length > 0 ? 'file' : 'text')).trim() || 'text',
      content_text: String(text || '').trim() || null,
      file_url: String(attachments[0]?.url || '').trim() || null,
      file_name: String(attachments[0]?.name || '').trim() || null,
      mime_type: String(attachments[0]?.mimeType || '').trim() || null,
      created_by: String(profile.id || '').trim() || null,
      payload: {
        ...(options?.payload || {}),
        attachments,
        ...senderPayload,
      },
    };
    const { data: insertedRows, error: insertError } = await supabase
      .from('counterparty_bot_direct_messages')
      .insert([insertedPayload])
      .select('id,direct_thread_id,direction,message_type,chat_id,channel_type,content_text,file_url,file_name,mime_type,payload,created_by,created_at');
    if (insertError) throw insertError;
    const previewText = String(text || '').trim() || String(attachments[0]?.name || '').trim() || null;
    const nowIso = new Date().toISOString();
    const { error: threadUpdateError } = await supabase
      .from('counterparty_bot_direct_threads')
      .update({
        last_outbound_at: nowIso,
        last_message_at: nowIso,
        last_message_preview: previewText,
      })
      .eq('id', thread.id);
    if (threadUpdateError) throw threadUpdateError;
    return {
      rows: (insertedRows || []) as BotDirectMessageRow[],
    };
  }, [buildCurrentBotSenderPayload, profile.id, profile.org_id]);

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
    if (variant === 'chat') return;
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
      if (standalone && variant === 'chat') {
        await refreshAll(false, { force: true });
        return;
      }
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
    if (managedByRuntime) {
      if (open && activeDrawerSection) {
        void refreshSectionRef.current?.(activeDrawerSection);
      }
      return;
    }
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
  }, [activeDrawerSection, managedByRuntime, open, profile.id, profile.role_id, scheduleBackgroundSectionRefresh, variant]);

  useEffect(() => {
    setDesktopActiveKey((prev) => normalizeTabForVariant(variant, prev));
    setMobileActiveKey((prev) => normalizeTabForVariant(variant, prev));
  }, [variant]);

  useEffect(() => {
    // Without an explicit ?tab= the restored last tab (initialTab) stays active.
    const nextRequested = normalizeTabForVariant(
      variant,
      requestedTab || (storedLastStateRef.current?.tab as DrawerTabKey | undefined),
    );
    setDesktopActiveKey(nextRequested);
    setMobileActiveKey(nextRequested);
  }, [requestedTab, variant]);

  useEffect(() => {
    if (variant !== 'chat' || !profile.id || !requestedConversationKey) return;
    const selection = resolveConversationSelection(requestedConversationKey, profile.id);
    if (selection !== undefined) setSelectedNoteUserId(selection);
  }, [profile.id, requestedConversationKey, variant]);

  useEffect(() => {
    if (variant !== 'chat' || !requestedBotGroupId) return;
    setSelectedBotGroupId(requestedBotGroupId);
  }, [requestedBotGroupId, variant]);
  useEffect(() => {
    if (variant !== 'chat' || !requestedBotDirectThreadId) return;
    setSelectedBotDirectThreadId(requestedBotDirectThreadId);
  }, [requestedBotDirectThreadId, variant]);

  // Restored last-state belongs to a specific user on this device — if a
  // different user signs in, fall back to the default selection.
  const lastStateValidatedRef = useRef(false);
  useEffect(() => {
    if (variant !== 'chat' || !standalone || lastStateValidatedRef.current) return;
    const userId = String(profile.id || '').trim();
    if (!userId) return;
    lastStateValidatedRef.current = true;
    const stored = storedLastStateRef.current;
    if (stored && stored.userId !== userId) {
      storedLastStateRef.current = null;
      setSelectedNoteUserId(SYSTEM_MESSAGES_USER_ID);
      setSelectedBotGroupId(null);
      setSelectedBotDirectThreadId(null);
      setDesktopActiveKey(normalizeTabForVariant(variant, requestedTab));
      setMobileActiveKey(normalizeTabForVariant(variant, requestedTab));
    }
  }, [profile.id, requestedTab, standalone, variant]);

  // Persist the active tab + conversation so the next visit restores it.
  useEffect(() => {
    if (variant !== 'chat' || !standalone) return;
    const userId = String(profile.id || '').trim();
    if (!userId || !lastStateValidatedRef.current) return;
    saveMessagesLastState({
      userId,
      tab: isSectionTabKey(activeDrawerTab) ? activeDrawerTab : null,
      noteConversationId: selectedNoteUserId,
      botGroupId: selectedBotGroupId,
      botDirectThreadId: selectedBotDirectThreadId,
    });
  }, [activeDrawerTab, profile.id, selectedBotDirectThreadId, selectedBotGroupId, selectedNoteUserId, standalone, variant]);

  useEffect(() => {
    if (!open || activeDrawerSection !== 'notes' || selectedNoteUserId) return;
    void refreshSection('notes');
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
    if (activeDrawerSection !== 'bot_direct_messages') return;
    if (!selectedBotDirectThreadId) {
      setBotDirectMessages([]);
      return;
    }
    botDirectShouldStickToBottomRef.current = true;
    botDirectForceScrollToBottomRef.current = true;
    void fetchBotDirectMessages(selectedBotDirectThreadId);
  }, [activeDrawerSection, open, selectedBotDirectThreadId]);

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
    if (!profile.id || managedByRuntime) return;
    const interval = setInterval(() => {
      if (open) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshClosedState({ force: true });
    }, 90000);
    return () => clearInterval(interval);
  }, [managedByRuntime, open, profile.id, profile.role_id, variant]);

  // Refresh data when the page becomes visible again (e.g., returning from another app/tab)
  // Also briefly suppresses transitions to prevent flicker on mobile browsers
  useEffect(() => {
    if (!profile.id || managedByRuntime) return;
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
  }, [activeDrawerSection, managedByRuntime, open, profile.id, profile.role_id, variant]);

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
      if (normalized === 'bot_direct_messages') return 'bot_direct_messages';
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
    enabled: Boolean(profile.id) && !managedByRuntime && !realtimeDisabledRef.current,
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
      setVoipCalls((prev) => [row, ...prev.filter((item) => String(item?.id || '') !== String(row?.id || ''))].slice(0, 80));
    },
  });

  useEffect(() => {
    if (!managedByRuntime || !profile.id || !activeDrawerSection) return;
    const revision = notificationRuntime.revisions[activeDrawerSection];
    if (revision <= 0) return;
    if (open) {
      // Route through scheduleLiveRefresh (coalescing + 5s cooldown) instead of
      // forcing a refresh per revision bump. Revisions bump on every org
      // realtime event; unthrottled forced refreshes (3 RPCs + state churn
      // each) keep the page busy enough to starve React Router's
      // v7_startTransition navigation — the URL changes but the new page never
      // commits. Instant message display is handled by the realtime
      // direct-append bus, so this refresh is only a reconciliation pass.
      scheduleLiveRefresh(activeDrawerSection);
    }
  }, [
    activeDrawerSection,
    managedByRuntime,
    notificationRuntime.revisions,
    open,
    profile.id,
    scheduleLiveRefresh,
    variant,
  ]);

  const notesCount = useMemo(() => {
    if (unreadSummaryAvailable) {
      return unreadSummary.notes;
    }
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
  }, [notes, noteLikeNotifications, profile.id, isNotificationRead, seenNoteIds, noteConversationSummaryAvailable, rpcNoteConversationSummaries, unreadSummary.notes, unreadSummaryAvailable]);
  const tasksCount = useMemo(() => tasks.filter((t: any) => (
    !isNotificationRead('tasks', 'task', String(t?.id || ''), seenTaskIds.has(String(t?.id || '')))
  )).length, [tasks, seenTaskIds, isNotificationRead]);
  const responsibilitiesCount = useMemo(() => responsibilities.filter((r: any) => (
    !isNotificationRead('responsibilities', getResponsibilitySourceType(r), String(r?.id || ''), seenResponsibilityIds.has(String(r?.id || '')))
  )).length, [responsibilities, seenResponsibilityIds, isNotificationRead]);
  const effectiveTasksCount = unreadSummaryAvailable ? unreadSummary.tasks : tasksCount;
  const effectiveResponsibilitiesCount = unreadSummaryAvailable ? unreadSummary.responsibilities : responsibilitiesCount;
  const botMessagesCount = useMemo(() => {
    if (unreadSummaryAvailable) {
      return unreadSummary.bot_messages;
    }
    return botConversationSummaryAvailable && rpcBotConversationSummaries
      ? (rpcBotConversationSummaries || []).reduce((sum, item) => {
        const groupId = String(item?.bot_group_id || '').trim();
        if (!groupId || (visibleBotGroupIds.size > 0 && !visibleBotGroupIds.has(groupId))) return sum;
        return sum + Number(item?.unread_count || 0);
      }, 0)
      : botNotificationMessages.filter((row) => {
      const id = String(row?.id || '').trim();
      return String(row?.direction || '').trim() === 'inbound'
        && !isNotificationRead('bot_messages', 'counterparty_bot_message', id, seenBotMessageIds.has(id));
    }).length;
  }, [botConversationSummaryAvailable, rpcBotConversationSummaries, botNotificationMessages, seenBotMessageIds, isNotificationRead, visibleBotGroupIds, unreadSummary.bot_messages, unreadSummaryAvailable]);
  const botDirectMessagesTotalCount = useMemo(() => (
    botDirectNotificationMessages.reduce((sum, row) => {
      const id = String(row?.id || '').trim();
      if (!id || String(row?.direction || '').trim() !== 'inbound') return sum;
      if (isNotificationRead('bot_direct_messages', 'counterparty_bot_direct_message', id, seenBotMessageIds.has(id))) return sum;
      return sum + 1;
    }, 0)
  ), [botDirectNotificationMessages, isNotificationRead, seenBotMessageIds]);
  const smsMessagesCount = useMemo(() => smsMessages.filter((row: any) => {
    if (unreadSummaryAvailable) {
      return false;
    }
    const id = String(row?.id || '').trim();
    return String(row?.direction || '').trim() === 'inbound'
      && !isNotificationRead('sms_messages', 'inbound_sms', id, seenSmsMessageIds.has(id));
  }).length, [smsMessages, isNotificationRead, seenSmsMessageIds, unreadSummaryAvailable]);
  const effectiveSmsMessagesCount = unreadSummaryAvailable ? unreadSummary.sms_messages : smsMessagesCount;
  const voipCallsCount = useMemo(() => {
    if (unreadSummaryAvailable) {
      return 0;
    }
    return voipCalls.filter((row: any) => (
      String(row?.direction || '').trim() === 'incoming'
      && !isNotificationRead('voip_calls', 'voip_call', String(row?.id || '').trim(), seenVoipCallIds.has(String(row?.id || '').trim()))
    )).length;
  }, [voipCalls, seenVoipCallIds, isNotificationRead, unreadSummaryAvailable]);
  const effectiveVoipCallsCount = unreadSummaryAvailable ? unreadSummary.voip_calls : voipCallsCount;
  const effectiveChatTotalCount = notesCount + botMessagesCount + botDirectMessagesTotalCount + effectiveSmsMessagesCount + effectiveVoipCallsCount;
  const alertsTotalCount = effectiveTasksCount + effectiveResponsibilitiesCount;
  const totalCount = variant === 'chat' ? effectiveChatTotalCount : alertsTotalCount;
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
  const displayedSmsMessages = selectedSmsThread?.messages || EMPTY_STABLE_ARRAY;
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
  const displayedVoipCalls = selectedVoipThread?.calls || EMPTY_STABLE_ARRAY;
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
        case 'not_done':
          return !isDone(task);
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
  const displayedTaskAlerts = useMemo(
    () => filteredTasks.slice(0, panelVisibleCounts.tasks),
    [filteredTasks, panelVisibleCounts.tasks]
  );
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
    if (!selectedNoteUserId) return MY_NOTES_CONVERSATION_KEY;
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
  useEffect(() => {
    const missingReferences = (selectedConversationNotes || [])
      .map((note: any) => ({
        module_id: String(note?.module_id || '').trim(),
        record_id: String(note?.record_id || '').trim(),
      }))
      .filter((item) => (
        item.module_id
        && item.record_id
        && !recordTitleMap[buildRecordReferenceKey(item.module_id, item.record_id)]
      ));
    if (missingReferences.length === 0) return;

    let cancelled = false;
    void fetchRecordReferenceLabels(supabase, missingReferences)
      .then((map) => {
        if (cancelled || !Object.keys(map).length) return;
        setRecordTitleMap((prev) => ({ ...prev, ...map }));
      })
      .catch((error) => {
        console.warn('Could not load internal message related record titles', error);
      });

    return () => {
      cancelled = true;
    };
  }, [recordTitleMap, selectedConversationNotes]);
  const loadOlderNotesWithPreserve = useCallback(async () => {
    const container = notesScrollContainerRef.current;
    if (container) pendingNoteScrollRestoreRef.current = container.scrollHeight;
    await loadOlderSelectedConversationNotes();
  }, [loadOlderSelectedConversationNotes]);
  const loadOlderMyNotesWithPreserve = useCallback(() => {
    const container = notesScrollContainerRef.current;
    if (container) pendingNoteScrollRestoreRef.current = container.scrollHeight;
    setMyNotesDisplayLimit((prev) => prev + 15);
    if (selectedConversationKey === MY_NOTES_CONVERSATION_KEY) {
      void loadOlderSelectedConversationNotes();
    }
  }, [loadOlderSelectedConversationNotes, selectedConversationKey]);
  const loadOlderBotWithPreserve = useCallback(async () => {
    const container = botMessagesScrollContainerRef.current;
    if (container) pendingBotScrollRestoreRef.current = container.scrollHeight;
    await loadOlderBotMessages();
  }, [loadOlderBotMessages]);
  // ── Realtime direct-append ─────────────────────────────────────────────────
  // The realtime INSERT payload already contains the full message row, so the
  // open conversation appends it instantly. The forced timeline refresh that
  // follows (revision/scheduleLiveRefresh) stays as the consistency backstop.
  const realtimeAppendCtxRef = useRef({
    open,
    variant,
    activeDrawerSection,
    selectedNoteUserId,
    selectedChatGroupId,
    selectedBotGroupId,
    selectedBotDirectThreadId,
    currentUserId: String(profile.id || '').trim(),
    currentRoleId: String(profile.role_id || '').trim(),
    orgId: String(profile.org_id || '').trim(),
  });
  realtimeAppendCtxRef.current = {
    open,
    variant,
    activeDrawerSection,
    selectedNoteUserId,
    selectedChatGroupId,
    selectedBotGroupId,
    selectedBotDirectThreadId,
    currentUserId: String(profile.id || '').trim(),
    currentRoleId: String(profile.role_id || '').trim(),
    orgId: String(profile.org_id || '').trim(),
  };
  useEffect(() => {
    const matchesOpenNoteConversation = (row: any) => {
      const ctx = realtimeAppendCtxRef.current;
      if (ctx.variant !== 'chat' || !ctx.open || ctx.activeDrawerSection !== 'notes') return false;
      const rowOrgId = String(row?.org_id || '').trim();
      if (ctx.orgId && rowOrgId && rowOrgId !== ctx.orgId) return false;
      const rowGroupId = String(row?.metadata?.chat_group_id || '').trim();
      if (ctx.selectedChatGroupId) return rowGroupId === ctx.selectedChatGroupId;
      if (rowGroupId) return false;
      if (ctx.selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) {
        return isSystemNote(row)
          && canCurrentUserAccessInternalSystemNote(row, ctx.currentUserId, ctx.currentRoleId);
      }
      if (!ctx.selectedNoteUserId) {
        return Boolean(ctx.currentUserId)
          && String(row?.author_id || '').trim() === ctx.currentUserId
          && !isSystemNote(row);
      }
      return isDirectConversationNote(row, ctx.currentUserId, String(ctx.selectedNoteUserId));
    };
    const unsubscribeNotes = noteInsertBus.subscribe((row) => {
      if (!matchesOpenNoteConversation(row)) return;
      setSelectedConversationNotes((prev: any[]) => {
        const id = String(row?.id || '').trim();
        if (!id || prev.some((item: any) => String(item?.id || '') === id)) return prev;
        return [...prev, row].sort((a: any, b: any) => compareIsoAsc(a?.created_at, b?.created_at));
      });
    });
    const unsubscribeBot = botMessageInsertBus.subscribe((row) => {
      const ctx = realtimeAppendCtxRef.current;
      const rowOrgId = String(row?.org_id || '').trim();
      if (ctx.orgId && rowOrgId && rowOrgId !== ctx.orgId) return;
      if (ctx.variant !== 'chat' || !ctx.open) return;
      if (ctx.activeDrawerSection === 'bot_messages') {
        if (!ctx.selectedBotGroupId || String(row?.bot_group_id || '').trim() !== ctx.selectedBotGroupId) return;
        setBotMessages((prev) => {
          const id = String(row?.id || '').trim();
          if (!id || prev.some((item: any) => String(item?.id || '') === id)) return prev;
          return [...prev, row as CounterpartyBotMessageRow].sort((a: any, b: any) => compareIsoAsc(a?.created_at, b?.created_at));
        });
        return;
      }
      if (ctx.activeDrawerSection === 'bot_direct_messages') {
        if (!ctx.selectedBotDirectThreadId || String((row as any)?.direct_thread_id || '').trim() !== ctx.selectedBotDirectThreadId) return;
        setBotDirectMessages((prev) => {
          const id = String(row?.id || '').trim();
          if (!id || prev.some((item: any) => String(item?.id || '') === id)) return prev;
          return [...prev, row as BotDirectMessageRow].sort((a: any, b: any) => compareIsoAsc(a?.created_at, b?.created_at));
        });
      }
    });
    return () => {
      unsubscribeNotes();
      unsubscribeBot();
    };
  }, [setBotMessages, setSelectedConversationNotes]);
  const isUnreadNoteRow = useCallback((note: any) => {
    const noteId = String(note?.id || '').trim();
    if (!noteId) return false;
    if (typeof note?.is_read === 'boolean') return !note.is_read;
    const authorId = String(note?.author_id || '').trim();
    const currentUserId = String(profile.id || '').trim();
    if (authorId && currentUserId && authorId === currentUserId) return false;
    return !isNotificationRead('notes', 'note', noteId, seenNoteIds.has(noteId));
  }, [isNotificationRead, profile.id, seenNoteIds]);
  const isUnreadBotRow = useCallback((row: CounterpartyBotMessageRow | null | undefined) => {
    const rowId = String(row?.id || '').trim();
    if (!rowId) return false;
    if (typeof (row as any)?.is_read === 'boolean') return !(row as any).is_read;
    if (String(row?.direction || '').trim() === 'outbound') return false;
    return !isNotificationRead('bot_messages', 'counterparty_bot_message', rowId, seenBotMessageIds.has(rowId));
  }, [isNotificationRead, seenBotMessageIds]);
  const isSelectedConversationLoaded = !selectedConversationKey || !loadingSelectedConversationNotes;
  const filteredNotes = useMemo(() => {
    const sourceNotes = selectedConversationKey
      ? (selectedConversationNotes || [])
      : notes;
    if (selectedConversationKey) {
      if (selectedConversationKey === MY_NOTES_CONVERSATION_KEY) {
        const currentUserId = String(profile.id || '').trim();
        return sourceNotes.filter((note: any) => (
          currentUserId
          && String(note?.author_id || '').trim() === currentUserId
          && !isSystemNote(note)
          && !String(note?.metadata?.chat_group_id || '').trim()
        ));
      }
      if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID || selectedConversationKey === 'system') {
        return sourceNotes.filter((note: any) => (
          isSystemNote(note)
          && canCurrentUserAccessInternalSystemNote(note, profile.id, profile.role_id)
        ));
      }
      if (selectedChatGroupId) {
        return sourceNotes.filter((note: any) => String(note?.metadata?.chat_group_id || '').trim() === selectedChatGroupId);
      }
      if (selectedNoteUserId) {
        return sourceNotes.filter((note: any) =>
          isDirectConversationNote(note, String(profile.id || ''), String(selectedNoteUserId), noteLookup)
        );
      }
      return sourceNotes;
    }
    if (!selectedNoteUserId) {
      const currentUserId = String(profile.id || '').trim();
      return sourceNotes.filter((note: any) => (
        currentUserId
        && String(note?.author_id || '').trim() === currentUserId
        && !isSystemNote(note)
      ));
    }
    if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) {
      return sourceNotes.filter((note: any) => (
        isSystemNote(note)
        && canCurrentUserAccessInternalSystemNote(note, profile.id, profile.role_id)
      ));
    }
    if (selectedChatGroupId) {
      return sourceNotes.filter((note: any) => String(note?.metadata?.chat_group_id || '').trim() === selectedChatGroupId);
    }
    const targetUserId = String(selectedNoteUserId);
    const currentUserId = String(profile.id || '');
    return sourceNotes.filter((note: any) =>
      isDirectConversationNote(note, currentUserId, targetUserId, noteLookup)
    );
  }, [noteLookup, notes, profile.id, profile.role_id, selectedChatGroupId, selectedConversationKey, selectedConversationNotes, selectedNoteUserId]);
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
    const systemNotes = notes.filter((note: any) => (
      isSystemNote(note)
      && canCurrentUserAccessInternalSystemNote(note, profile.id, profile.role_id)
    ));
    const latestMessageAt = systemNotes.reduce<number>((latest, note: any) => {
      const createdAt = new Date(note?.created_at || '').getTime();
      return Number.isFinite(createdAt) ? Math.max(latest, createdAt) : latest;
    }, 0);
    const unreadCount = systemNotes.filter((note: any) => (
      !isNotificationRead('notes', 'note', String(note?.id || ''), seenNoteIds.has(String(note?.id || '')))
    )).length;
    return { noteCount: systemNotes.length, latestMessageAt, unreadCount };
  }, [isNotificationRead, notes, profile.id, profile.role_id, seenNoteIds]);
  const myNoteStats = useMemo(() => {
    const currentUserId = String(profile.id || '').trim();
    const rpcMyNotesSummary = noteConversationSummaryAvailable && rpcNoteConversationSummaries
      ? (rpcNoteConversationSummaries || []).find((item) => (
        String(item?.section || '').trim() === 'notes'
        && String(item?.conversation_key || '').trim() === MY_NOTES_CONVERSATION_KEY
      ))
      : null;
    const sourceRows = selectedConversationKey === MY_NOTES_CONVERSATION_KEY
      ? (selectedConversationNotes || [])
      : notes;
    const myNotes = currentUserId
      ? notes.filter((note: any) => String(note?.author_id || '').trim() === currentUserId && !isSystemNote(note))
      : [];
    const scopedMyNotes = currentUserId
      ? sourceRows.filter((note: any) => String(note?.author_id || '').trim() === currentUserId && !isSystemNote(note))
      : [];
    const effectiveMyNotes = scopedMyNotes.length > 0 ? scopedMyNotes : myNotes;
    const latestMessageAt = effectiveMyNotes.reduce<number>((latest, note: any) => {
      const createdAt = new Date(note?.created_at || '').getTime();
      return Number.isFinite(createdAt) ? Math.max(latest, createdAt) : latest;
    }, 0);
    return {
      noteCount: Math.max(Number(rpcMyNotesSummary?.note_count || 0), effectiveMyNotes.length),
      latestMessageAt: Math.max(new Date(rpcMyNotesSummary?.latest_message_at || 0).getTime() || 0, latestMessageAt),
    };
  }, [noteConversationSummaryAvailable, notes, profile.id, rpcNoteConversationSummaries, selectedConversationKey, selectedConversationNotes]);
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
    const rpcItems: ConversationListItem[] = summaries
      .filter((item) => String(item?.section || '').trim() === 'notes')
      .reduce<ConversationListItem[]>((acc, item: NotificationConversationSummary) => {
        const kind = String(item.kind || '').trim();
        if (kind === 'system') {
          acc.push({
            id: SYSTEM_MESSAGES_USER_ID,
            kind: 'system' as const,
            conversationKey: String(item.conversation_key || 'system'),
            displayName: String(item.title || 'پیام‌های سیستم'),
            noteCount: Number(item.note_count || 0),
            unreadCount: Number(item.unread_count || 0),
            latestMessageAt: new Date(item.latest_message_at || 0).getTime() || 0,
            userId: SYSTEM_MESSAGES_USER_ID,
            isGroup: false,
          });
          return acc;
        }
        if (kind === 'group') {
          const groupId = String(item.group_id || '').trim();
          if (groupId) rpcGroupIds.add(groupId);
          const chatGroup = groupId ? chatGroupMap[groupId] || null : null;
          acc.push({
            id: `${CHAT_GROUP_PREFIX}${groupId}`,
            kind: 'group' as const,
            conversationKey: String(item.conversation_key || `group:${groupId}`),
            displayName: String(chatGroup?.name || item.title || 'گروه'),
            noteCount: Number(item.note_count || 0),
            unreadCount: Number(item.unread_count || 0),
            latestMessageAt: new Date(item.latest_message_at || 0).getTime() || 0,
            groupId,
            isGroup: true,
          });
          return acc;
        }
        if (kind === 'mine') return acc;
        const userId = String(item.user_id || '').trim();
        if (!userId) return acc;
        const directoryUser = userId ? directoryUserMap[userId] || null : null;
        acc.push({
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
        });
        return acc;
      }, []);

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
    ? noteConversationsFromRpc.filter((item) => item.kind !== 'system' && item.conversationKey !== MY_NOTES_CONVERSATION_KEY)
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

    const loadedSystemNotes = (selectedConversationNotes || []).filter((note: any) => (
      isSystemNote(note)
      && canCurrentUserAccessInternalSystemNote(note, profile.id, profile.role_id)
    ));
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
    profile.id,
    profile.role_id,
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
  const myNotesHasMoreBefore = !selectedNoteUserId && (
    selectedConversationKey === MY_NOTES_CONVERSATION_KEY
      ? selectedConversationHasMoreBefore
      : orderedFilteredNotes.length > myNotesDisplayLimit
  );
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
          userName: directoryUser?.display_name || getReadReceiptUserName(value) || (userId === String(profile.id || '') ? currentUserDisplayName : 'کاربر'),
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
          userName: directoryUser?.display_name || getLikeUserName(value) || (userId === String(profile.id || '') ? currentUserDisplayName : 'کاربر'),
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
    const existingUsableUrl = String(row?.file_url || '').trim();
    const persistedImportFailed = String((payload as any)?.media_import_status || '').trim() === 'failed';
    const persistedRetryable = (payload as any)?.media_import_retryable === true;
    if (!rowId || !fileId) {
      throw new Error('شناسه فایل این پیام در دسترس نیست.');
    }
    if (String(selectedBotGroup?.channel_type || '').trim() !== 'rubika') {
      throw new Error('این عملیات فقط برای فایل‌های روبیکا پشتیبانی می‌شود.');
    }
    if (existingUsableUrl && !/https?:\/\/botapi\.rubika\.ir\/storage\/v1\/object\/public\//i.test(existingUsableUrl)) {
      return mergeHydratedBotMessageAttachment(row, {
        file_url: existingUsableUrl,
        file_name: String(row.file_name || '').trim() || 'فایل',
        mime_type: String(row.mime_type || '').trim() || null,
      });
    }
    if (persistedImportFailed && !persistedRetryable && !options.force) {
      throw new Error(String((payload as any)?.media_import_error_message || 'بازیابی این فایل روبیکا قبلاً ناموفق بوده است.').trim());
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
      const importStatus = String((payload as any)?.media_import_status || '').trim();
      const importRetryable = (payload as any)?.media_import_retryable === true;
      if (importStatus === 'failed' && !importRetryable) return false;
      const rowFileUrl = String(row?.file_url || '').trim();
      const hasUsableAttachment = getBotMessageAttachments(row).some((item) => {
        const url = String(item?.url || '').trim();
        return Boolean(url) && !hasBrokenRubikaStorageUrl(url);
      }) || (Boolean(rowFileUrl) && !hasBrokenRubikaStorageUrl(rowFileUrl));
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
  const displayedResponsibilities = useMemo(
    () => filteredResponsibilities.slice(0, panelVisibleCounts.responsibilities),
    [filteredResponsibilities, panelVisibleCounts.responsibilities]
  );
  useEffect(() => {
    if (responsibilityViewKey === 'all') return;
    if (responsibilityViews.some((view) => view.key === responsibilityViewKey)) return;
    setResponsibilityViewKey('all');
  }, [responsibilityViewKey, responsibilityViews]);
  useEffect(() => {
    setPanelVisibleCounts((prev) => ({ ...prev, tasks: MAX_ITEMS }));
  }, [taskSortDirection, taskViewKey]);
  useEffect(() => {
    setPanelVisibleCounts((prev) => ({ ...prev, responsibilities: MAX_ITEMS }));
  }, [responsibilitySortDirection, responsibilityViewKey]);
  useEffect(() => {
    setPanelVisibleCounts((prev) => ({
      ...prev,
      tasks: Math.max(MAX_ITEMS, Math.min(prev.tasks, Math.max(filteredTasks.length, MAX_ITEMS))),
    }));
  }, [filteredTasks.length]);
  useEffect(() => {
    setPanelVisibleCounts((prev) => ({
      ...prev,
      responsibilities: Math.max(MAX_ITEMS, Math.min(prev.responsibilities, Math.max(filteredResponsibilities.length, MAX_ITEMS))),
    }));
  }, [filteredResponsibilities.length]);
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
  const badgeColor = NOTIFICATION_UNREAD_BADGE_COLOR;
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
  const scrollNotesToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const node = notesScrollContainerRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);
  const scrollBotMessagesToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const node = botMessagesScrollContainerRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
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

    const dedupeKey = `${channel}:${conversationKey}:${latest.createdAt}:${latest.id}`;
    const recentAt = communicationReadCursorRecentRef.current.get(dedupeKey) || 0;
    if (Date.now() - recentAt < 60_000) return true;

    const existingRequest = communicationReadCursorInFlightRef.current.get(dedupeKey);
    if (existingRequest) return existingRequest;

    const request = (async () => {
      let response = await supabase.rpc('mark_messaging_read_v2', {
        p_channel: channel,
        p_conversation_key: conversationKey,
        p_read_through_at: latest.createdAt,
        p_read_through_id: latest.id,
        p_entries: [],
      });
      if (isMissingRpcError(response.error)) {
        response = await supabase.rpc('mark_communication_read', {
          p_channel: channel,
          p_conversation_key: conversationKey,
          p_read_through_at: latest.createdAt,
          p_read_through_id: latest.id,
        });
      }
      const { data, error } = response;
      if (error) {
        if (!isMissingRpcError(error)) {
          console.warn('Could not persist communication read cursor', error);
        }
        return false;
      }
      const persisted = data !== false;
      if (persisted) {
        const now = Date.now();
        communicationReadCursorRecentRef.current.set(dedupeKey, now);
        if (communicationReadCursorRecentRef.current.size > 80) {
          communicationReadCursorRecentRef.current.forEach((value, key) => {
            if (now - value > 60_000) communicationReadCursorRecentRef.current.delete(key);
          });
        }
      }
      return persisted;
    })();

    communicationReadCursorInFlightRef.current.set(dedupeKey, request);
    try {
      return await request;
    } finally {
      communicationReadCursorInFlightRef.current.delete(dedupeKey);
    }
  }, []);
  const markNotesAsSeen = useCallback((rows: any[]) => {
    const currentUserId = String(profile.id || '').trim();
    if (!currentUserId || !Array.isArray(rows) || rows.length === 0) return;
    const shouldUseCursor = (
      selectedConversationReadModel === 'cursor'
      && Boolean(selectedConversationKey)
      && selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID
    );
    const receiptCursorRows = shouldUseCursor
      ? selectInternalReceiptCursorRows(rows, currentUserId, isSystemNote)
      : [];
    const readableRows = rows.filter((note: any) => {
        const id = String(note?.id || '').trim();
        const authorId = String(note?.author_id || '').trim();
        return (
          id
          && authorId !== currentUserId
          && !isNotificationRead('notes', 'note', id, false)
        );
      });
    if (readableRows.length === 0) {
      if (selectedConversationKey && receiptCursorRows.length > 0) {
        void markCommunicationReadCursor('internal', selectedConversationKey, receiptCursorRows);
      }
      return;
    }

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
    setNotes((prev) => prev.map((note: any) => (
      readableIds.has(String(note?.id || '').trim()) ? { ...note, is_read: true } : note
    )));
    setSelectedConversationNotes((prev) => prev
      ? prev.map((note: any) => (
        readableIds.has(String(note?.id || '').trim()) ? { ...note, is_read: true } : note
      ))
      : prev
    );

    const readEntries = Array.from(readableIds).map((sourceId) => ({ section: 'notes' as const, sourceType: 'note', sourceId }));
    if (shouldUseCursor && selectedConversationKey) {
      void markCommunicationReadCursor('internal', selectedConversationKey, receiptCursorRows).then((persisted) => {
        if (!persisted) {
          markNotificationEntriesRead(readEntries);
        }
        if (noteConversationSummaryAvailable) {
          debouncedRefreshNoteConversationSummaries();
        }
        void refreshUnreadSummary();
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
  }, [debouncedRefreshNoteConversationSummaries, isNotificationRead, markCommunicationReadCursor, markNotificationEntriesRead, noteConversationSummaryAvailable, patchLocalNoteConversationSummary, profile.id, refreshUnreadSummary, selectedConversationKey, selectedConversationReadModel, selectedNoteUserId]);

  const markBotMessagesAsSeen = useCallback((rows: CounterpartyBotMessageRow[]) => {
    const receiptCursorRows = botReadModel === 'cursor' && selectedBotGroupId
      ? selectBotReceiptCursorRows(rows)
      : [];
    const unreadInboundRows = rows.filter((row) => {
      const id = String(row?.id || '').trim();
      return (
        String(row?.direction || '').trim() === 'inbound'
        && isUuidValue(id)
        && !isNotificationRead('bot_messages', 'counterparty_bot_message', id, false)
      );
    });
    const unreadInboundIds = unreadInboundRows.map((row) => String(row.id).trim());
    if (unreadInboundIds.length === 0) {
      if (selectedBotGroupId && receiptCursorRows.length > 0) {
        void markCommunicationReadCursor('bot', `bot:${selectedBotGroupId}`, receiptCursorRows);
      }
      return;
    }
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
      setBotMessages((prev) => prev
        ? prev.map((row: any) => (
          unreadInboundIds.includes(String(row?.id || '').trim()) ? { ...row, is_read: true } : row
        ))
        : prev
      );
      const readEntries = unreadInboundIds.map((sourceId) => ({ section: 'bot_messages' as const, sourceType: 'counterparty_bot_message', sourceId }));
      if (botReadModel === 'cursor' && selectedBotGroupId) {
        void markCommunicationReadCursor('bot', `bot:${selectedBotGroupId}`, receiptCursorRows).then((persisted) => {
          if (!persisted) {
            markNotificationEntriesRead(readEntries);
          }
          if (botConversationSummaryAvailable) {
            debouncedRefreshBotConversationSummaries();
          }
          void refreshUnreadSummary();
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
  }, [botConversationSummaryAvailable, botReadModel, debouncedRefreshBotConversationSummaries, isNotificationRead, markCommunicationReadCursor, markNotificationEntriesRead, patchLocalBotConversationSummary, refreshUnreadSummary, selectedBotGroupId]);
  const markBotDirectMessagesAsSeen = useCallback((rows: BotDirectMessageRow[]) => {
    const unreadInboundIds = rows
      .filter((row) => String(row?.direction || '').trim() === 'inbound')
      .map((row) => String(row?.id || '').trim())
      .filter((id) => id && !isNotificationRead('bot_direct_messages', 'counterparty_bot_direct_message', id, seenBotMessageIds.has(id)));
    if (unreadInboundIds.length === 0) {
      if (selectedBotDirectThread) {
        const receiptRows = selectBotReceiptCursorRows(rows as any);
        if (receiptRows.length > 0) {
          void markCommunicationReadCursor(
            'bot',
            `bot:direct:${String(selectedBotDirectThread.channel_type || '').trim()}:${String(selectedBotDirectThread.chat_id || '').trim()}`,
            receiptRows,
          );
        }
      }
      return;
    }
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
    setBotDirectMessages((prev) => prev.map((row: any) => (
      unreadInboundIds.includes(String(row?.id || '').trim()) ? { ...row, is_read: true } : row
    )));
    if (selectedBotDirectThread) {
      const receiptRows = selectBotReceiptCursorRows(rows as any);
      if (receiptRows.length > 0) {
        void markCommunicationReadCursor(
          'bot',
          `bot:direct:${String(selectedBotDirectThread.channel_type || '').trim()}:${String(selectedBotDirectThread.chat_id || '').trim()}`,
          receiptRows,
        );
      }
    }
    markNotificationEntriesRead(
      unreadInboundIds.map((sourceId) => ({
        section: 'bot_direct_messages' as const,
        sourceType: 'counterparty_bot_direct_message',
        sourceId,
      })),
    );
    void refreshUnreadSummary();
  }, [isNotificationRead, markCommunicationReadCursor, markNotificationEntriesRead, refreshUnreadSummary, seenBotMessageIds, selectedBotDirectThread]);

  const markTasksAsSeen = useCallback((rows: any[]) => {
    const visibleTaskIds = (rows || [])
      .map((row) => String(row?.id || '').trim())
      .filter((id) => id && !isNotificationRead('tasks', 'task', id, seenTaskIds.has(id)));
    const visibleEntries = visibleTaskIds.map((sourceId) => ({ section: 'tasks' as const, sourceType: 'task', sourceId }));
    if (visibleEntries.length > 0) {
      startTransition(() => { setSeenTaskIds((prev) => new Set([...prev, ...visibleTaskIds])); });
      markNotificationEntriesRead(visibleEntries);
    }
  }, [isNotificationRead, markNotificationEntriesRead, seenTaskIds]);

  const markResponsibilitiesAsSeen = useCallback((rows: any[]) => {
    const visibleEntries = (rows || [])
      .map((row) => {
        const inboxItem = row?.__notification_inbox_item;
        const sourceId = String(inboxItem?.source_id || row?.id || '').trim();
        const sourceType = getResponsibilitySourceType(row);
        if (!sourceId || !sourceType) return null;
        if (isNotificationRead('responsibilities', sourceType, sourceId, seenResponsibilityIds.has(sourceId))) return null;
        return { section: 'responsibilities' as const, sourceType, sourceId };
      })
      .filter(Boolean) as NotificationStateEntryInput[];
    if (visibleEntries.length > 0) {
      startTransition(() => { setSeenResponsibilityIds((prev) => new Set([...prev, ...visibleEntries.map((entry) => entry.sourceId)])); });
      markNotificationEntriesRead(visibleEntries);
    }
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
  const scrollBotDirectMessagesToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      const node = botDirectMessagesScrollContainerRef.current;
      if (!node) return;
      node.scrollTo({ top: node.scrollHeight, behavior });
    });
  }, []);
  const handleBotDirectMessagesScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const threshold = 24;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight <= threshold;
    botDirectShouldStickToBottomRef.current = isAtBottom;
    if (isAtBottom) {
      markBotDirectMessagesAsSeen(botDirectMessages);
    }
  }, [botDirectMessages, markBotDirectMessagesAsSeen]);

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
    onOpenChange?.(false);
  }, [captureDrawerCloseSnapshot, onOpenChange]);

  const finalizeDrawerClose = useCallback(() => {
    const snapshot = drawerCloseSnapshotRef.current;
    drawerCloseSnapshotRef.current = null;
    if (!snapshot) {
      onAfterClose?.();
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
      onAfterClose?.();
    }, 80);
  }, [markBotMessagesAsSeen, markNotesAsSeen, markResponsibilitiesAsSeen, markSmsMessagesAsSeen, markTasksAsSeen, markVoipCallsAsSeen, onAfterClose]);

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
    botShouldStickToBottomRef.current = false;
    botForceScrollToBottomRef.current = false;
    botInitialAnchorDoneRef.current = false;
    setBotNewIncomingCount(0);
    botConversationKeyRef.current = null;
    botConversationMessageIdsRef.current = new Set();
    botMessagesGroupIdRef.current = null;
  }, [selectedBotGroupId]);

  useLayoutEffect(() => {
    if (!open || activeDrawerSection !== 'notes') return;
    if (!isSelectedConversationLoaded) return;
    // Initial anchor scroll is handled inside NotesPanel (scroll-to-bottom on
    // first load); NotesPanel calls setNoteViewportReady(true) when done.
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
    noteInitialAnchorDoneRef.current = true;
    scrollNotesToBottom('auto');
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
    if (!selectedNoteUserId) return;
    markNotesAsSeen(displayedChatNotes);
  }, [activeDrawerSection, displayedChatNotes, isNotificationRead, markNotificationEntriesRead, markNotesAsSeen, noteLikeNotifications, noteViewportReady, notes, open, profile.id, seenNoteIds, selectedNoteUserId]);

  useLayoutEffect(() => {
    if (!open || activeDrawerSection !== 'bot_messages') return;
    if (loadingBotMessages) return;
    if (!botViewportReady) {
      scrollBotMessagesToBottom('auto');
      botInitialAnchorDoneRef.current = true;
      botShouldStickToBottomRef.current = true;
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
    botInitialAnchorDoneRef.current = true;
    scrollBotMessagesToBottom('auto');
    botForceScrollToBottomRef.current = false;
  }, [activeDrawerSection, botMessages, botViewportReady, loadingBotMessages, open, selectedBotGroupId]);

  useEffect(() => {
    if (!open || activeDrawerSection !== 'bot_messages') return;
    if (!botViewportReady) return;
    if (!selectedBotGroupId) return;
    markBotMessagesAsSeen(botMessages);
  }, [activeDrawerSection, botMessages, botViewportReady, markBotMessagesAsSeen, open, selectedBotGroupId]);
  useLayoutEffect(() => {
    if (!open || activeDrawerSection !== 'bot_direct_messages') return;
    if (loadingBotDirectMessages) return;
    const shouldForceScroll = botDirectForceScrollToBottomRef.current;
    if (!shouldForceScroll && !botDirectShouldStickToBottomRef.current) return;
    scrollBotDirectMessagesToBottom('auto');
    botDirectForceScrollToBottomRef.current = false;
  }, [activeDrawerSection, botDirectMessages, loadingBotDirectMessages, open, scrollBotDirectMessagesToBottom, selectedBotDirectThreadId]);
  useEffect(() => {
    if (!open || activeDrawerSection !== 'bot_direct_messages') return;
    if (!selectedBotDirectThreadId) return;
    markBotDirectMessagesAsSeen(botDirectMessages);
  }, [activeDrawerSection, botDirectMessages, markBotDirectMessagesAsSeen, open, selectedBotDirectThreadId]);

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
      markTasksAsSeen(displayedTaskAlerts);
      return;
    }
    if (activeDrawerSection === 'responsibilities') {
      markResponsibilitiesAsSeen(displayedResponsibilities);
      return;
    }
    if (variant === 'chat' && activeDrawerSection === 'voip_calls') {
      markVoipCallsAsSeen(displayedVoipCalls);
    }
  }, [activeDrawerSection, displayedResponsibilities, displayedTaskAlerts, displayedVoipCalls, markResponsibilitiesAsSeen, markTasksAsSeen, markVoipCallsAsSeen, open, variant]);

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
    if (standalone || !isMobile || !open || typeof window === 'undefined') return;
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
  }, [handleClose, isMobile, open, standalone]);

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

  const openForwardModal = useCallback((note: any, sourceType: 'note' | 'bot' = 'note') => {
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
  }, [selectedNoteUserId]);

  const handleForwarded = useCallback(() => {
    noteShouldStickToBottomRef.current = true;
    noteForceScrollToBottomRef.current = true;
  }, []);

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

  const handleNoteScopeModuleChange = useCallback((value: string | null) => {
    setNoteModuleId(value);
    setNoteRecordId(null);
  }, []);

  const handleNoteScopeRecordChange = useCallback((value: string | null) => {
    setNoteRecordId(value);
  }, []);

  const submitNote = async () => {
    if (!noteText.trim() && noteAttachments.length === 0 && noteLinkedAttachments.length === 0) return;
    if (noteSending) return;

    const optimisticId = `pending-${Date.now()}`;
    let optimisticInserted = false;
    setNoteSending(true);
    try {
      const scope = normalizeNoteScope(noteModuleId, noteRecordId);
      const renderedNoteText = noteModuleId && noteTemplateRecord
        ? await renderNotificationTemplate(noteText, noteTemplateRecord, noteModuleId)
        : noteText;
      const { mentionUserIds, mentionRoleIds } = parseMentionSelections(mentionValues);
      const groupPayload = getChatGroupPayload(selectedChatGroup);
      const isSavingToMyNotes = selectedConversationKey === MY_NOTES_CONVERSATION_KEY;
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
        org_id: profile.org_id,
        module_id: scope.module_id,
        record_id: scope.record_id,
        content: serializeNoteContent(renderedNoteText, mergedAttachments),
        reply_to: noteReplyTo || null,
        mention_user_ids: isSavingToMyNotes ? [] : Array.from(new Set([...mentionUserIds, ...groupPayload.mentionUserIds])),
        mention_role_ids: isSavingToMyNotes ? [] : Array.from(new Set([...mentionRoleIds, ...groupPayload.mentionRoleIds])),
        author_id: profile.id,
        author_name: directoryUserMap[String(profile.id || '')]?.display_name || null,
        metadata: isSavingToMyNotes ? { saved_message: true } : groupPayload.metadata,
      };

      const optimisticRow = {
        ...payload,
        id: optimisticId,
        created_at: new Date().toISOString(),
        is_edited: false,
        edited_at: null,
        __optimistic: true,
      };
      setNotes((prev) => [...prev, optimisticRow]);
      setSelectedConversationNotes((prev) => mergeRowsByIdCreatedAsc(prev, [optimisticRow]));
      optimisticInserted = true;

      const insertedNotes = await insertNotesWithFallback([payload]);
      if (Array.isArray(insertedNotes) && insertedNotes.length > 0) {
        const nextRows = insertedNotes as any[];
        setNotes((prev) => {
          const seen = new Set(nextRows.map((row) => String(row?.id || '').trim()).filter(Boolean));
          return [...prev.filter((row: any) => (
            String(row?.id || '').trim() !== optimisticId
            && !seen.has(String(row?.id || '').trim())
          )), ...nextRows];
        });
        if (selectedConversationKey) {
          setSelectedConversationNotes((prev) => mergeRowsByIdCreatedAsc(
            prev.filter((row: any) => String(row?.id || '') !== optimisticId),
            nextRows,
          ));
        }
      }
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
      void Promise.all([
        noteConversationSummaryAvailable ? refreshNoteConversationSummaries() : Promise.resolve(null),
        refreshUnreadSummary(),
      ]).catch((refreshError) => {
        console.warn('Could not refresh note summaries after send', refreshError);
      });
    } catch (error: any) {
      if (optimisticInserted) {
        setNotes((prev) => prev.filter((row: any) => String(row?.id || '') !== optimisticId));
        setSelectedConversationNotes((prev) => prev.filter((row: any) => String(row?.id || '') !== optimisticId));
      }
      message.error(toFaErrorMessage(error, 'ثبت یادداشت ناموفق بود.'));
    } finally {
      setNoteSending(false);
    }
  };

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

      clearIdentityDirectoryCache(profile.org_id);
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
    if (managedByRuntime) return;
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

    // Catch-up: tasks/responsibilities load async (via hooks) AFTER notificationsReadyRef was
    // set by another source (e.g. notes). Without this, all existing tasks look "new" and
    // trigger a popup flash that immediately closes when the read-filter runs.
    if (prevTasksRef.current.size === 0 && currentTaskIds.size > 0) {
      prevTasksRef.current = currentTaskIds;
      prevResponsibilitiesRef.current = currentResponsibilityIds;
      return;
    }
    if (prevResponsibilitiesRef.current.size === 0 && currentResponsibilityIds.size > 0) {
      prevResponsibilitiesRef.current = currentResponsibilityIds;
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
            attachments: parsed.attachments,
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
          body: getResponsibilityOverlayBody(item),
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
          const attachments = getBotMessageAttachments(row);
          return {
            id: `bot:${String(row.id)}`,
            dedupeKey,
            kind: 'bot' as const,
            title: `${title} - ${sender}`,
            body,
            createdAt: row.created_at || null,
            attachments,
            hasAttachments: attachments.length > 0 || Boolean(row?.file_url || row?.file_name),
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
    managedByRuntime,
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
    if (managedByRuntime) return;
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
  }, [dismissedUiNotificationIds, isNotificationRead, managedByRuntime, seenBotMessageIds, seenNoteIds, seenResponsibilityIds, seenSmsMessageIds, seenTaskIds, seenVoipCallIds]);

  const handleDismissUiNotification = useCallback((item: UiNotificationItem) => {
    const notificationId = String(item?.id || '').trim();
    if (!notificationId) return;

    if ((item.kind === 'note' || item.kind === 'assistant') && item.note) {
      const sourceId = String(item.note?.id || '').trim();
      if (sourceId && !isNotificationRead('notes', 'note', sourceId, seenNoteIds.has(sourceId))) {
        startTransition(() => {
          setSeenNoteIds((prev) => new Set(prev).add(sourceId));
        });
        setNotes((prev) => prev.map((note: any) => (
          String(note?.id || '').trim() === sourceId ? { ...note, is_read: true } : note
        )));
        setSelectedConversationNotes((prev) => prev
          ? prev.map((note: any) => (
            String(note?.id || '').trim() === sourceId ? { ...note, is_read: true } : note
          ))
          : prev
        );
        markNotificationEntriesRead([{ section: 'notes', sourceType: 'note', sourceId }]);
        if (noteConversationSummaryAvailable) {
          debouncedRefreshNoteConversationSummaries();
        }
        void refreshUnreadSummary();
      }
    } else if (item.kind === 'task' && item.task) {
      markTasksAsSeen([item.task]);
    } else if (item.kind === 'responsibility' && item.responsibility) {
      markResponsibilitiesAsSeen([item.responsibility]);
    } else if (item.kind === 'bot' && item.botMessage) {
      const sourceId = String(item.botMessage?.id || '').trim();
      if (
        sourceId
        && String(item.botMessage?.direction || '').trim() === 'inbound'
        && !isNotificationRead('bot_messages', 'counterparty_bot_message', sourceId, seenBotMessageIds.has(sourceId))
      ) {
        startTransition(() => {
          setSeenBotMessageIds((prev) => new Set(prev).add(sourceId));
        });
        setBotMessages((prev) => prev
          ? prev.map((row: any) => (
            String(row?.id || '').trim() === sourceId ? { ...row, is_read: true } : row
          ))
          : prev
        );
        markNotificationEntriesRead([{ section: 'bot_messages', sourceType: 'counterparty_bot_message', sourceId }]);
        if (botConversationSummaryAvailable) {
          debouncedRefreshBotConversationSummaries();
        }
        void refreshUnreadSummary();
      }
    } else if (item.kind === 'sms' && item.smsMessage) {
      markSmsMessagesAsSeen([item.smsMessage]);
    } else if (item.kind === 'voip_call' && item.voipCall) {
      markVoipCallsAsSeen([item.voipCall]);
    }

    setDismissedUiNotificationIds((prev) => new Set(prev).add(notificationId));
    setUiNotifications((prev) => prev.filter((entry) => entry.id !== notificationId));
  }, [
    botConversationSummaryAvailable,
    debouncedRefreshBotConversationSummaries,
    debouncedRefreshNoteConversationSummaries,
    isNotificationRead,
    markNotificationEntriesRead,
    markResponsibilitiesAsSeen,
    markSmsMessagesAsSeen,
    markTasksAsSeen,
    markVoipCallsAsSeen,
    noteConversationSummaryAvailable,
    refreshUnreadSummary,
    seenBotMessageIds,
    seenNoteIds,
  ]);

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
    if (managedByRuntime) return;
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
        attachments: item.attachments,
        hasAttachments: item.hasAttachments,
        onOpen: () => openUiNotification(item),
        onDismiss: () => handleDismissUiNotification(item),
      })),
      overlaySource,
    );
  }, [handleDismissUiNotification, managedByRuntime, open, openUiNotification, overlaySource, uiNotifications]);

  useEffect(() => () => {
    if (managedByRuntime) return;
    setUiNotificationOverlayItems([], overlaySource);
  }, [managedByRuntime, overlaySource]);

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

  // Stable identity for submitNote so the memoized context below doesn't
  // change on every render (submitNote closes over most composer state).
  const submitNoteStable = useStableCallback(submitNote);
  // Memoized context: NotesPanel is React.memo'd, so keeping this object
  // referentially stable bails out re-renders caused by unrelated popover
  // state (bot/sms/tasks churn, runtime revisions, overlay updates).
  const notesPanelContext = useMemo(() => ({
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
        setSelectedConversationNotes,
        refreshNoteConversationSummaries,
        refreshUnreadSummary,
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
        submitNote: submitNoteStable,
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
        openPreviewRecord,
        setNoteViewportReady,
        noteInitialAnchorDoneRef,
  }), [
    activeConversationRoleLabel,
    authorNameMap,
    directoryUserMap,
    displayedChatNotes,
    editingNoteId,
    editingNoteValue,
    effectiveSystemNoteStats,
    handleClose,
    handleNoteScopeModuleChange,
    handleNoteScopeRecordChange,
    handleNoteTextChange,
    handleNotesScroll,
    isSelectedConversationLoaded,
    isUnreadNoteRow,
    loadOlderMyNotesWithPreserve,
    loadOlderNotesWithPreserve,
    loadingNotes,
    loadingOlderSelectedConversationNotes,
    mentionOptions,
    mentionValues,
    message,
    mobileNoteSearchOpen,
    moduleOptions,
    myNoteStats,
    myNotesHasMoreBefore,
    normalizeLikeReceipts,
    normalizeReadReceipts,
    normalizedNoteMessageSearch,
    noteAttachments,
    noteLinkedAttachments,
    noteMentionPickerOpen,
    noteMessageSearch,
    noteMessageSearchOpen,
    noteModuleId,
    noteNewIncomingCount,
    noteRecordId,
    noteRecordOptions,
    noteReplyTo,
    noteSending,
    noteSmsNotificationEnabled,
    noteText,
    noteUserSearch,
    noteViewportReady,
    notes,
    openCreateActivityFromMessage,
    openForwardModal,
    openPreviewRecord,
    openReadyTextsModal,
    profile,
    recordTitleMap,
    refreshNoteConversationSummaries,
    refreshUnreadSummary,
    renderReadReceiptStatus,
    resolveNoteBubbleAvatar,
    roleLookup,
    scrollMessageIntoView,
    scrollNotesToBottom,
    selectedChatGroup,
    selectedConversationHasMoreBefore,
    selectedNoteConversationAvatar,
    selectedNoteConversationListItem,
    selectedNoteUser,
    selectedNoteUserId,
    setSelectedConversationNotes,
    shouldAnimateChatEntry,
    submitNoteStable,
    systemAvatarSrc,
    systemConversationAvatar,
    toggleNoteLike,
    visibleNoteConversations,
  ]);
  const renderNotesPanel = (layout: 'desktop' | 'mobile' = 'desktop') => (
    <NotesPanel layout={layout} context={notesPanelContext} />
  );
  // Plain-function props get stable identities so the memoized panels bail out.
  const getCentralRecordLabelStable = useStableCallback(getCentralRecordLabel);
  const refreshSectionStable = useStableCallback(refreshSection);
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
      getCentralRecordLabel={getCentralRecordLabelStable}
      getPhoneMatchLabel={getPhoneMatchLabel}
      getModuleFieldOptionLabel={getModuleFieldOptionLabel}
      requestReplySuggestion={requestReplySuggestion}
      refreshSection={refreshSectionStable}
      onOpenPhoneMatchPicker={openPhoneIdentityBindModal}
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
      roleNameMap={roleNameMap}
      directoryUsers={directoryUsers}
      directoryRoles={directoryRoles}
      setSelectedVoipThreadKey={setSelectedVoipThreadKey}
      openPreviewRecord={openPreviewRecord}
      getCentralRecordLabel={getCentralRecordLabelStable}
      getPhoneMatchLabel={getPhoneMatchLabel}
      getModuleFieldOptionLabel={getModuleFieldOptionLabel}
      onOpenPhoneMatchPicker={openPhoneIdentityBindModal}
      openCreateActivityFromMessage={openCreateActivityFromMessage}
      onForwardRecording={(call: any, attachment: NoteAttachment) => {
        const direction = String(call?.direction || '').trim() === 'outgoing' ? 'خروجی' : 'ورودی';
        const phone = direction === 'خروجی'
          ? String(call?.destination_number || '').trim()
          : String(call?.source_number || '').trim();
        openForwardModal({
          id: String(call?.id || '').trim(),
          module_id: call?.module_id || call?.related_module_id || null,
          record_id: call?.record_id || call?.related_record_id || null,
          content: serializeNoteContent(
            `فایل صوتی تماس ${direction}${phone ? ` با ${phone}` : ''}`,
            [attachment],
          ),
        });
      }}
    />
  );

  // Bot panel derived data — memoized at component level so the React.memo'd
  // BotMessagesPanel actually bails out when unrelated popover state changes.
  const botMessageMap = useMemo(
    () => new Map(botMessages.map((row) => [String(row.id), row])),
    [botMessages],
  );
  const botUnreadByGroup = useMemo(() => (
    botConversationSummaryAvailable && rpcBotConversationSummaries
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
        }, {})
  ), [botConversationSummaryAvailable, botNotificationMessages, isNotificationRead, rpcBotConversationSummaries, seenBotMessageIds, visibleBotGroupIds]);
  const filteredBotGroups = useMemo(() => {
    const normalizedGroupSearch = String(botGroupSearch || '').trim().toLowerCase();
    return effectiveBotGroups.filter((row) => {
      if (!normalizedGroupSearch) return true;
      const title = String(row.group_title || '').trim().toLowerCase();
      const link = String(row.group_join_link || '').trim().toLowerCase();
      const channel = String(row.channel_type || '').trim().toLowerCase();
      return `${title} ${link} ${channel}`.includes(normalizedGroupSearch);
    });
  }, [botGroupSearch, effectiveBotGroups]);
  const filteredBotMessages = useMemo(() => {
    const normalizedMessageSearch = String(botMessageSearch || '').trim().toLowerCase();
    return botMessages.filter((row) => {
      if (!normalizedMessageSearch) return true;
      const text = String(row.content_text || '').trim().toLowerCase();
      const fileName = String(row.file_name || '').trim().toLowerCase();
      return `${text} ${fileName}`.includes(normalizedMessageSearch);
    });
  }, [botMessageSearch, botMessages]);
  const botDirectUnreadByThread = useMemo(() => (
    botDirectNotificationMessages.reduce<Record<string, number>>((acc, row) => {
      const threadId = String(row?.direct_thread_id || '').trim();
      const id = String(row?.id || '').trim();
      if (!threadId || !id || String(row?.direction || '').trim() !== 'inbound') return acc;
      if (isNotificationRead('bot_direct_messages', 'counterparty_bot_direct_message', id, seenBotMessageIds.has(id))) return acc;
      acc[threadId] = (acc[threadId] || 0) + 1;
      return acc;
    }, {})
  ), [botDirectNotificationMessages, isNotificationRead, seenBotMessageIds]);
  const botDirectMessagesCount = useMemo(
    () => Object.values(botDirectUnreadByThread).reduce((sum, count) => sum + Number(count || 0), 0),
    [botDirectUnreadByThread],
  );
  const filteredBotDirectMessages = useMemo(() => {
    const normalizedMessageSearch = String(botDirectMessageSearch || '').trim().toLowerCase();
    return botDirectMessages.filter((row) => {
      if (!normalizedMessageSearch) return true;
      const text = String(row.content_text || '').trim().toLowerCase();
      const fileName = String(row.file_name || '').trim().toLowerCase();
      return `${text} ${fileName}`.includes(normalizedMessageSearch);
    });
  }, [botDirectMessageSearch, botDirectMessages]);
  const resolveOutboundBotAuthor = useCallback((row: CounterpartyBotMessageRow | null | undefined) => {
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
  }, [directoryUserMap]);
  const resolveInboundBotAuthor = useCallback((row: CounterpartyBotMessageRow | null | undefined) => {
      const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
      const channel = String(selectedBotGroup?.channel_type || (payload as any)?.channel_type || '').trim();
      const senderDisplayName = String((payload as any)?.sender_display_name || '').trim();
      const usernameRaw = String((payload as any)?.username || '').trim().replace(/^@+/, '');
      const username = usernameRaw ? `@${usernameRaw}` : '';
      const senderId = String((payload as any)?.sender_id || '').trim();
      const chatUserId = String((payload as any)?.user_id || (payload as any)?.object_guid || row?.chat_id || '').trim();
      const identityThread = channel && chatUserId ? botDirectThreadByIdentityKey[`${channel}:${chatUserId}`] || null : null;
      const mappedName = String(identityThread?.counterparty_label || identityThread?.display_name || '').trim();
      const fallbackIdLabel = (chatUserId ? `Chat: ${chatUserId}` : '') || (senderId ? `ID: ${senderId}` : '') || '';
      const primaryName = mappedName || senderDisplayName || username;
      const name = primaryName || fallbackIdLabel || 'کاربر';
      const metaLabel = mappedName
        ? (username && username !== mappedName ? username : null)
        : primaryName
          ? (username && username !== primaryName
            ? username
            : (chatUserId ? `Chat: ${chatUserId}` : '') || (senderId ? `ID: ${senderId}` : '') || null)
          : null;
      return {
        name,
        metaLabel,
        avatarUrl: String(identityThread?.counterparty_image_url || '').trim() || null,
        fallback: String(name || 'ب').trim().slice(0, 1) || 'ب',
      };
  }, [botDirectThreadByIdentityKey, selectedBotGroup]);
  const resolveBotMessageAuthor = useCallback((row: CounterpartyBotMessageRow | null | undefined) => (
    String(row?.direction || '') === 'outbound'
      ? resolveOutboundBotAuthor(row)
      : resolveInboundBotAuthor(row)
  ), [resolveInboundBotAuthor, resolveOutboundBotAuthor]);
  const renderBotAuthorNodes = useCallback((row: any, author: { name?: string | null; metaLabel?: string | null }) => {
    if (String(row?.direction || '').trim() === 'outbound') return {};
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const senderChatId = String(
      (payload as any)?.sender_id
      || (payload as any)?.user_id
      || (payload as any)?.object_guid
      || row?.chat_id
      || ''
    ).trim();
    if (!senderChatId) return {};
    const openModal = () => {
      void openBotIdentityBindModal(row);
    };
    const authorName = String(author?.name || '').trim();
    const authorMetaLabel = String(author?.metaLabel || '').trim();
    const resolvedMetaLabel = authorMetaLabel || (authorName && authorName !== senderChatId ? senderChatId : '');
    return {
      authorNameNode: (
        <button
          type="button"
          onClick={openModal}
          className="cursor-pointer text-inherit underline decoration-dotted underline-offset-2 hover:text-[rgb(var(--brand-700-rgb))] dark:hover:text-[rgb(var(--brand-300-rgb))]"
        >
          {String(author?.name || '').trim() || 'کاربر'}
        </button>
      ),
      metaNode: resolvedMetaLabel ? (
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1 cursor-pointer text-[11px] text-gray-400 underline decoration-dotted underline-offset-2 hover:text-[rgb(var(--brand-700-rgb))] dark:hover:text-[rgb(var(--brand-300-rgb))]"
        >
          <span dir="ltr">{resolvedMetaLabel}</span>
          <EditOutlined className="text-[10px]" />
        </button>
      ) : null,
    };
  }, [openBotIdentityBindModal]);

  const sendBotMessage = useStableCallback(async () => {
      const text = String(botMessageText || '').trim();
      const selectedGroup = selectedBotGroup;
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
        const attachmentNameText = buildAttachmentNameText(outboundAttachments);
        const isBotMediaMessage = attachments.length > 0;
        const finalText = isBotMediaMessage
          ? String(renderedText || '').trim()
          : String(renderedText || '').trim();
        if (!String(finalText || '').trim() && attachments.length === 0) {
          message.warning('پیام خالی است.');
          return;
        }
        botShouldStickToBottomRef.current = true;
        botForceScrollToBottomRef.current = true;
        const sendResult = await sendTextToBotGroup(selectedGroup, finalText, {
          fallbackText: isBotMediaMessage
            ? [String(renderedText || '').trim(), attachmentNameText].filter(Boolean).join('\n')
            : undefined,
          attachments: isBotMediaMessage ? attachments : undefined,
          payload: {
            attachments,
            reply_to_message_id: botReplyToId || null,
          },
          messageType: attachments.length > 0 ? 'file' : 'text',
        });
        const insertedRows = Array.isArray((sendResult as any)?.rows)
          ? (sendResult as any).rows as CounterpartyBotMessageRow[]
          : [];
        if (insertedRows.length > 0) {
          setBotMessages((prev) => mergeRowsByIdCreatedAsc(prev, insertedRows));
        }
        setBotMessageText('');
        setBotReplyToId(null);
        setBotAttachments([]);
        setBotLinkedAttachments([]);
        setBotMentionPickerOpen(false);
        void Promise.all([
          fetchBotGroups(),
          botConversationSummaryAvailable ? refreshBotConversationSummaries() : Promise.resolve(null),
          insertedRows.length > 0
            ? Promise.resolve(null)
            : (botTimelineAvailable ? refreshBotTimeline({ force: true }) : fetchBotMessages(selectedGroup.id, { forceFull: true })),
        ]).catch((refreshError) => {
          console.warn('Could not refresh bot conversation after send', refreshError);
        });
        message.success('پیام بات ارسال شد.');
      } catch (error: any) {
        console.warn('Could not send bot group message', error);
        message.error(toFaErrorMessage(error, 'ارسال پیام بات ناموفق بود.'));
      } finally {
        setBotSending(false);
      }
  });

  const sendBotDirectMessage = useStableCallback(async () => {
    const text = String(botDirectMessageText || '').trim();
    const selectedThread = selectedBotDirectThread;
    if (!selectedThread) {
      message.warning('ابتدا یک پی‌وی بات انتخاب کنید.');
      return;
    }
    const channel = String(selectedThread.channel_type || '').trim() as BotChannel;
    const chatId = String(selectedThread.chat_id || '').trim();
    if (!chatId) {
      message.warning('شناسه چت این پی‌وی ثبت نشده است.');
      return;
    }
    setBotDirectSending(true);
    try {
      const recordModuleId = String(selectedThread.target_module_id || '').trim() || null;
      const recordId = String(selectedThread.target_record_id || '').trim() || null;
      const uploadedAttachments = botDirectAttachments.length > 0
        ? await uploadNoteAttachments(recordModuleId, recordId, botDirectAttachments)
        : [];
      const attachments = [...botDirectLinkedAttachments, ...uploadedAttachments].filter((attachment, index, all) => {
        const url = String(attachment?.url || '').trim();
        return url && all.findIndex((item) => String(item?.url || '').trim() === url) === index;
      });
      if (botDirectLinkedAttachments.length > 0) {
        await ensureNoteAttachmentShortcuts(recordModuleId, recordId, botDirectLinkedAttachments);
      }
      const outboundAttachments = attachments.length > 0
        ? await shortenAttachmentsForExternalShare(attachments, {
            moduleId: recordModuleId,
            recordId,
            metadata: {
              source_type: 'notifications_popover_direct',
              channel_type: channel,
            },
          })
        : [];
      const attachmentNameText = buildAttachmentNameText(outboundAttachments);
      const finalText = String(text || '').trim();
      if (!finalText && attachments.length === 0) {
        message.warning('پیام خالی است.');
        return;
      }
      const sendResult = await sendTextToBotDirectThread(selectedThread, finalText, {
        attachments: attachments.length > 0 ? outboundAttachments : undefined,
        fallbackText: attachments.length > 0 ? [finalText, attachmentNameText].filter(Boolean).join('\n') : undefined,
        messageType: attachments.length > 0 ? 'file' : 'text',
        payload: {
          attachments: outboundAttachments,
        },
      });
      const rows = Array.isArray((sendResult as any)?.rows)
        ? (sendResult as any).rows as BotDirectMessageRow[]
        : [];
      if (rows.length > 0) {
        botDirectShouldStickToBottomRef.current = true;
        botDirectForceScrollToBottomRef.current = true;
        setBotDirectMessages((prev) => mergeRowsByIdCreatedAsc(prev, rows as any) as any);
      }
      setBotDirectMessageText('');
      setBotDirectAttachments([]);
      setBotDirectLinkedAttachments([]);
      void Promise.all([
        fetchBotDirectThreads(),
        fetchBotDirectNotificationMessages(),
      ]).catch((refreshError) => {
        console.warn('Could not refresh bot direct conversation after send', refreshError);
      });
      message.success('پیام شخصی بات ارسال شد.');
    } catch (error: any) {
      console.warn('Could not send bot direct message', error);
      message.error(toFaErrorMessage(error, 'ارسال پیام شخصی بات ناموفق بود.'));
    } finally {
      setBotDirectSending(false);
    }
  });

  const suggestBotDirectReply = useStableCallback(async (instruction = '') => {
    const selectedThread = selectedBotDirectThread;
    if (!selectedThread) {
      message.warning('ابتدا یک پی‌وی بات انتخاب کنید.');
      return;
    }
    if (botDirectSuggesting) return;
    setBotDirectSuggesting(true);
    setBotDirectAiPopoverOpen(false);
    try {
      const recentMessages = (botDirectMessages || []).slice(-18).map((row: any) => {
        const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
        const direction = String(row?.direction || '').trim() || 'inbound';
        const isOutbound = direction === 'outbound';
        const text = String(row?.content_text || '').trim()
          || (String(row?.file_name || '').trim() ? `فایل: ${String(row.file_name || '').trim()}` : '');
        return {
          direction,
          authorName: isOutbound
            ? 'کاربر سازمان'
            : (
              String(selectedThread?.counterparty_label || '').trim()
              || String(payload?.sender_display_name || '').trim()
              || String(selectedThread?.display_name || '').trim()
              || String(selectedThread?.username || '').trim()
              || String(selectedThread?.chat_id || '').trim()
              || 'مخاطب'
            ),
          text,
          createdAt: row?.created_at || null,
        };
      }).filter((item: any) => item.text);

      const suggested = await requestReplySuggestion({
        channel: 'bot',
        botDirectThreadId: String(selectedThread.id || '').trim() || null,
        instruction: String(instruction || '').trim() || null,
        context: {
          mode: selectedThread?.target_module_id && selectedThread?.target_record_id ? 'record' : 'page',
          moduleId: selectedThread?.target_module_id || null,
          recordId: selectedThread?.target_record_id || null,
          route: '/notifications?bot_direct=1',
        },
        counterparty: {
          moduleId: selectedThread?.target_module_id || null,
          recordId: selectedThread?.target_record_id || null,
        },
        recentMessages,
      });
      setBotDirectMessageText(suggested);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'پیشنهاد پاسخ پیام شخصی بات ناموفق بود.'));
    } finally {
      setBotDirectSuggesting(false);
    }
  });

  const suggestBotReply = useStableCallback(async (instruction = '') => {
      const selectedGroup = selectedBotGroup;
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
  });

  // fetchBotMessages is a plain async function recreated per render — give the
  // memoized panel a stable reference.
  const fetchBotMessagesStable = useStableCallback(fetchBotMessages);
  const renderBotMessagesPanel = (layout: 'desktop' | 'mobile' = 'desktop') => {
    const selectedGroup = selectedBotGroup;
    const hideBotTimelineUntilSettled = !loadingBotMessages && !botViewportReady && Boolean(selectedGroup);
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
        setBotMessages={setBotMessages}
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
        renderBotAuthorNodes={renderBotAuthorNodes}
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
        refreshUnreadSummary={refreshUnreadSummary}
        fetchBotMessages={fetchBotMessagesStable}
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
        openPreviewRecord={openPreviewRecord}
      />
    );
  };
  const renderBotDirectMessagesPanel = (layout: 'desktop' | 'mobile' = 'desktop') => {
    const selectedThread = selectedBotDirectThread;
    const hideTimelineUntilSettled = false;
    return (
      <BotDirectMessagesPanel
        layout={layout}
        threads={filteredBotDirectThreads}
        selectedThread={selectedThread}
        selectedThreadId={selectedBotDirectThreadId}
        setSelectedThreadId={setSelectedBotDirectThreadId}
        threadSearch={botDirectThreadSearch}
        setThreadSearch={setBotDirectThreadSearch}
        mobileSearchOpen={mobileBotDirectSearchOpen}
        setMobileSearchOpen={setMobileBotDirectSearchOpen}
        unreadByThread={botDirectUnreadByThread}
        messages={filteredBotDirectMessages}
        messageSearch={botDirectMessageSearch}
        setMessageSearch={setBotDirectMessageSearch}
        loadingMessages={loadingBotDirectMessages}
        hideTimelineUntilSettled={hideTimelineUntilSettled}
        scrollContainerRef={botDirectMessagesScrollContainerRef}
        handleScroll={handleBotDirectMessagesScroll}
        messageText={botDirectMessageText}
        onChangeMessageText={setBotDirectMessageText}
        onSendMessage={sendBotDirectMessage}
        sending={botDirectSending}
        attachments={botDirectAttachments}
        setAttachments={setBotDirectAttachments}
        linkedAttachments={botDirectLinkedAttachments}
        setLinkedAttachments={setBotDirectLinkedAttachments}
        botDirectSuggesting={botDirectSuggesting}
        botDirectAiPopoverOpen={botDirectAiPopoverOpen}
        setBotDirectAiPopoverOpen={setBotDirectAiPopoverOpen}
        suggestBotDirectReply={suggestBotDirectReply}
        openReadyTextsModal={openReadyTextsModal}
        onOpenSettings={(thread) => {
          void openBotIdentityBindModalForIdentity({
            channel: String(thread.channel_type || '').trim() as BotChannel,
            chatId: String(thread.chat_id || '').trim(),
            displayName: String(thread.display_name || thread.counterparty_label || '').trim(),
            username: String(thread.username || '').trim(),
            phoneNumber: String(thread.phone_number || '').trim(),
          });
        }}
        handleClose={handleClose}
        openPreviewRecord={openPreviewRecord}
      />
    );
  };
  const renderTasksPanel = (mode: 'list' | 'grid' = 'list') => (
    <TasksPanel
      mode={mode}
      tasks={tasks}
      filteredTasks={filteredTasks}
      visibleCount={panelVisibleCounts.tasks}
      onShowMore={() => setPanelVisibleCounts((prev) => ({ ...prev, tasks: prev.tasks + MAX_ITEMS }))}
      onShowLess={() => setPanelVisibleCounts((prev) => ({ ...prev, tasks: MAX_ITEMS }))}
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
      canLockTaskRecord={canUseRecordLockPermission(currentPermissionMap, 'tasks', 'lock', profile.software_role)}
      canUnlockTaskRecord={canUseRecordLockPermission(currentPermissionMap, 'tasks', 'unlock', profile.software_role)}
    />
  );

  const renderResponsibilitiesPanel = (mode: 'list' | 'grid' = 'list') => (
    <ResponsibilitiesPanel
      mode={mode}
      filteredResponsibilities={filteredResponsibilities}
      visibleCount={panelVisibleCounts.responsibilities}
      onShowMore={() => setPanelVisibleCounts((prev) => ({ ...prev, responsibilities: prev.responsibilities + MAX_ITEMS }))}
      onShowLess={() => setPanelVisibleCounts((prev) => ({ ...prev, responsibilities: MAX_ITEMS }))}
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
      canLockModuleRecord={(moduleId) => canUseRecordLockPermission(currentPermissionMap, moduleId, 'lock', profile.software_role)}
      canUnlockModuleRecord={(moduleId) => canUseRecordLockPermission(currentPermissionMap, moduleId, 'unlock', profile.software_role)}
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
        label: <Badge count={formatBadgeCount(botMessagesCount)} color={badgeColor}>گروه‌های بات</Badge>,
        children: renderLazyDrawerPane('bot_messages', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden`, () => renderBotMessagesPanel('desktop')),
      },
      {
        key: 'bot_direct_messages',
        label: <Badge count={formatBadgeCount(botDirectMessagesCount)} color={badgeColor}>پیام‌های شخصی بات</Badge>,
        children: renderLazyDrawerPane('bot_direct_messages', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden`, () => renderBotDirectMessagesPanel('desktop')),
      },
      {
        key: 'sms_messages',
        label: <Badge count={formatBadgeCount(effectiveSmsMessagesCount)} color={badgeColor}>پیامک‌ها</Badge>,
        children: renderLazyDrawerPane('sms_messages', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden`, () => renderSmsMessagesPanel('desktop')),
      },
      {
        key: 'voip_calls',
        label: <Badge count={formatBadgeCount(effectiveVoipCallsCount)} color={badgeColor}>تماس‌ها</Badge>,
        children: renderLazyDrawerPane('voip_calls', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden`, () => renderVoipCallsPanel('desktop')),
      },
    ]
    : [
      {
        key: 'tasks',
        label: <Badge count={formatBadgeCount(effectiveTasksCount)} color={badgeColor}>فعالیت‌های من</Badge>,
        children: renderLazyDrawerPane('tasks', desktopActiveKey, `${desktopPaneH} flex flex-col overflow-hidden px-3 pb-3`, () => renderTasksPanel('grid')),
      },
      {
        key: 'responsibilities',
        label: <Badge count={formatBadgeCount(effectiveResponsibilitiesCount)} color={badgeColor}>مسئولیت‌های من</Badge>,
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
        tabBarExtraContent={standalone ? {
          left: (
            <Button
              type="text"
              size="small"
              shape="circle"
              title="دریافت پیام‌های جدید"
              aria-label="دریافت پیام‌های جدید"
              icon={<ReloadOutlined spin={refreshing} />}
              onClick={() => void handleManualRefresh()}
              className="ml-1"
            />
          ),
        } : undefined}
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
        label: <Badge count={formatBadgeCount(botMessagesCount)} color={badgeColor}>گروه‌های بات</Badge>,
        children: renderLazyDrawerPane('bot_messages', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden', () => renderBotMessagesPanel('mobile')),
      },
      {
        key: 'bot_direct_messages',
        label: <Badge count={formatBadgeCount(botDirectMessagesCount)} color={badgeColor}>پیام‌های شخصی بات</Badge>,
        children: renderLazyDrawerPane('bot_direct_messages', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden', () => renderBotDirectMessagesPanel('mobile')),
      },
      {
        key: 'sms_messages',
        label: <Badge count={formatBadgeCount(effectiveSmsMessagesCount)} color={badgeColor}>پیامک‌ها</Badge>,
        children: renderLazyDrawerPane('sms_messages', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden', () => renderSmsMessagesPanel('mobile')),
      },
      {
        key: 'voip_calls',
        label: <Badge count={formatBadgeCount(effectiveVoipCallsCount)} color={badgeColor}>تماس‌ها</Badge>,
        children: renderLazyDrawerPane('voip_calls', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden', () => renderVoipCallsPanel('mobile')),
      },
    ]
    : [
      {
        key: 'tasks',
        label: <Badge count={formatBadgeCount(effectiveTasksCount)} color={badgeColor}>فعالیت‌های من</Badge>,
        children: renderLazyDrawerPane('tasks', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden px-2 pb-2', () => renderTasksPanel('grid')),
      },
      {
        key: 'responsibilities',
        label: <Badge count={formatBadgeCount(effectiveResponsibilitiesCount)} color={badgeColor}>مسئولیت‌های من</Badge>,
        children: renderLazyDrawerPane('responsibilities', mobileActiveKey, 'h-full min-h-0 flex flex-col overflow-hidden px-2 pb-2', () => renderResponsibilitiesPanel('grid')),
      },
    ];

  const contentMobileModern = (
    <div className={`h-full min-h-0 flex flex-col ${variant === 'chat' ? 'bg-white dark:bg-[rgb(var(--app-dark-surface-rgb))]' : 'bg-white dark:bg-[rgb(var(--app-dark-surface-rgb))]'}`}>
      <Tabs
        activeKey={mobileActiveKey}
        onChange={(key) => setMobileActiveKey(normalizeTabForVariant(variant, key as DrawerTabKey))}
        className="h-full min-h-0 [&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-nav]:!px-1 [&_.ant-tabs-nav]:!shrink-0 [&_.ant-tabs-nav-wrap]:!overflow-x-auto [&_.ant-tabs-nav-list]:!min-w-max [&_.ant-tabs-tab]:!px-2 [&_.ant-tabs-tab]:!py-2 [&_.ant-tabs-tab]:!text-xs [&_.ant-tabs-content-holder]:h-full [&_.ant-tabs-content-holder]:min-h-0 [&_.ant-tabs-content]:h-full [&_.ant-tabs-content]:min-h-0 [&_.ant-tabs-tabpane]:h-full [&_.ant-tabs-tabpane]:min-h-0"
        tabBarExtraContent={standalone ? {
          left: (
            <Button
              type="text"
              size="small"
              shape="circle"
              title="دریافت پیام‌های جدید"
              aria-label="دریافت پیام‌های جدید"
              icon={<ReloadOutlined spin={refreshing} />}
              onClick={() => void handleManualRefresh()}
              className="ml-1"
            />
          ),
        } : undefined}
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
        {renderTrigger ? <Badge count={formatBadgeCount(totalCount)} size="small" color={badgeColor}>
          <Button
            type="text"
            shape="circle"
            icon={triggerIcon}
            onClick={() => {
              setUiNotificationOverlaySuppressed(true, overlaySource);
              setDrawerContentMounted(true);
              setOpen(true);
              onOpenChange?.(true);
            }}
          />
        </Badge> : null}

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
            counterpartyType={
              selectedBotGroup?.target_type === 'suppliers'
                ? 'supplier'
                : selectedBotGroup?.target_type === 'employees'
                  ? 'employee'
                  : 'customer'
            }
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
      {botIdentityBindModalOpen && botIdentityBindDraft ? (
        <React.Suspense fallback={null}>
          <BotChatIdentityBindModal
            open={botIdentityBindModalOpen}
            loading={botIdentityBindModalLoading}
            saving={botIdentityBindModalSaving}
            channelLabel={BOT_CHANNEL_LABELS_FA[botIdentityBindDraft.channel] || botIdentityBindDraft.channel}
            chatId={botIdentityBindDraft.chatId}
            displayName={botIdentityBindDraft.displayName}
            username={botIdentityBindDraft.username}
            phoneNumber={botIdentityBindDraft.phoneNumber}
            existingBindingLabel={
              isBotTargetModuleId(String(botIdentityBindDraft.existingBinding?.target_module_id || '').trim())
                ? `${String(botIdentityBindDraft.existingBinding?.target_module_id || '').trim() === 'customers' ? 'مشتری' : String(botIdentityBindDraft.existingBinding?.target_module_id || '').trim() === 'suppliers' ? 'تأمین‌کننده' : 'کارمند'} ${String(botIdentityBindDraft.existingBinding?.display_name || '').trim() || ''}`.trim()
                : null
            }
            targetModuleId={botIdentityBindTargetModuleId}
            onChangeTargetModuleId={(value) => {
              setBotIdentityBindTargetModuleId(value);
              setBotIdentityBindTargetRecordId(null);
            }}
            targetRecordId={botIdentityBindTargetRecordId}
            onChangeTargetRecordId={setBotIdentityBindTargetRecordId}
            userOptions={directoryUsers.map((user: any) => ({
              label: String(user?.display_name || user?.id || '-').trim(),
              value: String(user?.id || '').trim(),
            })).filter((item: any) => item.value)}
            roleOptions={directoryRoles.map((role: any) => ({
              label: String(role?.title || role?.id || '-').trim(),
              value: String(role?.id || '').trim(),
            })).filter((item: any) => item.value)}
            allowedUserIds={botIdentityAllowedUserIds}
            onChangeAllowedUserIds={setBotIdentityAllowedUserIds}
            allowedRoleIds={botIdentityAllowedRoleIds}
            onChangeAllowedRoleIds={setBotIdentityAllowedRoleIds}
            aiAutoReplyEnabled={botIdentityAiAutoReplyEnabled}
            onChangeAiAutoReplyEnabled={setBotIdentityAiAutoReplyEnabled}
            aiCounterpartyGuide={botIdentityAiCounterpartyGuide}
            onChangeAiCounterpartyGuide={setBotIdentityAiCounterpartyGuide}
            memberGroups={botIdentityMemberGroups}
            onClose={closeBotIdentityBindModal}
            onSave={() => void saveBotIdentityBinding()}
          />
        </React.Suspense>
      ) : null}
      {phoneIdentityBindModalOpen && phoneIdentityBindDraft ? (
        <React.Suspense fallback={null}>
          <PhoneMatchPickerModal
            open={phoneIdentityBindModalOpen}
            loading={phoneIdentityBindModalLoading}
            saving={phoneIdentityBindModalSaving}
            phone={phoneIdentityBindDraft.phone}
            existingBindingLabel={phoneIdentityBindDraft.existingBindingLabel || null}
            phoneMatchStatus={phoneIdentityBindDraft.phoneMatchStatus || null}
            targetModuleId={phoneIdentityBindTargetModuleId}
            onChangeTargetModuleId={(value) => {
              setPhoneIdentityBindTargetModuleId(value);
              setPhoneIdentityBindTargetRecordId(null);
            }}
            targetRecordId={phoneIdentityBindTargetRecordId}
            onChangeTargetRecordId={setPhoneIdentityBindTargetRecordId}
            targetOptions={phoneIdentityBindOptions}
            searchValue={phoneIdentityBindSearch}
            onChangeSearchValue={setPhoneIdentityBindSearch}
            onClose={closePhoneIdentityBindModal}
            onSave={() => void savePhoneIdentityBinding()}
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
          <AdaptiveIdentityPicker
            mode="multiple"
            scopes={['user', 'role']}
            allowClear
            value={groupMemberDrafts}
            onChange={(values) => setGroupMemberDrafts((Array.isArray(values) ? values : []).map(String))}
            placeholder="انتخاب اعضا و نقش‌ها"
            className="w-full"
            overlayZIndexBase={1400}
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
      {forwardingNote ? (
        <React.Suspense fallback={null}>
          <ForwardMessageModalRuntime
            messageApi={message}
            forwardingNote={forwardingNote}
            forwardTargetUserIds={forwardTargetUserIds}
            forwardMessageText={forwardMessageText}
            forwardSubmitting={forwardSubmitting}
            setForwardingNote={setForwardingNote}
            setForwardTargetUserIds={setForwardTargetUserIds}
            setForwardMessageText={setForwardMessageText}
            setForwardSubmitting={setForwardSubmitting}
            selectedNoteUserId={selectedNoteUserId}
            profileId={profile.id}
            currentAuthorName={directoryUserMap[String(profile.id || '')]?.display_name || null}
            botGroups={botGroups}
            botDirectThreads={botDirectThreads}
            chatGroups={chatGroups}
            chatGroupMap={chatGroupMap}
            availableDirectUsers={availableDirectUsers}
            roleLookup={roleLookup}
            getChatGroupPayload={getChatGroupPayload}
            getBotMessageAttachments={getBotMessageAttachments}
            buildAttachmentNameText={buildAttachmentNameText}
            sendTextToBotGroup={sendTextToBotGroup}
            sendTextToBotDirectThread={sendTextToBotDirectThread}
            refreshSection={refreshSection}
            onForwarded={handleForwarded}
            onOpenReadyTexts={() => openReadyTextsModal('forward')}
          />
        </React.Suspense>
      ) : null}
    </>
  );
};

export default NotificationsPopover;
