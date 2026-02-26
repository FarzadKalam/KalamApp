import { supabase } from '../supabaseClient';

type SmsMode = 'rest' | 'soap';

export type SmsSettings = {
  mode?: SmsMode | string;
  base_url?: string;
  username?: string;
  password?: string;
  api_key?: string;
  sender_number?: string;
  body_id?: string;
  is_flash?: boolean;
};

type SendSmsViaGatewayArgs = {
  to: string[];
  text: string;
  overrideSettings?: SmsSettings;
  allowDirectFallback?: boolean;
};

const toMode = (value: unknown): SmsMode => (String(value || '').toLowerCase() === 'soap' ? 'soap' : 'rest');

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

const resolveSmsRequestUrl = (url: string) => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (import.meta.env.DEV && /(^|\.)rest\.payamak-panel\.com$/i.test(parsed.hostname)) {
      return `/api/melipayamak-rest${parsed.pathname}${parsed.search || ''}`;
    }
    if (import.meta.env.DEV && /(^|\.)api\.payamak-panel\.com$/i.test(parsed.hostname)) {
      return `/api/melipayamak-soap${parsed.pathname}${parsed.search || ''}`;
    }
    return url;
  } catch {
    return url;
  }
};

const getErrorMessage = (value: any, fallback: string) => {
  if (!value) return fallback;
  if (typeof value === 'string') return value || fallback;
  return String(value.message || value.error || fallback);
};

const getActiveSmsSettings = async (): Promise<SmsSettings> => {
  const { data, error } = await supabase
    .from('integration_settings')
    .select('*')
    .eq('connection_type', 'sms')
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('تنظیمات سامانه پیامک فعال نیست.');

  return (data.settings || {}) as SmsSettings;
};

const sendSmsDirect = async (to: string[], text: string, settings: SmsSettings) => {
  const mode = toMode(settings.mode);
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

  const requestUrl = resolveSmsRequestUrl(baseUrl);
  const useSoapRequest = mode === 'soap' || /\/post\/send\.asmx(\/SendSimpleSMS2)?$/i.test(baseUrl);
  const recipients = Array.from(new Set((to || []).map((value) => String(value || '').trim()).filter(Boolean)));

  if (recipients.length === 0) {
    throw new Error('گیرنده پیامک مشخص نشده است.');
  }

  for (const recipient of recipients) {
    let response: Response;
    if (useSoapRequest) {
      const body = new URLSearchParams({
        username,
        password,
        to: recipient,
        from: senderNumber,
        text,
        isflash: isFlash ? 'true' : 'false',
      });
      if (bodyId) body.set('bodyId', bodyId);
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: body.toString(),
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
      response = await fetch(requestUrl, {
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
};

const invokeSmsFunction = async (to: string[], text: string, overrideSettings?: SmsSettings) => {
  const payload: Record<string, any> = { to, text };
  if (overrideSettings && Object.keys(overrideSettings).length > 0) {
    payload.overrideSettings = overrideSettings;
  }

  const { data, error } = await supabase.functions.invoke('send-sms', { body: payload });
  if (error) throw new Error(getErrorMessage(error, 'خطا در فراخوانی سرویس پیامک.'));
  if (data && data.success === false) {
    throw new Error(getErrorMessage(data, 'ارسال پیامک ناموفق بود.'));
  }
};

export const sendSmsViaGateway = async ({
  to,
  text,
  overrideSettings,
  allowDirectFallback = true,
}: SendSmsViaGatewayArgs) => {
  const recipients = Array.from(new Set((to || []).map((value) => String(value || '').trim()).filter(Boolean)));
  const messageText = String(text || '').trim();

  if (recipients.length === 0) {
    throw new Error('گیرنده پیامک مشخص نشده است.');
  }
  if (!messageText) {
    throw new Error('متن پیامک خالی است.');
  }

  try {
    await invokeSmsFunction(recipients, messageText, overrideSettings);
    return;
  } catch (edgeError) {
    if (!allowDirectFallback) throw edgeError;
  }

  const smsSettings = overrideSettings && Object.keys(overrideSettings).length > 0
    ? overrideSettings
    : await getActiveSmsSettings();

  await sendSmsDirect(recipients, messageText, smsSettings);
};
