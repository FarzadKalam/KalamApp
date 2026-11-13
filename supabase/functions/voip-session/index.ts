// @ts-nocheck
import { loadOrgPlanAccess } from '../_shared/org-plan-access.ts';
import { dialPhone } from '../_shared/phone-number.ts';
import {
  buildCoturnIceServers,
  buildTenantPjsipId,
  normalizeVoipProviderKey,
} from '../_shared/voip-providers.ts';

const FUNCTION_BUILD = 'voip-session-2026-11-12-unified-v1';

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
      'Content-Type': 'application/json; charset=utf-8',
      'X-Kalam-Function-Build': FUNCTION_BUILD,
    },
  });

const trimTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '');
const parseJsonSafe = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const serviceHeaders = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});

const verifyUserToken = async (supabaseUrl: string, serviceRoleKey: string, userToken: string) => {
  const response = await fetch(`${trimTrailingSlash(supabaseUrl)}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${userToken}` },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('نشست کاربر معتبر نیست.');
  const user = parseJsonSafe(raw);
  if (!user?.id) throw new Error('نشست کاربر معتبر نیست.');
  return user;
};

const restSelect = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  params: Record<string, string>,
) => {
  const url = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: serviceHeaders(serviceRoleKey) });
  const raw = await res.text();
  if (!res.ok) throw new Error(raw || `خواندن ${table} ناموفق بود.`);
  const rows = parseJsonSafe(raw);
  return Array.isArray(rows) ? rows : [];
};

const canManageOrgVoipSettings = (permissions: Record<string, any> | null | undefined) => {
  const perms = permissions && typeof permissions === 'object' ? permissions : {};
  if (perms.__saas_admin?.edit === true || perms.__saas_admin?.view === true) return true;
  if (perms.__settings_tabs?.edit === true) return true;
  return perms.profiles?.edit === true;
};

const resolveDefaultWssUrl = (req: Request, settings: Record<string, any>) => {
  const configured = String(
    settings?.wss_url ||
      Deno.env.get('VOIP_WSS_URL') ||
      '',
  ).trim();
  if (configured) return configured;
  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
  try {
    if (supabaseUrl && /^https:/i.test(supabaseUrl)) {
      const host = new URL(supabaseUrl).host;
      return `wss://${host}/voip-ws`;
    }
  } catch {
    // ignore URL parse error
  }
  const origin = req.headers.get('origin') || req.headers.get('host') || '';
  if (origin) {
    const cleanHost = origin.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    if (cleanHost) return `wss://${cleanHost}/voip-ws`;
  }
  return '';
};

const resolveSipDomain = (settings: Record<string, any>, wssUrl: string) => {
  const explicit = String(settings?.sip_domain || Deno.env.get('VOIP_SIP_DOMAIN') || '').trim();
  if (explicit) return explicit;
  try {
    if (wssUrl) return new URL(wssUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')).hostname;
  } catch {
    // ignore
  }
  return 'voip.kalamapp.ir';
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
    const authHeader = String(req.headers.get('Authorization') || '');
    const userToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!userToken) return json(401, { success: false, message: 'نشست کاربر ارسال نشده است.' });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'get_webphone_session').trim();

    const user = await verifyUserToken(supabaseUrl, serviceRoleKey, userToken);
    const profiles = await restSelect(supabaseUrl, serviceRoleKey, 'profiles', {
      id: `eq.${user.id}`,
      select: 'id,org_id,role_id,full_name,voip_enabled,voip_extension,voip_operator_code,voip_service_id,voip_dial_mode',
      limit: '1',
    });
    const profile = profiles[0];
    if (!profile?.id || !profile?.org_id) {
      return json(403, { success: false, message: 'پروفایل سازمانی کاربر مشخص نیست.' });
    }

    const orgId = String(profile.org_id);
    const roles = profile.role_id
      ? await restSelect(supabaseUrl, serviceRoleKey, 'org_roles', {
          id: `eq.${profile.role_id}`,
          org_id: `eq.${orgId}`,
          select: 'id,permissions',
          limit: '1',
        })
      : [];
    const permissions = roles[0]?.permissions || {};
    const isAdmin = canManageOrgVoipSettings(permissions);

    const planAccess = await loadOrgPlanAccess(trimTrailingSlash(supabaseUrl), serviceRoleKey, orgId);
    const webphonePlanEnabled = Boolean(
      planAccess?.available &&
        (planAccess?.features?.voip_webphone === true || planAccess?.reason === 'internal_organization'),
    );

    const voipSettingsRows = await restSelect(supabaseUrl, serviceRoleKey, 'integration_settings', {
      org_id: `eq.${orgId}`,
      connection_type: 'eq.voip',
      select: 'id,provider,settings,is_active',
      limit: '5',
    });
    const activeSettingRow = voipSettingsRows.find((r) => r?.is_active !== false) || voipSettingsRows[0] || null;
    const settings = (activeSettingRow?.settings && typeof activeSettingRow.settings === 'object')
      ? activeSettingRow.settings
      : {};

    if (action === 'get_webphone_session') {
      if (!webphonePlanEnabled) {
        return json(200, {
          success: true,
          enabled: false,
          reason: 'plan_disabled',
          message: 'تلفن زنده تحت وب در پلن فعلی سازمان فعال نیست.',
        });
      }
      if (profile.voip_enabled !== true) {
        return json(200, {
          success: true,
          enabled: false,
          reason: 'user_disabled',
          message: 'تلفن VoIP برای حساب این کاربر فعال نشده است.',
        });
      }

      const endpoints = await restSelect(supabaseUrl, serviceRoleKey, 'voip_sip_endpoints', {
        org_id: `eq.${orgId}`,
        assignee_profile_id: `eq.${profile.id}`,
        is_active: 'eq.true',
        select: 'id,extension,display_name,pjsip_id,sip_secret,webrtc_enabled,transport,max_contacts',
        limit: '1',
      });
      const endpoint = endpoints[0] || null;
      if (!endpoint) {
        return json(200, {
          success: true,
          enabled: false,
          reason: 'no_endpoint',
          message: 'داخلی WebRTC برای این کاربر تعریف نشده است. از بخش مدیریت کاربران یا تنظیمات VoIP داخلی را بسازید.',
        });
      }

      const wssUrl = resolveDefaultWssUrl(req, settings);
      const sipDomain = resolveSipDomain(settings, wssUrl);
      const turnHost = String(settings?.turn_host || Deno.env.get('VOIP_TURN_HOST') || sipDomain).trim();
      const turnPort = Number(settings?.turn_port || Deno.env.get('VOIP_TURN_PORT') || 3478) || 3478;
      const turnSecret = String(Deno.env.get('VOIP_TURN_SECRET') || '').trim();
      const iceServers = await buildCoturnIceServers({
        turnHost,
        turnPort,
        turnSecret,
        userId: endpoint.pjsip_id,
      });

      return json(200, {
        success: true,
        enabled: Boolean(wssUrl),
        reason: wssUrl ? null : 'missing_wss_url',
        dialMode: String(profile.voip_dial_mode || settings.default_dial_mode || 'telefonchy_smartcall'),
        provider: normalizeVoipProviderKey(activeSettingRow?.provider || 'telefonchy'),
        wssUrl,
        sipDomain,
        iceServers,
        endpoint: {
          extension: endpoint.extension,
          displayName: endpoint.display_name || profile.full_name || endpoint.extension,
          pjsipId: endpoint.pjsip_id,
          sipUri: `sip:${endpoint.pjsip_id}@${sipDomain}`,
          sipSecret: endpoint.sip_secret,
          transport: endpoint.transport || 'wss',
        },
      });
    }

    if (action === 'log_webrtc_call') {
      if (profile.voip_enabled !== true) {
        return json(403, { success: false, message: 'VoIP برای این کاربر فعال نیست.' });
      }
      const callId = String(body?.callId || body?.call_id || '').trim();
      if (!callId) return json(400, { success: false, message: 'شناسه تماس مشخص نیست.' });
      const direction = ['incoming', 'outgoing', 'internal'].includes(String(body?.direction || ''))
        ? String(body.direction)
        : 'outgoing';
      const status = ['ringing', 'answered', 'missed', 'failed', 'completed'].includes(String(body?.status || ''))
        ? String(body.status)
        : 'ringing';
      const provider = normalizeVoipProviderKey(activeSettingRow?.provider || 'kalamapp_cloud_pbx');
      const sourceNumber = dialPhone(body?.sourceNumber || body?.source_number || profile.voip_extension || '') || String(body?.sourceNumber || '');
      const destinationNumber = dialPhone(body?.destinationNumber || body?.destination_number || '') || String(body?.destinationNumber || '');
      const extension = String(body?.extension || profile.voip_extension || '').trim() || null;

      const existing = await restSelect(supabaseUrl, serviceRoleKey, 'voip_call_logs', {
        org_id: `eq.${orgId}`,
        provider: `eq.${provider}`,
        call_id: `eq.${callId}`,
        select: 'id,started_at,metadata',
        limit: '1',
      });

      const nowIso = new Date().toISOString();
      const rowPayload: Record<string, any> = {
        org_id: orgId,
        provider,
        call_id: callId,
        direction,
        status,
        source_number: sourceNumber || null,
        destination_number: destinationNumber || null,
        extension,
        operator_code: profile.voip_operator_code || null,
        related_module_id: body?.moduleId || null,
        related_record_id: body?.recordId || null,
        assignee_id: profile.id,
        title: (direction === 'incoming' ? sourceNumber : destinationNumber) || 'تماس تحت وب',
        metadata: {
          ...(existing[0]?.metadata && typeof existing[0].metadata === 'object' ? existing[0].metadata : {}),
          webrtc: true,
          build: FUNCTION_BUILD,
        },
      };
      if (status === 'ringing' && !existing[0]?.started_at) rowPayload.started_at = nowIso;
      if (['completed', 'missed', 'failed'].includes(status)) rowPayload.ended_at = nowIso;
      if (Number.isFinite(Number(body?.talkSeconds))) {
        rowPayload.talk_seconds = Math.max(0, Math.floor(Number(body.talkSeconds)));
      }

      const targetUrl = existing[0]?.id
        ? `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs?id=eq.${existing[0].id}`
        : `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs`;
      const res = await fetch(targetUrl, {
        method: existing[0]?.id ? 'PATCH' : 'POST',
        headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=representation' },
        body: JSON.stringify(rowPayload),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw || 'ثبت گزارش تماس WebRTC ناموفق بود.');
      const saved = parseJsonSafe(raw);
      return json(200, { success: true, callLog: Array.isArray(saved) ? saved[0] : saved });
    }

    // Admin actions for multi-tenant SIP trunks & operator extensions
    if (!isAdmin) {
      return json(403, { success: false, message: 'فقط مدیر سیستم می‌تواند داخلی‌ها و ترانک‌های SIP را مدیریت کند.' });
    }
    if (!webphonePlanEnabled) {
      return json(403, { success: false, message: 'قابلیت تلفن زنده تحت وب در پلن فعلی سازمان فعال نیست.' });
    }

    if (action === 'list_trunks') {
      const trunks = await restSelect(supabaseUrl, serviceRoleKey, 'voip_sip_trunks', {
        org_id: `eq.${orgId}`,
        select: 'id,provider,title,pjsip_trunk_id,sip_host,sip_port,transport,auth_type,sip_username,outbound_caller_id,did_numbers,api_base_url,is_active,is_default,created_at,updated_at',
        order: 'is_default.desc,created_at.desc',
      });
      return json(200, { success: true, trunks });
    }

    if (action === 'save_trunk') {
      const trunk = body?.trunk && typeof body.trunk === 'object' ? body.trunk : {};
      const provider = normalizeVoipProviderKey(trunk.provider || 'sip_trunk');
      const payload: Record<string, any> = {
        org_id: orgId,
        provider,
        title: String(trunk.title || 'ترانک اصلی VoIP').trim(),
        sip_host: String(trunk.sip_host || '').trim() || null,
        sip_port: Math.min(65535, Math.max(1, Number(trunk.sip_port || 5060) || 5060)),
        transport: ['udp', 'tcp', 'tls', 'wss'].includes(String(trunk.transport || '')) ? trunk.transport : 'udp',
        auth_type: ['user_pass', 'ip_based', 'register'].includes(String(trunk.auth_type || '')) ? trunk.auth_type : 'user_pass',
        sip_username: String(trunk.sip_username || '').trim() || null,
        outbound_caller_id: String(trunk.outbound_caller_id || '').trim() || null,
        did_numbers: Array.isArray(trunk.did_numbers) ? trunk.did_numbers.map((x: any) => String(x || '').trim()).filter(Boolean) : [],
        api_base_url: String(trunk.api_base_url || '').trim() || null,
        is_active: trunk.is_active !== false,
        is_default: trunk.is_default === true,
        updated_by: user.id,
      };
      if (String(trunk.sip_secret || '').trim()) payload.sip_secret = String(trunk.sip_secret).trim();
      if (String(trunk.api_token || '').trim()) payload.api_token = String(trunk.api_token).trim();
      if (String(trunk.webhook_secret || '').trim()) payload.webhook_secret = String(trunk.webhook_secret).trim();
      if (!trunk.id) payload.created_by = user.id;

      const targetUrl = trunk.id
        ? `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_sip_trunks?id=eq.${trunk.id}&org_id=eq.${orgId}`
        : `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_sip_trunks`;
      const res = await fetch(targetUrl, {
        method: trunk.id ? 'PATCH' : 'POST',
        headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw || 'ذخیره ترانک SIP ناموفق بود.');
      const saved = parseJsonSafe(raw);
      return json(200, { success: true, trunk: Array.isArray(saved) ? saved[0] : saved, message: 'ترانک SIP با موفقیت ذخیره شد.' });
    }

    if (action === 'delete_trunk') {
      const trunkId = String(body?.trunkId || '').trim();
      if (!trunkId) return json(400, { success: false, message: 'شناسه ترانک مشخص نیست.' });
      const res = await fetch(`${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_sip_trunks?id=eq.${trunkId}&org_id=eq.${orgId}`, {
        method: 'DELETE',
        headers: serviceHeaders(serviceRoleKey),
      });
      if (!res.ok) throw new Error((await res.text()) || 'حذف ترانک ناموفق بود.');
      return json(200, { success: true, message: 'ترانک حذف شد.' });
    }

    if (action === 'list_endpoints') {
      const endpoints = await restSelect(supabaseUrl, serviceRoleKey, 'voip_sip_endpoints', {
        org_id: `eq.${orgId}`,
        select: 'id,assignee_profile_id,trunk_id,extension,display_name,endpoint_kind,pjsip_id,webrtc_enabled,transport,max_contacts,is_active,created_at,updated_at',
        order: 'extension.asc',
      });
      return json(200, { success: true, endpoints });
    }

    if (action === 'upsert_endpoint') {
      const ep = body?.endpoint && typeof body.endpoint === 'object' ? body.endpoint : {};
      const extension = String(ep.extension || '').replace(/[^\w-]/g, '').trim();
      if (!extension) return json(400, { success: false, message: 'شماره داخلی معتبر نیست.' });
      const pjsipId = buildTenantPjsipId(orgId, extension);
      const payload: Record<string, any> = {
        org_id: orgId,
        assignee_profile_id: ep.assignee_profile_id || null,
        trunk_id: ep.trunk_id || null,
        extension,
        display_name: String(ep.display_name || extension).trim(),
        endpoint_kind: ['operator', 'ai_agent', 'queue_virtual'].includes(String(ep.endpoint_kind || '')) ? ep.endpoint_kind : 'operator',
        pjsip_id: pjsipId,
        webrtc_enabled: ep.webrtc_enabled !== false,
        transport: ['wss', 'udp', 'tcp', 'tls'].includes(String(ep.transport || '')) ? ep.transport : 'wss',
        max_contacts: Math.min(20, Math.max(1, Number(ep.max_contacts || 3) || 3)),
        is_active: ep.is_active !== false,
        updated_by: user.id,
      };
      if (String(ep.sip_secret || '').trim()) {
        payload.sip_secret = String(ep.sip_secret).trim();
      } else if (!ep.id) {
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        payload.sip_secret = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
      if (!ep.id) payload.created_by = user.id;

      const targetUrl = ep.id
        ? `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_sip_endpoints?id=eq.${ep.id}&org_id=eq.${orgId}`
        : `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_sip_endpoints`;
      const res = await fetch(targetUrl, {
        method: ep.id ? 'PATCH' : 'POST',
        headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw || 'ذخیره داخلی SIP ناموفق بود.');
      const saved = parseJsonSafe(raw);
      return json(200, { success: true, endpoint: Array.isArray(saved) ? saved[0] : saved, message: 'داخلی WebRTC ذخیره شد.' });
    }

    if (action === 'delete_endpoint') {
      const endpointId = String(body?.endpointId || '').trim();
      if (!endpointId) return json(400, { success: false, message: 'شناسه داخلی مشخص نیست.' });
      const res = await fetch(`${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_sip_endpoints?id=eq.${endpointId}&org_id=eq.${orgId}`, {
        method: 'DELETE',
        headers: serviceHeaders(serviceRoleKey),
      });
      if (!res.ok) throw new Error((await res.text()) || 'حذف داخلی ناموفق بود.');
      return json(200, { success: true, message: 'داخلی حذف شد.' });
    }

    return json(400, { success: false, message: 'عملیات درخواستی پشتیبانی نمی‌شود.' });
  } catch (error: any) {
    console.error('[voip-session] error', String(error?.message || error));
    return json(500, { success: false, message: String(error?.message || 'خطا در مدیریت نشست VoIP.') });
  }
});
