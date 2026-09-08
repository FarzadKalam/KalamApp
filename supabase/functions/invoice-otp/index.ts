// @ts-nocheck
// invoice-otp: Send OTP SMS for invoice confirmation (public, no auth required)
// SMS is delegated to send-sms function so it uses the same env-based settings
// as the login OTP (MELIPAYAMAK_* env vars), not per-org integration_settings.

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

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')              ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY   = Deno.env.get('SUPABASE_ANON_KEY')         ?? '';
const HOOK_SECRET         = Deno.env.get('KALAM_AUTH_SMS_HOOK_SECRET') ?? '';

// ── RPC call (service role) ──────────────────────────────────────────────────

const callRpc = async (rpcName: string, params: Record<string, any>) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `RPC ${rpcName} HTTP ${res.status}`);
  }
  return res.json();
};

// ── Delegate SMS to send-sms function (hook path, uses MELIPAYAMAK_* env) ───

const sendOtpViaSendSmsFunction = async (phone: string, otpCode: string): Promise<void> => {
  // Call send-sms without an Authorization bearer so it enters the hook/internal
  // path (isAuthHookRequest = true when !hasBearerToken && isLikelyHookPayload).
  // That path reads MELIPAYAMAK_* env vars — same as login OTP.
  const url = HOOK_SECRET
    ? `${SUPABASE_URL}/functions/v1/send-sms?hook_secret=${encodeURIComponent(HOOK_SECRET)}`
    : `${SUPABASE_URL}/functions/v1/send-sms`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      // No Authorization header → triggers hook path in send-sms
    },
    body: JSON.stringify({
      otp:   otpCode,   // extracted by extractHookOtp  → body.otp
      phone: phone,     // extracted by extractHookPhone → body.phone → +98...
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(raw || `send-sms HTTP ${res.status}`);

  let parsed: Record<string, any> = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }

  // send-sms hook path returns { ok: true } on success
  if (parsed?.error || (parsed?.ok === false)) {
    throw new Error(
      parsed?.error?.message || parsed?.message || 'ارسال پیامک توسط سرویس پیامک ناموفق بود.'
    );
  }
};

// ── Phone normalization (ASCII digits, 09XXXXXXXXX format) ──────────────────

const normalizePhone = (raw: string): string => {
  let d = String(raw || '').replace(/[^\d]/g, '');
  if (d.startsWith('0098'))                         d = `0${d.slice(4)}`;
  else if (d.startsWith('98') && d.length === 12)   d = `0${d.slice(2)}`;
  else if (d.length === 10 && d.startsWith('9'))    d = `0${d}`;
  return d;
};

const getClientIp = (req: Request): string | null => {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0],
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value && value.length <= 64 && /^[0-9A-Fa-f:.]+$/.test(value)) return value;
  }
  return null;
};

const releaseRateLimitRequest = async (requestId: string | null) => {
  if (!requestId) return;
  try {
    await callRpc('release_public_confirmation_otp_request', { p_request_id: requestId });
  } catch (err: any) {
    console.warn('invoice-otp: could not release failed request permit', err?.message || err);
  }
};

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST')    return json(405, { error: 'method_not_allowed' });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const { system_code, module: p_module, phone, party } = body;
  const systemCode = String(system_code || '').trim();
  const moduleId = String(p_module || '').trim();
  const partyKey = String(party || '').trim();
  if (!systemCode || !moduleId || !phone || systemCode.length > 256) {
    return json(400, { error: 'missing_params' });
  }

  if (!['invoices', 'purchase_invoices', 'delivery_forms'].includes(moduleId)) {
    return json(400, { error: 'invalid_module', message: 'نوع سند معتبر نیست.' });
  }

  if (moduleId === 'delivery_forms' && !['delivered_by', 'received_by'].includes(partyKey)) {
    return json(400, { error: 'invalid_party', message: 'نوع تاییدکننده معتبر نیست.' });
  }

  const normalizedPhone = normalizePhone(String(phone));
  if (!/^09\d{9}$/.test(normalizedPhone)) {
    return json(400, { error: 'invalid_phone', message: 'شماره موبایل معتبر نیست.' });
  }

  let rateLimitRequestId: string | null = null;
  try {
    const isDeliveryForm = moduleId === 'delivery_forms';
    const rateResult = await callRpc('allow_public_confirmation_otp_request', {
      p_scope: isDeliveryForm ? 'delivery_confirmation' : 'invoice_confirmation',
      p_source_token: systemCode,
      p_module: moduleId,
      p_party: isDeliveryForm ? partyKey : '',
      p_phone: normalizedPhone,
      p_client_ip: getClientIp(req),
    });

    if (!rateResult?.allowed) {
      const retryAfterSeconds = Math.max(1, Number(rateResult?.retry_after_seconds || 90));
      return json(429, {
        error: 'rate_limited',
        message: 'درخواست کد بیش از حد تکرار شده است. کمی بعد دوباره تلاش کنید.',
        retry_after_seconds: retryAfterSeconds,
      });
    }
    rateLimitRequestId = String(rateResult?.request_id || '').trim() || null;

    // 1. Generate OTP hash in DB and get the plain OTP code back
    const otpResult = isDeliveryForm
      ? await callRpc('send_delivery_confirm_otp', {
          p_code: systemCode,
          p_party: partyKey,
          p_phone: normalizedPhone,
        })
      : await callRpc('send_invoice_confirm_otp', {
          p_system_code: systemCode,
          p_module: moduleId,
          p_phone: normalizedPhone,
        });

    if (otpResult?.error) {
      const errMap: Record<string, string> = {
        not_found:      'فاکتور پیدا نشد.',
        invalid_status: 'وضعیت فاکتور اجازه تایید را نمی‌دهد.',
        phone_not_allowed: 'این شماره برای تایید این فاکتور مجاز نیست.',
        invalid_party: 'نوع تاییدکننده معتبر نیست.',
        already_confirmed: 'این بخش قبلا تایید شده است.',
      };
      if (isDeliveryForm) {
        errMap.not_found = 'فرم تحویل پیدا نشد.';
        errMap.invalid_status = 'وضعیت فرم تحویل اجازه تایید را نمی‌دهد.';
        errMap.phone_not_allowed = 'این شماره برای تایید این فرم تحویل مجاز نیست.';
      }
      await releaseRateLimitRequest(rateLimitRequestId);
      rateLimitRequestId = null;
      return json(400, {
        error:   otpResult.error,
        message: errMap[otpResult.error] ?? 'خطا در ارسال کد.',
      });
    }

    const otpCode = String(otpResult?.otp_code || '').trim();
    if (!otpCode) {
      console.error('invoice-otp: otp_code missing in RPC response', JSON.stringify(otpResult));
      await releaseRateLimitRequest(rateLimitRequestId);
      rateLimitRequestId = null;
      return json(500, { error: 'otp_generation_failed' });
    }

    // 2. Send SMS via send-sms function (same path as login OTP)
    await sendOtpViaSendSmsFunction(normalizedPhone, otpCode);

    return json(200, { success: true });
  } catch (err: any) {
    await releaseRateLimitRequest(rateLimitRequestId);
    console.error('invoice-otp error:', err?.message || err);
    return json(500, {
      error:   'internal_error',
      message: 'ارسال کد در حال حاضر ممکن نیست. لطفاً دوباره تلاش کنید.',
    });
  }
});
