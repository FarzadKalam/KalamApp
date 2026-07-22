// @ts-nocheck

const FUNCTION_BUILD = 'telefonchy-recording-2026-07-22-operator-access';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const trimTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '');
const firstValue = (...values: any[]) => {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
};

const parseJsonSafe = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const serviceHeaders = (serviceRoleKey: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
});

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });

const restSingle = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  query: Record<string, string>,
) => {
  const url = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/${table}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('limit', '1');
  const response = await fetch(url.toString(), { headers: serviceHeaders(serviceRoleKey) });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || `خواندن ${table} ناموفق بود.`);
  const rows = parseJsonSafe(raw);
  return Array.isArray(rows) ? rows[0] : null;
};

const verifyUser = async (supabaseUrl: string, serviceRoleKey: string, token: string) => {
  const response = await fetch(`${trimTrailingSlash(supabaseUrl)}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('نشست کاربر معتبر نیست.');
  return parseJsonSafe(raw);
};

const canReadCallRecording = (profile: any, permissions: any, call: any) => {
  const profileId = String(profile?.id || '').trim();
  const normalizeOperatorValue = (value: any) => String(value ?? '').trim().replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/\D/g, '');
  const extension = normalizeOperatorValue(profile?.voip_extension);
  const operatorCode = normalizeOperatorValue(profile?.voip_operator_code);
  if (profileId && String(call?.assignee_id || '').trim() === profileId) return true;
  if (extension && normalizeOperatorValue(call?.extension) === extension) return true;
  if (operatorCode && normalizeOperatorValue(call?.operator_code) === operatorCode) return true;

  const voipPerm = permissions?.__voip || {};
  if (voipPerm?.view === true && voipPerm?.fields?.all_call_notifications === true) return true;

  const modulePerm = permissions?.voip_call_reports || {};
  return modulePerm?.view === true && String(modulePerm?.record_scope || 'all') === 'all';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { success: false, message: 'روش درخواست معتبر نیست.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { success: false, message: 'تنظیمات سرور کامل نیست.' });
  }

  try {
    const authHeader = String(req.headers.get('authorization') || '');
    const userToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!userToken) return json(401, { success: false, message: 'نشست کاربر ارسال نشده است.' });

    const body = await req.json().catch(() => ({}));
    const callLogId = String(body.callLogId || body.call_log_id || '').trim();
    if (!callLogId) return json(400, { success: false, message: 'گزارش تماس مشخص نیست.' });

    const user = await verifyUser(supabaseUrl, serviceRoleKey, userToken);
    const profile = await restSingle(supabaseUrl, serviceRoleKey, 'profiles', {
      id: `eq.${user.id}`,
      select: 'id,org_id,role_id,voip_extension,voip_operator_code',
    });
    const call = await restSingle(supabaseUrl, serviceRoleKey, 'voip_call_logs', {
      id: `eq.${callLogId}`,
      select: 'id,org_id,provider,call_id,file_id,extension,operator_code,assignee_id',
    });
    if (!profile?.org_id || !call?.org_id || String(profile.org_id) !== String(call.org_id)) {
      return json(403, { success: false, message: 'دسترسی به فایل صوتی این تماس مجاز نیست.' });
    }

    const role = profile.role_id
      ? await restSingle(supabaseUrl, serviceRoleKey, 'org_roles', {
          id: `eq.${profile.role_id}`,
          org_id: `eq.${profile.org_id}`,
          select: 'id,permissions',
        })
      : null;
    if (!canReadCallRecording(profile, role?.permissions || {}, call)) {
      return json(403, { success: false, message: 'دسترسی به فایل صوتی این تماس مجاز نیست.' });
    }

    const fileId = String(call.file_id || '').trim();
    const callId = String(call.call_id || '').trim();
    if (!fileId || !callId) {
      return json(404, { success: false, message: 'فایل ضبط‌شده برای این تماس موجود نیست.' });
    }

    const settingsRow = await restSingle(supabaseUrl, serviceRoleKey, 'integration_settings', {
      org_id: `eq.${profile.org_id}`,
      connection_type: 'eq.voip',
      is_active: 'eq.true',
      select: 'id,provider,settings',
    });
    const settings = settingsRow?.settings || {};
    const token = firstValue(settings.webservice_token, Deno.env.get('TELEFONCHY_WEBSERVICE_TOKEN'));
    const baseUrl = trimTrailingSlash(firstValue(settings.base_url, Deno.env.get('TELEFONCHY_BASE_URL'), 'https://panel.telefonchy.com'));
    if (!token) return json(400, { success: false, message: 'توکن وب‌سرویس تلفنچی تنظیم نشده است.' });

    const providerUrl = new URL(`${baseUrl}/webservice/v1/calls/record`);
    providerUrl.searchParams.set('file_id', fileId);
    providerUrl.searchParams.set('cuid', callId);
    const providerResponse = await fetch(providerUrl.toString(), {
      method: 'GET',
      headers: {
        'webservice-token': token,
        Accept: 'audio/*,application/octet-stream',
      },
    });
    if (!providerResponse.ok) {
      const raw = await providerResponse.text();
      return json(502, { success: false, message: raw || `Telefonchy HTTP ${providerResponse.status}` });
    }

    const headers = new Headers(corsHeaders);
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('X-Recording-Content-Type', providerResponse.headers.get('content-type') || 'audio/mpeg');
    headers.set('Content-Disposition', `inline; filename="voip-call-${callLogId}.mp3"`);
    headers.set('Cache-Control', 'private, max-age=300');
    headers.set('X-Kalam-Function-Build', FUNCTION_BUILD);
    return new Response(providerResponse.body, { status: 200, headers });
  } catch (error: any) {
    console.error('[telefonchy-recording] error', String(error?.message || error));
    return json(500, { success: false, message: String(error?.message || 'دریافت صوت تماس ناموفق بود.') });
  }
});
