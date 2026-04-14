// @ts-nocheck

type BotChannel = 'telegram' | 'bale' | 'rubika';

type BotAdminBody = {
  action?: 'start_capture' | 'poll_updates' | 'send_test_message' | 'resolve_file' | 'import_rubika_file';
  channel?: BotChannel | string;
  connectionId?: string;
  cursor?: string | number | null;
  chatId?: string;
  text?: string;
  fallbackText?: string;
  fileId?: string;
  fileName?: string;
  messageId?: string;
  skipLog?: boolean;
  extraPayload?: Record<string, any>;
};

type InboundContact = {
  chatId: string;
  username: string;
  phoneNumber: string;
  displayName: string;
  text: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BOT_ADMIN_BUILD = 'bot-admin-2026-04-11-16';

const DEFAULT_API_BASE_URL: Record<BotChannel, string> = {
  telegram: 'https://api.telegram.org',
  bale: 'https://tapi.bale.ai',
  rubika: 'https://botapi.rubika.ir',
};

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
  const raw = String(value || DEFAULT_API_BASE_URL[channel] || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw.replace(/\/+$/, '')}`;
};

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
    return forceHttpsIfPublic(normalizeBaseUrl(explicitBase, 'rubika'));
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

const buildSendMessageUrl = (baseUrl: string, token: string, pathTemplate: string) => {
  const normalizedBase = normalizeBaseUrl(baseUrl, 'telegram');
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
  const candidates = [
    settings?.public_api_base_url,
    settings?.public_supabase_url,
    Deno.env.get('BOT_WEBHOOK_PUBLIC_BASE_URL'),
    Deno.env.get('PUBLIC_API_BASE_URL'),
    Deno.env.get('VITE_SUPABASE_URL'),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeBaseUrl(String(candidate || '').trim(), 'rubika');
    if (normalized) return normalized;
  }

  const forwardedProto = pick(headers?.get('x-forwarded-proto'), headers?.get('x-forwarded-protocol'));
  const forwardedHost = pick(headers?.get('x-forwarded-host')).split(',')[0]?.trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, '');
  }

  const host = pick(headers?.get('host')).split(',')[0]?.trim();
  if (host) {
    return `https://${host}`.replace(/\/+$/, '');
  }

  try {
    const origin = new URL(String(requestUrl || '')).origin.replace(/\/+$/, '');
    if (origin) return origin;
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
    throw new Error(raw || 'Could not upload media file to storage');
  }
  return buildPublicObjectUrl(publicBaseUrl, bucket, objectPath);
};

const downloadBinaryFromUrl = async (url: string) => {
  const target = String(url || '').trim();
  if (!target) return null;
  const response = await fetch(target, { method: 'GET' });
  if (!response.ok) return null;
  const contentType = String(response.headers.get('content-type') || '').trim() || 'application/octet-stream';
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) return null;
  return { bytes, contentType };
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
    throw new Error(raw || 'Unauthorized');
  }

  const user = await response.json();
  if (!user?.id) throw new Error('Unauthorized');
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

const getDisplayName = (obj: Record<string, any> | null | undefined) => {
  if (!obj || typeof obj !== 'object') return '';
  const first = String(obj.first_name || obj.firstName || '').trim();
  const last = String(obj.last_name || obj.lastName || '').trim();
  const direct = pick(obj.name, obj.title, obj.display_name, obj.displayName, obj.full_name, obj.fullName);
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return pick(direct, combined);
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
    callbackQuery?.message?.chat?.id,
    callbackQuery?.message?.chat_id,
    payload?.chat_id,
    rubikaUpdate?.chat_id,
    rubikaInlineMessage?.chat_id,
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

  return {
    chatId,
    username,
    phoneNumber,
    displayName,
    text,
  };
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
    throw new Error(rootStatus);
  }
  if (nestedStatus && nestedStatus.toUpperCase() !== 'OK') {
    throw new Error(nestedStatus);
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: false }),
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
  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const secret = pick(settings?.webhook_secret);
  if (!secret) throw new Error('Webhook Secret برای بات روبیکا تنظیم نشده است.');

  const baseUrl = normalizeBaseUrl(settings?.api_base_url, 'rubika');
  const webhookBase = pickWebhookPublicBase(requestUrl, supabaseUrl, requestHeaders, settings);
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
    limit: 10,
    timeout: 0,
  };
  const offset = Number(cursor);
  if (Number.isFinite(offset)) {
    body.offset = offset;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const baseUrl = normalizeBaseUrl(settings?.api_base_url, 'rubika');
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
      const nextCursor = pick(payload?.next_offset_id, payload?.data?.next_offset_id, payload?.result?.next_offset_id, offsetId);

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

const pickLatestContact = (updates: any[]) => {
  if (!Array.isArray(updates) || updates.length === 0) return null;
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const item = updates[index];
    const contact = extractContact(item || {});
    if (contact.chatId) {
      return {
        contact,
        payload: item,
      };
    }
  }
  return null;
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
  cursor?: string | number | null
) => {
  const settings = integration?.settings || {};
  const result = channel === 'rubika'
    ? await callRubikaGetUpdates(settings, cursor)
    : await callTelegramLikeGetUpdates(channel as 'telegram' | 'bale', settings, cursor);

  const raw = (result as any)?.raw || {};
  const debug = {
    status: String(raw?.status || '').trim() || null,
    message: String(raw?.message || raw?.description || '').trim() || null,
    has_updates_array: Array.isArray(raw?.updates) || Array.isArray(raw?.data?.updates) || Array.isArray(raw?.result?.updates),
  };

  const found = pickLatestContact(result.updates);
  if (!found) {
    return {
      found: false,
      cursor: result.nextCursor,
      contact: null,
      provider_result_count: Array.isArray(result.updates) ? result.updates.length : 0,
      provider_debug: debug,
    };
  }

  const saved = await saveInboundContact(supabaseUrl, serviceRoleKey, integration, channel, found);
  return {
    found: true,
    cursor: result.nextCursor,
    contact: saved,
    provider_result_count: Array.isArray(result.updates) ? result.updates.length : 0,
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
  const baseUrl = String(settings?.api_base_url || DEFAULT_API_BASE_URL[channel]).trim();
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
    const response = await fetch(buildSendMessageUrl(baseUrl, token, sendMessagePath), {
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
      ensureRubikaSuccess(payload);
    } else {
      ensureTelegramLikeSuccess(payload);
    }

    return payload;
  }

  throw lastError || new Error('Bot send failed');
};

const sendTestMessage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  integration: Record<string, any>,
  channel: BotChannel,
  chatId: string,
  text: string,
  options?: { skipLog?: boolean; extraPayload?: Record<string, any>; fallbackText?: string }
) => {
  const shouldLog = options?.skipLog !== true;
  const logRow = shouldLog
    ? await createOutboundLog(supabaseUrl, serviceRoleKey, {
      channel_type: channel,
      provider: String(integration?.provider || `${channel}_bot`),
      recipient: chatId,
      title: 'Test Bot Message',
      message_text: text,
      metadata: {
        channel,
        source: 'settings_test_send',
      },
      status: 'pending',
    })
    : null;

  try {
    let payload: any;
    let deliveredText = text;
    let usedFallbackMode = false;
    try {
      payload = await sendProviderMessage(
        channel,
        integration?.settings || {},
        chatId,
        text,
        options?.extraPayload
      );
    } catch (primaryError: any) {
      const fallbackText = String(options?.fallbackText || '').trim();
      if (
        channel !== 'rubika'
        || !options?.extraPayload
        || !fallbackText
        || fallbackText === String(text || '').trim()
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

    if (logRow?.id) {
      await updateOutboundLog(supabaseUrl, serviceRoleKey, String(logRow.id), {
        status: 'sent',
        sent_at: new Date().toISOString(),
        message_text: deliveredText,
        provider_message_id: String(payload?.result?.message_id || payload?.message_id || payload?.data?.message_id || ''),
        metadata: shouldLog
          ? {
            channel,
            source: 'settings_test_send',
            request_extra_payload: options?.extraPayload || null,
            fallback_text: options?.fallbackText || null,
            fallback_used: usedFallbackMode,
            response: payload,
          }
          : {
            channel,
            source: 'function_proxy',
            request_extra_payload: options?.extraPayload || null,
            fallback_text: options?.fallbackText || null,
            fallback_used: usedFallbackMode,
            response: payload,
          },
      });
    }
    return payload;
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
  const bodies: Array<Record<string, any>> = [
    { file_id: normalizedFileId },
    { fileId: normalizedFileId },
    { id: normalizedFileId },
    { file: normalizedFileId },
    { file_id: normalizedFileId, download_type: 'file' },
  ];
  let lastError = '';
  for (const body of bodies) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
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
      const fileUrl = findDeepDownloadUrl(payload);
      if (fileUrl) {
        return {
          file_url: fileUrl,
          provider_result: payload,
        };
      }
      lastError = 'Rubika getFile پاسخی بدون لینک دانلود برگرداند.';
    } catch (error: any) {
      lastError = String(error?.message || error || 'Rubika getFile failed');
    }
  }
  throw new Error(lastError || 'امکان دریافت لینک فایل از روبیکا وجود ندارد.');
};

const loadCounterpartyBotMessage = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  messageId: string
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_messages`);
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
  payload: Record<string, any>
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/counterparty_bot_messages`);
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

const importRubikaFileToStorage = async ({
  supabaseUrl,
  serviceRoleKey,
  requestUrl,
  requestHeaders,
  integration,
  fileId,
  fileName,
  messageId,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  requestUrl: string;
  requestHeaders: Headers;
  integration: Record<string, any>;
  fileId: string;
  fileName?: string | null;
  messageId?: string | null;
}) => {
  const resolved = await resolveRubikaFileUrl(integration?.settings || {}, fileId);
  const downloadUrl = String(resolved?.file_url || '').trim();
  if (!downloadUrl) {
    throw new Error('Rubika getFile لینک دانلود برنگرداند.');
  }

  const downloaded = await downloadBinaryFromUrl(downloadUrl);
  if (!downloaded?.bytes?.length) {
    throw new Error('دانلود فایل از روبیکا ناموفق بود.');
  }

  const publicBaseUrl = pickPublicApiBaseUrl(requestUrl, requestHeaders, integration?.settings || {});
  if (!publicBaseUrl) {
    throw new Error('آدرس عمومی API برای ساخت لینک فایل در دسترس نیست.');
  }

  const objectPath = buildStorageObjectPath({
    orgId: String(integration?.org_id || '').trim() || 'unknown_org',
    channel: 'rubika',
    fileName: String(fileName || 'file').trim() || 'file',
    mimeType: String(downloaded.contentType || '').trim() || null,
  });
  const publicUrl = await uploadBinaryToStorage({
    supabaseUrl,
    serviceRoleKey,
    publicBaseUrl,
    bucket: DEFAULT_FILE_STORAGE_BUCKET,
    objectPath,
    bytes: downloaded.bytes,
    contentType: downloaded.contentType || 'application/octet-stream',
  });

  if (messageId) {
    const currentRow = await loadCounterpartyBotMessage(supabaseUrl, serviceRoleKey, messageId);
    const currentPayload = currentRow?.payload && typeof currentRow.payload === 'object' ? currentRow.payload : {};
    const mergedAttachments = [
      {
        url: publicUrl,
        name: String(fileName || currentRow?.file_name || 'فایل').trim() || 'فایل',
        mime_type: String(downloaded.contentType || currentRow?.mime_type || '').trim() || null,
      },
    ];
    await patchCounterpartyBotMessage(supabaseUrl, serviceRoleKey, messageId, {
      file_url: publicUrl,
      file_name: String(fileName || currentRow?.file_name || 'file').trim() || 'file',
      mime_type: String(downloaded.contentType || currentRow?.mime_type || '').trim() || null,
      payload: {
        ...currentPayload,
        attachments: mergedAttachments,
        media_stored: true,
        media_storage_bucket: DEFAULT_FILE_STORAGE_BUCKET,
        media_storage_path: objectPath,
        media_imported_at: new Date().toISOString(),
        media_import_provider_result: resolved?.provider_result || null,
      },
    });
  }

  return {
    file_url: publicUrl,
    storage_bucket: DEFAULT_FILE_STORAGE_BUCKET,
    storage_path: objectPath,
    mime_type: String(downloaded.contentType || '').trim() || null,
    provider_result: resolved?.provider_result || null,
  };
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
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json(401, { success: false, message: 'Missing bearer token' });
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

    if (!['telegram', 'bale', 'rubika'].includes(channel)) {
      return json(400, { success: false, message: 'channel معتبر نیست.' });
    }
    if (!connectionId) {
      return json(400, { success: false, message: 'connectionId الزامی است.' });
    }
    if (!['start_capture', 'poll_updates', 'send_test_message', 'resolve_file', 'import_rubika_file'].includes(action)) {
      return json(400, { success: false, message: 'action معتبر نیست.' });
    }

    const integration = await getConnectionRecord(supabaseUrl, serviceRoleKey, channel, connectionId);

    if (action === 'start_capture') {
      let providerResult: any = null;
      if (channel === 'telegram' || channel === 'bale') {
        providerResult = await disableTelegramLikeWebhook(channel, integration.settings || {});
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
      const baseline = channel === 'rubika'
        ? { cursor: null, provider_result_count: 0 }
        : await primeChannelCursor(integration, channel, cursor);
      return json(200, {
        success: true,
        channel,
        mode: 'get_updates',
        capture_started: true,
        webhook_disabled: channel === 'telegram' || channel === 'bale',
        provider_result: providerResult,
        cursor: baseline.cursor,
        found: false,
      });
    }

    if (action === 'send_test_message') {
      if (!chatId) {
        return json(400, { success: false, message: 'chatId الزامی است.' });
      }
      if (!text) {
        return json(400, { success: false, message: 'text الزامی است.' });
      }
      const payload = await sendTestMessage(supabaseUrl, serviceRoleKey, integration, channel, chatId, text, {
        skipLog: body?.skipLog === true,
        fallbackText: String(body?.fallbackText || '').trim() || undefined,
        extraPayload: body?.extraPayload && typeof body.extraPayload === 'object'
          ? body.extraPayload
          : undefined,
      });
      return json(200, {
        success: true,
        channel,
        message_sent: true,
        provider_result: payload,
      });
    }

    if (action === 'resolve_file') {
      if (channel !== 'rubika') {
        return json(400, { success: false, message: 'resolve_file فقط برای روبیکا پشتیبانی می‌شود.' });
      }
      if (!fileId) {
        return json(400, { success: false, message: 'fileId الزامی است.' });
      }
      const resolved = await resolveRubikaFileUrl(integration?.settings || {}, fileId);
      return json(200, {
        success: true,
        channel,
        file_id: fileId,
        file_url: String(resolved?.file_url || '').trim() || null,
        provider_result: resolved?.provider_result || null,
      });
    }

    if (action === 'import_rubika_file') {
      if (channel !== 'rubika') {
        return json(400, { success: false, message: 'import_rubika_file فقط برای روبیکا پشتیبانی می‌شود.' });
      }
      if (!fileId) {
        return json(400, { success: false, message: 'fileId الزامی است.' });
      }
      const imported = await importRubikaFileToStorage({
        supabaseUrl,
        serviceRoleKey,
        requestUrl: req.url,
        requestHeaders: req.headers,
        integration,
        fileId,
        fileName: fileName || null,
        messageId: messageId || null,
      });
      return json(200, {
        success: true,
        channel,
        message_id: messageId || null,
        file_id: fileId,
        ...imported,
      });
    }

    const result = await pollChannelUpdates(supabaseUrl, serviceRoleKey, integration, channel, cursor);
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
      message: String(error?.message || 'خطا در عملیات بات'),
    });
  }
});
