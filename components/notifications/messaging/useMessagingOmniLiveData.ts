import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { MODULES } from '../../../moduleRegistry';
import { fetchSessionBootstrap } from '../../../utils/sessionCache';
import { resolveVoipAccessPermissions } from '../../../utils/permissions';
import { isMissingColumnError, isMissingTableLikeError } from '../../../utils/notificationAssigneeHelpers';
import { isMissingRpcError } from '../../../utils/notificationConversationRpc';
import {
  buildSmsThreads,
  buildVoipThreads,
  type NotificationReadChecker,
} from '../../../utils/notificationViewModels';
import { buildRecordReferenceKey, fetchRecordReferenceLabels } from '../../../utils/recordReference';
import { safeJalaliFormat, toPersianNumber } from '../../../utils/persianNumberFormatter';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { BOT_CHANNEL_LABELS_FA, isBotChannel } from '../../../utils/botPlatform';
import { extractBotMessageAttachments } from '../../../utils/messageAttachments';

type ChannelKind = 'internal' | 'bot_group' | 'bot_direct' | 'sms' | 'call';
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

export type MessagingOmniConversation = {
  key: string;
  channel: ChannelKind;
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

export type MessagingOmniTimelineEvent = {
  id: string;
  conversationKey: string;
  sourceRow?: any;
  kind: 'message' | 'sms' | 'call';
  direction: 'inbound' | 'outbound' | 'system';
  author: string;
  text: string;
  time: string;
  status?: string;
  attachments?: Array<{ name: string; kind: AttachmentKind; url?: string | null; mimeType?: string | null }>;
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

type LiveProfile = {
  id: string | null;
  orgId: string | null;
  roleId: string | null;
  voipExtension: string | null;
  canViewAllCalls: boolean;
};

type BotGroupRow = {
  id: string;
  customer_id?: string | null;
  supplier_id?: string | null;
  employee_id?: string | null;
  channel_type?: string | null;
  status?: string | null;
  group_title?: string | null;
  bot_chat_id?: string | null;
  updated_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  metadata?: Record<string, any> | null;
};

type BotMessageRow = {
  id: string;
  bot_group_id?: string | null;
  direct_thread_id?: string | null;
  direction?: string | null;
  message_type?: string | null;
  content_text?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  payload?: Record<string, any> | null;
  created_at?: string | null;
};

type BotDirectThreadRow = {
  id: string;
  channel_type?: string | null;
  chat_id?: string | null;
  target_module_id?: string | null;
  target_record_id?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  employee_id?: string | null;
  display_name?: string | null;
  username?: string | null;
  phone_number?: string | null;
  last_seen_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  metadata?: Record<string, any> | null;
};

const SEEN_SMS_MESSAGES_STORAGE_KEY = 'notif_seen_sms_messages_v1';
const SEEN_VOIP_CALLS_STORAGE_KEY = 'notif_seen_voip_calls_v1';

const buildReadStateKey = (section: string, sourceType: string, sourceId: string) =>
  `${String(section || '').trim()}:${String(sourceType || '').trim()}:${String(sourceId || '').trim()}`;

const normalizeReadStateSection = (section: string) => {
  const normalized = String(section || '').trim();
  if (normalized === 'sms_messages') return 'sms';
  return normalized;
};

const readSeenSet = (key: string) => {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return new Set<string>((Array.isArray(parsed) ? parsed : []).map((item) => String(item || '').trim()).filter(Boolean));
  } catch {
    return new Set<string>();
  }
};

const formatTime = (value: any) => safeJalaliFormat(value, 'MM/DD HH:mm') || '';

const getModuleLabel = (moduleId?: string | null) => {
  const normalized = String(moduleId || '').trim();
  return normalized ? MODULES[normalized]?.titles?.fa || normalized : '';
};

const getModuleFieldOptionLabel = (moduleId: string, fieldKey: string, value: any) => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';
  const field = (MODULES[moduleId]?.fields || []).find((item: any) => String(item?.key || '') === fieldKey);
  const option = (field?.options || []).find((item: any) => String(item?.value ?? '').trim() === rawValue);
  return String(option?.label || '').trim();
};

const RAW_STATUS_LABELS_FA: Record<string, string> = {
  unknown_delivery: 'وضعیت تحویل نامشخص',
  unknown: 'نامشخص',
  manual: 'ثبت دستی',
  pending: 'در انتظار ارسال',
  queued: 'در صف ارسال',
  sending: 'در حال ارسال',
  sent: 'ارسال شده',
  delivered: 'تحویل شده',
  failed: 'ناموفق',
  error: 'خطا',
  inbound: 'ورودی',
  incoming: 'ورودی',
  outgoing: 'خروجی',
  missed: 'بی‌پاسخ',
  answered: 'پاسخ داده شده',
  completed: 'تکمیل شده',
};

const resolveRawLabelFa = (value: any) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return RAW_STATUS_LABELS_FA[normalized] || normalized;
};

const resolveSmsStatusLabel = (value: any) =>
  getModuleFieldOptionLabel('sms_delivery_reports', 'status', value) || resolveRawLabelFa(value);

const resolveVoipStatusLabel = (value: any) =>
  getModuleFieldOptionLabel('voip_call_reports', 'status', value) || resolveRawLabelFa(value);

const getRecordLabel = (
  recordTitleMap: Record<string, string>,
  moduleId?: string | null,
  recordId?: string | null,
  fallback?: string | null,
) => {
  const key = buildRecordReferenceKey(moduleId, recordId);
  return (key ? recordTitleMap[key] : '') || String(fallback || '').trim();
};

const getPhoneMatchLabel = (value: any) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (['matched', 'bound', 'linked', 'connected', 'verified'].includes(normalized)) return 'مخاطب متصل';
  if (['ambiguous', 'multiple'].includes(normalized)) return 'چند مخاطب پیشنهادی';
  if (['unmatched', 'not_found', 'unknown'].includes(normalized)) return 'نیازمند اتصال مخاطب';
  if (normalized === 'manual') return 'تطبیق دستی';
  return resolveRawLabelFa(normalized);
};

const collectRecordReferences = (rows: any[]) => {
  const references: Array<{ module_id: string; record_id: string }> = [];
  (rows || []).forEach((row) => {
    [
      [row?.module_id, row?.record_id],
      [row?.related_module_id, row?.related_record_id],
    ].forEach(([moduleId, recordId]) => {
      const normalizedModuleId = String(moduleId || '').trim();
      const normalizedRecordId = String(recordId || '').trim();
      if (normalizedModuleId && normalizedRecordId) {
        references.push({ module_id: normalizedModuleId, record_id: normalizedRecordId });
      }
    });
  });
  return references;
};

const resolveBotTarget = (row: any) => {
  const directModuleId = String(row?.target_module_id || '').trim();
  const directRecordId = String(row?.target_record_id || '').trim();
  if (directModuleId && directRecordId) return { moduleId: directModuleId, recordId: directRecordId };
  const customerId = String(row?.customer_id || '').trim();
  if (customerId) return { moduleId: 'customers', recordId: customerId };
  const supplierId = String(row?.supplier_id || '').trim();
  if (supplierId) return { moduleId: 'suppliers', recordId: supplierId };
  const employeeId = String(row?.employee_id || '').trim();
  if (employeeId) return { moduleId: 'employees', recordId: employeeId };
  return { moduleId: '', recordId: '' };
};

const collectBotRecordReferences = (rows: any[]) =>
  (rows || []).map(resolveBotTarget)
    .filter((item) => item.moduleId && item.recordId)
    .map((item) => ({ module_id: item.moduleId, record_id: item.recordId }));

const canSeeRestrictedBotRow = (row: any, profile: LiveProfile) => {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const allowedUserIds = Array.isArray((metadata as any)?.allowed_user_ids)
    ? (metadata as any).allowed_user_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
    : [];
  const allowedRoleIds = Array.isArray((metadata as any)?.allowed_role_ids)
    ? (metadata as any).allowed_role_ids.map((id: any) => String(id || '').trim()).filter(Boolean)
    : [];
  if (!allowedUserIds.length && !allowedRoleIds.length) return true;
  if (profile.id && allowedUserIds.includes(profile.id)) return true;
  if (profile.roleId && allowedRoleIds.includes(profile.roleId)) return true;
  return false;
};

const sortByActivityDesc = <T extends Record<string, any>>(rows: T[]) =>
  rows.slice().sort((left, right) => {
    const leftTime = new Date(left?.last_message_at || left?.last_inbound_at || left?.last_outbound_at || left?.updated_at || left?.created_at || 0).getTime() || 0;
    const rightTime = new Date(right?.last_message_at || right?.last_inbound_at || right?.last_outbound_at || right?.updated_at || right?.created_at || 0).getTime() || 0;
    return rightTime - leftTime;
  });

const createNotificationReadChecker = (readStateKeys: Set<string>): NotificationReadChecker => (section, sourceType, sourceId, fallbackRead) => {
  const normalizedSourceId = String(sourceId || '').trim();
  if (!normalizedSourceId) return true;
  const normalizedSection = normalizeReadStateSection(section);
  if (readStateKeys.has(buildReadStateKey(normalizedSection, sourceType, normalizedSourceId))) return true;
  if (fallbackRead) return true;
  if (section === 'sms_messages' && sourceType === 'inbound_sms') {
    return readSeenSet(SEEN_SMS_MESSAGES_STORAGE_KEY).has(normalizedSourceId);
  }
  if (section === 'voip_calls' && sourceType === 'voip_call') {
    return readSeenSet(SEEN_VOIP_CALLS_STORAGE_KEY).has(normalizedSourceId);
  }
  return false;
};

const fetchNotificationReadStateKeys = async (profile: LiveProfile) => {
  if (!profile.id || !profile.orgId) return new Set<string>();
  const { data, error } = await supabase
    .from('notification_read_states')
    .select('section,source_type,source_id')
    .eq('org_id', profile.orgId)
    .eq('user_id', profile.id)
    .in('section', ['sms', 'voip_calls', 'bot_messages', 'bot_direct_messages'])
    .limit(1200);
  if (error) {
    if (isMissingTableLikeError(error)) return new Set<string>();
    throw error;
  }
  return new Set<string>((data || [])
    .map((row: any) => buildReadStateKey(normalizeReadStateSection(row?.section), row?.source_type, row?.source_id))
    .filter((key) => !key.startsWith('::')));
};

const isRpcSchemaCompatibilityError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    isMissingRpcError(error)
    || code === '42703'
    || code === 'PGRST204'
    || message.includes('schema cache')
    || (message.includes('column') && message.includes('does not exist'))
  );
};

const safeLiveFetch = async <T,>(label: string, loader: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await loader();
  } catch (error) {
    console.warn(`Messaging v2 live fetch failed: ${label}`, error);
    return fallback;
  }
};

const fetchSmsMessages = async () => {
  const rpcResult = await supabase.rpc('get_accessible_sms_delivery_reports', { p_limit: 80 });
  if (!rpcResult.error) return rpcResult.data || [];
  if (!isRpcSchemaCompatibilityError(rpcResult.error)) throw rpcResult.error;

  const { data, error } = await supabase
    .from('sms_delivery_reports')
    .select('id, title, module_id, record_id, related_module_id, related_record_id, customer_id, assignee_id, assignee_type, assignee_role_id, direction, provider, provider_message_id, sender, recipient, phone_number, phone_number_id, phone_match_status, message_text, status, error_message, metadata, sent_at, received_at, message_at, created_at, updated_at')
    .order('message_at', { ascending: false })
    .limit(80);
  if (error) {
    if (isMissingTableLikeError(error) || isMissingColumnError(error, 'direction') || isMissingColumnError(error, 'message_at')) return [];
    throw error;
  }
  return data || [];
};

const fetchVoipCalls = async (profile: LiveProfile) => {
  if (!profile.id) return [];
  const rpcResult = await supabase.rpc('get_accessible_voip_call_logs', { p_limit: 80 });
  if (!rpcResult.error) return rpcResult.data || [];
  if (!isRpcSchemaCompatibilityError(rpcResult.error)) throw rpcResult.error;

  const extension = String(profile.voipExtension || '').trim();
  if (!profile.canViewAllCalls && !extension) return [];

  let query = supabase
    .from('voip_call_logs')
    .select('id, title, direction, status, source_number, destination_number, extension, module_id, record_id, related_module_id, related_record_id, phone_number_id, phone_match_status, assignee_id, assignee_type, assignee_role_id, started_at, ended_at, created_at, talk_seconds, wait_seconds, call_id, file_id, recording_url')
    .order('started_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(80);

  if (!profile.canViewAllCalls) {
    query = query.eq('extension', extension);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableLikeError(error)) return [];
    throw error;
  }
  return data || [];
};

const fetchBotGroups = async (profile: LiveProfile) => {
  const { data, error } = await supabase
    .from('counterparty_bot_groups')
    .select('id,target_type,customer_id,supplier_id,employee_id,channel_type,status,group_title,group_join_link,bot_chat_id,updated_at,last_inbound_at,last_outbound_at,metadata')
    .eq('status', 'active')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(160);
  if (error) throw error;
  const rows = ((data || []) as BotGroupRow[]).filter((row) => canSeeRestrictedBotRow(row, profile));
  const deduped = rows.reduce<BotGroupRow[]>((acc, row) => {
    const channel = String(row?.channel_type || '').trim();
    const chatId = String(row?.bot_chat_id || '').trim();
    if (!channel || !chatId) {
      acc.push(row);
      return acc;
    }
    const existingIndex = acc.findIndex((item) => String(item?.channel_type || '').trim() === channel && String(item?.bot_chat_id || '').trim() === chatId);
    if (existingIndex < 0) {
      acc.push(row);
      return acc;
    }
    const existingTime = new Date(acc[existingIndex]?.last_inbound_at || acc[existingIndex]?.last_outbound_at || acc[existingIndex]?.updated_at || 0).getTime() || 0;
    const nextTime = new Date(row?.last_inbound_at || row?.last_outbound_at || row?.updated_at || 0).getTime() || 0;
    if (nextTime >= existingTime) acc[existingIndex] = row;
    return acc;
  }, []);
  return sortByActivityDesc(deduped);
};

const fetchBotGroupMessages = async (groups: BotGroupRow[]) => {
  const groupIds = Array.from(new Set((groups || []).map((group) => String(group?.id || '').trim()).filter(Boolean)));
  if (!groupIds.length) return [];
  const { data, error } = await supabase
    .from('counterparty_bot_messages')
    .select('id,bot_group_id,direction,message_type,chat_id,provider_message_id,content_text,file_url,file_name,mime_type,payload,created_by,created_at')
    .in('bot_group_id', groupIds)
    .order('created_at', { ascending: false })
    .limit(260);
  if (error) throw error;
  return ((data || []) as BotMessageRow[]).reverse();
};

const isBlockedBotDirectThread = (row: any) => {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return Boolean((metadata as any)?.blocked || (metadata as any)?.is_blocked || (metadata as any)?.hidden);
};

const fetchBotDirectThreads = async (profile: LiveProfile) => {
  const [{ data, error }, { data: groupData, error: groupError }] = await Promise.all([
    supabase
      .from('counterparty_bot_direct_threads')
      .select('id,binding_id,channel_type,chat_id,target_module_id,target_record_id,customer_id,supplier_id,employee_id,profile_id,display_name,username,phone_number,last_seen_at,last_inbound_at,last_outbound_at,last_message_at,last_message_preview,metadata')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .order('display_name', { ascending: true })
      .limit(220),
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
  const deduped = new Map<string, BotDirectThreadRow>();
  ((data || []) as BotDirectThreadRow[]).forEach((row) => {
    const channel = String(row?.channel_type || '').trim();
    const chatId = String(row?.chat_id || '').trim();
    if (!channel || !chatId || groupIdentityKeys.has(`${channel}:${chatId}`) || isBlockedBotDirectThread(row) || !canSeeRestrictedBotRow(row, profile)) return;
    const key = `${channel}:${chatId}`;
    const previous = deduped.get(key);
    const rowTime = new Date(row?.last_message_at || row?.last_inbound_at || row?.last_seen_at || 0).getTime() || 0;
    const previousTime = new Date(previous?.last_message_at || previous?.last_inbound_at || previous?.last_seen_at || 0).getTime() || 0;
    if (!previous || rowTime >= previousTime) deduped.set(key, row);
  });
  return sortByActivityDesc(Array.from(deduped.values()));
};

const fetchBotDirectMessages = async (threads: BotDirectThreadRow[]) => {
  const threadIds = Array.from(new Set((threads || []).map((thread) => String(thread?.id || '').trim()).filter(Boolean)));
  if (!threadIds.length) return [];
  const { data, error } = await supabase
    .from('counterparty_bot_direct_messages')
    .select('id,direct_thread_id,direction,message_type,chat_id,channel_type,content_text,file_url,file_name,mime_type,payload,created_by,created_at')
    .in('direct_thread_id', threadIds)
    .order('created_at', { ascending: false })
    .limit(260);
  if (error) throw error;
  return ((data || []) as BotMessageRow[]).reverse();
};

const buildSmsLiveModels = (smsMessages: any[], recordTitleMap: Record<string, string>, readStateKeys: Set<string>) => {
  const isNotificationRead = createNotificationReadChecker(readStateKeys);
  const smsThreads = buildSmsThreads({
    messages: smsMessages,
    recordTitleMap,
    seenSmsMessageIds: readSeenSet(SEEN_SMS_MESSAGES_STORAGE_KEY),
    isNotificationRead,
  });

  const conversations: MessagingOmniConversation[] = smsThreads.map((thread) => {
    const first = thread.messages[thread.messages.length - 1] || {};
    const matchLabel = getPhoneMatchLabel(thread.phoneMatchStatus);
    const hasBoundContact = matchLabel === 'مخاطب متصل';
    const relatedModuleId = String(thread.moduleId || '').trim();
    const relatedRecordId = String(thread.recordId || '').trim();
    return {
      key: `live:${thread.id}`,
      channel: 'sms',
      title: thread.title || thread.phone || 'شماره ناشناس',
      subtitle: thread.phone || matchLabel || 'پیامک',
      preview: thread.preview,
      time: formatTime(first?.message_at || first?.created_at),
      lastActivityAt: String(first?.message_at || first?.created_at || '').trim() || null,
      unread: thread.unreadCount,
      tone: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200',
      avatarText: String(thread.title || thread.phone || 'پ').trim().slice(0, 1) || 'پ',
      status: hasBoundContact ? 'مخاطب متصل' : matchLabel || 'پیامک',
      actions: ['search', 'reply', 'forward', 'ready_text', 'activity', 'bind', 'receipt'],
      relatedModuleId: relatedModuleId || undefined,
      relatedRecordId: relatedRecordId || undefined,
      relatedRecordTitle: relatedModuleId && relatedRecordId ? getRecordLabel(recordTitleMap, relatedModuleId, relatedRecordId, thread.title) : undefined,
      relatedScope: relatedModuleId && relatedRecordId ? 'record' : undefined,
      relatedLabelPrefix: relatedModuleId && relatedRecordId ? 'مخاطب مرتبط' : undefined,
      phone: thread.phone || '',
      phoneNumberId: thread.phoneNumberId,
      phoneMatchStatus: thread.phoneMatchStatus,
    };
  });

  const events: MessagingOmniTimelineEvent[] = smsThreads.flatMap((thread) =>
    thread.messages.map((row: any) => {
      const direction = String(row?.direction || '').trim().toLowerCase() === 'inbound' ? 'inbound' : 'outbound';
      const recordModuleId = String(row?.related_module_id || row?.module_id || '').trim();
      const recordId = String(row?.related_record_id || row?.record_id || '').trim();
      const relatedRecordLabel = getRecordLabel(recordTitleMap, recordModuleId, recordId, row?.title);
      return {
        id: `live-sms-${String(row?.id || `${thread.id}-${row?.created_at || row?.message_at || Math.random()}`)}`,
        sourceRow: row,
        conversationKey: `live:${thread.id}`,
        kind: 'sms' as const,
        direction,
        author: direction === 'inbound' ? (thread.title || row?.sender || 'مخاطب') : 'سامانه پیامک',
        text: String(row?.message_text || '').trim() || (direction === 'inbound' ? 'پیامک ورودی' : 'پیامک خروجی'),
        time: formatTime(row?.message_at || row?.created_at),
        status: direction === 'outbound' ? resolveSmsStatusLabel(row?.status) || 'ارسال شده' : undefined,
        seenAt: direction === 'outbound' && row?.status ? resolveSmsStatusLabel(row.status) : undefined,
        relatedRecordLabel: relatedRecordLabel || undefined,
      };
    }),
  );

  return { conversations, events };
};

const formatDuration = (row: any) => {
  const seconds = Number(row?.talk_seconds || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'مدت تماس ثبت نشده';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes <= 0) return `مدت تماس: ${toPersianNumber(remaining)} ثانیه`;
  return `مدت تماس: ${toPersianNumber(minutes)} دقیقه و ${toPersianNumber(remaining)} ثانیه`;
};

const buildVoipLiveModels = (voipCalls: any[], recordTitleMap: Record<string, string>, readStateKeys: Set<string>) => {
  const isNotificationRead = createNotificationReadChecker(readStateKeys);
  const voipThreads = buildVoipThreads({
    calls: voipCalls,
    recordTitleMap,
    seenVoipCallIds: readSeenSet(SEEN_VOIP_CALLS_STORAGE_KEY),
    isNotificationRead,
  });

  const conversations: MessagingOmniConversation[] = voipThreads.map((thread) => {
    const first = thread.calls[0] || {};
    const matchLabel = getPhoneMatchLabel(thread.phoneMatchStatus);
    const relatedModuleId = String(thread.moduleId || '').trim();
    const relatedRecordId = String(thread.recordId || '').trim();
    return {
      key: `live:${thread.id}`,
      channel: 'call',
      title: thread.title || thread.phone || 'تماس',
      subtitle: thread.phone || matchLabel || 'تماس‌ها',
      preview: `${thread.calls.length ? toPersianNumber(thread.calls.length) : '۰'} تماس اخیر`,
      time: formatTime(first?.started_at || first?.created_at),
      lastActivityAt: String(first?.started_at || first?.created_at || '').trim() || null,
      unread: thread.unreadCount,
      tone: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
      avatarText: String(thread.title || thread.phone || 'ت').trim().slice(0, 1) || 'ت',
      status: matchLabel || 'تماس',
      actions: ['search', 'activity', 'bind', 'call'],
      relatedModuleId: relatedModuleId || undefined,
      relatedRecordId: relatedRecordId || undefined,
      relatedRecordTitle: relatedModuleId && relatedRecordId ? getRecordLabel(recordTitleMap, relatedModuleId, relatedRecordId, thread.title) : undefined,
      relatedScope: relatedModuleId && relatedRecordId ? 'record' : undefined,
      relatedLabelPrefix: relatedModuleId && relatedRecordId ? 'مخاطب مرتبط' : undefined,
      phone: thread.phone || '',
      phoneNumberId: thread.phoneNumberId,
      phoneMatchStatus: thread.phoneMatchStatus,
    };
  });

  const events: MessagingOmniTimelineEvent[] = voipThreads.flatMap((thread) =>
    thread.calls.slice().reverse().map((row: any) => {
      const directionValue = String(row?.direction || '').trim().toLowerCase();
      const outgoing = directionValue === 'outgoing';
      const relatedRecordLabel = getRecordLabel(
        recordTitleMap,
        row?.related_module_id || row?.module_id,
        row?.related_record_id || row?.record_id,
        row?.title,
      );
      const recordingName = String(row?.recording_url || row?.file_id || row?.call_id || '').trim();
      return {
        id: `live-call-${String(row?.id || `${thread.id}-${row?.created_at || row?.started_at || Math.random()}`)}`,
        sourceRow: row,
        conversationKey: `live:${thread.id}`,
        kind: 'call' as const,
        direction: outgoing ? 'outbound' : 'inbound',
        author: outgoing ? 'اپراتور' : (thread.title || row?.source_number || 'تماس‌گیرنده'),
        text: `${outgoing ? 'تماس خروجی' : 'تماس ورودی'}${row?.status ? ` - ${resolveVoipStatusLabel(row.status)}` : ''}`,
        time: formatTime(row?.started_at || row?.created_at),
        status: formatDuration(row),
        attachments: recordingName ? [{ name: recordingName, kind: 'audio' as const, url: row?.recording_url || null }] : undefined,
        relatedRecordLabel: relatedRecordLabel || undefined,
        callDirection: outgoing ? 'outgoing' : 'incoming',
        caller: outgoing ? String(row?.extension || 'اپراتور') : String(row?.source_number || thread.phone || ''),
        responder: outgoing ? String(row?.destination_number || thread.phone || '') : String(row?.extension || 'اپراتور'),
        callType: outgoing ? 'خروجی' : 'ورودی',
      };
    }),
  );

  return { conversations, events };
};

const toAttachmentKind = (attachment: any): AttachmentKind => {
  const fileType = String(attachment?.fileType || attachment?.file_type || '').trim().toLowerCase();
  const mimeType = String(attachment?.mimeType || attachment?.mime_type || '').trim().toLowerCase();
  if (fileType === 'image' || mimeType.startsWith('image/')) return 'image';
  if (fileType === 'video' || mimeType.startsWith('video/')) return 'video';
  if (fileType === 'audio' || mimeType.startsWith('audio/')) return 'audio';
  return 'file';
};

const buildBotGroupLiveModels = (
  botGroups: BotGroupRow[],
  botMessages: BotMessageRow[],
  recordTitleMap: Record<string, string>,
  readStateKeys: Set<string>,
) => {
  const isNotificationRead = createNotificationReadChecker(readStateKeys);
  const messagesByGroup = new Map<string, BotMessageRow[]>();
  botMessages.forEach((message) => {
    const groupId = String(message?.bot_group_id || '').trim();
    if (!groupId) return;
    const list = messagesByGroup.get(groupId) || [];
    list.push(message);
    messagesByGroup.set(groupId, list);
  });

  const conversations: MessagingOmniConversation[] = botGroups.map((group) => {
    const target = resolveBotTarget(group);
    const relatedTitle = getRecordLabel(recordTitleMap, target.moduleId, target.recordId, group.group_title);
    const platform = isBotChannel(group.channel_type) ? group.channel_type : undefined;
    const channelLabel = platform ? BOT_CHANNEL_LABELS_FA[platform] : String(group.channel_type || 'بات').trim();
    const groupMessages = messagesByGroup.get(String(group.id)) || [];
    const latest = groupMessages[groupMessages.length - 1] || {};
    const unread = groupMessages.filter((row) => (
      String(row?.direction || '').trim() === 'inbound'
      && !isNotificationRead('bot_messages', 'counterparty_bot_message', String(row?.id || '').trim(), false)
    )).length;
    return {
      key: `live:bot_group:${group.id}`,
      channel: 'bot_group',
      title: relatedTitle || group.group_title || 'گروه بات',
      subtitle: `${channelLabel} - ${group.group_title || 'گروه بات'}`,
      preview: String(latest?.content_text || group.group_title || 'گفتگوی بات').trim(),
      time: formatTime(latest?.created_at || group.last_inbound_at || group.last_outbound_at || group.updated_at),
      lastActivityAt: String(latest?.created_at || group.last_inbound_at || group.last_outbound_at || group.updated_at || '').trim() || null,
      unread,
      tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
      avatarText: String(relatedTitle || group.group_title || 'ب').trim().slice(0, 1) || 'ب',
      status: 'بات فعال',
      platform,
      relatedModuleId: target.moduleId || undefined,
      relatedRecordId: target.recordId || undefined,
      relatedRecordTitle: relatedTitle || undefined,
      relatedScope: target.moduleId && target.recordId ? 'record' : undefined,
      relatedLabelPrefix: target.moduleId && target.recordId ? 'مخاطب مرتبط' : undefined,
      actions: ['search', 'attach', 'reply', 'forward', 'ready_text', 'activity', 'bind', 'record', 'receipt'],
    };
  });

  const events: MessagingOmniTimelineEvent[] = botMessages.map((row) => {
    const groupId = String(row?.bot_group_id || '').trim();
    const group = botGroups.find((item) => String(item.id) === groupId);
    const target = resolveBotTarget(group || {});
    const relatedTitle = getRecordLabel(recordTitleMap, target.moduleId, target.recordId, group?.group_title);
    const direction = String(row?.direction || '').trim() === 'outbound' ? 'outbound' : 'inbound';
    const attachments = extractBotMessageAttachments(row).map((attachment) => ({
      name: attachment.name || 'فایل',
      kind: toAttachmentKind(attachment),
      url: attachment.url || null,
      mimeType: attachment.mimeType || null,
    }));
    return {
      id: `live-bot-group-${String(row?.id || `${groupId}-${row?.created_at || Math.random()}`)}`,
      sourceRow: row,
      conversationKey: `live:bot_group:${groupId}`,
      kind: 'message' as const,
      direction,
      author: direction === 'outbound' ? 'کاربر سازمان' : (relatedTitle || group?.group_title || 'مخاطب بات'),
      text: String(row?.content_text || '').trim() || (attachments.length ? '' : 'پیام بات'),
      time: formatTime(row?.created_at),
      status: direction === 'outbound' ? 'ارسال شده' : undefined,
      replyTo: String(row?.payload?.reply_to_message_id || row?.payload?.reply_to_id || '').trim() || null,
      attachments: attachments.length ? attachments : undefined,
      relatedRecordLabel: relatedTitle || undefined,
    };
  });

  return { conversations, events };
};

const buildBotDirectLiveModels = (
  botDirectThreads: BotDirectThreadRow[],
  botDirectMessages: BotMessageRow[],
  recordTitleMap: Record<string, string>,
  readStateKeys: Set<string>,
) => {
  const isNotificationRead = createNotificationReadChecker(readStateKeys);
  const messagesByThread = new Map<string, BotMessageRow[]>();
  botDirectMessages.forEach((message) => {
    const threadId = String(message?.direct_thread_id || '').trim();
    if (!threadId) return;
    const list = messagesByThread.get(threadId) || [];
    list.push(message);
    messagesByThread.set(threadId, list);
  });

  const conversations: MessagingOmniConversation[] = botDirectThreads.map((thread) => {
    const target = resolveBotTarget(thread);
    const relatedTitle = getRecordLabel(recordTitleMap, target.moduleId, target.recordId, thread.display_name);
    const platform = isBotChannel(thread.channel_type) ? thread.channel_type : undefined;
    const channelLabel = platform ? BOT_CHANNEL_LABELS_FA[platform] : String(thread.channel_type || 'بات').trim();
    const messages = messagesByThread.get(String(thread.id)) || [];
    const latest = messages[messages.length - 1] || {};
    const unread = messages.filter((row) => (
      String(row?.direction || '').trim() === 'inbound'
      && !isNotificationRead('bot_direct_messages', 'counterparty_bot_direct_message', String(row?.id || '').trim(), false)
    )).length;
    return {
      key: `live:bot_direct:${thread.id}`,
      channel: 'bot_direct',
      title: relatedTitle || thread.display_name || thread.username || 'پیام شخصی بات',
      subtitle: `${channelLabel} - ${target.moduleId && target.recordId ? 'اتصال‌شده' : 'اتصال‌نشده'}`,
      preview: String(latest?.content_text || thread.last_message_preview || 'گفتگوی شخصی بات').trim(),
      time: formatTime(latest?.created_at || thread.last_message_at || thread.last_seen_at),
      lastActivityAt: String(latest?.created_at || thread.last_message_at || thread.last_seen_at || '').trim() || null,
      unread,
      tone: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200',
      avatarText: String(relatedTitle || thread.display_name || 'ش').trim().slice(0, 1) || 'ش',
      status: target.moduleId && target.recordId ? 'مخاطب متصل' : 'اتصال‌نشده',
      platform,
      relatedModuleId: target.moduleId || undefined,
      relatedRecordId: target.recordId || undefined,
      relatedRecordTitle: relatedTitle || undefined,
      relatedScope: target.moduleId && target.recordId ? 'record' : undefined,
      relatedLabelPrefix: target.moduleId && target.recordId ? 'مخاطب مرتبط' : undefined,
      actions: ['search', 'attach', 'reply', 'forward', 'ready_text', 'activity', 'bind', 'record', 'receipt'],
    };
  });

  const events: MessagingOmniTimelineEvent[] = botDirectMessages.map((row) => {
    const threadId = String(row?.direct_thread_id || '').trim();
    const thread = botDirectThreads.find((item) => String(item.id) === threadId);
    const target = resolveBotTarget(thread || {});
    const relatedTitle = getRecordLabel(recordTitleMap, target.moduleId, target.recordId, thread?.display_name);
    const direction = String(row?.direction || '').trim() === 'outbound' ? 'outbound' : 'inbound';
    const attachments = extractBotMessageAttachments(row).map((attachment) => ({
      name: attachment.name || 'فایل',
      kind: toAttachmentKind(attachment),
      url: attachment.url || null,
      mimeType: attachment.mimeType || null,
    }));
    return {
      id: `live-bot-direct-${String(row?.id || `${threadId}-${row?.created_at || Math.random()}`)}`,
      sourceRow: row,
      conversationKey: `live:bot_direct:${threadId}`,
      kind: 'message' as const,
      direction,
      author: direction === 'outbound' ? 'کاربر سازمان' : (relatedTitle || thread?.display_name || 'مخاطب بات'),
      text: String(row?.content_text || '').trim() || (attachments.length ? '' : 'پیام بات'),
      time: formatTime(row?.created_at),
      status: direction === 'outbound' ? 'ارسال شده' : undefined,
      replyTo: String(row?.payload?.reply_to_message_id || row?.payload?.reply_to_id || '').trim() || null,
      attachments: attachments.length ? attachments : undefined,
      relatedRecordLabel: relatedTitle || undefined,
    };
  });

  return { conversations, events };
};

export const useMessagingOmniLiveData = () => {
  const [profile, setProfile] = useState<LiveProfile>({
    id: null,
    orgId: null,
    roleId: null,
    voipExtension: null,
    canViewAllCalls: false,
  });
  const [smsMessages, setSmsMessages] = useState<any[]>([]);
  const [voipCalls, setVoipCalls] = useState<any[]>([]);
  const [botGroups, setBotGroups] = useState<BotGroupRow[]>([]);
  const [botGroupMessages, setBotGroupMessages] = useState<BotMessageRow[]>([]);
  const [botDirectThreads, setBotDirectThreads] = useState<BotDirectThreadRow[]>([]);
  const [botDirectMessages, setBotDirectMessages] = useState<BotMessageRow[]>([]);
  const [recordTitleMap, setRecordTitleMap] = useState<Record<string, string>>({});
  const [readStateKeys, setReadStateKeys] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    void fetchSessionBootstrap(supabase).then((snapshot) => {
      if (disposed) return;
      const voipAccess = resolveVoipAccessPermissions(snapshot.permissions || null);
      setProfile({
        id: snapshot.profile?.id ? String(snapshot.profile.id) : null,
        orgId: snapshot.orgId ? String(snapshot.orgId) : null,
        roleId: snapshot.roleId ? String(snapshot.roleId) : null,
        voipExtension: snapshot.profile?.voip_extension ? String(snapshot.profile.voip_extension) : null,
        canViewAllCalls: voipAccess.canViewAllCallNotifications,
      });
    }).catch(() => {
      if (!disposed) setLoading(false);
    });
    return () => {
      disposed = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!profile.id || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setLoading(true);
    try {
      const [smsRows, callRows, botGroupRows, botDirectThreadRows, nextReadStateKeys] = await Promise.all([
        safeLiveFetch('sms', fetchSmsMessages, [] as any[]),
        safeLiveFetch('voip', () => fetchVoipCalls(profile), [] as any[]),
        safeLiveFetch('bot-groups', () => fetchBotGroups(profile), [] as BotGroupRow[]),
        safeLiveFetch('bot-direct-threads', () => fetchBotDirectThreads(profile), [] as BotDirectThreadRow[]),
        safeLiveFetch('read-states', () => fetchNotificationReadStateKeys(profile), new Set<string>()),
      ]);
      const [botMessageRows, botDirectMessageRows] = await Promise.all([
        safeLiveFetch('bot-group-messages', () => fetchBotGroupMessages(botGroupRows), [] as BotMessageRow[]),
        safeLiveFetch('bot-direct-messages', () => fetchBotDirectMessages(botDirectThreadRows), [] as BotMessageRow[]),
      ]);
      setSmsMessages(smsRows || []);
      setVoipCalls(callRows || []);
      setBotGroups(botGroupRows || []);
      setBotGroupMessages(botMessageRows || []);
      setBotDirectThreads(botDirectThreadRows || []);
      setBotDirectMessages(botDirectMessageRows || []);
      setReadStateKeys(nextReadStateKeys || new Set());
      const labels = await safeLiveFetch('record-labels', () => fetchRecordReferenceLabels(supabase, [
          ...collectRecordReferences(smsRows || []),
          ...collectRecordReferences(callRows || []),
          ...collectBotRecordReferences(botGroupRows || []),
          ...collectBotRecordReferences(botDirectThreadRows || []),
        ]), {} as Record<string, string>);
      setRecordTitleMap((prev) => ({ ...prev, ...labels }));
    } finally {
      refreshInFlightRef.current = false;
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!profile.id) return;
    void refresh();
  }, [profile.id, refresh]);

  useEffect(() => {
    if (!profile.id || !profile.orgId) return;
    const filter = `org_id=eq.${profile.orgId}`;
    let channel: RealtimeChannel | null = supabase
      .channel(`messaging-v2-live-${profile.orgId}-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_delivery_reports', filter }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outbound_messages', filter }, (payload: any) => {
        const row = payload?.new || payload?.old || {};
        if (String(row?.channel_type || '').trim() === 'sms') void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voip_call_logs', filter }, (payload: any) => {
        const row = payload?.new || payload?.old || {};
        if (profile.canViewAllCalls || !profile.voipExtension || String(row?.extension || '').trim() === profile.voipExtension) {
          void refresh();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'counterparty_bot_groups', filter }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'counterparty_bot_messages', filter }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'counterparty_bot_direct_threads', filter }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'counterparty_bot_direct_messages', filter }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_read_states', filter }, (payload: any) => {
        const row = payload?.new || payload?.old || {};
        if (String(row?.user_id || '').trim() === profile.id) void refresh();
      })
      .subscribe();

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [profile.canViewAllCalls, profile.id, profile.orgId, profile.voipExtension, refresh]);

  return useMemo(() => {
    const smsModels = buildSmsLiveModels(smsMessages, recordTitleMap, readStateKeys);
    const voipModels = buildVoipLiveModels(voipCalls, recordTitleMap, readStateKeys);
    const botGroupModels = buildBotGroupLiveModels(botGroups, botGroupMessages, recordTitleMap, readStateKeys);
    const botDirectModels = buildBotDirectLiveModels(botDirectThreads, botDirectMessages, recordTitleMap, readStateKeys);
    return {
      loading,
      hasLiveSms: smsModels.conversations.length > 0,
      hasLiveCalls: voipModels.conversations.length > 0,
      hasLiveBotGroups: botGroupModels.conversations.length > 0,
      hasLiveBotDirect: botDirectModels.conversations.length > 0,
      conversations: [...botGroupModels.conversations, ...botDirectModels.conversations, ...smsModels.conversations, ...voipModels.conversations],
      events: [...botGroupModels.events, ...botDirectModels.events, ...smsModels.events, ...voipModels.events],
      botGroups,
      botDirectThreads,
      refresh,
      profile,
      liveSummary: [
        botGroupModels.conversations.length ? `${toPersianNumber(botGroupModels.conversations.length)} گروه بات` : '',
        botDirectModels.conversations.length ? `${toPersianNumber(botDirectModels.conversations.length)} گفتگوی شخصی بات` : '',
        smsModels.conversations.length ? `${toPersianNumber(smsModels.conversations.length)} گفتگوی پیامکی` : '',
        voipModels.conversations.length ? `${toPersianNumber(voipModels.conversations.length)} گفتگوی تماس` : '',
      ].filter(Boolean).join('، '),
      getModuleLabel,
    };
  }, [botDirectMessages, botDirectThreads, botGroupMessages, botGroups, loading, profile, readStateKeys, recordTitleMap, refresh, smsMessages, voipCalls]);
};
