export const WORKFLOW_MESSAGE_CHANNELS = [
  'note',
  'sms',
  'bot_group',
  'bot_private',
  'instagram',
  'email',
] as const;

export type WorkflowMessageChannel = (typeof WORKFLOW_MESSAGE_CHANNELS)[number];

export const WORKFLOW_MESSAGE_CHANNEL_LABELS: Record<WorkflowMessageChannel, string> = {
  note: 'پیام داخلی',
  sms: 'پیامک',
  bot_group: 'گروه بات',
  bot_private: 'پی‌وی بات',
  instagram: 'دایرکت اینستاگرام',
  email: 'ایمیل',
};

export const WORKFLOW_MESSAGE_CHANNEL_TEXT_FIELDS: Record<WorkflowMessageChannel, string> = {
  note: 'message_note',
  sms: 'message_sms',
  bot_group: 'message_bot_group',
  bot_private: 'message_bot_private',
  instagram: 'message_instagram',
  email: 'message_email',
};

const LEGACY_CHANNEL_BY_ACTION_TYPE: Record<string, WorkflowMessageChannel> = {
  send_note: 'note',
  send_sms: 'sms',
  send_bot_message: 'bot_group',
  send_telegram_bot: 'bot_group',
  send_bale_bot: 'bot_group',
  send_rubika_bot: 'bot_group',
  send_instagram_message: 'instagram',
  send_email: 'email',
};

export const isWorkflowMessageActionType = (type: unknown) =>
  String(type || '').trim() === 'send_message'
  || String(type || '').trim() === 'send_note_sms'
  || Object.prototype.hasOwnProperty.call(LEGACY_CHANNEL_BY_ACTION_TYPE, String(type || '').trim());

export const getWorkflowMessageChannels = (action: { type?: unknown; config?: Record<string, any> } | null | undefined): WorkflowMessageChannel[] => {
  const type = String(action?.type || '').trim();
  if (type === 'send_note_sms') return ['note', 'sms'];
  if (type !== 'send_message') {
    const legacyChannel = LEGACY_CHANNEL_BY_ACTION_TYPE[type];
    return legacyChannel ? [legacyChannel] : [];
  }
  const selected = Array.isArray(action?.config?.message_channels) ? action!.config.message_channels : [];
  return Array.from(new Set(
    selected
      .map((item: unknown) => String(item || '').trim())
      .filter((item): item is WorkflowMessageChannel => WORKFLOW_MESSAGE_CHANNELS.includes(item as WorkflowMessageChannel)),
  ));
};

export const getWorkflowMessageTextField = (action: { type?: unknown } | null | undefined, channel: WorkflowMessageChannel) => {
  const type = String(action?.type || '').trim();
  if (type === 'send_message') return WORKFLOW_MESSAGE_CHANNEL_TEXT_FIELDS[channel];
  if (channel === 'note') return 'note_text';
  if (channel === 'email') return 'body';
  return 'message';
};

export const getWorkflowMessageTitleField = (action: { type?: unknown } | null | undefined) =>
  String(action?.type || '').trim() === 'send_message' ? 'message_title' : 'title';

export const buildDefaultWorkflowMessageConfig = () => ({
  message_channels: [] as WorkflowMessageChannel[],
  message_title: '',
  recipient_fields: [] as string[],
  recipient_assignees: [] as string[],
  manual_numbers: [] as string[],
  message_note: '',
  message_sms: '',
  message_bot_group: '',
  message_bot_private: '',
  message_instagram: '',
  message_email: '',
  include_web_form_link: false,
  web_form_id: '',
  web_form_related_module_id: '',
  include_starred_attachments: true,
  attachment_fields: [] as string[],
  variable_field: '',
  variable_target: '',
});

/**
 * دادهٔ قدیمی را فقط زمانی که کاربر کانال‌ها را تغییر می‌دهد به قرارداد جدید تبدیل می‌کند.
 * تا پیش از آن، رکوردهای ثبت‌شده همان type و config پیشین خود را حفظ می‌کنند.
 */
export const buildUnifiedWorkflowMessageConfig = (
  action: { type?: unknown; config?: Record<string, any> } | null | undefined,
  channels: WorkflowMessageChannel[],
) => {
  const config = action?.config || {};
  const legacyChannel = LEGACY_CHANNEL_BY_ACTION_TYPE[String(action?.type || '').trim()];
  const legacyMessage = String(config.note_text ?? config.body ?? config.message ?? '');
  const base = buildDefaultWorkflowMessageConfig();
  return {
    ...base,
    ...config,
    message_channels: channels,
    message_title: String(config.message_title ?? config.title ?? ''),
    ...(legacyChannel ? { [WORKFLOW_MESSAGE_CHANNEL_TEXT_FIELDS[legacyChannel]]: legacyMessage } : {}),
    ...(String(action?.type || '').trim() === 'send_note_sms' ? { message_note: legacyMessage, message_sms: legacyMessage } : {}),
  };
};
