// @ts-nocheck

type SmsMode = 'rest' | 'soap';

type SmsSettings = {
  username?: string;
  password?: string;
  api_key?: string;
  sender_number?: string;
  body_id?: string;
  credit_url?: string;
  console_advanced_url?: string;
  console_shared_url?: string;
  otp_text_template?: string;
  otp_soap_url?: string;
  otp_shared_body_id?: string | number;
  otp_timeout_ms?: number | string;
  otp_provider_mode?: 'rest' | 'soap' | 'auto' | 'console_advanced' | 'console_shared' | string;
  otp_login_enabled?: boolean;
  otp_delivery_mode?: 'sms_only' | 'sms_and_bale' | string;
  mode?: SmsMode | string;
  base_url?: string;
  is_flash?: boolean;
};

type AuthHookPayload = {
  user?: {
    phone?: string;
    email?: string;
    id?: string;
  };
  sms?: {
    otp?: string;
  };
  otp?: string | number;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FUNCTION_BUILD = 'send-sms-2026-04-04-04';

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Kalam-Function-Build': FUNCTION_BUILD,
    },
  });

const DEFAULT_SMS_SEND_URL = 'https://api.payamak-panel.com/post/send.asmx/SendSimpleSMS2';
const DEFAULT_SMS_CREDIT_URL = 'https://api.payamak-panel.com/post/send.asmx/GetCredit';
const DEFAULT_SMS_OTP_URL = 'https://rest.payamak-panel.com/api/SendSMS/SendOtp';
const DEFAULT_SMS_OTP_SOAP_URL = 'https://api.payamak-panel.com/post/Send.asmx/SendOtp';

const mergeEnvPreferredSmsSettings = (settings: SmsSettings | null | undefined): SmsSettings => ({
  ...(settings || {}),
  username: String(Deno.env.get('MELIPAYAMAK_USERNAME') || settings?.username || '').trim(),
  password: String(Deno.env.get('MELIPAYAMAK_PASSWORD') || settings?.password || '').trim(),
  api_key: String(Deno.env.get('MELIPAYAMAK_API_KEY') || settings?.api_key || '').trim(),
  sender_number: String(Deno.env.get('MELIPAYAMAK_SENDER_NUMBER') || settings?.sender_number || '').trim(),
  console_advanced_url: String(Deno.env.get('MELIPAYAMAK_CONSOLE_ADVANCED_URL') || settings?.console_advanced_url || '').trim(),
  console_shared_url: String(Deno.env.get('MELIPAYAMAK_CONSOLE_SHARED_URL') || settings?.console_shared_url || '').trim(),
  otp_text_template: String(Deno.env.get('MELIPAYAMAK_OTP_TEXT_TEMPLATE') || settings?.otp_text_template || '').trim(),
  otp_soap_url: String(Deno.env.get('MELIPAYAMAK_OTP_SOAP_URL') || settings?.otp_soap_url || '').trim(),
  otp_shared_body_id: String(Deno.env.get('MELIPAYAMAK_OTP_SHARED_BODY_ID') || settings?.otp_shared_body_id || settings?.body_id || '').trim(),
});

const mergeEnvFallbackSmsSettings = (settings: SmsSettings | null | undefined): SmsSettings => ({
  ...(settings || {}),
  username: String(settings?.username || Deno.env.get('MELIPAYAMAK_USERNAME') || '').trim(),
  password: String(settings?.password || Deno.env.get('MELIPAYAMAK_PASSWORD') || '').trim(),
  api_key: String(settings?.api_key || Deno.env.get('MELIPAYAMAK_API_KEY') || '').trim(),
  sender_number: String(settings?.sender_number || Deno.env.get('MELIPAYAMAK_SENDER_NUMBER') || '').trim(),
  console_advanced_url: String(settings?.console_advanced_url || Deno.env.get('MELIPAYAMAK_CONSOLE_ADVANCED_URL') || '').trim(),
  console_shared_url: String(settings?.console_shared_url || Deno.env.get('MELIPAYAMAK_CONSOLE_SHARED_URL') || '').trim(),
  otp_text_template: String(settings?.otp_text_template || Deno.env.get('MELIPAYAMAK_OTP_TEXT_TEMPLATE') || '').trim(),
  otp_soap_url: String(settings?.otp_soap_url || Deno.env.get('MELIPAYAMAK_OTP_SOAP_URL') || '').trim(),
  otp_shared_body_id: String(settings?.otp_shared_body_id || settings?.body_id || Deno.env.get('MELIPAYAMAK_OTP_SHARED_BODY_ID') || '').trim(),
});

const getServiceHeaders = (serviceRoleKey: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
});

const normalizeDigitsToEnglish = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

const decodeSoapScalar = (raw: string) => {
  const text = String(raw || '').trim();
  if (!text) return '';

  const xmlMatch = text.match(/<[^>]+>([^<]*)<\/[^>]+>\s*$/s);
  if (xmlMatch && typeof xmlMatch[1] === 'string') {
    const candidate = xmlMatch[1].trim();
    if (candidate) return candidate;
  }

  const soapMatch = text.match(/>(-?\d+(?:\.\d+)?)</);
  if (soapMatch?.[1]) return soapMatch[1];

  return text;
};

const isNumericLike = (value: string) => /^-?\d+(?:\.\d+)?$/.test(String(value || '').trim());

const MELIPAYAMAK_STATUS_MESSAGES: Record<string, string> = {
  '-111': 'IP درخواست کننده نامعتبر است.',
  '-1011': 'باید به جای رمز عبور از API Key استفاده شود.',
  '-1099': 'باید IP برای استفاده از API مجاز شود.',
  '-108': 'IP به دلیل تلاش ناموفق استفاده از API مسدود شده است.',
  '0': 'نام کاربری یا رمز عبور/API Key اشتباه است.',
  '2': 'اعتبار کافی نیست.',
  '3': 'محدودیت در ارسال روزانه وجود دارد.',
  '4': 'محدودیت در حجم ارسال وجود دارد.',
  '5': 'شماره فرستنده معتبر نیست.',
  '6': 'سامانه در حال بروزرسانی است یا لینک ارسال در دسترس نیست.',
  '7': 'متن پیامک شامل کلمه فیلتر شده است.',
  '9': 'ارسال از خطوط عمومی از طریق وب‌سرویس ممکن نیست.',
  '10': 'کاربر مورد نظر فعال نیست.',
  '11': 'ارسال انجام نشد.',
  '12': 'مدارک کاربر کامل نیست.',
  '14': 'متن پیامک شامل لینک است.',
  '15': 'قالب/متن ارسالی معتبر نیست.',
  '16': 'شماره گیرنده یافت نشد.',
  '17': 'متن پیامک خالی است.',
  '18': 'شماره موبایل معتبر نیست.',
  '35': 'اطلاعات درخواست نامعتبر است.',
};

const getMelipayamakMessage = (code: string) => MELIPAYAMAK_STATUS_MESSAGES[String(code || '').trim()] || null;

const MELIPAYAMAK_STATUS_MESSAGES_FA: Record<string, string> = {
  '-111': 'IP درخواست‌کننده نامعتبر است.',
  '-1011': 'باید به‌جای رمز عبور از API Key استفاده شود.',
  '-1099': 'IP برای استفاده از API مجاز نشده است.',
  '-108': 'IP به دلیل تلاش ناموفق برای استفاده از API مسدود شده است.',
  '0': 'نام کاربری یا رمز عبور/API Key اشتباه است.',
  '2': 'اعتبار کافی نیست.',
  '3': 'محدودیت در ارسال روزانه وجود دارد.',
  '4': 'محدودیت در حجم ارسال وجود دارد.',
  '5': 'شماره فرستنده معتبر نیست.',
  '6': 'سامانه در حال بروزرسانی است یا لینک ارسال در دسترس نیست.',
  '7': 'متن پیامک شامل کلمه فیلتر شده است.',
  '9': 'ارسال از خطوط عمومی از طریق وب‌سرویس ممکن نیست.',
  '10': 'کاربر مورد نظر فعال نیست.',
  '11': 'ارسال انجام نشد.',
  '12': 'مدارک کاربر کامل نیست.',
  '14': 'متن پیامک شامل لینک است.',
  '15': 'قالب یا متن ارسالی معتبر نیست.',
  '16': 'شماره گیرنده یافت نشد.',
  '17': 'متن پیامک خالی است.',
  '18': 'شماره موبایل معتبر نیست.',
  '35': 'اطلاعات درخواست نامعتبر است.',
};

const getMelipayamakStatusMessageFa = (code: string) =>
  MELIPAYAMAK_STATUS_MESSAGES_FA[String(code || '').trim()] || getMelipayamakMessage(code);

const parseJsonSafe = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const createTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
};

const getOtpProviderMode = (settings: SmsSettings) => {
  const mode = String(
    Deno.env.get('MELIPAYAMAK_OTP_MODE') ||
      settings?.otp_provider_mode ||
      'soap'
  )
    .trim()
    .toLowerCase();

  if (mode === 'rest' || mode === 'soap' || mode === 'auto' || mode === 'console_advanced' || mode === 'console_shared') return mode;
  return 'soap';
};

const getOtpTimeoutMs = (settings: SmsSettings, fallbackMs: number) => {
  const raw = String(Deno.env.get('MELIPAYAMAK_OTP_TIMEOUT_MS') || settings?.otp_timeout_ms || fallbackMs).trim();
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 500 && parsed <= 10000) return parsed;
  return fallbackMs;
};

const normalizeRecipientPhone = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\+989\d{9}$/.test(raw)) return `0${raw.slice(3)}`;
  if (/^989\d{9}$/.test(raw)) return `0${raw.slice(2)}`;
  if (/^00989\d{9}$/.test(raw)) return `0${raw.slice(4)}`;
  return raw;
};

const renderOtpText = (otp: string, settings: SmsSettings) => {
  const template = String(settings?.otp_text_template || '').trim() || 'کد تایید شما: {code}';
  return template.replaceAll('{code}', String(otp || '').trim());
};

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

const getSmsSettings = async (supabaseUrl: string, serviceRoleKey: string, overrideSettings?: SmsSettings | null) => {
  if (overrideSettings && typeof overrideSettings === 'object') {
    return mergeEnvFallbackSmsSettings(overrideSettings);
  }

  const url = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/integration_settings`);
  url.searchParams.set('connection_type', 'eq.sms');
  url.searchParams.set('is_active', 'eq.true');
  url.searchParams.set('select', 'id,settings');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getServiceHeaders(serviceRoleKey),
  });
  const raw = await response.text();

  if (!response.ok) throw new Error(raw || 'خطا در خواندن تنظیمات پیامک');

  const parsed = raw ? JSON.parse(raw) : [];
  const row = Array.isArray(parsed) ? parsed[0] : null;
  if (!row) throw new Error('تنظیمات پیامک فعال نیست.');

  return mergeEnvFallbackSmsSettings((row.settings || {}) as SmsSettings);
};

const getHookSmsSettings = (overrideSettings?: SmsSettings | null) => {
  const settings = mergeEnvPreferredSmsSettings(overrideSettings);
  const providerMode = getOtpProviderMode(settings);
  const username = String(settings.username || '').trim();
  const passwordOrApiKey = String(settings.password || settings.api_key || '').trim();
  const senderNumber = String(settings.sender_number || '').trim();
  const consoleAdvancedUrl = String(settings.console_advanced_url || '').trim();
  const consoleSharedUrl = String(settings.console_shared_url || '').trim();
  const sharedBodyId = String(settings.otp_shared_body_id || '').trim();
  const missing: string[] = [];

  if (providerMode === 'console_shared') {
    if (!consoleSharedUrl) missing.push('MELIPAYAMAK_CONSOLE_SHARED_URL');
    if (!sharedBodyId) missing.push('MELIPAYAMAK_OTP_SHARED_BODY_ID');
  } else if (providerMode === 'console_advanced') {
    if (!consoleAdvancedUrl) missing.push('MELIPAYAMAK_CONSOLE_ADVANCED_URL');
    if (!senderNumber) missing.push('MELIPAYAMAK_SENDER_NUMBER');
  } else {
    if (!username) missing.push('MELIPAYAMAK_USERNAME');
    if (!passwordOrApiKey) missing.push('MELIPAYAMAK_PASSWORD/API_KEY');
    if (!senderNumber) missing.push('MELIPAYAMAK_SENDER_NUMBER');
  }

  if (missing.length > 0) {
    throw new Error(`تنظیمات مرکزی OTP در env کامل نیست: ${missing.join(', ')}`);
  }

  return settings;
};

const verifyUserToken = async (supabaseUrl: string, serviceRoleKey: string, userToken: string) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${userToken}`,
    },
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || 'Unauthorized');
  }

  const user = await response.json();
  if (!user?.id) throw new Error('Unauthorized');
  return user;
};

type HookLeafEntry = { path: string; value: string };

const collectHookLeafEntries = (
  value: unknown,
  path: string[] = [],
  depth = 0,
  acc: HookLeafEntry[] = [],
): HookLeafEntry[] => {
  if (depth > 6 || value === null || value === undefined) return acc;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    acc.push({ path: path.join('.'), value: normalizeDigitsToEnglish(value).trim() });
    return acc;
  }
  if (Array.isArray(value)) {
    value.slice(0, 30).forEach((item, index) => {
      collectHookLeafEntries(item, [...path, String(index)], depth + 1, acc);
    });
    return acc;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>)
      .slice(0, 60)
      .forEach(([key, item]) => {
        collectHookLeafEntries(item, [...path, key], depth + 1, acc);
      });
  }
  return acc;
};

const normalizeIranMobileFromAny = (value: string): string => {
  const raw = normalizeDigitsToEnglish(value).trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (/^00989\d{9}$/.test(digits)) return `+${digits.slice(2)}`;
  if (/^989\d{9}$/.test(digits)) return `+${digits}`;
  if (/^09\d{9}$/.test(digits)) return `+98${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+98${digits}`;
  const embedded = raw.match(/(?:\+?98|0098|0)?9\d{9}/);
  if (embedded?.[0]) return normalizeIranMobileFromAny(embedded[0]);
  return '';
};

const extractHookOtp = (body: AuthHookPayload & Record<string, any>) => {
  const strictCandidates = [
    body?.sms?.otp,
    body?.sms?.code,
    body?.sms?.token,
    body?.sms?.message,
    body?.sms?.text,
    body?.otp,
    body?.code,
    body?.token,
    body?.otp_code,
    body?.message?.otp,
    body?.template_data?.otp,
    body?.template_data?.code,
    body?.data?.otp,
    body?.data?.code,
    body?.data?.token,
    body?.sms_code,
    body?.verification_code,
  ];
  for (const candidate of strictCandidates) {
    const value = normalizeDigitsToEnglish(candidate).trim();
    if (!value) continue;
    if (/^\d{4,8}$/.test(value)) return value;
  }

  const textCandidates = [
    body?.sms?.message,
    body?.sms?.text,
    body?.message,
    body?.text,
    typeof body?.sms === 'string' ? body.sms : '',
  ];
  for (const candidate of textCandidates) {
    const value = normalizeDigitsToEnglish(candidate).trim();
    if (!value) continue;
    const matches = value.match(/\b(\d{4,8})\b/g);
    if (matches?.length) {
      const lastMatch = String(matches[matches.length - 1] || '').replace(/\D/g, '');
      if (/^\d{4,8}$/.test(lastMatch)) return lastMatch;
    }
  }

  const leafEntries = collectHookLeafEntries(body);
  const prioritizedLeafEntries = leafEntries.filter((entry) => /otp|verification|code|sms/i.test(entry.path));
  for (const entry of prioritizedLeafEntries) {
    if (/^\d{4,8}$/.test(entry.value)) return entry.value;
    const codeMatches = entry.value.match(/\b(\d{4,8})\b/g);
    if (codeMatches?.length) {
      const last = String(codeMatches[codeMatches.length - 1] || '').replace(/\D/g, '');
      if (/^\d{4,8}$/.test(last)) return last;
    }
  }

  return '';
};

const extractHookPhone = (body: AuthHookPayload & Record<string, any>) => {
  const candidates = [
    body?.phone,
    body?.to,
    body?.sms?.to,
    body?.sms?.phone,
    body?.data?.phone,
    body?.message?.phone,
    body?.user?.phone_change,
    body?.user?.new_phone,
    body?.user?.phone_confirm,
    body?.user?.phone,
  ];
  for (const candidate of candidates) {
    const value = normalizeDigitsToEnglish(candidate).trim();
    const normalized = normalizeIranMobileFromAny(value);
    if (normalized) return normalized;
  }

  const leafEntries = collectHookLeafEntries(body);
  const prioritizedLeafEntries = leafEntries.filter((entry) => /phone|mobile|recipient|to|sms/i.test(entry.path));
  for (const entry of prioritizedLeafEntries) {
    const normalized = normalizeIranMobileFromAny(entry.value);
    if (normalized) return normalized;
  }
  return '';
};

const extractHookMessageText = (body: AuthHookPayload & Record<string, any>): string => {
  const directCandidates = [
    body?.sms?.message,
    body?.sms?.text,
    body?.message?.text,
    body?.message?.body,
    body?.message,
    body?.text,
  ];
  for (const candidate of directCandidates) {
    const value = String(candidate ?? '').trim();
    if (value) return value;
  }

  const leafEntries = collectHookLeafEntries(body);
  const prioritizedLeafEntries = leafEntries.filter((entry) => /message|text|sms/i.test(entry.path));
  const best = prioritizedLeafEntries.find((entry) => String(entry.value || '').trim().length >= 4);
  return String(best?.value || '').trim();
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

  const providerResults: Array<{ recipient: string; raw: string; result: string }> = [];

  for (const recipient of recipients) {
    let response: Response;

    if (useSoapRequest) {
      const form = new URLSearchParams({
        UserName: username,
        PassWord: password || apiKey,
        To: recipient,
        From: senderNumber,
        Text: text,
        IsFlash: isFlash ? 'true' : 'false',
      });
      if (bodyId) form.set('bodyId', bodyId);

      const timeout = createTimeoutSignal(9000);
      try {
        response = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: form.toString(),
          signal: timeout.signal,
        });
      } finally {
        timeout.cleanup();
      }
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

      const timeout = createTimeoutSignal(9000);
      try {
        response = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: timeout.signal,
        });
      } finally {
        timeout.cleanup();
      }
    }

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(raw || `HTTP ${response.status}`);
    }

    const result = decodeSoapScalar(raw);
    const providerMessage = getMelipayamakMessage(result);
    if (providerMessage) {
      throw new Error(`ارسال پیامک توسط ملی پیامک تایید نشد. ${providerMessage} کد/نتیجه: ${result}`);
    }

    providerResults.push({ recipient, raw, result });
  }

  return {
    sent: recipients.length,
    provider_results: providerResults,
  };
};

const sendSmsWithProviderFallback = async (to: string[], text: string, settings: SmsSettings) => {
  const recipients = Array.from(new Set((to || []).map((value) => normalizeRecipientPhone(String(value || '').trim())).filter(Boolean)));
  const messageText = String(text || '').trim();
  const username = String(settings.username || '').trim();
  const password = String(settings.password || '').trim();
  const apiKey = String(settings.api_key || '').trim();
  const senderNumber = String(settings.sender_number || '').trim();
  const isFlash = !!settings.is_flash;
  const restUrl = normalizeSmsUrl('https://rest.payamak-panel.com/api/SendSMS/SendSMS', 'rest');

  if (!senderNumber) {
    throw new Error('تنظیمات ارسال پیامک ناقص است. شماره خط ارسال ثبت نشده است.');
  }
  if (!apiKey && (!username || !password)) {
    throw new Error('نام کاربری/رمز عبور یا API Key برای سامانه پیامک کامل نیست.');
  }
  if (recipients.length === 0) {
    throw new Error('گیرنده پیامک مشخص نشده است.');
  }
  if (!messageText) {
    throw new Error('متن پیامک خالی است.');
  }

  const sendViaRest = async (timeoutMs = 8000) => {
    const providerResults: Array<{ recipient: string; raw: string; result: string; method: string }> = [];

    for (const recipient of recipients) {
      const payload: Record<string, any> = {
        username,
        password: password || apiKey,
        to: recipient,
        from: senderNumber,
        text: messageText,
        isFlash,
      };

      const timeout = createTimeoutSignal(timeoutMs);
      let response: Response;
      try {
        response = await fetch(restUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: timeout.signal,
        });
      } finally {
        timeout.cleanup();
      }

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(raw || `HTTP ${response.status}`);
      }

      const parsed = parseJsonSafe(raw);
      const retStatus = Number(parsed?.RetStatus ?? parsed?.retStatus ?? NaN);
      const statusText = String(parsed?.StrRetStatus ?? parsed?.strRetStatus ?? parsed?.status ?? '').trim();
      const result = String(
        parsed?.Value ??
        parsed?.value ??
        parsed?.recId ??
        parsed?.messageid ??
        decodeSoapScalar(raw)
      ).trim();

      if (Number.isFinite(retStatus) && retStatus !== 1) {
        const providerMessage = getMelipayamakStatusMessageFa(result);
        throw new Error(`مسیر REST ناموفق بود. ${providerMessage || statusText || raw} کد/نتیجه: ${result || retStatus}`);
      }

      const providerMessage = getMelipayamakStatusMessageFa(result);
      if (providerMessage && !Number.isFinite(retStatus)) {
        throw new Error(`مسیر REST ناموفق بود. ${providerMessage} کد/نتیجه: ${result}`);
      }

      providerResults.push({ recipient, raw, result: result || statusText || 'accepted', method: 'rest_send_sms' });
    }

    return {
      provider_method: 'rest_send_sms',
      sent: recipients.length,
      provider_results: providerResults,
    };
  };

  try {
    const result = await sendViaRest();
    return {
      ...result,
      provider_attempts: [{ method: 'rest_send_sms', success: true }],
    };
  } catch (error: any) {
    const message = String(error?.message || error);
    console.warn('[send-sms] send provider=rest_send_sms:failed', message);
    throw new Error(`ارسال پیامک از مسیر REST ملی پیامک ناموفق بود. ${message}`);
  }
};

const getSmsCreditWithProvider = async (settings: SmsSettings) => {
  const username = String(settings.username || '').trim();
  const password = String(settings.password || settings.api_key || '').trim();
  const creditUrl = String(Deno.env.get('MELIPAYAMAK_SMS_CREDIT_URL') || settings.credit_url || DEFAULT_SMS_CREDIT_URL).trim();

  if (!username || !password) {
    throw new Error('برای دریافت اعتبار پیامک، نام کاربری و رمز عبور ملی پیامک لازم است.');
  }

  const form = new URLSearchParams({
    UserName: username,
    PassWord: password,
  });

  const timeout = createTimeoutSignal(6000);
  let response: Response;
  try {
    response = await fetch(creditUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: form.toString(),
      signal: timeout.signal,
    });
  } finally {
    timeout.cleanup();
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `HTTP ${response.status}`);
  }

  const balance = decodeSoapScalar(raw);
  const providerMessage = getMelipayamakMessage(balance);

  if (providerMessage) {
    throw new Error(`دریافت اعتبار از ملی پیامک ناموفق بود. ${providerMessage} کد/نتیجه: ${balance}`);
  }

  return {
    balance,
    raw,
  };
};


const sendOtpViaSoap = async (phone: string, otp: string, settings: SmsSettings, timeoutMs = 4200) => {
  const soapUrl = String(Deno.env.get('MELIPAYAMAK_OTP_SOAP_URL') || settings?.otp_soap_url || DEFAULT_SMS_OTP_SOAP_URL).trim();
  const form = new URLSearchParams({
    username: String(settings.username || '').trim(),
    password: String(settings.password || settings.api_key || '').trim(),
    code: String(otp || '').trim(),
    to: normalizeRecipientPhone(String(phone || '').trim()),
    from: String(settings.sender_number || '').trim(),
  });

  const timeout = createTimeoutSignal(timeoutMs);
  let response: Response;
  try {
    response = await fetch(soapUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: form.toString(),
      signal: timeout.signal,
    });
  } finally {
    timeout.cleanup();
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `HTTP ${response.status}`);
  }

  const result = decodeSoapScalar(raw);
  const providerMessage = getMelipayamakMessage(result);
  if (providerMessage) {
    throw new Error(`ارسال کد تایید توسط ملی پیامک ناموفق بود. ${providerMessage} کد/نتیجه: ${result}`);
  }

  return {
    method: 'dedicated_otp_soap',
    raw,
    provider_value: result || null,
  };
};

const sendOtpViaRest = async (phone: string, otp: string, settings: SmsSettings, timeoutMs = 3200) => {
  const recipient = normalizeRecipientPhone(String(phone || '').trim());
  const code = String(otp || '').trim();
  const dedicatedUrl = String(Deno.env.get('MELIPAYAMAK_OTP_URL') || DEFAULT_SMS_OTP_URL).trim();
  const passwordOrApiKey = String(settings.password || settings.api_key || '').trim();

  if (!recipient || !code) {
    throw new Error('شماره موبایل یا کد OTP معتبر نیست.');
  }

  const payload: Record<string, any> = {
    username: String(settings.username || '').trim(),
    password: passwordOrApiKey,
    From: String(settings.sender_number || '').trim(),
    to: recipient,
    code: Number(code),
  };

  console.log('[send-sms] otp provider=rest:start');
  const timeout = createTimeoutSignal(timeoutMs);
  let response: Response;
  try {
    response = await fetch(dedicatedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });
  } finally {
    timeout.cleanup();
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `HTTP ${response.status}`);
  }

  let parsed: Record<string, any> | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  const retStatus = Number(parsed?.RetStatus ?? parsed?.retStatus ?? NaN);
  const strRetStatus = String(parsed?.StrRetStatus ?? parsed?.strRetStatus ?? '').trim();
  const value = String(parsed?.Value ?? parsed?.value ?? '').trim();

  if (Number.isFinite(retStatus) && retStatus !== 1) {
    const providerMessage = getMelipayamakMessage(value);
    const detail = providerMessage || value || strRetStatus || raw;
    throw new Error(`ارسال کد تایید توسط ملی پیامک ناموفق بود. نتیجه: ${detail}`);
  }

  console.log('[send-sms] otp provider=rest:ok');
  return {
    method: 'dedicated_otp_rest',
    raw,
    ret_status: Number.isFinite(retStatus) ? retStatus : null,
    provider_value: value || null,
    provider_status_text: strRetStatus || null,
  };
};

const sendOtpViaConsoleAdvanced = async (phone: string, otp: string, settings: SmsSettings, timeoutMs = 4200) => {
  const endpoint = String(settings?.console_advanced_url || '').trim();
  const recipient = normalizeRecipientPhone(String(phone || '').trim());
  const text = renderOtpText(otp, settings);

  if (!endpoint) {
    throw new Error('آدرس console advanced ملی پیامک برای OTP تنظیم نشده است.');
  }
  if (!recipient || !text) {
    throw new Error('شماره موبایل یا متن OTP معتبر نیست.');
  }

  console.log('[send-sms] otp provider=console_advanced:start');
  const timeout = createTimeoutSignal(timeoutMs);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: String(settings.sender_number || '').trim(),
        to: [recipient],
        text,
        udh: '',
      }),
      signal: timeout.signal,
    });
  } finally {
    timeout.cleanup();
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `HTTP ${response.status}`);
  }

  let parsed: Record<string, any> | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  const recIds = Array.isArray(parsed?.recIds) ? parsed.recIds : [];
  const status = String(parsed?.status ?? '').trim();

  if (recIds.length === 0) {
    throw new Error(`ارسال OTP با console advanced ناموفق بود. ${status || raw}`);
  }

  console.log('[send-sms] otp provider=console_advanced:ok');
  return {
    method: 'console_advanced',
    raw,
    rec_ids: recIds,
    provider_status_text: status || null,
  };
};

const sendOtpViaConsoleShared = async (phone: string, otp: string, settings: SmsSettings, timeoutMs = 4200) => {
  const endpoint = String(settings?.console_shared_url || '').trim();
  const recipient = normalizeRecipientPhone(String(phone || '').trim());
  const bodyIdRaw = String(settings?.otp_shared_body_id || '').trim();
  const bodyId = Number(bodyIdRaw);

  if (!endpoint) {
    throw new Error('آدرس console shared ملی پیامک برای OTP تنظیم نشده است.');
  }
  if (!recipient) {
    throw new Error('شماره موبایل OTP معتبر نیست.');
  }
  if (!Number.isFinite(bodyId) || bodyId <= 0) {
    throw new Error('bodyId خدماتی OTP معتبر تنظیم نشده است.');
  }

  console.log('[send-sms] otp provider=console_shared:start');
  const timeout = createTimeoutSignal(timeoutMs);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bodyId,
        to: recipient,
        args: [String(otp || '').trim()],
      }),
      signal: timeout.signal,
    });
  } finally {
    timeout.cleanup();
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `HTTP ${response.status}`);
  }

  let parsed: Record<string, any> | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  const recId = String(parsed?.recId ?? '').trim();
  const status = String(parsed?.status ?? '').trim();

  if (!recId || !isNumericLike(recId)) {
    throw new Error(`ارسال OTP با console shared ناموفق بود. ${status || raw}`);
  }

  console.log('[send-sms] otp provider=console_shared:ok');
  return {
    method: 'console_shared',
    raw,
    rec_id: recId,
    provider_status_text: status || null,
  };
};

const sendOtpWithProvider = async (phone: string, otp: string, settings: SmsSettings) => {
  const providerMode = getOtpProviderMode(settings);
  const timeoutMs = getOtpTimeoutMs(settings, 4200);

  if (providerMode === 'console_shared') {
    return await sendOtpViaConsoleShared(phone, otp, settings, timeoutMs);
  }

  if (providerMode === 'console_advanced') {
    return await sendOtpViaConsoleAdvanced(phone, otp, settings, timeoutMs);
  }

  if (providerMode === 'rest') {
    return await sendOtpViaRest(phone, otp, settings, timeoutMs);
  }

  if (providerMode === 'soap') {
    console.log('[send-sms] otp provider=soap:start');
    const result = await sendOtpViaSoap(phone, otp, settings, timeoutMs);
    console.log('[send-sms] otp provider=soap:ok');
    return result;
  }

  const sharedTimeoutMs = Math.min(Math.max(Math.floor(timeoutMs * 0.35), 1200), 2000);
  const restTimeoutMs = Math.min(Math.max(Math.floor(timeoutMs * 0.2), 700), 1200);
  const soapTimeoutMs = Math.min(Math.max(Math.floor(timeoutMs * 0.2), 700), 1200);
  const consoleTimeoutMs = Math.max(timeoutMs - sharedTimeoutMs - restTimeoutMs - soapTimeoutMs, 800);
  const errors: string[] = [];

  try {
    return await sendOtpViaConsoleShared(phone, otp, settings, sharedTimeoutMs);
  } catch (sharedError: any) {
    const message = String(sharedError?.message || sharedError);
    errors.push(`shared=${message}`);
    console.warn('[send-sms] otp provider=console_shared:failed', message);
  }

  try {
    return await sendOtpViaRest(phone, otp, settings, restTimeoutMs);
  } catch (restError: any) {
    const message = String(restError?.message || restError);
    errors.push(`rest=${message}`);
    console.warn('[send-sms] otp provider=rest:failed', message);
  }

  try {
    console.log('[send-sms] otp provider=soap:start');
    const result = await sendOtpViaSoap(phone, otp, settings, soapTimeoutMs);
    console.log('[send-sms] otp provider=soap:ok');
    return result;
  } catch (soapError: any) {
    const message = String(soapError?.message || soapError);
    errors.push(`soap=${message}`);
    console.warn('[send-sms] otp provider=soap:failed', message);
  }

  try {
    return await sendOtpViaConsoleAdvanced(phone, otp, settings, consoleTimeoutMs);
  } catch (consoleError: any) {
    const message = String(consoleError?.message || consoleError);
    errors.push(`console=${message}`);
    console.warn('[send-sms] otp provider=console_advanced:failed', message);
  }

  throw new Error(`ارسال OTP در همه مسیرها ناموفق بود. ${errors.join(' | ')}`);
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

  try {
    const body = (await req.json()) as ({
      action?: 'send' | 'get_balance';
      to?: string[];
      text?: string;
      overrideSettings?: SmsSettings;
    } & AuthHookPayload);

    const authHeader = req.headers.get('Authorization') || '';
    const hookSecret = String(Deno.env.get('KALAM_AUTH_SMS_HOOK_SECRET') || '').trim();
    const requestHookSecret = String(new URL(req.url).searchParams.get('hook_secret') || '').trim();
    const hookOtp = extractHookOtp(body as any);
    const hookPhone = extractHookPhone(body as any);
    const hasHookSecret = !!hookSecret && requestHookSecret === hookSecret;
    const hasBearerToken = authHeader.startsWith('Bearer ');
    const isLikelyHookPayload =
      !!hookOtp ||
      !!body?.user ||
      !!body?.sms ||
      !!body?.message ||
      !!body?.text ||
      !!body?.template_data ||
      !hasBearerToken;
    const isAuthHookRequest = (hasHookSecret || !hasBearerToken) && isLikelyHookPayload;
    const payloadShape = {
      topKeys: Object.keys(body || {}).slice(0, 12),
      hasUser: !!body?.user,
      hasSms: !!body?.sms,
      hasMessage: !!body?.message,
      hasText: !!body?.text,
      hasTemplateData: !!body?.template_data,
    };
    console.log(
      `[send-sms] build=${FUNCTION_BUILD} action=${String(body?.action || 'send')} hook=${isAuthHookRequest ? 'yes' : 'no'} hasSecret=${hasHookSecret ? 'yes' : 'no'} hasOtp=${hookOtp ? 'yes' : 'no'} hasPhone=${hookPhone ? 'yes' : 'no'} shape=${JSON.stringify(payloadShape)}`
    );

    if (isAuthHookRequest) {
      if (!hookPhone) {
        console.warn('[send-sms] hook payload missing phone', JSON.stringify(payloadShape));
        return json(400, { success: false, message: 'SMS hook payload did not include phone number' });
      }

      const settings = getHookSmsSettings(body?.overrideSettings);
      if (hookOtp) {
        const result = await sendOtpWithProvider(hookPhone, hookOtp, settings);
        return json(200, { success: true, ...result });
      }

      const hookText = extractHookMessageText(body as any);
      if (hookText) {
        const sentResult = await sendSmsWithProviderFallback([hookPhone], hookText, settings);
        return json(200, { success: true, mode: 'hook_text_fallback', ...sentResult });
      }

      console.warn('[send-sms] hook payload missing otp', JSON.stringify(payloadShape));
      return json(400, { success: false, message: 'SMS hook payload did not include OTP code' });
    }
    if (!authHeader.startsWith('Bearer ')) {
      return json(401, { success: false, message: 'Missing bearer token' });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    try {
      await verifyUserToken(supabaseUrl, serviceRoleKey, token);
    } catch {
      return json(401, { success: false, message: 'Unauthorized' });
    }

    const settings = await getSmsSettings(supabaseUrl, serviceRoleKey, body?.overrideSettings);
    const action = String(body?.action || 'send').trim();

    if (action === 'get_balance') {
      const result = await getSmsCreditWithProvider(settings);
      return json(200, { success: true, ...result });
    }

    const to = Array.isArray(body?.to) ? body.to : [];
    const text = String(body?.text || '').trim();
    if (to.length === 0 || !text) {
      return json(400, { success: false, message: 'to و text الزامی است.' });
    }

    const sentResult = await sendSmsWithProviderFallback(to, text, settings);

    return json(200, { success: true, ...sentResult });
  } catch (error: any) {
    console.error('[send-sms] error', String(error?.message || error));
    return json(400, {
      success: false,
      message: String(error?.message || 'خطا در ارسال پیامک'),
    });
  }
});
