import { supabase } from '../supabaseClient';

export type IntegrationConnectionType =
  | 'sms'
  | 'email'
  | 'site'
  | 'voip'
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
  created_at?: string | null;
  updated_at?: string | null;
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

const LEGACY_CONNECTION_TYPE_MAP: Record<NotificationBotChannel, string[]> = {
  telegram: ['telegram_bot', 'telegram'],
  bale: ['bale_bot', 'bale'],
  rubika: ['rubika_bot', 'rubika'],
};

export const ACTIVE_NOTIFICATION_BOTS_CATEGORY = '__active_notification_bots__';

const BOT_LABEL_MAP: Record<NotificationBotChannel, string> = {
  telegram: 'تلگرام',
  bale: 'بله',
  rubika: 'روبیکا',
};

const normalizeBotConnectionType = (value: unknown): NotificationBotChannel | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'telegram' || normalized === 'telegram_bot') return 'telegram';
  if (normalized === 'bale' || normalized === 'bale_bot') return 'bale';
  if (normalized === 'rubika' || normalized === 'rubika_bot') return 'rubika';
  return null;
};

const toTimeValue = (value: unknown) => {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const pickPreferredIntegrationRecord = (
  rows: IntegrationSettingsRecord[],
  requestedType: IntegrationConnectionType
): IntegrationSettingsRecord | null => {
  if (!rows.length) return null;

  return [...rows].sort((left, right) => {
    const leftExact = String(left.connection_type || '') === requestedType ? 1 : 0;
    const rightExact = String(right.connection_type || '') === requestedType ? 1 : 0;
    if (leftExact !== rightExact) return rightExact - leftExact;

    const leftActive = left.is_active === true ? 1 : 0;
    const rightActive = right.is_active === true ? 1 : 0;
    if (leftActive !== rightActive) return rightActive - leftActive;

    const leftHasToken = String(left.settings?.bot_token || '').trim() ? 1 : 0;
    const rightHasToken = String(right.settings?.bot_token || '').trim() ? 1 : 0;
    if (leftHasToken !== rightHasToken) return rightHasToken - leftHasToken;

    const updatedDiff = toTimeValue(right.updated_at) - toTimeValue(left.updated_at);
    if (updatedDiff !== 0) return updatedDiff;

    return toTimeValue(right.created_at) - toTimeValue(left.created_at);
  })[0] || null;
};

export const getConnectionTypeForChannel = (
  channel: OutboundChannelType
): IntegrationConnectionType => CHANNEL_CONNECTION_TYPE_MAP[channel];

export const getActiveIntegrationSettings = async (
  connectionType: IntegrationConnectionType
): Promise<IntegrationSettingsRecord | null> => {
  const normalizedChannel = normalizeBotConnectionType(connectionType);
  const connectionTypes = normalizedChannel
    ? LEGACY_CONNECTION_TYPE_MAP[normalizedChannel]
    : [connectionType];

  const { data, error } = await supabase
    .from('integration_settings')
    .select('*')
    .in('connection_type', connectionTypes)
    .eq('is_active', true)
    .limit(20);

  if (error) throw error;
  return pickPreferredIntegrationRecord((data || []) as IntegrationSettingsRecord[], connectionType);
};

export const getActiveChannelSettings = async (
  channel: OutboundChannelType
): Promise<IntegrationSettingsRecord | null> => {
  return getActiveIntegrationSettings(getConnectionTypeForChannel(channel));
};

export const listActiveNotificationBotOptions = async (): Promise<Array<{ label: string; value: string }>> => {
  const { data, error } = await supabase
    .from('integration_settings')
    .select('connection_type, provider, settings, is_active, created_at, updated_at')
    .in('connection_type', ['telegram_bot', 'telegram', 'bale_bot', 'bale', 'rubika_bot', 'rubika'])
    .eq('is_active', true);

  if (error) throw error;

  const bestByChannel = new Map<NotificationBotChannel, IntegrationSettingsRecord>();
  ((data || []) as IntegrationSettingsRecord[]).forEach((row) => {
    const channel = normalizeBotConnectionType(row?.connection_type);
    if (!channel) return;
    const next = pickPreferredIntegrationRecord(
      [row, ...(bestByChannel.has(channel) ? [bestByChannel.get(channel)!] : [])],
      `${channel}_bot` as IntegrationConnectionType
    );
    if (next) bestByChannel.set(channel, next);
  });

  return [
    { label: 'بدون بات', value: 'none' },
    ...([...bestByChannel.entries()].map(([channel, row]) => {
      const settings = row?.settings || {};
      const customLabel = String(settings?.bot_name || settings?.bot_username || '').trim();
      return {
        label: customLabel ? `${BOT_LABEL_MAP[channel]} - ${customLabel}` : BOT_LABEL_MAP[channel],
        value: channel,
      };
    })),
  ];
};

export const listActiveNotificationBots = async (): Promise<ActiveNotificationBotEntry[]> => {
  const { data, error } = await supabase
    .from('integration_settings')
    .select('connection_type, settings, is_active, created_at, updated_at')
    .in('connection_type', ['telegram_bot', 'telegram', 'bale_bot', 'bale', 'rubika_bot', 'rubika'])
    .eq('is_active', true);

  if (error) throw error;

  const bestByChannel = new Map<NotificationBotChannel, IntegrationSettingsRecord>();
  ((data || []) as IntegrationSettingsRecord[]).forEach((row) => {
    const channel = normalizeBotConnectionType(row?.connection_type);
    if (!channel) return;
    const next = pickPreferredIntegrationRecord(
      [row, ...(bestByChannel.has(channel) ? [bestByChannel.get(channel)!] : [])],
      `${channel}_bot` as IntegrationConnectionType
    );
    if (next) bestByChannel.set(channel, next);
  });

  return [...bestByChannel.entries()].map(([channel, row]) => {
    const settings = row?.settings || {};
    const customLabel = String(settings?.bot_name || settings?.bot_username || '').trim();
    return {
      channel,
      label: customLabel ? `${BOT_LABEL_MAP[channel]} - ${customLabel}` : BOT_LABEL_MAP[channel],
    };
  });
};
