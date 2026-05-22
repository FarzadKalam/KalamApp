// @ts-nocheck
// invoice-otp: Send OTP SMS for invoice confirmation (public, no auth required)

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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const dbFetch = async (rpcName: string, params: Record<string, any>) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(params),
  });
  return res.json();
};

const getSmsSettings = async (): Promise<Record<string, any> | null> => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/integration_settings?connection_type=eq.sms&select=value&limit=1`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    }
  );
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0]?.value ?? null : null;
};

const sendSmsRest = async (settings: Record<string, any>, phone: string, text: string) => {
  const apiKey = String(settings?.api_key || '').trim();
  const sender = String(settings?.sender_number || '').trim();
  if (!apiKey || !sender) throw new Error('تنظیمات پیامک ناقص است.');

  const baseUrl = String(settings?.base_url || 'https://api.melipayamak.com').replace(/\/$/, '');
  const url = `${baseUrl}/api/send/simple/${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: sender, to: phone, text }),
  });

  if (!res.ok) throw new Error(`SMS provider error: ${res.status}`);
  return res.json();
};

const normalizePhone = (raw: string): string => {
  let digits = String(raw || '').replace(/[^\d]/g, '');
  if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('98') && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
  return digits;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const { system_code, module: p_module, phone } = body;
  if (!system_code || !p_module || !phone) {
    return json(400, { error: 'missing_params' });
  }

  const normalizedPhone = normalizePhone(String(phone));
  if (!/^09\d{9}$/.test(normalizedPhone)) {
    return json(400, { error: 'invalid_phone', message: 'شماره موبایل معتبر نیست.' });
  }

  try {
    // Generate OTP hash in DB — returns otp_code for us to send
    const otpResult = await dbFetch('send_invoice_confirm_otp', {
      p_system_code: system_code,
      p_module,
      p_phone: normalizedPhone,
    });

    if (otpResult?.error) {
      const errMap: Record<string, string> = {
        not_found: 'فاکتور پیدا نشد.',
        invalid_status: 'وضعیت فاکتور اجازه تایید را نمی‌دهد.',
        phone_not_allowed: 'این شماره برای تایید این فاکتور مجاز نیست.',
      };
      return json(400, { error: otpResult.error, message: errMap[otpResult.error] ?? 'خطا در ارسال کد.' });
    }

    const otpCode = String(otpResult?.otp_code || '').trim();
    if (!otpCode) return json(500, { error: 'otp_generation_failed' });

    // Send SMS
    const smsSettings = await getSmsSettings();
    if (!smsSettings) {
      return json(500, { error: 'sms_not_configured', message: 'تنظیمات پیامک پیکربندی نشده است.' });
    }

    const smsText = `کد تایید فاکتور شما: ${otpCode}\nاین کد ۳ دقیقه اعتبار دارد.`;
    await sendSmsRest(smsSettings, normalizedPhone, smsText);

    return json(200, { success: true });
  } catch (err) {
    console.error('invoice-otp error:', err);
    return json(500, { error: 'internal_error', message: String(err?.message || 'خطای سرور') });
  }
});
