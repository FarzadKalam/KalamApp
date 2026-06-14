import type { SupabaseClient } from '@supabase/supabase-js';

export type BotChannel = 'telegram' | 'bale' | 'rubika';
export type BotTargetModuleId = 'customers' | 'suppliers' | 'employees';

export const BOT_CHANNELS: BotChannel[] = ['rubika', 'telegram', 'bale'];
export const BOT_TARGET_MODULE_IDS: BotTargetModuleId[] = ['customers', 'suppliers', 'employees'];

export const BOT_CHANNEL_LABELS_FA: Record<BotChannel, string> = {
  rubika: 'روبیکا',
  telegram: 'تلگرام',
  bale: 'بله',
};

export const BOT_PLATFORM_ICON_PATHS: Record<BotChannel, string> = {
  rubika: '/assets/bot-platforms/rubika.svg',
  telegram: '/assets/bot-platforms/telegram.svg',
  bale: '/assets/bot-platforms/bale.svg',
};

export const BOT_CHAT_ID_FIELD_BY_CHANNEL: Record<BotChannel, 'telegram_chat_id' | 'bale_chat_id' | 'rubika_chat_id'> = {
  telegram: 'telegram_chat_id',
  bale: 'bale_chat_id',
  rubika: 'rubika_chat_id',
};

export const BOT_SETTINGS_ONLY_FIELD_KEYS = new Set([
  'preferred_notification_channel',
  'telegram_chat_id',
  'bale_chat_id',
  'rubika_chat_id',
  'bot_default_channel',
  'telegram_group_join_link',
  'bale_group_join_link',
  'rubika_group_join_link',
  'telegram_group_status',
  'bale_group_status',
  'rubika_group_status',
  'telegram_group_title',
  'bale_group_title',
  'rubika_group_title',
]);

export const BOT_VIRTUAL_FIELD_KEYS = new Set([
  'bot_default_channel',
  'telegram_group_join_link',
  'bale_group_join_link',
  'rubika_group_join_link',
  'telegram_group_status',
  'bale_group_status',
  'rubika_group_status',
  'telegram_group_title',
  'bale_group_title',
  'rubika_group_title',
]);

export const isBotChannel = (value: unknown): value is BotChannel =>
  value === 'telegram' || value === 'bale' || value === 'rubika';

export const isBotTargetModuleId = (value: unknown): value is BotTargetModuleId =>
  value === 'customers' || value === 'suppliers' || value === 'employees';

export const getBotChatIdFieldKey = (channel: BotChannel) => BOT_CHAT_ID_FIELD_BY_CHANNEL[channel];
export const getBotGroupJoinLinkFieldKey = (channel: BotChannel) => `${channel}_group_join_link`;
export const getBotGroupStatusFieldKey = (channel: BotChannel) => `${channel}_group_status`;
export const getBotGroupTitleFieldKey = (channel: BotChannel) => `${channel}_group_title`;

export const getBotPlatformAvatarSrc = (channel?: string | null) => {
  const normalized = String(channel || '').trim() as BotChannel;
  return isBotChannel(normalized) ? BOT_PLATFORM_ICON_PATHS[normalized] : null;
};

export const normalizeBotDefaultChannel = (value: unknown): BotChannel | 'none' => {
  const normalized = String(value || '').trim();
  if (isBotChannel(normalized)) return normalized;
  return 'none';
};

export const getBotConversationKey = (channel?: string | null, chatId?: string | null) => {
  const normalizedChannel = String(channel || '').trim();
  const normalizedChatId = String(chatId || '').trim();
  if (!isBotChannel(normalizedChannel) || !normalizedChatId) return '';
  return `bot:direct:${normalizedChannel}:${normalizedChatId}`;
};

const BOT_TARGET_FOREIGN_KEY_BY_MODULE: Record<BotTargetModuleId, 'customer_id' | 'supplier_id' | 'employee_id'> = {
  customers: 'customer_id',
  suppliers: 'supplier_id',
  employees: 'employee_id',
};

export const loadBotWorkflowVirtualFieldPatch = async (
  client: SupabaseClient<any, 'public', any>,
  moduleId: string,
  record: Record<string, any> | null | undefined,
) => {
  if (!isBotTargetModuleId(moduleId)) return {} as Record<string, any>;
  const recordId = String(record?.id || '').trim();
  if (!recordId) return {} as Record<string, any>;

  const foreignKey = BOT_TARGET_FOREIGN_KEY_BY_MODULE[moduleId];
  const [groupsResult, configResult] = await Promise.all([
    client
      .from('counterparty_bot_groups')
      .select('channel_type, status, group_title, group_join_link')
      .eq(foreignKey, recordId),
    client
      .from('counterparty_bot_config')
      .select('default_channel')
      .eq(foreignKey, recordId)
      .maybeSingle(),
  ]);

  const patch: Record<string, any> = {};
  const groups = Array.isArray(groupsResult.data) ? groupsResult.data : [];
  const groupMap = new Map<string, any>();
  groups.forEach((row: any) => {
    const channel = String(row?.channel_type || '').trim();
    if (isBotChannel(channel) && !groupMap.has(channel)) {
      groupMap.set(channel, row);
    }
  });

  BOT_CHANNELS.forEach((channel) => {
    const row = groupMap.get(channel);
    patch[getBotGroupJoinLinkFieldKey(channel)] = String(row?.group_join_link || '').trim() || null;
    patch[getBotGroupStatusFieldKey(channel)] = String(row?.status || '').trim() || null;
    patch[getBotGroupTitleFieldKey(channel)] = String(row?.group_title || '').trim() || null;
  });

  const defaultChannel = normalizeBotDefaultChannel(
    configResult.data?.default_channel
    || record?.bot_default_channel
    || record?.preferred_notification_channel,
  );
  patch.bot_default_channel = defaultChannel;
  if (Object.prototype.hasOwnProperty.call(record || {}, 'preferred_notification_channel')) {
    patch.preferred_notification_channel = defaultChannel;
  }
  return patch;
};
