// @ts-nocheck

const FUNCTION_BUILD = 'telefonchy-call-webhook-2026-06-14-02';

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
    if (value === false) continue;
    if (value !== null && typeof value === 'object') continue;
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

const isPlainObject = (value: any) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeTelefonchyPayload = (payload: Record<string, any>) => {
  const data = isPlainObject(payload?.data) ? payload.data : {};
  const exten = isPlainObject(data?.exten) ? data.exten : isPlainObject(payload?.exten) ? payload.exten : {};

  return {
    ...payload,
    ...data,
    call_id: firstValue(data.call_id, data.cuid, data.unique_id, payload.call_id, payload.cuid, payload.unique_id, payload.id),
    object_id: firstValue(data.object_id, data.id, payload.object_id, payload.objectId),
    extension: firstValue(data.extension, data.operator_extension, exten.number, exten.id, payload.extension, payload.operator_extension),
    file_id: firstValue(data.file_id, data.record_id, payload.file_id, payload.fileId, payload.record_id),
    trunk: firstValue(data.trunk, data.trunk_number, payload.trunk, payload.trunk_number),
    started_at: firstValue(data.started_at, data.start_at, data.start_time, data.datetime, data.created_at, payload.started_at, payload.start_at, payload.start_time, payload.created_at),
    ended_at: firstValue(data.ended_at, data.end_at, data.end_time, payload.ended_at, payload.end_at, payload.end_time, payload.updated_at),
    call_source: firstValue(data.call_source, data.src, payload.call_source, payload.src),
    call_dest: firstValue(data.call_dest, data.dest, payload.call_dest, payload.dest),
    status: firstValue(data.status, data.call_status, data.disposition, data.event, payload.status, payload.call_status, payload.disposition, payload.event),
    type: firstValue(data.type, data.direction, data.call_type, payload.type, payload.direction, payload.call_type),
  };
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

const jalaliToGregorian = (jy: number, jm: number, jd: number) => {
  const div = (a: number, b: number) => Math.floor(a / b);
  jy += 1595;
  let days = -355668 + (365 * jy) + (div(jy, 33) * 8) + div(((jy % 33) + 3), 4) + jd;
  days += jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186;

  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }

  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > monthDays[gm]) {
    gd -= monthDays[gm];
    gm += 1;
  }

  return { year: gy, month: gm, day: gd };
};

const toIsoOrNull = (value: any) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const jalaliMatch = raw.match(/^(1[34]\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (jalaliMatch) {
    const [, jy, jm, jd, hh = '0', mm = '0', ss = '0'] = jalaliMatch;
    const g = jalaliToGregorian(Number(jy), Number(jm), Number(jd));
    return new Date(Date.UTC(g.year, g.month - 1, g.day, Number(hh), Number(mm), Number(ss))).toISOString();
  }
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
    url.searchParams.set('select', 'id,metadata');
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

const findRecentPendingOutgoingCall = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  row: Record<string, any>,
) => {
  if (
    String(row.direction || '') !== 'outgoing'
    || !String(row.destination_number || '').trim()
    || !String(row.extension || '').trim()
  ) return null;

  const url = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs`);
  url.searchParams.set('org_id', `eq.${row.org_id}`);
  url.searchParams.set('provider', `eq.${row.provider}`);
  url.searchParams.set('direction', 'eq.outgoing');
  url.searchParams.set('destination_number', `eq.${row.destination_number}`);
  url.searchParams.set('extension', `eq.${row.extension}`);
  url.searchParams.set('status', 'eq.ringing');
  url.searchParams.set('created_at', `gte.${new Date(Date.now() - 5 * 60 * 1000).toISOString()}`);
  url.searchParams.set('select', 'id,metadata');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '1');
  const response = await fetch(url.toString(), { headers: getServiceHeaders(serviceRoleKey) });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'خواندن تماس خروجی در انتظار ناموفق بود.');
  const rows = parseJsonSafe(raw);
  return Array.isArray(rows) ? rows[0] : null;
};

const saveCallLog = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  row: Record<string, any>
) => {
  let existing = await findExistingCallLog(
    supabaseUrl,
    serviceRoleKey,
    row.org_id,
    row.provider,
    String(row.call_id || ''),
    String(row.object_id || '')
  );
  if (!existing) {
    existing = await findRecentPendingOutgoingCall(supabaseUrl, serviceRoleKey, row);
  }

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

  const payload = existing?.id
    ? Object.fromEntries(
        Object.entries({
          ...row,
          metadata: {
            ...(isPlainObject(existing.metadata) ? existing.metadata : {}),
            ...(isPlainObject(row.metadata) ? row.metadata : {}),
          },
        }).filter(([, value]) => value !== null && value !== undefined && value !== '')
      )
    : row;

  let result = await write(payload);
  if (!result.response.ok && /column .*title|schema cache/i.test(result.raw || '')) {
    const { title: _title, ...withoutTitle } = payload;
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
    const providerPayload = normalizeTelefonchyPayload(payload);

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
    const talkSeconds = toIntegerOrNull(firstValue(providerPayload.time_talk, providerPayload.talk_seconds, providerPayload.duration, providerPayload.billsec));
    const direction = mapDirection(firstValue(providerPayload.type, providerPayload.direction, providerPayload.call_type));
    const sourceNumber = normalizePhone(firstValue(providerPayload.call_source, providerPayload.source_number, providerPayload.source, providerPayload.from, providerPayload.caller));
    const destinationNumber = normalizePhone(firstValue(providerPayload.call_dest, providerPayload.destination_number, providerPayload.destination, providerPayload.to, providerPayload.callee));
    const explicitExtension = firstValue(
      providerPayload.extension,
      providerPayload.operator_extension,
      providerPayload.exten?.number,
      providerPayload.exten?.id,
    );
    const extension = explicitExtension || (
      direction === 'outgoing' && sourceNumber.length > 0 && sourceNumber.length <= 6
        ? sourceNumber
        : ''
    );
    const counterpartyPhone = direction === 'incoming' ? sourceNumber : destinationNumber;
    const status = mapStatus(firstValue(providerPayload.status, providerPayload.call_status, providerPayload.disposition), talkSeconds);

    await saveCallLog(supabaseUrl, serviceRoleKey, {
      org_id: settingsRow.org_id,
      provider,
      service_id: firstValue(providerPayload.service_id, providerPayload.serviceId, settings.service_id) || null,
      call_id: firstValue(providerPayload.call_id, providerPayload.callId, providerPayload.cuid, providerPayload.unique_id) || null,
      object_id: firstValue(providerPayload.object_id, providerPayload.objectId) || null,
      direction,
      status,
      source_number: sourceNumber || null,
      destination_number: destinationNumber || null,
      extension: extension || null,
      operator_code: firstValue(providerPayload.operator_code, providerPayload.operatorCode) || null,
      trunk: firstValue(providerPayload.trunk) || null,
      started_at: toIsoOrNull(firstValue(providerPayload.started_at, providerPayload.start_at, providerPayload.start_time, providerPayload.created_at)),
      ended_at: toIsoOrNull(firstValue(providerPayload.ended_at, providerPayload.end_at, providerPayload.end_time, providerPayload.updated_at)),
      wait_seconds: toIntegerOrNull(firstValue(providerPayload.time_wait, providerPayload.wait_seconds)),
      talk_seconds: talkSeconds,
      file_id: firstValue(providerPayload.file_id, providerPayload.fileId, providerPayload.record_id) || null,
      recording_url: firstValue(providerPayload.recording_url, providerPayload.recordingUrl, providerPayload.file_url, providerPayload.audio_url) || null,
      title: counterpartyPhone || sourceNumber || destinationNumber || 'تماس VoIP',
      metadata: {
        provider,
        build: FUNCTION_BUILD,
        method: req.method,
        query: scrubSecrets(query),
        payload: scrubSecrets(payload),
        provider_payload: scrubSecrets(providerPayload),
        user_agent: req.headers.get('user-agent') || null,
      },
    });

    return text(200, 'ok');
  } catch (error: any) {
    console.error('[telefonchy-call-webhook] error', String(error?.message || error));
    return text(500, 'error');
  }
});
