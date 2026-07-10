// @ts-nocheck

type BotChannel = 'telegram' | 'bale' | 'rubika';

type BotAdminBody = {
  action?: 'start_capture' | 'poll_updates' | 'send_test_message' | 'resolve_file' | 'import_bot_file' | 'import_rubika_file' | 'import_bale_file' | 'edit_message' | 'delete_message' | 'diagnose_rubika_runtime';
  channel?: BotChannel | string;
  connectionId?: string;
  cursor?: string | number | null;
  activationCode?: string;
  activation_code?: string;
  chatId?: string;
  text?: string;
  fallbackText?: string;
  fileId?: string;
  fileName?: string;
  messageId?: string;
  messageTable?: 'counterparty_bot_messages' | 'counterparty_bot_direct_messages';
  providerMessageId?: string;
  provider_message_id?: string;
  skipLog?: boolean;
  extraPayload?: Record<string, any>;
  attachments?: Array<{
    url?: string | null;
    name?: string | null;
    mimeType?: string | null;
    mime_type?: string | null;
    fileType?: string | null;
    file_type?: string | null;
  }>;
};

type InboundContact = {
  chatId: string;
  username: string;
  phoneNumber: string;
  displayName: string;
  text: string;
  senderId?: string;
  chatTitle?: string;
  chatType?: string | null;
  isGroup?: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BOT_ADMIN_BUILD = 'bot-admin-2026-06-22-02';

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
  new Response(JSON.stringify({ build: BOT_ADMIN_BUILD, ...payload }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Kalam-Function-Build': BOT_ADMIN_BUILD,
    },
  });

const pick = (...values: any[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const normalizeBaseUrl = (value: string, channel: BotChannel) => {
  const raw = String(DEFAULT_API_BASE_URL[channel] || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw.replace(/\/+$/, '')}`;
};

const normalizeGenericBaseUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw.replace(/\/+$/, '')}`;
};

const normalizeRubikaSettings = (settings: Record<string, any> | null | undefined) => ({
  ...(settings && typeof settings === 'object' ? settings : {}),
  api_base_url: RUBIKA_OFFICIAL_API_BASE_URL,
});

const pickWebhookPublicBase = (
  requestUrl: string,
  fallbackBase: string,
  headers?: Headers,
  settings?: Record<string, any>
) => {
  const forceHttpsIfPublic = (urlLike: string) => {
    const trimmed = String(urlLike || '').trim();
    if (!trimmed) return trimmed;
    try {
      const parsed = new URL(trimmed);
      const host = String(parsed.hostname || '').toLowerCase();
      const isLocal =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.local') ||
        host.endsWith('.internal');
      if (!isLocal && parsed.protocol === 'http:') {
        parsed.protocol = 'https:';
        return parsed.toString().replace(/\/+$/, '');
      }
      return trimmed.replace(/\/+$/, '');
    } catch {
      return trimmed.replace(/\/+$/, '');
    }
  };

  const explicitBase = pick(
    settings?.webhook_base_url,
    settings?.webhook_public_base_url,
    Deno.env.get('BOT_WEBHOOK_PUBLIC_BASE_URL'),
    Deno.env.get('PUBLIC_API_BASE_URL')
  );
  if (explicitBase) {
    return forceHttpsIfPublic(normalizeGenericBaseUrl(explicitBase));
  }

  const forwardedProto = pick(headers?.get('x-forwarded-proto'), headers?.get('x-forwarded-protocol'));
  const forwardedHostRaw = pick(headers?.get('x-forwarded-host'));
  const forwardedHost = String(forwardedHostRaw || '').split(',')[0]?.trim();
  if (forwardedProto && forwardedHost) {
    return forceHttpsIfPublic(`${forwardedProto}://${forwardedHost}`);
  }

  const hostRaw = pick(headers?.get('host'));
  const host = String(hostRaw || '').split(',')[0]?.trim();
  if (host) {
    const proto = forwardedProto || 'https';
    return forceHttpsIfPublic(`${proto}://${host}`);
  }

  const fallback = normalizeBaseUrl(fallbackBase, 'rubika');
  try {
    const requestOrigin = new URL(String(requestUrl || '')).origin.replace(/\/+$/, '');
    if (/^https?:\/\//i.test(requestOrigin) && !requestOrigin.includes('functions:9000')) {
      return forceHttpsIfPublic(requestOrigin);
    }
  } catch {
    // ignore invalid request url
  }
  return forceHttpsIfPublic(fallback);
};

const buildSendMessageUrl = (baseUrl: string, token: string, pathTemplate: string, channel: BotChannel) => {
  const normalizedBase = normalizeBaseUrl(baseUrl, channel);
  const normalizedPath = String(pathTemplate)
    .replace('{token}', encodeURIComponent(token))
    .replace(/^\/*/, '/');
  return `${normalizedBase}${normalizedPath}`;
};

const pickPublicApiBaseUrl = (
  requestUrl: string,
  headers?: Headers,
  settings?: Record<string, any>
) => {
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
    const normalized = normalizeGenericBaseUrl(String(candidate || '').trim());
    if (normalized && isPublicHost(normalized)) return normalized;
  }

  const forwardedProto = pick(headers?.get('x-forwarded-proto'), headers?.get('x-forwarded-protocol'));
  const forwardedHost = pick(headers?.get('x-forwarded-host')).split(',')[0]?.trim();
  if (forwardedProto && forwardedHost) {
    const normalized = `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, '');
    if (isPublicHost(normalized)) return normalized;
  }

  const host = pick(headers?.get('host')).split(',')[0]?.trim();
  if (host) {
    const normalized = `https://${host}`.replace(/\/+$/, '');
    if (isPublicHost(normalized)) return normalized;
  }

  try {
    const origin = new URL(String(requestUrl || '')).origin.replace(/\/+$/, '');
    if (origin && isPublicHost(origin)) return origin;
  } catch {
    // ignore invalid request url
  }

  return '';
};

const buildPublicObjectUrl = (publicBaseUrl: string, bucket: string, objectPath: string) =>
  `${publicBaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;

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
  return '';
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
    throw new Error(raw || 'آپلود فایل در فضای ذخیره‌سازی ناموفق بود.');
  }
  return buildPublicObjectUrl(publicBaseUrl, bucket, objectPath);
};

const downloadBinaryFromUrl = async (url: string, extraHeaders?: Record<string, string>) => {
  const target = String(url || '').trim();
  if (!target) return null;
  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        Accept: '*/*',
        'Cache-Control': 'no-cache',
        ...(extraHeaders || {}),
      },
    });
    if (!response.ok) {
      const rawError = await response.text().catch(() => '');
      let fallbackAttempt: any = null;
      if (isRubikaMediaHostUrl(target) && isTransientProviderStatus(response.status)) {
        const rawDownloaded = await rawHttpsGetRubikaBinary(target, extraHeaders).catch((error: any) => ({
          ok: false,
          status: null,
          contentType: null,
          finalUrl: target,
          bytes: null,
          errorMessage: String(error?.message || error || 'raw_https_download_failed'),
          transport: 'raw_https_http1',
        }));
        fallbackAttempt = rawDownloaded;
        if (rawDownloaded?.ok === true && rawDownloaded?.bytes?.length) {
          return rawDownloaded;
        }
      }
      return {
        ok: false,
        status: response.status,
        contentType: String(response.headers.get('content-type') || '').trim() || null,
        finalUrl: response.url || target,
        errorMessage: summarizeHttpText(rawError, `HTTP ${response.status}`),
        transport: 'fetch',
        fallbackTransport: fallbackAttempt?.transport || null,
        fallbackStatus: fallbackAttempt?.status ?? null,
        fallbackContentType: fallbackAttempt?.contentType || null,
        fallbackErrorMessage: fallbackAttempt?.errorMessage || null,
      };
    }
    const contentType = String(response.headers.get('content-type') || '').trim() || 'application/octet-stream';
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) {
      return {
        ok: false,
        status: response.status,
        contentType,
        finalUrl: response.url || target,
        errorMessage: 'empty_body',
      };
    }
    const lowerContentType = contentType.toLowerCase();
    const sample = new TextDecoder().decode(bytes.slice(0, 1024)).trim().toLowerCase();
    const looksHtml = sample.startsWith('<!doctype') || sample.startsWith('<html') || sample.includes('<html');
    const looksJsonError = sample.startsWith('{') && (
      sample.includes('"error"')
      || sample.includes('"code"')
      || sample.includes('invalid')
      || sample.includes('not found')
    );
    if (lowerContentType.includes('text/html') || looksHtml || looksJsonError) {
      let fallbackAttempt: any = null;
      if (isRubikaMediaHostUrl(target)) {
        const rawDownloaded = await rawHttpsGetRubikaBinary(target, extraHeaders).catch((error: any) => ({
          ok: false,
          status: null,
          contentType: null,
          finalUrl: target,
          bytes: null,
          errorMessage: String(error?.message || error || 'raw_https_download_failed'),
          transport: 'raw_https_http1',
        }));
        fallbackAttempt = rawDownloaded;
        if (rawDownloaded?.ok === true && rawDownloaded?.bytes?.length) {
          return rawDownloaded;
        }
      }
      return {
        ok: false,
        status: response.status,
        contentType,
        finalUrl: response.url || target,
        errorMessage: lowerContentType.includes('text/html') || looksHtml ? 'html_response' : 'json_error_response',
        transport: 'fetch',
        fallbackTransport: fallbackAttempt?.transport || null,
        fallbackStatus: fallbackAttempt?.status ?? null,
        fallbackContentType: fallbackAttempt?.contentType || null,
        fallbackErrorMessage: fallbackAttempt?.errorMessage || null,
      };
    }
    return {
      ok: true,
      status: response.status,
      contentType,
      finalUrl: response.url || target,
      bytes,
      transport: 'fetch',
    };
  } catch (error: any) {
    return {
      ok: false,
      status: null,
      contentType: null,
      finalUrl: target,
      errorMessage: String(error?.message || error || 'download_failed'),
      transport: 'fetch',
    };
  }
};

const getServiceHeaders = (serviceRoleKey: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
});

const parseResponse = async (response: Response) => {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return raw;
  }
};

const verifyUserToken = async (supabaseUrl: string, serviceRoleKey: string, userToken: string) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${userToken}`,
    },
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || 'نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.');
  }

  const user = await response.json();
  if (!user?.id) throw new Error('نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.');
  return user;
};

const getConnectionRecord = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  channel: BotChannel,
  connectionId: string
) => {
  const connectionTypes = channel === 'telegram'
    ? ['telegram_bot', 'telegram']
    : channel === 'bale'
      ? ['bale_bot', 'bale']
      : ['rubika_bot', 'rubika'];
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/integration_settings`);
  url.searchParams.set('id', `eq.${connectionId}`);
  url.searchParams.set('connection_type', `in.(${connectionTypes.join(',')})`);
  url.searchParams.set('select', 'id,org_id,provider,settings,is_active,connection_type,created_at,updated_at');
  url.searchParams.set('limit', '20');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'خطا در خواندن تنظیمات بات');

  const parsed = raw ? JSON.parse(raw) : [];
  let row = Array.isArray(parsed)
    ? [...parsed].sort((left, right) => {
        const leftExact = String(left?.connection_type || '') === `${channel}_bot` ? 1 : 0;
        const rightExact = String(right?.connection_type || '') === `${channel}_bot` ? 1 : 0;
        if (leftExact !== rightExact) return rightExact - leftExact;

        const leftUpdated = Date.parse(String(left?.updated_at || left?.created_at || '')) || 0;
        const rightUpdated = Date.parse(String(right?.updated_at || right?.created_at || '')) || 0;
        return rightUpdated - leftUpdated;
      })[0]
    : null;

  if (!row) {
    const fallbackUrl = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/integration_settings`);
    fallbackUrl.searchParams.set('connection_type', `in.(${connectionTypes.join(',')})`);
    fallbackUrl.searchParams.set('is_active', 'eq.true');
    fallbackUrl.searchParams.set('select', 'id,org_id,provider,settings,is_active,connection_type,created_at,updated_at');
    fallbackUrl.searchParams.set('limit', '20');

    const fallbackResponse = await fetch(fallbackUrl.toString(), {
      method: 'GET',
      headers: getServiceHeaders(serviceRoleKey),
    });
    const fallbackRaw = await fallbackResponse.text();
    if (!fallbackResponse.ok) throw new Error(fallbackRaw || 'خطا در خواندن تنظیمات بات');
    const fallbackParsed = fallbackRaw ? JSON.parse(fallbackRaw) : [];
    row = Array.isArray(fallbackParsed)
      ? [...fallbackParsed].sort((left, right) => {
          const leftExact = String(left?.connection_type || '') === `${channel}_bot` ? 1 : 0;
          const rightExact = String(right?.connection_type || '') === `${channel}_bot` ? 1 : 0;
          if (leftExact !== rightExact) return rightExact - leftExact;

          const leftUpdated = Date.parse(String(left?.updated_at || left?.created_at || '')) || 0;
          const rightUpdated = Date.parse(String(right?.updated_at || right?.created_at || '')) || 0;
          return rightUpdated - leftUpdated;
        })[0]
      : null;
  }
  if (!row) throw new Error('تنظیمات بات برای این کانال پیدا نشد.');
  if (row.is_active !== true) throw new Error('این بات غیرفعال است.');
  return row;
};

const getConnectionRecordLoose = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  channel: BotChannel,
  connectionId: string
) => {
  const connectionTypes = channel === 'telegram'
    ? ['telegram_bot', 'telegram']
    : channel === 'bale'
      ? ['bale_bot', 'bale']
      : ['rubika_bot', 'rubika'];
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/integration_settings`);
  url.searchParams.set('id', `eq.${connectionId}`);
  url.searchParams.set('connection_type', `in.(${connectionTypes.join(',')})`);
  url.searchParams.set('select', 'id,org_id,provider,settings,is_active,connection_type,created_at,updated_at');
  url.searchParams.set('limit', '20');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'خطا در خواندن تنظیمات بات');

  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? (parsed[0] || null) : parsed;
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
  const rubikaNewMessage = rubikaUpdate?.new_message || rubikaRootMessage || null;
  const rubikaInlineMessage = payload?.inline_message || null;
  return pick(
    message?.chat?.title,
    message?.chat?.name,
    message?.chat?.username,
    message?.chat?.chat_title,
    message?.chat?.group_title,
    message?.chat_title,
    message?.group_title,
    rubikaRootMessage?.chat?.title,
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

const extractContact = (payload: Record<string, any>): InboundContact => {
  const rubikaUpdate = payload?.update || null;
  const rubikaRootMessage = payload?.new_message || null;
  const rubikaNewMessage = rubikaUpdate?.new_message || rubikaRootMessage || null;
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
    rubikaInlineMessage ||
    null;

  const from =
    message?.from ||
    message?.sender ||
    callbackQuery?.from ||
    rubikaUpdate?.sender ||
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
    message?.chat_id,
    message?.object_guid,
    message?.objectGuid,
    callbackQuery?.message?.chat?.id,
    callbackQuery?.message?.chat_id,
    payload?.chat_id,
    rubikaUpdate?.chat_id,
    rubikaUpdate?.object_guid,
    rubikaInlineMessage?.chat_id,
    rubikaInlineMessage?.object_guid,
    rubikaNewMessage?.chat_id,
    rubikaNewMessage?.object_guid,
    payload?.chatId,
    payload?.object_guid,
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
  const chatIdLower = String(chatId || '').trim().toLowerCase();
  const isGroup = ['group', 'supergroup', 'channel'].includes(normalizedChatType)
    || chatIdLower.startsWith('g0')
    || chatIdLower.startsWith('c0')
    || chatIdLower.startsWith('ch')
    || Boolean(String(chatTitle || '').trim());

  return {
    chatId,
    username,
    phoneNumber,
    displayName: isGroup ? personDisplayName : fallbackDisplayName,
    text,
    senderId,
    chatTitle,
    chatType: normalizedChatType || null,
    isGroup,
  };
};

const getUpdateOrderKey = (payload: any) => {
  const candidates = [
    payload?.update_id,
    payload?.updateId,
    payload?.message_id,
    payload?.messageId,
    payload?.new_message?.message_id,
    payload?.new_message?.messageId,
    payload?.update?.update_id,
    payload?.update?.message_id,
    payload?.update?.new_message?.message_id,
    payload?.message?.message_id,
    payload?.message?.messageId,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const dateCandidates = [
    payload?.date,
    payload?.timestamp,
    payload?.created_at,
    payload?.new_message?.date,
    payload?.new_message?.created_at,
    payload?.update?.date,
    payload?.update?.new_message?.date,
    payload?.message?.date,
  ];
  for (const candidate of dateCandidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(String(candidate || ''));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
};

const sortProviderUpdates = (updates: any[]) => (
  Array.isArray(updates)
    ? [...updates].sort((left, right) => getUpdateOrderKey(left) - getUpdateOrderKey(right))
    : []
);

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
  if (!response.ok) throw new Error(raw || 'خطا در ذخیره پیام ورودی بات');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] : parsed;
};

const createOutboundLog = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: Record<string, any>
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/outbound_messages`);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'خطا در ثبت لاگ پیام خروجی');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] : parsed;
};

const updateOutboundLog = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string,
  payload: Record<string, any>
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/outbound_messages`);
  url.searchParams.set('id', `eq.${id}`);
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'خطا در بروزرسانی لاگ پیام خروجی');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed[0] : parsed;
};

const ensureTelegramLikeSuccess = (payload: any) => {
  if (payload && typeof payload === 'object' && payload.ok === false) {
    throw new Error(String(payload?.description || payload?.message || 'درخواست به API بات ناموفق بود.'));
  }
};

const ensureRubikaSuccess = (payload: any) => {
  const rootStatus = String(payload?.status || '').trim();
  const nestedStatus = String(payload?.data?.status || '').trim();
  if (rootStatus && rootStatus.toUpperCase() !== 'OK') {
    const detail = (() => { try { return JSON.stringify(payload).slice(0, 400); } catch { return rootStatus; } })();
    throw new Error(`RUBIKA_${rootStatus} | response: ${detail}`);
  }
  if (nestedStatus && nestedStatus.toUpperCase() !== 'OK') {
    const detail = (() => { try { return JSON.stringify(payload).slice(0, 400); } catch { return nestedStatus; } })();
    throw new Error(`RUBIKA_${nestedStatus} | response: ${detail}`);
  }
};

function createBotAdminError(
  message: string,
  options: {
    errorCode?: string;
    retryable?: boolean;
    details?: Record<string, any>;
  } = {}
) {
  const error = new Error(String(message || 'خطا در عملیات بات'));
  (error as any).errorCode = String(options.errorCode || 'bot_admin_error').trim() || 'bot_admin_error';
  (error as any).retryable = options.retryable === true;
  (error as any).details = options.details || null;
  return error;
}

const fetchWithTimeout = async (
  url: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; errorCode?: string; channel?: string; action?: string } = {},
) => {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 12000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: init.signal || controller.signal,
    });
  } catch (error: any) {
    if (String(error?.name || '').toLowerCase() === 'aborterror') {
      throw createBotAdminError('The upstream server is timing out', {
        errorCode: options.errorCode || 'bot_upstream_timeout',
        retryable: true,
        details: {
          channel: options.channel || null,
          action: options.action || null,
          timeout_ms: timeoutMs,
          upstream: describeExternalUrl(url),
        },
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientProviderStatus = (status: number | null | undefined) => {
  const normalized = Number(status || 0);
  return normalized === 408 || normalized === 425 || normalized === 429 || normalized === 500 || normalized === 502 || normalized === 503 || normalized === 504;
};

const summarizeProviderPayload = (payload: any, fallback: string) => {
  if (typeof payload === 'string') {
    const text = payload.trim();
    if (!text) return fallback;
    if (text.includes('<!DOCTYPE html') || text.toLowerCase().includes('<html')) return fallback;
    return text.slice(0, 500);
  }
  return String(
    payload?.message
    || payload?.description
    || payload?.data?.message
    || payload?.data?.description
    || payload?.data?.status
    || fallback
  );
};

const summarizeHttpText = (value: string, fallback: string) => {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (text.includes('<!DOCTYPE html') || text.toLowerCase().includes('<html')) {
    const title = text.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim();
    return title ? `${fallback}: ${title}` : fallback;
  }
  return text.slice(0, 500);
};

const describeExternalUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.host,
      path: parsed.pathname || '/',
      has_query: Boolean(parsed.search),
    };
  } catch {
    return { raw: raw.slice(0, 160) };
  }
};

const isRubikaMediaHostUrl = (value: string) => {
  try {
    const host = new URL(String(value || '').trim()).hostname.toLowerCase();
    return host === 'rubika.ir' || host.endsWith('.rubika.ir');
  } catch {
    return false;
  }
};

const disableTelegramLikeWebhook = async (
  channel: 'telegram' | 'bale',
  settings: Record<string, any>
) => {
  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const baseUrl = normalizeBaseUrl(settings?.api_base_url, channel);
  const endpoint = `${baseUrl}/bot${encodeURIComponent(token)}/deleteWebhook`;

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: false }),
  }, {
    timeoutMs: 10000,
    errorCode: `${channel}_delete_webhook_timeout`,
    channel,
    action: 'deleteWebhook',
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(typeof payload === 'string' ? payload : String(payload?.description || payload?.message || `HTTP ${response.status}`));
  }
  ensureTelegramLikeSuccess(payload);
  return payload;
};

const configureRubikaReceiveEndpoint = async (
  supabaseUrl: string,
  requestUrl: string,
  requestHeaders: Headers,
  settings: Record<string, any>
) => {
  const normalizedSettings = normalizeRubikaSettings(settings);
  const token = pick(normalizedSettings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const secret = pick(normalizedSettings?.webhook_secret);
  if (!secret) throw new Error('Webhook Secret برای بات روبیکا تنظیم نشده است.');

  const baseUrl = normalizeBaseUrl(normalizedSettings?.api_base_url, 'rubika');
  const webhookBase = pickWebhookPublicBase(requestUrl, supabaseUrl, requestHeaders, normalizedSettings);
  const normalizedSecret = encodeURIComponent(secret);
  const webhookCandidates = [
    `${webhookBase}/functions/v1/bot-webhook/rubika/${normalizedSecret}`,
    `${webhookBase}/functions/v1/bot-webhook/rubika/${normalizedSecret}/`,
    `${webhookBase}/functions/v1/bot-webhook?channel=rubika&secret=${normalizedSecret}`,
  ];
  const endpoint = `${baseUrl}/v3/${encodeURIComponent(token)}/updateBotEndpoints`;
  const failures: string[] = [];

  for (const webhookUrl of webhookCandidates) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        type: 'ReceiveUpdate',
      }),
    });
    const payload = await parseResponse(response);
    const rootStatus = String(payload?.status || '').trim().toUpperCase();
    const nestedStatus = String(payload?.data?.status || '').trim().toUpperCase();
    const messageStatus = String(payload?.message || payload?.description || '').trim().toUpperCase();
    const rubikaOk = (!rootStatus || rootStatus === 'OK') && (!nestedStatus || nestedStatus === 'OK');
    const hasExplicitOk = messageStatus === 'OK';
    if (rubikaOk && (response.ok || hasExplicitOk)) {
      return {
        webhook_url: webhookUrl,
        http_status: response.status,
        configured_at: new Date().toISOString(),
        provider_http_status: response.status,
        response: payload,
      };
    }
    const detail = typeof payload === 'string'
      ? payload
      : String(payload?.message || payload?.description || payload?.status || payload?.data?.status || `HTTP ${response.status}`);
    failures.push(`url=${webhookUrl} => ${detail}`);
  }

  throw new Error(`Rubika updateBotEndpoints failed | ${failures.join(' || ')}`);
};

const callTelegramLikeGetUpdates = async (
  channel: 'telegram' | 'bale',
  settings: Record<string, any>,
  cursor?: string | number | null
) => {
  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const baseUrl = normalizeBaseUrl(settings?.api_base_url, channel);
  const endpoint = `${baseUrl}/bot${encodeURIComponent(token)}/getUpdates`;
  const body: Record<string, any> = {
    limit: 50,
    timeout: 0,
  };
  const offset = Number(cursor);
  if (Number.isFinite(offset)) {
    body.offset = offset;
  }

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, {
    timeoutMs: 10000,
    errorCode: `${channel}_get_updates_timeout`,
    channel,
    action: 'getUpdates',
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(typeof payload === 'string' ? payload : String(payload?.description || payload?.message || `HTTP ${response.status}`));
  }
  ensureTelegramLikeSuccess(payload);
  const updates = Array.isArray(payload?.result) ? payload.result : [];
  const updateIds = updates
    .map((item: any) => Number(item?.update_id || 0))
    .filter((value: number) => Number.isFinite(value) && value > 0);
  const nextCursor = updateIds.length > 0 ? Math.max(...updateIds) + 1 : (Number.isFinite(offset) ? offset : null);
  return {
    updates,
    nextCursor: Number.isFinite(nextCursor) ? nextCursor : null,
    raw: payload,
  };
};

const callRubikaGetUpdates = async (
  settings: Record<string, any>,
  cursor?: string | number | null
) => {
  const normalizedSettings = normalizeRubikaSettings(settings);
  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const baseUrl = normalizeBaseUrl(normalizedSettings?.api_base_url, 'rubika');
  const endpoint = `${baseUrl}/v3/${encodeURIComponent(token)}/getUpdates`;
  const offsetId = pick(cursor);
  const requestBodies: Array<Record<string, any>> = [];
  if (offsetId) {
    requestBodies.push({ limit: 10, offset_id: offsetId });
    requestBodies.push({ limit: 10, start_id: offsetId });
    requestBodies.push({ offset_id: offsetId });
    requestBodies.push({ start_id: offsetId });
  }
  requestBodies.push({ limit: 10, state: 'all' });
  requestBodies.push({ limit: 10 });
  requestBodies.push({});

  let bestPayload: any = null;
  let bestUpdates: any[] = [];
  let bestNextCursor: string | number | null = offsetId || null;
  let lastError: any = null;
  const deriveRubikaCursorFromUpdates = (updates: any[]) => {
    const numericIds = (Array.isArray(updates) ? updates : [])
      .map((item: any) => Number(
        item?.update_id
        || item?.message_id
        || item?.new_message?.message_id
        || item?.updated_message?.message_id
        || item?.message?.message_id
        || 0
      ))
      .filter((value: number) => Number.isFinite(value) && value > 0);
    if (!numericIds.length) return null;
    return String(Math.max(...numericIds) + 1);
  };

  for (const body of requestBodies) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        lastError = typeof payload === 'string' ? payload : String(payload?.message || payload?.description || `HTTP ${response.status}`);
        continue;
      }
      ensureRubikaSuccess(payload);
      const updates =
        (Array.isArray(payload?.updates) ? payload.updates : null) ||
        (Array.isArray(payload?.data?.updates) ? payload.data.updates : null) ||
        (Array.isArray(payload?.result?.updates) ? payload.result.updates : null) ||
        (Array.isArray(payload?.data) ? payload.data : null) ||
        (Array.isArray(payload?.result) ? payload.result : null) ||
        [];
      const derivedCursor = deriveRubikaCursorFromUpdates(updates);
      const nextCursor = pick(payload?.next_offset_id, payload?.data?.next_offset_id, payload?.result?.next_offset_id, derivedCursor, offsetId);

      if (!bestPayload) {
        bestPayload = payload;
        bestUpdates = updates;
        bestNextCursor = nextCursor || null;
      }
      if (Array.isArray(updates) && updates.length > bestUpdates.length) {
        bestPayload = payload;
        bestUpdates = updates;
        bestNextCursor = nextCursor || null;
      }
      if (Array.isArray(updates) && updates.length > 0) {
        return {
          updates,
          nextCursor: nextCursor || null,
          raw: payload,
        };
      }
    } catch (error: any) {
      lastError = String(error?.message || error || '');
    }
  }

  if (lastError && !bestPayload) {
    throw new Error(String(lastError || 'خطا در دریافت آپدیت روبیکا'));
  }

  return {
    updates: Array.isArray(bestUpdates) ? bestUpdates : [],
    nextCursor: bestNextCursor || null,
    raw: bestPayload || {},
  };
};

const getRubikaChatInfo = async (
  settings: Record<string, any>,
  chatId: string
) => {
  const normalizedSettings = normalizeRubikaSettings(settings);
  const token = pick(normalizedSettings?.bot_token);
  const normalizedChatId = String(chatId || '').trim();
  if (!token || !normalizedChatId) return null;

  try {
    const endpoint = `${normalizeBaseUrl(normalizedSettings?.api_base_url, 'rubika')}/v3/${encodeURIComponent(token)}/getChat`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: normalizedChatId }),
    });
    const payload = await parseResponse(response);
    if (!response.ok) return null;
    ensureRubikaSuccess(payload);
    const chat = payload?.chat || payload?.data?.chat || payload?.result?.chat || payload?.data || payload?.result || null;
    if (!chat || typeof chat !== 'object') return null;
    return {
      title: pick(chat?.title, chat?.chat_title, chat?.group_title, chat?.name),
      type: pick(chat?.type, chat?.chat_type).toLowerCase() || null,
      raw: payload,
    };
  } catch {
    return null;
  }
};

const primeChannelCursor = async (
  integration: Record<string, any>,
  channel: BotChannel,
  cursor?: string | number | null
) => {
  const settings = integration?.settings || {};
  const result = channel === 'rubika'
    ? await callRubikaGetUpdates(settings, cursor)
    : await callTelegramLikeGetUpdates(channel as 'telegram' | 'bale', settings, cursor);

  return {
    cursor: result.nextCursor,
    provider_result_count: Array.isArray(result.updates) ? result.updates.length : 0,
  };
};

const pickLatestContact = (updates: any[], activationCode?: string | null) => {
  if (!Array.isArray(updates) || updates.length === 0) return null;
  let latestAny: { contact: InboundContact; payload: Record<string, any> } | null = null;
  let latestActivationMatch: { contact: InboundContact; payload: Record<string, any> } | null = null;
  let latestGroup: { contact: InboundContact; payload: Record<string, any> } | null = null;
  const normalizedActivationCode = String(activationCode || '').trim().toUpperCase();
  const orderedUpdates = sortProviderUpdates(updates);
  for (let index = orderedUpdates.length - 1; index >= 0; index -= 1) {
    const item = orderedUpdates[index];
    const contact = extractContact(item || {});
    if (contact.chatId) {
      const candidate = {
        contact,
        payload: item,
      };
      if (!latestAny) latestAny = candidate;
      if (contact.isGroup === true && !latestGroup) latestGroup = candidate;
      if (
        normalizedActivationCode
        && String(contact.text || '').toUpperCase().includes(normalizedActivationCode)
      ) {
        latestActivationMatch = candidate;
        break;
      }
    }
  }
  return latestActivationMatch || latestGroup || latestAny;
};

const saveInboundContact = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  integration: Record<string, any>,
  channel: BotChannel,
  found: { contact: InboundContact; payload: Record<string, any> }
) => {
  const rowPayload: Record<string, any> = {
    org_id: integration.org_id || null,
    channel_type: channel,
    chat_id: found.contact.chatId,
    source_provider: String(integration.provider || `${channel}_bot`),
    last_seen_at: new Date().toISOString(),
    last_payload: found.payload,
  };

  if (found.contact.username) rowPayload.username = found.contact.username;
  if (found.contact.displayName) rowPayload.display_name = found.contact.displayName;
  if (found.contact.phoneNumber) rowPayload.phone_number = found.contact.phoneNumber;
  if (found.contact.text) rowPayload.last_message_text = found.contact.text;

  return upsertInboundContact(supabaseUrl, serviceRoleKey, rowPayload);
};

const pollChannelUpdates = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  integration: Record<string, any>,
  channel: BotChannel,
  cursor?: string | number | null,
  options?: { activationCode?: string | null }
) => {
  const settings = integration?.settings || {};
  const result = channel === 'rubika'
    ? await callRubikaGetUpdates(settings, cursor)
    : await callTelegramLikeGetUpdates(channel as 'telegram' | 'bale', settings, cursor);
  const orderedUpdates = sortProviderUpdates(result.updates);
  const latestUpdateId = orderedUpdates.length > 0 ? getUpdateOrderKey(orderedUpdates[orderedUpdates.length - 1]) : null;

  const raw = (result as any)?.raw || {};
  const debug = {
    status: String(raw?.status || '').trim() || null,
    message: String(raw?.message || raw?.description || '').trim() || null,
    has_updates_array: Array.isArray(raw?.updates) || Array.isArray(raw?.data?.updates) || Array.isArray(raw?.result?.updates),
    activation_code_checked: Boolean(String(options?.activationCode || '').trim()),
    latest_update_id: latestUpdateId || null,
  };

  const found = pickLatestContact(orderedUpdates, options?.activationCode || null);
  if (!found) {
    return {
      found: false,
      cursor: result.nextCursor,
      contact: null,
      provider_result_count: orderedUpdates.length,
      provider_debug: debug,
    };
  }

  if (channel === 'rubika' && found.contact.chatId && !String(found.contact.chatTitle || '').trim()) {
    const chatInfo = await getRubikaChatInfo(settings, found.contact.chatId);
    if (chatInfo?.title) found.contact.chatTitle = String(chatInfo.title || '').trim();
    if (!found.contact.chatType && chatInfo?.type) found.contact.chatType = chatInfo.type;
    if (chatInfo?.type && !found.contact.isGroup) {
      found.contact.isGroup = ['group', 'supergroup', 'channel'].includes(String(chatInfo.type || '').toLowerCase());
    }
  }

  const saved = await saveInboundContact(supabaseUrl, serviceRoleKey, integration, channel, found);
  return {
    found: true,
    cursor: result.nextCursor,
    contact: {
      ...(saved && typeof saved === 'object' ? saved : {}),
      chatTitle: found.contact.chatTitle || null,
      chatType: found.contact.chatType || null,
      isGroup: found.contact.isGroup === true,
      sender_id: found.contact.senderId || null,
      last_payload: found.payload,
    },
    provider_result_count: orderedUpdates.length,
    provider_debug: debug,
  };
};

const sendProviderMessage = async (
  channel: BotChannel,
  settings: Record<string, any>,
  chatId: string,
  text: string,
  extraPayload?: Record<string, any>
) => {
  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const baseUrl = DEFAULT_API_BASE_URL[channel];
  const sendMessagePath = String(settings?.send_message_path || '').trim() || DEFAULT_SEND_PATH[channel];

  let lastError: any = null;
  for (let attempt = 1; attempt <= (channel === 'rubika' ? 3 : 1); attempt += 1) {
    const baseBody = channel === 'rubika'
      ? {
        chat_id: chatId,
        text,
      }
      : {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      };
    const requestBody = {
      ...baseBody,
      ...(extraPayload && typeof extraPayload === 'object' ? extraPayload : {}),
    };
    const response = await fetch(buildSendMessageUrl(baseUrl, token, sendMessagePath, channel), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const payload = await parseResponse(response);
    if (!response.ok) {
      const detail = typeof payload === 'string'
        ? payload
        : String(payload?.description || payload?.message || payload?.data?.status || `HTTP ${response.status}`);
      const normalized = String(detail || '').toLowerCase();
      const looksTransientNginx = normalized.includes('<!doctype html>') || normalized.includes('nginx');
      lastError = new Error(detail);
      if (channel === 'rubika' && looksTransientNginx && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        continue;
      }
      throw lastError;
    }

    if (channel === 'rubika') {
      const rubikaStatus = String(payload?.status || '').trim().toUpperCase();
      if (rubikaStatus === 'SERVER_ERROR' && attempt < 3) {
        lastError = new Error(`RUBIKA_SERVER_ERROR | attempt ${attempt} | response: ${(() => { try { return JSON.stringify(payload).slice(0, 300); } catch { return rubikaStatus; } })()}`);
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        continue;
      }
      ensureRubikaSuccess(payload);
    } else {
      ensureTelegramLikeSuccess(payload);
    }

    return payload;
  }

  throw lastError || new Error('Bot send failed');
};

const normalizeAttachmentKind = (attachment: Record<string, any> | null | undefined) => {
  const rawType = String(
    attachment?.fileType
    || attachment?.file_type
    || ''
  ).trim().toLowerCase();
  const mimeType = String(
    attachment?.mimeType
    || attachment?.mime_type
    || ''
  ).trim().toLowerCase();
  const name = String(attachment?.name || '').trim().toLowerCase();

  const normalizedRawType = rawType.replace(/[\s_-]+/g, '');
  if (rawType === 'voice' || normalizedRawType === 'voicemessage' || normalizedRawType === 'recordaudio' || normalizedRawType === 'recordedaudio') return 'voice';
  if (rawType === 'audio') return 'audio';
  if (rawType === 'gif') return 'gif';
  if (rawType === 'image') return 'image';
  if (rawType === 'video') return 'video';

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  if (/\.(gif)$/i.test(name)) return 'gif';
  if (/\.(png|jpe?g|webp)$/i.test(name)) return 'image';
  if (/\.(mp4|mkv|mov|avi|webm)$/i.test(name)) return 'video';
  if (/\.(wav|ogg|oga|aac|m4a|flac|opus|weba|webm)$/i.test(name)) return 'audio';
  if (/\.(mp3)$/i.test(name)) return 'audio';
  return 'file';
};

const pickDeepStringByKey = (node: any, acceptedKeys: string[]) => {
  const accepted = new Set(acceptedKeys.map((item) => String(item || '').toLowerCase()));
  const seen = new Set<any>();
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (typeof current === 'string') continue;
    if (typeof current !== 'object') continue;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item));
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      const normalizedKey = String(key || '').toLowerCase();
      if (accepted.has(normalizedKey) && typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return '';
};

const resolveRubikaUploadFileType = (attachment: Record<string, any> | null | undefined) => {
  const kind = normalizeAttachmentKind(attachment);
  const name = String(attachment?.name || '').trim().toLowerCase();
  const mimeType = String(attachment?.mimeType || attachment?.mime_type || '').trim().toLowerCase();
  if (kind === 'gif') return mimeType === 'video/mp4' || /\.mp4$/i.test(name) ? 'Gif' : 'Image';
  if (kind === 'image') return 'Image';
  if (kind === 'video') return 'Video';
  if (kind === 'voice') return 'Voice';
  if (kind === 'audio') {
    if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3' || /\.mp3$/i.test(name)) return 'Music';
    return 'File';
  }
  return 'File';
};

const describeBinarySignature = (bytes: Uint8Array) => {
  if (!bytes?.length) return { kind: 'empty', mime_type: null };
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { kind: 'png', mime_type: 'image/png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: 'jpeg', mime_type: 'image/jpeg' };
  }
  if (bytes.length >= 6) {
    const head = Array.from(bytes.slice(0, 6)).map((item) => String.fromCharCode(item)).join('');
    if (head === 'GIF87a' || head === 'GIF89a') return { kind: 'gif', mime_type: 'image/gif' };
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { kind: 'webp', mime_type: 'image/webp' };
  }
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return { kind: 'mp3', mime_type: 'audio/mpeg' };
  }
  if (bytes.length >= 12) {
    const ftyp = Array.from(bytes.slice(4, 8)).map((item) => String.fromCharCode(item)).join('');
    if (ftyp === 'ftyp') return { kind: 'mp4', mime_type: 'video/mp4' };
  }
  return { kind: 'unknown', mime_type: null };
};

const requestRubikaSendFileUploadUrl = async (
  settings: Record<string, any>,
  type: string,
) => {
  const response = await fetch(buildProviderMethodUrl('rubika', settings, 'requestSendFile'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw createBotAdminError(
      typeof payload === 'string' ? payload : String(payload?.message || payload?.description || `HTTP ${response.status}`),
      { errorCode: 'rubika_request_send_file_failed', retryable: true, details: { http_status: response.status, file_type: type } }
    );
  }
  ensureRubikaSuccess(payload);
  const uploadUrl = pick(
    payload?.upload_url,
    payload?.uploadUrl,
    payload?.data?.upload_url,
    payload?.data?.uploadUrl,
    payload?.result?.upload_url,
    payload?.result?.uploadUrl,
    pickDeepStringByKey(payload, ['upload_url', 'uploadUrl'])
  );
  if (!uploadUrl) {
    throw createBotAdminError('Rubika requestSendFile آدرس آپلود برنگرداند.', {
      errorCode: 'rubika_upload_url_missing',
      retryable: true,
      details: { file_type: type, provider_result: payload },
    });
  }
  const normalizedBase = normalizeBaseUrl(settings?.api_base_url, 'rubika');
  const normalizedUploadUrl = (() => {
    const raw = String(uploadUrl || '').trim();
    if (raw.startsWith('//')) return `https:${raw}`;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return `${normalizedBase}${raw}`;
    return normalizeGenericBaseUrl(raw);
  })();
  return {
    uploadUrl: normalizedUploadUrl,
    providerResult: payload,
  };
};

const concatBytes = (parts: Uint8Array[]) => {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const buildLegacyRubikaMultipart = ({
  bytes,
  fileName,
  contentType,
}: {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
}) => {
  const encoder = new TextEncoder();
  const boundary = `--------------------------${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`;
  const uploadFileName = safeFileName(String(fileName || 'file').trim() || 'file').replace(/["\r\n]/g, '_');
  const header = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${uploadFileName}"\r\n` +
    `Content-Type: ${contentType || 'application/octet-stream'}\r\n\r\n`
  );
  const footer = encoder.encode(`\r\n--${boundary}--\r\n`);
  return {
    body: concatBytes([header, bytes, footer]),
    boundary,
    uploadFileName,
  };
};

const decodeRawHttpChunkedBody = (bodyBytes: Uint8Array) => {
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  while (offset < bodyBytes.length) {
    const remaining = decoder.decode(bodyBytes.slice(offset, Math.min(offset + 256, bodyBytes.length)));
    const lineEnd = remaining.indexOf('\r\n');
    if (lineEnd < 0) break;
    const sizeText = remaining.slice(0, lineEnd).split(';')[0].trim();
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isFinite(size) || size < 0) break;
    offset += lineEnd + 2;
    if (size === 0) break;
    if (offset + size > bodyBytes.length) break;
    chunks.push(bodyBytes.slice(offset, offset + size));
    offset += size;
    if (bodyBytes[offset] === 13 && bodyBytes[offset + 1] === 10) {
      offset += 2;
    }
  }
  return chunks.length > 0 ? concatBytes(chunks) : bodyBytes;
};

const parseRawHttpResponse = (rawResponse: Uint8Array) => {
  const marker = new TextEncoder().encode('\r\n\r\n');
  let headerEnd = -1;
  for (let index = 0; index <= rawResponse.length - marker.length; index += 1) {
    if (
      rawResponse[index] === marker[0]
      && rawResponse[index + 1] === marker[1]
      && rawResponse[index + 2] === marker[2]
      && rawResponse[index + 3] === marker[3]
    ) {
      headerEnd = index;
      break;
    }
  }
  const decoder = new TextDecoder();
  const headerText = decoder.decode(headerEnd >= 0 ? rawResponse.slice(0, headerEnd) : rawResponse);
  const bodyBytes = headerEnd >= 0 ? rawResponse.slice(headerEnd + marker.length) : new Uint8Array();
  const lines = headerText.split(/\r?\n/);
  const status = Number(lines[0]?.match(/\s(\d{3})\s/)?.[1] || 0);
  const headers: Record<string, string> = {};
  lines.slice(1).forEach((line) => {
    const separator = line.indexOf(':');
    if (separator <= 0) return;
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  });
  const decodedBodyBytes = String(headers['transfer-encoding'] || '').toLowerCase().includes('chunked')
    ? decodeRawHttpChunkedBody(bodyBytes)
    : bodyBytes;
  return {
    status,
    headers,
    bodyBytes: decodedBodyBytes,
    bodyText: decoder.decode(decodedBodyBytes),
  };
};

const rawHttpsGetRubikaBinary = async (url: string, extraHeaders?: Record<string, string>) => {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const port = Number(parsed.port || 443);
  const path = `${parsed.pathname || '/'}${parsed.search || ''}`;
  const mergedHeaders = {
    Accept: '*/*',
    'Cache-Control': 'no-cache',
    ...(extraHeaders || {}),
  };
  const requestHeaders = Object.entries(mergedHeaders)
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${key}: ${String(value).replace(/\r|\n/g, ' ')}`)
    .join('\r\n');
  const requestHead = new TextEncoder().encode(
    `GET ${path} HTTP/1.1\r\n` +
    `Host: ${parsed.host}\r\n` +
    `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n` +
    `${requestHeaders ? `${requestHeaders}\r\n` : ''}` +
    `Connection: close\r\n\r\n`
  );
  const connection = await Deno.connectTls({ hostname, port });
  try {
    await connection.write(requestHead);
    const chunks: Uint8Array[] = [];
    const buffer = new Uint8Array(32 * 1024);
    while (true) {
      const read = await connection.read(buffer);
      if (read === null) break;
      chunks.push(buffer.slice(0, read));
    }
    const raw = parseRawHttpResponse(concatBytes(chunks));
    const contentType = String(raw.headers['content-type'] || '').trim() || 'application/octet-stream';
    const lowerContentType = contentType.toLowerCase();
    const bodyTextSample = new TextDecoder().decode(raw.bodyBytes.slice(0, 1024)).trim().toLowerCase();
    const looksHtml = bodyTextSample.startsWith('<!doctype') || bodyTextSample.startsWith('<html') || bodyTextSample.includes('<html');
    const ok = raw.status >= 200 && raw.status < 300 && raw.bodyBytes.length > 0 && !lowerContentType.includes('text/html') && !looksHtml;
    return {
      ok,
      status: raw.status,
      contentType,
      finalUrl: url,
      bytes: ok ? raw.bodyBytes : null,
      errorMessage: ok ? null : (looksHtml || lowerContentType.includes('text/html') ? 'html_response' : `HTTP ${raw.status}`),
      transport: 'raw_https_http1',
    };
  } finally {
    try {
      connection.close();
    } catch {
      // ignore close errors
    }
  }
};

const rawHttpsPostRubikaMultipart = async ({
  uploadUrl,
  bytes,
  fileName,
  contentType,
}: {
  uploadUrl: string;
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
}) => {
  const parsed = new URL(uploadUrl);
  const multipart = buildLegacyRubikaMultipart({ bytes, fileName, contentType });
  const hostname = parsed.hostname;
  const port = Number(parsed.port || 443);
  const path = `${parsed.pathname || '/'}${parsed.search || ''}`;
  const requestHead = new TextEncoder().encode(
    `POST ${path} HTTP/1.1\r\n` +
    `Host: ${parsed.host}\r\n` +
    `User-Agent: node-fetch/1.0 (+https://github.com/bitinn/node-fetch)\r\n` +
    `Accept: */*\r\n` +
    `Connection: close\r\n` +
    `Content-Type: multipart/form-data; boundary=${multipart.boundary}\r\n` +
    `Content-Length: ${multipart.body.length}\r\n\r\n`
  );
  const connection = await Deno.connectTls({ hostname, port });
  try {
    await connection.write(concatBytes([requestHead, multipart.body]));
    const chunks: Uint8Array[] = [];
    const buffer = new Uint8Array(32 * 1024);
    while (true) {
      const read = await connection.read(buffer);
      if (read === null) break;
      chunks.push(buffer.slice(0, read));
    }
    const raw = parseRawHttpResponse(concatBytes(chunks));
    const payload = (() => {
      try {
        return raw.bodyText ? JSON.parse(raw.bodyText) : null;
      } catch {
        return raw.bodyText;
      }
    })();
    return {
      ok: raw.status >= 200 && raw.status < 300,
      status: raw.status,
      contentType: raw.headers['content-type'] || null,
      payload,
      uploadFileName: multipart.uploadFileName,
      contentLength: multipart.body.length,
    };
  } finally {
    try {
      connection.close();
    } catch {
      // ignore close errors
    }
  }
};

const uploadRubikaFileBytes = async ({
  uploadUrl,
  bytes,
  fileName,
  contentType,
  maxAttempts = 3,
}: {
  uploadUrl: string;
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  maxAttempts?: number;
}) => {
  const attempts: Array<Record<string, any>> = [];
  const normalizedAttempts = Math.min(Math.max(Number(maxAttempts || 3), 1), 5);
  const urlDiagnostic = describeExternalUrl(uploadUrl);
  const allowRawHttpFallback = String(Deno.env.get('RUBIKA_RAW_HTTP_FALLBACK') || '').trim() === '1';

  for (let attempt = 1; attempt <= normalizedAttempts; attempt += 1) {
    const uploadFileName = safeFileName(String(fileName || 'file').trim() || 'file');
    try {
      const form = new FormData();
      form.append('file', new File([bytes], uploadFileName, { type: contentType || 'application/octet-stream' }));
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: form,
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        const transient = isTransientProviderStatus(response.status);
        if (transient && allowRawHttpFallback) {
          try {
            const rawUpload = await rawHttpsPostRubikaMultipart({
              uploadUrl,
              bytes,
              fileName: uploadFileName,
              contentType: contentType || 'application/octet-stream',
            });
            attempts.push({
              attempt,
              transport: 'raw_https_http1',
              http_status: rawUpload.status,
              retryable: isTransientProviderStatus(rawUpload.status),
              message: summarizeProviderPayload(rawUpload.payload, `HTTP ${rawUpload.status}`),
              upload_file_name: rawUpload.uploadFileName,
              upload_url: urlDiagnostic,
              body_profile: 'legacy_file',
              binary_field_name: 'file',
              file_marker_field: null,
              file_byte_length: bytes.length,
              part_content_type: contentType || 'application/octet-stream',
              content_length: rawUpload.contentLength,
              response_content_type: rawUpload.contentType,
            });
            if (rawUpload.ok) {
              const fileId = pick(
                rawUpload.payload?.file_id,
                rawUpload.payload?.fileId,
                rawUpload.payload?.data?.file_id,
                rawUpload.payload?.data?.fileId,
                rawUpload.payload?.result?.file_id,
                rawUpload.payload?.result?.fileId,
                pickDeepStringByKey(rawUpload.payload, ['file_id', 'fileId'])
              );
              if (fileId) {
                return {
                  fileId,
                  providerResult: rawUpload.payload,
                  attempts,
                  uploadFileName: rawUpload.uploadFileName,
                };
              }
            }
          } catch (rawError: any) {
            attempts.push({
              attempt,
              transport: 'raw_https_http1',
              http_status: null,
              retryable: true,
              message: String(rawError?.message || rawError || 'raw_https_upload_failed').slice(0, 500),
              upload_file_name: uploadFileName,
              upload_url: urlDiagnostic,
              body_profile: 'legacy_file',
              binary_field_name: 'file',
              file_marker_field: null,
              file_byte_length: bytes.length,
              part_content_type: contentType || 'application/octet-stream',
            });
          }
        }
        attempts.push({
          attempt,
          transport: 'fetch_formdata',
          http_status: response.status,
          retryable: transient,
          message: summarizeProviderPayload(payload, `HTTP ${response.status}`),
          upload_file_name: uploadFileName,
          upload_url: urlDiagnostic,
          body_profile: 'legacy_file',
          binary_field_name: 'file',
          file_marker_field: null,
          file_byte_length: bytes.length,
          part_content_type: contentType || 'application/octet-stream',
          response_content_type: String(response.headers.get('content-type') || '').trim() || null,
        });
        if (transient && attempt < normalizedAttempts) {
          await sleep(450 * attempt);
          continue;
        }
        throw createBotAdminError('آپلود فایل در روبیکا ناموفق بود.', {
          errorCode: 'rubika_upload_failed',
          retryable: transient,
          details: { attempts, upload_url: urlDiagnostic },
        });
      }
      const fileId = pick(
        payload?.file_id,
        payload?.fileId,
        payload?.data?.file_id,
        payload?.data?.fileId,
        payload?.result?.file_id,
        payload?.result?.fileId,
        pickDeepStringByKey(payload, ['file_id', 'fileId'])
      );
      if (!fileId) {
        throw createBotAdminError('Rubika upload فایل، file_id برنگرداند.', {
          errorCode: 'rubika_upload_file_id_missing',
          retryable: true,
          details: { attempts, provider_result: payload, upload_file_name: uploadFileName, upload_url: urlDiagnostic, body_profile: 'legacy_file' },
        });
      }
      return {
        fileId,
        providerResult: payload,
        attempts,
        uploadFileName,
      };
    } catch (error: any) {
      if (error?.errorCode) throw error;
      attempts.push({
        attempt,
        transport: 'fetch_formdata',
        http_status: null,
        retryable: true,
        message: String(error?.message || error || 'upload_failed').slice(0, 500),
        upload_url: urlDiagnostic,
        upload_file_name: uploadFileName,
        body_profile: 'legacy_file',
        binary_field_name: 'file',
        file_marker_field: null,
        file_byte_length: bytes.length,
        part_content_type: contentType || 'application/octet-stream',
      });
      if (attempt < normalizedAttempts) {
        await sleep(450 * attempt);
        continue;
      }
      throw createBotAdminError('آپلود فایل در روبیکا ناموفق بود.', {
        errorCode: 'rubika_upload_failed',
        retryable: true,
        details: { attempts, upload_url: urlDiagnostic },
      });
    }
  }

  throw createBotAdminError('آپلود فایل در روبیکا ناموفق بود.', {
    errorCode: 'rubika_upload_failed',
    retryable: true,
    details: { attempts, upload_url: urlDiagnostic },
  });
};

const sendRubikaFileById = async ({
  settings,
  chatId,
  fileId,
  text,
}: {
  settings: Record<string, any>;
  chatId: string;
  fileId: string;
  text?: string;
}) => {
  const requestBody: Record<string, any> = {
    chat_id: chatId,
    file_id: fileId,
  };
  const normalizedText = String(text || '').trim();
  if (normalizedText) requestBody.text = normalizedText;

  const attempts: Array<Record<string, any>> = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(buildProviderMethodUrl('rubika', settings, 'sendFile'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const transient = isTransientProviderStatus(response.status);
      attempts.push({
        attempt,
        http_status: response.status,
        retryable: transient,
        message: summarizeProviderPayload(payload, `HTTP ${response.status}`),
      });
      if (transient && attempt < 3) {
        await sleep(500 * attempt);
        continue;
      }
      throw createBotAdminError('ارسال فایل در روبیکا موقتاً ناموفق بود. لطفاً دوباره تلاش کنید.', {
        errorCode: 'rubika_send_file_failed',
        retryable: transient,
        details: { attempts },
      });
    }
    ensureRubikaSuccess(payload);
    return {
      payload,
      attempts,
    };
  }

  throw createBotAdminError('ارسال فایل در روبیکا موقتاً ناموفق بود. لطفاً دوباره تلاش کنید.', {
    errorCode: 'rubika_send_file_failed',
    retryable: true,
    details: { attempts },
  });
};

const sendRubikaAttachmentMessage = async ({
  settings,
  chatId,
  text,
  attachment,
}: {
  settings: Record<string, any>;
  chatId: string;
  text?: string;
  attachment: Record<string, any>;
}) => {
  const attachmentUrl = String(attachment?.url || '').trim();
  if (!attachmentUrl) throw new Error('آدرس فایل برای ارسال به روبیکا خالی است.');
  const downloaded = await downloadBinaryFromUrl(attachmentUrl);
  if (downloaded?.ok !== true || !downloaded?.bytes?.length) {
    throw createBotAdminError(`دانلود فایل برای ارسال به روبیکا ناموفق بود: ${String(attachment?.name || 'فایل')}`, {
      errorCode: 'rubika_attachment_download_failed',
      retryable: true,
      details: {
        http_status: downloaded?.status ?? null,
        content_type: downloaded?.contentType || null,
        error_message: downloaded?.errorMessage || null,
      },
    });
  }

  const uploadType = resolveRubikaUploadFileType(attachment);
  const fileName = safeFileName(String(attachment?.name || 'file').trim() || 'file');
  const binarySignature = describeBinarySignature(downloaded.bytes);
  const contentType = String(
    downloaded.contentType
    || binarySignature.mime_type
    || attachment?.mimeType
    || attachment?.mime_type
    || inferMimeTypeFromFileName(fileName)
    || 'application/octet-stream'
  ).trim() || 'application/octet-stream';
  const uploadRounds: Array<Record<string, any>> = [];
  let requestInfo: { uploadUrl: string; providerResult: any } | null = null;
  let uploadInfo: { fileId: string; providerResult: any; attempts?: Array<Record<string, any>>; uploadFileName?: string } | null = null;

  for (let round = 1; round <= 3; round += 1) {
    try {
      requestInfo = await requestRubikaSendFileUploadUrl(settings, uploadType);
      uploadInfo = await uploadRubikaFileBytes({
        uploadUrl: requestInfo.uploadUrl,
        bytes: downloaded.bytes,
        fileName,
        contentType,
        maxAttempts: 2,
      });
      uploadRounds.push({
        round,
        success: true,
        upload_type: uploadType,
        body_profile: 'legacy_file',
        requested_upload_type: uploadType,
        binary_signature: binarySignature,
        downloaded_content_type: downloaded.contentType || null,
        final_content_type: contentType,
        request_send_file_result: requestInfo.providerResult || null,
        upload_url: describeExternalUrl(requestInfo.uploadUrl),
        upload_attempts: uploadInfo.attempts || [],
        upload_file_name: uploadInfo.uploadFileName || null,
      });
      break;
    } catch (error: any) {
      uploadRounds.push({
        round,
        success: false,
        upload_type: uploadType,
        body_profile: 'legacy_file',
        requested_upload_type: uploadType,
        binary_signature: binarySignature,
        downloaded_content_type: downloaded.contentType || null,
        final_content_type: contentType,
        request_send_file_result: requestInfo?.providerResult || null,
        upload_url: requestInfo?.uploadUrl ? describeExternalUrl(requestInfo.uploadUrl) : null,
        error_code: String(error?.errorCode || 'rubika_upload_failed'),
        retryable: Boolean(error?.retryable),
        details: error?.details || null,
        message: String(error?.message || error || 'rubika upload failed').slice(0, 500),
      });
      if (!error?.retryable || round >= 3) {
        throw createBotAdminError(String(error?.message || 'آپلود فایل در روبیکا ناموفق بود.'), {
          errorCode: String(error?.errorCode || 'rubika_upload_failed'),
          retryable: Boolean(error?.retryable),
          details: { upload_rounds: uploadRounds },
        });
      }
      await sleep(700 * round);
    }
  }

  if (!requestInfo || !uploadInfo?.fileId) {
    throw createBotAdminError('آپلود فایل در روبیکا ناموفق بود.', {
      errorCode: 'rubika_upload_failed',
      retryable: true,
      details: { upload_rounds: uploadRounds, requested_upload_type: uploadType },
    });
  }

  const sentFile = await sendRubikaFileById({
    settings,
    chatId,
    fileId: uploadInfo.fileId,
    text,
  });
  return {
    kind: uploadType === 'Voice' ? 'voice' : uploadType === 'Gif' ? 'image' : normalizeAttachmentKind(attachment),
    file_id: uploadInfo.fileId,
    attachment_url: attachmentUrl,
    file_name: String(attachment?.name || '').trim() || 'file',
    mime_type: String(attachment?.mimeType || attachment?.mime_type || downloaded.contentType || '').trim() || null,
    upload_type: uploadType,
    requested_upload_type: uploadType,
    body_profile: 'legacy_file',
    binary_signature: binarySignature,
    request_send_file_result: requestInfo.providerResult,
    upload_result: uploadInfo.providerResult,
    upload_file_name: uploadInfo.uploadFileName || null,
    upload_attempts: uploadRounds,
    send_attempts: sentFile.attempts,
    send_result: sentFile.payload,
  };
};

// Send attachment (photo/video/document/audio/voice) via Telegram-like API (Bale, Telegram).
// Downloads the file from `attachment.url` and uploads it via multipart/form-data.
const sendTelegramLikeAttachmentMessage = async ({
  channel,
  settings,
  chatId,
  text,
  attachment,
  extraPayload,
}: {
  channel: 'telegram' | 'bale';
  settings: Record<string, any>;
  chatId: string;
  text?: string;
  attachment: Record<string, any>;
  extraPayload?: Record<string, any>;
}) => {
  const attachmentUrl = String(attachment?.url || '').trim();
  if (!attachmentUrl) throw new Error('آدرس فایل برای ارسال خالی است.');

  const downloaded = await downloadBinaryFromUrl(attachmentUrl);
  if (!downloaded?.bytes?.length) {
    throw new Error(`دانلود فایل ناموفق بود: ${String(attachment?.name || attachmentUrl)}`);
  }

  const kind = normalizeAttachmentKind(attachment);
  const kindToMethod: Record<string, { method: string; field: string }> = {
    image: { method: 'sendPhoto', field: 'photo' },
    gif: { method: 'sendAnimation', field: 'animation' },
    video: { method: 'sendVideo', field: 'video' },
    voice: { method: 'sendVoice', field: 'voice' },
    audio: { method: 'sendAudio', field: 'audio' },
    file: { method: 'sendDocument', field: 'document' },
  };
  const { method: methodName, field: fieldName } = kindToMethod[kind] || kindToMethod.file;

  const fileName = safeFileName(String(attachment?.name || 'file').trim() || 'file');
  const contentType = String(downloaded.contentType || attachment?.mimeType || attachment?.mime_type || 'application/octet-stream');

  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const baseUrl = normalizeBaseUrl(settings?.api_base_url, channel);
  const url = `${baseUrl}/bot${encodeURIComponent(token)}/${methodName}`;

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append(fieldName, new Blob([downloaded.bytes], { type: contentType }), fileName);

  const normalizedCaption = String(text || '').trim();
  if (normalizedCaption) form.append('caption', normalizedCaption);

  const replyToId = String(extraPayload?.reply_to_message_id || '').trim();
  if (replyToId) form.append('reply_to_message_id', replyToId);

  const response = await fetch(url, { method: 'POST', body: form });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      typeof payload === 'string'
        ? payload
        : String(payload?.description || payload?.message || `HTTP ${response.status}`)
    );
  }
  ensureTelegramLikeSuccess(payload);

  const result = payload?.result || payload;
  return {
    kind,
    file_name: fileName,
    mime_type: contentType,
    send_result: payload,
    provider_message_id: pick(result?.message_id, payload?.message_id),
  };
};

const canSendTelegramLikeMediaGroup = (attachments: Array<Record<string, any>>) => {
  if (!Array.isArray(attachments) || attachments.length < 2 || attachments.length > 10) return false;
  const kinds = attachments.map((item) => normalizeAttachmentKind(item));
  if (kinds.every((kind) => kind === 'image' || kind === 'gif' || kind === 'video')) return true;
  if (kinds.every((kind) => kind === 'file')) return true;
  if (kinds.every((kind) => kind === 'audio')) return true;
  return false;
};

const sendTelegramLikeMediaGroupMessage = async ({
  channel,
  settings,
  chatId,
  text,
  attachments,
}: {
  channel: 'telegram' | 'bale';
  settings: Record<string, any>;
  chatId: string;
  text?: string;
  attachments: Array<Record<string, any>>;
}) => {
  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const baseUrl = normalizeBaseUrl(settings?.api_base_url, channel);
  const url = `${baseUrl}/bot${encodeURIComponent(token)}/sendMediaGroup`;

  const form = new FormData();
  form.append('chat_id', chatId);
  const mediaItems: Array<Record<string, any>> = [];
  const providerUploads: Array<Record<string, any>> = [];

  for (const [index, attachment] of attachments.entries()) {
    const attachmentUrl = String(attachment?.url || '').trim();
    if (!attachmentUrl) throw new Error('آدرس فایل برای ارسال خالی است.');
    const downloaded = await downloadBinaryFromUrl(attachmentUrl);
    if (!downloaded?.bytes?.length) {
      throw new Error(`دانلود فایل ناموفق بود: ${String(attachment?.name || attachmentUrl)}`);
    }

    const kind = normalizeAttachmentKind(attachment);
    const type = kind === 'image'
      ? 'photo'
      : kind === 'gif'
        ? 'video'
      : kind === 'video'
        ? 'video'
        : kind === 'audio'
          ? 'audio'
          : 'document';
    const fieldName = `media_${index}`;
    const fileName = safeFileName(String(attachment?.name || 'file').trim() || 'file');
    const contentType = String(downloaded.contentType || attachment?.mimeType || attachment?.mime_type || 'application/octet-stream');
    form.append(fieldName, new Blob([downloaded.bytes], { type: contentType }), fileName);
    mediaItems.push({
      type,
      media: `attach://${fieldName}`,
      ...(index === 0 && String(text || '').trim()
        ? { caption: String(text || '').trim(), parse_mode: 'HTML' }
        : {}),
    });
    providerUploads.push({
      kind,
      file_name: fileName,
      mime_type: contentType,
      attachment_url: attachmentUrl,
    });
  }

  form.append('media', JSON.stringify(mediaItems));
  const response = await fetch(url, { method: 'POST', body: form });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      typeof payload === 'string'
        ? payload
        : String(payload?.description || payload?.message || `HTTP ${response.status}`)
    );
  }
  ensureTelegramLikeSuccess(payload);

  const results = Array.isArray(payload?.result)
    ? payload.result
    : (Array.isArray(payload) ? payload : []);
  return providerUploads.map((item, index) => ({
    ...item,
    send_result: payload,
    provider_message_id: pick(results[index]?.message_id, payload?.message_id),
  }));
};

// Configure Bale bot webhook (setWebhook).
// Returns webhook URL and provider response on success.
const configureBaleWebhook = async (
  supabaseUrl: string,
  requestUrl: string,
  requestHeaders: Headers,
  settings: Record<string, any>
) => {
  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const secret = pick(settings?.webhook_secret);
  if (!secret) throw new Error('Webhook Secret برای بات بله تنظیم نشده است.');

  const baseUrl = normalizeBaseUrl(settings?.api_base_url, 'bale');
  const webhookBase = pickWebhookPublicBase(requestUrl, supabaseUrl, requestHeaders, settings);
  if (!webhookBase) throw new Error('آدرس عمومی Webhook قابل شناسایی نیست.');

  const normalizedSecret = encodeURIComponent(secret);
  const webhookUrl = `${webhookBase}/functions/v1/bot-webhook/bale/${normalizedSecret}`;
  const endpoint = `${baseUrl}/bot${encodeURIComponent(token)}/setWebhook`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      typeof payload === 'string'
        ? payload
        : String(payload?.description || payload?.message || `HTTP ${response.status}`)
    );
  }
  ensureTelegramLikeSuccess(payload);
  return {
    webhook_url: webhookUrl,
    http_status: response.status,
    configured_at: new Date().toISOString(),
    provider_result: payload,
  };
};

// Resolve a Bale/Telegram file_id to a download URL via getFile.
const resolveTelegramLikeFileUrl = async (
  channel: 'telegram' | 'bale',
  settings: Record<string, any>,
  fileId: string
) => {
  const token = pick(settings?.bot_token);
  if (!token || !fileId) return null;
  const baseUrl = normalizeBaseUrl(settings?.api_base_url, channel);
  const endpoint = `${baseUrl}/bot${encodeURIComponent(token)}/getFile`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });
    if (!response.ok) return null;
    const payload = await parseResponse(response);
    const filePath = pick(payload?.result?.file_path, payload?.file_path);
    if (!filePath) return null;
    const downloadUrl = `${baseUrl}/file/bot${encodeURIComponent(token)}/${filePath}`;
    return { file_url: downloadUrl, provider_result: payload };
  } catch {
    return null;
  }
};

const buildProviderMethodUrl = (
  channel: BotChannel,
  settings: Record<string, any>,
  methodName: string
) => {
  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const baseUrl = normalizeBaseUrl(settings?.api_base_url, channel);
  const path = channel === 'rubika'
    ? `/v3/${encodeURIComponent(token)}/${methodName}`
    : `/bot${encodeURIComponent(token)}/${methodName}`;
  return `${baseUrl}${path}`;
};

const callProviderMessageAction = async ({
  channel,
  settings,
  action,
  chatId,
  providerMessageId,
  text,
}: {
  channel: BotChannel;
  settings: Record<string, any>;
  action: 'edit_message' | 'delete_message';
  chatId: string;
  providerMessageId: string;
  text?: string;
}) => {
  const normalizedChatId = String(chatId || '').trim();
  const normalizedMessageId = String(providerMessageId || '').trim();
  if (!normalizedChatId) throw new Error('chatId الزامی است.');
  if (!normalizedMessageId) throw new Error('message_id الزامی است.');

  const methodName = action === 'edit_message' ? 'editMessageText' : 'deleteMessage';
  const requestBody: Record<string, any> = {
    chat_id: normalizedChatId,
    message_id: normalizedMessageId,
  };
  if (action === 'edit_message') {
    const nextText = String(text || '').trim();
    if (!nextText) throw new Error('text الزامی است.');
    requestBody.text = nextText;
  }

  const response = await fetch(buildProviderMethodUrl(channel, settings || {}, methodName), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      typeof payload === 'string'
        ? payload
        : String(payload?.description || payload?.message || payload?.data?.status || `HTTP ${response.status}`)
    );
  }
  if (channel === 'rubika') {
    ensureRubikaSuccess(payload);
  } else {
    ensureTelegramLikeSuccess(payload);
  }
  return payload;
};

const sendTestMessage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  integration: Record<string, any>,
  channel: BotChannel,
  chatId: string,
  text: string,
  options?: {
    skipLog?: boolean;
    extraPayload?: Record<string, any>;
    fallbackText?: string;
    attachments?: Array<Record<string, any>>;
  }
) => {
  const shouldLog = options?.skipLog !== true;
  const normalizedAttachments = Array.isArray(options?.attachments)
    ? options!.attachments
      .filter((item) => item && typeof item === 'object' && String(item.url || '').trim())
    : [];
  const normalizedText = String(text || '').trim();
  const logRow = shouldLog
    ? await createOutboundLog(supabaseUrl, serviceRoleKey, {
      channel_type: channel,
      provider: String(integration?.provider || `${channel}_bot`),
      recipient: chatId,
      title: 'Test Bot Message',
      message_text: normalizedText || (normalizedAttachments.length > 0 ? '[attachment-only]' : ''),
      metadata: {
        channel,
        source: 'settings_test_send',
      },
      status: 'pending',
    })
    : null;

  try {
    let payload: any = null;
    let deliveredText = normalizedText;
    let usedFallbackMode = false;
    const providerMessages: Array<Record<string, any>> = [];

    if (channel === 'rubika' && normalizedAttachments.length > 0) {
      for (const [index, attachment] of normalizedAttachments.entries()) {
        const sentAttachment = await sendRubikaAttachmentMessage({
          settings: integration?.settings || {},
          chatId,
          text: index === 0 ? normalizedText : undefined,
          attachment,
        });
        providerMessages.push({
          message_type: String(sentAttachment.kind || 'file').trim() || 'file',
          content_text: index === 0 ? normalizedText : '',
          file_url: String(attachment?.url || '').trim() || null,
          file_name: sentAttachment.file_name,
          mime_type: sentAttachment.mime_type,
          attachment: {
            url: String(attachment?.url || '').trim() || null,
            name: sentAttachment.file_name,
            mime_type: sentAttachment.mime_type,
            file_type: String(sentAttachment.kind || 'file').trim() || 'file',
          },
          provider_result: sentAttachment.send_result,
          provider_file_id: sentAttachment.file_id,
          provider_upload: {
            request_send_file_result: sentAttachment.request_send_file_result,
            upload_result: sentAttachment.upload_result,
          },
        });
        payload = sentAttachment.send_result;
      }
    } else if (
      (channel === 'bale' || channel === 'telegram')
      && canSendTelegramLikeMediaGroup(normalizedAttachments)
    ) {
      const sentAttachments = await sendTelegramLikeMediaGroupMessage({
        channel: channel as 'bale' | 'telegram',
        settings: integration?.settings || {},
        chatId,
        text: normalizedText,
        attachments: normalizedAttachments,
      });
      for (const [index, sentAttachment] of sentAttachments.entries()) {
        const attachment = normalizedAttachments[index] || {};
        providerMessages.push({
          message_type: String(sentAttachment.kind || 'file').trim() || 'file',
          content_text: index === 0 ? normalizedText : '',
          file_url: String(attachment?.url || '').trim() || null,
          file_name: sentAttachment.file_name,
          mime_type: sentAttachment.mime_type,
          attachment: {
            url: String(attachment?.url || '').trim() || null,
            name: sentAttachment.file_name,
            mime_type: sentAttachment.mime_type,
            file_type: String(sentAttachment.kind || 'file').trim() || 'file',
          },
          provider_result: sentAttachment.send_result,
          provider_message_id: sentAttachment.provider_message_id,
        });
        payload = sentAttachment.send_result;
      }
    } else if ((channel === 'bale' || channel === 'telegram') && normalizedAttachments.length > 0) {
      for (const [index, attachment] of normalizedAttachments.entries()) {
        const sentAttachment = await sendTelegramLikeAttachmentMessage({
          channel: channel as 'bale' | 'telegram',
          settings: integration?.settings || {},
          chatId,
          text: index === 0 ? normalizedText : undefined,
          attachment,
          extraPayload: options?.extraPayload,
        });
        providerMessages.push({
          message_type: String(sentAttachment.kind || 'file').trim() || 'file',
          content_text: index === 0 ? normalizedText : '',
          file_url: String(attachment?.url || '').trim() || null,
          file_name: sentAttachment.file_name,
          mime_type: sentAttachment.mime_type,
          attachment: {
            url: String(attachment?.url || '').trim() || null,
            name: sentAttachment.file_name,
            mime_type: sentAttachment.mime_type,
            file_type: String(sentAttachment.kind || 'file').trim() || 'file',
          },
          provider_result: sentAttachment.send_result,
          provider_message_id: sentAttachment.provider_message_id,
        });
        payload = sentAttachment.send_result;
      }
    } else {
      try {
        payload = await sendProviderMessage(
          channel,
          integration?.settings || {},
          chatId,
          normalizedText,
          options?.extraPayload
        );
      } catch (primaryError: any) {
        const fallbackText = String(options?.fallbackText || '').trim();
        if (
          channel !== 'rubika'
          || !options?.extraPayload
          || !fallbackText
          || fallbackText === normalizedText
        ) {
          throw primaryError;
        }

        payload = await sendProviderMessage(
          channel,
          integration?.settings || {},
          chatId,
          fallbackText,
          undefined
        );
        deliveredText = fallbackText;
        usedFallbackMode = true;
      }
      providerMessages.push({
        message_type: 'text',
        content_text: deliveredText,
        provider_result: payload,
      });
    }

    if (logRow?.id) {
      await updateOutboundLog(supabaseUrl, serviceRoleKey, String(logRow.id), {
        status: 'sent',
        sent_at: new Date().toISOString(),
        message_text: deliveredText,
        provider_message_id: String(
          payload?.result?.message_id
          || payload?.message_id
          || payload?.data?.message_id
          || payload?.data?.message_update?.message_id
          || payload?.data?.messageUpdate?.messageId
          || ''
        ),
        metadata: shouldLog
          ? {
            channel,
            source: 'settings_test_send',
            request_extra_payload: options?.extraPayload || null,
            fallback_text: options?.fallbackText || null,
            fallback_used: usedFallbackMode,
            request_attachments: normalizedAttachments,
            provider_messages: providerMessages,
            response: payload,
          }
          : {
            channel,
            source: 'function_proxy',
            request_extra_payload: options?.extraPayload || null,
            fallback_text: options?.fallbackText || null,
            fallback_used: usedFallbackMode,
            request_attachments: normalizedAttachments,
            provider_messages: providerMessages,
            response: payload,
          },
      });
    }
    return {
      provider_result: payload,
      provider_messages: providerMessages,
      delivered_text: deliveredText,
      fallback_used: usedFallbackMode,
    };
  } catch (error: any) {
    if (logRow?.id) {
      await updateOutboundLog(supabaseUrl, serviceRoleKey, String(logRow.id), {
        status: 'failed',
        error_message: String(error?.message || error || 'Bot send failed'),
      });
    }
    throw error;
  }
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
  return [...urls];
};

const normalizePublicDownloadUrl = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const host = String(parsed.hostname || '').toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || host.endsWith('.internal');
    const preservesHttp = host.includes('rubika') || host.includes('messenger');
    if (!isLocal && !preservesHttp && parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const inferMimeTypeFromFileName = (fileName: string) => {
  const lower = String(fileName || '').trim().toLowerCase();
  if (!lower) return '';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.oga')) return 'audio/ogg';
  if (lower.endsWith('.opus')) return 'audio/ogg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.weba')) return 'audio/webm';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.rar')) return 'application/vnd.rar';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return '';
};

const inferRubikaMediaKind = ({
  fileName,
  mimeType,
  messageType,
}: {
  fileName?: string | null;
  mimeType?: string | null;
  messageType?: string | null;
}) => {
  const normalizedMime = String(mimeType || inferMimeTypeFromFileName(String(fileName || '')) || '').trim().toLowerCase();
  const normalizedType = String(messageType || '').trim().toLowerCase();
  if (normalizedMime.startsWith('image/') || normalizedType === 'image') return 'image';
  if (normalizedMime.startsWith('video/') || normalizedType === 'video') return 'video';
  if (normalizedType === 'voice' || normalizedType === 'recordaudio' || normalizedType === 'recorded_audio') return 'voice';
  if (normalizedMime.startsWith('audio/') || normalizedType === 'audio') return 'audio';
  return 'file';
};

const classifyRubikaImportFailure = (
  error: any,
  context: {
    fileId: string;
    fileName?: string | null;
    messageType?: string | null;
  }
) => {
  const rawMessage = String(error?.message || error || 'بازیابی فایل روبیکا ناموفق بود.').trim();
  const lower = rawMessage.toLowerCase();
  const errorCode = String(error?.errorCode || '').trim();
  if (errorCode) {
    return {
      error_code: errorCode,
      retryable: Boolean(error?.retryable),
      message: rawMessage,
      details: error?.details || null,
    };
  }
  if (lower.includes('public api') || lower.includes('public_base_url')) {
    return { error_code: 'public_api_base_url_missing', retryable: false, message: rawMessage, details: null };
  }
  if (lower.includes('توکن') || lower.includes('token')) {
    return { error_code: 'rubika_token_missing', retryable: false, message: rawMessage, details: null };
  }
  if (lower.includes('لینک دانلود') || lower.includes('resolve')) {
    return { error_code: 'rubika_file_resolve_failed', retryable: true, message: rawMessage, details: { file_id: context.fileId } };
  }
  if (lower.includes('دانلود فایل') || lower.includes('http ') || lower.includes('empty_body')) {
    return {
      error_code: 'rubika_file_download_failed',
      retryable: true,
      message: rawMessage,
      details: {
        file_id: context.fileId,
        file_name: context.fileName || null,
        message_type: context.messageType || null,
      },
    };
  }
  if (lower.includes('آپلود فایل') || lower.includes('storage')) {
    return { error_code: 'storage_upload_failed', retryable: true, message: rawMessage, details: null };
  }
  return { error_code: 'rubika_file_import_failed', retryable: false, message: rawMessage, details: null };
};

const buildRubikaDownloadHeaderProfiles = () => ([
  { name: 'plain', headers: {} as Record<string, string> },
  {
    name: 'rubika_referer',
    headers: {
      Accept: '*/*',
      Referer: 'https://rubika.ir/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  },
]);

const downloadRubikaBinaryFromCandidates = async (urls: string[]) => {
  const attempts: Array<Record<string, any>> = [];
  const candidates = [...new Set((urls || []).flatMap((item) => {
    const raw = String(item || '').trim();
    const normalized = normalizePublicDownloadUrl(raw);
    return [normalized || raw].filter(Boolean);
  }))];
  for (const candidate of candidates) {
    for (const profile of buildRubikaDownloadHeaderProfiles()) {
      const downloaded = await downloadBinaryFromUrl(candidate, profile.headers);
      const attempt = {
        requested_url: describeExternalUrl(candidate),
        final_url: describeExternalUrl(String(downloaded?.finalUrl || candidate).trim() || candidate),
        header_profile: profile.name,
        transport: downloaded?.transport || 'fetch',
        ok: downloaded?.ok === true,
        status: downloaded?.status ?? null,
        content_type: downloaded?.contentType || null,
        error_message: downloaded?.errorMessage || null,
        fallback_transport: downloaded?.fallbackTransport || null,
        fallback_status: downloaded?.fallbackStatus ?? null,
        fallback_content_type: downloaded?.fallbackContentType || null,
        fallback_error_message: downloaded?.fallbackErrorMessage || null,
        byte_length: downloaded?.ok === true ? Number(downloaded?.bytes?.length || 0) : 0,
      };
      attempts.push(attempt);
      if (downloaded?.ok === true && downloaded?.bytes?.length) {
        return {
          success: true,
          attempts,
          bytes: downloaded.bytes,
          contentType: downloaded.contentType || 'application/octet-stream',
          finalUrl: attempt.final_url,
        };
      }
    }
  }
  return { success: false, attempts, bytes: null, contentType: null, finalUrl: null };
};

const resolveRubikaFileUrl = async (
  settings: Record<string, any>,
  fileId: string
) => {
  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات روبیکا تنظیم نشده است.');
  const normalizedFileId = String(fileId || '').trim();
  if (!normalizedFileId) throw new Error('fileId الزامی است.');
  const baseUrl = normalizeBaseUrl(settings?.api_base_url, 'rubika');
  const endpoint = `${baseUrl}/v3/${encodeURIComponent(token)}/getFile`;
  const bodies: Array<Record<string, any>> = [{ file_id: normalizedFileId }];
  let lastError = '';
  let lastProviderResult: any = null;
  for (const body of bodies) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await parseResponse(response);
      lastProviderResult = payload;
      if (!response.ok) {
        // InvalidKey means the file access key is expired or the bot token is wrong — retrying won't help
        const rubikaErrorCode = typeof payload === 'object'
          ? String(payload?.error || payload?.data?.error || '').trim()
          : '';
        if (rubikaErrorCode === 'InvalidKey' || rubikaErrorCode === 'invalid_key') {
          throw createBotAdminError(
            String((typeof payload === 'object' ? payload?.message : null) || 'کلید دسترسی فایل روبیکا منقضی یا نامعتبر است.'),
            { errorCode: 'rubika_file_key_expired', retryable: false, details: { file_id: normalizedFileId, provider_result: payload } },
          );
        }
        lastError = typeof payload === 'string'
          ? payload
          : String(payload?.description || payload?.message || payload?.status || payload?.data?.status || `HTTP ${response.status}`);
        continue;
      }
      if (payload && typeof payload === 'object') {
        try {
          ensureRubikaSuccess(payload);
        } catch (error: any) {
          lastError = String(error?.message || error || 'Rubika getFile failed');
          continue;
        }
      }
      const fileUrls = findDeepDownloadUrls(payload).map((item) => normalizePublicDownloadUrl(item)).filter(Boolean);
      if (fileUrls.length > 0) {
        return {
          file_url: fileUrls[0],
          file_urls: fileUrls,
          request_body: body,
          provider_result: payload,
        };
      }
      lastError = 'Rubika getFile پاسخی بدون لینک دانلود برگرداند.';
    } catch (error: any) {
      lastError = String(error?.message || error || 'Rubika getFile failed');
    }
  }
  throw createBotAdminError(lastError || 'امکان دریافت لینک فایل از روبیکا وجود ندارد.', {
    errorCode: 'rubika_file_resolve_failed',
    retryable: true,
    details: {
      file_id: normalizedFileId,
      last_provider_result: lastProviderResult,
    },
  });
};

const loadCounterpartyBotMessage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  messageId: string,
  messageTable: 'counterparty_bot_messages' | 'counterparty_bot_direct_messages' = 'counterparty_bot_messages'
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${messageTable}`);
  url.searchParams.set('id', `eq.${messageId}`);
  url.searchParams.set('select', 'id,file_url,file_name,mime_type,payload');
  url.searchParams.set('limit', '1');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'خطا در خواندن پیام بات');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? (parsed[0] || null) : null;
};

const patchCounterpartyBotMessage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  messageId: string,
  payload: Record<string, any>,
  messageTable: 'counterparty_bot_messages' | 'counterparty_bot_direct_messages' = 'counterparty_bot_messages'
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${messageTable}`);
  url.searchParams.set('id', `eq.${messageId}`);
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'خطا در بروزرسانی پیام بات');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? (parsed[0] || null) : parsed;
};

const mergeImportedBotAttachments = (
  currentItems: any[],
  incomingItem: Record<string, any>,
) => {
  const byKey = new Map<string, Record<string, any>>();
  [...(Array.isArray(currentItems) ? currentItems : []), incomingItem].forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const url = String(item?.url || item?.file_url || '').trim();
    const fileId = String(item?.media_file_id || item?.file_id || item?.fileId || '').trim();
    const name = String(item?.name || item?.file_name || item?.fileName || 'فایل').trim() || 'فایل';
    const mimeType = String(item?.mime_type || item?.mimeType || '').trim() || null;
    const fileType = String(item?.file_type || item?.fileType || 'file').trim() || 'file';
    const key = fileId || url || `${name}|${fileType}|${mimeType || ''}`;
    if (!key) return;
    const existing = byKey.get(key);
    byKey.set(key, {
      ...(existing || {}),
      ...item,
      url: url || String(existing?.url || '').trim(),
      name: name || String(existing?.name || '').trim() || 'فایل',
      mime_type: mimeType || existing?.mime_type || null,
      file_type: fileType || existing?.file_type || 'file',
      media_file_id: fileId || existing?.media_file_id || null,
    });
  });
  return Array.from(byKey.values());
};

const updateCounterpartyBotMessageImportState = async ({
  supabaseUrl,
  serviceRoleKey,
  messageId,
  messageTable = 'counterparty_bot_messages',
  currentRow,
  fileName,
  mimeType,
  fileType,
  fileUrl,
  storagePath,
  providerResult,
  importStatus,
  importErrorCode,
  importErrorMessage,
  retryable,
  downloadDiagnostic,
  fileId,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  messageId: string;
  messageTable?: 'counterparty_bot_messages' | 'counterparty_bot_direct_messages';
  currentRow?: Record<string, any> | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileType?: string | null;
  fileUrl?: string | null;
  storagePath?: string | null;
  providerResult?: any;
  importStatus: 'succeeded' | 'failed';
  importErrorCode?: string | null;
  importErrorMessage?: string | null;
  retryable?: boolean | null;
  downloadDiagnostic?: Record<string, any> | null;
  fileId?: string | null;
}) => {
  const row = currentRow || await loadCounterpartyBotMessage(supabaseUrl, serviceRoleKey, messageId, messageTable);
  const currentPayload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const normalizedFileType = String(
    fileType
    || currentPayload?.file_type
    || currentPayload?.message_type
    || row?.message_type
    || 'file'
  ).trim() || 'file';
  const nextPayload: Record<string, any> = {
    ...currentPayload,
    media_import_status: importStatus,
    media_imported_at: importStatus === 'succeeded' ? new Date().toISOString() : currentPayload?.media_imported_at || null,
    media_import_attempted_at: new Date().toISOString(),
    media_import_provider_result: providerResult ?? currentPayload?.media_import_provider_result ?? null,
    media_import_error_code: importErrorCode || null,
    media_import_error_message: importErrorMessage || null,
    media_import_retryable: typeof retryable === 'boolean' ? retryable : null,
    media_download_diagnostic: downloadDiagnostic || null,
  };
  if (fileUrl) {
    const importedAttachment = {
      url: fileUrl,
      name: String(fileName || row?.file_name || 'فایل').trim() || 'فایل',
      mime_type: String(mimeType || row?.mime_type || '').trim() || null,
      file_type: normalizedFileType,
      media_file_id: String(fileId || currentPayload?.media_file_id || '').trim() || null,
    };
    nextPayload.attachments = mergeImportedBotAttachments(
      Array.isArray(currentPayload?.attachments) ? currentPayload.attachments : [],
      importedAttachment,
    );
    nextPayload.media_stored = Boolean(storagePath);
    nextPayload.media_storage_bucket = storagePath ? DEFAULT_FILE_STORAGE_BUCKET : null;
    nextPayload.media_storage_path = storagePath || null;
  }
  return patchCounterpartyBotMessage(supabaseUrl, serviceRoleKey, messageId, {
    file_url: fileUrl ? String(fileUrl).trim() : row?.file_url ?? null,
    file_name: String(fileName || row?.file_name || 'file').trim() || 'file',
    mime_type: String(mimeType || row?.mime_type || '').trim() || null,
    payload: nextPayload,
  }, messageTable);
};

const importRubikaFileToStorage = async ({
  supabaseUrl,
  serviceRoleKey,
  requestUrl,
  requestHeaders,
  integration,
  fileId,
  fileName,
  messageId,
  messageTable = 'counterparty_bot_messages',
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  requestUrl: string;
  requestHeaders: Headers;
  integration: Record<string, any>;
  fileId: string;
  fileName?: string | null;
  messageId?: string | null;
  messageTable?: 'counterparty_bot_messages' | 'counterparty_bot_direct_messages';
}) => {
  let currentRow: Record<string, any> | null = null;
  let resolvedForFailure: any = null;
  let downloadUrlsForFailure: string[] = [];
  try {
    currentRow = messageId ? await loadCounterpartyBotMessage(supabaseUrl, serviceRoleKey, messageId, messageTable) : null;
    const currentPayload = currentRow?.payload && typeof currentRow.payload === 'object' ? currentRow.payload : {};
    const resolved = await resolveRubikaFileUrl(integration?.settings || {}, fileId);
    resolvedForFailure = resolved;
    const downloadUrls = Array.isArray(resolved?.file_urls) && resolved.file_urls.length > 0
      ? resolved.file_urls
      : [String(resolved?.file_url || '').trim()].filter(Boolean);
    downloadUrlsForFailure = downloadUrls;
    if (downloadUrls.length === 0) {
      throw createBotAdminError('Rubika getFile لینک دانلود برنگرداند.', {
        errorCode: 'rubika_file_resolve_failed',
        retryable: true,
      });
    }

    const downloaded = await downloadRubikaBinaryFromCandidates(downloadUrls);
    if (!downloaded?.success || !downloaded?.bytes?.length) {
      throw createBotAdminError('دانلود فایل از روبیکا ناموفق بود.', {
        errorCode: 'rubika_file_download_failed',
        retryable: true,
        details: {
          attempts: downloaded?.attempts || [],
        },
      });
    }

    const publicBaseUrl = pickPublicApiBaseUrl(requestUrl, requestHeaders, integration?.settings || {});
    if (!publicBaseUrl) {
      throw createBotAdminError('آدرس عمومی API برای ساخت لینک فایل در دسترس نیست.', {
        errorCode: 'public_api_base_url_missing',
        retryable: false,
      });
    }

    const effectiveFileName = String(fileName || currentRow?.file_name || 'file').trim() || 'file';
    const effectiveMimeType = String(
      downloaded.contentType
      || currentRow?.mime_type
      || currentPayload?.mime_type
      || inferMimeTypeFromFileName(effectiveFileName)
      || ''
    ).trim() || 'application/octet-stream';
    const detectedKind = inferRubikaMediaKind({
      fileName: effectiveFileName,
      mimeType: effectiveMimeType,
      messageType: String(currentPayload?.file_type || currentPayload?.message_type || currentRow?.message_type || '').trim() || null,
    });

    const objectPath = buildStorageObjectPath({
      orgId: String(integration?.org_id || '').trim() || 'unknown_org',
      channel: 'rubika',
      fileName: effectiveFileName,
      mimeType: effectiveMimeType,
    });
    const publicUrl = await uploadBinaryToStorage({
      supabaseUrl,
      serviceRoleKey,
      publicBaseUrl,
      bucket: DEFAULT_FILE_STORAGE_BUCKET,
      objectPath,
      bytes: downloaded.bytes,
      contentType: effectiveMimeType,
    });

    if (messageId) {
      await updateCounterpartyBotMessageImportState({
        supabaseUrl,
        serviceRoleKey,
        messageId,
        messageTable,
        currentRow,
        fileName: effectiveFileName,
        mimeType: effectiveMimeType,
        fileType: detectedKind,
        fileUrl: publicUrl,
        storagePath: objectPath,
        fileId,
        providerResult: resolved?.provider_result || null,
        importStatus: 'succeeded',
        importErrorCode: null,
        importErrorMessage: null,
        retryable: false,
        downloadDiagnostic: {
          attempts: downloaded.attempts || [],
          final_url: downloaded.finalUrl || null,
        },
      });
    }

    return {
      file_url: publicUrl,
      file_name: effectiveFileName,
      storage_bucket: DEFAULT_FILE_STORAGE_BUCKET,
      storage_path: objectPath,
      mime_type: effectiveMimeType,
      detected_kind: detectedKind,
      provider_result: resolved?.provider_result || null,
      download_diagnostic: {
        attempts: downloaded.attempts || [],
        final_url: downloaded.finalUrl || null,
      },
    };
  } catch (error: any) {
    const currentPayload = currentRow?.payload && typeof currentRow.payload === 'object' ? currentRow.payload : {};
    const failure = classifyRubikaImportFailure(error, {
      fileId,
      fileName: fileName || currentRow?.file_name || null,
      messageType: String(currentPayload?.file_type || currentPayload?.message_type || currentRow?.message_type || '').trim() || null,
    });
    const fallbackFileName = String(fileName || currentRow?.file_name || 'file').trim() || 'file';
    const fallbackMimeType = String(
      currentRow?.mime_type
      || currentPayload?.mime_type
      || inferMimeTypeFromFileName(fallbackFileName)
      || ''
    ).trim() || null;
    const fallbackFileType = String(currentPayload?.file_type || currentPayload?.message_type || currentRow?.message_type || 'file').trim() || 'file';
    if (messageId) {
      try {
        await updateCounterpartyBotMessageImportState({
          supabaseUrl,
          serviceRoleKey,
          messageId,
          messageTable,
          currentRow,
          fileName: fallbackFileName,
          mimeType: fallbackMimeType,
          fileType: fallbackFileType,
          fileUrl: undefined,
          fileId,
          providerResult: resolvedForFailure?.provider_result || error?.details?.last_provider_result || null,
          importStatus: 'failed',
          importErrorCode: failure.error_code,
          importErrorMessage: failure.message,
          retryable: failure.retryable,
          downloadDiagnostic: error?.details?.attempts ? { attempts: error.details.attempts } : error?.details || null,
        });
      } catch (patchError) {
        console.error('[bot-admin] failed to persist rubika import failure state', String((patchError as any)?.message || patchError));
      }
    }
    throw createBotAdminError(failure.message, {
      errorCode: failure.error_code,
      retryable: failure.retryable,
      details: failure.details || error?.details || null,
    });
  }
};

const importTelegramLikeFileToStorage = async ({
  channel,
  supabaseUrl,
  serviceRoleKey,
  requestUrl,
  requestHeaders,
  integration,
  fileId,
  fileName,
  messageId,
  messageTable = 'counterparty_bot_messages',
}: {
  channel: 'telegram' | 'bale';
  supabaseUrl: string;
  serviceRoleKey: string;
  requestUrl: string;
  requestHeaders: Headers;
  integration: Record<string, any>;
  fileId: string;
  fileName?: string | null;
  messageId?: string | null;
  messageTable?: 'counterparty_bot_messages' | 'counterparty_bot_direct_messages';
}) => {
  let currentRow: Record<string, any> | null = null;
  let resolved: any = null;
  try {
    currentRow = messageId ? await loadCounterpartyBotMessage(supabaseUrl, serviceRoleKey, messageId, messageTable) : null;
    const currentPayload = currentRow?.payload && typeof currentRow.payload === 'object' ? currentRow.payload : {};
    resolved = await resolveTelegramLikeFileUrl(channel, integration?.settings || {}, fileId);
    const downloadUrl = String(resolved?.file_url || '').trim();
    if (!downloadUrl) {
      throw createBotAdminError('getFile لینک دانلود فایل را برنگرداند.', {
        errorCode: `${channel}_file_resolve_failed`,
        retryable: true,
        details: { provider_result: resolved?.provider_result || null },
      });
    }

    const downloaded = await downloadBinaryFromUrl(downloadUrl);
    if (downloaded?.ok !== true || !downloaded?.bytes?.length) {
      throw createBotAdminError('دانلود فایل از بات ناموفق بود.', {
        errorCode: `${channel}_file_download_failed`,
        retryable: true,
        details: {
          status: downloaded?.status ?? null,
          content_type: downloaded?.contentType || null,
          error_message: downloaded?.errorMessage || null,
          final_url: downloaded?.finalUrl || downloadUrl,
        },
      });
    }

    const publicBaseUrl = pickPublicApiBaseUrl(requestUrl, requestHeaders, integration?.settings || {});
    if (!publicBaseUrl) {
      throw createBotAdminError('آدرس عمومی API برای ساخت لینک فایل در دسترس نیست.', {
        errorCode: 'public_api_base_url_missing',
        retryable: false,
      });
    }

    const effectiveFileName = String(fileName || currentRow?.file_name || 'file').trim() || 'file';
    const effectiveMimeType = String(
      downloaded.contentType
      || currentRow?.mime_type
      || currentPayload?.mime_type
      || inferMimeTypeFromFileName(effectiveFileName)
      || ''
    ).trim() || 'application/octet-stream';
    const detectedKind = inferRubikaMediaKind({
      fileName: effectiveFileName,
      mimeType: effectiveMimeType,
      messageType: String(currentPayload?.file_type || currentPayload?.message_type || currentRow?.message_type || '').trim() || null,
    });

    const objectPath = buildStorageObjectPath({
      orgId: String(integration?.org_id || '').trim() || 'unknown_org',
      channel,
      fileName: effectiveFileName,
      mimeType: effectiveMimeType,
    });
    const publicUrl = await uploadBinaryToStorage({
      supabaseUrl,
      serviceRoleKey,
      publicBaseUrl,
      bucket: DEFAULT_FILE_STORAGE_BUCKET,
      objectPath,
      bytes: downloaded.bytes,
      contentType: effectiveMimeType,
    });

    if (messageId) {
      await updateCounterpartyBotMessageImportState({
        supabaseUrl,
        serviceRoleKey,
        messageId,
        messageTable,
        currentRow,
        fileName: effectiveFileName,
        mimeType: effectiveMimeType,
        fileType: detectedKind,
        fileUrl: publicUrl,
        storagePath: objectPath,
        fileId,
        providerResult: resolved?.provider_result || null,
        importStatus: 'succeeded',
        importErrorCode: null,
        importErrorMessage: null,
        retryable: false,
        downloadDiagnostic: {
          final_url: downloaded.finalUrl || downloadUrl,
          status: downloaded.status ?? null,
          content_type: downloaded.contentType || null,
        },
      });
    }

    return {
      file_url: publicUrl,
      file_name: effectiveFileName,
      storage_bucket: DEFAULT_FILE_STORAGE_BUCKET,
      storage_path: objectPath,
      mime_type: effectiveMimeType,
      detected_kind: detectedKind,
      provider_result: resolved?.provider_result || null,
      download_diagnostic: {
        final_url: downloaded.finalUrl || downloadUrl,
        status: downloaded.status ?? null,
        content_type: downloaded.contentType || null,
      },
    };
  } catch (error: any) {
    const fallbackFileName = String(fileName || currentRow?.file_name || 'file').trim() || 'file';
    const currentPayload = currentRow?.payload && typeof currentRow.payload === 'object' ? currentRow.payload : {};
    if (messageId) {
      try {
        await updateCounterpartyBotMessageImportState({
          supabaseUrl,
          serviceRoleKey,
          messageId,
          messageTable,
          currentRow,
          fileName: fallbackFileName,
          mimeType: String(currentRow?.mime_type || currentPayload?.mime_type || inferMimeTypeFromFileName(fallbackFileName) || '').trim() || null,
          fileType: String(currentPayload?.file_type || currentPayload?.message_type || currentRow?.message_type || 'file').trim() || 'file',
          fileUrl: undefined,
          fileId,
          providerResult: resolved?.provider_result || error?.details?.provider_result || null,
          importStatus: 'failed',
          importErrorCode: String(error?.errorCode || `${channel}_file_import_failed`),
          importErrorMessage: String(error?.message || 'بازیابی فایل بات ناموفق بود.'),
          retryable: typeof error?.retryable === 'boolean' ? error.retryable : true,
          downloadDiagnostic: error?.details || null,
        });
      } catch (patchError) {
        console.error('[bot-admin] failed to persist bot import failure state', String((patchError as any)?.message || patchError));
      }
    }
    throw createBotAdminError(String(error?.message || 'بازیابی فایل بات ناموفق بود.'), {
      errorCode: String(error?.errorCode || `${channel}_file_import_failed`),
      retryable: typeof error?.retryable === 'boolean' ? error.retryable : true,
      details: error?.details || null,
    });
  }
};

const diagnoseRubikaRuntime = async ({
  supabaseUrl,
  serviceRoleKey,
  requestUrl,
  requestHeaders,
  integration,
  fileId,
  chatId,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  requestUrl: string;
  requestHeaders: Headers;
  integration: Record<string, any>;
  fileId?: string | null;
  chatId?: string | null;
}) => {
  const settings = normalizeRubikaSettings(integration?.settings || {});
  const token = String(settings?.bot_token || '').trim();
  const webhookSecret = String(settings?.webhook_secret || '').trim();
  const publicBaseUrl = pickPublicApiBaseUrl(requestUrl, requestHeaders, settings);
  const normalizedFileId = String(fileId || '').trim();
  const normalizedChatId = String(chatId || '').trim();
  const missingRequirements: string[] = [];

  if (!integration?.id || integration?.is_active !== true) {
    missingRequirements.push('integration_missing_or_inactive');
  }
  if (!token) {
    missingRequirements.push('rubika_token_missing');
  }
  if (!publicBaseUrl) {
    missingRequirements.push('public_api_base_url_missing');
  }

  let resolvedFileDiagnostic: Record<string, any> | null = null;
  if (normalizedFileId && token) {
    try {
      const resolved = await resolveRubikaFileUrl(settings, normalizedFileId);
      const downloadUrl = String(resolved?.file_url || '').trim();
      const downloadProbe = downloadUrl ? await downloadBinaryFromUrl(downloadUrl) : null;
      resolvedFileDiagnostic = {
        requested_file_id: normalizedFileId,
        file_url_available: Boolean(downloadUrl),
        file_url_host: downloadUrl ? (() => {
          try {
            return new URL(downloadUrl).host;
          } catch {
            return null;
          }
        })() : null,
        download_probe: downloadUrl ? {
          ok: downloadProbe?.ok === true,
          http_status: downloadProbe?.status ?? null,
          content_type: downloadProbe?.contentType || null,
          final_url: downloadProbe?.finalUrl ? describeExternalUrl(String(downloadProbe.finalUrl)) : null,
          error_message: downloadProbe?.errorMessage || null,
        } : null,
        provider_result: resolved?.provider_result || null,
      };
      if (!downloadUrl) {
        missingRequirements.push('rubika_file_resolve_failed');
      } else if (downloadProbe?.ok !== true) {
        missingRequirements.push('rubika_file_download_failed');
      }
    } catch (error: any) {
      resolvedFileDiagnostic = {
        requested_file_id: normalizedFileId,
        file_url_available: false,
        error_message: String(error?.message || 'rubika file resolve failed'),
      };
      missingRequirements.push('rubika_file_resolve_failed');
    }
  } else if (normalizedFileId) {
    missingRequirements.push('rubika_token_missing');
  }

  const integrationProbeUrl = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/integration_settings`);
  integrationProbeUrl.searchParams.set('id', `eq.${String(integration?.id || '').trim()}`);
  integrationProbeUrl.searchParams.set('select', 'id');
  const integrationProbeResponse = await fetch(integrationProbeUrl.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });

  return {
    success: missingRequirements.length === 0,
    error_code: missingRequirements.length > 0 ? missingRequirements[0] : null,
    missing_requirements: missingRequirements,
    diagnostic: {
      integration: {
        id: String(integration?.id || '').trim() || null,
        org_id: String(integration?.org_id || '').trim() || null,
        is_active: integration?.is_active === true,
        connection_type: String(integration?.connection_type || '').trim() || null,
        provider: String(integration?.provider || '').trim() || null,
        integration_row_probe_ok: integrationProbeResponse.ok,
      },
      rubika: {
        chat_id_provided: Boolean(normalizedChatId),
        file_id_provided: Boolean(normalizedFileId),
        bot_token_present: Boolean(token),
        webhook_secret_present: Boolean(webhookSecret),
      },
      public_base_url: {
        value: publicBaseUrl || null,
        source_detected: Boolean(publicBaseUrl),
        bucket: DEFAULT_FILE_STORAGE_BUCKET,
      },
      file_import: resolvedFileDiagnostic,
    },
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { success: false, message: 'روش ارسال درخواست معتبر نیست.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { success: false, message: 'تنظیمات سرور کامل نیست. متغیرهای Supabase را بررسی کنید.' });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json(401, { success: false, message: 'نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.' });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    await verifyUserToken(supabaseUrl, serviceRoleKey, token);

    const body = (await req.json()) as BotAdminBody;
    const action = String(body?.action || '').trim();
    const channel = String(body?.channel || '').trim().toLowerCase() as BotChannel;
    const connectionId = String(body?.connectionId || '').trim();
    const cursor = body?.cursor ?? null;
    const chatId = String(body?.chatId || '').trim();
    const text = String(body?.text || '').trim();
    const fileId = String(body?.fileId || '').trim();
    const fileName = String(body?.fileName || '').trim();
    const messageId = String(body?.messageId || '').trim();
    const messageTable = String(body?.messageTable || '').trim() === 'counterparty_bot_direct_messages'
      ? 'counterparty_bot_direct_messages'
      : 'counterparty_bot_messages';
    const providerMessageId = pick(body?.providerMessageId, body?.provider_message_id);
    const attachments = Array.isArray(body?.attachments)
      ? body.attachments.filter((item) => item && typeof item === 'object')
      : [];

    if (!['telegram', 'bale', 'rubika'].includes(channel)) {
      return json(400, { success: false, message: 'channel معتبر نیست.' });
    }
    if (!connectionId) {
      return json(400, { success: false, message: 'connectionId الزامی است.' });
    }
    if (!['start_capture', 'poll_updates', 'send_test_message', 'resolve_file', 'import_bot_file', 'import_rubika_file', 'import_bale_file', 'edit_message', 'delete_message', 'diagnose_rubika_runtime'].includes(action)) {
      return json(400, { success: false, message: 'action معتبر نیست.' });
    }

    if (action === 'diagnose_rubika_runtime') {
      if (channel !== 'rubika') {
        return json(400, {
          success: false,
          error_code: 'rubika_channel_required',
          message: 'diagnose_rubika_runtime فقط برای روبیکا پشتیبانی می‌شود.',
        });
      }
      const integration = await getConnectionRecordLoose(supabaseUrl, serviceRoleKey, channel, connectionId);
      const diagnostic = await diagnoseRubikaRuntime({
        supabaseUrl,
        serviceRoleKey,
        requestUrl: req.url,
        requestHeaders: req.headers,
        integration,
        fileId: fileId || null,
        chatId: chatId || null,
      });
      return json(diagnostic.success ? 200 : 400, diagnostic);
    }

    const integration = await getConnectionRecord(supabaseUrl, serviceRoleKey, channel, connectionId);

    if (action === 'start_capture') {
      let providerResult: any = null;
      let webhookConfigured = false;
      if (channel === 'telegram') {
        providerResult = await disableTelegramLikeWebhook(channel, integration.settings || {});
      } else if (channel === 'bale') {
        try {
          providerResult = await configureBaleWebhook(supabaseUrl, req.url, req.headers, integration.settings || {});
          webhookConfigured = true;
        } catch (webhookError: any) {
          try {
            providerResult = await disableTelegramLikeWebhook('bale', integration.settings || {});
          } catch {
            providerResult = {
              webhook_configured: false,
              warning: String(webhookError?.message || webhookError || 'Bale webhook configure failed'),
            };
          }
        }
      } else if (channel === 'rubika') {
        try {
          providerResult = await configureRubikaReceiveEndpoint(supabaseUrl, req.url, req.headers, integration.settings || {});
        } catch (error: any) {
          providerResult = {
            webhook_configured: false,
            warning: String(error?.message || error || 'Rubika endpoint configure failed'),
          };
        }
      }
      const baseline = await primeChannelCursor(integration, channel, cursor);
      const captureDiagnostic = (channel === 'rubika' || channel === 'bale')
        ? {
          webhook_url: providerResult?.webhook_url || null,
          provider_http_status: providerResult?.http_status || providerResult?.provider_http_status || null,
          warning: providerResult?.warning || null,
          configured_at: providerResult?.configured_at || null,
          ...(channel === 'rubika' ? { official_api_base_url: RUBIKA_OFFICIAL_API_BASE_URL } : {}),
        }
        : null;
      return json(200, {
        success: true,
        channel,
        mode: webhookConfigured ? 'webhook' : 'get_updates',
        capture_started: true,
        webhook_configured: webhookConfigured,
        webhook_disabled: channel === 'telegram' || (channel === 'bale' && !webhookConfigured),
        provider_result: providerResult,
        capture_diagnostic: captureDiagnostic,
        cursor: baseline.cursor,
        found: false,
      });
    }

    if (action === 'send_test_message') {
      if (!chatId) {
        return json(400, { success: false, message: 'chatId الزامی است.' });
      }
      if (!text && attachments.length === 0) {
        return json(400, { success: false, message: 'text یا attachment الزامی است.' });
      }
      try {
        const payload = await sendTestMessage(supabaseUrl, serviceRoleKey, integration, channel, chatId, text, {
          skipLog: body?.skipLog === true,
          fallbackText: String(body?.fallbackText || '').trim() || undefined,
          extraPayload: body?.extraPayload && typeof body.extraPayload === 'object'
            ? body.extraPayload
            : undefined,
          attachments,
        });
        return json(200, {
          success: true,
          channel,
          message_sent: true,
          provider_result: payload?.provider_result || null,
          provider_messages: Array.isArray(payload?.provider_messages) ? payload.provider_messages : [],
          delivered_text: payload?.delivered_text || '',
          fallback_used: payload?.fallback_used === true,
        });
      } catch (error: any) {
        return json(200, {
          success: false,
          channel,
          message_sent: false,
          retryable: Boolean(error?.retryable),
          error_code: String(error?.errorCode || (attachments.length > 0 ? `${channel}_attachment_send_failed` : `${channel}_message_send_failed`)),
          details: error?.details || null,
          message: String(error?.message || 'ارسال پیام بات ناموفق بود.'),
        });
      }
    }

    if (action === 'edit_message' || action === 'delete_message') {
      if (!chatId) {
        return json(400, { success: false, message: 'chatId الزامی است.' });
      }
      if (!providerMessageId) {
        return json(400, { success: false, message: 'providerMessageId الزامی است.' });
      }
      if (action === 'edit_message' && !text) {
        return json(400, { success: false, message: 'text الزامی است.' });
      }
      const payload = await callProviderMessageAction({
        channel,
        settings: integration?.settings || {},
        action,
        chatId,
        providerMessageId,
        text,
      });
      return json(200, {
        success: true,
        channel,
        message_action: action,
        provider_message_id: providerMessageId,
        provider_result: payload,
      });
    }

    if (action === 'resolve_file') {
      if (!fileId) {
        return json(400, { success: false, message: 'fileId الزامی است.' });
      }
      if (channel === 'rubika') {
        const resolved = await resolveRubikaFileUrl(integration?.settings || {}, fileId);
        return json(200, {
          success: true,
          channel,
          file_id: fileId,
          file_url: String(resolved?.file_url || '').trim() || null,
          provider_result: resolved?.provider_result || null,
        });
      }
      if (channel === 'bale' || channel === 'telegram') {
        const resolved = await resolveTelegramLikeFileUrl(channel, integration?.settings || {}, fileId);
        return json(200, {
          success: Boolean(resolved?.file_url),
          channel,
          file_id: fileId,
          file_url: String(resolved?.file_url || '').trim() || null,
          provider_result: resolved?.provider_result || null,
        });
      }
      return json(400, { success: false, message: 'resolve_file برای این کانال پشتیبانی نمی‌شود.' });
    }

    if (action === 'import_bot_file') {
      if (!fileId) {
        return json(400, { success: false, message: 'fileId الزامی است.' });
      }
      try {
        const imported = channel === 'rubika'
          ? await importRubikaFileToStorage({
              supabaseUrl,
              serviceRoleKey,
              requestUrl: req.url,
              requestHeaders: req.headers,
              integration,
              fileId,
              fileName: fileName || null,
              messageId: messageId || null,
              messageTable,
            })
          : (channel === 'telegram' || channel === 'bale')
            ? await importTelegramLikeFileToStorage({
                channel,
                supabaseUrl,
                serviceRoleKey,
                requestUrl: req.url,
                requestHeaders: req.headers,
                integration,
                fileId,
                fileName: fileName || null,
                messageId: messageId || null,
                messageTable,
              })
            : null;
        if (!imported) {
          return json(400, { success: false, message: 'import_bot_file برای این کانال پشتیبانی نمی‌شود.' });
        }
        return json(200, {
          success: true,
          channel,
          message_id: messageId || null,
          file_id: fileId,
          ...imported,
        });
      } catch (error: any) {
        return json(200, {
          success: false,
          channel,
          message_id: messageId || null,
          file_id: fileId,
          retryable: Boolean(error?.retryable),
          error_code: String(error?.errorCode || `${channel}_file_import_failed`),
          details: error?.details || null,
          message: String(error?.message || 'بازیابی فایل بات ناموفق بود.'),
        });
      }
    }

    if (action === 'import_rubika_file') {
      if (channel !== 'rubika') {
        return json(400, { success: false, message: 'import_rubika_file فقط برای روبیکا پشتیبانی می‌شود.' });
      }
      if (!fileId) {
        return json(400, { success: false, message: 'fileId الزامی است.' });
      }
      try {
        const imported = await importRubikaFileToStorage({
          supabaseUrl,
          serviceRoleKey,
          requestUrl: req.url,
          requestHeaders: req.headers,
          integration,
          fileId,
          fileName: fileName || null,
          messageId: messageId || null,
          messageTable,
        });
        return json(200, {
          success: true,
          channel,
          message_id: messageId || null,
          file_id: fileId,
          ...imported,
        });
      } catch (error: any) {
        return json(200, {
          success: false,
          channel,
          message_id: messageId || null,
          file_id: fileId,
          retryable: Boolean(error?.retryable),
          error_code: String(error?.errorCode || 'rubika_file_import_failed'),
          details: error?.details || null,
          message: String(error?.message || 'بازیابی فایل روبیکا ناموفق بود.'),
        });
      }
    }

    if (action === 'import_bale_file') {
      if (channel !== 'bale') {
        return json(400, { success: false, message: 'import_bale_file فقط برای بله پشتیبانی می‌شود.' });
      }
      if (!fileId) {
        return json(400, { success: false, message: 'fileId الزامی است.' });
      }
      const resolved = await resolveTelegramLikeFileUrl('bale', integration?.settings || {}, fileId);
      if (!resolved?.file_url) {
        return json(200, {
          success: false,
          channel,
          file_id: fileId,
          message: 'بازیابی آدرس فایل بله ناموفق بود.',
          provider_result: resolved?.provider_result || null,
        });
      }
      return json(200, {
        success: true,
        channel,
        file_id: fileId,
        file_url: resolved.file_url,
        provider_result: resolved.provider_result || null,
      });
    }

    const activationCode = pick(body?.activationCode, body?.activation_code);
    const result = await pollChannelUpdates(supabaseUrl, serviceRoleKey, integration, channel, cursor, { activationCode });
    return json(200, {
      success: true,
      channel,
      mode: 'get_updates',
      ...result,
    });
  } catch (error: any) {
    console.error('[bot-admin] error', String(error?.message || error));
    return json(400, {
      success: false,
      error_code: String(error?.errorCode || 'bot_admin_error'),
      retryable: Boolean(error?.retryable),
      details: error?.details || null,
      message: String(error?.message || 'خطا در عملیات بات'),
    });
  }
});
