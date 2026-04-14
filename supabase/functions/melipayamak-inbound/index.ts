// @ts-nocheck

const FUNCTION_BUILD = 'melipayamak-inbound-2026-04-14-02';

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
  return { raw_body: raw };
};

const firstValue = (...values: any[]) => {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
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
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  const raw = await response.text();
  if (response.status === 409) return;
  if (!response.ok) throw new Error(raw || 'Could not insert inbound SMS');
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

    const sender = normalizePhone(firstValue(payload.from, payload.FROM, payload.sender, payload.mobile, payload.source));
    const recipient = normalizePhone(firstValue(payload.to, payload.TO, payload.recipient, payload.receiver, payload.destination));
    const messageText = normalizeBodyText(firstValue(payload.body, payload.TEXT, payload.text, payload.message, payload.msg));
    const providerMessageId = firstValue(payload.id, payload.message_id, payload.msgid, payload.recId, payload.rec_id);

    if (!sender || !recipient || !messageText) {
      console.warn('[melipayamak-inbound] ignored incomplete payload', JSON.stringify({ hasSender: !!sender, hasRecipient: !!recipient, hasText: !!messageText }));
      return text(200, 'ok');
    }

    await insertInboundSms(supabaseUrl, serviceRoleKey, {
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

    return text(200, 'ok');
  } catch (error: any) {
    console.error('[melipayamak-inbound] error', String(error?.message || error));
    return text(500, 'error');
  }
});
