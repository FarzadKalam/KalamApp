// @ts-nocheck
import { dialPhone } from '../_shared/phone-number.ts';
import {
  getVoipProviderCapabilities,
  normalizeVoipProviderKey,
} from '../_shared/voip-providers.ts';

const FUNCTION_BUILD = 'voip-dial-2026-11-12-adaptor-v1';

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
    if (!userToken) return json(401, { success: false, message: 'توکن کاربر ارسال نشده است.' });

    const body = await req.json().catch(() => ({}));
    const user = await verifyUserToken(supabaseUrl, serviceRoleKey, userToken);

    const profileRes = await fetch(
      `${trimTrailingSlash(supabaseUrl)}/rest/v1/profiles?id=eq.${user.id}&select=id,org_id,voip_enabled,voip_extension,voip_operator_code,voip_service_id,voip_dial_mode&limit=1`,
      { headers: serviceHeaders(serviceRoleKey) },
    );
    const profileRows = profileRes.ok ? parseJsonSafe(await profileRes.text()) : [];
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    if (!profile?.org_id) return json(403, { success: false, message: 'سازمان کاربر مشخص نیست.' });

    const settingRes = await fetch(
      `${trimTrailingSlash(supabaseUrl)}/rest/v1/integration_settings?org_id=eq.${profile.org_id}&connection_type=eq.voip&limit=5`,
      { headers: serviceHeaders(serviceRoleKey) },
    );
    const settingRows = settingRes.ok ? parseJsonSafe(await settingRes.text()) : [];
    const activeSetting = (Array.isArray(settingRows) ? settingRows : []).find((r: any) => r?.is_active !== false) || settingRows?.[0];
    const overrideSettings = body?.overrideSettings && typeof body.overrideSettings === 'object' ? body.overrideSettings : {};
    const settings = { ...(activeSetting?.settings || {}), ...overrideSettings };

    const providerKey = normalizeVoipProviderKey(overrideSettings.provider || activeSetting?.provider || 'telefonchy');
    const capabilities = getVoipProviderCapabilities(providerKey);
    const action = String(body?.action || 'dial').trim();

    if (providerKey === 'telefonchy') {
      // Delegate seamlessly to existing tested Telefonchy Edge Function logic
      const delegateRes = await fetch(`${trimTrailingSlash(supabaseUrl)}/functions/v1/telefonchy_smartcall`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...body,
          action: action === 'dial' ? 'smartcall' : action,
        }),
      });
      const delegateRaw = await delegateRes.text();
      const delegateData = parseJsonSafe(delegateRaw) || { raw: delegateRaw };
      return json(delegateRes.status, { ...delegateData, capabilities });
    }

    if (action === 'test_connection') {
      if (providerKey === 'simotel' || providerKey === 'novatel' || providerKey === 'alovoip') {
        const baseUrl = trimTrailingSlash(String(settings.base_url || capabilities.defaultBaseUrl));
        const token = String(settings.webservice_token || settings.api_token || '').trim();
        if (!baseUrl) return json(400, { success: false, message: `آدرس سرویس‌دهنده برای ${capabilities.labelFa} وارد نشده است.` });
        return json(200, {
          success: true,
          provider: providerKey,
          capabilities,
          configured: Boolean(token || settings.sip_host),
          message: `تنظیمات آداپتور ${capabilities.labelFa} معتبر است.`,
        });
      }

      return json(200, {
        success: true,
        provider: providerKey,
        capabilities,
        message: `آداپتور ${capabilities.labelFa} آماده است.`,
      });
    }

    if (profile.voip_enabled !== true) {
      return json(403, { success: false, message: 'VoIP برای این کاربر فعال نیست.' });
    }

    const to = dialPhone(body?.to || body?.phone || body?.recipient || '');
    const extension = String(profile.voip_extension || settings.default_extension || '').trim();
    if (!to) return json(400, { success: false, message: 'شماره مقصد تماس معتبر نیست.' });
    if (!extension) return json(400, { success: false, message: 'داخلی VoIP کاربر مشخص نیست.' });

    // Simotel SmartAPI / QuickCall adapter
    if (providerKey === 'simotel') {
      const baseUrl = trimTrailingSlash(String(settings.base_url || ''));
      const apiToken = String(settings.webservice_token || settings.api_token || '').trim();
      if (!baseUrl || !apiToken) {
        return json(400, { success: false, message: 'آدرس سرور یا توکن API سیموتل تنظیم نشده است.' });
      }
      const res = await fetch(`${baseUrl}/api/v4/call/originate/act`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-APIKEY': apiToken,
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          caller: extension,
          callee: to,
          context: String(settings.dial_context || 'from-internal'),
        }),
      });
      const raw = await res.text();
      const parsed = parseJsonSafe(raw);
      if (!res.ok) {
        return json(502, { success: false, message: parsed?.message || raw || 'شروع تماس سیموتل ناموفق بود.' });
      }
      return json(200, { success: true, provider: 'simotel', provider_result: parsed || raw, message: 'تماس سیموتل آغاز شد.' });
    }

    return json(400, {
      success: false,
      provider: providerKey,
      message: `برای ${capabilities.labelFa} تماس خروجی خودکار از طریق تلفن زنده داخل اپ (WebPhone) یا وب‌هوک انجام می‌شود.`,
    });
  } catch (error: any) {
    console.error('[voip-dial] error', String(error?.message || error));
    return json(500, { success: false, message: String(error?.message || 'خطا در برقراری تماس VoIP.') });
  }
});
