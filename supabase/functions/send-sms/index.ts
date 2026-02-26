import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SmsMode = 'rest' | 'soap';

type SmsSettings = {
  mode?: SmsMode | string;
  base_url?: string;
  username?: string;
  password?: string;
  api_key?: string;
  sender_number?: string;
  body_id?: string;
  is_flash?: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const normalizeSmsUrl = (url: string, mode: SmsMode) => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    if (mode === 'rest' && /(^|\.)rest\.payamak-panel\.com$/i.test(parsed.hostname)) {
      if (/\/api\/SendSMS$/i.test(path)) parsed.pathname = `${path}/SendSMS`;
    }
    if (mode === 'soap' && /(^|\.)api\.payamak-panel\.com$/i.test(parsed.hostname)) {
      if (/\/post\/send\.asmx$/i.test(path)) parsed.pathname = `${path}/SendSimpleSMS2`;
    }
    return parsed.toString();
  } catch {
    return url;
  }
};

const getSmsSettings = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  overrideSettings?: SmsSettings | null
) => {
  if (overrideSettings && typeof overrideSettings === 'object') {
    return overrideSettings;
  }

  const { data, error } = await supabaseAdmin
    .from('integration_settings')
    .select('*')
    .eq('connection_type', 'sms')
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(error.message || 'خطا در خواندن تنظیمات پیامک');
  if (!data) throw new Error('تنظیمات پیامک فعال نیست.');
  return (data.settings || {}) as SmsSettings;
};

const sendSmsWithProvider = async (to: string[], text: string, settings: SmsSettings) => {
  const mode = String(settings.mode || 'rest').toLowerCase() === 'soap' ? 'soap' : 'rest';
  const baseUrl = normalizeSmsUrl(
    String(
      settings.base_url ||
        (mode === 'soap'
          ? 'https://api.payamak-panel.com/post/send.asmx/SendSimpleSMS2'
          : 'https://rest.payamak-panel.com/api/SendSMS/SendSMS')
    ),
    mode
  );

  const username = String(settings.username || '').trim();
  const password = String(settings.password || '').trim();
  const apiKey = String(settings.api_key || '').trim();
  const senderNumber = String(settings.sender_number || '').trim();
  const bodyId = String(settings.body_id || '').trim();
  const isFlash = !!settings.is_flash;

  if (!baseUrl || !senderNumber) throw new Error('تنظیمات ارسال پیامک ناقص است.');
  if (!apiKey && (!username || !password)) {
    throw new Error('نام کاربری/رمز عبور یا API Key برای پیامک کامل نیست.');
  }

  const recipients = Array.from(new Set((to || []).map((value) => String(value || '').trim()).filter(Boolean)));
  if (recipients.length === 0) throw new Error('گیرنده پیامک مشخص نشده است.');

  const useSoapRequest = mode === 'soap' || /\/post\/send\.asmx(\/SendSimpleSMS2)?$/i.test(baseUrl);

  for (const recipient of recipients) {
    let response: Response;

    if (useSoapRequest) {
      const form = new URLSearchParams({
        username,
        password,
        to: recipient,
        from: senderNumber,
        text,
        isflash: isFlash ? 'true' : 'false',
      });
      if (bodyId) form.set('bodyId', bodyId);

      response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: form.toString(),
      });
    } else {
      const payload: Record<string, any> = {
        to: recipient,
        from: senderNumber,
        text,
        isFlash,
      };
      if (bodyId) payload.bodyId = bodyId;

      if (apiKey) {
        payload.apiKey = apiKey;
      } else {
        payload.username = username;
        payload.password = password;
      }

      response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(raw || `HTTP ${response.status}`);
    }
  }

  return recipients.length;
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

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { success: false, message: 'Missing bearer token' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return json(401, { success: false, message: 'Unauthorized' });
  }

  try {
    const body = (await req.json()) as {
      to?: string[];
      text?: string;
      overrideSettings?: SmsSettings;
    };

    const to = Array.isArray(body?.to) ? body.to : [];
    const text = String(body?.text || '').trim();
    if (to.length === 0 || !text) {
      return json(400, { success: false, message: 'to و text الزامی است.' });
    }

    const settings = await getSmsSettings(supabaseAdmin, body?.overrideSettings);
    const sent = await sendSmsWithProvider(to, text, settings);

    return json(200, { success: true, sent });
  } catch (error: any) {
    return json(400, {
      success: false,
      message: String(error?.message || 'خطا در ارسال پیامک'),
    });
  }
});
