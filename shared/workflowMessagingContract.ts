export const WORKFLOW_STARRED_ATTACHMENTS_CONFIG_KEY = 'include_starred_attachments';

const normalizeList = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value];
  return Array.from(new Set(raw.map((item) => String(item || '').trim()).filter(Boolean)));
};

const normalizeIdentityRecipientList = (value: unknown): string[] =>
  normalizeList(value).map((item) => {
    const match = item.match(/^(user|role|chat_group)[:_](.+)$/i);
    if (!match) return item;
    return `${String(match[1]).toLowerCase()}:${String(match[2]).trim()}`;
  });

export type WorkflowRecipientConfig = {
  recipientFields: string[];
  recipientAssignees: string[];
};

export type WorkflowBotChannel = 'rubika' | 'telegram' | 'bale';
export type WorkflowRecipientFieldStrategy = 'user' | 'role';

const BOT_CHANNELS: WorkflowBotChannel[] = ['rubika', 'telegram', 'bale'];

/**
 * اگر کلید فیلد صراحتاً شناسهٔ چت یک پیام‌رسان را هدف گرفته باشد، کانال آن را برمی‌گرداند.
 * این تشخیص برای کلیدهای مستقیم و کلیدهای relation/process یکسان است.
 */
export const getWorkflowRecipientFieldBotChannel = (fieldKey: unknown): WorkflowBotChannel | null => {
  const normalized = String(fieldKey || '').trim().toLowerCase();
  return BOT_CHANNELS.find((channel) => normalized.includes(`${channel}_chat_id`)) || null;
};

export const isWorkflowRecipientFieldCompatibleWithBotChannel = (
  fieldKey: unknown,
  channel: WorkflowBotChannel,
): boolean => {
  const explicitChannel = getWorkflowRecipientFieldBotChannel(fieldKey);
  return explicitChannel === null || explicitChannel === channel;
};

const NOTE_RECIPIENT_FIELD_PREFIX = '__workflow_note_recipient__';

/** کلید ذخیره‌شدهٔ فیلد گیرندهٔ یادداشت را بدون وابستگی به UI باز می‌کند. */
export const parseWorkflowRecipientFieldReference = (value: unknown): {
  fieldKey: string;
  strategy: WorkflowRecipientFieldStrategy | null;
} => {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith(NOTE_RECIPIENT_FIELD_PREFIX)) {
    return { fieldKey: normalized, strategy: null };
  }
  const raw = normalized.slice(NOTE_RECIPIENT_FIELD_PREFIX.length);
  const separatorIndex = raw.indexOf('::');
  if (separatorIndex <= 0) return { fieldKey: normalized, strategy: null };
  const strategy = raw.slice(0, separatorIndex);
  const fieldKey = raw.slice(separatorIndex + 2).trim();
  if (!fieldKey || (strategy !== 'user' && strategy !== 'role')) {
    return { fieldKey: normalized, strategy: null };
  }
  return { fieldKey, strategy };
};

export const normalizeWorkflowRecipientFieldValues = (
  value: unknown,
  strategy: WorkflowRecipientFieldStrategy | null,
): unknown[] => {
  const values = Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value];
  if (!strategy) return values;
  return values.map((entry) => {
    const normalized = String(entry || '').trim();
    if (!normalized || /^(user|role|chat_group)[:_]/i.test(normalized)) return normalized;
    return `${strategy}_${normalized}`;
  }).filter(Boolean);
};

/**
 * قرارداد مشترک گیرنده برای یادداشت، پیامک و همه پیام‌های بات.
 * نام‌های قدیمی فقط برای سازگاری خوانده می‌شوند و هنگام ذخیره تنظیم تازه تولید نمی‌شوند.
 */
export const getWorkflowRecipientConfig = (config: Record<string, any> | null | undefined): WorkflowRecipientConfig => ({
  recipientFields: normalizeList([
    ...(Array.isArray(config?.recipient_fields) ? config!.recipient_fields : []),
    ...(Array.isArray(config?.related_recipient_fields) ? config!.related_recipient_fields : []),
  ]),
  recipientAssignees: normalizeIdentityRecipientList([
    ...(Array.isArray(config?.recipient_assignees) ? config!.recipient_assignees : []),
    ...(Array.isArray(config?.recipient_targets) ? config!.recipient_targets : []),
  ]),
});

/** تنظیم‌های قدیمی attachment_fields همچنان اجرا می‌شوند، اما منبع پیش‌فرض جدید فایل‌های ستاره‌دار رکورد است. */
export const getLegacyWorkflowAttachmentFields = (config: Record<string, any> | null | undefined): string[] =>
  normalizeList(config?.attachment_fields);

export const shouldIncludeStarredWorkflowAttachments = (config: Record<string, any> | null | undefined): boolean =>
  config?.[WORKFLOW_STARRED_ATTACHMENTS_CONFIG_KEY] === true;

export const buildDefaultWorkflowAttachmentConfig = () => ({
  [WORKFLOW_STARRED_ATTACHMENTS_CONFIG_KEY]: true,
  attachment_fields: [] as string[],
});
