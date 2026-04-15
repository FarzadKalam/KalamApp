// @ts-nocheck

const FUNCTION_BUILD = 'telefonchy-call-webhook-2026-04-14-01';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kalam-webhook-secret, x-telefonchy-secret',
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

const trimTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '');

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

const scrubSecrets = (value: Record<string, any>) => {
  const scrubbed: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value || {})) {
    if (/secret|token|key/i.test(key)) {
      scrubbed[key] = entry ? '[redacted]' : entry;
    } else {
      scrubbed[key] = entry;
    }
  }
  return scrubbed;
};

const normalizePhone = (value: any) =>
  String(value || '')
    .trim()
    .replace(/[\u200e\u200f\s().-]/g, '');

const toIntegerOrNull = (value: any) => {
  const parsed = Number(String(value ?? '').trim());
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
};

const toIsoOrNull = (value: any) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw) ? raw.replace(' ', 'T') : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const mapDirection = (value: any) => {
  const raw = String(value || '').trim().toLowerCase();
  if (['incoming', 'inbound', 'in', 'ورودی'].includes(raw)) return 'incoming';
  if (['outgoing', 'outbound', 'out', 'خروجی'].includes(raw)) return 'outgoing';
  if (['internal', 'local', 'داخلی'].includes(raw)) return 'internal';
  return 'unknown';
};

const mapStatus = (value: any, talkSeconds: number | null) => {
  const raw = String(value || '').trim().toLowerCase();
  if (talkSeconds && talkSeconds > 0) return raw.includes('answer') ? 'answered' : 'completed';
  if (raw.includes('miss') || raw.includes('noanswer') || raw.includes('no_answer') || raw.includes('not answered')) return 'missed';
  if (raw.includes('fail') || raw.includes('busy') || raw.includes('cancel') || raw.includes('reject')) return 'failed';
  if (raw.includes('ring')) return 'ringing';
  if (raw.includes('answer')) return 'answered';
  if (raw.includes('complete') || raw.includes('end') || raw.includes('ok') || raw.includes('success')) return 'completed';
  return 'unknown';
};

const fetchCandidateSettings = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId?: string
) => {
  const url = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/integration_settings`);
  url.searchParams.set('connection_type', 'eq.voip');
  url.searchParams.set('is_active', 'eq.true');
  url.searchParams.set('select', 'id,org_id,provider,settings,is_active');
  url.searchParams.set('limit', orgId ? '10' : '100');
  if (orgId) url.searchParams.set('org_id', `eq.${orgId}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'خواندن تنظیمات VoIP ناموفق بود.');

  const rows = parseJsonSafe(raw);
  return Array.isArray(rows) ? rows : [];
};

const resolveSettingsRow = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  requestSecret: string,
  orgId?: string
) => {
  const envSecret = firstValue(Deno.env.get('TELEFONCHY_WEBHOOK_SECRET'));
  const rows = await fetchCandidateSettings(supabaseUrl, serviceRoleKey, orgId);

  for (const row of rows) {
    const settings = row?.settings || {};
    const expectedSecret = firstValue(settings.webhook_secret, settings.inbound_webhook_secret);
    if (expectedSecret && requestSecret === expectedSecret) return row;
    if (orgId && envSecret && requestSecret === envSecret) return row;
  }
  return null;
};

const findExistingCallLog = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  provider: string,
  callId: string,
  objectId: string
) => {
  const query = async (field: 'call_id' | 'object_id', value: string) => {
    if (!value) return null;
    const url = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs`);
    url.searchParams.set('org_id', `eq.${orgId}`);
    url.searchParams.set('provider', `eq.${provider}`);
    url.searchParams.set(field, `eq.${value}`);
    url.searchParams.set('select', 'id');
    url.searchParams.set('limit', '1');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: getServiceHeaders(serviceRoleKey),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(raw || 'خواندن گزارش تماس ناموفق بود.');

    const rows = parseJsonSafe(raw);
    return Array.isArray(rows) ? rows[0] : null;
  };

  return (await query('call_id', callId)) || (await query('object_id', objectId));
};

const saveCallLog = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  row: Record<string, any>
) => {
  const existing = await findExistingCallLog(
    supabaseUrl,
    serviceRoleKey,
    row.org_id,
    row.provider,
    String(row.call_id || ''),
    String(row.object_id || '')
  );

  const write = async (payload: Record<string, any>) => {
    const targetUrl = existing?.id
      ? `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs?id=eq.${existing.id}`
      : `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs`;
    const response = await fetch(targetUrl, {
      method: existing?.id ? 'PATCH' : 'POST',
      headers: {
        ...getServiceHeaders(serviceRoleKey),
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    return { response, raw };
  };

  let result = await write(row);
  if (!result.response.ok && /column .*title|schema cache/i.test(result.raw || '')) {
    const { title: _title, ...withoutTitle } = row;
    result = await write(withoutTitle);
  }
  if (!result.response.ok) throw new Error(result.raw || 'ذخیره گزارش تماس ناموفق بود.');

  const parsed = parseJsonSafe(result.raw);
  return Array.isArray(parsed) ? parsed[0] : parsed;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return text(200, 'ok');
  if (req.method !== 'GET' && req.method !== 'POST') return text(405, 'Method Not Allowed');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json(500, { success: false, message: 'تنظیمات سرور کامل نیست. متغیرهای Supabase را بررسی کنید.' });

  try {
    const url = new URL(req.url);
    const query = Object.fromEntries(url.searchParams.entries());
    const body = await readBody(req);
    const payload = { ...query, ...body };

    const requestSecret = firstValue(
      req.headers.get('x-kalam-webhook-secret'),
      req.headers.get('x-telefonchy-secret'),
      payload.secret,
      payload.webhook_secret,
      payload.token,
      payload.key
    );
    const orgId = firstValue(payload.org_id, payload.orgId, payload.org);
    if (!requestSecret) return text(401, 'missing secret');

    const settingsRow = await resolveSettingsRow(supabaseUrl, serviceRoleKey, requestSecret, orgId || undefined);
    if (!settingsRow?.org_id) return text(401, 'unauthorized');

    const settings = settingsRow.settings || {};
    const provider = 'telefonchy';
    const talkSeconds = toIntegerOrNull(firstValue(payload.time_talk, payload.talk_seconds, payload.duration, payload.billsec));
    const direction = mapDirection(firstValue(payload.type, payload.direction, payload.call_type));
    const sourceNumber = normalizePhone(firstValue(payload.call_source, payload.source_number, payload.source, payload.from, payload.caller));
    const destinationNumber = normalizePhone(firstValue(payload.call_dest, payload.destination_number, payload.destination, payload.to, payload.callee));
    const extension = firstValue(payload.exten, payload.extension, payload.operator_extension);
    const counterpartyPhone = direction === 'incoming' ? sourceNumber : destinationNumber;
    const status = mapStatus(firstValue(payload.status, payload.call_status, payload.disposition), talkSeconds);

    await saveCallLog(supabaseUrl, serviceRoleKey, {
      org_id: settingsRow.org_id,
      provider,
      service_id: firstValue(payload.service_id, payload.serviceId, settings.service_id) || null,
      call_id: firstValue(payload.call_id, payload.callId, payload.id) || null,
      object_id: firstValue(payload.object_id, payload.objectId) || null,
      direction,
      status,
      source_number: sourceNumber || null,
      destination_number: destinationNumber || null,
      extension: extension || null,
      operator_code: firstValue(payload.operator_code, payload.operatorCode) || null,
      trunk: firstValue(payload.trunk) || null,
      started_at: toIsoOrNull(firstValue(payload.started_at, payload.start_at, payload.start_time, payload.created_at)),
      ended_at: toIsoOrNull(firstValue(payload.ended_at, payload.end_at, payload.end_time, payload.updated_at)),
      wait_seconds: toIntegerOrNull(firstValue(payload.time_wait, payload.wait_seconds)),
      talk_seconds: talkSeconds,
      file_id: firstValue(payload.file_id, payload.fileId) || null,
      recording_url: firstValue(payload.recording_url, payload.recordingUrl, payload.file_url, payload.audio_url) || null,
      title: counterpartyPhone || sourceNumber || destinationNumber || 'تماس VoIP',
      metadata: {
        provider,
        build: FUNCTION_BUILD,
        method: req.method,
        query: scrubSecrets(query),
        payload: scrubSecrets(payload),
        user_agent: req.headers.get('user-agent') || null,
      },
    });

    return text(200, 'ok');
  } catch (error: any) {
    console.error('[telefonchy-call-webhook] error', String(error?.message || error));
    return text(500, 'error');
  }
});
