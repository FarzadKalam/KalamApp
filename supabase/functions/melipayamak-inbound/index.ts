// @ts-nocheck

const FUNCTION_BUILD = 'melipayamak-inbound-2026-08-25-02';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Kalam-Function-Build': FUNCTION_BUILD,
    },
  });

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Kalam-Function-Build': FUNCTION_BUILD,
    },
  });

const getServiceHeaders = (serviceRoleKey: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
});

const normalizePhone = (value: any) =>
  String(value || '')
    .trim()
    .replace(/[\u200e\u200f\s-]/g, '');

const normalizeBodyText = (value: any) =>
  String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();

const parseJsonSafe = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const readBody = async (req: Request) => {
  if (req.method !== 'POST') return {};
  const contentType = String(req.headers.get('content-type') || '').toLowerCase();
  const raw = await req.text();
  if (!raw) return {};
  if (contentType.includes('application/json')) return parseJsonSafe(raw);
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  if (raw.includes('=') && raw.includes('&')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  return { raw_body: raw };
};

const firstValue = (...values: any[]) => {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized) continue;
    if (/^\$[A-Z_]+\$$/.test(normalized)) continue;
    if (/^\{[A-Z_]+\}$/i.test(normalized)) continue;
    if (/^%[A-Z_]+%$/i.test(normalized)) continue;
    return normalized;
  }
  return '';
};

const pickPayloadValue = (payload: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const direct = firstValue(payload[key]);
    if (direct) return direct;
    const foundKey = Object.keys(payload).find((item) => item.toLowerCase() === key.toLowerCase());
    if (foundKey) {
      const value = firstValue(payload[foundKey]);
      if (value) return value;
    }
  }
  return '';
};

const compactPayloadText = (payload: Record<string, any>) => {
  try {
    return JSON.stringify(payload).slice(0, 1800);
  } catch {
    return String(payload || '').slice(0, 1800);
  }
};

const fetchSmsSettings = async (supabaseUrl: string, serviceRoleKey: string, orgId: string) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/integration_settings`);
  url.searchParams.set('org_id', `eq.${orgId}`);
  url.searchParams.set('connection_type', 'eq.sms');
  url.searchParams.set('is_active', 'eq.true');
  url.searchParams.set('select', 'id,settings');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'Could not load SMS settings');

  const rows = raw ? JSON.parse(raw) : [];
  return Array.isArray(rows) ? rows[0] : null;
};

const insertInboundSms = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  row: Record<string, any>
) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/outbound_messages`, {
    method: 'POST',
    headers: {
      ...getServiceHeaders(serviceRoleKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const raw = await response.text();
  if (response.status === 409) return null;
  if (!response.ok) throw new Error(raw || 'Could not insert inbound SMS');
  const rows = raw ? JSON.parse(raw) : [];
  return String(Array.isArray(rows) ? rows[0]?.id || '' : rows?.id || '').trim() || null;
};

const captureCampaignResponse = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: { orgId: string; inboundMessageId: string; sender: string; receiver: string; messageText: string },
) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/capture_advertising_campaign_sms_response`, {
    method: 'POST',
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify({
      p_org_id: payload.orgId,
      p_inbound_message_id: payload.inboundMessageId,
      p_sender: payload.sender,
      p_receiver: payload.receiver,
      p_message_text: payload.messageText,
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'Could not capture campaign SMS response');
  return raw ? JSON.parse(raw) : null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return text(200, 'ok');
  if (req.method !== 'GET' && req.method !== 'POST') return text(405, 'Method Not Allowed');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json(500, { success: false, message: 'Missing Supabase environment variables' });

  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams.entries());

  try {
    const body = await readBody(req);
    const payload = { ...query, ...body };

    const orgId = firstValue(payload.org_id, payload.orgId, payload.org);
    const requestSecret = firstValue(payload.secret, payload.webhook_secret, payload.token, payload.key);
    if (!orgId || !requestSecret) {
      return text(401, 'missing org_id or secret');
    }

    const settingsRow = await fetchSmsSettings(supabaseUrl, serviceRoleKey, orgId);
    const settings = settingsRow?.settings || {};
    const expectedSecret = firstValue(
      settings.inbound_webhook_secret,
      settings.webhook_secret,
      Deno.env.get('MELIPAYAMAK_INBOUND_SECRET')
    );
    if (!settingsRow || !expectedSecret || requestSecret !== expectedSecret) {
      return text(401, 'unauthorized');
    }

    const sender = normalizePhone(pickPayloadValue(payload, [
      'from',
      'sender',
      'mobile',
      'phone',
      'source',
      'src',
      'number',
      'senderNumber',
      'SenderNumber',
    ]));
    const recipient = normalizePhone(pickPayloadValue(payload, [
      'to',
      'recipient',
      'receiver',
      'destination',
      'dst',
      'line',
      'shortcode',
      'receiverNumber',
      'ReceiverNumber',
    ]));
    const messageText = normalizeBodyText(pickPayloadValue(payload, [
      'body',
      'text',
      'message',
      'msg',
      'sms',
      'content',
      'messageText',
      'MessageText',
      'smsText',
      'SmsText',
      'TEXT',
    ]));
    const providerMessageId = pickPayloadValue(payload, ['id', 'message_id', 'msgid', 'recId', 'rec_id', 'MessageId', 'messageId']);

    const configuredSenderNumbers = Array.from(new Set([
      ...(Array.isArray(settings.sender_numbers) ? settings.sender_numbers : []),
      settings.sender_number,
    ].map(normalizePhone).filter(Boolean)));
    if (recipient && configuredSenderNumbers.length > 0 && !configuredSenderNumbers.includes(recipient)) {
      console.warn('[melipayamak-inbound] ignored unknown receiver line');
      return text(200, 'ok');
    }

    if (!sender || !recipient || !messageText) {
      console.warn('[melipayamak-inbound] ignored incomplete payload', JSON.stringify({ hasSender: !!sender, hasRecipient: !!recipient, hasText: !!messageText }));
      await insertInboundSms(supabaseUrl, serviceRoleKey, {
        org_id: orgId,
        channel_type: 'sms',
        direction: 'inbound',
        provider: 'meli_payamak',
        provider_message_id: providerMessageId || null,
        sender: sender || null,
        recipient: recipient || null,
        title: 'پیامک ورودی ناقص',
        message_text: messageText || compactPayloadText(payload) || 'payload ناقص از ملی‌پیامک',
        status: 'ignored',
        error_message: 'payload ورودی کامل نبود: فرستنده، گیرنده یا متن پیامک پیدا نشد.',
        metadata: {
          provider: 'meli_payamak',
          method: req.method,
          query,
          payload,
          parse_result: { hasSender: !!sender, hasRecipient: !!recipient, hasText: !!messageText },
          user_agent: req.headers.get('user-agent') || null,
        },
        received_at: new Date().toISOString(),
      });
      return text(200, 'ok');
    }

    const inboundMessageId = await insertInboundSms(supabaseUrl, serviceRoleKey, {
      org_id: orgId,
      channel_type: 'sms',
      direction: 'inbound',
      provider: 'meli_payamak',
      provider_message_id: providerMessageId || null,
      sender,
      recipient,
      title: sender || 'پیامک ورودی',
      message_text: messageText,
      status: 'received',
      metadata: {
        provider: 'meli_payamak',
        method: req.method,
        query,
        payload,
        user_agent: req.headers.get('user-agent') || null,
      },
      received_at: new Date().toISOString(),
    });

    if (inboundMessageId) {
      try {
        await captureCampaignResponse(supabaseUrl, serviceRoleKey, {
          orgId,
          inboundMessageId,
          sender,
          receiver: recipient,
          messageText,
        });
      } catch (campaignError: any) {
        // The canonical inbound SMS remains stored even if campaign matching is unavailable.
        console.warn('[melipayamak-inbound] campaign response capture failed', String(campaignError?.message || campaignError));
      }
    }

    return text(200, 'ok');
  } catch (error: any) {
    console.error('[melipayamak-inbound] error', String(error?.message || error));
    return text(500, 'error');
  }
});
