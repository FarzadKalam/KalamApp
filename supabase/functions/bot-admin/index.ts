// @ts-nocheck

type BotChannel = 'telegram' | 'bale' | 'rubika';

type BotAdminBody = {
  action?: 'start_capture' | 'poll_updates' | 'send_test_message';
  channel?: BotChannel | string;
  connectionId?: string;
  cursor?: string | number | null;
  chatId?: string;
  text?: string;
  skipLog?: boolean;
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
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/integration_settings`);
  url.searchParams.set('id', `eq.${connectionId}`);
  url.searchParams.set('connection_type', `eq.${channel}_bot`);
  url.searchParams.set('select', 'id,org_id,provider,settings,is_active');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'خطا در خواندن تنظیمات بات');

  const parsed = raw ? JSON.parse(raw) : [];
  const row = Array.isArray(parsed) ? parsed[0] : null;
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
  text: string
) => {
  const token = pick(settings?.bot_token);
  if (!token) throw new Error('توکن بات تنظیم نشده است.');
  const baseUrl = String(settings?.api_base_url || DEFAULT_API_BASE_URL[channel]).trim();
  const sendMessagePath = String(settings?.send_message_path || '').trim() || DEFAULT_SEND_PATH[channel];

  let lastError: any = null;
  for (let attempt = 1; attempt <= (channel === 'rubika' ? 3 : 1); attempt += 1) {
    const response = await fetch(buildSendMessageUrl(baseUrl, token, sendMessagePath), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        channel === 'rubika'
          ? {
            chat_id: chatId,
            text,
          }
          : {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
          }
      ),
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
  options?: { skipLog?: boolean }
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
    const payload = await sendProviderMessage(channel, integration?.settings || {}, chatId, text);
    if (logRow?.id) {
      await updateOutboundLog(supabaseUrl, serviceRoleKey, String(logRow.id), {
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_message_id: String(payload?.result?.message_id || payload?.message_id || payload?.data?.message_id || ''),
        metadata: shouldLog
          ? {
            channel,
            source: 'settings_test_send',
            response: payload,
          }
          : {
            channel,
            source: 'function_proxy',
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

    if (!['telegram', 'bale', 'rubika'].includes(channel)) {
      return json(400, { success: false, message: 'channel معتبر نیست.' });
    }
    if (!connectionId) {
      return json(400, { success: false, message: 'connectionId الزامی است.' });
    }
    if (!['start_capture', 'poll_updates', 'send_test_message'].includes(action)) {
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
      });
      return json(200, {
        success: true,
        channel,
        message_sent: true,
        provider_result: payload,
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
