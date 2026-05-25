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

const BOT_WEBHOOK_BUILD = 'bot-webhook-2026-05-26-01';

const DEFAULT_API_BASE_URL: Record<BotChannel, string> = {
  telegram: 'https://api.telegram.org',
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
  ...(channel === 'rubika' ? { api_base_url: RUBIKA_OFFICIAL_API_BASE_URL } : {}),
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

  const displayName = pick(
    getDisplayName(from),
    getDisplayName(contact),
    getDisplayName(message?.chat),
    getDisplayName(payload)
  );

  const text = pick(
    message?.text,
    message?.body,
    callbackQuery?.data,
    rubikaRootMessage?.text,
    rubikaNewMessage?.text,
    rubikaInlineMessage?.text,
    payload?.text,
    payload?.body?.text,
    payload?.data?.text,
    payload?.caption
  );

  const senderId = pick(
    from?.id,
    from?.user_id,
    from?.userId,
    from?.object_guid,
    from?.objectGuid,
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
    displayName,
    chatTitle,
    chatType: normalizedChatType || null,
    isGroup,
    text,
  };
};

const extractMediaInfo = (payload: Record<string, any>) => {
  const rubikaUpdate = payload?.update || null;
  const rubikaRootMessage = payload?.new_message || null;
  const rubikaNewMessage = rubikaUpdate?.new_message || null;
  const rubikaUpdatedMessage = rubikaUpdate?.updated_message || null;
  const rubikaInlineMessage = payload?.inline_message || null;
  const message =
    payload?.message ||
    payload?.body?.message ||
    payload?.data?.message ||
    payload?.event?.message ||
    payload?.update?.message ||
    rubikaNewMessage ||
    rubikaUpdatedMessage ||
    rubikaRootMessage ||
    rubikaInlineMessage ||
    null;

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
    rubikaUpdate?.updated_message?.file?.url,
    rubikaUpdate?.updated_message?.media?.url,
    rubikaUpdate?.updated_message?.media_url,
    rubikaNewMessage?.file?.url,
    rubikaNewMessage?.file_url,
    rubikaNewMessage?.media?.url,
    rubikaNewMessage?.media_url,
    rubikaUpdatedMessage?.file?.url,
    rubikaUpdatedMessage?.file_url,
    rubikaUpdatedMessage?.media?.url,
    rubikaUpdatedMessage?.media_url,
    rubikaInlineMessage?.file?.url,
    rubikaInlineMessage?.media?.url,
    payload?.file_url,
    payload?.fileUrl,
    payload?.media_url,
    payload?.mediaUrl,
    payload?.document?.url,
    payload?.video?.url,
    payload?.photo?.url,
    payload?.audio?.url,
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
    rubikaNewMessage?.file_id,
    rubikaNewMessage?.file?.file_id,
    rubikaNewMessage?.file?.fileId,
    rubikaUpdatedMessage?.file_id,
    rubikaUpdatedMessage?.file?.file_id,
    rubikaUpdatedMessage?.file?.fileId,
    rubikaRootMessage?.file_id,
    rubikaRootMessage?.file?.file_id,
    rubikaRootMessage?.file?.fileId,
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
    rubikaNewMessage?.file?.file_name,
    rubikaNewMessage?.file_name,
    rubikaRootMessage?.file?.file_name,
    rubikaRootMessage?.file_name,
    payload?.document?.file_name,
    payload?.video?.file_name,
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
    message?.file_type,
    message?.file?.type,
    message?.file?.file_type,
    message?.media?.type,
    rubikaNewMessage?.file_type,
    rubikaNewMessage?.file?.type,
    rubikaUpdatedMessage?.file_type,
    rubikaUpdatedMessage?.file?.type,
    rubikaRootMessage?.file_type,
    rubikaRootMessage?.file?.type,
    payload?.file_type,
    payload?.file?.type,
  );
  const mimeType = pick(
    message?.mime_type,
    message?.file?.mime_type,
    message?.file?.mimeType,
    message?.mimeType,
    message?.document?.mime_type,
    message?.document?.mimeType,
    message?.video?.mime_type,
    message?.file?.mime_type,
    message?.media?.mime_type,
    rubikaNewMessage?.file?.mime_type,
    rubikaRootMessage?.file?.mime_type,
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
  const hasVoice = Boolean(message?.voice || payload?.voice);
  const fileTypeLower = String(rawFileType || '').trim().toLowerCase();
  const mimeLower = String(mimeType || '').toLowerCase();
  const nameLower = String(fileName || '').toLowerCase();
  const looksLikeImage = fileTypeLower === 'image'
    || fileTypeLower === 'gif'
    || mimeLower.startsWith('image/')
    || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(nameLower)
    || payloadText.includes('"photo"');
  const looksLikeVideo = fileTypeLower === 'video'
    || mimeLower.startsWith('video/')
    || /\.(mp4|mkv|mov|avi|webm|3gp)$/i.test(nameLower)
    || payloadText.includes('"video"');
  const looksLikeVoice = fileTypeLower === 'voice'
    || mimeLower === 'audio/mpeg'
    || mimeLower === 'audio/mp3'
    || /\.mp3$/i.test(nameLower)
    || payloadText.includes('"voice"');
  const looksLikeAudio = fileTypeLower === 'music'
    || fileTypeLower === 'audio'
    || mimeLower.startsWith('audio/')
    || /\.(wav|ogg|oga|aac|m4a|flac|opus|weba|webm)$/i.test(nameLower)
    || payloadText.includes('"audio"');
  const messageType =
    (hasPhoto || looksLikeImage) ? 'image'
      : (hasVoice || looksLikeVoice) ? 'voice'
        : (hasAudio || looksLikeAudio) ? 'audio'
      : (hasVideo || looksLikeVideo) ? 'file'
        : (hasDocument || hasAudio) ? 'file'
          : 'text';
  return {
    messageType,
    fileUrl: directUrl || findDeepUrl(message) || findDeepUrl(payload) || null,
    fileName: fileName || null,
    mimeType: mimeType || null,
    fileId: fileId || findDeepFileId(message) || findDeepFileId(payload) || null,
  };
};

const extractMessageIdentity = (payload: Record<string, any>) => {
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

const DEFAULT_FILE_STORAGE_BUCKET = String(
  Deno.env.get('FILE_STORAGE_BUCKET')
  || Deno.env.get('VITE_FILE_STORAGE_BUCKET')
  || 'images'
).trim() || 'images';

const safeFileName = (value: string, fallback = 'file') => {
  const raw = String(value || '').trim();
  const normalized = raw
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
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

const shouldTreatAsBinaryFile = (fileName?: string | null, messageType?: string | null) => {
  const ext = String(fileName || '').trim().toLowerCase().split('.').pop() || '';
  if (messageType === 'image') return true;
  return [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
    'mp4', 'mkv', 'mov', 'avi', 'webm', '3gp',
    'mp3', 'wav', 'ogg', 'aac', 'flac',
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

      if (options?.messageType === 'image' && !lowerType.startsWith('image/') && !looksLikeImageBytes(bytes)) {
        continue;
      }

      return { bytes, contentType };
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
  const baseUrl = normalizeBaseUrl(String(settings?.api_base_url || DEFAULT_API_BASE_URL[channel]).trim());
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
    return { fileUrl: downloadUrl };
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
        const url = findDeepDownloadUrl(parsed);
        if (url) {
          return { fileUrl: url, bytes: null as Uint8Array | null, contentType: null as string | null };
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
  if (mediaInfo.messageType === 'text') {
    return {
      fileUrl: null as string | null,
      fileName: mediaInfo.fileName,
      mimeType: mediaInfo.mimeType,
      stored: false,
    };
  }

  let resolvedUrl = String(mediaInfo.fileUrl || '').trim() || null;
  let resolvedMime = String(mediaInfo.mimeType || '').trim() || null;
  let bytes: Uint8Array | null = null;

  const normalizedFileId = String(mediaInfo.fileId || '').trim();
  const shouldPreferRubikaFileApi = channel === 'rubika' && normalizedFileId.length > 0;
  const shouldUseTelegramLikeFileApi = (channel === 'bale' || channel === 'telegram') && normalizedFileId.length > 0;

  if (shouldUseTelegramLikeFileApi) {
    const byFileId = await tryTelegramLikeGetFile({
      channel: channel as 'bale' | 'telegram',
      settings: integrationSettings,
      fileId: normalizedFileId,
    });
    if (byFileId?.fileUrl) resolvedUrl = byFileId.fileUrl;
  }

  if (shouldPreferRubikaFileApi) {
    const byFileId = await tryRubikaGetFile({
      settings: integrationSettings,
      fileId: normalizedFileId,
    });
    if (byFileId) {
      if (byFileId.fileUrl) resolvedUrl = String(byFileId.fileUrl || '').trim() || resolvedUrl;
      if (byFileId.bytes?.length) bytes = byFileId.bytes;
      if (byFileId.contentType) resolvedMime = String(byFileId.contentType || '').trim() || resolvedMime;
    }
  }

  if (!bytes && resolvedUrl) {
    const downloaded = await downloadBinaryFromUrl(resolvedUrl, {
      fileName: mediaInfo.fileName,
      messageType: mediaInfo.messageType,
    });
    if (downloaded?.bytes?.length) {
      bytes = downloaded.bytes;
      resolvedMime = String(downloaded.contentType || '').trim() || resolvedMime;
    }
  }

  // Rubika links can be short-lived or region-sensitive. Retry with fresh getFile URLs.
  if (!bytes && shouldPreferRubikaFileApi) {
    for (let retry = 0; retry < 2; retry += 1) {
      const refreshed = await tryRubikaGetFile({
        settings: integrationSettings,
        fileId: normalizedFileId,
      });
      const refreshedUrl = String(refreshed?.fileUrl || '').trim();
      if (!refreshedUrl) continue;
      resolvedUrl = refreshedUrl;
      const downloaded = await downloadBinaryFromUrl(refreshedUrl, {
        fileName: mediaInfo.fileName,
        messageType: mediaInfo.messageType,
      });
      if (downloaded?.bytes?.length) {
        bytes = downloaded.bytes;
        resolvedMime = String(downloaded.contentType || '').trim() || resolvedMime;
        break;
      }
    }
  }

  if (!bytes || !bytes.length) {
    const safeFallbackUrl = channel === 'rubika' && isRubikaHostedUrl(resolvedUrl)
      ? null
      : (resolvedUrl || null);
    return {
      fileUrl: safeFallbackUrl,
      fileName: mediaInfo.fileName,
      mimeType: resolvedMime || mediaInfo.mimeType || null,
      stored: false,
    };
  }

  const objectPath = buildStorageObjectPath({
    orgId,
    channel,
    fileName: mediaInfo.fileName || 'file',
    mimeType: resolvedMime || mediaInfo.mimeType || null,
  });
  const publicBaseUrl = pickPublicApiBaseUrl(requestUrl, requestHeaders, integrationSettings || {});
  if (!publicBaseUrl) {
    return {
      fileUrl: null as string | null,
      fileName: mediaInfo.fileName,
      mimeType: resolvedMime || mediaInfo.mimeType || null,
      stored: false,
    };
  }
  const publicUrl = await uploadBinaryToStorage({
    supabaseUrl,
    serviceRoleKey,
    publicBaseUrl,
    bucket: DEFAULT_FILE_STORAGE_BUCKET,
    objectPath,
    bytes,
    contentType: resolvedMime || mediaInfo.mimeType || 'application/octet-stream',
  });

  return {
    fileUrl: publicUrl,
    fileName: mediaInfo.fileName,
    mimeType: resolvedMime || mediaInfo.mimeType || null,
    stored: true,
    storagePath: objectPath,
    storageBucket: DEFAULT_FILE_STORAGE_BUCKET,
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
  url.searchParams.set('select', 'id,customer_id,supplier_id,status,group_join_link,group_title,bot_chat_id,metadata');
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
  const targetType = String(row?.customer_id ? 'customers' : row?.supplier_id ? 'suppliers' : '').trim();
  const targetId = String(row?.customer_id || row?.supplier_id || '').trim();
  if (!targetType || !targetId) return '';

  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${targetType}`);
  url.searchParams.set('id', `eq.${targetId}`);
  if (targetType === 'customers') {
    url.searchParams.set('select', 'full_name,business_name,legal_name,system_code');
  } else {
    url.searchParams.set('select', 'business_name,full_name,system_code');
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

  return pick(item?.full_name, item?.business_name, item?.legal_name, item?.system_code);
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
  url.searchParams.set('select', 'id,bot_group_id,chat_id,provider_message_id,created_at');
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
  return Array.isArray(parsed) ? parsed[0] || null : parsed || null;
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

    const matchedByChatId = rows.find((row: any) => String(row?.bot_chat_id || '').trim() === chatId);
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
    if (matchedChatId) {
      const patchedExisting = await patchCounterpartyBotGroup(
        supabaseUrl,
        serviceRoleKey,
        String(matched.id),
        nextPatch
      );
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
    const syncResult = await syncCounterpartyBotGroupByInbound({
      supabaseUrl,
      serviceRoleKey,
      orgId: String(integration?.org_id || ''),
      channel,
      contact,
    });
    const matchedGroup = syncResult?.group || null;

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
            matchedGroup?.customer_id ? 'مشتری' : matchedGroup?.supplier_id ? 'تامین کننده' : 'طرف‌حساب'
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
      const mediaInfo = extractMediaInfo(payload);
      const messageIdentity = extractMessageIdentity(payload);
      const replyTarget = messageIdentity.replyProviderMessageId
        ? await loadCounterpartyBotMessageByProviderId(supabaseUrl, serviceRoleKey, {
          orgId: integration.org_id || null,
          botGroupId: matchedGroup?.id || null,
          channel,
          chatId: String(contact.chatId || '').trim() || null,
          providerMessageId: messageIdentity.replyProviderMessageId,
        })
        : null;
      const normalizedOrgId = String(integration?.org_id || '').trim() || 'unknown_org';
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
        || (channel === 'rubika' && isRubikaHostedUrl(fallbackSourceUrl) ? '' : fallbackSourceUrl)
        || ''
      ).trim();
      const attachmentEntry = finalMediaUrl
        ? [{
          name: String(mediaStored?.fileName || mediaInfo.fileName || 'فایل').trim() || 'فایل',
          url: finalMediaUrl,
          mime_type: String(mediaStored?.mimeType || mediaInfo.mimeType || '').trim() || null,
          file_type: String(mediaInfo.messageType || 'file').trim() || 'file',
        }]
        : [];
      await insertCounterpartyBotMessage(supabaseUrl, serviceRoleKey, {
        org_id: integration.org_id || null,
        bot_group_id: matchedGroup?.id || null,
        customer_id: matchedGroup?.customer_id || null,
        supplier_id: matchedGroup?.supplier_id || null,
        channel_type: channel,
        direction: 'inbound',
        message_type: mediaInfo.messageType,
        chat_id: String(contact.chatId || '').trim() || null,
        provider_message_id: messageIdentity.providerMessageId || null,
        content_text: String(contact.text || '').trim() || null,
        file_url: finalMediaUrl || null,
        file_name: mediaStored?.fileName || mediaInfo.fileName,
        mime_type: mediaStored?.mimeType || mediaInfo.mimeType,
        payload: {
          ...(payload && typeof payload === 'object' ? payload : {}),
          media_pipeline_build: BOT_WEBHOOK_BUILD,
          sender_id: String(contact.senderId || '').trim() || null,
          sender_display_name: String(contact.displayName || '').trim() || null,
          username: String(contact.username || '').trim() || null,
          media_file_id: mediaInfo.fileId,
          media_stored: Boolean(mediaStored?.stored),
          media_storage_bucket: mediaStored?.storageBucket || null,
          media_storage_path: mediaStored?.storagePath || null,
          attachments: attachmentEntry,
          provider_message_id: messageIdentity.providerMessageId || null,
          reply_provider_message_id: messageIdentity.replyProviderMessageId || null,
          reply_to_message_id: replyTarget?.id || null,
        },
      });
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
      matched_group_id: matchedGroup?.id || null,
    });
  } catch (error: any) {
    console.error('[bot-webhook] error', String(error?.message || error));
    return json(400, {
      success: false,
      message: String(error?.message || '??? ?? ?????? webhook ???'),
    });
  }
});
