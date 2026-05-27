// @ts-nocheck

const FUNCTION_BUILD = 'telefonchy-smartcall-2026-04-14-01';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

const parseJsonSafe = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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

const normalizePhone = (value: any) =>
  String(value || '')
    .trim()
    .replace(/[\u200e\u200f\s().-]/g, '');

const trimTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '');

const pad2 = (value: number) => String(value).padStart(2, '0');

const gregorianToJalali = (date: Date) => {
  const div = (a: number, b: number) => Math.floor(a / b);
  const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  let gy = date.getFullYear() - 1600;
  let gm = date.getMonth();
  let gd = date.getDate() - 1;

  let gDayNo = 365 * gy + div(gy + 3, 4) - div(gy + 99, 100) + div(gy + 399, 400);
  for (let i = 0; i < gm; i += 1) gDayNo += gDaysInMonth[i];
  if (gm > 1 && ((gy + 1600) % 4 === 0 && ((gy + 1600) % 100 !== 0 || (gy + 1600) % 400 === 0))) {
    gDayNo += 1;
  }
  gDayNo += gd;

  let jDayNo = gDayNo - 79;
  const jNp = div(jDayNo, 12053);
  jDayNo %= 12053;
  let jy = 979 + 33 * jNp + 4 * div(jDayNo, 1461);
  jDayNo %= 1461;
  if (jDayNo >= 366) {
    jy += div(jDayNo - 1, 365);
    jDayNo = (jDayNo - 1) % 365;
  }

  let jm = 0;
  while (jm < 11 && jDayNo >= jDaysInMonth[jm]) {
    jDayNo -= jDaysInMonth[jm];
    jm += 1;
  }

  return { year: jy, month: jm + 1, day: jDayNo + 1 };
};

const formatTelefonchyJalaliDateTime = (date: Date, time: string) => {
  const jalali = gregorianToJalali(date);
  return `${jalali.year}/${pad2(jalali.month)}/${pad2(jalali.day)} ${time}`;
};

const verifyUserToken = async (supabaseUrl: string, serviceRoleKey: string, userToken: string) => {
  const response = await fetch(`${trimTrailingSlash(supabaseUrl)}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${userToken}`,
    },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.');

  const user = parseJsonSafe(raw);
  if (!user?.id) throw new Error('نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.');
  return user;
};

const fetchProfile = async (supabaseUrl: string, serviceRoleKey: string, userId: string) => {
  const url = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/profiles`);
  url.searchParams.set('id', `eq.${userId}`);
  url.searchParams.set(
    'select',
    'id,org_id,full_name,voip_enabled,voip_operator_code,voip_extension,voip_service_id,voip_dial_mode'
  );
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'خواندن پروفایل VoIP ناموفق بود.');

  const rows = parseJsonSafe(raw) || [];
  return Array.isArray(rows) ? rows[0] : null;
};

const fetchVoipSettings = async (supabaseUrl: string, serviceRoleKey: string, orgId: string) => {
  const url = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/integration_settings`);
  url.searchParams.set('org_id', `eq.${orgId}`);
  url.searchParams.set('connection_type', 'eq.voip');
  url.searchParams.set('is_active', 'eq.true');
  url.searchParams.set('select', 'id,provider,settings,is_active');
  url.searchParams.set('limit', '10');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || 'خواندن تنظیمات VoIP ناموفق بود.');

  const rows = parseJsonSafe(raw) || [];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((row) => String(row?.provider || '').toLowerCase() === 'telefonchy') || rows[0];
};

const createTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
};

const insertCallLog = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  row: Record<string, any>
) => {
  const insert = async (payload: Record<string, any>) => {
    const response = await fetch(`${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs`, {
      method: 'POST',
      headers: {
        ...getServiceHeaders(serviceRoleKey),
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    return { response, raw };
  };

  let result = await insert(row);
  if (!result.response.ok && /column .*title|schema cache/i.test(result.raw || '')) {
    const { title: _title, ...withoutTitle } = row;
    result = await insert(withoutTitle);
  }
  if (!result.response.ok) throw new Error(result.raw || 'ثبت گزارش تماس ناموفق بود.');

  const parsed = parseJsonSafe(result.raw);
  return Array.isArray(parsed) ? parsed[0] : parsed;
};

const extractProviderIds = (parsed: any) => {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const callId = firstValue(
    source.call_id,
    source.callId,
    source.cuid,
    source.unique_id,
    source.id,
    source.data?.call_id,
    source.data?.callId,
    source.data?.cuid,
    source.data?.unique_id,
    source.data?.id
  );
  const objectId = firstValue(
    source.object_id,
    source.objectId,
    source.data?.object_id,
    source.data?.objectId,
    source.data?.id
  );

  return {
    callId: callId || '',
    objectId: objectId || '',
  };
};

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

const extractCallsArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  const candidates = [
    value?.data,
    value?.calls,
    value?.items,
    value?.result,
    value?.results,
    value?.data?.calls,
    value?.data?.items,
    value?.data?.data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
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
  if (!result.response.ok) throw new Error(result.raw || 'ثبت گزارش تماس ناموفق بود.');

  const parsed = parseJsonSafe(result.raw);
  return Array.isArray(parsed) ? parsed[0] : parsed;
};

const normalizeProviderCallRow = (
  orgId: string,
  serviceId: string,
  item: Record<string, any>
) => {
  const talkSeconds = toIntegerOrNull(firstValue(item.time_talk, item.talk_seconds, item.duration, item.billsec));
  const direction = mapDirection(firstValue(item.type, item.direction, item.call_type));
  const sourceNumber = normalizePhone(firstValue(item.call_source, item.source_number, item.source, item.from, item.caller));
  const destinationNumber = normalizePhone(firstValue(item.call_dest, item.destination_number, item.destination, item.to, item.callee));
  const exten = item?.exten && typeof item.exten === 'object' && !Array.isArray(item.exten) ? item.exten : {};
  const counterpartyPhone = direction === 'incoming' ? sourceNumber : destinationNumber;

  return {
    org_id: orgId,
    provider: 'telefonchy',
    service_id: firstValue(item.service_id, item.serviceId, serviceId) || null,
    call_id: firstValue(item.call_id, item.callId, item.cuid, item.unique_id) || null,
    object_id: firstValue(item.object_id, item.objectId, item.id) || null,
    direction,
    status: mapStatus(firstValue(item.status, item.call_status, item.disposition), talkSeconds),
    source_number: sourceNumber || null,
    destination_number: destinationNumber || null,
    extension: firstValue(item.extension, item.operator_extension, exten.number, exten.caller_id) || null,
    operator_code: firstValue(item.operator_code, item.operatorCode) || null,
    trunk: firstValue(item.trunk, item.trunk_number) || null,
    started_at: toIsoOrNull(firstValue(item.started_at, item.start_at, item.start_time, item.created_at)),
    ended_at: toIsoOrNull(firstValue(item.ended_at, item.end_at, item.end_time, item.updated_at)),
    wait_seconds: toIntegerOrNull(firstValue(item.time_wait, item.wait_seconds)),
    talk_seconds: talkSeconds,
    file_id: firstValue(item.file_id, item.fileId, item.record_id) || null,
    recording_url: firstValue(item.recording_url, item.recordingUrl, item.file_url, item.audio_url) || null,
    title: counterpartyPhone || sourceNumber || destinationNumber || 'تماس VoIP',
    metadata: {
      provider: 'telefonchy',
      action: 'sync_recent_calls',
      build: FUNCTION_BUILD,
      provider_row: item,
    },
  };
};

const fetchTelefonchyCalls = async (
  baseUrl: string,
  token: string,
  serviceId: string,
  options?: { perPage?: number; days?: number }
) => {
  const limit = Math.min(Math.max(Number(options?.perPage || 20), 1), 100);
  const days = Math.min(Math.max(Number(options?.days || 7), 1), 90);
  const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const dateTo = new Date();
  const calls: any[] = [];
  const rawPages: string[] = [];
  let parsed: any = null;
  let page = 1;
  let lastPage = 1;

  do {
    const providerUrl = new URL(`${baseUrl}/webservice/v1/calls`);
    providerUrl.searchParams.set('service_id', serviceId);
    providerUrl.searchParams.set('page', String(page));
    providerUrl.searchParams.set('sort', 'DESC');
    providerUrl.searchParams.set('date_from', formatTelefonchyJalaliDateTime(dateFrom, '00:00'));
    providerUrl.searchParams.set('date_to', formatTelefonchyJalaliDateTime(dateTo, '23:59'));

    const timeout = createTimeoutSignal(10000);
    let response: Response;
    try {
      response = await fetch(providerUrl.toString(), {
        method: 'GET',
        headers: {
          'webservice-token': token,
          Accept: 'application/json',
        },
        signal: timeout.signal,
      });
    } finally {
      timeout.cleanup();
    }

    const raw = await response.text();
    rawPages.push(raw);
    parsed = parseJsonSafe(raw);
    if (!response.ok) throw new Error(raw || `Telefonchy HTTP ${response.status}`);

    calls.push(...extractCallsArray(parsed));
    const paginator = parsed?.paginator || {};
    lastPage = Math.max(1, Number(paginator.last || paginator.total_pages || page) || page);
    page += 1;
  } while (calls.length < limit && page <= lastPage && page <= 10);

  return {
    raw: rawPages[0] || '',
    parsed,
    calls: calls.slice(0, limit),
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { success: false, message: 'روش ارسال درخواست معتبر نیست.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { success: false, message: 'تنظیمات سرور کامل نیست. متغیرهای Supabase را بررسی کنید.' });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json(401, { success: false, message: 'توکن کاربر ارسال نشده است.' });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'smartcall').trim();
    const user = await verifyUserToken(supabaseUrl, serviceRoleKey, authHeader.replace(/^Bearer\s+/i, '').trim());
    const profile = await fetchProfile(supabaseUrl, serviceRoleKey, user.id);
    if (!profile?.id || !profile?.org_id) {
      return json(403, { success: false, message: 'پروفایل سازمانی کاربر برای VoIP کامل نیست.' });
    }

    const settingsRow = await fetchVoipSettings(supabaseUrl, serviceRoleKey, profile.org_id);
    const overrideSettings = body?.overrideSettings && typeof body.overrideSettings === 'object' ? body.overrideSettings : {};
    const hasOverrideSettings = Object.keys(overrideSettings).length > 0;
    const settings = { ...(settingsRow?.settings || {}), ...overrideSettings };
    if (!settingsRow && !hasOverrideSettings) {
      return json(400, { success: false, message: 'اتصال VoIP فعال نیست.' });
    }
    if (settingsRow?.is_active === false && settings.is_active !== true) {
      return json(400, { success: false, message: 'اتصال VoIP فعال نیست.' });
    }

    const to = normalizePhone(firstValue(body.to, body.phone, body.recipient));
    const extension = firstValue(profile.voip_extension, settings.default_extension);
    const serviceId = firstValue(profile.voip_service_id, settings.service_id, Deno.env.get('TELEFONCHY_SERVICE_ID'));
    const token = firstValue(settings.webservice_token, Deno.env.get('TELEFONCHY_WEBSERVICE_TOKEN'));
    const baseUrl = trimTrailingSlash(firstValue(settings.base_url, Deno.env.get('TELEFONCHY_BASE_URL'), 'https://panel.telefonchy.com'));

    if (!serviceId) return json(400, { success: false, message: 'Service ID تلفنچی تنظیم نشده است.' });
    if (!token) return json(400, { success: false, message: 'Webservice Token تلفنچی تنظیم نشده است.' });

    if (action === 'test_connection') {
      const result = await fetchTelefonchyCalls(baseUrl, token, serviceId, { perPage: 1, days: 30 });
      return json(200, {
        success: true,
        message: 'اتصال تلفنچی برقرار است.',
        provider: 'telefonchy',
        sample_count: result.calls.length,
      });
    }

    if (action === 'sync_recent_calls') {
      const perPage = Number(body.perPage || body.per_page || 30);
      const days = Number(body.days || 7);
      const result = await fetchTelefonchyCalls(baseUrl, token, serviceId, { perPage, days });
      let saved = 0;
      for (const item of result.calls) {
        if (!item || typeof item !== 'object') continue;
        const row = normalizeProviderCallRow(profile.org_id, serviceId, item);
        if (!row.call_id && !row.object_id) continue;
        await saveCallLog(supabaseUrl, serviceRoleKey, row);
        saved += 1;
      }

      return json(200, {
        success: true,
        provider: 'telefonchy',
        fetched: result.calls.length,
        saved,
        message: `${saved} تماس از تلفنچی همگام‌سازی شد.`,
      });
    }

    if (profile.voip_enabled !== true) {
      return json(403, { success: false, message: 'VoIP برای این کاربر فعال نیست.' });
    }
    if (settings.smartcall_enabled === false) {
      return json(400, { success: false, message: 'Smart Call در تنظیمات VoIP فعال نیست.' });
    }
    if (!to) return json(400, { success: false, message: 'شماره مقصد تماس مشخص نیست.' });
    if (!extension) return json(400, { success: false, message: 'داخلی VoIP کاربر مشخص نیست.' });

    const providerUrl = new URL(`${baseUrl}/webservice/v1/smartcall`);
    providerUrl.searchParams.set('service_id', serviceId);
    providerUrl.searchParams.set('exten', extension);
    providerUrl.searchParams.set('to', to);

    const timeout = createTimeoutSignal(9000);
    let response: Response;
    try {
      response = await fetch(providerUrl.toString(), {
        method: 'GET',
        headers: {
          'webservice-token': token,
          Accept: 'application/json',
        },
        signal: timeout.signal,
      });
    } finally {
      timeout.cleanup();
    }

    const providerRaw = await response.text();
    const providerJson = parseJsonSafe(providerRaw);
    const baseLogRow = {
      org_id: profile.org_id,
      provider: 'telefonchy',
      service_id: serviceId,
      direction: 'outgoing',
      source_number: extension,
      destination_number: to,
      extension,
      operator_code: firstValue(profile.voip_operator_code) || null,
      module_id: firstValue(body.moduleId, body.module_id) || null,
      record_id: firstValue(body.recordId, body.record_id) || null,
      assignee_id: profile.id,
      created_by: user.id,
      title: to,
    };

    if (!response.ok) {
      await insertCallLog(supabaseUrl, serviceRoleKey, {
        ...baseLogRow,
        status: 'failed',
        metadata: {
          action: 'smartcall',
          build: FUNCTION_BUILD,
          provider_status: response.status,
          provider_response: providerJson || providerRaw,
        },
      }).catch((error) => console.warn('[telefonchy-smartcall] failed-log:error', String(error?.message || error)));
      return json(502, { success: false, message: providerRaw || `Telefonchy HTTP ${response.status}` });
    }

    const ids = extractProviderIds(providerJson);
    const callLog = await insertCallLog(supabaseUrl, serviceRoleKey, {
      ...baseLogRow,
      call_id: ids.callId || null,
      object_id: ids.objectId || null,
      status: 'ringing',
      started_at: new Date().toISOString(),
      metadata: {
        action: 'smartcall',
        build: FUNCTION_BUILD,
        provider_response: providerJson || providerRaw,
      },
    });

    return json(200, {
      success: true,
      provider: 'telefonchy',
      call_log_id: callLog?.id || null,
      provider_result: providerJson || providerRaw,
    });
  } catch (error: any) {
    console.error('[telefonchy-smartcall] error', String(error?.message || error));
    return json(400, { success: false, message: String(error?.message || 'شروع تماس VoIP ناموفق بود.') });
  }
});
