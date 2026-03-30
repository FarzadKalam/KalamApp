import { supabase } from '../supabaseClient';

export type IntegrationConnectionType =
  | 'sms'
  | 'email'
  | 'site'
  | 'module_settings'
  | 'print_templates'
  | 'telegram_bot'
  | 'bale_bot'
  | 'rubika_bot'
  | 'portal';

export type OutboundChannelType = 'sms' | 'telegram' | 'bale' | 'rubika' | 'portal';
export type NotificationBotChannel = Extract<OutboundChannelType, 'telegram' | 'bale' | 'rubika'>;

export type IntegrationSettingsRecord = {
  id?: string;
  org_id?: string | null;
  connection_type: IntegrationConnectionType;
  provider?: string | null;
  settings?: Record<string, any> | null;
  is_active?: boolean;
};

export type ActiveNotificationBotEntry = {
  channel: NotificationBotChannel;
  label: string;
};

const CHANNEL_CONNECTION_TYPE_MAP: Record<OutboundChannelType, IntegrationConnectionType> = {
  sms: 'sms',
  telegram: 'telegram_bot',
  bale: 'bale_bot',
  rubika: 'rubika_bot',
  portal: 'portal',
};

export const ACTIVE_NOTIFICATION_BOTS_CATEGORY = '__active_notification_bots__';

const BOT_LABEL_MAP: Record<'telegram' | 'bale' | 'rubika', string> = {
  telegram: 'تلگرام',
  bale: 'بله',
  rubika: 'روبیکا',
};

export const getConnectionTypeForChannel = (
  channel: OutboundChannelType
): IntegrationConnectionType => CHANNEL_CONNECTION_TYPE_MAP[channel];

export const getActiveIntegrationSettings = async (
  connectionType: IntegrationConnectionType
): Promise<IntegrationSettingsRecord | null> => {
  const { data, error } = await supabase
    .from('integration_settings')
    .select('*')
    .eq('connection_type', connectionType)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as IntegrationSettingsRecord | null;
};

export const getActiveChannelSettings = async (
  channel: OutboundChannelType
): Promise<IntegrationSettingsRecord | null> => {
  return getActiveIntegrationSettings(getConnectionTypeForChannel(channel));
};

export const listActiveNotificationBotOptions = async (): Promise<Array<{ label: string; value: string }>> => {
  const { data, error } = await supabase
    .from('integration_settings')
    .select('connection_type, provider, settings')
    .in('connection_type', ['telegram_bot', 'bale_bot', 'rubika_bot'])
    .eq('is_active', true);

  if (error) throw error;

  const options = [
    { label: 'بدون بات', value: 'none' },
    ...((data || []).map((row: any) => {
      const type = String(row?.connection_type || '').replace('_bot', '') as 'telegram' | 'bale' | 'rubika';
      const settings = row?.settings || {};
      const customLabel = String(settings?.bot_name || settings?.bot_username || '').trim();
      return {
        label: customLabel ? `${BOT_LABEL_MAP[type] || type} - ${customLabel}` : (BOT_LABEL_MAP[type] || type),
        value: type,
      };
    })),
  ];

  return options;
};

export const listActiveNotificationBots = async (): Promise<ActiveNotificationBotEntry[]> => {
  const { data, error } = await supabase
    .from('integration_settings')
    .select('connection_type, settings')
    .in('connection_type', ['telegram_bot', 'bale_bot', 'rubika_bot'])
    .eq('is_active', true);

  if (error) throw error;

  return (data || []).map((row: any) => {
    const channel = String(row?.connection_type || '').replace('_bot', '') as NotificationBotChannel;
    const settings = row?.settings || {};
    const customLabel = String(settings?.bot_name || settings?.bot_username || '').trim();
    return {
      channel,
      label: customLabel ? `${BOT_LABEL_MAP[channel] || channel} - ${customLabel}` : (BOT_LABEL_MAP[channel] || channel),
    };
  });
};
