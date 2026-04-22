import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { App, Avatar, Badge, Button, Drawer, Empty, Input, List, Modal, Popover, Select, Skeleton, Tabs } from 'antd';
import { BellOutlined, PlusOutlined, UserOutlined, TeamOutlined, EnterOutlined, CloseOutlined, EditOutlined, DeleteOutlined, CheckOutlined, ReloadOutlined, SearchOutlined, LeftOutlined, UpOutlined, DownOutlined, RobotOutlined, MessageOutlined, SnippetsOutlined, EyeOutlined, CopyOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { getResolvedAssigneeId } from '../utils/assigneeValue';
import { fetchAssigneeDirectory } from '../utils/referenceData';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { supportsModuleAssignee } from '../utils/assigneeSupport';
import QrScanPopover from './QrScanPopover';
import { parseNoteContent, serializeNoteContent } from '../utils/noteContent';
import type { NoteAttachment } from '../utils/noteContent';
import { ensureNoteAttachmentShortcuts, uploadNoteAttachments } from '../utils/noteAttachments';
import { normalizeNoteScope } from '../utils/noteScope';
import { FieldType } from '../types';
import { getTaskRelationFieldKey, resolveTaskSourceLink } from '../utils/taskMeta';
import { updateTaskStatusWithAutomation } from '../utils/taskUpdateRuntime';
import TaskSummaryCard from './tasks/TaskSummaryCard';
import SharedNoteCard from './notes/SharedNoteCard';
import SharedNoteComposer from './notes/SharedNoteComposer';
import RenderCardItem from './moduleList/RenderCardItem';
import RelatedRecordPopover from './RelatedRecordPopover';
import ProductionStagesField from './ProductionStagesField';
import { NOTES_UPDATED_EVENT } from '../utils/aiAssistantEvents';
import { getTaskStatusLabel } from '../utils/processTaskStatusOptions';
import { setUiNotificationOverlayItems } from '../utils/uiNotificationOverlayStore';
import { insertNotesWithFallback, sendNoteSmsNotifications } from '../utils/noteDispatch';
import { sendSmsViaGateway } from '../utils/smsGateway';
import { getActiveChannelSettings } from '../utils/channelSettings';
import AssistantPanel from './ai/AssistantPanel';
import { renderRecordTemplate } from '../utils/recordMessaging';
import MessageComposerModal from './MessageComposerModal';
import { openTaskProcessModal } from '../utils/taskProcessModalEvents';
import { getRecordDisplayLabel } from '../utils/recordLabel';
import { buildRecordReferenceKey, fetchRecordReferenceLabels } from '../utils/recordReference';
import { buildRecordTitleSelectColumns, runSelectWithCompatibleColumns } from '../utils/selectCompat';
import { resolveVoipAccessPermissions } from '../utils/permissions';
import AiSparkleIcon from './ai/AiSparkleIcon';
import {
  buildNoteConversations,
  buildSmsThreads,
  buildVoipThreads,
  getSmsThreadKey,
  getVoipThreadKey,
  normalizePhoneThreadValue,
  resolveSmsCounterpartyPhone,
} from '../utils/notificationViewModels';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { shortenAttachmentsForExternalShare } from '../utils/fileShortLinks';
import { escapeRubikaAutoLinkText } from '../utils/rubikaLinkText';

const NOTIFICATIONS_MODAL_Z_INDEX = 15100;

interface NotificationsPopoverProps {
  isMobile: boolean;
  variant?: 'chat' | 'alerts';
  requestedTab?: 'notes' | 'tasks' | 'responsibilities' | 'bot_messages' | 'sms_messages' | 'voip_calls' | 'assistant';
}

type AiSuggestionPopoverActionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  disabled: boolean;
  onSubmit: (instruction: string) => void | Promise<void>;
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

const MAX_ITEMS = 10;
const NOTIFICATIONS_CACHE_TTL_MS = 45_000;
const SEEN_NOTES_STORAGE_KEY = 'notif_seen_notes_v1';
const SEEN_TASKS_STORAGE_KEY = 'notif_seen_tasks_v1';
const SEEN_RESP_STORAGE_KEY = 'notif_seen_responsibilities_v1';
const SEEN_COMPLETED_TASKS_STORAGE_KEY = 'notif_seen_completed_tasks_v1';
const SEEN_BOT_MESSAGES_STORAGE_KEY = 'notif_seen_bot_messages_v1';
const SEEN_SMS_MESSAGES_STORAGE_KEY = 'notif_seen_sms_messages_v1';
const SEEN_VOIP_CALLS_STORAGE_KEY = 'notif_seen_voip_calls_v1';
const DISMISSED_UI_NOTIFICATIONS_STORAGE_KEY = 'notif_dismissed_ui_v1';
type AssigneeQueryMode = 'primary' | 'typed_legacy_role' | 'id_only' | 'owner_only' | 'none';
const ASSIGNEE_QUERY_MODE_CACHE = new Map<string, AssigneeQueryMode>();
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

const BOT_STATUS_LABELS_FA: Record<string, string> = {
  pending_join_link: 'در انتظار ثبت لینک',
  pending_join: 'انتظار برای پیام در گروه',
  active: 'فعال',
  disabled: 'غیرفعال',
  error: 'خطا',
};

const BOT_CHANNEL_LABELS_FA: Record<string, string> = {
  rubika: 'روبیکا',
  telegram: 'تلگرام',
  bale: 'بله',
};

type ConversationListItem = {
  id: string;
  kind: 'system' | 'direct' | 'group';
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

const resolveOptionLabel = (value: any, options?: { label: string; value: any }[]) => {
  if (!options?.length) return null;
  const found = options.find(opt => String(opt.value) === String(value));
  return found?.label || null;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuidValue = (value: unknown) => UUID_REGEX.test(String(value || '').trim());
const formatBadgeCount = (count: number) => (count ? toPersianNumber(count) : 0);
const ENTRY_ANIMATION_WINDOW_MS = 12_000;
const READ_RECEIPTS_KEY = 'read_receipts';
const LIKES_KEY = 'likes';

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
  if (rawValue === 'ambiguous') return 'چند مخاطب احتمالی';
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

const hasReadReceiptForUser = (box: any, userId?: string | null) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return false;
  return Boolean(readReceiptMapFromBox(box)[normalizedUserId]);
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
      'assignee_id',
      'assignee_role_id',
      'assignee_type',
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
  String(note?.source_type || '').trim() === 'system'
  || String(note?.metadata?.source_type || '').trim() === 'system'
  || Boolean(note?.metadata?.workflow_id || note?.metadata?.automation_rule_id || note?.metadata?.process_automation_rule_id);

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

const renderLinkifiedText = (value: string, keyPrefix = 'link') => {
  const source = String(value || '');
  if (!source.trim()) return source;
  const regex = /(https?:\/\/[^\s]+)/gi;
  const matches = Array.from(source.matchAll(regex));
  if (!matches.length) return source;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    const matched = String(match[0] || '');
    const start = typeof match.index === 'number' ? match.index : -1;
    if (!matched || start < 0) return;
    if (start > cursor) nodes.push(source.slice(cursor, start));
    nodes.push(
      <a
        key={`${keyPrefix}-${index}-${start}`}
        href={matched}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-dotted underline-offset-2 text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]"
      >
        {matched}
      </a>
    );
    cursor = start + matched.length;
  });
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes.length ? nodes : source;
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

const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({ isMobile, variant = 'alerts', requestedTab }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const initialTab = normalizeTabForVariant(variant, requestedTab);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteLikeNotifications, setNoteLikeNotifications] = useState<NotificationInboxItemRow[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [responsibilities, setResponsibilities] = useState<any[]>([]);
  const [botGroups, setBotGroups] = useState<CounterpartyBotGroupRow[]>([]);
  const [botMessages, setBotMessages] = useState<CounterpartyBotMessageRow[]>([]);
  const [selectedBotGroupId, setSelectedBotGroupId] = useState<string | null>(null);
  const [botMessageText, setBotMessageText] = useState('');
  const [botSending, setBotSending] = useState(false);
  const [botSuggesting, setBotSuggesting] = useState(false);
  const [botAiPopoverOpen, setBotAiPopoverOpen] = useState(false);
  const [botGroupSearch, setBotGroupSearch] = useState('');
  const [botMessageSearch, setBotMessageSearch] = useState('');
  const [botNotificationMessages, setBotNotificationMessages] = useState<CounterpartyBotMessageRow[]>([]);
  const [smsMessages, setSmsMessages] = useState<any[]>([]);
  const [selectedSmsThreadKey, setSelectedSmsThreadKey] = useState<string | null>(null);
  const [smsRecipient, setSmsRecipient] = useState('');
  const [smsText, setSmsText] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsSuggesting, setSmsSuggesting] = useState(false);
  const [smsAiPopoverOpen, setSmsAiPopoverOpen] = useState(false);
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
  const [profile, setProfile] = useState<{ id: string | null; role_id: string | null; org_id?: string | null; voip_extension?: string | null; can_view_all_calls?: boolean }>({ id: null, role_id: null, org_id: null });
  const [recordTitleMap, setRecordTitleMap] = useState<Record<string, string>>({});
  const [assigneeNameMap, setAssigneeNameMap] = useState<Record<string, string>>({});
  const [roleNameMap, setRoleNameMap] = useState<Record<string, string>>({});
  const [authorNameMap, setAuthorNameMap] = useState<Record<string, string>>({});
  const [createdByNameMap, setCreatedByNameMap] = useState<Record<string, string>>({});
  const [directoryUsers, setDirectoryUsers] = useState<Array<{ id: string; display_name: string; avatar_url?: string | null; role_id?: string | null }>>([]);
  const [directoryRoles, setDirectoryRoles] = useState<Array<{ id: string; title: string }>>([]);
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
  const [responsibilityViewKey, setResponsibilityViewKey] = useState('all');
  const [responsibilitySortDirection, setResponsibilitySortDirection] = useState<CreatedSortDirection>('desc');
  const [previewRecord, setPreviewRecord] = useState<{ moduleId: string; recordId: string; label?: string } | null>(null);
  const [taskProcessModalTask, setTaskProcessModalTask] = useState<any | null>(null);
  const [taskProcessHostKey] = useState(0);
  const [selectedConversationNotes, setSelectedConversationNotes] = useState<any[] | null>(null);
  const [seenNoteIds, setSeenNoteIds] = useState<Set<string>>(() => loadSeenSet(SEEN_NOTES_STORAGE_KEY));
  const [seenTaskIds, setSeenTaskIds] = useState<Set<string>>(() => loadSeenSet(SEEN_TASKS_STORAGE_KEY));
  const [seenResponsibilityIds, setSeenResponsibilityIds] = useState<Set<string>>(() => loadSeenSet(SEEN_RESP_STORAGE_KEY));
  const [seenCompletedTaskIds, setSeenCompletedTaskIds] = useState<Set<string>>(() => loadSeenSet(SEEN_COMPLETED_TASKS_STORAGE_KEY));
  const [seenBotMessageIds, setSeenBotMessageIds] = useState<Set<string>>(() => loadSeenSet(SEEN_BOT_MESSAGES_STORAGE_KEY));
  const [seenSmsMessageIds, setSeenSmsMessageIds] = useState<Set<string>>(() => loadSeenSet(SEEN_SMS_MESSAGES_STORAGE_KEY));
  const [seenVoipCallIds, setSeenVoipCallIds] = useState<Set<string>>(() => loadSeenSet(SEEN_VOIP_CALLS_STORAGE_KEY));
  const [dismissedUiNotificationIds, setDismissedUiNotificationIds] = useState<Set<string>>(() => loadSeenSet(DISMISSED_UI_NOTIFICATIONS_STORAGE_KEY));
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
  const notesScrollContainerRef = useRef<HTMLDivElement | null>(null);
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
  const realtimeDisabledRef = useRef(false);
  const realtimeChannelSubscribedRef = useRef(false);
  const refreshAllRef = useRef<((notify?: boolean, options?: { force?: boolean }) => Promise<void>) | null>(null);
  const refreshSectionRef = useRef<((section: NotificationSectionKey, options?: { force?: boolean }) => Promise<void>) | null>(null);
  const refreshAllInFlightRef = useRef(false);
  const refreshAllPendingRef = useRef<{ notify?: boolean; options?: { force?: boolean } } | null>(null);
  const refreshSectionInFlightRef = useRef<Partial<Record<NotificationSectionKey, boolean>>>({});
  const refreshSectionPendingRef = useRef<Partial<Record<NotificationSectionKey, { force?: boolean }>>>({});
  const notificationSoundWindowRef = useRef<{ startedAt: number; plays: number }>({ startedAt: 0, plays: 0 });
  const botMessagesScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const botShouldStickToBottomRef = useRef(true);
  const botForceScrollToBottomRef = useRef(false);
  const smsMessagesScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const templateRecordCacheRef = useRef<Map<string, Record<string, any> | null>>(new Map());
  const noteConversationKeyRef = useRef<string | null>(null);
  const noteConversationMessageIdsRef = useRef<Set<string>>(new Set());
  const botConversationKeyRef = useRef<string | null>(null);
  const botConversationMessageIdsRef = useRef<Set<string>>(new Set());

  const tasksConfig = MODULES['tasks'];
  const statusOptions = tasksConfig?.fields?.find((f: any) => f.key === 'status')?.options || [];
  const priorityOptions = tasksConfig?.fields?.find((f: any) => f.key === 'priority')?.options || [];
  const toNumber = (value: any) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const shouldAnimateChatEntry = useCallback((createdAt: any) => {
    const time = new Date(createdAt || '').getTime();
    if (!Number.isFinite(time)) return false;
    return Date.now() - time <= ENTRY_ANIMATION_WINDOW_MS;
  }, []);
  const moduleOptions = Object.values(MODULES)
    .filter((mod: any) => mod?.id && (mod?.table || mod?.id))
    .map((mod: any) => ({ label: mod.titles?.fa || mod.id, value: mod.id }));
  const selectedBotGroup = useMemo(
    () => botGroups.find((row) => String(row.id) === String(selectedBotGroupId || '')) || null,
    [botGroups, selectedBotGroupId]
  );
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

  const activeTemplateModuleId = templateComposerContext === 'forward'
    ? (
      String((forwardingNote as any)?.__forward_source_type || 'note').trim() === 'note'
        ? (String(forwardingNote?.module_id || '').trim() || null)
        : selectedBotModuleId
    )
    : (templateComposerContext === 'bot' ? selectedBotModuleId : noteModuleId);
  const activeTemplateRecord = templateComposerContext === 'forward'
    ? null
    : (templateComposerContext === 'bot' ? botTemplateRecord : noteTemplateRecord);
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

  useEffect(() => {
    persistSeenSet(DISMISSED_UI_NOTIFICATIONS_STORAGE_KEY, dismissedUiNotificationIds);
  }, [dismissedUiNotificationIds]);

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

  const dismissNotificationEntries = useCallback((entries: NotificationStateEntryInput[]) => {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const timestamp = new Date().toISOString();
    const normalized = entries
      .map((entry) => ({
        section: entry.section,
        sourceType: String(entry.sourceType || '').trim(),
        sourceId: String(entry.sourceId || '').trim(),
        readAt: entry.readAt ?? timestamp,
        dismissedAt: timestamp,
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
  ): Promise<NotificationInboxItemRow[] | null> => {
    const { data, error } = await supabase
      .from('notification_inbox_items')
      .select('id,source_type,source_id,section,category,title,body,module_id,record_id,payload,last_event_at,created_at')
      .eq('section', section)
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
    const userId = profile.id;
    const roleId = profile.role_id;

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
    return pairs;
  };

  const fetchNotes = async () => {
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

    const assignedPairs = await withTimeout(getAssignedRecordPairs(), [] as { module_id: string; record_id: string }[]);
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
    const authorIds = Array.from(new Set(result.map((n: any) => n.author_id).filter(Boolean)));
    if (authorIds.length) {
      const { userNameMap } = await buildDirectoryMaps();
      const map = authorIds.reduce<Record<string, string>>((acc, authorId) => {
        acc[String(authorId)] = userNameMap[String(authorId)] || String(authorId);
        return acc;
      }, {});
      setAuthorNameMap(map);
    }
    return result;
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
        acc[String(roleLookupId)] = roleTitleMap[String(roleLookupId)] || String(roleLookupId);
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
        acc[String(roleLookupId)] = roleTitleMap[String(roleLookupId)] || String(roleLookupId);
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
      const showSkeleton = notes.length === 0;
      if (showSkeleton) setLoadingNotes(true);
      const notesData = await safeSectionFetch(() => fetchNotes(), 'notes', [] as any[]);
      setNotes(notesData);
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
      const showSkeleton = botGroups.length === 0 && botMessages.length === 0;
      if (showSkeleton) setLoadingBotMessages(true);
      const groups = await safeSectionFetch(() => fetchBotGroups(), 'bot_messages', [] as CounterpartyBotGroupRow[]);
      const resolvedGroupId = String(selectedBotGroupId || groups[0]?.id || '').trim();
      await safeSectionFetch(() => fetchBotNotificationMessages(groups), 'bot_messages', [] as CounterpartyBotMessageRow[]);
      if (resolvedGroupId) {
        await safeSectionFetch(() => fetchBotMessages(resolvedGroupId), 'bot_messages', [] as CounterpartyBotMessageRow[]);
      } else {
        setBotMessages([]);
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
    const showNotesSkeleton = shouldLoadNotes && notes.length === 0;
    const showTasksSkeleton = shouldLoadTasks && tasks.length === 0;
    const showResponsibilitiesSkeleton = shouldLoadResponsibilities && responsibilities.length === 0;
    const showBotSkeleton = shouldLoadBotMessages && botGroups.length === 0 && botMessages.length === 0;
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
      shouldLoadNotes ? safeFetch(() => fetchNotes(), 'notes', [] as any[]) : Promise.resolve(notes),
      shouldLoadTasks ? safeFetch(() => fetchTasks(), 'tasks', [] as any[]) : Promise.resolve(tasks),
      shouldLoadResponsibilities ? safeFetch(() => fetchResponsibilities(), 'responsibilities', [] as any[]) : Promise.resolve(responsibilities),
      shouldLoadBotMessages ? safeFetch(() => fetchBotGroups(), 'bot_messages', [] as CounterpartyBotGroupRow[]) : Promise.resolve(botGroups),
      shouldLoadSmsMessages ? safeFetch(() => fetchSmsMessages(), 'sms_messages', [] as any[]) : Promise.resolve(smsMessages),
      shouldLoadVoipCalls ? safeFetch(() => fetchVoipCalls(), 'voip_calls', [] as any[]) : Promise.resolve(voipCalls),
    ]);
    if (shouldLoadNotes) setNotes(notesData);
    if (shouldLoadNotes) {
      const inboxItems = await safeFetch(() => fetchNotificationInboxSection('notes', 200), 'notes', null as NotificationInboxItemRow[] | null);
      setNoteLikeNotifications((inboxItems || []).filter((item) => String(item?.source_type || '') === 'note_like'));
    }
    if (shouldLoadTasks) setTasks(tasksData);
    if (shouldLoadResponsibilities) setResponsibilities(responsibilitiesData);
    if (shouldLoadSmsMessages) setSmsMessages(smsData);
    if (shouldLoadVoipCalls) setVoipCalls(voipCallsData);
    const loadedAt = Date.now();
    sections.forEach((section) => {
      lastLoadedAtRef.current[section] = loadedAt;
    });
    if (shouldLoadBotMessages) {
      const resolvedGroupId = String(selectedBotGroupId || botGroupsData[0]?.id || '').trim();
      await safeFetch(() => fetchBotNotificationMessages(botGroupsData), 'bot_messages', [] as CounterpartyBotMessageRow[]);
      if (resolvedGroupId) {
        await safeFetch(() => fetchBotMessages(resolvedGroupId), 'bot_messages', [] as CounterpartyBotMessageRow[]);
      } else {
        setBotMessages([]);
      }
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

    const customerIds = Array.from(new Set(rows.map((row) => String(row.customer_id || '').trim()).filter(Boolean)));
    const supplierIds = Array.from(new Set(rows.map((row) => String(row.supplier_id || '').trim()).filter(Boolean)));

    const counterpartyLabelMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id,full_name,business_name,legal_name,system_code')
        .in('id', customerIds);
      (customers || []).forEach((item: any) => {
        const id = String(item?.id || '').trim();
        if (!id) return;
        counterpartyLabelMap[`customers:${id}`] = String(
          item?.full_name || item?.business_name || item?.legal_name || item?.system_code || id
        ).trim();
      });
    }
    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id,business_name,full_name,system_code')
        .in('id', supplierIds);
      (suppliers || []).forEach((item: any) => {
        const id = String(item?.id || '').trim();
        if (!id) return;
        counterpartyLabelMap[`suppliers:${id}`] = String(
          item?.business_name || item?.full_name || item?.system_code || id
        ).trim();
      });
    }

    const enrichedRows = rows.map((row) => {
      const customerId = String(row.customer_id || '').trim();
      const supplierId = String(row.supplier_id || '').trim();
      const key = customerId ? `customers:${customerId}` : supplierId ? `suppliers:${supplierId}` : '';
      return {
        ...row,
        counterparty_label: key ? (counterpartyLabelMap[key] || null) : null,
      };
    }).sort((a, b) => {
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
    setBotGroups(enrichedRows);
    setSelectedBotGroupId((prev) => {
      if (prev && enrichedRows.some((row) => String(row.id) === String(prev))) return prev;
      const withChat = enrichedRows.find((row) => String(row.bot_chat_id || '').trim());
      return withChat ? String(withChat.id) : (enrichedRows[0]?.id ? String(enrichedRows[0].id) : null);
    });
    return enrichedRows;
  };

  const fetchBotMessages = async (groupId?: string | null) => {
    const targetGroupId = String(groupId || selectedBotGroupId || '').trim();
    if (!targetGroupId) {
      setBotMessages([]);
      return [] as CounterpartyBotMessageRow[];
    }
    const { data, error } = await supabase
      .from('counterparty_bot_messages')
      .select('id,bot_group_id,direction,message_type,chat_id,provider_message_id,content_text,file_url,file_name,mime_type,payload,created_by,created_at')
      .eq('bot_group_id', targetGroupId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = ((data || []) as CounterpartyBotMessageRow[]).reverse();
    setBotMessages(rows);
    return rows;
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

  const buildCurrentBotSenderPayload = useCallback(() => {
    const userId = String(profile.id || '').trim();
    const currentUser = directoryUsers.find((user) => String(user?.id || '') === userId) || null;
    const displayName = String(currentUser?.display_name || '').trim();
    const avatarUrl = String(currentUser?.avatar_url || '').trim();
    return {
      sender_user_id: userId || null,
      sender_profile_id: userId || null,
      sender_display_name: displayName || null,
      sender_avatar_url: avatarUrl || null,
    };
  }, [directoryUsers, profile.id]);

  const sendTextToBotGroup = useCallback(async (
    group: CounterpartyBotGroupRow,
    text: string,
    options?: { payload?: Record<string, any>; messageType?: string; extraPayload?: Record<string, any>; fallbackText?: string }
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
      },
    });
    if (proxyError) throw proxyError;
    if (!proxyData?.success) {
      throw new Error(String(proxyData?.message || 'ارسال پیام بات ناموفق بود.'));
    }
    const providerResponse = proxyData?.provider_result || {};
    const messageType = String(options?.messageType || 'text').trim() || 'text';
    const senderPayload = buildCurrentBotSenderPayload();
    const currentUserId = String(senderPayload.sender_user_id || '').trim() || null;

    const { error: insertError } = await supabase
      .from('counterparty_bot_messages')
      .insert([{
        bot_group_id: group.id,
        customer_id: group.customer_id,
        supplier_id: group.supplier_id,
        channel_type: group.channel_type,
        direction: 'outbound',
        message_type: messageType,
        chat_id: chatId,
        provider_message_id: String(providerResponse?.result?.message_id || providerResponse?.message_id || providerResponse?.data?.message_id || '') || null,
        content_text: text,
        created_by: currentUserId,
        payload: {
          ...(options?.payload || {}),
          ...senderPayload,
          provider_response: providerResponse || {},
        },
      }]);
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

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      notesPollingPausedRef.current = false;
      notesPollingPauseLoggedRef.current = false;
      const currentTab = isMobile ? mobileActiveKey : desktopActiveKey;
      const activeSection = isSectionTabKey(currentTab) ? currentTab : null;
      if (activeSection) {
        await refreshSection(activeSection, { force: true });
        void refreshAll(false, { force: true });
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
    if (!profile.id) return;
    notificationsReadyRef.current = false;
    void refreshAllRef.current?.(false, { force: true });
  }, [profile.id, profile.role_id, variant]);

  const activeDrawerTab = isMobile ? mobileActiveKey : desktopActiveKey;
  const activeDrawerSection = isSectionTabKey(activeDrawerTab) ? activeDrawerTab : null;

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
    if (open && activeDrawerSection) {
      void refreshSection(activeDrawerSection);
    }
  }, [activeDrawerSection, open, profile.id]);

  useEffect(() => {
    if (!open) return;
    if (activeDrawerSection !== 'bot_messages') return;
    if (!selectedBotGroupId) {
      setBotMessages([]);
      return;
    }
    botShouldStickToBottomRef.current = true;
    botForceScrollToBottomRef.current = true;
    void fetchBotMessages(selectedBotGroupId);
  }, [activeDrawerSection, open, selectedBotGroupId]);

  useEffect(() => {
    if (!open) return;
    if (activeDrawerSection !== 'bot_messages') return;
    botShouldStickToBottomRef.current = true;
    botForceScrollToBottomRef.current = true;
    const refreshBotFallback = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void fetchBotGroups()
        .then((groups) => fetchBotNotificationMessages(groups))
        .catch((error) => console.warn('Could not refresh bot notification messages', error));
      if (selectedBotGroupId) {
        void fetchBotMessages(selectedBotGroupId);
      }
    };
    const timer = window.setInterval(() => {
      refreshBotFallback();
    }, realtimeDisabledRef.current ? 6000 : 15000);
    return () => window.clearInterval(timer);
  }, [activeDrawerSection, open, selectedBotGroupId]);

  useEffect(() => {
    if (!profile.id) return;
    const interval = setInterval(() => {
      if (open) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshAll(true, { force: true });
    }, 20000);
    return () => clearInterval(interval);
  }, [open, profile.id, profile.role_id, variant]);

  useEffect(() => {
    if (!profile.id) return;
    if (realtimeDisabledRef.current) return;
    realtimeChannelSubscribedRef.current = false;
    const currentUserId = String(profile.id || '').trim();
    const currentRoleId = String(profile.role_id || '').trim();
    if (!currentUserId) return;

    const hasAssigneeMatch = (row: any) => {
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
    };

    const normalizeIdArray = (value: any): string[] => {
      if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
      if (typeof value === 'string' && value.trim().startsWith('{') && value.trim().endsWith('}')) {
        return value
          .replace(/^\{|\}$/g, '')
          .split(',')
          .map((item) => String(item || '').replace(/"/g, '').trim())
          .filter(Boolean);
      }
      return [];
    };

    const hasNoteMatch = (row: any) => {
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
    };

    const hasVoipCallMatch = (row: any) => {
      if (!row || typeof row !== 'object') return false;
      if (String(row.direction || '').trim() && String(row.direction || '').trim() !== 'incoming') return false;
      if (profile.can_view_all_calls) return true;
      const extension = String(profile.voip_extension || '').trim();
      if (!extension) return false;
      return String(row.extension || '').trim() === extension;
    };

    const scheduleLiveRefresh = (section?: NotificationSectionKey) => {
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
        liveSectionRefreshTimersRef.current[section] = window.setTimeout(() => {
          delete liveSectionRefreshTimersRef.current[section];
          void refreshSectionRef.current?.(section, { force: true });
        }, 250);
        return;
      }
      liveRefreshTimerRef.current = window.setTimeout(() => {
        liveRefreshTimerRef.current = null;
        void refreshAllRef.current?.(true, { force: true });
      }, 400);
    };

    const mapBroadcastSection = (section: any): NotificationSectionKey | null => {
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
    };

    const channel = supabase.channel(`notifications-live-${variant}-${currentUserId}-${currentRoleId || 'none'}`);
    const broadcastChannels: any[] = [];
    const currentOrgId = String(profile.org_id || '').trim();
    if (currentOrgId) {
      const broadcastTopics = [
        `org:${currentOrgId}:notifications`,
        `org:${currentOrgId}:user:${currentUserId}:notifications`,
        currentRoleId ? `org:${currentOrgId}:role:${currentRoleId}:notifications` : null,
      ].filter(Boolean) as string[];

      broadcastTopics.forEach((topic) => {
        const broadcastChannel = supabase.channel(topic, { config: { private: true } } as any)
          .on('broadcast', { event: 'notification' }, (message: any) => {
            const section = mapBroadcastSection(message?.payload?.section);
            if (section) scheduleLiveRefresh(section);
          });
        broadcastChannel.subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void supabase.removeChannel(broadcastChannel);
          }
        });
        broadcastChannels.push(broadcastChannel);
      });
    }

    if (variant === 'chat') {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes' }, (payload: any) => {
          if (hasNoteMatch(payload?.new)) scheduleLiveRefresh('notes');
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notes' }, (payload: any) => {
          if (hasNoteMatch(payload?.new) || hasNoteMatch(payload?.old)) scheduleLiveRefresh('notes');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'counterparty_bot_groups' }, () => {
          scheduleLiveRefresh('bot_messages');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'counterparty_bot_messages' }, () => {
          scheduleLiveRefresh('bot_messages');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'outbound_messages' }, (payload: any) => {
          const row = payload?.new || payload?.old || {};
          if (String(row?.channel_type || '').trim() === 'sms') scheduleLiveRefresh('sms_messages');
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voip_call_logs' }, (payload: any) => {
          if (hasVoipCallMatch(payload?.new)) {
            setVoipCalls((prev) => [payload.new, ...prev.filter((row) => String(row?.id || '') !== String(payload?.new?.id || ''))].slice(0, 20));
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'voip_call_logs' }, (payload: any) => {
          if (hasVoipCallMatch(payload?.new)) {
            setVoipCalls((prev) => [payload.new, ...prev.filter((row) => String(row?.id || '') !== String(payload?.new?.id || ''))].slice(0, 20));
          }
        });
    } else {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (payload: any) => {
          if (hasAssigneeMatch(payload?.new)) scheduleLiveRefresh('tasks');
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (payload: any) => {
          if (hasAssigneeMatch(payload?.new) || hasAssigneeMatch(payload?.old)) scheduleLiveRefresh('tasks');
        });

      RESPONSIBILITY_REALTIME_TABLES.forEach((table) => {
        channel
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (payload: any) => {
            if (hasAssigneeMatch(payload?.new)) scheduleLiveRefresh('responsibilities');
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (payload: any) => {
            if (hasAssigneeMatch(payload?.new) || hasAssigneeMatch(payload?.old)) scheduleLiveRefresh('responsibilities');
          });
      });
    }

    channel.subscribe((status) => {
      realtimeChannelSubscribedRef.current = status === 'SUBSCRIBED';
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        realtimeDisabledRef.current = true;
        realtimeChannelSubscribedRef.current = false;
        void supabase.removeChannel(channel);
      }
    });

    return () => {
      if (liveRefreshTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
      if (typeof window !== 'undefined') {
        Object.values(liveSectionRefreshTimersRef.current).forEach((timerId) => {
          if (typeof timerId === 'number') window.clearTimeout(timerId);
        });
      }
      liveSectionRefreshTimersRef.current = {};
      if (realtimeChannelSubscribedRef.current) {
        void supabase.removeChannel(channel);
      }
      broadcastChannels.forEach((broadcastChannel) => {
        void supabase.removeChannel(broadcastChannel);
      });
    };
  }, [profile.can_view_all_calls, profile.id, profile.org_id, profile.role_id, profile.voip_extension, variant]);

  const notesCount = notes.filter((n: any) => {
    const authorId = String(n?.author_id || '').trim();
    return (
      (!authorId || authorId !== String(profile.id || ''))
      && !isNotificationRead('notes', 'note', String(n?.id || ''), seenNoteIds.has(String(n?.id || '')))
    );
  }).length + noteLikeNotifications.filter((item) => (
    !isNotificationRead('notes', 'note_like', String(item?.source_id || ''), false)
  )).length;
  const tasksCount = tasks.filter((t: any) => (
    !isNotificationRead('tasks', 'task', String(t?.id || ''), seenTaskIds.has(String(t?.id || '')))
  )).length;
  const responsibilitiesCount = responsibilities.filter((r: any) => (
    !isNotificationRead('responsibilities', getResponsibilitySourceType(r), String(r?.id || ''), seenResponsibilityIds.has(String(r?.id || '')))
  )).length;
  const botMessagesCount = botNotificationMessages.filter((row) => (
    String(row?.direction || '').trim() === 'inbound'
    && !isNotificationRead('bot_messages', 'counterparty_bot_message', String(row?.id || '').trim(), seenBotMessageIds.has(String(row?.id || '').trim()))
  )).length;
  const smsMessagesCount = smsMessages.filter((row: any) => (
    String(row?.direction || '').trim() === 'inbound'
    && !isNotificationRead('sms_messages', 'inbound_sms', String(row?.id || '').trim(), seenSmsMessageIds.has(String(row?.id || '').trim()))
  )).length;
  const voipCallsCount = voipCalls.filter((row: any) => (
    String(row?.direction || '').trim() === 'incoming'
    && !isNotificationRead('voip_calls', 'voip_call', String(row?.id || '').trim(), seenVoipCallIds.has(String(row?.id || '').trim()))
  )).length;
  const chatTotalCount = notesCount + botMessagesCount + smsMessagesCount + voipCallsCount;
  const alertsTotalCount = tasksCount + responsibilitiesCount;
  const totalCount = variant === 'chat' ? chatTotalCount : alertsTotalCount;
  const smsThreads = useMemo<SmsThreadItem[]>(
    () => buildSmsThreads({
      messages: smsMessages,
      recordTitleMap,
      seenSmsMessageIds,
      isNotificationRead,
    }),
    [isNotificationRead, recordTitleMap, seenSmsMessageIds, smsMessages]
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
  const filteredNotes = useMemo(() => {
    const sourceNotes = selectedNoteUserId && selectedConversationNotes !== null
      ? selectedConversationNotes
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
  }, [noteLookup, notes, profile.id, selectedChatGroupId, selectedConversationNotes, selectedNoteUserId]);
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
      seenNoteIds,
      isNotificationRead,
    }),
    [availableDirectUsers, chatGroups, isNotificationRead, noteLookup, notes, profile.id, roleLookup, seenNoteIds]
  );
  const visibleNoteConversations = useMemo(() => {
    const search = String(noteUserSearch || '').trim().toLowerCase();
    if (!search) return noteConversations;
    return noteConversations.filter((item) =>
      String(item.displayName || '').toLowerCase().includes(search)
    );
  }, [noteConversations, noteUserSearch]);
  const selectedNoteUser = useMemo(() => {
    if (!selectedNoteUserId) return null;
    if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) {
      return {
        id: SYSTEM_MESSAGES_USER_ID,
        display_name: 'پیام‌های سیستم',
        avatar_url: null,
        role_id: null,
      };
    }
    if (selectedChatGroupId) {
      return null;
    }
    return directoryUserMap[String(selectedNoteUserId)] || inferredDirectUsers.find((user) => String(user.id) === String(selectedNoteUserId)) || null;
  }, [directoryUserMap, inferredDirectUsers, selectedChatGroupId, selectedNoteUserId]);
  const orderedFilteredNotes = useMemo(
    () => [...filteredNotes].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [filteredNotes]
  );
  const normalizedNoteMessageSearch = useMemo(
    () => String(noteMessageSearch || '').trim().toLowerCase(),
    [noteMessageSearch]
  );
  const displayedChatNotes = useMemo(() => {
    if (!normalizedNoteMessageSearch) return orderedFilteredNotes;
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
  }, [authorNameMap, directoryUserMap, normalizedNoteMessageSearch, orderedFilteredNotes]);
  const activeConversationRoleLabel = useMemo(() => {
    if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) return 'اعلان‌های گردش کارها و اتوماسیون‌ها';
    if (selectedChatGroup) {
      const memberCount = resolveGroupMemberUserIds(selectedChatGroup).length;
      return `${toPersianNumber(String(memberCount))} عضو`;
    }
    if (!selectedNoteUser?.role_id) return 'بدون نقش';
    return roleLookup[String(selectedNoteUser.role_id)] || 'بدون نقش';
  }, [resolveGroupMemberUserIds, roleLookup, selectedChatGroup, selectedNoteUser, selectedNoteUserId]);
  const currentUserDisplayName = useMemo(() => (
    directoryUserMap[String(profile.id || '')]?.display_name
    || 'شما'
  ), [directoryUserMap, profile.id]);

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

  const buildReadReceiptBox = useCallback((box: any, readAt: string) => {
    const currentUserId = String(profile.id || '').trim();
    const base = isPlainRecord(box) ? { ...box } : {};
    if (!currentUserId) return base;
    const receiptMap = readReceiptMapFromBox(base);
    receiptMap[currentUserId] = {
      user_id: currentUserId,
      user_name: currentUserDisplayName,
      read_at: readAt,
    };
    base[READ_RECEIPTS_KEY] = receiptMap;
    return base;
  }, [currentUserDisplayName, profile.id]);

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

  const getBotMessageAttachments = useCallback((row: CounterpartyBotMessageRow): Array<{ name: string; url: string; mimeType?: string | null }> => {
    const list: Array<{ name: string; url: string; mimeType?: string | null }> = [];
    const fileUrl = String(row?.file_url || '').trim();
    const fileName = String(row?.file_name || '').trim();
    const mimeType = String(row?.mime_type || '').trim() || null;
    if (fileUrl) {
      list.push({
        name: fileName || 'فایل',
        url: fileUrl,
        mimeType,
      });
    }
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const payloadMediaUrl = String((payload as any)?.media_url || (payload as any)?.file_url || '').trim();
    if (payloadMediaUrl && !list.some((entry) => entry.url === payloadMediaUrl)) {
      list.push({
        name: String((payload as any)?.file_name || row?.file_name || 'فایل').trim(),
        url: payloadMediaUrl,
        mimeType: String((payload as any)?.mime_type || row?.mime_type || '').trim() || null,
      });
    }
    const payloadAttachments = Array.isArray((payload as any)?.attachments) ? (payload as any).attachments : [];
    payloadAttachments.forEach((item: any) => {
      const url = String(item?.url || '').trim();
      if (!url) return;
      const name = String(item?.name || item?.file_name || 'فایل').trim();
      if (!list.some((entry) => entry.url === url)) {
        list.push({ name, url, mimeType: String(item?.mimeType || item?.mime_type || '').trim() || null });
      }
    });
    return list;
  }, []);

  const buildForwardBodyText = useCallback((text: string, attachments: Array<{ name: string; url: string }>) => {
    const baseText = String(text || '').trim();
    if (!attachments.length) return baseText;
    const attachmentLines = attachments.map((item) => `${item.name}: ${item.url}`);
    return [baseText, ...attachmentLines].filter(Boolean).join('\n');
  }, []);

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

  const buildRubikaLinkedAttachmentMessage = useCallback((
    baseText: string,
    attachments: Array<{ name?: string; url?: string }>
  ) => {
    const normalizedBaseText = String(baseText || '').trim();
    const lines: Array<{ text: string; linkUrl?: string }> = [];
    if (normalizedBaseText) {
      lines.push({ text: normalizedBaseText });
    }
    (attachments || []).forEach((item, index) => {
      const name = String(item?.name || `فایل ${index + 1}`).trim() || `فایل ${index + 1}`;
      const url = String(item?.url || '').trim();
      lines.push({ text: `پیوست: ${escapeRubikaAutoLinkText(name)}`, linkUrl: url || undefined });
    });

    if (lines.length === 0) {
      return { text: '', metadata: undefined as Record<string, any> | undefined };
    }

    let text = '';
    let cursor = 0;
    const metaDataParts: Array<Record<string, any>> = [];
    lines.forEach((line, index) => {
      if (index > 0) {
        text += '\n';
        cursor += 1;
      }
      const segment = String(line.text || '');
      const startIndex = cursor;
      text += segment;
      cursor += segment.length;
      if (line.linkUrl) {
        metaDataParts.push({
          type: 'Link',
          from_index: startIndex,
          length: segment.length,
          link_url: line.linkUrl,
        });
      }
    });

    return {
      text,
      metadata: metaDataParts.length > 0
        ? { meta_data_parts: metaDataParts }
        : undefined,
    };
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
  const getModuleCardFields = (moduleConfig: any) => {
    const fields = moduleConfig?.fields || [];
    return {
      imageField: fields.find((field: any) => field?.type === FieldType.IMAGE)?.key,
      tagsField: fields.find((field: any) => field?.type === FieldType.TAGS || field?.key === 'tags')?.key,
      statusField: fields.find((field: any) => field?.type === FieldType.STATUS || field?.key === 'status')?.key,
      categoryField: fields.find((field: any) => ['category', 'task_type'].includes(String(field?.key || '')))?.key,
    };
  };
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
  const drawerHeaderStyle: React.CSSProperties = {
    background: 'rgb(var(--app-dark-surface-rgb))',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#fff',
  };
  const desktopDrawerBodyStyle: React.CSSProperties = {
    padding: 0,
  };
  const mobileDrawerBodyStyle: React.CSSProperties = {
    padding: 0,
    overflow: 'hidden',
    background: 'transparent',
  };
  const drawerContentStyle: React.CSSProperties = {
    overflow: 'hidden',
  };
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
  const persistNoteReadReceipts = useCallback(async (rows: any[], readAt: string) => {
    const currentUserId = String(profile.id || '').trim();
    if (!currentUserId) return;
    const targets = rows
      .filter((note: any) => {
        const id = String(note?.id || '').trim();
        const authorId = String(note?.author_id || '').trim();
        return id && authorId !== currentUserId && !hasReadReceiptForUser(note?.metadata, currentUserId);
      })
      .slice(0, 30);
    if (targets.length === 0) return;

    await Promise.all(targets.map(async (note: any) => {
      const noteId = String(note?.id || '').trim();
      try {
        const { data, error: selectError } = await supabase
          .from('notes')
          .select('metadata')
          .eq('id', noteId)
          .maybeSingle();
        if (selectError) throw selectError;
        const metadata = buildReadReceiptBox((data as any)?.metadata || note?.metadata || {}, readAt);
        const { error: updateError } = await supabase
          .from('notes')
          .update({ metadata })
          .eq('id', noteId);
        if (updateError) throw updateError;
      } catch (error) {
        console.warn('Could not persist note read receipt', error);
      }
    }));
  }, [buildReadReceiptBox, profile.id]);

  const markNotesAsSeen = useCallback((rows: any[]) => {
    const currentUserId = String(profile.id || '').trim();
    if (!currentUserId || !Array.isArray(rows) || rows.length === 0) return;
    const readAt = new Date().toISOString();
    const readableRows = rows.filter((note: any) => {
      const id = String(note?.id || '').trim();
      const authorId = String(note?.author_id || '').trim();
      return (
        id
        && authorId !== currentUserId
        && (!seenNoteIds.has(id) || !hasReadReceiptForUser(note?.metadata, currentUserId))
      );
    });
    if (readableRows.length === 0) return;

    const readableIds = new Set(readableRows.map((note: any) => String(note.id)));
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

    const applyReceipt = (note: any) => (
      readableIds.has(String(note?.id || ''))
        ? { ...note, metadata: buildReadReceiptBox(note?.metadata || {}, readAt) }
        : note
    );
    setNotes((prev) => prev.map(applyReceipt));
    setSelectedConversationNotes((prev) => (prev ? prev.map(applyReceipt) : prev));

    markNotificationEntriesRead(
      Array.from(readableIds).map((sourceId) => ({ section: 'notes' as const, sourceType: 'note', sourceId }))
    );
    void persistNoteReadReceipts(readableRows, readAt);
  }, [buildReadReceiptBox, markNotificationEntriesRead, persistNoteReadReceipts, profile.id, seenNoteIds]);

  const persistBotReadReceipts = useCallback(async (rows: CounterpartyBotMessageRow[], readAt: string) => {
    const currentUserId = String(profile.id || '').trim();
    if (!currentUserId) return;
    const targets = rows
      .filter((row) => {
        const id = String(row?.id || '').trim();
        return isUuidValue(id) && !hasReadReceiptForUser(row?.payload, currentUserId);
      })
      .slice(0, 30);
    if (targets.length === 0) return;

    await Promise.all(targets.map(async (row) => {
      const rowId = String(row?.id || '').trim();
      try {
        const { data, error: selectError } = await supabase
          .from('counterparty_bot_messages')
          .select('payload')
          .eq('id', rowId)
          .maybeSingle();
        if (selectError) throw selectError;
        const payload = buildReadReceiptBox((data as any)?.payload || row?.payload || {}, readAt);
        const { error: updateError } = await supabase
          .from('counterparty_bot_messages')
          .update({ payload })
          .eq('id', rowId);
        if (updateError) throw updateError;
      } catch (error) {
        console.warn('Could not persist bot read receipt', error);
      }
    }));
  }, [buildReadReceiptBox, profile.id]);

  const markBotMessagesAsSeen = useCallback((rows: CounterpartyBotMessageRow[]) => {
    const readAt = new Date().toISOString();
    const unreadInboundIds = rows
      .filter((row) => String(row?.direction || '').trim() === 'inbound')
      .map((row) => String(row?.id || '').trim())
      .filter((id) => isUuidValue(id) && !seenBotMessageIds.has(id));
    const receiptRows = rows.filter((row) => {
      const id = String(row?.id || '').trim();
      return isUuidValue(id) && !hasReadReceiptForUser(row?.payload, String(profile.id || '').trim());
    });
    const messageIds = new Set(
      receiptRows
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean)
    );
    if (unreadInboundIds.length > 0) {
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
    }
    if (messageIds.size === 0) return;

    const applyReceipt = (row: CounterpartyBotMessageRow) => (
      messageIds.has(String(row?.id || '').trim())
        ? { ...row, payload: buildReadReceiptBox(row?.payload || {}, readAt) }
        : row
    );
    setBotMessages((prev) => prev.map(applyReceipt));
    setBotNotificationMessages((prev) => prev.map(applyReceipt));
    markNotificationEntriesRead(
      unreadInboundIds.map((sourceId) => ({ section: 'bot_messages' as const, sourceType: 'counterparty_bot_message', sourceId }))
    );
    void persistBotReadReceipts(receiptRows, readAt);
  }, [buildReadReceiptBox, markNotificationEntriesRead, persistBotReadReceipts, profile.id, seenBotMessageIds]);

  const markTasksAsSeen = useCallback((rows: any[]) => {
    const taskIds = (rows || [])
      .map((row) => String(row?.id || '').trim())
      .filter((id) => id && !isNotificationRead('tasks', 'task', id, seenTaskIds.has(id)));
    if (taskIds.length === 0) return;
    setSeenTaskIds((prev) => new Set([...prev, ...taskIds]));
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
    setSeenResponsibilityIds((prev) => new Set([...prev, ...entries.map((entry) => entry.sourceId)]));
    markNotificationEntriesRead(entries);
  }, [isNotificationRead, markNotificationEntriesRead, seenResponsibilityIds]);

  const markSmsMessagesAsSeen = useCallback((rows: any[]) => {
    const messageIds = (rows || [])
      .filter((row) => String(row?.direction || '').trim() === 'inbound')
      .map((row) => String(row?.id || '').trim())
      .filter((id) => id && !isNotificationRead('sms_messages', 'inbound_sms', id, seenSmsMessageIds.has(id)));
    if (messageIds.length === 0) return;
    setSeenSmsMessageIds((prev) => new Set([...prev, ...messageIds]));
    markNotificationEntriesRead(messageIds.map((sourceId) => ({ section: 'sms_messages' as const, sourceType: 'inbound_sms', sourceId })));
  }, [isNotificationRead, markNotificationEntriesRead, seenSmsMessageIds]);

  const markVoipCallsAsSeen = useCallback((rows: any[]) => {
    const callIds = (rows || [])
      .filter((row) => String(row?.direction || '').trim() === 'incoming')
      .map((row) => String(row?.id || '').trim())
      .filter((id) => id && !isNotificationRead('voip_calls', 'voip_call', id, seenVoipCallIds.has(id)));
    if (callIds.length === 0) return;
    setSeenVoipCallIds((prev) => new Set([...prev, ...callIds]));
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

  const handleClose = useCallback(() => {
    mobileDrawerHistoryActiveRef.current = false;
    setMobileNoteSearchOpen(false);
    setMobileBotSearchOpen(false);
    setNoteMessageSearch('');
    setNoteMessageSearchOpen(false);
    setForwardingNote(null);
    setForwardTargetUserIds([]);
    setNoteNewIncomingCount(0);
    setBotNewIncomingCount(0);
    if (variant === 'chat') {
      if (activeDrawerSection === 'notes' && selectedNoteUserId) {
        markNotesAsSeen(displayedChatNotes);
      }
      if (activeDrawerSection === 'bot_messages' && selectedBotGroupId) {
        markBotMessagesAsSeen(botMessages);
      }
      if (activeDrawerSection === 'sms_messages') {
        markSmsMessagesAsSeen(displayedSmsMessages);
      }
    } else {
      if (activeDrawerSection === 'tasks') {
        markTasksAsSeen(tasks);
      }
      if (activeDrawerSection === 'responsibilities') {
        markResponsibilitiesAsSeen(responsibilities);
      }
      if (activeDrawerSection === 'voip_calls') {
        markVoipCallsAsSeen(displayedVoipCalls);
      }
    }
    setPreviewRecord(null);
    setTaskProcessModalTask(null);
    setOpen(false);
  }, [activeDrawerSection, botMessages, displayedChatNotes, displayedSmsMessages, displayedVoipCalls, markBotMessagesAsSeen, markNotesAsSeen, markResponsibilitiesAsSeen, markSmsMessagesAsSeen, markTasksAsSeen, markVoipCallsAsSeen, responsibilities, selectedBotGroupId, selectedNoteUserId, tasks, variant]);

  useEffect(() => {
    setSelectedConversationNotes(null);
    setNoteMessageSearch('');
    setNoteMessageSearchOpen(false);
    noteShouldStickToBottomRef.current = true;
    noteForceScrollToBottomRef.current = true;
    setNoteNewIncomingCount(0);
    noteConversationKeyRef.current = null;
    noteConversationMessageIdsRef.current = new Set();
  }, [selectedNoteUserId]);

  useEffect(() => {
    botShouldStickToBottomRef.current = true;
    botForceScrollToBottomRef.current = true;
    setBotNewIncomingCount(0);
    botConversationKeyRef.current = null;
    botConversationMessageIdsRef.current = new Set();
  }, [selectedBotGroupId]);

  useEffect(() => {
    if (!open || !profile.id || !selectedNoteUserId) {
      setSelectedConversationNotes(null);
      return;
    }

    let cancelled = false;

    const fetchSelectedConversationNotes = async () => {
      try {
        let nextNotes: any[] = [];

        if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) {
          const { data, error } = await supabase
            .from('notes')
            .select(NOTE_SELECT_FIELDS)
            .or('source_type.eq.system,metadata->>source_type.eq.system')
            .order('created_at', { ascending: false })
            .limit(120);
          if (error) throw error;
          nextNotes = (data || []).filter((note: any) => isSystemNote(note));
        } else if (selectedChatGroupId) {
          const { data, error } = await supabase
            .from('notes')
            .select(NOTE_SELECT_FIELDS)
            .contains('metadata', { chat_group_id: selectedChatGroupId })
            .order('created_at', { ascending: false })
            .limit(120);
          if (error) throw error;
          nextNotes = data || [];
        } else {
          const currentUserId = String(profile.id || '');
          const targetUserId = String(selectedNoteUserId || '');
          const [sentResult, receivedResult] = await Promise.all([
            supabase
              .from('notes')
              .select(NOTE_SELECT_FIELDS)
              .eq('author_id', currentUserId)
              .contains('mention_user_ids', [targetUserId])
              .order('created_at', { ascending: false })
              .limit(80),
            supabase
              .from('notes')
              .select(NOTE_SELECT_FIELDS)
              .eq('author_id', targetUserId)
              .contains('mention_user_ids', [currentUserId])
              .order('created_at', { ascending: false })
              .limit(80),
          ]);
          if (sentResult.error) throw sentResult.error;
          if (receivedResult.error) throw receivedResult.error;
          const unique = new Map<string, any>();
          [...(sentResult.data || []), ...(receivedResult.data || [])].forEach((note: any) => {
            unique.set(String(note.id), note);
          });
          nextNotes = Array.from(unique.values());
        }

        if (cancelled) return;
        setSelectedConversationNotes(
          nextNotes.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        );
        noteShouldStickToBottomRef.current = true;
        noteForceScrollToBottomRef.current = true;
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to fetch selected conversation history.', error);
          setSelectedConversationNotes(null);
        }
      }
    };

    void fetchSelectedConversationNotes();

    return () => {
      cancelled = true;
    };
  }, [open, profile.id, selectedChatGroupId, selectedNoteUserId]);

  useEffect(() => {
    if (!open || activeDrawerSection !== 'notes') return;
    noteShouldStickToBottomRef.current = true;
    noteForceScrollToBottomRef.current = true;
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => scrollNotesToBottom('auto'));
    } else {
      scrollNotesToBottom('auto');
    }
  }, [activeDrawerSection, open]);

  useEffect(() => {
    if (!open || activeDrawerSection !== 'bot_messages') return;
    botShouldStickToBottomRef.current = true;
    botForceScrollToBottomRef.current = true;
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => scrollBotMessagesToBottom('auto'));
    } else {
      scrollBotMessagesToBottom('auto');
    }
  }, [activeDrawerSection, open, selectedBotGroupId]);

  useLayoutEffect(() => {
    if (!open || activeDrawerSection !== 'notes') return;
    const shouldForceScroll = noteForceScrollToBottomRef.current;
    if (!shouldForceScroll && !noteShouldStickToBottomRef.current) return;
    scrollNotesToBottom(shouldForceScroll ? 'auto' : 'smooth');
    noteForceScrollToBottomRef.current = false;
  }, [activeDrawerSection, displayedChatNotes, open]);

  useEffect(() => {
    if (!open || activeDrawerSection !== 'notes') return;
    const unreadLikeEntries = noteLikeNotifications
      .filter((item) => !isNotificationRead('notes', 'note_like', String(item?.source_id || ''), false))
      .map((item) => ({ section: 'notes' as const, sourceType: 'note_like', sourceId: String(item.source_id || '') }))
      .filter((item) => item.sourceId);
    markNotificationEntriesRead(unreadLikeEntries);
    if (!selectedNoteUserId) return;
    if (!noteShouldStickToBottomRef.current) return;
    markNotesAsSeen(displayedChatNotes);
  }, [activeDrawerSection, displayedChatNotes, isNotificationRead, markNotificationEntriesRead, markNotesAsSeen, noteLikeNotifications, open, selectedNoteUserId]);

  useLayoutEffect(() => {
    if (!open || activeDrawerSection !== 'bot_messages') return;
    const shouldForceScroll = botForceScrollToBottomRef.current;
    if (!shouldForceScroll && !botShouldStickToBottomRef.current) return;
    scrollBotMessagesToBottom(shouldForceScroll ? 'auto' : 'smooth');
    botForceScrollToBottomRef.current = false;
  }, [activeDrawerSection, botMessages, open, selectedBotGroupId]);

  useEffect(() => {
    if (!open || activeDrawerSection !== 'bot_messages') return;
    if (!selectedBotGroupId) return;
    if (!botShouldStickToBottomRef.current) return;
    markBotMessagesAsSeen(botMessages);
  }, [activeDrawerSection, botMessages, markBotMessagesAsSeen, open, selectedBotGroupId]);

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

  const submitNote = async () => {
    if (!noteText.trim() && noteAttachments.length === 0 && noteLinkedAttachments.length === 0) return;
    if (noteSending) return;

    setNoteSending(true);
    let optimisticNoteId: string | null = null;
    try {
      const scope = normalizeNoteScope(noteModuleId, noteRecordId);
      const renderedNoteText = noteModuleId && noteTemplateRecord
        ? renderRecordTemplate(noteText, noteTemplateRecord, noteModuleId)
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

      optimisticNoteId = `optimistic-note-${Date.now()}`;
      const optimisticNote = {
        id: optimisticNoteId,
        ...payload,
        source_type: null,
        is_edited: false,
        edited_at: null,
        created_at: new Date().toISOString(),
      };
      setNotes((prev) => [optimisticNote, ...prev.filter((note: any) => String(note?.id || '') !== optimisticNoteId)]);
      setSelectedConversationNotes((prev) => (
        prev ? [...prev.filter((note: any) => String(note?.id || '') !== optimisticNoteId), optimisticNote] : prev
      ));

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
      if (optimisticNoteId) {
        setNotes((prev) => prev.filter((note: any) => String(note?.id || '') !== optimisticNoteId));
        setSelectedConversationNotes((prev) => (
          prev ? prev.filter((note: any) => String(note?.id || '') !== optimisticNoteId) : prev
        ));
      }
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

    const forwardText = buildForwardBodyText(parsedContent.text || '', parsedContent.attachments || []);
    const customForwardMessageText = String(forwardMessageText || '').trim();
    const finalForwardText = customForwardMessageText
      ? `${customForwardMessageText}\n\n${forwardText}`
      : forwardText;
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
          content: serializeNoteContent(finalForwardText, []),
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
        content: serializeNoteContent(finalForwardText, []),
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
        const forwardedAttachments = parsedContent.attachments || [];
        const isRubikaTarget = String(targetGroup.channel_type || '').trim() === 'rubika';
        const forwardedAttachmentNameText = buildAttachmentNameText(forwardedAttachments);
        const rubikaLinkedMessage = isRubikaTarget && forwardedAttachments.length > 0
          ? buildRubikaLinkedAttachmentMessage(String(parsedContent.text || '').trim(), forwardedAttachments)
          : null;
        const linkedRubikaText = String(rubikaLinkedMessage?.text || '').trim();
        const rubikaTextWithPrefix = customForwardMessageText
          ? [customForwardMessageText, linkedRubikaText || 'پیوست ارسال شد'].filter(Boolean).join('\n\n')
          : (linkedRubikaText || 'پیوست ارسال شد');
        const targetText = isRubikaTarget && forwardedAttachments.length > 0
          ? rubikaTextWithPrefix
          : finalForwardText;
        await sendTextToBotGroup(targetGroup, targetText, {
          extraPayload: isRubikaTarget
            ? (rubikaLinkedMessage?.metadata ? { metadata: rubikaLinkedMessage.metadata } : undefined)
            : undefined,
          fallbackText: isRubikaTarget && forwardedAttachments.length > 0
            ? [customForwardMessageText, String(parsedContent.text || '').trim(), forwardedAttachmentNameText].filter(Boolean).join('\n')
            : undefined,
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
        return Array.from(unique.values()).slice(0, 4);
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
    const separatorIndex = notificationId.indexOf(':');
    const kind = separatorIndex >= 0 ? notificationId.slice(0, separatorIndex) : '';
    const entityId = separatorIndex >= 0 ? notificationId.slice(separatorIndex + 1) : '';
    if (!entityId) return;
    if (kind === 'note' || kind === 'assistant') {
      dismissNotificationEntries([{ section: 'notes', sourceType: 'note', sourceId: entityId }]);
      return;
    }
    if (kind === 'task') {
      dismissNotificationEntries([{ section: 'tasks', sourceType: 'task', sourceId: entityId }]);
      return;
    }
    if (kind === 'responsibility') {
      const row = responsibilities.find((item: any) => String(item?.id || '').trim() === entityId);
      if (row) {
        dismissNotificationEntries([{ section: 'responsibilities', sourceType: getResponsibilitySourceType(row), sourceId: entityId }]);
      }
      return;
    }
    if (kind === 'bot') {
      dismissNotificationEntries([{ section: 'bot_messages', sourceType: 'counterparty_bot_message', sourceId: entityId }]);
      return;
    }
    if (kind === 'sms') {
      dismissNotificationEntries([{ section: 'sms_messages', sourceType: 'inbound_sms', sourceId: entityId }]);
      return;
    }
    if (kind === 'voip_call') {
      dismissNotificationEntries([{ section: 'voip_calls', sourceType: 'voip_call', sourceId: entityId }]);
    }
  }, [dismissNotificationEntries, responsibilities]);

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

  const renderNotesPanel = (layout: 'desktop' | 'mobile' = 'desktop') => {
    const withUserSidebar = layout === 'desktop';
    const withMobileUserRail = layout === 'mobile';
    const data = displayedChatNotes;
    const noteMap = new Map(notes.map((note: any) => [note.id, note]));
    const panelTitle = selectedChatGroup?.name || (selectedNoteUser ? selectedNoteUser.display_name : 'یادداشت‌های من');
    const panelSubtitle = selectedChatGroup || selectedNoteUser
      ? activeConversationRoleLabel
      : `${toPersianNumber(String(myNoteStats.noteCount || 0))} یادداشت`;

    return (
      <div dir="ltr" className="flex flex-1 min-h-0 bg-[rgba(var(--brand-50-rgb),0.16)] dark:bg-[#151113]">
        {withUserSidebar ? (
          <div dir="rtl" className="order-last w-[208px] border-l border-slate-200/55 bg-white/72 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="px-4 py-3 border-b border-slate-200/45 bg-white/55 dark:border-white/[0.07] dark:bg-white/[0.025]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-gray-600 dark:text-gray-300">گفتگوها</div>
                <Button
                  size="small"
                  shape="circle"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingGroup(null);
                    setGroupNameDraft('');
                    setGroupMemberDrafts([]);
                    setGroupModalOpen(true);
                  }}
                />
              </div>
              <Input
                size="small"
                allowClear
                value={noteUserSearch}
                onChange={(event) => setNoteUserSearch(event.target.value)}
                placeholder="جستجوی گفتگو"
                prefix={<SearchOutlined className="text-gray-400" />}
                className="mt-2"
              />
            </div>
            <div className="overflow-y-auto h-full px-2 py-2 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setMobileNoteSearchOpen(false);
                  setSelectedNoteUserId(null);
                }}
                className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${
                  !selectedNoteUserId
                    ? 'bg-[rgba(var(--brand-500-rgb),0.08)] text-[rgb(var(--brand-800-rgb))] shadow-[inset_0_0_0_1px_rgba(var(--brand-500-rgb),0.12)] dark:bg-[rgba(var(--brand-500-rgb),0.12)] dark:text-white'
                    : 'hover:bg-white/80 dark:hover:bg-white/[0.055] text-gray-700 dark:text-gray-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">یادداشت‌های من</span>
                  <span className="text-[11px] text-gray-400">{toPersianNumber(String(myNoteStats.noteCount || 0))}</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileNoteSearchOpen(false);
                  setSelectedNoteUserId((prev) => (prev === SYSTEM_MESSAGES_USER_ID ? null : SYSTEM_MESSAGES_USER_ID));
                }}
                className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${
                  selectedNoteUserId === SYSTEM_MESSAGES_USER_ID
                    ? 'bg-[rgba(var(--brand-500-rgb),0.08)] text-[rgb(var(--brand-800-rgb))] shadow-[inset_0_0_0_1px_rgba(var(--brand-500-rgb),0.12)] dark:bg-[rgba(var(--brand-500-rgb),0.12)] dark:text-white'
                    : 'hover:bg-white/80 dark:hover:bg-white/[0.055] text-gray-700 dark:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar size={36} className="!bg-slate-200 !text-slate-700 dark:!bg-white/10 dark:!text-slate-200">
                    <BellOutlined />
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">پیام‌های سیستم</div>
                    <div className="text-[11px] text-gray-400">
                      {systemNoteStats.noteCount > 0 ? `${toPersianNumber(String(systemNoteStats.noteCount))} پیام` : 'بدون پیام'}
                    </div>
                  </div>
                  {systemNoteStats.unreadCount > 0 ? (
                    <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {toPersianNumber(String(systemNoteStats.unreadCount))}
                    </span>
                  ) : null}
                </div>
              </button>
              {visibleNoteConversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMobileNoteSearchOpen(false);
                    setSelectedNoteUserId((prev) => (prev === item.id ? null : item.id));
                  }}
                  className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${
                    selectedNoteUserId === item.id
                      ? 'bg-[rgba(var(--brand-500-rgb),0.08)] text-[rgb(var(--brand-800-rgb))] shadow-[inset_0_0_0_1px_rgba(var(--brand-500-rgb),0.12)] dark:bg-[rgba(var(--brand-500-rgb),0.12)] dark:text-white'
                      : 'hover:bg-white/80 dark:hover:bg-white/[0.055] text-gray-700 dark:text-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      size={36}
                      src={!item.isGroup ? item.avatarUrl || undefined : undefined}
                      className={item.isGroup ? '!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300' : ''}
                    >
                      {item.isGroup ? <TeamOutlined /> : (!item.avatarUrl && String(item.displayName || '?').slice(0, 1))}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium flex items-center gap-1.5">
                        <span>{item.displayName}</span>
                        {item.isGroup ? <TeamOutlined className="text-[11px] text-amber-500" /> : null}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {item.noteCount > 0 ? `${toPersianNumber(String(item.noteCount))} پیام` : 'بدون پیام'}
                      </div>
                    </div>
                    {item.unreadCount > 0 ? (
                      <span className={`inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${item.isGroup ? 'bg-amber-500' : 'bg-red-500'}`}>
                        {toPersianNumber(String(item.unreadCount))}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col flex-1 min-h-0 bg-white/82 dark:bg-[#1a1518]">
          <div className="border-b border-slate-200/45 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                {selectedChatGroup || selectedNoteUser ? (
                  <Avatar
                    size={withMobileUserRail ? 32 : 36}
                    src={!selectedChatGroup ? selectedNoteUser?.avatar_url || undefined : undefined}
                    className={selectedChatGroup ? '!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300' : ''}
                  >
                    {selectedChatGroup ? <TeamOutlined /> : (!selectedNoteUser?.avatar_url && String(selectedNoteUser?.display_name || '?').slice(0, 1))}
                  </Avatar>
                ) : null}
                <div className="min-w-0">
                  <div className="truncate px-0.5 text-[13px] font-bold text-gray-800 dark:text-gray-100">{panelTitle}</div>
                  <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">{panelSubtitle}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {selectedChatGroup && selectedChatGroup.created_by === String(profile.id || '') ? (
                  <>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditingGroup(selectedChatGroup);
                        setGroupNameDraft(selectedChatGroup.name);
                        setGroupMemberDrafts([
                          ...(selectedChatGroup.user_ids || []).map((id) => `user:${id}`),
                          ...(selectedChatGroup.role_ids || []).map((id) => `role:${id}`),
                        ]);
                        setGroupModalOpen(true);
                      }}
                    />
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        Modal.confirm({
                          title: 'حذف گروه',
                          content: 'این گفتگو حذف شود؟',
                          okText: 'حذف',
                          cancelText: 'انصراف',
                          okButtonProps: { danger: true },
                          onOk: async () => {
                            const { error } = await supabase.from('chat_groups').delete().eq('id', selectedChatGroup.id);
                            if (error) throw error;
                            setChatGroups((prev) => prev.filter((group) => group.id !== selectedChatGroup.id));
                            setSelectedNoteUserId(null);
                          },
                        });
                      }}
                    />
                  </>
                ) : null}
                <Button
                  size="small"
                  type={noteMessageSearchOpen || normalizedNoteMessageSearch ? 'primary' : 'default'}
                  icon={<SearchOutlined />}
                  onClick={() => {
                    setNoteMessageSearchOpen((prev) => {
                      if (prev) {
                        setNoteMessageSearch('');
                      }
                      return !prev;
                    });
                  }}
                />
              </div>
            </div>
            {noteMessageSearchOpen ? (
              <Input
                size="small"
                allowClear
                autoFocus
                value={noteMessageSearch}
                onChange={(event) => setNoteMessageSearch(event.target.value)}
                placeholder={selectedChatGroup || selectedNoteUser ? 'جستجو در پیام‌های این گفتگو' : 'جستجو در یادداشت‌های من'}
                prefix={<SearchOutlined className="text-gray-400" />}
                className="mt-2"
              />
            ) : null}
          </div>

          <div
            ref={notesScrollContainerRef}
            onScroll={handleNotesScroll}
            className={`flex-1 overflow-y-auto ${withUserSidebar ? 'px-3 py-3' : 'px-2 py-2'} space-y-2.5 bg-[rgba(var(--brand-50-rgb),0.14)] dark:bg-black/[0.10]`}
          >
            {loadingNotes ? (
              <div className="space-y-3">
                <Skeleton active paragraph={{ rows: 2 }} />
                <Skeleton active paragraph={{ rows: 2 }} />
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            ) : data.length === 0 ? (
              <Empty description={normalizedNoteMessageSearch ? 'پیامی با این جستجو پیدا نشد' : 'پیامی یافت نشد'} />
            ) : (
              data.map((note: any) => {
                const recordKey = `${note.module_id}:${note.record_id}`;
                const recordTitle = recordTitleMap[recordKey] || formatRecordLabel({ id: note.record_id, module_id: note.module_id }, note.module_id);
                const isSystem = isSystemNote(note);
                const isMine = !isSystem && note.author_id && profile.id && note.author_id === profile.id;
                const author = directoryUserMap[String(note.author_id || '')];
                const authorName = isSystem ? 'پیام‌های سیستم' : (isMine ? 'شما' : (note.author_name || author?.display_name || authorNameMap[note.author_id] || 'کاربر سیستم'));
                const replyTarget = note.reply_to ? noteMap.get(note.reply_to) : null;
                const replyParsedContent = replyTarget ? parseNoteContent(replyTarget.content) : null;
                const replyAuthorName = replyTarget
                  ? (
                    replyTarget.author_id && profile.id && replyTarget.author_id === profile.id
                      ? 'شما'
                      : (
                        replyTarget.author_name
                        || directoryUserMap[String(replyTarget.author_id || '')]?.display_name
                        || authorNameMap[replyTarget.author_id]
                        || 'کاربر سیستم'
                      )
                  )
                  : null;
                const parsedContent = parseNoteContent(note.content);
                const mentionUsers = (note.mention_user_ids || []).map((id: string) => directoryUserMap[String(id)]?.display_name || id);
                const mentionRoles = (note.mention_role_ids || []).map((id: string) => roleLookup[String(id)] || id);
                const noteReadReceipts = normalizeReadReceipts(note.metadata);
                const noteLikeReceipts = normalizeLikeReceipts(note.metadata);
                const noteId = String(note.id || '');
                const isUnreadNote = !isMine && !isNotificationRead('notes', 'note', noteId, seenNoteIds.has(noteId));
                const likedByMe = Boolean(likeReceiptMapFromBox(note.metadata)[String(profile.id || '').trim()]);

                return (
                  <div key={note.id}>
                    <SharedNoteCard
                      authorName={authorName}
                      createdAtLabel={safeJalaliFormat(note.created_at, 'YYYY/MM/DD HH:mm')}
                      text={parsedContent.text}
                      attachments={parsedContent.attachments}
                      avatarUrl={author?.avatar_url || null}
                      avatarFallback={authorName}
                      mentionUsers={mentionUsers}
                      mentionRoles={mentionRoles}
                      replyText={replyParsedContent?.text || null}
                      replyAuthorName={replyAuthorName}
                      replyAttachments={replyParsedContent?.attachments || []}
                      onReplyPreviewClick={replyTarget ? () => scrollMessageIntoView(`note-message-${String(replyTarget.id)}`) : undefined}
                      messageDomId={`note-message-${String(note.id)}`}
                      isMine={Boolean(isMine)}
                      animateOnMount={shouldAnimateChatEntry(note.created_at)}
                      variant="default"
                      renderTemplateBold={isSystem}
                      statusNode={renderReadReceiptStatus(noteReadReceipts, noteLikeReceipts)}
                      unreadIndicator={isUnreadNote}
                      likeCount={noteLikeReceipts.length}
                      likedByMe={likedByMe}
                      isEdited={Boolean(note.is_edited)}
                      isEditing={editingNoteId === note.id}
                      editingValue={editingNoteValue}
                      onEditingChange={setEditingNoteValue}
                      onSaveEdit={async () => {
                        if (!editingNoteValue.trim()) return;
                        const nextContent = serializeNoteContent(editingNoteValue, parsedContent.attachments);
                        await supabase.from('notes').update({ content: nextContent, is_edited: true }).eq('id', note.id);
                        setNotes((prev) => prev.map((n: any) => (n.id === note.id ? { ...n, content: nextContent, is_edited: true } : n)));
                        setEditingNoteId(null);
                        setEditingNoteValue('');
                      }}
                      onCancelEdit={() => {
                        setEditingNoteId(null);
                        setEditingNoteValue('');
                      }}
                      onReply={() => {
                        setNoteReplyTo(note.id);
                        setNoteModuleId(note.module_id || null);
                        setNoteRecordId(note.record_id || null);
                      }}
                      onForward={() => openForwardModal(note)}
                      onLike={!isSystem ? () => {
                        void toggleNoteLike(note).catch((error) => {
                          console.warn('Could not toggle note like', error);
                          message.error(toFaErrorMessage(error, 'ثبت پسندیدن پیام ناموفق بود.'));
                        });
                      } : undefined}
                      onEdit={isMine ? () => {
                        setEditingNoteId(note.id);
                        setEditingNoteValue(parsedContent.text || '');
                      } : undefined}
                      onDelete={isMine ? async () => {
                        await supabase.from('notes').delete().eq('id', note.id);
                        setNotes((prev) => prev.filter((n: any) => n.id !== note.id));
                      } : undefined}
                      footer={note.module_id && note.record_id ? (
                        <span>
                          رکورد مرتبط:{' '}
                          <Link to={`/${note.module_id}/${note.record_id}`} className="text-leather-600" onClick={handleClose}>
                            {recordTitle}
                          </Link>
                        </span>
                      ) : null}
                    />
                  </div>
                );
              })
            )}
          </div>
          {selectedNoteUserId && selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID && noteNewIncomingCount > 0 ? (
            <div className="pb-1 text-center">
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-slate-300/45 bg-white/95 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white dark:border-white/[0.1] dark:bg-white/[0.08] dark:text-slate-200"
                onClick={() => {
                  noteShouldStickToBottomRef.current = true;
                  noteForceScrollToBottomRef.current = true;
                  setNoteNewIncomingCount(0);
                  scrollNotesToBottom('smooth');
                }}
              >
                +{toPersianNumber(String(noteNewIncomingCount))} پیام جدید
              </button>
            </div>
          ) : null}

          <SharedNoteComposer
            header={(
              <div className="flex flex-col gap-2">
                <div
                  dir="rtl"
                  className={withMobileUserRail ? 'flex items-center gap-2' : 'flex items-center flex-wrap gap-2'}
                >
                  <Select
                    placeholder="ماژول"
                    value={noteModuleId}
                    onChange={(val) => {
                      setNoteModuleId(val);
                      setNoteRecordId(null);
                    }}
                    options={moduleOptions}
                    size="small"
                    className={withMobileUserRail ? 'min-w-[112px] max-w-[112px] shrink-0' : 'min-w-[120px]'}
                    styles={{ popup: { root: { minWidth: 220 } } }}
                  />
                  <div className="flex min-w-0 items-center gap-1">
                    <Select
                      placeholder="رکورد"
                      value={noteRecordId}
                      onChange={setNoteRecordId}
                      options={noteRecordOptions}
                      size="small"
                      showSearch
                      optionFilterProp="label"
                      disabled={!noteModuleId}
                      className="min-w-0 flex-1"
                      style={{ width: '100%' }}
                      styles={{ popup: { root: { minWidth: 280 } } }}
                    />
                    <div className="shrink-0">
                      <QrScanPopover
                        label=""
                        buttonProps={{ type: 'default', shape: 'circle', size: 'small' }}
                        buttonClassName="text-[rgba(var(--brand-700-rgb),0.85)] dark:text-[rgba(var(--brand-300-rgb),0.9)] hover:text-leather-500"
                        onScan={({ moduleId, recordId }) => {
                          if (moduleId && recordId) {
                            setNoteModuleId(moduleId);
                            setNoteRecordId(recordId);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            value={noteText}
            onChange={handleNoteTextChange}
            onSubmit={submitNote}
            submitLoading={noteSending}
            placeholder={
              selectedNoteUserId === SYSTEM_MESSAGES_USER_ID
                ? 'این گفتگو فقط پیام‌های سیستم را نمایش می‌دهد.'
                : selectedChatGroup
                  ? `پیام به گروه ${selectedChatGroup.name}...`
                  : (selectedNoteUser ? `پیام به ${selectedNoteUser.display_name}...` : 'یادداشت جدید...')
            }
            mentionOptions={mentionOptions}
            mentionValues={mentionValues}
            onMentionChange={(values) => setMentionValues(values || [])}
            mentionPickerOpen={noteMentionPickerOpen}
            onToggleMentionPicker={() => setNoteMentionPickerOpen((prev) => !prev)}
            attachments={noteAttachments}
            linkedAttachments={noteLinkedAttachments}
            onFilesSelected={(files) => {
              setNoteAttachments((prev) => {
                const map = new Map(prev.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]));
                files.forEach((file) => {
                  map.set(`${file.name}-${file.size}-${file.lastModified}`, file);
                });
                return Array.from(map.values());
              });
            }}
            onRemoveAttachment={(fileName) => {
              setNoteAttachments((prev) => prev.filter((file) => file.name !== fileName));
            }}
            onLinkedAttachmentsSelected={(attachments) => {
              setNoteLinkedAttachments((prev) => {
                const map = new Map(prev.map((attachment) => [String(attachment.url || ''), attachment]));
                attachments.forEach((attachment) => {
                  const url = String(attachment.url || '').trim();
                  if (url) map.set(url, attachment);
                });
                return Array.from(map.values());
              });
            }}
            onRemoveLinkedAttachment={(url) => {
              setNoteLinkedAttachments((prev) => prev.filter((attachment) => String(attachment.url || '') !== String(url || '')));
            }}
            filePickerModuleId={noteModuleId}
            filePickerRecordId={noteRecordId}
            replyActive={Boolean(noteReplyTo)}
            onClearReply={() => setNoteReplyTo(null)}
            smsNotificationEnabled={noteSmsNotificationEnabled}
            onSmsNotificationChange={setNoteSmsNotificationEnabled}
            enableImagePasteAndDrop
            submitDisabled={noteSending || selectedNoteUserId === SYSTEM_MESSAGES_USER_ID || (!noteText.trim() && noteAttachments.length === 0 && noteLinkedAttachments.length === 0)}
            extraActions={(
              <Button
                type="text"
                size="small"
                icon={<SnippetsOutlined />}
                onClick={() => openReadyTextsModal('notes')}
              />
            )}
          />
        </div>
        {withMobileUserRail ? (
          <div dir="rtl" className="w-[54px] shrink-0 overflow-hidden border-l border-slate-200/45 bg-white/60 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="flex h-full flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden px-1 py-1.5">
              <div className="sticky top-0 z-10 flex w-full justify-center">
                <Popover
                  trigger="click"
                  placement="leftTop"
                  open={mobileNoteSearchOpen}
                  onOpenChange={setMobileNoteSearchOpen}
                  content={(
                    <Input
                      size="small"
                      allowClear
                      autoFocus
                      value={noteUserSearch}
                      onChange={(event) => setNoteUserSearch(event.target.value)}
                      placeholder="جستجوی چت"
                      prefix={<SearchOutlined className="text-gray-400" />}
                      className="w-[170px]"
                    />
                  )}
                >
                  <Button
                    type={noteUserSearch ? 'primary' : 'default'}
                    shape="circle"
                    size="small"
                    icon={<SearchOutlined />}
                    className="shadow-sm"
                  />
                </Popover>
              </div>
              <div className="sticky top-9 z-10 flex w-full justify-center">
                <Button
                  type="default"
                  shape="circle"
                  size="small"
                  icon={<PlusOutlined />}
                  className="shadow-sm"
                  onClick={() => {
                    setEditingGroup(null);
                    setGroupNameDraft('');
                    setGroupMemberDrafts([]);
                    setGroupModalOpen(true);
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => setSelectedNoteUserId(null)}
                className="flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors hover:bg-white/75 dark:hover:bg-white/5"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-2xl border text-[10px] font-bold ${
                  !selectedNoteUserId
                    ? 'border-[rgba(var(--brand-500-rgb),0.24)] bg-[rgba(var(--brand-500-rgb),0.08)] text-[rgb(var(--brand-800-rgb))] dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:bg-[rgba(var(--brand-500-rgb),0.12)] dark:text-white'
                    : 'border-slate-200/45 bg-white/70 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-gray-200'
                }`}>
                  من
                </div>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{toPersianNumber(String(myNoteStats.noteCount || 0))}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedNoteUserId((prev) => (prev === SYSTEM_MESSAGES_USER_ID ? null : SYSTEM_MESSAGES_USER_ID))}
                className="flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors hover:bg-white/75 dark:hover:bg-white/5"
                title="پیام‌های سیستم"
              >
                <div className="relative">
                  <Badge count={systemNoteStats.unreadCount > 0 ? toPersianNumber(String(systemNoteStats.unreadCount)) : 0} size="small" offset={[-2, 2]}>
                    <Avatar
                      size={38}
                      className={`!bg-slate-200 !text-slate-700 dark:!bg-white/10 dark:!text-slate-200 ${
                        selectedNoteUserId === SYSTEM_MESSAGES_USER_ID ? 'ring-2 ring-[rgba(var(--brand-500-rgb),0.28)] ring-offset-2 ring-offset-white dark:ring-[rgba(var(--brand-300-rgb),0.35)] dark:ring-offset-[#151113]' : ''
                      }`}
                    >
                      <BellOutlined />
                    </Avatar>
                  </Badge>
                </div>
                <span className="line-clamp-2 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400">
                  سیستم
                </span>
              </button>

              {visibleNoteConversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedNoteUserId((prev) => (prev === item.id ? null : item.id))}
                className="flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors hover:bg-white/75 dark:hover:bg-white/5"
                  title={item.displayName}
                >
                  <div className="relative">
                    <Badge count={item.unreadCount > 0 ? toPersianNumber(String(item.unreadCount)) : 0} size="small" offset={[-2, 2]}>
                      <Avatar
                        size={38}
                        src={!item.isGroup ? item.avatarUrl || undefined : undefined}
                        className={`${selectedNoteUserId === item.id ? 'ring-2 ring-[rgba(var(--brand-500-rgb),0.28)] ring-offset-2 ring-offset-white dark:ring-[rgba(var(--brand-300-rgb),0.35)] dark:ring-offset-[#151113]' : ''} ${item.isGroup ? '!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300' : ''}`}
                      >
                        {item.isGroup ? <TeamOutlined /> : (!item.avatarUrl && String(item.displayName || '?').slice(0, 1))}
                      </Avatar>
                    </Badge>
                    <span className="absolute -left-1 bottom-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] text-[rgb(var(--brand-700-rgb))] shadow-sm dark:bg-[rgba(var(--app-dark-surface-rgb),0.96)] dark:text-[rgb(var(--brand-300-rgb))]">
                      {item.isGroup ? <TeamOutlined /> : <LeftOutlined />}
                    </span>
                  </div>
                  <span className="line-clamp-2 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400">
                    {item.displayName}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderNotes = () => {
    const data = showMore.notes ? notes : notes.slice(0, MAX_ITEMS);
    const noteMap = new Map(data.map((n: any) => [n.id, n]));
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loadingNotes ? (
            <div className="space-y-3">
              <Skeleton active paragraph={{ rows: 2 }} />
              <Skeleton active paragraph={{ rows: 2 }} />
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ) : data.length === 0 ? (
            <Empty description="نوتیفیکیشن جدیدی ندارید" />
          ) : (
            data.map((note: any) => {
              const recordKey = `${note.module_id}:${note.record_id}`;
              const recordTitle = recordTitleMap[recordKey] || formatRecordLabel({ id: note.record_id, module_id: note.module_id }, note.module_id);
              const isSystem = isSystemNote(note);
              const isMine = !isSystem && note.author_id && profile.id && note.author_id === profile.id;
              const authorName = isSystem ? 'پیام‌های سیستم' : (isMine ? 'شما' : (note.author_name || authorNameMap[note.author_id] || 'کاربر سیستم'));
              const replyTarget = note.reply_to ? noteMap.get(note.reply_to) : null;
              const parsedContent = parseNoteContent(note.content);
              return (
                <div key={note.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`w-[92%] rounded-2xl px-3 py-2 border shadow-[0_6px_18px_rgba(15,23,42,0.05)] ${
                      isMine
                        ? 'bg-[rgba(var(--brand-500-rgb),0.08)] dark:bg-[rgba(var(--brand-500-rgb),0.12)] border-[rgba(var(--brand-500-rgb),0.18)] dark:border-[rgba(var(--brand-300-rgb),0.16)] rounded-tr-sm'
                      : 'bg-white/85 dark:bg-[rgba(var(--app-dark-surface-rgb),0.86)] border-[rgba(var(--brand-200-rgb),0.24)] dark:border-[rgba(var(--brand-300-rgb),0.14)] rounded-tl-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                      <span>{authorName}</span>
                      <span>{safeJalaliFormat(note.created_at, 'YYYY/MM/DD HH:mm')}</span>
                    </div>
                    {replyTarget && (
                      <div className="text-[11px] text-gray-600 dark:text-gray-300 bg-slate-100/80 dark:bg-white/[0.055] rounded-lg p-2 mb-2">
                        پاسخ به: {renderLinkifiedText(String(parseNoteContent(replyTarget.content).text || ''), `note-reply-${note.id}`)}
                      </div>
                    )}
                    <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                      {renderLinkifiedText(String(parsedContent.text || ''), `note-body-${note.id}`)}
                    </div>
                    {parsedContent.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {parsedContent.attachments.map((attachment) => (
                          <a
                            key={`${attachment.url}-${attachment.name}`}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-slate-300/40 bg-slate-100/70 px-2.5 py-1 text-[11px] text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.045] dark:text-slate-200"
                          >
                            <span className="max-w-[180px] truncate">{attachment.name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 text-[11px] text-gray-500">
                      رکورد مرتبط: <Link to={`/${note.module_id}/${note.record_id}`} className="text-leather-600" onClick={handleClose}>{recordTitle}</Link>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                      <Button
                        type="text"
                        size="small"
                        icon={<EnterOutlined />}
                        onClick={() => {
                          setNoteReplyTo(note.id);
                          setNoteModuleId(note.module_id || null);
                          setNoteRecordId(note.record_id || null);
                        }}
                      />
                      {isMine && (
                        <>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditingNoteValue(parsedContent.text || '');
                            }}
                          />
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={async () => {
                              await supabase.from('notes').delete().eq('id', note.id);
                              setNotes((prev) => prev.filter((n: any) => n.id !== note.id));
                            }}
                          />
                        </>
                      )}
                    </div>
                    {editingNoteId === note.id && (
                      <div className="mt-2 flex flex-col gap-2">
                        <Input.TextArea
                          value={editingNoteValue}
                          onChange={(e) => setEditingNoteValue(e.target.value)}
                          autoSize={{ minRows: 2, maxRows: 4 }}
                        />
                        <div className="flex gap-2">
                          <Button
                            type="primary"
                            size="small"
                            icon={<CheckOutlined />}
                            onClick={async () => {
                              if (!editingNoteValue.trim()) return;
                              const nextContent = serializeNoteContent(editingNoteValue, parsedContent.attachments);
                              await supabase.from('notes').update({ content: nextContent, is_edited: true }).eq('id', note.id);
                              setNotes((prev) => prev.map((n: any) => (n.id === note.id ? { ...n, content: nextContent, is_edited: true } : n)));
                              setEditingNoteId(null);
                              setEditingNoteValue('');
                            }}
                          >
                            ذخیره
                          </Button>
                          <Button size="small" onClick={() => setEditingNoteId(null)}>
                            انصراف
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {notes.length > MAX_ITEMS && (
            <Button type="link" onClick={() => setShowMore(prev => ({ ...prev, notes: !prev.notes }))}>
              {showMore.notes ? 'نمایش کمتر' : 'نمایش بیشتر'}
            </Button>
          )}
        </div>
      <div className="border-t border-[rgba(var(--brand-200-rgb),0.18)] dark:border-[rgba(var(--brand-300-rgb),0.12)] bg-white/90 dark:bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Select
              placeholder="ماژول"
              value={noteModuleId}
              onChange={(val) => {
                setNoteModuleId(val);
                setNoteRecordId(null);
              }}
              options={moduleOptions}
              size="small"
              className="min-w-[110px]"
            />
            <Select
              placeholder="رکورد"
              value={noteRecordId}
              onChange={setNoteRecordId}
              options={noteRecordOptions}
              size="small"
              showSearch
              optionFilterProp="label"
              className="flex-1"
            />
            <QrScanPopover
              label=""
              buttonProps={{ type: 'default', shape: 'circle', size: 'small' }}
              buttonClassName="text-[rgba(var(--brand-700-rgb),0.85)] dark:text-[rgba(var(--brand-300-rgb),0.9)] hover:text-leather-500"
              onScan={({ moduleId, recordId }) => {
                if (moduleId && recordId) {
                  setNoteModuleId(moduleId);
                  setNoteRecordId(recordId);
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Input.TextArea
              placeholder={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID ? 'این گفتگو فقط پیام‌های سیستم را نمایش می‌دهد.' : 'یادداشت جدید...'}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 4 }}
              className="rounded-[0.9rem] !border-[rgba(var(--brand-200-rgb),0.28)] dark:!border-[rgba(var(--brand-300-rgb),0.16)]"
              disabled={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID}
            />
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="منشن عضو یا تیم (اختیاری)"
              value={mentionValues}
              onChange={(v) => setMentionValues(v || [])}
              options={mentionOptions}
              optionFilterProp="label"
              className="w-full"
              disabled={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID}
              getPopupContainer={(node) => node.parentElement || document.body}
              styles={{ popup: { root: { zIndex: 1100, minWidth: 240 } } }}
            />
            {noteReplyTo && (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <EnterOutlined />
                <span>پاسخ به یادداشت انتخاب شده</span>
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setNoteReplyTo(null)} />
              </div>
            )}
            <div className="flex justify-end">
              <Button
                type="primary"
                loading={noteSending}
                disabled={noteSending || selectedNoteUserId === SYSTEM_MESSAGES_USER_ID || (!noteText.trim() && noteAttachments.length === 0 && noteLinkedAttachments.length === 0)}
                onClick={async () => {
                  await submitNote();
                }}
              >
                ارسال
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSmsMessagesPanel = (layout: 'desktop' | 'mobile' = 'desktop') => {
    const isDesktop = layout === 'desktop';
    const activeThread = selectedSmsThread;
    const threadMessages = displayedSmsMessages;

    const sendSmsMessage = async () => {
      const recipient = String(smsRecipient || '').trim();
      const text = String(smsText || '').trim();
      if (!recipient) {
        message.warning('شماره گیرنده پیامک را وارد کنید.');
        return;
      }
      if (!text) {
        message.warning('متن پیامک خالی است.');
        return;
      }

      const optimisticId = `optimistic-sms-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const optimisticThreadKey = `sms:${normalizePhoneThreadValue(recipient) || recipient}`;
      setSmsSending(true);
      setSelectedSmsThreadKey(optimisticThreadKey);
      setSmsMessages((prev) => [
        ...prev,
        {
          id: optimisticId,
          title: recipient,
          module_id: null,
          record_id: null,
          direction: 'outbound',
          recipient,
          phone_number: recipient,
          message_text: text,
          status: 'pending',
          message_at: nowIso,
          created_at: nowIso,
        },
      ]);
      setSmsText('');

      try {
        await sendSmsViaGateway({
          to: [recipient],
          text,
          title: 'پیامک مستقیم',
          metadata: { source: 'notifications_drawer_sms' },
        });
        await refreshSection('sms_messages', { force: true });
      } catch (error: any) {
        setSmsMessages((prev) => prev.filter((row) => String(row?.id || '') !== optimisticId));
        message.error(toFaErrorMessage(error, 'ارسال پیامک ناموفق بود.'));
      } finally {
        setSmsSending(false);
      }
    };

    const suggestSmsReply = async (instruction = '') => {
      if (!activeThread?.id && !smsRecipient.trim()) {
        message.warning('ابتدا یک گفتگو یا شماره پیامک را انتخاب کنید.');
        return;
      }
      if (smsSuggesting) return;
      setSmsSuggesting(true);
      setSmsAiPopoverOpen(false);
      try {
        const recentMessages = (threadMessages || []).slice(-16).map((row: any) => {
          const direction = String(row?.direction || '').trim() || 'inbound';
          const isMine = direction !== 'inbound';
          return {
            direction,
            authorName: isMine ? 'کاربر سازمان' : (resolveSmsCounterpartyPhone(row) || 'مشتری'),
            text: String(row?.message_text || '').trim(),
            createdAt: row?.message_at || row?.created_at || null,
          };
        }).filter((item: any) => item.text);

        const suggested = await requestReplySuggestion({
          channel: 'sms',
          phone: String(activeThread?.phone || smsRecipient || '').trim() || null,
          instruction: String(instruction || '').trim() || null,
          context: {
            mode: activeThread?.moduleId && activeThread?.recordId ? 'record' : 'page',
            moduleId: activeThread?.moduleId || null,
            recordId: activeThread?.recordId || null,
            route: '/notifications?sms=1',
          },
          counterparty: {
            moduleId: activeThread?.moduleId || null,
            recordId: activeThread?.recordId || null,
          },
          recentMessages,
        });
        setSmsText(suggested);
      } catch (error: any) {
        message.error(toFaErrorMessage(error, 'پیشنهاد پاسخ پیامک ناموفق بود.'));
      } finally {
        setSmsSuggesting(false);
      }
    };

    const openRelatedSmsRecord = () => {
      if (!activeThread?.moduleId || !activeThread?.recordId) return;
      openPreviewRecord(
        activeThread.moduleId,
        activeThread.recordId,
        getCentralRecordLabel(activeThread.moduleId, activeThread.recordId, activeThread.title || activeThread.phone),
      );
    };

    return (
      <div className="h-full min-h-0 flex flex-col overflow-hidden">
        <div className={`min-h-0 flex-1 ${isDesktop ? 'grid grid-cols-[260px_minmax(0,1fr)]' : 'flex flex-col'}`}>
          <div className={`${isDesktop ? 'border-l' : 'border-b'} border-slate-200/45 dark:border-white/[0.07] bg-slate-50/65 dark:bg-white/[0.025] min-h-0`}>
            {loadingSmsMessages && smsThreads.length === 0 ? (
              <div className="p-3">
                <Skeleton active paragraph={{ rows: 4 }} />
              </div>
            ) : smsThreads.length === 0 ? (
              <div className="p-3">
                <Empty description="هنوز پیامکی ثبت نشده است." />
              </div>
            ) : isDesktop ? (
              <div className="h-full overflow-y-auto p-2 space-y-2">
                {smsThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setSelectedSmsThreadKey(thread.id);
                      if (thread.phone) setSmsRecipient(thread.phone);
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-right transition-colors ${
                      activeThread?.id === thread.id
                        ? 'border-slate-300/50 bg-white/95 shadow-[0_6px_18px_rgba(15,23,42,0.05)] dark:border-white/15 dark:bg-white/[0.075]'
                        : 'border-transparent bg-white/60 hover:bg-white/90 dark:bg-transparent dark:hover:bg-white/[0.055]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{thread.title}</div>
                        <div className="truncate text-[11px] text-gray-500" dir="ltr">{thread.phone || 'بدون شماره'}</div>
                        {getPhoneMatchLabel(thread.phoneMatchStatus) ? (
                          <div className="mt-1 truncate text-[11px] text-amber-600 dark:text-amber-300">{getPhoneMatchLabel(thread.phoneMatchStatus)}</div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {thread.unreadCount > 0 ? (
                          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white">
                            {toPersianNumber(String(thread.unreadCount))}
                          </span>
                        ) : null}
                        <span className="text-[10px] text-gray-400">{safeJalaliFormat(thread.messages[thread.messages.length - 1]?.message_at || thread.messages[thread.messages.length - 1]?.created_at, 'MM/DD HH:mm')}</span>
                      </div>
                    </div>
                    <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-gray-500 dark:text-gray-300">{thread.preview}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex max-h-[92px] gap-1.5 overflow-x-auto px-2 py-1.5">
                {smsThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setSelectedSmsThreadKey(thread.id);
                      if (thread.phone) setSmsRecipient(thread.phone);
                    }}
                    className={`min-w-[132px] rounded-xl border px-2.5 py-1.5 text-right ${
                      activeThread?.id === thread.id
                        ? 'border-slate-300/50 bg-white/95 shadow-[0_6px_18px_rgba(15,23,42,0.05)] dark:border-white/15 dark:bg-white/[0.075]'
                        : 'border-transparent bg-white/60 dark:bg-transparent'
                    }`}
                  >
                    <div className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{thread.title}</div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-gray-500" dir="ltr">{thread.phone || 'بدون شماره'}</span>
                      {thread.unreadCount > 0 ? (
                        <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white">
                          {toPersianNumber(String(thread.unreadCount))}
                        </span>
                      ) : null}
                    </div>
                    {getPhoneMatchLabel(thread.phoneMatchStatus) ? (
                      <div className="mt-1 truncate text-[11px] text-amber-600 dark:text-amber-300">{getPhoneMatchLabel(thread.phoneMatchStatus)}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="min-h-0 flex flex-col overflow-hidden">
            <div className="border-b border-slate-200/45 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {activeThread?.title || 'ارسال پیامک'}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-gray-500" dir="ltr">
                    {activeThread?.phone || 'شماره انتخاب نشده'}
                  </div>
                  {getPhoneMatchLabel(activeThread?.phoneMatchStatus) ? (
                    <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">{getPhoneMatchLabel(activeThread?.phoneMatchStatus)}</div>
                  ) : null}
                </div>
                {activeThread?.moduleId && activeThread?.recordId ? (
                  <Button size="small" icon={<EyeOutlined />} onClick={openRelatedSmsRecord}>
                    رکورد مرتبط
                  </Button>
                ) : null}
              </div>
              <div className="mt-3">
                <Input
                  value={smsRecipient}
                  onChange={(event) => setSmsRecipient(event.target.value)}
                  placeholder="شماره گیرنده، مثلا 0912..."
                  dir="ltr"
                  size={layout === 'mobile' ? 'middle' : 'large'}
                />
              </div>
            </div>
            <div ref={smsMessagesScrollContainerRef} className="flex-1 overflow-y-auto bg-slate-100/45 px-3 py-3 dark:bg-black/[0.08]">
              {loadingSmsMessages && threadMessages.length === 0 && smsThreads.length === 0 ? (
                <Skeleton active paragraph={{ rows: 5 }} />
              ) : threadMessages.length === 0 ? (
                <Empty description="برای این شماره هنوز پیامی ثبت نشده است." />
              ) : (
                <div className="flex flex-col gap-3">
                  {threadMessages.map((row: any) => {
                    const direction = String(row?.direction || '').trim();
                    const isMine = direction !== 'inbound';
                    const phone = resolveSmsCounterpartyPhone(row);
                    const statusLabel = getModuleFieldOptionLabel('sms_delivery_reports', 'status', row?.status);
                    const phoneMatchLabel = getPhoneMatchLabel(row?.phone_match_status);
                    const relatedTitle = row.module_id && row.record_id
                      ? getCentralRecordLabel(row.module_id, row.record_id, row.title || phone)
                      : '';
                    return (
                      <SharedNoteCard
                        key={String(row.id)}
                        authorName={isMine ? 'ارسال پیامک' : (phone || 'پیامک ورودی')}
                        createdAtLabel={safeJalaliFormat(row.message_at || row.created_at, 'YYYY/MM/DD HH:mm')}
                        text={String(row.message_text || '')}
                        attachments={[]}
                        avatarFallback={isMine ? 'SMS' : 'IN'}
                        isMine={isMine}
                        footer={(
                          <div className="flex items-center gap-2 text-[11px] text-gray-400">
                            <span dir="ltr">{phone}</span>
                            {statusLabel ? <span>{statusLabel}</span> : null}
                            {phoneMatchLabel ? <span className="text-amber-600 dark:text-amber-300">{phoneMatchLabel}</span> : null}
                            {row.module_id && row.record_id ? (
                              <Button
                                type="link"
                                size="small"
                                className="!px-0"
                                onClick={() => openPreviewRecord(String(row.module_id), String(row.record_id), relatedTitle || 'رکورد مرتبط')}
                              >
                                {relatedTitle || 'رکورد مرتبط'}
                              </Button>
                            ) : null}
                          </div>
                        )}
                        animateOnMount
                      />
                    );
                  })}
                </div>
              )}
            </div>
            <SharedNoteComposer
              value={smsText}
              onChange={setSmsText}
              onSubmit={sendSmsMessage}
              placeholder="متن پیامک..."
              submitText="ارسال پیامک"
              allowMentions={false}
              allowAttachments={false}
              submitLoading={smsSending}
              submitDisabled={smsSending || smsSuggesting || !smsRecipient.trim() || !smsText.trim()}
              extraActions={(
                <AiSuggestionPopoverAction
                  open={smsAiPopoverOpen}
                  onOpenChange={setSmsAiPopoverOpen}
                  loading={smsSuggesting}
                  disabled={smsSending || smsSuggesting || (!activeThread?.id && !smsRecipient.trim())}
                  onSubmit={(instruction) => suggestSmsReply(instruction)}
                />
              )}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderVoipCallsPanel = (layout: 'desktop' | 'mobile' = 'desktop') => {
    const isDesktop = layout === 'desktop';
    const activeThread = selectedVoipThread;
    const calls = displayedVoipCalls;

    return (
      <div className="h-full min-h-0 flex flex-col overflow-hidden">
        <div className={`min-h-0 flex-1 ${isDesktop ? 'grid grid-cols-[250px_minmax(0,1fr)]' : 'flex flex-col'}`}>
          <div className={`${isDesktop ? 'border-l' : 'border-b'} border-slate-200/45 dark:border-white/[0.07] bg-slate-50/65 dark:bg-white/[0.025] min-h-0`}>
            {voipThreads.length === 0 ? (
              <div className="p-3">
                <Empty description="تماس ورودی جدیدی ندارید." />
              </div>
            ) : isDesktop ? (
              <div className="h-full overflow-y-auto p-2 space-y-2">
                {voipThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedVoipThreadKey(thread.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-right transition-colors ${
                      activeThread?.id === thread.id
                        ? 'border-slate-300/50 bg-white/95 shadow-[0_6px_18px_rgba(15,23,42,0.05)] dark:border-white/15 dark:bg-white/[0.075]'
                        : 'border-transparent bg-white/60 hover:bg-white/90 dark:bg-transparent dark:hover:bg-white/[0.055]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{thread.title}</div>
                        <div className="truncate text-[11px] text-gray-500" dir="ltr">{thread.phone || 'شماره ثبت نشده'}</div>
                        {getPhoneMatchLabel(thread.phoneMatchStatus) ? (
                          <div className="mt-1 truncate text-[11px] text-amber-600 dark:text-amber-300">{getPhoneMatchLabel(thread.phoneMatchStatus)}</div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {thread.unreadCount > 0 ? (
                          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white">
                            {toPersianNumber(String(thread.unreadCount))}
                          </span>
                        ) : null}
                        <span className="text-[10px] text-gray-400">{safeJalaliFormat(thread.calls[0]?.started_at || thread.calls[0]?.created_at, 'MM/DD HH:mm')}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex max-h-[92px] gap-1.5 overflow-x-auto px-2 py-1.5">
                {voipThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedVoipThreadKey(thread.id)}
                    className={`min-w-[132px] rounded-xl border px-2.5 py-1.5 text-right ${
                      activeThread?.id === thread.id
                        ? 'border-slate-300/50 bg-white/95 shadow-[0_6px_18px_rgba(15,23,42,0.05)] dark:border-white/15 dark:bg-white/[0.075]'
                        : 'border-transparent bg-white/60 dark:bg-transparent'
                    }`}
                  >
                    <div className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{thread.title}</div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-gray-500" dir="ltr">{thread.phone || 'شماره ثبت نشده'}</span>
                      {thread.unreadCount > 0 ? (
                        <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white">
                          {toPersianNumber(String(thread.unreadCount))}
                        </span>
                      ) : null}
                    </div>
                    {getPhoneMatchLabel(thread.phoneMatchStatus) ? (
                      <div className="mt-1 truncate text-[11px] text-amber-600 dark:text-amber-300">{getPhoneMatchLabel(thread.phoneMatchStatus)}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="min-h-0 flex flex-col overflow-hidden">
            <div className="border-b border-slate-200/45 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {activeThread?.title || 'تماس‌های ورودی'}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-gray-500" dir="ltr">
                    {activeThread?.phone || 'تماسی انتخاب نشده'}
                  </div>
                  {getPhoneMatchLabel(activeThread?.phoneMatchStatus) ? (
                    <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">{getPhoneMatchLabel(activeThread?.phoneMatchStatus)}</div>
                  ) : null}
                </div>
                {activeThread?.moduleId && activeThread?.recordId ? (
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => openPreviewRecord(
                      activeThread.moduleId!,
                      activeThread.recordId!,
                      getCentralRecordLabel(activeThread.moduleId, activeThread.recordId, activeThread.title),
                    )}
                  >
                    رکورد مرتبط
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-100/45 px-3 py-3 dark:bg-black/[0.08]">
              {calls.length === 0 ? (
                <Empty description="برای این شماره تماسی ثبت نشده است." />
              ) : (
                <div className="space-y-3">
                  {calls.map((row: any) => {
                    const startedAt = row?.started_at || row?.created_at;
                    const statusLabel = getModuleFieldOptionLabel('voip_call_reports', 'status', row?.status);
                    const phoneMatchLabel = getPhoneMatchLabel(row?.phone_match_status);
                    const relatedLabel = row?.module_id && row?.record_id
                      ? getCentralRecordLabel(row.module_id, row.record_id, row.title || row.source_number)
                      : '';
                    const operatorLabel = row?.assignee_id
                      ? assigneeNameMap[String(row.assignee_id)] || ''
                      : '';
                    return (
                      <div
                        key={String(row?.id || '')}
                        className="rounded-xl border border-slate-200/55 bg-white/86 px-3 py-2.5 shadow-[0_5px_16px_rgba(15,23,42,0.04)] dark:border-white/[0.08] dark:bg-white/[0.035]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                              {String(row?.title || row?.source_number || 'تماس ورودی')}
                            </div>
                            <div className="mt-1 text-[11px] text-gray-500" dir="ltr">
                              {String(row?.source_number || '').trim() || '-'}
                              {String(row?.extension || '').trim() ? ` → ${String(row.extension).trim()}` : ''}
                            </div>
                          </div>
                          <div className="text-[11px] text-gray-400">{safeJalaliFormat(startedAt, 'YYYY/MM/DD HH:mm')}</div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          {statusLabel ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-gray-600 dark:bg-white/[0.055] dark:text-gray-200">
                              {statusLabel}
                            </span>
                          ) : null}
                          {phoneMatchLabel ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                              {phoneMatchLabel}
                            </span>
                          ) : null}
                          {relatedLabel ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-gray-600 dark:bg-white/[0.055] dark:text-gray-200">
                              {relatedLabel}
                            </span>
                          ) : null}
                          {operatorLabel ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-gray-600 dark:bg-white/[0.055] dark:text-gray-200">
                              اپراتور: {operatorLabel}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 flex items-center gap-3 text-[12px]">
                          <Button type="link" size="small" className="!px-0" onClick={() => openPreviewRecord('voip_call_reports', String(row.id), String(row?.title || 'تماس VoIP'))}>
                            گزارش تماس
                          </Button>
                          {row?.module_id && row?.record_id ? (
                            <Button
                              type="link"
                              size="small"
                              className="!px-0"
                              onClick={() => openPreviewRecord(String(row.module_id), String(row.record_id), relatedLabel || 'رکورد مرتبط')}
                            >
                              {relatedLabel || 'رکورد مرتبط'}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBotMessagesPanel = (layout: 'desktop' | 'mobile' = 'desktop') => {
    const withDesktopSidebar = layout === 'desktop';
    const withMobileUserRail = layout === 'mobile';
    const selectedGroup = selectedBotGroup;
    const statusLabel = BOT_STATUS_LABELS_FA[String(selectedGroup?.status || '')] || String(selectedGroup?.status || 'نامشخص');
    const channelLabel = BOT_CHANNEL_LABELS_FA[String(selectedGroup?.channel_type || '')] || String(selectedGroup?.channel_type || '-');
    const groupTitle = String(selectedGroup?.group_title || '').trim() || String(selectedGroup?.group_join_link || '').trim() || 'گروه بدون عنوان';
    const canSend = Boolean(String(selectedGroup?.bot_chat_id || '').trim());
    const botMessageMap = new Map(botMessages.map((row) => [String(row.id), row]));
    const normalizedGroupSearch = String(botGroupSearch || '').trim().toLowerCase();
    const normalizedMessageSearch = String(botMessageSearch || '').trim().toLowerCase();
    const botUnreadByGroup = botNotificationMessages.reduce<Record<string, number>>((acc, row) => {
      const groupId = String(row?.bot_group_id || '').trim();
      const id = String(row?.id || '').trim();
      if (!groupId || !id || String(row?.direction || '').trim() !== 'inbound') return acc;
      if (isNotificationRead('bot_messages', 'counterparty_bot_message', id, seenBotMessageIds.has(id))) return acc;
      acc[groupId] = (acc[groupId] || 0) + 1;
      return acc;
    }, {});
    const filteredBotGroups = botGroups.filter((row) => {
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
        avatarUrl,
        fallback: String(name || 'ک').trim().slice(0, 1) || 'ک',
      };
    };
    const resolveInboundBotAuthor = (row: CounterpartyBotMessageRow | null | undefined) => {
      const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
      const name = String((payload as any)?.sender_display_name || '').trim()
        || String((payload as any)?.sender_id || '').trim()
        || String((payload as any)?.username || '').trim()
        || 'کاربر گروه';
      return {
        name,
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
      let optimisticBotMessageId: string | null = null;
      try {
        const recordModuleId = selectedBotModuleId || (selectedGroup.target_type === 'customers' ? 'customers' : 'suppliers');
        const recordId = selectedGroup.target_type === 'customers'
          ? String(selectedGroup.customer_id || '').trim()
          : String(selectedGroup.supplier_id || '').trim();
        const renderedText = recordModuleId && botTemplateRecord
          ? renderRecordTemplate(text, botTemplateRecord, recordModuleId)
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
        const rubikaLinkedMessage = isRubikaGroup && outboundAttachments.length > 0
          ? buildRubikaLinkedAttachmentMessage(String(renderedText || '').trim(), outboundAttachments)
          : null;
        const finalText = isRubikaGroup && outboundAttachments.length > 0
          ? (String(rubikaLinkedMessage?.text || '').trim() || 'پیوست ارسال شد')
          : [renderedText, attachmentText].filter(Boolean).join('\n');
        if (!String(finalText || '').trim()) {
          message.warning('متن پیام خالی است.');
          return;
        }
        const senderPayload = buildCurrentBotSenderPayload();
        optimisticBotMessageId = `optimistic-bot-${Date.now()}`;
        const optimisticBotMessage: CounterpartyBotMessageRow = {
          id: optimisticBotMessageId,
          bot_group_id: selectedGroup.id,
          direction: 'outbound',
          message_type: attachments.length > 0 ? 'file' : 'text',
          chat_id: chatId,
          provider_message_id: null,
          content_text: finalText,
          file_url: null,
          file_name: null,
          mime_type: null,
          payload: {
            attachments,
            reply_to_message_id: botReplyToId || null,
            ...senderPayload,
            optimistic: true,
          },
          created_by: String(senderPayload.sender_user_id || '').trim() || null,
          created_at: new Date().toISOString(),
        };
        setBotMessages((prev) => [...prev.filter((row) => String(row?.id || '') !== optimisticBotMessageId), optimisticBotMessage]);
        botShouldStickToBottomRef.current = true;
        botForceScrollToBottomRef.current = true;
        await sendTextToBotGroup(selectedGroup, finalText, {
          extraPayload: isRubikaGroup
            ? (rubikaLinkedMessage?.metadata ? { metadata: rubikaLinkedMessage.metadata } : undefined)
            : undefined,
          fallbackText: isRubikaGroup && attachments.length > 0
            ? [String(renderedText || '').trim(), attachmentNameText].filter(Boolean).join('\n')
            : undefined,
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
        const groups = await fetchBotGroups();
        await fetchBotNotificationMessages(groups);
        await fetchBotMessages(selectedGroup.id);
        message.success('پیام بات ارسال شد.');
      } catch (error: any) {
        if (optimisticBotMessageId) {
          setBotMessages((prev) => prev.filter((row) => String(row?.id || '') !== optimisticBotMessageId));
        }
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
      <div dir="ltr" className="flex flex-1 min-h-0 bg-[rgba(var(--brand-50-rgb),0.16)] dark:bg-[#151113]">
        {withDesktopSidebar ? (
          <div dir="rtl" className="order-last w-[208px] border-l border-slate-200/55 bg-white/72 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="px-4 py-3 border-b border-slate-200/45 bg-white/55 dark:border-white/[0.07] dark:bg-white/[0.025]">
              <div className="text-xs font-bold text-gray-600 dark:text-gray-300">گروه‌های بات</div>
              <Input
                size="small"
                allowClear
                value={botGroupSearch}
                onChange={(event) => setBotGroupSearch(event.target.value)}
                placeholder="جستجوی گفتگو"
                prefix={<SearchOutlined className="text-gray-400" />}
                className="mt-2"
              />
            </div>
            <div className="overflow-y-auto h-full px-2 py-2 space-y-1">
              {filteredBotGroups.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="گروه باتی ثبت نشده است." />
              ) : filteredBotGroups.map((row) => {
                const rowStatus = BOT_STATUS_LABELS_FA[String(row.status || '')] || String(row.status || '');
                const rowChannel = BOT_CHANNEL_LABELS_FA[String(row.channel_type || '')] || String(row.channel_type || '');
                const rowTitle = String(row.group_title || '').trim() || String(row.group_join_link || '').trim() || 'گروه بدون عنوان';
                const active = String(selectedBotGroupId || '') === String(row.id);
                const unreadCount = botUnreadByGroup[String(row.id)] || 0;
                return (
                  <button
                    type="button"
                    key={row.id}
                    className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${
                      active
                        ? 'bg-[rgba(var(--brand-500-rgb),0.08)] text-[rgb(var(--brand-800-rgb))] shadow-[inset_0_0_0_1px_rgba(var(--brand-500-rgb),0.12)] dark:bg-[rgba(var(--brand-500-rgb),0.12)] dark:text-white'
                        : 'hover:bg-white/80 dark:hover:bg-white/[0.055] text-gray-700 dark:text-gray-200'
                    }`}
                    onClick={() => {
                      setMobileBotSearchOpen(false);
                      setSelectedBotGroupId(String(row.id));
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar size={36} className="!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300">
                        <RobotOutlined />
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{rowTitle}</div>
                        <div className="truncate text-[11px] text-gray-400">{rowChannel} | {rowStatus}</div>
                      </div>
                      {unreadCount > 0 ? (
                        <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {toPersianNumber(String(unreadCount))}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col flex-1 min-h-0 bg-white/82 dark:bg-[#1a1518]">
          <div className="border-b border-slate-200/45 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="flex items-center gap-3">
              <Avatar size={withMobileUserRail ? 32 : 36} className="!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300">
                <RobotOutlined />
              </Avatar>
              <div className="min-w-0">
                <div className="truncate px-0.5 text-[13px] font-bold text-gray-800 dark:text-gray-100">{groupTitle}</div>
                <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">وضعیت: {statusLabel} | پلتفرم: {channelLabel}</div>
              </div>
            </div>
            {selectedGroup && (selectedGroup.customer_id || selectedGroup.supplier_id) ? (
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                طرف مرتبط:{' '}
                <Link
                  to={`/${selectedGroup.customer_id ? 'customers' : 'suppliers'}/${selectedGroup.customer_id || selectedGroup.supplier_id}`}
                  className="underline decoration-dotted underline-offset-2 text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]"
                  onClick={handleClose}
                >
                  {String(selectedGroup.counterparty_label || '').trim() || 'مشاهده رکورد'}
                </Link>
              </div>
            ) : null}
            <Input
              size="small"
              allowClear
              value={botMessageSearch}
              onChange={(event) => setBotMessageSearch(event.target.value)}
              placeholder="جستجو در پیام های این گفتگو"
              className="mt-2"
              prefix={<SearchOutlined className="text-gray-400" />}
            />
            {!canSend ? (
              <div className="mt-2 rounded-lg border border-amber-200/50 bg-amber-50/75 px-2 py-1.5 text-xs text-amber-700">
                برای فعال شدن بات، بعد از عضویت بات در گروه، یک پیام داخل همان گروه ارسال کنید.
              </div>
            ) : null}
          </div>

          <div
            ref={botMessagesScrollContainerRef}
            onScroll={handleBotMessagesScroll}
            className={`flex-1 overflow-y-auto ${withDesktopSidebar ? 'px-3 py-3' : 'px-2 py-2'} space-y-2.5 bg-[rgba(var(--brand-50-rgb),0.14)] dark:bg-black/[0.10]`}
          >
            {loadingBotMessages ? (
              <div className="space-y-3">
                <Skeleton active paragraph={{ rows: 2 }} />
                <Skeleton active paragraph={{ rows: 2 }} />
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            ) : !selectedGroup ? (
              <Empty description="یک گروه بات را انتخاب کنید." />
            ) : filteredBotMessages.length === 0 ? (
              <Empty description="پیامی برای این گروه ثبت نشده است." />
            ) : (
              filteredBotMessages.map((row) => {
                const outgoing = String(row.direction || '') === 'outbound';
                const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
                const parsedAttachments = getBotMessageAttachments(row);
                const replyToId = String(payload?.reply_to_message_id || '').trim();
                const replyTarget = replyToId ? botMessageMap.get(replyToId) : null;
                const replyAuthorName = replyTarget ? resolveBotMessageAuthor(replyTarget).name : null;
                const replyAttachments = replyTarget ? getBotMessageAttachments(replyTarget).map((item) => ({ name: item.name, url: item.url, mimeType: item.mimeType } as any)) : [];
                const body = String(row.content_text || '').trim() || (row.file_name ? `فایل: ${row.file_name}` : 'پیام بدون متن');
                const isEditing = editingBotMessageId === row.id;
                const author = resolveBotMessageAuthor(row);
                const botReadReceipts = normalizeReadReceipts(payload);
                const botMessageId = String(row.id || '').trim();
                const isPersistedBotMessage = isUuidValue(botMessageId);
                const isUnreadBotMessage = !outgoing && !isNotificationRead('bot_messages', 'counterparty_bot_message', botMessageId, seenBotMessageIds.has(botMessageId));
                return (
                  <div key={row.id}>
                    <SharedNoteCard
                      authorName={author.name}
                      createdAtLabel={safeJalaliFormat(row.created_at, 'YYYY/MM/DD HH:mm')}
                      text={body}
                      attachments={parsedAttachments.map((item) => ({ name: item.name, url: item.url, mimeType: item.mimeType } as any))}
                      avatarUrl={author.avatarUrl}
                      avatarFallback={author.fallback}
                      mentionUsers={[]}
                      mentionRoles={[]}
                      replyText={replyTarget ? String(replyTarget.content_text || '').trim() : null}
                      replyAuthorName={replyAuthorName}
                      replyAttachments={replyAttachments}
                      onReplyPreviewClick={replyTarget ? () => scrollMessageIntoView(`bot-message-${String(replyTarget.id)}`) : undefined}
                      messageDomId={`bot-message-${String(row.id)}`}
                      isMine={outgoing}
                      animateOnMount={shouldAnimateChatEntry(row.created_at)}
                      statusNode={renderReadReceiptStatus(botReadReceipts, [])}
                      unreadIndicator={isUnreadBotMessage}
                      isEdited={Boolean(payload?.is_edited)}
                      isEditing={isEditing}
                      editingValue={editingBotMessageValue}
                      onEditingChange={setEditingBotMessageValue}
                      onSaveEdit={outgoing ? async () => {
                        const nextText = String(editingBotMessageValue || '').trim();
                        if (!nextText) return;
                        await syncBotProviderMessageAction(selectedGroup, 'edit_message', row, nextText);
                        const nextPayload = {
                          ...(payload || {}),
                          is_edited: true,
                          edited_at: new Date().toISOString(),
                        };
                        const { error } = await supabase
                          .from('counterparty_bot_messages')
                          .update({
                            content_text: nextText,
                            payload: nextPayload,
                          })
                          .eq('id', row.id);
                        if (error) throw error;
                        setEditingBotMessageId(null);
                        setEditingBotMessageValue('');
                        await fetchBotMessages(selectedGroup?.id || null);
                      } : undefined}
                      onCancelEdit={() => {
                        setEditingBotMessageId(null);
                        setEditingBotMessageValue('');
                      }}
                      onReply={isPersistedBotMessage ? () => setBotReplyToId(row.id) : undefined}
                      onForward={() => openForwardModal(row, 'bot')}
                      onEdit={outgoing && isPersistedBotMessage ? () => {
                        setEditingBotMessageId(row.id);
                        setEditingBotMessageValue(String(row.content_text || '').trim());
                      } : undefined}
                      onDelete={outgoing && isPersistedBotMessage ? async () => {
                        await syncBotProviderMessageAction(selectedGroup, 'delete_message', row);
                        const { error } = await supabase.from('counterparty_bot_messages').delete().eq('id', row.id);
                        if (error) throw error;
                        await fetchBotMessages(selectedGroup?.id || null);
                      } : undefined}
                    />
                  </div>
                );
              })
            )}
          </div>
          {selectedGroup && botNewIncomingCount > 0 ? (
            <div className="pb-1 text-center">
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-slate-300/45 bg-white/95 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white dark:border-white/[0.1] dark:bg-white/[0.08] dark:text-slate-200"
                onClick={() => {
                  botShouldStickToBottomRef.current = true;
                  botForceScrollToBottomRef.current = true;
                  setBotNewIncomingCount(0);
                  markBotMessagesAsSeen(botMessages);
                  scrollBotMessagesToBottom('smooth');
                }}
              >
                +{toPersianNumber(String(botNewIncomingCount))} پیام جدید
              </button>
            </div>
          ) : null}

          <SharedNoteComposer
            value={botMessageText}
            onChange={handleBotMessageTextChange}
            onSubmit={() => void sendBotMessage()}
            submitLoading={botSending}
            placeholder={canSend ? 'پیام به گروه بات...' : 'این گروه هنوز فعال نشده است.'}
            mentionOptions={[]}
            mentionValues={[]}
            onMentionChange={() => undefined}
            mentionPickerOpen={botMentionPickerOpen}
            onToggleMentionPicker={() => setBotMentionPickerOpen((prev) => !prev)}
            attachments={botAttachments}
            linkedAttachments={botLinkedAttachments}
            onFilesSelected={(files) => {
              setBotAttachments((prev) => {
                const map = new Map(prev.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]));
                files.forEach((file) => {
                  map.set(`${file.name}-${file.size}-${file.lastModified}`, file);
                });
                return Array.from(map.values());
              });
            }}
            onRemoveAttachment={(fileName) => {
              setBotAttachments((prev) => prev.filter((file) => file.name !== fileName));
            }}
            onLinkedAttachmentsSelected={(attachments) => {
              setBotLinkedAttachments((prev) => {
                const map = new Map(prev.map((attachment) => [String(attachment.url || ''), attachment]));
                attachments.forEach((attachment) => {
                  const url = String(attachment.url || '').trim();
                  if (url) map.set(url, attachment);
                });
                return Array.from(map.values());
              });
            }}
            onRemoveLinkedAttachment={(url) => {
              setBotLinkedAttachments((prev) => prev.filter((attachment) => String(attachment.url || '') !== String(url || '')));
            }}
            filePickerModuleId={selectedBotModuleId || (selectedGroup?.target_type === 'customers' ? 'customers' : selectedGroup?.target_type === 'suppliers' ? 'suppliers' : null)}
            filePickerRecordId={selectedGroup?.target_type === 'customers' ? String(selectedGroup?.customer_id || '') : selectedGroup?.target_type === 'suppliers' ? String(selectedGroup?.supplier_id || '') : null}
            replyActive={Boolean(botReplyToId)}
            onClearReply={() => setBotReplyToId(null)}
            enableImagePasteAndDrop
            submitDisabled={!selectedGroup || !canSend || botSending || botSuggesting || (!String(botMessageText || '').trim() && botAttachments.length === 0 && botLinkedAttachments.length === 0)}
            extraActions={(
              <>
                <AiSuggestionPopoverAction
                  open={botAiPopoverOpen}
                  onOpenChange={setBotAiPopoverOpen}
                  loading={botSuggesting}
                  disabled={!selectedGroup || botSending || botSuggesting}
                  onSubmit={(instruction) => suggestBotReply(instruction)}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<SnippetsOutlined />}
                  onClick={() => openReadyTextsModal('bot')}
                />
              </>
            )}
          />
        </div>

        {withMobileUserRail ? (
          <div dir="rtl" className="w-[54px] shrink-0 overflow-hidden border-l border-slate-200/45 bg-white/60 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="flex h-full flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden px-1 py-1.5">
              <div className="sticky top-0 z-10 flex w-full justify-center">
                <Popover
                  trigger="click"
                  placement="leftTop"
                  open={mobileBotSearchOpen}
                  onOpenChange={setMobileBotSearchOpen}
                  content={(
                    <Input
                      size="small"
                      allowClear
                      autoFocus
                      value={botGroupSearch}
                      onChange={(event) => setBotGroupSearch(event.target.value)}
                      placeholder="جستجوی چت"
                      prefix={<SearchOutlined className="text-gray-400" />}
                      className="w-[170px]"
                    />
                  )}
                >
                  <Button
                    type={botGroupSearch ? 'primary' : 'default'}
                    shape="circle"
                    size="small"
                    icon={<SearchOutlined />}
                    className="shadow-sm"
                  />
                </Popover>
              </div>

              {filteredBotGroups.map((row) => {
                const rowTitle = String(row.group_title || '').trim() || String(row.group_join_link || '').trim() || 'گروه';
                const active = String(selectedBotGroupId || '') === String(row.id);
                const unreadCount = botUnreadByGroup[String(row.id)] || 0;
                return (
                  <button
                    key={`mobile-${row.id}`}
                    type="button"
                    onClick={() => {
                      setMobileBotSearchOpen(false);
                      setSelectedBotGroupId(String(row.id));
                    }}
                    className="flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors hover:bg-white/75 dark:hover:bg-white/5"
                    title={rowTitle}
                  >
                    <Badge count={unreadCount > 0 ? toPersianNumber(String(unreadCount)) : 0} size="small" offset={[-2, 2]}>
                      <Avatar
                        size={38}
                        className={`!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300 ${
                          active ? 'ring-2 ring-[rgba(var(--brand-500-rgb),0.28)] ring-offset-2 ring-offset-white dark:ring-[rgba(var(--brand-300-rgb),0.35)] dark:ring-offset-[#151113]' : ''
                        }`}
                      >
                        <RobotOutlined />
                      </Avatar>
                    </Badge>
                    <span className="line-clamp-2 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400">
                      {rowTitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderCreatedAtSortControls = (
    direction: CreatedSortDirection,
    setDirection: React.Dispatch<React.SetStateAction<CreatedSortDirection>>,
  ) => (
    <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-1 py-0.5 dark:border-gray-700 dark:bg-white/5">
      <Button
        type="text"
        size="small"
        icon={<DownOutlined />}
        className={direction === 'desc' ? '!text-[rgb(var(--brand-700-rgb))]' : '!text-gray-400'}
        onClick={() => setDirection('desc')}
      />
      <Button
        type="text"
        size="small"
        icon={<UpOutlined />}
        className={direction === 'asc' ? '!text-[rgb(var(--brand-700-rgb))]' : '!text-gray-400'}
        onClick={() => setDirection('asc')}
      />
    </div>
  );

  const renderTasksPanel = (mode: 'list' | 'grid' = 'list') => {
    const data = showMore.tasks ? filteredTasks : filteredTasks.slice(0, MAX_ITEMS);
    const relationOptionsByField = tasks.reduce<Record<string, Array<{ label: string; value: string }>>>((acc, task: any) => {
      const sourceLink = resolveTaskSourceLink(task);
      const relatedModuleId = String(sourceLink.moduleId || task?.related_to_module || '').trim();
      const relatedRecordId = String(sourceLink.recordId || '').trim();
      const fieldKey = getTaskRelationFieldKey(relatedModuleId);
      if (!fieldKey || !relatedModuleId || !relatedRecordId) return acc;

      const recordKey = buildRecordReferenceKey(relatedModuleId, relatedRecordId);
      const label = recordTitleMap[recordKey]
        || formatRecordLabel({ id: relatedRecordId, module_id: relatedModuleId }, relatedModuleId);
      if (!label) return acc;

      const current = acc[fieldKey] || [];
      if (!current.some((item) => String(item.value) === relatedRecordId)) {
        current.push({ label, value: relatedRecordId });
      }
      acc[fieldKey] = current;

      return acc;
    }, {});

    return (
      <div className="flex flex-col gap-3 h-full min-h-0">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/88 p-1 h-10 shadow-sm overflow-hidden dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.88)]">
          {renderCreatedAtSortControls(taskSortDirection, setTaskSortDirection)}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar px-1">
            {TASK_VIEW_PRESETS.map((view) => (
              <div
                key={view.key}
                onClick={() => {
                  setTaskViewKey(view.key);
                  setShowMore((prev) => ({ ...prev, tasks: false }));
                }}
                className={`group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border ${
                  taskViewKey === view.key
                    ? 'bg-leather-600 text-white border-leather-600 shadow-sm font-bold'
                    : 'bg-transparent border-transparent hover:bg-gray-100/80 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                }`}
              >
                {view.label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => navigate('/tasks/create')}
          >
            افزودن فعالیت
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingTasks ? (
            <div className="space-y-2">
              <Skeleton active paragraph={{ rows: 2 }} />
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ) : data.length === 0 ? (
            <Empty description="فعالیتی یافت نشد" />
          ) : mode === 'grid' ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {data.map((task: any) => (
                <RenderCardItem
                  key={task.id}
                  item={task}
                  moduleId="tasks"
                  moduleConfig={tasksConfig}
                  statusField="status"
                  categoryField="task_type"
                  tagsField="tags"
                  allUsers={directoryUsers}
                  allRoles={directoryRoles}
                  selectedRowKeys={[]}
                  setSelectedRowKeys={() => undefined}
                    navigate={(path) => {
                      const [, moduleId, recordId] = String(path || '').split('/');
                      if (!moduleId || !recordId) return;
                      if (moduleId === 'tasks') {
                        openTaskProcessModal({ task });
                        return;
                      }
                    openPreviewRecord(
                      moduleId,
                      recordId,
                      recordTitleMap[`${moduleId}:${recordId}`] || formatRecordLabel({ id: recordId, module_id: moduleId }, moduleId)
                    );
                  }}
                  canViewField={() => true}
                  relationOptions={relationOptionsByField}
                  hideSelection
                />
              ))}
            </div>
          ) : (
            <List
              dataSource={data}
              renderItem={(task: any) => {
                const sourceLink = resolveTaskSourceLink(task);
                const recordKey = sourceLink.moduleId && sourceLink.recordId ? `${sourceLink.moduleId}:${sourceLink.recordId}` : null;
                const recordTitle = recordKey ? recordTitleMap[recordKey] : null;
                return (
                  <TaskSummaryCard
                    task={task}
                    statusOptions={statusOptions}
                    priorityOptions={priorityOptions}
                    assigneeNameMap={assigneeNameMap}
                    roleNameMap={roleNameMap}
                    recordTitle={recordTitle}
                    onClose={handleClose}
                    onStatusChange={async (taskId, status) => {
                      const currentTask = tasks.find((row: any) => String(row?.id) === String(taskId)) || null;
                      const previousTask = currentTask ? { ...currentTask } : null;
                      setTasks((prev) => prev.map((row: any) => (
                        String(row?.id || '') === String(taskId)
                          ? { ...row, status }
                          : row
                      )));
                      try {
                        const updatedTask = await updateTaskStatusWithAutomation({
                          taskId,
                          nextStatus: status,
                          previousTask: currentTask,
                          currentUser: {
                            id: profile.id,
                            fullName: createdByNameMap[String(profile.id || '')] || null,
                          },
                        });
                        setTasks((prev) => prev.map((row: any) => (
                          row.id === taskId ? { ...row, ...updatedTask } : row
                        )));
                        lastLoadedAtRef.current.tasks = 0;
                      } catch (error) {
                        if (previousTask) {
                          setTasks((prev) => prev.map((row: any) => (
                            String(row?.id || '') === String(taskId)
                              ? { ...row, ...previousTask }
                              : row
                          )));
                        }
                        throw error;
                      }
                    }}
                    onProducedQtyChange={async (taskId, value) => {
                      await handleTaskProducedQtyChange(taskId, value);
                    }}
                    onTaskUpdated={async (updatedTask) => {
                      setTasks((prev) => prev.map((row: any) => (
                        String(row?.id || '') === String(updatedTask?.id || '')
                          ? { ...row, ...updatedTask }
                          : row
                      )));
                    }}
                    currentUser={{
                      id: profile.id,
                      fullName: createdByNameMap[String(profile.id || '')] || null,
                    }}
                  />
                );
              }}
            />
          )}
        </div>

        {filteredTasks.length > MAX_ITEMS ? (
          <Button type="link" onClick={() => setShowMore((prev) => ({ ...prev, tasks: !prev.tasks }))}>
            {showMore.tasks ? 'نمایش کمتر' : 'نمایش بیشتر'}
          </Button>
        ) : null}
      </div>
    );
  };

  const renderTasks = () => {
    const data = showMore.tasks ? filteredTasks : filteredTasks.slice(0, MAX_ITEMS);
    return (
      <div className="flex flex-col gap-3 h-full min-h-0">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/88 p-1 h-10 shadow-sm overflow-hidden dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.88)]">
          {renderCreatedAtSortControls(taskSortDirection, setTaskSortDirection)}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar px-1">
            {TASK_VIEW_PRESETS.map((view) => (
              <div
                key={view.key}
                onClick={() => {
                  setTaskViewKey(view.key);
                  setShowMore((prev) => ({ ...prev, tasks: false }));
                }}
                className={`group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border ${
                  taskViewKey === view.key
                    ? 'bg-leather-600 text-white border-leather-600 shadow-sm font-bold'
                    : 'bg-transparent border-transparent hover:bg-gray-100/80 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                }`}
              >
                {view.label}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => navigate('/tasks/create')}
          >
            افزودن فعالیت
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
        {loadingTasks ? (
          <div className="space-y-2">
            <Skeleton active paragraph={{ rows: 2 }} />
            <Skeleton active paragraph={{ rows: 2 }} />
          </div>
        ) : data.length === 0 ? (
          <Empty description="فعالیتی یافت نشد" />
        ) : (
          <List
            dataSource={data}
            renderItem={(task: any) => {
              const sourceLink = resolveTaskSourceLink(task);
              const recordKey = sourceLink.moduleId && sourceLink.recordId ? `${sourceLink.moduleId}:${sourceLink.recordId}` : null;
              const recordTitle = recordKey ? recordTitleMap[recordKey] : null;
              return (
                <TaskSummaryCard
                  task={task}
                  statusOptions={statusOptions}
                  priorityOptions={priorityOptions}
                  assigneeNameMap={assigneeNameMap}
                  roleNameMap={roleNameMap}
                  recordTitle={recordTitle}
                  onClose={handleClose}
                  onStatusChange={async (taskId, status) => {
                    const currentTask = filteredTasks.find((row: any) => String(row?.id) === String(taskId)) || null;
                    const previousTask = currentTask ? { ...currentTask } : null;
                    setTasks((prev) => prev.map((row: any) => (
                      String(row?.id || '') === String(taskId)
                        ? { ...row, status }
                        : row
                    )));
                    try {
                      const updatedTask = await updateTaskStatusWithAutomation({
                        taskId,
                        nextStatus: status,
                        previousTask: currentTask,
                        currentUser: {
                          id: profile.id,
                          fullName: createdByNameMap[String(profile.id || '')] || null,
                        },
                      });
                      setTasks((prev) => prev.map((row: any) => (
                        row.id === taskId ? { ...row, ...updatedTask } : row
                      )));
                      lastLoadedAtRef.current.tasks = 0;
                    } catch (error) {
                      if (previousTask) {
                        setTasks((prev) => prev.map((row: any) => (
                          String(row?.id || '') === String(taskId)
                            ? { ...row, ...previousTask }
                            : row
                        )));
                      }
                      throw error;
                    }
                  }}
                  onProducedQtyChange={async (taskId, value) => {
                    await handleTaskProducedQtyChange(taskId, value);
                  }}
                  onTaskUpdated={async (updatedTask) => {
                    setTasks((prev) => prev.map((row: any) => (
                      String(row?.id || '') === String(updatedTask?.id || '')
                        ? { ...row, ...updatedTask }
                        : row
                    )));
                  }}
                  currentUser={{
                    id: profile.id,
                    fullName: createdByNameMap[String(profile.id || '')] || null,
                  }}
                />
              );
            }}
          />
        )}
        </div>
        {filteredTasks.length > MAX_ITEMS && (
          <Button type="link" onClick={() => setShowMore(prev => ({ ...prev, tasks: !prev.tasks }))}>
            {showMore.tasks ? 'نمایش کمتر' : 'نمایش بیشتر'}
          </Button>
        )}
      </div>
    );
  };

  const renderResponsibilitiesPanel = (mode: 'list' | 'grid' = 'list') => {
    const data = showMore.responsibilities ? filteredResponsibilities : filteredResponsibilities.slice(0, MAX_ITEMS);

    return (
      <div className="flex flex-col gap-3 h-full min-h-0">
        {mode === 'grid' ? (
          <div className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/88 p-1 h-10 shadow-sm overflow-hidden dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.88)]">
            {renderCreatedAtSortControls(responsibilitySortDirection, setResponsibilitySortDirection)}
            <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar px-1">
              {responsibilityViews.map((view) => (
                <div
                  key={view.key}
                  onClick={() => {
                    setResponsibilityViewKey(view.key);
                    setShowMore((prev) => ({ ...prev, responsibilities: false }));
                  }}
                  className={`group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border ${
                    responsibilityViewKey === view.key
                      ? 'bg-leather-600 text-white border-leather-600 shadow-sm font-bold'
                      : 'bg-transparent border-transparent hover:bg-gray-100/80 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {view.label}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {loadingResponsibilities ? (
          <div className="space-y-2">
            <Skeleton active paragraph={{ rows: 3 }} />
            <Skeleton active paragraph={{ rows: 3 }} />
          </div>
        ) : data.length === 0 ? (
          <Empty description="مسئولیتی یافت نشد" />
        ) : mode === 'grid' ? (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {data.map((item: any) => {
                const moduleConfig = MODULES[item.module_id];
                if (!moduleConfig) return null;
                const { imageField, tagsField, statusField, categoryField } = getModuleCardFields(moduleConfig);
                return (
                  <RenderCardItem
                    key={`${item.module_id}:${item.id}`}
                    item={item}
                    moduleId={item.module_id}
                    moduleConfig={moduleConfig}
                    imageField={imageField}
                    tagsField={tagsField}
                    statusField={statusField}
                    categoryField={categoryField}
                    allUsers={directoryUsers}
                    allRoles={directoryRoles}
                    selectedRowKeys={[]}
                    setSelectedRowKeys={() => undefined}
                    navigate={(path) => {
                      const [, moduleId, recordId] = String(path || '').split('/');
                      if (!moduleId || !recordId) return;
                      openPreviewRecord(
                        moduleId,
                        recordId,
                        recordTitleMap[`${moduleId}:${recordId}`] || formatRecordLabel({ ...item, id: recordId, module_id: moduleId }, moduleId)
                      );
                    }}
                    canViewField={() => true}
                    hideSelection
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <List
            dataSource={data}
            renderItem={(item: any) => {
              const recordKey = `${item.module_id}:${item.id}`;
              const title = recordTitleMap[recordKey] || formatRecordLabel(item, item.module_id);
              const moduleConfig = MODULES[item.module_id];
              const statusField = moduleConfig?.fields?.find((f: any) => f.key === 'status');
              const categoryField = moduleConfig?.fields?.find((f: any) => f.key === 'category');
              const statusLabel = resolveOptionLabel(item.status, statusField?.options) || resolveStatusLabelFallback(item.status);
              const categoryLabel = resolveOptionLabel(item.category, categoryField?.options);
              const assigneeLabel = item.assignee_type === 'role'
                ? (roleNameMap[String(getResolvedAssigneeId(item) || '')] || 'نقش')
                : (assigneeNameMap[String(getResolvedAssigneeId(item) || '')] || 'کاربر');
              const createdById = item.created_by || item.created_by_id;
              const createdByLabel = createdById ? (createdByNameMap[createdById] || createdById) : null;
              return (
                <div className="mb-2">
                  <div className="rounded-xl border border-gray-200/80 bg-white/92 p-3 shadow-sm dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.72)]">
                    <div className="text-xs text-gray-500 mb-2">{item.module_title}</div>
                    <Link to={`/${item.module_id}/${item.id}`} className="text-sm text-gray-800 dark:text-gray-200" onClick={handleClose}>
                      {title}
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {categoryLabel ? (
                        <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                          {categoryLabel}
                        </span>
                      ) : null}
                      {statusLabel ? (
                        <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                          {statusLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        {item.assignee_type === 'role' ? <TeamOutlined /> : <UserOutlined />}
                        {assigneeLabel}
                      </span>
                      <span>{safeJalaliFormat(item.created_at, 'YYYY/MM/DD HH:mm')}</span>
                    </div>
                    {createdByLabel ? (
                      <div className="text-[11px] text-gray-400 mt-1">
                        ایجاد کننده: {createdByLabel}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            }}
          />
        )}

        {filteredResponsibilities.length > MAX_ITEMS ? (
          <Button type="link" onClick={() => setShowMore((prev) => ({ ...prev, responsibilities: !prev.responsibilities }))}>
            {showMore.responsibilities ? 'نمایش کمتر' : 'نمایش بیشتر'}
          </Button>
        ) : null}
      </div>
    );
  };

  const renderResponsibilities = () => {
    const data = showMore.responsibilities ? filteredResponsibilities : filteredResponsibilities.slice(0, MAX_ITEMS);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/88 p-1 h-10 shadow-sm overflow-hidden dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.88)]">
          {renderCreatedAtSortControls(responsibilitySortDirection, setResponsibilitySortDirection)}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar px-1">
            {responsibilityViews.map((view) => (
              <div
                key={view.key}
                onClick={() => {
                  setResponsibilityViewKey(view.key);
                  setShowMore((prev) => ({ ...prev, responsibilities: false }));
                }}
                className={`group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border ${
                  responsibilityViewKey === view.key
                    ? 'bg-leather-600 text-white border-leather-600 shadow-sm font-bold'
                    : 'bg-transparent border-transparent hover:bg-gray-100/80 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                }`}
              >
                {view.label}
              </div>
            ))}
          </div>
        </div>
        {loadingResponsibilities ? (
          <div className="space-y-2">
            <Skeleton active paragraph={{ rows: 3 }} />
            <Skeleton active paragraph={{ rows: 3 }} />
          </div>
        ) : data.length === 0 ? (
          <Empty description="مسئولیتی یافت نشد" />
        ) : (
          <List
            dataSource={data}
            renderItem={(item: any) => {
              const recordKey = `${item.module_id}:${item.id}`;
              const title = recordTitleMap[recordKey] || formatRecordLabel(item, item.module_id);
              const moduleConfig = MODULES[item.module_id];
              const statusField = moduleConfig?.fields?.find((f: any) => f.key === 'status');
              const categoryField = moduleConfig?.fields?.find((f: any) => f.key === 'category');
              const statusLabel = resolveOptionLabel(item.status, statusField?.options) || resolveStatusLabelFallback(item.status);
              const categoryLabel = resolveOptionLabel(item.category, categoryField?.options);
              const assigneeLabel = item.assignee_type === 'role'
                ? (roleNameMap[String(getResolvedAssigneeId(item) || '')] || 'نقش')
                : (assigneeNameMap[String(getResolvedAssigneeId(item) || '')] || 'کاربر');
              const createdById = item.created_by || item.created_by_id;
              const createdByLabel = createdById ? (createdByNameMap[createdById] || createdById) : null;
              return (
                <div className="mb-2">
                  <div className="rounded-xl border border-gray-200/80 bg-white/92 p-3 shadow-sm dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.72)]">
                    <div className="text-xs text-gray-500 mb-2">{item.module_title}</div>
                    <Link to={`/${item.module_id}/${item.id}`} className="text-sm text-gray-800 dark:text-gray-200" onClick={handleClose}>
                      {title}
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {categoryLabel && (
                        <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                          {categoryLabel}
                        </span>
                      )}
                      {statusLabel && (
                        <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                          {statusLabel}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        {item.assignee_type === 'role' ? <TeamOutlined /> : <UserOutlined />}
                        {assigneeLabel}
                      </span>
                      <span>{safeJalaliFormat(item.created_at, 'YYYY/MM/DD HH:mm')}</span>
                    </div>
                    {createdByLabel && (
                      <div className="text-[11px] text-gray-400 mt-1">
                        ایجاد کننده: {createdByLabel}
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />
        )}
        {filteredResponsibilities.length > MAX_ITEMS && (
          <Button type="link" onClick={() => setShowMore(prev => ({ ...prev, responsibilities: !prev.responsibilities }))}>
            {showMore.responsibilities ? 'نمایش کمتر' : 'نمایش بیشتر'}
          </Button>
        )}
      </div>
    );
  };

  const contentDesktop = (
    <div className="w-[880px] max-w-[90vw] h-[90vh] p-4">
      <div className="grid grid-cols-3 gap-4 h-full min-h-0">
      <div className="flex flex-col border border-[rgba(var(--brand-300-rgb),0.35)] dark:border-[rgba(var(--brand-300-rgb),0.22)] rounded-2xl bg-[rgba(var(--brand-50-rgb),0.62)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.62)] h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 z-10 bg-[rgba(var(--brand-100-rgb),0.85)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.95)] border-b border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.18)]">
          <div className="font-bold text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]"> یادداشت‌ها</div>
          <Badge count={formatBadgeCount(notesCount)} color={badgeColor} />
        </div>
        {renderNotes()}
      </div>
      <div className="flex flex-col border border-[rgba(var(--brand-300-rgb),0.35)] dark:border-[rgba(var(--brand-300-rgb),0.22)] rounded-2xl bg-[rgba(var(--brand-50-rgb),0.62)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.62)] h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 z-10 bg-[rgba(var(--brand-100-rgb),0.85)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.95)] border-b border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.18)]">
          <div className="font-bold text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]">فعالیت های من</div>
          <Badge count={formatBadgeCount(tasksCount)} color={badgeColor} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {renderTasks()}
        </div>
      </div>
      <div className="flex flex-col border border-[rgba(var(--brand-300-rgb),0.35)] dark:border-[rgba(var(--brand-300-rgb),0.22)] rounded-2xl bg-[rgba(var(--brand-50-rgb),0.62)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.62)] h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 z-10 bg-[rgba(var(--brand-100-rgb),0.85)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.95)] border-b border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.18)]">
          <div className="font-bold text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]">مسئولیت‌های من</div>
          <Badge count={formatBadgeCount(responsibilitiesCount)} color={badgeColor} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {renderResponsibilities()}
        </div>
      </div>
      </div>
    </div>
  );

  const contentMobile = (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-[rgb(var(--app-dark-surface-rgb))]">
      <Tabs
        activeKey={mobileActiveKey}
        onChange={(key) => setMobileActiveKey(key as DrawerTabKey)}
        className="h-full min-h-0 [&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-content-holder]:h-full [&_.ant-tabs-content-holder]:min-h-0 [&_.ant-tabs-content]:h-full [&_.ant-tabs-content]:min-h-0 [&_.ant-tabs-tabpane]:h-full [&_.ant-tabs-tabpane]:min-h-0"
        items={[
          {
            key: 'notes',
            label: <Badge count={formatBadgeCount(notesCount)} color={badgeColor}><span className="px-1">پیام‌ها</span></Badge>,
            children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderNotes()}</div>,
          },
          {
            key: 'tasks',
            label: <Badge count={formatBadgeCount(tasksCount)} color={badgeColor}>فعالیت های من</Badge>,
            children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderTasks()}</div>,
          },
          {
            key: 'responsibilities',
            label: <Badge count={formatBadgeCount(responsibilitiesCount)} color={badgeColor}>مسئولیت‌های من</Badge>,
            children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderResponsibilities()}</div>,
          },
          {
            key: 'bot_messages',
            label: <Badge count={formatBadgeCount(botMessagesCount)} color={badgeColor}>پیام‌های بات</Badge>,
            children: <div className="h-full min-h-0 flex flex-col overflow-hidden p-2">{renderBotMessagesPanel('mobile')}</div>,
          },
          {
            key: 'sms_messages',
            label: <Badge count={formatBadgeCount(smsMessagesCount)} color={badgeColor}>پیامک‌ها</Badge>,
            children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderSmsMessagesPanel('mobile')}</div>,
          },
        ]}
      />
    </div>
  );

  const desktopModernItems = variant === 'chat'
    ? [
      {
        key: 'notes',
        label: <Badge count={formatBadgeCount(notesCount)} color={badgeColor}><span className="px-1">پیام‌های داخلی</span></Badge>,
        children: <div className="h-[calc(90vh-120px)] flex flex-col overflow-hidden">{renderNotesPanel('desktop')}</div>,
      },
      {
        key: 'bot_messages',
        label: <Badge count={formatBadgeCount(botMessagesCount)} color={badgeColor}>پیام‌های بات</Badge>,
        children: <div className="h-[calc(90vh-120px)] flex flex-col overflow-hidden">{renderBotMessagesPanel('desktop')}</div>,
      },
      {
        key: 'sms_messages',
        label: <Badge count={formatBadgeCount(smsMessagesCount)} color={badgeColor}>پیامک‌ها</Badge>,
        children: <div className="h-[calc(90vh-120px)] flex flex-col overflow-hidden">{renderSmsMessagesPanel('desktop')}</div>,
      },
      {
        key: 'voip_calls',
        label: <Badge count={formatBadgeCount(voipCallsCount)} color={badgeColor}>تماس‌ها</Badge>,
        children: <div className="h-[calc(90vh-120px)] flex flex-col overflow-hidden">{renderVoipCallsPanel('desktop')}</div>,
      },
      {
        key: 'assistant',
        label: <span className="px-1">هوش مصنوعی</span>,
        children: (
          <div className="h-[calc(90vh-120px)] flex flex-col overflow-hidden">
            <AssistantPanel active={open && desktopActiveKey === 'assistant'} />
          </div>
        ),
      },
    ]
    : [
      {
        key: 'tasks',
        label: <Badge count={formatBadgeCount(tasksCount)} color={badgeColor}>فعالیت‌های من</Badge>,
        children: <div className="h-[calc(90vh-120px)] flex flex-col overflow-hidden px-3 pb-3">{renderTasksPanel('grid')}</div>,
      },
      {
        key: 'responsibilities',
        label: <Badge count={formatBadgeCount(responsibilitiesCount)} color={badgeColor}>مسئولیت‌های من</Badge>,
        children: <div className="h-[calc(90vh-120px)] flex flex-col overflow-hidden px-3 pb-3">{renderResponsibilitiesPanel('grid')}</div>,
      },
    ];

  const contentDesktopModern = (
    <div className="w-[780px] max-w-[88vw] h-[90vh] p-3">
      <div className={`h-full rounded-xl overflow-hidden shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_44px_rgba(0,0,0,0.24)] ${
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
    </div>
  );

  const mobileModernItems = variant === 'chat'
    ? [
      {
        key: 'notes',
        label: <Badge count={formatBadgeCount(notesCount)} color={badgeColor}><span className="px-1">پیام‌های داخلی</span></Badge>,
        children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderNotesPanel('mobile')}</div>,
      },
      {
        key: 'bot_messages',
        label: <Badge count={formatBadgeCount(botMessagesCount)} color={badgeColor}>پیام‌های بات</Badge>,
        children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderBotMessagesPanel('mobile')}</div>,
      },
      {
        key: 'sms_messages',
        label: <Badge count={formatBadgeCount(smsMessagesCount)} color={badgeColor}>پیامک‌ها</Badge>,
        children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderSmsMessagesPanel('mobile')}</div>,
      },
      {
        key: 'voip_calls',
        label: <Badge count={formatBadgeCount(voipCallsCount)} color={badgeColor}>تماس‌ها</Badge>,
        children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderVoipCallsPanel('mobile')}</div>,
      },
      {
        key: 'assistant',
        label: <span className="px-1">هوش مصنوعی</span>,
        children: (
          <div className="h-full min-h-0 flex flex-col overflow-hidden">
            <AssistantPanel active={open && mobileActiveKey === 'assistant'} />
          </div>
        ),
      },
    ]
    : [
      {
        key: 'tasks',
        label: <Badge count={formatBadgeCount(tasksCount)} color={badgeColor}>فعالیت‌های من</Badge>,
        children: <div className="h-full min-h-0 flex flex-col overflow-hidden px-2 pb-2">{renderTasksPanel('grid')}</div>,
      },
      {
        key: 'responsibilities',
        label: <Badge count={formatBadgeCount(responsibilitiesCount)} color={badgeColor}>مسئولیت‌های من</Badge>,
        children: <div className="h-full min-h-0 flex flex-col overflow-hidden px-2 pb-2">{renderResponsibilitiesPanel('grid')}</div>,
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
  void contentDesktop;
  void contentMobile;

  const drawerContainer = typeof document === 'undefined' ? undefined : () => document.body;
  const triggerIcon = variant === 'chat'
    ? <MessageOutlined className="text-gray-500 dark:text-gray-400" />
    : <BellOutlined className="text-gray-500 dark:text-gray-400" />;
  const mobileDrawerTitle = variant === 'chat' ? 'ارتباطات' : 'اعلانات';
  const desktopDrawerTitle = variant === 'chat' ? 'ارتباطات' : 'اعلانات';

  return (
    <>
      <Badge count={formatBadgeCount(totalCount)} size="small" color={badgeColor}>
        <Button
          type="text"
          shape="circle"
          icon={triggerIcon}
          onClick={() => setOpen(true)}
        />
      </Badge>

      {isMobile ? (
        <Drawer
          title={(
            <div className="flex items-center justify-between w-full pr-2">
              <span className="text-white">{mobileDrawerTitle}</span>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined spin={refreshing} className="text-white" />}
                onClick={handleManualRefresh}
              />
            </div>
          )}
          placement="top"
          height="var(--app-viewport-height, 100dvh)"
          open={open}
          onClose={requestDrawerClose}
          forceRender
          destroyOnHidden={false}
          getContainer={drawerContainer}
          rootStyle={{ position: 'fixed', inset: 0 }}
          zIndex={1500}
          rootClassName="notifications-drawer"
          styles={{ body: mobileDrawerBodyStyle, header: drawerHeaderStyle, content: drawerContentStyle }}
          closeIcon={<CloseOutlined className="text-white" />}
        >
          {contentMobileModern}
        </Drawer>
      ) : (
        <Drawer
          title={(
            <div className="flex items-center justify-between w-full pr-2">
              <span className="text-white">{desktopDrawerTitle}</span>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined spin={refreshing} className="text-white" />}
                onClick={handleManualRefresh}
              />
            </div>
          )}
          placement="left"
          width={800}
          open={open}
          onClose={handleClose}
          forceRender
          destroyOnHidden={false}
          getContainer={drawerContainer}
          rootStyle={{ position: 'fixed', inset: 0 }}
          zIndex={1500}
          rootClassName="notifications-drawer"
          styles={{ body: desktopDrawerBodyStyle, header: drawerHeaderStyle, content: drawerContentStyle }}
          closeIcon={<CloseOutlined className="text-white" />}
        >
          {contentDesktopModern}
        </Drawer>
      )}
      {previewRecord ? (
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
      ) : null}
      {taskProcessTarget ? (
        <div className="hidden" aria-hidden="true">
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
        </div>
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





