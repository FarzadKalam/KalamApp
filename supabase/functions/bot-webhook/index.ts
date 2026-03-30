// @ts-nocheck

type BotChannel = 'telegram' | 'bale' | 'rubika';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BOT_WEBHOOK_BUILD = 'bot-webhook-2026-03-24-03';

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

const getDisplayName = (obj: Record<string, any> | null | undefined) => {
  if (!obj || typeof obj !== 'object') return '';
  const first = String(obj.first_name || obj.firstName || '').trim();
  const last = String(obj.last_name || obj.lastName || '').trim();
  const direct = pick(obj.name, obj.title, obj.display_name, obj.displayName, obj.full_name, obj.fullName);
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return pick(direct, combined);
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
    rubikaUpdate?.chat_id,
    rubikaInlineMessage?.chat_id,
    payload?.chat_id,
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

const findIntegrationBySecret = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  channel: BotChannel,
  secret: string
) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/integration_settings`);
  url.searchParams.set('connection_type', `eq.${channel}_bot`);
  url.searchParams.set('is_active', 'eq.true');
  url.searchParams.set('select', 'id,org_id,provider,settings');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || '??? ?? ?????? ??????? ???');

  const rows = raw ? JSON.parse(raw) : [];
  const row = Array.isArray(rows)
    ? rows.find((item) => String(item?.settings?.webhook_secret || '').trim() === secret)
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

    return json(200, {
      success: true,
      channel,
      chat_id: contact.chatId,
      contact: saved,
    });
  } catch (error: any) {
    console.error('[bot-webhook] error', String(error?.message || error));
    return json(400, {
      success: false,
      message: String(error?.message || '??? ?? ?????? webhook ???'),
    });
  }
});