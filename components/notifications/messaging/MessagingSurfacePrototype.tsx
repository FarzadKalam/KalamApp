import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AudioOutlined,
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  CommentOutlined,
  CopyOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileAddOutlined,
  FileImageOutlined,
  LinkOutlined,
  LikeOutlined,
  MenuOutlined,
  InfoCircleOutlined,
  MessageOutlined,
  PaperClipOutlined,
  PhoneOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SearchOutlined,
  SendOutlined,
  SnippetsOutlined,
  SoundOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { App, Avatar, Badge, Button, Checkbox, Input, Modal, Select, Spin, Tag, Tooltip } from 'antd';
import { BOT_CHANNEL_LABELS_FA, BOT_CHANNELS, getBotPlatformAvatarSrc, isBotTargetModuleId, type BotTargetModuleId } from '../../../utils/botPlatform';
import { safeJalaliFormat, toPersianNumber } from '../../../utils/persianNumberFormatter';
import { MODULES } from '../../../moduleRegistry';
import { useMessagingOmniLiveData } from './useMessagingOmniLiveData';
import PhoneMatchPickerModal from '../PhoneMatchPickerModal';
import VoipRecordingPlayer from '../VoipRecordingPlayer';
import { supabase } from '../../../supabaseClient';
import {
  buildPhoneTargetDisplayName,
  MANUAL_PHONE_BINDING_SOURCE_FIELD,
  MANUAL_PHONE_BINDING_SOURCE_TABLE,
  PHONE_BIND_TARGET_MODULES,
  searchPhoneBindingTargets,
  syncPhoneIdentityBinding,
  type PhoneBindTargetModuleId,
} from '../../../utils/phoneIdentityBindings';
import { syncBotDirectChatIdForTarget } from '../../../utils/botIdentityBindings';
import { toFaErrorMessage } from '../../../utils/errorMessageFa';
import { sendSmsViaGateway } from '../../../utils/smsGateway';
import SharedNoteComposer from '../../notes/SharedNoteComposer';
import { fetchAssigneeDirectory, type AssigneeDirectory } from '../../../utils/referenceData';
import { isMissingColumnError, isMissingTableLikeError } from '../../../utils/notificationAssigneeHelpers';
import { parseNoteContent, serializeNoteContent, type NoteAttachment } from '../../../utils/noteContent';
import { ensureNoteAttachmentShortcuts, uploadNoteAttachments } from '../../../utils/noteAttachments';
import { insertNotesWithFallback, sendNoteSmsNotifications } from '../../../utils/noteDispatch';
import { shortenAttachmentsForExternalShare } from '../../../utils/fileShortLinks';
import { buildRecordReferenceKey, fetchRecordReferenceLabels } from '../../../utils/recordReference';
import { likeReceiptMapFromBox, readReceiptMapFromBox } from '../../../utils/messageReceipts';
import { buildClientFallbackSystemCode, supportsSystemCode } from '../../../utils/systemCode';
import { buildTaskSourceInitialValues, normalizeTaskSourceValues } from '../../../utils/taskMeta';
import { attachTaskCompletionIfNeeded } from '../../../utils/taskCompletion';
import { buildMessageActivityDescription, buildMessageActivityTitle, filterUsableMessageAttachments } from '../../../utils/messageActivity';
import { createFileManagerShortcut } from '../../../utils/fileManagerService';
import { syncRecordTags } from '../../../utils/recordTags';
import { insertRecordActivity } from '../../../utils/recordActivity';
import { runWorkflowsForEvent } from '../../../utils/workflowRuntime';
import { loadScopedCompanySettings } from '../../../utils/companySettings';
import { extractBotMessageAttachments } from '../../../utils/messageAttachments';
import { sendBotMessageViaGateway, sendCounterpartyBotGroupMessage, type BotChannel } from '../../../utils/botGateway';
import { useOptionalNotificationRuntime } from '../NotificationRuntimeProvider';
import { useNotificationConversationList } from '../../../hooks/useNotificationConversationList';
import { useInternalConversationTimeline } from '../../../hooks/useInternalConversationTimeline';
import {
  CHAT_GROUP_PREFIX,
  MY_NOTES_CONVERSATION_KEY,
  SYSTEM_MESSAGES_USER_ID,
  buildDirectConversationKey,
  getChatGroupSelectionId,
  resolveConversationSelection,
} from '../../../utils/notificationConversationKeys';
import type { NotificationConversationSummary } from '../../../utils/notificationConversationRpc';
import ProfileAvatar from '../../common/ProfileAvatar';
import ResilientImage from '../../common/ResilientImage';
import FileExtensionTile from '../../files/FileExtensionTile';

const ForwardMessageModalRuntime = React.lazy(() => import('../ForwardMessageModalRuntime'));
const SmartForm = React.lazy(() => import('../../SmartForm'));
const MessageComposerModal = React.lazy(() => import('../../MessageComposerModal'));
const BotChatIdentityBindModal = React.lazy(() => import('../BotChatIdentityBindModal'));

type ChannelKind = 'internal' | 'bot_group' | 'bot_direct' | 'sms' | 'call';
type EventKind = 'message' | 'sms' | 'call';
type AttachmentKind = 'image' | 'file' | 'video' | 'audio';

type ConversationAction =
  | 'search'
  | 'attach'
  | 'mention'
  | 'reply'
  | 'forward'
  | 'ready_text'
  | 'activity'
  | 'bind'
  | 'record'
  | 'receipt'
  | 'recording'
  | 'report'
  | 'call';

type Conversation = {
  key: string;
  channel: ChannelKind;
  sourceConversationKey?: string;
  internalKind?: 'direct' | 'group' | 'saved' | 'system';
  readOnly?: boolean;
  avatarUrl?: string | null;
  title: string;
  subtitle: string;
  preview: string;
  time: string;
  lastActivityAt?: string | null;
  unread: number;
  tone: string;
  avatarText: string;
  status: string;
  actions: ConversationAction[];
  platform?: 'rubika' | 'telegram' | 'bale';
  relatedModuleId?: string;
  relatedRecordId?: string;
  relatedRecordTitle?: string;
  relatedScope?: 'record' | 'module' | 'page';
  relatedLabelPrefix?: string;
  phone?: string;
  phoneNumberId?: string | null;
  phoneMatchStatus?: string | null;
};

type TimelineEvent = {
  id: string;
  conversationKey: string;
  sourceRow?: any;
  kind: EventKind;
  direction: 'inbound' | 'outbound' | 'system';
  author: string;
  text: string;
  time: string;
  status?: string;
  attachments?: Array<{ name: string; kind: AttachmentKind; url?: string | null; mimeType?: string | null }>;
  mentionUsers?: string[];
  mentionRoles?: string[];
  avatarUrl?: string | null;
  botSenderChannel?: BotChannel | null;
  botSenderChatId?: string | null;
  botSenderDisplayName?: string | null;
  botSenderUsername?: string | null;
  botSenderPhoneNumber?: string | null;
  botSenderBound?: boolean;
  unread?: boolean;
  liked?: boolean;
  seenAt?: string;
  replyTo?: string | null;
  replyPreviewAuthor?: string | null;
  replyPreviewText?: string | null;
  replyPreviewAttachments?: Array<{ name: string; kind: AttachmentKind; url?: string | null; mimeType?: string | null }>;
  relatedRecordLabel?: string;
  callDirection?: 'incoming' | 'outgoing';
  caller?: string;
  responder?: string;
  callType?: string;
};

type ComposerSendPayload = {
  text: string;
  mentionValues?: string[];
  attachments?: File[];
  linkedAttachments?: NoteAttachment[];
  replyTo?: string | null;
  smsNotificationEnabled?: boolean;
};

type MessagingSurfacePrototypeProps = {
  initialFilter?: ChannelKind | 'all';
  initialConversationKey?: string | null;
};

const emptyConversation: Conversation = {
  key: '__empty_messaging_v2',
  channel: 'internal',
  internalKind: 'system',
  readOnly: true,
  title: 'پیام‌رسانی',
  subtitle: 'در حال آماده‌سازی گفتگوها',
  preview: '',
  time: '',
  unread: 0,
  tone: 'bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-slate-200',
  avatarText: 'پ',
  status: 'در حال بارگذاری',
  actions: ['search'],
};

const channelMeta: Record<ChannelKind, { label: string; icon: React.ReactNode; color: string }> = {
  internal: { label: 'داخلی', icon: <TeamOutlined />, color: 'brand' },
  bot_group: { label: 'گروه بات', icon: <RobotOutlined />, color: 'gold' },
  bot_direct: { label: 'پیام شخصی بات', icon: <UserOutlined />, color: 'purple' },
  sms: { label: 'پیامک', icon: <MessageOutlined />, color: 'blue' },
  call: { label: 'تماس', icon: <PhoneOutlined />, color: 'red' },
};

const primaryActionLabels: Record<ConversationAction, string> = {
  search: 'جستجو',
  attach: 'پیوست',
  mention: 'اشاره',
  reply: 'پاسخ',
  forward: 'هدایت',
  ready_text: 'متن آماده',
  activity: 'ایجاد فعالیت',
  bind: 'اتصال مخاطب',
  record: 'رکورد مرتبط',
  receipt: 'وضعیت خوانده‌شدن',
  recording: 'پخش ضبط تماس',
  report: 'گزارش تماس',
  call: 'تماس',
};

const actionIcons: Record<ConversationAction, React.ReactNode> = {
  search: <SearchOutlined />,
  attach: <PaperClipOutlined />,
  mention: <CommentOutlined />,
  reply: <CommentOutlined />,
  forward: <SendOutlined />,
  ready_text: <SnippetsOutlined />,
  activity: <FileAddOutlined />,
  bind: <LinkOutlined />,
  record: <EyeOutlined />,
  receipt: <CheckCircleOutlined />,
  recording: <AudioOutlined />,
  report: <FileAddOutlined />,
  call: <PhoneOutlined />,
};

const channelFilters: Array<{ key: ChannelKind | 'all'; label: string; icon: React.ReactNode }> = [
  { key: 'all', label: 'همه', icon: <MessageOutlined /> },
  { key: 'internal', label: 'داخلی', icon: channelMeta.internal.icon },
  { key: 'bot_group', label: 'گروه بات', icon: channelMeta.bot_group.icon },
  { key: 'bot_direct', label: 'پی‌وی بات', icon: channelMeta.bot_direct.icon },
  { key: 'sms', label: 'پیامک', icon: channelMeta.sms.icon },
  { key: 'call', label: 'تماس', icon: channelMeta.call.icon },
];

const formatBadgeCount = (value: number) => (value > 0 ? toPersianNumber(String(value)) : 0);
const getNumericBadgeCount = (value: number) => (value > 0 ? toPersianNumber(String(value)) : undefined);

const getConversationActivityMs = (conversation: Conversation) => {
  const raw = String(conversation.lastActivityAt || '').trim();
  if (!raw) return 0;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : 0;
};

const sortConversationsByActivity = (items: Conversation[]) =>
  items.slice().sort((left, right) => getConversationActivityMs(right) - getConversationActivityMs(left));

const applyLocalReadThrough = (conversation: Conversation, readThroughByKey: Record<string, string>): Conversation => {
  const readThrough = String(readThroughByKey[conversation.key] || '').trim();
  if (!readThrough || !conversation.unread) return conversation;
  const readThroughMs = new Date(readThrough).getTime();
  const activityMs = getConversationActivityMs(conversation);
  if (!Number.isFinite(readThroughMs)) return conversation;
  if (!activityMs || activityMs <= readThroughMs) return { ...conversation, unread: 0 };
  return conversation;
};

const getEventActivityAt = (item: TimelineEvent) => (
  String(
    item.sourceRow?.created_at
    || item.sourceRow?.message_at
    || item.sourceRow?.started_at
    || item.sourceRow?.received_at
    || item.sourceRow?.sent_at
    || '',
  ).trim()
);

const LIVE_INTERNAL_PREFIX = 'live:internal:';

const getLiveInternalConversationKey = (conversationKey: string) => `${LIVE_INTERNAL_PREFIX}${conversationKey}`;

const getInternalSourceConversationKey = (key?: string | null) => {
  const normalized = String(key || '').trim();
  return normalized.startsWith(LIVE_INTERNAL_PREFIX) ? normalized.slice(LIVE_INTERNAL_PREFIX.length) : null;
};

const getInternalConversationKind = (summary: NotificationConversationSummary): Conversation['internalKind'] => {
  const key = String(summary?.conversation_key || '').trim();
  const kind = String(summary?.kind || '').trim();
  if (key === MY_NOTES_CONVERSATION_KEY) return 'saved';
  if (key === 'system' || kind === 'system') return 'system';
  if (key.startsWith(CHAT_GROUP_PREFIX) || kind === 'group') return 'group';
  return 'direct';
};

const getInternalConversationTitle = (summary: NotificationConversationSummary) => {
  const internalKind = getInternalConversationKind(summary);
  if (internalKind === 'saved') return 'یادداشت‌های من';
  if (internalKind === 'system') return 'پیام‌های سیستم';
  return String(summary?.title || summary?.counterparty_label || '').trim() || 'گفتگوی داخلی';
};

const getInternalConversationSubtitle = (summary: NotificationConversationSummary) => {
  const internalKind = getInternalConversationKind(summary);
  if (internalKind === 'saved') return 'Saved Messages';
  if (internalKind === 'system') return 'اعلان‌ها و پیام‌های سیستمی';
  if (internalKind === 'group') return String(summary?.subtitle || summary?.role_label || '').trim() || 'گروه داخلی';
  return String(summary?.role_label || summary?.subtitle || '').trim() || 'پیام مستقیم داخلی';
};

const buildInternalLiveConversations = (summaries: NotificationConversationSummary[] | null | undefined): Conversation[] =>
  (summaries || [])
    .filter((summary) => String(summary?.section || '').trim() === 'notes')
    .map((summary) => {
      const sourceConversationKey = String(summary?.conversation_key || '').trim();
      const internalKind = getInternalConversationKind(summary);
      const title = getInternalConversationTitle(summary);
      const subtitle = getInternalConversationSubtitle(summary);
      const latestAt = String(summary?.latest_message_at || '').trim();
      return {
        key: getLiveInternalConversationKey(sourceConversationKey),
        sourceConversationKey,
        internalKind,
        readOnly: internalKind === 'system',
        avatarUrl: summary?.avatar_url || null,
        channel: 'internal' as const,
        title,
        subtitle,
        preview: String(summary?.last_message_preview || '').trim() || (internalKind === 'system' ? 'پیام‌های سیستم' : 'گفتگوی داخلی'),
        time: latestAt ? safeJalaliFormat(latestAt, 'MM/DD HH:mm') || '' : '',
        lastActivityAt: latestAt || null,
        unread: Number(summary?.unread_count || 0),
        tone: internalKind === 'system'
          ? 'bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-slate-200'
          : internalKind === 'saved'
            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
        avatarText: internalKind === 'saved' ? 'م' : internalKind === 'system' ? 'س' : (title.slice(0, 1) || 'د'),
        status: internalKind === 'saved' ? 'ذخیره‌شده' : internalKind === 'system' ? 'سیستمی' : internalKind === 'group' ? 'گروه داخلی' : 'پیام مستقیم',
        actions: internalKind === 'system'
          ? ['search']
          : ['search', 'attach', 'mention', 'reply', 'forward', 'ready_text', 'activity', 'receipt'],
      };
    });

const ensureInternalSpecialConversations = (items: Conversation[], enabled: boolean, systemAvatarUrl?: string | null): Conversation[] => {
  if (!enabled) return items;
  const next = items.map((conversation) => (
    conversation.internalKind === 'system' || conversation.sourceConversationKey === 'system'
      ? { ...conversation, avatarUrl: systemAvatarUrl || conversation.avatarUrl || null }
      : conversation
  ));
  const hasSaved = next.some((conversation) => conversation.internalKind === 'saved' || conversation.sourceConversationKey === MY_NOTES_CONVERSATION_KEY);
  const hasSystem = next.some((conversation) => conversation.internalKind === 'system' || conversation.sourceConversationKey === 'system');
  if (!hasSaved) {
    next.push({
      key: getLiveInternalConversationKey(MY_NOTES_CONVERSATION_KEY),
      channel: 'internal',
      sourceConversationKey: MY_NOTES_CONVERSATION_KEY,
      internalKind: 'saved',
      title: 'یادداشت‌های من',
      subtitle: 'Saved Messages',
      preview: 'پیام‌های ذخیره‌شده',
      time: '',
      lastActivityAt: null,
      unread: 0,
      tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200',
      avatarText: 'م',
      status: 'ذخیره‌شده',
      actions: ['search', 'attach', 'reply', 'forward', 'ready_text', 'activity'],
    });
  }
  if (!hasSystem) {
    next.push({
      key: getLiveInternalConversationKey('system'),
      channel: 'internal',
      sourceConversationKey: 'system',
      internalKind: 'system',
      readOnly: true,
      title: 'پیام‌های سیستم',
      subtitle: 'اعلان‌ها و پیام‌های سیستمی',
      preview: 'اعلان‌های گردش کارها و اتوماسیون‌ها',
      time: '',
      lastActivityAt: null,
      unread: 0,
      tone: 'bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-slate-200',
      avatarText: 'س',
      avatarUrl: systemAvatarUrl || null,
      status: 'سیستمی',
      actions: ['search'],
    });
  }
  return next;
};

const mergeDirectoryDirectConversations = (
  items: Conversation[],
  users: AssigneeDirectory['users'],
  currentUserId: string,
  roleLookup: Record<string, string>,
): Conversation[] => {
  const normalizedCurrentUserId = String(currentUserId || '').trim();
  if (!normalizedCurrentUserId) return items;
  const next = [...items];
  const existingSourceKeys = new Set(next.map((conversation) => String(conversation.sourceConversationKey || '').trim()).filter(Boolean));
  users.forEach((user) => {
    const userId = String(user?.id || '').trim();
    if (!userId || userId === normalizedCurrentUserId) return;
    const sourceConversationKey = buildDirectConversationKey(normalizedCurrentUserId, userId);
    if (!sourceConversationKey || existingSourceKeys.has(sourceConversationKey)) return;
    existingSourceKeys.add(sourceConversationKey);
    const title = String(user.display_name || user.full_name || '').trim() || 'کاربر سازمان';
    const roleLabel = String(user.job_title || roleLookup[String(user.role_id || '')] || '').trim();
    next.push({
      key: getLiveInternalConversationKey(sourceConversationKey),
      channel: 'internal',
      sourceConversationKey,
      internalKind: 'direct',
      avatarUrl: user.avatar_url || null,
      title,
      subtitle: roleLabel || 'پیام مستقیم داخلی',
      preview: 'شروع گفتگوی داخلی',
      time: '',
      lastActivityAt: null,
      unread: 0,
      tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
      avatarText: title.slice(0, 1) || 'د',
      status: roleLabel || 'پیام مستقیم',
      actions: ['search', 'attach', 'mention', 'reply', 'forward', 'ready_text', 'activity', 'receipt'],
    });
  });
  return next;
};

const normalizeIdArray = (value: any): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim().startsWith('{') && value.trim().endsWith('}')) {
    return value
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((item) => String(item || '').replace(/"/g, '').trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeIranMobileForSms = (value: unknown) => {
  let digits = String(value || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('98')) digits = `0${digits.slice(2)}`;
  else if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
  return /^09\d{9}$/.test(digits) ? digits : '';
};

const buildBotSmsNotificationText = (orgName: string, platformLabel: string) => {
  const safeOrgName = String(orgName || '').trim() || 'سازمان';
  const safePlatformLabel = String(platformLabel || '').trim() || 'پیام‌رسان';
  return `سلام، یک پیام جدید از طرف ${safeOrgName} در ${safePlatformLabel} برای شما ارسال شد.\nلطفاً پیام‌رسان خود را بررسی کنید.`;
};

const BotSmsNotificationConfirmContent: React.FC<{
  initialText: string;
  onChange: (value: { text: string; remember: boolean }) => void;
}> = ({ initialText, onChange }) => {
  const [text, setText] = useState(initialText);
  const [remember, setRemember] = useState(false);
  const update = (nextText: string, nextRemember: boolean) => {
    setText(nextText);
    setRemember(nextRemember);
    onChange({ text: nextText, remember: nextRemember });
  };
  return (
    <div className="space-y-3" dir="rtl">
      <div className="text-xs leading-6 text-slate-500 dark:text-slate-300">
        متن پیامک اطلاع‌رسانی قبل از ارسال پیام بات برای مخاطب ارسال می‌شود.
      </div>
      <Input.TextArea
        value={text}
        onChange={(event) => update(event.target.value, remember)}
        autoSize={{ minRows: 3, maxRows: 6 }}
      />
      <Checkbox checked={remember} onChange={(event) => update(text, event.target.checked)}>
        از این به بعد از همین متن برای اطلاع‌رسانی پیامکی به این کاربر استفاده کن
      </Checkbox>
    </div>
  );
};

const isInternalSystemNote = (note: any) =>
  !String(note?.metadata?.chat_group_id || '').trim()
  && (
    String(note?.source_type || '').trim() === 'system'
    || String(note?.metadata?.source_type || '').trim() === 'system'
    || String(note?.source_type || '').trim() === 'ai'
    || String(note?.metadata?.source_type || '').trim() === 'ai'
    || Boolean(note?.metadata?.workflow_id || note?.metadata?.automation_rule_id || note?.metadata?.process_automation_rule_id)
  );

const getNoteAttachmentKind = (attachment: NoteAttachment): AttachmentKind => {
  const fileType = String(attachment?.fileType || '').trim().toLowerCase();
  const mimeType = String(attachment?.mimeType || '').trim().toLowerCase();
  if (fileType === 'image' || mimeType.startsWith('image/')) return 'image';
  if (fileType === 'video' || mimeType.startsWith('video/')) return 'video';
  if (fileType === 'audio' || fileType === 'voice' || mimeType.startsWith('audio/')) return 'audio';
  return 'file';
};

const parseMentionValues = (values: string[]) => {
  const mentionUserIds = new Set<string>();
  const mentionRoleIds = new Set<string>();
  (values || []).forEach((value) => {
    const normalizedValue = String(value || '').trim();
    if (normalizedValue.startsWith('user:')) mentionUserIds.add(normalizedValue.replace('user:', ''));
    if (normalizedValue.startsWith('role:')) mentionRoleIds.add(normalizedValue.replace('role:', ''));
  });
  return {
    mentionUserIds: Array.from(mentionUserIds),
    mentionRoleIds: Array.from(mentionRoleIds),
  };
};

const ConversationAvatar: React.FC<{ conversation: Conversation; size: number }> = ({ conversation, size }) => {
  const platformSrc = conversation.platform ? getBotPlatformAvatarSrc(conversation.platform) : null;
  if (platformSrc) {
    return <Avatar size={size} src={platformSrc} className="!bg-white dark:!bg-white/[0.08]" />;
  }
  if (conversation.channel === 'internal') {
    return (
      <ProfileAvatar
        size={size}
        src={conversation.avatarUrl}
        name={conversation.title}
        fallback={conversation.avatarText}
        preload
        className={`${conversation.tone} !font-bold`}
      />
    );
  }
  return (
    <Avatar size={size} className={`${conversation.tone} !font-bold`}>
      {conversation.avatarText}
    </Avatar>
  );
};

const getChannelTagClassName = (channel: ChannelKind) => (
  channel === 'internal'
    ? '!border-[rgba(var(--brand-500-rgb),0.24)] !bg-[rgba(var(--brand-500-rgb),0.10)] !text-[rgb(var(--brand-800-rgb))] dark:!border-[rgba(var(--brand-300-rgb),0.22)] dark:!bg-[rgba(var(--brand-300-rgb),0.12)] dark:!text-[rgb(var(--brand-200-rgb))]'
    : ''
);

const ChannelPill: React.FC<{ channel: ChannelKind; compact?: boolean }> = ({ channel, compact = false }) => (
  <Tag
    color={channel === 'internal' ? undefined : channelMeta[channel].color}
    className={`!m-0 !inline-flex !items-center !gap-1 !rounded-full !px-2 ${compact ? '!text-[10px]' : '!text-[11px]'} ${getChannelTagClassName(channel)}`}
  >
    {channelMeta[channel].icon}
    <span>{channelMeta[channel].label}</span>
  </Tag>
);

const getConversationBadgeLabel = (conversation: Conversation) => {
  if (conversation.channel === 'internal') {
    if (conversation.internalKind === 'saved') return 'یادداشت‌ها';
    if (conversation.internalKind === 'system') return 'سیستم';
    if (conversation.internalKind === 'group') return 'گروه داخلی';
    return String(conversation.subtitle || '').replace(/^نقش\s*:\s*/, '').trim() || 'داخلی';
  }
  if (conversation.channel === 'bot_group') return 'گروه بات';
  if (conversation.channel === 'bot_direct') return 'پی‌وی بات';
  if (conversation.channel === 'sms') return 'پیامک';
  if (conversation.channel === 'call') return 'تماس';
  return '';
};

const ConversationAvatarStack: React.FC<{ conversation: Conversation; size: number; compact?: boolean }> = ({ conversation, size, compact = false }) => (
  <span className="flex w-[54px] shrink-0 flex-col items-center gap-1">
    <Badge count={formatBadgeCount(conversation.unread)} size="small" color="#c0392b">
      <ConversationAvatar conversation={conversation} size={size} />
    </Badge>
    {!compact ? (
      <Tag
        color={conversation.channel === 'internal' ? undefined : channelMeta[conversation.channel].color}
        className={`!m-0 !flex max-w-[54px] !items-center !justify-center !rounded-full !px-1.5 !py-0.5 text-center !text-[8px] !font-semibold !leading-3 ${getChannelTagClassName(conversation.channel)}`}
        title={getConversationBadgeLabel(conversation)}
      >
        <span className="line-clamp-2">{getConversationBadgeLabel(conversation)}</span>
      </Tag>
    ) : null}
  </span>
);

const AudioAttachmentPlayer: React.FC<{ name: string; url?: string | null; call?: boolean }> = ({ name, url, call = false }) => (
  <div className="mt-2 flex w-full max-w-[390px] items-center gap-2 rounded-2xl border border-slate-200 bg-white/92 px-3 py-2 text-[11px] text-slate-600 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.055] dark:text-slate-200">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(var(--brand-500-rgb),0.12)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.14)] dark:text-[rgb(var(--brand-200-rgb))]" aria-label={call ? 'پخش ضبط تماس' : 'پخش پیام صوتی'}>
      <AudioOutlined />
    </span>
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{call ? 'ضبط تماس' : 'پیام صوتی'}</span>
        <span className="truncate text-[10px] text-slate-400">{name}</span>
      </div>
      {url ? (
        <audio controls preload="metadata" src={url} className="h-9 w-full max-w-full" />
      ) : (
        <div className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] text-slate-400 dark:bg-white/[0.06]">
          فایل صوتی اصلی در دسترس نیست.
        </div>
      )}
    </div>
    <Tooltip title={url ? 'دانلود صوت' : 'فایل صوتی اصلی در دسترس نیست'}>
      <a href={url || undefined} download={url ? name : undefined} target="_blank" rel="noreferrer" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-white/[0.08] ${url ? '' : 'pointer-events-none opacity-45'}`} aria-label="دانلود صوت">
        <DownloadOutlined />
      </a>
    </Tooltip>
  </div>
);

const MediaAttachmentPreview: React.FC<{ attachments: TimelineEvent['attachments']; call?: boolean }> = ({ attachments = [], call = false }) => {
  const [previewAttachment, setPreviewAttachment] = useState<NonNullable<TimelineEvent['attachments']>[number] | null>(null);
  const images = attachments.filter((attachment) => attachment.kind === 'image');
  const videos = attachments.filter((attachment) => attachment.kind === 'video');
  const files = attachments.filter((attachment) => attachment.kind === 'file');
  const audios = attachments.filter((attachment) => attachment.kind === 'audio');

  return (
    <div className="mt-3 space-y-2">
      {images.length > 0 ? (
        <div className={`grid gap-1.5 ${images.length === 1 ? 'max-w-[156px] grid-cols-1' : 'max-w-[260px] grid-cols-2'}`}>
          {images.slice(0, 4).map((attachment, index) => {
            const hiddenCount = images.length - 4;
            const showOverlay = index === 3 && hiddenCount > 0;
            return (
              <button
                type="button"
                key={`${attachment.name}-${attachment.url || index}`}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,rgba(var(--brand-100-rgb),0.95),rgba(var(--brand-50-rgb),0.72),rgba(255,255,255,0.92))] text-right shadow-sm transition hover:border-[rgba(var(--brand-300-rgb),0.9)] dark:border-white/[0.08] dark:bg-[linear-gradient(135deg,rgba(var(--brand-700-rgb),0.26),rgba(255,255,255,0.06))]"
                aria-label={`نمایش تصویر ${attachment.name}`}
                onClick={() => setPreviewAttachment(attachment)}
              >
                {attachment.url ? (
                  <ResilientImage src={attachment.url} preset="thumb" alt={attachment.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[rgb(var(--brand-500-rgb))] opacity-80">
                    <FileImageOutlined className="text-3xl" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent p-2 text-[11px] font-semibold text-white">
                  <span className="line-clamp-1">{attachment.name}</span>
                </div>
                {showOverlay ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-bold text-white">
                    +{toPersianNumber(String(hiddenCount))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {videos.length > 0 ? (
        <div className="grid max-w-[220px] grid-cols-1 gap-1.5">
          {videos.map((attachment) => (
            <button
              type="button"
              key={`${attachment.name}-${attachment.url || 'video'}`}
              className="relative aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 text-right shadow-sm transition hover:border-[rgba(var(--brand-300-rgb),0.9)] dark:border-white/[0.08]"
              aria-label={`پخش ویدیو ${attachment.name}`}
              onClick={() => setPreviewAttachment(attachment)}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(var(--brand-300-rgb),0.45),transparent_36%),linear-gradient(135deg,#111827,#334155)]" />
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/36 backdrop-blur">
                  <PlayCircleOutlined className="text-2xl" />
                </span>
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-[11px] font-semibold text-white">
                <span className="line-clamp-1">{attachment.name}</span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="grid max-w-[360px] grid-cols-1 gap-2 sm:grid-cols-2">
          {files.map((attachment) => (
            <a
              href={attachment.url || undefined}
              download={attachment.url ? attachment.name : undefined}
              target="_blank"
              rel="noreferrer"
              key={`${attachment.name}-${attachment.url || 'file'}`}
              className={`group flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white/92 p-2 text-[11px] text-slate-600 shadow-sm transition hover:border-[rgba(var(--brand-300-rgb),0.9)] hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.045] dark:text-slate-200 ${attachment.url ? '' : 'pointer-events-none opacity-60'}`}
            >
              <FileExtensionTile fileName={attachment.name} url={attachment.url || ''} mimeType={attachment.mimeType || null} compact />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{attachment.name}</span>
                <span className="mt-0.5 block text-[10px] text-slate-400">فایل پیوست</span>
              </span>
              {attachment.url ? <DownloadOutlined className="shrink-0 text-slate-400 transition group-hover:text-[rgb(var(--brand-600-rgb))]" /> : null}
            </a>
          ))}
        </div>
      ) : null}
      {audios.map((attachment) => (
        <AudioAttachmentPlayer key={`${attachment.name}-${attachment.url || 'audio'}`} name={attachment.name} url={attachment.url} call={call} />
      ))}
      <Modal
        open={Boolean(previewAttachment)}
        title={previewAttachment?.name || 'پیش‌نمایش فایل'}
        footer={previewAttachment?.url ? (
          <div className="flex justify-end gap-2">
            <Button href={previewAttachment.url} target="_blank">باز کردن فایل اصلی</Button>
            <Button type="primary" href={previewAttachment.url} download={previewAttachment.name} icon={<DownloadOutlined />}>دانلود</Button>
          </div>
        ) : null}
        onCancel={() => setPreviewAttachment(null)}
        destroyOnHidden
        centered
        width={760}
      >
        {previewAttachment?.kind === 'image' && previewAttachment.url ? (
          <ResilientImage src={previewAttachment.url} preset="gallery" alt={previewAttachment.name} className="max-h-[70vh] w-full rounded-2xl object-contain" />
        ) : previewAttachment?.kind === 'video' && previewAttachment.url ? (
          <video src={previewAttachment.url} controls className="max-h-[70vh] w-full rounded-2xl bg-black" />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300">
            پیش‌نمایش این فایل در دسترس نیست.
          </div>
        )}
      </Modal>
    </div>
  );
};

const getModuleLabelFa = (moduleId?: string | null) => {
  const key = String(moduleId || '').trim();
  if (!key) return '';
  return MODULES[key]?.titles?.fa || key;
};

const getRelatedContextParts = (conversation: Pick<Conversation, 'relatedModuleId' | 'relatedRecordTitle' | 'relatedScope' | 'relatedLabelPrefix'>) => {
  const moduleLabel = getModuleLabelFa(conversation.relatedModuleId);
  const recordTitle = String(conversation.relatedRecordTitle || '').trim();
  if (!moduleLabel && !recordTitle) return null;
  const prefix = String(conversation.relatedLabelPrefix || '').trim()
    || (conversation.relatedScope === 'page' ? 'صفحه مرتبط' : conversation.relatedScope === 'module' ? 'بخش مرتبط' : 'رکورد مرتبط');
  if (conversation.relatedScope === 'module') return { prefix, text: moduleLabel };
  if (conversation.relatedScope === 'page') return { prefix, text: moduleLabel };
  return { prefix, text: [moduleLabel, recordTitle].filter(Boolean).join(' - ') };
};

const getPrimaryActions = (conversation: Conversation) => {
  if (conversation.channel === 'internal') return ['search'] as ConversationAction[];
  if (conversation.channel === 'call') return ['search', 'bind', 'call'].filter((action) => conversation.actions.includes(action as ConversationAction)) as ConversationAction[];
  if (conversation.channel === 'sms') return ['search', 'bind'].filter((action) => conversation.actions.includes(action as ConversationAction)) as ConversationAction[];
  return ['search', 'bind'].filter((action) => conversation.actions.includes(action as ConversationAction)) as ConversationAction[];
};

const MessagingConversationList: React.FC<{
  conversations: Conversation[];
  selectedKey: string;
  onSelect: (key: string) => void;
  compact?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  onCreateInternalGroup?: () => void;
  activeFilter: ChannelKind | 'all';
  onChangeFilter: (value: ChannelKind | 'all') => void;
}> = ({ conversations, selectedKey, onSelect, compact = false, onRefresh, refreshing = false, onCreateInternalGroup, activeFilter, onChangeFilter }) => (
  <MessagingConversationListInner conversations={conversations} selectedKey={selectedKey} onSelect={onSelect} compact={compact} onRefresh={onRefresh} refreshing={refreshing} onCreateInternalGroup={onCreateInternalGroup} activeFilter={activeFilter} onChangeFilter={onChangeFilter} />
);

const MessagingConversationListInner: React.FC<{
  conversations: Conversation[];
  selectedKey: string;
  onSelect: (key: string) => void;
  compact?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  onCreateInternalGroup?: () => void;
  activeFilter: ChannelKind | 'all';
  onChangeFilter: (value: ChannelKind | 'all') => void;
}> = ({ conversations, selectedKey, onSelect, compact = false, onRefresh, refreshing = false, onCreateInternalGroup, activeFilter, onChangeFilter }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const normalizedSearch = String(searchValue || '').trim().toLocaleLowerCase('fa');
  const savedConversation = conversations.find((conversation) => conversation.channel === 'internal' && conversation.internalKind === 'saved');
  const systemConversation = conversations.find((conversation) => conversation.channel === 'internal' && conversation.internalKind === 'system');
  const channelFilteredConversations = activeFilter === 'all'
    ? conversations
    : conversations.filter((conversation) => conversation.channel === activeFilter);
  const filteredConversations = normalizedSearch
    ? channelFilteredConversations.filter((conversation) => [
      conversation.title,
      conversation.preview,
      conversation.subtitle,
      getConversationBadgeLabel(conversation),
    ].some((value) => String(value || '').toLocaleLowerCase('fa').includes(normalizedSearch)))
    : channelFilteredConversations;
  const filterUnreadCounts = useMemo(() => {
    const counts: Record<ChannelKind | 'all', number> = {
      all: 0,
      internal: 0,
      bot_group: 0,
      bot_direct: 0,
      sms: 0,
      call: 0,
    };
    conversations.forEach((conversation) => {
      const unread = Math.max(0, Number(conversation.unread || 0));
      counts.all += unread;
      counts[conversation.channel] += unread;
    });
    return counts;
  }, [conversations]);

  return (
    <div className={compact ? 'flex h-full flex-col gap-1 overflow-y-auto px-1 py-1.5' : 'flex h-full min-h-0 flex-col'}>
      {!compact ? (
        <div className="border-b border-slate-200/60 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-[#17191c]">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">پیام رسانی</div>
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip title="ایجاد گروه داخلی جدید">
              <Button
                type="text"
                shape="circle"
                icon={<PlusOutlined />}
                aria-label="ایجاد گروه داخلی جدید"
                onClick={onCreateInternalGroup}
              />
            </Tooltip>
            <Tooltip title="بروزرسانی پیام‌ها">
              <Button
                type="text"
                shape="circle"
                icon={<ReloadOutlined spin={refreshing} />}
                aria-label="بروزرسانی پیام‌ها"
                loading={refreshing}
                onClick={onRefresh}
              />
            </Tooltip>
            <Tooltip title="یادداشت‌های من">
              <Badge count={getNumericBadgeCount(savedConversation?.unread || 0)} size="small" color="#c0392b">
                <Button
                  type={selectedKey === savedConversation?.key ? 'primary' : 'text'}
                  shape="circle"
                  icon={<BookOutlined />}
                  aria-label="باز کردن یادداشت‌های من"
                  disabled={!savedConversation}
                  onClick={() => savedConversation && onSelect(savedConversation.key)}
                />
              </Badge>
            </Tooltip>
            <Tooltip title="پیام‌های سیستم">
              <Badge count={getNumericBadgeCount(systemConversation?.unread || 0)} size="small" color="#c0392b">
                <Button
                  type={selectedKey === systemConversation?.key ? 'primary' : 'text'}
                  shape="circle"
                  icon={<SoundOutlined />}
                  aria-label="باز کردن پیام‌های سیستم"
                  disabled={!systemConversation}
                  onClick={() => systemConversation && onSelect(systemConversation.key)}
                />
              </Badge>
            </Tooltip>
            <Tooltip title="جستجوی سریع گفتگو">
              <Button
                type={searchOpen || normalizedSearch ? 'primary' : 'text'}
                shape="circle"
                icon={<SearchOutlined />}
                aria-label="جستجوی سریع گفتگو"
                onClick={() => setSearchOpen((prev) => !prev)}
              />
            </Tooltip>
          </div>
        </div>
        {searchOpen ? (
          <Input
            allowClear
            size="small"
            autoFocus
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="جستجوی سریع در گفتگوها"
            prefix={<SearchOutlined className="text-slate-400" />}
            className="mt-2 !rounded-full"
          />
        ) : null}
        <div className="mt-2 grid grid-cols-3 gap-1">
          {channelFilters.map((filter) => {
            const active = activeFilter === filter.key;
            return (
              <button
                type="button"
                key={filter.key}
                onClick={() => onChangeFilter(filter.key)}
                className={`inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-full border px-1.5 text-[10.5px] font-semibold transition ${
                  active
                    ? 'border-[rgba(var(--brand-500-rgb),0.32)] bg-[rgba(var(--brand-500-rgb),0.10)] text-[rgb(var(--brand-800-rgb))] dark:border-[rgba(var(--brand-300-rgb),0.28)] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-white'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-slate-300'
                }`}
              >
                {filter.icon}
                <span>{filter.label}</span>
                {filterUnreadCounts[filter.key] > 0 ? (
                  <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[#c0392b] px-1 text-[9px] font-bold leading-4 text-white">
                    {toPersianNumber(filterUnreadCounts[filter.key])}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      ) : null}
      <div className={compact ? 'space-y-1' : 'min-h-0 flex-1 overflow-y-auto p-1.5'}>
      {filteredConversations.map((conversation) => {
        const active = conversation.key === selectedKey;
        if (compact) {
          return (
            <button
              type="button"
              key={conversation.key}
              title={conversation.title}
              onClick={() => onSelect(conversation.key)}
              className={`relative flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition ${
                active
                  ? 'bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.10),0_8px_18px_rgba(15,23,42,0.08)] dark:bg-white/[0.10] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]'
                  : 'hover:bg-white/80 dark:hover:bg-white/[0.06]'
              }`}
            >
              <ConversationAvatarStack conversation={conversation} size={34} compact />
              <span className="line-clamp-2 min-h-7 text-center text-[9.5px] leading-3.5 text-slate-500 dark:text-slate-400">
                {conversation.title}
              </span>
            </button>
          );
        }
        return (
          <button
            type="button"
            key={conversation.key}
            onClick={() => onSelect(conversation.key)}
            className={`mb-1 flex w-full items-start gap-2 rounded-xl border px-2 py-1.5 text-right transition ${
              active
                ? 'border-slate-300/80 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-white/[0.085]'
                : 'border-transparent bg-white/58 hover:bg-white/92 dark:bg-transparent dark:hover:bg-white/[0.055]'
            }`}
          >
            <ConversationAvatarStack conversation={conversation} size={36} />
            <span className="min-w-0 flex-1">
              <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <span className="line-clamp-2 text-[12.5px] font-bold leading-5 text-slate-800 dark:text-slate-100">{conversation.title}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{conversation.time}</span>
              </span>
              <span className="mt-0.5 line-clamp-1 text-[10.5px] leading-4 text-slate-500 dark:text-slate-300">
                {conversation.preview}
              </span>
            </span>
          </button>
        );
      })}
      </div>
    </div>
  );
};

const URL_PATTERN = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

const LinkifiedText: React.FC<{ text: string; inverse?: boolean }> = ({ text, inverse = false }) => {
  const value = String(text || '');
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  value.replace(URL_PATTERN, (match, _url, offset) => {
    if (offset > lastIndex) parts.push(value.slice(lastIndex, offset));
    const href = match.startsWith('http') ? match : `https://${match}`;
    parts.push(
      <a
        key={`${match}-${offset}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`break-all font-semibold underline decoration-dotted underline-offset-4 ${
          inverse
            ? 'text-white decoration-white/55 hover:text-white/90'
            : 'text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]'
        }`}
      >
        {match}
      </a>,
    );
    lastIndex = offset + match.length;
    return match;
  });
  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  return <>{parts}</>;
};

const TimelineIconButton: React.FC<{
  title: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  activeTone?: 'default' | 'like';
  inverse?: boolean;
}> = ({ title, icon, onClick, active = false, activeTone = 'default', inverse = false }) => (
  <Tooltip title={title}>
    <button
      type="button"
      aria-label={title}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
        active
          ? activeTone === 'like'
            ? 'bg-rose-500/12 text-rose-600 shadow-sm hover:bg-rose-500/18 hover:text-rose-700 dark:bg-rose-400/16 dark:text-rose-200 dark:hover:bg-rose-400/22 dark:hover:text-rose-100'
            : inverse
              ? 'bg-white/24 text-white shadow-sm'
              : 'bg-[rgba(var(--brand-500-rgb),0.12)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))]'
          : inverse
            ? 'text-white/90 hover:bg-white/12 hover:text-white'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-650 dark:hover:bg-white/[0.08] dark:hover:text-slate-100'
      }`}
      onClick={onClick}
    >
      {icon}
    </button>
  </Tooltip>
);

const TimelineEventCard: React.FC<{
  item: TimelineEvent;
  activeConversation: Conversation;
  unread?: boolean;
  onReply?: (item: TimelineEvent) => void;
  onForward?: (item: TimelineEvent) => void;
  onCreateActivity?: (item: TimelineEvent) => void;
  onToggleLike?: (item: TimelineEvent) => void;
  onShowReceipts?: (item: TimelineEvent) => void;
  onBindBotSender?: (item: TimelineEvent) => void;
}> = ({ item, activeConversation, unread = false, onReply, onForward, onCreateActivity, onToggleLike, onShowReceipts, onBindBotSender }) => {
  const { message } = App.useApp();
  const outgoing = item.direction === 'outbound';
  const isCall = item.kind === 'call';
  const isInternal = activeConversation.channel === 'internal';
  const showStatusBadge = Boolean(item.status && (isCall || (item.kind === 'sms' && outgoing)));
  const avatarFallback = String(item.author || activeConversation.avatarText || 'ک').trim().slice(0, 1) || 'ک';
  const authorTextClassName = outgoing
    ? 'truncate text-xs font-bold text-white'
    : 'truncate text-xs font-bold text-slate-800 dark:text-slate-100';
  const timeTextClassName = outgoing
    ? 'text-[10px] text-white/86'
    : 'text-[10px] text-slate-400';
  const statusClassName = outgoing
    ? 'inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200/85 bg-emerald-200/12 px-2 py-0.5 text-[10px] font-bold text-emerald-50 shadow-[0_1px_4px_rgba(0,0,0,0.14)] transition hover:bg-emerald-200/18 hover:text-white'
    : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.10]';
  const replyPreviewClassName = outgoing
    ? 'mt-2 w-full rounded-2xl border border-white/45 border-r-4 bg-transparent px-3 py-2 text-right text-[11px] text-white/86 transition hover:bg-white/10'
    : 'mt-2 w-full rounded-2xl border-r-4 border-[rgb(var(--brand-500-rgb))] bg-white/56 px-3 py-2 text-right text-[11px] text-slate-500 transition hover:bg-white/78 dark:bg-white/[0.045] dark:text-slate-300 dark:hover:bg-white/[0.07]';
  const replyPreviewAuthorClassName = outgoing
    ? 'mb-0.5 block font-bold text-white'
    : 'mb-0.5 block font-bold text-slate-700 dark:text-slate-100';
  const bodyTextClassName = outgoing
    ? 'mt-2 whitespace-pre-wrap break-words text-[12.5px] leading-6 text-white [overflow-wrap:anywhere]'
    : 'mt-2 whitespace-pre-wrap break-words text-[12.5px] leading-6 text-slate-700 [overflow-wrap:anywhere] dark:text-slate-100';
  const actionRowClassName = outgoing
    ? 'mt-2 flex flex-wrap items-center gap-1 text-[11px] text-white/68'
    : 'mt-2 flex flex-wrap items-center gap-1 text-[11px] text-slate-400';
  const outgoingUserMentionClassName = '!border-cyan-100/75 !bg-cyan-100/10 !text-cyan-50';
  const outgoingRoleMentionClassName = '!border-violet-100/75 !bg-violet-100/10 !text-violet-50';
  const relatedRecordPrefixClassName = outgoing
    ? 'text-white/70'
    : 'text-slate-500 dark:text-slate-400';
  const relatedRecordTextClassName = outgoing
    ? 'text-sky-50 underline decoration-sky-100/55 underline-offset-4 hover:text-white hover:decoration-white'
    : 'text-[rgb(var(--brand-700-rgb))] underline decoration-dotted decoration-[rgba(var(--brand-500-rgb),0.55)] underline-offset-4 hover:text-[rgb(var(--brand-800-rgb))] dark:text-[rgb(var(--brand-300-rgb))] dark:hover:text-[rgb(var(--brand-200-rgb))]';
  const copyMessageText = async () => {
    const text = String(item.text || '').trim();
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      message.success('متن پیام کپی شد.');
    } catch {
      message.error('کپی متن پیام ناموفق بود.');
    }
  };
  return (
    <div id={`timeline-event-${item.id}`} data-source-id={String(item.sourceRow?.id || '') || undefined} className={`flex ${outgoing ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`relative max-w-[min(680px,88%)] rounded-3xl px-3 py-2.5 ${
          outgoing
            ? 'shadow-[0_18px_42px_rgba(var(--brand-800-rgb),0.34)] dark:shadow-[0_18px_42px_rgba(0,0,0,0.40)]'
            : 'border border-slate-200/70 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)] dark:border-white/[0.08] dark:bg-white/[0.055]'
        }`}
        style={outgoing ? { background: 'rgb(var(--brand-800-rgb))' } : undefined}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {unread ? (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.14)]" title="پیام خوانده نشده" />
            ) : null}
            {isCall ? (
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.callDirection === 'outgoing' ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'}`}>
                <PhoneOutlined />
              </span>
            ) : (
              <ProfileAvatar
                size={26}
                src={item.avatarUrl || activeConversation.avatarUrl || null}
                name={item.author}
                fallback={avatarFallback}
                preload
                className={item.avatarUrl ? '!font-bold' : `${activeConversation.tone} !font-bold`}
              />
            )}
            <div className="min-w-0">
              <div className={authorTextClassName}>{item.author}</div>
              <div className={timeTextClassName}>{item.time}</div>
            </div>
          </div>
          {showStatusBadge ? (
            <button type="button" className={statusClassName} title={isCall ? `تماس‌گیرنده: ${item.caller || '-'} | پاسخ‌دهنده: ${item.responder || '-'} | نوع تماس: ${item.callType || '-'}` : item.status}>
              {isCall ? <ClockCircleOutlined /> : <CheckCircleOutlined />}
              {item.status}
              {isCall ? <InfoCircleOutlined /> : null}
            </button>
          ) : null}
        </div>
        {(item.replyPreviewText || item.replyPreviewAttachments?.length) ? (
          <button
            type="button"
            className={replyPreviewClassName}
            onClick={() => {
              const replyId = String(item.replyTo || '').trim();
              if (!replyId || typeof document === 'undefined') return;
              const target = document.querySelector(`[data-source-id="${CSS.escape(replyId)}"]`);
              target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            <span className={replyPreviewAuthorClassName}>پاسخ به {item.replyPreviewAuthor || 'پیام'}</span>
            {item.replyPreviewText ? <span className="line-clamp-2 break-words [overflow-wrap:anywhere]">{item.replyPreviewText}</span> : null}
            {item.replyPreviewAttachments?.length ? (
              <span className="mt-1 flex flex-wrap gap-1">
                {item.replyPreviewAttachments.slice(0, 3).map((attachment) => (
                  <span key={`${item.id}-reply-${attachment.name}`} className={`rounded-full px-2 py-0.5 text-[10px] ${outgoing ? 'border border-white/45 bg-transparent text-white/90' : 'bg-slate-100 dark:bg-white/[0.08]'}`}>
                    {attachment.kind === 'image' ? 'تصویر' : attachment.kind === 'video' ? 'ویدیو' : attachment.kind === 'audio' ? 'صوت' : 'فایل'}: {attachment.name}
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        ) : null}
        {String(item.text || '').trim() ? (
          <div className={bodyTextClassName}>
            <LinkifiedText text={item.text} inverse={outgoing} />
          </div>
        ) : null}
        {(item.mentionUsers?.length || item.mentionRoles?.length) ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(item.mentionUsers || []).map((name) => (
              <Tag
                key={`mention-user-${item.id}-${name}`}
                className={`!m-0 !rounded-full !px-2 !text-[10.5px] ${
                  outgoing
                    ? outgoingUserMentionClassName
                    : '!border-slate-300/80 !bg-slate-100/80 !text-slate-600 dark:!border-white/[0.12] dark:!bg-white/[0.07] dark:!text-slate-200'
                }`}
              >
                @{name}
              </Tag>
            ))}
            {(item.mentionRoles || []).map((name) => (
              <Tag
                key={`mention-role-${item.id}-${name}`}
                className={`!m-0 !rounded-full !px-2 !text-[10.5px] ${
                  outgoing
                    ? outgoingRoleMentionClassName
                    : '!border-slate-300/80 !bg-slate-100/80 !text-slate-600 dark:!border-white/[0.12] dark:!bg-white/[0.07] dark:!text-slate-200'
                }`}
              >
                نقش: {name}
              </Tag>
            ))}
          </div>
        ) : null}
        {isCall && item.sourceRow ? (
          <div className="mt-2">
            <VoipRecordingPlayer call={item.sourceRow} compact />
          </div>
        ) : item.attachments?.length ? <MediaAttachmentPreview attachments={item.attachments} call={isCall} /> : null}
        {item.relatedRecordLabel ? (
          <button
            type="button"
            className="mt-3 inline-flex max-w-full items-center gap-1.5 text-[11px] font-semibold transition"
          >
            <LinkOutlined className={relatedRecordPrefixClassName} />
            <span className={relatedRecordPrefixClassName}>رکورد مرتبط:</span>
            <span className={`min-w-0 truncate ${relatedRecordTextClassName}`}>{item.relatedRecordLabel}</span>
          </button>
        ) : null}
        {!isCall ? <div className={actionRowClassName}>
          {activeConversation.actions.includes('reply') ? <TimelineIconButton title="پاسخ" icon={<RollbackOutlined />} inverse={outgoing} onClick={() => onReply?.(item)} /> : null}
          {activeConversation.actions.includes('forward') ? <TimelineIconButton title="هدایت" icon={<SendOutlined />} inverse={outgoing} onClick={() => onForward?.(item)} /> : null}
          {activeConversation.actions.includes('activity') ? <TimelineIconButton title="ایجاد فعالیت" icon={<FileAddOutlined />} inverse={outgoing} onClick={() => onCreateActivity?.(item)} /> : null}
          {!outgoing && (activeConversation.channel === 'bot_group' || activeConversation.channel === 'bot_direct') && item.botSenderChatId && !item.botSenderBound ? (
            <TimelineIconButton title="اتصال فرستنده به مخاطب" icon={<UserAddOutlined />} inverse={outgoing} onClick={() => onBindBotSender?.(item)} />
          ) : null}
          <TimelineIconButton title="کپی متن" icon={<CopyOutlined />} inverse={outgoing} onClick={() => void copyMessageText()} />
          <TimelineIconButton title={item.liked ? 'پسندیده شده' : 'پسندیدن'} icon={<LikeOutlined />} active={Boolean(item.liked)} activeTone="like" inverse={outgoing} onClick={() => onToggleLike?.(item)} />
          {item.seenAt ? (
            isInternal ? (
              <TimelineIconButton title={item.seenAt} icon={<CheckCircleOutlined />} inverse={outgoing} onClick={() => onShowReceipts?.(item)} />
            ) : (
              <Tooltip title={item.seenAt}>
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${outgoing ? 'text-white/90' : 'text-slate-400'}`}><CheckCircleOutlined /></span>
              </Tooltip>
            )
          ) : null}
        </div> : null}
      </div>
    </div>
  );
};

const MessagingHeader: React.FC<{
  conversation: Conversation;
  onBindPhone?: (conversation: Conversation) => void;
  onSearch?: () => void;
  onStartCall?: (conversation: Conversation) => void;
  onEditInternalGroup?: (conversation: Conversation) => void;
  searchOpen?: boolean;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
}> = ({
  conversation,
  onBindPhone,
  onSearch,
  onStartCall,
  onEditInternalGroup,
  searchOpen = false,
  searchValue = '',
  onSearchValueChange,
}) => {
  const primaryActions = getPrimaryActions(conversation);
  const relatedContext = getRelatedContextParts(conversation);
  const handlePrimaryAction = (action: ConversationAction) => {
    if (action === 'bind') {
      onBindPhone?.(conversation);
      return;
    }
    if (action === 'search') {
      onSearch?.();
      return;
    }
    if (action === 'call') {
      onStartCall?.(conversation);
    }
  };
  return (
    <div className="border-b border-slate-200/65 bg-white/90 px-3 py-2.5 backdrop-blur dark:border-white/[0.07] dark:bg-[#17191c]/95">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ConversationAvatar conversation={conversation} size={38} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-sm font-bold text-slate-850 dark:text-slate-100">{conversation.title}</div>
              <span className="hidden sm:inline-flex">
                <ChannelPill channel={conversation.channel} compact />
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                {channelMeta[conversation.channel].icon}
                {conversation.status}
              </span>
              {relatedContext ? (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span className="hidden min-w-0 truncate sm:inline">
                    <span className="text-slate-500 dark:text-slate-400">{relatedContext.prefix}: </span>
                    <span className="font-semibold text-[rgb(var(--brand-700-rgb))] underline decoration-dotted decoration-[rgba(var(--brand-500-rgb),0.55)] underline-offset-4 dark:text-[rgb(var(--brand-300-rgb))]">
                      {relatedContext.text}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span className="hidden truncate sm:inline">{conversation.subtitle}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {conversation.channel === 'internal' && conversation.internalKind === 'group' ? (
            <Tooltip title="ویرایش گروه">
              <Button type="text" size="small" shape="circle" icon={<EditOutlined />} aria-label="ویرایش گروه" onClick={() => onEditInternalGroup?.(conversation)} />
            </Tooltip>
          ) : null}
          {primaryActions.map((action) => (
            <Tooltip title={primaryActionLabels[action]} key={action}>
              <Button
                type="text"
                size="small"
                shape="circle"
                icon={actionIcons[action]}
                aria-label={primaryActionLabels[action]}
                onClick={() => handlePrimaryAction(action)}
              />
            </Tooltip>
          ))}
        </div>
      </div>
      {searchOpen ? (
        <div className="mt-2">
          <Input
            allowClear
            size="small"
            prefix={<SearchOutlined />}
            value={searchValue}
            onChange={(event) => onSearchValueChange?.(event.target.value)}
            placeholder="جستجو در همین گفتگو"
            aria-label="جستجو در گفتگو"
            autoFocus
          />
        </div>
      ) : null}
    </div>
  );
};

const MessagingComposerDock: React.FC<{
  conversation: Conversation;
  onSendMessage?: (conversation: Conversation, payload: ComposerSendPayload) => Promise<boolean> | boolean;
  mentionOptions?: Array<{ label: string; value: string }>;
  mentionsLoading?: boolean;
  replyTarget?: TimelineEvent | null;
  onClearReply?: () => void;
}> = ({ conversation, onSendMessage, mentionOptions = [], mentionsLoading = false, replyTarget = null, onClearReply }) => {
  const [draft, setDraft] = useState('');
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [mentionValues, setMentionValues] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [linkedAttachments, setLinkedAttachments] = useState<NoteAttachment[]>([]);
  const [readyTextsOpen, setReadyTextsOpen] = useState(false);
  const [smsNotificationEnabled, setSmsNotificationEnabled] = useState(false);
  useEffect(() => {
    setDraft('');
    setRecording(false);
    setSending(false);
    setMentionPickerOpen(false);
    setMentionValues([]);
    setAttachments([]);
    setLinkedAttachments([]);
    setReadyTextsOpen(false);
    setSmsNotificationEnabled(false);
  }, [conversation.key]);
  const applyReadyText = (value: string) => {
    const text = String(value || '').trim();
    if (!text) return;
    setDraft((prev) => {
      const next = String(prev || '').trim() ? `${String(prev || '').trim()}\n${text}` : text;
      return next;
    });
    setReadyTextsOpen(false);
  };
  const readyTextsModal = readyTextsOpen ? (
    <React.Suspense fallback={null}>
      <MessageComposerModal
        open
        mode="template"
        moduleId={conversation.relatedModuleId || null}
        record={conversation.relatedRecordId ? { id: conversation.relatedRecordId } : null}
        templateOnlyTitle="پیام‌های آماده"
        onApplyTemplate={applyReadyText}
        onInsertVariable={(token) => applyReadyText(token)}
        onCancel={() => setReadyTextsOpen(false)}
      />
    </React.Suspense>
  ) : null;
  if (conversation.channel === 'call') {
    return (
      <>
        <div className="h-3 shrink-0 border-t border-slate-200/65 bg-white/92 dark:border-white/[0.07] dark:bg-[#17191c]" />
        {readyTextsModal}
      </>
    );
  }
  if (conversation.channel === 'internal' || conversation.channel === 'bot_group' || conversation.channel === 'bot_direct') {
    const disabled = Boolean(conversation.readOnly);
    const canSubmit = !disabled && !sending && (draft.trim() || attachments.length > 0 || linkedAttachments.length > 0);
    const submitSharedDraft = async () => {
      if (!canSubmit) return;
      setSending(true);
      try {
        const sent = await onSendMessage?.(conversation, {
          text: draft,
          mentionValues,
          attachments,
          linkedAttachments,
          replyTo: replyTarget?.sourceRow?.id ? String(replyTarget.sourceRow.id) : null,
          smsNotificationEnabled,
        });
        if (sent) {
          setDraft('');
          setMentionValues([]);
          setAttachments([]);
          setLinkedAttachments([]);
          setMentionPickerOpen(false);
        }
      } finally {
        setSending(false);
      }
    };
    return (
      <>
        <SharedNoteComposer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void submitSharedDraft()}
          submitLoading={sending}
          submitDisabled={!canSubmit}
          placeholder={disabled ? 'این گفتگو فقط پیام‌های سیستم را نمایش می‌دهد.' : conversation.channel === 'internal' ? (conversation.internalKind === 'saved' ? 'یادداشت جدید...' : 'پیام داخلی...') : 'پیام بات...'}
          mentionOptions={mentionOptions}
          mentionValues={mentionValues}
          onMentionChange={setMentionValues}
          mentionsLoading={mentionsLoading}
          mentionPickerOpen={mentionPickerOpen}
          onToggleMentionPicker={() => setMentionPickerOpen((prev) => !prev)}
          allowMentions={!disabled && conversation.channel === 'internal' && conversation.internalKind !== 'saved'}
          attachments={attachments}
          linkedAttachments={linkedAttachments}
          onFilesSelected={(files) => {
            setAttachments((prev) => {
              const map = new Map(prev.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]));
              files.forEach((file) => map.set(`${file.name}-${file.size}-${file.lastModified}`, file));
              return Array.from(map.values());
            });
          }}
          onRemoveAttachment={(fileName) => {
            setAttachments((prev) => prev.filter((file) => file.name !== fileName));
          }}
          onLinkedAttachmentsSelected={(nextAttachments) => {
            setLinkedAttachments((prev) => {
              const map = new Map(prev.map((attachment) => [String(attachment.url || ''), attachment]));
              nextAttachments.forEach((attachment) => {
                const url = String(attachment.url || '').trim();
                if (url) map.set(url, attachment);
              });
              return Array.from(map.values());
            });
          }}
          onRemoveLinkedAttachment={(url) => {
            setLinkedAttachments((prev) => prev.filter((attachment) => String(attachment.url || '') !== String(url || '')));
          }}
          allowAttachments={!disabled}
          filePickerModuleId={conversation.relatedModuleId || null}
          filePickerRecordId={conversation.relatedRecordId || null}
          enableImagePasteAndDrop
          replyActive={Boolean(replyTarget)}
          onClearReply={onClearReply}
          smsNotificationEnabled={smsNotificationEnabled}
          onSmsNotificationChange={conversation.channel === 'internal' || conversation.channel === 'bot_group' || conversation.channel === 'bot_direct' ? setSmsNotificationEnabled : undefined}
          surfaceVariant="omni"
          extraActions={!disabled ? (
            <>
              {conversation.actions.includes('ready_text') ? (
                <Tooltip title="متن آماده">
                  <Button type="text" size="small" shape="circle" icon={<SnippetsOutlined />} aria-label="متن آماده" onClick={() => setReadyTextsOpen(true)} />
                </Tooltip>
              ) : null}
            </>
          ) : null}
        />
        {readyTextsModal}
      </>
    );
  }
  const submitDraft = async () => {
    const text = String(draft || '').trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const sent = await onSendMessage?.(conversation, { text });
      if (sent) setDraft('');
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="border-t border-slate-200/55 bg-[rgba(248,250,252,0.78)] px-3 py-2.5 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/[0.06] dark:!bg-[rgba(21,23,26,0.96)]">
      {recording ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-300/20 dark:bg-rose-500/10 dark:text-rose-200">
          <span className="inline-flex items-center gap-2"><AudioOutlined /> در حال ضبط صدا... ۰۰:۱۲</span>
          <Button size="small" danger type="text" onClick={() => setRecording(false)}>توقف</Button>
        </div>
      ) : null}
      <div className="flex items-end gap-2 rounded-2xl bg-white/95 p-2.5 shadow-[0_16px_38px_rgba(15,23,42,0.10)] dark:!bg-[rgba(28,33,40,0.96)] dark:shadow-[0_16px_38px_rgba(0,0,0,0.30)]">
        <div className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-50/82 px-1 py-1 dark:!bg-[rgba(8,13,20,0.42)]">
          {conversation.actions.includes('attach') ? (
            <Tooltip title="پیوست تصویر، فایل، ویدیو یا صوت">
              <Button type="text" size="small" shape="circle" icon={<PaperClipOutlined />} aria-label="افزودن پیوست" className="!h-8 !w-8 !min-w-8 !text-slate-600 hover:!bg-white hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-white/[0.08] dark:hover:!text-white" />
            </Tooltip>
          ) : null}
          {conversation.actions.includes('mention') ? (
            <Tooltip title="اشاره به کاربر یا نقش">
              <Button type="text" size="small" shape="circle" icon={<CommentOutlined />} aria-label="اشاره به کاربر" className="!h-8 !w-8 !min-w-8 !text-slate-600 hover:!bg-white hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-white/[0.08] dark:hover:!text-white" />
            </Tooltip>
          ) : null}
          {conversation.actions.includes('ready_text') ? (
            <Tooltip title="متن آماده">
              <Button type="text" size="small" shape="circle" icon={<SnippetsOutlined />} aria-label="متن آماده" onClick={() => setReadyTextsOpen(true)} className="!h-8 !w-8 !min-w-8 !text-slate-600 hover:!bg-white hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-white/[0.08] dark:hover:!text-white" />
            </Tooltip>
          ) : null}
          {conversation.channel !== 'sms' ? (
            <Tooltip title="ضبط صدا">
              <Button type="text" size="small" shape="circle" icon={<AudioOutlined />} aria-label="ضبط صدا" onClick={() => setRecording(true)} className="!h-8 !w-8 !min-w-8 !text-slate-600 hover:!bg-white hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-white/[0.08] dark:hover:!text-white" />
            </Tooltip>
          ) : null}
        </div>
        <Input.TextArea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              void submitDraft();
            }
          }}
          autoSize={{ minRows: 1, maxRows: 4 }}
          placeholder={conversation.channel === 'sms' ? 'متن پیامک...' : 'متن پیام...'}
          className="!border-0 !bg-transparent !px-1 !text-[13px] !leading-6 !shadow-none placeholder:!text-slate-400 dark:placeholder:!text-slate-500"
          disabled={sending}
        />
        <Button type="primary" shape="circle" icon={<SendOutlined />} aria-label="ارسال پیام" loading={sending} disabled={!String(draft || '').trim()} onClick={() => void submitDraft()} className="!h-8 !min-w-8 shadow-[0_8px_18px_rgba(var(--brand-700-rgb),0.18)]" />
      </div>
      {readyTextsModal}
    </div>
  );
};

type PhoneBindDraft = {
  phone: string;
  phoneNumberId: string | null;
  phoneMatchStatus: string | null;
  existingBindingLabel: string | null;
};

type BotIdentityBindingRow = {
  target_module_id?: BotTargetModuleId | string | null;
  target_record_id?: string | null;
  display_name?: string | null;
  username?: string | null;
  phone_number?: string | null;
};

type BotIdentityBindDraft = {
  channel: BotChannel;
  chatId: string;
  displayName: string;
  username: string;
  phoneNumber: string;
  existingBinding: BotIdentityBindingRow | null;
};

type MessageActivityDraft = {
  initialValues: Record<string, any>;
  attachments: NoteAttachment[];
  relatedModuleId: string | null;
  relatedRecordId: string | null;
  sourceLabel: string;
};

type ChatGroupRow = {
  id: string;
  name?: string | null;
  user_ids?: string[] | null;
  role_ids?: string[] | null;
  metadata?: Record<string, any> | null;
};

const MessagingSurfacePrototype: React.FC<MessagingSurfacePrototypeProps> = ({ initialFilter = 'internal', initialConversationKey = null }) => {
  const { message } = App.useApp();
  const notificationRuntime = useOptionalNotificationRuntime();
  const [selectedKey, setSelectedKey] = useState(() => String(initialConversationKey || '').trim());
  const [conversationFilter, setConversationFilter] = useState<ChannelKind | 'all'>(initialFilter);
  const [conversationListOpen, setConversationListOpen] = useState(false);
  const [phoneBindOpen, setPhoneBindOpen] = useState(false);
  const [phoneBindLoading, setPhoneBindLoading] = useState(false);
  const [phoneBindSaving, setPhoneBindSaving] = useState(false);
  const [phoneBindDraft, setPhoneBindDraft] = useState<PhoneBindDraft | null>(null);
  const [phoneBindTargetModuleId, setPhoneBindTargetModuleId] = useState<PhoneBindTargetModuleId>('customers');
  const [phoneBindTargetRecordId, setPhoneBindTargetRecordId] = useState<string | null>(null);
  const [phoneBindSearch, setPhoneBindSearch] = useState('');
  const [phoneBindOptions, setPhoneBindOptions] = useState<Array<{ value: string; label: string; meta?: string | null }>>([]);
  const [botIdentityBindOpen, setBotIdentityBindOpen] = useState(false);
  const [botIdentityBindLoading, setBotIdentityBindLoading] = useState(false);
  const [botIdentityBindSaving, setBotIdentityBindSaving] = useState(false);
  const [botIdentityBindDraft, setBotIdentityBindDraft] = useState<BotIdentityBindDraft | null>(null);
  const [botIdentityBindTargetModuleId, setBotIdentityBindTargetModuleId] = useState<BotTargetModuleId>('customers');
  const [botIdentityBindTargetRecordId, setBotIdentityBindTargetRecordId] = useState<string | null>(null);
  const [botIdentityBindSearch, setBotIdentityBindSearch] = useState('');
  const [botIdentityBindOptions, setBotIdentityBindOptions] = useState<Array<{ value: string; label: string; meta?: string | null }>>([]);
  const [botIdentityAllowedUserIds, setBotIdentityAllowedUserIds] = useState<string[]>([]);
  const [botIdentityAllowedRoleIds, setBotIdentityAllowedRoleIds] = useState<string[]>([]);
  const [botIdentityAiAutoReplyEnabled, setBotIdentityAiAutoReplyEnabled] = useState(false);
  const [botIdentityAiCounterpartyGuide, setBotIdentityAiCounterpartyGuide] = useState('');
  const [replyTarget, setReplyTarget] = useState<TimelineEvent | null>(null);
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const [conversationSearchValue, setConversationSearchValue] = useState('');
  const [forwardingNote, setForwardingNote] = useState<any | null>(null);
  const [forwardTargetUserIds, setForwardTargetUserIds] = useState<string[]>([]);
  const [forwardMessageText, setForwardMessageText] = useState('');
  const [forwardSubmitting, setForwardSubmitting] = useState(false);
  const [chatGroups, setChatGroups] = useState<ChatGroupRow[]>([]);
  const [messageActivityDraft, setMessageActivityDraft] = useState<MessageActivityDraft | null>(null);
  const [refreshingMessages, setRefreshingMessages] = useState(false);
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [orgDisplayName, setOrgDisplayName] = useState('');
  const [reelBootstrapped, setReelBootstrapped] = useState(false);
  const [localReadThroughByConversation, setLocalReadThroughByConversation] = useState<Record<string, string>>({});
  const [likedOverrides, setLikedOverrides] = useState<Record<string, boolean>>({});
  const [internalGroupModalOpen, setInternalGroupModalOpen] = useState(false);
  const [internalGroupName, setInternalGroupName] = useState('');
  const [internalGroupUserIds, setInternalGroupUserIds] = useState<string[]>([]);
  const [internalGroupRoleIds, setInternalGroupRoleIds] = useState<string[]>([]);
  const [internalGroupSaving, setInternalGroupSaving] = useState(false);
  const [editingInternalGroupId, setEditingInternalGroupId] = useState<string | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const lastTimelineConversationRef = useRef('');
  const markReadDedupeRef = useRef('');
  const liveData = useMessagingOmniLiveData();
  const cacheScopeKey = liveData.profile.orgId || liveData.profile.id || 'messaging-v2';
  const internalConversations = useNotificationConversationList({
    supabase,
    section: 'notes',
    enabled: Boolean(liveData.profile.id),
    cacheScopeKey,
  });
  const selectedInternalSourceKey = getInternalSourceConversationKey(selectedKey);
  const internalTimeline = useInternalConversationTimeline<any>({
    supabase,
    enabled: Boolean(liveData.profile.id && selectedInternalSourceKey),
    conversationKey: selectedInternalSourceKey,
    pageSize: 40,
    cacheScopeKey,
  });
  const refreshInternalConversations = internalConversations.refresh;
  const refreshInternalTimeline = internalTimeline.refresh;
  const [assigneeDirectory, setAssigneeDirectory] = useState<AssigneeDirectory>({ users: [], roles: [] });
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [internalRecordTitleMap, setInternalRecordTitleMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!liveData.profile.orgId) {
      setOrgLogoUrl(null);
      setOrgDisplayName('');
      return;
    }
    let disposed = false;
    void loadScopedCompanySettings(supabase).then(({ data }) => {
      if (!disposed) {
        setOrgLogoUrl(String(data?.logo_url || '').trim() || null);
        setOrgDisplayName(String(data?.trade_name || data?.company_full_name || '').trim());
      }
    }).catch(() => {
      if (!disposed) {
        setOrgLogoUrl(null);
        setOrgDisplayName('');
      }
    });
    return () => {
      disposed = true;
    };
  }, [liveData.profile.orgId]);
  useEffect(() => {
    if (!liveData.profile.id) return;
    let disposed = false;
    setMentionsLoading(true);
    void fetchAssigneeDirectory(supabase).then((directory) => {
      if (!disposed) setAssigneeDirectory(directory);
    }).catch((error: any) => {
      if (!disposed) message.error(toFaErrorMessage(error, 'خواندن فهرست منشن ناموفق بود.'));
    }).finally(() => {
      if (!disposed) setMentionsLoading(false);
    });
    return () => {
      disposed = true;
    };
  }, [liveData.profile.id, message]);
  useEffect(() => {
    const orgId = String(liveData.profile.orgId || '').trim();
    if (!orgId) {
      setChatGroups([]);
      return;
    }
    let disposed = false;
    void (async () => {
      try {
        const attempts = [
          { select: 'id,name,user_ids,role_ids', orderByName: true },
          { select: 'id,user_ids,role_ids', orderByName: false },
        ];
        let loadedRows: any[] | null = null;
        let lastError: any = null;
        for (const attempt of attempts) {
          let query = supabase
            .from('chat_groups')
            .select(attempt.select)
            .eq('org_id', orgId)
            .limit(120);
          query = attempt.orderByName
            ? query.order('name', { ascending: true })
            : query.order('id', { ascending: true });
          const { data, error } = await query;
          if (!error) {
            loadedRows = data || [];
            break;
          }
          lastError = error;
          const compatibleMissingColumn = (
            isMissingColumnError(error, 'name')
            || isMissingColumnError(error, 'metadata')
          );
          if (!compatibleMissingColumn) break;
        }
        if (disposed) return;
        if (lastError && loadedRows === null) throw lastError;
        setChatGroups((loadedRows || []).map((row: any) => ({
          ...row,
          name: String(row?.name || '').trim() || 'گروه داخلی',
          metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : null,
        })) as ChatGroupRow[]);
      } catch (error: any) {
        if (disposed) return;
        if (isMissingTableLikeError(error) || isMissingColumnError(error, 'user_ids') || isMissingColumnError(error, 'role_ids')) {
          setChatGroups([]);
          return;
        }
        message.error(toFaErrorMessage(error, 'خواندن گروه‌های داخلی ناموفق بود.'));
      }
    })();
    return () => {
      disposed = true;
    };
  }, [liveData.profile.orgId, message]);
  const mentionOptions = useMemo(() => [
    ...assigneeDirectory.users.map((user) => ({
      label: `عضو: ${user.display_name}`,
      value: `user:${user.id}`,
    })),
    ...assigneeDirectory.roles.map((role) => ({
      label: `نقش: ${role.title}`,
      value: `role:${role.id}`,
    })),
  ], [assigneeDirectory.roles, assigneeDirectory.users]);
  const directoryUserMap = useMemo(() => {
    const map: Record<string, AssigneeDirectory['users'][number]> = {};
    assigneeDirectory.users.forEach((user) => {
      if (user.id) map[user.id] = user;
    });
    return map;
  }, [assigneeDirectory.users]);
  const roleLookup = useMemo(() => {
    const map: Record<string, string> = {};
    assigneeDirectory.roles.forEach((role) => {
      if (role.id) map[role.id] = role.title;
    });
    return map;
  }, [assigneeDirectory.roles]);

  const refreshMessagingSurface = async () => {
    if (refreshingMessages) return;
    setRefreshingMessages(true);
    try {
      await Promise.all([
        liveData.refresh(),
        refreshInternalConversations({ force: true }),
        selectedInternalSourceKey
          ? refreshInternalTimeline({ force: true })
          : Promise.resolve(null),
      ]);
      message.success('پیام‌ها بروزرسانی شدند.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'بروزرسانی پیام‌ها ناموفق بود.'));
    } finally {
      setRefreshingMessages(false);
    }
  };

  useEffect(() => {
    const references = (internalTimeline.items || [])
      .map((row: any) => ({
        module_id: String(row?.module_id || '').trim(),
        record_id: String(row?.record_id || '').trim(),
      }))
      .filter((item) => item.module_id && item.record_id);
    if (!references.length) return;
    void fetchRecordReferenceLabels(supabase, references).then((labels) => {
      setInternalRecordTitleMap((prev) => ({ ...prev, ...labels }));
    }).catch(() => undefined);
  }, [internalTimeline.items]);
  useEffect(() => {
    const orgId = String(liveData.profile.orgId || '').trim();
    const profileId = String(liveData.profile.id || '').trim();
    if (!orgId || !profileId) return;
    let channel = supabase
      .channel(`messaging-v2-internal-${orgId}-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `org_id=eq.${orgId}` }, () => {
        void refreshInternalConversations({ force: true });
        void refreshInternalTimeline({ force: true });
      })
      .subscribe();
    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null as any;
      }
    };
  }, [liveData.profile.id, liveData.profile.orgId, refreshInternalConversations, refreshInternalTimeline]);
  const internalConversationsReady = !internalConversations.available || internalConversations.items !== null;
  useEffect(() => {
    if (reelBootstrapped) return;
    if (!liveData.profile.id || !internalConversationsReady) return;
    setReelBootstrapped(true);
  }, [internalConversationsReady, liveData.profile.id, reelBootstrapped]);
  const reelInitialLoading = !reelBootstrapped;
  const liveInternalConversations = useMemo(
    () => mergeDirectoryDirectConversations(
      ensureInternalSpecialConversations(
        buildInternalLiveConversations(internalConversations.items),
        Boolean(liveData.profile.id && internalConversationsReady),
        orgLogoUrl,
      ),
      assigneeDirectory.users,
      String(liveData.profile.id || ''),
      roleLookup,
    ),
    [assigneeDirectory.users, internalConversations.items, internalConversationsReady, liveData.profile.id, orgLogoUrl, roleLookup],
  );
  const liveInternalEvents = useMemo<TimelineEvent[]>(() => {
    if (!selectedInternalSourceKey) return [];
    const activeConversationKey = getLiveInternalConversationKey(selectedInternalSourceKey);
    return (internalTimeline.items || []).map((row: any) => {
      const parsed = parseNoteContent(row?.content ?? row?.body ?? row?.message_text ?? '');
      const mentionUsers = normalizeIdArray(row?.mention_user_ids)
        .map((id) => directoryUserMap[id]?.display_name || '')
        .filter(Boolean);
      const mentionRoles = normalizeIdArray(row?.mention_role_ids)
        .map((id) => roleLookup[id] || '')
        .filter(Boolean);
      const recordKey = buildRecordReferenceKey(row?.module_id, row?.record_id);
      const moduleLabel = getModuleLabelFa(row?.module_id);
      const recordTitle = recordKey ? internalRecordTitleMap[recordKey] : '';
      const relatedRecordLabel = moduleLabel || recordTitle
        ? [moduleLabel, recordTitle].filter(Boolean).join(' - ')
        : '';
      const likes = likeReceiptMapFromBox(row?.metadata);
      const readReceipts = readReceiptMapFromBox(row?.metadata);
      const currentUserId = String(liveData.profile.id || '').trim();
      const direction = isInternalSystemNote(row)
        ? 'system'
        : String(row?.author_id || '').trim() && String(row?.author_id || '').trim() === String(liveData.profile.id || '').trim()
          ? 'outbound'
          : 'inbound';
      const author = direction === 'system'
        ? 'پیام‌های سیستم'
        : direction === 'outbound'
          ? String(row?.author_name || directoryUserMap[currentUserId]?.display_name || '').trim() || 'من'
          : String(row?.author_name || directoryUserMap[String(row?.author_id || '')]?.display_name || '').trim() || 'کاربر سیستم';
      return {
        id: `live-internal-${String(row?.id || row?.created_at || Math.random())}`,
        sourceRow: row,
        conversationKey: activeConversationKey,
        kind: 'message' as const,
        direction,
        author,
        text: parsed.text || (parsed.attachments.length ? '' : 'پیام داخلی'),
        time: safeJalaliFormat(row?.created_at, 'YYYY/MM/DD HH:mm') || '',
        status: direction === 'outbound' ? 'ارسال شده' : undefined,
        seenAt: direction === 'outbound' ? (Object.keys(readReceipts).length > 0 ? 'وضعیت خوانده‌شدن' : 'ارسال شده') : undefined,
        replyTo: String(row?.reply_to || '').trim() || null,
        attachments: parsed.attachments.map((attachment) => ({
          name: attachment.name || 'فایل',
          kind: getNoteAttachmentKind(attachment),
          url: attachment.url || null,
          mimeType: attachment.mimeType || null,
        })),
        mentionUsers,
        mentionRoles,
        avatarUrl: String(row?.sender_avatar_url || row?.avatar_url || directoryUserMap[String(row?.author_id || '')]?.avatar_url || '').trim() || null,
        relatedRecordLabel: relatedRecordLabel || undefined,
        liked: Boolean(currentUserId && likes[currentUserId]),
      };
    });
  }, [
    directoryUserMap,
    internalRecordTitleMap,
    internalTimeline.items,
    liveData.profile.id,
    roleLookup,
    selectedInternalSourceKey,
  ]);
  const displayConversations = useMemo(() => {
    if (reelInitialLoading) return [];
    const liveInternal = liveInternalConversations;
    const liveBotGroups = liveData.conversations.filter((conversation) => conversation.channel === 'bot_group');
    const liveBotDirect = liveData.conversations.filter((conversation) => conversation.channel === 'bot_direct');
    const liveSms = liveData.conversations.filter((conversation) => conversation.channel === 'sms');
    const liveCalls = liveData.conversations.filter((conversation) => conversation.channel === 'call');
    return sortConversationsByActivity([
      ...liveInternal,
      ...liveBotGroups,
      ...liveBotDirect,
      ...liveSms,
      ...liveCalls,
    ].map((conversation) => applyLocalReadThrough(conversation, localReadThroughByConversation)));
  }, [liveData.conversations, liveInternalConversations, localReadThroughByConversation, reelInitialLoading]);
  const displayEvents = useMemo<TimelineEvent[]>(() => {
    const currentUserId = String(liveData.profile.id || '').trim();
    const currentUser = currentUserId ? directoryUserMap[currentUserId] : null;
    const normalizedLiveEvents = liveData.events.map((item) => (
      item.direction === 'outbound'
        ? {
          ...item,
          author: String(currentUser?.display_name || item.author || '').trim() || 'من',
          avatarUrl: String((item as any).avatarUrl || currentUser?.avatar_url || '').trim() || null,
        }
        : item
    ));
    return [
      ...liveInternalEvents,
      ...normalizedLiveEvents,
    ] as TimelineEvent[];
  }, [directoryUserMap, liveData.events, liveData.profile.id, liveInternalEvents]);
  const activeConversation = displayConversations.find((conversation) => conversation.key === selectedKey) || displayConversations[0] || emptyConversation;
  const activeEventsRaw = useMemo(
    () => displayEvents.filter((item) => item.conversationKey === activeConversation.key),
    [activeConversation.key, displayEvents],
  );
  const activeEvents = useMemo<TimelineEvent[]>(() => {
    const eventBySourceId = new Map<string, TimelineEvent>();
    activeEventsRaw.forEach((item) => {
      const sourceId = String(item.sourceRow?.id || '').trim();
      if (sourceId) eventBySourceId.set(sourceId, item);
      const providerMessageId = String(item.sourceRow?.provider_message_id || '').trim();
      if (providerMessageId) eventBySourceId.set(providerMessageId, item);
      eventBySourceId.set(item.id, item);
    });
    return activeEventsRaw.map((item) => {
      const replyId = String(item.replyTo || item.sourceRow?.reply_to || '').trim();
      const sourceId = String(item.sourceRow?.id || item.id || '').trim();
      const itemWithLikeOverride = Object.prototype.hasOwnProperty.call(likedOverrides, sourceId)
        ? { ...item, liked: likedOverrides[sourceId] }
        : item;
      if (!replyId) return itemWithLikeOverride;
      const replyTarget = eventBySourceId.get(replyId);
      if (!replyTarget) return itemWithLikeOverride;
      return {
        ...itemWithLikeOverride,
        replyPreviewAuthor: replyTarget.author,
        replyPreviewText: replyTarget.text,
        replyPreviewAttachments: replyTarget.attachments || [],
      };
    });
  }, [activeEventsRaw, likedOverrides]);
  const normalizedConversationSearch = String(conversationSearchValue || '').trim().toLocaleLowerCase('fa');
  const visibleActiveEvents = useMemo(() => {
    if (!normalizedConversationSearch) return activeEvents;
    return activeEvents.filter((item) => [
      item.author,
      item.text,
      item.status,
      item.relatedRecordLabel,
      item.replyPreviewAuthor,
      item.replyPreviewText,
      ...(item.mentionUsers || []),
      ...(item.mentionRoles || []),
      ...(item.attachments || []).map((attachment) => attachment.name),
    ].some((value) => String(value || '').toLocaleLowerCase('fa').includes(normalizedConversationSearch)));
  }, [activeEvents, normalizedConversationSearch]);
  const activeUnreadEventIds = useMemo(() => {
    const unreadCount = Math.max(0, Number(activeConversation?.unread || 0));
    if (!unreadCount) return new Set<string>();
    const candidates = activeEvents
      .filter((item) => item.direction !== 'outbound')
      .slice(-unreadCount);
    return new Set(candidates.map((item) => item.id));
  }, [activeConversation?.unread, activeEvents]);

  useLayoutEffect(() => {
    const node = timelineViewportRef.current;
    if (!node || !activeConversation?.key) return;
    const conversationChanged = lastTimelineConversationRef.current !== activeConversation.key;
    lastTimelineConversationRef.current = activeConversation.key;
    if (conversationChanged || activeEvents.length > 0) {
      node.scrollTop = node.scrollHeight;
    }
  }, [activeConversation?.key, activeEvents.length]);

  useEffect(() => {
    const normalizedInitialKey = String(initialConversationKey || '').trim();
    if (!normalizedInitialKey) return;
    setSelectedKey(normalizedInitialKey);
  }, [initialConversationKey]);

  useEffect(() => {
    if (!displayConversations.length) return;
    if (displayConversations.some((conversation) => conversation.key === selectedKey)) return;
    const defaultConversation = displayConversations.find((conversation) => conversation.channel === 'internal') || displayConversations[0];
    setSelectedKey(defaultConversation.key);
  }, [displayConversations, selectedKey]);

  useEffect(() => {
    if (!activeConversation.key || !activeEvents.length || !activeConversation.unread) return;
    const currentUserId = String(liveData.profile.id || '').trim();
    const readableEvents = activeEvents.filter((item) => {
      const id = String(item.sourceRow?.id || '').trim();
      if (!id) return false;
      if (activeConversation.channel === 'internal') {
        return item.direction !== 'outbound' && String(item.sourceRow?.author_id || '').trim() !== currentUserId;
      }
      if (activeConversation.channel === 'bot_group' || activeConversation.channel === 'bot_direct') {
        return item.direction === 'inbound';
      }
      if (activeConversation.channel === 'sms') {
        return item.direction === 'inbound';
      }
      if (activeConversation.channel === 'call') {
        return item.direction === 'inbound';
      }
      return false;
    });
    if (!readableEvents.length) return;
    const latestAt = readableEvents.map(getEventActivityAt).filter(Boolean).sort().at(-1) || activeConversation.lastActivityAt || new Date().toISOString();
    const dedupeKey = `${activeConversation.key}:${latestAt}:${readableEvents.length}`;
    if (markReadDedupeRef.current === dedupeKey) return;
    markReadDedupeRef.current = dedupeKey;
    setLocalReadThroughByConversation((prev) => ({ ...prev, [activeConversation.key]: latestAt }));

    const entries: Array<{ section: any; sourceType: string; sourceId: string }> = [];
    readableEvents.forEach((item) => {
      const sourceId = String(item.sourceRow?.id || '').trim();
      if (!sourceId) return;
      if (activeConversation.channel === 'internal') {
        entries.push({ section: 'notes', sourceType: 'note', sourceId });
      } else if (activeConversation.channel === 'bot_group') {
        entries.push({ section: 'bot_messages', sourceType: 'counterparty_bot_message', sourceId });
      } else if (activeConversation.channel === 'bot_direct') {
        entries.push({ section: 'bot_direct_messages', sourceType: 'counterparty_bot_direct_message', sourceId });
      } else if (activeConversation.channel === 'sms') {
        entries.push({ section: 'sms_messages', sourceType: 'inbound_sms', sourceId });
      } else if (activeConversation.channel === 'call') {
        entries.push({ section: 'voip_calls', sourceType: 'voip_call', sourceId });
      }
    });

    void (async () => {
      if (activeConversation.channel === 'internal' && selectedInternalSourceKey && selectedInternalSourceKey !== MY_NOTES_CONVERSATION_KEY) {
        await notificationRuntime.markCommunicationRead('internal', selectedInternalSourceKey, readableEvents.map((item) => ({
          id: item.sourceRow?.id,
          created_at: getEventActivityAt(item),
        })));
      } else if (activeConversation.channel === 'bot_group') {
        const groupId = activeConversation.key.replace(/^live:bot_group:/, '');
        if (groupId) {
          await notificationRuntime.markCommunicationRead('bot', `bot:${groupId}`, readableEvents.map((item) => ({
            id: item.sourceRow?.id,
            created_at: getEventActivityAt(item),
          })));
        }
      } else if (activeConversation.channel === 'bot_direct') {
        const threadId = activeConversation.key.replace(/^live:bot_direct:/, '');
        const thread = liveData.botDirectThreads.find((item: any) => String(item?.id || '').trim() === threadId);
        const channel = String(thread?.channel_type || '').trim();
        const chatId = String(thread?.chat_id || '').trim();
        if (channel && chatId) {
          await notificationRuntime.markCommunicationRead('bot', `bot:direct:${channel}:${chatId}`, readableEvents.map((item) => ({
            id: item.sourceRow?.id,
            created_at: getEventActivityAt(item),
          })));
        }
      }
      if (entries.length) await notificationRuntime.markEntriesRead(entries);
      if (activeConversation.channel === 'internal') {
        await refreshInternalConversations({ force: true });
      } else {
        await liveData.refresh();
      }
    })();
  }, [
    activeConversation.channel,
    activeConversation.key,
    activeConversation.lastActivityAt,
    activeConversation.unread,
    activeEvents,
    liveData,
    liveData.profile.id,
    notificationRuntime,
    refreshInternalConversations,
    selectedInternalSourceKey,
  ]);

  const selectConversation = (key: string) => {
    setSelectedKey(key);
    setReplyTarget(null);
    setConversationSearchOpen(false);
    setConversationSearchValue('');
    setConversationListOpen(false);
  };

  const changeConversationFilter = (value: ChannelKind | 'all') => {
    setConversationFilter(value);
  };

  const toggleConversationSearch = () => {
    setConversationSearchOpen((prev) => {
      if (prev) setConversationSearchValue('');
      return !prev;
    });
  };

  const startConversationCall = (conversation: Conversation) => {
    const phone = String(conversation.phone || conversation.subtitle || '').replace(/[^\d+]/g, '');
    if (!phone) {
      message.warning('شماره تماس برای این گفتگو پیدا نشد.');
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  const closePhoneBindModal = () => {
    setPhoneBindOpen(false);
    setPhoneBindLoading(false);
    setPhoneBindSaving(false);
    setPhoneBindDraft(null);
    setPhoneBindTargetModuleId('customers');
    setPhoneBindTargetRecordId(null);
    setPhoneBindSearch('');
    setPhoneBindOptions([]);
  };

  const openPhoneBindModal = async (conversation: Conversation) => {
    const normalizedPhone = String(conversation.phone || conversation.subtitle || '').trim();
    if (!normalizedPhone || !conversation.key.startsWith('live:')) {
      message.warning('برای این گفتگو شماره قابل اتصال پیدا نشد.');
      return;
    }

    setPhoneBindOpen(true);
    setPhoneBindLoading(true);
    try {
      const normalizedPhoneNumberId = String(conversation.phoneNumberId || '').trim() || null;
      let existingBindingLabel = '';
      let existingTargetModuleId: PhoneBindTargetModuleId | null = null;
      let existingTargetRecordId: string | null = null;

      if (normalizedPhoneNumberId) {
        const { data, error } = await supabase
          .from('phone_number_links')
          .select('entity_type,entity_id,display_title,source_table,source_field')
          .eq('phone_number_id', normalizedPhoneNumberId);
        if (error) throw error;
        const manualBinding = (Array.isArray(data) ? data : []).find((row: any) => (
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

      if (!existingTargetModuleId && PHONE_BIND_TARGET_MODULES.includes(String(conversation.relatedModuleId || '').trim() as PhoneBindTargetModuleId)) {
        existingTargetModuleId = String(conversation.relatedModuleId || '').trim() as PhoneBindTargetModuleId;
        existingTargetRecordId = String(conversation.relatedRecordId || '').trim() || null;
        existingBindingLabel = String(conversation.relatedRecordTitle || '').trim();
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

      setPhoneBindDraft({
        phone: normalizedPhone,
        phoneNumberId: normalizedPhoneNumberId,
        phoneMatchStatus: String(conversation.phoneMatchStatus || '').trim() || null,
        existingBindingLabel: existingBindingLabel || null,
      });
      setPhoneBindTargetModuleId(existingTargetModuleId || 'customers');
      setPhoneBindTargetRecordId(existingTargetRecordId || null);
      setPhoneBindSearch('');
      setPhoneBindOptions(existingTargetRecordId && existingBindingLabel ? [{
        value: existingTargetRecordId,
        label: existingBindingLabel,
      }] : []);
    } catch (error: any) {
      setPhoneBindOpen(false);
      message.error(toFaErrorMessage(error, 'خواندن اطلاعات اتصال شماره ناموفق بود.'));
    } finally {
      setPhoneBindLoading(false);
    }
  };

  useEffect(() => {
    if (!phoneBindOpen) return;
    let disposed = false;
    setPhoneBindLoading(true);
    void searchPhoneBindingTargets({
      client: supabase,
      moduleId: phoneBindTargetModuleId,
      search: phoneBindSearch,
      limit: 20,
    }).then((options) => {
      if (disposed) return;
      setPhoneBindOptions((prev) => {
        const map = new Map<string, { value: string; label: string; meta?: string | null }>();
        prev.forEach((item) => {
          if (item.value === phoneBindTargetRecordId) map.set(item.value, item);
        });
        options.forEach((item) => map.set(item.value, item));
        return Array.from(map.values());
      });
    }).catch((error: any) => {
      if (!disposed) message.error(toFaErrorMessage(error, 'جستجوی مخاطب ناموفق بود.'));
    }).finally(() => {
      if (!disposed) setPhoneBindLoading(false);
    });
    return () => {
      disposed = true;
    };
  }, [message, phoneBindOpen, phoneBindSearch, phoneBindTargetModuleId, phoneBindTargetRecordId]);

  const closeBotIdentityBindModal = () => {
    setBotIdentityBindOpen(false);
    setBotIdentityBindLoading(false);
    setBotIdentityBindSaving(false);
    setBotIdentityBindDraft(null);
    setBotIdentityBindTargetModuleId('customers');
    setBotIdentityBindTargetRecordId(null);
    setBotIdentityBindSearch('');
    setBotIdentityBindOptions([]);
    setBotIdentityAllowedUserIds([]);
    setBotIdentityAllowedRoleIds([]);
    setBotIdentityAiAutoReplyEnabled(false);
    setBotIdentityAiCounterpartyGuide('');
  };

  const openBotIdentityBindModalForMessage = async (item: TimelineEvent) => {
    const channel = item.botSenderChannel || activeConversation?.platform || null;
    const chatId = String(item.botSenderChatId || '').trim();
    if (!channel || !BOT_CHANNELS.includes(channel) || !chatId) {
      message.warning('برای این پیام chat id یکتای فرستنده پیدا نشد.');
      return;
    }
    setBotIdentityBindOpen(true);
    setBotIdentityBindLoading(true);
    try {
      const orgId = String(liveData.profile.orgId || '').trim();
      const [bindingResult, threadResult] = await Promise.all([
        supabase
          .from('bot_chat_identity_bindings')
          .select('target_module_id,target_record_id,display_name,username,phone_number')
          .eq('org_id', orgId)
          .eq('channel_type', channel)
          .eq('chat_id', chatId)
          .maybeSingle(),
        supabase
          .from('counterparty_bot_direct_threads')
          .select('metadata,display_name,username,phone_number,target_module_id,target_record_id')
          .eq('org_id', orgId)
          .eq('channel_type', channel)
          .eq('chat_id', chatId)
          .maybeSingle(),
      ]);
      if (bindingResult.error) throw bindingResult.error;
      if (threadResult.error) throw threadResult.error;
      const existingBinding = (bindingResult.data || null) as BotIdentityBindingRow | null;
      const threadRow = (threadResult.data || null) as Record<string, any> | null;
      const metadata = threadRow?.metadata && typeof threadRow.metadata === 'object' ? threadRow.metadata : {};
      const initialTargetModuleId = isBotTargetModuleId(String(existingBinding?.target_module_id || '').trim())
        ? String(existingBinding?.target_module_id || '').trim() as BotTargetModuleId
        : isBotTargetModuleId(String(threadRow?.target_module_id || '').trim())
          ? String(threadRow?.target_module_id || '').trim() as BotTargetModuleId
          : 'customers';
      const initialTargetRecordId = String(existingBinding?.target_record_id || threadRow?.target_record_id || '').trim() || null;
      const initialDisplayName = String(item.botSenderDisplayName || existingBinding?.display_name || threadRow?.display_name || item.author || '').trim();
      setBotIdentityBindDraft({
        channel,
        chatId,
        displayName: initialDisplayName,
        username: String(item.botSenderUsername || existingBinding?.username || threadRow?.username || '').trim().replace(/^@+/, ''),
        phoneNumber: String(item.botSenderPhoneNumber || existingBinding?.phone_number || threadRow?.phone_number || '').trim(),
        existingBinding,
      });
      setBotIdentityBindTargetModuleId(initialTargetModuleId);
      setBotIdentityBindTargetRecordId(initialTargetRecordId);
      setBotIdentityBindSearch('');
      setBotIdentityBindOptions(initialTargetRecordId && initialDisplayName ? [{
        value: initialTargetRecordId,
        label: initialDisplayName,
      }] : []);
      setBotIdentityAllowedUserIds(Array.isArray((metadata as any)?.allowed_user_ids) ? (metadata as any).allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean) : []);
      setBotIdentityAllowedRoleIds(Array.isArray((metadata as any)?.allowed_role_ids) ? (metadata as any).allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean) : []);
      setBotIdentityAiAutoReplyEnabled(Boolean((metadata as any)?.ai_auto_reply_enabled));
      setBotIdentityAiCounterpartyGuide(String((metadata as any)?.ai_counterparty_guide || '').trim());
    } catch (error: any) {
      setBotIdentityBindOpen(false);
      message.error(toFaErrorMessage(error, 'خواندن اتصال فرستنده بات ناموفق بود.'));
    } finally {
      setBotIdentityBindLoading(false);
    }
  };

  useEffect(() => {
    if (!botIdentityBindOpen) return;
    let disposed = false;
    setBotIdentityBindLoading(true);
    void searchPhoneBindingTargets({
      client: supabase,
      moduleId: botIdentityBindTargetModuleId,
      search: botIdentityBindSearch,
      limit: 20,
    }).then((options) => {
      if (disposed) return;
      setBotIdentityBindOptions((prev) => {
        const map = new Map<string, { value: string; label: string; meta?: string | null }>();
        prev.forEach((item) => {
          if (item.value === botIdentityBindTargetRecordId) map.set(item.value, item);
        });
        options.forEach((item) => map.set(item.value, item));
        return Array.from(map.values());
      });
    }).catch((error: any) => {
      if (!disposed) message.error(toFaErrorMessage(error, 'جستجوی مخاطب بات ناموفق بود.'));
    }).finally(() => {
      if (!disposed) setBotIdentityBindLoading(false);
    });
    return () => {
      disposed = true;
    };
  }, [botIdentityBindOpen, botIdentityBindSearch, botIdentityBindTargetModuleId, botIdentityBindTargetRecordId, message]);

  const saveBotIdentityBind = async () => {
    const draft = botIdentityBindDraft;
    const orgId = String(liveData.profile.orgId || '').trim();
    const targetRecordId = String(botIdentityBindTargetRecordId || '').trim();
    if (!draft || !orgId) {
      message.error('اطلاعات لازم برای اتصال فرستنده بات کامل نیست.');
      return;
    }
    if (!targetRecordId) {
      message.warning('مخاطب مقصد را انتخاب کنید.');
      return;
    }
    setBotIdentityBindSaving(true);
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
        displayName: draft.displayName || null,
      });
      const { error: threadError } = await supabase
        .from('counterparty_bot_direct_threads')
        .update({
          metadata: {
            allowed_user_ids: botIdentityAllowedUserIds,
            allowed_role_ids: botIdentityAllowedRoleIds,
            ai_auto_reply_enabled: botIdentityAiAutoReplyEnabled,
            ai_counterparty_guide: String(botIdentityAiCounterpartyGuide || '').trim() || null,
          },
          last_seen_at: new Date().toISOString(),
        })
        .eq('org_id', orgId)
        .eq('channel_type', draft.channel)
        .eq('chat_id', draft.chatId);
      if (threadError) throw threadError;
      await liveData.refresh();
      message.success('اتصال فرستنده بات ذخیره شد.');
      closeBotIdentityBindModal();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره اتصال فرستنده بات ناموفق بود.'));
    } finally {
      setBotIdentityBindSaving(false);
    }
  };

  const savePhoneBind = async () => {
    const draft = phoneBindDraft;
    const orgId = String(liveData.profile.orgId || '').trim();
    const targetRecordId = String(phoneBindTargetRecordId || '').trim();
    if (!draft || !orgId) {
      message.error('اطلاعات لازم برای اتصال شماره کامل نیست.');
      return;
    }
    if (!targetRecordId) {
      message.warning('مخاطب مقصد را انتخاب کنید.');
      return;
    }
    setPhoneBindSaving(true);
    try {
      await syncPhoneIdentityBinding({
        client: supabase,
        orgId,
        moduleId: phoneBindTargetModuleId,
        recordId: targetRecordId,
        phone: draft.phone,
        phoneNumberId: draft.phoneNumberId,
      });
      await liveData.refresh();
      message.success('اتصال شماره ذخیره شد.');
      closePhoneBindModal();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره اتصال شماره ناموفق بود.'));
    } finally {
      setPhoneBindSaving(false);
    }
  };

  const availableDirectUsers = useMemo(() => assigneeDirectory.users.map((user) => ({
    id: String(user.id || '').trim(),
    display_name: String(user.display_name || '').trim() || 'کاربر',
    role_id: user.role_id || null,
  })).filter((user) => user.id), [assigneeDirectory.users]);
  const internalGroupUserOptions = useMemo(() => assigneeDirectory.users
    .map((user) => {
      const id = String(user.id || '').trim();
      if (!id) return null;
      const roleLabel = String(user.job_title || roleLookup[String(user.role_id || '')] || '').trim();
      return {
        value: id,
        label: roleLabel ? `${user.display_name} - ${roleLabel}` : user.display_name,
      };
    })
    .filter(Boolean) as Array<{ value: string; label: string }>, [assigneeDirectory.users, roleLookup]);
  const internalGroupRoleOptions = useMemo(() => assigneeDirectory.roles
    .map((role) => ({
      value: String(role.id || '').trim(),
      label: String(role.title || '').trim() || 'نقش',
    }))
    .filter((role) => role.value), [assigneeDirectory.roles]);

  const chatGroupMap = useMemo(() => {
    const map: Record<string, ChatGroupRow> = {};
    chatGroups.forEach((group) => {
      const id = String(group?.id || '').trim();
      if (id) map[id] = group;
    });
    return map;
  }, [chatGroups]);

  const getChatGroupPayload = (group: ChatGroupRow | null | undefined) => {
    if (!group) {
      return {
        mentionUserIds: [] as string[],
        mentionRoleIds: [] as string[],
        metadata: null as Record<string, any> | null,
      };
    }
    const currentUserId = String(liveData.profile.id || '').trim();
    return {
      mentionUserIds: normalizeIdArray(group.user_ids).filter((id) => id !== currentUserId),
      mentionRoleIds: normalizeIdArray(group.role_ids),
      metadata: { chat_group_id: String(group.id) },
    };
  };

  const openCreateInternalGroupModal = () => {
    setEditingInternalGroupId(null);
    setInternalGroupName('');
    setInternalGroupUserIds([]);
    setInternalGroupRoleIds([]);
    setInternalGroupModalOpen(true);
  };

  const openEditInternalGroupModal = (conversation: Conversation) => {
    const sourceConversationKey = String(conversation.sourceConversationKey || getInternalSourceConversationKey(conversation.key) || '').trim();
    const groupId = getChatGroupSelectionId(sourceConversationKey);
    const group = groupId ? chatGroupMap[groupId] : null;
    if (!groupId || !group) {
      message.warning('اطلاعات گروه داخلی برای ویرایش پیدا نشد.');
      return;
    }
    setEditingInternalGroupId(groupId);
    setInternalGroupName(String(group.name || '').trim() || conversation.title || 'گروه داخلی');
    setInternalGroupUserIds(normalizeIdArray(group.user_ids));
    setInternalGroupRoleIds(normalizeIdArray(group.role_ids));
    setInternalGroupModalOpen(true);
  };

  const saveInternalGroup = async () => {
    const orgId = String(liveData.profile.orgId || '').trim();
    const authorId = String(liveData.profile.id || '').trim();
    const name = String(internalGroupName || '').trim();
    const editingGroupId = String(editingInternalGroupId || '').trim();
    if (!orgId || !authorId) {
      message.error('اطلاعات سازمان یا کاربر کامل نیست.');
      return;
    }
    if (!name) {
      message.warning('نام گروه را وارد کنید.');
      return;
    }
    const userIds = Array.from(new Set([authorId, ...internalGroupUserIds.map((id) => String(id || '').trim()).filter(Boolean)]));
    const roleIds = Array.from(new Set(internalGroupRoleIds.map((id) => String(id || '').trim()).filter(Boolean)));
    if (userIds.length <= 1 && roleIds.length === 0) {
      message.warning('حداقل یک عضو یا نقش برای گروه انتخاب کنید.');
      return;
    }
    setInternalGroupSaving(true);
    try {
      const basePayload = {
        name,
        user_ids: userIds,
        role_ids: roleIds,
      };
      const payload = {
        ...basePayload,
        metadata: { ...(editingGroupId ? (chatGroupMap[editingGroupId]?.metadata || {}) : {}), source: 'messaging_v2' },
      };
      const persistGroup = (candidatePayload: typeof payload | typeof basePayload, selectColumns: string) => (
        editingGroupId
          ? supabase
            .from('chat_groups')
            .update(candidatePayload)
            .eq('org_id', orgId)
            .eq('id', editingGroupId)
            .select(selectColumns)
            .single()
          : supabase
            .from('chat_groups')
            .insert([{
              org_id: orgId,
              ...candidatePayload,
              created_by: authorId,
            }])
            .select(selectColumns)
            .single()
      );
      let result: any = await persistGroup(payload, 'id,name,user_ids,role_ids,metadata');
      if (result.error && isMissingColumnError(result.error, 'metadata')) {
        result = await persistGroup(basePayload, 'id,name,user_ids,role_ids');
      }
      if (result.error) throw result.error;
      const data: any = result.data || {};
      const row = {
        ...data,
        name: String(data?.name || name).trim() || name,
        metadata: data?.metadata && typeof data.metadata === 'object' ? data.metadata : null,
      } as ChatGroupRow;
      setChatGroups((prev) => {
        const existingId = String(row.id || '').trim();
        return [...prev.filter((item) => String(item.id || '').trim() !== existingId), row];
      });
      await refreshInternalConversations({ force: true });
      setSelectedKey(getLiveInternalConversationKey(`${CHAT_GROUP_PREFIX}${row.id}`));
      setInternalGroupModalOpen(false);
      setEditingInternalGroupId(null);
      message.success(editingGroupId ? 'گروه داخلی ویرایش شد.' : 'گروه داخلی ایجاد شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, editingGroupId ? 'ویرایش گروه داخلی ناموفق بود.' : 'ایجاد گروه داخلی ناموفق بود.'));
    } finally {
      setInternalGroupSaving(false);
    }
  };

  const buildAttachmentNameText = (attachments: Array<{ name?: string; url?: string }>) => {
    const lines = (attachments || [])
      .map((item, index) => {
        const name = String(item?.name || `فایل ${index + 1}`).trim() || `فایل ${index + 1}`;
        const url = String(item?.url || '').trim();
        return url ? `[${name}](${url})` : name;
      })
      .filter(Boolean);
    return lines.length ? `پیوست‌ها:\n${lines.join('\n')}` : '';
  };

  const refreshForwardSection = async (section: 'notes' | 'bot_messages' | 'bot_direct_messages', options?: { force?: boolean }) => {
    if (section === 'notes') {
      await Promise.all([
        refreshInternalConversations(options),
        refreshInternalTimeline(options),
      ]);
      return;
    }
    await liveData.refresh();
  };

  const confirmBotSmsNotificationText = (initialText: string) => new Promise<{ text: string; remember: boolean } | null>((resolve) => {
    let latest = { text: initialText, remember: false };
    Modal.confirm({
      title: 'تأیید اطلاع‌رسانی پیامکی',
      okText: 'تأیید و ارسال',
      cancelText: 'انصراف',
      width: 560,
      content: (
        <BotSmsNotificationConfirmContent
          initialText={initialText}
          onChange={(value) => {
            latest = value;
          }}
        />
      ),
      onOk: () => {
        if (!String(latest.text || '').trim()) {
          message.warning('متن پیامک اطلاع‌رسانی خالی است.');
          return Promise.reject(new Error('empty sms notification text'));
        }
        resolve({ text: String(latest.text || '').trim(), remember: latest.remember });
        return undefined;
      },
      onCancel: () => resolve(null),
    });
  });

  const getBotConversationRow = (conversation: Conversation) => {
    if (conversation.channel === 'bot_group') {
      const groupId = String(conversation.key || '').replace(/^live:bot_group:/, '');
      return {
        table: 'counterparty_bot_groups' as const,
        id: groupId,
        row: (liveData.botGroups || []).find((item: any) => String(item?.id || '') === groupId) || null,
      };
    }
    if (conversation.channel === 'bot_direct') {
      const threadId = String(conversation.key || '').replace(/^live:bot_direct:/, '');
      return {
        table: 'counterparty_bot_direct_threads' as const,
        id: threadId,
        row: (liveData.botDirectThreads || []).find((item: any) => String(item?.id || '') === threadId) || null,
      };
    }
    return null;
  };

  const getBotSmsTemplateFromConversation = (conversation: Conversation) => {
    const rowInfo = getBotConversationRow(conversation);
    const metadata = rowInfo?.row?.metadata && typeof rowInfo.row.metadata === 'object' ? rowInfo.row.metadata : {};
    return String((metadata as any)?.sms_notification_template || '').trim();
  };

  const persistBotSmsNotificationTemplate = async (conversation: Conversation, text: string) => {
    const rowInfo = getBotConversationRow(conversation);
    if (!rowInfo?.id || !rowInfo.row) return;
    const metadata = rowInfo.row.metadata && typeof rowInfo.row.metadata === 'object' ? rowInfo.row.metadata : {};
    const { error } = await supabase
      .from(rowInfo.table)
      .update({
        metadata: {
          ...metadata,
          sms_notification_template: String(text || '').trim() || null,
          sms_notification_template_updated_at: new Date().toISOString(),
        },
      })
      .eq('id', rowInfo.id);
    if (error) throw error;
  };

  const resolveBotSmsRecipient = async (conversation: Conversation) => {
    const moduleId = String(conversation.relatedModuleId || '').trim() as PhoneBindTargetModuleId;
    const recordId = String(conversation.relatedRecordId || '').trim();
    if (!PHONE_BIND_TARGET_MODULES.includes(moduleId) || !recordId) {
      throw new Error('برای ارسال اطلاع‌رسانی پیامکی، گفتگوی بات باید به یک مخاطب، تأمین‌کننده یا کارمند متصل باشد.');
    }
    const select = moduleId === 'customers'
      ? 'id, full_name, business_name, legal_name, system_code, first_name, last_name, mobile_1, mobile_2, phone'
      : moduleId === 'suppliers'
        ? 'id, business_name, first_name, last_name, system_code, mobile_1, mobile_2, phone'
        : 'id, full_name, first_name, last_name, system_code, legacy_system_code, mobile_1, mobile_2, phone';
    const { data, error } = await supabase
      .from(moduleId)
      .select(select)
      .eq('id', recordId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('مخاطب متصل به گفتگوی بات پیدا نشد.');
    const phone = [
      (data as any)?.mobile_1,
      (data as any)?.mobile_2,
      (data as any)?.phone,
    ].map(normalizeIranMobileForSms).find(Boolean) || '';
    if (!phone) throw new Error('برای مخاطب متصل به گفتگوی بات، شماره موبایل معتبر ثبت نشده است.');
    return {
      phone,
      moduleId,
      recordId,
      title: buildPhoneTargetDisplayName(moduleId, data) || conversation.title,
    };
  };

  const prepareBotSmsNotification = async (conversation: Conversation) => {
    const recipient = await resolveBotSmsRecipient(conversation);
    const savedText = getBotSmsTemplateFromConversation(conversation);
    const platformLabel = conversation.platform ? BOT_CHANNEL_LABELS_FA[conversation.platform] : channelMeta[conversation.channel].label;
    const text = savedText || buildBotSmsNotificationText(orgDisplayName, platformLabel);
    if (savedText) return { ...recipient, text, remember: false };
    const confirmed = await confirmBotSmsNotificationText(text);
    if (!confirmed) return null;
    return { ...recipient, text: confirmed.text, remember: confirmed.remember };
  };

  const sendTextToBotGroup = async (group: any, text: string, options?: Record<string, any>) => {
    return sendCounterpartyBotGroupMessage({
      group,
      text,
      payload: options?.payload,
      messageType: options?.messageType,
      extraPayload: options?.extraPayload,
      fallbackText: options?.fallbackText,
      attachments: options?.attachments,
    });
  };

  const sendTextToBotDirectThread = async (thread: any, text: string, options?: Record<string, any>) => {
    const channel = String(thread?.channel_type || '').trim() as BotChannel;
    const chatId = String(thread?.chat_id || '').trim();
    if (!['rubika', 'telegram', 'bale'].includes(channel)) {
      throw new Error('کانال پیام شخصی بات معتبر نیست.');
    }
    if (!chatId) {
      throw new Error('شناسه چت این پی‌وی ثبت نشده است.');
    }
    const attachments = (options?.attachments || []) as NoteAttachment[];
    await sendBotMessageViaGateway({
      channel,
      chatId,
      text: String(text || '').trim(),
      attachments: attachments.length ? attachments : undefined,
      fallbackText: options?.fallbackText,
      moduleId: String(thread?.target_module_id || '').trim() || undefined,
      recordId: String(thread?.target_record_id || '').trim() || undefined,
    });
    const nowIso = new Date().toISOString();
    const { error: insertError } = await supabase
      .from('counterparty_bot_direct_messages')
      .insert([{
        org_id: String(liveData.profile.orgId || '').trim() || null,
        direct_thread_id: thread.id,
        channel_type: channel,
        chat_id: chatId,
        target_module_id: String(thread?.target_module_id || '').trim() || null,
        target_record_id: String(thread?.target_record_id || '').trim() || null,
        customer_id: String(thread?.target_module_id || '').trim() === 'customers' ? String(thread?.target_record_id || '').trim() || null : null,
        supplier_id: String(thread?.target_module_id || '').trim() === 'suppliers' ? String(thread?.target_record_id || '').trim() || null : null,
        employee_id: String(thread?.target_module_id || '').trim() === 'employees' ? String(thread?.target_record_id || '').trim() || null : null,
        profile_id: String(thread?.profile_id || '').trim() || null,
        direction: 'outbound',
        message_type: String(options?.messageType || (attachments.length ? 'file' : 'text')).trim() || 'text',
        content_text: String(text || '').trim() || null,
        file_url: String(attachments[0]?.url || '').trim() || null,
        file_name: String(attachments[0]?.name || '').trim() || null,
        mime_type: String(attachments[0]?.mimeType || '').trim() || null,
        created_by: String(liveData.profile.id || '').trim() || null,
        payload: {
          ...(options?.payload || {}),
          attachments,
        },
      }]);
    if (insertError) throw insertError;
    const { error: threadError } = await supabase
      .from('counterparty_bot_direct_threads')
      .update({
        last_outbound_at: nowIso,
        last_message_at: nowIso,
        last_message_preview: String(text || '').trim() || String(attachments[0]?.name || '').trim() || null,
      })
      .eq('id', thread.id);
    if (threadError) throw threadError;
  };

  const timelineAttachmentsToNoteAttachments = (item: TimelineEvent): NoteAttachment[] => (
    (item.attachments || [])
      .map((attachment) => ({
        name: attachment.name,
        url: attachment.url || '',
        mimeType: attachment.mimeType || null,
        fileType: attachment.kind,
      }))
      .filter((attachment) => String(attachment.url || '').trim())
  );

  const openForwardModal = (item: TimelineEvent) => {
    const sourceRow = item.sourceRow || {};
    if (activeConversation.channel === 'bot_group' || activeConversation.channel === 'bot_direct') {
      setForwardingNote({
        ...sourceRow,
        id: sourceRow?.id || item.id,
        content_text: sourceRow?.content_text || item.text,
        payload: sourceRow?.payload || {},
        __forward_source_type: 'bot',
      });
    } else {
      const hasNoteContent = typeof sourceRow?.content === 'string';
      setForwardingNote({
        ...sourceRow,
        id: sourceRow?.id || item.id,
        module_id: sourceRow?.module_id || activeConversation.relatedModuleId || null,
        record_id: sourceRow?.record_id || activeConversation.relatedRecordId || null,
        content: hasNoteContent ? sourceRow.content : serializeNoteContent(item.text, timelineAttachmentsToNoteAttachments(item)),
        __forward_source_type: 'note',
      });
    }
    setForwardTargetUserIds([]);
    setForwardMessageText('');
  };

  const openCreateActivityFromMessage = (item: TimelineEvent) => {
    const relatedModuleId = String(item.sourceRow?.module_id || item.sourceRow?.related_module_id || activeConversation.relatedModuleId || '').trim();
    const relatedRecordId = String(item.sourceRow?.record_id || item.sourceRow?.related_record_id || activeConversation.relatedRecordId || '').trim();
    const relationInitialValues = relatedModuleId && relatedRecordId
      ? buildTaskSourceInitialValues(relatedModuleId, relatedRecordId)
      : {};
    const attachments = filterUsableMessageAttachments(
      item.sourceRow?.content
        ? parseNoteContent(item.sourceRow.content).attachments
        : timelineAttachmentsToNoteAttachments(item),
    );
    setMessageActivityDraft({
      initialValues: {
        ...relationInitialValues,
        name: buildMessageActivityTitle({ actorName: item.author, sourceLabel: channelMeta[activeConversation.channel].label }),
        status: 'todo',
        priority: 'medium',
        task_type: 'فعالیت سازمانی',
        description: buildMessageActivityDescription({
          actorName: item.author,
          createdAtLabel: item.time,
          content: item.text,
          attachments,
          sourceLabel: channelMeta[activeConversation.channel].label,
        }),
      },
      attachments,
      relatedModuleId: relatedModuleId || null,
      relatedRecordId: relatedRecordId || null,
      sourceLabel: item.author || channelMeta[activeConversation.channel].label,
    });
  };

  const handleMessageActivitySave = async (values: any, meta?: { selectedTags?: any[] }) => {
    if (!messageActivityDraft) return;
    const tasksModule = MODULES.tasks;
    if (!tasksModule?.table) throw new Error('ماژول فعالیت‌ها در دسترس نیست.');
    const userId = String(liveData.profile.id || '').trim() || null;
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
    let insertResult = await supabase.from(tasksModule.table).insert(withAudit).select('*').single();
    if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
      insertResult = await supabase.from(tasksModule.table).insert(payload).select('*').single();
    }
    if (insertResult.error) throw insertResult.error;
    const inserted = insertResult.data;
    const taskId = String(inserted?.id || '').trim();
    if (!taskId) throw new Error('ایجاد فعالیت ناموفق بود.');
    if (selectedTags.length > 0) await syncRecordTags(supabase, 'tasks', taskId, selectedTags);
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
  };

  const toggleMessageLike = async (item: TimelineEvent) => {
    const noteId = String(item.sourceRow?.id || '').trim();
    const userId = String(liveData.profile.id || '').trim();
    if (activeConversation.channel !== 'internal' || !noteId || !userId) {
      message.info('پسندیدن این نوع پیام در اتصال فعلی آماده نیست.');
      return;
    }
    const nextLiked = !Boolean(item.liked);
    setLikedOverrides((prev) => ({ ...prev, [noteId]: nextLiked }));
    try {
      const metadata = item.sourceRow?.metadata && typeof item.sourceRow.metadata === 'object'
        ? { ...item.sourceRow.metadata }
        : {};
      const likes = { ...likeReceiptMapFromBox(metadata) };
      if (likes[userId]) {
        delete likes[userId];
      } else {
        likes[userId] = {
          user_id: userId,
          user_name: directoryUserMap[userId]?.display_name || 'کاربر سازمان',
          liked_at: new Date().toISOString(),
        };
      }
      const { error } = await supabase
        .from('notes')
        .update({ metadata: { ...metadata, likes } })
        .eq('id', noteId);
      if (error) throw error;
      await refreshInternalTimeline({ force: true });
      setLikedOverrides((prev) => {
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
    } catch (error: any) {
      setLikedOverrides((prev) => ({ ...prev, [noteId]: Boolean(item.liked) }));
      message.error(toFaErrorMessage(error, 'ثبت پسندیدن پیام ناموفق بود.'));
    }
  };

  const showMessageReceipts = (item: TimelineEvent) => {
    const readEntries = Object.values(readReceiptMapFromBox(item.sourceRow?.metadata));
    const likeEntries = Object.values(likeReceiptMapFromBox(item.sourceRow?.metadata));
    Modal.info({
      title: 'وضعیت پیام',
      okText: 'بستن',
      content: (
        <div className="space-y-3 text-sm">
          <div>
            <div className="mb-1 font-semibold text-slate-700">خوانده‌شده</div>
            {readEntries.length ? readEntries.map((entry: any, index) => (
              <div key={`read-${index}`} className="text-slate-500">
                {String(entry?.user_name || entry?.display_name || entry?.user_id || 'کاربر')} - {safeJalaliFormat(entry?.read_at || entry?.seen_at || entry?.created_at, 'YYYY/MM/DD HH:mm') || 'زمان نامشخص'}
              </div>
            )) : <div className="text-slate-400">هنوز رسیدی ثبت نشده است.</div>}
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-700">پسندیده‌شده</div>
            {likeEntries.length ? likeEntries.map((entry: any, index) => (
              <div key={`like-${index}`} className="text-slate-500">
                {String(entry?.user_name || entry?.display_name || entry?.user_id || 'کاربر')} - {safeJalaliFormat(entry?.liked_at || entry?.created_at, 'YYYY/MM/DD HH:mm') || 'زمان نامشخص'}
              </div>
            )) : <div className="text-slate-400">هنوز پسندیدنی ثبت نشده است.</div>}
          </div>
        </div>
      ),
    });
  };

  const sendMessage = async (conversation: Conversation, payload: ComposerSendPayload) => {
    const normalizedText = String(payload?.text || '').trim();
    const attachments = payload?.attachments || [];
    const linkedAttachments = payload?.linkedAttachments || [];
    if (!normalizedText && attachments.length === 0 && linkedAttachments.length === 0) {
      message.warning('متن پیام خالی است.');
      return false;
    }
    if (conversation.channel === 'internal' && conversation.key.startsWith(LIVE_INTERNAL_PREFIX)) {
      if (conversation.readOnly || conversation.internalKind === 'system') {
        message.warning('پیام‌های سیستم فقط برای مشاهده هستند.');
        return false;
      }
      const orgId = String(liveData.profile.orgId || '').trim();
      const authorId = String(liveData.profile.id || '').trim();
      const sourceConversationKey = String(conversation.sourceConversationKey || getInternalSourceConversationKey(conversation.key) || '').trim();
      if (!orgId || !authorId || !sourceConversationKey) {
        message.error('اطلاعات لازم برای ارسال پیام داخلی کامل نیست.');
        return false;
      }
      try {
        const { mentionUserIds, mentionRoleIds } = parseMentionValues(payload?.mentionValues || []);
        let finalMentionUserIds = mentionUserIds;
        let finalMentionRoleIds = mentionRoleIds;
        let metadata: Record<string, any> | null = null;

        if (sourceConversationKey === MY_NOTES_CONVERSATION_KEY || conversation.internalKind === 'saved') {
          finalMentionUserIds = [];
          finalMentionRoleIds = [];
          metadata = { saved_message: true };
        } else {
          const selection = resolveConversationSelection(sourceConversationKey, authorId);
          if (typeof selection === 'string' && selection === SYSTEM_MESSAGES_USER_ID) {
            message.warning('پیام‌های سیستم فقط برای مشاهده هستند.');
            return false;
          }
          if (typeof selection === 'string' && selection.startsWith(CHAT_GROUP_PREFIX)) {
            const groupId = getChatGroupSelectionId(selection);
            if (groupId) {
              const { data: groupRow, error: groupError } = await supabase
                .from('chat_groups')
                .select('id,user_ids,role_ids')
                .eq('id', groupId)
                .maybeSingle();
              if (groupError) throw groupError;
              const groupUserIds = normalizeIdArray(groupRow?.user_ids).filter((id) => id !== authorId);
              const groupRoleIds = normalizeIdArray(groupRow?.role_ids);
              finalMentionUserIds = Array.from(new Set([...finalMentionUserIds, ...groupUserIds]));
              finalMentionRoleIds = Array.from(new Set([...finalMentionRoleIds, ...groupRoleIds]));
              metadata = { chat_group_id: groupId };
            }
          } else if (typeof selection === 'string' && selection) {
            finalMentionUserIds = Array.from(new Set([...finalMentionUserIds, selection]));
          }
        }

        const uploadedAttachments = attachments.length > 0
          ? await uploadNoteAttachments(null, null, attachments)
          : [];
        const mergedAttachments = [...linkedAttachments, ...uploadedAttachments].filter((attachment, index, all) => {
          const url = String(attachment?.url || '').trim();
          return url && all.findIndex((item) => String(item?.url || '').trim() === url) === index;
        });
        if (linkedAttachments.length > 0) {
          await ensureNoteAttachmentShortcuts(null, null, linkedAttachments);
        }

        await insertNotesWithFallback([{
          org_id: orgId,
          module_id: null,
          record_id: null,
          content: serializeNoteContent(normalizedText, mergedAttachments),
          reply_to: payload?.replyTo || null,
          mention_user_ids: finalMentionUserIds,
          mention_role_ids: finalMentionRoleIds,
          author_id: authorId,
          author_name: directoryUserMap[authorId]?.display_name || null,
          metadata,
        }]);
        if (payload.smsNotificationEnabled && (finalMentionUserIds.length > 0 || finalMentionRoleIds.length > 0)) {
          await sendNoteSmsNotifications({
            authorName: directoryUserMap[authorId]?.display_name || 'کاربر',
            noteText: normalizedText || (mergedAttachments.length > 0 ? 'فایل یا تصویر پیوست' : ''),
            mentionUserIds: finalMentionUserIds,
            mentionRoleIds: finalMentionRoleIds,
            title: 'اطلاع‌رسانی پیام داخلی',
          });
        }
        await Promise.all([
          refreshInternalConversations({ force: true }),
          refreshInternalTimeline({ force: true }),
        ]);
        message.success('پیام داخلی ارسال شد.');
        return true;
      } catch (error: any) {
        message.error(toFaErrorMessage(error, 'ارسال پیام داخلی ناموفق بود.'));
        return false;
      }
    }
    if ((conversation.channel === 'bot_group' || conversation.channel === 'bot_direct') && conversation.key.startsWith('live:')) {
      try {
        const botSmsNotification = payload.smsNotificationEnabled
          ? await prepareBotSmsNotification(conversation)
          : null;
        if (payload.smsNotificationEnabled && !botSmsNotification) return false;
        const uploadedAttachments = attachments.length > 0
          ? await uploadNoteAttachments(null, null, attachments)
          : [];
        const mergedAttachments = [...linkedAttachments, ...uploadedAttachments].filter((attachment, index, all) => {
          const url = String(attachment?.url || '').trim();
          return url && all.findIndex((item) => String(item?.url || '').trim() === url) === index;
        });
        if (linkedAttachments.length > 0) {
          await ensureNoteAttachmentShortcuts(conversation.relatedModuleId || null, conversation.relatedRecordId || null, linkedAttachments);
        }
        const outboundAttachments = mergedAttachments.length > 0
          ? await shortenAttachmentsForExternalShare(mergedAttachments, {
            title: conversation.title || 'پیوست پیام',
            moduleId: conversation.relatedModuleId || null,
            recordId: conversation.relatedRecordId || null,
            metadata: { source: 'messages_v2_omni' },
          })
          : [];
        const attachmentNameText = buildAttachmentNameText(outboundAttachments);
        const finalText = normalizedText || (outboundAttachments.length > 0 ? attachmentNameText : '');
        if (!finalText && outboundAttachments.length === 0) {
          message.warning('متن یا پیوست پیام خالی است.');
          return false;
        }
        if (conversation.channel === 'bot_group') {
          const groupId = String(conversation.key).replace(/^live:bot_group:/, '');
          const group = (liveData.botGroups || []).find((row: any) => String(row?.id || '') === groupId);
          if (!group) throw new Error('گروه بات انتخاب‌شده پیدا نشد.');
          await sendTextToBotGroup(group, finalText, {
            attachments: outboundAttachments.length > 0 ? outboundAttachments : undefined,
            fallbackText: outboundAttachments.length > 0 ? [normalizedText, attachmentNameText].filter(Boolean).join('\n') : undefined,
            messageType: outboundAttachments.length > 0 ? 'file' : 'text',
            payload: {
              attachments: outboundAttachments,
              reply_to_message_id: replyTarget?.sourceRow?.provider_message_id || null,
            },
          });
        } else {
          const threadId = String(conversation.key).replace(/^live:bot_direct:/, '');
          const thread = (liveData.botDirectThreads || []).find((row: any) => String(row?.id || '') === threadId);
          if (!thread) throw new Error('گفتگوی شخصی بات انتخاب‌شده پیدا نشد.');
          await sendTextToBotDirectThread(thread, finalText, {
            attachments: outboundAttachments.length > 0 ? outboundAttachments : undefined,
            fallbackText: outboundAttachments.length > 0 ? [normalizedText, attachmentNameText].filter(Boolean).join('\n') : undefined,
            messageType: outboundAttachments.length > 0 ? 'file' : 'text',
            payload: {
              attachments: outboundAttachments,
              reply_to_message_id: replyTarget?.sourceRow?.provider_message_id || null,
            },
          });
        }
        await liveData.refresh();
        if (botSmsNotification) {
          try {
            await sendSmsViaGateway({
              to: [botSmsNotification.phone],
              text: botSmsNotification.text,
              title: 'اطلاع‌رسانی پیام بات',
              moduleId: botSmsNotification.moduleId,
              recordId: botSmsNotification.recordId,
              customerId: botSmsNotification.moduleId === 'customers' ? botSmsNotification.recordId : undefined,
              metadata: {
                source_type: 'bot_message_sms_notification',
                channel: conversation.platform || conversation.channel,
                conversation_key: conversation.key,
              },
            });
            if (botSmsNotification.remember) {
              await persistBotSmsNotificationTemplate(conversation, botSmsNotification.text);
            }
            message.success('پیام بات و اطلاع‌رسانی پیامکی ارسال شد.');
          } catch (smsError: any) {
            message.warning(toFaErrorMessage(smsError, 'پیام بات ارسال شد، اما اطلاع‌رسانی پیامکی ناموفق بود.'));
          }
        } else {
          message.success('پیام بات ارسال شد.');
        }
        return true;
      } catch (error: any) {
        message.error(toFaErrorMessage(error, 'ارسال پیام بات ناموفق بود.'));
        return false;
      }
    }
    if (conversation.channel !== 'sms' || !conversation.key.startsWith('live:')) {
      message.info('ارسال واقعی این کانال در مرحله بعدی وصل می‌شود.');
      return false;
    }
    const recipient = String(conversation.phone || '').trim();
    if (!recipient) {
      message.warning('شماره گیرنده پیامک پیدا نشد.');
      return false;
    }
    try {
      await sendSmsViaGateway({
        to: [recipient],
        text: normalizedText,
        title: conversation.title || 'پیامک مستقیم',
        moduleId: conversation.relatedModuleId,
        recordId: conversation.relatedRecordId,
        customerId: conversation.relatedModuleId === 'customers' ? conversation.relatedRecordId : undefined,
        metadata: {
          source: 'messages_v2_omni',
          conversation_key: conversation.key,
        },
      });
      await liveData.refresh();
      message.success('پیامک ارسال شد.');
      return true;
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ارسال پیامک ناموفق بود.'));
      return false;
    }
  };

  const forwardSelectedNoteUserId = (() => {
    const selection = resolveConversationSelection(selectedInternalSourceKey, liveData.profile.id);
    return typeof selection === 'string' && selection !== SYSTEM_MESSAGES_USER_ID && !selection.startsWith(CHAT_GROUP_PREFIX)
      ? selection
      : null;
  })();

  return (
    <div dir="rtl" data-testid="messaging-v2-prototype" className="h-full min-h-0 overflow-hidden bg-slate-100 text-slate-800 dark:bg-[#101113] dark:text-slate-100">
      <div className="flex h-full min-h-0 overflow-hidden">
        <aside className="order-last hidden h-full min-h-0 w-[292px] shrink-0 border-l border-slate-200/70 bg-slate-50/86 dark:border-white/[0.07] dark:bg-[#131518] md:block">
          <MessagingConversationList
            conversations={displayConversations}
            selectedKey={selectedKey}
            onSelect={selectConversation}
            onRefresh={() => void refreshMessagingSurface()}
            refreshing={refreshingMessages}
            onCreateInternalGroup={openCreateInternalGroupModal}
            activeFilter={conversationFilter}
            onChangeFilter={changeConversationFilter}
          />
        </aside>
        <aside className="order-last h-full min-h-0 w-[76px] shrink-0 border-l border-slate-200/70 bg-slate-50/90 dark:border-white/[0.07] dark:bg-[#131518] md:hidden">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-slate-200/70 px-2 py-2 dark:border-white/[0.07]">
              <Button block type="text" icon={<MenuOutlined />} onClick={() => setConversationListOpen(true)} aria-label="باز کردن فهرست گفتگوها" />
            </div>
            <MessagingConversationList
              conversations={displayConversations}
              selectedKey={selectedKey}
              onSelect={selectConversation}
              compact
              activeFilter={conversationFilter}
              onChangeFilter={changeConversationFilter}
            />
          </div>
        </aside>
        {conversationListOpen ? (
          <div className="fixed inset-0 z-50 bg-slate-100 dark:bg-[#101113] md:hidden">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-slate-200/70 bg-white px-3 py-2 dark:border-white/[0.07] dark:bg-[#17191c]">
                <div className="text-sm font-bold">گفتگوها</div>
                <Button type="text" shape="circle" icon={<CloseOutlined />} onClick={() => setConversationListOpen(false)} aria-label="بستن فهرست گفتگوها" />
              </div>
              <MessagingConversationList
                conversations={displayConversations}
                selectedKey={selectedKey}
                onSelect={selectConversation}
                onRefresh={() => void refreshMessagingSurface()}
                refreshing={refreshingMessages}
                onCreateInternalGroup={openCreateInternalGroupModal}
                activeFilter={conversationFilter}
                onChangeFilter={changeConversationFilter}
              />
            </div>
          </div>
        ) : null}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {displayConversations.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(241,245,249,0.82))] px-4 text-center dark:bg-none dark:bg-[#101113]">
              <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/85 px-5 py-6 text-sm font-semibold text-slate-600 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.045] dark:text-slate-200">
                <Spin />
                <span>در حال بارگزاری لیست پیام‌ها...</span>
              </div>
            </div>
          ) : (
            <>
              <MessagingHeader
                conversation={activeConversation}
                onBindPhone={openPhoneBindModal}
                onSearch={toggleConversationSearch}
                onStartCall={startConversationCall}
                onEditInternalGroup={openEditInternalGroupModal}
                searchOpen={conversationSearchOpen}
                searchValue={conversationSearchValue}
                onSearchValueChange={setConversationSearchValue}
              />
              <div ref={timelineViewportRef} className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(241,245,249,0.82))] px-3 py-3 dark:bg-none dark:bg-[#101113]">
                <div className="mx-auto flex max-w-5xl flex-col gap-3">
                  <div className="flex justify-center">
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/88 px-3 py-1 text-[11px] text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-slate-300">
                      <ClockCircleOutlined />
                      امروز
                    </span>
                  </div>
                  {normalizedConversationSearch && visibleActiveEvents.length === 0 ? (
                    <div className="mx-auto rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-slate-300">
                      نتیجه‌ای برای این جستجو پیدا نشد.
                    </div>
                  ) : null}
                  {visibleActiveEvents.map((item) => (
                    <TimelineEventCard
                      key={item.id}
                      item={item}
                      activeConversation={activeConversation}
                      unread={activeUnreadEventIds.has(item.id)}
                      onReply={(event) => setReplyTarget(event)}
                      onForward={openForwardModal}
                      onCreateActivity={openCreateActivityFromMessage}
                      onToggleLike={toggleMessageLike}
                      onShowReceipts={showMessageReceipts}
                      onBindBotSender={openBotIdentityBindModalForMessage}
                    />
                  ))}
                </div>
              </div>
              <MessagingComposerDock
                conversation={activeConversation}
                onSendMessage={sendMessage}
                mentionOptions={mentionOptions}
                mentionsLoading={mentionsLoading}
                replyTarget={replyTarget?.conversationKey === activeConversation.key ? replyTarget : null}
                onClearReply={() => setReplyTarget(null)}
              />
            </>
          )}
        </main>
      </div>
      <PhoneMatchPickerModal
        open={phoneBindOpen}
        loading={phoneBindLoading}
        saving={phoneBindSaving}
        phone={phoneBindDraft?.phone || ''}
        existingBindingLabel={phoneBindDraft?.existingBindingLabel || null}
        phoneMatchStatus={phoneBindDraft?.phoneMatchStatus || null}
        targetModuleId={phoneBindTargetModuleId}
        onChangeTargetModuleId={(value) => {
          setPhoneBindTargetModuleId(value);
          setPhoneBindTargetRecordId(null);
          setPhoneBindOptions([]);
        }}
        targetRecordId={phoneBindTargetRecordId}
        onChangeTargetRecordId={setPhoneBindTargetRecordId}
        targetOptions={phoneBindOptions}
        searchValue={phoneBindSearch}
        onChangeSearchValue={setPhoneBindSearch}
        onClose={closePhoneBindModal}
        onSave={savePhoneBind}
      />
      {botIdentityBindOpen && botIdentityBindDraft ? (
        <React.Suspense fallback={null}>
          <BotChatIdentityBindModal
            open={botIdentityBindOpen}
            loading={botIdentityBindLoading}
            saving={botIdentityBindSaving}
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
              setBotIdentityBindOptions([]);
            }}
            targetRecordId={botIdentityBindTargetRecordId}
            onChangeTargetRecordId={setBotIdentityBindTargetRecordId}
            targetOptions={botIdentityBindOptions}
            searchValue={botIdentityBindSearch}
            onChangeSearchValue={setBotIdentityBindSearch}
            userOptions={internalGroupUserOptions}
            roleOptions={internalGroupRoleOptions}
            allowedUserIds={botIdentityAllowedUserIds}
            onChangeAllowedUserIds={setBotIdentityAllowedUserIds}
            allowedRoleIds={botIdentityAllowedRoleIds}
            onChangeAllowedRoleIds={setBotIdentityAllowedRoleIds}
            aiAutoReplyEnabled={botIdentityAiAutoReplyEnabled}
            onChangeAiAutoReplyEnabled={setBotIdentityAiAutoReplyEnabled}
            aiCounterpartyGuide={botIdentityAiCounterpartyGuide}
            onChangeAiCounterpartyGuide={setBotIdentityAiCounterpartyGuide}
            memberGroups={activeConversation.channel === 'bot_group' ? [{
              id: String(activeConversation.key || '').trim(),
              title: activeConversation.title,
              channelLabel: `گروه بات ${activeConversation.platform ? BOT_CHANNEL_LABELS_FA[activeConversation.platform] : ''}`.trim(),
              statusLabel: activeConversation.status || null,
              lastActivityAt: activeConversation.time || null,
            }] : []}
            onClose={closeBotIdentityBindModal}
            onSave={saveBotIdentityBind}
          />
        </React.Suspense>
      ) : null}
      <Modal
        open={internalGroupModalOpen}
        title={editingInternalGroupId ? 'ویرایش گروه داخلی' : 'ایجاد گروه داخلی جدید'}
        okText={editingInternalGroupId ? 'ذخیره تغییرات' : 'ایجاد گروه'}
        cancelText="انصراف"
        confirmLoading={internalGroupSaving}
        onOk={saveInternalGroup}
        onCancel={() => {
          setInternalGroupModalOpen(false);
          setEditingInternalGroupId(null);
        }}
        destroyOnClose
      >
        <div className="space-y-3" dir="rtl">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">نام گروه</div>
            <Input
              value={internalGroupName}
              onChange={(event) => setInternalGroupName(event.target.value)}
              placeholder="مثلاً تیم فروش"
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">اعضا</div>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              value={internalGroupUserIds}
              onChange={(values) => setInternalGroupUserIds(values)}
              options={internalGroupUserOptions}
              placeholder="انتخاب کاربران"
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">نقش‌ها</div>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              value={internalGroupRoleIds}
              onChange={(values) => setInternalGroupRoleIds(values)}
              options={internalGroupRoleOptions}
              placeholder="انتخاب نقش‌ها"
              className="w-full"
            />
          </div>
        </div>
      </Modal>
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
            selectedNoteUserId={forwardSelectedNoteUserId}
            profileId={liveData.profile.id}
            currentAuthorName={directoryUserMap[String(liveData.profile.id || '')]?.display_name || null}
            botGroups={liveData.botGroups || []}
            botDirectThreads={liveData.botDirectThreads || []}
            chatGroups={chatGroups}
            chatGroupMap={chatGroupMap}
            availableDirectUsers={availableDirectUsers}
            roleLookup={roleLookup}
            getChatGroupPayload={getChatGroupPayload}
            getBotMessageAttachments={(row: any) => extractBotMessageAttachments(row)}
            buildAttachmentNameText={buildAttachmentNameText}
            sendTextToBotGroup={sendTextToBotGroup}
            sendTextToBotDirectThread={sendTextToBotDirectThread}
            refreshSection={refreshForwardSection}
            onForwarded={() => {
              void Promise.all([
                refreshInternalConversations({ force: true }),
                refreshInternalTimeline({ force: true }),
                liveData.refresh(),
              ]);
            }}
            onOpenReadyTexts={() => message.info('پیام‌های آماده در این نمای نسخه ۲ بعد از اتصال کامل composer فعال می‌شود.')}
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
            overlayZIndex={15100}
          />
        </React.Suspense>
      ) : null}
    </div>
  );
};

export default MessagingSurfacePrototype;
