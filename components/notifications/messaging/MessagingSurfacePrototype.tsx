import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AudioOutlined,
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  CommentOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileAddOutlined,
  LinkOutlined,
  LikeOutlined,
  MenuOutlined,
  InfoCircleOutlined,
  MessageOutlined,
  PaperClipOutlined,
  PhoneOutlined,
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
import { App, Avatar, Badge, Button, Checkbox, Input, Modal, Spin, Tag, Tooltip } from 'antd';
import { BOT_CHANNEL_LABELS_FA, BOT_CHANNELS, getBotChatIdFieldKey, getBotPlatformAvatarSrc, isBotTargetModuleId, type BotTargetModuleId } from '../../../utils/botPlatform';
import { safeJalaliFormat, toPersianNumber } from '../../../utils/persianNumberFormatter';
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
import { bindVoipOperatorIdentity } from '../../../utils/voipOperatorBindings';
import { toFaErrorMessage } from '../../../utils/errorMessageFa';
import { sendSmsViaGateway } from '../../../utils/smsGateway';
import SharedNoteComposer from '../../notes/SharedNoteComposer';
import AdaptiveIdentityPicker from '../../AdaptiveIdentityPicker';
import type { AssigneeDirectory } from '../../../utils/referenceData';
import { clearIdentityDirectoryCache, searchIdentityOptions } from '../../../utils/identityDirectory';
import { isMissingColumnError, isMissingTableLikeError } from '../../../utils/notificationAssigneeHelpers';
import { parseNoteContent, resolveNoteAttachmentFileType, serializeNoteContent, type NoteAttachment } from '../../../utils/noteContent';
import { getMessageListPreview } from '../../../utils/messagePreview';
import { ensureNoteAttachmentShortcuts, uploadNoteAttachments } from '../../../utils/noteAttachments';
import { sendInternalMessageV2, sendNoteSmsNotifications } from '../../../utils/noteDispatch';
import { shortenAttachmentsForExternalShare } from '../../../utils/fileShortLinks';
import { buildRecordReferenceKey, fetchRecordReferenceLabels } from '../../../utils/recordReference';
import { likeReceiptMapFromBox, readReceiptMapFromBox } from '../../../utils/messageReceipts';
import { buildTaskSourceInitialValues } from '../../../utils/taskMeta';
import { buildMessageActivityDescription, buildMessageActivityTitle, filterUsableMessageAttachments } from '../../../utils/messageActivity';
import { loadScopedCompanySettings } from '../../../utils/companySettings';
import { collectBotMessageMediaFileRefs, extractBotMessageAttachments } from '../../../utils/messageAttachments';
import { normalizePublicAssetUrl } from '../../../utils/assetUrl';
import { sendBotMessageViaGateway, sendCounterpartyBotGroupMessage, type BotChannel } from '../../../utils/botGateway';
import { getActiveChannelSettings } from '../../../utils/channelSettings';
import { useOptionalNotificationRuntime } from '../NotificationRuntimeProvider';
import { botMessageInsertBus, noteInsertBus } from '../../../utils/communicationRealtimeBus';
import { useNotificationConversationList } from '../../../hooks/useNotificationConversationList';
import { shouldSubmitComposerOnEnter } from '../../../utils/composeKeyboard';
import { useInternalConversationTimeline } from '../../../hooks/useInternalConversationTimeline';
import { useBotConversationTimeline } from '../../../hooks/useBotConversationTimeline';
import {
  CHAT_GROUP_PREFIX,
  MY_NOTES_CONVERSATION_KEY,
  SYSTEM_MESSAGES_USER_ID,
  buildDirectConversationKey,
  getChatGroupSelectionId,
  resolveConversationSelection,
} from '../../../utils/notificationConversationKeys';
import { compareIsoAsc, type NotificationConversationSummary } from '../../../utils/notificationConversationRpc';
import ProfileAvatar from '../../common/ProfileAvatar';
import MessageAttachmentGallery from '../../messaging/MessageAttachmentGallery';
import AiSparkleIcon from '../../ai/AiSparkleIcon';
import type { BotPlatformState } from '../../bot/CounterpartyBotStatusModal';
import AiReplySuggestionAction from './AiReplySuggestionAction';
import { buildRecentReplySuggestionMessages } from '../../../utils/replySuggestion';
import {
  canCurrentUserAccessInternalSystemNote,
  isInternalSystemNoteRow,
} from '../../../utils/internalNoteAccess';
import type { MessageActivityDraft } from './MessageActivityModalRuntime';

const ForwardMessageModalRuntime = React.lazy(() => import('../ForwardMessageModalRuntime'));
const MessageComposerModal = React.lazy(() => import('../../MessageComposerModal'));
const BotChatIdentityBindModal = React.lazy(() => import('../BotChatIdentityBindModal'));
const CounterpartyBotStatusModal = React.lazy(() => import('../../bot/CounterpartyBotStatusModal'));
const MessageActivityModalRuntime = React.lazy(() => import('./MessageActivityModalRuntime'));

type ChannelKind = 'internal' | 'bot_group' | 'bot_direct' | 'sms' | 'call';
type EventKind = 'message' | 'sms' | 'call';
type AttachmentKind = 'image' | 'file' | 'video' | 'audio' | 'voice';

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
  inactive?: boolean;
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
  avatarFallback?: React.ReactNode;
  avatarTone?: string | null;
  isAiAuthor?: boolean;
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
  relatedModuleId?: string | null;
  relatedRecordId?: string | null;
  edited?: boolean;
};

const getTimelineEventMutationKey = (channel: ChannelKind, item: TimelineEvent) => {
  const sourceId = String(item.sourceRow?.id || item.id || '').trim();
  return sourceId ? `${channel}:${sourceId}` : '';
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
  initialForwardMessage?: {
    content?: string | null;
    attachments?: NoteAttachment[] | null;
    relatedModuleId?: string | null;
    relatedRecordId?: string | null;
  } | null;
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

type MessagingUnreadSummary = {
  all: number;
  internal: number;
  bot_group: number;
  bot_direct: number;
  sms: number;
  call: number;
  system: number;
  saved: number;
};

const EMPTY_MESSAGING_UNREAD_SUMMARY: MessagingUnreadSummary = {
  all: 0,
  internal: 0,
  bot_group: 0,
  bot_direct: 0,
  sms: 0,
  call: 0,
  system: 0,
  saved: 0,
};

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

const getBotGroupIdFromConversationKey = (key?: string | null) => {
  const normalized = String(key || '').trim();
  if (normalized.startsWith('live:bot_group:')) return normalized.slice('live:bot_group:'.length).trim();
  if (normalized.startsWith('bot:')) return normalized.slice('bot:'.length).trim();
  return normalized;
};

const normalizeMessagingConversationKey = (key?: string | null) => {
  const normalized = String(key || '').trim();
  if (normalized.startsWith('live:bot_group:')) {
    const groupId = normalized.slice('live:bot_group:'.length).trim();
    return groupId ? `bot:${groupId}` : normalized;
  }
  return normalized;
};

const getBotDirectThreadIdFromConversationKey = (key?: string | null) => {
  const normalized = String(key || '').trim();
  if (normalized.startsWith('live:bot_direct:')) return normalized.slice('live:bot_direct:'.length).trim();
  return normalized;
};

const isKnownBotChannel = (value: any): value is BotChannel =>
  BOT_CHANNELS.includes(String(value || '').trim() as BotChannel);

const resolveBotTimelineTarget = (row: any) => {
  const targetType = String(row?.target_type || '').trim();
  const targetRecordId = String(row?.target_record_id || '').trim();
  if (isBotTargetModuleId(targetType) && targetRecordId) return { moduleId: targetType, recordId: targetRecordId };
  const customerId = String(row?.customer_id || '').trim();
  if (customerId) return { moduleId: 'customers', recordId: customerId };
  const supplierId = String(row?.supplier_id || '').trim();
  if (supplierId) return { moduleId: 'suppliers', recordId: supplierId };
  const employeeId = String(row?.employee_id || '').trim();
  if (employeeId) return { moduleId: 'employees', recordId: employeeId };
  return { moduleId: '', recordId: '' };
};

const getTimelineRecordLabel = (
  labels: Record<string, string>,
  moduleId?: string | null,
  recordId?: string | null,
  fallback?: string | null,
) => {
  const key = buildRecordReferenceKey(String(moduleId || '').trim(), String(recordId || '').trim());
  return String((key ? labels[key] : '') || fallback || '').trim();
};

const normalizeRenderableAttachmentUrl = (value: any) => {
  const rawUrl = String(value || '').trim();
  return normalizePublicAssetUrl(rawUrl)
    || rawUrl.replace(/^http:\/\/api\.tazesystem\.ir\//i, 'https://api.tazesystem.ir/');
};

const buildBotTimelineAttachments = (row: any): TimelineEvent['attachments'] => {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const rawAttachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
  const attachments = rawAttachments
    .map((attachment: any) => {
      const url = normalizeRenderableAttachmentUrl(attachment?.url || attachment?.file_url || '');
      const name = String(attachment?.name || attachment?.file_name || row?.file_name || 'فایل').trim() || 'فایل';
      const mimeType = String(attachment?.mime_type || attachment?.mimeType || row?.mime_type || '').trim() || null;
      const fileType = String(attachment?.file_type || attachment?.fileType || row?.message_type || '').trim().toLowerCase();
      const kind = resolveNoteAttachmentFileType({
        ...attachment,
        fileType,
        mimeType,
        name,
      }) as AttachmentKind;
      return { name, kind, url: url || null, mimeType };
    })
    .filter((attachment: any) => attachment.url || attachment.name);
  const directUrl = normalizeRenderableAttachmentUrl(row?.file_url || '');
  if (directUrl && !attachments.some((attachment: any) => String(attachment.url || '') === directUrl)) {
    const mimeType = String(row?.mime_type || '').trim() || null;
    attachments.unshift({
      name: String(row?.file_name || 'فایل').trim() || 'فایل',
      kind: resolveNoteAttachmentFileType({
        fileType: row?.message_type,
        mimeType,
        name: row?.file_name,
        url: directUrl,
      }) as AttachmentKind,
      url: directUrl,
      mimeType,
    });
  }
  return attachments;
};

type BotIdentityBindingLike = {
  channel_type?: string | null;
  chat_id?: string | null;
  target_module_id?: string | null;
  target_record_id?: string | null;
  display_name?: string | null;
  username?: string | null;
  phone_number?: string | null;
};

const buildBotIdentityBindingKey = (channel?: string | null, chatId?: string | null) =>
  `${String(channel || '').trim()}:${String(chatId || '').trim()}`;

const buildBotIdentityBindingMap = (rows?: BotIdentityBindingLike[] | null) => {
  const map = new Map<string, BotIdentityBindingLike>();
  (rows || []).forEach((row) => {
    const key = buildBotIdentityBindingKey(row?.channel_type, row?.chat_id);
    if (key !== ':') map.set(key, row);
  });
  return map;
};

const resolveBotRpcSenderName = (
  row: any,
  binding: BotIdentityBindingLike | null,
  recordTitleMap: Record<string, string>,
  fallback: string,
) => {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  if (binding?.target_module_id && binding?.target_record_id) {
    const boundTitle = getTimelineRecordLabel(
      recordTitleMap,
      String(binding.target_module_id),
      String(binding.target_record_id),
      binding.display_name || fallback,
    );
    if (boundTitle) return boundTitle;
  }
  const senderTargetModuleId = String(payload?.sender_target_module_id || payload?.target_module_id || '').trim();
  const senderTargetRecordId = String(payload?.sender_target_record_id || payload?.target_record_id || '').trim();
  const senderTargetTitle = getTimelineRecordLabel(recordTitleMap, senderTargetModuleId, senderTargetRecordId);
  if (senderTargetTitle) return senderTargetTitle;
  const username = String(payload?.username || payload?.sender_username || binding?.username || '').trim().replace(/^@+/, '');
  return String(payload?.sender_display_name || payload?.display_name || binding?.display_name || '').trim()
    || (username ? `@${username}` : '')
    || String(payload?.phone_number || payload?.sender_phone_number || binding?.phone_number || '').trim()
    || resolveBotRpcSenderChatId(row)
    || fallback;
};

const resolveBotRpcSenderAvatarUrl = (row: any) => {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  return String(
    payload?.sender_avatar_url
    || payload?.avatar_url
    || payload?.profile_photo_url
    || payload?.photo_url
    || ''
  ).trim() || null;
};

const resolveBotRpcSenderChatId = (row: any) => {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const update = payload?.update && typeof payload.update === 'object' ? payload.update : {};
  const newMessage = (payload?.new_message && typeof payload.new_message === 'object' ? payload.new_message : null)
    || (update?.new_message && typeof update.new_message === 'object' ? update.new_message : {});
  const inlineMessage = payload?.inline_message && typeof payload.inline_message === 'object' ? payload.inline_message : {};
  const sender = payload?.sender && typeof payload.sender === 'object' ? payload.sender : {};
  const from = payload?.from && typeof payload.from === 'object' ? payload.from : {};
  const user = payload?.user && typeof payload.user === 'object' ? payload.user : {};
  const hasGroupConversation = Boolean(String(row?.bot_group_id || '').trim());
  const hasDirectConversation = Boolean(String(row?.direct_thread_id || '').trim());
  const explicitSenderId = String(
    payload?.sender_id
    || payload?.sender_chat_id
    || payload?.sender_object_guid
    || payload?.sender_guid
    || payload?.user_id
    || payload?.userId
    || payload?.from_id
    || payload?.author_id
    || newMessage?.sender_id
    || newMessage?.senderId
    || newMessage?.sender_chat_id
    || inlineMessage?.sender_id
    || inlineMessage?.senderId
    || inlineMessage?.sender_chat_id
    || sender?.id
    || sender?.chat_id
    || sender?.user_id
    || sender?.object_guid
    || from?.id
    || from?.chat_id
    || from?.user_id
    || from?.object_guid
    || user?.id
    || user?.chat_id
    || user?.user_id
    || ''
  ).trim();
  if (explicitSenderId) return explicitSenderId;
  if (hasGroupConversation) return '';
  if (hasDirectConversation) {
    return String(newMessage?.object_guid || inlineMessage?.chat_id || payload?.object_guid || row?.chat_id || '').trim();
  }
  return '';
};

const resolveBotRpcSenderDisplayName = (row: any) => {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const update = payload?.update && typeof payload.update === 'object' ? payload.update : {};
  const newMessage = (payload?.new_message && typeof payload.new_message === 'object' ? payload.new_message : null)
    || (update?.new_message && typeof update.new_message === 'object' ? update.new_message : {});
  const inlineMessage = payload?.inline_message && typeof payload.inline_message === 'object' ? payload.inline_message : {};
  const sender = payload?.sender && typeof payload.sender === 'object' ? payload.sender : {};
  const from = payload?.from && typeof payload.from === 'object' ? payload.from : {};
  const user = payload?.user && typeof payload.user === 'object' ? payload.user : {};
  return String(
    payload?.sender_display_name
    || payload?.sender_name
    || payload?.display_name
    || sender?.display_name
    || sender?.name
    || from?.display_name
    || from?.name
    || user?.display_name
    || user?.name
    || newMessage?.sender_display_name
    || newMessage?.sender_name
    || inlineMessage?.sender_display_name
    || inlineMessage?.sender_name
    || ''
  ).trim();
};

const resolveBotRpcSenderUsername = (row: any) => {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const update = payload?.update && typeof payload.update === 'object' ? payload.update : {};
  const newMessage = (payload?.new_message && typeof payload.new_message === 'object' ? payload.new_message : null)
    || (update?.new_message && typeof update.new_message === 'object' ? update.new_message : {});
  const inlineMessage = payload?.inline_message && typeof payload.inline_message === 'object' ? payload.inline_message : {};
  const sender = payload?.sender && typeof payload.sender === 'object' ? payload.sender : {};
  const from = payload?.from && typeof payload.from === 'object' ? payload.from : {};
  const user = payload?.user && typeof payload.user === 'object' ? payload.user : {};
  return String(
    payload?.username
    || payload?.sender_username
    || newMessage?.username
    || newMessage?.sender_username
    || inlineMessage?.username
    || inlineMessage?.sender_username
    || sender?.username
    || from?.username
    || user?.username
    || ''
  ).trim().replace(/^@+/, '');
};

const isAiBotSenderPayload = (payload: any, row?: any) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  return [
    source.sender_kind,
    source.sender_type,
    source.source_type,
    source.message_source,
    source.author_type,
    row?.sender_kind,
    row?.sender_type,
  ].some((value) => String(value || '').trim().toLowerCase() === 'ai')
    || Boolean(source.ai_generated || source.ai_answer || source.workflow_ai_prompt);
};

const isSystemBotSenderPayload = (payload: any, row?: any) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  return [
    source.sender_kind,
    source.sender_type,
    source.source_type,
    source.message_source,
    source.author_type,
    row?.sender_kind,
    row?.sender_type,
  ].some((value) => ['system', 'workflow', 'automation', 'scheduled_report'].includes(String(value || '').trim().toLowerCase()))
    || Boolean(source.workflow_action_type || source.process_automation_rule_id || source.scheduled_report_id);
};

const isAiTimelineEvent = (item: any) => {
  const payload = item?.sourceRow?.payload && typeof item.sourceRow.payload === 'object' ? item.sourceRow.payload : {};
  return Boolean(item?.isAiAuthor) || isAiBotSenderPayload(payload, item?.sourceRow);
};

const buildBotGroupRpcTimelineEvents = (
  rows: any[],
  activeGroup: any | null,
  recordTitleMap: Record<string, string>,
  botSenderBindings?: BotIdentityBindingLike[] | null,
): TimelineEvent[] => {
  const target = resolveBotTimelineTarget(activeGroup || {});
  const relatedTitle = getTimelineRecordLabel(recordTitleMap, target.moduleId, target.recordId, activeGroup?.group_title);
  const channel: BotChannel | null = isKnownBotChannel(activeGroup?.channel_type) ? activeGroup.channel_type as BotChannel : null;
  const botSenderBindingMap = buildBotIdentityBindingMap(botSenderBindings);
  return (rows || []).map((row: any) => {
    const direction = String(row?.direction || '').trim() === 'outbound' ? 'outbound' : 'inbound';
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const isAiSender = direction === 'outbound' && isAiBotSenderPayload(payload, row);
    const attachments = buildBotTimelineAttachments(row) || [];
    const text = String(row?.content_text || payload?.text || payload?.caption || '').trim()
      || (attachments.length ? '' : 'پیام بات');
    const senderDisplayName = resolveBotRpcSenderDisplayName(row);
    const senderUsername = resolveBotRpcSenderUsername(row);
    const senderChatId = resolveBotRpcSenderChatId(row);
    const senderBinding = direction === 'inbound' && channel && senderChatId
      ? botSenderBindingMap.get(buildBotIdentityBindingKey(channel, senderChatId)) || null
      : null;
    const senderTitle = resolveBotRpcSenderName(row, senderBinding, recordTitleMap, relatedTitle || activeGroup?.group_title || 'عضو گروه بات');
    return {
      id: `rpc-bot-group-${String(row?.id || `${row?.bot_group_id || ''}-${row?.created_at || Math.random()}`)}`,
      sourceRow: row,
      conversationKey: `bot:${String(row?.bot_group_id || activeGroup?.id || '').trim()}`,
      kind: 'message' as const,
      direction,
      author: direction === 'outbound' ? (isAiSender ? 'هوش مصنوعی' : 'کاربر سازمان') : senderTitle,
      text,
      time: safeJalaliFormat(row?.created_at, 'YYYY/MM/DD HH:mm') || '',
      status: Boolean(payload?.is_edited || payload?.edited_at || payload?.message_edited)
        ? 'ویرایش شده'
        : (direction === 'outbound' ? 'ارسال شده' : undefined),
      edited: Boolean(payload?.is_edited || payload?.edited_at || payload?.message_edited),
      replyTo: String(payload?.reply_to_message_id || payload?.reply_to_id || '').trim() || null,
      attachments: attachments.length ? attachments : undefined,
      avatarUrl: isAiSender ? null : resolveBotRpcSenderAvatarUrl(row),
      avatarFallback: isAiSender ? <AiSparkleIcon className="h-3.5 w-3.5" /> : undefined,
      avatarTone: isAiSender ? 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-200' : null,
      isAiAuthor: isAiSender,
      botSenderChannel: channel,
      botSenderChatId: direction === 'inbound' ? senderChatId || null : null,
      botSenderDisplayName: direction === 'inbound' ? senderDisplayName || null : null,
      botSenderUsername: direction === 'inbound' ? senderUsername || null : null,
      botSenderPhoneNumber: direction === 'inbound' ? String(payload?.phone_number || '').trim() || null : null,
      botSenderBound: direction === 'inbound' ? Boolean(senderBinding?.target_module_id && senderBinding?.target_record_id) : true,
      relatedRecordLabel: relatedTitle || undefined,
      relatedModuleId: target.moduleId || null,
      relatedRecordId: target.recordId || null,
    };
  });
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

const buildInternalLiveConversations = (
  summaries: NotificationConversationSummary[] | null | undefined,
  currentUserId: string,
): Conversation[] =>
  (summaries || [])
    .filter((summary) => String(summary?.section || '').trim() === 'notes')
    .filter((summary) => {
      const key = String(summary?.conversation_key || '').trim();
      if (!key.startsWith('direct:')) return true;
      const participants = key.split(':').slice(1).map((item) => item.trim()).filter(Boolean);
      return participants.includes(currentUserId);
    })
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
        preview: getMessageListPreview(summary?.last_message_preview, {
          fallback: internalKind === 'system' ? 'پیام‌های سیستم' : 'گفتگوی داخلی',
        }),
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

const buildBotRpcConversations = (summaries: NotificationConversationSummary[] | null | undefined): Conversation[] =>
  (summaries || [])
    .filter((summary) => String(summary?.section || '').trim() === 'bot_messages')
    .map((summary) => {
      const key = normalizeMessagingConversationKey(summary?.conversation_key);
      const platform = isKnownBotChannel(summary?.channel_type) ? summary.channel_type as BotChannel : undefined;
      const channelLabel = platform ? BOT_CHANNEL_LABELS_FA[platform] : String(summary?.channel_type || 'بات').trim();
      const title = String(summary?.title || summary?.counterparty_label || '').trim() || 'گروه بات';
      const latestAt = String(summary?.latest_message_at || '').trim();
      return {
        key,
        channel: 'bot_group' as const,
        title,
        subtitle: `${channelLabel} - ${String(summary?.subtitle || title).trim() || 'گروه بات'}`,
        preview: getMessageListPreview(summary?.last_message_preview, { fallback: 'گفتگوی بات' }),
        time: latestAt ? safeJalaliFormat(latestAt, 'MM/DD HH:mm') || '' : '',
        lastActivityAt: latestAt || null,
        unread: Math.max(0, Number(summary?.unread_count || 0)),
        tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
        avatarText: title.slice(0, 1) || 'ب',
        status: 'بات فعال',
        platform,
        relatedRecordTitle: String(summary?.counterparty_label || '').trim() || undefined,
        relatedScope: summary?.counterparty_label ? 'record' as const : undefined,
        relatedLabelPrefix: summary?.counterparty_label ? 'مخاطب مرتبط' : undefined,
        actions: ['search', 'attach', 'reply', 'forward', 'ready_text', 'activity', 'bind', 'record', 'receipt'] as ConversationAction[],
      };
    });

const mergeBotRpcConversations = (liveConversations: Conversation[], rpcConversations: Conversation[]) => {
  if (!rpcConversations.length) return liveConversations;
  const merged = new Map<string, Conversation>();
  liveConversations.forEach((conversation) => {
    const key = normalizeMessagingConversationKey(conversation.key);
    if (key) merged.set(key, { ...conversation, key });
  });
  rpcConversations.forEach((rpcConversation) => {
    const key = normalizeMessagingConversationKey(rpcConversation.key);
    if (!key) return;
    const liveConversation = merged.get(key);
    const livePreview = String(liveConversation?.preview || '').trim();
    const liveHasAttachmentPreview = /(?:\s·\s(?:تصویر|ویدیو|پیام صوتی|فایل صوتی|فایل)|پیوست$)/.test(livePreview);
    merged.set(key, liveConversation
      ? {
          ...liveConversation,
          ...rpcConversation,
          preview: liveHasAttachmentPreview ? livePreview : rpcConversation.preview,
          platform: liveConversation.platform || rpcConversation.platform,
          relatedModuleId: liveConversation.relatedModuleId,
          relatedRecordId: liveConversation.relatedRecordId,
          relatedRecordTitle: liveConversation.relatedRecordTitle || rpcConversation.relatedRecordTitle,
          relatedScope: liveConversation.relatedScope || rpcConversation.relatedScope,
          relatedLabelPrefix: liveConversation.relatedLabelPrefix || rpcConversation.relatedLabelPrefix,
          actions: liveConversation.actions?.length ? liveConversation.actions : rpcConversation.actions,
        }
      : rpcConversation);
  });
  return sortConversationsByActivity(Array.from(merged.values()));
};

const getInternalNotePreview = (row: any) => {
  return getMessageListPreview(row?.content ?? row?.body ?? row?.message_text ?? '', {
    fallback: '',
  });
};

const buildInternalConversationFallbackSummaries = (
  rows: any[],
  currentUserId: string,
  currentRoleId?: string | null,
): NotificationConversationSummary[] => {
  const normalizedCurrentUserId = String(currentUserId || '').trim();
  if (!normalizedCurrentUserId) return [];
  const summaries = new Map<string, NotificationConversationSummary>();

  const upsertSummary = (
    conversationKey: string,
    row: any,
    partial: Partial<NotificationConversationSummary>,
  ) => {
    const key = String(conversationKey || '').trim();
    if (!key) return;
    const createdAt = String(row?.created_at || row?.updated_at || '').trim() || null;
    const existing = summaries.get(key);
    const existingLatestMs = new Date(existing?.latest_message_at || 0).getTime();
    const createdMs = new Date(createdAt || 0).getTime();
    const latestIsNewer = !existing || (Number.isFinite(createdMs) && createdMs >= existingLatestMs);
    summaries.set(key, {
      section: 'notes',
      conversation_key: key,
      kind: partial.kind || existing?.kind || 'direct',
      title: partial.title ?? existing?.title ?? null,
      subtitle: partial.subtitle ?? existing?.subtitle ?? null,
      avatar_url: partial.avatar_url ?? existing?.avatar_url ?? null,
      role_label: partial.role_label ?? existing?.role_label ?? null,
      note_count: Number(existing?.note_count || 0) + 1,
      unread_count: Number(existing?.unread_count || 0),
      latest_message_at: latestIsNewer ? createdAt : existing?.latest_message_at || createdAt,
      last_message_preview: latestIsNewer ? getInternalNotePreview(row) : existing?.last_message_preview || getInternalNotePreview(row),
      user_id: partial.user_id ?? existing?.user_id ?? null,
      group_id: partial.group_id ?? existing?.group_id ?? null,
      bot_group_id: null,
      channel_type: null,
      status: null,
      counterparty_label: partial.counterparty_label ?? existing?.counterparty_label ?? null,
      bot_chat_id: null,
    });
  };

  rows.forEach((row) => {
    if (
      isInternalSystemNoteRow(row)
      && !canCurrentUserAccessInternalSystemNote(row, normalizedCurrentUserId, currentRoleId)
    ) return;
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const authorId = resolveInternalAuthorId(row);
    const mentionUserIds = normalizeIdArray(row?.mention_user_ids);
    const mentionRoleIds = normalizeIdArray(row?.mention_role_ids);
    const groupId = String(metadata?.chat_group_id || '').trim();
    if (isInternalSystemNote(row)) {
      upsertSummary('system', row, {
        kind: 'system',
        title: 'پیام‌های سیستم',
      });
      return;
    }
    if (groupId) {
      upsertSummary(`${CHAT_GROUP_PREFIX}${groupId}`, row, {
        kind: 'group',
        group_id: groupId,
      });
      return;
    }
    if (
      authorId === normalizedCurrentUserId
      && (metadata?.saved_message === true || mentionUserIds.length === 0)
    ) {
      upsertSummary(MY_NOTES_CONVERSATION_KEY, row, {
        kind: 'direct',
        title: 'یادداشت‌های من',
      });
      return;
    }
    const targetUserIds = new Set<string>();
    if (authorId === normalizedCurrentUserId) {
      mentionUserIds
        .filter((userId) => userId && userId !== normalizedCurrentUserId)
        .forEach((userId) => targetUserIds.add(userId));
    }
    if (authorId && authorId !== normalizedCurrentUserId && mentionUserIds.includes(normalizedCurrentUserId)) {
      targetUserIds.add(authorId);
    }
    if (
      authorId
      && authorId !== normalizedCurrentUserId
      && currentRoleId
      && mentionRoleIds.includes(String(currentRoleId).trim())
    ) {
      targetUserIds.add(authorId);
    }
    targetUserIds.forEach((targetUserId) => {
      const directConversationKey = buildDirectConversationKey(normalizedCurrentUserId, targetUserId);
      if (!directConversationKey) return;
      upsertSummary(directConversationKey, row, {
        kind: 'direct',
        user_id: targetUserId,
      });
    });
  });

  return Array.from(summaries.values()).sort((left, right) => (
    new Date(right.latest_message_at || 0).getTime() - new Date(left.latest_message_at || 0).getTime()
  ));
};

const doesInternalNoteBelongToConversation = (
  row: any,
  conversationKey: string,
  currentUserId: string,
  currentRoleId?: string | null,
) => {
  const key = String(conversationKey || '').trim();
  const normalizedCurrentUserId = String(currentUserId || '').trim();
  if (!key || !normalizedCurrentUserId) return false;
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const authorId = resolveInternalAuthorId(row);
  const groupId = String(metadata?.chat_group_id || '').trim();
  if (key === MY_NOTES_CONVERSATION_KEY) {
    return authorId === normalizedCurrentUserId
      && !groupId
      && !isInternalSystemNote(row)
      && (metadata?.saved_message === true || normalizeIdArray(row?.mention_user_ids).length === 0);
  }
  if (key === 'system') {
    return isInternalSystemNote(row)
      && canCurrentUserAccessInternalSystemNote(row, normalizedCurrentUserId, currentRoleId);
  }
  if (key.startsWith(CHAT_GROUP_PREFIX)) return groupId === getChatGroupSelectionId(key);
  if (!key.startsWith('direct:') || groupId || isInternalSystemNote(row)) return false;
  const userMentionMatches = normalizeIdArray(row?.mention_user_ids).some((targetUserId) => (
    buildDirectConversationKey(authorId, targetUserId) === key
  ));
  if (userMentionMatches) return true;
  const normalizedRoleId = String(currentRoleId || '').trim();
  return Boolean(
    authorId
    && authorId !== normalizedCurrentUserId
    && normalizedRoleId
    && normalizeIdArray(row?.mention_role_ids).includes(normalizedRoleId)
    && buildDirectConversationKey(authorId, normalizedCurrentUserId) === key,
  );
};

const ensureInternalSpecialConversations = (
  items: Conversation[],
  enabled: boolean,
  systemAvatarUrl?: string | null,
): Conversation[] => {
  if (!enabled) return items;
  const next = items.map((conversation) => (
    conversation.internalKind === 'system' || conversation.sourceConversationKey === 'system'
      ? {
          ...conversation,
          avatarUrl: systemAvatarUrl || conversation.avatarUrl || null,
        }
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
  const userByConversationKey = new Map<string, AssigneeDirectory['users'][number]>();
  users.forEach((user) => {
    const userId = String(user?.id || '').trim();
    if (!userId || userId === normalizedCurrentUserId) return;
    const sourceConversationKey = buildDirectConversationKey(normalizedCurrentUserId, userId);
    if (sourceConversationKey) userByConversationKey.set(sourceConversationKey, user);
  });
  const isGenericInternalTitle = (value: string) => {
    const normalized = String(value || '').trim();
    return !normalized || ['نام کاربر', 'کاربر', 'کاربر سیستم', 'گفتگوی داخلی', 'پیام مستقیم داخلی'].includes(normalized);
  };
  const next = items.map((conversation) => {
    if (conversation.internalKind !== 'direct') return conversation;
    const sourceConversationKey = String(conversation.sourceConversationKey || '').trim();
    const user = userByConversationKey.get(sourceConversationKey);
    if (!user) return conversation;
    const title = String(user.display_name || user.full_name || '').trim();
    const roleLabel = String(user.job_title || roleLookup[String(user.role_id || '')] || '').trim();
    const inactive = user.is_active === false;
    return {
      ...conversation,
      readOnly: Boolean(conversation.readOnly || inactive),
      inactive,
      title: title && isGenericInternalTitle(conversation.title) ? title : conversation.title,
      subtitle: roleLabel || conversation.subtitle,
      avatarUrl: String(conversation.avatarUrl || user.avatar_url || '').trim() || null,
      avatarText: (title || conversation.title || '').slice(0, 1) || conversation.avatarText || 'د',
      status: inactive ? 'غیرفعال' : roleLabel || conversation.status,
    };
  });
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

const getDirectConversationPeerId = (conversationKey: string, currentUserId: string) => {
  const parts = String(conversationKey || '').trim().split(':');
  const currentId = String(currentUserId || '').trim();
  if (parts.length !== 3 || parts[0] !== 'direct' || !currentId) return '';
  if (parts[1] === currentId) return String(parts[2] || '').trim();
  if (parts[2] === currentId) return String(parts[1] || '').trim();
  return '';
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

const BOT_BIND_CAPTURE_SECONDS = 60;

const buildEnglishActivationBase = (value: any) => {
  const ascii = String(value || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
  if (!ascii) return '';
  return ascii.split(/\s+/).filter(Boolean).slice(0, 3).join('-').slice(0, 20);
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
    const ascii = nameEn
      .normalize('NFKD')
      .replace(/[^\x00-\x7F]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toUpperCase()
      .slice(0, 8);
    return ascii || 'TAZESYSTEM';
  } catch {
    return 'TAZESYSTEM';
  }
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

const isInternalSystemNote = isInternalSystemNoteRow;

const getRecordPayload = (value: any) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
);

const getPayloadText = (payload: any, keys: string[]) => {
  for (const key of keys) {
    const value = String(payload?.[key] || '').trim();
    if (value) return value;
  }
  return '';
};

const resolveInternalAuthorId = (row: any) => {
  const payload = getRecordPayload(row?.payload);
  return String(
    row?.author_id
    || row?.sender_user_id
    || row?.sender_profile_id
    || payload?.author_id
    || payload?.sender_user_id
    || payload?.sender_profile_id
    || payload?.user_id
    || ''
  ).trim();
};

const resolveInternalAuthorName = (
  row: any,
  directoryUserMap: Record<string, any>,
  currentUserId: string,
  direction: 'inbound' | 'outbound' | 'system',
) => {
  if (direction === 'system') return 'پیام‌های سیستم';
  const payload = getRecordPayload(row?.payload);
  const authorId = resolveInternalAuthorId(row);
  const payloadName = getPayloadText(payload, ['author_name', 'sender_display_name', 'sender_name', 'display_name', 'full_name']);
  const directoryName = authorId ? String(directoryUserMap[authorId]?.display_name || '').trim() : '';
  if (direction === 'outbound') {
    return String(
      row?.author_name
      || payloadName
      || directoryUserMap[currentUserId]?.display_name
      || ''
    ).trim() || 'من';
  }
  return String(row?.author_name || payloadName || directoryName || '').trim() || 'کاربر سازمان';
};

const resolveInternalAvatarUrl = (row: any, directoryUserMap: Record<string, any>) => {
  const payload = getRecordPayload(row?.payload);
  const authorId = resolveInternalAuthorId(row);
  return String(
    row?.sender_avatar_url
    || row?.author_avatar_url
    || row?.avatar_url
    || payload?.author_avatar_url
    || payload?.sender_avatar_url
    || payload?.conversation_avatar_url
    || payload?.avatar_url
    || directoryUserMap[authorId]?.avatar_url
    || ''
  ).trim() || null;
};

const getNoteAttachmentKind = (attachment: NoteAttachment): AttachmentKind => {
  const fileType = String(attachment?.fileType || '').trim().toLowerCase();
  const mimeType = String(attachment?.mimeType || '').trim().toLowerCase();
  if (fileType === 'image' || mimeType.startsWith('image/')) return 'image';
  if (fileType === 'video' || mimeType.startsWith('video/')) return 'video';
  if (fileType === 'voice') return 'voice';
  if (fileType === 'audio' || mimeType.startsWith('audio/')) return 'audio';
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

const MediaAttachmentPreview: React.FC<{ attachments: TimelineEvent['attachments']; call?: boolean }> = ({ attachments = [], call = false }) => (
  <MessageAttachmentGallery
    call={call}
    attachments={(attachments || []).map((attachment) => ({
      name: attachment.name,
      url: attachment.url || '',
      mimeType: attachment.mimeType || null,
      fileType: attachment.kind,
    }))}
  />
);

let messagingModuleLabelMap: Record<string, string> = {};

const getModuleLabelFa = (moduleId?: string | null) => {
  const key = String(moduleId || '').trim();
  if (!key) return '';
  return messagingModuleLabelMap[key] || '';
};

const buildRecordHref = (moduleId?: string | null, recordId?: string | null) => {
  const moduleKey = String(moduleId || '').trim();
  const id = String(recordId || '').trim();
  return moduleKey && id ? `/${moduleKey}/${id}` : '';
};

const getRelatedContextParts = (conversation: Pick<Conversation, 'relatedModuleId' | 'relatedRecordId' | 'relatedRecordTitle' | 'relatedScope' | 'relatedLabelPrefix'>) => {
  const moduleLabel = getModuleLabelFa(conversation.relatedModuleId);
  const recordTitle = String(conversation.relatedRecordTitle || '').trim();
  if (!moduleLabel && !recordTitle) return null;
  const prefix = String(conversation.relatedLabelPrefix || '').trim()
    || (conversation.relatedScope === 'page' ? 'صفحه مرتبط' : conversation.relatedScope === 'module' ? 'بخش مرتبط' : 'رکورد مرتبط');
  if (conversation.relatedScope === 'module') return { prefix, text: moduleLabel };
  if (conversation.relatedScope === 'page') return { prefix, text: moduleLabel };
  return {
    prefix,
    text: [moduleLabel, recordTitle].filter(Boolean).join(' - '),
    href: buildRecordHref(conversation.relatedModuleId, conversation.relatedRecordId),
  };
};

const getPrimaryActions = (conversation: Conversation) => {
  if (conversation.channel === 'internal') return ['search'] as ConversationAction[];
  if (conversation.channel === 'call') return ['search', 'bind', 'call'].filter((action) => conversation.actions.includes(action as ConversationAction)) as ConversationAction[];
  if (conversation.channel === 'sms') return ['search', 'bind'].filter((action) => conversation.actions.includes(action as ConversationAction)) as ConversationAction[];
  return ['search', 'bind'].filter((action) => conversation.actions.includes(action as ConversationAction)) as ConversationAction[];
};

const MessagingTimelineSkeleton: React.FC = () => (
  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="border-b border-slate-200/70 bg-white/88 px-4 py-3 dark:border-white/[0.07] dark:bg-[#17191c]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(var(--brand-500-rgb),0.10)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))]">
          <MessageOutlined />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">پیام‌رسانی</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">در حال آماده‌سازی گفتگوها</div>
        </div>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(241,245,249,0.82))] px-4 py-4 dark:bg-none dark:bg-[#101113]">
      <div className="mx-auto flex max-w-5xl animate-pulse flex-col gap-4">
        {Array.from({ length: 7 }).map((_, index) => {
          const outgoing = index % 3 === 1;
          return (
            <div key={`timeline-skeleton-${index}`} className={`flex ${outgoing ? 'justify-start' : 'justify-end'}`}>
              <div className={`w-[min(620px,82%)] rounded-2xl p-3 ${outgoing ? 'bg-slate-300/80 dark:bg-white/[0.10]' : 'bg-white/85 dark:bg-white/[0.055]'}`}>
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-white/[0.08]" />
                  <div className="space-y-1.5">
                    <div className="h-2.5 w-24 rounded-full bg-slate-200 dark:bg-white/[0.08]" />
                    <div className="h-2 w-16 rounded-full bg-slate-100 dark:bg-white/[0.06]" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/[0.06]" />
                  <div className="h-2.5 w-3/4 rounded-full bg-slate-100 dark:bg-white/[0.06]" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

const MessagingConversationList: React.FC<{
  conversations: Conversation[];
  selectedKey: string;
  onSelect: (key: string) => void;
  compact?: boolean;
  loading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  onCreateInternalGroup?: () => void;
  hasMoreSms?: boolean;
  hasMoreCalls?: boolean;
  loadingMoreSms?: boolean;
  loadingMoreCalls?: boolean;
  onLoadMoreSms?: () => void;
  onLoadMoreCalls?: () => void;
  activeFilter: ChannelKind | 'all';
  onChangeFilter: (value: ChannelKind | 'all') => void;
  unreadSummary?: MessagingUnreadSummary;
}> = ({ conversations, selectedKey, onSelect, compact = false, loading = false, onRefresh, refreshing = false, onCreateInternalGroup, hasMoreSms = false, hasMoreCalls = false, loadingMoreSms = false, loadingMoreCalls = false, onLoadMoreSms, onLoadMoreCalls, activeFilter, onChangeFilter, unreadSummary = EMPTY_MESSAGING_UNREAD_SUMMARY }) => (
  <MessagingConversationListInner conversations={conversations} selectedKey={selectedKey} onSelect={onSelect} compact={compact} loading={loading} onRefresh={onRefresh} refreshing={refreshing} onCreateInternalGroup={onCreateInternalGroup} hasMoreSms={hasMoreSms} hasMoreCalls={hasMoreCalls} loadingMoreSms={loadingMoreSms} loadingMoreCalls={loadingMoreCalls} onLoadMoreSms={onLoadMoreSms} onLoadMoreCalls={onLoadMoreCalls} activeFilter={activeFilter} onChangeFilter={onChangeFilter} unreadSummary={unreadSummary} />
);

const MessagingConversationListInner: React.FC<{
  conversations: Conversation[];
  selectedKey: string;
  onSelect: (key: string) => void;
  compact?: boolean;
  loading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  onCreateInternalGroup?: () => void;
  hasMoreSms: boolean;
  hasMoreCalls: boolean;
  loadingMoreSms: boolean;
  loadingMoreCalls: boolean;
  onLoadMoreSms?: () => void;
  onLoadMoreCalls?: () => void;
  activeFilter: ChannelKind | 'all';
  onChangeFilter: (value: ChannelKind | 'all') => void;
  unreadSummary: MessagingUnreadSummary;
}> = ({ conversations, selectedKey, onSelect, compact = false, loading = false, onRefresh, refreshing = false, onCreateInternalGroup, hasMoreSms, hasMoreCalls, loadingMoreSms, loadingMoreCalls, onLoadMoreSms, onLoadMoreCalls, activeFilter, onChangeFilter, unreadSummary }) => {
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
  const filterUnreadCounts: Record<ChannelKind | 'all', number> = {
    all: unreadSummary.all,
    internal: unreadSummary.internal,
    bot_group: unreadSummary.bot_group,
    bot_direct: unreadSummary.bot_direct,
    sms: unreadSummary.sms,
    call: unreadSummary.call,
  };

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
              <Badge count={getNumericBadgeCount(unreadSummary.saved)} size="small" color="#c0392b">
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
              <Badge count={getNumericBadgeCount(unreadSummary.system)} size="small" color="#c0392b">
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
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: compact ? 7 : 9 }).map((_, index) => (
            <div key={`conversation-list-inline-skeleton-${index}`} className={`animate-pulse rounded-xl bg-white/70 shadow-sm dark:bg-white/[0.045] ${compact ? 'p-2' : 'p-3'}`}>
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200 dark:bg-white/[0.08]" />
                {!compact ? (
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-2/3 rounded-full bg-slate-200 dark:bg-white/[0.08]" />
                    <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/[0.06]" />
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : filteredConversations.map((conversation) => {
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
      {!loading && (activeFilter === 'all' || activeFilter === 'sms' || activeFilter === 'call') ? (
        <div className={`flex flex-col gap-1.5 ${compact ? 'pt-1' : 'px-1 pb-2 pt-2'}`}>
          {hasMoreSms && (activeFilter === 'all' || activeFilter === 'sms') ? (
            <Button size="small" block loading={loadingMoreSms} onClick={onLoadMoreSms} className="!h-8 !rounded-lg !text-xs">
              مشاهده پیامک‌های قدیمی‌تر
            </Button>
          ) : null}
          {hasMoreCalls && (activeFilter === 'all' || activeFilter === 'call') ? (
            <Button size="small" block loading={loadingMoreCalls} onClick={onLoadMoreCalls} className="!h-8 !rounded-lg !text-xs">
              مشاهده تماس‌های قدیمی‌تر
            </Button>
          ) : null}
        </div>
      ) : null}
      </div>
    </div>
  );
};

const URL_PATTERN = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

const isBrokenRubikaStorageUrl = (url: string) =>
  /https?:\/\/botapi\.rubika\.ir\/storage\/v1\/object\/public\//i.test(String(url || '').trim());

const isRubikaTemporaryDownloadUrl = (url: string) =>
  /https?:\/\/messenger[^/]*\.rubika\.ir\/download\/?\?/i.test(String(url || '').trim());

const isProviderTemporaryDownloadUrl = (channel: string | null | undefined, url: string) => {
  const value = String(url || '').trim();
  if (!value) return false;
  const normalizedChannel = String(channel || '').trim();
  if (normalizedChannel === 'rubika') return isRubikaTemporaryDownloadUrl(value) || isBrokenRubikaStorageUrl(value);
  if (normalizedChannel === 'telegram' || normalizedChannel === 'bale') {
    return /\/file\/bot/i.test(value) || /api\.telegram\.org/i.test(value) || /tapi\.bale\.ai/i.test(value);
  }
  return false;
};

const hasRetryableBotMedia = (item: TimelineEvent) => {
  const channel = String(item.botSenderChannel || item.sourceRow?.channel_type || '').trim();
  if (!BOT_CHANNELS.includes(channel as BotChannel)) return false;
  const refs = collectBotMessageMediaFileRefs(item.sourceRow);
  const payload = item.sourceRow?.payload && typeof item.sourceRow.payload === 'object' ? item.sourceRow.payload : {};
  const markedRetryable = payload?.media_import_status === 'failed' && payload?.media_import_retryable !== false;
  return refs.some((ref) => {
    const url = String(ref.url || '').trim();
    return ref.fileId && (!url || markedRetryable || isProviderTemporaryDownloadUrl(channel, url));
  });
};

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
  danger?: boolean;
  disabled?: boolean;
}> = ({ title, icon, onClick, active = false, activeTone = 'default', inverse = false, danger = false, disabled = false }) => (
  <Tooltip title={title}>
    <button
      type="button"
      aria-label={title}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? activeTone === 'like'
            ? 'bg-rose-500 text-white shadow-sm hover:bg-rose-600 dark:bg-rose-500 dark:text-white dark:hover:bg-rose-400'
            : inverse
              ? 'bg-white/24 text-white shadow-sm'
              : 'bg-[rgba(var(--brand-500-rgb),0.12)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-300-rgb),0.12)] dark:text-[rgb(var(--brand-200-rgb))]'
          : inverse
            ? 'text-white/90 hover:bg-white/12 hover:text-white'
            : danger
              ? inverse
                ? 'text-rose-100 hover:bg-rose-400/20 hover:text-white'
                : 'text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-400/15 dark:hover:text-rose-100'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-650 dark:hover:bg-white/[0.08] dark:hover:text-slate-100'
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  </Tooltip>
);

const BOT_SENDER_AVATAR_TONES = [
  'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200',
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
  'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200',
  'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
  'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
  'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200',
];

const getBotSenderAvatarTone = (identityKey?: string | null) => {
  const key = String(identityKey || '').trim();
  if (!key) return '';
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
  }
  return BOT_SENDER_AVATAR_TONES[Math.abs(hash) % BOT_SENDER_AVATAR_TONES.length];
};

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
  onBindVoipOperator?: (item: TimelineEvent) => void;
  onRetryBotMedia?: (item: TimelineEvent) => void;
  retryingMedia?: boolean;
  canDelete?: boolean;
  deleting?: boolean;
  onDelete?: (item: TimelineEvent) => void;
  canEdit?: boolean;
  editing?: boolean;
  onEdit?: (item: TimelineEvent) => void;
}> = ({ item, activeConversation, unread = false, onReply, onForward, onCreateActivity, onToggleLike, onShowReceipts, onBindBotSender, onBindVoipOperator, onRetryBotMedia, retryingMedia = false, canDelete = false, deleting = false, onDelete, canEdit = false, editing = false, onEdit }) => {
  const { message } = App.useApp();
  const outgoing = item.direction === 'outbound';
  const isCall = item.kind === 'call';
  const isInternal = activeConversation.channel === 'internal';
  const showStatusBadge = Boolean(item.status && (isCall || (item.kind === 'sms' && outgoing)));
  const avatarFallback = item.avatarFallback ?? (String(item.author || activeConversation.avatarText || 'ک').trim().slice(0, 1) || 'ک');
  const botAvatarIdentityKey = String(item.botSenderChatId || item.author || item.sourceRow?.id || '').trim();
  const avatarTone = item.avatarTone
    || (!outgoing && (activeConversation.channel === 'bot_group' || activeConversation.channel === 'bot_direct')
      ? getBotSenderAvatarTone(botAvatarIdentityKey) || activeConversation.tone
      : activeConversation.tone);
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
  const canRetryBotMedia = (activeConversation.channel === 'bot_group' || activeConversation.channel === 'bot_direct') && hasRetryableBotMedia(item);
  const canOpenBotSenderBinding = !outgoing
    && (activeConversation.channel === 'bot_group' || activeConversation.channel === 'bot_direct')
    && Boolean(item.botSenderChatId);
  const botSenderBindingTitle = item.botSenderBound ? 'ویرایش اتصال فرستنده' : 'اتصال فرستنده به مخاطب';
  const canBindVoipOperator = isCall
    && !String(item.sourceRow?.assignee_id || '').trim()
    && Boolean(
      String(item.sourceRow?.extension || '').trim()
      || String(item.sourceRow?.operator_code || '').trim()
      || String(item.sourceRow?.provider_operator_id || '').trim(),
    );
  const showRelatedRecordLink = Boolean(item.relatedRecordLabel && activeConversation.channel !== 'bot_group' && activeConversation.channel !== 'bot_direct');
  const isEdited = Boolean(
    item.edited
    || item.sourceRow?.is_edited
    || item.sourceRow?.edited_at
    || item.sourceRow?.payload?.is_edited
    || item.sourceRow?.payload?.edited_at
    || item.sourceRow?.payload?.message_edited,
  );
  const relatedRecordHref = showRelatedRecordLink
    ? buildRecordHref(
      item.relatedModuleId || item.sourceRow?.module_id || item.sourceRow?.related_module_id || activeConversation.relatedModuleId,
      item.relatedRecordId || item.sourceRow?.record_id || item.sourceRow?.related_record_id || activeConversation.relatedRecordId,
    )
    : '';
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
                className={item.avatarUrl ? '!font-bold' : `${avatarTone} !font-bold`}
              />
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className={authorTextClassName}>{item.author}</div>
                {canOpenBotSenderBinding ? (
                  <Tooltip title={botSenderBindingTitle}>
                    <button
                      type="button"
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition ${
                        outgoing
                          ? 'bg-white/14 text-white hover:bg-white/22'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:bg-white/[0.07] dark:text-slate-300 dark:hover:bg-white/[0.12]'
                      }`}
                      onClick={() => onBindBotSender?.(item)}
                    >
                      <UserAddOutlined className="text-[11px]" />
                    </button>
                  </Tooltip>
                ) : null}
                {canBindVoipOperator ? (
                  <Tooltip title="اتصال اپراتور به کاربر">
                    <button
                      type="button"
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition ${
                        outgoing
                          ? 'bg-white/14 text-white hover:bg-white/22'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:bg-white/[0.07] dark:text-slate-300 dark:hover:bg-white/[0.12]'
                      }`}
                      onClick={() => onBindVoipOperator?.(item)}
                    >
                      <UserAddOutlined className="text-[11px]" />
                    </button>
                  </Tooltip>
                ) : null}
              </div>
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
        {showRelatedRecordLink ? (
          <a
            href={relatedRecordHref || undefined}
            className="mt-3 inline-flex max-w-full items-center gap-1.5 text-[11px] font-semibold transition"
            onClick={(event) => {
              if (!relatedRecordHref) event.preventDefault();
            }}
          >
            <LinkOutlined className={relatedRecordPrefixClassName} />
            <span className={relatedRecordPrefixClassName}>رکورد مرتبط:</span>
            <span className={`min-w-0 truncate ${relatedRecordTextClassName}`}>{item.relatedRecordLabel}</span>
          </a>
        ) : null}
        {!isCall ? <div className={actionRowClassName}>
          {activeConversation.actions.includes('reply') ? <TimelineIconButton title="پاسخ" icon={<RollbackOutlined />} inverse={outgoing} onClick={() => onReply?.(item)} /> : null}
          {activeConversation.actions.includes('forward') ? <TimelineIconButton title="هدایت" icon={<SendOutlined />} inverse={outgoing} onClick={() => onForward?.(item)} /> : null}
          {canEdit ? <TimelineIconButton title="ویرایش پیام" icon={<EditOutlined />} inverse={outgoing} disabled={editing} onClick={() => onEdit?.(item)} /> : null}
          {activeConversation.actions.includes('activity') ? <TimelineIconButton title="ایجاد فعالیت" icon={<FileAddOutlined />} inverse={outgoing} onClick={() => onCreateActivity?.(item)} /> : null}
          {canRetryBotMedia ? <TimelineIconButton title="تلاش دوباره برای دریافت پیوست" icon={<ReloadOutlined spin={retryingMedia} />} active={retryingMedia} inverse={outgoing} onClick={() => onRetryBotMedia?.(item)} /> : null}
          {canDelete ? <TimelineIconButton title="حذف پیام" icon={<DeleteOutlined />} danger inverse={outgoing} disabled={deleting} onClick={() => onDelete?.(item)} /> : null}
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
          {isEdited ? <span className={`mr-1 text-[10px] ${outgoing ? 'text-white/70' : 'text-slate-400 dark:text-slate-400'}`}>ویرایش شده</span> : null}
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
  onEditBotGroup?: (conversation: Conversation) => void;
  searchOpen?: boolean;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
}> = ({
  conversation,
  onBindPhone,
  onSearch,
  onStartCall,
  onEditInternalGroup,
  onEditBotGroup,
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
              {conversation.inactive ? (
                <Tag color="default" className="!m-0 !rounded-full !px-1.5 !text-[10px]">غیرفعال</Tag>
              ) : null}
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
                    <a
                      href={relatedContext.href || undefined}
                      className="font-semibold text-[rgb(var(--brand-700-rgb))] underline decoration-dotted decoration-[rgba(var(--brand-500-rgb),0.55)] underline-offset-4 dark:text-[rgb(var(--brand-300-rgb))]"
                      onClick={(event) => {
                        if (!relatedContext.href) event.preventDefault();
                      }}
                    >
                      {relatedContext.text}
                    </a>
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
          {conversation.channel === 'bot_group' ? (
            <Tooltip title="ویرایش اتصال بات">
              <Button type="text" size="small" shape="circle" icon={<EditOutlined />} aria-label="ویرایش اتصال بات" onClick={() => onEditBotGroup?.(conversation)} />
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
  onRequestReplySuggestion?: (instruction: string) => Promise<string>;
  mentionOptions?: Array<{ label: string; value: string }>;
  mentionsLoading?: boolean;
  replyTarget?: TimelineEvent | null;
  onClearReply?: () => void;
}> = ({ conversation, onSendMessage, onRequestReplySuggestion, mentionOptions = [], mentionsLoading = false, replyTarget = null, onClearReply }) => {
  const { message } = App.useApp();
  const [draft, setDraft] = useState('');
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [mentionValues, setMentionValues] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [linkedAttachments, setLinkedAttachments] = useState<NoteAttachment[]>([]);
  const [readyTextsOpen, setReadyTextsOpen] = useState(false);
  const [smsNotificationEnabled, setSmsNotificationEnabled] = useState(false);
  const [suggestingReply, setSuggestingReply] = useState(false);
  const readyTextRecord = useMemo(
    () => (conversation.relatedRecordId ? { id: conversation.relatedRecordId } : null),
    [conversation.relatedRecordId],
  );
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
    setSuggestingReply(false);
  }, [conversation.key]);
  const requestReplySuggestion = async (instruction: string) => {
    if (!onRequestReplySuggestion || suggestingReply) return;
    setSuggestingReply(true);
    try {
      const suggestedReply = String(await onRequestReplySuggestion(instruction) || '').trim();
      if (!suggestedReply) throw new Error('متن پیشنهادی معتبری دریافت نشد.');
      setDraft(suggestedReply);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت پیشنهاد پاسخ هوش مصنوعی ناموفق بود.'));
    } finally {
      setSuggestingReply(false);
    }
  };
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
        record={readyTextRecord}
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
    const inactiveRecipient = Boolean(conversation.inactive);
    const canSubmit = !disabled && !sending && !suggestingReply && (draft.trim() || attachments.length > 0 || linkedAttachments.length > 0);
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
          placeholder={inactiveRecipient
            ? 'این کاربر غیرفعال است و امکان ارسال پیام جدید وجود ندارد.'
            : disabled
              ? 'این گفتگو فقط پیام‌های سیستم را نمایش می‌دهد.'
              : conversation.channel === 'internal' ? (conversation.internalKind === 'saved' ? 'یادداشت جدید...' : 'پیام داخلی...') : 'پیام بات...'}
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
              {onRequestReplySuggestion ? (
                <AiReplySuggestionAction
                  disabled={sending || suggestingReply}
                  loading={suggestingReply}
                  onSubmit={requestReplySuggestion}
                />
              ) : null}
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
            if (!shouldSubmitComposerOnEnter(event)) return;
            event.preventDefault();
            void submitDraft();
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

type VoipOperatorBindDraft = {
  provider: string;
  serviceId: string | null;
  extension: string | null;
  operatorCode: string | null;
  providerOperatorId: string | null;
  displayName: string | null;
  profileId: string | null;
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

type BotStatusModalContext = {
  targetType: BotTargetModuleId;
  counterpartyId: string;
  counterpartyLabel: string;
};

type ChatGroupRow = {
  id: string;
  name?: string | null;
  user_ids?: string[] | null;
  role_ids?: string[] | null;
  metadata?: Record<string, any> | null;
};

const MessagingSurfacePrototype: React.FC<MessagingSurfacePrototypeProps> = ({
  initialFilter = 'internal',
  initialConversationKey = null,
  initialForwardMessage = null,
}) => {
  const { message } = App.useApp();
  const notificationRuntime = useOptionalNotificationRuntime();
  const [selectedKey, setSelectedKey] = useState(() => normalizeMessagingConversationKey(initialConversationKey));
  const [readEnabledConversationKey, setReadEnabledConversationKey] = useState(() => normalizeMessagingConversationKey(initialConversationKey));
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
  const [voipOperatorBindOpen, setVoipOperatorBindOpen] = useState(false);
  const [voipOperatorBindSaving, setVoipOperatorBindSaving] = useState(false);
  const [voipOperatorBindDraft, setVoipOperatorBindDraft] = useState<VoipOperatorBindDraft | null>(null);
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
  const [optimisticBotSenderBindings, setOptimisticBotSenderBindings] = useState<BotIdentityBindingLike[]>([]);
  const [replyTarget, setReplyTarget] = useState<TimelineEvent | null>(null);
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const [conversationSearchValue, setConversationSearchValue] = useState('');
  const [forwardingNote, setForwardingNote] = useState<any | null>(null);
  const [forwardTargetUserIds, setForwardTargetUserIds] = useState<string[]>([]);
  const [forwardMessageText, setForwardMessageText] = useState('');
  const [forwardSubmitting, setForwardSubmitting] = useState(false);
  const initialForwardHandledRef = useRef(false);
  const [chatGroups, setChatGroups] = useState<ChatGroupRow[]>([]);
  const [messageActivityDraft, setMessageActivityDraft] = useState<MessageActivityDraft | null>(null);
  const [refreshingMessages, setRefreshingMessages] = useState(false);
  const [retryingBotMediaIds, setRetryingBotMediaIds] = useState<Set<string>>(() => new Set());
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [orgDisplayName, setOrgDisplayName] = useState('');
  const [moduleLabelsRevision, setModuleLabelsRevision] = useState(0);
  const [reelBootstrapped, setReelBootstrapped] = useState(false);
  const [internalConversationLocalOverrides, setInternalConversationLocalOverrides] = useState<Record<string, { preview: string; lastActivityAt: string }>>({});
  const [localReadThroughByConversation, setLocalReadThroughByConversation] = useState<Record<string, string>>({});
  const [likedOverrides, setLikedOverrides] = useState<Record<string, boolean>>({});
  const [locallyDeletedMessageKeys, setLocallyDeletedMessageKeys] = useState<Set<string>>(() => new Set());
  const [deletingMessageKeys, setDeletingMessageKeys] = useState<Set<string>>(() => new Set());
  const [editingMessageKeys, setEditingMessageKeys] = useState<Set<string>>(() => new Set());
  const [internalGroupModalOpen, setInternalGroupModalOpen] = useState(false);
  const [internalGroupName, setInternalGroupName] = useState('');
  const [internalGroupUserIds, setInternalGroupUserIds] = useState<string[]>([]);
  const [internalGroupRoleIds, setInternalGroupRoleIds] = useState<string[]>([]);
  const [internalGroupSaving, setInternalGroupSaving] = useState(false);
  const [editingInternalGroupId, setEditingInternalGroupId] = useState<string | null>(null);
  const [botStatusModalOpen, setBotStatusModalOpen] = useState(false);
  const [botStatusModalLoading, setBotStatusModalLoading] = useState(false);
  const [botStatusModalSaving, setBotStatusModalSaving] = useState(false);
  const [botStatusModalContext, setBotStatusModalContext] = useState<BotStatusModalContext | null>(null);
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
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const lastTimelineConversationRef = useRef('');
  const markReadDedupeRef = useRef('');
  const runtimeRevisionRef = useRef(notificationRuntime.revisions);
  const botStatusWatchTimerRef = useRef<number | null>(null);
  const botTimelineRefreshRef = useRef<null | ((options?: { force?: boolean }) => Promise<any>)>(null);
  const liveData = useMessagingOmniLiveData({ realtimeEnabled: !notificationRuntime.ready });
  useEffect(() => {
    if (!liveData.profile.id || Object.keys(messagingModuleLabelMap).length > 0) return undefined;
    let disposed = false;
    const timer = window.setTimeout(() => {
      void import('../../../moduleRegistry').then(({ MODULES }) => {
        if (disposed) return;
        messagingModuleLabelMap = Object.fromEntries(Object.entries(MODULES).map(([moduleId, definition]) => [
          moduleId,
          String(definition?.titles?.fa || '').trim(),
        ]));
        setModuleLabelsRevision((value) => value + 1);
      });
    }, 1500);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [liveData.profile.id]);
  const cacheScopeKey = liveData.profile.orgId || liveData.profile.id || 'messaging-v2';
  const internalConversations = useNotificationConversationList({
    supabase,
    section: 'notes',
    enabled: Boolean(liveData.profile.id),
    cacheScopeKey,
  });
  const botConversations = useNotificationConversationList({
    supabase,
    section: 'bot_messages',
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
  const refreshBotConversations = botConversations.refresh;
  const refreshInternalTimeline = internalTimeline.refresh;
  useEffect(() => {
    const previous = runtimeRevisionRef.current;
    const current = notificationRuntime.revisions;
    runtimeRevisionRef.current = current;
    if (!liveData.profile.id) return;
    if (current.notes !== previous.notes) {
      void refreshInternalConversations({ force: true });
      void refreshInternalTimeline({ force: true });
    }
    if (
      current.bot_messages !== previous.bot_messages
      || current.bot_direct_messages !== previous.bot_direct_messages
      || current.sms_messages !== previous.sms_messages
      || current.voip_calls !== previous.voip_calls
    ) {
      void refreshBotConversations({ force: true });
      void liveData.refresh();
    }
  }, [
    liveData,
    notificationRuntime.revisions,
    refreshInternalConversations,
    refreshBotConversations,
    refreshInternalTimeline,
  ]);
  const [assigneeDirectory, setAssigneeDirectory] = useState<AssigneeDirectory>({ users: [], roles: [] });
  const [historicalDirectUsers, setHistoricalDirectUsers] = useState<AssigneeDirectory['users']>([]);
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
    if (!liveData.profile.id || !liveData.profile.orgId) return;
    let disposed = false;
    const loadDirectoryPreview = () => {
      setMentionsLoading(true);
      void searchIdentityOptions(supabase, { scopes: ['user', 'role'], limitPerScope: 50 }).then((result) => {
        if (disposed) return;
        setAssigneeDirectory({
          users: result.items.filter((item) => item.kind === 'user').map((item) => ({
            id: item.id,
            display_name: item.label,
            full_name: item.label,
            avatar_url: item.avatarUrl || null,
            role_id: item.roleId || null,
            job_title: item.subtitle || null,
            is_active: item.active,
          })),
          roles: result.items.filter((item) => item.kind === 'role').map((item) => ({
            id: item.id,
            title: item.label,
            icon_key: item.iconKey || 'team',
          })),
        });
      }).catch((error: any) => {
        if (!disposed) message.error(toFaErrorMessage(error, 'خواندن فهرست منشن ناموفق بود.'));
      }).finally(() => {
        if (!disposed) setMentionsLoading(false);
      });
    };
    const requestIdle = (window as any).requestIdleCallback as undefined | ((callback: () => void, options?: { timeout: number }) => number);
    const cancelIdle = (window as any).cancelIdleCallback as undefined | ((handle: number) => void);
    const handle = requestIdle
      ? requestIdle(loadDirectoryPreview, { timeout: 1200 })
      : window.setTimeout(loadDirectoryPreview, 150);
    return () => {
      disposed = true;
      if (requestIdle && cancelIdle) cancelIdle(handle);
      else window.clearTimeout(handle);
    };
  }, [liveData.profile.id, liveData.profile.orgId, message]);
  const historicalDirectUserIds = useMemo(() => {
    const currentUserId = String(liveData.profile.id || '').trim();
    return Array.from(new Set((internalConversations.items || [])
      .map((summary) => getDirectConversationPeerId(String(summary?.conversation_key || ''), currentUserId))
      .filter(Boolean)));
  }, [internalConversations.items, liveData.profile.id]);
  useEffect(() => {
    if (!liveData.profile.id || historicalDirectUserIds.length === 0) {
      setHistoricalDirectUsers([]);
      return;
    }
    let disposed = false;
    void searchIdentityOptions(supabase, {
      scopes: ['user'],
      exactTokens: historicalDirectUserIds.map((id) => `user:${id}`),
      limitPerScope: 100,
    }).then((result) => {
      if (disposed) return;
      setHistoricalDirectUsers(result.items
        .filter((item) => item.kind === 'user')
        .map((item) => ({
          id: item.id,
          display_name: item.label,
          full_name: item.label,
          avatar_url: item.avatarUrl || null,
          role_id: item.roleId || null,
          job_title: item.subtitle || null,
          is_active: item.active,
        })));
    }).catch(() => {
      if (!disposed) setHistoricalDirectUsers([]);
    });
    return () => {
      disposed = true;
    };
  }, [historicalDirectUserIds, liveData.profile.id]);
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
  const conversationDirectoryUsers = useMemo(() => {
    const usersById = new Map<string, AssigneeDirectory['users'][number]>();
    assigneeDirectory.users.forEach((user) => {
      if (user.id) usersById.set(user.id, user);
    });
    historicalDirectUsers.forEach((user) => {
      if (user.id) usersById.set(user.id, user);
    });
    return Array.from(usersById.values());
  }, [assigneeDirectory.users, historicalDirectUsers]);
  const directoryUserMap = useMemo(() => {
    const map: Record<string, AssigneeDirectory['users'][number]> = {};
    conversationDirectoryUsers.forEach((user) => {
      if (user.id) map[user.id] = user;
    });
    return map;
  }, [conversationDirectoryUsers]);
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
    const selectedBotGroupId = getBotGroupIdFromConversationKey(selectedKey);
    const shouldRefreshBotTimeline = Boolean(
      selectedBotGroupId
      && (selectedKey.startsWith('bot:') || selectedKey.startsWith('live:bot_group:'))
      && botTimelineRefreshRef.current,
    );
    try {
      await Promise.all([
        liveData.refresh(),
        refreshInternalConversations({ force: true }),
        refreshBotConversations({ force: true }),
        shouldRefreshBotTimeline && botTimelineRefreshRef.current
          ? botTimelineRefreshRef.current({ force: true })
          : Promise.resolve(null),
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

  const retryBotMessageMedia = async (item: TimelineEvent) => {
    const rowId = String(item?.sourceRow?.id || '').trim();
    const channel = String(item.botSenderChannel || item.sourceRow?.channel_type || '').trim() as BotChannel;
    if (!rowId || !BOT_CHANNELS.includes(channel)) {
      message.warning('برای این پیام فایل قابل بازیابی پیدا نشد.');
      return;
    }
    const payload = item.sourceRow?.payload && typeof item.sourceRow.payload === 'object' ? item.sourceRow.payload : {};
    const markedRetryable = payload?.media_import_status === 'failed' && payload?.media_import_retryable !== false;
    const mediaItems = collectBotMessageMediaFileRefs(item.sourceRow).filter((ref) => {
      const url = String(ref.url || '').trim();
      return ref.fileId && (!url || markedRetryable || isProviderTemporaryDownloadUrl(channel, url));
    });
    if (mediaItems.length === 0) {
      message.info('این پیام پیوست قابل بازیابی ندارد.');
      return;
    }
    setRetryingBotMediaIds((prev) => new Set(prev).add(rowId));
    try {
      const messageTable = String(item?.conversationKey || '').startsWith('live:bot_direct:')
        ? 'counterparty_bot_direct_messages'
        : 'counterparty_bot_messages';
      const activeConnection = await getActiveChannelSettings(channel);
      const connectionId = String(activeConnection?.id || '').trim();
      if (!connectionId) throw new Error('اتصال فعال بات پیدا نشد.');
      for (const mediaItem of mediaItems) {
        const { data, error } = await supabase.functions.invoke('bot-admin', {
          body: {
            action: 'import_bot_file',
            channel,
            connectionId,
            messageId: rowId,
            messageTable,
            fileId: mediaItem.fileId,
            fileName: mediaItem.fileName || String(item?.sourceRow?.file_name || '').trim() || undefined,
          },
        });
        if (error) throw error;
        if (!data?.success || !String(data?.file_url || '').trim()) {
          const nextError: any = new Error(String(data?.message || 'بازیابی فایل بات ناموفق بود.'));
          nextError.details = data?.details || null;
          throw nextError;
        }
      }
      await liveData.refresh();
      if (botTimelineRefreshRef.current) {
        await botTimelineRefreshRef.current({ force: true });
      }
      message.success('پیوست بات دوباره بازیابی شد.');
    } catch (error: any) {
      console.info('Messaging v2 manual bot media retry failed.', {
        channel,
        messageId: rowId,
        fileIds: mediaItems.map((mediaItem) => mediaItem.fileId),
        error: String(error?.message || error || 'unknown_error'),
        details: error?.details || null,
      });
      message.error(toFaErrorMessage(error, 'بازیابی دوباره فایل بات ناموفق بود.'));
    } finally {
      setRetryingBotMediaIds((prev) => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
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
    const appendRealtimeNote = (row: any) => {
      const rowOrgId = String(row?.org_id || '').trim();
      if (rowOrgId && rowOrgId !== orgId) return;
      const rowAuthorId = resolveInternalAuthorId(row);
      const rowMentionUserIds = normalizeIdArray(row?.mention_user_ids);
      const rowMentionRoleIds = normalizeIdArray(row?.mention_role_ids);
      const mightAffectCurrentUser = rowAuthorId === profileId
        || rowMentionUserIds.includes(profileId)
        || (
          Boolean(liveData.profile.roleId)
          && rowMentionRoleIds.includes(String(liveData.profile.roleId).trim())
        )
        || (
          isInternalSystemNote(row)
          && canCurrentUserAccessInternalSystemNote(row, profileId, liveData.profile.roleId)
        )
        || Boolean(String(row?.metadata?.chat_group_id || '').trim());
      if (!mightAffectCurrentUser) return;
      const summaries = buildInternalConversationFallbackSummaries([row], profileId, liveData.profile.roleId);
      if (summaries.length > 0) {
        internalConversations.setItems((prev) => {
          const existing = Array.isArray(prev) ? prev : [];
          const merged = new Map<string, NotificationConversationSummary>();
          existing.forEach((item) => {
            const key = String(item?.conversation_key || '').trim();
            if (key) merged.set(key, item);
          });
          summaries.forEach((summary) => {
            const key = String(summary?.conversation_key || '').trim();
            if (!key) return;
            const current = merged.get(key);
            merged.set(key, current ? { ...current, ...summary, unread_count: current.unread_count } : summary);
          });
          return Array.from(merged.values()).sort((left, right) => (
            new Date(right.latest_message_at || 0).getTime() - new Date(left.latest_message_at || 0).getTime()
          ));
        });
      }
      if (
        selectedInternalSourceKey
        && doesInternalNoteBelongToConversation(row, selectedInternalSourceKey, profileId, liveData.profile.roleId)
      ) {
        internalTimeline.setItems((prev: any[]) => {
          const id = String(row?.id || '').trim();
          if (!id || prev.some((item: any) => String(item?.id || '') === id)) return prev;
          return [...prev, row].sort((left: any, right: any) => (
            new Date(left?.created_at || 0).getTime() - new Date(right?.created_at || 0).getTime()
          ));
        });
      }
    };
    const unsubscribeNotes = noteInsertBus.subscribe(appendRealtimeNote);
    let channel = supabase
      .channel(`messaging-v2-internal-${orgId}-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `org_id=eq.${orgId}` }, (payload: any) => {
        if (payload?.eventType === 'INSERT' && payload?.new) appendRealtimeNote(payload.new);
        void refreshInternalConversations({ force: true });
        void refreshInternalTimeline({ force: true });
      })
      .subscribe();
    return () => {
      unsubscribeNotes();
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null as any;
      }
    };
  }, [internalConversations.setItems, internalTimeline.setItems, liveData.profile.id, liveData.profile.orgId, liveData.profile.roleId, refreshInternalConversations, refreshInternalTimeline, selectedInternalSourceKey]);
  const directoryReadyForReel = assigneeDirectory.users.length > 0;
  const internalConversationsReady = !internalConversations.available || internalConversations.items !== null;
  const internalReelReady = internalConversationsReady || directoryReadyForReel;
  useEffect(() => {
    if (reelBootstrapped) return;
    if (!liveData.profile.id || !internalReelReady) return;
    setReelBootstrapped(true);
  }, [internalReelReady, liveData.profile.id, reelBootstrapped]);
  const reelInitialLoading = !reelBootstrapped;
  const liveInternalConversations = useMemo(
    () => sortConversationsByActivity(mergeDirectoryDirectConversations(
      ensureInternalSpecialConversations(
        buildInternalLiveConversations(internalConversations.items, String(liveData.profile.id || '').trim()),
        Boolean(liveData.profile.id && internalReelReady),
        orgLogoUrl,
      ),
      conversationDirectoryUsers,
      String(liveData.profile.id || ''),
      roleLookup,
    ).map((conversation) => {
      const sourceKey = String(conversation.sourceConversationKey || getInternalSourceConversationKey(conversation.key) || '').trim();
      const override = sourceKey ? internalConversationLocalOverrides[sourceKey] : null;
      if (!override) return conversation;
      return {
        ...conversation,
        preview: override.preview || conversation.preview,
        time: safeJalaliFormat(override.lastActivityAt, 'MM/DD HH:mm') || conversation.time,
        lastActivityAt: override.lastActivityAt || conversation.lastActivityAt,
      };
    })),
    [conversationDirectoryUsers, internalConversationLocalOverrides, internalConversations.items, internalReelReady, liveData.profile.id, orgLogoUrl, roleLookup],
  );
  const liveInternalEvents = useMemo<TimelineEvent[]>(() => {
    if (!selectedInternalSourceKey) return [];
    const activeConversationKey = getLiveInternalConversationKey(selectedInternalSourceKey);
    const currentUserId = String(liveData.profile.id || '').trim();
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
      const authorId = resolveInternalAuthorId(row);
      const direction = isInternalSystemNote(row)
        ? 'system'
        : authorId && authorId === currentUserId
          ? 'outbound'
          : 'inbound';
      const author = resolveInternalAuthorName(row, directoryUserMap, currentUserId, direction);
      return {
        id: `live-internal-${String(row?.id || row?.created_at || Math.random())}`,
        sourceRow: row,
        conversationKey: activeConversationKey,
        kind: 'message' as const,
        direction,
        author,
        text: parsed.text,
        time: safeJalaliFormat(row?.created_at, 'YYYY/MM/DD HH:mm') || '',
        status: direction === 'outbound' ? 'ارسال شده' : undefined,
        edited: Boolean(row?.is_edited || row?.edited_at),
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
        avatarUrl: resolveInternalAvatarUrl(row, directoryUserMap),
        relatedRecordLabel: relatedRecordLabel || undefined,
        relatedModuleId: String(row?.module_id || '').trim() || null,
        relatedRecordId: String(row?.record_id || '').trim() || null,
        liked: Boolean(currentUserId && likes[currentUserId]),
      };
    });
  }, [
    directoryUserMap,
    internalRecordTitleMap,
    internalTimeline.items,
    liveData.profile.id,
    moduleLabelsRevision,
    roleLookup,
    selectedInternalSourceKey,
  ]);
  const displayConversations = useMemo(() => {
    if (reelInitialLoading) return [];
    const liveInternal = liveInternalConversations;
    const liveBotGroups = mergeBotRpcConversations(
      liveData.conversations.filter((conversation) => conversation.channel === 'bot_group'),
      buildBotRpcConversations(botConversations.items),
    );
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
  }, [botConversations.items, liveData.conversations, liveInternalConversations, localReadThroughByConversation, reelInitialLoading]);
  const initialMessagingLoading = displayConversations.length === 0 && (reelInitialLoading || liveData.loading);
  const messagingUnreadSummary = useMemo<MessagingUnreadSummary>(() => {
    const systemConversation = displayConversations.find((conversation) => conversation.channel === 'internal' && conversation.internalKind === 'system');
    const savedConversation = displayConversations.find((conversation) => conversation.channel === 'internal' && conversation.internalKind === 'saved');
    const botGroupFallback = displayConversations
      .filter((conversation) => conversation.channel === 'bot_group')
      .reduce((sum, conversation) => sum + Math.max(0, Number(conversation.unread || 0)), 0);
    const botDirectFallback = displayConversations
      .filter((conversation) => conversation.channel === 'bot_direct')
      .reduce((sum, conversation) => sum + Math.max(0, Number(conversation.unread || 0)), 0);
    return {
      all: Math.max(0, Number(notificationRuntime.communicationUnread || 0)),
      internal: Math.max(0, Number(notificationRuntime.summary.notes || 0)),
      bot_group: Math.max(0, Number(notificationRuntime.summary.bot_group_messages || botGroupFallback || 0)),
      bot_direct: Math.max(0, Number(notificationRuntime.summary.bot_direct_messages || botDirectFallback || 0)),
      sms: Math.max(0, Number(notificationRuntime.summary.sms_messages || 0)),
      call: Math.max(0, Number(notificationRuntime.summary.voip_calls || 0)),
      system: Math.max(0, Number(systemConversation?.unread || 0)),
      saved: Math.max(0, Number(savedConversation?.unread || 0)),
    };
  }, [
    displayConversations,
    notificationRuntime.communicationUnread,
    notificationRuntime.summary.bot_messages,
    notificationRuntime.summary.bot_direct_messages,
    notificationRuntime.summary.bot_group_messages,
    notificationRuntime.summary.notes,
    notificationRuntime.summary.sms_messages,
    notificationRuntime.summary.voip_calls,
  ]);
  const activeConversation = displayConversations.find((conversation) => conversation.key === selectedKey) || displayConversations[0] || emptyConversation;
  const activeBotGroupId = activeConversation.channel === 'bot_group'
    ? getBotGroupIdFromConversationKey(activeConversation.key)
    : '';
  const activeBotGroupRow = activeBotGroupId
    ? (liveData.botGroups || []).find((row: any) => String(row?.id || '').trim() === activeBotGroupId) || null
    : null;
  const botTimeline = useBotConversationTimeline<any>({
    supabase,
    enabled: Boolean(liveData.profile.id && activeConversation.channel === 'bot_group' && activeBotGroupId),
    botGroupId: activeBotGroupId || null,
    pageSize: 40,
    cacheScopeKey,
  });
  useEffect(() => {
    botTimelineRefreshRef.current = botTimeline.refresh;
    return () => {
      if (botTimelineRefreshRef.current === botTimeline.refresh) {
        botTimelineRefreshRef.current = null;
      }
    };
  }, [botTimeline.refresh]);
  useEffect(() => {
    if (!liveData.profile.id || activeConversation.channel !== 'bot_group' || !activeBotGroupId) return;
    void botTimeline.refresh({ force: true }).catch((error) => {
      console.warn('Could not refresh active bot conversation timeline', error);
    });
  }, [
    activeBotGroupId,
    activeConversation.channel,
    botTimeline.refresh,
    liveData.profile.id,
    notificationRuntime.revisions.bot_messages,
  ]);
  useEffect(() => {
    const orgId = String(liveData.profile.orgId || '').trim();
    if (!orgId) return undefined;
    const unsubscribeBot = botMessageInsertBus.subscribe((row) => {
      const rowOrgId = String(row?.org_id || '').trim();
      if (rowOrgId && rowOrgId !== orgId) return;
      const rowGroupId = String(row?.bot_group_id || '').trim();
      const rowDirectThreadId = String(row?.direct_thread_id || '').trim();
      if (activeConversation.channel === 'bot_group' && activeBotGroupId && rowGroupId === activeBotGroupId) {
        botTimeline.setItems((prev: any[]) => {
          const id = String(row?.id || '').trim();
          if (!id || prev.some((item: any) => String(item?.id || '').trim() === id)) return prev;
          return [...prev, row].sort((left: any, right: any) => compareIsoAsc(left?.created_at, right?.created_at));
        });
      }
      if (
        rowGroupId
        || (activeConversation.channel === 'bot_direct' && rowDirectThreadId && activeConversation.key === `live:bot_direct:${rowDirectThreadId}`)
      ) {
        void liveData.refresh();
        void refreshBotConversations({ force: true });
      }
    });
    return () => {
      unsubscribeBot();
    };
  }, [activeBotGroupId, activeConversation.channel, activeConversation.key, botTimeline.setItems, liveData, refreshBotConversations]);
  const botGroupRpcEvents = useMemo<TimelineEvent[]>(() => (
    activeConversation.channel === 'bot_group'
      ? buildBotGroupRpcTimelineEvents(botTimeline.items || [], activeBotGroupRow, internalRecordTitleMap, [
          ...(liveData.botSenderBindings || []),
          ...optimisticBotSenderBindings,
        ])
      : []
  ), [activeBotGroupRow, activeConversation.channel, botTimeline.items, internalRecordTitleMap, liveData.botSenderBindings, optimisticBotSenderBindings]);
  const displayEvents = useMemo<TimelineEvent[]>(() => {
    const currentUserId = String(liveData.profile.id || '').trim();
    const currentUser = currentUserId ? directoryUserMap[currentUserId] : null;
    const optimisticBindingMap = buildBotIdentityBindingMap(optimisticBotSenderBindings);
    const normalizeInboundBotIdentity = (item: TimelineEvent): TimelineEvent => {
      if (item.direction !== 'inbound') return item;
      const isBotEvent = String(item.conversationKey || '').startsWith('bot:')
        || String(item.conversationKey || '').startsWith('live:bot_direct:');
      if (!isBotEvent) return item;
      const bindingKey = buildBotIdentityBindingKey(item.botSenderChannel, item.botSenderChatId);
      const binding = optimisticBindingMap.get(bindingKey) || null;
      if (!binding?.target_module_id || !binding?.target_record_id) return item;
      const title = getTimelineRecordLabel(
        internalRecordTitleMap,
        String(binding.target_module_id),
        String(binding.target_record_id),
        binding.display_name || item.author,
      );
      return title ? { ...item, author: title, botSenderBound: true } : item;
    };
    const normalizeOutboundEvent = (item: any): TimelineEvent => {
      if (item.direction !== 'outbound') return item;
      const isBotEvent = String(item.conversationKey || '').startsWith('bot:')
        || String(item.conversationKey || '').startsWith('live:bot_direct:');
      const isSmsEvent = item.kind === 'sms';
      const senderId = String((item as any)?.sourceRow?.created_by || '').trim();
      const senderUser = senderId ? directoryUserMap[senderId] : null;
      if (isBotEvent) {
        const isAiSender = isAiTimelineEvent(item);
        return {
          ...item,
          author: isAiSender ? 'هوش مصنوعی' : (String(senderUser?.display_name || item.author || '').trim() || 'کاربر سازمان'),
          avatarUrl: isAiSender ? null : (String((item as any).avatarUrl || senderUser?.avatar_url || '').trim() || null),
          avatarFallback: isAiSender ? <AiSparkleIcon className="h-3.5 w-3.5" /> : item.avatarFallback,
          avatarTone: isAiSender ? 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-200' : item.avatarTone,
          isAiAuthor: isAiSender,
        };
      }
      if (isSmsEvent) {
        return {
          ...item,
          author: String(orgDisplayName || item.author || '').trim() || 'سازمان',
          avatarUrl: String(orgLogoUrl || (item as any).avatarUrl || '').trim() || null,
        };
      }
      if (item.kind === 'call') return item;
      return {
        ...item,
        author: String(currentUser?.display_name || item.author || '').trim() || 'من',
        avatarUrl: String((item as any).avatarUrl || currentUser?.avatar_url || '').trim() || null,
      };
    };
    const normalizedLiveEvents = liveData.events.map((item) => normalizeInboundBotIdentity(normalizeOutboundEvent(item)));
    const normalizedBotGroupRpcEvents = botGroupRpcEvents.map((item) => normalizeInboundBotIdentity(normalizeOutboundEvent(item)));
    const liveEventsForDisplay = normalizedBotGroupRpcEvents.length > 0
      ? normalizedLiveEvents.filter((item) => !(activeConversation.channel === 'bot_group' && item.conversationKey === activeConversation.key))
      : normalizedLiveEvents;
    return [
      ...liveInternalEvents,
      ...liveEventsForDisplay,
      ...normalizedBotGroupRpcEvents,
    ] as TimelineEvent[];
  }, [activeConversation.channel, activeConversation.key, botGroupRpcEvents, directoryUserMap, internalRecordTitleMap, liveData.events, liveData.profile.id, liveInternalEvents, optimisticBotSenderBindings, orgDisplayName, orgLogoUrl]);
  const activeEventsRaw = useMemo(
    () => displayEvents.filter((item) => (
      item.conversationKey === activeConversation.key
      && !locallyDeletedMessageKeys.has(getTimelineEventMutationKey(activeConversation.channel, item))
    )),
    [activeConversation.channel, activeConversation.key, displayEvents, locallyDeletedMessageKeys],
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
    const normalizedInitialKey = normalizeMessagingConversationKey(initialConversationKey);
    if (!normalizedInitialKey) return;
    setSelectedKey(normalizedInitialKey);
    setReadEnabledConversationKey(normalizedInitialKey);
  }, [initialConversationKey]);

  useEffect(() => {
    if (!displayConversations.length) return;
    if (displayConversations.some((conversation) => conversation.key === selectedKey)) return;
    const defaultConversation = displayConversations.find((conversation) => conversation.channel === 'internal') || displayConversations[0];
    setSelectedKey(defaultConversation.key);
  }, [displayConversations, selectedKey]);

  useEffect(() => {
    if (!activeConversation.key || !activeEvents.length) return;
    if (readEnabledConversationKey !== activeConversation.key) return;
    const currentUserId = String(liveData.profile.id || '').trim();
    const readableEvents = activeEvents.filter((item) => {
      const id = String(item.sourceRow?.id || '').trim();
      if (!id) return false;
      if (activeConversation.channel === 'internal') {
        if (item.direction === 'system') return true;
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
        if (!selectedInternalSourceKey || selectedInternalSourceKey === MY_NOTES_CONVERSATION_KEY) {
          entries.push({ section: 'notes', sourceType: 'note', sourceId });
        }
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
        const groupId = getBotGroupIdFromConversationKey(activeConversation.key);
        if (groupId) {
          await notificationRuntime.markCommunicationRead('bot', `bot:${groupId}`, readableEvents.map((item) => ({
            id: item.sourceRow?.id,
            created_at: getEventActivityAt(item),
          })));
        }
      } else if (activeConversation.channel === 'bot_direct') {
        const threadId = getBotDirectThreadIdFromConversationKey(activeConversation.key);
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
        if (activeConversation.channel === 'bot_group') {
          await refreshBotConversations({ force: true });
        }
        await liveData.refresh();
      }
    })().catch((error) => {
      markReadDedupeRef.current = '';
      console.warn('Messaging v2 mark read failed', error);
    });
  }, [
    activeConversation.channel,
    activeConversation.key,
    activeConversation.lastActivityAt,
    activeConversation.unread,
    activeEvents,
    liveData,
    liveData.profile.id,
    notificationRuntime,
    refreshBotConversations,
    refreshInternalConversations,
    readEnabledConversationKey,
    selectedInternalSourceKey,
  ]);

  const selectConversation = (key: string) => {
    const normalizedKey = normalizeMessagingConversationKey(key);
    setSelectedKey(normalizedKey);
    setReadEnabledConversationKey(normalizedKey);
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

  const closeVoipOperatorBindModal = () => {
    setVoipOperatorBindOpen(false);
    setVoipOperatorBindSaving(false);
    setVoipOperatorBindDraft(null);
  };

  const openVoipOperatorBindModal = (item: TimelineEvent) => {
    const row = item.sourceRow || {};
    const extension = String(row?.extension || '').trim() || null;
    const operatorCode = String(row?.operator_code || '').trim() || null;
    const providerOperatorId = String(row?.provider_operator_id || '').trim() || null;
    if (!extension && !operatorCode && !providerOperatorId) {
      message.warning('داخلی یا کد اپراتور برای این تماس ثبت نشده است.');
      return;
    }
    setVoipOperatorBindDraft({
      provider: String(row?.provider || 'telefonchy').trim() || 'telefonchy',
      serviceId: String(row?.service_id || '').trim() || null,
      extension,
      operatorCode,
      providerOperatorId,
      displayName: String(row?.operator_display_name || '').trim() || null,
      profileId: String(row?.assignee_id || '').trim() || null,
    });
    setVoipOperatorBindOpen(true);
  };

  const saveVoipOperatorBinding = async () => {
    const draft = voipOperatorBindDraft;
    if (!draft?.profileId) {
      message.warning('کاربر مقصد را انتخاب کنید.');
      return;
    }
    setVoipOperatorBindSaving(true);
    try {
      await bindVoipOperatorIdentity({ ...draft, profileId: draft.profileId });
      await liveData.refresh();
      message.success('اتصال اپراتور ذخیره شد و پروفایل و تماس‌های مرتبط به‌روز شدند.');
      closeVoipOperatorBindModal();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره اتصال اپراتور ناموفق بود.'));
    } finally {
      setVoipOperatorBindSaving(false);
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
    const optimisticDisplayName = String(item.botSenderDisplayName || item.author || '').trim();
    setBotIdentityBindOpen(true);
    setBotIdentityBindLoading(true);
    setBotIdentityBindDraft({
      channel,
      chatId,
      displayName: optimisticDisplayName,
      username: String(item.botSenderUsername || '').trim().replace(/^@+/, ''),
      phoneNumber: String(item.botSenderPhoneNumber || '').trim(),
      existingBinding: null,
    });
    setBotIdentityBindTargetModuleId('customers');
    setBotIdentityBindTargetRecordId(null);
    setBotIdentityAllowedUserIds(String(liveData.profile.id || '').trim() ? [String(liveData.profile.id || '').trim()] : []);
    setBotIdentityAllowedRoleIds([]);
    setBotIdentityAiAutoReplyEnabled(false);
    setBotIdentityAiCounterpartyGuide('');
    try {
      const orgId = String(liveData.profile.orgId || '').trim();
      const sourceGroupId = String(item.sourceRow?.bot_group_id || '').trim();
      const [bindingResult, threadResult, groupResult] = await Promise.all([
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
        sourceGroupId
          ? supabase
              .from('counterparty_bot_groups')
              .select('metadata')
              .eq('org_id', orgId)
              .eq('id', sourceGroupId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);
      if (bindingResult.error) throw bindingResult.error;
      if (threadResult.error) throw threadResult.error;
      if (groupResult.error) throw groupResult.error;
      const existingBinding = (bindingResult.data || null) as BotIdentityBindingRow | null;
      const threadRow = (threadResult.data || null) as Record<string, any> | null;
      const metadata = threadRow?.metadata && typeof threadRow.metadata === 'object' ? threadRow.metadata : {};
      const groupMetadata = groupResult.data?.metadata && typeof groupResult.data.metadata === 'object' ? groupResult.data.metadata : {};
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
      const rawAllowedUserIds = Array.isArray((metadata as any)?.allowed_user_ids)
        ? (metadata as any).allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const groupAllowedUserIds = Array.isArray((groupMetadata as any)?.allowed_user_ids)
        ? (groupMetadata as any).allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const currentProfileId = String(liveData.profile.id || '').trim();
      setBotIdentityAllowedUserIds(rawAllowedUserIds.length > 0 ? rawAllowedUserIds : (groupAllowedUserIds.length > 0 ? groupAllowedUserIds : (currentProfileId ? [currentProfileId] : [])));
      const rawAllowedRoleIds = Array.isArray((metadata as any)?.allowed_role_ids) ? (metadata as any).allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean) : [];
      const groupAllowedRoleIds = Array.isArray((groupMetadata as any)?.allowed_role_ids) ? (groupMetadata as any).allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean) : [];
      setBotIdentityAllowedRoleIds(rawAllowedRoleIds.length > 0 ? rawAllowedRoleIds : groupAllowedRoleIds);
      setBotIdentityAiAutoReplyEnabled(Boolean((metadata as any)?.ai_auto_reply_enabled ?? (groupMetadata as any)?.ai_auto_reply_enabled));
      setBotIdentityAiCounterpartyGuide(String((metadata as any)?.ai_counterparty_guide || (groupMetadata as any)?.ai_counterparty_guide || '').trim());
    } catch (error: any) {
      setBotIdentityBindOpen(false);
      message.error(toFaErrorMessage(error, 'خواندن اتصال فرستنده بات ناموفق بود.'));
    } finally {
      setBotIdentityBindLoading(false);
    }
  };

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
      const directThreadMetadata = {
        allowed_user_ids: botIdentityAllowedUserIds,
        allowed_role_ids: botIdentityAllowedRoleIds,
        ai_auto_reply_enabled: botIdentityAiAutoReplyEnabled,
        ai_counterparty_guide: String(botIdentityAiCounterpartyGuide || '').trim() || null,
      };
      const syncResult = await syncBotDirectChatIdForTarget({
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
      const boundDisplayName = String(syncResult?.displayName || '').trim();
      setOptimisticBotSenderBindings((prev) => {
        const key = `${draft.channel}:${draft.chatId}`;
        const next = prev.filter((item) => `${String(item.channel_type || '').trim()}:${String(item.chat_id || '').trim()}` !== key);
        next.push({
          channel_type: draft.channel,
          chat_id: draft.chatId,
          target_module_id: botIdentityBindTargetModuleId,
          target_record_id: targetRecordId,
          display_name: boundDisplayName || null,
          username: draft.username || null,
          phone_number: draft.phoneNumber || null,
        });
        return next;
      });
      if (boundDisplayName) {
        setInternalRecordTitleMap((prev) => ({
          ...prev,
          [`${botIdentityBindTargetModuleId}:${targetRecordId}`]: boundDisplayName,
        }));
      }
      await Promise.all([
        liveData.refresh(),
        refreshBotConversations({ force: true }),
        botTimelineRefreshRef.current ? botTimelineRefreshRef.current({ force: true }) : Promise.resolve(null),
      ]);
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

  const applyBotStatusTargetFilter = (query: any, context: Pick<BotStatusModalContext, 'targetType' | 'counterpartyId'>) => {
    if (context.targetType === 'customers') return query.eq('customer_id', context.counterpartyId);
    if (context.targetType === 'suppliers') return query.eq('supplier_id', context.counterpartyId);
    return query.eq('employee_id', context.counterpartyId);
  };

  const getBotGroupContextFromConversation = (conversation: Conversation): BotStatusModalContext | null => {
    const groupId = getBotGroupIdFromConversationKey(conversation.key);
    const groupRow = groupId
      ? (liveData.botGroups || []).find((row: any) => String(row?.id || '').trim() === groupId)
      : null;
    const rawTargetType = String(
      (groupRow as any)?.target_type
      || conversation.relatedModuleId
      || ''
    ).trim();
    const targetType = isBotTargetModuleId(rawTargetType) ? rawTargetType : null;
    const counterpartyId = String(
      (targetType === 'customers' ? (groupRow as any)?.customer_id : null)
      || (targetType === 'suppliers' ? (groupRow as any)?.supplier_id : null)
      || (targetType === 'employees' ? (groupRow as any)?.employee_id : null)
      || conversation.relatedRecordId
      || ''
    ).trim();
    if (!targetType || !counterpartyId) return null;
    return {
      targetType,
      counterpartyId,
      counterpartyLabel: String(conversation.relatedRecordTitle || conversation.title || (groupRow as any)?.group_title || '').trim(),
    };
  };

  const clearBotStatusWatchTimer = () => {
    if (botStatusWatchTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(botStatusWatchTimerRef.current);
      botStatusWatchTimerRef.current = null;
    }
  };

  const loadBotStatusRow = async (context: BotStatusModalContext, options?: { activeTab?: BotChannel | null }) => {
    const groupQueryBase = supabase
      .from('counterparty_bot_groups')
      .select('id, channel_type, status, group_title, group_join_link, metadata, last_inbound_at, bot_chat_id')
      .limit(10);
    const prefQueryBase = supabase
      .from('counterparty_bot_config')
      .select('default_channel, fallback_to_active')
      .limit(1);
    const targetSelect = BOT_CHANNELS.map((channel) => getBotChatIdFieldKey(channel)).join(',');
    const [orgPrefix, groupResult, prefResult, targetRecordResult] = await Promise.all([
      loadOrgBotPrefix(),
      applyBotStatusTargetFilter(groupQueryBase, context),
      applyBotStatusTargetFilter(prefQueryBase, context).maybeSingle(),
      supabase.from(context.targetType).select(targetSelect).eq('id', context.counterpartyId).maybeSingle(),
    ]);
    if (groupResult.error) throw groupResult.error;
    if (prefResult.error) throw prefResult.error;
    if (targetRecordResult.error) throw targetRecordResult.error;

    const rows = groupResult.data || [];
    const rowMap = new Map<string, any>(rows.map((row: any) => [String(row?.channel_type || '').trim(), row] as const));
    const defaultChannel = (BOT_CHANNELS.includes(String(prefResult.data?.default_channel || '') as BotChannel)
      ? prefResult.data!.default_channel
      : 'rubika') as BotChannel;

    const groupIds = rows.map((row: any) => String(row?.id || '').trim()).filter(Boolean);
    const inboundMap = new Map<string, { created_at: string; content_text: string }>();
    if (groupIds.length > 0) {
      const { data: inboundRows } = await supabase
        .from('counterparty_bot_messages')
        .select('created_at, content_text, bot_group_id')
        .in('bot_group_id', groupIds)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(20);
      (inboundRows || []).forEach((row: any) => {
        const groupId = String(row?.bot_group_id || '').trim();
        if (groupId && !inboundMap.has(groupId)) inboundMap.set(groupId, row);
      });
    }

    const platforms: Record<BotChannel, BotPlatformState> = {
      rubika: { ...DEFAULT_BOT_PLATFORM_STATE },
      telegram: { ...DEFAULT_BOT_PLATFORM_STATE },
      bale: { ...DEFAULT_BOT_PLATFORM_STATE },
    };
    const currentProfileId = String(liveData.profile.id || '').trim();
    for (const channel of BOT_CHANNELS) {
      const row = rowMap.get(channel) || null;
      const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const rawAllowedUserIds = Array.isArray((metadata as any)?.allowed_user_ids)
        ? (metadata as any).allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const rowId = String(row?.id || '').trim();
      const inbound = rowId ? inboundMap.get(rowId) : null;
      const rawStatus = String(row?.status || 'pending_join').trim();
      platforms[channel] = {
        groupTitle: String(row?.group_title || '').trim(),
        groupJoinLink: String(row?.group_join_link || '').trim(),
        directChatId: String((targetRecordResult.data as any)?.[getBotChatIdFieldKey(channel)] || '').trim(),
        currentStatus: rawStatus === 'pending_join_link' ? 'pending_join' : (rawStatus || 'pending_join'),
        activationCode: String((metadata as any)?.activation_code || '').trim().toUpperCase() || createBotActivationCode(context.counterpartyLabel, orgPrefix),
        lastInboundAt: String(inbound?.created_at || row?.last_inbound_at || '').trim(),
        lastInboundText: String(inbound?.content_text || '').trim(),
        allowedUserIds: rawAllowedUserIds.length > 0 ? rawAllowedUserIds : (currentProfileId ? [currentProfileId] : []),
        allowedRoleIds: Array.isArray((metadata as any)?.allowed_role_ids) ? (metadata as any).allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean) : [],
        aiAutoReplyEnabled: Boolean((metadata as any)?.ai_auto_reply_enabled),
        aiCounterpartyGuide: String((metadata as any)?.ai_counterparty_guide || '').trim(),
      };
    }

    setBotStatusPlatformData(platforms);
    setBotStatusDefaultChannel(defaultChannel);
    setBotStatusFallbackToActive(Boolean(prefResult.data?.fallback_to_active));
    setBotStatusActiveTab((prev) => (
      options?.activeTab && BOT_CHANNELS.includes(options.activeTab)
        ? options.activeTab
        : (BOT_CHANNELS.includes(prev) ? prev : defaultChannel)
    ));
  };

  const saveBotStatusSettings = async (options?: { forceCapture?: boolean; captureChannel?: BotChannel; captureSeconds?: number }) => {
    const context = botStatusModalContext;
    const orgId = String(liveData.profile.orgId || '').trim();
    const currentProfileId = String(liveData.profile.id || '').trim();
    if (!context || !orgId) return;
    const forceCapture = options?.forceCapture === true;
    const captureChannel = options?.captureChannel || botStatusActiveTab;
    const captureSeconds = Number(options?.captureSeconds || BOT_BIND_CAPTURE_SECONDS);
    const nowIso = new Date().toISOString();
    const captureExpiresAt = forceCapture ? new Date(Date.now() + Math.max(10, captureSeconds) * 1000).toISOString() : null;

    for (const channel of BOT_CHANNELS) {
      const platformState = botStatusPlatformData[channel];
      if (!platformState) continue;
      const isCapturing = forceCapture && channel === captureChannel;
      let existingQuery = supabase
        .from('counterparty_bot_groups')
        .select('id, status, bot_chat_id, metadata')
        .eq('channel_type', channel)
        .limit(1);
      existingQuery = applyBotStatusTargetFilter(existingQuery, context);
      const { data: existingRows, error: existingError } = await existingQuery;
      if (existingError) throw existingError;
      const existingRow = Array.isArray(existingRows) ? existingRows[0] : null;
      const existingStatus = String(existingRow?.status || '').trim() === 'pending_join_link' ? 'pending_join' : String(existingRow?.status || '').trim();
      const existingChatId = String(existingRow?.bot_chat_id || '').trim();
      const existingMetadata = existingRow?.metadata && typeof existingRow.metadata === 'object' ? existingRow.metadata : {};
      const nextStatus = isCapturing ? 'pending_join' : ((existingStatus === 'active' && existingChatId) ? 'active' : 'pending_join');
      const payload: Record<string, any> = {
        target_type: context.targetType,
        channel_type: channel,
        status: nextStatus,
        group_title: String(platformState.groupTitle || '').trim() || null,
        group_join_link: String(platformState.groupJoinLink || '').trim() || null,
        metadata: {
          ...existingMetadata,
          activation_code: String(platformState.activationCode || '').trim().toUpperCase(),
          activation_required: true,
          capture_mode: isCapturing,
          capture_started_at: isCapturing ? nowIso : null,
          capture_expires_at: isCapturing ? captureExpiresAt : null,
          last_capture_channel: isCapturing ? channel : (existingMetadata as any)?.last_capture_channel,
          allowed_user_ids: platformState.allowedUserIds,
          allowed_role_ids: platformState.allowedRoleIds,
          ai_auto_reply_enabled: platformState.aiAutoReplyEnabled,
          ai_counterparty_guide: String(platformState.aiCounterpartyGuide || '').trim() || null,
          activation_confirmation_sent: isCapturing ? false : Boolean((existingMetadata as any)?.activation_confirmation_sent),
          last_capture_error: isCapturing ? null : (existingMetadata as any)?.last_capture_error,
          activation_updated_at: nowIso,
        },
        updated_by: currentProfileId || null,
        customer_id: context.targetType === 'customers' ? context.counterpartyId : null,
        supplier_id: context.targetType === 'suppliers' ? context.counterpartyId : null,
        employee_id: context.targetType === 'employees' ? context.counterpartyId : null,
      };
      if (existingRow?.id) {
        const { error } = await supabase.from('counterparty_bot_groups').update(payload).eq('id', String(existingRow.id));
        if (error) throw error;
      } else {
        const { error } = await supabase.from('counterparty_bot_groups').insert([{ org_id: orgId, created_by: currentProfileId || null, ...payload }]);
        if (error) throw error;
      }

      await syncBotDirectChatIdForTarget({
        client: supabase,
        orgId,
        moduleId: context.targetType,
        recordId: context.counterpartyId,
        channel,
        chatId: String(platformState.directChatId || '').trim() || null,
      });
    }

    const configPayload = {
      org_id: orgId,
      default_channel: botStatusDefaultChannel,
      fallback_to_active: botStatusFallbackToActive,
      customer_id: context.targetType === 'customers' ? context.counterpartyId : null,
      supplier_id: context.targetType === 'suppliers' ? context.counterpartyId : null,
      employee_id: context.targetType === 'employees' ? context.counterpartyId : null,
    };
    let existingConfigQuery = supabase.from('counterparty_bot_config').select('id').limit(1);
    existingConfigQuery = applyBotStatusTargetFilter(existingConfigQuery, context);
    const { data: existingConfigRow, error: existingConfigError } = await existingConfigQuery.maybeSingle();
    if (existingConfigError) throw existingConfigError;
    if (existingConfigRow?.id) {
      const { error } = await supabase.from('counterparty_bot_config').update(configPayload).eq('id', String(existingConfigRow.id));
      if (error) throw error;
    } else {
      const { error } = await supabase.from('counterparty_bot_config').insert([configPayload]);
      if (error) throw error;
    }
    await liveData.refresh();
  };

  const openBotStatusModalFromConversation = async (conversation: Conversation) => {
    const context = getBotGroupContextFromConversation(conversation);
    if (!context) {
      message.warning('برای این گفتگوی بات، رکورد مرتبط پیدا نشد.');
      return;
    }
    setBotStatusModalContext(context);
    setBotStatusModalOpen(true);
    setBotStatusModalLoading(true);
    clearBotStatusWatchTimer();
    setBotStatusWatchingChannel(null);
    setBotStatusCountdown(0);
    try {
      await loadBotStatusRow(context, { activeTab: conversation.platform || null });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'خواندن تنظیم گروه بات ناموفق بود.'));
    } finally {
      setBotStatusModalLoading(false);
    }
  };

  const closeBotStatusModal = () => {
    clearBotStatusWatchTimer();
    setBotStatusWatchingChannel(null);
    setBotStatusCountdown(0);
    setBotStatusModalOpen(false);
  };

  const saveBotStatusModal = async () => {
    if (!botStatusModalContext) return;
    try {
      setBotStatusModalSaving(true);
      await saveBotStatusSettings();
      await loadBotStatusRow(botStatusModalContext, { activeTab: botStatusActiveTab });
      message.success('وضعیت گروه بات ذخیره شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره وضعیت گروه بات ناموفق بود.'));
    } finally {
      setBotStatusModalSaving(false);
    }
  };

  const startBotBindWatch = async (channel: BotChannel) => {
    if (!botStatusModalContext) return;
    try {
      setBotStatusModalSaving(true);
      await saveBotStatusSettings({ forceCapture: true, captureChannel: channel, captureSeconds: BOT_BIND_CAPTURE_SECONDS });
      await loadBotStatusRow(botStatusModalContext, { activeTab: channel });
      clearBotStatusWatchTimer();
      setBotStatusWatchingChannel(channel);
      setBotStatusCountdown(BOT_BIND_CAPTURE_SECONDS);
      let remaining = BOT_BIND_CAPTURE_SECONDS;
      botStatusWatchTimerRef.current = window.setInterval(async () => {
        remaining -= 1;
        setBotStatusCountdown(Math.max(remaining, 0));
        if (remaining % 2 === 0 && botStatusModalContext) {
          try {
            await loadBotStatusRow(botStatusModalContext, { activeTab: channel });
          } catch {
            // ignore temporary polling errors
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
  };

  const copyBotActivationCode = async (channel: BotChannel) => {
    try {
      const code = String(botStatusPlatformData[channel]?.activationCode || '').trim();
      await navigator.clipboard.writeText(code);
      message.success('کد فعال‌سازی کپی شد.');
    } catch {
      message.error('کپی کد فعال‌سازی ناموفق بود.');
    }
  };

  useEffect(() => () => {
    if (botStatusWatchTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(botStatusWatchTimerRef.current);
      botStatusWatchTimerRef.current = null;
    }
  }, []);

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
      clearIdentityDirectoryCache(orgId);
      await refreshInternalConversations({ force: true });
      const nextConversationKey = getLiveInternalConversationKey(`${CHAT_GROUP_PREFIX}${row.id}`);
      setSelectedKey(nextConversationKey);
      setReadEnabledConversationKey(nextConversationKey);
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
      const groupId = getBotGroupIdFromConversationKey(conversation.key);
      return {
        table: 'counterparty_bot_groups' as const,
        id: groupId,
        row: (liveData.botGroups || []).find((item: any) => String(item?.id || '') === groupId) || null,
      };
    }
    if (conversation.channel === 'bot_direct') {
      const threadId = getBotDirectThreadIdFromConversationKey(conversation.key);
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
    const providerResponse = await sendBotMessageViaGateway({
      channel,
      chatId,
      text: String(text || '').trim(),
      attachments: attachments.length ? attachments : undefined,
      fallbackText: options?.fallbackText,
      extraPayload: options?.extraPayload,
      moduleId: String(thread?.target_module_id || '').trim() || undefined,
      recordId: String(thread?.target_record_id || '').trim() || undefined,
    });
    const providerMessageId = String(
      (providerResponse as any)?.result?.message_id
      || (providerResponse as any)?.message_id
      || (providerResponse as any)?.data?.message_id
      || (providerResponse as any)?.data?.message_update?.message_id
      || (providerResponse as any)?.data?.messageUpdate?.messageId
      || ''
    ).trim() || null;
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
        provider_message_id: providerMessageId,
        content_text: String(text || '').trim() || null,
        file_url: String(attachments[0]?.url || '').trim() || null,
        file_name: String(attachments[0]?.name || '').trim() || null,
        mime_type: String(attachments[0]?.mimeType || '').trim() || null,
        created_by: String(liveData.profile.id || '').trim() || null,
        payload: {
          ...(options?.payload || {}),
          ...(options?.extraPayload || {}),
          attachments,
        },
      }]);
    if (insertError) throw insertError;
    const { error: threadError } = await supabase
      .from('counterparty_bot_direct_threads')
      .update({
        last_outbound_at: nowIso,
        last_message_at: nowIso,
        last_message_preview: getMessageListPreview(text, {
          attachments,
          fallback: 'پیام بات',
        }) || null,
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

  useEffect(() => {
    if (!initialForwardMessage || initialForwardHandledRef.current) return;
    const text = String(initialForwardMessage.content || '').trim();
    const attachments = Array.isArray(initialForwardMessage.attachments)
      ? initialForwardMessage.attachments
      : [];
    if (!text && attachments.length === 0) return;

    initialForwardHandledRef.current = true;
    setForwardingNote({
      module_id: String(initialForwardMessage.relatedModuleId || '').trim() || null,
      record_id: String(initialForwardMessage.relatedRecordId || '').trim() || null,
      content: serializeNoteContent(text, attachments),
      __forward_source_type: 'note',
    });
    setForwardTargetUserIds([]);
    setForwardMessageText('');
  }, [initialForwardMessage]);

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

  const canDeleteMessage = (item: TimelineEvent) => {
    const currentUserId = String(liveData.profile.id || '').trim();
    if (!currentUserId || item.direction !== 'outbound') return false;
    if (activeConversation.channel === 'internal') {
      return String(item.sourceRow?.author_id || '').trim() === currentUserId;
    }
    if (activeConversation.channel === 'bot_group' || activeConversation.channel === 'bot_direct') {
      return String(item.sourceRow?.created_by || '').trim() === currentUserId;
    }
    return false;
  };

  const getBotMessageProviderContext = (item: TimelineEvent) => {
    const row = item.sourceRow || {};
    const messageTable = activeConversation.channel === 'bot_direct'
      ? 'counterparty_bot_direct_messages'
      : 'counterparty_bot_messages';
    const conversationRow = activeConversation.channel === 'bot_group'
      ? activeBotGroupRow
      : (liveData.botDirectThreads || []).find((entry: any) => (
        String(entry?.id || '').trim() === getBotDirectThreadIdFromConversationKey(activeConversation.key)
      )) || null;
    return {
      row,
      messageTable,
      channel: String(row?.channel_type || conversationRow?.channel_type || activeConversation.platform || '').trim() as BotChannel,
      chatId: String(
        row?.chat_id
        || (activeConversation.channel === 'bot_group'
          ? activeBotGroupRow?.bot_chat_id
          : (conversationRow && 'chat_id' in conversationRow ? conversationRow.chat_id : null))
        || ''
      ).trim(),
      providerMessageId: String(row?.provider_message_id || '').trim(),
    };
  };

  const canEditMessage = (item: TimelineEvent) => {
    const currentUserId = String(liveData.profile.id || '').trim();
    if (!currentUserId || item.direction !== 'outbound') return false;
    if (activeConversation.channel === 'internal') {
      return String(item.sourceRow?.author_id || '').trim() === currentUserId;
    }
    if (activeConversation.channel !== 'bot_group' && activeConversation.channel !== 'bot_direct') return false;
    const { row, channel, chatId, providerMessageId } = getBotMessageProviderContext(item);
    const messageType = String(row?.message_type || 'text').trim().toLowerCase();
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const isOwnMessage = String(row?.created_by || '').trim() === currentUserId;
    const isEditableAutomatedGroupMessage = activeConversation.channel === 'bot_group'
      && !String(row?.created_by || '').trim()
      && (isAiBotSenderPayload(payload, row) || isSystemBotSenderPayload(payload, row));
    return messageType === 'text'
      && !item.attachments?.length
      && Boolean(String(item.text || '').trim())
      && (isOwnMessage || isEditableAutomatedGroupMessage)
      && BOT_CHANNELS.includes(channel)
      && Boolean(chatId)
      && Boolean(providerMessageId);
  };

  const editMessage = async (item: TimelineEvent, nextText: string) => {
    const normalizedText = String(nextText || '').trim();
    const rowId = String(item.sourceRow?.id || '').trim();
    const mutationKey = getTimelineEventMutationKey(activeConversation.channel, item);
    if (!canEditMessage(item) || !normalizedText || !rowId || !mutationKey) {
      throw new Error('این پیام قابل ویرایش نیست.');
    }
    setEditingMessageKeys((previous) => new Set(previous).add(mutationKey));
    try {
      const editedAt = new Date().toISOString();
      if (activeConversation.channel === 'internal') {
        const parsed = parseNoteContent(item.sourceRow?.content ?? '');
        const nextContent = serializeNoteContent(normalizedText, parsed.attachments);
        const { error } = await supabase
          .from('notes')
          .update({ content: nextContent, is_edited: true, edited_at: editedAt })
          .eq('id', rowId);
        if (error) throw error;
        internalTimeline.setItems((previous: any[]) => (
          (previous || []).map((row: any) => (
            String(row?.id || '').trim() === rowId
              ? { ...row, content: nextContent, is_edited: true, edited_at: editedAt }
              : row
          ))
        ));
        await Promise.all([
          refreshInternalConversations({ force: true }),
          refreshInternalTimeline({ force: true }),
        ]);
      } else {
        const { row, messageTable, channel, chatId, providerMessageId } = getBotMessageProviderContext(item);
        const activeConnection = await getActiveChannelSettings(channel);
        const connectionId = String(activeConnection?.id || '').trim();
        if (!connectionId) throw new Error('اتصال فعال بات پیدا نشد.');
        const { data, error: providerError } = await supabase.functions.invoke('bot-admin', {
          body: {
            action: 'edit_message',
            channel,
            connectionId,
            chatId,
            providerMessageId,
            text: normalizedText,
            messageTable,
          },
        });
        if (providerError) throw providerError;
        if (!data?.success) throw new Error(String(data?.message || 'ویرایش پیام در کانال بات ناموفق بود.'));
        const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
        const { error } = await supabase
          .from(messageTable)
          .update({
            content_text: normalizedText,
            payload: { ...payload, is_edited: true, edited_at: editedAt },
          })
          .eq('id', rowId);
        if (error) throw error;
        botTimeline.setItems((previous: any[]) => (
          (previous || []).map((row: any) => (
            String(row?.id || '').trim() === rowId
              ? {
                ...row,
                content_text: normalizedText,
                payload: { ...(row?.payload || {}), is_edited: true, edited_at: editedAt },
              }
              : row
          ))
        ));
        await Promise.all([
          liveData.refresh(),
          refreshBotConversations({ force: true }),
          botTimelineRefreshRef.current ? botTimelineRefreshRef.current({ force: true }) : Promise.resolve(null),
        ]);
      }
      message.success('پیام ویرایش شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ویرایش پیام ناموفق بود.'));
      throw error;
    } finally {
      setEditingMessageKeys((previous) => {
        const next = new Set(previous);
        next.delete(mutationKey);
        return next;
      });
    }
  };

  const requestEditMessage = (item: TimelineEvent) => {
    if (!canEditMessage(item)) return;
    let nextText = String(item.text || '').trim();
    Modal.confirm({
      title: 'ویرایش پیام',
      width: 560,
      okText: 'ذخیره تغییرات',
      cancelText: 'انصراف',
      content: (
        <Input.TextArea
          defaultValue={nextText}
          autoSize={{ minRows: 4, maxRows: 12 }}
          onChange={(event) => {
            nextText = event.target.value;
          }}
          placeholder="متن پیام"
          aria-label="متن ویرایش‌شدهٔ پیام"
        />
      ),
      onOk: () => {
        if (!String(nextText || '').trim()) {
          message.warning('متن پیام نمی‌تواند خالی باشد.');
          return Promise.reject(new Error('empty edited message'));
        }
        return editMessage(item, nextText);
      },
    });
  };

  const deleteMessage = async (item: TimelineEvent) => {
    if (!canDeleteMessage(item)) {
      message.warning('فقط فرستندهٔ پیام می‌تواند آن را حذف کند.');
      return;
    }
    const rowId = String(item.sourceRow?.id || '').trim();
    const mutationKey = getTimelineEventMutationKey(activeConversation.channel, item);
    if (!rowId || !mutationKey) {
      message.error('شناسهٔ پیام برای حذف پیدا نشد.');
      return;
    }
    setDeletingMessageKeys((previous) => new Set(previous).add(mutationKey));
    try {
      if (activeConversation.channel === 'internal') {
        const { error } = await supabase
          .from('notes')
          .delete()
          .eq('id', rowId);
        if (error) throw error;
        internalTimeline.setItems((previous: any[]) => (
          (previous || []).filter((row: any) => String(row?.id || '').trim() !== rowId)
        ));
        const sourceConversationKey = String(
          activeConversation.sourceConversationKey
          || getInternalSourceConversationKey(activeConversation.key)
          || ''
        ).trim();
        if (sourceConversationKey) {
          setInternalConversationLocalOverrides((previous) => {
            const next = { ...previous };
            delete next[sourceConversationKey];
            return next;
          });
        }
        setLocallyDeletedMessageKeys((previous) => new Set(previous).add(mutationKey));
        await Promise.all([
          refreshInternalConversations({ force: true }),
          refreshInternalTimeline({ force: true }),
        ]);
      } else if (activeConversation.channel === 'bot_group' || activeConversation.channel === 'bot_direct') {
        const messageTable = activeConversation.channel === 'bot_direct'
          ? 'counterparty_bot_direct_messages'
          : 'counterparty_bot_messages';
        const row = item.sourceRow || {};
        const conversationRow = activeConversation.channel === 'bot_group'
          ? activeBotGroupRow
          : (liveData.botDirectThreads || []).find((entry: any) => (
            String(entry?.id || '').trim() === getBotDirectThreadIdFromConversationKey(activeConversation.key)
          )) || null;
        const channel = String(row?.channel_type || conversationRow?.channel_type || '').trim() as BotChannel;
        const chatId = String(
          row?.chat_id
          || (activeConversation.channel === 'bot_group'
            ? activeBotGroupRow?.bot_chat_id
            : (conversationRow && 'chat_id' in conversationRow ? conversationRow.chat_id : null))
          || ''
        ).trim();
        const providerMessageId = String(row?.provider_message_id || '').trim();
        if (providerMessageId && BOT_CHANNELS.includes(channel) && chatId) {
          const activeConnection = await getActiveChannelSettings(channel);
          const connectionId = String(activeConnection?.id || '').trim();
          if (!connectionId) throw new Error('اتصال فعال بات پیدا نشد.');
          const { data, error } = await supabase.functions.invoke('bot-admin', {
            body: {
              action: 'delete_message',
              channel,
              connectionId,
              chatId,
              providerMessageId,
              messageTable,
            },
          });
          if (error) throw error;
          if (!data?.success) throw new Error(String(data?.message || 'حذف پیام از کانال بات ناموفق بود.'));
        }
        const { error } = await supabase
          .from(messageTable)
          .delete()
          .eq('id', rowId);
        if (error) throw error;
        botTimeline.setItems((previous: any[]) => (
          (previous || []).filter((row: any) => String(row?.id || '').trim() !== rowId)
        ));
        setLocallyDeletedMessageKeys((previous) => new Set(previous).add(mutationKey));
        await Promise.all([
          liveData.refresh(),
          refreshBotConversations({ force: true }),
          botTimelineRefreshRef.current ? botTimelineRefreshRef.current({ force: true }) : Promise.resolve(null),
        ]);
      }
      message.success('پیام حذف شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'حذف پیام ناموفق بود.'));
      throw error;
    } finally {
      setDeletingMessageKeys((previous) => {
        const next = new Set(previous);
        next.delete(mutationKey);
        return next;
      });
    }
  };

  const requestDeleteMessage = (item: TimelineEvent) => {
    if (!canDeleteMessage(item)) return;
    Modal.confirm({
      title: 'حذف پیام',
      content: 'این پیام از پیام‌رسانی حذف می‌شود و قابل بازگردانی نیست.',
      okText: 'حذف پیام',
      cancelText: 'انصراف',
      okButtonProps: { danger: true },
      onOk: () => deleteMessage(item),
    });
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
    if (conversation.channel === 'internal') {
      if (conversation.readOnly || conversation.internalKind === 'system') {
        message.warning('پیام‌های سیستم فقط برای مشاهده هستند.');
        return false;
      }
      const orgId = String(liveData.profile.orgId || '').trim();
      const authorId = String(liveData.profile.id || '').trim();
      const sourceConversationKey = String(
        conversation.sourceConversationKey
        || getInternalSourceConversationKey(conversation.key)
        || conversation.key
        || ''
      ).trim();
      if (!orgId || !authorId || !sourceConversationKey) {
        message.error('اطلاعات لازم برای ارسال پیام داخلی کامل نیست.');
        return false;
      }
      try {
        const { mentionUserIds, mentionRoleIds } = parseMentionValues(payload?.mentionValues || []);
        let finalMentionUserIds = mentionUserIds;
        let finalMentionRoleIds = mentionRoleIds;
        let metadata: Record<string, any> = {
          conversation_key: sourceConversationKey,
          source_type: 'internal_message',
        };

        if (sourceConversationKey === MY_NOTES_CONVERSATION_KEY || conversation.internalKind === 'saved') {
          finalMentionUserIds = [];
          finalMentionRoleIds = [];
          metadata = { ...metadata, saved_message: true };
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
              metadata = { ...metadata, chat_group_id: groupId };
            }
          } else if (typeof selection === 'string' && selection) {
            finalMentionUserIds = Array.from(new Set([...finalMentionUserIds, selection]));
            metadata = { ...metadata, target_user_id: selection };
          } else {
            throw new Error('گیرنده گفتگوی داخلی قابل شناسایی نیست.');
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

        const notePayload = {
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
        };
        const insertedRows = await sendInternalMessageV2(notePayload);
        if (!Array.isArray(insertedRows) || insertedRows.length === 0) {
          throw new Error('پیام در سرور ذخیره نشد.');
        }
        const latestInserted = insertedRows[insertedRows.length - 1] as any;
        const latestPreview = normalizedText || 'فایل یا تصویر پیوست';
        const latestAt = String(latestInserted?.created_at || new Date().toISOString()).trim();
        setInternalConversationLocalOverrides((prev) => ({
          ...prev,
          [sourceConversationKey]: {
            preview: latestPreview,
            lastActivityAt: latestAt,
          },
        }));
        internalTimeline.setItems((prev: any[]) => {
          const merged = [...prev, ...insertedRows];
          const unique = new Map<string, any>();
          merged.forEach((row: any) => {
            const key = String(row?.id || '').trim();
            if (key) unique.set(key, row);
          });
          return Array.from(unique.values()).sort((left: any, right: any) => (
            new Date(left?.created_at || 0).getTime() - new Date(right?.created_at || 0).getTime()
          ));
        });
        if (payload.smsNotificationEnabled && (finalMentionUserIds.length > 0 || finalMentionRoleIds.length > 0)) {
          // پیام داخلی با موفقیت در سرور ثبت شده است؛ اطلاع‌رسانی پیامکی و
          // همگام‌سازی فهرست نباید دکمهٔ ارسال را معطل کنند.
          void sendNoteSmsNotifications({
            authorName: directoryUserMap[authorId]?.display_name || 'کاربر',
            noteText: normalizedText || (mergedAttachments.length > 0 ? 'فایل یا تصویر پیوست' : ''),
            mentionUserIds: finalMentionUserIds,
            mentionRoleIds: finalMentionRoleIds,
            title: 'اطلاع‌رسانی پیام داخلی',
          }).catch((notificationError) => {
            console.warn('Could not send internal-message SMS notification', notificationError);
            message.warning('پیام داخلی ارسال شد، اما اطلاع‌رسانی پیامکی ناموفق بود.');
          });
        }
        void Promise.all([
          refreshInternalConversations({ force: true }),
          refreshInternalTimeline({ force: true }),
        ]).catch((refreshError) => {
          console.warn('Could not refresh internal conversation after send', refreshError);
        });
        message.success('پیام داخلی ارسال شد.');
        return true;
      } catch (error: any) {
        // If the database committed but its response was interrupted, the
        // forced refresh above can still surface the message without inviting
        // the user to resend it and create a duplicate.
        void Promise.all([
          refreshInternalConversations({ force: true }),
          refreshInternalTimeline({ force: true }),
        ]).catch(() => undefined);
        message.error(toFaErrorMessage(error, 'ارسال پیام داخلی ناموفق بود.'));
        return false;
      }
    }
    if (conversation.channel === 'bot_group' || conversation.channel === 'bot_direct') {
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
        const shareAttachments = mergedAttachments.length > 0
          ? await shortenAttachmentsForExternalShare(mergedAttachments, {
            title: conversation.title || 'پیوست پیام',
            moduleId: conversation.relatedModuleId || null,
            recordId: conversation.relatedRecordId || null,
            metadata: { source: 'messages_v2_omni' },
          })
          : [];
        const outboundAttachments = mergedAttachments;
        const attachmentNameText = buildAttachmentNameText(shareAttachments.length > 0 ? shareAttachments : outboundAttachments);
        const finalText = normalizedText || (outboundAttachments.length > 0 ? attachmentNameText : '');
        if (!finalText && outboundAttachments.length === 0) {
          message.warning('متن یا پیوست پیام خالی است.');
          return false;
        }
        if (conversation.channel === 'bot_group') {
          const groupId = getBotGroupIdFromConversationKey(conversation.key);
          const group = (liveData.botGroups || []).find((row: any) => String(row?.id || '') === groupId);
          if (!group) throw new Error('گروه بات انتخاب‌شده پیدا نشد.');
          await sendTextToBotGroup(group, finalText, {
            attachments: outboundAttachments.length > 0 ? outboundAttachments : undefined,
            fallbackText: outboundAttachments.length > 0 ? [normalizedText, attachmentNameText].filter(Boolean).join('\n') : undefined,
            messageType: outboundAttachments.length > 0 ? 'file' : 'text',
            payload: {
              attachments: shareAttachments.length > 0 ? shareAttachments : outboundAttachments,
              upload_attachments: outboundAttachments,
              reply_to_message_id: replyTarget?.sourceRow?.provider_message_id || null,
            },
          });
        } else {
          const threadId = getBotDirectThreadIdFromConversationKey(conversation.key);
          const thread = (liveData.botDirectThreads || []).find((row: any) => String(row?.id || '') === threadId);
          if (!thread) throw new Error('گفتگوی شخصی بات انتخاب‌شده پیدا نشد.');
          await sendTextToBotDirectThread(thread, finalText, {
            attachments: outboundAttachments.length > 0 ? outboundAttachments : undefined,
            fallbackText: outboundAttachments.length > 0 ? [normalizedText, attachmentNameText].filter(Boolean).join('\n') : undefined,
            messageType: outboundAttachments.length > 0 ? 'file' : 'text',
            payload: {
              attachments: shareAttachments.length > 0 ? shareAttachments : outboundAttachments,
              upload_attachments: outboundAttachments,
              reply_to_message_id: replyTarget?.sourceRow?.provider_message_id || null,
            },
          });
        }
        // ارسال بات و ثبت پیام کامل شده است. refreshهای عمومی می‌توانند در
        // پس‌زمینه اجرا شوند؛ منتظر ماندن برای آن‌ها باعث گیرکردن دکمه می‌شد.
        void Promise.all([
          liveData.refresh(),
          conversation.channel === 'bot_group'
            ? refreshBotConversations({ force: true })
            : Promise.resolve(null),
        ]).catch((refreshError) => {
          console.warn('Could not refresh bot conversation after send', refreshError);
        });
        if (botSmsNotification) {
          void (async () => {
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
            message.success('اطلاع‌رسانی پیامکی پیام بات ارسال شد.');
          })().catch((smsError: any) => {
            console.warn('Could not send bot-message SMS notification', smsError);
            message.warning(toFaErrorMessage(smsError, 'پیام بات ارسال شد، اما اطلاع‌رسانی پیامکی ناموفق بود.'));
          });
        }
        message.success('پیام بات ارسال شد.');
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
      void liveData.refresh().catch((refreshError) => {
        console.warn('Could not refresh SMS conversation after send', refreshError);
      });
      message.success('پیامک ارسال شد.');
      return true;
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ارسال پیامک ناموفق بود.'));
      return false;
    }
  };

  const requestActiveReplySuggestion = async (instruction: string) => {
    if (activeConversation.channel !== 'bot_group' && activeConversation.channel !== 'bot_direct') {
      throw new Error('پیشنهاد پاسخ برای این نوع گفتگو در دسترس نیست.');
    }
    const recentMessages = buildRecentReplySuggestionMessages(activeEvents);
    if (recentMessages.length === 0) {
      throw new Error('برای پیشنهاد پاسخ، هنوز پیامی در این گفتگو وجود ندارد.');
    }

    const botDirectThreadId = activeConversation.channel === 'bot_direct'
      ? String(activeConversation.key || '').replace(/^live:bot_direct:/, '').trim()
      : '';
    const { data, error } = await supabase.functions.invoke('ai-assistant', {
      body: {
        action: 'suggest_reply',
        channel: 'bot',
        botGroupId: activeConversation.channel === 'bot_group' ? activeBotGroupId || null : null,
        botDirectThreadId: botDirectThreadId || null,
        instruction: String(instruction || '').trim() || null,
        context: {
          mode: activeConversation.relatedModuleId && activeConversation.relatedRecordId ? 'record' : 'page',
          moduleId: activeConversation.relatedModuleId || null,
          recordId: activeConversation.relatedRecordId || null,
          route: '/messages',
        },
        counterparty: {
          moduleId: activeConversation.relatedModuleId || null,
          recordId: activeConversation.relatedRecordId || null,
        },
        recentMessages,
      },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(String(data?.message || 'دریافت پیشنهاد پاسخ ناموفق بود.'));
    const suggestedReply = String(data?.suggestedReply || '').trim();
    if (!suggestedReply) throw new Error('متن پیشنهادی معتبری دریافت نشد.');
    return suggestedReply;
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
            loading={initialMessagingLoading}
            onRefresh={() => void refreshMessagingSurface()}
            refreshing={refreshingMessages}
            onCreateInternalGroup={openCreateInternalGroupModal}
            hasMoreSms={liveData.hasMoreSms}
            hasMoreCalls={liveData.hasMoreCalls}
            loadingMoreSms={liveData.loadingMoreSms}
            loadingMoreCalls={liveData.loadingMoreCalls}
            onLoadMoreSms={() => void liveData.loadMoreSms()}
            onLoadMoreCalls={() => void liveData.loadMoreCalls()}
            activeFilter={conversationFilter}
            onChangeFilter={changeConversationFilter}
            unreadSummary={messagingUnreadSummary}
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
              loading={initialMessagingLoading}
              hasMoreSms={liveData.hasMoreSms}
              hasMoreCalls={liveData.hasMoreCalls}
              loadingMoreSms={liveData.loadingMoreSms}
              loadingMoreCalls={liveData.loadingMoreCalls}
              onLoadMoreSms={() => void liveData.loadMoreSms()}
              onLoadMoreCalls={() => void liveData.loadMoreCalls()}
              activeFilter={conversationFilter}
              onChangeFilter={changeConversationFilter}
              unreadSummary={messagingUnreadSummary}
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
                loading={initialMessagingLoading}
                onRefresh={() => void refreshMessagingSurface()}
                refreshing={refreshingMessages}
                onCreateInternalGroup={openCreateInternalGroupModal}
                hasMoreSms={liveData.hasMoreSms}
                hasMoreCalls={liveData.hasMoreCalls}
                loadingMoreSms={liveData.loadingMoreSms}
                loadingMoreCalls={liveData.loadingMoreCalls}
                onLoadMoreSms={() => void liveData.loadMoreSms()}
                onLoadMoreCalls={() => void liveData.loadMoreCalls()}
                activeFilter={conversationFilter}
                onChangeFilter={changeConversationFilter}
                unreadSummary={messagingUnreadSummary}
              />
            </div>
          </div>
        ) : null}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {initialMessagingLoading ? (
            <MessagingTimelineSkeleton />
          ) : displayConversations.length === 0 ? (
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
                onEditBotGroup={(conversation) => void openBotStatusModalFromConversation(conversation)}
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
                      onBindVoipOperator={openVoipOperatorBindModal}
                      onRetryBotMedia={retryBotMessageMedia}
                      retryingMedia={retryingBotMediaIds.has(String(item.sourceRow?.id || '').trim())}
                      canDelete={canDeleteMessage(item)}
                      deleting={deletingMessageKeys.has(getTimelineEventMutationKey(activeConversation.channel, item))}
                      onDelete={requestDeleteMessage}
                      canEdit={canEditMessage(item)}
                      editing={editingMessageKeys.has(getTimelineEventMutationKey(activeConversation.channel, item))}
                      onEdit={requestEditMessage}
                    />
                  ))}
                </div>
              </div>
              <MessagingComposerDock
                key={activeConversation.key}
                conversation={activeConversation}
                onSendMessage={sendMessage}
                onRequestReplySuggestion={activeConversation.channel === 'bot_group' || activeConversation.channel === 'bot_direct'
                  ? requestActiveReplySuggestion
                  : undefined}
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
        open={voipOperatorBindOpen}
        title="اتصال اپراتور تماس"
        okText="ذخیره اتصال"
        cancelText="انصراف"
        confirmLoading={voipOperatorBindSaving}
        onOk={() => void saveVoipOperatorBinding()}
        onCancel={closeVoipOperatorBindModal}
        destroyOnHidden
      >
        <div className="space-y-3" dir="rtl">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300">
            {[
              voipOperatorBindDraft?.displayName,
              voipOperatorBindDraft?.extension ? `داخلی ${toPersianNumber(voipOperatorBindDraft.extension)}` : '',
              voipOperatorBindDraft?.operatorCode ? `کد اپراتور ${toPersianNumber(voipOperatorBindDraft.operatorCode)}` : '',
            ].filter(Boolean).join(' · ') || 'اطلاعات اپراتور از تماس'}
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">کاربر سازمان</div>
            <AdaptiveIdentityPicker
              scopes={['user']}
              valueMode="raw"
              value={voipOperatorBindDraft?.profileId || undefined}
              onChange={(value) => setVoipOperatorBindDraft((current) => current ? {
                ...current,
                profileId: Array.isArray(value) ? String(value[0] || '').trim() || null : String(value || '').trim() || null,
              } : current)}
              placeholder="انتخاب کاربر"
              pickerTitle="انتخاب کاربر برای اپراتور تلفنچی"
              className="w-full"
            />
          </div>
          <p className="m-0 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            پس از ذخیره، داخلی و کد اپراتور در پروفایل کاربر به‌روز و تماس‌های هم‌نام این سازمان به همان کاربر متصل می‌شوند.
          </p>
        </div>
      </Modal>
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
              botStatusModalContext?.targetType === 'customers'
                ? 'customer'
                : botStatusModalContext?.targetType === 'suppliers'
                  ? 'supplier'
                  : 'employee'
            }
            platforms={botStatusPlatformData}
            userOptions={internalGroupUserOptions}
            roleOptions={internalGroupRoleOptions}
            onClose={closeBotStatusModal}
            onSave={() => void saveBotStatusModal()}
            onChangeTab={setBotStatusActiveTab}
            onChangeDefaultChannel={setBotStatusDefaultChannel}
            onChangeFallbackToActive={setBotStatusFallbackToActive}
            onStartBindWatch={(channel) => void startBotBindWatch(channel)}
            onCopyActivationCode={(channel) => void copyBotActivationCode(channel)}
            onChangePlatform={(channel, key, value) => {
              setBotStatusPlatformData((prev) => ({
                ...prev,
                [channel]: {
                  ...prev[channel],
                  [key]: value,
                },
              }));
            }}
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
        destroyOnHidden
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
            <AdaptiveIdentityPicker
              mode="multiple"
              scopes={['user']}
              valueMode="raw"
              allowClear
              value={internalGroupUserIds}
              onChange={(values) => setInternalGroupUserIds(Array.isArray(values) ? values : [])}
              placeholder="انتخاب کاربران"
              pickerTitle="انتخاب اعضای گروه داخلی"
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">نقش‌ها</div>
            <AdaptiveIdentityPicker
              mode="multiple"
              scopes={['role']}
              valueMode="raw"
              allowClear
              value={internalGroupRoleIds}
              onChange={(values) => setInternalGroupRoleIds(Array.isArray(values) ? values : [])}
              placeholder="انتخاب نقش‌ها"
              pickerTitle="انتخاب نقش‌های گروه داخلی"
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
            onForwarded={({ internalRows }) => {
              const rowsForActiveConversation = internalRows.filter((row: any) => (
                String(row?.metadata?.conversation_key || '').trim() === selectedInternalSourceKey
              ));
              if (rowsForActiveConversation.length > 0) {
                internalTimeline.setItems((previous: any[]) => {
                  const rowsById = new Map<string, any>();
                  [...previous, ...rowsForActiveConversation].forEach((row: any) => {
                    const id = String(row?.id || '').trim();
                    if (id) rowsById.set(id, row);
                  });
                  return Array.from(rowsById.values()).sort((left: any, right: any) => (
                    new Date(left?.created_at || 0).getTime() - new Date(right?.created_at || 0).getTime()
                  ));
                });
              }
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
          <MessageActivityModalRuntime
            draft={messageActivityDraft}
            profileId={liveData.profile.id}
            onClose={() => setMessageActivityDraft(null)}
          />
        </React.Suspense>
      ) : null}
    </div>
  );
};

export default MessagingSurfacePrototype;
