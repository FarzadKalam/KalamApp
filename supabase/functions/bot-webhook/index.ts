// @ts-nocheck

type BotChannel = 'telegram' | 'bale' | 'rubika';

type IntegrationSettings = {
  bot_token?: string;
  api_base_url?: string;
  send_message_path?: string;
  bot_name?: string;
  bot_username?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BOT_WEBHOOK_BUILD = 'bot-webhook-2026-07-10-rubika-media-import-v2';
const DEFAULT_AI_BASE_URL = 'https://api.avalai.ir/v1';
const DEFAULT_AI_FALLBACK_BASE_URL = 'https://api.avalapis.ir/v1';

const DEFAULT_API_BASE_URL: Record<BotChannel, string> = {
  telegram: 'https://botapi.kalamnews.site/83cdbfe5940e24aaf81689a85390df5c',
  bale: 'https://tapi.bale.ai',
  rubika: 'https://botapi.rubika.ir',
};

const RUBIKA_OFFICIAL_API_BASE_URL = DEFAULT_API_BASE_URL.rubika;

const DEFAULT_SEND_PATH: Record<BotChannel, string> = {
  telegram: '/bot{token}/sendMessage',
  bale: '/bot{token}/sendMessage',
  rubika: '/v3/{token}/sendMessage',
};

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify({ build: BOT_WEBHOOK_BUILD, ...payload }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Kalam-Function-Build': BOT_WEBHOOK_BUILD,
    },
  });

const getServiceHeaders = (serviceRoleKey: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
});

const readJsonBody = async (req: Request) => {
  const raw = await req.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
};

const pick = (...values: any[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const normalizeBaseUrl = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw.replace(/\/+$/, '')}`;
};

const normalizeBotSettings = (channel: BotChannel, settings: Record<string, any> | null | undefined) => ({
  ...(settings && typeof settings === 'object' ? settings : {}),
  api_base_url: DEFAULT_API_BASE_URL[channel],
});

const buildSendMessageUrl = (baseUrl: string, token: string, pathTemplate: string) => {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = String(pathTemplate || '')
    .replace('{token}', encodeURIComponent(token))
    .replace(/^\/*/, '/');
  return `${normalizedBase}${normalizedPath}`;
};

const pickPublicApiBaseUrl = (requestUrl: string, headers?: Headers, settings?: Record<string, any>) => {
  const isPublicHost = (value: string) => {
    try {
      const host = String(new URL(value).hostname || '').trim().toLowerCase();
      if (!host) return false;
      if (
        host === 'localhost'
        || host === '127.0.0.1'
        || host === '0.0.0.0'
        || host === '::1'
        || host === 'kong'
        || host.endsWith('.local')
        || host.endsWith('.internal')
      ) return false;
      if (/^10\./.test(host)) return false;
      if (/^192\.168\./.test(host)) return false;
      if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
      return true;
    } catch {
      return false;
    }
  };
  const candidates = [
    settings?.public_api_base_url,
    settings?.public_supabase_url,
    Deno.env.get('BOT_WEBHOOK_PUBLIC_BASE_URL'),
    Deno.env.get('PUBLIC_API_BASE_URL'),
    Deno.env.get('VITE_SUPABASE_URL'),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeBaseUrl(String(candidate || '').trim());
    if (normalized && isPublicHost(normalized)) {
      try {
        const parsed = new URL(normalized);
        if (parsed.protocol === 'http:') parsed.protocol = 'https:';
        return parsed.toString().replace(/\/+$/, '');
      } catch {
        return normalized;
      }
    }
  }

  const forwardedProto = pick(headers?.get('x-forwarded-proto'), headers?.get('x-forwarded-protocol'));
  const forwardedHost = pick(headers?.get('x-forwarded-host')).split(',')[0]?.trim();
  if (forwardedProto && forwardedHost) {
    const normalized = `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, '');
    if (isPublicHost(normalized)) {
      try {
        const parsed = new URL(normalized);
        if (parsed.protocol === 'http:') parsed.protocol = 'https:';
        return parsed.toString().replace(/\/+$/, '');
      } catch {
        return normalized;
      }
    }
  }

  const host = pick(headers?.get('host')).split(',')[0]?.trim();
  if (host) {
    const normalized = `https://${host}`.replace(/\/+$/, '');
    if (isPublicHost(normalized)) return normalized;
  }

  try {
    const origin = new URL(String(requestUrl || '')).origin.replace(/\/+$/, '');
    if (origin && isPublicHost(origin)) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol === 'http:') parsed.protocol = 'https:';
        return parsed.toString().replace(/\/+$/, '');
      } catch {
        return origin;
      }
    }
  } catch {
    // ignore invalid request url
  }

  return '';
};

const getDisplayName = (obj: Record<string, any> | null | undefined) => {
  if (!obj || typeof obj !== 'object') return '';
  const first = String(obj.first_name || obj.firstName || '').trim();
  const last = String(obj.last_name || obj.lastName || '').trim();
  const direct = pick(obj.name, obj.title, obj.display_name, obj.displayName, obj.full_name, obj.fullName);
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return pick(direct, combined);
};

const extractChatTitle = (payload: Record<string, any>, message: Record<string, any> | null) => {
  const rubikaUpdate = payload?.update || null;
  const rubikaRootMessage = payload?.new_message || null;
  const rubikaNewMessage = rubikaUpdate?.new_message || null;
  const rubikaInlineMessage = payload?.inline_message || null;
  return pick(
    message?.chat?.title,
    message?.chat?.name,
    message?.chat?.username,
    message?.chat?.first_name,
    message?.chat?.last_name,
    message?.chat?.chat_title,
    message?.chat?.group_title,
    message?.chat_title,
    message?.group_title,
    rubikaRootMessage?.chat?.title,
    rubikaRootMessage?.chat?.chat_title,
    rubikaRootMessage?.chat_title,
    rubikaRootMessage?.group_title,
    rubikaUpdate?.chat_title,
    rubikaUpdate?.group_title,
    rubikaNewMessage?.chat?.title,
    rubikaNewMessage?.chat_title,
    rubikaNewMessage?.group_title,
    rubikaInlineMessage?.chat?.title,
    rubikaInlineMessage?.chat_title,
    rubikaInlineMessage?.group_title,
    payload?.chat?.title,
    payload?.chat_title,
    payload?.group_title
  );
};

const getPathChannelAndSecret = (pathname: string) => {
  const parts = String(pathname || '').split('/').filter(Boolean);
  const index = parts.lastIndexOf('bot-webhook');
  if (index === -1) return { channel: '', secret: '' };
  return {
    channel: String(parts[index + 1] || '').trim().toLowerCase(),
    secret: String(parts[index + 2] || '').trim(),
  };
};

const extractContact = (payload: Record<string, any>) => {
  const rubikaUpdate = payload?.update || null;
  const rubikaRootMessage = payload?.new_message || null;
  const rubikaNewMessage = rubikaUpdate?.new_message || null;
  const rubikaInlineMessage = payload?.inline_message || null;
  const callbackQuery = payload?.callback_query || payload?.body?.callback_query || payload?.data?.callback_query || null;

  const message =
    payload?.message ||
    payload?.body?.message ||
    payload?.data?.message ||
    payload?.event?.message ||
    payload?.update?.message ||
    callbackQuery?.message ||
    rubikaNewMessage ||
    rubikaRootMessage ||
    rubikaInlineMessage ||
    null;

  const from =
    message?.from ||
    message?.sender ||
    callbackQuery?.from ||
    rubikaUpdate?.sender ||
    rubikaRootMessage?.sender ||
    rubikaInlineMessage?.sender ||
    payload?.from ||
    payload?.sender ||
    payload?.user ||
    payload?.body?.sender ||
    payload?.data?.sender ||
    null;

  const contact =
    message?.contact ||
    payload?.contact ||
    payload?.body?.contact ||
    payload?.data?.contact ||
    null;

  const chatId = pick(
    message?.chat?.id,
    message?.chat?.chat_id,
    message?.chat_id,
    message?.object_guid,
    message?.objectGuid,
    callbackQuery?.message?.chat?.id,
    callbackQuery?.message?.chat_id,
    callbackQuery?.message?.object_guid,
    rubikaUpdate?.chat_id,
    rubikaUpdate?.object_guid,
    rubikaRootMessage?.chat_id,
    rubikaRootMessage?.object_guid,
    rubikaInlineMessage?.chat_id,
    rubikaInlineMessage?.object_guid,
    rubikaNewMessage?.chat_id,
    rubikaNewMessage?.object_guid,
    payload?.chat_id,
    payload?.object_guid,
    payload?.chatId,
    payload?.conversation_id,
    payload?.conversationId,
    payload?.peer_id,
    payload?.peerId,
    payload?.body?.chat_id,
    payload?.body?.chatId,
    payload?.data?.chat_id,
    payload?.data?.chatId
  );

  const username = pick(
    from?.username,
    from?.user_name,
    from?.userName,
    rubikaUpdate?.username,
    rubikaInlineMessage?.username,
    payload?.username,
    payload?.user_name,
    payload?.userName
  );

  const phoneNumber = pick(
    contact?.phone_number,
    contact?.phoneNumber,
    from?.phone_number,
    from?.phoneNumber,
    rubikaUpdate?.phone_number,
    rubikaInlineMessage?.phone_number,
    payload?.phone_number,
    payload?.phoneNumber,
    payload?.phone
  );

  const personDisplayName = pick(
    getDisplayName(from),
    getDisplayName(contact),
    message?.sender_display_name,
    message?.sender_name,
    rubikaNewMessage?.sender_display_name,
    rubikaNewMessage?.sender_name,
    rubikaRootMessage?.sender_display_name,
    rubikaRootMessage?.sender_name,
    rubikaInlineMessage?.sender_display_name,
    rubikaInlineMessage?.sender_name
  );
  const fallbackDisplayName = pick(
    personDisplayName,
    getDisplayName(message?.chat),
    getDisplayName(payload)
  );

  const text = pick(
    message?.text,
    message?.body,
    message?.caption,
    message?.file?.caption,
    message?.media?.caption,
    message?.photo?.caption,
    message?.document?.caption,
    message?.video?.caption,
    message?.aux_data?.caption,
    message?.aux_data?.text,
    message?.aux_data?.description,
    callbackQuery?.data,
    rubikaRootMessage?.text,
    rubikaRootMessage?.caption,
    rubikaRootMessage?.file?.caption,
    rubikaRootMessage?.media?.caption,
    rubikaRootMessage?.aux_data?.caption,
    rubikaRootMessage?.aux_data?.text,
    rubikaNewMessage?.text,
    rubikaNewMessage?.caption,
    rubikaNewMessage?.file?.caption,
    rubikaNewMessage?.media?.caption,
    rubikaNewMessage?.aux_data?.caption,
    rubikaNewMessage?.aux_data?.text,
    rubikaInlineMessage?.text,
    rubikaInlineMessage?.caption,
    payload?.text,
    payload?.message_text,
    payload?.body,
    payload?.body?.text,
    payload?.body?.caption,
    payload?.data?.text,
    payload?.data?.caption,
    payload?.caption
  );

  const senderId = pick(
    from?.id,
    from?.user_id,
    from?.userId,
    from?.object_guid,
    from?.objectGuid,
    message?.sender_id,
    message?.senderId,
    message?.sender_chat_id,
    rubikaNewMessage?.sender_id,
    rubikaNewMessage?.senderId,
    rubikaRootMessage?.sender_id,
    rubikaRootMessage?.senderId,
    rubikaInlineMessage?.sender_id,
    rubikaInlineMessage?.senderId,
    payload?.sender_id,
    payload?.user_id,
    payload?.userId
  );
  const chatTitle = extractChatTitle(payload, message);
  const chatType = pick(
    message?.chat?.type,
    message?.chat_type,
    payload?.chat?.type,
    payload?.chat_type,
    payload?.type,
    payload?.event?.chat?.type
  ).toLowerCase();
  const normalizedChatType = String(chatType || '').trim().toLowerCase();
  const isGroupByType = ['group', 'supergroup', 'channel'].includes(normalizedChatType);
  const chatIdLower = String(chatId || '').trim().toLowerCase();
  const isGroupByChatIdPrefix = chatIdLower.startsWith('g0') || chatIdLower.startsWith('c0') || chatIdLower.startsWith('ch');
  const isGroupByTitle = Boolean(String(chatTitle || '').trim());
  const isGroup = isGroupByType || isGroupByChatIdPrefix || isGroupByTitle;

  return {
    chatId,
    senderId,
    username,
    phoneNumber,
    displayName: isGroup ? personDisplayName : fallbackDisplayName,
    chatTitle,
    chatType: normalizedChatType || null,
    isGroup,
    text,
  };
};

type ResolvedInboundPayloadNodes = {
  rubikaUpdate: Record<string, any> | null;
  rubikaRootMessage: Record<string, any> | null;
  rubikaNewMessage: Record<string, any> | null;
  rubikaUpdatedMessage: Record<string, any> | null;
  rubikaInlineMessage: Record<string, any> | null;
  callbackQuery: Record<string, any> | null;
  message: Record<string, any> | null;
};

type ExtractedInboundMediaItem = {
  messageType: string;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileId: string | null;
};

type ExtractedInboundMediaEnvelope = {
  messageType: string;
  items: ExtractedInboundMediaItem[];
  mediaGroupId: string | null;
  providerMessageIds: string[];
};

const resolveInboundPayloadNodes = (payload: Record<string, any>): ResolvedInboundPayloadNodes => {
  const rubikaUpdate = payload?.update || null;
  const rubikaRootMessage = payload?.new_message || null;
  const rubikaNewMessage = rubikaUpdate?.new_message || null;
  const rubikaUpdatedMessage = rubikaUpdate?.updated_message || null;
  const rubikaInlineMessage = payload?.inline_message || null;
  const callbackQuery = payload?.callback_query || payload?.body?.callback_query || payload?.data?.callback_query || null;
  const message =
    payload?.message ||
    payload?.body?.message ||
    payload?.data?.message ||
    payload?.event?.message ||
    payload?.update?.message ||
    callbackQuery?.message ||
    rubikaNewMessage ||
    rubikaUpdatedMessage ||
    rubikaRootMessage ||
    rubikaInlineMessage ||
    null;

  return {
    rubikaUpdate,
    rubikaRootMessage,
    rubikaNewMessage,
    rubikaUpdatedMessage,
    rubikaInlineMessage,
    callbackQuery,
    message,
  };
};

const dedupeTextList = (values: any[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result;
};

const extractMediaGroupId = (payload: Record<string, any>) => {
  const {
    rubikaUpdate,
    rubikaRootMessage,
    rubikaNewMessage,
    rubikaUpdatedMessage,
    rubikaInlineMessage,
    message,
  } = resolveInboundPayloadNodes(payload);

  return pick(
    message?.media_group_id,
    message?.mediaGroupId,
    message?.grouped_id,
    message?.groupedId,
    message?.album_id,
    message?.albumId,
    message?.gallery_id,
    message?.galleryId,
    message?.media_group_guid,
    message?.mediaGroupGuid,
    rubikaUpdate?.media_group_id,
    rubikaUpdate?.mediaGroupId,
    rubikaUpdate?.album_id,
    rubikaUpdate?.albumId,
    rubikaRootMessage?.media_group_id,
    rubikaRootMessage?.mediaGroupId,
    rubikaRootMessage?.album_id,
    rubikaRootMessage?.albumId,
    rubikaNewMessage?.media_group_id,
    rubikaNewMessage?.mediaGroupId,
    rubikaNewMessage?.album_id,
    rubikaNewMessage?.albumId,
    rubikaUpdatedMessage?.media_group_id,
    rubikaUpdatedMessage?.mediaGroupId,
    rubikaUpdatedMessage?.album_id,
    rubikaUpdatedMessage?.albumId,
    rubikaInlineMessage?.media_group_id,
    rubikaInlineMessage?.mediaGroupId,
    payload?.media_group_id,
    payload?.mediaGroupId,
    payload?.album_id,
    payload?.albumId,
    payload?.gallery_id,
    payload?.galleryId
  ) || null;
};

const buildMediaExtractionWrapper = (candidate: any, hint?: string | null) => {
  const normalizedHint = String(hint || '').trim().toLowerCase();
  if (normalizedHint === 'image' || normalizedHint === 'photo') {
    return { message: { photo: candidate, image: candidate, file: candidate } };
  }
  if (normalizedHint === 'video') {
    return { message: { video: candidate, file: candidate } };
  }
  if (normalizedHint === 'audio') {
    return { message: { audio: candidate, file: candidate } };
  }
  if (normalizedHint === 'voice') {
    return { message: { voice: candidate, file: candidate } };
  }
  return { message: candidate };
};

const normalizeExtractedMedia = (
  mediaInfo: ExtractedInboundMediaItem | null | undefined,
  hint?: string | null
): ExtractedInboundMediaItem | null => {
  if (!mediaInfo) return null;
  const fileUrl = String(mediaInfo.fileUrl || '').trim() || null;
  const fileId = String(mediaInfo.fileId || '').trim() || null;
  const fileName = String(mediaInfo.fileName || '').trim() || null;
  const mimeType = String(mediaInfo.mimeType || '').trim() || null;
  let messageType = String(mediaInfo.messageType || '').trim().toLowerCase() || 'text';
  const normalizedHint = String(hint || '').trim().toLowerCase();
  if (messageType === 'text' && (fileUrl || fileId || fileName)) {
    if (normalizedHint === 'image' || normalizedHint === 'photo') {
      messageType = 'image';
    } else if (normalizedHint === 'video') {
      messageType = 'video';
    } else if (normalizedHint === 'voice') {
      messageType = 'voice';
    } else if (normalizedHint === 'audio') {
      messageType = 'audio';
    } else {
      messageType = 'file';
    }
  }
  if (messageType === 'text' && !fileUrl && !fileId) return null;
  return {
    messageType,
    fileUrl,
    fileName,
    mimeType,
    fileId,
  };
};

const normalizeInboundMediaTypeToken = (value: any): 'image' | 'video' | 'audio' | 'voice' | 'file' | null => {
  const token = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!token) return null;
  if (['image', 'photo', 'picture', 'cameraimage', 'galleryimage'].includes(token)) return 'image';
  if (['video', 'movie', 'cameravideo', 'galleryvideo', 'gif'].includes(token)) return 'video';
  if (['voice', 'voicemessage', 'recordaudio', 'recordedaudio'].includes(token)) return 'voice';
  if (['audio', 'music', 'sound'].includes(token)) return 'audio';
  if (['file', 'document', 'attachment'].includes(token)) return 'file';
  return null;
};

const inferInboundMediaMessageType = ({
  rawType,
  mimeType,
  fileName,
  fallback = 'file',
}: {
  rawType?: any;
  mimeType?: any;
  fileName?: any;
  fallback?: string;
}) => {
  const normalizedType = normalizeInboundMediaTypeToken(rawType);
  if (normalizedType && normalizedType !== 'file') return normalizedType;

  const mimeLower = String(mimeType || '').trim().toLowerCase();
  const nameLower = String(fileName || '').trim().toLowerCase();
  if (mimeLower.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(nameLower)) return 'image';
  if (mimeLower.startsWith('video/') || /\.(mp4|mkv|mov|avi|webm|3gp|m4v)$/i.test(nameLower)) return 'video';
  if (mimeLower.startsWith('audio/') || /\.(mp3|wav|ogg|oga|aac|m4a|flac|opus|weba)$/i.test(nameLower)) {
    return normalizedType === 'voice' ? 'voice' : 'audio';
  }
  return normalizedType || String(fallback || 'file').trim().toLowerCase() || 'file';
};

const dedupeExtractedMediaItems = (items: Array<ExtractedInboundMediaItem | null | undefined>) => {
  const byKey = new Map<string, ExtractedInboundMediaItem>();
  items.forEach((item) => {
    const normalized = normalizeExtractedMedia(item);
    if (!normalized) return;
    const key = String(
      normalized.fileUrl
      || normalized.fileId
      || `${normalized.fileName || 'file'}|${normalized.messageType}|${normalized.mimeType || ''}`
    ).trim();
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalized);
      return;
    }
    byKey.set(key, {
      messageType: existing.messageType === 'text' ? normalized.messageType : existing.messageType,
      fileUrl: existing.fileUrl || normalized.fileUrl,
      fileName: existing.fileName || normalized.fileName,
      mimeType: existing.mimeType || normalized.mimeType,
      fileId: existing.fileId || normalized.fileId,
    });
  });
  return Array.from(byKey.values());
};

const resolveCompositeMediaMessageType = (
  items: ExtractedInboundMediaItem[],
  fallbackMessageType = 'text'
) => {
  const types = new Set(items.map((item) => String(item?.messageType || '').trim().toLowerCase()).filter(Boolean));
  if (types.size === 0) return fallbackMessageType;
  if (types.size === 1) return Array.from(types)[0];
  if (Array.from(types).every((type) => type === 'image')) return 'image';
  if (types.has('audio') && types.size === 1) return 'audio';
  if (types.has('voice') && types.size === 1) return 'voice';
  return fallbackMessageType === 'text' ? 'file' : fallbackMessageType;
};

const getInboundMediaPreviewLabel = (messageType?: string | null, fileName?: string | null) => {
  const normalizedType = String(messageType || '').trim().toLowerCase();
  if (normalizedType === 'voice') return 'پیام صوتی';
  if (normalizedType === 'audio') return 'فایل صوتی';
  if (normalizedType === 'image') return 'تصویر';
  if (normalizedType === 'video') return 'ویدیو';
  const normalizedName = String(fileName || '').trim();
  return normalizedName || 'فایل';
};

const collectMediaCollectionCandidates = (payload: Record<string, any>) => {
  const {
    rubikaUpdate,
    rubikaRootMessage,
    rubikaNewMessage,
    rubikaUpdatedMessage,
    rubikaInlineMessage,
    message,
  } = resolveInboundPayloadNodes(payload);
  const result: Array<{ node: any; hint?: string | null }> = [];
  const seen = new Set<any>();

  const pushNode = (node: any, hint?: string | null, options?: { pickLast?: boolean }) => {
    if (!node) return;
    if (Array.isArray(node)) {
      const values = options?.pickLast ? (node.length ? [node[node.length - 1]] : []) : node;
      values.forEach((entry) => pushNode(entry, hint));
      return;
    }
    if (typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    result.push({ node, hint });
  };

  const messageRoots = [
    message,
    rubikaNewMessage,
    rubikaUpdatedMessage,
    rubikaRootMessage,
    rubikaInlineMessage,
    payload,
    payload?.body,
    payload?.data,
    payload?.event,
    rubikaUpdate,
  ];

  messageRoots.forEach((root) => {
    if (!root || typeof root !== 'object') return;
    pushNode(root?.attachments, null);
    pushNode(root?.media, null);
    pushNode(root?.medias, null);
    pushNode(root?.files, null);
    pushNode(root?.images, 'image');
    pushNode(root?.gallery, null);
    pushNode(root?.album, null);
    pushNode(root?.album?.items, null);
    pushNode(root?.gallery?.items, null);
    pushNode(root?.photo, 'image', { pickLast: true });
    pushNode(root?.photos, 'image', { pickLast: true });
    pushNode(root?.video, 'video');
    pushNode(root?.videos, 'video');
    pushNode(root?.audio, 'audio');
    pushNode(root?.audios, 'audio');
    pushNode(root?.voice, 'voice');
    pushNode(root?.voices, 'voice');
    pushNode(root?.document, 'file');
    pushNode(root?.documents, 'file');
    pushNode(root?.file, 'file');
  });

  return result;
};

const extractMediaInfo = (payload: Record<string, any>) => {
  const {
    rubikaUpdate,
    rubikaRootMessage,
    rubikaNewMessage,
    rubikaUpdatedMessage,
    rubikaInlineMessage,
    message,
  } = resolveInboundPayloadNodes(payload);

  const directUrl = pick(
    message?.file_url,
    message?.fileUrl,
    message?.media_url,
    message?.mediaUrl,
    message?.photo?.url,
    message?.document?.url,
    message?.video?.url,
    message?.audio?.url,
    message?.voice?.url,
    message?.voice?.file_url,
    message?.voice?.download_url,
    message?.image?.url,
    message?.file?.url,
    message?.media?.url,
    message?.media?.file_url,
    message?.document?.file_url,
    message?.video?.file_url,
    message?.photo?.file_url,
    rubikaUpdate?.new_message?.file?.url,
    rubikaRootMessage?.file?.url,
    rubikaRootMessage?.media?.url,
    rubikaRootMessage?.media_url,
    rubikaUpdate?.new_message?.media?.url,
    rubikaUpdate?.new_message?.media_url,
    rubikaUpdate?.new_message?.voice?.url,
    rubikaUpdate?.new_message?.voice?.file_url,
    rubikaUpdate?.new_message?.voice?.download_url,
    rubikaUpdate?.updated_message?.file?.url,
    rubikaUpdate?.updated_message?.media?.url,
    rubikaUpdate?.updated_message?.media_url,
    rubikaUpdate?.updated_message?.voice?.url,
    rubikaUpdate?.updated_message?.voice?.file_url,
    rubikaUpdate?.updated_message?.voice?.download_url,
    rubikaNewMessage?.file?.url,
    rubikaNewMessage?.file_url,
    rubikaNewMessage?.media?.url,
    rubikaNewMessage?.media_url,
    rubikaNewMessage?.voice?.url,
    rubikaNewMessage?.voice?.file_url,
    rubikaNewMessage?.voice?.download_url,
    rubikaUpdatedMessage?.file?.url,
    rubikaUpdatedMessage?.file_url,
    rubikaUpdatedMessage?.media?.url,
    rubikaUpdatedMessage?.media_url,
    rubikaUpdatedMessage?.voice?.url,
    rubikaUpdatedMessage?.voice?.file_url,
    rubikaUpdatedMessage?.voice?.download_url,
    rubikaRootMessage?.voice?.url,
    rubikaRootMessage?.voice?.file_url,
    rubikaRootMessage?.voice?.download_url,
    rubikaInlineMessage?.file?.url,
    rubikaInlineMessage?.media?.url,
    rubikaInlineMessage?.voice?.url,
    rubikaInlineMessage?.voice?.file_url,
    rubikaInlineMessage?.voice?.download_url,
    payload?.file_url,
    payload?.fileUrl,
    payload?.media_url,
    payload?.mediaUrl,
    payload?.document?.url,
    payload?.video?.url,
    payload?.photo?.url,
    payload?.audio?.url,
    payload?.voice?.url,
    payload?.voice?.file_url,
    payload?.voice?.download_url,
    message?.file?.download_url,
    message?.file?.downloadUrl,
    message?.media?.download_url,
    rubikaNewMessage?.file?.download_url,
    rubikaNewMessage?.media?.download_url,
    rubikaUpdatedMessage?.file?.download_url,
    rubikaUpdatedMessage?.media?.download_url,
    rubikaRootMessage?.file?.download_url,
    rubikaRootMessage?.media?.download_url,
    payload?.file?.download_url,
    payload?.media?.download_url
  );
  const findDeepUrl = (node: any): string | null => {
    const seen = new Set<any>();
    const stack = [node];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== 'object' || seen.has(current)) continue;
      seen.add(current);
      if (Array.isArray(current)) {
        current.forEach((item) => stack.push(item));
        continue;
      }
      for (const [key, value] of Object.entries(current)) {
        const lowerKey = String(key || '').toLowerCase();
        if (typeof value === 'string') {
          const trimmed = String(value || '').trim();
          if (
            /^https?:\/\//i.test(trimmed)
            && (lowerKey.includes('url') || lowerKey.includes('download') || lowerKey.includes('link'))
          ) {
            return trimmed;
          }
        } else if (value && typeof value === 'object') {
          stack.push(value);
        }
      }
    }
    return null;
  };
  const fileId = pick(
    message?.file_id,
    message?.file?.file_id,
    message?.file?.fileId,
    message?.file?.id,
    message?.fileId,
    message?.media?.file_id,
    message?.media?.fileId,
    message?.photo?.file_id,
    message?.document?.file_id,
    message?.video?.file_id,
    message?.audio?.file_id,
    message?.voice?.file_id,
    message?.voice?.fileId,
    message?.voice?.id,
    rubikaNewMessage?.file_id,
    rubikaNewMessage?.file?.file_id,
    rubikaNewMessage?.file?.fileId,
    rubikaNewMessage?.voice?.file_id,
    rubikaNewMessage?.voice?.fileId,
    rubikaNewMessage?.voice?.id,
    rubikaUpdatedMessage?.file_id,
    rubikaUpdatedMessage?.file?.file_id,
    rubikaUpdatedMessage?.file?.fileId,
    rubikaUpdatedMessage?.voice?.file_id,
    rubikaUpdatedMessage?.voice?.fileId,
    rubikaUpdatedMessage?.voice?.id,
    rubikaRootMessage?.file_id,
    rubikaRootMessage?.file?.file_id,
    rubikaRootMessage?.file?.fileId,
    rubikaRootMessage?.voice?.file_id,
    rubikaRootMessage?.voice?.fileId,
    rubikaRootMessage?.voice?.id,
    rubikaInlineMessage?.voice?.file_id,
    rubikaInlineMessage?.voice?.fileId,
    rubikaInlineMessage?.voice?.id,
    payload?.voice?.file_id,
    payload?.voice?.fileId,
    payload?.voice?.id,
    payload?.file_id,
    payload?.fileId
  );
  const findDeepFileId = (node: any): string => {
    const seen = new Set<any>();
    const stack = [node];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== 'object' || seen.has(current)) continue;
      seen.add(current);
      if (Array.isArray(current)) {
        current.forEach((item) => stack.push(item));
        continue;
      }
      for (const [key, value] of Object.entries(current)) {
        const normalizedKey = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if ((normalizedKey === 'fileid' || normalizedKey === 'file_id') && typeof value === 'string') {
          const text = String(value || '').trim();
          if (text) return text;
        }
        if (value && typeof value === 'object') {
          stack.push(value);
        }
      }
    }
    return '';
  };
  const fileName = pick(
    message?.file_name,
    message?.file?.file_name,
    message?.file?.fileName,
    message?.fileName,
    message?.document?.file_name,
    message?.document?.fileName,
    message?.video?.file_name,
    message?.voice?.file_name,
    message?.voice?.fileName,
    message?.voice?.name,
    message?.aux_data?.file_name,
    message?.aux_data?.fileName,
    message?.aux_data?.name,
    rubikaNewMessage?.file?.file_name,
    rubikaNewMessage?.file_name,
    rubikaNewMessage?.voice?.file_name,
    rubikaNewMessage?.voice?.fileName,
    rubikaNewMessage?.voice?.name,
    rubikaNewMessage?.aux_data?.file_name,
    rubikaNewMessage?.aux_data?.fileName,
    rubikaRootMessage?.file?.file_name,
    rubikaRootMessage?.file_name,
    rubikaRootMessage?.voice?.file_name,
    rubikaRootMessage?.voice?.fileName,
    rubikaRootMessage?.voice?.name,
    rubikaRootMessage?.aux_data?.file_name,
    rubikaRootMessage?.aux_data?.fileName,
    payload?.document?.file_name,
    payload?.video?.file_name,
    payload?.voice?.file_name,
    payload?.voice?.fileName,
    payload?.voice?.name,
    payload?.photo?.file_name,
    payload?.file_name,
    payload?.fileName,
    message?.file?.name,
    message?.file?.filename,
    message?.media?.name,
    rubikaNewMessage?.file?.name,
    payload?.file?.name
  );
  const rawFileType = pick(
    message?.type,
    message?.media_type,
    message?.mediaType,
    message?.file_type,
    message?.file?.type,
    message?.file?.file_type,
    message?.file?.fileType,
    message?.file?.media_type,
    message?.file?.mediaType,
    message?.media?.type,
    message?.media?.file_type,
    message?.media?.fileType,
    message?.media?.media_type,
    message?.media?.mediaType,
    message?.aux_data?.type,
    message?.aux_data?.file_type,
    message?.aux_data?.fileType,
    message?.aux_data?.media_type,
    message?.aux_data?.mediaType,
    message?.aux_data?.button_type,
    message?.aux_data?.buttonType,
    message?.aux_data?.input_type,
    message?.aux_data?.inputType,
    rubikaNewMessage?.type,
    rubikaNewMessage?.media_type,
    rubikaNewMessage?.mediaType,
    message?.aux_data?.mime_type,
    rubikaNewMessage?.file_type,
    rubikaNewMessage?.file?.type,
    rubikaNewMessage?.voice?.type,
    rubikaNewMessage?.voice?.file_type,
    rubikaNewMessage?.voice?.fileType,
    rubikaNewMessage?.voice?.media_type,
    rubikaNewMessage?.voice?.mediaType,
    rubikaNewMessage?.file?.file_type,
    rubikaNewMessage?.file?.fileType,
    rubikaNewMessage?.file?.media_type,
    rubikaNewMessage?.file?.mediaType,
    rubikaNewMessage?.aux_data?.type,
    rubikaNewMessage?.aux_data?.file_type,
    rubikaNewMessage?.aux_data?.fileType,
    rubikaNewMessage?.aux_data?.media_type,
    rubikaNewMessage?.aux_data?.mediaType,
    rubikaNewMessage?.aux_data?.button_type,
    rubikaNewMessage?.aux_data?.buttonType,
    rubikaNewMessage?.aux_data?.input_type,
    rubikaNewMessage?.aux_data?.inputType,
    rubikaUpdatedMessage?.type,
    rubikaUpdatedMessage?.media_type,
    rubikaUpdatedMessage?.mediaType,
    rubikaUpdatedMessage?.file_type,
    rubikaUpdatedMessage?.file?.type,
    rubikaUpdatedMessage?.voice?.type,
    rubikaUpdatedMessage?.voice?.file_type,
    rubikaUpdatedMessage?.voice?.fileType,
    rubikaUpdatedMessage?.voice?.media_type,
    rubikaUpdatedMessage?.voice?.mediaType,
    rubikaUpdatedMessage?.file?.file_type,
    rubikaUpdatedMessage?.file?.fileType,
    rubikaUpdatedMessage?.file?.media_type,
    rubikaUpdatedMessage?.file?.mediaType,
    rubikaUpdatedMessage?.aux_data?.type,
    rubikaUpdatedMessage?.aux_data?.file_type,
    rubikaUpdatedMessage?.aux_data?.fileType,
    rubikaUpdatedMessage?.aux_data?.media_type,
    rubikaUpdatedMessage?.aux_data?.mediaType,
    rubikaUpdatedMessage?.aux_data?.button_type,
    rubikaUpdatedMessage?.aux_data?.buttonType,
    rubikaUpdatedMessage?.aux_data?.input_type,
    rubikaUpdatedMessage?.aux_data?.inputType,
    rubikaRootMessage?.type,
    rubikaRootMessage?.media_type,
    rubikaRootMessage?.mediaType,
    rubikaRootMessage?.file_type,
    rubikaRootMessage?.file?.type,
    rubikaRootMessage?.voice?.type,
    rubikaRootMessage?.voice?.file_type,
    rubikaRootMessage?.voice?.fileType,
    rubikaRootMessage?.voice?.media_type,
    rubikaRootMessage?.voice?.mediaType,
    rubikaRootMessage?.file?.file_type,
    rubikaRootMessage?.file?.fileType,
    rubikaRootMessage?.file?.media_type,
    rubikaRootMessage?.file?.mediaType,
    rubikaRootMessage?.aux_data?.type,
    rubikaRootMessage?.aux_data?.file_type,
    rubikaRootMessage?.aux_data?.fileType,
    rubikaRootMessage?.aux_data?.media_type,
    rubikaRootMessage?.aux_data?.mediaType,
    rubikaRootMessage?.aux_data?.button_type,
    rubikaRootMessage?.aux_data?.buttonType,
    rubikaRootMessage?.aux_data?.input_type,
    rubikaRootMessage?.aux_data?.inputType,
    rubikaInlineMessage?.type,
    rubikaInlineMessage?.media_type,
    rubikaInlineMessage?.mediaType,
    rubikaInlineMessage?.file_type,
    rubikaInlineMessage?.file?.type,
    rubikaInlineMessage?.voice?.type,
    rubikaInlineMessage?.voice?.file_type,
    rubikaInlineMessage?.voice?.fileType,
    rubikaInlineMessage?.voice?.media_type,
    rubikaInlineMessage?.voice?.mediaType,
    rubikaInlineMessage?.file?.file_type,
    rubikaInlineMessage?.file?.fileType,
    rubikaInlineMessage?.file?.media_type,
    rubikaInlineMessage?.file?.mediaType,
    rubikaInlineMessage?.aux_data?.type,
    rubikaInlineMessage?.aux_data?.file_type,
    rubikaInlineMessage?.aux_data?.fileType,
    rubikaInlineMessage?.aux_data?.media_type,
    rubikaInlineMessage?.aux_data?.mediaType,
    rubikaInlineMessage?.aux_data?.button_type,
    rubikaInlineMessage?.aux_data?.buttonType,
    rubikaInlineMessage?.aux_data?.input_type,
    rubikaInlineMessage?.aux_data?.inputType,
    payload?.type,
    payload?.media_type,
    payload?.mediaType,
    payload?.file_type,
    payload?.file?.type,
    payload?.voice?.type,
    payload?.voice?.file_type,
    payload?.voice?.fileType,
    payload?.voice?.media_type,
    payload?.voice?.mediaType,
    payload?.file?.file_type,
    payload?.file?.fileType,
    payload?.file?.media_type,
    payload?.file?.mediaType,
  );
  const mimeType = pick(
    message?.mime_type,
    message?.file?.mime_type,
    message?.file?.mimeType,
    message?.mimeType,
    message?.document?.mime_type,
    message?.document?.mimeType,
    message?.video?.mime_type,
    message?.voice?.mime_type,
    message?.voice?.mimeType,
    message?.file?.mime_type,
    message?.media?.mime_type,
    message?.aux_data?.mime_type,
    message?.aux_data?.mimeType,
    rubikaNewMessage?.file?.mime_type,
    rubikaNewMessage?.voice?.mime_type,
    rubikaNewMessage?.voice?.mimeType,
    rubikaNewMessage?.aux_data?.mime_type,
    rubikaRootMessage?.file?.mime_type,
    rubikaRootMessage?.voice?.mime_type,
    rubikaRootMessage?.voice?.mimeType,
    rubikaRootMessage?.aux_data?.mime_type,
    rubikaUpdatedMessage?.voice?.mime_type,
    rubikaUpdatedMessage?.voice?.mimeType,
    rubikaInlineMessage?.voice?.mime_type,
    rubikaInlineMessage?.voice?.mimeType,
    payload?.voice?.mime_type,
    payload?.voice?.mimeType,
    payload?.mime_type,
    payload?.mimeType
  );
  const payloadText = JSON.stringify({
    message: message || null,
    payload: payload || null,
  }).toLowerCase();
  const hasPhoto = Boolean(message?.photo || payload?.photo);
  const hasDocument = Boolean(
    message?.file
    || message?.document
    || payload?.file
    || payload?.document
    || rubikaRootMessage?.file
    || rubikaNewMessage?.file
    || fileName
    || directUrl
    || fileId
  );
  const hasVideo = Boolean(message?.video || payload?.video);
  const hasAudio = Boolean(message?.audio || payload?.audio);
  const hasVoice = Boolean(
    message?.voice
    || payload?.voice
    || rubikaRootMessage?.voice
    || rubikaNewMessage?.voice
    || rubikaUpdatedMessage?.voice
    || rubikaInlineMessage?.voice
  );
  const mimeLower = String(mimeType || '').toLowerCase();
  const nameLower = String(fileName || '').toLowerCase();
  const inferredMessageType = inferInboundMediaMessageType({
    rawType: rawFileType,
    mimeType,
    fileName,
    fallback: 'text',
  });
  const looksLikeImage = inferredMessageType === 'image'
    || mimeLower.startsWith('image/')
    || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(nameLower)
    || payloadText.includes('"photo"');
  const looksLikeVideo = inferredMessageType === 'video'
    || mimeLower.startsWith('video/')
    || /\.(mp4|mkv|mov|avi|webm|3gp)$/i.test(nameLower)
    || payloadText.includes('"video"');
  const looksLikeVoice = inferredMessageType === 'voice'
    || payloadText.includes('"voice"');
  const looksLikeAudio = inferredMessageType === 'audio'
    || mimeLower.startsWith('audio/')
    || /\.(mp3|wav|ogg|oga|aac|m4a|flac|opus|weba|webm)$/i.test(nameLower)
    || payloadText.includes('"audio"');
  const messageType =
    (hasPhoto || looksLikeImage) ? 'image'
      : (hasVoice || looksLikeVoice) ? 'voice'
        : (hasAudio || looksLikeAudio) ? 'audio'
      : (hasVideo || looksLikeVideo) ? 'video'
        : (hasDocument || hasAudio) ? inferInboundMediaMessageType({
            rawType: rawFileType,
            mimeType,
            fileName,
            fallback: 'file',
          })
          : 'text';
  return {
    messageType,
    fileUrl: directUrl || findDeepUrl(message) || findDeepUrl(payload) || null,
    fileName: fileName || null,
    mimeType: mimeType || null,
    fileId: fileId || findDeepFileId(message) || findDeepFileId(payload) || null,
  };
};

const extractMediaEnvelope = (payload: Record<string, any>): ExtractedInboundMediaEnvelope => {
  const primaryMedia = normalizeExtractedMedia(extractMediaInfo(payload));
  const collectionItems = collectMediaCollectionCandidates(payload)
    .map(({ node, hint }) => normalizeExtractedMedia(extractMediaInfo(buildMediaExtractionWrapper(node, hint)), hint));
  const baseItems = collectionItems.length > 0 && primaryMedia && !primaryMedia.fileUrl
    ? collectionItems
    : [primaryMedia, ...collectionItems];
  const items = dedupeExtractedMediaItems(baseItems);
  const messageIdentity = extractMessageIdentity(payload);

  return {
    messageType: resolveCompositeMediaMessageType(items, primaryMedia?.messageType || 'text'),
    items,
    mediaGroupId: extractMediaGroupId(payload),
    providerMessageIds: dedupeTextList([messageIdentity.providerMessageId]),
  };
};

const extractMessageIdentity = (payload: Record<string, any>) => {
  const {
    rubikaUpdate,
    rubikaRootMessage,
    rubikaNewMessage,
    rubikaUpdatedMessage,
    rubikaInlineMessage,
    message,
  } = resolveInboundPayloadNodes(payload);
  const replyMessage =
    message?.reply_to_message ||
    message?.replyToMessage ||
    message?.replied_message ||
    message?.repliedMessage ||
    message?.reply_to ||
    message?.replyTo ||
    rubikaNewMessage?.reply_to_message ||
    rubikaNewMessage?.replied_message ||
    rubikaRootMessage?.reply_to_message ||
    rubikaRootMessage?.replied_message ||
    payload?.reply_to_message ||
    payload?.replied_message ||
    null;
  const deletedMessage =
    payload?.deleted_message ||
    payload?.deletedMessage ||
    payload?.message_deleted ||
    payload?.messageDeleted ||
    payload?.removed_message ||
    payload?.removedMessage ||
    payload?.update?.deleted_message ||
    payload?.update?.deletedMessage ||
    payload?.update?.message_deleted ||
    payload?.update?.messageDeleted ||
    payload?.body?.deleted_message ||
    payload?.data?.deleted_message ||
    null;

  const providerMessageId = pick(
    message?.message_id,
    message?.messageId,
    message?.id,
    rubikaUpdate?.message_id,
    rubikaUpdate?.messageId,
    rubikaRootMessage?.message_id,
    rubikaRootMessage?.messageId,
    rubikaRootMessage?.id,
    rubikaNewMessage?.message_id,
    rubikaNewMessage?.messageId,
    rubikaNewMessage?.id,
    rubikaUpdatedMessage?.message_id,
    rubikaUpdatedMessage?.messageId,
    rubikaInlineMessage?.message_id,
    rubikaInlineMessage?.messageId,
    deletedMessage?.message_id,
    deletedMessage?.messageId,
    deletedMessage?.id,
    payload?.message_id,
    payload?.messageId
  );

  const replyProviderMessageId = pick(
    message?.reply_to_message_id,
    message?.replyToMessageId,
    message?.replied_message_id,
    message?.repliedMessageId,
    message?.reply_to_id,
    message?.replyToId,
    replyMessage?.message_id,
    replyMessage?.messageId,
    replyMessage?.id,
    rubikaUpdate?.reply_to_message_id,
    rubikaUpdate?.replyToMessageId,
    rubikaRootMessage?.reply_to_message_id,
    rubikaRootMessage?.replyToMessageId,
    rubikaNewMessage?.reply_to_message_id,
    rubikaNewMessage?.replyToMessageId,
    payload?.reply_to_message_id,
    payload?.replyToMessageId,
    payload?.replied_message_id,
    payload?.repliedMessageId
  );

  return {
    providerMessageId: providerMessageId || null,
    replyProviderMessageId: replyProviderMessageId || null,
  };
};

const extractMessageLifecycle = (payload: Record<string, any>) => {
  const { rubikaUpdate, rubikaUpdatedMessage } = resolveInboundPayloadNodes(payload);
  const deletedMessage =
    payload?.deleted_message ||
    payload?.deletedMessage ||
    payload?.message_deleted ||
    payload?.messageDeleted ||
    payload?.removed_message ||
    payload?.removedMessage ||
    payload?.update?.deleted_message ||
    payload?.update?.deletedMessage ||
    payload?.update?.message_deleted ||
    payload?.update?.messageDeleted ||
    payload?.body?.deleted_message ||
    payload?.data?.deleted_message ||
    null;
  const editedMessage =
    payload?.edited_message ||
    payload?.editedMessage ||
    payload?.message_edited ||
    payload?.messageEdited ||
    payload?.updated_message ||
    payload?.updatedMessage ||
    rubikaUpdatedMessage ||
    null;
  const eventText = String(
    payload?.event_type ||
    payload?.eventType ||
    payload?.type ||
    payload?.update_type ||
    payload?.updateType ||
    rubikaUpdate?.type ||
    ''
  ).trim().toLowerCase();
  const deleted = Boolean(deletedMessage) || (eventText.includes('delete') || eventText.includes('remove')) && eventText.includes('message');
  const edited = !deleted && (Boolean(editedMessage) || (eventText.includes('edit') || eventText.includes('update')) && eventText.includes('message'));
  return {
    deleted,
    edited,
    eventText,
  };
};

const DEFAULT_FILE_STORAGE_BUCKET = String(
  Deno.env.get('FILE_STORAGE_BUCKET')
  || Deno.env.get('VITE_FILE_STORAGE_BUCKET')
  || 'images'
).trim() || 'images';

const safeFileName = (value: string, fallback = 'file') => {
  const raw = String(value || '').trim();
  const extension = raw.includes('.') ? String(raw.split('.').pop() || '').trim() : '';
  const base = extension ? raw.slice(0, -1 * (extension.length + 1)) : raw;
  const safeBase = (base || fallback)
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const normalized = safeBase || fallback;
  return safeExtension ? `${normalized}.${safeExtension}` : normalized;
};

const extensionFromMime = (value: string) => {
  const mime = String(value || '').trim().toLowerCase();
  if (!mime) return '';
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('bmp')) return 'bmp';
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('mpeg')) return 'mpeg';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('zip')) return 'zip';
  if (mime.includes('rar')) return 'rar';
  if (mime.includes('7z')) return '7z';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('json')) return 'json';
  return '';
};

const findDeepDownloadUrl = (node: any): string | null => {
  const seen = new Set<any>();
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item));
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      const lowerKey = String(key || '').toLowerCase();
      if (typeof value === 'string') {
        const trimmed = String(value || '').trim();
        if (
          /^https?:\/\//i.test(trimmed)
          && (lowerKey.includes('url') || lowerKey.includes('download') || lowerKey.includes('link'))
        ) {
          return trimmed;
        }
      } else if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return null;
};

const findDeepDownloadUrls = (node: any): string[] => {
  const seen = new Set<any>();
  const stack = [node];
  const urls = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item));
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      const lowerKey = String(key || '').toLowerCase();
      if (typeof value === 'string') {
        const trimmed = String(value || '').trim();
        if (
          /^https?:\/\//i.test(trimmed)
          && (lowerKey.includes('url') || lowerKey.includes('download') || lowerKey.includes('link'))
        ) {
          urls.add(trimmed);
        }
      } else if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return Array.from(urls);
};

const buildStorageObjectPath = ({
  orgId,
  channel,
  fileName,
  mimeType,
}: {
  orgId: string;
  channel: string;
  fileName: string;
  mimeType: string | null;
}) => {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const baseOrg = safeFileName(String(orgId || 'unknown_org').trim(), 'unknown_org');
  const sourceName = safeFileName(fileName || 'file', 'file');
  const hasExt = /\.[a-z0-9]{2,8}$/i.test(sourceName);
  const ext = extensionFromMime(String(mimeType || ''));
  const finalName = hasExt || !ext ? sourceName : `${sourceName}.${ext}`;
  const randomPart = Math.random().toString(36).slice(2, 8);
  const stamped = `${Date.now()}_${randomPart}_${finalName}`;
  return `per_org/${baseOrg}/${String(channel || 'bot').trim() || 'bot'}/inbound/${yyyy}/${mm}/${dd}/${stamped}`;
};

const buildPublicObjectUrl = (publicBaseUrl: string, bucket: string, objectPath: string) =>
  `${publicBaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;

const isRubikaHostedUrl = (value: string | null | undefined) => {
  const target = String(value || '').trim();
  if (!target) return false;
  try {
    const parsed = new URL(target);
    const host = String(parsed.hostname || '').trim().toLowerCase();
    return host === 'rubika.ir' || host.endsWith('.rubika.ir');
  } catch {
    return /(^https?:\/\/)?([^.]+\.)*rubika\.ir(\/|$)/i.test(target);
  }
};

const isProviderHostedTemporaryUrl = (channel: BotChannel, value: string | null | undefined) => {
  const target = String(value || '').trim();
  if (!target) return false;
  if (channel === 'rubika') return isRubikaHostedUrl(target);
  if (channel !== 'telegram' && channel !== 'bale') return false;
  try {
    const parsed = new URL(target);
    const host = String(parsed.hostname || '').trim().toLowerCase();
    const baseHost = (() => {
      try {
        return String(new URL(DEFAULT_API_BASE_URL[channel]).hostname || '').trim().toLowerCase();
      } catch {
        return '';
      }
    })();
    return Boolean(baseHost && (host === baseHost || host.endsWith(`.${baseHost}`)));
  } catch {
    return false;
  }
};

const uploadBinaryToStorage = async ({
  supabaseUrl,
  serviceRoleKey,
  publicBaseUrl,
  bucket,
  objectPath,
  bytes,
  contentType,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  publicBaseUrl: string;
  bucket: string;
  objectPath: string;
  bytes: Uint8Array;
  contentType: string;
}) => {
  const encodedPath = objectPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const url = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || 'Could not upload media file to storage');
  }
  return buildPublicObjectUrl(publicBaseUrl, bucket, objectPath);
};

const inferMimeTypeFromFileName = (fileName: string) => {
  const lower = String(fileName || '').trim().toLowerCase();
  if (!lower) return '';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.3gp')) return 'video/3gpp';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.ogg') || lower.endsWith('.oga') || lower.endsWith('.opus')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.rar')) return 'application/vnd.rar';
  if (lower.endsWith('.7z')) return 'application/x-7z-compressed';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (lower.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  return '';
};

const detectMimeTypeFromBytes = (bytes: Uint8Array) => {
  if (!bytes?.length) return '';
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 6) {
    const gif = Array.from(bytes.slice(0, 6)).map((item) => String.fromCharCode(item)).join('');
    if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12) {
    const riff = Array.from(bytes.slice(0, 4)).map((item) => String.fromCharCode(item)).join('');
    const webp = Array.from(bytes.slice(8, 12)).map((item) => String.fromCharCode(item)).join('');
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
    const ftyp = Array.from(bytes.slice(4, 8)).map((item) => String.fromCharCode(item)).join('');
    if (ftyp === 'ftyp') return 'video/mp4';
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'application/zip';
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg';
  if (bytes.length >= 4) {
    const ogg = Array.from(bytes.slice(0, 4)).map((item) => String.fromCharCode(item)).join('');
    if (ogg === 'OggS') return 'audio/ogg';
  }
  return '';
};

const shouldTreatAsBinaryFile = (fileName?: string | null, messageType?: string | null) => {
  const ext = String(fileName || '').trim().toLowerCase().split('.').pop() || '';
  if (messageType === 'image') return true;
  return [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
    'mp4', 'mkv', 'mov', 'avi', 'webm', '3gp',
    'mp3', 'wav', 'ogg', 'oga', 'opus', 'aac', 'm4a', 'flac', 'weba',
    'pdf', 'zip', 'rar', '7z', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  ].includes(ext);
};

const looksLikeImageBytes = (bytes: Uint8Array) => {
  if (bytes.length < 12) return false;
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  const isBmp = bytes[0] === 0x42 && bytes[1] === 0x4d;
  return isJpg || isPng || isGif || isWebp || isBmp;
};

const looksLikeExpectedMediaBytes = (bytes: Uint8Array, messageType?: string | null, contentType?: string | null, fileName?: string | null) => {
  const detectedMime = detectMimeTypeFromBytes(bytes);
  const effectiveMime = String(detectedMime || contentType || inferMimeTypeFromFileName(String(fileName || '')) || '').toLowerCase();
  const normalizedType = String(messageType || '').trim().toLowerCase();
  if (!normalizedType || normalizedType === 'file') return true;
  if (normalizedType === 'image') return effectiveMime.startsWith('image/') || looksLikeImageBytes(bytes);
  if (normalizedType === 'video') return effectiveMime.startsWith('video/');
  if (normalizedType === 'audio' || normalizedType === 'voice') return effectiveMime.startsWith('audio/') || effectiveMime.startsWith('video/');
  return true;
};

const downloadBinaryFromUrl = async (
  url: string,
  options?: { fileName?: string | null; messageType?: string | null }
) => {
  const target = String(url || '').trim();
  if (!target) return null;
  const expectedBinary = shouldTreatAsBinaryFile(options?.fileName || null, options?.messageType || null);
  const looksRubika = isRubikaHostedUrl(target);
  const headerAttempts: Array<Record<string, string>> = looksRubika
    ? [
      {},
      {
        Accept: '*/*',
        Referer: 'https://rubika.ir/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    ]
    : [{}];
  for (const headers of headerAttempts) {
    try {
      const response = await fetch(target, {
        method: 'GET',
        headers,
      });
      if (!response.ok) continue;
      const contentType = String(response.headers.get('content-type') || '').trim() || 'application/octet-stream';
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) continue;

      const lowerType = contentType.toLowerCase();
      const sample = new TextDecoder().decode(bytes.slice(0, 1024)).trim().toLowerCase();
      const looksVersionText = /^(\d+\.)+\d+$/.test(sample);
      const looksHtml = sample.startsWith('<!doctype') || sample.startsWith('<html') || sample.includes('<html');
      const looksJsonError = sample.startsWith('{') && sample.includes('invalid_input');
      if (
        lowerType.includes('text/html')
        || lowerType.includes('application/json')
        || (expectedBinary && lowerType.includes('text/plain'))
        || looksHtml
        || looksJsonError
        || (expectedBinary && looksVersionText)
      ) {
        continue;
      }

      if (!looksLikeExpectedMediaBytes(bytes, options?.messageType || null, lowerType, options?.fileName || null)) {
        continue;
      }

      return { bytes, contentType: detectMimeTypeFromBytes(bytes) || contentType };
    } catch {
      // try next header profile
    }
  }
  return null;
};

// Resolve a Bale/Telegram file_id → download URL via getFile.
const tryTelegramLikeGetFile = async ({
  channel,
  settings,
  fileId,
}: {
  channel: 'telegram' | 'bale';
  settings: IntegrationSettings;
  fileId: string;
}) => {
  const token = String(settings?.bot_token || '').trim();
  if (!token || !fileId) return null;
  const baseUrl = normalizeBaseUrl(DEFAULT_API_BASE_URL[channel]);
  if (!baseUrl) return null;
  const endpoint = `${baseUrl}/bot${encodeURIComponent(token)}/getFile`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });
    if (!response.ok) return null;
    const parsed = await response.json().catch(() => null);
    if (!parsed || !parsed.ok) return null;
    const filePath = String(parsed?.result?.file_path || '').trim();
    if (!filePath) return null;
    const downloadUrl = `${baseUrl}/file/bot${encodeURIComponent(token)}/${filePath}`;
    return {
      fileUrl: downloadUrl,
      fileUrls: [downloadUrl],
      bytes: null as Uint8Array | null,
      contentType: null as string | null,
      providerResult: parsed,
    };
  } catch {
    return null;
  }
};

const tryRubikaGetFile = async ({
  settings,
  fileId,
}: {
  settings: IntegrationSettings;
  fileId: string;
}) => {
  const normalizedSettings = normalizeBotSettings('rubika', settings);
  const token = String(normalizedSettings?.bot_token || '').trim();
  if (!token || !fileId) return null;
  const baseUrl = normalizeBaseUrl(normalizedSettings?.api_base_url || DEFAULT_API_BASE_URL.rubika);
  if (!baseUrl) return null;
  const endpoint = `${baseUrl}/v3/${encodeURIComponent(token)}/getFile`;
  const bodies: Array<Record<string, any>> = [{ file_id: fileId }];

  for (const body of bodies) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) continue;

      const contentType = String(response.headers.get('content-type') || '').trim().toLowerCase();
      const parsed = await response.clone().json().catch(() => null);
      if (parsed && typeof parsed === 'object') {
        const urls = findDeepDownloadUrls(parsed);
        if (urls.length > 0) {
          return {
            fileUrl: urls[0],
            fileUrls: urls,
            bytes: null as Uint8Array | null,
            contentType: null as string | null,
            providerResult: parsed,
          };
        }
        // JSON response without download url is not file bytes.
        continue;
      }
    } catch {
      // continue fallback bodies
    }
  }
  return null;
};

const tryBotProviderGetFile = async ({
  channel,
  settings,
  fileId,
}: {
  channel: BotChannel;
  settings: IntegrationSettings;
  fileId: string;
}) => {
  if (!fileId) return null;
  if (channel === 'rubika') {
    return await tryRubikaGetFile({ settings, fileId });
  }
  if (channel === 'telegram' || channel === 'bale') {
    return await tryTelegramLikeGetFile({ channel, settings, fileId });
  }
  return null;
};

const resolveAndStoreInboundMedia = async ({
  supabaseUrl,
  serviceRoleKey,
  requestUrl,
  requestHeaders,
  channel,
  orgId,
  integrationSettings,
  mediaInfo,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  requestUrl: string;
  requestHeaders: Headers;
  channel: BotChannel;
  orgId: string;
  integrationSettings: IntegrationSettings;
  mediaInfo: {
    messageType: string;
    fileUrl: string | null;
    fileName: string | null;
    mimeType: string | null;
    fileId: string | null;
  };
}) => {
  const buildMediaImportFailure = ({
    fileUrl,
    fileName,
    mimeType,
    errorCode,
    message,
    retryable = true,
    diagnostic = null,
  }: {
    fileUrl?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    errorCode: string;
    message: string;
    retryable?: boolean;
    diagnostic?: Record<string, any> | null;
  }) => ({
    fileUrl: fileUrl || null,
    fileName: fileName ?? mediaInfo.fileName,
    mimeType: mimeType || mediaInfo.mimeType || null,
    stored: false,
    mediaImportStatus: 'failed',
    mediaImportErrorCode: errorCode,
    mediaImportErrorMessage: message,
    mediaImportRetryable: retryable,
    mediaDownloadDiagnostic: diagnostic,
    storagePath: null,
    storageBucket: null,
  });

  if (mediaInfo.messageType === 'text') {
    return {
      fileUrl: null as string | null,
      fileName: mediaInfo.fileName,
      mimeType: mediaInfo.mimeType,
      stored: false,
      mediaImportStatus: null,
      mediaImportErrorCode: null,
      mediaImportErrorMessage: null,
      mediaImportRetryable: null,
      mediaDownloadDiagnostic: null,
      storagePath: null,
      storageBucket: null,
    };
  }

  let resolvedUrl = String(mediaInfo.fileUrl || '').trim() || null;
  let resolvedUrls: string[] = resolvedUrl ? [resolvedUrl] : [];
  let resolvedMime = String(mediaInfo.mimeType || '').trim() || null;
  let bytes: Uint8Array | null = null;

  const normalizedFileId = String(mediaInfo.fileId || '').trim();
  const shouldUseProviderFileApi = normalizedFileId.length > 0
    && (channel === 'rubika' || channel === 'bale' || channel === 'telegram');

  if (shouldUseProviderFileApi) {
    const byFileId = await tryBotProviderGetFile({
      channel,
      settings: integrationSettings,
      fileId: normalizedFileId,
    });
    if (byFileId) {
      if (byFileId.fileUrl) resolvedUrl = String(byFileId.fileUrl || '').trim() || resolvedUrl;
      if (Array.isArray((byFileId as any).fileUrls)) {
        resolvedUrls = Array.from(new Set([...(byFileId as any).fileUrls.map((item: any) => String(item || '').trim()).filter(Boolean), ...resolvedUrls]));
      } else if (byFileId.fileUrl) {
        resolvedUrls = Array.from(new Set([String(byFileId.fileUrl || '').trim(), ...resolvedUrls].filter(Boolean)));
      }
      if (byFileId.bytes?.length) bytes = byFileId.bytes;
      if (byFileId.contentType) resolvedMime = String(byFileId.contentType || '').trim() || resolvedMime;
    }
  }

  if (shouldUseProviderFileApi && resolvedUrls.length === 0) {
    return buildMediaImportFailure({
      fileUrl: null,
      fileName: mediaInfo.fileName,
      mimeType: resolvedMime,
      errorCode: `${channel}_file_resolve_failed`,
      message: 'getFile لینک دانلود فایل را برنگرداند.',
      retryable: true,
      diagnostic: {
        channel,
        file_id: normalizedFileId,
        provider_method: 'getFile',
      },
    });
  }

  if (!bytes && resolvedUrls.length > 0) {
    const candidateUrls = Array.from(new Set(resolvedUrls));
    for (const candidateUrl of candidateUrls) {
      const downloaded = await downloadBinaryFromUrl(candidateUrl, {
        fileName: mediaInfo.fileName,
        messageType: mediaInfo.messageType,
      });
      if (downloaded?.bytes?.length) {
        bytes = downloaded.bytes;
        resolvedUrl = candidateUrl;
        resolvedMime = String(downloaded.contentType || '').trim() || resolvedMime;
        break;
      }
    }
  }

  // Provider links can be short-lived or region-sensitive. Retry with fresh getFile URLs.
  if (!bytes && shouldUseProviderFileApi) {
    for (let retry = 0; retry < 2; retry += 1) {
      const refreshed = await tryBotProviderGetFile({
        channel,
        settings: integrationSettings,
        fileId: normalizedFileId,
      });
      const refreshedUrl = String(refreshed?.fileUrl || '').trim();
      const refreshedUrls = Array.isArray((refreshed as any)?.fileUrls)
        ? (refreshed as any).fileUrls.map((item: any) => String(item || '').trim()).filter(Boolean)
        : [refreshedUrl].filter(Boolean);
      const refreshedCandidateUrls = Array.from(new Set(refreshedUrls));
      for (const refreshedCandidateUrl of refreshedCandidateUrls) {
        resolvedUrl = refreshedCandidateUrl;
        const downloaded = await downloadBinaryFromUrl(refreshedCandidateUrl, {
          fileName: mediaInfo.fileName,
          messageType: mediaInfo.messageType,
        });
        if (downloaded?.bytes?.length) {
          bytes = downloaded.bytes;
          resolvedMime = String(downloaded.contentType || '').trim() || resolvedMime;
          break;
        }
      }
      if (bytes?.length) break;
    }
  }

  if (!bytes || !bytes.length) {
    const safeFallbackUrl = isProviderHostedTemporaryUrl(channel, resolvedUrl)
      ? null
      : (resolvedUrl || null);
    return buildMediaImportFailure({
      fileUrl: safeFallbackUrl,
      fileName: mediaInfo.fileName,
      mimeType: resolvedMime || mediaInfo.mimeType || null,
      errorCode: shouldUseProviderFileApi ? `${channel}_file_download_failed` : 'media_download_failed',
      message: 'دانلود فایل ورودی ناموفق بود.',
      retryable: true,
      diagnostic: {
        channel,
        file_id: normalizedFileId || null,
        candidate_count: resolvedUrls.length,
        has_fallback_url: Boolean(safeFallbackUrl),
      },
    });
  }

  const objectPath = buildStorageObjectPath({
    orgId,
    channel,
    fileName: mediaInfo.fileName || 'file',
    mimeType: resolvedMime || mediaInfo.mimeType || null,
  });
  const publicBaseUrl = pickPublicApiBaseUrl(requestUrl, requestHeaders, integrationSettings || {});
  if (!publicBaseUrl) {
    return buildMediaImportFailure({
      fileUrl: null as string | null,
      fileName: mediaInfo.fileName,
      mimeType: resolvedMime || mediaInfo.mimeType || null,
      errorCode: 'public_api_base_url_missing',
      message: 'آدرس عمومی API برای ساخت لینک پایدار فایل در دسترس نیست.',
      retryable: false,
      diagnostic: {
        file_id: normalizedFileId || null,
      },
    });
  }
  let publicUrl = '';
  try {
    publicUrl = await uploadBinaryToStorage({
      supabaseUrl,
      serviceRoleKey,
      publicBaseUrl,
      bucket: DEFAULT_FILE_STORAGE_BUCKET,
      objectPath,
      bytes,
      contentType: resolvedMime || mediaInfo.mimeType || 'application/octet-stream',
    });
  } catch (error: any) {
    return buildMediaImportFailure({
      fileUrl: null,
      fileName: mediaInfo.fileName,
      mimeType: resolvedMime || mediaInfo.mimeType || null,
      errorCode: 'storage_upload_failed',
      message: String(error?.message || error || 'آپلود فایل در Storage ناموفق بود.'),
      retryable: true,
      diagnostic: {
        file_id: normalizedFileId || null,
        storage_path: objectPath,
      },
    });
  }

  return {
    fileUrl: publicUrl,
    fileName: mediaInfo.fileName,
    mimeType: resolvedMime || mediaInfo.mimeType || null,
    stored: true,
    storagePath: objectPath,
    storageBucket: DEFAULT_FILE_STORAGE_BUCKET,
    mediaImportStatus: 'succeeded',
    mediaImportErrorCode: null,
    mediaImportErrorMessage: null,
    mediaImportRetryable: false,
    mediaDownloadDiagnostic: null,
  };
};

const findIntegrationBySecret = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  channel: BotChannel,
  secret: string
) => {
  const connectionTypes = channel === 'telegram'
    ? ['telegram_bot', 'telegram']
    : channel === 'bale'
      ? ['bale_bot', 'bale']
      : ['rubika_bot', 'rubika'];
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/integration_settings`);
  url.searchParams.set('connection_type', `in.(${connectionTypes.join(',')})`);
  url.searchParams.set('is_active', 'eq.true');
  url.searchParams.set('select', 'id,org_id,provider,settings,connection_type,created_at,updated_at');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || '??? ?? ?????? ??????? ???');

  const rows = raw ? JSON.parse(raw) : [];
  const row = Array.isArray(rows)
    ? [...rows]
        .filter((item) => String(item?.settings?.webhook_secret || '').trim() === secret)
        .sort((left, right) => {
          const leftExact = String(left?.connection_type || '') === `${channel}_bot` ? 1 : 0;
          const rightExact = String(right?.connection_type || '') === `${channel}_bot` ? 1 : 0;
          if (leftExact !== rightExact) return rightExact - leftExact;

          const leftUpdated = Date.parse(String(left?.updated_at || left?.created_at || '')) || 0;
          const rightUpdated = Date.parse(String(right?.updated_at || right?.created_at || '')) || 0;
          return rightUpdated - leftUpdated;
        })[0]
    : null;

  if (!row) throw new Error('Webhook secret ????? ????.');
  return row;
};

const upsertInboundContact = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: Record<string, any>
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/bot_inbound_contacts`);
  url.searchParams.set('on_conflict', 'org_id,channel_type,chat_id');

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(raw || '??? ?? ????? ????? ???');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] : parsed;
};

const normalizeLinkToken = (value: any) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const noQuery = text.split('?')[0].split('#')[0];
  const parts = noQuery.split('/').filter(Boolean);
  return String(parts[parts.length - 1] || '').trim().toLowerCase();
};

const normalizePlainToken = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\u0600-\u06ff _-]/g, '');

const extractUrlTokens = (value: any) => {
  const text = String(value || '');
  if (!text.trim()) return [] as string[];
  const matches = text.match(/https?:\/\/[^\s]+/gi) || [];
  return Array.from(new Set(matches.map((item) => normalizeLinkToken(item)).filter(Boolean)));
};

const loadOrgCounterpartyBotGroups = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  channel: BotChannel
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_groups`);
  url.searchParams.set('org_id', `eq.${orgId}`);
  url.searchParams.set('channel_type', `eq.${channel}`);
  url.searchParams.set('select', 'id,customer_id,supplier_id,employee_id,status,group_join_link,group_title,bot_chat_id,metadata,updated_at,last_inbound_at');
  url.searchParams.set('limit', '200');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'Could not load counterparty bot groups');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [];
};

const patchCounterpartyBotGroup = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string,
  patch: Record<string, any>,
  options?: {
    onlyIfBotChatIdNull?: boolean;
  }
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_groups`);
  url.searchParams.set('id', `eq.${id}`);
  if (options?.onlyIfBotChatIdNull) {
    // Treat both NULL and empty-string as unbound to handle legacy rows.
    url.searchParams.set('or', '(bot_chat_id.is.null,bot_chat_id.eq.)');
  }
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'Could not patch counterparty bot group');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] : parsed;
};

const loadCounterpartyBotGroupById = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_groups`);
  url.searchParams.set('id', `eq.${id}`);
  url.searchParams.set('select', 'id,customer_id,supplier_id,status,group_join_link,group_title,bot_chat_id,metadata');
  url.searchParams.set('limit', '1');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'Could not load counterparty bot group by id');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] || null : parsed || null;
};

const loadCounterpartyLabel = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  row: Record<string, any> | null | undefined
) => {
  const targetType = String(
    row?.customer_id ? 'customers' : row?.supplier_id ? 'suppliers' : row?.employee_id ? 'employees' : ''
  ).trim();
  const targetId = String(row?.customer_id || row?.supplier_id || row?.employee_id || '').trim();
  if (!targetType || !targetId) return '';

  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${targetType}`);
  url.searchParams.set('id', `eq.${targetId}`);
  if (targetType === 'customers') {
    url.searchParams.set('select', 'full_name,business_name,legal_name,system_code');
  } else if (targetType === 'suppliers') {
    url.searchParams.set('select', 'business_name,full_name,system_code');
  } else {
    url.searchParams.set('select', 'full_name,first_name,last_name,system_code,legacy_system_code');
  }
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) return '';
  const rows = raw ? JSON.parse(raw) : [];
  const item = Array.isArray(rows) ? rows[0] : null;
  if (!item) return '';

  return pick(item?.full_name, item?.business_name, item?.legal_name, [item?.first_name, item?.last_name].filter(Boolean).join(' '), item?.system_code, item?.legacy_system_code);
};

const loadBotIdentityBindingByChatId = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  channel: BotChannel,
  chatId: string,
) => {
  const normalizedChatId = String(chatId || '').trim();
  if (!orgId || !normalizedChatId) return null;
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/bot_chat_identity_bindings`);
  url.searchParams.set('org_id', `eq.${orgId}`);
  url.searchParams.set('channel_type', `eq.${channel}`);
  url.searchParams.set('chat_id', `eq.${normalizedChatId}`);
  url.searchParams.set('select', 'id,target_module_id,target_record_id,profile_id,display_name,username,phone_number,last_seen_at');
  url.searchParams.set('limit', '1');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) {
    console.warn('[bot-webhook] could not load chat identity binding', raw);
    return null;
  }
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] || null : parsed || null;
};

const upsertCounterpartyBotDirectThread = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: Record<string, any>,
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_direct_threads`);
  url.searchParams.set('on_conflict', 'org_id,channel_type,chat_id');
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'Could not upsert direct thread');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] || null : parsed || null;
};

const patchCounterpartyBotDirectThread = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string,
  payload: Record<string, any>,
) => {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return null;
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_direct_threads`);
  url.searchParams.set('id', `eq.${normalizedId}`);
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'Could not patch direct thread');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] || null : parsed || null;
};

const loadConversationCounterpartyBotDirectMessages = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  {
    orgId,
    directThreadId,
    channel,
    chatId,
    limit = 40,
  }: {
    orgId?: string | null;
    directThreadId?: string | null;
    channel: BotChannel;
    chatId?: string | null;
    limit?: number;
  }
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_direct_messages`);
  url.searchParams.set('channel_type', `eq.${channel}`);
  url.searchParams.set('select', 'id,direct_thread_id,chat_id,provider_message_id,created_at,content_text,file_url,file_name,mime_type,message_type,payload');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 80))));
  const normalizedThreadId = String(directThreadId || '').trim();
  const normalizedChatId = String(chatId || '').trim();
  const normalizedOrgId = String(orgId || '').trim();
  if (normalizedThreadId) {
    url.searchParams.set('direct_thread_id', `eq.${normalizedThreadId}`);
  } else if (normalizedChatId) {
    url.searchParams.set('chat_id', `eq.${normalizedChatId}`);
  }
  if (normalizedOrgId) {
    url.searchParams.set('org_id', `eq.${normalizedOrgId}`);
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) {
    console.warn('[bot-webhook] could not load conversation direct messages', raw);
    return [];
  }
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [];
};

const insertCounterpartyBotDirectMessage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: Record<string, any>,
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_direct_messages`);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'Could not insert direct bot message');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] || null : parsed || null;
};

const patchCounterpartyBotDirectMessage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  messageId: string,
  payload: Record<string, any>,
) => {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) return null;
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_direct_messages`);
  url.searchParams.set('id', `eq.${normalizedMessageId}`);
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'Could not patch direct bot message');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] || null : parsed || null;
};

const sendBotConnectionConfirmation = async ({
  channel,
  settings,
  chatId,
  counterpartyLabel,
}: {
  channel: BotChannel;
  settings: IntegrationSettings;
  chatId: string;
  counterpartyLabel: string;
}) => {
  const normalizedSettings = normalizeBotSettings(channel, settings);
  const token = String(normalizedSettings?.bot_token || '').trim();
  if (!token) return;
  const baseUrl = String(normalizedSettings?.api_base_url || DEFAULT_API_BASE_URL[channel]).trim();
  const sendPath = String(normalizedSettings?.send_message_path || '').trim() || DEFAULT_SEND_PATH[channel];
  const text = `اتصال این گروه به "${counterpartyLabel || 'طرف‌حساب'}" با موفقیت انجام شد`;

  const response = await fetch(buildSendMessageUrl(baseUrl, token, sendPath), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(channel === 'rubika' ? {} : { parse_mode: 'HTML' }),
    }),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || 'Could not send connection confirmation message');
  }
};

const sendBotTextMessage = async ({
  channel,
  settings,
  chatId,
  text,
}: {
  channel: BotChannel;
  settings: IntegrationSettings;
  chatId: string;
  text: string;
}) => {
  const normalizedSettings = normalizeBotSettings(channel, settings);
  const token = String(normalizedSettings?.bot_token || '').trim();
  const normalizedText = String(text || '').trim();
  if (!token || !chatId || !normalizedText) return null;
  const baseUrl = String(normalizedSettings?.api_base_url || DEFAULT_API_BASE_URL[channel]).trim();
  const sendPath = String(normalizedSettings?.send_message_path || '').trim() || DEFAULT_SEND_PATH[channel];

  const response = await fetch(buildSendMessageUrl(baseUrl, token, sendPath), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: normalizedText,
      ...(channel === 'rubika' ? {} : { parse_mode: 'HTML' }),
    }),
  });
  const raw = await response.text();
  let parsed: any = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = { raw }; }
  if (!response.ok) {
    throw new Error(String(parsed?.description || parsed?.message || raw || 'Could not send bot text message'));
  }
  return parsed;
};

const normalizeAiBaseUrl = (value: any) => {
  const raw = String(value || DEFAULT_AI_BASE_URL).trim().replace(/\/+$/, '');
  if (!raw) return DEFAULT_AI_BASE_URL;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const botAiBaseUrls = () => {
  const primary = Deno.env.get('AVALAI_BASE_URL') || Deno.env.get('AI_BASE_URL') || DEFAULT_AI_BASE_URL;
  const fallbackRaw = Deno.env.get('AVALAI_FALLBACK_BASE_URLS')
    || Deno.env.get('AI_FALLBACK_BASE_URLS')
    || Deno.env.get('AVALAI_FALLBACK_BASE_URL')
    || DEFAULT_AI_FALLBACK_BASE_URL;
  const seen = new Set<string>();
  return [primary, ...String(fallbackRaw).split(',')]
    .map(normalizeAiBaseUrl)
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const isRetryableAiStatus = (status: number) =>
  status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

const restSelectRows = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  params: Record<string, string | number | boolean | null | undefined>
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${table}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });
  const response = await fetch(url.toString(), { method: 'GET', headers: getServiceHeaders(serviceRoleKey) });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || `Could not select ${table}`);
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [];
};

const loadBotAiProviderConfig = async (supabaseUrl: string, serviceRoleKey: string, orgId: string) => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return null;
  const [settingsRows, catalogRows] = await Promise.all([
    restSelectRows(supabaseUrl, serviceRoleKey, 'org_ai_settings', {
      org_id: `eq.${normalizedOrgId}`,
      select: 'selected_models,feature_flags',
      limit: 1,
    }).catch(() => []),
    restSelectRows(supabaseUrl, serviceRoleKey, 'ai_model_catalog', {
      select: 'id,provider,capability_tags,is_active,is_coming_soon',
      limit: 500,
    }).catch(() => []),
  ]);
  const settings = settingsRows[0] || {};
  const flags = settings?.feature_flags && typeof settings.feature_flags === 'object' ? settings.feature_flags : {};
  if (flags?.customer_reply_suggestion === false) return null;
  const selected = settings?.selected_models && typeof settings.selected_models === 'object' ? settings.selected_models : {};
  const requested = String(selected.customer_reply_suggestion || '').trim();
  const allowed = (catalogRows || []).filter((model: any) => {
    const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
    return model?.is_active !== false
      && model?.is_coming_soon !== true
      && tags.includes('customer_reply_suggestion')
      && String(model?.id || '').trim();
  });
  if (allowed.length === 0) return null;
  const allowedById = new Map(allowed.map((model: any) => [String(model?.id || '').trim(), model]));
  const resolved = allowedById.get(requested) || allowed[0];
  return {
    provider: String(resolved?.provider || 'avalai').trim() || 'avalai',
    model: String(resolved?.id || '').trim(),
    apiKey: String(Deno.env.get('AVALAI_API_KEY') || Deno.env.get('AI_API_KEY') || Deno.env.get('OPENAI_API_KEY') || '').trim(),
  };
};

const callBotAutoReplyAi = async (providerConfig: any, payload: Record<string, any>) => {
  if (!providerConfig?.model) throw new Error('مدل پاسخ خودکار بات تنظیم نشده است.');
  if (!providerConfig?.apiKey) throw new Error('کلید مرکزی AI برای پاسخ خودکار بات تنظیم نشده است.');
  const model = String(providerConfig.model || '').trim();
  const isReasoningModel = [/^o\d/i, /\bo[34][-_]/i, /^gpt-5/i, /deepseek-r\d/i, /\bqwq\b/i, /\breasonin/i].some((pattern) => pattern.test(model));
  const requestBody: Record<string, any> = {
    model,
    messages: [
      {
        role: 'system',
        content: 'شما دستیار پاسخگویی خودکار سازمانی هستید. فقط متن قابل ارسال به مشتری را بنویس. پاسخ فارسی، کوتاه، حرفه‌ای و محتاط باشد. اگر اطلاعات کافی نیست، سوال کوتاه بپرس. هیچ توضیح فرایندی، Markdown یا عنوان ننویس.',
      },
      {
        role: 'user',
        content: JSON.stringify(payload),
      },
    ],
  };
  if (isReasoningModel) {
    requestBody.max_completion_tokens = 1200;
  } else {
    requestBody.temperature = 0.22;
    requestBody.max_tokens = 520;
  }
  let response: Response | null = null;
  let raw = '';
  // Keep bot auto-replies within the worker budget. Retrying another base URL
  // after a provider timeout can exceed the supervisor limit and lose the reply.
  const baseUrls = botAiBaseUrls().slice(0, 1);
  for (const baseUrl of baseUrls) {
    try {
      const nextResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${providerConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(45000),
      });
      response = nextResponse;
      raw = await nextResponse.text();
      if (nextResponse.ok || !isRetryableAiStatus(nextResponse.status) || baseUrl === baseUrls[baseUrls.length - 1]) break;
    } catch (error: any) {
      const text = `${String(error?.name || '')} ${String(error?.message || error || '')}`;
      if (/abort|timeout|timed out|upstream server is timing out|request has been cancelled/i.test(text)) {
        throw new Error('سرویس هوش مصنوعی در زمان مناسب پاسخ نداد.');
      }
      if (baseUrl === baseUrls[baseUrls.length - 1]) throw error;
    }
  }
  if (!response) throw new Error('اتصال به AvalAI برقرار نشد.');
  let parsed: any = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { raw }; }
  if (!response.ok) throw new Error(String(parsed?.error?.message || parsed?.message || raw || `AI request failed: ${response.status}`));
  return {
    text: String(parsed?.choices?.[0]?.message?.content || '').replace(/^["'`]+|["'`]+$/g, '').trim(),
    usage: parsed?.usage || null,
    requestId: response.headers.get('x-request-id') || response.headers.get('x-avalai-request-id') || null,
  };
};

const maybeSendBotAiAutoReply = async ({
  supabaseUrl,
  serviceRoleKey,
  integration,
  channel,
  contact,
  matchedGroup,
  inboundText,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  integration: any;
  channel: BotChannel;
  contact: any;
  matchedGroup: any;
  inboundText: string | null;
}) => {
  const orgId = String(integration?.org_id || '').trim();
  const groupId = String(matchedGroup?.id || '').trim();
  const chatId = String(contact?.chatId || '').trim();
  const text = String(inboundText || '').trim();
  const metadata = matchedGroup?.metadata && typeof matchedGroup.metadata === 'object' ? matchedGroup.metadata : {};
  if (!orgId || !groupId || !chatId || !text || contact?.isGroup !== true || metadata?.ai_auto_reply_enabled !== true) return;
  const providerConfig = await loadBotAiProviderConfig(supabaseUrl, serviceRoleKey, orgId);
  if (!providerConfig?.model) return;
  const recentRows = await loadConversationCounterpartyBotMessages(supabaseUrl, serviceRoleKey, {
    orgId,
    botGroupId: groupId,
    channel,
    chatId,
    limit: 18,
  });
  const counterpartyLabel = await loadCounterpartyLabel(supabaseUrl, serviceRoleKey, matchedGroup).catch(() => '');
  const conversation = (recentRows || [])
    .slice()
    .reverse()
    .map((row: any, index: number) => ({
      index: index + 1,
      role: String(row?.direction || '').trim() === 'outbound' ? 'organization' : 'customer',
      text: String(row?.content_text || '').trim() || (String(row?.file_name || '').trim() ? `فایل: ${String(row.file_name || '').trim()}` : ''),
      created_at: row?.created_at || null,
    }))
    .filter((row: any) => row.text);
  const aiResult = await callBotAutoReplyAi(providerConfig, {
    channel,
    counterparty: {
      label: counterpartyLabel || null,
      target_type: matchedGroup?.target_type || null,
      group_title: matchedGroup?.group_title || null,
    },
    guide: String(metadata?.ai_counterparty_guide || '').trim() || null,
    latest_message: text,
    conversation,
  });
  const replyText = String(aiResult?.text || '').trim();
  if (!replyText) return;
  const sent = await sendBotTextMessage({
    channel,
    settings: (integration?.settings || {}) as IntegrationSettings,
    chatId,
    text: replyText,
  });
  await insertCounterpartyBotMessage(supabaseUrl, serviceRoleKey, {
    org_id: orgId,
    bot_group_id: groupId,
    channel_type: channel,
    direction: 'outbound',
    message_type: 'text',
    chat_id: chatId,
    provider_message_id: pick(sent?.result?.message_id, sent?.message_id, sent?.data?.message_id) || null,
    content_text: replyText,
    payload: {
      source: 'ai_auto_reply',
      provider: providerConfig.provider,
      model: providerConfig.model,
      avalai_request_id: aiResult.requestId,
      usage: aiResult.usage || null,
    },
  });
  await patchCounterpartyBotGroup(supabaseUrl, serviceRoleKey, groupId, {
    metadata: {
      ...metadata,
      last_ai_auto_reply_at: new Date().toISOString(),
      last_ai_auto_reply_model: providerConfig.model,
      last_ai_auto_reply_request_id: aiResult.requestId || null,
    },
  }).catch(() => null);
};

const insertCounterpartyBotMessage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: Record<string, any>
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_messages`);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'Could not insert counterparty bot message');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] : parsed;
};

const patchCounterpartyBotMessage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  messageId: string,
  payload: Record<string, any>
) => {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) return null;
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_messages`);
  url.searchParams.set('id', `eq.${normalizedMessageId}`);
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'Could not update counterparty bot message');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] || null : parsed || null;
};

const loadConversationCounterpartyBotMessages = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  {
    orgId,
    botGroupId,
    channel,
    chatId,
    limit = 40,
  }: {
    orgId?: string | null;
    botGroupId?: string | null;
    channel: BotChannel;
    chatId?: string | null;
    limit?: number;
  }
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_messages`);
  url.searchParams.set('channel_type', `eq.${channel}`);
  url.searchParams.set('select', 'id,bot_group_id,chat_id,provider_message_id,created_at,content_text,file_url,file_name,mime_type,message_type,payload');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 80))));

  const normalizedBotGroupId = String(botGroupId || '').trim();
  const normalizedChatId = String(chatId || '').trim();
  const normalizedOrgId = String(orgId || '').trim();
  if (normalizedBotGroupId) {
    url.searchParams.set('bot_group_id', `eq.${normalizedBotGroupId}`);
  } else if (normalizedChatId) {
    url.searchParams.set('chat_id', `eq.${normalizedChatId}`);
  }
  if (normalizedOrgId) {
    url.searchParams.set('org_id', `eq.${normalizedOrgId}`);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) {
    console.warn('[bot-webhook] could not load conversation bot messages', raw);
    return [];
  }
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [];
};

const normalizeBotPayloadAttachment = (value: any) => {
  const url = String(value?.url || value?.file_url || '').trim();
  const fileId = String(value?.media_file_id || value?.file_id || value?.fileId || '').trim();
  if (!url && !fileId) return null;
  const fallbackName = String(url.split('?')[0].split('#')[0].split('/').pop() || 'فایل').trim() || 'فایل';
  return {
    name: String(value?.name || value?.file_name || value?.fileName || fallbackName).trim() || fallbackName,
    url,
    mime_type: String(value?.mime_type || value?.mimeType || '').trim() || null,
    file_type: String(value?.file_type || value?.fileType || '').trim() || 'file',
    media_file_id: fileId || null,
    provider_message_id: String(value?.provider_message_id || value?.providerMessageId || '').trim() || null,
    media_group_id: String(value?.media_group_id || value?.mediaGroupId || '').trim() || null,
    media_import_status: String(value?.media_import_status || value?.mediaImportStatus || '').trim() || null,
    media_import_error_code: String(value?.media_import_error_code || value?.mediaImportErrorCode || '').trim() || null,
    media_import_error_message: String(value?.media_import_error_message || value?.mediaImportErrorMessage || '').trim() || null,
    media_import_retryable: typeof value?.media_import_retryable === 'boolean'
      ? value.media_import_retryable
      : (typeof value?.mediaImportRetryable === 'boolean' ? value.mediaImportRetryable : null),
    media_storage_path: String(value?.media_storage_path || value?.mediaStoragePath || '').trim() || null,
  };
};

const mergeBotPayloadAttachments = (currentItems: any[], incomingItems: any[]) => {
  const byKey = new Map<string, Record<string, any>>();
  [...(currentItems || []), ...(incomingItems || [])].forEach((item) => {
    const normalized = normalizeBotPayloadAttachment(item);
    if (!normalized) return;
    const key = String(
      normalized.url
      || normalized.media_file_id
      || `${normalized.name}|${normalized.file_type}|${normalized.mime_type || ''}`
    ).trim();
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalized);
      return;
    }
    byKey.set(key, {
      ...existing,
      ...normalized,
      name: normalized.name || existing.name,
      url: normalized.url || existing.url,
      mime_type: normalized.mime_type || existing.mime_type || null,
      file_type: normalized.file_type || existing.file_type || 'file',
      media_file_id: normalized.media_file_id || existing.media_file_id || null,
      provider_message_id: normalized.provider_message_id || existing.provider_message_id || null,
      media_group_id: normalized.media_group_id || existing.media_group_id || null,
      media_import_status: normalized.media_import_status || existing.media_import_status || null,
      media_import_error_code: normalized.media_import_error_code || existing.media_import_error_code || null,
      media_import_error_message: normalized.media_import_error_message || existing.media_import_error_message || null,
      media_import_retryable: typeof normalized.media_import_retryable === 'boolean' ? normalized.media_import_retryable : existing.media_import_retryable ?? null,
      media_storage_path: normalized.media_storage_path || existing.media_storage_path || null,
    });
  });
  return Array.from(byKey.values());
};

const loadCounterpartyBotMessageByProviderId = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  {
    orgId,
    botGroupId,
    channel,
    chatId,
    providerMessageId,
  }: {
    orgId?: string | null;
    botGroupId?: string | null;
    channel: BotChannel;
    chatId?: string | null;
    providerMessageId?: string | null;
  }
) => {
  const normalizedProviderMessageId = String(providerMessageId || '').trim();
  if (!normalizedProviderMessageId) return null;

  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_messages`);
  url.searchParams.set('provider_message_id', `eq.${normalizedProviderMessageId}`);
  url.searchParams.set('channel_type', `eq.${channel}`);
  url.searchParams.set('select', 'id,bot_group_id,chat_id,provider_message_id,created_at,content_text,file_url,file_name,mime_type,message_type,payload');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '1');

  const normalizedBotGroupId = String(botGroupId || '').trim();
  const normalizedChatId = String(chatId || '').trim();
  const normalizedOrgId = String(orgId || '').trim();
  if (normalizedBotGroupId) {
    url.searchParams.set('bot_group_id', `eq.${normalizedBotGroupId}`);
  } else if (normalizedChatId) {
    url.searchParams.set('chat_id', `eq.${normalizedChatId}`);
  }
  if (normalizedOrgId) {
    url.searchParams.set('org_id', `eq.${normalizedOrgId}`);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) {
    console.warn('[bot-webhook] could not resolve replied bot message', raw);
    return null;
  }
  const parsed = raw ? JSON.parse(raw) : [];
  const exactMatch = Array.isArray(parsed) ? parsed[0] || null : parsed || null;
  if (exactMatch) return exactMatch;

  const recentRows = await loadConversationCounterpartyBotMessages(supabaseUrl, serviceRoleKey, {
    orgId,
    botGroupId,
    channel,
    chatId,
    limit: 50,
  });
  return recentRows.find((row: any) => {
    const payloadBox = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const providerIds = Array.isArray((payloadBox as any)?.provider_message_ids)
      ? (payloadBox as any).provider_message_ids
      : [];
    return providerIds.some((value: any) => String(value || '').trim() === normalizedProviderMessageId);
  }) || null;
};

const loadCounterpartyBotMessageByMediaGroupId = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  {
    orgId,
    botGroupId,
    channel,
    chatId,
    mediaGroupId,
  }: {
    orgId?: string | null;
    botGroupId?: string | null;
    channel: BotChannel;
    chatId?: string | null;
    mediaGroupId?: string | null;
  }
) => {
  const normalizedMediaGroupId = String(mediaGroupId || '').trim();
  if (!normalizedMediaGroupId) return null;
  const recentRows = await loadConversationCounterpartyBotMessages(supabaseUrl, serviceRoleKey, {
    orgId,
    botGroupId,
    channel,
    chatId,
    limit: 60,
  });
  return recentRows.find((row: any) => {
    const payloadBox = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const rowMediaGroupId = String((payloadBox as any)?.media_group_id || '').trim();
    return rowMediaGroupId === normalizedMediaGroupId;
  }) || null;
};

const loadCounterpartyBotDirectMessageByProviderId = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  {
    orgId,
    directThreadId,
    channel,
    chatId,
    providerMessageId,
  }: {
    orgId?: string | null;
    directThreadId?: string | null;
    channel: BotChannel;
    chatId?: string | null;
    providerMessageId?: string | null;
  }
) => {
  const normalizedProviderMessageId = String(providerMessageId || '').trim();
  if (!normalizedProviderMessageId) return null;
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_direct_messages`);
  url.searchParams.set('provider_message_id', `eq.${normalizedProviderMessageId}`);
  url.searchParams.set('channel_type', `eq.${channel}`);
  url.searchParams.set('select', 'id,direct_thread_id,chat_id,provider_message_id,created_at,content_text,file_url,file_name,mime_type,message_type,payload');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '1');
  const normalizedThreadId = String(directThreadId || '').trim();
  const normalizedChatId = String(chatId || '').trim();
  const normalizedOrgId = String(orgId || '').trim();
  if (normalizedThreadId) {
    url.searchParams.set('direct_thread_id', `eq.${normalizedThreadId}`);
  } else if (normalizedChatId) {
    url.searchParams.set('chat_id', `eq.${normalizedChatId}`);
  }
  if (normalizedOrgId) {
    url.searchParams.set('org_id', `eq.${normalizedOrgId}`);
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) {
    console.warn('[bot-webhook] could not resolve replied direct bot message', raw);
    return null;
  }
  const parsed = raw ? JSON.parse(raw) : [];
  const exactMatch = Array.isArray(parsed) ? parsed[0] || null : parsed || null;
  if (exactMatch) return exactMatch;
  const recentRows = await loadConversationCounterpartyBotDirectMessages(supabaseUrl, serviceRoleKey, {
    orgId,
    directThreadId,
    channel,
    chatId,
    limit: 50,
  });
  return recentRows.find((row: any) => {
    const payloadBox = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const providerIds = Array.isArray((payloadBox as any)?.provider_message_ids)
      ? (payloadBox as any).provider_message_ids
      : [];
    return providerIds.some((value: any) => String(value || '').trim() === normalizedProviderMessageId);
  }) || null;
};

const loadCounterpartyBotDirectMessageByMediaGroupId = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  {
    orgId,
    directThreadId,
    channel,
    chatId,
    mediaGroupId,
  }: {
    orgId?: string | null;
    directThreadId?: string | null;
    channel: BotChannel;
    chatId?: string | null;
    mediaGroupId?: string | null;
  }
) => {
  const normalizedMediaGroupId = String(mediaGroupId || '').trim();
  if (!normalizedMediaGroupId) return null;
  const recentRows = await loadConversationCounterpartyBotDirectMessages(supabaseUrl, serviceRoleKey, {
    orgId,
    directThreadId,
    channel,
    chatId,
    limit: 60,
  });
  return recentRows.find((row: any) => {
    const payloadBox = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    return String((payloadBox as any)?.media_group_id || '').trim() === normalizedMediaGroupId;
  }) || null;
};

const syncCounterpartyBotGroupByInbound = async ({
  supabaseUrl,
  serviceRoleKey,
  orgId,
  channel,
  contact,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  orgId: string;
  channel: BotChannel;
  contact: Record<string, any>;
}) => {
  try {
    const rows = await loadOrgCounterpartyBotGroups(supabaseUrl, serviceRoleKey, orgId, channel);
    const chatId = String(contact?.chatId || '').trim();
    const chatTitleToken = normalizePlainToken(contact?.chatTitle);
    const incomingTextUpper = String(contact?.text || '').trim().toUpperCase();
    const nowMs = Date.now();
    const isCaptureActive = (row: any) => {
      if (row?.metadata?.capture_mode !== true) return false;
      const status = String(row?.status || '').trim();
      const normalizedStatus = status === 'pending_join_link' ? 'pending_join' : status;
      if (normalizedStatus !== 'pending_join') return false;
      const exp = String(row?.metadata?.capture_expires_at || '').trim();
      if (!exp) return true;
      const expMs = new Date(exp).getTime();
      if (!Number.isFinite(expMs)) return true;
      return expMs >= nowMs;
    };

    const matchedByChatIdCandidates = rows.filter((row: any) => String(row?.bot_chat_id || '').trim() === chatId);
    const pickBestChatIdMatch = (candidates: any[]) => {
      if (candidates.length <= 1) return candidates[0] || null;
      const exactTitleCandidates = chatTitleToken
        ? candidates.filter((row: any) => normalizePlainToken(row?.group_title) === chatTitleToken)
        : [];
      if (exactTitleCandidates.length === 1) return exactTitleCandidates[0];
      const lastBoundTitleCandidates = chatTitleToken
        ? candidates.filter((row: any) => normalizePlainToken(row?.metadata?.last_bound_chat_title) === chatTitleToken)
        : [];
      if (lastBoundTitleCandidates.length === 1) return lastBoundTitleCandidates[0];
      return [...candidates].sort((left: any, right: any) => {
        const leftTime = new Date(left?.last_inbound_at || left?.updated_at || 0).getTime() || 0;
        const rightTime = new Date(right?.last_inbound_at || right?.updated_at || 0).getTime() || 0;
        return rightTime - leftTime;
      })[0] || null;
    };
    const matchedByChatId = pickBestChatIdMatch(matchedByChatIdCandidates);
    const captureActiveRows = rows.filter((row: any) => !String(row?.bot_chat_id || '').trim() && isCaptureActive(row));
    const matchedByCaptureSingle = captureActiveRows.length === 1 ? captureActiveRows[0] : null;
    const matchedByActivationRows = rows.filter((row: any) => {
      if (String(row?.bot_chat_id || '').trim()) return false;
      if (row?.metadata?.capture_mode !== true) return false;
      const code = String(row?.metadata?.activation_code || '').trim().toUpperCase();
      if (!code || !incomingTextUpper) return false;
      return incomingTextUpper.includes(code);
    });
    const matchedByTitleRows = rows.filter((row: any) => {
      if (String(row?.bot_chat_id || '').trim()) return false;
      const rowTitle = normalizePlainToken(row?.group_title);
      if (!rowTitle || !chatTitleToken) return false;
      return rowTitle === chatTitleToken;
    });

    const matchedByActivation = matchedByActivationRows.length === 1 ? matchedByActivationRows[0] : null;
    const matchedByTitle = matchedByTitleRows.length === 1 ? matchedByTitleRows[0] : null;
    const allowActivationOnlyBind = channel === 'rubika'
      && Boolean(chatId)
      && (
        matchedByActivation !== null
        || (matchedByCaptureSingle !== null && incomingTextUpper.length > 0)
      );

    if (contact?.isGroup !== true && !allowActivationOnlyBind) {
      return { group: null, activatedNow: false };
    }

    const matched = matchedByChatId || matchedByActivation || matchedByTitle || matchedByCaptureSingle || null;
    if (!matched) return { group: null, activatedNow: false };
    if (!chatId) return { group: null, activatedNow: false };

    const nextPatch: Record<string, any> = {
      bot_chat_id: chatId || null,
      status: 'active',
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        ...(matched?.metadata && typeof matched.metadata === 'object' ? matched.metadata : {}),
        capture_mode: false,
        activation_required: false,
        last_capture_error: null,
        last_bound_chat_id: chatId || null,
        last_bound_chat_title: String(contact?.chatTitle || contact?.displayName || '').trim() || null,
        last_bound_chat_type: String(contact?.chatType || '').trim() || null,
        activation_match_mode: matchedByChatId
          ? 'chat_id'
          : matchedByActivation
            ? 'activation_code'
            : matchedByTitle
              ? 'group_title'
              : 'capture_single',
        activation_matched_at: new Date().toISOString(),
      },
    };
    const resolvedTitle = String(contact?.chatTitle || contact?.displayName || '').trim();
    if (resolvedTitle) {
      nextPatch.group_title = resolvedTitle;
    }

    const matchedChatId = String(matched?.bot_chat_id || '').trim();
    const clearDuplicateBindings = async (keepId: string) => {
      const duplicateRows = matchedByChatIdCandidates.filter((row: any) => String(row?.id || '').trim() !== keepId);
      for (const duplicate of duplicateRows) {
        const duplicateMetadata = duplicate?.metadata && typeof duplicate.metadata === 'object' ? duplicate.metadata : {};
        await patchCounterpartyBotGroup(supabaseUrl, serviceRoleKey, String(duplicate.id), {
          bot_chat_id: null,
          status: 'pending_join',
          metadata: {
            ...duplicateMetadata,
            duplicate_chat_binding_cleared_at: new Date().toISOString(),
            duplicate_chat_binding_previous_chat_id: chatId || null,
            duplicate_chat_binding_kept_group_id: keepId,
          },
        });
      }
    };
    if (matchedChatId) {
      const patchedExisting = await patchCounterpartyBotGroup(
        supabaseUrl,
        serviceRoleKey,
        String(matched.id),
        nextPatch
      );
      await clearDuplicateBindings(String(matched.id));
      return {
        group: patchedExisting || matched,
        activatedNow: false,
      };
    }

    const claimedActivation = await patchCounterpartyBotGroup(
      supabaseUrl,
      serviceRoleKey,
      String(matched.id),
      nextPatch,
      { onlyIfBotChatIdNull: true }
    );
    if (claimedActivation?.id) {
      await clearDuplicateBindings(String(claimedActivation.id));
      return {
        group: claimedActivation,
        activatedNow: true,
      };
    }

    const latest = await loadCounterpartyBotGroupById(supabaseUrl, serviceRoleKey, String(matched.id));
    return {
      group: latest,
      activatedNow: false,
    };
  } catch (error) {
    console.warn('[bot-webhook] counterparty group sync skipped', error);
    return { group: null, activatedNow: false };
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { success: false, message: 'Method Not Allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { success: false, message: 'Missing Supabase environment variables' });
  }

  try {
    const url = new URL(req.url);
    const pathData = getPathChannelAndSecret(url.pathname);
    const channel = pick(url.searchParams.get('channel'), pathData.channel).toLowerCase() as BotChannel;
    const secret = pick(
      url.searchParams.get('secret'),
      pathData.secret,
      req.headers.get('x-kalam-webhook-secret'),
      req.headers.get('x-telegram-bot-api-secret-token')
    );

    if (!['telegram', 'bale', 'rubika'].includes(channel)) {
      return json(400, { success: false, message: 'channel ??????? ???.' });
    }
    if (!secret) {
      return json(401, { success: false, message: 'Webhook secret ?????? ???.' });
    }

    const payload = await readJsonBody(req);
    const integration = await findIntegrationBySecret(supabaseUrl, serviceRoleKey, channel, secret);
    const contact = extractContact(payload);
    const orgId = String(integration?.org_id || '').trim();
    const senderChatId = String(contact?.senderId || contact?.chatId || '').trim();

    if (!contact.chatId) {
      return json(200, {
        success: true,
        ignored: true,
        message: 'No chat id found in update',
      });
    }

    const rowPayload: Record<string, any> = {
      org_id: integration.org_id || null,
      channel_type: channel,
      chat_id: contact.chatId,
      source_provider: String(integration.provider || `${channel}_bot`),
      last_seen_at: new Date().toISOString(),
      last_payload: payload,
    };

    if (contact.username) rowPayload.username = contact.username;
    if (contact.displayName) rowPayload.display_name = contact.displayName;
    if (contact.phoneNumber) rowPayload.phone_number = contact.phoneNumber;
    if (contact.text) rowPayload.last_message_text = contact.text;

    const saved = await upsertInboundContact(supabaseUrl, serviceRoleKey, rowPayload);
    let senderSaved = saved;
    if (senderChatId && senderChatId !== String(contact.chatId || '').trim()) {
      const senderPayload = {
        ...rowPayload,
        chat_id: senderChatId,
        display_name: String(contact.displayName || '').trim() || null,
        username: String(contact.username || '').trim() || null,
        phone_number: String(contact.phoneNumber || '').trim() || null,
      };
      senderSaved = await upsertInboundContact(supabaseUrl, serviceRoleKey, senderPayload);
    }
    const senderBinding = senderChatId
      ? await loadBotIdentityBindingByChatId(supabaseUrl, serviceRoleKey, orgId, channel, senderChatId)
      : null;
    const syncResult = await syncCounterpartyBotGroupByInbound({
      supabaseUrl,
      serviceRoleKey,
      orgId,
      channel,
      contact,
    });
    const matchedGroup = syncResult?.group || null;
    const matchedGroupChatId = String(matchedGroup?.bot_chat_id || '').trim();
    const shouldBlockDirectThreadUpsert = Boolean(
      contact?.isGroup
      || !senderChatId
      || (matchedGroupChatId && senderChatId === matchedGroupChatId)
      || (matchedGroup?.id && String(contact?.chatId || '').trim() && senderChatId === String(contact.chatId || '').trim())
    );
    const directThread = !shouldBlockDirectThreadUpsert && senderChatId
      ? await upsertCounterpartyBotDirectThread(supabaseUrl, serviceRoleKey, {
          org_id: integration.org_id || null,
          channel_type: channel,
          chat_id: senderChatId,
          binding_id: senderBinding?.id || null,
          target_module_id: senderBinding?.target_module_id || null,
          target_record_id: senderBinding?.target_record_id || null,
          customer_id: String(senderBinding?.target_module_id || '').trim() === 'customers' ? String(senderBinding?.target_record_id || '').trim() || null : null,
          supplier_id: String(senderBinding?.target_module_id || '').trim() === 'suppliers' ? String(senderBinding?.target_record_id || '').trim() || null : null,
          employee_id: String(senderBinding?.target_module_id || '').trim() === 'employees' ? String(senderBinding?.target_record_id || '').trim() || null : null,
          profile_id: senderBinding?.profile_id || null,
          display_name: String(senderBinding?.display_name || contact.displayName || '').trim() || null,
          username: String(contact.username || senderBinding?.username || '').trim() || null,
          phone_number: String(contact.phoneNumber || senderBinding?.phone_number || '').trim() || null,
          last_seen_at: new Date().toISOString(),
          last_inbound_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          last_message_preview: String(contact.text || '').trim() || null,
        })
      : null;
    if (directThread?.id && !contact?.isGroup) {
      try {
        const existingMetadata = directThread?.metadata && typeof directThread.metadata === 'object'
          ? directThread.metadata
          : {};
        await patchCounterpartyBotDirectThread(supabaseUrl, serviceRoleKey, String(directThread.id), {
          metadata: {
            ...existingMetadata,
            direct_chat_verified: true,
            direct_chat_verified_at: new Date().toISOString(),
            direct_chat_verified_channel: channel,
          },
        });
      } catch (error) {
        console.warn('[bot-webhook] could not persist direct chat verification metadata', error);
      }
    }

    const shouldSendConnectionAck = Boolean(
      syncResult?.activatedNow === true
      &&
      matchedGroup?.id
      && String(matchedGroup?.status || '').trim() === 'active'
      && matchedGroup?.metadata?.activation_confirmation_sent !== true
    );
    if (shouldSendConnectionAck) {
      try {
        const label = await loadCounterpartyLabel(supabaseUrl, serviceRoleKey, matchedGroup);
        await sendBotConnectionConfirmation({
          channel,
          settings: (integration?.settings || {}) as IntegrationSettings,
          chatId: String(contact?.chatId || '').trim(),
          counterpartyLabel: label || (
            matchedGroup?.customer_id ? 'مشتری' : matchedGroup?.supplier_id ? 'تامین کننده' : matchedGroup?.employee_id ? 'کارمند' : 'طرف‌حساب'
          ),
        });
        await patchCounterpartyBotGroup(supabaseUrl, serviceRoleKey, String(matchedGroup.id), {
          metadata: {
            ...(matchedGroup?.metadata && typeof matchedGroup.metadata === 'object' ? matchedGroup.metadata : {}),
            activation_confirmation_sent: true,
            activation_confirmation_sent_at: new Date().toISOString(),
            activation_confirmation_chat_id: String(contact?.chatId || '').trim() || null,
          },
        });
      } catch (error) {
        console.warn('[bot-webhook] could not send connection confirmation', error);
      }
    }

    try {
      const isDirectConversation = !contact?.isGroup && Boolean(directThread?.id);
      const mediaEnvelope = extractMediaEnvelope(payload);
      const messageIdentity = extractMessageIdentity(payload);
      const messageLifecycle = extractMessageLifecycle(payload);
      const providerMessageIds = dedupeTextList([
        messageIdentity.providerMessageId,
        ...mediaEnvelope.providerMessageIds,
      ]);
      const replyTarget = messageIdentity.replyProviderMessageId
        ? (
          isDirectConversation
            ? await loadCounterpartyBotDirectMessageByProviderId(supabaseUrl, serviceRoleKey, {
                orgId: integration.org_id || null,
                directThreadId: directThread?.id || null,
                channel,
                chatId: senderChatId || null,
                providerMessageId: messageIdentity.replyProviderMessageId,
              })
            : await loadCounterpartyBotMessageByProviderId(supabaseUrl, serviceRoleKey, {
                orgId: integration.org_id || null,
                botGroupId: matchedGroup?.id || null,
                channel,
                chatId: String(contact.chatId || '').trim() || null,
                providerMessageId: messageIdentity.replyProviderMessageId,
              })
        )
        : null;
      const existingMessage = providerMessageIds[0]
        ? (
          isDirectConversation
            ? await loadCounterpartyBotDirectMessageByProviderId(supabaseUrl, serviceRoleKey, {
                orgId: integration.org_id || null,
                directThreadId: directThread?.id || null,
                channel,
                chatId: senderChatId || null,
                providerMessageId: providerMessageIds[0],
              })
            : await loadCounterpartyBotMessageByProviderId(supabaseUrl, serviceRoleKey, {
                orgId: integration.org_id || null,
                botGroupId: matchedGroup?.id || null,
                channel,
                chatId: String(contact.chatId || '').trim() || null,
                providerMessageId: providerMessageIds[0],
              })
        )
        : null;
      if (messageLifecycle.deleted) {
        const now = new Date().toISOString();
        const targetMessage = existingMessage || null;
        const existingPayload = targetMessage?.payload && typeof targetMessage.payload === 'object' ? targetMessage.payload : {};
        const deletionPayload = {
          message_type: 'deleted',
          content_text: 'پیام حذف شده',
          file_url: null,
          file_name: null,
          mime_type: null,
          payload: {
            ...existingPayload,
            ...(payload && typeof payload === 'object' ? payload : {}),
            message_status: 'deleted',
            message_deleted: true,
            deleted_at: now,
            provider_message_id: messageIdentity.providerMessageId || String((existingPayload as any)?.provider_message_id || '').trim() || null,
            provider_message_ids: dedupeTextList([
              ...(Array.isArray((existingPayload as any)?.provider_message_ids) ? (existingPayload as any).provider_message_ids : []),
              ...providerMessageIds,
            ]),
            reply_provider_message_id: String((existingPayload as any)?.reply_provider_message_id || messageIdentity.replyProviderMessageId || '').trim() || null,
            reply_to_message_id: String((existingPayload as any)?.reply_to_message_id || '').trim() || null,
          },
        };
        if (targetMessage?.id) {
          if (isDirectConversation) {
            await patchCounterpartyBotDirectMessage(supabaseUrl, serviceRoleKey, String(targetMessage.id), deletionPayload);
          } else {
            await patchCounterpartyBotMessage(supabaseUrl, serviceRoleKey, String(targetMessage.id), deletionPayload);
          }
        } else {
          const tombstoneBase = {
            org_id: integration.org_id || null,
            channel_type: channel,
            direction: 'inbound',
            chat_id: isDirectConversation ? senderChatId || null : String(contact.chatId || '').trim() || null,
            provider_message_id: messageIdentity.providerMessageId || null,
            ...deletionPayload,
          };
          if (isDirectConversation) {
            await insertCounterpartyBotDirectMessage(supabaseUrl, serviceRoleKey, {
              ...tombstoneBase,
              direct_thread_id: directThread?.id || null,
              target_module_id: senderBinding?.target_module_id || null,
              target_record_id: senderBinding?.target_record_id || null,
              customer_id: String(senderBinding?.target_module_id || '').trim() === 'customers' ? String(senderBinding?.target_record_id || '').trim() || null : null,
              supplier_id: String(senderBinding?.target_module_id || '').trim() === 'suppliers' ? String(senderBinding?.target_record_id || '').trim() || null : null,
              employee_id: String(senderBinding?.target_module_id || '').trim() === 'employees' ? String(senderBinding?.target_record_id || '').trim() || null : null,
              profile_id: senderBinding?.profile_id || null,
            });
          } else {
            await insertCounterpartyBotMessage(supabaseUrl, serviceRoleKey, {
              ...tombstoneBase,
              bot_group_id: matchedGroup?.id || null,
              customer_id: matchedGroup?.customer_id || null,
              supplier_id: matchedGroup?.supplier_id || null,
              employee_id: matchedGroup?.employee_id || null,
            });
          }
        }
        if (isDirectConversation && directThread?.id) {
          await patchCounterpartyBotDirectThread(supabaseUrl, serviceRoleKey, String(directThread.id), {
            last_seen_at: now,
            last_inbound_at: now,
            last_message_at: now,
            last_message_preview: 'پیام حذف شده',
          });
        }
        return json(200, {
          success: true,
          channel,
          chat_id: contact.chatId,
          is_group: contact?.isGroup === true,
          chat_title: String(contact?.chatTitle || '').trim() || null,
          contact: saved,
          sender_contact: senderSaved,
          matched_group_id: matchedGroup?.id || null,
          direct_thread_id: directThread?.id || null,
          message_status: 'deleted',
        });
      }
      const mediaGroupTarget = mediaEnvelope.mediaGroupId
        ? (
          isDirectConversation
            ? await loadCounterpartyBotDirectMessageByMediaGroupId(supabaseUrl, serviceRoleKey, {
                orgId: integration.org_id || null,
                directThreadId: directThread?.id || null,
                channel,
                chatId: senderChatId || null,
                mediaGroupId: mediaEnvelope.mediaGroupId,
              })
            : await loadCounterpartyBotMessageByMediaGroupId(supabaseUrl, serviceRoleKey, {
                orgId: integration.org_id || null,
                botGroupId: matchedGroup?.id || null,
                channel,
                chatId: String(contact.chatId || '').trim() || null,
                mediaGroupId: mediaEnvelope.mediaGroupId,
              })
        )
        : null;
      const normalizedOrgId = String(integration?.org_id || '').trim() || 'unknown_org';
      const mediaItems = mediaEnvelope.items.length > 0
        ? mediaEnvelope.items
        : dedupeExtractedMediaItems([normalizeExtractedMedia(extractMediaInfo(payload))]);
      const resolvedMediaEntries: Array<{
        mediaInfo: ExtractedInboundMediaItem;
        mediaStored: Record<string, any> | null;
        finalMediaUrl: string;
      }> = [];

      for (const mediaInfo of mediaItems) {
        const mediaStored = await resolveAndStoreInboundMedia({
          supabaseUrl,
          serviceRoleKey,
          requestUrl: req.url,
          requestHeaders: req.headers,
          channel,
          orgId: normalizedOrgId,
          integrationSettings: (integration?.settings || {}) as IntegrationSettings,
          mediaInfo,
        });
        const fallbackSourceUrl = String(mediaInfo.fileUrl || '').trim();
        const finalMediaUrl = String(
          mediaStored?.fileUrl
          || (isProviderHostedTemporaryUrl(channel, fallbackSourceUrl) ? '' : fallbackSourceUrl)
          || ''
        ).trim();
        resolvedMediaEntries.push({
          mediaInfo,
          mediaStored,
          finalMediaUrl,
        });
      }

      const attachmentEntries = resolvedMediaEntries
        .map(({ mediaInfo, mediaStored, finalMediaUrl }) => {
          const finalName = String(mediaStored?.fileName || mediaInfo.fileName || 'فایل').trim() || 'فایل';
          const finalMimeType = String(mediaStored?.mimeType || mediaInfo.mimeType || '').trim() || null;
          return normalizeBotPayloadAttachment({
            name: finalName,
            url: finalMediaUrl,
            mime_type: finalMimeType,
            file_type: inferInboundMediaMessageType({
              rawType: mediaInfo.messageType,
              mimeType: finalMimeType,
              fileName: finalName,
              fallback: 'file',
            }),
            media_file_id: mediaInfo.fileId,
            provider_message_id: providerMessageIds[0] || null,
            media_group_id: mediaEnvelope.mediaGroupId || null,
            media_import_status: mediaStored?.mediaImportStatus || (mediaStored?.stored ? 'succeeded' : null),
            media_import_error_code: mediaStored?.mediaImportErrorCode || null,
            media_import_error_message: mediaStored?.mediaImportErrorMessage || null,
            media_import_retryable: typeof mediaStored?.mediaImportRetryable === 'boolean' ? mediaStored.mediaImportRetryable : null,
            media_storage_path: mediaStored?.storagePath || null,
          });
        })
        .filter(Boolean);

      const primaryStoredEntry = resolvedMediaEntries.find((entry) => Boolean(entry?.mediaStored?.stored)) || null;
      const primaryFailedEntry = resolvedMediaEntries.find((entry) => entry?.mediaStored?.mediaImportStatus === 'failed') || null;
      const primaryMediaStateEntry = primaryStoredEntry || primaryFailedEntry || resolvedMediaEntries[0] || null;
      const primaryAttachment = attachmentEntries[0] || null;
      const inboundMessageType = resolveCompositeMediaMessageType(attachmentEntries.map((item: any) => normalizeExtractedMedia({
        messageType: String(item?.file_type || mediaEnvelope.messageType || 'text').trim() || 'text',
        fileUrl: String(item?.url || '').trim() || null,
        fileName: String(item?.name || '').trim() || null,
        mimeType: String(item?.mime_type || '').trim() || null,
        fileId: String(item?.media_file_id || '').trim() || null,
      })), mediaEnvelope.messageType);
      const mediaPreviewLabel = getInboundMediaPreviewLabel(inboundMessageType, primaryAttachment?.name || resolvedMediaEntries[0]?.mediaInfo?.fileName || null);
      const mergeTarget = mediaGroupTarget || existingMessage || null;
      const rawPayload = payload && typeof payload === 'object' ? payload : {};
      const baseContentText = String(contact.text || '').trim() || null;
      const senderPayload = {
        ...rawPayload,
        media_pipeline_build: BOT_WEBHOOK_BUILD,
        message_status: messageLifecycle.edited ? 'edited' : String((rawPayload as any)?.message_status || '').trim() || null,
        message_edited: messageLifecycle.edited || Boolean((rawPayload as any)?.message_edited),
        edited_at: messageLifecycle.edited ? new Date().toISOString() : ((rawPayload as any)?.edited_at || null),
        sender_id: String(contact.senderId || '').trim() || null,
        sender_display_name: String(contact.displayName || '').trim() || null,
        username: String(contact.username || '').trim() || null,
        phone_number: String(contact.phoneNumber || '').trim() || null,
        sender_target_module_id: senderBinding?.target_module_id || null,
        sender_target_record_id: senderBinding?.target_record_id || null,
      };

      if (mergeTarget) {
        const existingPayload = mergeTarget?.payload && typeof mergeTarget.payload === 'object' ? mergeTarget.payload : {};
        const mergedAttachments = mergeBotPayloadAttachments(
          Array.isArray((existingPayload as any)?.attachments) ? (existingPayload as any).attachments : [],
          attachmentEntries,
        );
        const mergedProviderMessageIds = dedupeTextList([
          ...(Array.isArray((existingPayload as any)?.provider_message_ids) ? (existingPayload as any).provider_message_ids : []),
          ...providerMessageIds,
        ]);
        const mergedAttachmentItems = dedupeExtractedMediaItems(
          mergedAttachments.map((item: any) => normalizeExtractedMedia({
            messageType: String(item?.file_type || 'file').trim() || 'file',
            fileUrl: String(item?.url || '').trim() || null,
            fileName: String(item?.name || '').trim() || null,
            mimeType: String(item?.mime_type || '').trim() || null,
            fileId: String(item?.media_file_id || '').trim() || null,
          }))
        );
        const mergedPrimaryAttachment = mergedAttachments[0] || primaryAttachment || null;
        const mergePayload = {
          message_type: resolveCompositeMediaMessageType(
            mergedAttachmentItems,
            String(mergeTarget?.message_type || mediaEnvelope.messageType || 'text').trim() || 'text',
          ),
          content_text: String(mergeTarget?.content_text || '').trim() || baseContentText || null,
          file_url: String(mergedPrimaryAttachment?.url || mergeTarget?.file_url || '').trim() || null,
          file_name: String(mergedPrimaryAttachment?.name || mergeTarget?.file_name || '').trim() || null,
          mime_type: String(mergedPrimaryAttachment?.mime_type || mergeTarget?.mime_type || '').trim() || null,
          payload: {
            ...existingPayload,
            ...senderPayload,
            media_group_id: mediaEnvelope.mediaGroupId || String((existingPayload as any)?.media_group_id || '').trim() || null,
            media_file_id: String(primaryAttachment?.media_file_id || (existingPayload as any)?.media_file_id || '').trim() || null,
            media_stored: Boolean((existingPayload as any)?.media_stored) || Boolean(primaryStoredEntry?.mediaStored?.stored),
            media_storage_bucket: primaryStoredEntry?.mediaStored?.storageBucket || (existingPayload as any)?.media_storage_bucket || null,
            media_storage_path: primaryStoredEntry?.mediaStored?.storagePath || (existingPayload as any)?.media_storage_path || null,
            media_import_status: primaryMediaStateEntry?.mediaStored?.mediaImportStatus || (primaryStoredEntry ? 'succeeded' : ((existingPayload as any)?.media_import_status || null)),
            media_import_error_code: primaryMediaStateEntry?.mediaStored?.mediaImportErrorCode || null,
            media_import_error_message: primaryMediaStateEntry?.mediaStored?.mediaImportErrorMessage || null,
            media_import_retryable: typeof primaryMediaStateEntry?.mediaStored?.mediaImportRetryable === 'boolean'
              ? primaryMediaStateEntry.mediaStored.mediaImportRetryable
              : null,
            media_download_diagnostic: primaryMediaStateEntry?.mediaStored?.mediaDownloadDiagnostic || null,
            attachments: mergedAttachments,
            provider_message_id: String((existingPayload as any)?.provider_message_id || messageIdentity.providerMessageId || '').trim() || null,
            provider_message_ids: mergedProviderMessageIds,
            reply_provider_message_id: String((existingPayload as any)?.reply_provider_message_id || messageIdentity.replyProviderMessageId || '').trim() || null,
            reply_to_message_id: String((existingPayload as any)?.reply_to_message_id || replyTarget?.id || '').trim() || null,
          },
        };
        if (isDirectConversation) {
          await patchCounterpartyBotDirectMessage(supabaseUrl, serviceRoleKey, String(mergeTarget.id || ''), mergePayload);
        } else {
          await patchCounterpartyBotMessage(supabaseUrl, serviceRoleKey, String(mergeTarget.id || ''), mergePayload);
        }
      } else {
        const insertPayloadBase = {
          org_id: integration.org_id || null,
          channel_type: channel,
          direction: 'inbound',
          message_type: inboundMessageType,
          chat_id: isDirectConversation ? senderChatId || null : String(contact.chatId || '').trim() || null,
          provider_message_id: messageIdentity.providerMessageId || null,
          content_text: baseContentText,
          file_url: String(primaryAttachment?.url || '').trim() || null,
          file_name: primaryAttachment?.name || (resolvedMediaEntries[0]?.mediaStored?.fileName || resolvedMediaEntries[0]?.mediaInfo?.fileName || null),
          mime_type: primaryAttachment?.mime_type || (resolvedMediaEntries[0]?.mediaStored?.mimeType || resolvedMediaEntries[0]?.mediaInfo?.mimeType || null),
          payload: {
            ...senderPayload,
            media_group_id: mediaEnvelope.mediaGroupId || null,
            media_file_id: String(primaryAttachment?.media_file_id || '').trim() || null,
            media_stored: Boolean(primaryStoredEntry?.mediaStored?.stored),
            media_storage_bucket: primaryStoredEntry?.mediaStored?.storageBucket || null,
            media_storage_path: primaryStoredEntry?.mediaStored?.storagePath || null,
            media_import_status: primaryMediaStateEntry?.mediaStored?.mediaImportStatus || (primaryStoredEntry ? 'succeeded' : null),
            media_import_error_code: primaryMediaStateEntry?.mediaStored?.mediaImportErrorCode || null,
            media_import_error_message: primaryMediaStateEntry?.mediaStored?.mediaImportErrorMessage || null,
            media_import_retryable: typeof primaryMediaStateEntry?.mediaStored?.mediaImportRetryable === 'boolean'
              ? primaryMediaStateEntry.mediaStored.mediaImportRetryable
              : null,
            media_download_diagnostic: primaryMediaStateEntry?.mediaStored?.mediaDownloadDiagnostic || null,
            attachments: attachmentEntries,
            provider_message_id: messageIdentity.providerMessageId || null,
            provider_message_ids: providerMessageIds,
            reply_provider_message_id: messageIdentity.replyProviderMessageId || null,
            reply_to_message_id: replyTarget?.id || null,
          },
        };
        if (isDirectConversation) {
          await insertCounterpartyBotDirectMessage(supabaseUrl, serviceRoleKey, {
            ...insertPayloadBase,
            direct_thread_id: directThread?.id || null,
            target_module_id: senderBinding?.target_module_id || null,
            target_record_id: senderBinding?.target_record_id || null,
            customer_id: String(senderBinding?.target_module_id || '').trim() === 'customers' ? String(senderBinding?.target_record_id || '').trim() || null : null,
            supplier_id: String(senderBinding?.target_module_id || '').trim() === 'suppliers' ? String(senderBinding?.target_record_id || '').trim() || null : null,
            employee_id: String(senderBinding?.target_module_id || '').trim() === 'employees' ? String(senderBinding?.target_record_id || '').trim() || null : null,
            profile_id: senderBinding?.profile_id || null,
          });
        } else {
          await insertCounterpartyBotMessage(supabaseUrl, serviceRoleKey, {
            ...insertPayloadBase,
            bot_group_id: matchedGroup?.id || null,
            customer_id: matchedGroup?.customer_id || null,
            supplier_id: matchedGroup?.supplier_id || null,
            employee_id: matchedGroup?.employee_id || null,
          });
        }
      }

      if (isDirectConversation && directThread?.id) {
        await patchCounterpartyBotDirectThread(supabaseUrl, serviceRoleKey, String(directThread.id), {
          binding_id: senderBinding?.id || null,
          target_module_id: senderBinding?.target_module_id || null,
          target_record_id: senderBinding?.target_record_id || null,
          customer_id: String(senderBinding?.target_module_id || '').trim() === 'customers' ? String(senderBinding?.target_record_id || '').trim() || null : null,
          supplier_id: String(senderBinding?.target_module_id || '').trim() === 'suppliers' ? String(senderBinding?.target_record_id || '').trim() || null : null,
          employee_id: String(senderBinding?.target_module_id || '').trim() === 'employees' ? String(senderBinding?.target_record_id || '').trim() || null : null,
          profile_id: senderBinding?.profile_id || null,
          display_name: String(senderBinding?.display_name || contact.displayName || '').trim() || null,
          username: String(contact.username || senderBinding?.username || '').trim() || null,
          phone_number: String(contact.phoneNumber || senderBinding?.phone_number || '').trim() || null,
          last_seen_at: new Date().toISOString(),
          last_inbound_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          last_message_preview: baseContentText || mediaPreviewLabel || null,
        });
      }
      if (!isDirectConversation && matchedGroup?.id) {
        await maybeSendBotAiAutoReply({
          supabaseUrl,
          serviceRoleKey,
          integration,
          channel,
          contact,
          matchedGroup,
          inboundText: baseContentText,
        }).catch((error) => {
          console.warn('[bot-webhook] AI auto reply skipped:', String(error?.message || error));
        });
      }
    } catch (error) {
      console.warn('[bot-webhook] could not write counterparty bot message', error);
    }

    return json(200, {
      success: true,
      channel,
      chat_id: contact.chatId,
      is_group: contact?.isGroup === true,
      chat_title: String(contact?.chatTitle || '').trim() || null,
      contact: saved,
      sender_contact: senderSaved,
      matched_group_id: matchedGroup?.id || null,
      direct_thread_id: directThread?.id || null,
    });
  } catch (error: any) {
    console.error('[bot-webhook] error', String(error?.message || error));
    return json(400, {
      success: false,
      message: String(error?.message || '??? ?? ?????? webhook ???'),
    });
  }
});
