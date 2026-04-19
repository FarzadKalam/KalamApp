import { getActiveChannelSettings } from './channelSettings';
import { createOutboundMessageLog, updateOutboundMessageStatus } from './outboundMessages';
import { supabase } from '../supabaseClient';

export type BotChannel = 'telegram' | 'bale' | 'rubika';

export type BotGatewaySettings = {
  bot_token?: string;
  api_base_url?: string;
  webhook_secret?: string;
  bot_username?: string;
  bot_name?: string;
  send_message_path?: string;
};

type SendBotMessageArgs = {
  channel: BotChannel;
  chatId: string;
  text: string;
  title?: string;
  overrideSettings?: BotGatewaySettings;
  moduleId?: string;
  recordId?: string;
  customerId?: string;
};

type CounterpartyBotGroupTarget = {
  id?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  channel_type?: BotChannel | string | null;
  bot_chat_id?: string | null;
};

type SendCounterpartyBotGroupMessageArgs = {
  group: CounterpartyBotGroupTarget;
  text: string;
  payload?: Record<string, any>;
  messageType?: string;
  extraPayload?: Record<string, any>;
  fallbackText?: string;
};

type SendCustomerBotMessageArgs = {
  customer: Record<string, any>;
  text: string;
  title?: string;
  moduleId?: string;
  recordId?: string;
};

const DEFAULT_API_BASE_URL: Record<BotChannel, string> = {
  telegram: 'https://api.telegram.org',
  bale: 'https://tapi.bale.ai',
  rubika: 'https://botapi.rubika.ir',
};

const DEFAULT_SEND_PATH: Record<BotChannel, string> = {
  telegram: '/bot{token}/sendMessage',
  bale: '/bot{token}/sendMessage',
  rubika: '/v3/{token}/sendMessage',
};

const normalizeBaseUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw.replace(/\/+$/, '')}`;
};

const buildSendMessageUrl = (baseUrl: string, token: string, pathTemplate: string) => {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = String(pathTemplate)
    .replace('{token}', encodeURIComponent(token))
    .replace(/^\/*/, '/');
  return `${normalizedBase}${normalizedPath}`;
};

const parseResponse = async (response: Response) => {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return raw;
  }
};

export const sendBotMessageViaGateway = async ({
  channel,
  chatId,
  text,
  title,
  overrideSettings,
  moduleId,
  recordId,
  customerId,
}: SendBotMessageArgs) => {
  const recipient = String(chatId || '').trim();
  const messageText = String(text || '').trim();

  if (!recipient) {
    throw new Error('شناسه چت/گیرنده بات مشخص نشده است.');
  }
  if (!messageText) {
    throw new Error('متن پیام بات خالی است.');
  }

  const activeSettings = overrideSettings && Object.keys(overrideSettings).length > 0
    ? overrideSettings
    : ((await getActiveChannelSettings(channel))?.settings || null);

  if (!activeSettings) {
    throw new Error('تنظیمات بات فعال یافت نشد.');
  }

  const token = String(activeSettings.bot_token || '').trim();
  const baseUrl = String(activeSettings.api_base_url || DEFAULT_API_BASE_URL[channel]).trim();
  const sendMessagePath = String(activeSettings.send_message_path || '').trim() || DEFAULT_SEND_PATH[channel];

  if (!token) {
    throw new Error('توکن بات تنظیم نشده است.');
  }

  const logRow = await createOutboundMessageLog({
    channelType: channel,
    provider: String(activeSettings.bot_name || activeSettings.bot_username || `${channel}_bot`),
    moduleId,
    recordId,
    customerId,
    recipient,
    title,
    messageText,
    metadata: {
      channel,
    },
  });

  try {
    const response = await fetch(buildSendMessageUrl(baseUrl, token, sendMessagePath), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(channel === 'rubika'
          ? {
              chat_id: recipient,
              text: messageText,
            }
          : {
              chat_id: recipient,
              text: messageText,
              parse_mode: 'HTML',
            }),
      }),
    });

    const payload = await parseResponse(response);

    if (!response.ok) {
      throw new Error(
        typeof payload === 'string'
          ? payload
          : String(payload?.description || payload?.message || `HTTP ${response.status}`)
      );
    }

    if (payload && typeof payload === 'object' && payload.ok === false) {
      throw new Error(String(payload.description || payload.message || 'ارسال پیام بات ناموفق بود.'));
    }

    if (logRow?.id) {
      await updateOutboundMessageStatus(String(logRow.id), 'sent', {
        providerMessageId: String(payload?.result?.message_id || payload?.message_id || ''),
        metadata: {
          channel,
          response: payload,
        },
      });
    }

    return payload;
  } catch (err: any) {
    if (logRow?.id) {
      await updateOutboundMessageStatus(String(logRow.id), 'failed', {
        errorMessage: String(err?.message || err || 'Bot send failed'),
      });
    }
    throw err;
  }
};

export const sendCounterpartyBotGroupMessage = async ({
  group,
  text,
  payload,
  messageType,
  extraPayload,
  fallbackText,
}: SendCounterpartyBotGroupMessageArgs) => {
  const channel = String(group?.channel_type || '').trim() as BotChannel;
  if (!['rubika', 'telegram', 'bale'].includes(channel)) {
    throw new Error('کانال بات معتبر نیست.');
  }

  const chatId = String(group?.bot_chat_id || '').trim();
  if (!chatId) {
    throw new Error('برای این گروه chat id بات ثبت نشده است.');
  }

  const messageText = String(text || '').trim();
  if (!messageText) {
    throw new Error('متن پیام بات خالی است.');
  }

  const activeConnection = await getActiveChannelSettings(channel);
  const connectionId = String(activeConnection?.id || '').trim();
  if (!connectionId) {
    throw new Error('تنظیمات فعال بات پیدا نشد.');
  }

  const { data: proxyData, error: proxyError } = await supabase.functions.invoke('bot-admin', {
    body: {
      action: 'send_test_message',
      channel,
      connectionId,
      chatId,
      text: messageText,
      skipLog: false,
      extraPayload,
      fallbackText,
    },
  });
  if (proxyError) throw proxyError;
  if (!proxyData?.success) {
    throw new Error(String(proxyData?.message || 'ارسال پیام بات ناموفق بود.'));
  }

  const providerResponse = proxyData?.provider_result || {};
  const providerMessageId = String(
    providerResponse?.result?.message_id
    || providerResponse?.message_id
    || providerResponse?.data?.message_id
    || ''
  ).trim() || null;
  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = String(authData?.user?.id || '').trim() || null;
  const currentUserProfile = currentUserId
    ? (await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', currentUserId)
      .maybeSingle()).data
    : null;
  const senderPayload = {
    sender_user_id: currentUserId,
    sender_profile_id: currentUserId,
    sender_display_name: String((currentUserProfile as any)?.full_name || '').trim() || null,
    sender_avatar_url: String((currentUserProfile as any)?.avatar_url || '').trim() || null,
  };

  const { error: insertError } = await supabase
    .from('counterparty_bot_messages')
    .insert([{
      bot_group_id: group.id || null,
      customer_id: group.customer_id || null,
      supplier_id: group.supplier_id || null,
      channel_type: channel,
      direction: 'outbound',
      message_type: String(messageType || 'text').trim() || 'text',
      chat_id: chatId,
      provider_message_id: providerMessageId,
      content_text: messageText,
      created_by: currentUserId,
      payload: {
        ...(payload || {}),
        ...senderPayload,
        provider_response: providerResponse || {},
      },
    }]);
  if (insertError) throw insertError;

  return proxyData;
};

export const sendCustomerBotMessage = async ({
  customer,
  text,
  title,
  moduleId,
  recordId,
}: SendCustomerBotMessageArgs) => {
  const preferredBot = String(customer?.preferred_notification_channel || 'none').trim() as
    | BotChannel
    | 'none';

  if (!preferredBot || preferredBot === 'none') {
    throw new Error('برای این مشتری بات اطلاع‌رسانی انتخاب نشده است.');
  }

  const chatIdByChannel: Record<BotChannel, string> = {
    telegram: String(customer?.telegram_chat_id || '').trim(),
    bale: String(customer?.bale_chat_id || '').trim(),
    rubika: String(customer?.rubika_chat_id || '').trim(),
  };

  const chatId = chatIdByChannel[preferredBot];
  if (!chatId) {
    throw new Error('شناسه چت بات برای مشتری ثبت نشده است.');
  }

  return sendBotMessageViaGateway({
    channel: preferredBot,
    chatId,
    text,
    title,
    moduleId,
    recordId,
    customerId: String(customer?.id || '').trim() || undefined,
  });
};
