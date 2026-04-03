import { supabase } from '../supabaseClient';
import { getActiveChannelSettings } from './channelSettings';

type SmsMode = 'rest' | 'soap';

export type SmsSettings = {
  username?: string;
  password?: string;
  api_key?: string;
  sender_number?: string;
  body_id?: string;
  credit_url?: string;
  otp_login_enabled?: boolean;
  otp_delivery_mode?: 'sms_only' | 'sms_and_bale' | string;
  mode?: SmsMode | string;
  base_url?: string;
  is_flash?: boolean;
};

export type SmsProviderResult = {
  recipient: string;
  raw?: string;
  result?: string;
};

export type SmsGatewaySendResult = {
  success?: boolean;
  sent?: number;
  provider_results?: SmsProviderResult[];
  build?: string;
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

const decodeSoapScalar = (raw: string) => {
  const text = String(raw || '').trim();
  if (!text) return '';

  const xmlMatch = text.match(/<[^>]+>([^<]*)<\/[^>]+>\s*$/s);
  if (xmlMatch && typeof xmlMatch[1] === 'string') {
    const candidate = xmlMatch[1].trim();
    if (candidate) return candidate;
  }

  const numericMatch = text.match(/>(-?\d+(?:\.\d+)?)</);
  if (numericMatch?.[1]) return numericMatch[1];

  return text;
};

const getActiveSmsSettings = async (): Promise<SmsSettings> => {
  const data = await getActiveChannelSettings('sms');
  if (!data) throw new Error('تنظیمات سامانه پیامک فعال نیست.');

  return (data.settings || {}) as SmsSettings;
};

const sendSmsDirect = async (
  to: string[],
  text: string,
  settings: SmsSettings
): Promise<SmsGatewaySendResult> => {
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

  const providerResults: SmsProviderResult[] = [];

  for (const recipient of recipients) {
    let response: Response;
    if (useSoapRequest) {
      const body = new URLSearchParams({
        UserName: username,
        PassWord: password || apiKey,
        To: recipient,
        From: senderNumber,
        Text: text,
        IsFlash: isFlash ? 'true' : 'false',
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

    providerResults.push({
      recipient,
      raw,
      result: useSoapRequest ? decodeSoapScalar(raw) : '',
    });
  }

  return {
    success: true,
    sent: recipients.length,
    provider_results: providerResults,
  };
};

const invokeSmsFunction = async (
  to: string[],
  text: string,
  overrideSettings?: SmsSettings
): Promise<SmsGatewaySendResult> => {
  const payload: Record<string, any> = { action: 'send', to, text };
  if (overrideSettings && Object.keys(overrideSettings).length > 0) {
    payload.overrideSettings = overrideSettings;
  }

  const { data, error } = await supabase.functions.invoke('send-sms', { body: payload });
  if (error) throw new Error(getErrorMessage(error, 'خطا در فراخوانی سرویس پیامک.'));
  if (data && data.success === false) {
    throw new Error(getErrorMessage(data, 'ارسال پیامک ناموفق بود.'));
  }
  return (data || { success: true }) as SmsGatewaySendResult;
};

export const getSmsBalanceViaGateway = async (overrideSettings?: SmsSettings) => {
  const payload: Record<string, any> = { action: 'get_balance' };
  if (overrideSettings && Object.keys(overrideSettings).length > 0) {
    payload.overrideSettings = overrideSettings;
  }

  const { data, error } = await supabase.functions.invoke('send-sms', { body: payload });
  if (error) throw new Error(getErrorMessage(error, 'خطا در دریافت اعتبار پیامک.'));
  if (data && data.success === false) {
    throw new Error(getErrorMessage(data, 'دریافت اعتبار پیامک ناموفق بود.'));
  }

  return {
    balance: data?.balance,
    raw: data?.raw,
  };
};

export const sendSmsViaGateway = async ({
  to,
  text,
  overrideSettings,
  allowDirectFallback = true,
}: SendSmsViaGatewayArgs): Promise<SmsGatewaySendResult> => {
  const recipients = Array.from(new Set((to || []).map((value) => String(value || '').trim()).filter(Boolean)));
  const messageText = String(text || '').trim();

  if (recipients.length === 0) {
    throw new Error('گیرنده پیامک مشخص نشده است.');
  }
  if (!messageText) {
    throw new Error('متن پیامک خالی است.');
  }

  try {
    return await invokeSmsFunction(recipients, messageText, overrideSettings);
  } catch (edgeError) {
    if (!allowDirectFallback) throw edgeError;
  }

  const smsSettings = overrideSettings && Object.keys(overrideSettings).length > 0
    ? overrideSettings
    : await getActiveSmsSettings();

  return await sendSmsDirect(recipients, messageText, smsSettings);
};
