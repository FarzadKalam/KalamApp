import { supabase } from '../supabaseClient';
import { getActiveChannelSettings } from './channelSettings';
import { createOutboundMessageLog, updateOutboundMessageStatus } from './outboundMessages';

type SmsMode = 'rest' | 'soap';

export type SmsSettings = {
  username?: string;
  password?: string;
  api_key?: string;
  sender_number?: string;
  body_id?: string;
  credit_url?: string;
  mode?: SmsMode | string;
  base_url?: string;
  is_flash?: boolean;
};

export type SmsProviderResult = {
  recipient: string;
  raw?: string;
  result?: string;
  method?: string;
  provider_status?: string | null;
  provider_status_text?: string | null;
  delivery?: {
    code?: string;
    label?: string;
    status?: string;
    raw?: string;
    method?: string;
    error?: string;
  } | null;
};

export type SmsGatewaySendResult = {
  success?: boolean;
  sent?: number;
  provider_results?: SmsProviderResult[];
  provider_method?: string;
  provider_attempts?: Array<{ method: string; success: boolean; error?: string }>;
  build?: string;
};

type SendSmsViaGatewayArgs = {
  to: string[];
  text: string;
  overrideSettings?: SmsSettings;
  allowDirectFallback?: boolean;
  moduleId?: string;
  recordId?: string;
  customerId?: string;
  title?: string;
  provider?: string;
  metadata?: Record<string, any>;
  skipReportLog?: boolean;
};

type SmsLogRowRef = {
  id: string;
  recipient: string;
};

const normalizeMetadata = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, any>) };
};

const createSmsPendingLogs = async ({
  recipients,
  messageText,
  moduleId,
  recordId,
  customerId,
  title,
  provider,
  metadata,
}: {
  recipients: string[];
  messageText: string;
  moduleId?: string;
  recordId?: string;
  customerId?: string;
  title?: string;
  provider?: string;
  metadata?: Record<string, any>;
}): Promise<SmsLogRowRef[]> => {
  const rows: SmsLogRowRef[] = [];
  const baseMetadata = normalizeMetadata(metadata);

  for (const recipient of recipients) {
    try {
      const row = await createOutboundMessageLog({
        channelType: 'sms',
        provider: String(provider || 'meli_payamak'),
        moduleId,
        recordId,
        customerId,
        recipient,
        title,
        messageText,
        metadata: {
          ...baseMetadata,
          channel: 'sms',
        },
      });

      const id = String(row?.id || '').trim();
      if (id) {
        rows.push({ id, recipient });
      }
    } catch (error) {
      console.warn('Could not create outbound SMS log row', error);
    }
  }

  return rows;
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

const getInvokeErrorMessage = async (value: any, fallback: string) => {
  const baseMessage = getErrorMessage(value, fallback);
  const response = value?.context;

  if (response && typeof response === 'object' && typeof response.clone === 'function') {
    try {
      const raw = await response.clone().text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const parsedMessage = String(parsed?.message || parsed?.error || '').trim();
          if (parsedMessage) return parsedMessage;
        } catch {
          const text = String(raw || '').trim();
          if (text) return text;
        }
      }
    } catch {
      // Keep the original Supabase error if the response body is not readable.
    }
  }

  return baseMessage;
};

const SMS_DELIVERY_LOG_STATUSES = new Set([
  'provider_accepted',
  'sent',
  'delivered',
  'not_delivered',
  'operator_failed',
  'filtered',
  'blacklisted',
  'unknown_delivery',
  'failed',
]);

const resolveSmsLogStatus = (providerResult?: SmsProviderResult | null) => {
  const deliveryStatus = String(providerResult?.delivery?.status || '').trim();
  if (SMS_DELIVERY_LOG_STATUSES.has(deliveryStatus)) return deliveryStatus as any;
  return 'provider_accepted' as const;
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
  if (!data) throw new Error('طھظ†ط¸غŒظ…ط§طھ ط³ط§ظ…ط§ظ†ظ‡ ظ¾غŒط§ظ…ع© ظپط¹ط§ظ„ ظ†غŒط³طھ.');

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

  if (!baseUrl || !senderNumber) throw new Error('طھظ†ط¸غŒظ…ط§طھ ط§ط±ط³ط§ظ„ ظ¾غŒط§ظ…ع© ظ†ط§ظ‚طµ ط§ط³طھ.');
  if (!apiKey && (!username || !password)) {
    throw new Error('ظ†ط§ظ… ع©ط§ط±ط¨ط±غŒ/ط±ظ…ط² ط¹ط¨ظˆط± غŒط§ API Key ط¨ط±ط§غŒ ظ¾غŒط§ظ…ع© ع©ط§ظ…ظ„ ظ†غŒط³طھ.');
  }

  const requestUrl = resolveSmsRequestUrl(baseUrl);
  const useSoapRequest = mode === 'soap' || /\/post\/send\.asmx(\/SendSimpleSMS2)?$/i.test(baseUrl);
  const recipients = Array.from(new Set((to || []).map((value) => String(value || '').trim()).filter(Boolean)));

  if (recipients.length === 0) {
    throw new Error('ع¯غŒط±ظ†ط¯ظ‡ ظ¾غŒط§ظ…ع© ظ…ط´ط®طµ ظ†ط´ط¯ظ‡ ط§ط³طھ.');
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

const isRetryableSmsInvokeError = (value: unknown) => {
  const text = String(value || '').toLowerCase();
  return (
    text.includes('timeout:') ||
    text.includes('timeout') ||
    text.includes('aborted') ||
    text.includes('aborterror') ||
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('fetcherror') ||
    text.includes('functionsfetcherror') ||
    text.includes('http 502') ||
    text.includes('http 503') ||
    text.includes('http 504')
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const invokeSmsFunction = async (
  to: string[],
  text: string,
  overrideSettings?: SmsSettings
): Promise<SmsGatewaySendResult> => {
  const payload: Record<string, any> = { action: 'send', to, text };
  if (overrideSettings && Object.keys(overrideSettings).length > 0) {
    payload.overrideSettings = overrideSettings;
  }

  let lastError: unknown = null;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await supabase.functions.invoke('send-sms', { body: payload });
    if (error) {
      const message = await getInvokeErrorMessage(error, 'خطا در فراخوانی سرویس پیامک.');
      lastError = new Error(message);
      if (attempt < maxAttempts && isRetryableSmsInvokeError(message)) {
        await sleep(700);
        continue;
      }
      throw lastError;
    }

    if (data && data.success === false) {
      const message = getErrorMessage(data, 'ارسال پیامک ناموفق بود.');
      lastError = new Error(message);
      if (attempt < maxAttempts && isRetryableSmsInvokeError(message)) {
        await sleep(700);
        continue;
      }
      throw lastError;
    }

    return (data || { success: true }) as SmsGatewaySendResult;
  }

  throw (lastError instanceof Error ? lastError : new Error('ارسال پیامک ناموفق بود.'));
};

export const getSmsBalanceViaGateway = async (overrideSettings?: SmsSettings) => {
  const payload: Record<string, any> = { action: 'get_balance' };
  if (overrideSettings && Object.keys(overrideSettings).length > 0) {
    payload.overrideSettings = overrideSettings;
  }

  const { data, error } = await supabase.functions.invoke('send-sms', { body: payload });
  if (error) throw new Error(await getInvokeErrorMessage(error, 'ط®ط·ط§ ط¯ط± ط¯ط±غŒط§ظپطھ ط§ط¹طھط¨ط§ط± ظ¾غŒط§ظ…ع©.'));
  if (data && data.success === false) {
    throw new Error(getErrorMessage(data, 'ط¯ط±غŒط§ظپطھ ط§ط¹طھط¨ط§ط± ظ¾غŒط§ظ…ع© ظ†ط§ظ…ظˆظپظ‚ ط¨ظˆط¯.'));
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
  moduleId,
  recordId,
  customerId,
  title,
  provider,
  metadata,
  skipReportLog = false,
}: SendSmsViaGatewayArgs): Promise<SmsGatewaySendResult> => {
  const recipients = Array.from(new Set((to || []).map((value) => String(value || '').trim()).filter(Boolean)));
  const messageText = String(text || '').trim();

  if (recipients.length === 0) {
    throw new Error('ع¯غŒط±ظ†ط¯ظ‡ ظ¾غŒط§ظ…ع© ظ…ط´ط®طµ ظ†ط´ط¯ظ‡ ط§ط³طھ.');
  }
  if (!messageText) {
    throw new Error('ظ…طھظ† ظ¾غŒط§ظ…ع© ط®ط§ظ„غŒ ط§ط³طھ.');
  }

  const pendingLogRows = skipReportLog
    ? []
    : await createSmsPendingLogs({
        recipients,
        messageText,
        moduleId,
        recordId,
        customerId,
        title,
        provider,
        metadata,
      });
  const baseMetadata = normalizeMetadata(metadata);
  const attemptedAt = new Date().toISOString();

  try {
    let sendResult: SmsGatewaySendResult;
    try {
      sendResult = await invokeSmsFunction(recipients, messageText, overrideSettings);
    } catch (edgeError: any) {
      if (!allowDirectFallback) throw edgeError;
      const rawMessage = String(edgeError?.message || edgeError || '').toLowerCase();
      const shouldFallbackDirect =
        rawMessage.includes('failed to fetch') ||
        rawMessage.includes('network') ||
        rawMessage.includes('fetcherror') ||
        rawMessage.includes('functionsfetcherror') ||
        rawMessage.includes('timeout:') ||
        rawMessage.includes(' timeout') ||
        rawMessage.includes('abort') ||
        rawMessage.includes('gateway timeout') ||
        rawMessage.includes('http 502') ||
        rawMessage.includes('http 503') ||
        rawMessage.includes('http 504');
      if (!shouldFallbackDirect) throw edgeError;

      const smsSettings = overrideSettings && Object.keys(overrideSettings).length > 0
        ? overrideSettings
        : await getActiveSmsSettings();
      sendResult = await sendSmsDirect(recipients, messageText, smsSettings);
    }

    if (pendingLogRows.length > 0) {
      const providerResultMap = new Map<string, SmsProviderResult>();
      (sendResult?.provider_results || []).forEach((item) => {
        const key = String(item?.recipient || '').trim();
        if (key) providerResultMap.set(key, item);
      });

      for (const row of pendingLogRows) {
        const providerResult = providerResultMap.get(row.recipient);
        try {
          const nextStatus = resolveSmsLogStatus(providerResult);
          await updateOutboundMessageStatus(row.id, nextStatus, {
            providerMessageId: String(providerResult?.result || '').trim() || null,
            sentAt: attemptedAt,
            metadata: {
              ...baseMetadata,
              channel: 'sms',
              provider_method: String(sendResult?.provider_method || providerResult?.method || '').trim() || null,
              provider_attempts: sendResult?.provider_attempts || [],
              provider_status: String(providerResult?.provider_status || '').trim() || null,
              provider_status_text: String(providerResult?.provider_status_text || '').trim() || null,
              provider_result: String(providerResult?.result || '').trim() || null,
              provider_raw: String(providerResult?.raw || '').trim() || null,
              delivery_status: String(providerResult?.delivery?.status || '').trim() || null,
              delivery_code: String(providerResult?.delivery?.code || '').trim() || null,
              delivery_label: String(providerResult?.delivery?.label || '').trim() || null,
              delivery_method: String(providerResult?.delivery?.method || '').trim() || null,
              delivery_raw: String(providerResult?.delivery?.raw || '').trim() || null,
              delivery_error: String(providerResult?.delivery?.error || '').trim() || null,
              build: String(sendResult?.build || '').trim() || null,
            },
          });
        } catch (error) {
          console.warn('Could not update outbound SMS log row as sent', error);
        }
      }
    }

    return sendResult;
  } catch (sendError: any) {
    if (pendingLogRows.length > 0) {
      const errorMessage = String(sendError?.message || sendError || 'SMS send failed');
      for (const row of pendingLogRows) {
        try {
          await updateOutboundMessageStatus(row.id, 'failed', {
            errorMessage,
            sentAt: attemptedAt,
            metadata: {
              ...baseMetadata,
              channel: 'sms',
            },
          });
        } catch (error) {
          console.warn('Could not update outbound SMS log row as failed', error);
        }
      }
    }
    throw sendError;
  }
};
